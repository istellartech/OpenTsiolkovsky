//! Independent eleven-state IVP. Four extra states integrate stage propellant
//! consumption; discrete maps subtract their actual residual, never a stack reset.
use super::{MultiStage, problem::EndEvent};
use crate::{
    math::{constants::MU_EARTH, integrator::DormandPrince54},
    optimization::{
        FullSolution, ValidationReport, flight_validation::PhysicalCheck, tnlp::NlpModel,
        validation::max_violation,
    },
    physics::{
        coordinates::CoordinateTransform as C,
        flight,
        orbit::{OrbitalElements, elements, gmst_rad},
    },
};
use nalgebra::Vector3;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiSample {
    pub time_s: f64,
    pub interval: usize,
    pub phase: usize,
    pub stage: usize,
    pub powered: bool,
    pub state_eci: [f64; 7],
    pub consumed_propellant_kg: [f64; 4],
    pub altitude_m: f64,
    pub azimuth_deg: f64,
    pub elevation_deg: f64,
    pub azimuth_rate_deg_s: f64,
    pub elevation_rate_deg_s: f64,
    pub inertial_direction_rate_deg_s: f64,
    pub dynamic_pressure_pa: f64,
    pub angle_of_attack_deg: f64,
    pub specific_force_m_s2: f64,
    pub thrust_n: f64,
    pub mass_balance_error_kg: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRecord {
    pub kind: EndEvent,
    pub phase: usize,
    pub stage: usize,
    pub time_s: f64,
    pub before_eci: [f64; 7],
    pub after_eci: [f64; 7],
    pub dry_removed_kg: f64,
    pub propellant_removed_kg: f64,
    pub fairing_removed_kg: f64,
    pub adapter_removed_kg: f64,
    pub removed_mass_kg: f64,
    pub program_mass_difference_kg: f64,
    pub position_jump_m: f64,
    pub velocity_jump_m_s: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageLedger {
    pub stage: usize,
    pub dry_kg: f64,
    pub propellant_loaded_kg: f64,
    pub propellant_consumed_kg: f64,
    pub residual_kg: f64,
    pub required_reserve_kg: f64,
    pub total_burn_s: f64,
    pub ignition_count: usize,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiStageValidation {
    pub net_payload_kg: f64,
    pub final_time_s: f64,
    pub deployed_state_eci: [f64; 7],
    pub orbit: OrbitalElements,
    pub max_position_error_m: f64,
    pub max_velocity_error_m_s: f64,
    pub max_mass_error_kg: f64,
    pub position_tolerance_m: f64,
    pub velocity_tolerance_m_s: f64,
    pub tighter_rk_position_difference_m: f64,
    pub tighter_rk_velocity_difference_m_s: f64,
    pub tighter_rk_mass_difference_kg: f64,
    pub initial_total_mass_kg: f64,
    pub payload_adapter_kg: f64,
    pub fairing_kg: f64,
    pub stage_ledgers: Vec<StageLedger>,
    pub events: Vec<EventRecord>,
    pub checks: Vec<PhysicalCheck>,
    pub samples: Vec<MultiSample>,
    pub dense_points_per_interval: usize,
    pub unevaluated_constraints: Vec<String>,
}
struct Integrated {
    samples: Vec<MultiSample>,
    events: Vec<EventRecord>,
    final_state: [f64; 11],
    time: f64,
}
const DENSE: usize = 60;
fn state(y: &[f64; 11]) -> [f64; 7] {
    std::array::from_fn(|c| y[c])
}
fn difference(a: &[f64; 7], b: &[f64; 7]) -> [f64; 3] {
    [
        (a[0] - b[0]).abs(),
        Vector3::new(a[1] - b[1], a[2] - b[2], a[3] - b[3]).norm(),
        Vector3::new(a[4] - b[4], a[5] - b[5], a[6] - b[6]).norm(),
    ]
}
fn reintegrate(m: &MultiStage, x: &[f64], factor: f64) -> Result<Integrated, String> {
    let r = C::pos_eci_init(&m.vehicle.launch.llh);
    let v = C::vel_eci_init(&m.vehicle.launch.velocity_ned, &m.vehicle.launch.llh);
    let mut y = [
        m.input.initial_mass(m.payload(x)),
        r.x,
        r.y,
        r.z,
        v.x,
        v.y,
        v.z,
        0.0,
        0.0,
        0.0,
        0.0,
    ];
    let mut time = 0.0;
    let initial = y[0];
    let mut removed = 0.0;
    let mut samples = vec![];
    let mut events = vec![];
    for i in 0..m.intervals.len() {
        let p = m.intervals[i].phase;
        let phase = &m.input.phases[p];
        let (_, dt) = m.interval_time(x, i, -1.0);
        let solver = DormandPrince54::new(1e-12, 1e-11 * factor, 1e-10, (dt / 20.0).min(1.0));
        let tol = [
            1e-6 * factor,
            1e-4 * factor,
            1e-4 * factor,
            1e-4 * factor,
            1e-6 * factor,
            1e-6 * factor,
            1e-6 * factor,
            1e-6 * factor,
            1e-6 * factor,
            1e-6 * factor,
            1e-6 * factor,
        ];
        let mut points: Vec<_> = (0..=DENSE)
            .map(|j| -1.0 + 2.0 * j as f64 / DENSE as f64)
            .chain(m.grid.nodes.iter().copied())
            .collect();
        points.sort_by(f64::total_cmp);
        points.dedup_by(|a, b| (*a - *b).abs() < 1e-13);
        for tau in points {
            let (target, _) = m.interval_time(x, i, tau);
            solver
                .try_advance_to(&mut y, &mut time, target, &tol, 200000, |t, y| {
                    let dy = m.physical_derivative(x, i, t, &state(y));
                    let mut out = [0.0; 11];
                    out[..7].copy_from_slice(&dy);
                    if phase.powered() {
                        out[7 + phase.stage] = -dy[0];
                    }
                    out
                })
                .map_err(|e| format!("phase {p}, interval {i}, t={time}: {e}"))?;
            let ys = state(&y);
            let u = m.control(x, i, tau);
            let rate = m.control_rate(x, i, tau);
            let e = flight::evaluate(
                &m.vehicle,
                m.context(p),
                time,
                m.stage_start(x, p),
                &ys,
                [u[0], u[1], 0.0],
            )
            .map_err(str::to_owned)?;
            let angle = if e.environment.air_speed < 0.1 {
                0.0
            } else {
                e.air_body
                    .y
                    .hypot(e.air_body.z)
                    .atan2(e.air_body.x)
                    .to_degrees()
            };
            samples.push(MultiSample {
                time_s: time,
                interval: i,
                phase: p,
                stage: phase.stage,
                powered: phase.powered(),
                state_eci: ys,
                consumed_propellant_kg: std::array::from_fn(|s| y[7 + s]),
                altitude_m: e.environment.llh.z,
                azimuth_deg: u[0].to_degrees(),
                elevation_deg: u[1].to_degrees(),
                azimuth_rate_deg_s: rate[0].to_degrees(),
                elevation_rate_deg_s: rate[1].to_degrees(),
                inertial_direction_rate_deg_s: flight::direction_rate(
                    time, &ys, u[0], u[1], rate[0], rate[1],
                )
                .norm()
                .to_degrees(),
                dynamic_pressure_pa: e.environment.q,
                angle_of_attack_deg: angle,
                specific_force_m_s2: e.specific_force,
                thrust_n: e.thrust,
                mass_balance_error_kg: (y[0] - (initial - y[7..].iter().sum::<f64>() - removed))
                    .abs(),
            });
        }
        let kind = m.event(i);
        if kind != EndEvent::None {
            let before = state(&y);
            let inventory = &m.input.stages[phase.stage];
            let residual = inventory.propellant_kg - y[7 + phase.stage];
            let dry = if matches!(kind, EndEvent::SeparateStage | EndEvent::DeployPayload) {
                inventory.dry_kg
            } else {
                0.0
            };
            let propellant = if dry > 0.0 { residual } else { 0.0 };
            let fairing = if kind == EndEvent::JettisonFairing {
                m.input.fairing_kg
            } else {
                0.0
            };
            let adapter = if kind == EndEvent::DeployPayload {
                m.input.payload_adapter_kg
            } else {
                0.0
            };
            let drop = dry + propellant + fairing + adapter;
            if !drop.is_finite()
                || propellant < -m.input.validation.mass_kg
                || drop < 0.0
                || drop >= y[0]
            {
                return Err(format!(
                    "invalid mass inventory at {kind:?}: remaining={residual}, removed={drop}, stack={}",
                    y[0]
                ));
            }
            y[0] -= drop;
            removed += drop;
            let after = state(&y);
            let diff = difference(&before, &after);
            events.push(EventRecord {
                kind,
                phase: p,
                stage: phase.stage,
                time_s: time,
                before_eci: before,
                after_eci: after,
                dry_removed_kg: dry,
                propellant_removed_kg: propellant,
                fairing_removed_kg: fairing,
                adapter_removed_kg: adapter,
                removed_mass_kg: drop,
                program_mass_difference_kg: (drop - m.removed_mass(x, i)).abs(),
                position_jump_m: diff[1],
                velocity_jump_m_s: diff[2],
            });
        }
    }
    Ok(Integrated {
        samples,
        events,
        final_state: y,
        time,
    })
}
fn push_check(
    checks: &mut Vec<PhysicalCheck>,
    id: String,
    unit: &str,
    value: f64,
    lower: Option<f64>,
    upper: Option<f64>,
    tolerance: f64,
) {
    let violation = lower
        .map_or(0.0, |v| (v - value).max(0.0))
        .max(upper.map_or(0.0, |v| (value - v).max(0.0)));
    checks.push(PhysicalCheck {
        id,
        unit: unit.into(),
        value,
        lower,
        upper,
        tolerance,
        violation,
        passed: value.is_finite() && violation <= tolerance,
    });
}
pub fn validate_trajectory(m: &MultiStage, x: &[f64]) -> Result<MultiStageValidation, String> {
    let integrated = reintegrate(m, x, 1.0)?;
    let tight = reintegrate(m, x, 0.1)?;
    let mut error = [0.0_f64; 3];
    let mut rt = [0.0_f64; 3];
    for (s, z) in integrated.samples.iter().zip(&tight.samples) {
        let (start, dt) = m.interval_time(x, s.interval, -1.0);
        let tau = 2.0 * (s.time_s - start) / dt - 1.0;
        let polynomial = m.interpolated_state(x, s.interval, tau);
        let d = difference(&s.state_eci, &polynomial);
        let t = difference(&s.state_eci, &z.state_eci);
        for c in 0..3 {
            error[c] = error[c].max(d[c]);
            rt[c] = rt[c].max(t[c]);
        }
    }
    let final_state = state(&integrated.final_state);
    let final_diff = difference(&final_state, &m.state(x, m.final_node()));
    let final_tight = difference(&final_state, &state(&tight.final_state));
    for c in 0..3 {
        error[c] = error[c].max(final_diff[c]);
        rt[c] = rt[c].max(final_tight[c]);
    }
    let r = Vector3::new(final_state[1], final_state[2], final_state[3]);
    let v = Vector3::new(final_state[4], final_state[5], final_state[6]);
    let orbit = elements(&r, &v, gmst_rad(m.vehicle.launch.time.julian_date()));
    let rtgt = m.input.orbit.reference_radius_m + m.input.orbit.altitude_m;
    let vtgt = (MU_EARTH / rtgt).sqrt();
    let target = &m.input.orbit;
    let tol = &m.input.validation;
    let mut checks = vec![];
    push_check(
        &mut checks,
        "ORBIT.radius".into(),
        "m",
        r.norm(),
        Some(rtgt),
        Some(rtgt),
        target.radius_tolerance_m,
    );
    push_check(
        &mut checks,
        "ORBIT.speed".into(),
        "m/s",
        v.norm(),
        Some(vtgt),
        Some(vtgt),
        target.speed_tolerance_m_s,
    );
    push_check(
        &mut checks,
        "ORBIT.radial_velocity".into(),
        "m/s",
        r.dot(&v) / r.norm(),
        Some(0.0),
        Some(0.0),
        target.radial_velocity_tolerance_m_s,
    );
    push_check(
        &mut checks,
        "ORBIT.inclination".into(),
        "deg",
        orbit.inclination_deg,
        Some(target.inclination_deg),
        Some(target.inclination_deg),
        target.inclination_tolerance_deg,
    );
    let a = orbit.semi_major_axis_m;
    let e = orbit.eccentricity;
    push_check(
        &mut checks,
        "ORBIT.perigee_radius".into(),
        "m",
        a * (1.0 - e),
        Some(rtgt),
        Some(rtgt),
        target.apsis_tolerance_m,
    );
    push_check(
        &mut checks,
        "ORBIT.apogee_radius".into(),
        "m",
        a * (1.0 + e),
        Some(rtgt),
        Some(rtgt),
        target.apsis_tolerance_m,
    );
    let mut ledgers = vec![];
    for (s, inventory) in m.input.stages.iter().enumerate() {
        let consumed = integrated.final_state[7 + s];
        let residual = inventory.propellant_kg - consumed;
        let total = m.burn_time(x, s, m.input.phases.len() - 1);
        let mut ignitions = 0;
        let mut on = false;
        for p in m.input.phases.iter().filter(|p| p.stage == s) {
            if p.powered() && !on {
                ignitions += 1;
            }
            on = p.powered();
        }
        ledgers.push(StageLedger {
            stage: s,
            dry_kg: inventory.dry_kg,
            propellant_loaded_kg: inventory.propellant_kg,
            propellant_consumed_kg: consumed,
            residual_kg: residual,
            required_reserve_kg: inventory.reserve_kg,
            total_burn_s: total,
            ignition_count: ignitions,
        });
        push_check(
            &mut checks,
            format!("MASS.reserve[{s}]"),
            "kg",
            residual,
            Some(inventory.reserve_kg),
            Some(inventory.propellant_kg),
            tol.mass_kg,
        );
        push_check(
            &mut checks,
            format!("ENGINE.on_time[{s}]"),
            "s",
            total,
            None,
            Some(inventory.max_total_burn_s),
            1e-6,
        );
        push_check(
            &mut checks,
            format!("ENGINE.ignitions[{s}]"),
            "count",
            ignitions as f64,
            Some(1.0),
            Some(inventory.max_ignitions as f64),
            0.0,
        );
        push_check(
            &mut checks,
            format!("MASS.integrated_consumption[{s}]"),
            "kg",
            (consumed - m.flow[s] * total).abs(),
            None,
            Some(0.0),
            tol.mass_kg,
        );
    }
    for (p, phase) in m.input.phases.iter().enumerate() {
        let samples: Vec<_> = integrated.samples.iter().filter(|s| s.phase == p).collect();
        let max = |f: fn(&MultiSample) -> f64| {
            samples
                .iter()
                .map(|s| f(s))
                .fold(f64::NEG_INFINITY, f64::max)
        };
        let min =
            |f: fn(&MultiSample) -> f64| samples.iter().map(|s| f(s)).fold(f64::INFINITY, f64::min);
        push_check(
            &mut checks,
            format!("Q[{p}]"),
            "Pa",
            max(|s| s.dynamic_pressure_pa),
            None,
            Some(m.input.max_dynamic_pressure_pa),
            tol.dynamic_pressure_pa,
        );
        push_check(
            &mut checks,
            format!("AEROLOAD[{p}]"),
            "deg",
            max(|s| s.angle_of_attack_deg),
            None,
            Some(phase.max_angle_of_attack_deg),
            tol.angle_of_attack_deg,
        );
        push_check(
            &mut checks,
            format!("ACCEL[{p}]"),
            "m/s^2",
            max(|s| s.specific_force_m_s2),
            None,
            Some(phase.max_specific_force_m_s2),
            tol.specific_force_m_s2,
        );
        push_check(
            &mut checks,
            format!("CLEARANCE[{p}]"),
            "m",
            min(|s| s.altitude_m),
            Some(phase.min_altitude_m),
            None,
            tol.position_m,
        );
        push_check(
            &mut checks,
            format!("CONTROL.azimuth[{p}]"),
            "deg",
            min(|s| s.azimuth_deg),
            Some(m.input.azimuth_bounds_deg[0]),
            None,
            1e-5,
        );
        push_check(
            &mut checks,
            format!("CONTROL.azimuth_max[{p}]"),
            "deg",
            max(|s| s.azimuth_deg),
            None,
            Some(m.input.azimuth_bounds_deg[1]),
            1e-5,
        );
        push_check(
            &mut checks,
            format!("CONTROL.elevation_min[{p}]"),
            "deg",
            min(|s| s.elevation_deg),
            Some(m.input.elevation_bounds_deg[0]),
            None,
            1e-5,
        );
        push_check(
            &mut checks,
            format!("CONTROL.elevation_max[{p}]"),
            "deg",
            max(|s| s.elevation_deg),
            None,
            Some(m.input.elevation_bounds_deg[1]),
            1e-5,
        );
        push_check(
            &mut checks,
            format!("CONTROL.azimuth_rate[{p}]"),
            "deg/s",
            max(|s| s.azimuth_rate_deg_s.abs()),
            None,
            Some(m.input.max_azimuth_rate_deg_s),
            tol.pitch_rate_deg_s,
        );
        push_check(
            &mut checks,
            format!("CONTROL.elevation_rate[{p}]"),
            "deg/s",
            max(|s| s.elevation_rate_deg_s.abs()),
            None,
            Some(m.input.max_elevation_rate_deg_s),
            tol.pitch_rate_deg_s,
        );
        push_check(
            &mut checks,
            format!("CONTROL.inertial_direction_rate[{p}]"),
            "deg/s",
            max(|s| s.inertial_direction_rate_deg_s),
            None,
            Some(m.input.max_inertial_direction_rate_deg_s),
            tol.pitch_rate_deg_s,
        );
        let floor = m.mass_floor(x, p);
        push_check(
            &mut checks,
            format!("MASS.floor[{p}]"),
            "kg",
            min(|s| s.state_eci[0]),
            Some(floor),
            None,
            tol.mass_kg,
        );
        let initial = m.phase_start(x, p);
        let final_t = m.phase_start(x, p + 1);
        let monotonic = samples
            .windows(2)
            .map(|s| (s[1].state_eci[0] - s[0].state_eci[0]).max(0.0))
            .fold(0.0, f64::max);
        push_check(
            &mut checks,
            format!("MASS.monotonic[{p}]"),
            "kg",
            monotonic,
            None,
            Some(0.0),
            tol.mass_kg,
        );
        push_check(
            &mut checks,
            format!("ENGINE.phase_duration[{p}]"),
            "s",
            final_t - initial,
            Some(phase.duration_s.lower),
            Some(phase.duration_s.upper),
            1e-6,
        );
    }
    for (i, e) in integrated.events.iter().enumerate() {
        push_check(
            &mut checks,
            format!("EVENT.mass_map[{i}]"),
            "kg",
            e.program_mass_difference_kg,
            None,
            Some(0.0),
            tol.mass_kg,
        );
        push_check(
            &mut checks,
            format!("EVENT.position_continuity[{i}]"),
            "m",
            e.position_jump_m,
            None,
            Some(0.0),
            1e-9,
        );
        push_check(
            &mut checks,
            format!("EVENT.velocity_continuity[{i}]"),
            "m/s",
            e.velocity_jump_m_s,
            None,
            Some(0.0),
            1e-12,
        );
        if e.kind == EndEvent::JettisonFairing {
            let environment = flight::environment(&m.vehicle, e.time_s, &e.before_eci);
            push_check(
                &mut checks,
                "FAIRING.release_altitude".into(),
                "m",
                environment.llh.z,
                Some(m.input.fairing_release_min_altitude_m),
                None,
                tol.position_m,
            );
        }
    }
    let continuity = (1..m.intervals.len())
        .flat_map(|i| {
            let left = m.control(x, i - 1, 1.0);
            let right = m.control(x, i, -1.0);
            [
                (left[0] - right[0]).abs().to_degrees(),
                (left[1] - right[1]).abs().to_degrees(),
            ]
        })
        .fold(0.0, f64::max);
    push_check(
        &mut checks,
        "CONTROL.event_continuity".into(),
        "deg",
        continuity,
        None,
        Some(0.0),
        1e-5,
    );
    push_check(
        &mut checks,
        "MASS.global_balance".into(),
        "kg",
        integrated
            .samples
            .iter()
            .map(|s| s.mass_balance_error_kg)
            .fold(0.0, f64::max),
        None,
        Some(0.0),
        tol.mass_kg,
    );
    push_check(
        &mut checks,
        "DEPLOY.net_payload".into(),
        "kg",
        final_state[0],
        Some(m.payload(x)),
        Some(m.payload(x)),
        tol.mass_kg,
    );
    for (id, unit, value, limit) in [
        ("DYN.mass", "kg", error[0], tol.mass_kg),
        ("DYN.position", "m", error[1], tol.position_m),
        ("DYN.velocity", "m/s", error[2], tol.velocity_m_s),
        ("RK45.mass", "kg", rt[0], tol.mass_kg * 0.1),
        ("RK45.position", "m", rt[1], tol.position_m * 0.1),
        ("RK45.velocity", "m/s", rt[2], tol.velocity_m_s * 0.1),
    ] {
        push_check(&mut checks, id.into(), unit, value, None, Some(limit), 0.0);
    }
    Ok(MultiStageValidation {
        net_payload_kg: m.payload(x),
        position_tolerance_m: tol.position_m,
        velocity_tolerance_m_s: tol.velocity_m_s,
        final_time_s: integrated.time,
        deployed_state_eci: final_state,
        orbit,
        max_position_error_m: error[1],
        max_velocity_error_m_s: error[2],
        max_mass_error_kg: error[0],
        tighter_rk_position_difference_m: rt[1],
        tighter_rk_velocity_difference_m_s: rt[2],
        tighter_rk_mass_difference_kg: rt[0],
        initial_total_mass_kg: m.input.initial_mass(m.payload(x)),
        payload_adapter_kg: m.input.payload_adapter_kg,
        fairing_kg: m.input.fairing_kg,
        stage_ledgers: ledgers,
        events: integrated.events,
        checks,
        samples: integrated.samples,
        dense_points_per_interval: DENSE,
        unevaluated_constraints: vec![
            "FAIRING thermal flux and integrated heating after jettison".into(),
            "RANGE geographic corridor and discarded-body landing regions".into(),
            "STAGING relative motion, plume and recontact clearance".into(),
            "GNC/ENV rigid-body rotation, TVC dynamics, structural/acoustic loads".into(),
            "ENGINE propellant settling, restart thermal/power resources".into(),
        ],
    })
}
pub fn validate_solution(m: &MultiStage, s: &FullSolution) -> ValidationReport {
    let mut g = vec![0.0; m.layout().constraints.len()];
    m.constraints(&s.x, &mut g);
    let violation = max_violation(m, &s.x, &g);
    let mut report=ValidationReport{status:"failed".into(),method:"independent 11-state RK45 from launch, integrated stage consumption, conservative mass events, both event sides and 60 dense samples per interval, 10x tighter RK45, deployed osculating orbit".into(),max_bound_violation:violation,reference_objective_error:0.0,reference_objective_tolerance:0.0,tolerance:1e-6,trajectory:None,error:None,flight:None,multi_stage:None};
    match validate_trajectory(m, &s.x) {
        Ok(v) => {
            if violation <= report.tolerance && v.checks.iter().all(|c| c.passed) {
                report.status = "passed".into();
            } else {
                let failed: Vec<_> = v
                    .checks
                    .iter()
                    .filter(|c| !c.passed)
                    .map(|c| format!("{}: violation {} {}", c.id, c.violation, c.unit))
                    .collect();
                report.error = Some(format!(
                    "{}; scaled NLP violation {violation}. Numerical checks do not establish the unevaluated mission constraints.",
                    failed.join("; ")
                ));
            }
            report.multi_stage = Some(v);
        }
        Err(e) => report.error = Some(e),
    }
    report
}
