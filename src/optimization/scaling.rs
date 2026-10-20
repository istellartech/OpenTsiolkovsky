//! Explicit coordinate maps around the existing S0 transcriptions. Bounds with
//! infinite semantics are never converted into finite bounds by scaling.
use super::{
    FullSolution,
    tnlp::{Layout, NlpModel},
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const INFINITY_BOUND: f64 = 1e19;
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum ScalingStrategy {
    #[default]
    S0,
    S1Bounds,
    S1Guess,
    S2,
    S3,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(default, deny_unknown_fields)]
pub struct ScalingSettings {
    pub strategy: ScalingStrategy,
    pub floor: f64,
    pub cap: f64,
    pub gradient_max: f64,
    pub gradient_min: f64,
}
impl Default for ScalingSettings {
    fn default() -> Self {
        Self {
            strategy: ScalingStrategy::S0,
            floor: 1e-6,
            cap: 1e6,
            gradient_max: 100.0,
            gradient_min: 1e-8,
        }
    }
}
impl ScalingSettings {
    pub fn is_default(&self) -> bool {
        self == &Self::default()
    }
    pub fn validate(&self) -> Result<(), String> {
        if ![self.floor, self.cap, self.gradient_max, self.gradient_min]
            .iter()
            .all(|v| v.is_finite() && *v > 0.0)
            || self.floor > 1.0
            || self.cap < 1.0
            || self.floor > self.cap
            || self.gradient_min > 1.0
        {
            return Err("invalid scaling floor/cap/gradient settings".into());
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Coordinate {
    pub offset: f64,
    pub scale: f64,
    pub unit: String,
}
impl Coordinate {
    pub fn new(scale: f64, unit: &str) -> Self {
        Self {
            offset: 0.0,
            scale,
            unit: unit.into(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicalCoordinates {
    pub variables: Vec<Coordinate>,
    /// Physical residuals, not replacements for the nonlinear observables in
    /// the independent validator (e.g. a cone residual is dimensionless).
    pub constraints: Vec<Coordinate>,
    pub objective: Coordinate,
}
impl PhysicalCoordinates {
    pub fn dimensionless(l: &Layout) -> Self {
        Self {
            variables: vec![Coordinate::new(1.0, "1"); l.initial.len()],
            constraints: vec![Coordinate::new(1.0, "1"); l.constraints.len()],
            objective: Coordinate::new(1.0, "1"),
        }
    }
    pub fn solution(&self, s: &FullSolution) -> PhysicalSolution {
        PhysicalSolution {
            x: s.x
                .iter()
                .zip(&self.variables)
                .map(|(x, c)| c.offset + c.scale * x)
                .collect(),
            constraints: s
                .constraints
                .iter()
                .zip(&self.constraints)
                .map(|(g, c)| c.offset + c.scale * g)
                .collect(),
            objective: s.objective * self.objective.scale,
            z_lower: s
                .z_lower
                .iter()
                .zip(&self.variables)
                .map(|(z, c)| z * self.objective.scale / c.scale)
                .collect(),
            z_upper: s
                .z_upper
                .iter()
                .zip(&self.variables)
                .map(|(z, c)| z * self.objective.scale / c.scale)
                .collect(),
            lambda: s
                .lambda
                .iter()
                .zip(&self.constraints)
                .map(|(z, c)| z * self.objective.scale / c.scale)
                .collect(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicalSolution {
    pub x: Vec<f64>,
    pub constraints: Vec<f64>,
    pub objective: f64,
    pub z_lower: Vec<f64>,
    pub z_upper: Vec<f64>,
    pub lambda: Vec<f64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScalingReport {
    pub version: u32,
    pub settings: ScalingSettings,
    pub reference_points: Vec<Vec<f64>>,
    /// base S0 x = offset + gain * solver x.
    pub variable_offset: Vec<f64>,
    pub variable_gain: Vec<f64>,
    /// Application transformation only. The pounce layer is separate below.
    pub row_gain: Vec<f64>,
    pub objective_gain: f64,
    pub pounce_row_gain: Vec<f64>,
    pub pounce_objective_gain: f64,
    pub coefficient_source: String,
    pub physical_coordinates: PhysicalCoordinates,
}
impl ScalingReport {
    pub fn restore(&self, s: &FullSolution) -> FullSolution {
        let f = self.objective_gain;
        FullSolution {
            x: s.x
                .iter()
                .enumerate()
                .map(|(i, &v)| self.variable_offset[i] + self.variable_gain[i] * v)
                .collect(),
            constraints: s
                .constraints
                .iter()
                .zip(&self.row_gain)
                .map(|(g, r)| g / r)
                .collect(),
            objective: s.objective / f,
            lambda: s
                .lambda
                .iter()
                .zip(&self.row_gain)
                .map(|(v, r)| v * r / f)
                .collect(),
            z_lower: s
                .z_lower
                .iter()
                .zip(&self.variable_gain)
                .map(|(v, g)| v / g / f)
                .collect(),
            z_upper: s
                .z_upper
                .iter()
                .zip(&self.variable_gain)
                .map(|(v, g)| v / g / f)
                .collect(),
            solver_return: s.solver_return.clone(),
        }
    }
}
pub struct ScaledModel {
    pub base: Box<dyn NlpModel>,
    layout: Layout,
    pub report: ScalingReport,
}
fn transformed_bound(value: f64, offset: f64, gain: f64, variable: bool) -> Result<f64, String> {
    if value.abs() >= INFINITY_BOUND {
        return Ok(value);
    }
    let result = if variable {
        (value - offset) / gain
    } else {
        value * gain
    };
    if !result.is_finite() || result.abs() >= INFINITY_BOUND {
        return Err("scaling moves a finite bound across the infinity threshold".into());
    }
    Ok(result)
}
fn family(name: &str) -> String {
    let mut result = String::new();
    let mut inside = false;
    for c in name.chars() {
        match c {
            '[' => inside = true,
            ']' => inside = false,
            _ => {
                if !inside {
                    result.push(c)
                }
            }
        }
    }
    result
}
impl ScaledModel {
    fn apply_map(&mut self) -> Result<(), String> {
        self.layout = self.base.layout().clone();
        for i in 0..self.layout.initial.len() {
            self.layout.initial[i] = (self.layout.initial[i] - self.report.variable_offset[i])
                / self.report.variable_gain[i];
            self.layout.x_lower[i] = transformed_bound(
                self.layout.x_lower[i],
                self.report.variable_offset[i],
                self.report.variable_gain[i],
                true,
            )?;
            self.layout.x_upper[i] = transformed_bound(
                self.layout.x_upper[i],
                self.report.variable_offset[i],
                self.report.variable_gain[i],
                true,
            )?;
        }
        for i in 0..self.layout.constraints.len() {
            self.layout.g_lower[i] =
                transformed_bound(self.layout.g_lower[i], 0.0, self.report.row_gain[i], false)?;
            self.layout.g_upper[i] =
                transformed_bound(self.layout.g_upper[i], 0.0, self.report.row_gain[i], false)?;
        }
        Ok(())
    }

    pub fn new(base: Box<dyn NlpModel>, settings: ScalingSettings) -> Result<Self, String> {
        settings.validate()?;
        let l = base.layout();
        let n = l.initial.len();
        let m = l.constraints.len();
        let mut offset = vec![0.0; n];
        let mut gain = vec![1.0; n];
        if matches!(
            settings.strategy,
            ScalingStrategy::S1Bounds | ScalingStrategy::S1Guess
        ) {
            let mut ranges: BTreeMap<String, (f64, f64)> = BTreeMap::new();
            for (name, &x) in l.variables.iter().zip(&l.initial) {
                let r = ranges.entry(family(name)).or_insert((x, x));
                r.0 = r.0.min(x);
                r.1 = r.1.max(x);
            }
            for i in 0..n {
                let (lo, hi) = (l.x_lower[i], l.x_upper[i]);
                if lo == hi {
                    offset[i] = lo;
                    continue;
                }
                let finite = lo.abs() < INFINITY_BOUND && hi.abs() < INFINITY_BOUND;
                let (center, width) = if settings.strategy == ScalingStrategy::S1Bounds && finite {
                    (lo * 0.5 + hi * 0.5, hi * 0.5 - lo * 0.5)
                } else {
                    let (a, b) = ranges[&family(&l.variables[i])];
                    (
                        a * 0.5 + b * 0.5,
                        (b * 0.5 - a * 0.5).max(l.initial[i].abs()).max(1.0),
                    )
                };
                offset[i] = center;
                gain[i] = width.clamp(settings.floor, settings.cap);
            }
        }
        let mut references = vec![l.initial.clone()];
        let mut rows = vec![1.0; m];
        if settings.strategy == ScalingStrategy::S2 {
            for sign in [-1.0, 1.0] {
                let p = l
                    .initial
                    .iter()
                    .enumerate()
                    .map(|(i, &x)| {
                        if l.x_lower[i] == l.x_upper[i] {
                            l.x_lower[i]
                        } else {
                            (x + sign * 0.001 * x.abs().max(1.0)).clamp(l.x_lower[i], l.x_upper[i])
                        }
                    })
                    .collect();
                references.push(p);
            }
            let mut norms: BTreeMap<String, f64> = BTreeMap::new();
            for point in &references {
                let mut j = vec![0.0; l.jacobian.len()];
                base.jacobian(point, &mut j);
                if j.iter().any(|v| !v.is_finite()) {
                    return Err("non-finite representative Jacobian for S2".into());
                }
                for (&(r, _), value) in l.jacobian.iter().zip(j) {
                    let e = norms.entry(family(&l.constraints[r as usize])).or_default();
                    *e = e.max(value.abs());
                }
            }
            for (r, name) in l.constraints.iter().enumerate() {
                let norm = norms.get(&family(name)).copied().unwrap_or(0.0);
                rows[r] = if norm <= settings.floor {
                    1.0
                } else {
                    (1.0 / norm).clamp(settings.floor, settings.cap)
                }
            }
        }
        let coordinates = base.coordinates();
        if coordinates.variables.len() != n
            || coordinates.constraints.len() != m
            || coordinates
                .variables
                .iter()
                .chain(&coordinates.constraints)
                .chain(std::iter::once(&coordinates.objective))
                .any(|c| !c.offset.is_finite() || !c.scale.is_finite() || c.scale <= 0.0)
        {
            return Err("invalid physical coordinate map".into());
        }
        let mut model = Self {
            layout: l.clone(),
            report: ScalingReport {
                version: 1,
                settings: settings.clone(),
                reference_points: references,
                variable_offset: offset,
                variable_gain: gain,
                row_gain: rows,
                objective_gain: 1.0,
                pounce_row_gain: vec![1.0; m],
                pounce_objective_gain: 1.0,
                coefficient_source:
                    "fixed application map; S2 uses 3 points and constraint-family maxima".into(),
                physical_coordinates: coordinates,
            },
            base,
        };
        model.apply_map()?;
        if settings.strategy == ScalingStrategy::S3 {
            // Same public routines, fixed-variable lifting and full-row maxima
            // used by the pinned pounce OrigIpoptNlp. Solver output is already
            // unscaled from this layer: do not apply these factors twice.
            let mut x = model.layout.initial.clone();
            for (i, v) in x.iter_mut().enumerate() {
                if model.layout.x_lower[i] == model.layout.x_upper[i] {
                    *v = model.layout.x_lower[i]
                }
            }
            let mut grad = vec![0.0; n];
            model.gradient(&x, &mut grad);
            if grad.iter().any(|v| !v.is_finite()) {
                return Err("non-finite S3 initial objective gradient".into());
            }
            let norm = grad
                .iter()
                .enumerate()
                .filter(|(i, _)| model.layout.x_lower[*i] != model.layout.x_upper[*i])
                .map(|(_, v)| v.abs())
                .fold(0.0, f64::max);
            model.report.pounce_objective_gain = pounce_nlp::orig_ipopt_nlp::gradient_obj_scale(
                norm,
                settings.gradient_max,
                settings.gradient_min,
                0.0,
            );
            let mut j = vec![0.0; model.layout.jacobian.len()];
            model.jacobian(&x, &mut j);
            if j.iter().any(|v| !v.is_finite()) {
                return Err("non-finite S3 initial Jacobian".into());
            }
            let mut norms = vec![f64::MIN_POSITIVE; m];
            for (&(r, _), v) in model.layout.jacobian.iter().zip(j) {
                norms[r as usize] = norms[r as usize].max(v.abs())
            }
            model.report.pounce_row_gain = norms
                .iter()
                .map(|&v| {
                    pounce_nlp::orig_ipopt_nlp::gradient_row_scale(
                        v,
                        settings.gradient_max,
                        settings.gradient_min,
                        0.0,
                    )
                })
                .collect();
            model.report.coefficient_source="pounce 0.12.0 public gradient scaling functions at fixed-lifted initial point; pounce unscales its own outputs".into();
        }
        Ok(model)
    }
    pub fn to_base(&self, x: &[f64]) -> Vec<f64> {
        x.iter()
            .enumerate()
            .map(|(i, &v)| self.report.variable_offset[i] + self.report.variable_gain[i] * v)
            .collect()
    }
    pub fn restore(&self, s: &FullSolution) -> FullSolution {
        self.report.restore(s)
    }
}
impl NlpModel for ScaledModel {
    fn layout(&self) -> &Layout {
        &self.layout
    }
    fn objective(&self, x: &[f64]) -> f64 {
        self.base.objective(&self.to_base(x)) * self.report.objective_gain
    }
    fn gradient(&self, x: &[f64], out: &mut [f64]) {
        self.base.gradient(&self.to_base(x), out);
        for (i, v) in out.iter_mut().enumerate() {
            *v *= self.report.objective_gain * self.report.variable_gain[i]
        }
    }
    fn constraints(&self, x: &[f64], out: &mut [f64]) {
        self.base.constraints(&self.to_base(x), out);
        for (v, r) in out.iter_mut().zip(&self.report.row_gain) {
            *v *= r
        }
    }
    fn jacobian(&self, x: &[f64], out: &mut [f64]) {
        self.base.jacobian(&self.to_base(x), out);
        for (v, &(r, c)) in out.iter_mut().zip(&self.layout.jacobian) {
            *v *= self.report.row_gain[r as usize] * self.report.variable_gain[c as usize]
        }
    }
    fn hessian_structure(&self) -> Vec<(i32, i32)> {
        self.base.hessian_structure()
    }
    fn hessian(&self, x: &[f64], factor: f64, lambda: &[f64], out: &mut [f64]) {
        let lambda: Vec<_> = lambda
            .iter()
            .zip(&self.report.row_gain)
            .map(|(v, r)| v * r)
            .collect();
        self.base.hessian(
            &self.to_base(x),
            factor * self.report.objective_gain,
            &lambda,
            out,
        );
        for (v, (r, c)) in out.iter_mut().zip(self.hessian_structure()) {
            *v *= self.report.variable_gain[r as usize] * self.report.variable_gain[c as usize]
        }
    }
    fn coordinates(&self) -> PhysicalCoordinates {
        self.report.physical_coordinates.clone()
    }
    fn snapshot(&self, x: &[f64]) -> Option<super::ProgressSnapshot> {
        self.base.snapshot(&self.to_base(x))
    }
}

#[cfg(test)]
#[path = "scaling_tests.rs"]
mod tests;
