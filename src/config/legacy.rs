//! Conversion of the C++ simulator's parameter files (`param_*.json`)
//!
//! The legacy format names keys with their units (`"burn end time(time of
//! each stage)[s]"`), switches tables on with `... file exist?(bool)` flags
//! and reads the aerodynamic and attitude tables of every stage from the
//! first stage. The conversion reproduces the C++ behaviour in the new
//! format: tables are read and inlined, thrust/Isp coefficients and
//! multipliers are baked into the values, the forced cutoff shortens the
//! burn, and the thrust trim's launch-relative times become stage-relative.

use super::table::{Table, TableSource, parse_csv, parse_surface};
use super::{
    Aero, Atmosphere, Attitude, Config, Curve, Engine, FreeFlight, Integrator, Jettison, Launch,
    Simulation, Stage, Surface, ThrustTrim, UtcTime, Wind,
};
use crate::physics::atmosphere::AtmosphereKind;
use serde::Deserialize;
use serde_json::Value;

/// Result of converting a legacy parameter file
#[derive(Debug, Clone)]
pub struct LegacyConversion {
    pub config: Config,
    /// Settings that could not be carried over (missing files, unsupported modes)
    pub warnings: Vec<String>,
}

/// Convert a legacy parameter file; `source` reads the CSV tables it names
pub fn convert_legacy(text: &str, source: &dyn TableSource) -> Result<LegacyConversion, String> {
    let value: Value = serde_json::from_str(text).map_err(|e| format!("JSON: {e}"))?;
    let file: LegacyFile =
        serde_json::from_value(value).map_err(|e| format!("legacy parameter file: {e}"))?;
    let mut c = Converter {
        source,
        warnings: Vec::new(),
    };
    let config = c.convert(file)?;
    Ok(LegacyConversion {
        config,
        warnings: c.warnings,
    })
}

/// Whether a JSON document looks like a legacy parameter file
pub fn is_legacy(value: &Value) -> bool {
    value.get("name(str)").is_some() || value.get("calculate condition").is_some()
}

struct Converter<'a> {
    source: &'a dyn TableSource,
    warnings: Vec<String>,
}

impl Converter<'_> {
    /// Numeric rows of a CSV table with at least `cols` columns, or `None`
    /// (with a warning) when it is switched off or cannot be read
    fn rows(&mut self, enabled: bool, name: &str, cols: usize) -> Option<Vec<Vec<f64>>> {
        let name = name.trim();
        if !enabled || name.is_empty() {
            return None;
        }
        match self
            .source
            .read(name)
            .and_then(|text| parse_csv(&text, cols))
        {
            Ok(rows) if !rows.is_empty() => Some(rows),
            Ok(_) => {
                self.warnings.push(format!(
                    "{name}: no numeric rows; the constant value is used"
                ));
                None
            }
            Err(e) => {
                self.warnings
                    .push(format!("{e}; the constant value is used"));
                None
            }
        }
    }

    fn surface(&mut self, enabled: bool, name: &str, scale: f64) -> Option<Surface> {
        let name = name.trim();
        if !enabled || name.is_empty() {
            return None;
        }
        match self.source.read(name).and_then(|text| parse_surface(&text)) {
            Ok((mach, alpha_deg, values)) => Some(Surface::Grid {
                mach,
                alpha_deg,
                values: values
                    .into_iter()
                    .map(|row| row.into_iter().map(|v| v * scale).collect())
                    .collect(),
            }),
            Err(e) => {
                self.warnings.push(format!("{name}: {e}; ignored"));
                None
            }
        }
    }

    fn convert(&mut self, file: LegacyFile) -> Result<Config, String> {
        let LegacyFile {
            name,
            calc,
            launch,
            stages,
            stage1,
            stage2,
            stage3,
            stage,
            wind,
        } = file;
        let mut stages = if stages.is_empty() {
            [stage1, stage2, stage3].into_iter().flatten().collect()
        } else {
            stages
        };
        if stages.is_empty() {
            stages.extend(stage);
        }
        if stages.is_empty() {
            return Err("the parameter file has no stage".to_string());
        }
        // A stage without a following stage ends the vehicle
        if let Some(k) = stages
            .iter()
            .position(|s| !s.transition.following_stage_exists)
            && k + 1 < stages.len()
        {
            self.warnings.push(format!(
                "stage{} has no following stage; the stages after it are dropped",
                k + 1
            ));
            stages.truncate(k + 1);
        }

        let primary = stages[0].clone();
        let mut start = 0.0;
        let count = stages.len();
        let mut out = Vec::with_capacity(count);
        for (i, s) in stages.iter().enumerate() {
            out.push(self.stage(s, &primary, i, i + 1 == count, start));
            start += s.transition.separation_time;
        }

        let density_deviation = self
            .rows(calc.air_density_file_exists, &calc.air_density_file, 2)
            .map(|rows| Table::Rows(rows.iter().map(|r| [r[0], r[1]]).collect()));
        let wind_profile = self
            .rows(wind.wind_file_exists, &wind.wind_file_name, 3)
            .map(|rows| Table::Rows(rows.iter().map(|r| [r[0], r[1], r[2]]).collect()));

        let [year, month, day, hour, minute, second] = launch.time;
        let time_utc = UtcTime {
            year,
            month: month as u32,
            day: day as u32,
            hour: hour as u32,
            minute: minute as u32,
            second: second as f64,
        };
        let integrator = match calc.integrator.method.to_ascii_lowercase().as_str() {
            "rk45" | "dormandprince" => Integrator::Rk45 {
                abs_tol: calc.integrator.rk45_abs_tol,
                rel_tol: calc.integrator.rk45_rel_tol,
            },
            _ => Integrator::Rk4 {
                step_s: calc.integrator.rk4_step,
            },
        };

        Ok(Config {
            schema: None,
            name,
            simulation: Simulation {
                end_time_s: calc.end_time,
                output_step_s: calc.time_step,
                integrator,
            },
            launch: Launch {
                latitude_deg: launch.position_llh[0],
                longitude_deg: launch.position_llh[1],
                altitude_m: launch.position_llh[2],
                time_utc,
                velocity_ned_mps: launch.velocity_ned,
                rail_length_m: launch.rail_length,
            },
            atmosphere: Atmosphere {
                model: calc.atmosphere_model,
                seasonal_variation_percent: if density_deviation.is_some() {
                    0.0
                } else {
                    calc.air_density_variation
                },
                density_deviation,
            },
            wind: match wind_profile {
                Some(profile) => Wind {
                    speed_mps: 0.0,
                    direction_deg: 0.0,
                    profile: Some(profile),
                },
                None => Wind {
                    speed_mps: wind.const_wind[0],
                    direction_deg: wind.const_wind[1],
                    profile: None,
                },
            },
            attitude: self.attitude(&primary.attitude),
            stages: out,
        })
    }

    fn attitude(&mut self, a: &LegacyAttitude) -> Attitude {
        let program = self.rows(a.attitude_file_exists, &a.attitude_file_name, 3);
        let column = |rows: &[Vec<f64>], k: usize| {
            Curve::Table(Table::Rows(rows.iter().map(|r| [r[0], r[k]]).collect()))
        };
        let (azimuth_deg, elevation_deg, roll_deg) = match program {
            Some(rows) => (
                column(&rows, 1),
                column(&rows, 2),
                if rows.iter().all(|r| r.len() >= 4) {
                    column(&rows, 3)
                } else {
                    Curve::Constant(a.const_roll)
                },
            ),
            None => (
                Curve::Constant(a.const_azimuth),
                Curve::Constant(a.const_elevation),
                Curve::Constant(a.const_roll),
            ),
        };
        Attitude {
            azimuth_deg,
            elevation_deg,
            roll_deg,
            yaw_offset_deg: a.yaw_offset,
            pitch_offset_deg: a.pitch_offset,
            roll_offset_deg: a.roll_offset,
            gyro_bias_deg_h: [a.gyro_bias_x, a.gyro_bias_y, a.gyro_bias_z],
        }
    }

    fn stage(
        &mut self,
        s: &LegacyStage,
        primary: &LegacyStage,
        index: usize,
        last: bool,
        start: f64,
    ) -> Stage {
        let n = index + 1;
        if s.power_flight_mode != 0 {
            self.warnings.push(format!(
                "stage{n}: power flight mode {} is not supported; flown as 3DoF",
                s.power_flight_mode
            ));
        }
        if !s.six_dof.cg_cp_controller_position_file.is_empty()
            || !s.six_dof.moment_of_inertia_file_name.is_empty()
        {
            self.warnings
                .push(format!("stage{n}: 6DoF files are not supported; ignored"));
        }

        // Thrust coefficient k_t: thrust x k_t over 1/k_t the time; Isp
        // coefficient k_i: thrust and Isp x k_i
        let t = &s.thrust;
        let (kt, ki) = (t.thrust_coefficient, t.isp_coefficient);
        let compress = |rows: Vec<Vec<f64>>, scale: f64| {
            Curve::Table(Table::Rows(
                rows.iter()
                    .map(|r| [if kt > 0.0 { r[0] / kt } else { r[0] }, r[1] * scale])
                    .collect(),
            ))
        };
        let thrust_vac_n = match self.rows(t.thrust_file_exists, &t.thrust_file_name, 2) {
            Some(rows) => compress(rows, kt * ki),
            None => Curve::Constant(t.const_thrust_vac * kt * ki),
        };
        let isp_vac_s = match self.rows(t.isp_file_exists, &t.isp_file_name, 2) {
            Some(rows) => compress(rows, ki),
            None => Curve::Constant(t.const_isp_vac * ki),
        };
        let duration = t.burn_end_time - t.burn_start_time;
        let burn_end = if kt > 0.0 {
            t.burn_start_time + duration / kt
        } else {
            t.burn_start_time
        };
        let burn_end_s = burn_end.min(t.forced_cutoff_time);
        let engine = (burn_end_s > t.burn_start_time).then(|| Engine {
            thrust_vac_n,
            isp_vac_s,
            burn_start_s: t.burn_start_time,
            burn_end_s,
            nozzle_exit_area_m2: std::f64::consts::PI / 4.0
                * t.throat_diameter.powi(2)
                * t.nozzle_expansion_ratio,
        });

        // Mach tables come from stage 1, constants and multipliers from this stage
        let (pa, a) = (&primary.aero, &s.aero);
        let scaled = |rows: Vec<Vec<f64>>, k: f64| {
            Curve::Table(Table::Rows(rows.iter().map(|r| [r[0], r[1] * k]).collect()))
        };
        let ca = match self.rows(pa.ca_file_exists, &pa.ca_file_name, 2) {
            Some(rows) => scaled(rows, a.axial_multiplier),
            None => Curve::Constant(a.const_axial_coefficient),
        };
        let ca_power_off = match self.rows(true, &pa.ca_power_off_file_name, 2) {
            Some(rows) => Some(scaled(rows, a.axial_multiplier)),
            None => a.const_axial_coefficient_power_off.map(Curve::Constant),
        };
        let cn_rows = self.rows(pa.cn_file_exists, &pa.cn_file_name, 2);
        let (cn_alpha_per_rad, cn_table) = match cn_rows {
            Some(rows) if rows.iter().any(|r| r.len() > 2) => (
                Curve::Constant(0.0),
                self.surface(true, &pa.cn_file_name, a.normal_multiplier),
            ),
            Some(rows) => (scaled(rows, a.normal_multiplier), None),
            None => (Curve::Constant(a.const_normal_coefficient), None),
        };

        let d = &s.dumping;
        let jettisons = if d.exists {
            vec![Jettison {
                name: String::new(),
                time_s: d.separation_time,
                mass_kg: d.mass,
                ballistic_coefficient_kg_m2: d.ballistic_coefficient,
                delta_v_ned_mps: d.additional_speed_ned,
            }]
        } else {
            Vec::new()
        };

        let tn = &s.neutrality;
        let thrust_trim = if tn.considering_neutrality {
            let cg = self.rows(true, &tn.cg_controller_position_file, 3);
            let cp = self.surface(true, &tn.cp_file, 1.0);
            match (cg, cp) {
                (Some(rows), Some(cp_sta_m)) => {
                    // Launch-relative times in the C++ file
                    let column = |k: usize| {
                        Curve::Table(Table::Rows(
                            rows.iter().map(|r| [r[0] - start, r[k]]).collect(),
                        ))
                    };
                    Some(ThrustTrim {
                        cg_sta_m: column(1),
                        gimbal_sta_m: column(2),
                        cp_sta_m,
                        cg_offset_m: [tn.xcg_offset, tn.ycg_offset, tn.zcg_offset],
                        cp_offset_m: [tn.xcp_offset, tn.ycp_offset, tn.zcp_offset],
                        gimbal_offset_m: [tn.xt_offset, tn.yt_offset, tn.zt_offset],
                    })
                }
                _ => {
                    self.warnings.push(format!(
                        "stage{n}: thrust trim (neutrality) files missing; trim ignored"
                    ));
                    None
                }
            }
        } else {
            None
        };

        Stage {
            mass_initial_kg: s.mass_initial,
            mass_dry_kg: s.mass_dry,
            engine,
            aero: Aero {
                diameter_m: a.body_diameter,
                ca,
                ca_power_off,
                cn_alpha_per_rad,
                cn_table,
                ballistic_coefficient_kg_m2: a.ballistic_coefficient,
            },
            free_flight: match s.free_flight_mode {
                0 => FreeFlight::AeroStable,
                2 => FreeFlight::Ballistic,
                _ => FreeFlight::AttitudeProgram,
            },
            separation_time_s: (!last).then_some(s.transition.separation_time),
            jettisons,
            thrust_trim,
        }
    }
}

// ---------------------------------------------------------------------------
// The legacy format (keys as written by the C++ simulator's tools)
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct LegacyFile {
    #[serde(rename = "name(str)")]
    name: String,
    #[serde(rename = "calculate condition")]
    calc: LegacyCalc,
    launch: LegacyLaunch,
    #[serde(default)]
    stages: Vec<LegacyStage>,
    stage1: Option<LegacyStage>,
    stage2: Option<LegacyStage>,
    stage3: Option<LegacyStage>,
    stage: Option<LegacyStage>,
    #[serde(default)]
    wind: LegacyWind,
}

#[derive(Deserialize)]
struct LegacyCalc {
    #[serde(rename = "end time[s]")]
    end_time: f64,
    #[serde(rename = "time step for output[s]")]
    time_step: f64,
    #[serde(rename = "air density variation file exist?(bool)", default)]
    air_density_file_exists: bool,
    #[serde(rename = "air density variation file name(str)", default)]
    air_density_file: String,
    #[serde(
        rename = "variation ratio of air density[%](-100to100, default=0)",
        default
    )]
    air_density_variation: f64,
    #[serde(default)]
    integrator: LegacyIntegrator,
    #[serde(rename = "atmosphere model(str)", default = "legacy_atmosphere")]
    atmosphere_model: AtmosphereKind,
}

fn legacy_atmosphere() -> AtmosphereKind {
    AtmosphereKind::Legacy
}

#[derive(Deserialize)]
#[serde(default)]
struct LegacyIntegrator {
    #[serde(rename = "method(str)")]
    method: String,
    #[serde(rename = "rk4 step[s]")]
    rk4_step: Option<f64>,
    #[serde(rename = "rk45 absolute tolerance[-]")]
    rk45_abs_tol: f64,
    #[serde(rename = "rk45 relative tolerance[-]")]
    rk45_rel_tol: f64,
}

impl Default for LegacyIntegrator {
    fn default() -> Self {
        Self {
            method: "rk4".to_string(),
            rk4_step: None,
            rk45_abs_tol: 1e-9,
            rk45_rel_tol: 1e-9,
        }
    }
}

#[derive(Deserialize)]
struct LegacyLaunch {
    #[serde(rename = "position LLH[deg,deg,m]")]
    position_llh: [f64; 3],
    #[serde(rename = "velocity NED[m/s]", default)]
    velocity_ned: [f64; 3],
    #[serde(rename = "time(UTC)[y,m,d,h,min,sec]", default = "default_time")]
    time: [i32; 6],
    #[serde(rename = "launcher rail length[m]", default)]
    rail_length: f64,
}

fn default_time() -> [i32; 6] {
    [2000, 1, 1, 0, 0, 0]
}

#[derive(Deserialize, Clone)]
struct LegacyStage {
    #[serde(rename = "power flight mode(int)", default)]
    power_flight_mode: i32,
    #[serde(rename = "free flight mode(int)", default = "two")]
    free_flight_mode: i32,
    #[serde(rename = "mass initial[kg]")]
    mass_initial: f64,
    #[serde(rename = "mass dry[kg]", default)]
    mass_dry: Option<f64>,
    #[serde(default)]
    thrust: LegacyThrust,
    #[serde(default)]
    aero: LegacyAero,
    #[serde(default)]
    attitude: LegacyAttitude,
    #[serde(rename = "dumping product", default)]
    dumping: LegacyDumping,
    #[serde(rename = "attitude neutrality(3DoF)", default)]
    neutrality: LegacyNeutrality,
    #[serde(rename = "6DoF", default)]
    six_dof: LegacySixDof,
    #[serde(rename = "stage", default)]
    transition: LegacyTransition,
}

fn two() -> i32 {
    2
}

#[derive(Deserialize, Clone)]
#[serde(default)]
struct LegacyThrust {
    #[serde(rename = "Isp vac file exist?(bool)")]
    isp_file_exists: bool,
    #[serde(rename = "Isp vac file name(str)")]
    isp_file_name: String,
    #[serde(rename = "Isp coefficient[-]")]
    isp_coefficient: f64,
    #[serde(rename = "const Isp vac[s]")]
    const_isp_vac: f64,
    #[serde(rename = "thrust vac file exist?(bool)")]
    thrust_file_exists: bool,
    #[serde(rename = "thrust vac file name(str)")]
    thrust_file_name: String,
    #[serde(rename = "thrust coefficient[-]")]
    thrust_coefficient: f64,
    #[serde(rename = "const thrust vac[N]")]
    const_thrust_vac: f64,
    #[serde(rename = "burn start time(time of each stage)[s]")]
    burn_start_time: f64,
    #[serde(rename = "burn end time(time of each stage)[s]")]
    burn_end_time: f64,
    #[serde(rename = "forced cutoff time(time of each stage)[s]")]
    forced_cutoff_time: f64,
    #[serde(rename = "throat diameter[m]")]
    throat_diameter: f64,
    #[serde(rename = "nozzle expansion ratio[-]")]
    nozzle_expansion_ratio: f64,
    #[serde(rename = "nozzle exhaust pressure[Pa]")]
    _nozzle_exhaust_pressure: f64,
}

impl Default for LegacyThrust {
    fn default() -> Self {
        Self {
            isp_file_exists: false,
            isp_file_name: String::new(),
            isp_coefficient: 1.0,
            const_isp_vac: 200.0,
            thrust_file_exists: false,
            thrust_file_name: String::new(),
            thrust_coefficient: 1.0,
            const_thrust_vac: 0.0,
            burn_start_time: 0.0,
            burn_end_time: 0.0,
            forced_cutoff_time: 1.0e9,
            throat_diameter: 0.0,
            nozzle_expansion_ratio: 1.0,
            _nozzle_exhaust_pressure: 0.0,
        }
    }
}

#[derive(Deserialize, Clone)]
#[serde(default)]
struct LegacyAero {
    #[serde(rename = "body diameter[m]")]
    body_diameter: f64,
    #[serde(rename = "normal coefficient file exist?(bool)")]
    cn_file_exists: bool,
    #[serde(rename = "normal coefficient file name(str)")]
    cn_file_name: String,
    #[serde(rename = "normal multiplier[-]")]
    normal_multiplier: f64,
    #[serde(rename = "const normal coefficient[-]")]
    const_normal_coefficient: f64,
    #[serde(rename = "axial coefficient file exist?(bool)")]
    ca_file_exists: bool,
    #[serde(rename = "axial coefficient file name(str)")]
    ca_file_name: String,
    #[serde(rename = "axial multiplier[-]")]
    axial_multiplier: f64,
    #[serde(rename = "const axial coefficient[-]")]
    const_axial_coefficient: f64,
    #[serde(rename = "const axial coefficient power off[-]")]
    const_axial_coefficient_power_off: Option<f64>,
    #[serde(rename = "axial coefficient power off file name(str)")]
    ca_power_off_file_name: String,
    #[serde(rename = "ballistic coefficient(ballistic flight mode)[kg/m2]")]
    ballistic_coefficient: f64,
}

impl Default for LegacyAero {
    fn default() -> Self {
        Self {
            body_diameter: 0.5,
            cn_file_exists: false,
            cn_file_name: String::new(),
            normal_multiplier: 1.0,
            const_normal_coefficient: 0.0,
            ca_file_exists: false,
            ca_file_name: String::new(),
            axial_multiplier: 1.0,
            const_axial_coefficient: 0.0,
            const_axial_coefficient_power_off: None,
            ca_power_off_file_name: String::new(),
            ballistic_coefficient: 100.0,
        }
    }
}

#[derive(Deserialize, Clone)]
#[serde(default)]
struct LegacyAttitude {
    #[serde(rename = "attitude file exist?(bool)")]
    attitude_file_exists: bool,
    #[serde(rename = "attitude file name(str)")]
    attitude_file_name: String,
    #[serde(rename = "const elevation[deg]")]
    const_elevation: f64,
    #[serde(rename = "const azimuth[deg]")]
    const_azimuth: f64,
    #[serde(rename = "const roll[deg]")]
    const_roll: f64,
    #[serde(rename = "pitch offset[deg]")]
    pitch_offset: f64,
    #[serde(rename = "yaw offset[deg]")]
    yaw_offset: f64,
    #[serde(rename = "roll offset[deg]")]
    roll_offset: f64,
    #[serde(rename = "gyro bias x[deg/h]")]
    gyro_bias_x: f64,
    #[serde(rename = "gyro bias y[deg/h]")]
    gyro_bias_y: f64,
    #[serde(rename = "gyro bias z[deg/h]")]
    gyro_bias_z: f64,
}

impl Default for LegacyAttitude {
    fn default() -> Self {
        Self {
            attitude_file_exists: false,
            attitude_file_name: String::new(),
            const_elevation: 90.0,
            const_azimuth: 0.0,
            const_roll: 0.0,
            pitch_offset: 0.0,
            yaw_offset: 0.0,
            roll_offset: 0.0,
            gyro_bias_x: 0.0,
            gyro_bias_y: 0.0,
            gyro_bias_z: 0.0,
        }
    }
}

#[derive(Deserialize, Clone)]
#[serde(default)]
struct LegacyDumping {
    #[serde(rename = "dumping product exist?(bool)")]
    exists: bool,
    #[serde(rename = "dumping product separation time[s]")]
    separation_time: f64,
    #[serde(rename = "dumping product mass[kg]")]
    mass: f64,
    #[serde(rename = "dumping product ballistic coefficient[kg/m2]")]
    ballistic_coefficient: f64,
    #[serde(rename = "additional speed at dumping NED[m/s,m/s,m/s]")]
    additional_speed_ned: [f64; 3],
}

impl Default for LegacyDumping {
    fn default() -> Self {
        Self {
            exists: false,
            separation_time: 0.0,
            mass: 0.0,
            ballistic_coefficient: 100.0,
            additional_speed_ned: [0.0; 3],
        }
    }
}

#[derive(Deserialize, Clone, Default)]
#[serde(default)]
struct LegacyNeutrality {
    #[serde(rename = "considering neutrality?(bool)")]
    considering_neutrality: bool,
    #[serde(rename = "CG, Controller position file(str)")]
    cg_controller_position_file: String,
    #[serde(rename = "CP file(str)")]
    cp_file: String,
    #[serde(rename = "Xcg offset[m]")]
    xcg_offset: f64,
    #[serde(rename = "Ycg offset[m]")]
    ycg_offset: f64,
    #[serde(rename = "Zcg offset[m]")]
    zcg_offset: f64,
    #[serde(rename = "Xcp offset[m]")]
    xcp_offset: f64,
    #[serde(rename = "Ycp offset[m]")]
    ycp_offset: f64,
    #[serde(rename = "Zcp offset[m]")]
    zcp_offset: f64,
    #[serde(rename = "Xt offset[m]")]
    xt_offset: f64,
    #[serde(rename = "Yt offset[m]")]
    yt_offset: f64,
    #[serde(rename = "Zt offset[m]")]
    zt_offset: f64,
}

#[derive(Deserialize, Clone, Default)]
#[serde(default)]
struct LegacySixDof {
    #[serde(rename = "CG,CP,Controller position file(str)")]
    cg_cp_controller_position_file: String,
    #[serde(rename = "moment of inertia file name(str)")]
    moment_of_inertia_file_name: String,
}

#[derive(Deserialize, Clone)]
#[serde(default)]
struct LegacyTransition {
    #[serde(rename = "following stage exist?(bool)")]
    following_stage_exists: bool,
    #[serde(rename = "separation time[s]")]
    separation_time: f64,
}

impl Default for LegacyTransition {
    fn default() -> Self {
        Self {
            following_stage_exists: false,
            separation_time: 1.0e6,
        }
    }
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct LegacyWind {
    #[serde(rename = "wind file exist?(bool)")]
    wind_file_exists: bool,
    #[serde(rename = "wind file name(str)")]
    wind_file_name: String,
    #[serde(rename = "const wind[m/s,deg]")]
    const_wind: [f64; 2],
}

#[cfg(test)]
mod tests {
    use super::super::{DirSource, NoFiles, validate};
    use super::*;
    use std::path::Path;

    fn example(path: &str) -> (String, DirSource) {
        let path = Path::new(env!("CARGO_MANIFEST_DIR")).join(path);
        let text = std::fs::read_to_string(&path).unwrap();
        (text, DirSource(path.parent().unwrap().to_path_buf()))
    }

    #[test]
    fn minimal_legacy_file_converts() {
        let text = r#"{
            "name(str)": "simple_test",
            "calculate condition": { "end time[s]": 300, "time step for output[s]": 1 },
            "launch": { "position LLH[deg,deg,m]": [35.0, 139.0, 0.0] },
            "stage1": {
                "mass initial[kg]": 1000,
                "thrust": {
                    "const thrust vac[N]": 30000,
                    "burn end time(time of each stage)[s]": 20
                }
            }
        }"#;
        let c = convert_legacy(text, &NoFiles).unwrap();
        assert!(c.warnings.is_empty(), "{:?}", c.warnings);
        let config = c.config;
        assert!(validate(&config).is_valid());
        assert_eq!(config.attitude.elevation_deg, Curve::Constant(90.0));
        let engine = config.stages[0].engine.as_ref().unwrap();
        assert_eq!(engine.isp_vac_s, Curve::Constant(200.0));
        assert_eq!(engine.burn_end_s, 20.0);
        assert_eq!(config.atmosphere.model, AtmosphereKind::Legacy);
    }

    #[test]
    fn coefficients_and_cutoff_are_baked_in() {
        let text = r#"{
            "name(str)": "k",
            "calculate condition": { "end time[s]": 300, "time step for output[s]": 1 },
            "launch": { "position LLH[deg,deg,m]": [35.0, 139.0, 0.0] },
            "stage1": {
                "mass initial[kg]": 1000,
                "thrust": {
                    "const thrust vac[N]": 1000, "const Isp vac[s]": 200,
                    "thrust coefficient[-]": 2.0, "Isp coefficient[-]": 1.1,
                    "burn start time(time of each stage)[s]": 10,
                    "burn end time(time of each stage)[s]": 50,
                    "forced cutoff time(time of each stage)[s]": 25
                }
            }
        }"#;
        let engine = convert_legacy(text, &NoFiles).unwrap().config.stages[0]
            .engine
            .clone()
            .unwrap();
        assert_eq!(engine.thrust_vac_n.as_constant().unwrap(), 2200.0);
        assert!((engine.isp_vac_s.as_constant().unwrap() - 220.0).abs() < 1e-9);
        // 10 + 40 / 2 = 30, cut off at 25
        assert_eq!(engine.burn_end_s, 25.0);
    }

    #[test]
    fn ss520_tables_are_inlined_per_stage() {
        let (text, dir) = example("legacy_cpp/bin/param_sample_01.json");
        assert!(convert_legacy(&text, &dir).is_ok());

        let (text, dir) = example("tests/cpp_reference/momo_trim.json");
        let c = convert_legacy(&text, &dir).unwrap();
        assert!(c.warnings.is_empty(), "{:?}", c.warnings);
        let stage = &c.config.stages[0];
        assert!(matches!(stage.aero.cn_table, Some(Surface::Grid { .. })));
        assert!(stage.thrust_trim.is_some());
        assert!(validate(&c.config).is_valid());
    }

    #[test]
    fn missing_files_fall_back_with_a_warning() {
        let text = r#"{
            "name(str)": "m",
            "calculate condition": { "end time[s]": 300, "time step for output[s]": 1 },
            "launch": { "position LLH[deg,deg,m]": [35.0, 139.0, 0.0] },
            "stage1": { "mass initial[kg]": 100, "thrust": {
                "thrust vac file exist?(bool)": true, "thrust vac file name(str)": "none.csv",
                "const thrust vac[N]": 5000, "burn end time(time of each stage)[s]": 5 } }
        }"#;
        let c = convert_legacy(text, &NoFiles).unwrap();
        assert_eq!(c.warnings.len(), 1);
        assert!(c.warnings[0].contains("none.csv"));
        let engine = c.config.stages[0].engine.as_ref().unwrap();
        assert_eq!(engine.thrust_vac_n, Curve::Constant(5000.0));
    }
}
