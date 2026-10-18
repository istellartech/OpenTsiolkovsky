//! Flight simulation engine
//!
//! A 3-DoF point-mass vehicle is integrated in the Earth-centred inertial
//! frame (aligned with ECEF at launch) with the state
//! `[mass, position, velocity]`. Ignition, burnout, separation and
//! jettisons are scheduled discontinuities the integrator stops at;
//! propellant depletion, liftoff, rail exit, ground impact, apogee, Mach 1
//! and max-Q are located by root finding. Spent stages and jettisoned
//! bodies are flown to the ground afterwards ([`bodies`]).

pub mod bodies;
mod dynamics;
pub mod events;
pub mod sample;

pub use bodies::{Body, BodyKind};
pub use events::{EventKind, FlightEvent, ImpactPoint, impact_point};
pub use sample::{FlightMode, Sample};

use crate::config::Integrator;
use crate::math::integrator::{DormandPrince54, RungeKutta4};
use crate::physics::coordinates::CoordinateTransform;
use crate::physics::gravity::GravityModel;
use crate::physics::orbit::{OrbitalElements, elements, gmst_rad};
use crate::vehicle::Vehicle;
use nalgebra::Vector3;

/// Integrated state vector: `[mass, x, y, z, vx, vy, vz]` (ECI)
type StateVector = [f64; 7];

/// Longest time a released body is propagated while looking for its impact [s]
const FALL_MAX_DURATION_S: f64 = 10_800.0;

/// Altitude accuracy of a located root (ground impact) [m]
const ROOT_TOL: f64 = 1.0e-3;

/// Everything a simulation produces
#[derive(Debug, Clone)]
pub struct Flight {
    /// Vehicle samples every output step, plus the located impact
    pub trajectory: Vec<Sample>,
    /// Events in time order
    pub events: Vec<FlightEvent>,
    /// Spent stages and jettisoned bodies, flown to the ground
    pub bodies: Vec<Body>,
    /// Adaptive steps accepted at the minimum step size above tolerance
    pub forced_steps: usize,
}

impl Flight {
    /// Ground impact of the vehicle
    pub fn impact(&self) -> Option<ImpactPoint> {
        impact_point(&self.trajectory)
    }
}

/// Fly the vehicle and its released bodies
pub fn simulate(vehicle: &Vehicle) -> Flight {
    let mut sim = Simulator::new(vehicle.clone());
    sim.run();
    let bodies = sim.fly_bodies();
    Flight {
        trajectory: std::mem::take(&mut sim.trajectory),
        events: std::mem::take(&mut sim.events),
        bodies,
        forced_steps: sim.forced_steps,
    }
}

/// Integrated state of the vehicle
#[derive(Debug, Clone)]
pub(crate) struct State {
    pub time: f64,
    pub mass: f64,
    /// ECI [m]
    pub position: Vector3<f64>,
    /// ECI [m/s]
    pub velocity: Vector3<f64>,
}

/// Schedule of one stage in absolute time
#[derive(Debug, Clone)]
struct StageRuntime {
    index: usize,
    start_time: f64,
    burn_start: f64,
    /// End of powered flight (burn end, separation or depletion)
    power_end: f64,
    separation_time: f64,
    /// Mass of this stage and those above it [kg]
    stack_mass: f64,
    /// Vehicle mass at which this stage's propellant is used up [kg];
    /// lowered when a jettisoned body leaves
    mass_floor: f64,
}

fn build_stage_runtime(vehicle: &Vehicle) -> Vec<StageRuntime> {
    let end_time = vehicle.end_time;
    let n = vehicle.stages.len();
    let mut stack_mass = vec![0.0; n];
    let mut cumulative = 0.0;
    for idx in (0..n).rev() {
        cumulative += vehicle.stages[idx].mass_initial;
        stack_mass[idx] = cumulative;
    }

    let mut start_time = 0.0;
    let mut out = Vec::with_capacity(n);
    for (idx, stage) in vehicle.stages.iter().enumerate() {
        let separation_time = stage
            .separation_time
            .map(|t| start_time + t)
            .filter(|t| t.is_finite())
            .unwrap_or(end_time)
            .min(end_time);
        let (burn_start, power_end) = match &stage.engine {
            Some(e) => (
                start_time + e.burn_start,
                (start_time + e.burn_end).min(separation_time),
            ),
            None => (start_time, start_time),
        };
        out.push(StageRuntime {
            index: idx,
            start_time,
            burn_start,
            power_end,
            separation_time,
            stack_mass: stack_mass[idx],
            mass_floor: stack_mass[idx] - stage.usable_propellant(),
        });
        start_time = separation_time;
    }
    out
}

#[derive(Debug, Clone, Copy)]
enum IntegrationMode {
    Rk4 { step: f64 },
    Rk45 { solver: DormandPrince54 },
}

/// State of a body at the moment it leaves the vehicle
#[derive(Debug, Clone)]
struct Release {
    kind: BodyKind,
    name: String,
    stage_idx: usize,
    time: f64,
    position: Vector3<f64>,
    velocity: Vector3<f64>,
    mass: f64,
    ballistic_coefficient: Option<f64>,
}

/// Scheduled jettison (absolute time)
#[derive(Debug, Clone)]
struct JettisonEvent {
    time: f64,
    stage_idx: usize,
    index: usize,
    done: bool,
}

/// Launch pad / rail constraint
#[derive(Debug, Clone)]
struct Launcher {
    /// Constraint in force (until rail exit, or liftoff without a rail)
    active: bool,
    /// The vehicle has started to move
    lifted: bool,
    /// Rail length [m]
    length: f64,
    /// Rail direction (unit) and foot, ECEF
    dir_ecef: Vector3<f64>,
    origin_ecef: Vector3<f64>,
}

/// Simulator state that integration and event handling change; saved
/// and restored while an event time is located
#[derive(Debug, Clone)]
struct Snapshot {
    state: State,
    current_stage_index: usize,
    jettisons_done: Vec<bool>,
    releases: Vec<Release>,
    events: Vec<FlightEvent>,
    stage_runtime: Vec<StageRuntime>,
    h_hint: Option<f64>,
    launcher: Launcher,
}

pub(crate) struct Simulator {
    vehicle: Vehicle,
    gravity: GravityModel,
    state: State,
    trajectory: Vec<Sample>,
    events: Vec<FlightEvent>,
    stage_runtime: Vec<StageRuntime>,
    current_stage_index: usize,
    integration: IntegrationMode,
    /// Step size carried between adaptive integration intervals
    h_hint: Option<f64>,
    forced_steps: usize,
    /// Times the integrator must stop at: ignitions, burnouts, separations
    /// and jettisons
    event_times: Vec<f64>,
    jettisons: Vec<JettisonEvent>,
    releases: Vec<Release>,
    launcher: Launcher,
    /// While integrating between two events: a time inside that interval,
    /// used for discrete state (stage, powered) so RK stages evaluated on an
    /// interval boundary do not see the next phase
    phase_time: Option<f64>,
    /// Stage number written into the samples instead of the flying stage
    /// (released bodies keep the number of the stage they came from)
    stage_label: Option<u8>,
}

impl Simulator {
    pub(crate) fn new(vehicle: Vehicle) -> Self {
        let integration = match vehicle.integrator {
            Integrator::Rk45 { abs_tol, rel_tol } => IntegrationMode::Rk45 {
                solver: DormandPrince54::new(abs_tol, rel_tol, 1.0e-6, 10.0),
            },
            Integrator::Rk4 { step_s } => {
                let output = vehicle.output_step;
                let default_dt = if output.is_finite() && output > 0.0 {
                    (output / 2.0).max(1.0e-6)
                } else {
                    0.1
                };
                let step = step_s
                    .filter(|v| v.is_finite() && *v > 0.0)
                    .unwrap_or(default_dt);
                IntegrationMode::Rk4 { step }
            }
        };

        let pos_llh = vehicle.launch.llh;
        let vel_ned = vehicle.launch.velocity_ned;
        let position = CoordinateTransform::pos_eci_init(&pos_llh);
        let velocity = CoordinateTransform::vel_eci_init(&vel_ned, &pos_llh);

        // A vehicle starting at rest is held on the pad / rail, which lies
        // along the body axis at launch
        let dir_ned = vehicle.attitude.dcm(0.0).0.transpose() * Vector3::x();
        let launcher = Launcher {
            active: vel_ned.magnitude() < 1.0e-9,
            lifted: false,
            length: vehicle.launch.rail_length.max(0.0),
            dir_ecef: CoordinateTransform::dcm_ecef_to_ned(&pos_llh).transpose() * dir_ned,
            origin_ecef: position,
        };

        let stage_runtime = build_stage_runtime(&vehicle);
        let mass = stage_runtime.first().map_or(0.0, |rt| rt.stack_mass);
        let end_time = vehicle.end_time;

        // Jettisons happen while their stage is flying (stage-relative time)
        let jettisons: Vec<JettisonEvent> = stage_runtime
            .iter()
            .flat_map(|rt| {
                vehicle.stages[rt.index]
                    .jettisons
                    .iter()
                    .enumerate()
                    .map(move |(k, j)| (rt, k, rt.start_time + j.time))
            })
            .filter(|(rt, _, time)| {
                *time > rt.start_time && *time < rt.separation_time && *time < end_time
            })
            .map(|(rt, index, time)| JettisonEvent {
                time,
                stage_idx: rt.index,
                index,
                done: false,
            })
            .collect();
        let mut event_times: Vec<f64> = stage_runtime
            .iter()
            .flat_map(|rt| [rt.burn_start, rt.power_end, rt.separation_time])
            .chain(jettisons.iter().map(|j| j.time))
            .filter(|&t| t > 0.0 && t < end_time)
            .collect();
        event_times.sort_by(f64::total_cmp);
        // Merge times that differ only by rounding (a burnout summed from other
        // stage times can land a few ulps before the separation it coincides
        // with); keep the later one so stopping there passes both.
        let mut merged: Vec<f64> = Vec::with_capacity(event_times.len());
        for t in event_times {
            match merged.last_mut() {
                Some(last) if t - *last <= 1.0e-9 => *last = t,
                _ => merged.push(t),
            }
        }

        Simulator {
            vehicle,
            gravity: GravityModel::new(),
            state: State {
                time: 0.0,
                mass,
                position,
                velocity,
            },
            trajectory: Vec::new(),
            events: Vec::new(),
            stage_runtime,
            current_stage_index: 0,
            integration,
            h_hint: None,
            forced_steps: 0,
            event_times: merged,
            jettisons,
            releases: Vec::new(),
            launcher,
            phase_time: None,
            stage_label: None,
        }
    }

    /// Run to the end time or ground impact, sampling every output step
    pub(crate) fn run(&mut self) {
        self.trajectory.clear();
        self.releases.clear();
        self.events.clear();
        for j in &mut self.jettisons {
            j.done = false;
        }

        let t0 = self.state.time;
        self.record_output();
        self.record_scheduled_events(t0, true);
        if self.launcher.active && self.current_forces().launcher_along > 0.0 {
            self.lift_off();
        }
        let end_time = self.vehicle.end_time;
        let dt_out = self.vehicle.output_step;
        if !(dt_out.is_finite() && dt_out > 0.0) {
            return;
        }

        // Max-Q: largest sampled q and the snapshot one output step before it
        let mut max_q: Option<(f64, Snapshot, f64)> = None;
        let mut prev = self.sample();
        let mut k: u64 = 1;
        while self.state.time + 1.0e-9 < end_time {
            // Output times from the step count: no accumulated round-off
            let t_next = (t0 + k as f64 * dt_out).min(end_time);
            let before = self.snapshot();
            self.advance_to_time(t_next);
            let now = self.sample();

            if now.altitude_m <= 0.0 && prev.altitude_m > 0.0 && !self.launcher.active {
                self.locate(&before, prev.time_s, t_next, |s| s.altitude_m);
                let impact = self.sample();
                if max_q
                    .as_ref()
                    .is_none_or(|(q, _, _)| impact.dynamic_pressure_pa > *q)
                {
                    max_q = Some((impact.dynamic_pressure_pa, before, prev.time_s));
                }
                self.push_sample(impact.clone());
                self.insert_event(EventKind::Impact, &impact);
                break;
            }
            if now.altitude_m < 0.0 && !self.launcher.active {
                // Started on (or below) the ground and sank
                self.push_sample(now.clone());
                self.insert_event(EventKind::Impact, &now);
                break;
            }

            let mut located = Vec::new();
            if prev.vertical_speed() > 0.0 && now.vertical_speed() <= 0.0 {
                located.push(EventKind::Apogee);
            }
            if prev.mach < 1.0 && now.mach >= 1.0 {
                located.push(EventKind::Mach1);
            }
            if !located.is_empty() {
                let after = self.snapshot();
                let mut found = Vec::new();
                for kind in located {
                    match kind {
                        EventKind::Apogee => {
                            self.locate(&before, prev.time_s, t_next, Sample::vertical_speed)
                        }
                        _ => self.locate(&before, prev.time_s, t_next, |s| s.mach - 1.0),
                    }
                    found.push((kind, self.sample()));
                }
                self.restore(&after);
                for (kind, sample) in found {
                    self.insert_event(kind, &sample);
                }
            }
            if max_q
                .as_ref()
                .is_none_or(|(q, _, _)| now.dynamic_pressure_pa > *q)
            {
                max_q = Some((now.dynamic_pressure_pa, before, prev.time_s));
            }

            self.push_sample(now.clone());
            prev = now;
            k += 1;
        }

        if let Some((q, snap, t_lo)) = max_q
            && q > 0.0
        {
            let end = self.snapshot();
            let t_hi = (t_lo + 2.0 * dt_out).min(end.state.time);
            self.locate_max_q(&snap, t_lo, t_hi);
            let sample = self.sample();
            self.restore(&end);
            self.insert_event(EventKind::MaxQ, &sample);
        }
    }

    fn snapshot(&self) -> Snapshot {
        Snapshot {
            state: self.state.clone(),
            current_stage_index: self.current_stage_index,
            jettisons_done: self.jettisons.iter().map(|j| j.done).collect(),
            releases: self.releases.clone(),
            events: self.events.clone(),
            stage_runtime: self.stage_runtime.clone(),
            h_hint: self.h_hint,
            launcher: self.launcher.clone(),
        }
    }

    fn restore(&mut self, snap: &Snapshot) {
        self.state = snap.state.clone();
        self.current_stage_index = snap.current_stage_index;
        for (j, &done) in self.jettisons.iter_mut().zip(&snap.jettisons_done) {
            j.done = done;
        }
        self.releases = snap.releases.clone();
        self.events = snap.events.clone();
        self.stage_runtime = snap.stage_runtime.clone();
        self.h_hint = snap.h_hint;
        self.launcher = snap.launcher.clone();
    }

    /// Re-integrate from `from` to time `t`
    fn evaluate_at(&mut self, from: &Snapshot, t: f64) -> Sample {
        self.restore(from);
        self.advance_to_time(t);
        self.sample()
    }

    /// Locate the root of `f` between `t_lo` and `t_hi` (where `f` changes
    /// sign) with the Illinois method, re-integrating from `from` for every
    /// trial time. Leaves the simulator at the located time.
    fn locate(&mut self, from: &Snapshot, t_lo: f64, t_hi: f64, f: impl Fn(&Sample) -> f64) {
        let (mut ta, mut tb) = (t_lo, t_hi);
        let mut fa = f(&self.evaluate_at(from, ta));
        let mut fb = f(&self.evaluate_at(from, tb));
        let mut side = 0;
        for _ in 0..100 {
            if fb.abs() <= ROOT_TOL * 1e-3 || tb - ta < 1.0e-9 {
                break;
            }
            let mut tc = (ta * fb - tb * fa) / (fb - fa);
            if !(tc > ta && tc < tb) {
                tc = 0.5 * (ta + tb);
            }
            let fc = f(&self.evaluate_at(from, tc));
            if fc.abs() <= ROOT_TOL {
                return;
            }
            if fc.signum() == fb.signum() {
                tb = tc;
                fb = fc;
                if side == -1 {
                    fa *= 0.5;
                }
                side = -1;
            } else {
                ta = tc;
                fa = fc;
                if side == 1 {
                    fb *= 0.5;
                }
                side = 1;
            }
        }
        // Leave the simulator on the side past the root
        self.evaluate_at(from, tb);
    }

    /// Golden-section search for the largest dynamic pressure in [t_lo, t_hi]
    fn locate_max_q(&mut self, from: &Snapshot, t_lo: f64, t_hi: f64) {
        let ratio = 0.5 * (5f64.sqrt() - 1.0);
        let (mut a, mut b) = (t_lo, t_hi);
        let q_at = |sim: &mut Self, t: f64| sim.evaluate_at(from, t).dynamic_pressure_pa;
        let mut c = b - ratio * (b - a);
        let mut d = a + ratio * (b - a);
        let (mut qc, mut qd) = (q_at(self, c), q_at(self, d));
        while b - a > 1.0e-6 {
            if qc > qd {
                b = d;
                d = c;
                qd = qc;
                c = b - ratio * (b - a);
                qc = q_at(self, c);
            } else {
                a = c;
                c = d;
                qc = qd;
                d = a + ratio * (b - a);
                qd = q_at(self, d);
            }
        }
        q_at(self, 0.5 * (a + b));
    }

    fn push_sample(&mut self, mut sample: Sample) {
        if let Some(stage) = self.stage_label {
            sample.stage = stage;
        }
        self.trajectory.push(sample);
    }

    fn record_output(&mut self) {
        let sample = self.sample();
        self.push_sample(sample);
    }

    /// Insert an event in time order
    fn insert_event(&mut self, kind: EventKind, sample: &Sample) {
        self.insert_event_for(kind, sample.stage, None, sample);
    }

    fn insert_event_for(&mut self, kind: EventKind, stage: u8, body: Option<String>, s: &Sample) {
        let mut event = FlightEvent::new(kind, self.stage_label.unwrap_or(stage), s);
        event.body = body;
        if matches!(kind, EventKind::Burnout | EventKind::Separation) {
            event.orbit = Some(self.orbit_of(s));
        }
        let at = self.events.partition_point(|e| e.time_s <= event.time_s);
        self.events.insert(at, event);
    }

    /// Osculating orbit of a sample, node measured from the vernal equinox
    fn orbit_of(&self, s: &Sample) -> OrbitalElements {
        elements(
            &Vector3::from(s.pos_eci()),
            &Vector3::from(s.vel_eci()),
            gmst_rad(self.vehicle.launch.time.julian_date()),
        )
    }

    /// Record the scheduled events (ignition, burnout, separation, jettison)
    /// that happen at time `t`; `initial` also records those at t <= 0
    fn record_scheduled_events(&mut self, t: f64, initial: bool) {
        let at = |e: f64| (e - t).abs() < 1.0e-9 || (initial && e <= t);
        let mut due: Vec<(EventKind, usize, Option<String>)> = Vec::new();
        for rt in &self.stage_runtime {
            let powered = rt.power_end > rt.burn_start;
            if powered && at(rt.burn_start) {
                due.push((EventKind::Ignition, rt.index, None));
            }
            // Skip when the propellant already ran out (located by root
            // finding) within the tolerance of the scheduled end
            let burned_out = self
                .events
                .iter()
                .any(|e| e.kind == EventKind::Burnout && e.stage as usize == rt.index + 1);
            if powered && at(rt.power_end) && !initial && !burned_out {
                due.push((EventKind::Burnout, rt.index, None));
            }
            let has_next = rt.index + 1 < self.stage_runtime.len();
            if has_next && at(rt.separation_time) && !initial {
                due.push((EventKind::Separation, rt.index, None));
            }
        }
        for j in &self.jettisons {
            if at(j.time) && !initial {
                let name = self.vehicle.stages[j.stage_idx].jettisons[j.index]
                    .name
                    .clone();
                due.push((EventKind::Jettison, j.stage_idx, Some(name)));
            }
        }
        if due.is_empty() {
            return;
        }
        let sample = self.sample();
        for (kind, stage_idx, body) in due {
            self.insert_event_for(kind, (stage_idx + 1) as u8, body, &sample);
        }
    }

    /// Whether the engine of `stage_idx` is burning at absolute time `t`
    fn is_powered_at(&self, stage_idx: usize, t: f64) -> bool {
        let stage = &self.stage_runtime[stage_idx];
        t >= stage.burn_start && t < stage.power_end
    }

    fn stage_index_for_time(&self, time: f64) -> usize {
        self.stage_runtime
            .iter()
            .find(|rt| time < rt.separation_time)
            .map_or(self.stage_runtime.len().saturating_sub(1), |rt| rt.index)
    }

    fn stage_local_time(&self, stage_index: usize, time: f64) -> f64 {
        (time - self.stage_runtime[stage_index].start_time).max(0.0)
    }

    fn update_stage_index(&mut self) {
        let new_stage = self.stage_index_for_time(self.state.time);
        if new_stage == self.current_stage_index {
            return;
        }
        if new_stage > self.current_stage_index {
            // The spent stage keeps what is left after the upper stack leaves
            let spent_mass = self.state.mass - self.stage_runtime[new_stage].stack_mass;
            self.releases.push(Release {
                kind: BodyKind::Stage,
                name: format!("stage{}", self.current_stage_index + 1),
                stage_idx: self.current_stage_index,
                time: self.state.time,
                position: self.state.position,
                velocity: self.state.velocity,
                mass: spent_mass.max(0.0),
                ballistic_coefficient: None,
            });
        }
        self.current_stage_index = new_stage;
        self.state.mass = self.stage_runtime[new_stage].stack_mass;
    }

    /// Release the jettisoned bodies whose time has come
    fn apply_due_jettisons(&mut self) {
        let now = self.state.time;
        for k in 0..self.jettisons.len() {
            let event = &self.jettisons[k];
            if event.done || event.time > now + 1.0e-9 {
                continue;
            }
            let (stage_idx, index) = (event.stage_idx, event.index);
            self.jettisons[k].done = true;
            let j = &self.vehicle.stages[stage_idx].jettisons[index];
            let mass = j.mass.min(self.state.mass).max(0.0);
            let pos_ecef = CoordinateTransform::pos_eci_to_ecef(&self.state.position, now);
            let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
            let dcm_ned_to_eci = CoordinateTransform::dcm_eci_to_ned(&pos_llh, now).transpose();
            self.releases.push(Release {
                kind: BodyKind::Jettison,
                name: format!("stage{}_{}", stage_idx + 1, j.name),
                stage_idx,
                time: now,
                position: self.state.position,
                velocity: self.state.velocity + dcm_ned_to_eci * j.delta_v_ned,
                mass,
                ballistic_coefficient: Some(j.ballistic_coefficient),
            });
            self.state.mass -= mass;
            // The body was part of the stage's dry mass
            self.stage_runtime[stage_idx].mass_floor -= mass;
        }
    }

    fn state_vector(&self) -> StateVector {
        let (p, v) = (self.state.position, self.state.velocity);
        [self.state.mass, p.x, p.y, p.z, v.x, v.y, v.z]
    }

    fn apply_state_vector(&mut self, time: f64, y: &StateVector) {
        self.state.time = time;
        self.state.mass = y[0];
        self.state.position = Vector3::new(y[1], y[2], y[3]);
        self.state.velocity = Vector3::new(y[4], y[5], y[6]);
        self.update_stage_index();
    }

    /// Advance to `target_time`, stopping at scheduled events on the way
    fn advance_to_time(&mut self, target_time: f64) {
        let target = target_time.min(self.vehicle.end_time);
        while let Some(event) = self
            .event_times
            .iter()
            .copied()
            .find(|&e| e > self.state.time + 1.0e-9 && e <= target)
        {
            self.integrate_to(event);
            self.apply_due_jettisons();
            self.record_scheduled_events(event, false);
        }
        self.integrate_to(target);
        self.apply_due_jettisons();
    }

    /// Integrate to `target`; no scheduled event may lie strictly inside
    /// the interval. Liftoff, rail exit and propellant depletion on the way
    /// are located by root finding and recorded.
    fn integrate_to(&mut self, target: f64) {
        let t0 = self.state.time;
        if target <= t0 {
            return;
        }
        let y0 = self.state_vector();
        let hint0 = self.h_hint;
        let y = self.integrate_raw(&y0, t0, target);

        if self.launcher.active {
            const MOVED_M: f64 = 1.0e-6;
            if !self.launcher.lifted && self.rail_distance(&y, target) > MOVED_M {
                // First time the vehicle is pushed off: bisection
                let (mut ta, mut tb) = (t0, target);
                while tb - ta > 1.0e-9 {
                    let tc = 0.5 * (ta + tb);
                    self.h_hint = hint0;
                    let yc = self.integrate_raw(&y0, t0, tc);
                    self.apply_state_vector(tc, &yc);
                    let pushed = self.current_forces().launcher_along > 0.0
                        || self.rail_distance(&yc, tc) > MOVED_M;
                    self.apply_state_vector(t0, &y0);
                    if pushed {
                        tb = tc;
                    } else {
                        ta = tc;
                    }
                }
                self.h_hint = hint0;
                let y_lift = self.integrate_raw(&y0, t0, ta);
                self.apply_state_vector(ta, &y_lift);
                self.lift_off();
                self.integrate_to(target);
                return;
            }
            let length = self.launcher.length;
            if self.launcher.lifted && length > 0.0 && self.rail_distance(&y, target) >= length {
                let rail = |sim: &Self, y: &StateVector, t: f64| sim.rail_distance(y, t) - length;
                let (t_exit, y_exit) = self.illinois(&y0, t0, target, &y, hint0, rail, 1.0e-6);
                self.apply_state_vector(t_exit, &y_exit);
                self.launcher.active = false;
                let sample = self.sample();
                self.insert_event(EventKind::RailExit, &sample);
                self.integrate_to(target);
                return;
            }
        }

        let mid = 0.5 * (t0 + target);
        let stage_idx = self.stage_index_for_time(mid);
        let floor = self.stage_runtime[stage_idx].mass_floor;
        if self.is_powered_at(stage_idx, mid) && y[0] < floor && y0[0] > floor {
            // Mass decreases monotonically while burning: root of m - floor
            let mass = |_: &Self, y: &StateVector, _: f64| y[0] - floor;
            let tol = 1.0e-9 * floor.abs().max(1.0);
            let (t_out, mut y_out) = self.illinois(&y0, t0, target, &y, hint0, mass, tol);
            y_out[0] = y_out[0].max(floor);
            self.stage_runtime[stage_idx].power_end = t_out;
            self.apply_state_vector(t_out, &y_out);
            let sample = self.sample();
            self.insert_event(EventKind::Burnout, &sample);
            self.integrate_to(target);
            return;
        }
        self.apply_state_vector(target, &y);
    }

    /// Root of `g` (rising from negative at `t0` to positive or zero at
    /// `t1`) by the Illinois method, re-integrating from `(t0, y0)` for every
    /// trial time. Returns the first time with `g >= -tol` and its state.
    #[allow(clippy::too_many_arguments)]
    fn illinois(
        &mut self,
        y0: &StateVector,
        t0: f64,
        t1: f64,
        y1: &StateVector,
        hint0: Option<f64>,
        g: impl Fn(&Self, &StateVector, f64) -> f64,
        tol: f64,
    ) -> (f64, StateVector) {
        // Work on h = g for rail exit (rising) or -g for depletion (falling)
        let sign = if g(self, y1, t1) >= g(self, y0, t0) {
            1.0
        } else {
            -1.0
        };
        let h = |sim: &Self, y: &StateVector, t: f64| sign * g(sim, y, t);
        let (mut ta, mut fa) = (t0, h(self, y0, t0));
        let (mut tb, mut fb, mut yb) = (t1, h(self, y1, t1), *y1);
        let mut side = 0;
        for _ in 0..100 {
            if tb - ta < 1.0e-9 {
                break;
            }
            let mut tc = (ta * fb - tb * fa) / (fb - fa);
            if !(tc > ta && tc < tb) {
                tc = 0.5 * (ta + tb);
            }
            self.h_hint = hint0;
            let yc = self.integrate_raw(y0, t0, tc);
            let fc = h(self, &yc, tc);
            if fc.abs() < tol {
                return (tc, yc);
            }
            if fc > 0.0 {
                (tb, fb, yb) = (tc, fc, yc);
                if side == -1 {
                    fa *= 0.5;
                }
                side = -1;
            } else {
                (ta, fa) = (tc, fc);
                if side == 1 {
                    fb *= 0.5;
                }
                side = 1;
            }
        }
        // Re-integrate so the step hint matches the returned state
        self.h_hint = hint0;
        let yb = if tb == t1 {
            yb
        } else {
            self.integrate_raw(y0, t0, tb)
        };
        (tb, yb)
    }

    /// The vehicle starts to move: record liftoff; without a rail the
    /// constraint ends here
    fn lift_off(&mut self) {
        self.launcher.lifted = true;
        if self.launcher.length <= 0.0 {
            self.launcher.active = false;
        }
        let sample = self.sample();
        self.insert_event(EventKind::Liftoff, &sample);
    }

    /// Distance travelled along the launcher rail [m]
    fn rail_distance(&self, y: &StateVector, t: f64) -> f64 {
        let pos_ecef = CoordinateTransform::dcm_eci_to_ecef(t) * Vector3::new(y[1], y[2], y[3]);
        self.launcher
            .dir_ecef
            .dot(&(pos_ecef - self.launcher.origin_ecef))
    }

    /// Integrate the equations of motion from `(t0, y0)` to `t1` without
    /// touching the simulator state (except the adaptive step hint)
    fn integrate_raw(&mut self, y0: &StateVector, t0: f64, t1: f64) -> StateVector {
        self.phase_time = Some(0.5 * (t0 + t1));
        let mut y = *y0;
        let system = |t: f64, s: &StateVector| self.dynamics(t, s);
        match self.integration {
            IntegrationMode::Rk4 { step } => {
                // Equal steps no longer than `step`, ending exactly on t1
                let n = ((t1 - t0) / step - 1.0e-9).ceil().max(1.0) as u64;
                let h = (t1 - t0) / n as f64;
                for i in 0..n {
                    y = RungeKutta4.integrate(&y, t0 + i as f64 * h, h, system);
                }
            }
            IntegrationMode::Rk45 { solver } => {
                let mut t = t0;
                let mut hint = self.h_hint;
                let forced = solver.advance_to(&mut y, &mut t, t1, &mut hint, system);
                self.h_hint = hint;
                self.forced_steps += forced;
            }
        }
        self.phase_time = None;
        y
    }
}

#[cfg(test)]
mod tests;
