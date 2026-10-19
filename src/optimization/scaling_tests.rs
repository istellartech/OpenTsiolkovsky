use super::*;
use crate::optimization::{
    problem::{HessianMethod, KktScaling, OptimizationRequest},
    solve,
    tnlp::Hs071,
    transcription::DoubleIntegrator,
};
fn request() -> OptimizationRequest {
    serde_json::from_str(include_str!(
        "../../examples/optimization/double_integrator.json"
    ))
    .unwrap()
}
fn double() -> DoubleIntegrator {
    let super::super::problem::Problem::DoubleIntegrator(p) = request().problem else {
        unreachable!()
    };
    DoubleIntegrator::new(p).unwrap()
}
fn lagrangian_gradient(m: &dyn NlpModel, x: &[f64], factor: f64, lambda: &[f64]) -> Vec<f64> {
    let mut g = vec![0.0; x.len()];
    m.gradient(x, &mut g);
    for v in &mut g {
        *v *= factor
    }
    let mut j = vec![0.0; m.layout().jacobian.len()];
    m.jacobian(x, &mut j);
    for (&(r, c), v) in m.layout().jacobian.iter().zip(j) {
        g[c as usize] += lambda[r as usize] * v
    }
    g
}
fn derivative_audit(m: &dyn NlpModel) {
    let mut x = m.layout().initial.clone();
    for (i, v) in x.iter_mut().enumerate() {
        *v += 0.012 * ((i * 13 + 3) as f64).sin();
    }
    let n = x.len();
    let lambda: Vec<_> = (0..m.layout().constraints.len())
        .map(|i| ((i * 17 + 5) as f64).cos() * 0.7)
        .collect();
    let direction: Vec<_> = (0..n).map(|i| ((i * 7 + 4) as f64).sin() * 0.3).collect();
    let eps = 1e-5;
    let plus: Vec<_> = x.iter().zip(&direction).map(|(a, b)| a + eps * b).collect();
    let minus: Vec<_> = x.iter().zip(&direction).map(|(a, b)| a - eps * b).collect();
    let ga = lagrangian_gradient(m, &plus, 1.37, &lambda);
    let gb = lagrangian_gradient(m, &minus, 1.37, &lambda);
    let pattern = m.hessian_structure();
    assert!(!pattern.is_empty());
    let mut h = vec![0.0; pattern.len()];
    m.hessian(&x, 1.37, &lambda, &mut h);
    let mut product = vec![0.0; n];
    for ((r, c), v) in pattern.into_iter().zip(h) {
        assert!(r >= c);
        product[r as usize] += v * direction[c as usize];
        if r != c {
            product[c as usize] += v * direction[r as usize]
        }
    }
    for i in 0..n {
        let numerical = (ga[i] - gb[i]) / (2.0 * eps);
        assert!(
            (numerical - product[i]).abs() / numerical.abs().max(1.0) < 2e-7,
            "Hessian row {i}: {numerical} vs {}",
            product[i]
        );
    }
}
#[test]
fn exact_lagrangian_hessians_include_free_time_and_scaling_cross_terms() {
    for strategy in [
        ScalingStrategy::S0,
        ScalingStrategy::S1Bounds,
        ScalingStrategy::S1Guess,
        ScalingStrategy::S2,
        ScalingStrategy::S3,
    ] {
        let settings = ScalingSettings {
            strategy,
            ..Default::default()
        };
        let mut m = ScaledModel::new(Box::new(double()), settings.clone()).unwrap();
        m.report.objective_gain = 2.7;
        derivative_audit(&m);
        derivative_audit(&ScaledModel::new(Box::<Hs071>::default(), settings).unwrap());
    }
}
#[test]
fn solver_scalings_and_exact_hessian_recover_the_same_analytic_trajectory_and_si_duals() {
    for strategy in [
        ScalingStrategy::S0,
        ScalingStrategy::S1Bounds,
        ScalingStrategy::S1Guess,
        ScalingStrategy::S2,
        ScalingStrategy::S3,
    ] {
        for hessian in [HessianMethod::LimitedMemory, HessianMethod::Exact] {
            let mut r = request();
            r.solver.scaling.strategy = strategy;
            r.solver.scaling.gradient_max = 1.0;
            r.solver.hessian = hessian;
            let result = solve(r).unwrap();
            assert!(
                result.converged,
                "{strategy:?}/{hessian:?}: {}",
                result.solver_status
            );
            assert_eq!(result.validation.as_ref().unwrap().status, "passed");
            let physical = result.physical_solution.unwrap();
            assert!((physical.objective - 48000.0).abs() < 0.02);
            assert!((physical.x.last().unwrap() - 10.0).abs() < 1e-4);
            // d minimum J / d target distance = 24 at d=1000m. Constraint
            // multiplier is negative because the residual is x_final - target.
            let row = result
                .constraint_names
                .iter()
                .position(|n| n == "FINAL.position")
                .unwrap();
            assert!(
                (physical.lambda[row] + 24.0).abs() < 0.01,
                "{}",
                physical.lambda[row]
            );
            assert_eq!(
                result.hessian_calls == 0,
                hessian == HessianMethod::LimitedMemory
            );
            if strategy == ScalingStrategy::S3 {
                assert!(
                    result
                        .scaling_report
                        .as_ref()
                        .unwrap()
                        .pounce_row_gain
                        .iter()
                        .any(|v| *v < 1.0)
                );
            }
        }
    }
}
#[test]
fn hs071_second_order_solver_check_and_kkt_choices_are_explicit() {
    for mode in [
        KktScaling::UpstreamDefault,
        KktScaling::None,
        KktScaling::Ruiz,
        KktScaling::SlackBased,
    ] {
        let mut r = request();
        r.problem = super::super::problem::Problem::Hs071 {};
        r.solver.hessian = HessianMethod::Exact;
        r.solver.kkt_scaling = mode;
        r.solver.derivative_test = true;
        let result = solve(r).unwrap();
        assert!(result.converged, "{mode:?}: {}", result.solver_status);
        assert!(result.hessian_calls > 0);
        assert_eq!(result.validation.unwrap().status, "passed");
        assert_eq!(
            result
                .numerical_metrics
                .as_ref()
                .unwrap()
                .kkt_scaling_forced_on_factors,
            matches!(mode, KktScaling::Ruiz | KktScaling::SlackBased)
        );
        assert!(
            result
                .effective_options
                .contains("derivative_test second-order")
        );
    }
}
#[test]
fn variable_and_constraint_infinities_are_preserved_and_fixed_values_have_finite_maps() {
    let m = ScaledModel::new(
        Box::<Hs071>::default(),
        ScalingSettings {
            strategy: ScalingStrategy::S2,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(m.layout.g_upper[0], INFINITY_BOUND);
    let mut r = request();
    if let super::super::problem::Problem::DoubleIntegrator(p) = &mut r.problem {
        p.duration_s.lower = 12.0;
        p.duration_s.upper = 12.0;
    }
    let super::super::problem::Problem::DoubleIntegrator(p) = r.problem else {
        unreachable!()
    };
    let m = ScaledModel::new(
        Box::new(DoubleIntegrator::new(p).unwrap()),
        ScalingSettings {
            strategy: ScalingStrategy::S1Bounds,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(*m.layout.x_lower.last().unwrap(), 0.0);
    assert_eq!(*m.layout.x_upper.last().unwrap(), 0.0);
    assert_eq!(m.layout.x_lower[0], -INFINITY_BOUND);
    assert!(transformed_bound(1e18, 0.0, 100.0, false).is_err());
}
#[test]
fn physical_sensitivity_matches_a_changed_boundary_not_just_an_algebraic_roundtrip() {
    let center = solve(request()).unwrap();
    let row = center
        .constraint_names
        .iter()
        .position(|n| n == "FINAL.position")
        .unwrap();
    let predicted = -center.physical_solution.unwrap().lambda[row];
    let values: Vec<_> = [-0.1, 0.1]
        .iter()
        .map(|delta| {
            let mut r = request();
            if let super::super::problem::Problem::DoubleIntegrator(p) = &mut r.problem {
                p.distance_m += delta
            };
            let res = solve(r).unwrap();
            assert!(res.converged);
            res.physical_solution.unwrap().objective
        })
        .collect();
    assert!(((values[1] - values[0]) / 0.2 - predicted).abs() < 0.01);
}
#[test]
fn old_result_archives_and_default_solver_inputs_remain_readable() {
    let old: crate::optimization::OptimizationResult = serde_json::from_str(include_str!(
        "../../frontend/src/lib/__fixtures__/optimization-result.json"
    ))
    .unwrap();
    assert!(old.scaling_report.is_none());
    assert!(old.numerical_metrics.is_none());
    assert!(old.converged);
    let original = serde_json::to_value(request()).unwrap();
    assert!(original["solver"].get("scaling").is_none());
    assert!(original["solver"].get("hessian").is_none());
    let mut bad = request();
    bad.solver.scaling.floor = 0.0;
    assert!(bad.validate().is_err());
    let mut bad: OptimizationRequest = serde_json::from_str(include_str!(
        "../../examples/optimization/single_stage_100km.json"
    ))
    .unwrap();
    bad.solver.hessian = HessianMethod::Exact;
    assert!(bad.validate().unwrap_err().contains("exact Hessian"));
}
#[test]
fn metre_kilometre_tonne_and_kpa_representations_preserve_values_and_derivatives() {
    // A different unit is a conjugate coordinate change, never a change to the
    // vehicle JSON's *_m / *_kg / *_pa fields or to its physical limits.
    let input: OptimizationRequest = serde_json::from_str(include_str!(
        "../../examples/optimization/single_stage_100km_coarse.json"
    ))
    .unwrap();
    let super::super::problem::Problem::SingleStage(p) = input.problem else {
        unreachable!()
    };
    let mut model = ScaledModel::new(
        Box::new(super::super::single_stage::SingleStage::new(*p).unwrap()),
        Default::default(),
    )
    .unwrap();
    let original = model.layout.initial.clone();
    let mut base_values = vec![0.0; model.layout.constraints.len()];
    model.base.constraints(&original, &mut base_values);
    let mut base_j = vec![0.0; model.layout.jacobian.len()];
    model.base.jacobian(&original, &mut base_j);
    for engineering in [false, true] {
        let unit = |name: &str| {
            if engineering {
                match name {
                    "m" | "m/s" | "m/s^2" | "kg" | "Pa" => 1000.0,
                    _ => 1.0,
                }
            } else {
                1.0
            }
        };
        for (i, c) in model
            .report
            .physical_coordinates
            .variables
            .iter()
            .enumerate()
        {
            model.report.variable_offset[i] = -c.offset / c.scale;
            model.report.variable_gain[i] = unit(&c.unit) / c.scale;
        }
        for (i, c) in model
            .report
            .physical_coordinates
            .constraints
            .iter()
            .enumerate()
        {
            model.report.row_gain[i] = c.scale / unit(&c.unit);
        }
        model.report.objective_gain = model.report.physical_coordinates.objective.scale
            / unit(&model.report.physical_coordinates.objective.unit);
        model.apply_map().unwrap();
        let x = &model.layout.initial;
        assert!(
            (model.objective(x) / model.report.objective_gain - model.base.objective(&original))
                .abs()
                < 1e-10
        );
        let mut values = vec![0.0; base_values.len()];
        model.constraints(x, &mut values);
        for (i, v) in values.iter().enumerate() {
            assert!((v / model.report.row_gain[i] - base_values[i]).abs() < 1e-8);
        }
        let mut j = vec![0.0; base_j.len()];
        model.jacobian(x, &mut j);
        for (k, &(r, c)) in model.layout.jacobian.iter().enumerate() {
            let back =
                j[k] / model.report.row_gain[r as usize] / model.report.variable_gain[c as usize];
            assert!((back - base_j[k]).abs() / base_j[k].abs().max(1.0) < 1e-8);
        }
    }
}

#[test]
fn si_and_kilometre_formulations_solve_to_the_same_si_optimum_and_sensitivity() {
    use crate::optimization::tnlp::SolverNlp;
    use pounce_algorithm::IpoptApplication;
    use pounce_nlp::{ApplicationReturnStatus, tnlp::TNLP};
    use std::{cell::RefCell, rc::Rc};

    for length_unit in [1.0, 1000.0] {
        let mut model = ScaledModel::new(Box::new(double()), Default::default()).unwrap();
        let coordinates = model.report.physical_coordinates.clone();
        for (i, c) in coordinates.variables.iter().enumerate() {
            let unit = if c.unit == "s" { 1.0 } else { length_unit };
            model.report.variable_offset[i] = -c.offset / c.scale;
            model.report.variable_gain[i] = unit / c.scale;
        }
        for (i, c) in coordinates.constraints.iter().enumerate() {
            model.report.row_gain[i] = c.scale / length_unit;
        }
        model.report.objective_gain = coordinates.objective.scale / length_unit.powi(2);
        model.apply_map().unwrap();
        let report = model.report.clone();
        let nlp = Rc::new(RefCell::new(SolverNlp {
            model: Box::new(model),
            solution: None,
            history: vec![],
            hessian_calls: 0,
            exact_hessian: true,
            stop_after: None,
            callback: Box::new(|_, _| true),
            last_x: vec![],
            snapshot_interval_s: None,
            last_snapshot: None,
        }));
        let mut app = IpoptApplication::new();
        app.initialize_with_options_str("hessian_approximation exact\nnlp_scaling_method none\npresolve no\nprint_level 0\ntol 1e-10\nmax_iter 300\nacceptable_iter 0\nbound_relax_factor 0\n").unwrap();
        let erased: Rc<RefCell<dyn TNLP>> = nlp.clone();
        assert_eq!(
            app.optimize_tnlp(erased),
            ApplicationReturnStatus::SolveSucceeded
        );
        let nlp = nlp.borrow();
        let restored = report.restore(nlp.solution.as_ref().unwrap());
        let physical = coordinates.solution(&restored);
        let base = double();
        let row = base
            .layout()
            .constraints
            .iter()
            .position(|n| n == "FINAL.position")
            .unwrap();
        assert!((physical.objective - 48000.0).abs() < 0.02);
        assert!((physical.x.last().unwrap() - 10.0).abs() < 1e-4);
        assert!((physical.lambda[row] + 24.0).abs() < 0.01);
        let validation =
            crate::optimization::validation::validate_solution(&base, &restored, Some(&base));
        assert_eq!(validation.status, "passed");
    }
}

#[test]
fn constant_constraint_rows_are_not_amplified_or_assumed_to_have_jacobian_entries() {
    struct ConstantRow {
        base: Hs071,
        layout: Layout,
    }
    impl NlpModel for ConstantRow {
        fn layout(&self) -> &Layout {
            &self.layout
        }
        fn objective(&self, x: &[f64]) -> f64 {
            self.base.objective(x)
        }
        fn gradient(&self, x: &[f64], out: &mut [f64]) {
            self.base.gradient(x, out)
        }
        fn constraints(&self, x: &[f64], out: &mut [f64]) {
            self.base.constraints(x, &mut out[..2]);
            out[2] = 0.0;
        }
        fn jacobian(&self, x: &[f64], out: &mut [f64]) {
            self.base.jacobian(x, out)
        }
    }
    let base = Hs071::default();
    let mut layout = base.layout().clone();
    layout.constraints.push("constant".into());
    layout.g_lower.push(0.0);
    layout.g_upper.push(0.0);
    let model = ScaledModel::new(
        Box::new(ConstantRow { base, layout }),
        ScalingSettings {
            strategy: ScalingStrategy::S2,
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(model.report.row_gain[2], 1.0);
}
