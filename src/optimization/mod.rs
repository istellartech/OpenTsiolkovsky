//! Solver connection, analytic benchmarks and single/multi-stage optimization.
//! Assumed multi-stage demonstrations are distinct from the gated ZERO baseline.
pub mod control;
pub mod events;
pub mod flight_validation;
pub mod lgr;
pub mod multi_stage;
pub mod problem;
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
use problem::{OptimizationRequest, Problem, SCHEMA_VERSION};
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
}

pub fn solve(request: OptimizationRequest) -> Result<OptimizationResult, String> {
    solve_with_callback(request, |_| true)
}

pub fn solve_with_callback(
    request: OptimizationRequest,
    callback: impl FnMut(&IterationRecord) -> bool + 'static,
) -> Result<OptimizationResult, String> {
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
    let mut app = IpoptApplication::new();
    // Explicit settings only: no ambient options file or driver-level cold retry.
    let options = format!(
        "hessian_approximation limited-memory\nnlp_scaling_method none\npresolve no\nl1_fallback_on_restoration_failure no\nmu_strategy_fallback no\ndual_divergence_retry no\nprint_level 0\nmax_iter {}\ntol {}\nacceptable_iter 0\nbound_relax_factor 0\nderivative_test {}\n",
        request.solver.max_iterations,
        request.solver.tolerance,
        if request.solver.derivative_test {
            "first-order"
        } else {
            "none"
        }
    );
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
        stop_after: request.solver.stop_after_iteration,
        callback: Box::new(callback),
    }));
    let erased: Rc<RefCell<dyn TNLP>> = nlp.clone();
    let status = app.optimize_tnlp(erased);
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
    let validation = nlp.solution.as_ref().map(|s| {
        if let Some(m) = &multi_model {
            multi_stage::validation::validate_solution(m, s)
        } else if let Some(m) = &flight_model {
            flight_validation::validate_solution(m, s)
        } else {
            validation::validate_solution(nlp.model.as_ref(), s, trajectory_model.as_ref())
        }
    });
    let model_fidelity = if multi_model.is_some() {
        "assumed multi-stage numerical demonstrator; osculating orbit after payload deployment; thermal/range/6DoF not evaluated; not the ZERO baseline"
    } else if flight_model.is_some() {
        "single-stage 3DoF sounding-rocket model; additional payload above the supplied base dry mass; no flight certification"
    } else {
        "analytic_numerical_benchmark; no rocket performance claim"
    };
    Ok(OptimizationResult {
        schema_version: SCHEMA_VERSION,
        input: request,
        solver_version: "pounce 0.12.0 (FERAL, L-BFGS)".into(),
        code_revision: option_env!("OPENTSIOLKOVSKY_REVISION")
            .unwrap_or("unrecorded")
            .into(),
        solver_status: status.upstream_name().into(),
        solver_status_code: status.as_int(),
        converged,
        model_fidelity: model_fidelity.into(),
        variable_names: nlp.model.layout().variables.clone(),
        constraint_names: nlp.model.layout().constraints.clone(),
        nlp_layout: nlp.model.layout().clone(),
        hessian_calls: nlp.hessian_calls,
        iterations: nlp.history.clone(),
        solution: nlp.solution.clone(),
        validation,
        effective_options: options,
        flight_scaling: flight_model
            .map(|m| m.scaling)
            .or_else(|| multi_model.map(|m| m.scaling)),
        physical_scaling: trajectory_model.map(|m| m.scaling),
    })
}

pub fn solve_json(input: &str) -> Result<String, String> {
    let request = serde_json::from_str(input).map_err(|e| format!("optimization input: {e}"))?;
    #[cfg(all(target_arch = "wasm32", target_os = "wasi"))]
    let result = solve_with_callback(request, wasm_abi::emit_progress)?;
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
