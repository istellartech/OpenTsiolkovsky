use super::*;
use crate::math::constants::G0;
use crate::vehicle::test_vehicle;
use serde_json::{Value, json};

/// Single stage at rest at 35 N 139 E, attitude 83 deg / 113 deg, no engine
fn base() -> Value {
    json!({
        "name": "test",
        "simulation": { "end_time_s": 10 },
        "launch": { "latitude_deg": 35.0, "longitude_deg": 139.0, "time_utc": "2023-01-01T12:00:00Z" },
        "attitude": { "azimuth_deg": 113, "elevation_deg": 83 },
        "stages": [{
            "mass_initial_kg": 1000,
            "aero": { "diameter_m": 0.5, "ca": 0.2, "cn_alpha_per_rad": 0.2 }
        }]
    })
}

const EXIT_AREA: f64 = std::f64::consts::PI * 0.1 * 0.1 / 4.0 * 5.0;

/// Short powered ascent (50 kN for 5 s), then free flight
fn coast(free_flight: &str) -> Value {
    let mut v = base();
    v["simulation"]["end_time_s"] = json!(60);
    v["stages"][0]["free_flight"] = json!(free_flight);
    v["stages"][0]["engine"] = json!({
        "thrust_vac_n": 50000, "isp_vac_s": 200, "burn_end_s": 5, "nozzle_exit_area_m2": EXIT_AREA
    });
    v["stages"][0]["aero"]["ca"] = json!(0.5);
    v["stages"][0]["aero"]["ballistic_coefficient_kg_m2"] = json!(1e6); // practically no drag
    v
}

/// Two-stage sounding rocket: stage 1 separates at 6 s
fn two_stage() -> Value {
    let mut v = coast("ballistic");
    v["simulation"]["end_time_s"] = json!(600);
    let s1 = &mut v["stages"][0];
    s1["engine"]["thrust_vac_n"] = json!(60000);
    s1["aero"]["ballistic_coefficient_kg_m2"] = json!(300);
    s1["separation_time_s"] = json!(6);
    let mut s2 = s1.clone();
    s2.as_object_mut().unwrap().remove("separation_time_s");
    s2["mass_initial_kg"] = json!(300);
    s2["engine"]["thrust_vac_n"] = json!(15000);
    s2["engine"]["burn_start_s"] = json!(1);
    s2["engine"]["burn_end_s"] = json!(10);
    v["stages"].as_array_mut().unwrap().push(s2);
    v
}

fn vehicle(v: &Value) -> Vehicle {
    test_vehicle(&v.to_string())
}

fn fly(v: &Value) -> Flight {
    simulate(&vehicle(v))
}

fn event(flight: &Flight, kind: EventKind) -> &FlightEvent {
    flight
        .events
        .iter()
        .find(|e| e.kind == kind)
        .expect("event")
}

fn max_altitude(t: &[Sample]) -> f64 {
    t.iter().map(|s| s.altitude_m).fold(0.0, f64::max)
}

#[test]
fn stage_transition() {
    let mut v = base();
    v["simulation"]["end_time_s"] = json!(3);
    v["stages"][0]["engine"] = json!({ "thrust_vac_n": 100000, "isp_vac_s": 200, "burn_end_s": 1 });
    v["stages"][0]["separation_time_s"] = json!(1.5);
    v["stages"]
        .as_array_mut()
        .unwrap()
        .push(json!({ "mass_initial_kg": 200 }));
    let flight = fly(&v);
    assert!(flight.trajectory.iter().any(|s| s.stage == 2));
    assert_eq!(flight.trajectory.last().unwrap().stage, 2);
}

#[test]
fn ground_impact_is_located() {
    for integrator in [json!({ "method": "rk4" }), json!({ "method": "rk45" })] {
        let mut v = coast("ballistic");
        v["simulation"]["end_time_s"] = json!(200);
        v["simulation"]["integrator"] = integrator;
        let t = fly(&v).trajectory;
        let last = t.last().unwrap();
        assert!(
            last.altitude_m.abs() < 1e-2,
            "impact altitude {}",
            last.altitude_m
        );
        assert!(t.iter().all(|s| s.altitude_m > -1.0));
        assert!(t.windows(2).all(|w| w[1].time_s > w[0].time_s));
        // Not on the output grid: located between two samples
        let prev = &t[t.len() - 2];
        assert!(last.time_s > prev.time_s && last.time_s < prev.time_s + 1.0);
    }
}

#[test]
fn fixed_attitude_reentry_decelerates() {
    // Unpowered re-entry with the body pointing against the flight
    // direction (AoA ≈ 180°): aerodynamics must slow the vehicle down.
    let mut v = base();
    v["simulation"]["end_time_s"] = json!(2000);
    v["launch"]["altitude_m"] = json!(100000);
    v["launch"]["velocity_ned_mps"] = json!([7000, 0, 300]);
    v["attitude"] = json!({ "azimuth_deg": 180, "elevation_deg": 0 });
    v["stages"][0]["free_flight"] = json!("attitude_program");
    v["stages"][0]["aero"]["diameter_m"] = json!(2.0);
    let t = fly(&v).trajectory;
    let max_q = t.iter().map(|s| s.dynamic_pressure_pa).fold(0.0, f64::max);
    assert!(max_q > 50_000.0, "re-entry too gentle: max q {max_q}");
    // While drag clearly dominates gravity, speed must not increase.
    for pair in t.windows(2) {
        if pair[0].dynamic_pressure_pa > 50_000.0 && pair[1].dynamic_pressure_pa > 50_000.0 {
            assert!(
                pair[1].speed_inertial_mps <= pair[0].speed_inertial_mps,
                "speed rose at t = {} s",
                pair[1].time_s
            );
        }
    }
    let last = t.last().unwrap();
    assert!(last.altitude_m <= 0.1, "did not reach the ground");
    assert!(
        last.speed_inertial_mps < 2000.0,
        "impact speed {}",
        last.speed_inertial_mps
    );
}

#[test]
fn axial_force_continuous_through_broadside_flow() {
    let sim = Simulator::new(vehicle(&base()));
    let ca = 0.2;
    let axial = |u: f64, w: f64| {
        sim.aero_force_body(0, 1.0, true, &Vector3::new(u, 0.0, w), 1.0)
            .x
    };
    // Flow along the axis: exactly CA * q * S
    assert_eq!(axial(100.0, 0.0), -ca);
    assert_eq!(axial(-100.0, 0.0), ca);
    // Crossing broadside (u: +0.01 -> -0.01 m/s) does not jump by 2 CA
    let jump = (axial(0.01, 100.0) - axial(-0.01, 100.0)).abs();
    assert!(jump < 0.02 * ca, "jump {jump}");
    // 60 deg angle of attack: within 0.1 %
    let f = axial(50.0, 50.0 * 3f64.sqrt());
    assert!((f + ca).abs() < 1e-3 * ca, "{f}");
}

#[test]
fn flight_mode_reported() {
    let t = fly(&coast("aero_stable")).trajectory;
    assert_eq!(t[1].flight_mode, FlightMode::Powered);
    assert_eq!(t.last().unwrap().flight_mode, FlightMode::AeroStable);
    let t = fly(&coast("ballistic")).trajectory;
    assert_eq!(t.last().unwrap().flight_mode, FlightMode::Ballistic);
    let json = serde_json::to_string(&t[1]).unwrap();
    assert!(json.contains("\"flight_mode\":\"powered\""));
}

#[test]
fn aero_stable_free_flight_has_drag() {
    // Aero-stable flight has CA drag along the airflow; the near-zero-drag
    // ballistic case must fly higher.
    let aero_stable = max_altitude(&fly(&coast("aero_stable")).trajectory);
    let ballistic = max_altitude(&fly(&coast("ballistic")).trajectory);
    assert!(aero_stable < ballistic, "{aero_stable} m vs {ballistic} m");
}

#[test]
fn thrust_stops_at_burn_end() {
    let t = fly(&coast("ballistic")).trajectory;
    for s in t.iter().filter(|s| s.time_s >= 5.0) {
        assert_eq!(
            s.thrust_n, 0.0,
            "thrust {} N at t = {} s",
            s.thrust_n, s.time_s
        );
    }
}

#[test]
fn seasonal_density_variation_changes_drag() {
    let apogee = |percent: f64| {
        let mut v = coast("aero_stable");
        v["atmosphere"] = json!({ "seasonal_variation_percent": percent });
        max_altitude(&fly(&v).trajectory)
    };
    // The variation follows the U.S. Standard Atmosphere profile (its sign
    // flips with altitude), so only check that it takes effect.
    let nominal = apogee(0.0);
    for percent in [-50.0, 50.0] {
        let varied = apogee(percent);
        assert!(
            (varied - nominal).abs() > 1.0,
            "{percent}%: {varied} vs {nominal} m"
        );
    }
}

#[test]
fn iip_in_samples() {
    let t = fly(&coast("ballistic")).trajectory;
    let s = &t[t.len() / 2];
    let (lat, lon) = (s.iip_latitude_deg.unwrap(), s.iip_longitude_deg.unwrap());
    // Short hop near the launch site
    assert!((lat - 35.0).abs() < 1.0 && (lon - 139.0).abs() < 1.0);
}

#[test]
fn separation_coinciding_with_burnout_up_to_rounding() {
    // Burnout a few ulps before the separation must not push the
    // separation to the next output sample.
    let mut v = two_stage();
    v["stages"][0]["separation_time_s"] = json!(6.25); // between output samples
    v["stages"][0]["engine"]["burn_end_s"] = json!(6.25 - 4.0e-15);
    let flight = fly(&v);
    assert_eq!(flight.bodies.len(), 1);
    assert!((flight.bodies[0].release_time_s - 6.25).abs() < 1e-9);
}

#[test]
fn single_burnout_when_propellant_runs_out_at_burn_end() {
    // Propellant for the burn to 10 s less a hair: depletion is found
    // just before the scheduled end, which must not add a second burnout.
    let mut v = two_stage();
    let flow = 15_000.0 / (200.0 * G0);
    v["stages"][1]["mass_dry_kg"] = json!(300.0 - flow * 9.0 * (1.0 - 1.0e-12));
    let flight = fly(&v);
    let burnouts: Vec<_> = flight
        .events
        .iter()
        .filter(|e| e.kind == EventKind::Burnout && e.stage == 2)
        .collect();
    assert_eq!(burnouts.len(), 1);
    assert!((burnouts[0].time_s - 16.0).abs() < 1e-6);
}

#[test]
fn spent_stage_falls_to_ground() {
    let flight = fly(&two_stage());
    assert_eq!(flight.bodies.len(), 1);
    let body = &flight.bodies[0];
    assert_eq!(body.kind, BodyKind::Stage);
    assert_eq!(body.id, "stage1");
    assert_eq!(body.stage, 1);
    assert!((body.release_time_s - 6.0).abs() < 1e-9);

    // Stage 1 keeps its initial mass minus the propellant burned in 5 s
    let burned = 60_000.0 / (200.0 * G0) * 5.0;
    assert!(
        (body.mass_kg - (1000.0 - burned)).abs() < 1e-6,
        "{}",
        body.mass_kg
    );

    // Release state matches the vehicle at separation
    let first = &body.trajectory[0];
    assert!((first.time_s - 6.0).abs() < 1e-9);
    assert!(body.trajectory.iter().all(|s| s.stage == 1));
    let at_separation = flight
        .trajectory
        .iter()
        .find(|s| (s.time_s - 6.0).abs() < 1e-9)
        .expect("output sample at separation");
    assert!((first.altitude_m - at_separation.altitude_m).abs() < 1e-6);

    let impact = body.impact.expect("spent stage impacts");
    assert!(impact.time_s > 6.0);
    assert!((impact.latitude_deg - 35.0).abs() < 1.0);
    assert!((impact.longitude_deg - 139.0).abs() < 1.0);
    assert!(body.trajectory.last().unwrap().altitude_m <= 1.0);
}

#[test]
fn spent_stage_mass_exact_with_rk45() {
    let mut v = two_stage();
    v["simulation"]["integrator"] = json!({ "method": "rk45" });
    let flight = fly(&v);
    let burned = 60_000.0 / (200.0 * G0) * 5.0;
    assert!((flight.bodies[0].mass_kg - (1000.0 - burned)).abs() < 1e-6);
    assert!(flight.bodies[0].impact.is_some());
}

#[test]
fn jettison_reduces_mass_and_falls() {
    let mut v = two_stage();
    v["stages"][1]["jettisons"] = json!([{
        "name": "fairing", "time_s": 15, "mass_kg": 20,
        "ballistic_coefficient_kg_m2": 50, "delta_v_ned_mps": [0, 5, 0]
    }]);
    let mass_at = |t: &[Sample], time: f64| {
        t.iter()
            .find(|s| (s.time_s - time).abs() < 1e-6)
            .map(|s| s.mass_kg)
            .unwrap()
    };
    let base = fly(&two_stage()).trajectory;
    let flight = fly(&v);
    let t = &flight.trajectory;
    assert!((mass_at(t, 20.0) - mass_at(&base, 20.0)).abs() < 1e-9);
    assert!((mass_at(&base, 22.0) - mass_at(t, 22.0) - 20.0).abs() < 1e-9);

    let body = flight
        .bodies
        .iter()
        .find(|b| b.kind == BodyKind::Jettison)
        .expect("jettisoned body");
    assert_eq!(body.id, "stage2_fairing");
    assert_eq!(body.stage, 2);
    assert!((body.release_time_s - 21.0).abs() < 1e-9); // 6 s + 15 s
    assert_eq!(body.mass_kg, 20.0);
    assert!(
        body.trajectory
            .iter()
            .skip(1)
            .all(|s| s.flight_mode == FlightMode::Ballistic)
    );
    // Released with +5 m/s east relative to the vehicle
    let at_release = t.iter().find(|s| (s.time_s - 21.0).abs() < 1e-9).unwrap();
    let b0 = &body.trajectory[0];
    assert!((b0.vel_north_mps - at_release.vel_north_mps).abs() < 1e-6);
    assert!((b0.vel_east_mps - at_release.vel_east_mps - 5.0).abs() < 1e-6);
    assert!(body.impact.is_some());
    let e = event(&flight, EventKind::Jettison);
    assert_eq!(e.body.as_deref(), Some("fairing"));
}

#[test]
fn orbital_release_has_no_impact() {
    let mut v = base();
    v["simulation"]["end_time_s"] = json!(5);
    // Circular-ish orbit at 400 km: velocity well above the IIP limit
    v["launch"] = json!({ "latitude_deg": 0, "longitude_deg": 0, "altitude_m": 400000,
                          "velocity_ned_mps": [0, 7200, 0] });
    v["stages"][0]["separation_time_s"] = json!(2);
    v["stages"]
        .as_array_mut()
        .unwrap()
        .push(json!({ "mass_initial_kg": 100 }));
    let flight = fly(&v);
    assert_eq!(flight.bodies.len(), 1);
    assert!(flight.bodies[0].impact.is_none());
    assert!(flight.bodies[0].trajectory.is_empty());
}

#[test]
fn output_times_on_exact_grid() {
    let mut v = coast("ballistic");
    v["simulation"] = json!({ "end_time_s": 10, "output_step_s": 0.1 });
    for (k, s) in fly(&v).trajectory.iter().enumerate() {
        assert_eq!(s.time_s, k as f64 * 0.1, "sample {k}");
    }
}

#[test]
fn events_in_order_and_located() {
    let mut v = coast("ballistic");
    v["simulation"]["end_time_s"] = json!(200);
    let flight = fly(&v);
    let t = &flight.trajectory;
    let kinds: Vec<EventKind> = flight.events.iter().map(|e| e.kind).collect();
    let without_max_q: Vec<EventKind> = kinds
        .iter()
        .copied()
        .filter(|&k| k != EventKind::MaxQ)
        .collect();
    assert_eq!(
        without_max_q,
        [
            EventKind::Ignition,
            EventKind::Liftoff,
            EventKind::Burnout,
            EventKind::Apogee,
            EventKind::Impact
        ]
    );
    assert_eq!(kinds.iter().filter(|&&k| k == EventKind::MaxQ).count(), 1);
    assert!(flight.events.windows(2).all(|w| w[0].time_s <= w[1].time_s));
    assert!((event(&flight, EventKind::Burnout).time_s - 5.0).abs() < 1e-9);
    assert!(event(&flight, EventKind::Burnout).orbit.is_some());

    let apogee = event(&flight, EventKind::Apogee);
    assert!(apogee.altitude_m >= max_altitude(t) - 1e-6);
    let max_q = event(&flight, EventKind::MaxQ);
    let sampled = t.iter().map(|s| s.dynamic_pressure_pa).fold(0.0, f64::max);
    assert!(max_q.dynamic_pressure_pa >= sampled * (1.0 - 1e-6));
    assert_eq!(
        flight.events.last().unwrap().time_s,
        t.last().unwrap().time_s
    );
}

#[test]
fn supersonic_flight_records_mach1() {
    let mut v = coast("ballistic");
    v["stages"][0]["engine"]["thrust_vac_n"] = json!(200000);
    let flight = fly(&v);
    let mach1 = event(&flight, EventKind::Mach1);
    assert!((mach1.mach - 1.0).abs() < 1e-3, "mach {}", mach1.mach);
}

#[test]
fn ballistic_drag_in_the_samples_matches_the_dynamics() {
    let mut v = coast("ballistic");
    v["stages"][0]["aero"]["ballistic_coefficient_kg_m2"] = json!(50);
    for s in fly(&v).trajectory.iter().skip(1) {
        if s.flight_mode == FlightMode::Ballistic && s.dynamic_pressure_pa > 1.0 {
            let drag = s.dynamic_pressure_pa / 50.0 * s.mass_kg;
            assert!((s.aero_body_x_n + drag).abs() < 1e-6 * drag);
            assert!((s.loss_aero_mps2 * s.mass_kg - drag).abs() < 1e-6 * drag);
            assert_eq!(s.aero_body_y_n, 0.0);
            assert_eq!(s.aero_body_z_n, 0.0);
        }
    }
}

#[test]
fn burn_ends_when_propellant_runs_out() {
    // 50 kN at Isp 200 s burns 25.5 kg/s; 60 kg of propellant lasts 2.35 s
    let mut v = coast("ballistic");
    v["stages"][0]["mass_dry_kg"] = json!(940);
    let flight = fly(&v);
    let t_out = 60.0 / (50_000.0 / (200.0 * G0));
    let burnout = event(&flight, EventKind::Burnout);
    assert!(
        (burnout.time_s - t_out).abs() < 1e-6,
        "burnout {}",
        burnout.time_s
    );
    assert!((burnout.mass_kg - 940.0).abs() < 1e-6);
    for s in flight.trajectory.iter().filter(|s| s.time_s > t_out) {
        assert_eq!(s.thrust_n, 0.0);
        assert!((s.mass_kg - 940.0).abs() < 1e-6, "mass {}", s.mass_kg);
    }
}

#[test]
fn mass_never_negative_without_dry_mass() {
    // A burn far longer than the first stage's mass allows: it cannot eat
    // into the upper stage
    let mut v = two_stage();
    v["stages"][0]["engine"]["burn_end_s"] = json!(100);
    let t = fly(&v).trajectory;
    assert!(
        t.iter()
            .filter(|s| s.stage == 1)
            .all(|s| s.mass_kg >= 300.0 - 1e-6)
    );
    assert!(t.iter().all(|s| s.altitude_m.is_finite()));
}

#[test]
fn held_on_pad_until_thrust_exceeds_weight() {
    // Thrust 5 kN for a 1000 kg vehicle: never lifts off
    let mut v = coast("ballistic");
    v["stages"][0]["engine"]["thrust_vac_n"] = json!(5000);
    v["simulation"]["end_time_s"] = json!(10);
    let flight = fly(&v);
    let t = &flight.trajectory;
    assert_eq!(t.last().unwrap().time_s, 10.0);
    for s in t {
        assert!(
            s.altitude_m.abs() < 1e-6,
            "altitude {} at {}",
            s.altitude_m,
            s.time_s
        );
        assert!(s.speed_earth_mps < 1e-6);
    }
    // Propellant still burns on the pad
    assert!(t.last().unwrap().mass_kg < 1000.0);
    assert!(flight.events.iter().all(|e| e.kind != EventKind::Liftoff));
}

#[test]
fn liftoff_when_thrust_ramps_up() {
    // Thrust rises linearly from 0 to 20 kN over 2 s: lifts off when the
    // thrust (less the exit pressure loss) exceeds the weight
    let mut v = coast("ballistic");
    v["simulation"]["end_time_s"] = json!(10);
    v["stages"][0]["engine"]["thrust_vac_n"] = json!([[0, 0], [2, 20000]]);
    let flight = fly(&v);
    let liftoff = event(&flight, EventKind::Liftoff);
    let thrust = |t: f64| 10_000.0 * t - EXIT_AREA * 101_325.0;
    // Along a rail at 83 deg elevation the weight component is W sin(83)
    let needed = liftoff.mass_kg * 9.80 * 83f64.to_radians().sin();
    assert!(
        (thrust(liftoff.time_s) - needed).abs() < 0.01 * needed,
        "liftoff at {} s",
        liftoff.time_s
    );
}

#[test]
fn rail_guides_the_vehicle() {
    let mut v = coast("ballistic");
    v["launch"]["rail_length_m"] = json!(10);
    // Crosswind: off the rail the vehicle would drift sideways
    v["wind"] = json!({ "speed_mps": 10, "direction_deg": 23 });
    v["simulation"]["output_step_s"] = json!(0.05);
    let flight = fly(&v);
    let kinds: Vec<EventKind> = flight.events.iter().map(|e| e.kind).collect();
    assert_eq!(
        &kinds[..3],
        [EventKind::Ignition, EventKind::Liftoff, EventKind::RailExit]
    );
    let exit = &flight.events[2];
    // On the rail the vehicle climbs at the rail elevation (83 deg)
    assert!((exit.altitude_m - 10.0 * 83f64.to_radians().sin()).abs() < 1e-3);
    for s in flight
        .trajectory
        .iter()
        .filter(|s| s.time_s < exit.time_s && s.time_s > 0.0)
    {
        let (n, e, d) = (s.vel_north_mps, s.vel_east_mps, s.vel_down_mps);
        let elevation = (-d).atan2(n.hypot(e)).to_degrees();
        let azimuth = e.atan2(n).to_degrees();
        assert!((elevation - 83.0).abs() < 1e-3, "elevation {elevation}");
        assert!((azimuth - 113.0).abs() < 1e-3, "azimuth {azimuth}");
    }
    // Exit speed from the along-rail acceleration
    let accel = (50_000.0 - EXIT_AREA * 101_325.0) / 1000.0 - 9.80 * 83f64.to_radians().sin();
    let expected = (2.0 * accel * 10.0).sqrt();
    assert!(
        (exit.speed_earth_mps / expected - 1.0).abs() < 0.02,
        "{} vs {expected}",
        exit.speed_earth_mps
    );
}

#[test]
fn normal_force_uses_total_angle() {
    // CN table that saturates: CN(deg) = min(deg, 5) * 0.1
    let mut v = base();
    let angles: Vec<f64> = (0..=10).map(f64::from).collect();
    let row: Vec<f64> = angles.iter().map(|a| a.min(5.0) * 0.1).collect();
    v["stages"][0]["aero"]["cn_table"] =
        json!({ "mach": [0, 5], "alpha_deg": angles, "values": [row.clone(), row] });
    v["stages"][0]["aero"]["cn_alpha_per_rad"] = json!(0);
    let sim = Simulator::new(vehicle(&v));
    let force = |alpha: f64, beta: f64| {
        let (a, b) = (alpha.to_radians(), beta.to_radians());
        let vel = Vector3::new(100.0, 100.0 * b.tan(), 100.0 * a.tan());
        sim.aero_force_body(0, 1.0, true, &vel, 1.0)
    };
    // Pure pitch: CN(alpha) against the flow
    assert!((force(3.0, 0.0).z + 0.3).abs() < 1e-9);
    assert_eq!(force(3.0, 0.0).y, 0.0);
    // 4 deg pitch + 4 deg yaw: one CN at the total angle (5.66 deg,
    // saturated at 0.5), split along the crossflow
    let f = force(4.0, 4.0);
    assert!((f.y.hypot(f.z) - 0.5).abs() < 1e-3, "{f}");
    assert!((f.y - f.z).abs() < 1e-9);
}

#[test]
fn no_negative_thrust_when_overexpanded() {
    // 3 kN vacuum thrust from a nozzle that loses 4 kN at sea level
    let mut v = coast("ballistic");
    v["stages"][0]["engine"]["thrust_vac_n"] = json!(3000);
    v["simulation"]["end_time_s"] = json!(2);
    assert!(fly(&v).trajectory.iter().all(|s| s.thrust_n >= 0.0));
}

#[test]
fn thrust_trim_balances_aerodynamic_moment() {
    let flat = |value: f64| json!({ "mach": [0, 10], "alpha_deg": [0, 90], "values": [[value, value], [value, value]] });
    let mut v = base();
    v["stages"][0]["thrust_trim"] =
        json!({ "cg_sta_m": 5.0, "gimbal_sta_m": 9.0, "cp_sta_m": flat(6.0) });
    let sim = Simulator::new(vehicle(&v));
    let aero = Vector3::new(-500.0, 0.0, -2000.0);
    let aoa = Vector3::new(0.05, 0.0, 0.05);
    let (thrust, (pitch, yaw)) = sim.trimmed_thrust(0, 1.0, 50_000.0, 1.0, &aoa, &aero);
    assert_eq!(yaw, 0.0);
    assert!((thrust.magnitude() - 50_000.0).abs() < 1e-6);
    // Pitch moment about the CG: thrust 4 m aft, normal force 1 m aft
    let moment = thrust.z * (9.0 - 5.0) + aero.z * (6.0 - 5.0);
    assert!(moment.abs() < 1e-6, "moment {moment}, pitch {pitch}");
}

#[test]
fn power_off_axial_coefficient_after_burnout() {
    // Aerodynamically stable coast: the power-off CA applies after burnout
    let flight = |power_off: Option<f64>| {
        let mut v = coast("aero_stable");
        if let Some(ca) = power_off {
            v["stages"][0]["aero"]["ca_power_off"] = json!(ca);
        }
        let t = fly(&v).trajectory;
        let at = |time: f64| t.iter().find(|s| s.time_s == time).unwrap().clone();
        let (during, after) = (at(3.0), at(20.0));
        (
            during.aero_body_x_n,
            after.aero_body_x_n / after.dynamic_pressure_pa,
        )
    };
    let (during_same, after_same) = flight(None);
    let (during_off, after_off) = flight(Some(1.0));
    assert_eq!(during_same, during_off, "powered CA unchanged");
    // drag / q = CA * S: doubles from 0.5 to 1.0
    assert!((after_off / after_same - 2.0).abs() < 1e-9);
}

#[test]
fn multi_stage_vehicle_reaches_its_second_stage() {
    let v = json!({
        "name": "multi",
        "simulation": { "end_time_s": 60, "integrator": { "method": "rk4", "step_s": 0.5 } },
        "launch": { "latitude_deg": 35, "longitude_deg": 139 },
        "attitude": { "azimuth_deg": 113, "elevation_deg": 85 },
        "stages": [
            { "mass_initial_kg": 1000, "separation_time_s": 6.5,
              "engine": { "thrust_vac_n": 200000, "isp_vac_s": 250, "burn_end_s": 6 },
              "aero": { "diameter_m": 1.0, "ca": 0.2, "cn_alpha_per_rad": 0.1 } },
            { "mass_initial_kg": 200,
              "engine": { "thrust_vac_n": 60000, "isp_vac_s": 270, "burn_end_s": 8 },
              "aero": { "diameter_m": 1.0, "ca": 0.2, "cn_alpha_per_rad": 0.1 } }
        ]
    });
    let t = fly(&v).trajectory;
    assert_eq!(t.iter().map(|s| s.stage).max(), Some(2));
}
