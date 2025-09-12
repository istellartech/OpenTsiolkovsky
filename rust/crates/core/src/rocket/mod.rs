/// Rocket data structures and configuration
/// 
/// This module contains rocket configuration structures
/// that are compatible with the existing JSON format.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RocketConfig {
    #[serde(rename = "name(str)")]
    pub name: String,
    
    #[serde(rename = "calculate condition")]
    pub calculate_condition: CalculateCondition,
    
    pub launch: LaunchCondition,
    
    #[serde(rename = "stage1")]
    pub stage1: StageConfig,
    
    pub wind: WindConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CalculateCondition {
    #[serde(rename = "end time[s]")]
    pub end_time: f64,
    
    #[serde(rename = "time step for output[s]")]
    pub time_step: f64,
    
    #[serde(rename = "air density variation file exist?(bool)")]
    pub air_density_file_exists: bool,
    
    #[serde(rename = "air density variation file name(str)")]
    pub air_density_file: String,
    
    #[serde(rename = "variation ratio of air density[%](-100to100, default=0)")]
    pub air_density_variation: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchCondition {
    #[serde(rename = "position LLH[deg,deg,m]")]
    pub position_llh: [f64; 3],
    
    #[serde(rename = "velocity NED[m/s]")]
    pub velocity_ned: [f64; 3],
    
    #[serde(rename = "time(UTC)[y,m,d,h,min,sec]")]
    pub launch_time: [i32; 6],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageConfig {
    #[serde(rename = "power flight mode(int)")]
    pub power_flight_mode: i32,
    
    #[serde(rename = "free flight mode(int)")]
    pub free_flight_mode: i32,
    
    #[serde(rename = "mass initial[kg]")]
    pub mass_initial: f64,
    
    pub thrust: ThrustConfig,
    pub aero: AeroConfig,
    pub attitude: AttitudeConfig,
    
    #[serde(rename = "dumping product")]
    pub dumping_product: DumpingProductConfig,
    
    #[serde(rename = "attitude neutrality(3DoF)")]
    pub attitude_neutrality: AttitudeNeutralityConfig,
    
    #[serde(rename = "6DoF")]
    pub six_dof: SixDofConfig,
    
    pub stage: StageTransitionConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThrustConfig {
    #[serde(rename = "Isp vac file exist?(bool)")]
    pub isp_file_exists: bool,
    
    #[serde(rename = "Isp vac file name(str)")]
    pub isp_file_name: String,
    
    #[serde(rename = "Isp coefficient[-]")]
    pub isp_coefficient: f64,
    
    #[serde(rename = "const Isp vac[s]")]
    pub const_isp_vac: f64,
    
    #[serde(rename = "thrust vac file exist?(bool)")]
    pub thrust_file_exists: bool,
    
    #[serde(rename = "thrust vac file name(str)")]
    pub thrust_file_name: String,
    
    #[serde(rename = "thrust coefficient[-]")]
    pub thrust_coefficient: f64,
    
    #[serde(rename = "const thrust vac[N]")]
    pub const_thrust_vac: f64,
    
    #[serde(rename = "burn start time(time of each stage)[s]")]
    pub burn_start_time: f64,
    
    #[serde(rename = "burn end time(time of each stage)[s]")]
    pub burn_end_time: f64,
    
    #[serde(rename = "forced cutoff time(time of each stage)[s]")]
    pub forced_cutoff_time: f64,
    
    #[serde(rename = "throat diameter[m]")]
    pub throat_diameter: f64,
    
    #[serde(rename = "nozzle expansion ratio[-]")]
    pub nozzle_expansion_ratio: f64,
    
    #[serde(rename = "nozzle exhaust pressure[Pa]")]
    pub nozzle_exhaust_pressure: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AeroConfig {
    #[serde(rename = "body diameter[m]")]
    pub body_diameter: f64,
    
    #[serde(rename = "normal coefficient file exist?(bool)")]
    pub cn_file_exists: bool,
    
    #[serde(rename = "normal coefficient file name(str)")]
    pub cn_file_name: String,
    
    #[serde(rename = "normal multiplier[-]")]
    pub normal_multiplier: f64,
    
    #[serde(rename = "const normal coefficient[-]")]
    pub const_normal_coefficient: f64,
    
    #[serde(rename = "axial coefficient file exist?(bool)")]
    pub ca_file_exists: bool,
    
    #[serde(rename = "axial coefficient file name(str)")]
    pub ca_file_name: String,
    
    #[serde(rename = "axial multiplier[-]")]
    pub axial_multiplier: f64,
    
    #[serde(rename = "const axial coefficient[-]")]
    pub const_axial_coefficient: f64,
    
    #[serde(rename = "ballistic coefficient(ballistic flight mode)[kg/m2]")]
    pub ballistic_coefficient: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttitudeConfig {
    #[serde(rename = "attitude file exist?(bool)")]
    pub attitude_file_exists: bool,
    
    #[serde(rename = "attitude file name(str)")]
    pub attitude_file_name: String,
    
    #[serde(rename = "const elevation[deg]")]
    pub const_elevation: f64,
    
    #[serde(rename = "const azimuth[deg]")]
    pub const_azimuth: f64,
    
    #[serde(rename = "pitch offset[deg]")]
    pub pitch_offset: f64,
    
    #[serde(rename = "yaw offset[deg]")]
    pub yaw_offset: f64,
    
    #[serde(rename = "roll offset[deg]")]
    pub roll_offset: f64,
    
    #[serde(rename = "gyro bias x[deg/h]")]
    pub gyro_bias_x: f64,
    
    #[serde(rename = "gyro bias y[deg/h]")]
    pub gyro_bias_y: f64,
    
    #[serde(rename = "gyro bias z[deg/h]")]
    pub gyro_bias_z: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DumpingProductConfig {
    #[serde(rename = "dumping product exist?(bool)")]
    pub dumping_product_exists: bool,
    
    #[serde(rename = "dumping product separation time[s]")]
    pub dumping_product_separation_time: f64,
    
    #[serde(rename = "dumping product mass[kg]")]
    pub dumping_product_mass: f64,
    
    #[serde(rename = "dumping product ballistic coefficient[kg/m2]")]
    pub dumping_product_ballistic_coefficient: f64,
    
    #[serde(rename = "additional speed at dumping NED[m/s,m/s,m/s]")]
    pub additional_speed_at_dumping_ned: [f64; 3],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttitudeNeutralityConfig {
    #[serde(rename = "considering neutrality?(bool)")]
    pub considering_neutrality: bool,
    
    #[serde(rename = "CG, Controller position file(str)")]
    pub cg_controller_position_file: String,
    
    #[serde(rename = "CP file(str)")]
    pub cp_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SixDofConfig {
    #[serde(rename = "CG,CP,Controller position file(str)")]
    pub cg_cp_controller_position_file: String,
    
    #[serde(rename = "moment of inertia file name(str)")]
    pub moment_of_inertia_file_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageTransitionConfig {
    #[serde(rename = "following stage exist?(bool)")]
    pub following_stage_exists: bool,
    
    #[serde(rename = "separation time[s]")]
    pub separation_time: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindConfig {
    #[serde(rename = "wind file exist?(bool)")]
    pub wind_file_exists: bool,
    
    #[serde(rename = "wind file name(str)")]
    pub wind_file_name: String,
    
    #[serde(rename = "const wind[m/s,deg]")]
    pub const_wind: [f64; 2],
}

/// Time-series data structure for CSV files
#[derive(Debug, Clone)]
pub struct TimeSeriesData {
    pub time: Vec<f64>,
    pub values: Vec<f64>,
}

impl TimeSeriesData {
    pub fn new() -> Self {
        TimeSeriesData {
            time: Vec::new(),
            values: Vec::new(),
        }
    }
    
    /// Linear interpolation for given time
    pub fn interpolate(&self, t: f64) -> f64 {
        if self.time.is_empty() {
            return 0.0;
        }
        
        // Handle boundary cases
        if t <= self.time[0] {
            return self.values[0];
        }
        if t >= self.time[self.time.len() - 1] {
            return self.values[self.values.len() - 1];
        }
        
        // Find interval for interpolation
        for i in 0..self.time.len() - 1 {
            if t >= self.time[i] && t <= self.time[i + 1] {
                let dt = self.time[i + 1] - self.time[i];
                if dt.abs() < 1e-10 {
                    return self.values[i];
                }
                let alpha = (t - self.time[i]) / dt;
                return self.values[i] + alpha * (self.values[i + 1] - self.values[i]);
            }
        }
        
        self.values[self.values.len() - 1]
    }
}

/// Rocket struct containing processed configuration and data
#[derive(Debug, Clone)]
pub struct Rocket {
    pub config: RocketConfig,
    pub thrust_data: Option<TimeSeriesData>,
    pub isp_data: Option<TimeSeriesData>,
    pub cn_data: Option<TimeSeriesData>,
    pub ca_data: Option<TimeSeriesData>,
    pub attitude_data: Option<Vec<(f64, f64, f64)>>, // (time, azimuth, elevation)
    pub wind_data: Option<Vec<(f64, f64, f64)>>, // (altitude, speed, direction)
}

impl Rocket {
    pub fn new(config: RocketConfig) -> Self {
        Rocket {
            config,
            thrust_data: None,
            isp_data: None,
            cn_data: None,
            ca_data: None,
            attitude_data: None,
            wind_data: None,
        }
    }
    
    /// Get thrust at given time [N]
    pub fn thrust_at_time(&self, time: f64) -> f64 {
        if let Some(ref data) = self.thrust_data {
            data.interpolate(time) * self.config.stage1.thrust.thrust_coefficient
        } else {
            self.config.stage1.thrust.const_thrust_vac
        }
    }
    
    /// Get specific impulse at given time [s]
    pub fn isp_at_time(&self, time: f64) -> f64 {
        if let Some(ref data) = self.isp_data {
            data.interpolate(time) * self.config.stage1.thrust.isp_coefficient
        } else {
            self.config.stage1.thrust.const_isp_vac
        }
    }
    
    /// Get normal force coefficient at given Mach number
    pub fn cn_at_mach(&self, mach: f64) -> f64 {
        if let Some(ref data) = self.cn_data {
            data.interpolate(mach) * self.config.stage1.aero.normal_multiplier
        } else {
            self.config.stage1.aero.const_normal_coefficient
        }
    }
    
    /// Get axial force coefficient at given Mach number
    pub fn ca_at_mach(&self, mach: f64) -> f64 {
        if let Some(ref data) = self.ca_data {
            data.interpolate(mach) * self.config.stage1.aero.axial_multiplier
        } else {
            self.config.stage1.aero.const_axial_coefficient
        }
    }
    
    /// Get attitude angles at given time (azimuth, elevation) [deg]
    pub fn attitude_at_time(&self, time: f64) -> (f64, f64) {
        if let Some(ref data) = self.attitude_data {
            // Linear interpolation for attitude data
            if data.is_empty() {
                return (self.config.stage1.attitude.const_azimuth, self.config.stage1.attitude.const_elevation);
            }
            
            // Find appropriate interval
            for i in 0..data.len() - 1 {
                if time >= data[i].0 && time <= data[i + 1].0 {
                    let dt = data[i + 1].0 - data[i].0;
                    if dt.abs() < 1e-10 {
                        return (data[i].1, data[i].2);
                    }
                    let alpha = (time - data[i].0) / dt;
                    let azimuth = data[i].1 + alpha * (data[i + 1].1 - data[i].1);
                    let elevation = data[i].2 + alpha * (data[i + 1].2 - data[i].2);
                    return (azimuth, elevation);
                }
            }
            
            if time <= data[0].0 {
                (data[0].1, data[0].2)
            } else {
                let last = data.len() - 1;
                (data[last].1, data[last].2)
            }
        } else {
            (self.config.stage1.attitude.const_azimuth, self.config.stage1.attitude.const_elevation)
        }
    }
    
    /// Get current stage mass [kg]
    pub fn mass_at_time(&self, time: f64) -> f64 {
        let burn_start = self.config.stage1.thrust.burn_start_time;
        let burn_end = self.config.stage1.thrust.burn_end_time;
        
        if time < burn_start || time > burn_end {
            return self.config.stage1.mass_initial;
        }
        
        let thrust = self.thrust_at_time(time);
        let isp = self.isp_at_time(time);
        let g0 = 9.80665; // Standard gravity
        
        if isp > 0.0 {
            let mass_flow_rate = thrust / (isp * g0);
            let burn_time = time - burn_start;
            self.config.stage1.mass_initial - mass_flow_rate * burn_time
        } else {
            self.config.stage1.mass_initial
        }
    }
}