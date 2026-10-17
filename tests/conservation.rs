//! Physical invariants of unpowered flight above the atmosphere.
//!
//! With J2 gravity (axisymmetric) and no thrust or drag, the specific
//! energy including the J2 potential and the polar component of the
//! angular momentum are conserved in the inertial frame.

use openTsiolkovsky::math::constants::{MU_EARTH, WGS84_A};
use openTsiolkovsky::physics::gravity::GravityModel;
use openTsiolkovsky::rocket::{ClientConfig, IntegratorMethod};
use openTsiolkovsky::simulator::{SimulationState, Simulator};

fn coast(method: IntegratorMethod) -> Vec<SimulationState> {
    let json = r#"{
        "name": "coast",
        "simulation": { "duration_s": 6000, "output_step_s": 10 },
        "launch": {
            "latitude_deg": 30.0, "longitude_deg": 130.0, "altitude_m": 1500000,
            "velocity_ned_mps": [3000, 6000, 0],
            "datetime_utc": { "year": 2020, "month": 1, "day": 1, "hour": 0, "minute": 0, "second": 0 }
        },
        "stages": [{ "mass_initial_kg": 100, "thrust_constant": 0, "burn_end_s": 0, "forced_cutoff_s": 0 }],
        "aerodynamics": { "ca_constant": 0.0, "ballistic_coefficient": 1e9 }
    }"#;
    let mut config: ClientConfig = serde_json::from_str(json).unwrap();
    config.simulation.integrator.method = method;
    config.simulation.integrator.rk4_step_s = Some(1.0);
    Simulator::new(config.into_rocket()).unwrap().run()
}

fn energy(s: &SimulationState) -> f64 {
    let j2 = -5f64.sqrt() * GravityModel::new().bar_c20;
    let r = s.position.magnitude();
    let sin_lat = s.position.z / r;
    let potential =
        -MU_EARTH / r * (1.0 - j2 * (WGS84_A / r).powi(2) * 0.5 * (3.0 * sin_lat * sin_lat - 1.0));
    0.5 * s.velocity.magnitude_squared() + potential
}

#[test]
fn energy_and_polar_angular_momentum_are_conserved() {
    for method in [IntegratorMethod::Rk4, IntegratorMethod::Rk45] {
        let trajectory = coast(method);
        assert!(trajectory.len() > 100);
        // Stays far above the atmosphere
        assert!(trajectory.iter().all(|s| s.altitude > 1.0e6));
        let first = &trajectory[0];
        let (e0, hz0) = (energy(first), first.position.cross(&first.velocity).z);
        for s in &trajectory {
            let de = (energy(s) - e0).abs() / e0.abs();
            let dh = (s.position.cross(&s.velocity).z - hz0).abs() / hz0.abs();
            assert!(
                de < 1e-9,
                "{method:?}: energy drift {de:e} at t = {}",
                s.time
            );
            assert!(dh < 1e-9, "{method:?}: h_z drift {dh:e} at t = {}", s.time);
        }
    }
}
