//! Flight simulation engine
//!
//! A 3-DoF point-mass vehicle is integrated in the Earth-centred inertial
//! frame (aligned with ECEF at t = 0) with the state
//! `[mass, position, velocity]`. Stage ignition, burnout, separation and
//! dumping products are scheduled discontinuities the integrator stops at;
//! ground impact, apogee, Mach 1 and max-Q are located by root finding.
use crate::math::{
    RungeKutta4,
    constants::{G0, OMEGA_EARTH},
    deg2rad,
    integrator::DormandPrince54,
};
use crate::physics::{
    atmosphere::{AtmosphereModel, AtmosphericConditions},
    coordinates::CoordinateTransform,
    gravity::GravityModel,
};
use crate::rocket::{IntegratorMethod, Rocket, RocketConfig};
use nalgebra::{Matrix3, Vector3};
use serde::{Deserialize, Serialize};

/// Integrated state vector: `[mass, x, y, z, vx, vy, vz]` (ECI)
type StateVector = [f64; 7];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationState {
    pub time: f64,
    pub position: Vector3<f64>, // ECI coordinates [m]
    pub velocity: Vector3<f64>, // ECI coordinates [m/s]
    pub mass: f64,              // [kg]
    pub stage: u8,
    pub altitude: f64,           // Altitude above the WGS84 ellipsoid [m]
    pub velocity_magnitude: f64, // |velocity| (inertial) [m/s]
    pub mach_number: f64,        // Mach number [-]
    pub dynamic_pressure: f64,   // Dynamic pressure [Pa]
    pub thrust: f64,             // Thrust after the nozzle exit pressure loss [N]
    pub drag_force: f64,         // Axial aerodynamic force magnitude [N]
    // New fields for enhanced visualization
    pub velocity_ned: Vector3<f64>, // NED velocity components [m/s] (for backward compatibility)
    pub velocity_eci_ned: Vector3<f64>, // ECI velocity in NED frame [m/s]
    pub velocity_ecef_ned: Vector3<f64>, // ECEF velocity in NED frame [m/s]
    pub sea_level_mach: f64,        // Mach number based on sea level sound speed
    pub acceleration_magnitude: f64, // Total acceleration magnitude [m/s²]
    pub acc_eci: Vector3<f64>,      // ECI acceleration components [m/s²]
    pub acc_body: Vector3<f64>,     // Body-frame acceleration components [m/s²]
    pub angle_of_attack: f64,       // Attack of angle [deg]
    pub sideslip_angle: f64,        // Sideslip angle [deg]
    pub attitude_azimuth: f64,      // Attitude azimuth [deg]
    pub attitude_elevation: f64,    // Attitude elevation [deg]
    /// Flight mode, named as in the C++ simulator
    #[serde(default)]
    pub flight_mode: FlightMode,
    /// Instantaneous impact point [deg]; `None` when no impact point exists
    #[serde(default)]
    pub iip_lat_deg: Option<f64>,
    #[serde(default)]
    pub iip_lon_deg: Option<f64>,
}

/// Flight mode of a body (C++ `flight_mode` names)
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum FlightMode {
    /// Powered flight, attitude from the attitude program
    #[default]
    #[serde(rename = "power_3DoF")]
    Power3Dof,
    /// Free flight, body aligned with the airflow (drag only)
    #[serde(rename = "free_aero_stable")]
    FreeAeroStable,
    /// Free flight, attitude from the attitude program
    #[serde(rename = "free_3dof")]
    Free3Dof,
    /// Free flight with a ballistic coefficient
    #[serde(rename = "free_ballistic")]
    FreeBallistic,
}

impl FlightMode {
    /// Free-flight mode from the `free flight mode(int)` setting
    pub fn free(mode: i32) -> Self {
        match mode {
            0 => FlightMode::FreeAeroStable,
            2 => FlightMode::FreeBallistic,
            _ => FlightMode::Free3Dof,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            FlightMode::Power3Dof => "power_3DoF",
            FlightMode::FreeAeroStable => "free_aero_stable",
            FlightMode::Free3Dof => "free_3dof",
            FlightMode::FreeBallistic => "free_ballistic",
        }
    }

    /// Whether the body follows the attitude program (otherwise it is
    /// aligned with the airflow)
    fn follows_attitude_program(&self) -> bool {
        matches!(self, FlightMode::Power3Dof | FlightMode::Free3Dof)
    }
}

/// C++-compatible CSV row telemetry
#[derive(Debug, Clone)]
pub struct CsvCppRow {
    pub time: f64,
    pub mass: f64,
    pub thrust: f64,
    pub lat_deg: f64,
    pub lon_deg: f64,
    pub alt_m: f64,
    pub pos_eci: Vector3<f64>,
    pub vel_eci: Vector3<f64>,
    pub vel_ned: Vector3<f64>,
    pub acc_eci: Vector3<f64>,
    pub acc_body: Vector3<f64>,
    /// Effective specific impulse, thrust / (mass flow · g0) [s] (as in C++)
    pub isp_s: f64,
    pub mach: f64,
    pub att_az_deg: f64,
    pub att_el_deg: f64,
    pub att_roll_deg: f64,
    pub aoa_alpha_deg: f64,
    pub aoa_beta_deg: f64,
    pub aoa_gamma_deg: f64,
    pub q_pa: f64,
    pub aero_body: Vector3<f64>,
    pub thrust_body: Vector3<f64>,
    pub gimbal_pitch_deg: f64,
    pub gimbal_yaw_deg: f64,
    pub wind_speed: f64,
    pub wind_dir_deg: f64,
    pub downrange: f64,
    pub iip_lat_deg: f64,
    pub iip_lon_deg: f64,
    pub dcm_body_to_eci: Matrix3<f64>,
    pub inertial_speed: f64,
    pub kinetic_energy_ned: f64,
    pub loss_gravity: f64,
    pub loss_aero: f64,
    pub loss_thrust: f64,
    pub is_powered: i32,
    pub is_separated: i32,
    pub stage_number: u8,
}

#[derive(Debug, Clone)]
struct StageRuntime {
    index: usize,
    start_time: f64,
    burn_start: f64,
    /// End of powered flight: the earlier of burn end and forced cutoff
    power_end: f64,
    separation_time: f64,
    stack_mass: f64,
}

#[derive(Debug, Clone, Copy)]
enum IntegrationMode {
    Rk4 { step: f64 },
    Rk45 { solver: DormandPrince54 },
}

fn build_stage_runtime(config: &RocketConfig, rocket: &Rocket) -> Vec<StageRuntime> {
    let mut stages = Vec::new();
    let mut start_time = 0.0;
    let end_time = config.calculate_condition.end_time;

    let mut stack_mass = vec![0.0; rocket.stage_count()];
    let mut cumulative = 0.0;
    for idx in (0..rocket.stage_count()).rev() {
        cumulative += rocket.stage_config(idx).mass_initial;
        stack_mass[idx] = cumulative;
    }

    for (idx, &mass) in stack_mass.iter().enumerate().take(rocket.stage_count()) {
        let stage_cfg = rocket.stage_config(idx);
        let burn_start = start_time + stage_cfg.thrust.burn_start_time;
        let burn_end = start_time + stage_cfg.thrust.burn_end_time;
        let forced_cutoff = start_time + stage_cfg.thrust.forced_cutoff_time;

        let mut separation_time = if stage_cfg.stage.following_stage_exists {
            start_time + stage_cfg.stage.separation_time
        } else {
            end_time
        };

        if !separation_time.is_finite() {
            separation_time = end_time;
        }

        separation_time = separation_time.min(end_time);

        let burn_end = burn_end.min(separation_time);
        let forced_cutoff = forced_cutoff.min(separation_time);
        stages.push(StageRuntime {
            index: idx,
            start_time,
            burn_start,
            power_end: burn_end.min(forced_cutoff),
            separation_time,
            stack_mass: mass,
        });

        start_time = separation_time;
    }

    stages
}

/// Kind of body released from the vehicle
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FallBodyKind {
    /// Spent stage after separation
    Stage,
    /// Dumping product (fairing, etc.)
    Dump,
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

/// Impact point of a trajectory that ends on the ground
pub fn impact_point(trajectory: &[SimulationState]) -> Option<ImpactPoint> {
    let last = trajectory.last()?;
    if trajectory.len() < 2 || last.altitude > 1.0 {
        return None;
    }
    let pos_ecef = CoordinateTransform::pos_eci_to_ecef(&last.position, last.time);
    let llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
    Some(ImpactPoint {
        time_s: last.time,
        latitude_deg: llh.x,
        longitude_deg: llh.y,
        speed_mps: last.velocity_ecef_ned.magnitude(),
    })
}

/// What happened at a flight event
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EventKind {
    /// Engine ignition of a stage
    Ignition,
    /// End of powered flight (burn end or forced cutoff)
    Burnout,
    /// Stage separation (the event belongs to the stage that separates)
    Separation,
    /// Dumping product release
    Dump,
    /// Mach number rises through 1
    Mach1,
    /// Largest dynamic pressure of the flight
    MaxQ,
    /// Earth-relative vertical speed turns from up to down
    Apogee,
    /// Ground impact
    Impact,
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
    /// Earth-relative speed [m/s]
    pub speed_mps: f64,
    /// Inertial speed [m/s]
    pub inertial_speed_mps: f64,
    pub mach: f64,
    pub dynamic_pressure_pa: f64,
    pub mass_kg: f64,
}

/// A spent stage or dumping product propagated from its release to the ground
#[derive(Debug, Clone, Serialize)]
pub struct FallBody {
    pub kind: FallBodyKind,
    /// Stage the body belongs to (1-based)
    pub stage: u8,
    pub release_time_s: f64,
    pub mass_kg: f64,
    /// `None` when the body does not come down (orbit, escape) within the
    /// propagation limit
    pub impact: Option<ImpactPoint>,
    pub trajectory: Vec<SimulationState>,
    #[serde(skip)]
    pub telemetry_cpp: Vec<CsvCppRow>,
}

/// Longest time a released body is propagated while looking for its impact [s]
const FALL_MAX_DURATION_S: f64 = 10_800.0;

/// Altitude accuracy of the located ground impact [m]
const IMPACT_ALTITUDE_TOL_M: f64 = 1.0e-3;

/// State of a body at the moment it leaves the vehicle
#[derive(Debug, Clone)]
struct Release {
    kind: FallBodyKind,
    stage_idx: usize,
    time: f64,
    position: Vector3<f64>,
    velocity: Vector3<f64>,
    mass: f64,
}

/// Scheduled dumping product release (absolute time)
#[derive(Debug, Clone)]
struct DumpEvent {
    time: f64,
    stage_idx: usize,
    done: bool,
}

/// Everything the dynamics evaluates at one instant; shared by the
/// equations of motion and the telemetry so both always agree
#[derive(Debug, Clone)]
struct Forces {
    stage_idx: usize,
    is_powered: bool,
    flight_mode: FlightMode,
    pos_llh: Vector3<f64>,
    dcm_eci_to_ned: Matrix3<f64>,
    dcm_ned_to_body: Matrix3<f64>,
    /// Reported attitude: azimuth, elevation, roll [deg]
    attitude_deg: Vector3<f64>,
    /// Earth-relative velocity in NED [m/s]
    vel_ned: Vector3<f64>,
    wind_speed: f64,
    wind_dir_deg: f64,
    atm: AtmosphericConditions,
    mach: f64,
    q: f64,
    /// alpha, beta, total angle of attack [rad]
    aoa: Vector3<f64>,
    /// Effective thrust (after the nozzle exit pressure loss) [N]
    thrust: f64,
    mass_flow: f64,
    thrust_body: Vector3<f64>,
    aero_body: Vector3<f64>,
    gravity_eci: Vector3<f64>,
    acc_eci: Vector3<f64>,
}

impl Forces {
    fn dcm_body_to_eci(&self) -> Matrix3<f64> {
        (self.dcm_ned_to_body * self.dcm_eci_to_ned).transpose()
    }
}

/// Simulator state that integration and event handling change; saved
/// and restored while an event time is located
#[derive(Debug, Clone)]
struct Snapshot {
    state: SimulationState,
    current_stage_index: usize,
    dumps_done: Vec<bool>,
    releases: Vec<Release>,
    events: Vec<FlightEvent>,
    stage_runtime: Vec<StageRuntime>,
    h_hint: Option<f64>,
}

/// Main simulator struct
pub struct Simulator {
    pub config: RocketConfig,
    pub rocket: Rocket,
    pub atmosphere: AtmosphereModel,
    /// Air density variation [%] (-100 to 100), applied with the U.S. Standard
    /// Atmosphere altitude profile
    density_variation: f64,
    pub gravity: GravityModel,
    pub state: SimulationState,
    pub trajectory: Vec<SimulationState>,
    /// Events of the last `run()`, in time order
    pub events: Vec<FlightEvent>,
    stage_runtime: Vec<StageRuntime>,
    current_stage_index: usize,
    pub telemetry_cpp: Vec<CsvCppRow>,
    integration: IntegrationMode,
    /// Step size carried between adaptive integration intervals
    h_hint: Option<f64>,
    /// Adaptive steps accepted at the minimum step size above tolerance
    pub forced_steps: usize,
    /// Times the integrator must stop at: separations and dumps
    event_times: Vec<f64>,
    dump_events: Vec<DumpEvent>,
    releases: Vec<Release>,
    /// While integrating between two events: a time inside that interval,
    /// used for discrete state (stage, powered) so RK stages evaluated on an
    /// interval boundary do not see the next phase
    phase_time: Option<f64>,
}

#[derive(Debug, thiserror::Error)]
pub enum SimError {
    #[error("Configuration error: {0}")]
    Config(String),

    #[error("Integration error: {0}")]
    Integration(String),

    #[error("Physics error: {0}")]
    Physics(String),
}

impl Simulator {
    /// Create new simulator from configuration
    pub fn new(rocket: Rocket) -> Result<Self, SimError> {
        let config = rocket.config.clone();
        let atmosphere = AtmosphereModel::new();
        let gravity = GravityModel::new();
        let integrator_settings = config.calculate_condition.integrator.clone();
        let integration = match integrator_settings.method {
            IntegratorMethod::Rk45 => IntegrationMode::Rk45 {
                solver: DormandPrince54::new(
                    integrator_settings.rk45_abs_tol,
                    integrator_settings.rk45_rel_tol,
                    1.0e-6,
                    10.0,
                ),
            },
            IntegratorMethod::Rk4 => {
                let time_step = config.calculate_condition.time_step;
                let default_dt = if time_step.is_finite() && time_step > 0.0 {
                    (time_step / 2.0).max(1.0e-6)
                } else {
                    0.1
                };
                let user_dt = integrator_settings
                    .rk4_step
                    .filter(|v| v.is_finite() && *v > 0.0)
                    .unwrap_or(default_dt);
                IntegrationMode::Rk4 { step: user_dt }
            }
        };

        // Initialize state from launch conditions
        let pos_llh = Vector3::from(config.launch.position_llh);
        let vel_ned = Vector3::from(config.launch.velocity_ned);

        let position = CoordinateTransform::pos_eci_init(&pos_llh);
        let velocity = CoordinateTransform::vel_eci_init(&vel_ned, &pos_llh);

        let stage_runtime = build_stage_runtime(&config, &rocket);
        let mass = stage_runtime
            .first()
            .map(|rt| rt.stack_mass)
            .unwrap_or(rocket.stage_config(0).mass_initial);

        let state = SimulationState {
            time: 0.0,
            position,
            velocity,
            mass,
            stage: 1,
            altitude: config.launch.position_llh[2],
            velocity_magnitude: velocity.magnitude(),
            mach_number: 0.0,
            dynamic_pressure: 0.0,
            thrust: 0.0,
            drag_force: 0.0,
            velocity_ned: vel_ned,
            velocity_eci_ned: Vector3::zeros(),
            velocity_ecef_ned: vel_ned,
            sea_level_mach: 0.0,
            acceleration_magnitude: 0.0,
            acc_eci: Vector3::zeros(),
            acc_body: Vector3::zeros(),
            angle_of_attack: 0.0,
            sideslip_angle: 0.0,
            attitude_azimuth: 0.0,
            attitude_elevation: 0.0,
            flight_mode: FlightMode::Power3Dof,
            iip_lat_deg: None,
            iip_lon_deg: None,
        };

        let density_variation = config.calculate_condition.air_density_variation;

        // Dumping products leave while their stage is flying (stage-relative time)
        let end_time = config.calculate_condition.end_time;
        let dump_events: Vec<DumpEvent> = stage_runtime
            .iter()
            .filter_map(|rt| {
                let dump = &rocket.stage_config(rt.index).dumping_product;
                let time = rt.start_time + dump.dumping_product_separation_time;
                (dump.dumping_product_exists
                    && time > rt.start_time
                    && time < rt.separation_time
                    && time < end_time)
                    .then_some(DumpEvent {
                        time,
                        stage_idx: rt.index,
                        done: false,
                    })
            })
            .collect();
        // Discontinuities: ignition, burnout, separation, dumps
        let mut event_times: Vec<f64> = stage_runtime
            .iter()
            .flat_map(|rt| [rt.burn_start, rt.power_end, rt.separation_time])
            .chain(dump_events.iter().map(|d| d.time))
            .filter(|&t| t > 0.0 && t < end_time)
            .collect();
        event_times.sort_by(f64::total_cmp);
        event_times.dedup();

        let mut sim = Simulator {
            config,
            rocket,
            atmosphere,
            density_variation,
            gravity,
            state,
            trajectory: Vec::new(),
            events: Vec::new(),
            stage_runtime,
            current_stage_index: 0,
            telemetry_cpp: Vec::new(),
            integration,
            h_hint: None,
            forced_steps: 0,
            event_times,
            dump_events,
            releases: Vec::new(),
            phase_time: None,
        };
        sim.refresh();
        Ok(sim)
    }

    /// Run the full simulation and return the trajectory sampled every
    /// output time step (plus the located impact, if any)
    pub fn run(&mut self) -> Vec<SimulationState> {
        self.trajectory.clear();
        self.telemetry_cpp.clear();
        self.releases.clear();
        self.events.clear();
        for dump in &mut self.dump_events {
            dump.done = false;
        }

        // Record initial state (t=0) so outputs include the starting sample
        self.refresh();
        self.record_output();
        let t0 = self.state.time;
        self.record_scheduled_events(t0, true);
        let end_time = self.config.calculate_condition.end_time;
        let dt_out = self.config.calculate_condition.time_step;
        if !(dt_out.is_finite() && dt_out > 0.0) {
            return self.trajectory.clone();
        }

        // Max-Q: largest sampled q and the snapshot one output step before it
        let mut max_q: Option<(f64, Snapshot, f64)> = None;
        let mut k: u64 = 1;
        while self.state.time + 1.0e-9 < end_time {
            // Output times from the step count: no accumulated round-off
            let t_next = (t0 + k as f64 * dt_out).min(end_time);
            let before = self.snapshot();
            let prev = before.state.clone();
            self.advance_to_time(t_next);
            self.refresh();

            if self.state.altitude <= 0.0 && prev.altitude > 0.0 {
                self.locate(&before, prev.time, t_next, |sim| sim.state.altitude);
                if max_q
                    .as_ref()
                    .is_none_or(|(q, _, _)| self.state.dynamic_pressure > *q)
                {
                    max_q = Some((self.state.dynamic_pressure, before, prev.time));
                }
                self.record_output();
                self.record_event(EventKind::Impact);
                break;
            }
            if self.state.altitude < 0.0 {
                // Started on (or below) the ground and sank
                self.record_output();
                self.record_event(EventKind::Impact);
                break;
            }

            let vertical = |s: &SimulationState| -s.velocity_ecef_ned.z;
            let mut located = Vec::new();
            if vertical(&prev) > 0.0 && vertical(&self.state) <= 0.0 {
                located.push(EventKind::Apogee);
            }
            if prev.mach_number < 1.0 && self.state.mach_number >= 1.0 {
                located.push(EventKind::Mach1);
            }
            if !located.is_empty() {
                let after = self.snapshot();
                let mut found = Vec::new();
                for kind in located {
                    match kind {
                        EventKind::Apogee => {
                            self.locate(&before, prev.time, t_next, |sim| vertical(&sim.state))
                        }
                        _ => self.locate(&before, prev.time, t_next, |sim| {
                            sim.state.mach_number - 1.0
                        }),
                    }
                    found.push((kind, self.state.clone()));
                }
                self.restore(&after);
                for (kind, state) in found {
                    self.insert_event(kind, &state);
                }
            }
            if max_q
                .as_ref()
                .is_none_or(|(q, _, _)| self.state.dynamic_pressure > *q)
            {
                max_q = Some((self.state.dynamic_pressure, before, prev.time));
            }

            self.record_output();
            k += 1;
        }

        if let Some((q, snap, t_lo)) = max_q
            && q > 0.0
        {
            let end = self.snapshot();
            let dt = self.config.calculate_condition.time_step;
            let t_hi = (t_lo + 2.0 * dt).min(end.state.time);
            self.locate_max_q(&snap, t_lo, t_hi);
            let event_state = self.state.clone();
            self.restore(&end);
            self.insert_event(EventKind::MaxQ, &event_state);
        }
        self.trajectory.clone()
    }

    /// Get current simulation state
    pub fn current_state(&self) -> &SimulationState {
        &self.state
    }

    fn snapshot(&self) -> Snapshot {
        Snapshot {
            state: self.state.clone(),
            current_stage_index: self.current_stage_index,
            dumps_done: self.dump_events.iter().map(|d| d.done).collect(),
            releases: self.releases.clone(),
            events: self.events.clone(),
            stage_runtime: self.stage_runtime.clone(),
            h_hint: self.h_hint,
        }
    }

    fn restore(&mut self, snap: &Snapshot) {
        self.state = snap.state.clone();
        self.current_stage_index = snap.current_stage_index;
        for (dump, &done) in self.dump_events.iter_mut().zip(&snap.dumps_done) {
            dump.done = done;
        }
        self.releases = snap.releases.clone();
        self.events = snap.events.clone();
        self.stage_runtime = snap.stage_runtime.clone();
        self.h_hint = snap.h_hint;
    }

    /// Re-integrate from `from` to time `t` and refresh the derived state
    fn evaluate_at(&mut self, from: &Snapshot, t: f64) {
        self.restore(from);
        self.advance_to_time(t);
        self.refresh();
    }

    /// Locate the root of `f` between `t_lo` and `t_hi` (where `f` changes
    /// sign) with the Illinois method, re-integrating from `from` for every
    /// trial time. Leaves the simulator at the located time.
    fn locate<F: Fn(&Self) -> f64>(&mut self, from: &Snapshot, t_lo: f64, t_hi: f64, f: F) {
        let (mut ta, mut tb) = (t_lo, t_hi);
        self.evaluate_at(from, ta);
        let mut fa = f(self);
        self.evaluate_at(from, tb);
        let mut fb = f(self);
        let mut side = 0;
        for _ in 0..100 {
            if fb.abs() <= IMPACT_ALTITUDE_TOL_M * 1e-3 || tb - ta < 1.0e-9 {
                break;
            }
            let mut tc = (ta * fb - tb * fa) / (fb - fa);
            if !(tc > ta && tc < tb) {
                tc = 0.5 * (ta + tb);
            }
            self.evaluate_at(from, tc);
            let fc = f(self);
            if fc.abs() <= IMPACT_ALTITUDE_TOL_M {
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
        let q_at = |sim: &mut Self, t: f64| {
            sim.evaluate_at(from, t);
            sim.state.dynamic_pressure
        };
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

    /// Append the current state to the trajectory and the C++ telemetry
    fn record_output(&mut self) {
        self.trajectory.push(self.state.clone());
        let row = self.capture_cpp_row();
        self.telemetry_cpp.push(row);
    }

    fn event_from(&self, kind: EventKind, state: &SimulationState) -> FlightEvent {
        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(&state.position, state.time);
        let llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        let launch = Vector3::from(self.config.launch.position_llh);
        FlightEvent {
            kind,
            stage: state.stage,
            time_s: state.time,
            altitude_m: state.altitude,
            latitude_deg: llh.x,
            longitude_deg: llh.y,
            downrange_m: CoordinateTransform::distance_surface(&launch, &llh),
            speed_mps: state.velocity_ecef_ned.magnitude(),
            inertial_speed_mps: state.velocity_magnitude,
            mach: state.mach_number,
            dynamic_pressure_pa: state.dynamic_pressure,
            mass_kg: state.mass,
        }
    }

    /// Record an event at the current state
    fn record_event(&mut self, kind: EventKind) {
        let state = self.state.clone();
        self.insert_event(kind, &state);
    }

    /// Insert an event in time order
    fn insert_event(&mut self, kind: EventKind, state: &SimulationState) {
        let event = self.event_from(kind, state);
        let at = self.events.partition_point(|e| e.time_s <= event.time_s);
        self.events.insert(at, event);
    }

    /// Record the scheduled events (ignition, burnout, separation, dump)
    /// that happen at time `t`; `initial` also records those at t <= 0
    fn record_scheduled_events(&mut self, t: f64, initial: bool) {
        let at = |e: f64| (e - t).abs() < 1.0e-9 || (initial && e <= t);
        let mut kinds: Vec<(EventKind, usize)> = Vec::new();
        for rt in &self.stage_runtime {
            let powered = rt.power_end > rt.burn_start;
            if powered && at(rt.burn_start) {
                kinds.push((EventKind::Ignition, rt.index));
            }
            if powered && at(rt.power_end) && !initial {
                kinds.push((EventKind::Burnout, rt.index));
            }
            let has_next = rt.index + 1 < self.stage_runtime.len();
            if has_next && at(rt.separation_time) && !initial {
                kinds.push((EventKind::Separation, rt.index));
            }
        }
        for dump in &self.dump_events {
            if at(dump.time) && !initial {
                kinds.push((EventKind::Dump, dump.stage_idx));
            }
        }
        for (kind, stage_idx) in kinds {
            let mut state = self.state.clone();
            state.stage = (stage_idx + 1) as u8;
            self.insert_event(kind, &state);
        }
    }

    /// Atmosphere at altitude, with the configured density variation
    fn atmosphere_at(&self, altitude: f64) -> AtmosphericConditions {
        self.atmosphere
            .conditions_with_variation(altitude, self.density_variation)
    }

    /// Time used for discrete state (stage, powered) when evaluating dynamics at `t`
    fn discrete_time(&self, t: f64) -> f64 {
        self.phase_time.unwrap_or(t)
    }

    /// Whether the engine of `stage_idx` is burning at absolute time `t`
    fn is_powered_at(&self, stage_idx: usize, t: f64) -> bool {
        let stage = &self.stage_runtime[stage_idx];
        t >= stage.burn_start && t < stage.power_end
    }

    fn stage_index_for_time(&self, time: f64) -> usize {
        for stage in &self.stage_runtime {
            if time < stage.separation_time {
                return stage.index;
            }
        }
        self.stage_runtime.len().saturating_sub(1)
    }

    fn stage_local_time(&self, stage_index: usize, time: f64) -> f64 {
        (time - self.stage_runtime[stage_index].start_time).max(0.0)
    }

    fn update_stage_index(&mut self) {
        let new_stage = self.stage_index_for_time(self.state.time);
        self.state.stage = (new_stage + 1) as u8;
        if new_stage != self.current_stage_index {
            if new_stage > self.current_stage_index {
                // The spent stage keeps what is left after the upper stack leaves
                let spent_mass = self.state.mass - self.stage_runtime[new_stage].stack_mass;
                self.releases.push(Release {
                    kind: FallBodyKind::Stage,
                    stage_idx: self.current_stage_index,
                    time: self.state.time,
                    position: self.state.position,
                    velocity: self.state.velocity,
                    mass: spent_mass.max(0.0),
                });
            }
            self.current_stage_index = new_stage;
            self.state.mass = self.stage_runtime[new_stage].stack_mass;
        }
    }

    /// Release the dumping products whose time has come
    fn apply_due_dumps(&mut self) {
        let now = self.state.time;
        for k in 0..self.dump_events.len() {
            let event = &self.dump_events[k];
            if event.done || event.time > now + 1.0e-9 {
                continue;
            }
            let stage_idx = event.stage_idx;
            self.dump_events[k].done = true;
            let dump = &self.rocket.stage_config(stage_idx).dumping_product;
            let mass = dump.dumping_product_mass.min(self.state.mass).max(0.0);
            let add_ned = Vector3::from(dump.additional_speed_at_dumping_ned);

            let pos_ecef = CoordinateTransform::pos_eci_to_ecef(&self.state.position, now);
            let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
            let dcm_ned_to_eci = CoordinateTransform::dcm_eci_to_ned(&pos_llh, now).transpose();
            self.releases.push(Release {
                kind: FallBodyKind::Dump,
                stage_idx,
                time: now,
                position: self.state.position,
                velocity: self.state.velocity + dcm_ned_to_eci * add_ned,
                mass,
            });
            self.state.mass -= mass;
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

    /// Advance to `target_time`, stopping at scheduled events on the way.
    /// Derived quantities are not refreshed (see `refresh`).
    fn advance_to_time(&mut self, target_time: f64) {
        let end_time = self.config.calculate_condition.end_time;
        let target = target_time.min(end_time);
        while let Some(event) = self
            .event_times
            .iter()
            .copied()
            .find(|&e| e > self.state.time + 1.0e-9 && e <= target)
        {
            self.integrate_to(event);
            self.apply_due_dumps();
            self.refresh();
            self.record_scheduled_events(event, false);
        }
        self.integrate_to(target);
        self.apply_due_dumps();
    }

    /// Integrate to `target`; no event may lie strictly inside the interval
    fn integrate_to(&mut self, target: f64) {
        let t0 = self.state.time;
        if target <= t0 {
            return;
        }
        self.phase_time = Some(0.5 * (t0 + target));
        let mut y = self.state_vector();
        let system = |t: f64, s: &StateVector| self.dynamics(t, s);
        match self.integration {
            IntegrationMode::Rk4 { step } => {
                // Equal steps no longer than `step`, ending exactly on target
                let n = ((target - t0) / step - 1.0e-9).ceil().max(1.0) as u64;
                let h = (target - t0) / n as f64;
                for i in 0..n {
                    y = RungeKutta4.integrate(&y, t0 + i as f64 * h, h, system);
                }
            }
            IntegrationMode::Rk45 { solver } => {
                let mut t = t0;
                let mut hint = self.h_hint;
                let forced = solver.advance_to(&mut y, &mut t, target, &mut hint, system);
                self.h_hint = hint;
                self.forced_steps += forced;
            }
        }
        self.phase_time = None;
        self.apply_state_vector(target, &y);
    }

    /// Propagate every spent stage and dumping product released during
    /// `run()` to the ground
    pub fn simulate_fall_bodies(&self) -> Vec<FallBody> {
        self.releases
            .iter()
            .map(|release| self.simulate_fall_body(release))
            .collect()
    }

    fn simulate_fall_body(&self, release: &Release) -> FallBody {
        let stage_no = (release.stage_idx + 1) as u8;
        let mut body = FallBody {
            kind: release.kind,
            stage: stage_no,
            release_time_s: release.time,
            mass_kg: release.mass,
            impact: None,
            trajectory: Vec::new(),
            telemetry_cpp: Vec::new(),
        };
        // Orbit or escape: no impact point, nothing to propagate
        if release.mass <= 0.0
            || Self::iip_of(&release.position, &release.velocity, release.time).is_none()
        {
            return body;
        }

        // The body flies on as an unpowered single-stage vehicle with its own
        // aerodynamics; a dumping product always uses its ballistic coefficient.
        // A spent stage has no attitude control, so the attitude program
        // (free flight mode 1) is replaced by an aerodynamically stable body:
        // holding the commanded attitude through re-entry is not physical and
        // makes the dynamics stiff (the airflow swings past 90 deg).
        let mut stage = self.rocket.stage_config(release.stage_idx).clone();
        if stage.free_flight_mode == 1 {
            stage.free_flight_mode = 0;
        }
        stage.mass_initial = release.mass;
        stage.thrust.const_thrust_vac = 0.0;
        stage.thrust.burn_start_time = 0.0;
        stage.thrust.burn_end_time = 0.0;
        stage.thrust.forced_cutoff_time = 0.0;
        stage.stage.following_stage_exists = false;
        if release.kind == FallBodyKind::Dump {
            stage.free_flight_mode = 2;
            stage.aero.ballistic_coefficient =
                stage.dumping_product.dumping_product_ballistic_coefficient;
        }
        stage.dumping_product.dumping_product_exists = false;

        let mut rocket = self.rocket.clone();
        rocket.stage_configs = vec![stage.clone()];
        rocket.thrust_tables = vec![None];
        rocket.isp_tables = vec![None];
        rocket.config.stages = vec![stage];
        rocket.config.calculate_condition.end_time = release.time + FALL_MAX_DURATION_S;

        let Ok(mut sim) = Simulator::new(rocket) else {
            return body;
        };
        sim.state.time = release.time;
        sim.state.position = release.position;
        sim.state.velocity = release.velocity;
        sim.state.mass = release.mass;
        sim.refresh();

        let mut trajectory = sim.run();
        for state in &mut trajectory {
            state.stage = stage_no;
        }
        let mut rows = std::mem::take(&mut sim.telemetry_cpp);
        for row in &mut rows {
            row.stage_number = stage_no;
            row.is_separated = 1;
        }
        body.impact = impact_point(&trajectory);
        body.trajectory = trajectory;
        body.telemetry_cpp = rows;
        body
    }

    /// Advance the simulation by `dt` (no event location)
    pub fn step(&mut self, dt: f64) {
        if !(dt.is_finite() && dt > 0.0) {
            return;
        }
        let target = (self.state.time + dt).min(self.config.calculate_condition.end_time);
        self.advance_to_time(target);
        self.refresh();
    }

    /// Forces and derived quantities at the current state
    fn current_forces(&self) -> Forces {
        self.forces(self.state.time, &self.state_vector())
    }

    /// Recompute the derived quantities of `self.state` from its time,
    /// position, velocity and mass
    fn refresh(&mut self) {
        let f = self.current_forces();
        let s = &mut self.state;
        s.stage = (f.stage_idx + 1) as u8;
        s.altitude = f.pos_llh.z;
        s.velocity_magnitude = s.velocity.magnitude();
        s.mach_number = f.mach;
        s.dynamic_pressure = f.q;
        s.thrust = f.thrust;
        s.drag_force = f.aero_body.x.abs();
        s.velocity_eci_ned = f.dcm_eci_to_ned * s.velocity;
        s.velocity_ecef_ned = f.vel_ned;
        s.velocity_ned = f.vel_ned;
        // Mach number based on the sea level sound speed
        const SEA_LEVEL_SOUND_SPEED: f64 = 340.3;
        s.sea_level_mach = f.mach * f.atm.speed_of_sound / SEA_LEVEL_SOUND_SPEED;
        s.acc_eci = f.acc_eci;
        s.acceleration_magnitude = f.acc_eci.magnitude();
        // Body-frame acceleration excludes gravity (what an accelerometer measures)
        s.acc_body = f.dcm_ned_to_body * f.dcm_eci_to_ned * (f.acc_eci - f.gravity_eci);
        s.angle_of_attack = f.aoa.x.to_degrees();
        s.sideslip_angle = f.aoa.y.to_degrees();
        s.attitude_azimuth = f.attitude_deg.x;
        s.attitude_elevation = f.attitude_deg.y;
        s.flight_mode = f.flight_mode;
        let iip = Self::iip_of(&s.position, &s.velocity, s.time);
        s.iip_lat_deg = iip.map(|p| p.x);
        s.iip_lon_deg = iip.map(|p| p.y);
    }

    /// Instantaneous impact point [deg] of an ECI state at time `t`
    fn iip_of(pos_eci: &Vector3<f64>, vel_eci: &Vector3<f64>, t: f64) -> Option<Vector3<f64>> {
        let omega_vec = Vector3::new(0.0, 0.0, OMEGA_EARTH);
        let dcm = CoordinateTransform::dcm_eci_to_ecef(t);
        let pos_ecef = dcm * pos_eci;
        let vel_ecef = dcm * (vel_eci - omega_vec.cross(pos_eci));
        CoordinateTransform::pos_llh_iip(&pos_ecef, &vel_ecef)
    }

    /// Equations of motion: `[dm/dt, dr/dt, dv/dt]`
    fn dynamics(&self, t: f64, y: &StateVector) -> StateVector {
        let f = self.forces(t, y);
        [
            -f.mass_flow,
            y[4],
            y[5],
            y[6],
            f.acc_eci.x,
            f.acc_eci.y,
            f.acc_eci.z,
        ]
    }

    /// Evaluate gravity, thrust and aerodynamics at time `t` and state `y`
    fn forces(&self, t: f64, y: &StateVector) -> Forces {
        let mass = y[0];
        let position = Vector3::new(y[1], y[2], y[3]);
        let velocity = Vector3::new(y[4], y[5], y[6]);

        let discrete_t = self.discrete_time(t);
        let stage_idx = self.stage_index_for_time(discrete_t);
        let stage_cfg = self.rocket.stage_config(stage_idx);
        let is_powered = self.is_powered_at(stage_idx, discrete_t);
        let flight_mode = if is_powered {
            FlightMode::Power3Dof
        } else {
            FlightMode::free(stage_cfg.free_flight_mode)
        };

        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(&position, t);
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        let atm = self.atmosphere_at(pos_llh.z);
        let dcm_eci_to_ned = CoordinateTransform::dcm_eci_to_ned(&pos_llh, t);
        let vel_ned =
            CoordinateTransform::vel_eci_to_ecef_ned_frame(&position, &velocity, &dcm_eci_to_ned);
        let (wind_speed, wind_dir_deg) = self.rocket.wind_at_altitude(pos_llh.z);
        let wind_ned = CoordinateTransform::vel_wind_ned_frame(wind_speed, wind_dir_deg);
        let vel_air_ned = vel_ned - wind_ned;
        let air_speed = vel_air_ned.magnitude();
        let mach = if atm.speed_of_sound > 0.0 {
            air_speed / atm.speed_of_sound
        } else {
            0.0
        };
        let q = 0.5 * atm.density * air_speed * air_speed;

        // Attitude: the program, or along the airflow for a free body
        let program = self.rocket.attitude_at_time(t);
        let attitude_deg = if flight_mode.follows_attitude_program() || air_speed < 1.0e-6 {
            Vector3::new(program.0, program.1, 0.0)
        } else {
            let horizontal = vel_air_ned.x.hypot(vel_air_ned.y);
            Vector3::new(
                vel_air_ned.y.atan2(vel_air_ned.x).to_degrees(),
                (-vel_air_ned.z).atan2(horizontal).to_degrees(),
                0.0,
            )
        };
        let dcm_ned_to_body = CoordinateTransform::dcm_ned_to_body(
            deg2rad(attitude_deg.x),
            deg2rad(attitude_deg.y),
            Some(deg2rad(attitude_deg.z)),
        );
        let vel_air_body = dcm_ned_to_body * vel_air_ned;
        let aoa = CoordinateTransform::angle_of_attack(&vel_air_body);

        // Thrust along body +X, reduced by the ambient pressure at the exit
        let (mut thrust, mut mass_flow) = (0.0, 0.0);
        if is_powered {
            let local_time = self.stage_local_time(stage_idx, t);
            let thrust_vac = self.rocket.thrust_at(stage_idx, local_time);
            let isp_vac = self.rocket.isp_at(stage_idx, local_time);
            if thrust_vac > 0.0 && isp_vac > 0.0 {
                mass_flow = thrust_vac / (isp_vac * G0);
                let exit_area = std::f64::consts::PI
                    * stage_cfg.thrust.throat_diameter.powi(2)
                    * 0.25
                    * stage_cfg.thrust.nozzle_expansion_ratio;
                thrust = thrust_vac - exit_area * atm.pressure;
            }
        }
        let thrust_body = Vector3::new(thrust, 0.0, 0.0);

        // Aerodynamics in body axes
        let reference_area = std::f64::consts::PI * (stage_cfg.aero.body_diameter / 2.0).powi(2);
        let aero_body = if air_speed < 0.1 {
            Vector3::zeros()
        } else {
            match flight_mode {
                // Ballistic coefficient model (body along the airflow)
                FlightMode::FreeBallistic => Vector3::new(
                    -q / stage_cfg.aero.ballistic_coefficient.max(1e-9) * mass.max(0.0),
                    0.0,
                    0.0,
                ),
                // Body aligned with the airflow (zero angle of attack)
                FlightMode::FreeAeroStable => Vector3::new(
                    -self.rocket.ca_at_mach(stage_idx, mach) * q * reference_area,
                    0.0,
                    0.0,
                ),
                // Aerodynamic coefficients (CA, CN from Mach x |angle| table)
                _ => self.aero_force_body(stage_idx, mach, &vel_air_body, q * reference_area),
            }
        };

        let gravity_eci = self.gravity.gravity_eci(&position);
        let dcm_body_to_eci = (dcm_ned_to_body * dcm_eci_to_ned).transpose();
        let acc_eci = if mass > 0.0 {
            dcm_body_to_eci * (thrust_body + aero_body) / mass + gravity_eci
        } else {
            gravity_eci
        };

        Forces {
            stage_idx,
            is_powered,
            flight_mode,
            pos_llh,
            dcm_eci_to_ned,
            dcm_ned_to_body,
            attitude_deg,
            vel_ned,
            wind_speed,
            wind_dir_deg,
            atm,
            mach,
            q,
            aoa,
            thrust,
            mass_flow,
            thrust_body,
            aero_body,
            gravity_eci,
            acc_eci,
        }
    }

    fn capture_cpp_row(&self) -> CsvCppRow {
        let f = self.current_forces();
        let s = &self.state;
        let mass = s.mass;
        let dcm_body_to_eci = f.dcm_body_to_eci();
        let stage_cfg = self.rocket.stage_config(f.stage_idx);

        // Loss terms
        let vel_ned = f.vel_ned;
        let path_angle = (-vel_ned.z).atan2(vel_ned.x.hypot(vel_ned.y));
        let gravity_ned = f.dcm_eci_to_ned * f.gravity_eci;
        let exit_area = std::f64::consts::PI
            * stage_cfg.thrust.throat_diameter.powi(2)
            * 0.25
            * stage_cfg.thrust.nozzle_expansion_ratio;
        let loss_thrust = if f.is_powered && mass > 0.0 {
            f.atm.pressure * exit_area / mass
        } else {
            0.0
        };
        let loss_aero = if mass > 0.0 {
            f.aero_body.x.abs() / mass
        } else {
            0.0
        };
        let isp_effective = if f.mass_flow > 1.0e-4 {
            f.thrust / f.mass_flow / G0
        } else {
            0.0
        };

        let launch_llh = Vector3::from(self.config.launch.position_llh);
        let downrange = CoordinateTransform::distance_surface(&launch_llh, &f.pos_llh);

        // Instantaneous impact point (zeros when none exists, as in the C++ output)
        let iip_llh = Self::iip_of(&s.position, &s.velocity, s.time).unwrap_or_else(Vector3::zeros);

        CsvCppRow {
            time: s.time,
            mass,
            thrust: f.thrust,
            lat_deg: f.pos_llh.x,
            lon_deg: f.pos_llh.y,
            alt_m: f.pos_llh.z,
            pos_eci: s.position,
            vel_eci: s.velocity,
            vel_ned,
            acc_eci: f.acc_eci,
            acc_body: s.acc_body,
            isp_s: isp_effective,
            mach: f.mach,
            att_az_deg: f.attitude_deg.x,
            att_el_deg: f.attitude_deg.y,
            att_roll_deg: f.attitude_deg.z,
            aoa_alpha_deg: f.aoa.x.to_degrees(),
            aoa_beta_deg: f.aoa.y.to_degrees(),
            aoa_gamma_deg: f.aoa.z.to_degrees(),
            q_pa: f.q,
            aero_body: f.aero_body,
            thrust_body: f.thrust_body,
            gimbal_pitch_deg: 0.0,
            gimbal_yaw_deg: 0.0,
            wind_speed: f.wind_speed,
            wind_dir_deg: f.wind_dir_deg,
            downrange,
            iip_lat_deg: iip_llh.x,
            iip_lon_deg: iip_llh.y,
            dcm_body_to_eci,
            inertial_speed: s.velocity.magnitude(),
            kinetic_energy_ned: 0.5 * mass * vel_ned.magnitude_squared(),
            loss_gravity: gravity_ned.z * path_angle.sin(),
            loss_aero,
            loss_thrust,
            is_powered: f.is_powered as i32,
            is_separated: (f.stage_idx > 0) as i32,
            stage_number: (f.stage_idx + 1) as u8,
        }
    }

    /// Aerodynamic force in the body frame from CA and CN.
    ///
    /// `vel_air_body` is the vehicle's air-relative velocity in body axes and
    /// `q_area` is dynamic pressure × reference area. Each component opposes
    /// the matching velocity component, with the flow angle measured from the
    /// body axis line (0–90°). For normal flight (u > 0) this is the usual
    /// axial drag along −X and normal force from α/β; when the flow comes
    /// from behind (|AoA| > 90°, e.g. re-entry with a fixed commanded
    /// attitude) the body is treated as symmetric, so the force still
    /// opposes the air-relative velocity and never adds energy.
    fn aero_force_body(
        &self,
        stage_idx: usize,
        mach_number: f64,
        vel_air_body: &Vector3<f64>,
        q_area: f64,
    ) -> Vector3<f64> {
        let sign = |x: f64| if x == 0.0 { 0.0 } else { x.signum() };
        let (u, v, w) = (vel_air_body.x, vel_air_body.y, vel_air_body.z);
        // The axial force flips with the flow when it crosses broadside
        // (u = 0). A hard sign there makes the dynamics chatter around the
        // crossing (a commanded attitude held through re-entry) and stalls the
        // adaptive integrator, so blend it over about +-1 deg of flow angle.
        // Normalised to exactly 1 for flow along the axis; below 80 deg angle
        // of attack the axial force changes by < 0.7 %.
        let speed = vel_air_body.magnitude();
        let blend = 0.02 * speed;
        let axial_sign = if blend > 0.0 {
            u / u.hypot(blend) * speed.hypot(blend) / speed
        } else {
            sign(u)
        };
        let alpha_deg = w.abs().atan2(u.abs()).to_degrees();
        let beta_deg = v.abs().atan2(u.abs()).to_degrees();

        let ca = self.rocket.ca_at_mach(stage_idx, mach_number);
        let cn_pitch = self.rocket.cn_at(stage_idx, mach_number, alpha_deg);
        let cn_yaw = self.rocket.cn_at(stage_idx, mach_number, beta_deg);

        Vector3::new(
            -axial_sign * ca * q_area,
            -sign(v) * cn_yaw * q_area,
            -sign(w) * cn_pitch * q_area,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_config() -> RocketConfig {
        use crate::rocket::*;

        let stage = StageConfig {
            power_flight_mode: 0,
            free_flight_mode: 2,
            mass_initial: 1000.0,
            thrust: ThrustConfig {
                isp_file_exists: false,
                isp_file_name: "".to_string(),
                isp_coefficient: 1.0,
                const_isp_vac: 200.0,
                thrust_file_exists: false,
                thrust_file_name: "".to_string(),
                thrust_coefficient: 1.0,
                const_thrust_vac: 0.0,
                burn_start_time: 0.0,
                burn_end_time: 0.0,
                forced_cutoff_time: 0.0,
                throat_diameter: 0.1,
                nozzle_expansion_ratio: 5.0,
                nozzle_exhaust_pressure: 101300.0,
            },
            aero: AeroConfig {
                body_diameter: 0.5,
                cn_file_exists: false,
                cn_file_name: "".to_string(),
                normal_multiplier: 1.0,
                const_normal_coefficient: 0.2,
                ca_file_exists: false,
                ca_file_name: "".to_string(),
                axial_multiplier: 1.0,
                const_axial_coefficient: 0.2,
                ballistic_coefficient: 100.0,
            },
            attitude: AttitudeConfig {
                attitude_file_exists: false,
                attitude_file_name: "".to_string(),
                const_elevation: 83.0,
                const_azimuth: 113.0,
                pitch_offset: 0.0,
                yaw_offset: 0.0,
                roll_offset: 0.0,
                gyro_bias_x: 0.0,
                gyro_bias_y: 0.0,
                gyro_bias_z: 0.0,
            },
            dumping_product: DumpingProductConfig {
                dumping_product_exists: false,
                dumping_product_separation_time: 130.0,
                dumping_product_mass: 10.0,
                dumping_product_ballistic_coefficient: 100.0,
                additional_speed_at_dumping_ned: [0.0, 0.0, 0.0],
            },
            attitude_neutrality: AttitudeNeutralityConfig {
                considering_neutrality: false,
                cg_controller_position_file: "".to_string(),
                cp_file: "".to_string(),
            },
            six_dof: SixDofConfig {
                cg_cp_controller_position_file: "".to_string(),
                moment_of_inertia_file_name: "".to_string(),
            },
            stage: StageTransitionConfig {
                following_stage_exists: false,
                separation_time: 1e6,
            },
        };

        RocketConfig {
            name: "test".to_string(),
            calculate_condition: CalculateCondition {
                end_time: 10.0,
                time_step: 1.0,
                air_density_file_exists: false,
                air_density_file: "".to_string(),
                air_density_variation: 0.0,
                integrator: IntegratorSettings::default(),
            },
            launch: LaunchCondition {
                position_llh: [35.0, 139.0, 0.0],
                velocity_ned: [0.0, 0.0, 0.0],
                launch_time: [2023, 1, 1, 12, 0, 0],
            },
            stages: vec![stage],
            wind: WindConfig {
                wind_file_exists: false,
                wind_file_name: "".to_string(),
                const_wind: [0.0, 270.0],
            },
        }
    }

    #[test]
    fn test_simulator_creation() {
        let config = create_test_config();
        let rocket = Rocket::new(config.clone());
        let simulator = Simulator::new(rocket);
        assert!(simulator.is_ok());
    }

    #[test]
    fn test_simulation_step() {
        let config = create_test_config();
        let rocket = Rocket::new(config.clone());
        let mut simulator = Simulator::new(rocket).unwrap();
        let t0 = simulator.state.time;
        simulator.run();
        assert!(simulator.trajectory.len() >= 2);
        assert!(simulator.state.time >= t0);
    }

    #[test]
    fn test_stage_transition() {
        let mut config = create_test_config();
        let mut stage2 = config.stages[0].clone();
        stage2.mass_initial = 200.0;
        stage2.thrust.const_thrust_vac = 0.0;
        stage2.thrust.burn_start_time = 0.0;
        stage2.thrust.burn_end_time = 0.5;
        stage2.thrust.forced_cutoff_time = 0.5;
        stage2.stage.following_stage_exists = false;
        stage2.stage.separation_time = 1.0e6;

        config.stages[0].thrust.const_thrust_vac = 100_000.0;
        config.stages[0].thrust.burn_end_time = 1.0;
        config.stages[0].thrust.forced_cutoff_time = 1.0;
        config.stages[0].stage.following_stage_exists = true;
        config.stages[0].stage.separation_time = 1.5;
        config.stages.push(stage2);
        config.calculate_condition.end_time = 3.0;

        let rocket = Rocket::new(config.clone());
        let mut simulator = Simulator::new(rocket).unwrap();
        let trajectory = simulator.run();
        assert!(trajectory.iter().any(|state| state.stage >= 2));
        let final_stage = trajectory.last().unwrap().stage;
        assert!(final_stage >= 2);
    }

    #[test]
    fn test_ground_impact_handling() {
        let mut config = create_test_config();
        config.calculate_condition.end_time = 30.0;
        config.stages[0].thrust.const_thrust_vac = 50_000.0; // Lower thrust for ballistic trajectory
        config.stages[0].thrust.burn_end_time = 2.0;
        config.stages[0].thrust.forced_cutoff_time = 2.0;

        let rocket = Rocket::new(config.clone());
        let mut simulator = Simulator::new(rocket).unwrap();
        let trajectory = simulator.run();

        // Check that simulation accurately finds the impact point (altitude ≈ 0)
        let final_state = trajectory.last().unwrap();
        assert!(final_state.altitude <= 0.1); // Should be at or very close to ground level

        // Check that there are no states with significantly negative altitude (below -1m)
        let deeply_negative_altitudes: Vec<_> = trajectory
            .iter()
            .filter(|state| state.altitude < -1.0)
            .collect();
        assert!(
            deeply_negative_altitudes.is_empty(),
            "Found {} states with altitude below -1m",
            deeply_negative_altitudes.len()
        );

        // Check that the final state has ground level altitude (≤ 0.1m)
        assert!(
            final_state.altitude <= 0.1,
            "Final altitude {} is too high - simulation should end at ground level",
            final_state.altitude
        );
    }

    #[test]
    fn test_fixed_attitude_reentry_decelerates() {
        // Unpowered re-entry with the body pointing against the flight
        // direction (AoA ≈ 180°): aerodynamics must slow the vehicle down.
        let mut config = create_test_config();
        config.calculate_condition.end_time = 2000.0;
        config.launch.position_llh = [35.0, 139.0, 100_000.0];
        config.launch.velocity_ned = [7000.0, 0.0, 300.0];
        let stage = &mut config.stages[0];
        stage.free_flight_mode = 1;
        stage.aero.body_diameter = 2.0;
        stage.attitude.const_azimuth = 180.0;
        stage.attitude.const_elevation = 0.0;

        let rocket = Rocket::new(config);
        let mut simulator = Simulator::new(rocket).unwrap();
        let trajectory = simulator.run();

        let max_q = trajectory
            .iter()
            .map(|s| s.dynamic_pressure)
            .fold(0.0, f64::max);
        assert!(max_q > 50_000.0, "re-entry too gentle: max q {max_q}");

        // While drag clearly dominates gravity, speed must not increase.
        for pair in trajectory.windows(2) {
            if pair[0].dynamic_pressure > 50_000.0 && pair[1].dynamic_pressure > 50_000.0 {
                assert!(
                    pair[1].velocity_magnitude <= pair[0].velocity_magnitude,
                    "speed rose from {} to {} m/s at t = {} s (q = {} Pa)",
                    pair[0].velocity_magnitude,
                    pair[1].velocity_magnitude,
                    pair[1].time,
                    pair[1].dynamic_pressure
                );
            }
        }

        let final_state = trajectory.last().unwrap();
        assert!(final_state.altitude <= 0.1, "did not reach the ground");
        assert!(
            final_state.velocity_magnitude < 2000.0,
            "impact speed {} m/s",
            final_state.velocity_magnitude
        );
    }

    /// Short powered ascent then free flight, for flight-mode tests
    fn coast_config(free_mode: i32) -> RocketConfig {
        let mut config = create_test_config();
        config.calculate_condition.end_time = 60.0;
        let stage = &mut config.stages[0];
        stage.free_flight_mode = free_mode;
        stage.thrust.const_thrust_vac = 50_000.0;
        stage.thrust.burn_end_time = 5.0;
        stage.thrust.forced_cutoff_time = 5.0;
        stage.aero.const_axial_coefficient = 0.5;
        stage.aero.ballistic_coefficient = 1.0e6; // practically no drag
        config
    }

    fn run_config(config: RocketConfig) -> Vec<SimulationState> {
        Simulator::new(Rocket::new(config)).unwrap().run()
    }

    #[test]
    fn test_axial_force_continuous_through_broadside_flow() {
        let sim = Simulator::new(Rocket::new(create_test_config())).unwrap();
        let ca = sim.rocket.ca_at_mach(0, 1.0);
        let axial = |u: f64, w: f64| sim.aero_force_body(0, 1.0, &Vector3::new(u, 0.0, w), 1.0).x;
        // Flow along the axis: exactly CA * q * S
        assert_eq!(axial(100.0, 0.0), -ca);
        assert_eq!(axial(-100.0, 0.0), ca);
        // Crossing broadside (u: +0.01 -> -0.01 m/s) no longer jumps by 2 CA
        let jump = (axial(0.01, 100.0) - axial(-0.01, 100.0)).abs();
        assert!(jump < 0.02 * ca, "jump {jump}");
        // 60 deg angle of attack: within 0.1 %
        let f = axial(50.0, 50.0 * 3f64.sqrt());
        assert!((f + ca).abs() < 1e-3 * ca, "{f}");
    }

    #[test]
    fn test_flight_mode_reported() {
        let trajectory = run_config(coast_config(0));
        assert_eq!(trajectory[1].flight_mode, FlightMode::Power3Dof);
        assert_eq!(
            trajectory.last().unwrap().flight_mode,
            FlightMode::FreeAeroStable
        );
        let trajectory = run_config(coast_config(2));
        assert_eq!(
            trajectory.last().unwrap().flight_mode,
            FlightMode::FreeBallistic
        );
        let json = serde_json::to_string(&trajectory[1]).unwrap();
        assert!(json.contains("\"flight_mode\":\"power_3DoF\""));
    }

    #[test]
    fn test_aero_stable_free_flight_has_drag() {
        // Mode 0 uses CA drag along the airflow; the near-zero-drag ballistic
        // case must therefore fly higher.
        let max_alt = |t: &[SimulationState]| t.iter().map(|s| s.altitude).fold(0.0, f64::max);
        let aero_stable = max_alt(&run_config(coast_config(0)));
        let ballistic = max_alt(&run_config(coast_config(2)));
        assert!(
            aero_stable < ballistic,
            "aero-stable {aero_stable} m vs ballistic {ballistic} m"
        );
    }

    #[test]
    fn test_thrust_stops_at_burn_end_before_forced_cutoff() {
        let mut config = coast_config(2);
        config.stages[0].thrust.forced_cutoff_time = 20.0;
        let trajectory = run_config(config);
        for s in trajectory.iter().filter(|s| s.time >= 5.0) {
            assert_eq!(s.thrust, 0.0, "thrust {} N at t = {} s", s.thrust, s.time);
        }
    }

    #[test]
    fn test_air_density_variation_changes_drag() {
        let max_alt = |percent: f64| {
            let mut config = coast_config(0);
            config.calculate_condition.air_density_variation = percent;
            run_config(config)
                .iter()
                .map(|s| s.altitude)
                .fold(0.0, f64::max)
        };
        // The variation follows the U.S. Standard Atmosphere profile (its sign
        // flips with altitude), so only check that it takes effect.
        let nominal = max_alt(0.0);
        for percent in [-50.0, 50.0] {
            let varied = max_alt(percent);
            assert!(
                (varied - nominal).abs() > 1.0,
                "{percent}%: {varied} m vs nominal {nominal} m"
            );
        }
    }

    #[test]
    fn test_iip_in_state() {
        let trajectory = run_config(coast_config(2));
        let s = &trajectory[trajectory.len() / 2];
        let (lat, lon) = (s.iip_lat_deg.unwrap(), s.iip_lon_deg.unwrap());
        // Short hop near the launch site
        assert!((lat - 35.0).abs() < 1.0 && (lon - 139.0).abs() < 1.0);
    }

    /// Two-stage sounding rocket: stage 1 separates at 6 s
    fn two_stage_config() -> RocketConfig {
        let mut config = coast_config(2);
        config.calculate_condition.end_time = 600.0;
        config.stages[0].thrust.const_thrust_vac = 60_000.0;
        config.stages[0].aero.ballistic_coefficient = 300.0;
        config.stages[0].stage.following_stage_exists = true;
        config.stages[0].stage.separation_time = 6.0;
        let mut stage2 = config.stages[0].clone();
        stage2.mass_initial = 300.0;
        stage2.thrust.const_thrust_vac = 15_000.0;
        stage2.thrust.burn_start_time = 1.0;
        stage2.thrust.burn_end_time = 10.0;
        stage2.thrust.forced_cutoff_time = 10.0;
        stage2.stage.following_stage_exists = false;
        stage2.stage.separation_time = 1.0e6;
        config.stages.push(stage2);
        config
    }

    #[test]
    fn test_spent_stage_falls_to_ground() {
        let mut sim = Simulator::new(Rocket::new(two_stage_config())).unwrap();
        let trajectory = sim.run();
        let bodies = sim.simulate_fall_bodies();
        assert_eq!(bodies.len(), 1);
        let body = &bodies[0];
        assert_eq!(body.kind, FallBodyKind::Stage);
        assert_eq!(body.stage, 1);
        assert!((body.release_time_s - 6.0).abs() < 1e-9);

        // Stage 1 keeps its initial mass minus the propellant burned in 5 s
        let burned = 60_000.0 / (200.0 * G0) * 5.0;
        assert!(
            (body.mass_kg - (1000.0 - burned)).abs() < 1e-6,
            "spent mass {}",
            body.mass_kg
        );

        // Release state matches the vehicle at separation
        let first = &body.trajectory[0];
        assert!((first.time - 6.0).abs() < 1e-9);
        assert!(body.trajectory.iter().all(|s| s.stage == 1));
        let vehicle = trajectory
            .iter()
            .find(|s| (s.time - 6.0).abs() < 1e-9)
            .expect("output sample at separation");
        assert!((first.position - vehicle.position).magnitude() < 1e-6);

        let impact = body.impact.expect("spent stage impacts");
        assert!(impact.time_s > 6.0);
        assert!((impact.latitude_deg - 35.0).abs() < 1.0);
        assert!((impact.longitude_deg - 139.0).abs() < 1.0);
        assert!(body.trajectory.last().unwrap().altitude <= 1.0);
    }

    #[test]
    fn test_spent_stage_mass_exact_with_rk45() {
        let mut config = two_stage_config();
        config.calculate_condition.integrator.method = IntegratorMethod::Rk45;
        let mut sim = Simulator::new(Rocket::new(config)).unwrap();
        sim.run();
        let body = &sim.simulate_fall_bodies()[0];
        let burned = 60_000.0 / (200.0 * G0) * 5.0;
        assert!((body.mass_kg - (1000.0 - burned)).abs() < 1e-6);
        assert!(body.impact.is_some());
    }

    #[test]
    fn test_dumping_product_reduces_mass_and_falls() {
        let mut config = two_stage_config();
        let dump = &mut config.stages[1].dumping_product;
        dump.dumping_product_exists = true;
        dump.dumping_product_separation_time = 15.0; // stage-relative: T+21 s
        dump.dumping_product_mass = 20.0;
        dump.dumping_product_ballistic_coefficient = 50.0;
        dump.additional_speed_at_dumping_ned = [0.0, 5.0, 0.0];

        let mass_at = |t: &[SimulationState], time: f64| {
            t.iter()
                .find(|s| (s.time - time).abs() < 1e-6)
                .map(|s| s.mass)
                .unwrap()
        };
        let base = run_config(two_stage_config());
        let mut sim = Simulator::new(Rocket::new(config)).unwrap();
        let with_dump = sim.run();
        assert!((mass_at(&with_dump, 20.0) - mass_at(&base, 20.0)).abs() < 1e-9);
        assert!((mass_at(&base, 22.0) - mass_at(&with_dump, 22.0) - 20.0).abs() < 1e-9);

        let bodies = sim.simulate_fall_bodies();
        let dump = bodies
            .iter()
            .find(|b| b.kind == FallBodyKind::Dump)
            .expect("dump body");
        assert_eq!(dump.stage, 2);
        assert!((dump.release_time_s - 21.0).abs() < 1e-9);
        assert_eq!(dump.mass_kg, 20.0);
        assert!(
            dump.trajectory
                .iter()
                .skip(1)
                .all(|s| s.flight_mode == FlightMode::FreeBallistic)
        );
        // Released with +5 m/s east relative to the vehicle
        let vehicle = with_dump
            .iter()
            .find(|s| (s.time - 21.0).abs() < 1e-9)
            .unwrap();
        let dv = dump.trajectory[0].velocity_ecef_ned - vehicle.velocity_ecef_ned;
        assert!((dv - Vector3::new(0.0, 5.0, 0.0)).magnitude() < 1e-6);
        assert!(dump.impact.is_some());
    }

    #[test]
    fn test_orbital_release_has_no_impact() {
        let mut config = create_test_config();
        config.calculate_condition.end_time = 5.0;
        // Circular-ish orbit at 400 km: velocity well above the IIP limit
        config.launch.position_llh = [0.0, 0.0, 400_000.0];
        config.launch.velocity_ned = [0.0, 7200.0, 0.0];
        config.stages[0].stage.following_stage_exists = true;
        config.stages[0].stage.separation_time = 2.0;
        let mut stage2 = config.stages[0].clone();
        stage2.mass_initial = 100.0;
        stage2.stage.following_stage_exists = false;
        config.stages.push(stage2);

        let mut sim = Simulator::new(Rocket::new(config)).unwrap();
        sim.run();
        let bodies = sim.simulate_fall_bodies();
        assert_eq!(bodies.len(), 1);
        assert!(bodies[0].impact.is_none());
        assert!(bodies[0].trajectory.is_empty());
    }

    #[test]
    fn test_output_times_on_exact_grid() {
        let mut config = coast_config(2);
        config.calculate_condition.time_step = 0.1;
        config.calculate_condition.end_time = 10.0;
        let trajectory = run_config(config);
        for (k, s) in trajectory.iter().enumerate() {
            assert_eq!(s.time, k as f64 * 0.1, "sample {k}");
        }
    }

    #[test]
    fn test_impact_located_on_the_ground() {
        for method in [IntegratorMethod::Rk4, IntegratorMethod::Rk45] {
            let mut config = coast_config(2);
            config.calculate_condition.end_time = 200.0;
            config.calculate_condition.integrator.method = method;
            let trajectory = run_config(config);
            let last = trajectory.last().unwrap();
            assert!(
                last.altitude.abs() < 1e-2,
                "impact altitude {}",
                last.altitude
            );
            assert!(
                trajectory.windows(2).all(|w| w[1].time > w[0].time),
                "times must increase"
            );
            // Not on the output grid: located between two samples
            let prev = &trajectory[trajectory.len() - 2];
            assert!(last.time > prev.time && last.time < prev.time + 1.0);
        }
    }

    #[test]
    fn test_events_in_order_and_located() {
        let mut config = coast_config(2);
        config.calculate_condition.end_time = 200.0;
        let mut sim = Simulator::new(Rocket::new(config)).unwrap();
        let trajectory = sim.run();
        let kinds: Vec<EventKind> = sim.events.iter().map(|e| e.kind).collect();
        let without_max_q: Vec<EventKind> = kinds
            .iter()
            .copied()
            .filter(|&k| k != EventKind::MaxQ)
            .collect();
        assert_eq!(
            without_max_q,
            [
                EventKind::Ignition,
                EventKind::Burnout,
                EventKind::Apogee,
                EventKind::Impact
            ]
        );
        assert_eq!(kinds.iter().filter(|&&k| k == EventKind::MaxQ).count(), 1);
        assert!(sim.events.windows(2).all(|w| w[0].time_s <= w[1].time_s));
        let burnout = sim
            .events
            .iter()
            .find(|e| e.kind == EventKind::Burnout)
            .unwrap();
        assert!((burnout.time_s - 5.0).abs() < 1e-9);

        let apogee = sim
            .events
            .iter()
            .find(|e| e.kind == EventKind::Apogee)
            .unwrap();
        let max_alt = trajectory.iter().map(|s| s.altitude).fold(0.0, f64::max);
        assert!(
            apogee.altitude_m >= max_alt - 1e-6,
            "apogee {} vs {max_alt}",
            apogee.altitude_m
        );

        let max_q = sim
            .events
            .iter()
            .find(|e| e.kind == EventKind::MaxQ)
            .unwrap();
        let sampled = trajectory
            .iter()
            .map(|s| s.dynamic_pressure)
            .fold(0.0, f64::max);
        assert!(max_q.dynamic_pressure_pa >= sampled * (1.0 - 1e-6));

        let impact = sim.events.last().unwrap();
        assert_eq!(impact.time_s, trajectory.last().unwrap().time);
    }

    #[test]
    fn test_supersonic_flight_records_mach1() {
        let mut config = coast_config(2);
        config.stages[0].thrust.const_thrust_vac = 200_000.0;
        let mut sim = Simulator::new(Rocket::new(config)).unwrap();
        sim.run();
        let mach1 = sim
            .events
            .iter()
            .find(|e| e.kind == EventKind::Mach1)
            .unwrap();
        assert!((mach1.mach - 1.0).abs() < 1e-3, "mach {}", mach1.mach);
    }

    #[test]
    fn test_telemetry_matches_dynamics() {
        // Ballistic coast: the C++ telemetry must use the same drag as the
        // equations of motion (drag accel = q / beta along the airflow)
        let mut config = coast_config(2);
        config.stages[0].aero.ballistic_coefficient = 50.0;
        let mut sim = Simulator::new(Rocket::new(config)).unwrap();
        let trajectory = sim.run();
        for (s, row) in trajectory.iter().zip(&sim.telemetry_cpp).skip(1) {
            assert!((row.acc_eci - s.acc_eci).magnitude() < 1e-9);
            if s.flight_mode == FlightMode::FreeBallistic && s.dynamic_pressure > 1.0 {
                let drag = s.dynamic_pressure / 50.0 * s.mass;
                assert!((row.aero_body.x + drag).abs() < 1e-6 * drag);
                assert!((s.drag_force - drag).abs() < 1e-6 * drag);
                assert_eq!(row.aero_body.y, 0.0);
                assert_eq!(row.aero_body.z, 0.0);
            }
        }
    }

    #[test]
    fn client_config_multi_stage_progresses() {
        use crate::rocket::*;

        let stage1 = ClientStage {
            mass_initial_kg: 1000.0,
            burn_end_s: 6.0,
            forced_cutoff_s: 6.0,
            separation_time_s: 6.5,
            thrust_constant: 200_000.0,
            isp_constant: 250.0,
            ..Default::default()
        };

        let stage2 = ClientStage {
            mass_initial_kg: 200.0,
            burn_end_s: 8.0,
            forced_cutoff_s: 8.0,
            separation_time_s: 1000.0,
            thrust_constant: 60_000.0,
            isp_constant: 270.0,
            ..Default::default()
        };

        let config = ClientConfig {
            name: "multi".to_string(),
            simulation: ClientSimulation {
                duration_s: 60.0,
                output_step_s: 1.0,
                air_density_percent: 0.0,
                integrator: ClientIntegrator {
                    method: IntegratorMethod::Rk4,
                    rk4_step_s: Some(0.5),
                    ..Default::default()
                },
            },
            launch: ClientLaunch {
                latitude_deg: 35.0,
                longitude_deg: 139.0,
                altitude_m: 0.0,
                velocity_ned_mps: [0.0, 0.0, 0.0],
                datetime_utc: ClientDateTime {
                    year: 2023,
                    month: 1,
                    day: 1,
                    hour: 0,
                    minute: 0,
                    second: 0,
                },
            },
            stages: vec![stage1, stage2],
            stage: None,
            aerodynamics: ClientAerodynamics {
                body_diameter_m: 1.0,
                cn_constant: 0.1,
                cn_multiplier: 1.0,
                cn_profile: Vec::new(),
                ca_constant: 0.2,
                ca_multiplier: 1.0,
                ca_profile: Vec::new(),
                ballistic_coefficient: 120.0,
            },
            attitude: ClientAttitude {
                elevation_deg: 85.0,
                azimuth_deg: 113.0,
                pitch_offset_deg: 0.0,
                yaw_offset_deg: 0.0,
                roll_offset_deg: 0.0,
                gyro_bias_deg_h: [0.0, 0.0, 0.0],
                profile: Vec::new(),
            },
            wind: ClientWind {
                speed_mps: 0.0,
                direction_deg: 270.0,
                profile: Vec::new(),
            },
        };

        let rocket = config.into_rocket();
        let mut simulator = Simulator::new(rocket).unwrap();
        let trajectory = simulator.run();
        let max_stage = trajectory
            .iter()
            .map(|state| state.stage)
            .max()
            .unwrap_or(0);
        assert!(
            max_stage >= 2,
            "expected to reach stage 2, got {}",
            max_stage
        );
    }
}
