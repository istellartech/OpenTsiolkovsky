//! Conservative mass maps. No event resets the retained stack to a nominal mass.
use crate::{math::constants::G0, physics::Scalar, vehicle::StageModel};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct StageInventory {
    pub dry_kg: f64,
    pub propellant_kg: f64,
    pub reserve_kg: f64,
    pub max_total_burn_s: f64,
    pub max_ignitions: usize,
    pub source: String,
}
impl StageInventory {
    pub fn wet(&self) -> f64 {
        self.dry_kg + self.propellant_kg
    }
    pub fn validate(&self) -> Result<(), String> {
        if ![self.dry_kg, self.propellant_kg, self.max_total_burn_s]
            .iter()
            .all(|v| v.is_finite() && *v > 0.0)
            || !self.wet().is_finite()
            || !self.reserve_kg.is_finite()
            || !(0.0..self.propellant_kg).contains(&self.reserve_kg)
            || !(1..=8).contains(&self.max_ignitions)
            || self.source.trim().is_empty()
        {
            return Err("invalid stage inventory, engine operating limits or source".into());
        }
        Ok(())
    }
}

pub fn constant_mass_flow(stage: &StageModel) -> f64 {
    let e = stage.engine.as_ref().expect("validated engine");
    e.thrust.eval(0.0) / (e.isp.eval(0.0) * G0)
}

/// Dry hardware plus unused propellant leave together. The remaining propellant
/// is computed from its own inventory, not inferred from the retained mass.
pub fn separated_mass<T: Scalar>(inventory: &StageInventory, flow: f64, burn_time: T) -> T {
    T::from(inventory.wet()) - burn_time * flow
}

pub fn subtract_mass<T: Scalar>(before: &[T; 7], removed: T) -> [T; 7] {
    let mut after = *before;
    after[0] -= removed;
    after
}

#[cfg(test)]
mod tests {
    use super::*;
    use num_dual::Dual64;
    fn stage() -> StageInventory {
        StageInventory {
            dry_kg: 100.0,
            propellant_kg: 900.0,
            reserve_kg: 20.0,
            max_total_burn_s: 100.0,
            max_ignitions: 2,
            source: "test".into(),
        }
    }
    #[test]
    fn separation_discards_residual_without_resetting_retained_mass() {
        let inventory = stage();
        let consumed = 8.0 * 80.0;
        let before = [1500.0 - consumed, 6.4e6, 100.0, 200.0, 1.0, 5000.0, 1000.0];
        let removed = separated_mass(&inventory, 8.0, 80.0);
        let after = subtract_mass(&before, removed);
        assert_eq!(removed, 360.0);
        assert_eq!(after[0], 500.0);
        assert_eq!(after[1..], before[1..]);
        let mut perturbed = before;
        perturbed[0] += 0.25;
        assert_eq!(subtract_mass(&perturbed, removed)[0], 500.25);
        assert_eq!(before[0], after[0] + removed);
    }
    #[test]
    fn event_duration_derivative_preserves_upstream_mass_sensitivity() {
        let b = Dual64::new(80.0, 1.0);
        let before = [Dual64::new(860.0, -8.0); 7];
        let after = subtract_mass(&before, separated_mass(&stage(), 8.0, b));
        assert_eq!(after[0].re, 500.0);
        assert_eq!(after[0].eps, 0.0);
        assert_eq!(after[4].eps, -8.0);
    }
}
