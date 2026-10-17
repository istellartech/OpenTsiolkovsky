//! Machine-readable operations for AI agents and scripts
//!
//! Shared by the CLI's `--json` output and the MCP server (`mcp.rs`): the
//! configuration schemas, validation, single runs, Monte Carlo runs and web
//! app share links. Every result is a JSON value; failures are `AgentError`
//! with a stable `kind`.

use crate::io::{
    IoError, config_warnings, load_rocket_data, missing_files, parse_config_str, referenced_files,
    rocket_warnings, save_cpp_telemetry_csv, save_monte_carlo_csv, save_monte_carlo_summary,
    save_summary_json, save_trajectory_csv, summary_json, validate_config,
};
use crate::montecarlo::{Dispersion, impact_statistics, run_cases};
use crate::physics::coordinates::CoordinateTransform;
use crate::rocket::{ClientConfig, Rocket, RocketConfig};
use crate::simulator::{FallBodyKind, SimError, SimulationState, Simulator};
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

/// Web app that opens share links
pub const DEFAULT_WEB_URL: &str = "https://open-tsiolkovsky.vercel.app/";

/// Monte Carlo case limit for one request
pub const MAX_MONTE_CARLO_CASES: u32 = 10_000;

/// What went wrong, in a form a caller can branch on
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ErrorKind {
    /// The configuration (or dispersion) is not valid JSON or fails validation
    InvalidConfig,
    /// A file could not be read or written
    Io,
    /// The simulator rejected the vehicle or failed while flying it
    Simulation,
    /// A request argument is missing or out of range
    InvalidArgument,
}

impl ErrorKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::InvalidConfig => "invalid_config",
            Self::Io => "io",
            Self::Simulation => "simulation",
            Self::InvalidArgument => "invalid_argument",
        }
    }
}

#[derive(Debug, Clone)]
pub struct AgentError {
    pub kind: ErrorKind,
    pub message: String,
    /// One line per problem (validation errors)
    pub details: Vec<String>,
}

impl AgentError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            details: Vec::new(),
        }
    }

    pub fn to_json(&self) -> Value {
        json!({
            "status": "error",
            "error": {
                "kind": self.kind.as_str(),
                "message": self.message,
                "details": self.details,
            }
        })
    }
}

impl std::fmt::Display for AgentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)?;
        for d in &self.details {
            write!(f, "\n  {d}")?;
        }
        Ok(())
    }
}

impl std::error::Error for AgentError {}

impl From<IoError> for AgentError {
    fn from(e: IoError) -> Self {
        match e {
            IoError::ConfigValidation(errors) => Self {
                kind: ErrorKind::InvalidConfig,
                message: "Configuration validation failed".to_string(),
                details: errors,
            },
            IoError::JsonParse(e) => Self::new(ErrorKind::InvalidConfig, format!("JSON: {e}")),
            other => Self::new(ErrorKind::Io, other.to_string()),
        }
    }
}

impl From<SimError> for AgentError {
    fn from(e: SimError) -> Self {
        Self::new(ErrorKind::Simulation, e.to_string())
    }
}

/// A configuration to work on: the JSON text and the directory its
/// relative CSV file names are resolved against
#[derive(Debug, Clone)]
pub struct ConfigInput {
    pub text: String,
    pub base_dir: PathBuf,
}

impl ConfigInput {
    /// Read a parameter file; its CSVs are resolved next to it
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self, AgentError> {
        let path = path.as_ref();
        let text = std::fs::read_to_string(path)
            .map_err(|e| AgentError::new(ErrorKind::Io, format!("{}: {e}", path.display())))?;
        let base_dir = match path.parent() {
            Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
            _ => PathBuf::from("."),
        };
        Ok(Self { text, base_dir })
    }

    /// Inline JSON; CSVs are resolved against `base_dir` (default: the
    /// current directory)
    pub fn from_json(text: impl Into<String>, base_dir: Option<PathBuf>) -> Self {
        Self {
            text: text.into(),
            base_dir: base_dir.unwrap_or_else(|| PathBuf::from(".")),
        }
    }

    fn format(&self) -> Result<ConfigFormat, AgentError> {
        let value: Value = serde_json::from_str(&self.text)
            .map_err(|e| AgentError::new(ErrorKind::InvalidConfig, format!("JSON: {e}")))?;
        let is_param = value.get("name(str)").is_some();
        if !is_param && let Ok(client) = serde_json::from_value::<ClientConfig>(value.clone()) {
            return Ok(ConfigFormat::Web(Box::new(client), value));
        }
        Ok(ConfigFormat::Param(value))
    }

    /// The vehicle with its CSV tables loaded
    pub fn load(&self) -> Result<Loaded, AgentError> {
        match self.format()? {
            ConfigFormat::Param(value) => {
                let config = parse_config_str(&self.text)?;
                let missing = missing_files(&config, Some(&self.base_dir));
                let rocket = load_rocket_data(Rocket::new(config), Some(&self.base_dir))?;
                Ok(Loaded {
                    rocket,
                    format: "param",
                    value,
                    missing_files: missing,
                })
            }
            ConfigFormat::Web(client, value) => {
                let rocket = client.into_rocket();
                if let Err(errors) = validate_config(&rocket.config) {
                    return Err(IoError::ConfigValidation(errors).into());
                }
                Ok(Loaded {
                    rocket,
                    format: "web",
                    value,
                    missing_files: Vec::new(),
                })
            }
        }
    }
}

enum ConfigFormat {
    /// CLI parameter file (`param_*.json`)
    Param(Value),
    /// Web app format (`ClientConfig`, tables inline)
    Web(Box<ClientConfig>, Value),
}

pub struct Loaded {
    pub rocket: Rocket,
    /// `"param"` (CLI parameter file) or `"web"` (web app `ClientConfig`)
    pub format: &'static str,
    /// The configuration as given
    pub value: Value,
    /// Referenced CSV files that were not found (constants are used)
    pub missing_files: Vec<String>,
}

impl Loaded {
    /// Warnings about unusual but valid settings, and missing CSV files
    pub fn warnings(&self) -> Vec<String> {
        let mut warnings: Vec<String> = config_warnings(&self.rocket.config)
            .into_iter()
            .chain(rocket_warnings(&self.rocket))
            .collect();
        for name in &self.missing_files {
            warnings.push(format!(
                "CSV file \"{name}\" not found; the constant value is used instead"
            ));
        }
        warnings
    }
}

/// JSON Schema of the CLI parameter file (`param_*.json`)
pub fn param_schema() -> Value {
    schemars::schema_for!(RocketConfig).to_value()
}

/// JSON Schema of the Monte Carlo dispersion file
pub fn dispersion_schema() -> Value {
    schemars::schema_for!(Dispersion).to_value()
}

/// Check a configuration without flying it. Problems with the
/// configuration are reported in the result (`valid: false`), not as errors.
pub fn validate(input: &ConfigInput) -> Value {
    let loaded = input.load().and_then(|loaded| {
        Simulator::new(loaded.rocket.clone())?;
        Ok(loaded)
    });
    match loaded {
        Ok(loaded) => {
            let config = &loaded.rocket.config;
            json!({
                "valid": true,
                "format": loaded.format,
                "name": config.name,
                "stages": loaded.rocket.stage_count(),
                "errors": [],
                "warnings": loaded.warnings(),
                "referenced_files": referenced_files(config),
                "missing_files": loaded.missing_files,
            })
        }
        Err(e) => {
            let errors = if e.details.is_empty() {
                vec![e.message.clone()]
            } else {
                e.details.clone()
            };
            json!({
                "valid": false,
                "error_kind": e.kind.as_str(),
                "errors": errors,
                "warnings": [],
            })
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct RunOptions {
    /// Write the CLI output files with this prefix (`<prefix>_trajectory.csv`, ...)
    pub output_prefix: Option<String>,
    /// Include this many evenly spaced trajectory samples (0: none)
    pub trajectory_points: usize,
}

/// Fly the vehicle (and its spent stages and dumping products)
pub fn run(input: &ConfigInput, options: &RunOptions) -> Result<Value, AgentError> {
    let loaded = input.load()?;
    let mut warnings = loaded.warnings();
    let rocket = &loaded.rocket;
    let mut simulator = Simulator::new(rocket.clone())?;
    let trajectory = simulator.run();
    let fall_bodies = simulator.simulate_fall_bodies();
    if trajectory.is_empty() {
        return Err(AgentError::new(
            ErrorKind::Simulation,
            "The simulation produced no trajectory points",
        ));
    }
    if simulator.forced_steps > 0 {
        warnings.push(format!(
            "{} RK45 steps were accepted at the minimum step size above tolerance",
            simulator.forced_steps
        ));
    }
    let summary = summary_json(&trajectory, &fall_bodies, &simulator.events, &rocket.config)?;

    let mut result = json!({
        "status": "ok",
        "name": rocket.config.name,
        "summary": summary,
        "warnings": warnings,
    });

    if let Some(prefix) = &options.output_prefix {
        create_parent_dir(prefix)?;
        let trajectory_file = format!("{prefix}_trajectory.csv");
        let summary_file = format!("{prefix}_summary.json");
        let dynamics_file = format!("{prefix}_dynamics_cpp.csv");
        save_trajectory_csv(&trajectory, &trajectory_file)?;
        save_summary_json(
            &trajectory,
            &fall_bodies,
            &simulator.events,
            &rocket.config,
            &summary_file,
        )?;
        save_cpp_telemetry_csv(&simulator.telemetry_cpp, &dynamics_file)?;
        let mut fall_files = Vec::new();
        for body in &fall_bodies {
            if body.telemetry_cpp.is_empty() {
                continue;
            }
            let suffix = match body.kind {
                FallBodyKind::Stage => "fall",
                FallBodyKind::Dump => "dump",
            };
            let path = format!("{prefix}_dynamics_cpp_{}_{suffix}.csv", body.stage);
            save_cpp_telemetry_csv(&body.telemetry_cpp, &path)?;
            fall_files.push(path);
        }
        result["files"] = json!({
            "trajectory": trajectory_file,
            "summary": summary_file,
            "dynamics_cpp": dynamics_file,
            "fall_bodies": fall_files,
        });
    }

    if options.trajectory_points > 0 {
        result["trajectory"] = sample_trajectory(&trajectory, options.trajectory_points);
    }
    Ok(result)
}

/// Create the directory an output prefix such as `out/run1` writes into
pub fn create_parent_dir(prefix: &str) -> Result<(), AgentError> {
    match Path::new(prefix).parent() {
        Some(dir) if !dir.as_os_str().is_empty() => std::fs::create_dir_all(dir)
            .map_err(|e| AgentError::new(ErrorKind::Io, format!("{}: {e}", dir.display()))),
        _ => Ok(()),
    }
}

/// `n` evenly spaced trajectory points (always including the first and
/// last), with the most used quantities
fn sample_trajectory(trajectory: &[SimulationState], n: usize) -> Value {
    let llh = |s: &SimulationState| {
        CoordinateTransform::pos_ecef_to_llh(&CoordinateTransform::pos_eci_to_ecef(
            &s.position,
            s.time,
        ))
    };
    let origin = llh(&trajectory[0]);
    let len = trajectory.len();
    let n = n.clamp(2, len.max(2));
    let mut indices: Vec<usize> = (0..n)
        .map(|k| ((k as f64) * ((len - 1) as f64) / ((n - 1) as f64)).round() as usize)
        .collect();
    indices.dedup();
    let points: Vec<Value> = indices
        .into_iter()
        .map(|i| {
            let s = &trajectory[i];
            let p = llh(s);
            json!({
                "time_s": s.time,
                "altitude_m": s.altitude,
                "latitude_deg": p.x,
                "longitude_deg": p.y,
                "downrange_m": CoordinateTransform::distance_surface(&origin, &p),
                "speed_inertial_mps": s.velocity_magnitude,
                "speed_earth_mps": s.velocity_ecef_ned.magnitude(),
                "mach": s.mach_number,
                "dynamic_pressure_pa": s.dynamic_pressure,
                "mass_kg": s.mass,
                "thrust_n": s.thrust,
                "stage": s.stage,
                "flight_mode": s.flight_mode.as_str(),
            })
        })
        .collect();
    Value::Array(points)
}

/// Parse a dispersion JSON; keys left out keep their defaults
pub fn parse_dispersion(text: &str) -> Result<Dispersion, AgentError> {
    serde_json::from_str(text)
        .map_err(|e| AgentError::new(ErrorKind::InvalidConfig, format!("Dispersion JSON: {e}")))
}

#[derive(Debug, Clone)]
pub struct MonteCarloOptions {
    pub cases: u32,
    pub seed: u64,
    pub dispersion: Dispersion,
    /// Write `<prefix>_montecarlo.csv` and `<prefix>_montecarlo_summary.json`
    pub output_prefix: Option<String>,
}

/// Fly `cases` dispersed cases and reduce them to impact statistics
pub fn monte_carlo(input: &ConfigInput, options: &MonteCarloOptions) -> Result<Value, AgentError> {
    if options.cases == 0 || options.cases > MAX_MONTE_CARLO_CASES {
        return Err(AgentError::new(
            ErrorKind::InvalidArgument,
            format!("cases must be 1..={MAX_MONTE_CARLO_CASES}"),
        ));
    }
    let loaded = input.load()?;
    Simulator::new(loaded.rocket.clone())?;
    let cases = run_cases(
        &loaded.rocket,
        &options.dispersion,
        options.seed,
        options.cases,
    );
    let failed = cases.iter().filter(|c| c.max_altitude_m.is_nan()).count();
    let mut result = json!({
        "status": "ok",
        "name": loaded.rocket.config.name,
        "cases": cases.len(),
        "failed_cases": failed,
        "seed": options.seed,
        "dispersion": options.dispersion,
        "statistics": impact_statistics(&cases),
        "warnings": loaded.warnings(),
    });
    if let Some(prefix) = &options.output_prefix {
        create_parent_dir(prefix)?;
        let csv = format!("{prefix}_montecarlo.csv");
        let summary = format!("{prefix}_montecarlo_summary.json");
        save_monte_carlo_csv(&cases, &csv)?;
        save_monte_carlo_summary(&cases, &options.dispersion, options.seed, &summary)?;
        result["files"] = json!({ "cases": csv, "summary": summary });
    }
    Ok(result)
}

/// Link that opens the configuration in the web app. A parameter file
/// travels with the CSV tables it references (`{"legacy": ..., "files": ...}`),
/// a web app config as is; either is deflated and base64url-encoded into the
/// `#c=` fragment, which never reaches the server.
pub fn share_link(input: &ConfigInput, base_url: Option<&str>) -> Result<Value, AgentError> {
    let loaded = input.load()?;
    let mut embedded = Vec::new();
    let payload = match loaded.format {
        "param" => {
            let mut files = serde_json::Map::new();
            for name in referenced_files(&loaded.rocket.config) {
                let path = input.base_dir.join(&name);
                let Ok(text) = std::fs::read_to_string(&path) else {
                    continue;
                };
                // The web app matches tables by file name, as its file import does
                let key = Path::new(&name)
                    .file_name()
                    .map_or(name.clone(), |f| f.to_string_lossy().into_owned());
                files.insert(key.clone(), Value::String(text));
                embedded.push(key);
            }
            json!({ "legacy": loaded.value, "files": files })
        }
        _ => loaded.value.clone(),
    };
    let base = base_url
        .map(str::to_string)
        .or_else(|| std::env::var("OPENTSIOLKOVSKY_WEB_URL").ok())
        .unwrap_or_else(|| DEFAULT_WEB_URL.to_string());
    let base = base.split('#').next().unwrap_or_default().to_string();
    let url = format!("{base}#c={}", encode_share_payload(&payload));
    Ok(json!({
        "status": "ok",
        "url": url,
        "url_length": url.len(),
        "format": loaded.format,
        "embedded_files": embedded,
        "missing_files": loaded.missing_files,
    }))
}

/// Raw DEFLATE + base64url without padding (the web app's `encodePayload`)
pub fn encode_share_payload(value: &Value) -> String {
    let json = serde_json::to_vec(value).unwrap_or_default();
    base64url(&miniz_oxide::deflate::compress_to_vec(&json, 9))
}

fn base64url(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        for k in 0..=chunk.len() {
            out.push(ALPHABET[((n >> (18 - 6 * k)) & 63) as usize] as char);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn example(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("examples")
            .join(name)
    }

    #[test]
    fn base64url_matches_rfc4648() {
        assert_eq!(base64url(b""), "");
        assert_eq!(base64url(b"f"), "Zg");
        assert_eq!(base64url(b"fo"), "Zm8");
        assert_eq!(base64url(b"foo"), "Zm9v");
        assert_eq!(base64url(b"foob"), "Zm9vYg");
        assert_eq!(base64url(&[0xfb, 0xff]), "-_8");
    }

    #[test]
    fn share_payload_round_trips() {
        let value = json!({ "legacy": { "name(str)": "x" }, "files": { "a.csv": "t,v\n0,1\n" } });
        let encoded = encode_share_payload(&value);
        assert!(
            encoded
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        );
        // Decode with the standard alphabet and inflate
        let std_b64: String = encoded
            .chars()
            .map(|c| match c {
                '-' => '+',
                '_' => '/',
                c => c,
            })
            .collect();
        let bytes = decode_base64(&std_b64);
        let json = miniz_oxide::inflate::decompress_to_vec(&bytes).unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&json).unwrap(), value);
    }

    fn decode_base64(s: &str) -> Vec<u8> {
        const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut bits = 0u32;
        let mut n = 0;
        let mut out = Vec::new();
        for c in s.bytes() {
            let v = ALPHABET.iter().position(|&a| a == c).unwrap() as u32;
            bits = (bits << 6) | v;
            n += 6;
            if n >= 8 {
                n -= 8;
                out.push((bits >> n) as u8);
                bits &= (1 << n) - 1;
            }
        }
        out
    }

    #[test]
    fn schema_lists_param_keys() {
        let schema = param_schema();
        let props = schema["properties"].as_object().unwrap();
        assert!(props.contains_key("name(str)"));
        assert!(props.contains_key("calculate condition"));
        assert!(props.contains_key("stage1"));
        let text = schema.to_string();
        assert!(text.contains("burn end time(time of each stage)[s]"));
        assert!(text.contains("position LLH[deg,deg,m]"));
        assert!(dispersion_schema()["properties"]["thrust_percent"].is_object());
    }

    #[test]
    fn examples_conform_to_the_schema_keys() {
        // Every key of the bundled examples is known to the schema
        let schema = param_schema();
        let text = schema.to_string();
        for name in [
            "param_sample_01.json",
            "param_momo.json",
            "SS-520-4/param_SS520-4.json",
        ] {
            let config: Value =
                serde_json::from_str(&std::fs::read_to_string(example(name)).unwrap()).unwrap();
            let mut keys = Vec::new();
            collect_keys(&config, &mut keys);
            for key in keys {
                assert!(
                    text.contains(&format!("\"{key}\"")),
                    "{name}: key {key:?} not in schema"
                );
            }
        }
    }

    fn collect_keys(v: &Value, out: &mut Vec<String>) {
        if let Some(map) = v.as_object() {
            for (k, child) in map {
                out.push(k.clone());
                collect_keys(child, out);
            }
        }
    }

    #[test]
    fn validate_reports_errors_instead_of_failing() {
        let ok = validate(&ConfigInput::from_path(example("param_sample_01.json")).unwrap());
        assert_eq!(ok["valid"], true, "{ok}");
        assert_eq!(ok["format"], "param");

        let bad = ConfigInput::from_json(
            r#"{"name(str)":"x","calculate condition":{"end time[s]":-1,"time step for output[s]":1},
                "launch":{"position LLH[deg,deg,m]":[35,139,0]},"stage1":{"mass initial[kg]":100}}"#,
            None,
        );
        let result = validate(&bad);
        assert_eq!(result["valid"], false);
        assert_eq!(result["error_kind"], "invalid_config");
        assert!(!result["errors"].as_array().unwrap().is_empty());

        let broken = validate(&ConfigInput::from_json("{", None));
        assert_eq!(broken["valid"], false);
    }

    #[test]
    fn validate_flags_missing_csv_files() {
        let input = ConfigInput::from_json(
            r#"{"name(str)":"x","calculate condition":{"end time[s]":10,"time step for output[s]":1},
                "launch":{"position LLH[deg,deg,m]":[35,139,0]},
                "stage1":{"mass initial[kg]":100,"thrust":{"thrust vac file exist?(bool)":true,
                "thrust vac file name(str)":"no_such_thrust.csv"}}}"#,
            None,
        );
        let result = validate(&input);
        assert_eq!(result["valid"], true);
        assert_eq!(result["missing_files"], json!(["no_such_thrust.csv"]));
        assert!(
            result["warnings"]
                .to_string()
                .contains("no_such_thrust.csv")
        );
    }

    #[test]
    fn run_returns_summary_and_samples() {
        let input = ConfigInput::from_path(example("param_sample_01.json")).unwrap();
        let result = run(
            &input,
            &RunOptions {
                output_prefix: None,
                trajectory_points: 20,
            },
        )
        .unwrap();
        assert_eq!(result["status"], "ok");
        assert!(result["summary"]["max_altitude_m"].as_f64().unwrap() > 1000.0);
        let points = result["trajectory"].as_array().unwrap();
        assert!(points.len() >= 2 && points.len() <= 20);
        assert_eq!(points[0]["time_s"], 0.0);
        assert!(result.get("files").is_none());
    }

    #[test]
    fn run_accepts_the_web_format() {
        let input = ConfigInput::from_json(
            r#"{"name":"web","simulation":{"duration_s":60,"output_step_s":1},
                "launch":{"latitude_deg":35,"longitude_deg":139,
                "datetime_utc":{"year":2020,"month":1,"day":1,"hour":0,"minute":0,"second":0}},
                "stages":[{"mass_initial_kg":1000,"thrust_constant":30000,"burn_end_s":10}]}"#,
            None,
        );
        assert_eq!(validate(&input)["format"], "web");
        let result = run(&input, &RunOptions::default()).unwrap();
        assert!(result["summary"]["max_altitude_m"].as_f64().unwrap() > 100.0);
    }

    #[test]
    fn monte_carlo_checks_case_count() {
        let input = ConfigInput::from_path(example("param_sample_01.json")).unwrap();
        let options = MonteCarloOptions {
            cases: 0,
            seed: 1,
            dispersion: Dispersion::default(),
            output_prefix: None,
        };
        let err = monte_carlo(&input, &options).unwrap_err();
        assert_eq!(err.kind, ErrorKind::InvalidArgument);
        let result = monte_carlo(
            &input,
            &MonteCarloOptions {
                cases: 4,
                ..options
            },
        )
        .unwrap();
        assert_eq!(result["cases"], 4);
        assert!(result["statistics"].as_array().is_some());
    }

    #[test]
    fn share_link_embeds_referenced_tables() {
        let input = ConfigInput::from_path(example("SS-520-4/param_SS520-4.json")).unwrap();
        let result = share_link(&input, Some("http://localhost:5173/")).unwrap();
        let url = result["url"].as_str().unwrap();
        assert!(url.starts_with("http://localhost:5173/#c="));
        assert!(!result["embedded_files"].as_array().unwrap().is_empty());
        assert_eq!(result["missing_files"], json!([]));
    }
}
