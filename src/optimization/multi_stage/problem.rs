use super::super::{
    events::{StageInventory, constant_mass_flow},
    problem::{DurationBounds, PhaseMode},
    single_stage::FlightTolerances,
};
use crate::{
    config::{Config, FreeFlight, NoFiles},
    vehicle::{NormalForce, Vehicle},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum EndEvent {
    None,
    SeparateStage,
    JettisonFairing,
    DeployPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Phase {
    pub name: String,
    pub stage: usize,
    pub mode: PhaseMode,
    pub duration_s: DurationBounds,
    pub intervals: usize,
    pub vertical: bool,
    pub end_event: EndEvent,
    pub max_angle_of_attack_deg: f64,
    pub max_specific_force_m_s2: f64,
    pub min_altitude_m: f64,
    pub initial_attitude_end_deg: [f64; 2],
}
impl Phase {
    pub fn powered(&self) -> bool {
        matches!(self.mode, PhaseMode::Burn)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct OrbitTarget {
    pub reference_radius_m: f64,
    pub altitude_m: f64,
    pub inclination_deg: f64,
    pub radius_tolerance_m: f64,
    pub speed_tolerance_m_s: f64,
    pub radial_velocity_tolerance_m_s: f64,
    pub inclination_tolerance_deg: f64,
    pub apsis_tolerance_m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct MultiStageProblem {
    pub vehicle: Config,
    pub data_source: String,
    pub stages: Vec<StageInventory>,
    pub net_payload_kg: DurationBounds,
    pub payload_adapter_kg: f64,
    pub fairing_kg: f64,
    pub fairing_off_area_scale: f64,
    pub fairing_release_min_altitude_m: f64,
    pub phases: Vec<Phase>,
    pub orbit: OrbitTarget,
    pub degree: usize,
    pub initial_azimuth_deg: f64,
    pub azimuth_bounds_deg: [f64; 2],
    pub elevation_bounds_deg: [f64; 2],
    pub max_dynamic_pressure_pa: f64,
    pub max_azimuth_rate_deg_s: f64,
    pub max_elevation_rate_deg_s: f64,
    pub max_inertial_direction_rate_deg_s: f64,
    pub validation: FlightTolerances,
}
fn valid_bounds(b: &DurationBounds, min: f64) -> bool {
    [b.lower, b.initial, b.upper].iter().all(|v| v.is_finite())
        && b.lower >= min
        && b.upper >= b.lower
        && (b.lower..=b.upper).contains(&b.initial)
}
impl MultiStageProblem {
    pub fn load_vehicle(&self) -> Result<Vehicle, String> {
        let limits = [
            self.max_dynamic_pressure_pa,
            self.max_azimuth_rate_deg_s,
            self.max_elevation_rate_deg_s,
            self.max_inertial_direction_rate_deg_s,
            self.validation.position_m,
            self.validation.velocity_m_s,
            self.validation.mass_kg,
            self.validation.dynamic_pressure_pa,
            self.validation.angle_of_attack_deg,
            self.validation.specific_force_m_s2,
            self.validation.pitch_rate_deg_s,
            self.orbit.reference_radius_m,
            self.orbit.altitude_m,
            self.orbit.radius_tolerance_m,
            self.orbit.speed_tolerance_m_s,
            self.orbit.radial_velocity_tolerance_m_s,
            self.orbit.inclination_tolerance_deg,
            self.orbit.apsis_tolerance_m,
            self.fairing_off_area_scale,
        ];
        if !limits.iter().all(|v| v.is_finite() && *v > 0.0)
            || !valid_bounds(&self.net_payload_kg, 1.0)
            || self.data_source.trim().is_empty()
            || !(2..=4).contains(&self.stages.len())
            || !(3..=16).contains(&self.phases.len())
            || !(3..=8).contains(&self.degree)
            || !self.payload_adapter_kg.is_finite()
            || self.payload_adapter_kg < 0.0
            || !self.fairing_kg.is_finite()
            || self.fairing_kg < 0.0
            || !self.fairing_release_min_altitude_m.is_finite()
            || self.fairing_release_min_altitude_m < 0.0
            || !(1.0..89.0).contains(&self.orbit.inclination_deg)
        {
            return Err(
                "multi_stage: invalid inventory, orbit, mesh, bounds, tolerances or source".into(),
            );
        }
        for bounds in [self.azimuth_bounds_deg, self.elevation_bounds_deg] {
            if !bounds.iter().all(|v| v.is_finite())
                || bounds[0] >= bounds[1]
                || bounds[1] - bounds[0] > 360.0
            {
                return Err("invalid continuous angle bounds".into());
            }
        }
        if self.elevation_bounds_deg[0] < -90.0
            || self.elevation_bounds_deg[1] != 90.0
            || !(self.azimuth_bounds_deg[0]..=self.azimuth_bounds_deg[1])
                .contains(&self.initial_azimuth_deg)
        {
            return Err("multi_stage requires a continuous azimuth range and elevation bounds ending at 90 degrees".into());
        }
        let (v, warnings) = Vehicle::load(&self.vehicle, &NoFiles)
            .map_err(|r| format!("multi_stage.vehicle: {:?}", r.errors))?;
        if !warnings.is_empty() {
            return Err(format!("unresolved vehicle warnings: {warnings:?}"));
        }
        if v.stages.len() != self.stages.len()
            || v.launch.rail_length != 0.0
            || v.launch.velocity_ned.norm() > 1e-12
        {
            return Err("multi_stage requires matching stage inventories, no rail and zero initial Earth-relative velocity".into());
        }
        for (i, (inventory, s)) in self.stages.iter().zip(&v.stages).enumerate() {
            inventory.validate()?;
            let e = s.engine.as_ref().ok_or("each stage needs an engine")?;
            if (s.mass_initial - inventory.wet()).abs() > 1e-6
                || s.mass_dry
                    .is_none_or(|d| (d - inventory.dry_kg).abs() > 1e-6)
                || !s.jettisons.is_empty()
                || s.trim.is_some()
                || !matches!(s.aero.normal, NormalForce::Slope(_))
                || s.free_flight != FreeFlight::AttitudeProgram
                || !e.thrust.is_constant()
                || !e.isp.is_constant()
                || e.thrust.eval(0.0) <= 0.0
                || e.isp.eval(0.0) <= 0.0
                || e.burn_start != 0.0
                || (e.burn_end - inventory.max_total_burn_s).abs() > 1e-8
                || constant_mass_flow(s) * inventory.max_total_burn_s
                    > inventory.propellant_kg - inventory.reserve_kg + 1e-6
            {
                return Err(format!(
                    "stage {i}: require matching mass ledger, constant positive engine, explicit maximum on-time, attitude_program coast, CN-alpha, no legacy jettisons or trim"
                ));
            }
        }
        let mut active = 0;
        let mut fairing = self.fairing_kg > 0.0;
        let mut ignitions = vec![0; self.stages.len()];
        let mut was_powered = false;
        let mut burn_min = vec![0.0; self.stages.len()];
        let mut total_max = 0.0;
        let mut count = 0;
        for (i, p) in self.phases.iter().enumerate() {
            if p.stage != active
                || !valid_bounds(&p.duration_s, 0.01)
                || !(1..=16).contains(&p.intervals)
                || !(0.0..90.0).contains(&p.max_angle_of_attack_deg)
                || p.max_angle_of_attack_deg == 0.0
                || !p.max_specific_force_m_s2.is_finite()
                || p.max_specific_force_m_s2 <= 0.0
                || !p.min_altitude_m.is_finite()
                || p.min_altitude_m < v.launch.llh.z
                || p.name.is_empty()
            {
                return Err(format!(
                    "phase {i}: invalid duration, limits or stage order"
                ));
            }
            for (c, b) in [self.azimuth_bounds_deg, self.elevation_bounds_deg]
                .iter()
                .enumerate()
            {
                if !(b[0]..=b[1]).contains(&p.initial_attitude_end_deg[c]) {
                    return Err(format!("phase {i}: seed command outside angle bounds"));
                }
            }
            if p.vertical != (i == 0)
                || (p.vertical
                    && (!p.powered()
                        || p.duration_s.lower != p.duration_s.upper
                        || p.initial_attitude_end_deg != [self.initial_azimuth_deg, 90.0]))
            {
                return Err("only the initial fixed burn phase may be vertical".into());
            }
            if p.powered() {
                burn_min[active] += p.duration_s.lower;
                if !was_powered {
                    ignitions[active] += 1;
                }
            }
            was_powered = p.powered();
            total_max += p.duration_s.upper;
            count += p.intervals;
            match p.end_event {
                EndEvent::SeparateStage => {
                    if active + 1 >= self.stages.len() {
                        return Err(
                            "cannot discard the final stage before payload deployment".into()
                        );
                    }
                    active += 1;
                    was_powered = false;
                }
                EndEvent::JettisonFairing => {
                    if !fairing {
                        return Err("fairing must be carried and jettisoned exactly once".into());
                    }
                    fairing = false;
                }
                EndEvent::DeployPayload => {
                    if i + 1 != self.phases.len() || active + 1 != self.stages.len() || fairing {
                        return Err("deployment must be the final event, after all stage separations and fairing jettison".into());
                    }
                }
                EndEvent::None => {}
            }
        }
        if self.phases.last().unwrap().end_event != EndEvent::DeployPayload
            || count > 64
            || total_max > v.end_time
            || !total_max.is_finite()
        {
            return Err("invalid final event, time horizon or total mesh size".into());
        }
        for i in 0..self.stages.len() {
            if ignitions[i] == 0
                || ignitions[i] > self.stages[i].max_ignitions
                || burn_min[i] > self.stages[i].max_total_burn_s
            {
                return Err(format!(
                    "stage {i}: prescribed sequence exceeds ignition/on-time limits"
                ));
            }
        }
        if !(self.initial_mass(self.net_payload_kg.upper)).is_finite() {
            return Err("stack mass overflow".into());
        }
        Ok(v)
    }
    pub fn initial_mass(&self, payload: f64) -> f64 {
        self.stages.iter().map(StageInventory::wet).sum::<f64>()
            + payload
            + self.payload_adapter_kg
            + self.fairing_kg
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input() -> MultiStageProblem {
        let crate::optimization::problem::Problem::MultiStage(p) =
            serde_json::from_str::<crate::optimization::problem::OptimizationRequest>(
                include_str!("../../../examples/optimization/two_stage_500km_43deg.json"),
            )
            .unwrap()
            .problem
        else {
            panic!()
        };
        *p
    }
    #[test]
    fn reject_inconsistent_inventory_and_unsafe_event_sequences() {
        assert!(input().load_vehicle().is_ok());
        for change in 0..8 {
            let mut p = input();
            match change {
                0 => p.stages[0].dry_kg += 1.0,
                1 => p.stages[1].reserve_kg = p.stages[1].propellant_kg,
                2 => p.stages[1].max_ignitions = 1,
                3 => p.phases[2].end_event = EndEvent::None,
                4 => p.phases[4].end_event = EndEvent::None,
                5 => p.phases.last_mut().unwrap().end_event = EndEvent::None,
                6 => p.phases[4].duration_s.lower = 299.0,
                _ => p.phases[5].stage = 0,
            }
            assert!(p.load_vehicle().is_err(), "case {change}");
        }
    }
}
