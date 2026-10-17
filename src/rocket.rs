/// Rocket data structures and configuration
///
/// This module contains rocket configuration structures
/// that are compatible with the existing JSON format.
use crate::physics::atmosphere::AtmosphereKind;
use crate::physics::coordinates::CoordinateTransform;
use nalgebra::{Matrix3, UnitQuaternion, Vector3};
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
        let tx = if (x1 - x0).abs() < 1e-12 {
            0.0
        } else {
            (xv - x0) / (x1 - x0)
        };

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
        let ty = if (y1 - y0).abs() < 1e-12 {
            0.0
        } else {
            (yv - y0) / (y1 - y0)
        };

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
        let d_mach = if (x1 - x0).abs() < 1e-12 {
            0.0
        } else {
            (mach_c - x0) / (x1 - x0)
        };

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
        let d_alpha = if (y1 - y0).abs() < 1e-12 {
            0.0
        } else {
            (alpha_c - y0) / (y1 - y0)
        };

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
            if stages.is_empty()
                && let Some(stage) = helper.stage
            {
                stages.push(stage);
            }
        }

        if stages.is_empty() {
            return Err(serde::de::Error::custom(
                "Rocket config must include at least one stage",
            ));
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

#[derive(Debug, Default, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum IntegratorMethod {
    #[serde(alias = "RK4", alias = "RungeKutta4")]
    #[default]
    Rk4,
    #[serde(alias = "RK45", alias = "DormandPrince")]
    Rk45,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IntegratorSettings {
    #[serde(rename = "method(str)", default)]
    pub method: IntegratorMethod,

    #[serde(
        rename = "rk4 step[s]",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub rk4_step: Option<f64>,

    /// RK45 absolute error tolerance (all state components)
    #[serde(rename = "rk45 absolute tolerance[-]", default = "default_rk45_tol")]
    pub rk45_abs_tol: f64,

    /// RK45 relative error tolerance
    #[serde(rename = "rk45 relative tolerance[-]", default = "default_rk45_tol")]
    pub rk45_rel_tol: f64,
}

fn default_rk45_tol() -> f64 {
    1.0e-9
}

impl Default for IntegratorSettings {
    fn default() -> Self {
        Self {
            method: IntegratorMethod::Rk4,
            rk4_step: None,
            rk45_abs_tol: default_rk45_tol(),
            rk45_rel_tol: default_rk45_tol(),
        }
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

    #[serde(default)]
    pub integrator: IntegratorSettings,

    /// Standard atmosphere: "legacy" (C++-compatible, default) or "ussa1976"
    #[serde(rename = "atmosphere model(str)", default)]
    pub atmosphere_model: AtmosphereKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchCondition {
    #[serde(rename = "position LLH[deg,deg,m]")]
    pub position_llh: [f64; 3],

    #[serde(rename = "velocity NED[m/s]")]
    pub velocity_ned: [f64; 3],

    #[serde(rename = "time(UTC)[y,m,d,h,min,sec]")]
    pub launch_time: [i32; 6],

    /// Launcher rail length [m], along the attitude at t = 0. Starting at
    /// rest, the vehicle is held until the thrust lifts it and then slides
    /// along the rail; 0 means a pad without rail.
    #[serde(rename = "launcher rail length[m]", default)]
    pub rail_length: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StageConfig {
    #[serde(rename = "power flight mode(int)")]
    pub power_flight_mode: i32,

    #[serde(rename = "free flight mode(int)")]
    pub free_flight_mode: i32,

    #[serde(rename = "mass initial[kg]")]
    pub mass_initial: f64,

    /// Mass of the stage without propellant [kg]; the burn ends when the
    /// propellant runs out. Unset: the whole stage mass may be burned.
    #[serde(
        rename = "mass dry[kg]",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub mass_dry: Option<f64>,

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

    #[serde(rename = "const roll[deg]", default)]
    pub const_roll: f64,

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

/// Thrust vector trim that balances the aerodynamic moment (3DoF
/// "neutrality", as in the C++ simulator). Positions are STA [m] (from the
/// nose, aft positive); the offsets move CG, CP and the thrust point.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AttitudeNeutralityConfig {
    #[serde(rename = "considering neutrality?(bool)")]
    pub considering_neutrality: bool,

    /// CSV: time [s], CG STA [m], controller (gimbal) STA [m]
    #[serde(rename = "CG, Controller position file(str)")]
    pub cg_controller_position_file: String,

    /// CSV: CP STA [m] over Mach x angle of attack, laid out as the CN file
    #[serde(rename = "CP file(str)")]
    pub cp_file: String,

    #[serde(rename = "Xcg offset[m]", default)]
    pub xcg_offset: f64,
    #[serde(rename = "Ycg offset[m]", default)]
    pub ycg_offset: f64,
    #[serde(rename = "Zcg offset[m]", default)]
    pub zcg_offset: f64,
    #[serde(rename = "Xcp offset[m]", default)]
    pub xcp_offset: f64,
    #[serde(rename = "Ycp offset[m]", default)]
    pub ycp_offset: f64,
    #[serde(rename = "Zcp offset[m]", default)]
    pub zcp_offset: f64,
    #[serde(rename = "Xt offset[m]", default)]
    pub xt_offset: f64,
    #[serde(rename = "Yt offset[m]", default)]
    pub yt_offset: f64,
    #[serde(rename = "Zt offset[m]", default)]
    pub zt_offset: f64,
}

/// Loaded tables of the thrust trim (see `AttitudeNeutralityConfig`)
#[derive(Debug, Clone)]
pub struct NeutralityData {
    /// CG STA [m] over time [s]
    pub cg: TimeSeriesData,
    /// Controller (thrust point) STA [m] over time [s]
    pub controller: TimeSeriesData,
    /// CP STA [m] over Mach x angle [deg]
    pub cp: SurfaceData2D,
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

    /// Linear interpolation for given time (clamped to the end values)
    pub fn interpolate(&self, t: f64) -> f64 {
        match bracket(&self.time, t) {
            None => 0.0,
            Some((i, a)) => match self.values.get(i + 1) {
                Some(next) => self.values[i] + a * (next - self.values[i]),
                None => self.values[i],
            },
        }
    }
}

/// Interval of an ascending axis that contains `x`: `(i, a)` with
/// `x ≈ axis[i] + a (axis[i+1] - axis[i])`, `a` in [0, 1]. Outside the
/// axis the end point is returned (`a = 0`). `None` for an empty axis.
pub(crate) fn bracket(axis: &[f64], x: f64) -> Option<(usize, f64)> {
    let n = axis.len();
    if n == 0 {
        return None;
    }
    if n == 1 || x <= axis[0] {
        return Some((0, 0.0));
    }
    if x >= axis[n - 1] {
        return Some((n - 1, 0.0));
    }
    // First index with axis[i] > x, so axis[i-1] <= x < axis[i]
    let i = axis.partition_point(|&v| v <= x) - 1;
    let dx = axis[i + 1] - axis[i];
    let a = if dx.abs() < 1e-10 {
        0.0
    } else {
        (x - axis[i]) / dx
    };
    Some((i, a))
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
        self.stages
            .first()
            .expect("RocketConfig must contain at least one stage")
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
    /// Roll program [deg] over time (4th column of the attitude file)
    pub attitude_roll: Option<TimeSeriesData>,
    /// Air density variation [%] over altitude [m] (replaces the uniform
    /// variation ratio, as in C++)
    pub air_density_table: Option<TimeSeriesData>,
    /// Thrust trim tables per stage (when "considering neutrality")
    pub neutrality: Vec<Option<NeutralityData>>,
    pub wind_data: Option<Vec<(f64, f64, f64)>>, // (altitude, speed, direction)
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
            attitude_roll: None,
            air_density_table: None,
            neutrality: vec![None; stage_count],
            wind_data: None,
        }
    }

    pub fn stage_count(&self) -> usize {
        self.stage_configs.len()
    }

    pub fn stage_config(&self, index: usize) -> &StageConfig {
        &self.stage_configs[index]
    }

    /// Vacuum thrust of a stage at stage-relative time [N]
    ///
    /// As in the C++ simulator, the thrust coefficient `k_T` scales the
    /// thrust and compresses the profile in time (the burn lasts `1/k_T` as
    /// long, so the total impulse is unchanged), and the Isp coefficient
    /// `k_I` scales thrust and Isp together (same mass flow, `k_I` times
    /// the impulse).
    pub fn thrust_at(&self, stage_index: usize, time: f64) -> f64 {
        let thrust = &self.stage_configs[stage_index].thrust;
        let scale = thrust.thrust_coefficient * thrust.isp_coefficient;
        let base = match self.thrust_tables.get(stage_index) {
            Some(Some(data)) => data.interpolate(time * thrust.thrust_coefficient),
            _ => thrust.const_thrust_vac,
        };
        base * scale
    }

    /// Legacy helper (stage 0)
    pub fn thrust_at_time(&self, time: f64) -> f64 {
        self.thrust_at(0, time)
    }

    /// Vacuum specific impulse of a stage at stage-relative time [s]
    /// (see `thrust_at` for the coefficients)
    pub fn isp_at(&self, stage_index: usize, time: f64) -> f64 {
        let thrust = &self.stage_configs[stage_index].thrust;
        let base = match self.isp_tables.get(stage_index) {
            Some(Some(data)) => data.interpolate(time * thrust.thrust_coefficient),
            _ => thrust.const_isp_vac,
        };
        base * thrust.isp_coefficient
    }

    pub fn isp_at_time(&self, time: f64) -> f64 {
        self.isp_at(0, time)
    }

    /// Stage-relative end of the burn [s]: the burn start plus the burn
    /// duration divided by the thrust coefficient (as in C++)
    pub fn burn_end_time(&self, stage_index: usize) -> f64 {
        let thrust = &self.stage_configs[stage_index].thrust;
        let k = thrust.thrust_coefficient;
        let duration = thrust.burn_end_time - thrust.burn_start_time;
        if k > 0.0 {
            thrust.burn_start_time + duration / k
        } else {
            thrust.burn_start_time
        }
    }

    /// Propellant the stage may burn [kg]: initial minus dry mass
    /// (the whole stage mass when no dry mass is given)
    pub fn usable_propellant(&self, stage_index: usize) -> f64 {
        let stage = &self.stage_configs[stage_index];
        let dry = stage.mass_dry.unwrap_or(0.0).clamp(0.0, stage.mass_initial);
        stage.mass_initial - dry
    }

    /// Propellant the programmed burn would use [kg] (mass flow integrated
    /// over the burn window, ignoring depletion)
    pub fn propellant_demand(&self, stage_index: usize) -> f64 {
        let thrust = &self.stage_configs[stage_index].thrust;
        let start = thrust.burn_start_time;
        let end = self
            .burn_end_time(stage_index)
            .min(thrust.forced_cutoff_time);
        if end <= start {
            return 0.0;
        }
        let n = 2000;
        let h = (end - start) / n as f64;
        let flow = |t: f64| {
            let isp = self.isp_at(stage_index, t);
            if isp > 0.0 {
                self.thrust_at(stage_index, t).max(0.0) / (isp * crate::math::constants::G0)
            } else {
                0.0
            }
        };
        // Trapezoidal rule
        (0..n)
            .map(|i| 0.5 * h * (flow(start + i as f64 * h) + flow(start + (i + 1) as f64 * h)))
            .sum()
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
        let default_attitude = &self.config.primary_stage().attitude;
        let data = match &self.attitude_data {
            Some(data) if !data.is_empty() => data,
            _ => {
                return (
                    default_attitude.const_azimuth,
                    default_attitude.const_elevation,
                );
            }
        };
        let times: Vec<f64> = data.iter().map(|d| d.0).collect();
        let (i, a) = bracket(&times, time).unwrap_or((0, 0.0));
        let p0 = data[i];
        let p1 = data.get(i + 1).copied().unwrap_or(p0);
        (p0.1 + a * (p1.1 - p0.1), p0.2 + a * (p1.2 - p0.2))
    }

    /// Commanded roll angle at given time [deg]
    pub fn roll_at_time(&self, time: f64) -> f64 {
        match &self.attitude_roll {
            Some(data) if !data.time.is_empty() => data.interpolate(time),
            _ => self.config.primary_stage().attitude.const_roll,
        }
    }

    /// NED to body DCM and the attitude it represents (azimuth, elevation,
    /// roll [deg]) at time `time`.
    ///
    /// As in the C++ simulator, the attitude program defines a navigation
    /// frame; the body is rotated from it by the misalignment offsets
    /// (yaw, pitch, roll) and by the drift of the gyro bias since t = 0.
    pub fn attitude_dcm(&self, time: f64) -> (Matrix3<f64>, Vector3<f64>) {
        use crate::math::deg2rad;
        let (az, el) = self.attitude_at_time(time);
        let roll = self.roll_at_time(time);
        let navi =
            CoordinateTransform::dcm_ned_to_body(deg2rad(az), deg2rad(el), Some(deg2rad(roll)));
        let att = &self.config.primary_stage().attitude;
        let bias = Vector3::new(att.gyro_bias_x, att.gyro_bias_y, att.gyro_bias_z)
            .map(|b| deg2rad(b) / 3600.0);
        if att.yaw_offset == 0.0
            && att.pitch_offset == 0.0
            && att.roll_offset == 0.0
            && bias == Vector3::zeros()
        {
            return (navi, Vector3::new(az, el, roll));
        }
        let offset = UnitQuaternion::from_axis_angle(&Vector3::z_axis(), deg2rad(att.yaw_offset))
            * UnitQuaternion::from_axis_angle(&Vector3::y_axis(), deg2rad(att.pitch_offset))
            * UnitQuaternion::from_axis_angle(&Vector3::x_axis(), deg2rad(att.roll_offset));
        let drift = UnitQuaternion::from_scaled_axis(bias * time);
        let dcm = (offset * drift).to_rotation_matrix().into_inner() * navi;
        (
            dcm,
            CoordinateTransform::azimuth_elevation_roll(&dcm).map(f64::to_degrees),
        )
    }

    /// Interpolated wind speed/direction at altitude [m]
    ///
    /// The profile is interpolated in north/east components (as in C++),
    /// so directions across north (350 deg -> 10 deg) blend correctly.
    pub fn wind_at_altitude(&self, altitude: f64) -> (f64, f64) {
        let data = match &self.wind_data {
            Some(data) if !data.is_empty() => data,
            _ => {
                let wind = self.config.wind.const_wind;
                return (wind[0], wind[1]);
            }
        };
        let altitudes: Vec<f64> = data.iter().map(|d| d.0).collect();
        let (i, a) = bracket(&altitudes, altitude).unwrap_or((0, 0.0));
        let p0 = data[i];
        let p1 = data.get(i + 1).copied().unwrap_or(p0);
        if a == 0.0 {
            return (p0.1, p0.2);
        }
        // Components of the velocity the wind blows toward
        let uv = |speed: f64, dir: f64| {
            let d = dir.to_radians();
            (-speed * d.sin(), -speed * d.cos())
        };
        let (u0, v0) = uv(p0.1, p0.2);
        let (u1, v1) = uv(p1.1, p1.2);
        let (u, v) = (u0 + a * (u1 - u0), v0 + a * (v1 - v0));
        let speed = u.hypot(v);
        if speed < 1e-12 {
            return (0.0, p0.2);
        }
        (speed, (u.atan2(v).to_degrees() + 180.0).rem_euclid(360.0))
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
    /// Density variation over altitude; replaces `air_density_percent`
    #[serde(default)]
    pub air_density_profile: Vec<ClientDensitySample>,
    #[serde(default)]
    pub atmosphere_model: AtmosphereKind,
    #[serde(default)]
    pub integrator: ClientIntegrator,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ClientDensitySample {
    pub altitude_m: f64,
    pub percent: f64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClientIntegrator {
    #[serde(default)]
    pub method: IntegratorMethod,
    #[serde(default)]
    pub rk4_step_s: Option<f64>,
    #[serde(default = "default_rk45_tol")]
    pub rk45_abs_tol: f64,
    #[serde(default = "default_rk45_tol")]
    pub rk45_rel_tol: f64,
}

impl Default for ClientIntegrator {
    fn default() -> Self {
        Self {
            method: IntegratorMethod::Rk4,
            rk4_step_s: None,
            rk45_abs_tol: default_rk45_tol(),
            rk45_rel_tol: default_rk45_tol(),
        }
    }
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
    /// Launcher rail length [m] (0: pad without rail)
    #[serde(default)]
    pub rail_length_m: f64,
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
    /// Mass without propellant [kg]; unset: the whole stage may be burned
    #[serde(default)]
    pub mass_dry_kg: Option<f64>,
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
    /// Per-stage aerodynamic values; unset fields use `ClientAerodynamics`.
    /// (Mach tables stay vehicle-wide, as in the CLI where they come from stage 1.)
    #[serde(default)]
    pub aero: Option<ClientStageAero>,
    /// Product jettisoned while this stage flies (fairing, etc.)
    #[serde(default)]
    pub dumping_product: Option<ClientDumpingProduct>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClientDumpingProduct {
    /// Release time, relative to the stage start [s]
    pub separation_time_s: f64,
    pub mass_kg: f64,
    #[serde(default = "default_ballistic_coefficient")]
    pub ballistic_coefficient: f64,
    /// Velocity added at release, NED [m/s]
    #[serde(default = "default_velocity_ned")]
    pub additional_velocity_ned_mps: [f64; 3],
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ClientStageAero {
    #[serde(default)]
    pub body_diameter_m: Option<f64>,
    #[serde(default)]
    pub cn_constant: Option<f64>,
    #[serde(default)]
    pub cn_multiplier: Option<f64>,
    #[serde(default)]
    pub ca_constant: Option<f64>,
    #[serde(default)]
    pub ca_multiplier: Option<f64>,
    #[serde(default)]
    pub ballistic_coefficient: Option<f64>,
}

impl Default for ClientStage {
    fn default() -> Self {
        Self {
            power_mode: default_power_mode(),
            free_mode: default_free_mode(),
            mass_initial_kg: default_stage_mass(),
            mass_dry_kg: None,
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
            aero: None,
            dumping_product: None,
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
    pub roll_deg: f64,
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
    #[serde(default)]
    pub roll_deg: Option<f64>,
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
        let ClientConfig {
            name,
            simulation,
            launch,
            stages,
            stage,
            aerodynamics,
            attitude,
            wind,
        } = self;

        let integrator = IntegratorSettings {
            method: simulation.integrator.method,
            rk4_step: simulation.integrator.rk4_step_s,
            rk45_abs_tol: simulation.integrator.rk45_abs_tol,
            rk45_rel_tol: simulation.integrator.rk45_rel_tol,
        };

        let calc = CalculateCondition {
            end_time: simulation.duration_s,
            time_step: simulation.output_step_s,
            air_density_file_exists: false,
            air_density_file: String::new(),
            air_density_variation: simulation.air_density_percent,
            integrator,
            atmosphere_model: simulation.atmosphere_model,
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
            rail_length: launch.rail_length_m,
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
                build_stage_config(
                    client_stage,
                    &aerodynamics,
                    &attitude,
                    idx + 1 < total_stages,
                )
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
        if !simulation.air_density_profile.is_empty() {
            rocket.air_density_table = Some(TimeSeriesData::from_pairs(
                simulation
                    .air_density_profile
                    .iter()
                    .map(|p| (p.altitude_m, p.percent)),
            ));
        }

        for (idx, client_stage) in stage_sources.into_iter().enumerate() {
            if !client_stage.thrust_profile.is_empty() {
                rocket.thrust_tables[idx] = Some(TimeSeriesData::from_pairs(
                    client_stage
                        .thrust_profile
                        .into_iter()
                        .map(|p| (p.time, p.value)),
                ));
            }

            if !client_stage.isp_profile.is_empty() {
                rocket.isp_tables[idx] = Some(TimeSeriesData::from_pairs(
                    client_stage
                        .isp_profile
                        .into_iter()
                        .map(|p| (p.time, p.value)),
                ));
            }
        }

        if !aerodynamics.cn_profile.is_empty() {
            rocket.cn_data = Some(TimeSeriesData::from_pairs(
                aerodynamics
                    .cn_profile
                    .into_iter()
                    .map(|p| (p.mach, p.value)),
            ));
        }

        if !aerodynamics.ca_profile.is_empty() {
            rocket.ca_data = Some(TimeSeriesData::from_pairs(
                aerodynamics
                    .ca_profile
                    .into_iter()
                    .map(|p| (p.mach, p.value)),
            ));
        }

        if !attitude.profile.is_empty() && attitude.profile.iter().all(|p| p.roll_deg.is_some()) {
            rocket.attitude_roll = Some(TimeSeriesData::from_pairs(
                attitude
                    .profile
                    .iter()
                    .map(|p| (p.time, p.roll_deg.unwrap_or(0.0))),
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

    let own = stage.aero.clone().unwrap_or_default();
    let aero = AeroConfig {
        body_diameter: own.body_diameter_m.unwrap_or(aerodynamics.body_diameter_m),
        cn_file_exists: false,
        cn_file_name: String::new(),
        normal_multiplier: own.cn_multiplier.unwrap_or(aerodynamics.cn_multiplier),
        const_normal_coefficient: own.cn_constant.unwrap_or(aerodynamics.cn_constant),
        ca_file_exists: false,
        ca_file_name: String::new(),
        axial_multiplier: own.ca_multiplier.unwrap_or(aerodynamics.ca_multiplier),
        const_axial_coefficient: own.ca_constant.unwrap_or(aerodynamics.ca_constant),
        ballistic_coefficient: own
            .ballistic_coefficient
            .unwrap_or(aerodynamics.ballistic_coefficient),
    };

    let attitude_cfg = AttitudeConfig {
        attitude_file_exists: false,
        attitude_file_name: String::new(),
        const_elevation: attitude.elevation_deg,
        const_azimuth: attitude.azimuth_deg,
        const_roll: attitude.roll_deg,
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
        mass_dry: stage.mass_dry_kg,
        thrust,
        aero,
        attitude: attitude_cfg,
        dumping_product: match &stage.dumping_product {
            Some(dump) => DumpingProductConfig {
                dumping_product_exists: true,
                dumping_product_separation_time: dump.separation_time_s,
                dumping_product_mass: dump.mass_kg,
                dumping_product_ballistic_coefficient: dump.ballistic_coefficient,
                additional_speed_at_dumping_ned: dump.additional_velocity_ned_mps,
            },
            None => DumpingProductConfig {
                dumping_product_exists: false,
                dumping_product_separation_time: 0.0,
                dumping_product_mass: 0.0,
                dumping_product_ballistic_coefficient: 0.0,
                additional_speed_at_dumping_ned: [0.0, 0.0, 0.0],
            },
        },
        attitude_neutrality: AttitudeNeutralityConfig::default(),
        six_dof: SixDofConfig {
            cg_cp_controller_position_file: String::new(),
            moment_of_inertia_file_name: String::new(),
        },
        stage: StageTransitionConfig {
            following_stage_exists: has_following_stage,
            separation_time: if has_following_stage {
                stage.separation_time_s
            } else {
                1.0e6
            },
        },
    }
}

#[cfg(test)]
mod client_stage_aero_tests {
    use super::*;

    #[test]
    fn per_stage_aero_overrides_vehicle_values() {
        let json = r#"{
            "name": "aero",
            "simulation": { "duration_s": 10, "output_step_s": 1 },
            "launch": {
                "latitude_deg": 31.25, "longitude_deg": 131.08, "altitude_m": 0,
                "velocity_ned_mps": [0, 0, 0],
                "datetime_utc": { "year": 2020, "month": 1, "day": 1, "hour": 0, "minute": 0, "second": 0 }
            },
            "stages": [
                { "mass_initial_kg": 1000, "separation_time_s": 5 },
                { "mass_initial_kg": 100, "aero": { "body_diameter_m": 0.1, "ca_constant": 0.3 } }
            ],
            "aerodynamics": { "body_diameter_m": 0.52, "ca_constant": 0.5, "ballistic_coefficient": 120 }
        }"#;
        let config: ClientConfig = serde_json::from_str(json).unwrap();
        let rocket = config.into_rocket();

        let s1 = &rocket.stage_config(0).aero;
        assert_eq!(s1.body_diameter, 0.52);
        assert_eq!(s1.const_axial_coefficient, 0.5);

        let s2 = &rocket.stage_config(1).aero;
        assert_eq!(s2.body_diameter, 0.1);
        assert_eq!(s2.const_axial_coefficient, 0.3);
        // Unset fields fall back to the vehicle-wide value
        assert_eq!(s2.ballistic_coefficient, 120.0);
    }

    #[test]
    fn dumping_product_maps_to_stage_config() {
        let json = r#"{
            "name": "dump",
            "simulation": { "duration_s": 10, "output_step_s": 1 },
            "launch": {
                "latitude_deg": 31.25, "longitude_deg": 131.08,
                "datetime_utc": { "year": 2020, "month": 1, "day": 1, "hour": 0, "minute": 0, "second": 0 }
            },
            "stages": [
                { "mass_initial_kg": 1000,
                  "dumping_product": { "separation_time_s": 40, "mass_kg": 15, "ballistic_coefficient": 30,
                                       "additional_velocity_ned_mps": [0, 2, -1] } },
                { "mass_initial_kg": 100 }
            ]
        }"#;
        let rocket = serde_json::from_str::<ClientConfig>(json)
            .unwrap()
            .into_rocket();
        let dump = &rocket.stage_config(0).dumping_product;
        assert!(dump.dumping_product_exists);
        assert_eq!(dump.dumping_product_separation_time, 40.0);
        assert_eq!(dump.dumping_product_mass, 15.0);
        assert_eq!(dump.dumping_product_ballistic_coefficient, 30.0);
        assert_eq!(dump.additional_speed_at_dumping_ned, [0.0, 2.0, -1.0]);
        assert!(
            !rocket
                .stage_config(1)
                .dumping_product
                .dumping_product_exists
        );
    }
}

#[cfg(test)]
mod profile_tests {
    use super::*;

    fn rocket() -> Rocket {
        let json = r#"{
            "name": "p",
            "simulation": { "duration_s": 10, "output_step_s": 1 },
            "launch": {
                "latitude_deg": 31.25, "longitude_deg": 131.08,
                "datetime_utc": { "year": 2020, "month": 1, "day": 1, "hour": 0, "minute": 0, "second": 0 }
            },
            "stages": [{ "mass_initial_kg": 100 }],
            "attitude": { "elevation_deg": 80, "azimuth_deg": 90 }
        }"#;
        serde_json::from_str::<ClientConfig>(json)
            .unwrap()
            .into_rocket()
    }

    #[test]
    fn wind_direction_interpolates_across_north() {
        let mut rocket = rocket();
        rocket.wind_data = Some(vec![(0.0, 10.0, 350.0), (1000.0, 10.0, 10.0)]);
        let (speed, dir) = rocket.wind_at_altitude(500.0);
        // Halfway between 350 and 10 deg is north, not south
        assert!(dir < 1e-9 || dir > 360.0 - 1e-9, "direction {dir}");
        assert!((speed - 10.0 * 10f64.to_radians().cos()).abs() < 1e-9);
        assert_eq!(rocket.wind_at_altitude(0.0), (10.0, 350.0));
        assert_eq!(rocket.wind_at_altitude(2000.0), (10.0, 10.0));
    }

    #[test]
    fn attitude_offsets_rotate_the_body() {
        let mut rocket = rocket();
        let (dcm, att) = rocket.attitude_dcm(5.0);
        assert_eq!(att, Vector3::new(90.0, 80.0, 0.0));
        let program =
            CoordinateTransform::dcm_ned_to_body(90f64.to_radians(), 80f64.to_radians(), None);
        assert!((dcm - program).abs().max() < 1e-12);

        // Pitch misalignment of 2 deg tilts the body axis by 2 deg
        let attitude = &mut rocket.stage_configs[0].attitude;
        attitude.pitch_offset = 2.0;
        rocket.config.stages[0].attitude.pitch_offset = 2.0;
        let (dcm, att) = rocket.attitude_dcm(5.0);
        let axis = dcm.transpose() * Vector3::x();
        let axis0 = program.transpose() * Vector3::x();
        assert!((axis.angle(&axis0).to_degrees() - 2.0).abs() < 1e-9);
        // C++ convention: the offset rotates the navigation frame about the
        // body Y axis, so a positive pitch offset lowers the nose
        assert!((att.y - 78.0).abs() < 1e-9, "elevation {}", att.y);

        // Gyro bias: drift angle grows linearly with time
        rocket.config.stages[0].attitude.pitch_offset = 0.0;
        rocket.config.stages[0].attitude.gyro_bias_y = 3600.0; // 1 deg/s
        let (dcm, _) = rocket.attitude_dcm(3.0);
        let axis = dcm.transpose() * Vector3::x();
        assert!((axis.angle(&axis0).to_degrees() - 3.0).abs() < 1e-9);
    }
}
