use clap::Parser;
use openTsiolkovsky_core::{
    simulator::{Simulator, SimError},
    io::{create_rocket_from_config, save_trajectory_csv, save_summary_json, IoError},
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
    
    if args.verbose {
        println!("Configuration loaded: {}", rocket.config.name);
        println!("Launch position: {:?}", rocket.config.launch.position_llh);
        println!("Initial mass: {:.1} kg", rocket.config.stage1.mass_initial);
        println!("Simulation end time: {:.1} s", rocket.config.calculate_condition.end_time);
        println!();
    }
    
    // Create and run simulation
    let mut simulator = Simulator::new(rocket.config.clone())?;
    
    if args.verbose {
        println!("Running simulation...");
    }
    
    let trajectory = simulator.run();
    
    if args.verbose {
        println!("Simulation completed with {} data points", trajectory.len());
        
        // Print summary
        if let (Some(_first), Some(last)) = (trajectory.first(), trajectory.last()) {
            println!("\nSimulation Summary:");
            println!("  Duration: {:.1} s", last.time);
            println!("  Final altitude: {:.1} m", last.altitude);
            println!("  Final velocity: {:.1} m/s", last.velocity_magnitude);
            
            // Find max altitude
            if let Some(max_alt_state) = trajectory.iter().max_by(|a, b| a.altitude.partial_cmp(&b.altitude).unwrap()) {
                println!("  Max altitude: {:.1} m at {:.1} s", max_alt_state.altitude, max_alt_state.time);
            }
            
            // Find max velocity
            if let Some(max_vel_state) = trajectory.iter().max_by(|a, b| a.velocity_magnitude.partial_cmp(&b.velocity_magnitude).unwrap()) {
                println!("  Max velocity: {:.1} m/s at {:.1} s", max_vel_state.velocity_magnitude, max_vel_state.time);
            }
        }
        println!();
    }
    
    // Save output files
    let output_base = args.output.as_deref().unwrap_or("output");
    let trajectory_file = format!("{}_trajectory.csv", output_base);
    let summary_file = format!("{}_summary.json", output_base);
    
    save_trajectory_csv(&trajectory, &trajectory_file)?;
    save_summary_json(&trajectory, &rocket.config, &summary_file)?;
    
    if args.verbose {
        println!("Results saved to:");
        println!("  Trajectory: {}", trajectory_file);
        println!("  Summary: {}", summary_file);
    } else {
        println!("Simulation completed successfully");
        println!("Trajectory saved to: {}", trajectory_file);
        println!("Summary saved to: {}", summary_file);
    }
    
    Ok(())
}