use crate::math::{RungeKutta4, constants::G0, deg2rad, integrator::DormandPrince54};
use crate::physics::{
    atmosphere::AtmosphereModel, coordinates::CoordinateTransform, gravity::GravityModel,
};
use crate::rocket::{IntegratorMethod, Rocket, RocketConfig};
/// Main simulation engine
///
/// This module will contain the core simulation logic
use nalgebra::Vector3;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationState {
    pub time: f64,
    pub position: Vector3<f64>, // ECI coordinates [m]
    pub velocity: Vector3<f64>, // ECI coordinates [m/s]
    pub mass: f64,              // [kg]
    pub stage: u8,
    pub altitude: f64,           // Altitude above sea level [m]
    pub velocity_magnitude: f64, // |velocity| [m/s]
    pub mach_number: f64,        // Mach number [-]
    pub dynamic_pressure: f64,   // Dynamic pressure [Pa]
    pub thrust: f64,             // Current thrust [N]
    pub drag_force: f64,         // Current drag force [N]
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
    pub dcm_body_to_eci: nalgebra::Matrix3<f64>,
    pub inertial_speed: f64,
    pub kinetic_energy_ned: f64,
    pub loss_gravity: f64,
    pub loss_aero: f64,
    pub loss_thrust: f64,
    pub is_powered: i32,
    pub is_separated: i32,
}

#[derive(Debug, Clone)]
struct StageRuntime {
    index: usize,
    start_time: f64,
    burn_start: f64,
    burn_end: f64,
    forced_cutoff: f64,
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

        stages.push(StageRuntime {
            index: idx,
            start_time,
            burn_start,
            burn_end: burn_end.min(separation_time),
            forced_cutoff: forced_cutoff.min(separation_time),
            separation_time,
            stack_mass: mass,
        });

        start_time = separation_time;
    }

    stages
}

/// Main simulator struct
pub struct Simulator {
    pub config: RocketConfig,
    pub rocket: Rocket,
    pub atmosphere: AtmosphereModel,
    pub gravity: GravityModel,
    pub state: SimulationState,
    pub trajectory: Vec<SimulationState>,
    stage_runtime: Vec<StageRuntime>,
    current_stage_index: usize,
    // Telemetry helpers (computed consistently with dynamics)
    last_dynamic_pressure: f64,
    last_thrust_magnitude: f64,
    last_drag_magnitude: f64,
    pub telemetry_cpp: Vec<CsvCppRow>,
    integration: IntegrationMode,
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
                solver: DormandPrince54::new(1.0e-9, 1.0e-9, 1.0e-6, 10.0),
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
        let pos_llh = Vector3::new(
            config.launch.position_llh[0],
            config.launch.position_llh[1],
            config.launch.position_llh[2],
        );
        let vel_ned = Vector3::new(
            config.launch.velocity_ned[0],
            config.launch.velocity_ned[1],
            config.launch.velocity_ned[2],
        );

        let position = CoordinateTransform::pos_eci_init(&pos_llh);
        let velocity = CoordinateTransform::vel_eci_init(&vel_ned, &pos_llh);

        let stage_runtime = build_stage_runtime(&config, &rocket);
        let current_stage_index = 0;
        let current_stage_cfg = rocket.stage_config(current_stage_index);

        let mut state = SimulationState {
            time: 0.0,
            position,
            velocity,
            mass: current_stage_cfg.mass_initial,
            stage: 1,
            altitude: config.launch.position_llh[2],
            velocity_magnitude: velocity.magnitude(),
            mach_number: 0.0,
            dynamic_pressure: 0.0,
            thrust: 0.0,
            drag_force: 0.0,
            // Initialize new fields
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
        };
        state.mass = stage_runtime
            .first()
            .map(|rt| rt.stack_mass)
            .unwrap_or(current_stage_cfg.mass_initial);

        Ok(Simulator {
            config,
            rocket,
            atmosphere,
            gravity,
            state,
            trajectory: Vec::new(),
            stage_runtime,
            current_stage_index,
            last_dynamic_pressure: 0.0,
            last_thrust_magnitude: 0.0,
            last_drag_magnitude: 0.0,
            telemetry_cpp: Vec::new(),
            integration,
        })
    }

    /// Run full simulation
    pub fn run(&mut self) -> Vec<SimulationState> {
        self.trajectory.clear();
        self.telemetry_cpp.clear();

        // Record initial state (t=0) so outputs include the starting sample
        self.update_derived_quantities();
        self.trajectory.push(self.state.clone());
        let row0 = self.capture_cpp_row();
        self.telemetry_cpp.push(row0);
        let end_time = self.config.calculate_condition.end_time;
        let dt_out = self.config.calculate_condition.time_step;
        if !(dt_out.is_finite() && dt_out > 0.0) {
            return self.trajectory.clone();
        }

        let mut next_output_time = (self.state.time + dt_out).min(end_time);

        while self.state.time + 1.0e-9 < end_time {
            // Check if next step would lead to ground impact
            let current_altitude = self.state.altitude;
            let current_velocity = self.state.velocity;
            let current_position = self.state.position;

            // Estimate velocity component toward/away from Earth center
            let radial_velocity = if let Some(radial_unit) = current_position.try_normalize(1.0e-9)
            {
                current_velocity.dot(&radial_unit)
            } else {
                0.0
            };

            // If currently above ground and descending, check if next step would go below ground
            if current_altitude > 0.0 && radial_velocity < 0.0 {
                // Simple linear prediction: will altitude be negative after dt_out?
                let altitude_change_rate = radial_velocity; // Approximate as purely radial
                let predicted_altitude = current_altitude + altitude_change_rate * dt_out;

                if predicted_altitude <= 0.0 {
                    // This would be the last valid state before ground impact
                    break;
                }
            }

            self.advance_to_time(next_output_time);
            self.trajectory.push(self.state.clone());
            let row = self.capture_cpp_row();
            self.telemetry_cpp.push(row);

            // Also check after integration in case prediction was wrong
            if self.state.altitude <= 0.0 {
                break;
            }

            if next_output_time >= end_time {
                break;
            }
            next_output_time = (next_output_time + dt_out).min(end_time);
        }
        self.trajectory.clone()
    }

    /// Get current simulation state
    pub fn current_state(&self) -> &SimulationState {
        &self.state
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
            self.current_stage_index = new_stage;
            self.state.mass = self.stage_runtime[new_stage].stack_mass;
        }
    }

    fn state_vector(&self) -> Vec<f64> {
        vec![
            self.state.mass,
            self.state.position.x,
            self.state.position.y,
            self.state.position.z,
            self.state.velocity.x,
            self.state.velocity.y,
            self.state.velocity.z,
        ]
    }

    fn apply_state_vector(&mut self, time: f64, new_state: &[f64]) {
        if new_state.len() < 7 {
            return;
        }

        self.state.time = time;
        self.state.mass = new_state[0];
        self.state.position = Vector3::new(new_state[1], new_state[2], new_state[3]);
        self.state.velocity = Vector3::new(new_state[4], new_state[5], new_state[6]);

        // No longer need ground clamping logic - simulation ends before landing

        self.update_stage_index();
        self.update_derived_quantities();
    }

    fn integrate_rk4_step(&mut self, dt: f64) {
        if !(dt.is_finite() && dt > 0.0) {
            return;
        }

        let rk4 = RungeKutta4;
        let current_state = self.state_vector();
        let new_state = rk4.integrate(&current_state, self.state.time, dt, |t, state| {
            self.dynamics(t, state)
        });
        self.apply_state_vector(self.state.time + dt, &new_state);
    }

    fn advance_to_time(&mut self, target_time: f64) {
        let end_time = self.config.calculate_condition.end_time;
        let target = target_time.min(end_time);
        if target <= self.state.time {
            return;
        }

        match self.integration {
            IntegrationMode::Rk4 { step } => {
                let mut remaining = target - self.state.time;
                while remaining > 1.0e-12 {
                    let dt = step.min(remaining);
                    self.integrate_rk4_step(dt);
                    remaining = target - self.state.time;
                }
            }
            IntegrationMode::Rk45 { solver } => {
                let mut state_vec = self.state_vector();
                let mut time = self.state.time;
                let solver_inst = solver;
                solver_inst.advance_to(&mut state_vec, &mut time, target, |t, state| {
                    self.dynamics(t, state)
                });
                let final_time = if (time - target).abs() < 1.0e-9 {
                    target
                } else {
                    time
                };
                self.apply_state_vector(final_time, &state_vec);
            }
        }
    }

    /// Single integration step
    pub fn step(&mut self, dt: f64) {
        if !(dt.is_finite() && dt > 0.0) {
            return;
        }
        let target = (self.state.time + dt).min(self.config.calculate_condition.end_time);
        self.advance_to_time(target);
    }

    /// Update derived quantities for telemetry
    fn update_derived_quantities(&mut self) {
        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(&self.state.position, self.state.time);
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        self.state.altitude = pos_llh.z;

        // Atmospheric conditions at current altitude
        let atm = self.atmosphere.conditions(self.state.altitude);

        // Transform velocity into NED and compute air-relative values
        let dcm_eci_to_ned = CoordinateTransform::dcm_eci_to_ned(&pos_llh, self.state.time);
        let vel_ned = CoordinateTransform::vel_eci_to_ecef_ned_frame(
            &self.state.position,
            &self.state.velocity,
            &dcm_eci_to_ned,
        );

        // Wind
        let (wind_speed, wind_dir) = self.rocket.wind_at_altitude(self.state.altitude);
        let wind_ned = CoordinateTransform::vel_wind_ned_frame(wind_speed, wind_dir);

        let vel_air_ned = vel_ned - wind_ned;
        let vel_air_mag = vel_air_ned.magnitude();

        // Use air-relative speed for Mach/Q like C++
        self.state.velocity_magnitude = self.state.velocity.magnitude(); // keep ECI |v| for reference
        self.state.mach_number = if atm.speed_of_sound > 0.0 {
            vel_air_mag / atm.speed_of_sound
        } else {
            0.0
        };
        self.state.dynamic_pressure = 0.5 * atm.density * vel_air_mag.powi(2);
        self.last_dynamic_pressure = self.state.dynamic_pressure;

        // Burning window for thrust (C++同等)
        let t = self.state.time;
        let stage_idx = self.current_stage_index;
        let stage_info = &self.stage_runtime[stage_idx];
        let stage_local_time = self.stage_local_time(stage_idx, t);
        self.state.thrust = if t >= stage_info.burn_start && t < stage_info.forced_cutoff {
            self.rocket.thrust_at(stage_idx, stage_local_time)
        } else {
            0.0
        };
        self.last_thrust_magnitude = self.state.thrust;

        // Drag magnitude using CA(Mach)
        let ca = self.rocket.ca_at_mach(stage_idx, self.state.mach_number);
        let stage_cfg = self.rocket.stage_config(stage_idx);
        let body_diameter = stage_cfg.aero.body_diameter;
        let reference_area = std::f64::consts::PI * (body_diameter / 2.0).powi(2);
        self.state.drag_force = ca * self.state.dynamic_pressure * reference_area;
        self.last_drag_magnitude = self.state.drag_force;

        // Calculate velocities in both coordinate systems
        // ECI velocity in NED frame (includes Earth rotation)
        self.state.velocity_eci_ned = dcm_eci_to_ned * self.state.velocity;

        // ECEF velocity in NED frame (Earth-relative) - vel_ned is already computed above
        self.state.velocity_ecef_ned = vel_ned;

        // Update legacy field for backward compatibility (use ECEF for expected behavior)
        self.state.velocity_ned = self.state.velocity_ecef_ned;

        // Sea level Mach number (using constant sea level sound speed = 340.3 m/s)
        const SEA_LEVEL_SOUND_SPEED: f64 = 340.3;
        self.state.sea_level_mach = vel_air_mag / SEA_LEVEL_SOUND_SPEED;

        // Acceleration magnitude - compute from current forces
        let gravity_acc = self.gravity.gravity_eci(&self.state.position);
        let mut total_acc = gravity_acc;

        // Add thrust acceleration if active
        if self.state.thrust > 0.0 && self.state.mass > 0.0 {
            let (thrust_force, _) =
                self.compute_thrust_force(t, &self.state.position, &self.state.velocity);
            total_acc += thrust_force / self.state.mass;
        }

        // Add aerodynamic acceleration
        if vel_air_mag > 0.1 && self.state.mass > 0.0 {
            let aero_force = self.compute_aerodynamic_forces(
                &self.state.position,
                &self.state.velocity,
                t,
                self.state.mach_number,
                self.state.mass,
            );
            total_acc += aero_force / self.state.mass;
        }

        self.state.acceleration_magnitude = total_acc.magnitude();

        // Attitude angles
        let (azimuth_deg, elevation_deg) = self.rocket.attitude_at_time(t);
        self.state.attitude_azimuth = azimuth_deg;
        self.state.attitude_elevation = elevation_deg;

        // Angle of attack
        if vel_air_mag > 0.1 {
            let dcm_ned_to_body = CoordinateTransform::dcm_ned_to_body(
                deg2rad(azimuth_deg),
                deg2rad(elevation_deg),
                None,
            );
            let vel_air_body =
                CoordinateTransform::vel_air_body_frame(&dcm_ned_to_body, &vel_ned, &wind_ned);
            let angles = CoordinateTransform::angle_of_attack(&vel_air_body);
            // Use the angle of attack (alpha) and sideslip angle (beta)
            self.state.angle_of_attack = angles.x.to_degrees();
            self.state.sideslip_angle = angles.y.to_degrees();
        } else {
            self.state.angle_of_attack = 0.0;
            self.state.sideslip_angle = 0.0;
        }

        // Compute acceleration components (same as in capture_cpp_row)
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        let dcm_eci_to_ned = CoordinateTransform::dcm_eci_to_ned(&pos_llh, self.state.time);
        let (az_deg, el_deg) = self.rocket.attitude_at_time(self.state.time);
        let dcm_ned_to_body =
            CoordinateTransform::dcm_ned_to_body(deg2rad(az_deg), deg2rad(el_deg), None);

        // Forces in ECI frame
        let gravity_eci = self.gravity.gravity_eci(&self.state.position);
        let mut acc_eci = gravity_eci;

        // Add thrust acceleration if active
        if self.state.thrust > 0.0 && self.state.mass > 0.0 {
            let (thrust_force, _) = self.compute_thrust_force(
                self.state.time,
                &self.state.position,
                &self.state.velocity,
            );
            acc_eci += thrust_force / self.state.mass;
        }

        // Add aerodynamic acceleration
        if vel_air_mag > 0.1 && self.state.mass > 0.0 {
            let aero_force = self.compute_aerodynamic_forces(
                &self.state.position,
                &self.state.velocity,
                self.state.time,
                self.state.mach_number,
                self.state.mass,
            );
            acc_eci += aero_force / self.state.mass;
        }

        // Body-frame acceleration (exclude gravity for body-frame measurement)
        let acc_body_eci = acc_eci - gravity_eci;
        let acc_body = (dcm_ned_to_body * dcm_eci_to_ned) * acc_body_eci;

        self.state.acc_eci = acc_eci;
        self.state.acc_body = acc_body;
    }

    /// System dynamics function
    ///
    /// Computes derivatives: [dmass/dt, dpos/dt, dvel/dt]
    fn dynamics(&self, t: f64, state: &[f64]) -> Vec<f64> {
        // Extract state variables
        let mass = state[0];
        let position = Vector3::new(state[1], state[2], state[3]);
        let velocity = Vector3::new(state[4], state[5], state[6]);

        // Convert to LLH for altitude calculation
        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(&position, t);
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        let altitude = pos_llh.z;

        // No longer need ground impact handling in dynamics
        // Simulation will end before hitting the ground

        // Atmospheric conditions
        let atm_conditions = self.atmosphere.conditions(altitude);
        let speed_of_sound = atm_conditions.speed_of_sound;

        // Velocity analysis in air-relative NED frame
        let dcm_eci_to_ned = CoordinateTransform::dcm_eci_to_ned(&pos_llh, t);
        let velocity_ned =
            CoordinateTransform::vel_eci_to_ecef_ned_frame(&position, &velocity, &dcm_eci_to_ned);
        let (wind_speed, wind_dir) = self.rocket.wind_at_altitude(pos_llh.z);
        let wind_ned = CoordinateTransform::vel_wind_ned_frame(wind_speed, wind_dir);
        let vel_air_ned = velocity_ned - wind_ned;
        let vel_air_magnitude = vel_air_ned.magnitude();
        let mach_number = if speed_of_sound > 0.0 {
            vel_air_magnitude / speed_of_sound
        } else {
            0.0
        };
        // dynamic pressure is recomputed where needed based on air-relative velocity

        // Forces in ECI frame
        let mut total_force = Vector3::zeros();

        // 1. Gravity force
        let gravity_acceleration = self.gravity.gravity_eci(&position);
        total_force += mass * gravity_acceleration;

        // 2. Thrust force
        let (thrust_force, mass_flow_rate) = self.compute_thrust_force(t, &position, &velocity);
        total_force += thrust_force;

        // 3. Aerodynamic forces
        let aero_force =
            self.compute_aerodynamic_forces(&position, &velocity, t, mach_number, mass);
        total_force += aero_force;

        // Acceleration
        let acceleration = if mass > 0.0 {
            total_force / mass
        } else {
            Vector3::zeros()
        };

        // Derivatives
        vec![
            -mass_flow_rate, // dmass/dt (propellant consumption)
            velocity.x,      // dx/dt
            velocity.y,      // dy/dt
            velocity.z,      // dz/dt
            acceleration.x,  // dvx/dt
            acceleration.y,  // dvy/dt
            acceleration.z,  // dvz/dt
        ]
    }

    fn capture_cpp_row(&self) -> CsvCppRow {
        use crate::physics::coordinates::CoordinateTransform as CT;
        let t = self.state.time;
        let pos = self.state.position;
        let vel = self.state.velocity;
        let mass = self.state.mass;

        // Position LLH and ECEF
        let pos_ecef = CT::pos_eci_to_ecef(&pos, t);
        let pos_llh = CT::pos_ecef_to_llh(&pos_ecef);
        let lat_deg = pos_llh.x;
        let lon_deg = pos_llh.y;
        let alt_m = pos_llh.z;

        // DCMs
        let dcm_eci_to_ned = CT::dcm_eci_to_ned(&pos_llh, t);

        // Velocities
        let vel_ned = CT::vel_eci_to_ecef_ned_frame(&pos, &vel, &dcm_eci_to_ned);

        // Atmosphere and wind
        let atm = self.atmosphere.conditions(alt_m);
        let (wind_speed, wind_dir) = self.rocket.wind_at_altitude(alt_m);
        let wind_ned = CT::vel_wind_ned_frame(wind_speed, wind_dir);

        // Air-relative velocity and body frame vectors
        let vel_air_ned = vel_ned - wind_ned;
        let vel_air_mag = vel_air_ned.magnitude();
        let (az_deg, el_deg) = self.rocket.attitude_at_time(t);
        let dcm_ned_to_body = CT::dcm_ned_to_body(deg2rad(az_deg), deg2rad(el_deg), None);
        let dcm_body_to_eci = (dcm_ned_to_body * dcm_eci_to_ned).transpose();
        let vel_air_body = CT::vel_air_body_frame(&dcm_ned_to_body, &vel_ned, &wind_ned);
        let angles = CT::angle_of_attack(&vel_air_body);
        let alpha = angles.x;
        let beta = angles.y;
        let gamma = angles.z;

        let stage_idx = self.stage_index_for_time(t);
        let stage_cfg = self.rocket.stage_config(stage_idx);
        let stage_info = &self.stage_runtime[stage_idx];
        let stage_local_time = self.stage_local_time(stage_idx, t);

        // Aerodynamics
        let q = 0.5 * atm.density * vel_air_mag.powi(2);
        let ca = self.rocket.ca_at_mach(stage_idx, self.state.mach_number);
        let ref_area = std::f64::consts::PI * (stage_cfg.aero.body_diameter / 2.0).powi(2);
        let drag = ca * q * ref_area;
        let cn_pitch = alpha.signum()
            * self
                .rocket
                .cn_at(stage_idx, self.state.mach_number, alpha.to_degrees().abs());
        let cn_yaw = beta.signum()
            * self
                .rocket
                .cn_at(stage_idx, self.state.mach_number, beta.to_degrees().abs());
        let force_normal_pitch = cn_pitch * q * ref_area;
        let force_normal_yaw = cn_yaw * q * ref_area;
        let aero_body = Vector3::new(-drag, -force_normal_yaw, -force_normal_pitch);
        let aero_eci = dcm_body_to_eci * aero_body;

        // Thrust
        let is_powered = t >= stage_info.burn_start && t < stage_info.forced_cutoff;
        let thrust_vac = if is_powered {
            self.rocket.thrust_at(stage_idx, stage_local_time)
        } else {
            0.0
        };
        let isp_vac = if is_powered {
            self.rocket.isp_at(stage_idx, stage_local_time)
        } else {
            0.0
        };
        let throat_diameter = stage_cfg.thrust.throat_diameter;
        let exit_area = std::f64::consts::PI
            * (throat_diameter * throat_diameter)
            * 0.25
            * stage_cfg.thrust.nozzle_expansion_ratio;
        let thrust_effective = if is_powered {
            thrust_vac - exit_area * atm.pressure
        } else {
            0.0
        };
        let thrust_body = Vector3::new(thrust_effective, 0.0, 0.0);
        let thrust_eci = dcm_body_to_eci * thrust_body;

        // Accelerations
        let gravity_eci = self.gravity.gravity_eci(&pos);
        let acc_eci = if mass > 0.0 {
            (thrust_eci + aero_eci) / mass + gravity_eci
        } else {
            gravity_eci
        };
        let acc_body = (dcm_ned_to_body * dcm_eci_to_ned) * (acc_eci - gravity_eci);

        // Loss terms
        let vel_xy = (vel_ned.x * vel_ned.x + vel_ned.y * vel_ned.y).sqrt();
        let path_angle = (-vel_ned.z).atan2(vel_xy);
        let gravity_ned = dcm_eci_to_ned * gravity_eci;
        let loss_gravity = if is_powered {
            gravity_ned.z * path_angle.sin()
        } else {
            0.0
        };
        let loss_thrust = if is_powered {
            atm.pressure * exit_area / mass
        } else {
            0.0
        };
        let loss_aero = drag / mass;

        // Downrange
        let launch_llh = Vector3::new(
            self.config.launch.position_llh[0],
            self.config.launch.position_llh[1],
            self.config.launch.position_llh[2],
        );
        let downrange = CT::distance_surface(&launch_llh, &pos_llh);

        CsvCppRow {
            time: t,
            mass,
            thrust: thrust_effective,
            lat_deg,
            lon_deg,
            alt_m,
            pos_eci: pos,
            vel_eci: vel,
            vel_ned,
            acc_eci,
            acc_body,
            isp_s: isp_vac,
            mach: self.state.mach_number,
            att_az_deg: az_deg,
            att_el_deg: el_deg,
            att_roll_deg: 0.0,
            aoa_alpha_deg: alpha.to_degrees(),
            aoa_beta_deg: beta.to_degrees(),
            aoa_gamma_deg: gamma.to_degrees(),
            q_pa: q,
            aero_body,
            thrust_body,
            gimbal_pitch_deg: 0.0,
            gimbal_yaw_deg: 0.0,
            wind_speed,
            wind_dir_deg: wind_dir,
            downrange,
            iip_lat_deg: 0.0,
            iip_lon_deg: 0.0,
            dcm_body_to_eci,
            inertial_speed: vel.magnitude(),
            kinetic_energy_ned: 0.5 * mass * vel_ned.magnitude().powi(2),
            loss_gravity,
            loss_aero,
            loss_thrust,
            is_powered: if is_powered { 1 } else { 0 },
            is_separated: if stage_idx > 0 { 1 } else { 0 },
        }
    }

    /// Compute thrust force in ECI frame
    fn compute_thrust_force(
        &self,
        t: f64,
        position: &Vector3<f64>,
        _velocity: &Vector3<f64>,
    ) -> (Vector3<f64>, f64) {
        let stage_idx = self.stage_index_for_time(t);
        let stage_info = &self.stage_runtime[stage_idx];
        let stage_cfg = self.rocket.stage_config(stage_idx);
        let local_time = self.stage_local_time(stage_idx, t);

        // Check if engine is burning
        if t < stage_info.burn_start || t >= stage_info.forced_cutoff {
            return (Vector3::zeros(), 0.0);
        }

        // Get thrust (vacuum) and Isp (vacuum) at current time
        let thrust_vac = self.rocket.thrust_at(stage_idx, local_time);
        let isp_vac = self.rocket.isp_at(stage_idx, local_time);

        if thrust_vac <= 0.0 || isp_vac <= 0.0 {
            return (Vector3::zeros(), 0.0);
        }

        // Mass flow rate (use vacuum values like C++)
        let mass_flow_rate = thrust_vac / (isp_vac * G0);

        // Ambient pressure loss at nozzle exit (C++: thrust = thrust_vac - A_exit * p)
        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(position, t);
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        let atm = self.atmosphere.conditions(pos_llh.z);
        let throat_diameter = stage_cfg.thrust.throat_diameter;
        let exit_area = std::f64::consts::PI
            * (throat_diameter * throat_diameter)
            * 0.25
            * stage_cfg.thrust.nozzle_expansion_ratio;
        let thrust_effective = thrust_vac - exit_area * atm.pressure;

        // Thrust direction from attitude (Body +X) — C++互換
        let (azimuth_deg, elevation_deg) = self.rocket.attitude_at_time(t);
        let azimuth_rad = deg2rad(azimuth_deg);
        let elevation_rad = deg2rad(elevation_deg);

        // Body->ECI DCM = (NED->BODY * ECI->NED)^T
        let dcm_eci_to_ned = CoordinateTransform::dcm_eci_to_ned(&pos_llh, t);
        let dcm_ned_to_body =
            CoordinateTransform::dcm_ned_to_body(azimuth_rad, elevation_rad, None);
        let dcm_eci_to_body = dcm_ned_to_body * dcm_eci_to_ned;
        let dcm_body_to_eci = dcm_eci_to_body.transpose();

        // Thrust in body frame along +X
        let thrust_body = Vector3::new(thrust_effective, 0.0, 0.0);
        let thrust_eci = dcm_body_to_eci * thrust_body;

        (thrust_eci, mass_flow_rate)
    }

    /// Compute aerodynamic forces in ECI frame
    fn compute_aerodynamic_forces(
        &self,
        position: &Vector3<f64>,
        velocity: &Vector3<f64>,
        t: f64,
        mach_number: f64,
        mass: f64,
    ) -> Vector3<f64> {
        if velocity.magnitude() < 0.1 {
            return Vector3::zeros();
        }

        // Convert to NED frame for aerodynamic calculations
        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(position, t);
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        let dcm_eci_to_ned = CoordinateTransform::dcm_eci_to_ned(&pos_llh, t);
        let velocity_ned =
            CoordinateTransform::vel_eci_to_ecef_ned_frame(position, velocity, &dcm_eci_to_ned);

        // Apply wind (if any)
        let (wind_speed, wind_dir) = self.rocket.wind_at_altitude(pos_llh.z);
        let wind_ned = CoordinateTransform::vel_wind_ned_frame(wind_speed, wind_dir);

        // Relative air velocity and dynamic pressure from air-relative speed
        let vel_air_ned = velocity_ned - wind_ned;
        let vel_air_magnitude = vel_air_ned.magnitude();
        if vel_air_magnitude < 0.1 {
            return Vector3::zeros();
        }

        let (azimuth_deg, elevation_deg) = self.rocket.attitude_at_time(t);
        let azimuth_rad = deg2rad(azimuth_deg);
        let elevation_rad = deg2rad(elevation_deg);
        let dcm_ned_to_body =
            CoordinateTransform::dcm_ned_to_body(azimuth_rad, elevation_rad, None);

        let vel_air_body = CoordinateTransform::vel_air_body_frame(
            &dcm_ned_to_body,
            &vel_air_ned,
            &Vector3::zeros(),
        );
        let angles = CoordinateTransform::angle_of_attack(&vel_air_body);
        let alpha = angles.x;
        let beta = angles.y;

        let stage_idx = self.stage_index_for_time(t);
        let stage_cfg = self.rocket.stage_config(stage_idx);
        let stage_info = &self.stage_runtime[stage_idx];
        let reference_area = std::f64::consts::PI * (stage_cfg.aero.body_diameter / 2.0).powi(2);
        let ca = self.rocket.ca_at_mach(stage_idx, mach_number);

        // Recompute dynamic_pressure based on air-relative speed
        let atm_density = self.atmosphere.conditions(pos_llh.z).density;
        let q = 0.5 * atm_density * vel_air_magnitude.powi(2);

        // If in free flight and ballistic mode is requested, use ballistic coefficient model
        let is_burning = t >= stage_info.burn_start && t <= stage_info.burn_end;
        if !is_burning && stage_cfg.free_flight_mode == 2 {
            let bc = stage_cfg.aero.ballistic_coefficient.max(1e-9);
            // Acceleration magnitude along -airflow
            let accel_mag = q / bc; // [m/s^2]
            let force_ned = -accel_mag * mass * (vel_air_ned / vel_air_magnitude);
            let dcm_ned_to_eci = dcm_eci_to_ned.transpose();
            return dcm_ned_to_eci * force_ned;
        }

        // Otherwise use aerodynamic coefficients (CA, CN from Mach x |angle| table)
        let alpha_deg = alpha.to_degrees().abs();
        let beta_deg = beta.to_degrees().abs();
        let cn_pitch = alpha.signum() * self.rocket.cn_at(stage_idx, mach_number, alpha_deg);
        let cn_yaw = beta.signum() * self.rocket.cn_at(stage_idx, mach_number, beta_deg);

        let drag_magnitude = ca * q * reference_area;
        let force_normal_pitch = cn_pitch * q * reference_area;
        let force_normal_yaw = cn_yaw * q * reference_area;
        let drag_body = Vector3::new(-drag_magnitude, 0.0, 0.0);
        let normal_body = Vector3::new(0.0, -force_normal_yaw, -force_normal_pitch);

        let total_aero_body = drag_body + normal_body;
        let dcm_body_to_ned = dcm_ned_to_body.transpose();
        let aero_force_ned = dcm_body_to_ned * total_aero_body;
        let dcm_ned_to_eci = dcm_eci_to_ned.transpose();
        dcm_ned_to_eci * aero_force_ned
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

        // Check that simulation stops BEFORE hitting the ground (altitude > 0)
        let final_state = trajectory.last().unwrap();
        assert!(final_state.altitude > 0.0); // Should stop before ground impact

        // Check that there are no states with negative altitude
        let negative_altitudes: Vec<_> = trajectory
            .iter()
            .filter(|state| state.altitude < 0.0)
            .collect();
        assert!(
            negative_altitudes.is_empty(),
            "Found {} states with negative altitude",
            negative_altitudes.len()
        );

        // Check that the final state has reasonable low altitude (close to but above ground)
        assert!(
            final_state.altitude < 1000.0,
            "Final altitude {} is too high - simulation should end closer to ground",
            final_state.altitude
        );
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
