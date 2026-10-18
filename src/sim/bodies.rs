//! Spent stages and jettisoned bodies, flown from release to the ground

use super::events::{ImpactPoint, impact_point};
use super::sample::Sample;
use super::{FALL_MAX_DURATION_S, Release, Simulator};
use crate::config::FreeFlight;
use serde::{Deserialize, Serialize};

/// Kind of body released from the vehicle
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BodyKind {
    /// Spent stage after separation
    Stage,
    /// Jettisoned body (fairing, ...)
    Jettison,
}

/// A released body and its flight to the ground
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Body {
    /// `stage<N>` for a spent stage, `stage<N>_<name>` for a jettisoned body
    pub id: String,
    pub kind: BodyKind,
    /// Stage the body comes from (1-based)
    pub stage: u8,
    pub release_time_s: f64,
    pub mass_kg: f64,
    /// `None` when the body does not come down (orbit, escape) within the
    /// propagation limit
    pub impact: Option<ImpactPoint>,
    pub trajectory: Vec<Sample>,
}

impl Simulator {
    /// Fly every body released during `run()` to the ground
    pub(super) fn fly_bodies(&self) -> Vec<Body> {
        self.releases.iter().map(|r| self.fly_body(r)).collect()
    }

    fn fly_body(&self, release: &Release) -> Body {
        let stage_no = (release.stage_idx + 1) as u8;
        let mut body = Body {
            id: release.name.clone(),
            kind: release.kind,
            stage: stage_no,
            release_time_s: release.time,
            mass_kg: release.mass,
            impact: None,
            trajectory: Vec::new(),
        };
        // Orbit or escape: no impact point, nothing to propagate
        if release.mass <= 0.0
            || Self::iip_of(&release.position, &release.velocity, release.time).is_none()
        {
            return body;
        }

        // The body flies on as an unpowered single stage with the
        // aerodynamics of its stage; a jettisoned body uses its ballistic
        // coefficient. A spent stage has no attitude control, so the
        // attitude program is replaced by an aerodynamically stable body:
        // holding the commanded attitude through re-entry is not physical
        // and makes the dynamics stiff (the airflow swings past 90 deg).
        let mut stage = self.vehicle.stages[release.stage_idx].clone();
        if stage.free_flight == FreeFlight::AttitudeProgram {
            stage.free_flight = FreeFlight::AeroStable;
        }
        if let Some(beta) = release.ballistic_coefficient {
            stage.free_flight = FreeFlight::Ballistic;
            stage.aero.ballistic_coefficient = beta;
        }
        stage.mass_initial = release.mass;
        stage.mass_dry = None;
        stage.engine = None;
        stage.separation_time = None;
        stage.jettisons.clear();
        stage.trim = None;

        let mut vehicle = self.vehicle.clone();
        vehicle.stages = vec![stage];
        vehicle.end_time = release.time + FALL_MAX_DURATION_S;

        let mut sim = Simulator::new(vehicle);
        sim.launcher.active = false;
        sim.stage_label = Some(stage_no);
        sim.state.time = release.time;
        sim.state.position = release.position;
        sim.state.velocity = release.velocity;
        sim.state.mass = release.mass;
        sim.run();

        body.impact = impact_point(&sim.trajectory);
        body.trajectory = std::mem::take(&mut sim.trajectory);
        body
    }
}
