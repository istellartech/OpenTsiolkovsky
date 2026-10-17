#![allow(non_snake_case)]
use clap::Parser;
use openTsiolkovsky::{
    io::{
        IoError, config_warnings, create_rocket_from_config, load_dispersion, rocket_warnings,
        save_monte_carlo_csv, save_monte_carlo_summary, save_summary_json, save_trajectory_csv,
    },
    montecarlo::{Dispersion, impact_statistics, run_cases},
    simulator::{EventKind, FallBodyKind, SimError, Simulator, impact_point},
};

#[derive(Parser)]
#[command(name = "openTsiolkovsky")]
#[command(about = "OpenTsiolkovsky Rocket Flight Simulator")]
struct Args {
    #[arg(short, long, default_value = "param_sample_01.json")]
    config: String,

    #[arg(short, long)]
    output: Option<String>,

    #[arg(short, long)]
    verbose: bool,

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

#[derive(Debug, thiserror::Error)]
pub enum CliError {
    #[error("IO error: {0}")]
    Io(#[from] IoError),

    #[error("Simulation error: {0}")]
    Simulation(#[from] SimError),
}

pub type Result<T> = std::result::Result<T, CliError>;

fn main() -> Result<()> {
    let args = Args::parse();

    if args.verbose {
        println!("OpenTsiolkovsky Rust Flight Simulator");
        println!("Loading configuration from: {}", args.config);
    }

    // Load rocket configuration and data
    let rocket = create_rocket_from_config(&args.config)?;

    for warning in config_warnings(&rocket.config)
        .into_iter()
        .chain(rocket_warnings(&rocket))
    {
        eprintln!("Warning: {}", warning);
    }

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
    let output_base = args.output.as_deref().unwrap_or("output");
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
    save_cpp_telemetry(&simulator.telemetry_cpp, &cpp_csv_file)?;
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
        save_cpp_telemetry(&body.telemetry_cpp, &path)?;
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
        let dispersion = match &args.dispersion {
            Some(path) => load_dispersion(path)?,
            None => Dispersion::default(),
        };
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
                "{}: {}/{} impacts, mean {:.6} {:.6} [deg], 3-sigma ellipse {:.0} x {:.0} m (azimuth {:.0} deg)",
                s.body,
                s.impacts,
                s.cases,
                s.mean_latitude_deg,
                s.mean_longitude_deg,
                3.0 * s.ellipse_major_m,
                3.0 * s.ellipse_minor_m,
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

use csv::Writer;
/// Write C++-compatible CSV using telemetry captured by simulator
fn save_cpp_telemetry(
    rows: &[openTsiolkovsky::simulator::CsvCppRow],
    path: &str,
) -> std::result::Result<(), IoError> {
    let mut w = Writer::from_path(path)?;
    w.write_record([
        "time(s)",
        "mass(kg)",
        "thrust(N)",
        "lat(deg)",
        "lon(deg)",
        "altitude(m)",
        "pos_ECI_X(m)",
        "pos_ECI_Y(m)",
        "pos_ECI_Z(m)",
        "vel_ECI_X(m/s)",
        "vel_ECI_Y(m/s)",
        "vel_ECI_Z(m/s)",
        "vel_NED_X(m/s)",
        "vel_NED_Y(m/s)",
        "vel_NED_Z(m/s)",
        "acc_ECI_X(m/s2)",
        "acc_ECI_Y(m/s2)",
        "acc_ECI_Z(m/s2)",
        "acc_Body_X(m/s2)",
        "acc_Body_Y(m/s2)",
        "acc_Body_Z(m/s2)",
        "Isp(s)",
        "Mach number",
        "attitude_azimuth(deg)",
        "attitude_elevation(deg)",
        "attitude_roll(deg)",
        "angle of attack alpha(deg)",
        "angle of attack beta(deg)",
        "all angle of attack gamma(deg)",
        "dynamic pressure(Pa)",
        "aeroforce_Body_X[N]",
        "aeroforce_Body_Y[N]",
        "aeroforce_Body_Z[N]",
        "thrust_Body_X[N]",
        "thrust_Body_Y[N]",
        "thrust_Body_Z[N]",
        "gimbal_angle_pitch(deg)",
        "gimbal_angle_yaw(deg)",
        "wind speed(m/s)",
        "wind direction(deg)",
        "downrange(m)",
        "IIP_lat(deg)",
        "IIP_lon(deg)",
        "dcmBODY2ECI_11",
        "dcmBODY2ECI_12",
        "dcmBODY2ECI_13",
        "dcmBODY2ECI_21",
        "dcmBODY2ECI_22",
        "dcmBODY2ECI_23",
        "dcmBODY2ECI_31",
        "dcmBODY2ECI_32",
        "dcmBODY2ECI_33",
        "inertial velocity(m/s)",
        "kinematic_energy_NED(J)",
        "loss_gravity(m/s2)",
        "loss_aerodynamics(m/s2)",
        "loss_thrust(m/s2)",
        "is_powered(1=powered 0=free)",
        "is_separated(1=already 0=still)",
    ])?;
    for r in rows {
        w.write_record([
            r.time.to_string(),
            r.mass.to_string(),
            r.thrust.to_string(),
            r.lat_deg.to_string(),
            r.lon_deg.to_string(),
            r.alt_m.to_string(),
            r.pos_eci.x.to_string(),
            r.pos_eci.y.to_string(),
            r.pos_eci.z.to_string(),
            r.vel_eci.x.to_string(),
            r.vel_eci.y.to_string(),
            r.vel_eci.z.to_string(),
            r.vel_ned.x.to_string(),
            r.vel_ned.y.to_string(),
            r.vel_ned.z.to_string(),
            r.acc_eci.x.to_string(),
            r.acc_eci.y.to_string(),
            r.acc_eci.z.to_string(),
            r.acc_body.x.to_string(),
            r.acc_body.y.to_string(),
            r.acc_body.z.to_string(),
            r.isp_s.to_string(),
            r.mach.to_string(),
            r.att_az_deg.to_string(),
            r.att_el_deg.to_string(),
            r.att_roll_deg.to_string(),
            r.aoa_alpha_deg.to_string(),
            r.aoa_beta_deg.to_string(),
            r.aoa_gamma_deg.to_string(),
            r.q_pa.to_string(),
            r.aero_body.x.to_string(),
            r.aero_body.y.to_string(),
            r.aero_body.z.to_string(),
            r.thrust_body.x.to_string(),
            r.thrust_body.y.to_string(),
            r.thrust_body.z.to_string(),
            r.gimbal_pitch_deg.to_string(),
            r.gimbal_yaw_deg.to_string(),
            r.wind_speed.to_string(),
            r.wind_dir_deg.to_string(),
            r.downrange.to_string(),
            r.iip_lat_deg.to_string(),
            r.iip_lon_deg.to_string(),
            r.dcm_body_to_eci[(0, 0)].to_string(),
            r.dcm_body_to_eci[(0, 1)].to_string(),
            r.dcm_body_to_eci[(0, 2)].to_string(),
            r.dcm_body_to_eci[(1, 0)].to_string(),
            r.dcm_body_to_eci[(1, 1)].to_string(),
            r.dcm_body_to_eci[(1, 2)].to_string(),
            r.dcm_body_to_eci[(2, 0)].to_string(),
            r.dcm_body_to_eci[(2, 1)].to_string(),
            r.dcm_body_to_eci[(2, 2)].to_string(),
            r.inertial_speed.to_string(),
            r.kinetic_energy_ned.to_string(),
            r.loss_gravity.to_string(),
            r.loss_aero.to_string(),
            r.loss_thrust.to_string(),
            r.is_powered.to_string(),
            r.is_separated.to_string(),
        ])?;
    }
    w.flush()?;
    Ok(())
}
