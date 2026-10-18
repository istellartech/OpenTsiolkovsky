//! Result files: `trajectory.csv`, `summary.json`, `bodies/<id>.csv`
//!
//! The CSV columns are the [`Sample`] fields in order; the summary is
//! [`Summary`]. Monte Carlo runs add `montecarlo_cases.csv` and
//! `montecarlo_summary.json` ([`write_monte_carlo`]).

use crate::math::constants::G0;
use crate::montecarlo::MonteCarlo;
use crate::physics::orbit::{OrbitalElements, elements, gmst_rad};
use crate::sim::{BodyKind, EventKind, Flight, FlightEvent, ImpactPoint, Sample};
use crate::vehicle::Vehicle;
use nalgebra::Vector3;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Largest value of a quantity and when it occurred
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Peak {
    pub value: f64,
    pub time_s: f64,
}

/// Peaks of the vehicle's flight
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Maxima {
    /// Apogee altitude (located) [m]
    pub altitude_m: Peak,
    pub speed_earth_mps: Peak,
    pub speed_inertial_mps: Peak,
    pub mach: Peak,
    /// Max-Q (located) [Pa]
    pub dynamic_pressure_pa: Peak,
    /// Sensed acceleration [G]
    pub acceleration_g: Peak,
}

/// State at the end of the simulation
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FinalState {
    pub time_s: f64,
    pub mass_kg: f64,
    pub altitude_m: f64,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    pub speed_earth_mps: f64,
    pub speed_inertial_mps: f64,
    pub position_eci_m: [f64; 3],
    pub velocity_eci_mps: [f64; 3],
    /// Osculating Keplerian elements
    pub orbit: OrbitalElements,
}

/// A released body, without its trajectory
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct BodySummary {
    pub id: String,
    pub kind: BodyKind,
    pub stage: u8,
    pub release_time_s: f64,
    pub mass_kg: f64,
    pub impact: Option<ImpactPoint>,
}

/// Overview of a simulation (`summary.json`)
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Summary {
    pub name: String,
    /// Time of the last sample [s]
    pub flight_time_s: f64,
    /// Ground impact of the vehicle (`null` if it did not come down)
    pub impact: Option<ImpactPoint>,
    pub maxima: Maxima,
    pub final_state: FinalState,
    pub events: Vec<FlightEvent>,
    pub bodies: Vec<BodySummary>,
}

fn peak(trajectory: &[Sample], value: impl Fn(&Sample) -> f64) -> Peak {
    trajectory
        .iter()
        .map(|s| Peak {
            value: value(s),
            time_s: s.time_s,
        })
        .filter(|p| p.value.is_finite())
        .max_by(|a, b| a.value.total_cmp(&b.value))
        .unwrap_or(Peak {
            value: f64::NAN,
            time_s: f64::NAN,
        })
}

/// The larger of a sampled peak and the located events of a kind
fn with_events(
    sampled: Peak,
    events: &[FlightEvent],
    kind: EventKind,
    value: impl Fn(&FlightEvent) -> f64,
) -> Peak {
    events
        .iter()
        .filter(|e| e.kind == kind)
        .map(|e| Peak {
            value: value(e),
            time_s: e.time_s,
        })
        .fold(
            sampled,
            |best, p| if p.value > best.value { p } else { best },
        )
}

impl Summary {
    /// Summary of a flight; `None` for an empty trajectory
    pub fn new(vehicle: &Vehicle, flight: &Flight) -> Option<Self> {
        let traj = &flight.trajectory;
        let last = traj.last()?;
        let events = &flight.events;
        let maxima = Maxima {
            altitude_m: with_events(
                peak(traj, |s| s.altitude_m),
                events,
                EventKind::Apogee,
                |e| e.altitude_m,
            ),
            speed_earth_mps: peak(traj, |s| s.speed_earth_mps),
            speed_inertial_mps: peak(traj, |s| s.speed_inertial_mps),
            mach: peak(traj, |s| s.mach),
            dynamic_pressure_pa: with_events(
                peak(traj, |s| s.dynamic_pressure_pa),
                events,
                EventKind::MaxQ,
                |e| e.dynamic_pressure_pa,
            ),
            acceleration_g: peak(traj, |s| s.sensed_acceleration() / G0),
        };
        let orbit = elements(
            &Vector3::from(last.pos_eci()),
            &Vector3::from(last.vel_eci()),
            gmst_rad(vehicle.launch.time.julian_date()),
        );
        Some(Self {
            name: vehicle.name.clone(),
            flight_time_s: last.time_s,
            impact: flight.impact(),
            maxima,
            final_state: FinalState {
                time_s: last.time_s,
                mass_kg: last.mass_kg,
                altitude_m: last.altitude_m,
                latitude_deg: last.latitude_deg,
                longitude_deg: last.longitude_deg,
                speed_earth_mps: last.speed_earth_mps,
                speed_inertial_mps: last.speed_inertial_mps,
                position_eci_m: last.pos_eci(),
                velocity_eci_mps: last.vel_eci(),
                orbit,
            },
            events: events.clone(),
            bodies: flight
                .bodies
                .iter()
                .map(|b| BodySummary {
                    id: b.id.clone(),
                    kind: b.kind,
                    stage: b.stage,
                    release_time_s: b.release_time_s,
                    mass_kg: b.mass_kg,
                    impact: b.impact,
                })
                .collect(),
        })
    }
}

/// Column names of the sample CSV (the [`Sample`] field names)
pub fn sample_columns() -> Vec<String> {
    let mut w = csv::Writer::from_writer(Vec::new());
    w.serialize(Sample::default()).expect("serialize a sample");
    let data = w.into_inner().expect("flush CSV");
    let text = String::from_utf8(data).expect("UTF-8 CSV");
    let header = text.lines().next().unwrap_or_default();
    header.split(',').map(str::to_string).collect()
}

/// Write samples as CSV (header: the [`Sample`] field names)
pub fn write_samples_csv(path: &Path, samples: &[Sample]) -> std::io::Result<()> {
    if samples.is_empty() {
        return std::fs::write(path, format!("{}\n", sample_columns().join(",")));
    }
    let mut w = csv::Writer::from_path(path)?;
    for s in samples {
        w.serialize(s)?;
    }
    w.flush()
}

/// Files written for a simulation
#[derive(Debug, Clone, Serialize)]
pub struct FlightFiles {
    pub trajectory: PathBuf,
    pub summary: PathBuf,
    /// One CSV per released body with a trajectory
    pub bodies: Vec<PathBuf>,
}

/// Write `trajectory.csv`, `summary.json` and `bodies/<id>.csv` into `dir`
pub fn write_flight(
    dir: &Path,
    flight: &Flight,
    summary: &Summary,
) -> std::io::Result<FlightFiles> {
    std::fs::create_dir_all(dir)?;
    let trajectory = dir.join("trajectory.csv");
    write_samples_csv(&trajectory, &flight.trajectory)?;
    let summary_path = dir.join("summary.json");
    std::fs::write(&summary_path, to_json_pretty(summary)?)?;
    let mut bodies = Vec::new();
    for body in flight.bodies.iter().filter(|b| !b.trajectory.is_empty()) {
        let body_dir = dir.join("bodies");
        std::fs::create_dir_all(&body_dir)?;
        let path = body_dir.join(format!("{}.csv", body.id));
        write_samples_csv(&path, &body.trajectory)?;
        bodies.push(path);
    }
    Ok(FlightFiles {
        trajectory,
        summary: summary_path,
        bodies,
    })
}

/// Files written for a Monte Carlo run
#[derive(Debug, Clone, Serialize)]
pub struct MonteCarloFiles {
    pub cases: PathBuf,
    pub summary: PathBuf,
}

/// Write `montecarlo_cases.csv` (one row per case: the drawn perturbation,
/// apogee and every body's impact) and `montecarlo_summary.json`
pub fn write_monte_carlo(dir: &Path, mc: &MonteCarlo) -> std::io::Result<MonteCarloFiles> {
    std::fs::create_dir_all(dir)?;
    let cases = dir.join("montecarlo_cases.csv");
    let mut w = csv::Writer::from_path(&cases)?;
    let bodies: Vec<&str> = mc.statistics.iter().map(|s| s.body.as_str()).collect();
    let stage_count = mc
        .cases
        .iter()
        .map(|c| c.perturbation.stages.len())
        .max()
        .unwrap_or(0);
    let mut header: Vec<String> = vec!["case".into()];
    header.extend(
        crate::montecarlo::Perturbation::COLUMNS
            .iter()
            .map(|c| c.to_string()),
    );
    for k in 1..=stage_count {
        for c in crate::montecarlo::StagePerturbation::COLUMNS {
            header.push(format!("stage{k}_{c}"));
        }
    }
    header.push("max_altitude_m".into());
    for body in &bodies {
        for c in [
            "impact_time_s",
            "impact_latitude_deg",
            "impact_longitude_deg",
        ] {
            header.push(format!("{body}_{c}"));
        }
    }
    w.write_record(&header)?;
    let num = |v: f64| {
        if v.is_finite() {
            v.to_string()
        } else {
            String::new()
        }
    };
    for case in &mc.cases {
        let p = &case.perturbation;
        let mut row = vec![case.index.to_string()];
        row.extend(p.values().into_iter().map(num));
        for k in 0..stage_count {
            match p.stages.get(k) {
                Some(s) => row.extend(s.values().into_iter().map(num)),
                None => row.extend(
                    crate::montecarlo::StagePerturbation::COLUMNS
                        .iter()
                        .map(|_| String::new()),
                ),
            }
        }
        row.push(num(case.max_altitude_m));
        for body in &bodies {
            match case.impact_of(body) {
                Some(i) => row.extend([num(i.time_s), num(i.latitude_deg), num(i.longitude_deg)]),
                None => row.extend([String::new(), String::new(), String::new()]),
            }
        }
        w.write_record(&row)?;
    }
    w.flush()?;
    let summary = dir.join("montecarlo_summary.json");
    std::fs::write(&summary, to_json_pretty(&mc.summary())?)?;
    Ok(MonteCarloFiles { cases, summary })
}

fn to_json_pretty(value: &impl Serialize) -> std::io::Result<String> {
    let value = serde_json::to_value(value).map_err(std::io::Error::other)?;
    Ok(crate::config::to_pretty_json(&value) + "\n")
}
