/// Main simulation engine
/// 
/// This module will contain the core simulation logic

use nalgebra::Vector3;
use serde::{Deserialize, Serialize};
use crate::rocket::{Rocket, RocketConfig};
use crate::physics::{coordinates::CoordinateTransform, atmosphere::AtmosphereModel, gravity::GravityModel};
use crate::math::{RungeKutta4, constants::G0, deg2rad};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulationState {
    pub time: f64,
    pub position: Vector3<f64>,     // ECI coordinates [m]
    pub velocity: Vector3<f64>,     // ECI coordinates [m/s]
    pub mass: f64,                  // [kg]
    pub stage: u8,
    pub altitude: f64,              // Altitude above sea level [m]
    pub velocity_magnitude: f64,    // |velocity| [m/s]
    pub mach_number: f64,           // Mach number [-]
    pub dynamic_pressure: f64,      // Dynamic pressure [Pa]
    pub thrust: f64,                // Current thrust [N]
    pub drag_force: f64,            // Current drag force [N]
}

/// Main simulator struct
pub struct Simulator {
    pub config: RocketConfig,
    pub rocket: Rocket,
    pub atmosphere: AtmosphereModel,
    pub gravity: GravityModel,
    pub integrator: RungeKutta4,
    pub state: SimulationState,
    pub trajectory: Vec<SimulationState>,
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
    pub fn new(config: RocketConfig) -> Result<Self, SimError> {
        let rocket = Rocket::new(config.clone());
        let atmosphere = AtmosphereModel::new();
        let gravity = GravityModel::new();
        let integrator = RungeKutta4;
        
        // Initialize state from launch conditions
        let pos_llh = Vector3::new(
            config.launch.position_llh[0],
            config.launch.position_llh[1], 
            config.launch.position_llh[2]
        );
        let vel_ned = Vector3::new(
            config.launch.velocity_ned[0],
            config.launch.velocity_ned[1],
            config.launch.velocity_ned[2]
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
        })
    }
    
    /// Run full simulation
    pub fn run(&mut self) -> Vec<SimulationState> {
        self.trajectory.clear();
        self.trajectory.push(self.state.clone());
        
        let end_time = self.config.calculate_condition.end_time;
        let dt = self.config.calculate_condition.time_step;
        
        while self.state.time < end_time {
            self.step(dt);
            self.trajectory.push(self.state.clone());
        }
        
        self.trajectory.clone()
    }
    
    /// Get current simulation state
    pub fn current_state(&self) -> &SimulationState {
        &self.state
    }
    
    /// Single integration step
    pub fn step(&mut self, dt: f64) {
        // State vector: [mass, px, py, pz, vx, vy, vz]
        let current_state = vec![
            self.state.mass,
            self.state.position.x,
            self.state.position.y, 
            self.state.position.z,
            self.state.velocity.x,
            self.state.velocity.y,
            self.state.velocity.z,
        ];
        
        let new_state = self.integrator.integrate(&current_state, self.state.time, dt, |t, state| {
            self.dynamics(t, state)
        });
        
        // Update state
        self.state.time += dt;
        self.state.mass = new_state[0];
        self.state.position = Vector3::new(new_state[1], new_state[2], new_state[3]);
        self.state.velocity = Vector3::new(new_state[4], new_state[5], new_state[6]);
        
        // Update derived quantities for output
        self.update_derived_quantities();
    }
    
    /// Update derived quantities for telemetry
    fn update_derived_quantities(&mut self) {
        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(&self.state.position, self.state.time);
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        
        self.state.altitude = pos_llh.z;
        self.state.velocity_magnitude = self.state.velocity.magnitude();
        
        // Atmospheric conditions
        let atm_conditions = self.atmosphere.conditions(self.state.altitude);
        let speed_of_sound = atm_conditions.speed_of_sound;
        let air_density = atm_conditions.density;
        
        self.state.mach_number = if speed_of_sound > 0.0 {
            self.state.velocity_magnitude / speed_of_sound
        } else {
            0.0
        };
        
        self.state.dynamic_pressure = 0.5 * air_density * self.state.velocity_magnitude.powi(2);
        
        // Current thrust
        self.state.thrust = self.rocket.thrust_at_time(self.state.time);
        
        // Approximate drag force magnitude
        let ca = self.rocket.ca_at_mach(self.state.mach_number);
        let body_diameter = self.config.stage1.aero.body_diameter;
        let reference_area = std::f64::consts::PI * (body_diameter / 2.0).powi(2);
        self.state.drag_force = ca * self.state.dynamic_pressure * reference_area;
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
        let air_density = atm_conditions.density;
        let speed_of_sound = atm_conditions.speed_of_sound;
        
        // Velocity analysis
        let velocity_magnitude = velocity.magnitude();
        let mach_number = if speed_of_sound > 0.0 { velocity_magnitude / speed_of_sound } else { 0.0 };
        let dynamic_pressure = 0.5 * air_density * velocity_magnitude * velocity_magnitude;
        
        // Forces in ECI frame
        let mut total_force = Vector3::zeros();
        
        // 1. Gravity force
        let gravity_acceleration = self.gravity.gravity_eci(&position);
        total_force += mass * gravity_acceleration;
        
        // 2. Thrust force
        let (thrust_force, mass_flow_rate) = self.compute_thrust_force(t, &position, &velocity);
        total_force += thrust_force;
        
        // 3. Aerodynamic forces
        let aero_force = self.compute_aerodynamic_forces(&position, &velocity, t, mach_number, dynamic_pressure);
        total_force += aero_force;
        
        // Acceleration
        let acceleration = if mass > 0.0 { total_force / mass } else { Vector3::zeros() };
        
        // Derivatives
        vec![
            -mass_flow_rate,        // dmass/dt (propellant consumption)
            velocity.x,             // dx/dt
            velocity.y,             // dy/dt  
            velocity.z,             // dz/dt
            acceleration.x,         // dvx/dt
            acceleration.y,         // dvy/dt
            acceleration.z,         // dvz/dt
        ]
    }
    
    /// Compute thrust force in ECI frame
    fn compute_thrust_force(&self, t: f64, position: &Vector3<f64>, _velocity: &Vector3<f64>) -> (Vector3<f64>, f64) {
        let burn_start = self.config.stage1.thrust.burn_start_time;
        let burn_end = self.config.stage1.thrust.burn_end_time;
        
        // Check if engine is burning
        if t < burn_start || t > burn_end {
            return (Vector3::zeros(), 0.0);
        }
        
        // Get thrust and Isp at current time
        let thrust_magnitude = self.rocket.thrust_at_time(t);
        let isp = self.rocket.isp_at_time(t);
        
        if thrust_magnitude <= 0.0 || isp <= 0.0 {
            return (Vector3::zeros(), 0.0);
        }
        
        // Mass flow rate
        let mass_flow_rate = thrust_magnitude / (isp * G0);
        
        // Thrust direction from attitude
        let (azimuth_deg, elevation_deg) = self.rocket.attitude_at_time(t);
        let azimuth_rad = deg2rad(azimuth_deg);
        let elevation_rad = deg2rad(elevation_deg);
        
        // Convert position to LLH for NED frame
        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(position, t);
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        
        // Thrust direction in NED frame
        let dcm_ned_to_body = CoordinateTransform::dcm_ned_to_body(azimuth_rad, elevation_rad, None);
        let thrust_ned = dcm_ned_to_body * Vector3::new(0.0, 0.0, thrust_magnitude); // Thrust in +Z body direction
        
        // Transform thrust to ECI frame
        let dcm_eci_to_ned = CoordinateTransform::dcm_eci_to_ned(&pos_llh, t);
        let dcm_ned_to_eci = dcm_eci_to_ned.transpose();
        let thrust_eci = dcm_ned_to_eci * thrust_ned;
        
        (thrust_eci, mass_flow_rate)
    }
    
    /// Compute aerodynamic forces in ECI frame
    fn compute_aerodynamic_forces(
        &self, 
        position: &Vector3<f64>, 
        velocity: &Vector3<f64>, 
        t: f64, 
        mach_number: f64, 
        dynamic_pressure: f64
    ) -> Vector3<f64> {
        if velocity.magnitude() < 0.1 {
            return Vector3::zeros();
        }
        
        // Convert to NED frame for aerodynamic calculations
        let pos_ecef = CoordinateTransform::pos_eci_to_ecef(position, t);
        let pos_llh = CoordinateTransform::pos_ecef_to_llh(&pos_ecef);
        
        let dcm_eci_to_ned = CoordinateTransform::dcm_eci_to_ned(&pos_llh, t);
        let velocity_ned = CoordinateTransform::vel_eci_to_ecef_ned_frame(position, velocity, &dcm_eci_to_ned);
        
        // Apply wind (if any)
        let wind_ned = if let Some(ref wind_data) = self.rocket.wind_data {
            // Interpolate wind based on altitude
            let altitude = pos_llh.z;
            let mut wind_speed = 0.0;
            let mut wind_direction = 0.0;
            
            // Linear interpolation for wind
            for i in 0..wind_data.len() - 1 {
                if altitude >= wind_data[i].0 && altitude <= wind_data[i + 1].0 {
                    let dt = wind_data[i + 1].0 - wind_data[i].0;
                    if dt.abs() > 1e-10 {
                        let alpha = (altitude - wind_data[i].0) / dt;
                        wind_speed = wind_data[i].1 + alpha * (wind_data[i + 1].1 - wind_data[i].1);
                        wind_direction = wind_data[i].2 + alpha * (wind_data[i + 1].2 - wind_data[i].2);
                    } else {
                        wind_speed = wind_data[i].1;
                        wind_direction = wind_data[i].2;
                    }
                    break;
                }
            }
            
            CoordinateTransform::vel_wind_ned_frame(wind_speed, wind_direction)
        } else {
            CoordinateTransform::vel_wind_ned_frame(self.config.wind.const_wind[0], self.config.wind.const_wind[1])
        };
        
        // Relative air velocity
        let vel_air_ned = velocity_ned - wind_ned;
        let vel_air_magnitude = vel_air_ned.magnitude();
        
        if vel_air_magnitude < 0.1 {
            return Vector3::zeros();
        }
        
        // Body reference area
        let body_diameter = self.config.stage1.aero.body_diameter;
        let reference_area = std::f64::consts::PI * (body_diameter / 2.0).powi(2);
        
        // Drag force (axial)
        let ca = self.rocket.ca_at_mach(mach_number);
        let drag_magnitude = ca * dynamic_pressure * reference_area;
        
        // Normal force (for angle of attack effects)
        let cn = self.rocket.cn_at_mach(mach_number);
        
        // Get attitude for body frame transformation
        let (azimuth_deg, elevation_deg) = self.rocket.attitude_at_time(t);
        let azimuth_rad = deg2rad(azimuth_deg);
        let elevation_rad = deg2rad(elevation_deg);
        let dcm_ned_to_body = CoordinateTransform::dcm_ned_to_body(azimuth_rad, elevation_rad, None);
        
        // Air velocity in body frame
        let vel_air_body = CoordinateTransform::vel_air_body_frame(&dcm_ned_to_body, &vel_air_ned, &Vector3::zeros());
        
        // Angle of attack
        let angles = CoordinateTransform::angle_of_attack(&vel_air_body);
        let alpha = angles.x; // angle of attack
        let beta = angles.y;  // sideslip angle
        
        // Aerodynamic forces in body frame
        let drag_body = Vector3::new(-drag_magnitude, 0.0, 0.0); // Drag opposes velocity
        let normal_force_magnitude = cn * dynamic_pressure * reference_area * alpha;
        let side_force_magnitude = cn * dynamic_pressure * reference_area * beta;
        let normal_body = Vector3::new(0.0, side_force_magnitude, normal_force_magnitude);
        
        let total_aero_body = drag_body + normal_body;
        
        // Transform to NED frame
        let dcm_body_to_ned = dcm_ned_to_body.transpose();
        let aero_force_ned = dcm_body_to_ned * total_aero_body;
        
        // Transform to ECI frame
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
        let simulator = Simulator::new(config);
        assert!(simulator.is_ok());
    }
    
    #[test]
    fn test_simulation_step() {
        let config = create_test_config();
        let mut simulator = Simulator::new(config).unwrap();
        
        let initial_time = simulator.state.time;
        simulator.step(1.0);
        
        assert_eq!(simulator.state.time, initial_time + 1.0);
    }
}