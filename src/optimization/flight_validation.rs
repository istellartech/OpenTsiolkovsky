//! Independent IVP with reconstructed controls, event-sided sampling and a
//! tighter integration. A converged NLP alone never establishes flight validity.
use super::{
    FullSolution, ValidationReport, single_stage::SingleStage, tnlp::NlpModel,
    validation::max_violation,
};
use crate::{
    math::integrator::DormandPrince54,
    physics::{
        coordinates::CoordinateTransform as C,
        flight::{self, PhaseContext},
    },
};
use nalgebra::Vector3;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlightSample {
    pub time_s: f64,
    pub interval: usize,
    pub powered: bool,
    pub state_eci: [f64; 7],
    pub altitude_m: f64,
    pub downrange_m: f64,
    pub velocity_up_m_s: f64,
    pub pitch_deg: f64,
    pub pitch_rate_deg_s: f64,
    pub dynamic_pressure_pa: f64,
    pub angle_of_attack_deg: f64,
    pub specific_force_m_s2: f64,
    pub thrust_n: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicalCheck {
    pub id: String,
    pub unit: String,
    pub value: f64,
    pub lower: Option<f64>,
    pub upper: Option<f64>,
    pub tolerance: f64,
    pub violation: f64,
    pub passed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MassLedger {
    pub base_dry_kg: f64,
    pub propellant_loaded_kg: f64,
    pub additional_payload_kg: f64,
    pub initial_total_kg: f64,
    pub propellant_burned_kg: f64,
    pub propellant_remaining_kg: f64,
    pub required_reserve_kg: f64,
    pub final_total_kg: f64,
    pub max_balance_error_kg: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlightValidation {
    pub burn_end_s: f64,
    pub coast_duration_s: f64,
    pub final_time_s: f64,
    pub max_position_error_m: f64,
    pub max_velocity_error_m_s: f64,
    pub max_mass_error_kg: f64,
    pub tighter_rk_position_difference_m: f64,
    pub tighter_rk_velocity_difference_m_s: f64,
    pub tighter_rk_mass_difference_kg: f64,
    pub position_tolerance_m: f64,
    pub velocity_tolerance_m_s: f64,
    pub mass_tolerance_kg: f64,
    pub mass_ledger: MassLedger,
    pub checks: Vec<PhysicalCheck>,
    pub dense_points_per_interval: usize,
    pub samples: Vec<FlightSample>,
}

const DENSE_POINTS: usize = 60;
fn reintegrate(m: &SingleStage, x: &[f64], factor: f64) -> Result<Vec<FlightSample>, String> {
    let r = C::pos_eci_init(&m.vehicle.launch.llh);
    let v = C::vel_eci_init(&m.vehicle.launch.velocity_ned, &m.vehicle.launch.llh);
    let mut y = [
        m.vehicle.stages[0].mass_initial + m.payload(x),
        r.x,
        r.y,
        r.z,
        v.x,
        v.y,
        v.z,
    ];
    let mut t = 0.0;
    let mut samples = vec![];
    for interval in 0..m.intervals() {
        let (_, dt) = m.interval_time(x, interval, -1.0);
        let solver = DormandPrince54::new(1e-12, 1e-11 * factor, 1e-10, dt / 20.0);
        let tol = [
            1e-8 * factor,
            1e-4 * factor,
            1e-4 * factor,
            1e-4 * factor,
            1e-6 * factor,
            1e-6 * factor,
            1e-6 * factor,
        ];
        let mut points: Vec<_> = (0..=DENSE_POINTS)
            .map(|j| -1.0 + 2.0 * j as f64 / DENSE_POINTS as f64)
            .chain(m.grid.nodes.iter().copied())
            .collect();
        points.sort_by(f64::total_cmp);
        points.dedup_by(|a, b| (*a - *b).abs() < 1e-13);
        for tau in points {
            let (target, _) = m.interval_time(x, interval, tau);
            solver
                .try_advance_to(&mut y, &mut t, target, &tol, 100000, |t, y| {
                    m.physical_derivative(x, interval, t, y)
                })
                .map_err(|e| format!("interval {interval}, t={t}: {e}"))?;
            let pitch = m.control(x, interval, tau);
            let powered = interval < m.burn_intervals;
            let e = flight::evaluate(
                &m.vehicle,
                PhaseContext { stage: 0, powered },
                t,
                0.0,
                &y,
                [m.input.azimuth_deg.to_radians(), pitch, 0.0],
            )
            .map_err(str::to_owned)?;
            let aoa = if e.environment.air_speed < 0.1 {
                0.0
            } else {
                (e.air_body.y.hypot(e.air_body.z))
                    .atan2(e.air_body.x)
                    .to_degrees()
            };
            samples.push(FlightSample {
                time_s: t,
                interval,
                powered,
                state_eci: y,
                altitude_m: e.environment.llh.z,
                downrange_m: m.terminal_from_state(&y, t)[2] * m.scaling.position_m,
                velocity_up_m_s: -e.environment.velocity_ned.z,
                pitch_deg: if powered {
                    pitch.to_degrees()
                } else {
                    (-e.environment.air_ned.z)
                        .atan2(e.environment.air_ned.x.hypot(e.environment.air_ned.y))
                        .to_degrees()
                },
                pitch_rate_deg_s: m.pitch_rate(x, interval, tau).to_degrees(),
                dynamic_pressure_pa: e.environment.q,
                angle_of_attack_deg: aoa,
                specific_force_m_s2: e.specific_force,
                thrust_n: e.thrust,
            });
        }
    }
    Ok(samples)
}

fn state_difference(a: &[f64; 7], b: &[f64; 7]) -> [f64; 3] {
    [
        (a[0] - b[0]).abs(),
        Vector3::new(a[1] - b[1], a[2] - b[2], a[3] - b[3]).norm(),
        Vector3::new(a[4] - b[4], a[5] - b[5], a[6] - b[6]).norm(),
    ]
}

pub fn validate_trajectory(m: &SingleStage, x: &[f64]) -> Result<FlightValidation, String> {
    let samples = reintegrate(m, x, 1.0)?;
    let tight = reintegrate(m, x, 0.1)?;
    let mut errors = [0.0_f64; 3];
    let mut tighter = [0.0_f64; 3];
    let mut balance = 0.0_f64;
    let initial = m.vehicle.stages[0].mass_initial + m.payload(x);
    let engine = m.vehicle.stages[0].engine.as_ref().unwrap();
    let flow = engine.thrust.eval(0.0) / (engine.isp.eval(0.0) * crate::math::constants::G0);
    for (s, z) in samples.iter().zip(&tight) {
        let (start, dt) = m.interval_time(x, s.interval, -1.0);
        let tau = 2.0 * (s.time_s - start) / dt - 1.0;
        let poly = m.interpolated_state(x, s.interval, tau);
        let diff = state_difference(&s.state_eci, &poly);
        let rt = state_difference(&s.state_eci, &z.state_eci);
        for c in 0..3 {
            errors[c] = errors[c].max(diff[c]);
            tighter[c] = tighter[c].max(rt[c]);
        }
        balance = balance.max((s.state_eci[0] - (initial - flow * s.time_s.min(m.burn_end))).abs());
    }
    let last = samples.last().ok_or("empty flight validation trajectory")?;
    let t = &m.input.validation;
    let mut checks = vec![];
    let mut check = |id: &str,
                     unit: &str,
                     value: f64,
                     lower: Option<f64>,
                     upper: Option<f64>,
                     tolerance: f64| {
        let violation = lower
            .map_or(0.0, |lo| (lo - value).max(0.0))
            .max(upper.map_or(0.0, |hi| (value - hi).max(0.0)));
        checks.push(PhysicalCheck {
            id: id.into(),
            unit: unit.into(),
            value,
            lower,
            upper,
            tolerance,
            violation,
            passed: value.is_finite() && violation <= tolerance,
        });
    };
    let max = |f: fn(&FlightSample) -> f64| samples.iter().map(f).fold(f64::NEG_INFINITY, f64::max);
    let min = |f: fn(&FlightSample) -> f64| samples.iter().map(f).fold(f64::INFINITY, f64::min);
    let remaining = last.state_eci[0] - m.input.dry_mass_kg - m.payload(x);
    check(
        "APOGEE.altitude",
        "m",
        last.altitude_m,
        Some(m.input.target_apogee_altitude_m),
        Some(m.input.target_apogee_altitude_m),
        t.position_m,
    );
    check(
        "APOGEE.velocity_up",
        "m/s",
        last.velocity_up_m_s,
        Some(0.0),
        Some(0.0),
        t.velocity_m_s,
    );
    check(
        "APOGEE.ascent",
        "m/s",
        min(|s| s.velocity_up_m_s),
        Some(0.0),
        None,
        t.velocity_m_s,
    );
    check(
        "RANGE.signed_projection",
        "m",
        last.downrange_m,
        Some(m.input.minimum_downrange_m),
        None,
        t.position_m,
    );
    check(
        "Q",
        "Pa",
        max(|s| s.dynamic_pressure_pa),
        None,
        Some(m.input.max_dynamic_pressure_pa),
        t.dynamic_pressure_pa,
    );
    check(
        "AEROLOAD.aoa",
        "deg",
        max(|s| s.angle_of_attack_deg),
        None,
        Some(m.input.max_angle_of_attack_deg),
        t.angle_of_attack_deg,
    );
    check(
        "ACCEL.specific_force",
        "m/s^2",
        max(|s| s.specific_force_m_s2),
        None,
        Some(m.input.max_specific_force_m_s2),
        t.specific_force_m_s2,
    );
    check(
        "CLEARANCE.ellipsoid",
        "m",
        min(|s| s.altitude_m) - m.vehicle.launch.llh.z,
        Some(0.0),
        None,
        t.position_m,
    );
    check(
        "MASS.reserve",
        "kg",
        remaining,
        Some(m.input.reserve_propellant_kg),
        None,
        t.mass_kg,
    );
    check("MASS.balance", "kg", balance, None, Some(0.0), t.mass_kg);
    check(
        "PAYLOAD.additional",
        "kg",
        m.payload(x),
        Some(m.input.additional_payload_kg.lower),
        Some(m.input.additional_payload_kg.upper),
        t.mass_kg,
    );
    check(
        "COAST.duration",
        "s",
        m.coast_duration(x),
        Some(m.input.coast_duration_s.lower),
        Some(m.input.coast_duration_s.upper),
        1e-6,
    );
    // Attitude of the aero-stable coast follows the flow; commanded pitch and
    // its limits apply to powered flight, including polynomial extrapolation.
    let burn: Vec<_> = samples.iter().filter(|s| s.powered).collect();
    check(
        "CONTROL.pitch_min",
        "deg",
        burn.iter()
            .map(|s| s.pitch_deg)
            .fold(f64::INFINITY, f64::min),
        Some(m.input.minimum_pitch_deg),
        None,
        1e-6,
    );
    check(
        "CONTROL.pitch_max",
        "deg",
        burn.iter()
            .map(|s| s.pitch_deg)
            .fold(f64::NEG_INFINITY, f64::max),
        None,
        Some(90.0),
        1e-6,
    );
    check(
        "CONTROL.rate",
        "deg/s",
        max(|s| s.pitch_rate_deg_s.abs()),
        None,
        Some(m.input.max_pitch_rate_deg_s),
        t.pitch_rate_deg_s,
    );
    let continuity = (1..m.burn_intervals)
        .map(|i| {
            (m.control(x, i, -1.0) - m.control(x, i - 1, 1.0))
                .to_degrees()
                .abs()
        })
        .fold(0.0, f64::max);
    check(
        "CONTROL.continuity",
        "deg",
        continuity,
        None,
        Some(0.0),
        1e-5,
    );
    check(
        "RK45.position",
        "m",
        tighter[1],
        None,
        Some(t.position_m * 0.1),
        0.0,
    );
    check(
        "RK45.velocity",
        "m/s",
        tighter[2],
        None,
        Some(t.velocity_m_s * 0.1),
        0.0,
    );
    check(
        "RK45.mass",
        "kg",
        tighter[0],
        None,
        Some(t.mass_kg * 0.1),
        0.0,
    );
    check(
        "DYN.position",
        "m",
        errors[1],
        None,
        Some(t.position_m),
        0.0,
    );
    check(
        "DYN.velocity",
        "m/s",
        errors[2],
        None,
        Some(t.velocity_m_s),
        0.0,
    );
    check("DYN.mass", "kg", errors[0], None, Some(t.mass_kg), 0.0);
    let ledger = MassLedger {
        base_dry_kg: m.input.dry_mass_kg,
        propellant_loaded_kg: m.input.propellant_mass_kg,
        additional_payload_kg: m.payload(x),
        initial_total_kg: initial,
        propellant_burned_kg: initial - last.state_eci[0],
        propellant_remaining_kg: remaining,
        required_reserve_kg: m.input.reserve_propellant_kg,
        final_total_kg: last.state_eci[0],
        max_balance_error_kg: balance,
    };
    Ok(FlightValidation {
        burn_end_s: m.burn_end,
        coast_duration_s: m.coast_duration(x),
        final_time_s: last.time_s,
        max_position_error_m: errors[1],
        max_velocity_error_m_s: errors[2],
        max_mass_error_kg: errors[0],
        tighter_rk_position_difference_m: tighter[1],
        tighter_rk_velocity_difference_m_s: tighter[2],
        tighter_rk_mass_difference_kg: tighter[0],
        position_tolerance_m: t.position_m,
        velocity_tolerance_m_s: t.velocity_m_s,
        mass_tolerance_kg: t.mass_kg,
        mass_ledger: ledger,
        checks,
        dense_points_per_interval: DENSE_POINTS,
        samples,
    })
}

pub fn validate_solution(m: &SingleStage, s: &FullSolution) -> ValidationReport {
    let mut g = vec![0.0; m.layout().constraints.len()];
    m.constraints(&s.x, &mut g);
    let violation = max_violation(m, &s.x, &g);
    let mut report=ValidationReport{status:"failed".into(),method:"independent continuous IVP from launch; no node resets; 60 dense points per interval plus LGR nodes and both event sides; 10x tighter RK45; SI constraint ledger".into(),max_bound_violation:violation,reference_objective_error:0.0,reference_objective_tolerance:0.0,tolerance:1e-6,trajectory:None,error:None,flight:None};
    match validate_trajectory(m, &s.x) {
        Ok(f) => {
            if violation <= report.tolerance && f.checks.iter().all(|c| c.passed) {
                report.status = "passed".into();
            } else {
                let failed: Vec<_> = f
                    .checks
                    .iter()
                    .filter(|c| !c.passed)
                    .map(|c| {
                        format!(
                            "{}: violation {} {} (tolerance {})",
                            c.id, c.violation, c.unit, c.tolerance
                        )
                    })
                    .collect();
                report.error = Some(format!(
                    "{}; scaled NLP violation {violation}. Refine the mesh or revise the physical problem; solver convergence alone is insufficient.",
                    failed.join("; ")
                ));
            }
            report.flight = Some(f);
        }
        Err(e) => report.error = Some(e),
    }
    report
}
