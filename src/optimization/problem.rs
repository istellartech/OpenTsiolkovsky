//! Versioned optimization inputs, independent of the simulation configuration.
use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct OptimizationRequest {
    pub schema_version: u32,
    pub run_id: String,
    pub problem: Problem,
    #[serde(default)]
    pub solver: SolverSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Problem {
    Hs071 {},
    DoubleIntegrator(DoubleIntegratorProblem),
    SingleStage(Box<super::single_stage::SingleStageProblem>),
    MultiStage(Box<super::multi_stage::MultiStageProblem>),
}

/// Analytic optimal-control benchmark: min integral a^2 dt + time_cost*T,
/// x'=v, v'=a, (x,v)(0)=(0,0), (x,v)(T)=(distance,0).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct DoubleIntegratorProblem {
    pub distance_m: f64,
    pub duration_s: DurationBounds,
    pub time_cost: f64,
    pub intervals: usize,
    pub degree: usize,
    /// Physical validation limits, independent of NLP scaling and solver tol.
    pub position_tolerance_m: f64,
    pub velocity_tolerance_m_s: f64,
}

impl DoubleIntegratorProblem {
    pub fn validate(&self) -> Result<(), String> {
        let d = &self.duration_s;
        if !self.distance_m.is_finite()
            || self.distance_m <= 0.0
            || !d.lower.is_finite()
            || !d.upper.is_finite()
            || !d.initial.is_finite()
            || d.lower <= 0.0
            || d.upper < d.lower
            || !(d.lower..=d.upper).contains(&d.initial)
            || !self.time_cost.is_finite()
            || self.time_cost < 0.0
            || !(1..=16).contains(&self.intervals)
            || !(3..=8).contains(&self.degree)
            || !self.position_tolerance_m.is_finite()
            || self.position_tolerance_m <= 0.0
            || !self.velocity_tolerance_m_s.is_finite()
            || self.velocity_tolerance_m_s <= 0.0
        {
            return Err(
                "invalid double-integrator data, mesh, duration or validation tolerances".into(),
            );
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(default, deny_unknown_fields)]
pub struct SolverSettings {
    pub max_iterations: u32,
    pub tolerance: f64,
    pub derivative_test: bool,
    /// Deterministic callback cancellation, also used to test the WASI ABI.
    pub stop_after_iteration: Option<u32>,
    #[serde(
        default,
        skip_serializing_if = "super::scaling::ScalingSettings::is_default"
    )]
    pub scaling: super::scaling::ScalingSettings,
    #[serde(default, skip_serializing_if = "HessianMethod::is_default")]
    pub hessian: HessianMethod,
    #[serde(default, skip_serializing_if = "KktScaling::is_default")]
    pub kkt_scaling: KktScaling,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum HessianMethod {
    #[default]
    LimitedMemory,
    Exact,
}
impl HessianMethod {
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }
}
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum KktScaling {
    #[default]
    UpstreamDefault,
    None,
    Ruiz,
    SlackBased,
}
impl KktScaling {
    pub fn is_default(&self) -> bool {
        *self == Self::default()
    }
}

impl Default for SolverSettings {
    fn default() -> Self {
        Self {
            max_iterations: 300,
            tolerance: 1e-8,
            derivative_test: false,
            stop_after_iteration: None,
            scaling: Default::default(),
            hessian: Default::default(),
            kkt_scaling: Default::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum PhaseMode {
    Burn,
    Coast,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct DurationBounds {
    pub initial: f64,
    pub lower: f64,
    pub upper: f64,
}

impl OptimizationRequest {
    pub fn validate(&self) -> Result<(), String> {
        self.solver.scaling.validate()?;
        if self.solver.hessian == HessianMethod::Exact
            && !matches!(
                self.problem,
                Problem::Hs071 {} | Problem::DoubleIntegrator(_)
            )
        {
            return Err(
                "exact Hessian is currently supported for HS071 and double_integrator only".into(),
            );
        }
        if self.schema_version != SCHEMA_VERSION {
            return Err(format!(
                "unsupported schema_version: {}",
                self.schema_version
            ));
        }
        if self.run_id.is_empty() || self.run_id.len() > 128 {
            return Err("run_id must contain 1..128 bytes".into());
        }
        if !(1..=100_000).contains(&self.solver.max_iterations)
            || !self.solver.tolerance.is_finite()
            || !(1e-12..=1e-3).contains(&self.solver.tolerance)
        {
            return Err("invalid solver budget or tolerance (allowed: 1e-12..1e-3)".into());
        }
        if let Problem::MultiStage(p) = &self.problem {
            p.load_vehicle()?;
        }
        if let Problem::SingleStage(p) = &self.problem {
            p.load_vehicle()?;
        }
        if let Problem::DoubleIntegrator(p) = &self.problem {
            p.validate()?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn input_schema_rejects_unknown_fields_and_invalid_numeric_settings() {
        let mut value: serde_json::Value =
            serde_json::from_str(include_str!("../../examples/optimization/hs071.json")).unwrap();
        value["problem"]["misspelled_option"] = true.into();
        assert!(serde_json::from_value::<OptimizationRequest>(value).is_err());
        let mut request: OptimizationRequest = serde_json::from_str(include_str!(
            "../../examples/optimization/double_integrator.json"
        ))
        .unwrap();
        request.solver.tolerance = 0.0;
        assert!(request.validate().is_err());
        request.solver.tolerance = 1e-8;
        let Problem::DoubleIntegrator(p) = &mut request.problem else {
            panic!()
        };
        p.duration_s.lower = -1.0;
        assert!(request.validate().is_err());
    }
}
