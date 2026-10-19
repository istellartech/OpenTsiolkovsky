//! First trajectory transcription. Linear local dynamics have exact analytic
//! derivatives; nonlinear flight dynamics will use local AD in a later step.
use super::{
    lgr::{Lgr, interpolate},
    problem::DoubleIntegratorProblem,
    tnlp::{Layout, NlpModel},
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicalScaling {
    pub strategy: String,
    pub position_m: f64,
    pub velocity_m_s: f64,
    pub acceleration_m_s2: f64,
    pub time_s: f64,
    pub objective_m2_s3: f64,
}

pub struct DoubleIntegrator {
    pub input: DoubleIntegratorProblem,
    pub grid: Lgr,
    pub scaling: PhysicalScaling,
    layout: Layout,
}

impl DoubleIntegrator {
    pub fn new(input: DoubleIntegratorProblem) -> Result<Self, String> {
        input.validate()?;
        let grid = Lgr::new(input.degree)?;
        let count = input.intervals * input.degree;
        let time = input.duration_s.initial;
        let length = input.distance_m;
        let scaling = PhysicalScaling {
            strategy: "S0 physical scales; fixed at initial duration".into(),
            position_m: length,
            velocity_m_s: length / time,
            acceleration_m_s2: length / time.powi(2),
            time_s: time,
            objective_m2_s3: length.powi(2) / time.powi(3),
        };
        if ![
            scaling.position_m,
            scaling.velocity_m_s,
            scaling.acceleration_m_s2,
            scaling.time_s,
            scaling.objective_m2_s3,
        ]
        .iter()
        .all(|v| v.is_finite() && *v > 0.0)
        {
            return Err("double-integrator physical scales overflow/underflow".into());
        }
        let n = 3 * count + 3;
        let m = 2 * count + 4;
        let mut model = Self {
            input,
            grid,
            scaling,
            layout: Layout {
                variables: vec![],
                constraints: vec![],
                x_lower: vec![-1e19; n],
                x_upper: vec![1e19; n],
                g_lower: vec![0.0; m],
                g_upper: vec![0.0; m],
                initial: vec![0.0; n],
                jacobian: vec![],
            },
        };
        for i in 0..=count {
            model.layout.variables.extend([
                format!("state[{i}].position_scaled"),
                format!("state[{i}].velocity_scaled"),
            ]);
        }
        for k in 0..count {
            model
                .layout
                .variables
                .push(format!("control[{k}].acceleration_scaled"));
        }
        model.layout.variables.push("duration_scaled".into());
        let ti = model.time_index();
        model.layout.x_lower[ti] = model.input.duration_s.lower / time;
        model.layout.x_upper[ti] = model.input.duration_s.upper / time;
        model.layout.initial[ti] = 1.0;
        // Deliberately non-optimal linear position guess and zero velocity/control.
        // The reference solution is reserved for independent validation.
        model.layout.initial[0] = 0.0;
        for interval in 0..model.input.intervals {
            for j in 1..=model.input.degree {
                let node = interval * model.input.degree + j;
                let fraction = (interval as f64 + (model.grid.nodes[j] + 1.0) / 2.0)
                    / model.input.intervals as f64;
                model.layout.initial[2 * node] = fraction;
            }
        }
        for k in 0..count {
            model
                .layout
                .constraints
                .extend([format!("DYN[{k}].position"), format!("DYN[{k}].velocity")]);
        }
        model.layout.constraints.extend(
            [
                "INIT.position",
                "INIT.velocity",
                "FINAL.position",
                "FINAL.velocity",
            ]
            .map(str::to_owned),
        );
        let entries = model.jacobian_entries(&model.layout.initial);
        model.layout.jacobian = entries.keys().map(|&(r, c)| (r as i32, c as i32)).collect();
        Ok(model)
    }
    pub fn count(&self) -> usize {
        self.input.intervals * self.input.degree
    }
    fn control_index(&self, k: usize) -> usize {
        2 * (self.count() + 1) + k
    }
    pub fn time_index(&self) -> usize {
        3 * self.count() + 2
    }
    fn jacobian_entries(&self, x: &[f64]) -> BTreeMap<(usize, usize), f64> {
        let mut entries = BTreeMap::new();
        let t = self.time_index();
        let factor = x[t] / (2 * self.input.intervals) as f64;
        for k in 0..self.count() {
            let interval = k / self.input.degree;
            let local = k % self.input.degree;
            for j in 0..=self.input.degree {
                let node = interval * self.input.degree + j;
                entries.insert((2 * k, 2 * node), self.grid.differentiation[local][j]);
                entries.insert(
                    (2 * k + 1, 2 * node + 1),
                    self.grid.differentiation[local][j],
                );
            }
            entries.insert((2 * k, 2 * (k + 1) + 1), -factor);
            entries.insert((2 * k + 1, self.control_index(k)), -factor);
            entries.insert(
                (2 * k, t),
                -x[2 * (k + 1) + 1] / (2 * self.input.intervals) as f64,
            );
            entries.insert(
                (2 * k + 1, t),
                -x[self.control_index(k)] / (2 * self.input.intervals) as f64,
            );
        }
        let base = 2 * self.count();
        for (row, col) in [
            (base, 0),
            (base + 1, 1),
            (base + 2, 2 * self.count()),
            (base + 3, 2 * self.count() + 1),
        ] {
            entries.insert((row, col), 1.0);
        }
        entries
    }
    pub fn control_si(&self, x: &[f64], interval: usize, tau: f64) -> f64 {
        let values: Vec<_> = (0..self.input.degree)
            .map(|j| x[self.control_index(interval * self.input.degree + j)])
            .collect();
        interpolate(&self.grid.nodes[1..], &values, tau) * self.scaling.acceleration_m_s2
    }
    pub fn duration_si(&self, x: &[f64]) -> f64 {
        x[self.time_index()] * self.scaling.time_s
    }
    pub fn reference_duration(&self) -> f64 {
        let d = &self.input.duration_s;
        if self.input.time_cost == 0.0 {
            d.upper
        } else {
            (36.0 * self.input.distance_m.powi(2) / self.input.time_cost)
                .powf(0.25)
                .clamp(d.lower, d.upper)
        }
    }
    pub fn reference_objective(&self) -> f64 {
        let t = self.reference_duration();
        12.0 * self.input.distance_m.powi(2) / t.powi(3) + self.input.time_cost * t
    }
}

impl NlpModel for DoubleIntegrator {
    fn layout(&self) -> &Layout {
        &self.layout
    }
    fn objective(&self, x: &[f64]) -> f64 {
        let t = x[self.time_index()];
        let cost = (0..self.count())
            .map(|k| self.grid.weights[k % self.input.degree] * x[self.control_index(k)].powi(2))
            .sum::<f64>()
            * t
            / (2 * self.input.intervals) as f64;
        cost + self.input.time_cost * self.scaling.time_s / self.scaling.objective_m2_s3 * t
    }
    fn gradient(&self, x: &[f64], g: &mut [f64]) {
        g.fill(0.0);
        let t = self.time_index();
        for k in 0..self.count() {
            let u = self.control_index(k);
            let w = self.grid.weights[k % self.input.degree] / (2 * self.input.intervals) as f64;
            g[u] = 2.0 * w * x[t] * x[u];
            g[t] += w * x[u] * x[u];
        }
        g[t] += self.input.time_cost * self.scaling.time_s / self.scaling.objective_m2_s3;
    }
    fn constraints(&self, x: &[f64], g: &mut [f64]) {
        let factor = x[self.time_index()] / (2 * self.input.intervals) as f64;
        for k in 0..self.count() {
            let interval = k / self.input.degree;
            let local = k % self.input.degree;
            for axis in 0..2 {
                g[2 * k + axis] = (0..=self.input.degree)
                    .map(|j| {
                        self.grid.differentiation[local][j]
                            * x[2 * (interval * self.input.degree + j) + axis]
                    })
                    .sum::<f64>();
            }
            g[2 * k] -= factor * x[2 * (k + 1) + 1];
            g[2 * k + 1] -= factor * x[self.control_index(k)];
        }
        let base = 2 * self.count();
        g[base..].copy_from_slice(&[
            x[0],
            x[1],
            x[2 * self.count()] - 1.0,
            x[2 * self.count() + 1],
        ]);
    }
    fn jacobian(&self, x: &[f64], out: &mut [f64]) {
        for (value, (_, v)) in out.iter_mut().zip(self.jacobian_entries(x)) {
            *value = v;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::optimization::{
        problem::{OptimizationRequest, Problem},
        solve,
    };

    fn request() -> OptimizationRequest {
        serde_json::from_str(include_str!(
            "../../examples/optimization/double_integrator.json"
        ))
        .unwrap()
    }

    #[test]
    fn sparse_derivatives_include_duration_and_match_central_directions() {
        let Problem::DoubleIntegrator(p) = request().problem else {
            panic!()
        };
        let model = DoubleIntegrator::new(p).unwrap();
        let l = model.layout();
        let x: Vec<_> = l
            .initial
            .iter()
            .enumerate()
            .map(|(i, v)| v + 0.2 * (i as f64 + 0.3).sin())
            .collect();
        let direction: Vec<_> = (0..x.len()).map(|i| (i as f64 + 0.7).cos()).collect();
        let mut jac = vec![0.0; l.jacobian.len()];
        model.jacobian(&x, &mut jac);
        let mut product = vec![0.0; l.g_lower.len()];
        for (&(r, c), &v) in l.jacobian.iter().zip(&jac) {
            product[r as usize] += v * direction[c as usize];
        }
        let mut grad = vec![0.0; x.len()];
        model.gradient(&x, &mut grad);
        let directional: f64 = grad.iter().zip(&direction).map(|(a, b)| a * b).sum();
        for eps in [1e-4, 1e-5, 1e-6] {
            let plus: Vec<_> = x.iter().zip(&direction).map(|(x, v)| x + eps * v).collect();
            let minus: Vec<_> = x.iter().zip(&direction).map(|(x, v)| x - eps * v).collect();
            let (mut gp, mut gm) = (vec![0.0; product.len()], vec![0.0; product.len()]);
            model.constraints(&plus, &mut gp);
            model.constraints(&minus, &mut gm);
            for ((a, b), expected) in gp.iter().zip(&gm).zip(&product) {
                assert!(((a - b) / (2.0 * eps) - expected).abs() < 2e-7);
            }
            assert!(
                ((model.objective(&plus) - model.objective(&minus)) / (2.0 * eps) - directional)
                    .abs()
                    < 1e-6
            );
        }
    }

    #[test]
    fn free_time_mesh_and_initial_scale_comparison_matches_analytic_optimum() {
        for (initial, intervals, degree) in [(8.0, 2, 3), (12.0, 4, 4), (20.0, 6, 5)] {
            let mut r = request();
            let Problem::DoubleIntegrator(p) = &mut r.problem else {
                panic!()
            };
            p.duration_s.initial = initial;
            p.intervals = intervals;
            p.degree = degree;
            let result = solve(r).unwrap();
            assert!(result.converged, "{}", result.solver_status);
            assert_eq!(result.hessian_calls, 0);
            let v = result.validation.unwrap();
            assert_eq!(v.status, "passed", "{v:?}");
            let t = v.trajectory.unwrap();
            assert!((t.duration_s - 10.0).abs() < 1e-5);
            assert!((t.integrated_objective_si - 48000.0).abs() < 1e-3);
        }
    }

    #[test]
    fn fixed_duration_is_not_optimized_and_solution_validation_is_independent() {
        let mut r = request();
        let Problem::DoubleIntegrator(p) = &mut r.problem else {
            panic!()
        };
        p.duration_s.initial = 12.0;
        p.duration_s.lower = 12.0;
        p.duration_s.upper = 12.0;
        let model = DoubleIntegrator::new(p.clone()).unwrap();
        let result = solve(r).unwrap();
        assert!(result.converged, "{}", result.solver_status);
        assert_eq!(result.validation.unwrap().status, "passed");
        let mut x = result.solution.unwrap().x;
        x[2 * model.count()] += 0.1; // A bad endpoint cannot hide behind successful solve status.
        let report = super::super::validation::validate_trajectory(&model, &x).unwrap();
        assert!(report.max_position_error_m > 10.0);
    }
}
