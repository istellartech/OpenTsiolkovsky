use crate::math::{constants::G0, deg2rad, integrator::DormandPrince54};
use crate::physics::{
    atmosphere::AtmosphereModel, coordinates::CoordinateTransform, gravity::GravityModel,
};
use crate::rocket::{Rocket, RocketConfig};
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

/// Main simulator struct
pub struct Simulator {
    pub config: RocketConfig,
    pub rocket: Rocket,
    pub atmosphere: AtmosphereModel,
    pub gravity: GravityModel,
    pub integrator: DormandPrince54,
    pub state: SimulationState,
    pub trajectory: Vec<SimulationState>,
    // Telemetry helpers (computed consistently with dynamics)
    last_dynamic_pressure: f64,
    last_thrust_magnitude: f64,
    last_drag_magnitude: f64,
    pub telemetry_cpp: Vec<CsvCppRow>,
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
        let integrator = DormandPrince54::new(1.0e-9, 1.0e-9, 1.0e-6, 10.0);

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

        let state = SimulationState {
            time: 0.0,
            position,
            velocity,
            mass: config.stage1.mass_initial,
            stage: 0,
            altitude: config.launch.position_llh[2],
            velocity_magnitude: velocity.magnitude(),
            mach_number: 0.0,
            dynamic_pressure: 0.0,
            thrust: 0.0,
            drag_force: 0.0,
        };

        Ok(Simulator {
            config,
            rocket,
            atmosphere,
            gravity,
            integrator,
            state,
            trajectory: Vec::new(),
            last_dynamic_pressure: 0.0,
            last_thrust_magnitude: 0.0,
            last_drag_magnitude: 0.0,
            telemetry_cpp: Vec::new(),
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

        while self.state.time < end_time {
            // substep RK4 to reduce integration error
            let sub = 2u32;
            let h = dt_out / sub as f64;
            for _ in 0..sub {
                if self.state.time >= end_time {
                    break;
                }
                self.step(h);
            }
            self.trajectory.push(self.state.clone());
            // capture C++-compatible telemetry row for this output time
            let row = self.capture_cpp_row();
            self.telemetry_cpp.push(row);
            if self.state.altitude <= 0.0 {
                break;
            }
        }
        self.trajectory.clone()
    }

    /// Get current simulation state
    pub fn current_state(&self) -> &SimulationState {
        &self.state
    }

    /// Single integration step
    pub fn step(&mut self, dt: f64) {
        // For backward compatibility in tests: perform a simple RK4 step
        use crate::math::RungeKutta4;
        let rk4 = RungeKutta4;
        let current_state = vec![
            self.state.mass,
            self.state.position.x,
            self.state.position.y,
            self.state.position.z,
            self.state.velocity.x,
            self.state.velocity.y,
            self.state.velocity.z,
        ];
        let new_state = rk4.integrate(&current_state, self.state.time, dt, |t, state| {
            self.dynamics(t, state)
        });
        self.state.time += dt;
        self.state.mass = new_state[0];
        self.state.position = Vector3::new(new_state[1], new_state[2], new_state[3]);
        self.state.velocity = Vector3::new(new_state[4], new_state[5], new_state[6]);
        self.update_derived_quantities();
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
        let wind_ned = if let Some(ref wind_data) = self.rocket.wind_data {
            // Simple linear interpolation in altitude
            let alt = self.state.altitude;
            let mut ws = self.config.wind.const_wind[0];
            let mut wd = self.config.wind.const_wind[1];
            for i in 0..wind_data.len().saturating_sub(1) {
                if alt >= wind_data[i].0 && alt <= wind_data[i + 1].0 {
                    let dt = wind_data[i + 1].0 - wind_data[i].0;
                    if dt.abs() > 1e-12 {
                        let a = (alt - wind_data[i].0) / dt;
                        ws = wind_data[i].1 + a * (wind_data[i + 1].1 - wind_data[i].1);
                        wd = wind_data[i].2 + a * (wind_data[i + 1].2 - wind_data[i].2);
                    } else {
                        ws = wind_data[i].1;
                        wd = wind_data[i].2;
                    }
                    break;
                }
            }
            CoordinateTransform::vel_wind_ned_frame(ws, wd)
        } else {
            CoordinateTransform::vel_wind_ned_frame(
                self.config.wind.const_wind[0],
                self.config.wind.const_wind[1],
            )
        };

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
        let burn_start = self.config.stage1.thrust.burn_start_time;
        let burn_end = self
            .config
            .stage1
            .thrust
            .burn_end_time
            .min(self.config.stage1.thrust.forced_cutoff_time);
        self.state.thrust = if t >= burn_start && t < burn_end {
            self.rocket.thrust_at_time(t)
        } else {
            0.0
        };
        self.last_thrust_magnitude = self.state.thrust;

        // Drag magnitude using CA(Mach)
        let ca = self.rocket.ca_at_mach(self.state.mach_number);
        let body_diameter = self.config.stage1.aero.body_diameter;
        let reference_area = std::f64::consts::PI * (body_diameter / 2.0).powi(2);
        self.state.drag_force = ca * self.state.dynamic_pressure * reference_area;
        self.last_drag_magnitude = self.state.drag_force;
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

        // Atmospheric conditions
        let atm_conditions = self.atmosphere.conditions(altitude);
        let speed_of_sound = atm_conditions.speed_of_sound;

        // Velocity analysis in air-relative NED frame
        let dcm_eci_to_ned = CoordinateTransform::dcm_eci_to_ned(&pos_llh, t);
        let velocity_ned =
            CoordinateTransform::vel_eci_to_ecef_ned_frame(&position, &velocity, &dcm_eci_to_ned);
        let wind_ned = if let Some(ref wind_data) = self.rocket.wind_data {
            let altitude = pos_llh.z;
            let mut wind_speed = 0.0;
            let mut wind_direction = 0.0;
            for i in 0..wind_data.len().saturating_sub(1) {
                if altitude >= wind_data[i].0 && altitude <= wind_data[i + 1].0 {
                    let dt = wind_data[i + 1].0 - wind_data[i].0;
                    if dt.abs() > 1e-10 {
                        let alpha = (altitude - wind_data[i].0) / dt;
                        wind_speed = wind_data[i].1 + alpha * (wind_data[i + 1].1 - wind_data[i].1);
                        wind_direction =
                            wind_data[i].2 + alpha * (wind_data[i + 1].2 - wind_data[i].2);
                    } else {
                        wind_speed = wind_data[i].1;
                        wind_direction = wind_data[i].2;
                    }
                    break;
                }
            }
            CoordinateTransform::vel_wind_ned_frame(wind_speed, wind_direction)
        } else {
            CoordinateTransform::vel_wind_ned_frame(
                self.config.wind.const_wind[0],
                self.config.wind.const_wind[1],
            )
        };
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
        let aero_force = self.compute_aerodynamic_forces(
            &position,
            &velocity,
            t,
            mach_number,
            mass,
        );
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
        let (wind_speed, wind_dir) = if let Some(ref wind_data) = self.rocket.wind_data {
            let alt = alt_m;
            let mut ws = self.config.wind.const_wind[0];
            let mut wd = self.config.wind.const_wind[1];
            for i in 0..wind_data.len().saturating_sub(1) {
                if alt >= wind_data[i].0 && alt <= wind_data[i + 1].0 {
                    let dt = wind_data[i + 1].0 - wind_data[i].0;
                    if dt.abs() > 1e-12 {
                        let a = (alt - wind_data[i].0) / dt;
                        ws = wind_data[i].1 + a * (wind_data[i + 1].1 - wind_data[i].1);
                        wd = wind_data[i].2 + a * (wind_data[i + 1].2 - wind_data[i].2);
                    } else {
                        ws = wind_data[i].1;
                        wd = wind_data[i].2;
                    }
                    break;
                }
            }
            (ws, wd)
        } else {
            (
                self.config.wind.const_wind[0],
                self.config.wind.const_wind[1],
            )
        };
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

        // Aerodynamics
        let q = 0.5 * atm.density * vel_air_mag.powi(2);
        let ca = self.rocket.ca_at_mach(self.state.mach_number);
        let body_diameter = self.config.stage1.aero.body_diameter;
        let ref_area = std::f64::consts::PI * (body_diameter / 2.0).powi(2);
        let drag = ca * q * ref_area;
        let cn_pitch = alpha.signum()
            * self
                .rocket
                .cn_at(self.state.mach_number, alpha.to_degrees().abs());
        let cn_yaw = beta.signum()
            * self
                .rocket
                .cn_at(self.state.mach_number, beta.to_degrees().abs());
        let force_normal_pitch = cn_pitch * q * ref_area;
        let force_normal_yaw = cn_yaw * q * ref_area;
        let aero_body = Vector3::new(-drag, -force_normal_yaw, -force_normal_pitch);
        let aero_eci = dcm_body_to_eci * aero_body;

        // Thrust
        let burn_start = self.config.stage1.thrust.burn_start_time;
        let burn_end_eff = self
            .config
            .stage1
            .thrust
            .burn_end_time
            .min(self.config.stage1.thrust.forced_cutoff_time);
        let is_powered = t >= burn_start && t < burn_end_eff;
        let thrust_vac = if is_powered {
            self.rocket.thrust_at_time(t)
        } else {
            0.0
        };
        let isp_vac = if is_powered {
            self.rocket.isp_at_time(t)
        } else {
            0.0
        };
        let throat_diameter = self.config.stage1.thrust.throat_diameter;
        let exit_area = std::f64::consts::PI
            * (throat_diameter * throat_diameter)
            * 0.25
            * self.config.stage1.thrust.nozzle_expansion_ratio;
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
            is_separated: 0,
        }
    }

    /// Compute thrust force in ECI frame
    fn compute_thrust_force(
        &self,
        t: f64,
        position: &Vector3<f64>,
        _velocity: &Vector3<f64>,
    ) -> (Vector3<f64>, f64) {
        let burn_start = self.config.stage1.thrust.burn_start_time;
        let burn_end = self
            .config
            .stage1
            .thrust
            .burn_end_time
            .min(self.config.stage1.thrust.forced_cutoff_time);

        // Check if engine is burning
        if t < burn_start || t >= burn_end {
            return (Vector3::zeros(), 0.0);
        }

        // Get thrust (vacuum) and Isp (vacuum) at current time
        let thrust_vac = self.rocket.thrust_at_time(t);
        let isp_vac = self.rocket.isp_at_time(t);

        if thrust_vac <= 0.0 || isp_vac <= 0.0 {
            return (Vector3::zeros(), 0.0);
        }

        // Mass flow rate (use vacuum values like C++)
        let mass_flow_rate = thrust_vac / (isp_vac * G0);

        // Ambient pressure loss at nozzle exit (C++: thrust = thrust_vac - A_exit * p)
        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(position, t);
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        let atm = self.atmosphere.conditions(pos_llh.z);
        let throat_diameter = self.config.stage1.thrust.throat_diameter;
        let exit_area = std::f64::consts::PI
            * (throat_diameter * throat_diameter)
            * 0.25
            * self.config.stage1.thrust.nozzle_expansion_ratio;
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
        let wind_ned = if let Some(ref wind_data) = self.rocket.wind_data {
            // Interpolate wind based on altitude
            let altitude = pos_llh.z;
            let mut wind_speed = 0.0;
            let mut wind_direction = 0.0;
            for i in 0..wind_data.len().saturating_sub(1) {
                if altitude >= wind_data[i].0 && altitude <= wind_data[i + 1].0 {
                    let dt = wind_data[i + 1].0 - wind_data[i].0;
                    if dt.abs() > 1e-10 {
                        let alpha = (altitude - wind_data[i].0) / dt;
                        wind_speed = wind_data[i].1 + alpha * (wind_data[i + 1].1 - wind_data[i].1);
                        wind_direction =
                            wind_data[i].2 + alpha * (wind_data[i + 1].2 - wind_data[i].2);
                    } else {
                        wind_speed = wind_data[i].1;
                        wind_direction = wind_data[i].2;
                    }
                    break;
                }
            }
            CoordinateTransform::vel_wind_ned_frame(wind_speed, wind_direction)
        } else {
            CoordinateTransform::vel_wind_ned_frame(
                self.config.wind.const_wind[0],
                self.config.wind.const_wind[1],
            )
        };

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

        // Body reference area
        let body_diameter = self.config.stage1.aero.body_diameter;
        let reference_area = std::f64::consts::PI * (body_diameter / 2.0).powi(2);
        let ca = self.rocket.ca_at_mach(mach_number);

        // Recompute dynamic_pressure based on air-relative speed
        let atm_density = self.atmosphere.conditions(pos_llh.z).density;
        let q = 0.5 * atm_density * vel_air_magnitude.powi(2);

        // If in free flight and ballistic mode is requested, use ballistic coefficient model
        let burn_start = self.config.stage1.thrust.burn_start_time;
        let burn_end = self.config.stage1.thrust.burn_end_time;
        let is_burning = t >= burn_start && t <= burn_end;
        if !is_burning && self.config.stage1.free_flight_mode == 2 {
            let bc = self.config.stage1.aero.ballistic_coefficient.max(1e-9);
            // Acceleration magnitude along -airflow
            let accel_mag = q / bc; // [m/s^2]
            let force_ned = -accel_mag * mass * (vel_air_ned / vel_air_magnitude);
            let dcm_ned_to_eci = dcm_eci_to_ned.transpose();
            return dcm_ned_to_eci * force_ned;
        }

        // Otherwise use aerodynamic coefficients (CA, CN from Mach x |angle| table)
        let alpha_deg = alpha.to_degrees().abs();
        let beta_deg = beta.to_degrees().abs();
        let cn_pitch = alpha.signum() * self.rocket.cn_at(mach_number, alpha_deg);
        let cn_yaw = beta.signum() * self.rocket.cn_at(mach_number, beta_deg);

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

        RocketConfig {
            name: "test".to_string(),
            calculate_condition: CalculateCondition {
                end_time: 10.0,
                time_step: 1.0,
                air_density_file_exists: false,
                air_density_file: "".to_string(),
                air_density_variation: 0.0,
            },
            launch: LaunchCondition {
                position_llh: [35.0, 139.0, 0.0],
                velocity_ned: [0.0, 0.0, 0.0],
                launch_time: [2023, 1, 1, 12, 0, 0],
            },
            stage1: StageConfig {
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
            },
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
}
