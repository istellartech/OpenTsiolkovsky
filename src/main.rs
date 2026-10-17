#![allow(non_snake_case)]
use clap::{Args as ClapArgs, Parser, Subcommand, ValueEnum};
use openTsiolkovsky::{
    agent::{self, AgentError, ConfigInput, ErrorKind, MonteCarloOptions, RunOptions},
    io::{
        save_cpp_telemetry_csv, save_monte_carlo_csv, save_monte_carlo_summary, save_summary_json,
        save_trajectory_csv,
    },
    montecarlo::{Dispersion, impact_statistics, run_cases},
    simulator::{EventKind, FallBodyKind, Simulator, impact_point},
};
use std::io::Read;
use std::process::ExitCode;

/// Exit status for a configuration that fails to parse or validate
/// (clap uses 2 for usage errors; 1 is any other failure)
const EXIT_INVALID_CONFIG: u8 = 3;

#[derive(Parser)]
#[command(name = "openTsiolkovsky", version)]
#[command(about = "OpenTsiolkovsky Rocket Flight Simulator")]
#[command(args_conflicts_with_subcommands = true)]
#[command(after_help = "\
Without a subcommand, flies the vehicle (same as `run`).

For AI agents and scripts:
  run --json        one JSON document on stdout (summary, events, impact points, files)
  validate --json   check a parameter file without flying it
  schema            JSON Schema of the parameter file (`schema dispersion` for Monte Carlo)
  share             link that opens the configuration in the web app
  mcp               Model Context Protocol server on stdin/stdout

`--config -` reads the configuration from stdin. Exit status: 0 success,
1 failure, 2 invalid arguments, 3 invalid configuration. See docs/ai.md.")]
struct Cli {
    #[command(subcommand)]
    command: Option<Command>,

    #[command(flatten)]
    run: RunArgs,
}

#[derive(Subcommand)]
enum Command {
    /// Fly a vehicle and write the output files (the default)
    Run(RunArgs),

    /// Check a configuration without flying it
    Validate {
        /// Parameter file (`-`: stdin)
        #[arg(short, long)]
        config: String,

        /// Print the result as JSON
        #[arg(long)]
        json: bool,
    },

    /// Print the JSON Schema of a configuration file
    Schema {
        #[arg(value_enum, default_value_t = SchemaKind::Param)]
        kind: SchemaKind,
    },

    /// Print a link that opens the configuration in the web app
    Share {
        /// Parameter file (`-`: stdin); referenced CSV tables are embedded
        #[arg(short, long)]
        config: String,

        /// Web app URL (default: $OPENTSIOLKOVSKY_WEB_URL or the public site)
        #[arg(long, value_name = "URL")]
        base_url: Option<String>,

        /// Print the result as JSON
        #[arg(long)]
        json: bool,
    },

    /// Serve the Model Context Protocol (MCP) on stdin/stdout
    Mcp,
}

#[derive(Clone, Copy, ValueEnum)]
enum SchemaKind {
    /// CLI parameter file (param_*.json)
    Param,
    /// Monte Carlo dispersion file (--dispersion)
    Dispersion,
}

#[derive(ClapArgs, Clone)]
struct RunArgs {
    /// Parameter file (`-`: stdin, CSV names resolved against the current directory)
    #[arg(short, long, default_value = "param_sample_01.json")]
    config: String,

    /// Prefix of the output files
    #[arg(short, long)]
    output: Option<String>,

    #[arg(short, long)]
    verbose: bool,

    /// Print one JSON document on stdout instead of text
    #[arg(long)]
    json: bool,

    /// Include N evenly spaced trajectory samples in the --json output
    #[arg(long, value_name = "N", default_value_t = 0, requires = "json")]
    trajectory_points: usize,

    /// Also run N Monte Carlo dispersion cases
    #[arg(long, value_name = "N")]
    monte_carlo: Option<u32>,

    /// 1-sigma dispersion JSON for --monte-carlo (missing keys use defaults)
    #[arg(long, value_name = "FILE")]
    dispersion: Option<String>,

    /// Random seed for --monte-carlo
    #[arg(long, default_value_t = 1)]
    seed: u64,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    let (json, outcome) = match cli.command {
        None => (cli.run.json, run(&cli.run)),
        Some(Command::Run(args)) => (args.json, run(&args)),
        Some(Command::Validate { config, json }) => (json, validate(&config, json)),
        Some(Command::Schema { kind }) => {
            let schema = match kind {
                SchemaKind::Param => agent::param_schema(),
                SchemaKind::Dispersion => agent::dispersion_schema(),
            };
            print_json(&schema);
            (true, Ok(ExitCode::SUCCESS))
        }
        Some(Command::Share {
            config,
            base_url,
            json,
        }) => (json, share(&config, base_url.as_deref(), json)),
        Some(Command::Mcp) => (
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
            ExitCode::from(exit_status(&e))
        }
    }
}

fn exit_status(e: &AgentError) -> u8 {
    match e.kind {
        ErrorKind::InvalidConfig => EXIT_INVALID_CONFIG,
        ErrorKind::InvalidArgument => 2,
        _ => 1,
    }
}

fn print_json(value: &serde_json::Value) {
    println!(
        "{}",
        serde_json::to_string_pretty(value).unwrap_or_default()
    );
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

fn load_dispersion(args: &RunArgs) -> Result<Dispersion, AgentError> {
    match &args.dispersion {
        Some(path) => {
            let text = std::fs::read_to_string(path)
                .map_err(|e| AgentError::new(ErrorKind::Io, format!("{path}: {e}")))?;
            agent::parse_dispersion(&text)
        }
        None => Ok(Dispersion::default()),
    }
}

fn validate(config: &str, json: bool) -> Result<ExitCode, AgentError> {
    let result = agent::validate(&read_input(config)?);
    let valid = result["valid"] == true;
    if json {
        print_json(&result);
    } else {
        let lines = |key: &str| -> Vec<String> {
            result[key]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default()
        };
        for warning in lines("warnings") {
            eprintln!("Warning: {warning}");
        }
        if valid {
            println!(
                "{}: valid ({} stage{})",
                result["name"].as_str().unwrap_or_default(),
                result["stages"],
                if result["stages"] == 1 { "" } else { "s" }
            );
        } else {
            for error in lines("errors") {
                eprintln!("Error: {error}");
            }
        }
    }
    Ok(if valid {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(EXIT_INVALID_CONFIG)
    })
}

fn share(config: &str, base_url: Option<&str>, json: bool) -> Result<ExitCode, AgentError> {
    let result = agent::share_link(&read_input(config)?, base_url)?;
    if json {
        print_json(&result);
    } else {
        if let Some(missing) = result["missing_files"].as_array()
            && !missing.is_empty()
        {
            eprintln!("Warning: CSV files not found, not embedded: {missing:?}");
        }
        println!("{}", result["url"].as_str().unwrap_or_default());
    }
    Ok(ExitCode::SUCCESS)
}

fn run(args: &RunArgs) -> Result<ExitCode, AgentError> {
    let input = read_input(&args.config)?;
    let output_base = args.output.as_deref().unwrap_or("output");
    if args.json {
        let mut result = agent::run(
            &input,
            &RunOptions {
                output_prefix: Some(output_base.to_string()),
                trajectory_points: args.trajectory_points,
            },
        )?;
        if let Some(count) = args.monte_carlo {
            result["monte_carlo"] = agent::monte_carlo(
                &input,
                &MonteCarloOptions {
                    cases: count,
                    seed: args.seed,
                    dispersion: load_dispersion(args)?,
                    output_prefix: Some(output_base.to_string()),
                },
            )?;
        }
        print_json(&result);
        return Ok(ExitCode::SUCCESS);
    }
    run_text(args, &input, output_base)?;
    Ok(ExitCode::SUCCESS)
}

/// Human-readable run (the original CLI output)
fn run_text(args: &RunArgs, input: &ConfigInput, output_base: &str) -> Result<(), AgentError> {
    if args.verbose {
        println!("OpenTsiolkovsky Rust Flight Simulator");
        println!("Loading configuration from: {}", args.config);
    }

    // Load rocket configuration and data
    let loaded = input.load()?;
    for warning in loaded.warnings() {
        eprintln!("Warning: {}", warning);
    }
    let rocket = loaded.rocket;

    if args.verbose {
        println!("Configuration loaded: {}", rocket.config.name);
        println!("Launch position: {:?}", rocket.config.launch.position_llh);
        println!(
            "Initial mass: {:.1} kg",
            rocket.config.primary_stage().mass_initial
        );
        println!(
            "Simulation end time: {:.1} s",
            rocket.config.calculate_condition.end_time
        );
        println!();
    }

    // Create and run simulation
    let mut simulator = Simulator::new(rocket.clone())?;

    if args.verbose {
        println!("Running simulation...");
    }

    let trajectory = simulator.run();
    // Spent stages and dumping products, propagated to the ground
    let fall_bodies = simulator.simulate_fall_bodies();

    if args.verbose {
        println!("Simulation completed with {} data points", trajectory.len());

        // Print summary
        if let (Some(_first), Some(last)) = (trajectory.first(), trajectory.last()) {
            println!("\nSimulation Summary:");
            println!("  Duration: {:.1} s", last.time);
            println!("  Final altitude: {:.1} m", last.altitude);
            println!("  Final velocity: {:.1} m/s", last.velocity_magnitude);

            // Find max altitude
            if let Some(max_alt_state) =
                trajectory
                    .iter()
                    .filter(|s| !s.altitude.is_nan())
                    .max_by(|a, b| {
                        a.altitude
                            .partial_cmp(&b.altitude)
                            .unwrap_or(std::cmp::Ordering::Equal)
                    })
            {
                println!(
                    "  Max altitude: {:.1} m at {:.1} s",
                    max_alt_state.altitude, max_alt_state.time
                );
            }

            // Find max velocity
            if let Some(max_vel_state) = trajectory
                .iter()
                .filter(|s| !s.velocity_magnitude.is_nan())
                .max_by(|a, b| {
                    a.velocity_magnitude
                        .partial_cmp(&b.velocity_magnitude)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
            {
                println!(
                    "  Max velocity: {:.1} m/s at {:.1} s",
                    max_vel_state.velocity_magnitude, max_vel_state.time
                );
            }
        }
        println!("\nEvents:");
        for e in &simulator.events {
            println!(
                "  T+{:8.2} s  {:<10} stage {}  alt {:10.1} m  speed {:8.1} m/s  Mach {:5.2}  q {:9.1} Pa",
                e.time_s,
                serde_json::to_value(e.kind)
                    .ok()
                    .and_then(|v| v.as_str().map(str::to_string))
                    .unwrap_or_default(),
                e.stage,
                e.altitude_m,
                e.speed_mps,
                e.mach,
                e.dynamic_pressure_pa
            );
        }
        if let Some(orbit) = simulator
            .events
            .iter()
            .rev()
            .find_map(|e| (e.kind == EventKind::Burnout).then_some(e.orbit).flatten())
        {
            println!(
                "  Orbit at last burnout: perigee {:.1} km, apogee {} km, inclination {:.2} deg, e {:.4}",
                orbit.perigee_altitude_m / 1e3,
                orbit
                    .apogee_altitude_m
                    .map_or("-".to_string(), |a| format!("{:.1}", a / 1e3)),
                orbit.inclination_deg,
                orbit.eccentricity
            );
        }
        if simulator.forced_steps > 0 {
            println!(
                "  Warning: {} RK45 steps were accepted at the minimum step size above tolerance",
                simulator.forced_steps
            );
        }
        println!();
    }

    // Save output files
    agent::create_parent_dir(output_base)?;
    let trajectory_file = format!("{}_trajectory.csv", output_base);
    let summary_file = format!("{}_summary.json", output_base);
    let cpp_csv_file = format!("{}_dynamics_cpp.csv", output_base);

    save_trajectory_csv(&trajectory, &trajectory_file)?;
    save_summary_json(
        &trajectory,
        &fall_bodies,
        &simulator.events,
        &rocket.config,
        &summary_file,
    )?;
    // Write C++-compatible CSV
    save_cpp_telemetry_csv(&simulator.telemetry_cpp, &cpp_csv_file)?;
    let mut fall_files = Vec::new();
    for body in &fall_bodies {
        if body.telemetry_cpp.is_empty() {
            continue;
        }
        let suffix = match body.kind {
            FallBodyKind::Stage => "fall",
            FallBodyKind::Dump => "dump",
        };
        let path = format!("{}_dynamics_cpp_{}_{}.csv", output_base, body.stage, suffix);
        save_cpp_telemetry_csv(&body.telemetry_cpp, &path)?;
        fall_files.push(path);
    }

    // Impact points (as printed by the C++ simulator)
    let describe = |impact: Option<openTsiolkovsky::simulator::ImpactPoint>| match impact {
        Some(p) => format!(
            "{:.6}\t{:.6}\t(T+{:.1} s)",
            p.latitude_deg, p.longitude_deg, p.time_s
        ),
        None => "none (no ground impact)".to_string(),
    };
    println!(
        "vehicle impact point [deg]:\t{}",
        describe(impact_point(&trajectory))
    );
    for body in &fall_bodies {
        let what = match body.kind {
            FallBodyKind::Stage => "stage",
            FallBodyKind::Dump => "stage dumping product",
        };
        println!(
            "{} {} impact point [deg]:\t{}",
            body.stage,
            what,
            describe(body.impact)
        );
    }

    if let Some(count) = args.monte_carlo {
        let dispersion = load_dispersion(args)?;
        println!(
            "Running {} Monte Carlo cases (seed {})...",
            count, args.seed
        );
        let cases = run_cases(&rocket, &dispersion, args.seed, count);
        let mc_csv = format!("{}_montecarlo.csv", output_base);
        let mc_summary = format!("{}_montecarlo_summary.json", output_base);
        save_monte_carlo_csv(&cases, &mc_csv)?;
        save_monte_carlo_summary(&cases, &dispersion, args.seed, &mc_summary)?;
        for s in impact_statistics(&cases) {
            println!(
                "{}: {}/{} impacts, mean {:.6} {:.6} [deg], 99% ellipse {:.0} x {:.0} m (azimuth {:.0} deg)",
                s.body,
                s.impacts,
                s.cases,
                s.mean_latitude_deg,
                s.mean_longitude_deg,
                s.ellipse_99_major_m,
                s.ellipse_99_minor_m,
                s.ellipse_azimuth_deg
            );
        }
        println!("Monte Carlo results saved to: {} / {}", mc_csv, mc_summary);
    }

    if args.verbose {
        println!("Results saved to:");
        println!("  Trajectory: {}", trajectory_file);
        println!("  Summary: {}", summary_file);
        for path in &fall_files {
            println!("  Fall body: {}", path);
        }
    } else {
        println!("Simulation completed successfully");
        println!("Trajectory saved to: {}", trajectory_file);
        println!("Summary saved to: {}", summary_file);
    }

    Ok(())
}
