use core::{io::create_rocket_from_config, simulator::Simulator};
use openTsiolkovsky_core as core;

#[test]
fn run_sample_param_trajectory() {
    // Use sample JSON from repo bin/
    let param_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../bin/param_sample_01.json");
    assert!(
        param_path.exists(),
        "sample param file not found: {:?}",
        param_path
    );

    let rocket = create_rocket_from_config(&param_path).expect("load config");
    let end_time = rocket.config.calculate_condition.end_time;
    let mut sim = Simulator::new(rocket).expect("create simulator");
    let traj = sim.run();

    assert!(!traj.is_empty(), "trajectory should not be empty");
    let last = traj.last().unwrap();
    assert!(
        last.time <= end_time + 1.0,
        "last time within end time tolerance"
    );
}
