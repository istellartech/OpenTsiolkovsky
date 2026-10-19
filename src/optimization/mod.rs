//! Solver connection, analytic benchmarks and single/multi-stage optimization.
//! Assumed multi-stage demonstrations are distinct from the gated ZERO baseline.
pub mod control;
pub mod events;
pub mod flight_validation;
pub mod lgr;
pub mod multi_stage;
pub mod problem;
pub mod scaling;
pub mod single_stage;
pub mod tnlp;
pub mod transcription;
pub mod validation;
#[cfg(all(target_arch = "wasm32", target_os = "wasi"))]
mod wasm_abi;

use pounce_algorithm::{
    IpoptApplication,
    application::{default_backend_factory, feral_config_from_options, ma57_config_from_options},
};
use pounce_nlp::{ApplicationReturnStatus, tnlp::TNLP};
use pounce_restoration::{
    resto_alg_builder::RestoAlgorithmBuilder,
    resto_inner_solver::make_default_restoration_factory_provider,
};
use problem::{HessianMethod, KktScaling, OptimizationRequest, Problem, SCHEMA_VERSION};
use scaling::{ScaledModel, ScalingStrategy};
use serde::{Deserialize, Serialize};
use std::{cell::RefCell, rc::Rc};
use tnlp::{Hs071, NlpModel, SolverNlp};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IterationRecord {
    pub iteration: i32,
    pub restoration: bool,
    pub objective: f64,
    pub primal_infeasibility: f64,
    pub dual_infeasibility: f64,
}

/// Live view of the solver's last evaluated point for progress displays.
/// It is usually, but not necessarily, the accepted iterate (line-search
/// trials and restoration also evaluate the model). Never stored in results.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProgressSnapshot {
    pub payload_kg: f64,
    pub phase_end_s: Vec<f64>,
    pub time_s: Vec<f64>,
    pub phase: Vec<usize>,
    pub altitude_m: Vec<f64>,
    pub downrange_m: Vec<f64>,
    pub speed_m_s: Vec<f64>,
    pub mass_kg: Vec<f64>,
    pub perigee_altitude_m: Option<f64>,
    pub apogee_altitude_m: Option<f64>,
    pub inclination_deg: Option<f64>,
}
impl ProgressSnapshot {
    /// Append one ECI state `[m, r, v]` at flight time `t` (ECI = ECEF at t = 0).
    pub fn push(
        &mut self,
        launch_llh: &nalgebra::Vector3<f64>,
        t: f64,
        phase: usize,
        y: &[f64; 7],
    ) {
        use crate::physics::coordinates::CoordinateTransform as C;
        let r = nalgebra::Vector3::new(y[1], y[2], y[3]);
        let llh = C::pos_ecef_to_llh(&C::pos_eci_to_ecef(&r, t));
        self.time_s.push(t);
        self.phase.push(phase);
        self.altitude_m.push(llh.z);
        self.downrange_m.push(C::distance_surface(launch_llh, &llh));
        self.speed_m_s
            .push(nalgebra::Vector3::new(y[4], y[5], y[6]).norm());
        self.mass_kg.push(y[0]);
    }
    /// Osculating perigee/apogee/inclination of the state `y`.
    pub fn set_orbit(&mut self, y: &[f64; 7]) {
        let r = nalgebra::Vector3::new(y[1], y[2], y[3]);
        let v = nalgebra::Vector3::new(y[4], y[5], y[6]);
        let e = crate::physics::orbit::elements(&r, &v, 0.0);
        self.perigee_altitude_m = Some(e.perigee_altitude_m).filter(|v| v.is_finite());
        self.apogee_altitude_m = e.apogee_altitude_m.filter(|v| v.is_finite());
        self.inclination_deg = Some(e.inclination_deg).filter(|v| v.is_finite());
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullSolution {
    pub x: Vec<f64>,
    pub z_lower: Vec<f64>,
    pub z_upper: Vec<f64>,
    pub constraints: Vec<f64>,
    pub lambda: Vec<f64>,
    pub objective: f64,
    pub solver_return: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationReport {
    pub status: String,
    pub method: String,
    pub max_bound_violation: f64,
    pub reference_objective_error: f64,
    pub reference_objective_tolerance: f64,
    pub tolerance: f64,
    pub trajectory: Option<validation::TrajectoryValidation>,
    pub error: Option<String>,
    pub flight: Option<flight_validation::FlightValidation>,
    pub multi_stage: Option<multi_stage::validation::MultiStageValidation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationResult {
    pub schema_version: u32,
    pub input: OptimizationRequest,
    pub solver_version: String,
    pub code_revision: String,
    pub solver_status: String,
    pub solver_status_code: i32,
    pub converged: bool,
    pub model_fidelity: String,
    pub variable_names: Vec<String>,
    pub constraint_names: Vec<String>,
    pub nlp_layout: tnlp::Layout,
    pub hessian_calls: usize,
    pub iterations: Vec<IterationRecord>,
    pub solution: Option<FullSolution>,
    pub validation: Option<ValidationReport>,
    pub effective_options: String,
    pub flight_scaling: Option<single_stage::FlightScaling>,
    pub physical_scaling: Option<transcription::PhysicalScaling>,
    pub scaling_report: Option<scaling::ScalingReport>,
    /// Legacy solution/layout stay in the model's S0 coordinates. This is the
    /// additional application-transformed TNLP actually passed to pounce.
    pub solver_layout: Option<tnlp::Layout>,
    pub solver_solution: Option<FullSolution>,
    pub physical_solution: Option<scaling::PhysicalSolution>,
    pub numerical_metrics: Option<NumericalMetrics>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumericalMetrics {
    pub setup_seconds: f64,
    pub solve_seconds: f64,
    pub validation_seconds: f64,
    pub jacobian_seconds: f64,
    pub hessian_seconds: f64,
    pub factorization_seconds: f64,
    pub backsolve_seconds: f64,
    pub objective_evaluations: i32,
    pub jacobian_evaluations: i32,
    pub hessian_evaluations: i32,
    pub final_kkt_error: Option<f64>,
    pub final_unscaled_kkt_error: Option<f64>,
    pub factors: u64,
    pub min_abs_pivot: Option<f64>,
    pub max_abs_pivot: Option<f64>,
    pub kkt_scaling: KktScaling,
    pub kkt_scaling_forced_on_factors: bool,
    pub restoration_records: usize,
}

pub fn solve(request: OptimizationRequest) -> Result<OptimizationResult, String> {
    solve_with_callback(request, None, |_, _| true)
}

/// `snapshot_interval_s`: minimum wall time between trajectory snapshots
/// passed to `callback` (None disables them).
pub fn solve_with_callback(
    request: OptimizationRequest,
    snapshot_interval_s: Option<f64>,
    callback: impl FnMut(&IterationRecord, Option<&ProgressSnapshot>) -> bool + 'static,
) -> Result<OptimizationResult, String> {
    let setup_start = std::time::Instant::now();
    request.validate()?;
    let model: Box<dyn NlpModel> = match &request.problem {
        Problem::Hs071 {} => Box::<Hs071>::default(),
        Problem::DoubleIntegrator(input) => {
            Box::new(transcription::DoubleIntegrator::new(input.clone())?)
        }
        Problem::MultiStage(input) => Box::new(multi_stage::MultiStage::new((**input).clone())?),
        Problem::SingleStage(input) => Box::new(single_stage::SingleStage::new((**input).clone())?),
        Problem::Zero(mission) => return Err(mission.readiness_issues().join("\n")),
    };
    if request.solver.hessian == HessianMethod::Exact && model.hessian_structure().is_empty() {
        return Err(
            "exact Hessian is currently supported for HS071 and double_integrator only".into(),
        );
    }
    let base_layout = model.layout().clone();
    let model = ScaledModel::new(model, request.solver.scaling.clone())?;
    let scaling_report = model.report.clone();
    let solver_layout = model.layout().clone();
    let model: Box<dyn NlpModel> = Box::new(model);
    let mut app = IpoptApplication::new();
    // Explicit settings only: no ambient options file or driver-level cold retry.
    let mut options = format!(
        "hessian_approximation {}\nnlp_scaling_method {}\npresolve no\nl1_fallback_on_restoration_failure no\nmu_strategy_fallback no\ndual_divergence_retry no\nprint_level 0\nmax_iter {}\ntol {}\nacceptable_iter 0\nbound_relax_factor 0\nderivative_test {}\n",
        if request.solver.hessian == HessianMethod::Exact {
            "exact"
        } else {
            "limited-memory"
        },
        if request.solver.scaling.strategy == ScalingStrategy::S3 {
            "gradient-based"
        } else {
            "none"
        },
        request.solver.max_iterations,
        request.solver.tolerance,
        if request.solver.derivative_test {
            if request.solver.hessian == HessianMethod::Exact {
                "second-order"
            } else {
                "first-order"
            }
        } else {
            "none"
        }
    );
    if request.solver.scaling.strategy == ScalingStrategy::S3 {
        options.push_str(&format!(
            "nlp_scaling_max_gradient {}\nnlp_scaling_min_value {}\n",
            request.solver.scaling.gradient_max, request.solver.scaling.gradient_min
        ));
    }
    if request.solver.kkt_scaling != KktScaling::UpstreamDefault {
        let mode = match request.solver.kkt_scaling {
            KktScaling::None => "none",
            KktScaling::Ruiz => "ruiz",
            KktScaling::SlackBased => "slack-based",
            _ => unreachable!(),
        };
        options.push_str(&format!(
            "linear_system_scaling {mode}\nlinear_scaling_on_demand no\n"
        ));
    }
    // A warm start sits at active bounds; the default push into the interior
    // (1 % of the value) would bend the control polynomials and break rate limits.
    if matches!(&request.problem, Problem::MultiStage(p) if p.initial_guess.is_some()) {
        options.push_str("bound_push 1e-8\nbound_frac 1e-8\n");
    }
    options.push_str("timing_statistics yes\n");
    app.initialize_with_options_str(&options)
        .map_err(|e| format!("solver options: {e}"))?;
    let feral = feral_config_from_options(app.options());
    let ma57 = ma57_config_from_options(app.options(), "");
    app.set_restoration_factory_provider(make_default_restoration_factory_provider(
        RestoAlgorithmBuilder::new(),
        app.algorithm_builder_from_options(),
        move || {
            let f = feral.clone();
            let m = ma57.clone();
            Box::new(move || default_backend_factory(f.clone(), m.clone()))
        },
    ));
    let nlp = Rc::new(RefCell::new(SolverNlp {
        model,
        solution: None,
        history: vec![],
        hessian_calls: 0,
        exact_hessian: request.solver.hessian == HessianMethod::Exact,
        stop_after: request.solver.stop_after_iteration,
        callback: Box::new(callback),
        last_x: vec![],
        snapshot_interval_s,
        last_snapshot: None,
    }));
    let erased: Rc<RefCell<dyn TNLP>> = nlp.clone();
    let setup_seconds = setup_start.elapsed().as_secs_f64();
    let solve_start = std::time::Instant::now();
    let status = app.optimize_tnlp(erased);
    let solve_seconds = solve_start.elapsed().as_secs_f64();
    let nlp = nlp.borrow();
    let converged = status == ApplicationReturnStatus::SolveSucceeded;
    let trajectory_model = match &request.problem {
        Problem::DoubleIntegrator(p) => Some(transcription::DoubleIntegrator::new(p.clone())?),
        _ => None,
    };
    let flight_model = match &request.problem {
        Problem::SingleStage(p) => Some(single_stage::SingleStage::new((**p).clone())?),
        _ => None,
    };
    let multi_model = match &request.problem {
        Problem::MultiStage(p) => Some(multi_stage::MultiStage::new((**p).clone())?),
        _ => None,
    };
    let solution = nlp.solution.as_ref().map(|s| scaling_report.restore(s));
    let validation_start = std::time::Instant::now();
    let validation = solution.as_ref().map(|s| {
        if let Some(m) = &multi_model {
            multi_stage::validation::validate_solution(m, s)
        } else if let Some(m) = &flight_model {
            flight_validation::validate_solution(m, s)
        } else {
            if let Some(m) = &trajectory_model {
                validation::validate_solution(m, s, Some(m))
            } else {
                validation::validate_solution(&Hs071::default(), s, None)
            }
        }
    });
    let validation_seconds = validation_start.elapsed().as_secs_f64();
    let stats = app.statistics();
    let timing = app.timing_stats();
    let linear = app.linear_solver_summary();
    let finite = |v: f64| v.is_finite().then_some(v);
    let factors = linear.as_ref().map_or(0, |v| v.n_factors);
    let numerical_metrics = NumericalMetrics {
        setup_seconds,
        solve_seconds,
        validation_seconds,
        jacobian_seconds: timing.eval_constr_jac.total_wallclock_time(),
        hessian_seconds: timing.eval_lag_hess.total_wallclock_time(),
        factorization_seconds: timing.linear_system_factorization.total_wallclock_time(),
        backsolve_seconds: timing.linear_system_back_solve.total_wallclock_time(),
        objective_evaluations: stats.num_obj_evals,
        jacobian_evaluations: stats.num_constr_jac_evals,
        hessian_evaluations: stats.num_hess_evals,
        final_kkt_error: finite(stats.final_kkt_error),
        final_unscaled_kkt_error: finite(stats.final_unscaled_kkt_error),
        factors,
        min_abs_pivot: linear
            .as_ref()
            .and_then(|v| v.min_abs_pivot)
            .and_then(finite),
        max_abs_pivot: linear
            .as_ref()
            .and_then(|v| v.max_abs_pivot)
            .and_then(finite),
        kkt_scaling: request.solver.kkt_scaling,
        kkt_scaling_forced_on_factors: factors > 0
            && matches!(
                request.solver.kkt_scaling,
                KktScaling::Ruiz | KktScaling::SlackBased
            ),
        restoration_records: nlp.history.iter().filter(|i| i.restoration).count(),
    };
    let physical_solution = solution
        .as_ref()
        .map(|s| scaling_report.physical_coordinates.solution(s));
    let model_fidelity = if multi_model.is_some() {
        "assumed multi-stage numerical demonstrator; osculating orbit after payload deployment; thermal/range/6DoF not evaluated; not the ZERO baseline"
    } else if flight_model.is_some() {
        "single-stage 3DoF sounding-rocket model; additional payload above the supplied base dry mass; no flight certification"
    } else {
        "analytic_numerical_benchmark; no rocket performance claim"
    };
    Ok(OptimizationResult {
        schema_version: SCHEMA_VERSION,
        solver_version: format!(
            "pounce 0.12.0 (FERAL, {})",
            if request.solver.hessian == HessianMethod::Exact {
                "exact Hessian"
            } else {
                "L-BFGS"
            }
        ),
        code_revision: option_env!("OPENTSIOLKOVSKY_REVISION")
            .unwrap_or("unrecorded")
            .into(),
        solver_status: status.upstream_name().into(),
        solver_status_code: status.as_int(),
        converged,
        model_fidelity: model_fidelity.into(),
        variable_names: base_layout.variables.clone(),
        constraint_names: base_layout.constraints.clone(),
        nlp_layout: base_layout,
        hessian_calls: nlp.hessian_calls,
        iterations: nlp.history.clone(),
        solution,
        validation,
        effective_options: options,
        flight_scaling: flight_model
            .map(|m| m.scaling)
            .or_else(|| multi_model.map(|m| m.scaling)),
        physical_scaling: trajectory_model.map(|m| m.scaling),
        scaling_report: Some(scaling_report),
        solver_layout: Some(solver_layout),
        solver_solution: nlp.solution.clone(),
        physical_solution,
        numerical_metrics: Some(numerical_metrics),
        input: request,
    })
}

pub fn solve_json(input: &str) -> Result<String, String> {
    let request = serde_json::from_str(input).map_err(|e| format!("optimization input: {e}"))?;
    #[cfg(all(target_arch = "wasm32", target_os = "wasi"))]
    let result = solve_with_callback(request, Some(0.25), wasm_abi::emit_progress)?;
    #[cfg(not(all(target_arch = "wasm32", target_os = "wasi")))]
    let result = solve(request)?;
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn request() -> OptimizationRequest {
        serde_json::from_str(include_str!("../../examples/optimization/hs071.json")).unwrap()
    }
    #[test]
    fn hs071_solves_with_full_primal_dual_solution() {
        let mut r = request();
        r.solver.derivative_test = true;
        let result = solve(r).unwrap();
        assert!(result.converged, "{}", result.solver_status);
        assert_eq!(result.hessian_calls, 0);
        assert_eq!(result.validation.as_ref().unwrap().status, "passed");
        let s = result.solution.unwrap();
        assert_eq!(s.x.len(), 4);
        assert_eq!(s.lambda.len(), 2);
        assert_eq!(s.z_lower.len(), 4);
        assert_eq!(s.z_upper.len(), 4);
        for (&v, expected) in s.x.iter().zip([1.0, 4.74299964, 3.82114998, 1.37940829]) {
            assert!((v - expected).abs() < 2e-5);
        }
    }
    #[test]
    fn cancellation_and_iteration_limit_are_not_success_and_can_restart() {
        let mut r = request();
        r.solver.stop_after_iteration = Some(0);
        let cancelled = solve(r).unwrap();
        assert_eq!(cancelled.solver_status, "User_Requested_Stop");
        assert!(!cancelled.converged);
        let mut r = request();
        r.solver.max_iterations = 1;
        let limited = solve(r).unwrap();
        assert_eq!(limited.solver_status, "Maximum_Iterations_Exceeded");
        assert!(!limited.converged);
        assert!(solve(request()).unwrap().converged);
    }
    #[test]
    fn missing_zero_data_are_explicit() {
        let r: OptimizationRequest = serde_json::from_str(include_str!(
            "../../examples/optimization/zero_500km_43deg.json"
        ))
        .unwrap();
        let error = solve(r).unwrap_err();
        assert!(error.contains("LC-1"));
        assert!(error.contains("MASS"));
        assert!(error.contains("RANGE"));
    }
}
