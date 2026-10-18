//! Machine-readable operations for AI agents and scripts
//!
//! Shared by the CLI's `--json` output and the MCP server (`mcp.rs`): the
//! JSON Schemas, validation, single runs, Monte Carlo runs, legacy file
//! conversion and web app share links. Every result is a JSON value;
//! failures are [`AgentError`] with a stable `kind`.

use crate::config::{
    self, Config, DirSource, Issue, LegacyConversion, Report, TableSource, convert_legacy,
    is_legacy,
};
use crate::montecarlo::{Dispersion, MonteCarlo};
use crate::output::{Summary, write_flight, write_monte_carlo};
use crate::sim::{Sample, simulate};
use crate::vehicle::Vehicle;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

/// Web app that opens share links
pub const DEFAULT_WEB_URL: &str = "https://open-tsiolkovsky.vercel.app/";

/// Monte Carlo case limit for one request
pub const MAX_MONTE_CARLO_CASES: u32 = 10_000;

/// What went wrong, in a form a caller can branch on
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKind {
    /// The configuration (or dispersion) is not valid JSON or fails validation
    InvalidConfig,
    /// A file could not be read or written
    Io,
    /// The simulation produced no result
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
    /// The problems of an invalid configuration
    pub issues: Vec<Issue>,
}

impl AgentError {
    pub fn new(kind: ErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            issues: Vec::new(),
        }
    }

    fn invalid(report: Report) -> Self {
        Self {
            kind: ErrorKind::InvalidConfig,
            message: "the configuration is invalid".to_string(),
            issues: report.errors,
        }
    }

    pub fn to_json(&self) -> Value {
        json!({
            "status": "error",
            "error": {
                "kind": self.kind.as_str(),
                "message": self.message,
                "issues": self.issues,
            }
        })
    }
}

impl std::fmt::Display for AgentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)?;
        for issue in &self.issues {
            write!(f, "\n  {issue}")?;
        }
        Ok(())
    }
}

impl std::error::Error for AgentError {}

fn io_error(path: &Path, e: impl std::fmt::Display) -> AgentError {
    AgentError::new(ErrorKind::Io, format!("{}: {e}", path.display()))
}

/// A configuration to work on: the JSON text and the directory its CSV
/// file tables are resolved against
#[derive(Debug, Clone)]
pub struct ConfigInput {
    pub text: String,
    pub base_dir: PathBuf,
}

/// A configuration with its tables loaded
pub struct Loaded {
    pub config: Config,
    pub vehicle: Vehicle,
    pub warnings: Vec<Issue>,
}

impl ConfigInput {
    /// Read a configuration file; its CSV tables are resolved next to it
    pub fn from_path(path: impl AsRef<Path>) -> Result<Self, AgentError> {
        let path = path.as_ref();
        let text = std::fs::read_to_string(path).map_err(|e| io_error(path, e))?;
        Ok(Self {
            text,
            base_dir: parent_dir(path),
        })
    }

    /// Inline JSON; CSV tables are resolved against `base_dir` (default:
    /// the current directory)
    pub fn from_json(text: impl Into<String>, base_dir: Option<PathBuf>) -> Self {
        Self {
            text: text.into(),
            base_dir: base_dir.unwrap_or_else(|| PathBuf::from(".")),
        }
    }

    pub fn source(&self) -> DirSource {
        DirSource(self.base_dir.clone())
    }

    /// Parse the configuration
    pub fn parse(&self) -> Result<Config, AgentError> {
        let value: Value = serde_json::from_str(&self.text)
            .map_err(|e| AgentError::new(ErrorKind::InvalidConfig, format!("JSON: {e}")))?;
        if is_legacy(&value) {
            return Err(AgentError::new(
                ErrorKind::InvalidConfig,
                "this is a legacy C++ parameter file (param_*.json); convert it first: \
                 `openTsiolkovsky-cli convert <file> -o <new.json>`",
            ));
        }
        serde_json::from_value(value)
            .map_err(|e| AgentError::new(ErrorKind::InvalidConfig, format!("JSON: {e}")))
    }

    /// Parse, validate and load the tables
    pub fn load(&self) -> Result<Loaded, AgentError> {
        let config = self.parse()?;
        let (vehicle, warnings) =
            Vehicle::load(&config, &self.source()).map_err(AgentError::invalid)?;
        Ok(Loaded {
            config,
            vehicle,
            warnings,
        })
    }
}

fn parent_dir(path: &Path) -> PathBuf {
    match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    }
}

/// JSON Schema of the configuration file
pub fn config_schema() -> Value {
    config::json_schema()
}

/// JSON Schema of the Monte Carlo dispersion file
pub fn dispersion_schema() -> Value {
    schemars::schema_for!(Dispersion).to_value()
}

/// Check a configuration without flying it. Problems with the
/// configuration are reported in the result (`valid: false`), not as errors.
pub fn validate(input: &ConfigInput) -> Value {
    let config = match input.parse() {
        Ok(config) => config,
        Err(e) => {
            return json!({
                "valid": false,
                "errors": [Issue::new("", e.message)],
                "warnings": [],
            });
        }
    };
    match Vehicle::load(&config, &input.source()) {
        Ok((vehicle, warnings)) => json!({
            "valid": true,
            "name": config.name,
            "stages": vehicle.stage_count(),
            "errors": [],
            "warnings": warnings,
            "referenced_files": config.referenced_files(),
        }),
        Err(report) => json!({
            "valid": false,
            "errors": report.errors,
            "warnings": report.warnings,
        }),
    }
}

#[derive(Debug, Clone, Default)]
pub struct RunOptions {
    /// Write `trajectory.csv`, `summary.json` and `bodies/` into this directory
    pub output_dir: Option<PathBuf>,
    /// Include this many evenly spaced trajectory samples (0: none)
    pub trajectory_points: usize,
}

/// Fly the vehicle (and its spent stages and jettisoned bodies)
pub fn run(input: &ConfigInput, options: &RunOptions) -> Result<Value, AgentError> {
    let loaded = input.load()?;
    let flight = simulate(&loaded.vehicle);
    let summary = Summary::new(&loaded.vehicle, &flight).ok_or_else(|| {
        AgentError::new(ErrorKind::Simulation, "the simulation produced no samples")
    })?;
    let mut warnings = loaded.warnings;
    if flight.forced_steps > 0 {
        warnings.push(Issue::new(
            "simulation.integrator",
            format!(
                "{} RK45 steps were accepted at the minimum step size above tolerance",
                flight.forced_steps
            ),
        ));
    }
    let mut result = json!({
        "status": "ok",
        "name": summary.name,
        "summary": summary,
        "warnings": warnings,
    });
    if let Some(dir) = &options.output_dir {
        let files = write_flight(dir, &flight, &summary).map_err(|e| io_error(dir, e))?;
        result["files"] = json!(files);
    }
    if options.trajectory_points > 0 {
        result["trajectory"] = sample_trajectory(&flight.trajectory, options.trajectory_points);
    }
    Ok(result)
}

/// `n` evenly spaced samples (always the first and last) with the most
/// used quantities
fn sample_trajectory(trajectory: &[Sample], n: usize) -> Value {
    let len = trajectory.len();
    let n = n.clamp(2, len.max(2));
    let mut indices: Vec<usize> = (0..n)
        .map(|k| ((k as f64) * ((len - 1) as f64) / ((n - 1) as f64)).round() as usize)
        .collect();
    indices.dedup();
    Value::Array(
        indices
            .into_iter()
            .map(|i| {
                let s = &trajectory[i];
                json!({
                    "time_s": s.time_s,
                    "stage": s.stage,
                    "flight_mode": s.flight_mode,
                    "altitude_m": s.altitude_m,
                    "latitude_deg": s.latitude_deg,
                    "longitude_deg": s.longitude_deg,
                    "downrange_m": s.downrange_m,
                    "speed_earth_mps": s.speed_earth_mps,
                    "speed_inertial_mps": s.speed_inertial_mps,
                    "mach": s.mach,
                    "dynamic_pressure_pa": s.dynamic_pressure_pa,
                    "mass_kg": s.mass_kg,
                    "thrust_n": s.thrust_n,
                })
            })
            .collect(),
    )
}

/// Parse a dispersion JSON; keys left out keep their defaults
pub fn parse_dispersion(text: &str) -> Result<Dispersion, AgentError> {
    serde_json::from_str(text)
        .map_err(|e| AgentError::new(ErrorKind::InvalidConfig, format!("dispersion: {e}")))
}

#[derive(Debug, Clone)]
pub struct MonteCarloOptions {
    pub cases: u32,
    pub seed: u64,
    pub dispersion: Dispersion,
    /// Write `montecarlo_cases.csv` and `montecarlo_summary.json` here
    pub output_dir: Option<PathBuf>,
}

/// Fly dispersed cases and reduce them to impact statistics
pub fn monte_carlo(input: &ConfigInput, options: &MonteCarloOptions) -> Result<Value, AgentError> {
    if options.cases == 0 || options.cases > MAX_MONTE_CARLO_CASES {
        return Err(AgentError::new(
            ErrorKind::InvalidArgument,
            format!("cases must be 1..={MAX_MONTE_CARLO_CASES}"),
        ));
    }
    let loaded = input.load()?;
    let mc = MonteCarlo::run(
        &loaded.vehicle,
        &options.dispersion,
        options.seed,
        options.cases,
    );
    let mut result = json!({ "status": "ok", "name": loaded.config.name });
    if let (Value::Object(out), Ok(Value::Object(summary))) =
        (&mut result, serde_json::to_value(mc.summary()))
    {
        out.extend(summary);
    }
    result["warnings"] = json!(loaded.warnings);
    if let Some(dir) = &options.output_dir {
        let files = write_monte_carlo(dir, &mc).map_err(|e| io_error(dir, e))?;
        result["files"] = json!(files);
    }
    Ok(result)
}

/// Convert a legacy C++ parameter file; its CSV tables are read from
/// `base_dir` and inlined
pub fn convert(text: &str, source: &dyn TableSource) -> Result<Value, AgentError> {
    let LegacyConversion { config, warnings } =
        convert_legacy(text, source).map_err(|e| AgentError::new(ErrorKind::InvalidConfig, e))?;
    let report = config::validate(&config);
    Ok(json!({
        "status": "ok",
        "config": config,
        "warnings": warnings,
        "validation": report,
    }))
}

/// Link that opens the configuration in the web app: the configuration
/// with its file tables inlined, deflated and base64url-encoded into the
/// `#c=` fragment (which never reaches the server)
pub fn share_link(input: &ConfigInput, base_url: Option<&str>) -> Result<Value, AgentError> {
    let loaded = input.load()?;
    let config = loaded
        .config
        .inline_tables(&input.source())
        .map_err(|issues| AgentError {
            kind: ErrorKind::InvalidConfig,
            message: "tables could not be read".to_string(),
            issues,
        })?;
    let base = base_url
        .map(str::to_string)
        .or_else(|| std::env::var("OPENTSIOLKOVSKY_WEB_URL").ok())
        .unwrap_or_else(|| DEFAULT_WEB_URL.to_string());
    let base = base.split('#').next().unwrap_or_default().to_string();
    let url = format!("{base}#c={}", encode_share_payload(&json!(config)));
    Ok(json!({
        "status": "ok",
        "url": url,
        "url_length": url.len(),
    }))
}

/// Raw DEFLATE + base64url without padding (the web app's `decodePayload`)
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
        let value = json!({ "name": "x", "stages": [] });
        let encoded = encode_share_payload(&value);
        assert!(
            encoded
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        );
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
    fn schema_lists_config_keys() {
        let schema = config_schema();
        let text = schema.to_string();
        for key in [
            "end_time_s",
            "thrust_vac_n",
            "latitude_deg",
            "cn_table",
            "jettisons",
        ] {
            assert!(text.contains(&format!("\"{key}\"")), "{key}");
        }
        assert!(dispersion_schema()["properties"]["thrust_percent"].is_object());
    }

    #[test]
    fn validate_reports_errors_instead_of_failing() {
        let ok = validate(&ConfigInput::from_path(example("momo.json")).unwrap());
        assert_eq!(ok["valid"], true, "{ok}");

        let bad = ConfigInput::from_json(
            r#"{"name":"x","simulation":{"end_time_s":-1},
                "launch":{"latitude_deg":35,"longitude_deg":139},"stages":[{"mass_initial_kg":100}]}"#,
            None,
        );
        let result = validate(&bad);
        assert_eq!(result["valid"], false);
        assert_eq!(result["errors"][0]["path"], "simulation.end_time_s");

        let broken = validate(&ConfigInput::from_json("{", None));
        assert_eq!(broken["valid"], false);

        let legacy = validate(&ConfigInput::from_json(r#"{"name(str)": "x"}"#, None));
        assert!(
            legacy["errors"][0]["message"]
                .as_str()
                .unwrap()
                .contains("convert")
        );
    }

    #[test]
    fn validate_flags_missing_csv_files() {
        let input = ConfigInput::from_json(
            r#"{"name":"x","simulation":{"end_time_s":10},
                "launch":{"latitude_deg":35,"longitude_deg":139},
                "stages":[{"mass_initial_kg":100,"engine":{"thrust_vac_n":{"file":"no_such_thrust.csv"},
                "isp_vac_s":200,"burn_end_s":5}}]}"#,
            None,
        );
        let result = validate(&input);
        assert_eq!(result["valid"], false);
        assert_eq!(result["errors"][0]["path"], "stages[0].engine.thrust_vac_n");
        assert!(result["errors"].to_string().contains("no_such_thrust.csv"));
    }

    #[test]
    fn run_returns_summary_and_samples() {
        let input = ConfigInput::from_path(example("momo.json")).unwrap();
        let result = run(
            &input,
            &RunOptions {
                output_dir: None,
                trajectory_points: 20,
            },
        )
        .unwrap();
        assert_eq!(result["status"], "ok");
        assert!(
            result["summary"]["maxima"]["altitude_m"]["value"]
                .as_f64()
                .unwrap()
                > 1000.0
        );
        let points = result["trajectory"].as_array().unwrap();
        assert!(points.len() >= 2 && points.len() <= 20);
        assert_eq!(points[0]["time_s"], 0.0);
        assert!(result.get("files").is_none());
    }

    #[test]
    fn run_writes_the_output_files() {
        let dir = tempfile::tempdir().unwrap();
        let input = ConfigInput::from_path(example("SS-520-4/ss520_4.json")).unwrap();
        let result = run(
            &input,
            &RunOptions {
                output_dir: Some(dir.path().to_path_buf()),
                trajectory_points: 0,
            },
        )
        .unwrap();
        assert!(dir.path().join("trajectory.csv").exists());
        assert!(dir.path().join("summary.json").exists());
        assert!(dir.path().join("bodies/stage1.csv").exists());
        assert_eq!(result["files"]["bodies"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn monte_carlo_checks_case_count() {
        let input = ConfigInput::from_path(example("momo.json")).unwrap();
        let options = MonteCarloOptions {
            cases: 0,
            seed: 1,
            dispersion: Dispersion::default(),
            output_dir: None,
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
    fn share_link_inlines_tables() {
        let input = ConfigInput::from_path(example("SS-520-4/ss520_4.json")).unwrap();
        let result = share_link(&input, Some("http://localhost:5173/")).unwrap();
        let url = result["url"].as_str().unwrap();
        assert!(url.starts_with("http://localhost:5173/#c="));
    }

    #[test]
    fn convert_reads_the_legacy_tables() {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/cpp_reference/momo_trim.json");
        let text = std::fs::read_to_string(&path).unwrap();
        let result = convert(&text, &DirSource(parent_dir(&path))).unwrap();
        assert_eq!(result["validation"]["errors"], json!([]));
        let config: Config = serde_json::from_value(result["config"].clone()).unwrap();
        assert!(config.stages[0].thrust_trim.is_some());
    }
}
