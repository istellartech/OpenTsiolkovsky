/// Rocket data structures and configuration
/// 
/// This module contains rocket configuration structures
/// that are compatible with the existing JSON format.

use serde::{Deserialize, Serialize};

/// 2D surface data for bilinear interpolation (e.g., CN(Mach, alpha_deg))
#[derive(Debug, Clone)]
pub struct SurfaceData2D {
    pub x: Vec<f64>,      // primary axis (e.g., Mach), length M (ascending)
    pub y: Vec<f64>,      // secondary axis (e.g., angle [deg]), length N (ascending)
    pub z: Vec<Vec<f64>>, // M x N grid values
}

impl SurfaceData2D {
    pub fn interpolate(&self, xv: f64, yv: f64) -> f64 {
        let m = self.x.len();
        let n = self.y.len();
        if m == 0 || n == 0 { return 0.0; }

        // Find x indices (clamped)
        let mut i = 0usize;
        while i + 1 < m && xv > self.x[i + 1] { i += 1; }
        if i + 1 >= m { i = m - 2; }
        if xv < self.x[0] { i = 0; }
        let x0 = self.x[i];
        let x1 = self.x[i + 1];
        let tx = if (x1 - x0).abs() < 1e-12 { 0.0 } else { (xv - x0) / (x1 - x0) };

        // Find y indices (clamped)
        let mut j = 0usize;
        while j + 1 < n && yv > self.y[j + 1] { j += 1; }
        if j + 1 >= n { j = n - 2; }
        if yv < self.y[0] { j = 0; }
        let y0 = self.y[j];
        let y1 = self.y[j + 1];
        let ty = if (y1 - y0).abs() < 1e-12 { 0.0 } else { (yv - y0) / (y1 - y0) };

        // Bilinear interpolation
        let z00 = self.z[i][j];
        let z10 = self.z[i + 1][j];
        let z01 = self.z[i][j + 1];
        let z11 = self.z[i + 1][j + 1];
        let z0 = z00 + (z10 - z00) * tx;
        let z1 = z01 + (z11 - z01) * tx;
        z0 + (z1 - z0) * ty
    }

    /// Interpolate with C++-compatible triangular scheme (interp_matrix_2d)
    pub fn interpolate_cxx(&self, mach: f64, alpha_deg: f64) -> f64 {
        let m = self.x.len();
        let n = self.y.len();
        if m < 2 || n < 2 { return 0.0; }

        // Clamp into bounds (C++版は範囲外エラーだが、ここでは端値に丸める)
        let mach_c = mach.clamp(self.x[0], self.x[m-1]);
        let alpha_c = alpha_deg.clamp(self.y[0], self.y[n-1]);

        // Find lower index for mach: i such that x[i] <= mach < x[i+1]
        let mut i = 0usize;
        for k in 1..m { if mach_c < self.x[k] { i = k-1; break; } i = (m-2).min(k-1); }
        let x0 = self.x[i];
        let x1 = self.x[i+1];
        let d_mach = if (x1 - x0).abs() < 1e-12 { 0.0 } else { (mach_c - x0) / (x1 - x0) };

        // Find lower index for alpha: j such that y[j] <= alpha < y[j+1]
        let mut j = 0usize;
        for k in 1..n { if alpha_c < self.y[k] { j = k-1; break; } j = (n-2).min(k-1); }
        let y0 = self.y[j];
        let y1 = self.y[j+1];
        let d_alpha = if (y1 - y0).abs() < 1e-12 { 0.0 } else { (alpha_c - y0) / (y1 - y0) };

        // Sample corners
        let f = |ii: usize, jj: usize| -> f64 { self.z[ii][jj] };

        // C++の分割三角形補間に合わせる
        if d_mach < 0.5 {
            if d_alpha < 0.5 {
                f(i,j)
                    + (f(i+1,j) - f(i,j)) * d_mach
                    + (f(i,j+1) - f(i,j)) * d_alpha
            } else {
                f(i,j+1)
                    + (f(i+1,j+1) - f(i,j+1)) * d_mach
                    + (f(i,j+1) - f(i,j)) * (d_alpha - 1.0)
            }
        } else {
            if d_alpha < 0.5 {
                f(i+1,j)
                    + (f(i+1,j) - f(i,j)) * (d_mach - 1.0)
                    + (f(i+1,j+1) - f(i+1,j)) * d_alpha
            } else {
                f(i+1,j+1)
                    + (f(i+1,j+1) - f(i,j+1)) * (d_mach - 1.0)
                    + (f(i+1,j+1) - f(i+1,j)) * (d_alpha - 1.0)
            }
        }
    }
}

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
    pub cn_surface: Option<SurfaceData2D>,
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
            cn_surface: None,
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

    /// Get CN at given Mach and |angle| in degrees (like C++ interp_matrix_2d)
    pub fn cn_at(&self, mach: f64, angle_deg_abs: f64) -> f64 {
        if let Some(ref surf) = self.cn_surface {
            let v = surf.interpolate_cxx(mach, angle_deg_abs.max(0.0));
            v * self.config.stage1.aero.normal_multiplier
        } else {
            // Fallback: scale constant/1D CN by radians
            let base = self.cn_at_mach(mach);
            base * (angle_deg_abs.to_radians())
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
