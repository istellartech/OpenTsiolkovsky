#![allow(non_snake_case)]
use clap::{Parser, Subcommand, ValueEnum};
use openTsiolkovsky::agent::{
    self, AgentError, ConfigInput, ErrorKind, MonteCarloOptions, RunOptions,
};
use openTsiolkovsky::config::DirSource;
use openTsiolkovsky::montecarlo::Dispersion;
use serde_json::Value;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// Exit status for a configuration that fails to parse or validate
/// (clap uses 2 for usage errors; 1 is any other failure)
const EXIT_INVALID_CONFIG: u8 = 3;

#[derive(Parser)]
#[command(name = "openTsiolkovsky-cli", version)]
#[command(about = "OpenTsiolkovsky rocket flight simulator")]
#[command(after_help = "\
CONFIG is a JSON configuration (`schema` prints its JSON Schema; examples/ has samples);
`-` reads it from stdin. Legacy C++ parameter files (param_*.json) are converted with
`convert`. With --json every command prints one JSON document on stdout.

Exit status: 0 success, 1 failure, 2 invalid arguments, 3 invalid configuration.
See docs/ai.md for scripts and AI agents.")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Fly a vehicle and write trajectory.csv, summary.json and bodies/*.csv
    Run {
        config: String,
        /// Output directory
        #[arg(short, long, default_value = "output")]
        output: PathBuf,
        /// Print the result as JSON (summary, warnings, files)
        #[arg(long)]
        json: bool,
        /// Include N evenly spaced trajectory samples in the JSON result
        #[arg(long, value_name = "N", default_value_t = 0, requires = "json")]
        trajectory_points: usize,
    },

    /// Fly dispersed cases and report impact ellipses
    MonteCarlo {
        config: String,
        /// Number of cases
        #[arg(short = 'n', long, default_value_t = 100)]
        cases: u32,
        /// 1-sigma dispersion JSON (missing keys use defaults; `schema dispersion`)
        #[arg(long, value_name = "FILE")]
        dispersion: Option<PathBuf>,
        #[arg(long, default_value_t = 1)]
        seed: u64,
        /// Output directory
        #[arg(short, long, default_value = "output")]
        output: PathBuf,
        #[arg(long)]
        json: bool,
    },

    /// Check a configuration without flying it
    Validate {
        config: String,
        #[arg(long)]
        json: bool,
    },

    /// Print the JSON Schema of a configuration or dispersion file
    Schema {
        #[arg(value_enum, default_value_t = SchemaKind::Config)]
        kind: SchemaKind,
    },

    /// Convert a legacy C++ parameter file (param_*.json) to a configuration
    Convert {
        /// Legacy parameter file; its CSV tables are read next to it and inlined
        legacy: PathBuf,
        /// Write the configuration here (default: stdout)
        #[arg(short, long)]
        output: Option<PathBuf>,
        #[arg(long)]
        json: bool,
    },

    /// Print a link that opens the configuration in the web app
    Share {
        config: String,
        /// Web app URL (default: $OPENTSIOLKOVSKY_WEB_URL or the public site)
        #[arg(long, value_name = "URL")]
        base_url: Option<String>,
        #[arg(long)]
        json: bool,
    },

    /// Serve the Model Context Protocol (MCP) on stdin/stdout
    Mcp,
}

#[derive(Clone, Copy, ValueEnum)]
enum SchemaKind {
    Config,
    Dispersion,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let (json, outcome) = match cli.command {
        Command::Run {
            config,
            output,
            json,
            trajectory_points,
        } => (json, run(&config, &output, json, trajectory_points)),
        Command::MonteCarlo {
            config,
            cases,
            dispersion,
            seed,
            output,
            json,
        } => (
            json,
            monte_carlo(&config, cases, dispersion.as_deref(), seed, &output, json),
        ),
        Command::Validate { config, json } => (json, validate(&config, json)),
        Command::Schema { kind } => {
            print_json(&match kind {
                SchemaKind::Config => agent::config_schema(),
                SchemaKind::Dispersion => agent::dispersion_schema(),
            });
            (true, Ok(ExitCode::SUCCESS))
        }
        Command::Convert {
            legacy,
            output,
            json,
        } => (json, convert(&legacy, output.as_deref(), json)),
        Command::Share {
            config,
            base_url,
            json,
        } => (json, share(&config, base_url.as_deref(), json)),
        Command::Mcp => (
            false,
            openTsiolkovsky::mcp::serve_stdio()
                .map(|_| ExitCode::SUCCESS)
                .map_err(|e| AgentError::new(ErrorKind::Io, e.to_string())),
        ),
    };
    match outcome {
        Ok(code) => code,
        Err(e) => {
            if json {
                print_json(&e.to_json());
            } else {
                eprintln!("Error: {e}");
            }
            ExitCode::from(match e.kind {
                ErrorKind::InvalidConfig => EXIT_INVALID_CONFIG,
                ErrorKind::InvalidArgument => 2,
                _ => 1,
            })
        }
    }
}

fn print_json(value: &Value) {
    println!("{}", openTsiolkovsky::config::to_pretty_json(value));
}

/// The configuration file, or stdin for `-`
fn read_input(config: &str) -> Result<ConfigInput, AgentError> {
    if config == "-" {
        let mut text = String::new();
        std::io::stdin()
            .read_to_string(&mut text)
            .map_err(|e| AgentError::new(ErrorKind::Io, format!("stdin: {e}")))?;
        Ok(ConfigInput::from_json(text, None))
    } else {
        ConfigInput::from_path(config)
    }
}

/// `path: message` lines of a JSON array of issues
fn issue_lines(value: &Value) -> Vec<String> {
    value
        .as_array()
        .map(|issues| {
            issues
                .iter()
                .map(|i| match (i["path"].as_str(), i["message"].as_str()) {
                    (Some(p), Some(m)) if !p.is_empty() => format!("{p}: {m}"),
                    (_, Some(m)) => m.to_string(),
                    _ => i.to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}

fn print_warnings(result: &Value) {
    for w in issue_lines(&result["warnings"]) {
        eprintln!("Warning: {w}");
    }
}

fn validate(config: &str, json: bool) -> Result<ExitCode, AgentError> {
    let result = agent::validate(&read_input(config)?);
    let valid = result["valid"] == true;
    if json {
        print_json(&result);
    } else {
        print_warnings(&result);
        if valid {
            let stages = result["stages"].as_u64().unwrap_or(0);
            println!(
                "{}: valid ({stages} stage{})",
                result["name"].as_str().unwrap_or_default(),
                if stages == 1 { "" } else { "s" }
            );
        } else {
            for e in issue_lines(&result["errors"]) {
                eprintln!("Error: {e}");
            }
        }
    }
    Ok(if valid {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(EXIT_INVALID_CONFIG)
    })
}

fn run(
    config: &str,
    output: &Path,
    json: bool,
    trajectory_points: usize,
) -> Result<ExitCode, AgentError> {
    let result = agent::run(
        &read_input(config)?,
        &RunOptions {
            output_dir: Some(output.to_path_buf()),
            trajectory_points,
        },
    )?;
    if json {
        print_json(&result);
    } else {
        print_warnings(&result);
        print_summary(&result["summary"]);
        println!("\nWritten to {}/", output.display());
    }
    Ok(ExitCode::SUCCESS)
}

/// Metres to kilometres, without a "-0.000" for a value that rounds to zero
fn km(m: f64) -> f64 {
    let k = m / 1e3;
    if k.abs() < 5e-4 { 0.0 } else { k }
}

/// Human-readable summary of a run
fn print_summary(s: &Value) {
    let f = |v: &Value| v.as_f64().unwrap_or(f64::NAN);
    println!("{}", s["name"].as_str().unwrap_or_default());
    println!("\nEvents:");
    for e in s["events"].as_array().into_iter().flatten() {
        let body = e["body"]
            .as_str()
            .map(|b| format!(" ({b})"))
            .unwrap_or_default();
        println!(
            "  T+{:8.2} s  {:<10} stage {}  alt {:9.3} km  speed {:7.1} m/s  Mach {:5.2}  q {:7.2} kPa{body}",
            f(&e["time_s"]),
            e["kind"].as_str().unwrap_or_default(),
            e["stage"],
            km(f(&e["altitude_m"])),
            f(&e["speed_earth_mps"]),
            f(&e["mach"]),
            f(&e["dynamic_pressure_pa"]) / 1e3,
        );
        if let Some(o) = e.get("orbit").filter(|_| e["kind"] == "burnout") {
            let apogee = o["apogee_altitude_m"]
                .as_f64()
                .map_or("-".to_string(), |a| format!("{:.1}", a / 1e3));
            println!(
                "{:16}orbit: perigee {:.1} km, apogee {apogee} km, inclination {:.2} deg",
                "",
                f(&o["perigee_altitude_m"]) / 1e3,
                f(&o["inclination_deg"]),
            );
        }
    }
    let m = &s["maxima"];
    let peak = |label: &str, key: &str, scale: f64, unit: &str| {
        println!(
            "  {label:<22} {:10.2} {unit:<5} at T+{:.2} s",
            f(&m[key]["value"]) * scale,
            f(&m[key]["time_s"])
        );
    };
    println!("\nMaxima:");
    peak("altitude", "altitude_m", 1e-3, "km");
    peak("speed (Earth)", "speed_earth_mps", 1.0, "m/s");
    peak("speed (inertial)", "speed_inertial_mps", 1.0, "m/s");
    peak("Mach", "mach", 1.0, "");
    peak("dynamic pressure", "dynamic_pressure_pa", 1e-3, "kPa");
    peak("sensed acceleration", "acceleration_g", 1.0, "G");
    let impact = |v: &Value| match v.as_object() {
        Some(_) => format!(
            "{:.6}, {:.6} deg at T+{:.1} s",
            f(&v["latitude_deg"]),
            f(&v["longitude_deg"]),
            f(&v["time_s"])
        ),
        None => "none (no ground impact)".to_string(),
    };
    println!("\nImpact points:");
    println!("  {:<22} {}", "vehicle", impact(&s["impact"]));
    for b in s["bodies"].as_array().into_iter().flatten() {
        println!(
            "  {:<22} {}",
            b["id"].as_str().unwrap_or_default(),
            impact(&b["impact"])
        );
    }
}

fn monte_carlo(
    config: &str,
    cases: u32,
    dispersion: Option<&Path>,
    seed: u64,
    output: &Path,
    json: bool,
) -> Result<ExitCode, AgentError> {
    let dispersion = match dispersion {
        Some(path) => {
            let text = std::fs::read_to_string(path)
                .map_err(|e| AgentError::new(ErrorKind::Io, format!("{}: {e}", path.display())))?;
            agent::parse_dispersion(&text)?
        }
        None => Dispersion::default(),
    };
    if !json {
        eprintln!("Running {cases} Monte Carlo cases (seed {seed})...");
    }
    let result = agent::monte_carlo(
        &read_input(config)?,
        &MonteCarloOptions {
            cases,
            seed,
            dispersion,
            output_dir: Some(output.to_path_buf()),
        },
    )?;
    if json {
        print_json(&result);
        return Ok(ExitCode::SUCCESS);
    }
    print_warnings(&result);
    let f = |v: &Value| v.as_f64().unwrap_or(f64::NAN);
    for s in result["statistics"].as_array().into_iter().flatten() {
        println!(
            "{:<18} {}/{} impacts, mean {:.6}, {:.6} deg, 99% ellipse {:.0} x {:.0} m (azimuth {:.0} deg)",
            s["body"].as_str().unwrap_or_default(),
            s["impacts"],
            s["cases"],
            f(&s["mean_latitude_deg"]),
            f(&s["mean_longitude_deg"]),
            f(&s["ellipse_99_major_m"]),
            f(&s["ellipse_99_minor_m"]),
            f(&s["ellipse_azimuth_deg"]),
        );
    }
    println!("\nWritten to {}/", output.display());
    Ok(ExitCode::SUCCESS)
}

fn convert(legacy: &Path, output: Option<&Path>, json: bool) -> Result<ExitCode, AgentError> {
    let text = std::fs::read_to_string(legacy)
        .map_err(|e| AgentError::new(ErrorKind::Io, format!("{}: {e}", legacy.display())))?;
    let dir = match legacy.parent() {
        Some(p) if !p.as_os_str().is_empty() => p.to_path_buf(),
        _ => PathBuf::from("."),
    };
    let result = agent::convert(&text, &DirSource(dir))?;
    let config = openTsiolkovsky::config::to_pretty_json(&result["config"]) + "\n";
    if let Some(path) = output {
        std::fs::write(path, &config)
            .map_err(|e| AgentError::new(ErrorKind::Io, format!("{}: {e}", path.display())))?;
    }
    if json {
        print_json(&result);
        return Ok(ExitCode::SUCCESS);
    }
    for w in result["warnings"].as_array().into_iter().flatten() {
        eprintln!("Warning: {}", w.as_str().unwrap_or_default());
    }
    for e in issue_lines(&result["validation"]["errors"]) {
        eprintln!("Error in the converted configuration: {e}");
    }
    match output {
        Some(path) => eprintln!("Written to {}", path.display()),
        None => print!("{config}"),
    }
    Ok(ExitCode::SUCCESS)
}

fn share(config: &str, base_url: Option<&str>, json: bool) -> Result<ExitCode, AgentError> {
    let result = agent::share_link(&read_input(config)?, base_url)?;
    if json {
        print_json(&result);
    } else {
        println!("{}", result["url"].as_str().unwrap_or_default());
    }
    Ok(ExitCode::SUCCESS)
}
