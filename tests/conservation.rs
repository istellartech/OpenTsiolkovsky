//! Physical invariants of unpowered flight above the atmosphere.
//!
//! With J2 gravity (axisymmetric) and no thrust or drag, the specific
//! energy including the J2 potential and the polar component of the
//! angular momentum are conserved in the inertial frame.

use openTsiolkovsky::config::{Config, NoFiles};
use openTsiolkovsky::math::constants::{MU_EARTH, WGS84_A};
use openTsiolkovsky::physics::gravity::GravityModel;
use openTsiolkovsky::{Sample, Vehicle, simulate};

fn coast(integrator: &str) -> Vec<Sample> {
    let json = format!(
        r#"{{
        "name": "coast",
        "simulation": {{ "end_time_s": 6000, "output_step_s": 10, "integrator": {integrator} }},
        "launch": {{
            "latitude_deg": 30.0, "longitude_deg": 130.0, "altitude_m": 1500000,
            "velocity_ned_mps": [3000, 6000, 0]
        }},
        "stages": [{{ "mass_initial_kg": 100, "aero": {{ "ballistic_coefficient_kg_m2": 1e9 }} }}]
    }}"#
    );
    let config = Config::from_json(&json).unwrap();
    let (vehicle, _) = Vehicle::load(&config, &NoFiles).unwrap();
    simulate(&vehicle).trajectory
}

fn energy(s: &Sample) -> f64 {
    let j2 = -5f64.sqrt() * GravityModel::new().bar_c20;
    let [x, y, z] = s.pos_eci();
    let r = (x * x + y * y + z * z).sqrt();
    let sin_lat = z / r;
    let potential =
        -MU_EARTH / r * (1.0 - j2 * (WGS84_A / r).powi(2) * 0.5 * (3.0 * sin_lat * sin_lat - 1.0));
    0.5 * s.speed_inertial_mps.powi(2) + potential
}

fn h_z(s: &Sample) -> f64 {
    let ([x, y, _], [vx, vy, _]) = (s.pos_eci(), s.vel_eci());
    x * vy - y * vx
}

#[test]
fn energy_and_polar_angular_momentum_are_conserved() {
    for integrator in [r#"{"method": "rk4", "step_s": 1}"#, r#"{"method": "rk45"}"#] {
        let trajectory = coast(integrator);
        assert!(trajectory.len() > 100);
        // Stays far above the atmosphere
        assert!(trajectory.iter().all(|s| s.altitude_m > 1.0e6));
        let first = &trajectory[0];
        let (e0, hz0) = (energy(first), h_z(first));
        for s in &trajectory {
            let de = (energy(s) - e0).abs() / e0.abs();
            let dh = (h_z(s) - hz0).abs() / hz0.abs();
            assert!(
                de < 1e-9,
                "{integrator}: energy drift {de:e} at t = {}",
                s.time_s
            );
            assert!(
                dh < 1e-9,
                "{integrator}: h_z drift {dh:e} at t = {}",
                s.time_s
            );
        }
    }
}
