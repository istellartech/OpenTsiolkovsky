use super::{FullSolution, IterationRecord, ProgressSnapshot};
use pounce_nlp::tnlp::*;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Layout {
    pub variables: Vec<String>,
    pub constraints: Vec<String>,
    pub x_lower: Vec<f64>,
    pub x_upper: Vec<f64>,
    pub g_lower: Vec<f64>,
    pub g_upper: Vec<f64>,
    pub initial: Vec<f64>,
    pub jacobian: Vec<(i32, i32)>,
}

/// Values and derivatives are in the same (already scaled) coordinates.
pub trait NlpModel {
    fn layout(&self) -> &Layout;
    fn objective(&self, x: &[f64]) -> f64;
    fn gradient(&self, x: &[f64], out: &mut [f64]);
    fn constraints(&self, x: &[f64], out: &mut [f64]);
    fn jacobian(&self, x: &[f64], out: &mut [f64]);
    /// Lower triangular Lagrangian Hessian. An empty pattern means unsupported.
    fn hessian_structure(&self) -> Vec<(i32, i32)> {
        vec![]
    }
    fn hessian(&self, _: &[f64], _: f64, _: &[f64], _: &mut [f64]) {
        unreachable!("exact Hessian unavailable")
    }
    fn coordinates(&self) -> super::scaling::PhysicalCoordinates {
        super::scaling::PhysicalCoordinates::dimensionless(self.layout())
    }
    /// Flight trajectory at `x` for progress displays; None for benchmarks.
    fn snapshot(&self, _: &[f64]) -> Option<ProgressSnapshot> {
        None
    }
}

/// Per-iteration observer; returning false stops the solve.
pub type ProgressCallback = Box<dyn FnMut(&IterationRecord, Option<&ProgressSnapshot>) -> bool>;

pub struct SolverNlp {
    pub model: Box<dyn NlpModel>,
    pub solution: Option<FullSolution>,
    pub history: Vec<IterationRecord>,
    pub hessian_calls: usize,
    pub exact_hessian: bool,
    pub stop_after: Option<u32>,
    pub callback: ProgressCallback,
    /// Last point passed to eval_f/eval_g (pounce exposes no current iterate).
    pub last_x: Vec<f64>,
    pub snapshot_interval_s: Option<f64>,
    pub last_snapshot: Option<std::time::Instant>,
}
impl SolverNlp {
    fn remember(&mut self, x: &[f64]) {
        if self.snapshot_interval_s.is_some() {
            self.last_x.clear();
            self.last_x.extend_from_slice(x);
        }
    }
    fn due_snapshot(&mut self) -> Option<ProgressSnapshot> {
        let interval = self.snapshot_interval_s?;
        if self.last_x.is_empty()
            || self
                .last_snapshot
                .is_some_and(|t| t.elapsed().as_secs_f64() < interval)
        {
            return None;
        }
        self.last_snapshot = Some(std::time::Instant::now());
        self.model.snapshot(&self.last_x)
    }
}

impl TNLP for SolverNlp {
    fn get_nlp_info(&mut self) -> Option<NlpInfo> {
        let l = self.model.layout();
        Some(NlpInfo {
            n: l.initial.len().try_into().ok()?,
            m: l.g_lower.len().try_into().ok()?,
            nnz_jac_g: l.jacobian.len().try_into().ok()?,
            nnz_h_lag: if self.exact_hessian {
                self.model.hessian_structure().len().try_into().ok()?
            } else {
                0
            },
            index_style: IndexStyle::C,
        })
    }
    fn get_bounds_info(&mut self, b: BoundsInfo<'_>) -> bool {
        let l = self.model.layout();
        b.x_l.copy_from_slice(&l.x_lower);
        b.x_u.copy_from_slice(&l.x_upper);
        b.g_l.copy_from_slice(&l.g_lower);
        b.g_u.copy_from_slice(&l.g_upper);
        true
    }
    fn get_starting_point(&mut self, s: StartingPoint<'_>) -> bool {
        if s.init_z || s.init_lambda {
            return false;
        }
        if s.init_x {
            s.x.copy_from_slice(&self.model.layout().initial);
        }
        true
    }
    fn eval_f(&mut self, x: &[f64], _: bool) -> Option<f64> {
        self.remember(x);
        let f = self.model.objective(x);
        f.is_finite().then_some(f)
    }
    fn eval_grad_f(&mut self, x: &[f64], _: bool, out: &mut [f64]) -> bool {
        self.model.gradient(x, out);
        out.iter().all(|v| v.is_finite())
    }
    fn eval_g(&mut self, x: &[f64], _: bool, out: &mut [f64]) -> bool {
        self.remember(x);
        self.model.constraints(x, out);
        out.iter().all(|v| v.is_finite())
    }
    fn eval_jac_g(&mut self, x: Option<&[f64]>, _: bool, mode: SparsityRequest<'_>) -> bool {
        match mode {
            SparsityRequest::Structure { irow, jcol } => {
                for (k, &(r, c)) in self.model.layout().jacobian.iter().enumerate() {
                    irow[k] = r;
                    jcol[k] = c;
                }
                true
            }
            SparsityRequest::Values { values } => {
                let Some(x) = x else {
                    return false;
                };
                self.model.jacobian(x, values);
                values.iter().all(|v| v.is_finite())
            }
        }
    }
    fn eval_h(
        &mut self,
        x: Option<&[f64]>,
        _: bool,
        obj_factor: f64,
        lambda: Option<&[f64]>,
        _: bool,
        mode: SparsityRequest<'_>,
    ) -> bool {
        self.hessian_calls += 1;
        match mode {
            SparsityRequest::Structure { irow, jcol } => {
                for (i, (r, c)) in self.model.hessian_structure().into_iter().enumerate() {
                    irow[i] = r;
                    jcol[i] = c;
                }
                !irow.is_empty()
            }
            SparsityRequest::Values { values } => {
                let (Some(x), Some(lambda)) = (x, lambda) else {
                    return false;
                };
                self.model.hessian(x, obj_factor, lambda, values);
                values.iter().all(|v| v.is_finite())
            }
        }
    }
    fn get_var_con_metadata(&mut self, var: &mut MetaData, con: &mut MetaData) -> bool {
        var.strings
            .insert(IDX_NAMES.into(), self.model.layout().variables.clone());
        con.strings
            .insert(IDX_NAMES.into(), self.model.layout().constraints.clone());
        true
    }
    fn intermediate_callback(&mut self, s: IterStats, _: &IpoptData, _: &IpoptCq) -> bool {
        let record = IterationRecord {
            iteration: s.iter,
            restoration: s.mode == pounce_nlp::AlgorithmMode::RestorationPhaseMode,
            objective: s.obj_value,
            primal_infeasibility: s.inf_pr,
            dual_infeasibility: s.inf_du,
        };
        let snapshot = self.due_snapshot();
        let keep_going = (self.callback)(&record, snapshot.as_ref())
            && self
                .stop_after
                .is_none_or(|stop| i64::from(s.iter) < i64::from(stop));
        self.history.push(record);
        keep_going
    }
    fn finalize_solution(&mut self, s: Solution<'_>, _: &IpoptData, _: &IpoptCq) {
        self.solution = Some(FullSolution {
            x: s.x.to_vec(),
            z_lower: s.z_l.to_vec(),
            z_upper: s.z_u.to_vec(),
            constraints: s.g.to_vec(),
            lambda: s.lambda.to_vec(),
            objective: s.obj_value,
            solver_return: format!("{:?}", s.status),
        });
    }
}

pub struct Hs071 {
    layout: Layout,
}
impl Default for Hs071 {
    fn default() -> Self {
        Self {
            layout: Layout {
                variables: (1..=4).map(|i| format!("x{i}")).collect(),
                constraints: vec!["product_minimum".into(), "squared_norm".into()],
                x_lower: vec![1.0; 4],
                x_upper: vec![5.0; 4],
                g_lower: vec![25.0, 40.0],
                g_upper: vec![1e19, 40.0],
                initial: vec![1.0, 5.0, 5.0, 1.0],
                jacobian: (0..2).flat_map(|r| (0..4).map(move |c| (r, c))).collect(),
            },
        }
    }
}
impl NlpModel for Hs071 {
    fn layout(&self) -> &Layout {
        &self.layout
    }
    fn objective(&self, x: &[f64]) -> f64 {
        x[0] * x[3] * (x[0] + x[1] + x[2]) + x[2]
    }
    fn gradient(&self, x: &[f64], g: &mut [f64]) {
        g.copy_from_slice(&[
            x[3] * (2.0 * x[0] + x[1] + x[2]),
            x[0] * x[3],
            x[0] * x[3] + 1.0,
            x[0] * (x[0] + x[1] + x[2]),
        ]);
    }
    fn constraints(&self, x: &[f64], g: &mut [f64]) {
        g[0] = x.iter().product();
        g[1] = x.iter().map(|v| v * v).sum();
    }
    fn jacobian(&self, x: &[f64], g: &mut [f64]) {
        for j in 0..4 {
            g[j] = (0..4).filter(|&k| k != j).map(|k| x[k]).product();
            g[4 + j] = 2.0 * x[j];
        }
    }
    fn hessian_structure(&self) -> Vec<(i32, i32)> {
        (0..4).flat_map(|r| (0..=r).map(move |c| (r, c))).collect()
    }
    fn hessian(&self, x: &[f64], factor: f64, lambda: &[f64], out: &mut [f64]) {
        let mut k = 0;
        for r in 0..4 {
            for c in 0..=r {
                let objective = match (r, c) {
                    (0, 0) => 2.0 * x[3],
                    (1, 0) | (2, 0) => x[3],
                    (3, 0) => 2.0 * x[0] + x[1] + x[2],
                    (3, 1) | (3, 2) => x[0],
                    _ => 0.0,
                };
                let product = if r == c {
                    0.0
                } else {
                    (0..4).filter(|&i| i != r && i != c).map(|i| x[i]).product()
                };
                out[k] = factor * objective
                    + lambda[0] * product
                    + if r == c { 2.0 * lambda[1] } else { 0.0 };
                k += 1;
            }
        }
    }
}
