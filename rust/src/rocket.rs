/// Rocket data structures and configuration
///
/// This module contains rocket configuration structures
/// that are compatible with the existing JSON format.
use serde::ser::SerializeStruct;
use serde::{Deserialize, Deserializer, Serialize, Serializer};

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
        if m == 0 || n == 0 {
            return 0.0;
        }

        // Find x indices (clamped)
        let mut i = 0usize;
        while i + 1 < m && xv > self.x[i + 1] {
            i += 1;
        }
        if i + 1 >= m {
            i = m - 2;
        }
        if xv < self.x[0] {
            i = 0;
        }
        let x0 = self.x[i];
        let x1 = self.x[i + 1];
        let tx = if (x1 - x0).abs() < 1e-12 { 0.0 } else { (xv - x0) / (x1 - x0) };

        // Find y indices (clamped)
        let mut j = 0usize;
        while j + 1 < n && yv > self.y[j + 1] {
            j += 1;
        }
        if j + 1 >= n {
            j = n - 2;
        }
        if yv < self.y[0] {
            j = 0;
        }
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
        if m < 2 || n < 2 {
            return 0.0;
        }

        // Clamp into bounds (C++版は範囲外エラーだが、ここでは端値に丸める)
        let mach_c = mach.clamp(self.x[0], self.x[m - 1]);
        let alpha_c = alpha_deg.clamp(self.y[0], self.y[n - 1]);

        // Find lower index for mach: i such that x[i] <= mach < x[i+1]
        let mut i = 0usize;
        for k in 1..m {
            if mach_c < self.x[k] {
                i = k - 1;
                break;
            }
            i = (m - 2).min(k - 1);
        }
        let x0 = self.x[i];
        let x1 = self.x[i + 1];
        let d_mach = if (x1 - x0).abs() < 1e-12 { 0.0 } else { (mach_c - x0) / (x1 - x0) };

        // Find lower index for alpha: j such that y[j] <= alpha < y[j+1]
        let mut j = 0usize;
        for k in 1..n {
            if alpha_c < self.y[k] {
                j = k - 1;
                break;
            }
            j = (n - 2).min(k - 1);
        }
        let y0 = self.y[j];
        let y1 = self.y[j + 1];
        let d_alpha = if (y1 - y0).abs() < 1e-12 { 0.0 } else { (alpha_c - y0) / (y1 - y0) };

        // Sample corners
        let f = |ii: usize, jj: usize| -> f64 { self.z[ii][jj] };

        // C++の分割三角形補間に合わせる
        if d_mach < 0.5 {
            if d_alpha < 0.5 {
                f(i, j) + (f(i + 1, j) - f(i, j)) * d_mach + (f(i, j + 1) - f(i, j)) * d_alpha
            } else {
                f(i, j + 1)
                    + (f(i + 1, j + 1) - f(i, j + 1)) * d_mach
                    + (f(i, j + 1) - f(i, j)) * (d_alpha - 1.0)
            }
        } else if d_alpha < 0.5 {
            f(i + 1, j)
                + (f(i + 1, j) - f(i, j)) * (d_mach - 1.0)
                + (f(i + 1, j + 1) - f(i + 1, j)) * d_alpha
        } else {
            f(i + 1, j + 1)
                + (f(i + 1, j + 1) - f(i, j + 1)) * (d_mach - 1.0)
                + (f(i + 1, j + 1) - f(i + 1, j)) * (d_alpha - 1.0)
        }
    }
}

#[derive(Debug, Clone)]
pub struct RocketConfig {
    pub name: String,
    pub calculate_condition: CalculateCondition,
    pub launch: LaunchCondition,
    pub stages: Vec<StageConfig>,
    pub wind: WindConfig,
}

impl Serialize for RocketConfig {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("RocketConfig", 5)?;
        state.serialize_field("name(str)", &self.name)?;
        state.serialize_field("calculate condition", &self.calculate_condition)?;
        state.serialize_field("launch", &self.launch)?;
        state.serialize_field("stages", &self.stages)?;
        state.serialize_field("wind", &self.wind)?;
        state.end()
    }
}

impl<'de> Deserialize<'de> for RocketConfig {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        #[derive(Deserialize)]
        struct RocketConfigHelper {
            #[serde(rename = "name(str)")]
            name: String,
            #[serde(rename = "calculate condition")]
            calculate_condition: CalculateCondition,
            launch: LaunchCondition,
            #[serde(default)]
            stages: Vec<StageConfig>,
            #[serde(rename = "stage1", default)]
            stage1: Option<StageConfig>,
            #[serde(rename = "stage2", default)]
            stage2: Option<StageConfig>,
            #[serde(rename = "stage3", default)]
            stage3: Option<StageConfig>,
            #[serde(rename = "stage", default)]
            stage: Option<StageConfig>,
            wind: WindConfig,
        }

        let helper = RocketConfigHelper::deserialize(deserializer)?;
        let mut stages = helper.stages;

        if stages.is_empty() {
            if let Some(stage) = helper.stage1 {
                stages.push(stage);
            }
            if let Some(stage) = helper.stage2 {
                stages.push(stage);
            }
            if let Some(stage) = helper.stage3 {
                stages.push(stage);
            }
            if stages.is_empty() {
                if let Some(stage) = helper.stage {
                    stages.push(stage);
                }
            }
        }

        if stages.is_empty() {
            return Err(serde::de::Error::custom("Rocket config must include at least one stage"));
        }

        Ok(RocketConfig {
            name: helper.name,
            calculate_condition: helper.calculate_condition,
            launch: helper.launch,
            stages,
            wind: helper.wind,
        })
    }
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
        TimeSeriesData { time: Vec::new(), values: Vec::new() }
    }

    pub fn from_pairs<I, T>(pairs: I) -> Self
    where
        I: IntoIterator<Item = T>,
        T: Into<(f64, f64)>,
    {
        let mut ts = TimeSeriesData::new();
        for pair in pairs {
            let (time, value) = pair.into();
            ts.time.push(time);
            ts.values.push(value);
        }
        ts
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

impl Default for TimeSeriesData {
    fn default() -> Self {
        Self::new()
    }
}

impl RocketConfig {
    pub fn stage_count(&self) -> usize {
        self.stages.len()
    }

    pub fn stage(&self, index: usize) -> Option<&StageConfig> {
        self.stages.get(index)
    }

    pub fn primary_stage(&self) -> &StageConfig {
        self.stages.first().expect("RocketConfig must contain at least one stage")
    }
}

/// Rocket struct containing processed configuration and data
#[derive(Debug, Clone)]
pub struct Rocket {
    pub config: RocketConfig,
    pub stage_configs: Vec<StageConfig>,
    pub thrust_tables: Vec<Option<TimeSeriesData>>,
    pub isp_tables: Vec<Option<TimeSeriesData>>,
    pub cn_data: Option<TimeSeriesData>,
    pub cn_surface: Option<SurfaceData2D>,
    pub ca_data: Option<TimeSeriesData>,
    pub attitude_data: Option<Vec<(f64, f64, f64)>>, // (time, azimuth, elevation)
    pub wind_data: Option<Vec<(f64, f64, f64)>>,     // (altitude, speed, direction)
}

impl Rocket {
    pub fn new(config: RocketConfig) -> Self {
        let stage_configs = config.stages.clone();
        let stage_count = stage_configs.len();

        Rocket {
            config,
            stage_configs,
            thrust_tables: vec![None; stage_count],
            isp_tables: vec![None; stage_count],
            cn_data: None,
            cn_surface: None,
            ca_data: None,
            attitude_data: None,
            wind_data: None,
        }
    }

    pub fn stage_count(&self) -> usize {
        self.stage_configs.len()
    }

    pub fn stage_config(&self, index: usize) -> &StageConfig {
        &self.stage_configs[index]
    }

    /// Get thrust for a specific stage at stage-relative time [N]
    pub fn thrust_at(&self, stage_index: usize, time: f64) -> f64 {
        let stage = &self.stage_configs[stage_index];
        if let Some(Some(data)) = self.thrust_tables.get(stage_index) {
            data.interpolate(time) * stage.thrust.thrust_coefficient
        } else {
            stage.thrust.const_thrust_vac
        }
    }

    /// Legacy helper (stage 0)
    pub fn thrust_at_time(&self, time: f64) -> f64 {
        self.thrust_at(0, time)
    }

    /// Get specific impulse for a stage at stage-relative time [s]
    pub fn isp_at(&self, stage_index: usize, time: f64) -> f64 {
        let stage = &self.stage_configs[stage_index];
        if let Some(Some(data)) = self.isp_tables.get(stage_index) {
            data.interpolate(time) * stage.thrust.isp_coefficient
        } else {
            stage.thrust.const_isp_vac
        }
    }

    pub fn isp_at_time(&self, time: f64) -> f64 {
        self.isp_at(0, time)
    }

    /// Get normal force coefficient at given Mach number for a stage
    pub fn cn_at_mach(&self, stage_index: usize, mach: f64) -> f64 {
        let stage = &self.stage_configs[stage_index];
        if let Some(ref data) = self.cn_data {
            data.interpolate(mach) * stage.aero.normal_multiplier
        } else {
            stage.aero.const_normal_coefficient
        }
    }

    /// Get CN at given Mach and |angle| in degrees (like C++ interp_matrix_2d)
    pub fn cn_at(&self, stage_index: usize, mach: f64, angle_deg_abs: f64) -> f64 {
        let multiplier = self.stage_configs[stage_index].aero.normal_multiplier;
        if let Some(ref surf) = self.cn_surface {
            let v = surf.interpolate_cxx(mach, angle_deg_abs.max(0.0));
            v * multiplier
        } else {
            // Fallback: scale constant/1D CN by radians
            let base = self.cn_at_mach(stage_index, mach);
            base * (angle_deg_abs.to_radians())
        }
    }

    /// Get axial force coefficient at given Mach number for a stage
    pub fn ca_at_mach(&self, stage_index: usize, mach: f64) -> f64 {
        let stage = &self.stage_configs[stage_index];
        if let Some(ref data) = self.ca_data {
            data.interpolate(mach) * stage.aero.axial_multiplier
        } else {
            stage.aero.const_axial_coefficient
        }
    }

    /// Get attitude angles at given time (azimuth, elevation) [deg]
    pub fn attitude_at_time(&self, time: f64) -> (f64, f64) {
        if let Some(ref data) = self.attitude_data {
            // Linear interpolation for attitude data
            if data.is_empty() {
                let default_attitude = &self.config.primary_stage().attitude;
                return (default_attitude.const_azimuth, default_attitude.const_elevation);
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
            let default_attitude = &self.config.primary_stage().attitude;
            (default_attitude.const_azimuth, default_attitude.const_elevation)
        }
    }

    /// Interpolated wind speed/direction at altitude [m]
    pub fn wind_at_altitude(&self, altitude: f64) -> (f64, f64) {
        let default = (self.config.wind.const_wind[0], self.config.wind.const_wind[1]);

        let data = match &self.wind_data {
            Some(data) if !data.is_empty() => data,
            _ => return default,
        };

        if altitude <= data[0].0 {
            return (data[0].1, data[0].2);
        }

        for pair in data.windows(2) {
            let (alt0, speed0, dir0) = pair[0];
            let (alt1, speed1, dir1) = pair[1];
            if altitude >= alt0 && altitude <= alt1 {
                let delta_alt = alt1 - alt0;
                if delta_alt.abs() < 1e-10 {
                    return (speed0, dir0);
                }
                let alpha = (altitude - alt0) / delta_alt;
                let speed = speed0 + alpha * (speed1 - speed0);
                let direction = dir0 + alpha * (dir1 - dir0);
                return (speed, direction);
            }
        }

        let last = data.last().unwrap();
        (last.1, last.2)
    }

    /// Get current stage mass [kg]
    pub fn mass_at_time(&self, stage_index: usize, time: f64) -> f64 {
        let stage_cfg = &self.stage_configs[stage_index];
        let burn_start = stage_cfg.thrust.burn_start_time;
        let burn_end = stage_cfg.thrust.burn_end_time;

        if time < burn_start || time > burn_end {
            return stage_cfg.mass_initial;
        }

        let thrust = self.thrust_at(stage_index, time);
        let isp = self.isp_at(stage_index, time);
        let g0 = 9.80665; // Standard gravity

        if isp > 0.0 {
            let mass_flow_rate = thrust / (isp * g0);
            let burn_time = time - burn_start;
            stage_cfg.mass_initial - mass_flow_rate * burn_time
        } else {
            stage_cfg.mass_initial
        }
    }
}

/// -------------------------------------------------------------------------------------------------
/// Client-friendly configuration (used by web API and WASM bridge)
/// -------------------------------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
pub struct ClientConfig {
    pub name: String,
    pub simulation: ClientSimulation,
    pub launch: ClientLaunch,
    #[serde(default)]
    pub stages: Vec<ClientStage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage: Option<ClientStage>,
    #[serde(default)]
    pub aerodynamics: ClientAerodynamics,
    #[serde(default)]
    pub attitude: ClientAttitude,
    #[serde(default)]
    pub wind: ClientWind,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClientSimulation {
    #[serde(default = "default_duration_s")]
    pub duration_s: f64,
    #[serde(default = "default_output_step_s")]
    pub output_step_s: f64,
    #[serde(default)]
    pub air_density_percent: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClientLaunch {
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    #[serde(default)]
    pub altitude_m: f64,
    #[serde(default = "default_velocity_ned")]
    pub velocity_ned_mps: [f64; 3],
    pub datetime_utc: ClientDateTime,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClientDateTime {
    pub year: i32,
    pub month: u32,
    pub day: u32,
    pub hour: u32,
    pub minute: u32,
    pub second: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClientStage {
    #[serde(default = "default_power_mode")]
    pub power_mode: i32,
    #[serde(default = "default_free_mode")]
    pub free_mode: i32,
    #[serde(default = "default_stage_mass")]
    pub mass_initial_kg: f64,
    #[serde(default = "default_burn_start")]
    pub burn_start_s: f64,
    #[serde(default = "default_burn_end")]
    pub burn_end_s: f64,
    #[serde(default = "default_forced_cutoff")]
    pub forced_cutoff_s: f64,
    #[serde(default = "default_separation_time")]
    pub separation_time_s: f64,
    #[serde(default = "default_throat_diameter")]
    pub throat_diameter_m: f64,
    #[serde(default = "default_nozzle_expansion")]
    pub nozzle_expansion_ratio: f64,
    #[serde(default = "default_nozzle_exit_pressure")]
    pub nozzle_exit_pressure_pa: f64,
    #[serde(default = "default_thrust_constant")]
    pub thrust_constant: f64,
    #[serde(default = "default_multiplier")]
    pub thrust_multiplier: f64,
    #[serde(default)]
    pub thrust_profile: Vec<ClientTimeSample>,
    #[serde(default = "default_isp_constant")]
    pub isp_constant: f64,
    #[serde(default = "default_multiplier")]
    pub isp_multiplier: f64,
    #[serde(default)]
    pub isp_profile: Vec<ClientTimeSample>,
}

impl Default for ClientStage {
    fn default() -> Self {
        Self {
            power_mode: default_power_mode(),
            free_mode: default_free_mode(),
            mass_initial_kg: default_stage_mass(),
            burn_start_s: default_burn_start(),
            burn_end_s: default_burn_end(),
            forced_cutoff_s: default_forced_cutoff(),
            separation_time_s: default_separation_time(),
            throat_diameter_m: default_throat_diameter(),
            nozzle_expansion_ratio: default_nozzle_expansion(),
            nozzle_exit_pressure_pa: default_nozzle_exit_pressure(),
            thrust_constant: default_thrust_constant(),
            thrust_multiplier: default_multiplier(),
            thrust_profile: Vec::new(),
            isp_constant: default_isp_constant(),
            isp_multiplier: default_multiplier(),
            isp_profile: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ClientAerodynamics {
    #[serde(default = "default_body_diameter")]
    pub body_diameter_m: f64,
    #[serde(default)]
    pub cn_constant: f64,
    #[serde(default = "default_multiplier")]
    pub cn_multiplier: f64,
    #[serde(default)]
    pub cn_profile: Vec<ClientMachSample>,
    #[serde(default)]
    pub ca_constant: f64,
    #[serde(default = "default_multiplier")]
    pub ca_multiplier: f64,
    #[serde(default)]
    pub ca_profile: Vec<ClientMachSample>,
    #[serde(default = "default_ballistic_coefficient")]
    pub ballistic_coefficient: f64,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ClientAttitude {
    #[serde(default = "default_attitude_elevation")]
    pub elevation_deg: f64,
    #[serde(default = "default_attitude_azimuth")]
    pub azimuth_deg: f64,
    #[serde(default)]
    pub pitch_offset_deg: f64,
    #[serde(default)]
    pub yaw_offset_deg: f64,
    #[serde(default)]
    pub roll_offset_deg: f64,
    #[serde(default = "default_gyro_bias")]
    pub gyro_bias_deg_h: [f64; 3],
    #[serde(default)]
    pub profile: Vec<ClientAttitudeSample>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ClientWind {
    #[serde(default)]
    pub speed_mps: f64,
    #[serde(default = "default_wind_direction")]
    pub direction_deg: f64,
    #[serde(default)]
    pub profile: Vec<ClientWindSample>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ClientTimeSample {
    pub time: f64,
    pub value: f64,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ClientMachSample {
    pub mach: f64,
    pub value: f64,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ClientAttitudeSample {
    pub time: f64,
    pub azimuth_deg: f64,
    pub elevation_deg: f64,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ClientWindSample {
    pub altitude_m: f64,
    pub speed_mps: f64,
    pub direction_deg: f64,
}

fn default_duration_s() -> f64 {
    120.0
}
fn default_output_step_s() -> f64 {
    1.0
}
fn default_velocity_ned() -> [f64; 3] {
    [0.0, 0.0, 0.0]
}
fn default_power_mode() -> i32 {
    0
}
fn default_free_mode() -> i32 {
    2
}
fn default_stage_mass() -> f64 {
    1000.0
}
fn default_burn_start() -> f64 {
    0.0
}
fn default_burn_end() -> f64 {
    30.0
}
fn default_forced_cutoff() -> f64 {
    30.0
}
fn default_separation_time() -> f64 {
    default_forced_cutoff()
}
fn default_throat_diameter() -> f64 {
    0.1
}
fn default_nozzle_expansion() -> f64 {
    5.0
}
fn default_nozzle_exit_pressure() -> f64 {
    101_300.0
}
fn default_thrust_constant() -> f64 {
    50_000.0
}
fn default_isp_constant() -> f64 {
    200.0
}
fn default_multiplier() -> f64 {
    1.0
}
fn default_body_diameter() -> f64 {
    0.5
}
fn default_ballistic_coefficient() -> f64 {
    100.0
}
fn default_attitude_elevation() -> f64 {
    83.0
}
fn default_attitude_azimuth() -> f64 {
    113.0
}
fn default_gyro_bias() -> [f64; 3] {
    [0.0, 0.0, 0.0]
}
fn default_wind_direction() -> f64 {
    270.0
}

impl ClientConfig {
    pub fn into_rocket(self) -> Rocket {
        let ClientConfig { name, simulation, launch, stages, stage, aerodynamics, attitude, wind } =
            self;

        let calc = CalculateCondition {
            end_time: simulation.duration_s,
            time_step: simulation.output_step_s,
            air_density_file_exists: false,
            air_density_file: String::new(),
            air_density_variation: simulation.air_density_percent,
        };

        let launch = LaunchCondition {
            position_llh: [launch.latitude_deg, launch.longitude_deg, launch.altitude_m],
            velocity_ned: launch.velocity_ned_mps,
            launch_time: [
                launch.datetime_utc.year,
                launch.datetime_utc.month as i32,
                launch.datetime_utc.day as i32,
                launch.datetime_utc.hour as i32,
                launch.datetime_utc.minute as i32,
                launch.datetime_utc.second as i32,
            ],
        };

        let mut stage_sources = if !stages.is_empty() {
            stages
        } else if let Some(stage) = stage {
            vec![stage]
        } else {
            Vec::new()
        };
        if stage_sources.is_empty() {
            stage_sources.push(ClientStage::default());
        }

        let total_stages = stage_sources.len();
        let stage_configs: Vec<StageConfig> = stage_sources
            .iter()
            .enumerate()
            .map(|(idx, client_stage)| {
                build_stage_config(client_stage, &aerodynamics, &attitude, idx + 1 < total_stages)
            })
            .collect();

        let wind_cfg = WindConfig {
            wind_file_exists: false,
            wind_file_name: String::new(),
            const_wind: [wind.speed_mps, wind.direction_deg],
        };

        let rocket_config = RocketConfig {
            name,
            calculate_condition: calc,
            launch,
            stages: stage_configs,
            wind: wind_cfg,
        };

        let mut rocket = Rocket::new(rocket_config);

        for (idx, client_stage) in stage_sources.into_iter().enumerate() {
            if !client_stage.thrust_profile.is_empty() {
                rocket.thrust_tables[idx] = Some(TimeSeriesData::from_pairs(
                    client_stage.thrust_profile.into_iter().map(|p| (p.time, p.value)),
                ));
            }

            if !client_stage.isp_profile.is_empty() {
                rocket.isp_tables[idx] = Some(TimeSeriesData::from_pairs(
                    client_stage.isp_profile.into_iter().map(|p| (p.time, p.value)),
                ));
            }
        }

        if !aerodynamics.cn_profile.is_empty() {
            rocket.cn_data = Some(TimeSeriesData::from_pairs(
                aerodynamics.cn_profile.into_iter().map(|p| (p.mach, p.value)),
            ));
        }

        if !aerodynamics.ca_profile.is_empty() {
            rocket.ca_data = Some(TimeSeriesData::from_pairs(
                aerodynamics.ca_profile.into_iter().map(|p| (p.mach, p.value)),
            ));
        }

        if !attitude.profile.is_empty() {
            rocket.attitude_data = Some(
                attitude
                    .profile
                    .into_iter()
                    .map(|p| (p.time, p.azimuth_deg, p.elevation_deg))
                    .collect(),
            );
        }

        if !wind.profile.is_empty() {
            rocket.wind_data = Some(
                wind.profile
                    .into_iter()
                    .map(|p| (p.altitude_m, p.speed_mps, p.direction_deg))
                    .collect(),
            );
        }

        rocket
    }
}

fn build_stage_config(
    stage: &ClientStage,
    aerodynamics: &ClientAerodynamics,
    attitude: &ClientAttitude,
    has_following_stage: bool,
) -> StageConfig {
    let thrust = ThrustConfig {
        isp_file_exists: false,
        isp_file_name: String::new(),
        isp_coefficient: stage.isp_multiplier,
        const_isp_vac: stage.isp_constant,
        thrust_file_exists: false,
        thrust_file_name: String::new(),
        thrust_coefficient: stage.thrust_multiplier,
        const_thrust_vac: stage.thrust_constant,
        burn_start_time: stage.burn_start_s,
        burn_end_time: stage.burn_end_s,
        forced_cutoff_time: stage.forced_cutoff_s,
        throat_diameter: stage.throat_diameter_m,
        nozzle_expansion_ratio: stage.nozzle_expansion_ratio,
        nozzle_exhaust_pressure: stage.nozzle_exit_pressure_pa,
    };

    let aero = AeroConfig {
        body_diameter: aerodynamics.body_diameter_m,
        cn_file_exists: false,
        cn_file_name: String::new(),
        normal_multiplier: aerodynamics.cn_multiplier,
        const_normal_coefficient: aerodynamics.cn_constant,
        ca_file_exists: false,
        ca_file_name: String::new(),
        axial_multiplier: aerodynamics.ca_multiplier,
        const_axial_coefficient: aerodynamics.ca_constant,
        ballistic_coefficient: aerodynamics.ballistic_coefficient,
    };

    let attitude_cfg = AttitudeConfig {
        attitude_file_exists: false,
        attitude_file_name: String::new(),
        const_elevation: attitude.elevation_deg,
        const_azimuth: attitude.azimuth_deg,
        pitch_offset: attitude.pitch_offset_deg,
        yaw_offset: attitude.yaw_offset_deg,
        roll_offset: attitude.roll_offset_deg,
        gyro_bias_x: attitude.gyro_bias_deg_h[0],
        gyro_bias_y: attitude.gyro_bias_deg_h[1],
        gyro_bias_z: attitude.gyro_bias_deg_h[2],
    };

    StageConfig {
        power_flight_mode: stage.power_mode,
        free_flight_mode: stage.free_mode,
        mass_initial: stage.mass_initial_kg,
        thrust,
        aero,
        attitude: attitude_cfg,
        dumping_product: DumpingProductConfig {
            dumping_product_exists: false,
            dumping_product_separation_time: 0.0,
            dumping_product_mass: 0.0,
            dumping_product_ballistic_coefficient: 0.0,
            additional_speed_at_dumping_ned: [0.0, 0.0, 0.0],
        },
        attitude_neutrality: AttitudeNeutralityConfig {
            considering_neutrality: false,
            cg_controller_position_file: String::new(),
            cp_file: String::new(),
        },
        six_dof: SixDofConfig {
            cg_cp_controller_position_file: String::new(),
            moment_of_inertia_file_name: String::new(),
        },
        stage: StageTransitionConfig {
            following_stage_exists: has_following_stage,
            separation_time: if has_following_stage { stage.separation_time_s } else { 1.0e6 },
        },
    }
}
