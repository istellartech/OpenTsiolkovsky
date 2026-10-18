//! Flight events and impact points

use super::sample::Sample;
use crate::physics::orbit::OrbitalElements;
use serde::{Deserialize, Serialize};

/// What happened at a flight event
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    /// Engine ignition of a stage
    Ignition,
    /// The vehicle starts to move off the pad / along the rail
    Liftoff,
    /// The vehicle leaves the end of the launcher rail
    RailExit,
    /// Mach number rises through 1
    Mach1,
    /// Largest dynamic pressure of the flight
    MaxQ,
    /// End of powered flight (burn end or propellant depletion)
    Burnout,
    /// Stage separation (the event belongs to the stage that separates)
    Separation,
    /// A jettisoned body is released
    Jettison,
    /// Earth-relative vertical speed turns from up to down
    Apogee,
    /// Ground impact
    Impact,
}

impl EventKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Ignition => "ignition",
            Self::Liftoff => "liftoff",
            Self::RailExit => "rail_exit",
            Self::Mach1 => "mach1",
            Self::MaxQ => "max_q",
            Self::Burnout => "burnout",
            Self::Separation => "separation",
            Self::Jettison => "jettison",
            Self::Apogee => "apogee",
            Self::Impact => "impact",
        }
    }
}

/// A flight event and the vehicle state at that moment
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FlightEvent {
    pub kind: EventKind,
    /// Stage the event belongs to (1-based)
    pub stage: u8,
    pub time_s: f64,
    pub altitude_m: f64,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    /// Surface distance from the launch point [m]
    pub downrange_m: f64,
    pub speed_earth_mps: f64,
    pub speed_inertial_mps: f64,
    pub mach: f64,
    pub dynamic_pressure_pa: f64,
    pub mass_kg: f64,
    /// Name of the released body (jettison events)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// Osculating orbit (burnout and separation events)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub orbit: Option<OrbitalElements>,
}

impl FlightEvent {
    pub fn new(kind: EventKind, stage: u8, s: &Sample) -> Self {
        Self {
            kind,
            stage,
            time_s: s.time_s,
            altitude_m: s.altitude_m,
            latitude_deg: s.latitude_deg,
            longitude_deg: s.longitude_deg,
            downrange_m: s.downrange_m,
            speed_earth_mps: s.speed_earth_mps,
            speed_inertial_mps: s.speed_inertial_mps,
            mach: s.mach,
            dynamic_pressure_pa: s.dynamic_pressure_pa,
            mass_kg: s.mass_kg,
            body: None,
            orbit: None,
        }
    }
}

/// Ground impact of a body
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ImpactPoint {
    pub time_s: f64,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    /// Earth-relative speed at impact [m/s]
    pub speed_mps: f64,
}

/// Impact point of a trajectory that ends on the ground (a vehicle still
/// resting on the pad has none)
pub fn impact_point(trajectory: &[Sample]) -> Option<ImpactPoint> {
    let last = trajectory.last()?;
    if trajectory.len() < 2 || last.altitude_m > 1.0 || last.speed_earth_mps < 1e-3 {
        return None;
    }
    Some(ImpactPoint {
        time_s: last.time_s,
        latitude_deg: last.latitude_deg,
        longitude_deg: last.longitude_deg,
        speed_mps: last.speed_earth_mps,
    })
}
