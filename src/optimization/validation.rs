use super::{FullSolution, ValidationReport, tnlp::NlpModel, transcription::DoubleIntegrator};
use crate::math::integrator::DormandPrince54;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrajectorySample {
    pub time_s: f64,
    pub position_m: f64,
    pub velocity_m_s: f64,
    pub acceleration_m_s2: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrajectoryValidation {
    pub position_tolerance_m: f64,
    pub velocity_tolerance_m_s: f64,
    pub max_position_error_m: f64,
    pub max_velocity_error_m_s: f64,
    pub final_position_error_m: f64,
    pub final_velocity_error_m_s: f64,
    pub duration_s: f64,
    pub reference_duration_s: f64,
    pub reference_duration_error_s: f64,
    pub integrated_objective_si: f64,
    pub reference_objective_si: f64,
    pub tighter_rk_position_difference_m: f64,
    pub tighter_rk_velocity_difference_m_s: f64,
    pub samples: Vec<TrajectorySample>,
}

/// Independent IVP from the prescribed initial state, never a node-state reset.
fn reintegrate(
    model: &DoubleIntegrator,
    x: &[f64],
    factor: f64,
) -> Result<(Vec<TrajectorySample>, f64), String> {
    let duration = model.duration_si(x);
    if !duration.is_finite() || duration <= 0.0 {
        return Err("invalid optimized duration".into());
    }
    let solver = DormandPrince54::new(1e-12, 1e-11 * factor, 1e-10, duration / 20.0);
    let tolerances = [
        model.input.position_tolerance_m * 0.01 * factor,
        model.input.velocity_tolerance_m_s * 0.01 * factor,
        model.scaling.objective_m2_s3 * 1e-10 * factor,
    ];
    let mut state = [0.0, 0.0, 0.0];
    let mut time = 0.0;
    let mut samples = vec![];
    for interval in 0..model.input.intervals {
        let start = duration * interval as f64 / model.input.intervals as f64;
        let end = duration * (interval + 1) as f64 / model.input.intervals as f64;
        let control =
            |t: f64| model.control_si(x, interval, 2.0 * (t - start) / (end - start) - 1.0);
        // Inspect both sides of boundaries and initial control extrapolation.
        samples.push(TrajectorySample {
            time_s: time,
            position_m: state[0],
            velocity_m_s: state[1],
            acceleration_m_s2: control(time),
        });
        let mut points: Vec<f64> = (1..=20)
            .map(|j| -1.0 + 2.0 * j as f64 / 20.0)
            .chain(model.grid.nodes[1..].iter().copied())
            .collect();
        points.sort_by(f64::total_cmp);
        points.dedup_by(|a, b| (*a - *b).abs() < 1e-14);
        for tau in points {
            let target = if tau == 1.0 {
                end
            } else {
                start + (tau + 1.0) * (end - start) / 2.0
            };
            solver
                .try_advance_to(
                    &mut state,
                    &mut time,
                    target,
                    &tolerances,
                    100_000,
                    |t, y| {
                        let u = control(t);
                        [y[1], u, u * u]
                    },
                )
                .map_err(|e| e.to_string())?;
            samples.push(TrajectorySample {
                time_s: time,
                position_m: state[0],
                velocity_m_s: state[1],
                acceleration_m_s2: control(time),
            });
        }
    }
    Ok((samples, state[2] + model.input.time_cost * duration))
}

pub fn validate_trajectory(
    model: &DoubleIntegrator,
    x: &[f64],
) -> Result<TrajectoryValidation, String> {
    let (samples, cost) = reintegrate(model, x, 1.0)?;
    let (tight, _) = reintegrate(model, x, 0.1)?;
    let duration = model.duration_si(x);
    let mut pos_error = 0.0_f64;
    let mut vel_error = 0.0_f64;
    for sample in &samples {
        let interval = ((sample.time_s / duration * model.input.intervals as f64).floor() as usize)
            .min(model.input.intervals - 1);
        let tau =
            2.0 * (sample.time_s / duration * model.input.intervals as f64 - interval as f64) - 1.0;
        for axis in 0..2 {
            let values: Vec<_> = (0..=model.input.degree)
                .map(|j| x[2 * (interval * model.input.degree + j) + axis])
                .collect();
            let poly = super::lgr::interpolate(&model.grid.nodes, &values, tau);
            if axis == 0 {
                pos_error =
                    pos_error.max((poly * model.scaling.position_m - sample.position_m).abs());
            } else {
                vel_error =
                    vel_error.max((poly * model.scaling.velocity_m_s - sample.velocity_m_s).abs());
            }
        }
    }
    let end = samples.last().ok_or("no validation samples")?;
    let final_pos = (end.position_m - model.input.distance_m).abs();
    let final_vel = end.velocity_m_s.abs();
    let tighter_pos = samples.iter().zip(&tight).fold(0.0_f64, |v, (a, b)| {
        v.max((a.position_m - b.position_m).abs())
    });
    let tighter_vel = samples.iter().zip(&tight).fold(0.0_f64, |v, (a, b)| {
        v.max((a.velocity_m_s - b.velocity_m_s).abs())
    });
    Ok(TrajectoryValidation {
        position_tolerance_m: model.input.position_tolerance_m,
        velocity_tolerance_m_s: model.input.velocity_tolerance_m_s,
        max_position_error_m: pos_error,
        max_velocity_error_m_s: vel_error,
        final_position_error_m: final_pos,
        final_velocity_error_m_s: final_vel,
        duration_s: duration,
        reference_duration_s: model.reference_duration(),
        reference_duration_error_s: (duration - model.reference_duration()).abs(),
        integrated_objective_si: cost,
        reference_objective_si: model.reference_objective(),
        tighter_rk_position_difference_m: tighter_pos,
        tighter_rk_velocity_difference_m_s: tighter_vel,
        samples,
    })
}

pub fn max_violation(model: &dyn NlpModel, x: &[f64], g: &[f64]) -> f64 {
    let l = model.layout();
    x.iter()
        .zip(&l.x_lower)
        .zip(&l.x_upper)
        .chain(g.iter().zip(&l.g_lower).zip(&l.g_upper))
        .fold(0.0_f64, |e, ((&v, &lo), &hi)| {
            if v.is_finite() {
                e.max(lo - v).max(v - hi)
            } else {
                f64::INFINITY
            }
        })
}

pub fn validate_solution(
    model: &dyn NlpModel,
    s: &FullSolution,
    trajectory_model: Option<&DoubleIntegrator>,
) -> ValidationReport {
    // Recompute the equations independently of the solver's final g buffer.
    let mut constraints = vec![0.0; model.layout().constraints.len()];
    model.constraints(&s.x, &mut constraints);
    let violation = max_violation(model, &s.x, &constraints);
    let mut report = ValidationReport {
        status: "failed".into(),
        method: String::new(),
        max_bound_violation: violation,
        reference_objective_error: 0.0,
        reference_objective_tolerance: 0.0,
        tolerance: 1e-6,
        trajectory: None,
        error: None,
    };
    if let Some(trajectory_model) = trajectory_model {
        report.method =
            "independent RK45, tighter RK45, dense polynomial comparison and analytic optimum"
                .into();
        match validate_trajectory(trajectory_model, &s.x) {
            Ok(t) => {
                report.reference_objective_error =
                    (t.integrated_objective_si - t.reference_objective_si).abs();
                report.reference_objective_tolerance =
                    t.reference_objective_si.abs().max(1.0) * 1e-6;
                let passed = violation <= report.tolerance
                    && report.reference_objective_error <= report.reference_objective_tolerance
                    && t.max_position_error_m <= t.position_tolerance_m
                    && t.final_position_error_m <= t.position_tolerance_m
                    && t.max_velocity_error_m_s <= t.velocity_tolerance_m_s
                    && t.final_velocity_error_m_s <= t.velocity_tolerance_m_s
                    && t.tighter_rk_position_difference_m <= t.position_tolerance_m * 0.1
                    && t.tighter_rk_velocity_difference_m_s <= t.velocity_tolerance_m_s * 0.1
                    && t.reference_duration_error_s <= trajectory_model.reference_duration() * 1e-5;
                if passed {
                    report.status = "passed".into();
                }
                report.trajectory = Some(t);
            }
            Err(error) => report.error = Some(error),
        }
    } else {
        report.method = "HS071 bounds and known objective (not a flight validation)".into();
        report.reference_objective_error = (s.objective - 17.014017289136).abs();
        report.reference_objective_tolerance = 1e-5;
        if violation <= report.tolerance
            && report.reference_objective_error <= report.reference_objective_tolerance
        {
            report.status = "passed".into();
        }
    }
    report
}
