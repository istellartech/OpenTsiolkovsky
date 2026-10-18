//! Simulation configuration (the JSON input)
//!
//! One format for the CLI, the web app, the WASM module and the MCP server.
//! Keys are snake_case and end in their unit (`_s`, `_m`, `_kg`, `_deg`,
//! ...). Every quantity that may vary is a [`Curve`]: a constant, inline
//! `[x, y]` rows or a CSV file. Times of a stage are measured from that
//! stage's start (the previous stage's separation); attitude times from
//! launch.
//!
//! `Vehicle::from_config` (src/vehicle.rs) turns a configuration into the
//! model the simulator flies; [`validate`] reports errors and warnings.

mod legacy;
mod pretty;
pub mod table;
mod time;
mod validate;

pub use legacy::{LegacyConversion, convert_legacy, is_legacy};
pub use pretty::to_pretty_json;
pub use table::{Curve, DirSource, MemorySource, NoFiles, Surface, Table, TableSource};
pub use time::UtcTime;
pub use validate::{Issue, Report, validate};

use crate::physics::atmosphere::AtmosphereKind;
use serde::{Deserialize, Serialize};

/// A vehicle and the flight to simulate
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// JSON Schema reference for editors (ignored)
    #[serde(rename = "$schema", default, skip_serializing_if = "Option::is_none")]
    pub schema: Option<String>,
    /// Vehicle or case name
    pub name: String,
    pub simulation: Simulation,
    pub launch: Launch,
    #[serde(default, skip_serializing_if = "is_default")]
    pub atmosphere: Atmosphere,
    #[serde(default, skip_serializing_if = "is_default")]
    pub wind: Wind,
    #[serde(default)]
    pub attitude: Attitude,
    /// Display-only vehicle structure; never used by the solver
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub presentation: Option<VehiclePresentation>,
    /// Calculation intervals in flight order (ordinary serial stages are one interval each)
    pub stages: Vec<Stage>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Simulation {
    /// Simulation end time from launch [s]; the flight also ends at ground impact
    pub end_time_s: f64,
    /// Interval of the output samples [s]
    #[serde(default = "one")]
    pub output_step_s: f64,
    #[serde(default, skip_serializing_if = "is_default")]
    pub integrator: Integrator,
}

/// Integration method of the equations of motion
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(tag = "method", rename_all = "lowercase", deny_unknown_fields)]
pub enum Integrator {
    /// Classic Runge-Kutta, fixed step; intervals are split evenly so the
    /// steps end exactly on events and output times
    Rk4 {
        /// Step size [s] (default: half the output step)
        #[serde(default, skip_serializing_if = "Option::is_none")]
        step_s: Option<f64>,
    },
    /// Dormand-Prince 5(4), adaptive step
    Rk45 {
        /// Absolute tolerance (all state components: kg, m, m/s)
        #[serde(default = "default_tolerance")]
        abs_tol: f64,
        /// Relative tolerance
        #[serde(default = "default_tolerance")]
        rel_tol: f64,
    },
}

impl Default for Integrator {
    fn default() -> Self {
        Integrator::Rk4 { step_s: None }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Launch {
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    /// Height above the WGS84 ellipsoid [m]
    #[serde(default)]
    pub altitude_m: f64,
    /// Launch time, ISO 8601 (`2024-07-01T01:00:00Z`; an offset such as
    /// `+09:00` is converted to UTC)
    #[serde(default)]
    pub time_utc: UtcTime,
    /// Initial Earth-relative velocity: north, east, down [m/s]. At rest the
    /// vehicle is held on the pad until the thrust lifts it; otherwise (air
    /// launch, restart in flight) it flies free from the start
    #[serde(default, skip_serializing_if = "is_zero3")]
    pub velocity_ned_mps: [f64; 3],
    /// Launcher rail length along the initial attitude [m]; 0: pad only
    #[serde(default, skip_serializing_if = "is_zero")]
    pub rail_length_m: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Atmosphere {
    /// Standard atmosphere model
    #[serde(default)]
    pub model: AtmosphereKind,
    /// Seasonal density variation [%] (-100 to 100), applied along the
    /// U.S. Standard Atmosphere variation profile (the sign flips between
    /// low and high altitude)
    #[serde(default, skip_serializing_if = "is_zero")]
    pub seasonal_variation_percent: f64,
    /// Density deviation [%] over altitude [m], rows `[altitude_m, percent]`;
    /// replaces the seasonal variation
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub density_deviation: Option<Table<[f64; 2]>>,
}

/// Wind blowing from `direction_deg` (meteorological convention)
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Wind {
    /// Constant wind speed [m/s]
    #[serde(default, skip_serializing_if = "is_zero")]
    pub speed_mps: f64,
    /// Direction the constant wind blows from, clockwise from north [deg]
    #[serde(default, skip_serializing_if = "is_zero")]
    pub direction_deg: f64,
    /// Wind over altitude, rows `[altitude_m, speed_mps, direction_deg]`,
    /// interpolated in north/east components; replaces the constant wind
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<Table<[f64; 3]>>,
}

/// Attitude program of the vehicle (time from launch)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Attitude {
    /// Azimuth of the body axis, clockwise from north [deg]
    #[serde(default)]
    pub azimuth_deg: Curve,
    /// Elevation of the body axis above the horizon [deg] (90: vertical)
    #[serde(default = "ninety")]
    pub elevation_deg: Curve,
    /// Roll angle [deg]
    #[serde(default, skip_serializing_if = "is_zero_curve")]
    pub roll_deg: Curve,
    /// Body misalignment from the program, applied about Z, then Y, then X [deg]
    #[serde(default, skip_serializing_if = "is_zero")]
    pub yaw_offset_deg: f64,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub pitch_offset_deg: f64,
    #[serde(default, skip_serializing_if = "is_zero")]
    pub roll_offset_deg: f64,
    /// Gyro bias about body X, Y, Z [deg/h]: the attitude drifts linearly from launch
    #[serde(default, skip_serializing_if = "is_zero3")]
    pub gyro_bias_deg_h: [f64; 3],
}

impl Default for Attitude {
    fn default() -> Self {
        Self {
            azimuth_deg: Curve::Constant(0.0),
            elevation_deg: Curve::Constant(90.0),
            roll_deg: Curve::Constant(0.0),
            yaw_offset_deg: 0.0,
            pitch_offset_deg: 0.0,
            roll_offset_deg: 0.0,
            gyro_bias_deg_h: [0.0; 3],
        }
    }
}

/// A user name in every language, or a pair of Japanese / English names.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(untagged, deny_unknown_fields)]
pub enum DisplayName {
    Text(String),
    Localized { ja: String, en: String },
}

/// Public vehicle terminology, independent of the number of calculation intervals.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct VehiclePresentation {
    /// Published stage count (uses the vehicle's own naming convention)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage_count: Option<u32>,
    /// Number of strap-on boosters, whether or not counted as a numbered stage
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub booster_count: Option<u32>,
}

/// Names for one calculation interval and the body released at its end.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct PhasePresentation {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<DisplayName>,
    /// Name of the separated body/group, e.g. "SRB-A ×2" (not an output ID)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub separation_name: Option<DisplayName>,
    /// A core engine continues across this interval's separation boundary.
    /// Only hides coincident synthetic burnout/ignition markers in the UI.
    #[serde(default, skip_serializing_if = "is_false")]
    pub engine_continues: bool,
}

fn is_false(value: &bool) -> bool {
    !value
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Stage {
    /// Display-only interval and released-body names; never used by the solver
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub presentation: Option<PhasePresentation>,
    /// Mass allocated to this calculation interval, excluding later intervals [kg].
    /// For ordinary serial stages, the initial mass of this stage alone.
    pub mass_initial_kg: f64,
    /// Mass without propellant [kg]; the burn ends when the propellant
    /// (initial minus dry mass) runs out. Unset: the whole stage may burn
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mass_dry_kg: Option<f64>,
    /// Rocket engine; unset: no thrust
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<Engine>,
    #[serde(default)]
    pub aero: Aero,
    /// Motion after burnout
    #[serde(default)]
    pub free_flight: FreeFlight,
    /// Separation of the upper stages, from this stage's start [s]; required
    /// for every stage but the last
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub separation_time_s: Option<f64>,
    /// Bodies released during this stage's flight (fairings, ...)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub jettisons: Vec<Jettison>,
    /// Gimbal the thrust to balance the aerodynamic moment
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thrust_trim: Option<ThrustTrim>,
}

/// Rocket engine of a stage. Thrust = vacuum thrust - exit area x ambient
/// pressure (never negative); mass flow = vacuum thrust / (vacuum Isp x g0)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Engine {
    /// Vacuum thrust over stage time [N]
    pub thrust_vac_n: Curve,
    /// Vacuum specific impulse over stage time [s]
    pub isp_vac_s: Curve,
    /// Ignition, from the stage start [s]
    #[serde(default)]
    pub burn_start_s: f64,
    /// End of the burn, from the stage start [s]
    pub burn_end_s: f64,
    /// Nozzle exit area [m²], for the ambient pressure loss
    #[serde(default, skip_serializing_if = "is_zero")]
    pub nozzle_exit_area_m2: f64,
}

/// Aerodynamics of a stage (and everything above it)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Aero {
    /// Reference diameter [m]; reference area = pi/4 x diameter²
    #[serde(default = "default_diameter")]
    pub diameter_m: f64,
    /// Axial force coefficient over Mach
    #[serde(default)]
    pub ca: Curve,
    /// Axial force coefficient over Mach while the engine is off (base
    /// drag); unset: `ca`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ca_power_off: Option<Curve>,
    /// Normal force slope CN-alpha over Mach [1/rad]; normal force =
    /// CN-alpha x angle of attack [rad] x dynamic pressure x reference area
    #[serde(default, skip_serializing_if = "is_zero_curve")]
    pub cn_alpha_per_rad: Curve,
    /// Normal force coefficient over Mach x angle of attack; replaces
    /// `cn_alpha_per_rad`
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cn_table: Option<Surface>,
    /// Ballistic coefficient for `free_flight: "ballistic"` [kg/m²]
    /// (drag deceleration = dynamic pressure / coefficient)
    #[serde(default = "default_ballistic")]
    pub ballistic_coefficient_kg_m2: f64,
}

impl Default for Aero {
    fn default() -> Self {
        Self {
            diameter_m: default_diameter(),
            ca: Curve::Constant(0.0),
            ca_power_off: None,
            cn_alpha_per_rad: Curve::Constant(0.0),
            cn_table: None,
            ballistic_coefficient_kg_m2: default_ballistic(),
        }
    }
}

/// Motion of a stage while its engine is off
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "snake_case")]
pub enum FreeFlight {
    /// Drag from the ballistic coefficient
    #[default]
    Ballistic,
    /// Body aligned with the airflow: axial force only
    AeroStable,
    /// Body follows the attitude program (axial and normal force)
    AttitudeProgram,
}

/// A body released from a stage
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct Jettison {
    /// Display-only name; the output name/ID stays unchanged
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<DisplayName>,
    /// Name in the output (default `jettison<N>`)
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub name: String,
    /// Release time from the stage start [s]; must be before the separation
    pub time_s: f64,
    /// Mass, part of the stage's dry mass [kg]
    pub mass_kg: f64,
    /// Ballistic coefficient of the released body [kg/m²]
    #[serde(default = "default_ballistic")]
    pub ballistic_coefficient_kg_m2: f64,
    /// Velocity added at release: north, east, down [m/s]
    #[serde(default, skip_serializing_if = "is_zero3")]
    pub delta_v_ned_mps: [f64; 3],
}

/// Thrust direction that balances the aerodynamic moment about the CG
/// (the C++ simulator's 3DoF "neutrality"). Positions are STA [m]: distance
/// aft of the nose. Offsets move the CG, centre of pressure and thrust
/// point in body axes (X forward) [m].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct ThrustTrim {
    /// Centre of gravity STA over stage time [m]
    pub cg_sta_m: Curve,
    /// Gimbal (thrust point) STA over stage time [m]
    pub gimbal_sta_m: Curve,
    /// Centre of pressure STA over Mach x angle of attack [m]
    pub cp_sta_m: Surface,
    #[serde(default, skip_serializing_if = "is_zero3")]
    pub cg_offset_m: [f64; 3],
    #[serde(default, skip_serializing_if = "is_zero3")]
    pub cp_offset_m: [f64; 3],
    #[serde(default, skip_serializing_if = "is_zero3")]
    pub gimbal_offset_m: [f64; 3],
}

impl Config {
    /// Parse a configuration from JSON text
    pub fn from_json(text: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(text)
    }

    /// Pretty JSON text (table rows on one line)
    pub fn to_json_pretty(&self) -> String {
        serde_json::to_value(self).map_or_else(|_| String::new(), |v| to_pretty_json(&v))
    }

    /// Names of the CSV files the configuration refers to, without duplicates
    pub fn referenced_files(&self) -> Vec<String> {
        let mut names: Vec<String> = Vec::new();
        let mut add = |name: Option<&str>| {
            if let Some(name) = name
                && !names.iter().any(|n| n == name)
            {
                names.push(name.to_string());
            }
        };
        let curve = |c: &Curve| match c {
            Curve::Table(Table::File { file, .. }) => Some(file.clone()),
            _ => None,
        };
        let surface = |s: &Surface| match s {
            Surface::File { file } => Some(file.clone()),
            _ => None,
        };
        let table = |t: &Option<Table<[f64; 2]>>| match t {
            Some(Table::File { file, .. }) => Some(file.clone()),
            _ => None,
        };
        add(table(&self.atmosphere.density_deviation).as_deref());
        if let Some(Table::File { file, .. }) = &self.wind.profile {
            add(Some(file));
        }
        for c in [
            &self.attitude.azimuth_deg,
            &self.attitude.elevation_deg,
            &self.attitude.roll_deg,
        ] {
            add(curve(c).as_deref());
        }
        for stage in &self.stages {
            if let Some(engine) = &stage.engine {
                add(curve(&engine.thrust_vac_n).as_deref());
                add(curve(&engine.isp_vac_s).as_deref());
            }
            add(curve(&stage.aero.ca).as_deref());
            add(stage.aero.ca_power_off.as_ref().and_then(curve).as_deref());
            add(curve(&stage.aero.cn_alpha_per_rad).as_deref());
            add(stage.aero.cn_table.as_ref().and_then(surface).as_deref());
            if let Some(trim) = &stage.thrust_trim {
                add(curve(&trim.cg_sta_m).as_deref());
                add(curve(&trim.gimbal_sta_m).as_deref());
                add(surface(&trim.cp_sta_m).as_deref());
            }
        }
        names
    }

    /// Copy with every CSV file table read and given inline
    pub fn inline_tables(&self, source: &dyn TableSource) -> Result<Config, Vec<Issue>> {
        let mut out = self.clone();
        let mut errors = Vec::new();
        let mut curve = |path: String, c: &mut Curve| {
            if let Curve::Table(t @ Table::File { .. }) = c {
                match t.rows(source) {
                    Ok(rows) => *t = Table::Rows(rows),
                    Err(e) => errors.push(Issue::new(path, e)),
                }
            }
        };
        let a = &mut out.attitude;
        curve("attitude.azimuth_deg".into(), &mut a.azimuth_deg);
        curve("attitude.elevation_deg".into(), &mut a.elevation_deg);
        curve("attitude.roll_deg".into(), &mut a.roll_deg);
        let mut surfaces: Vec<(String, &mut Surface)> = Vec::new();
        for (i, s) in out.stages.iter_mut().enumerate() {
            let p = |key: &str| format!("stages[{i}].{key}");
            if let Some(e) = &mut s.engine {
                curve(p("engine.thrust_vac_n"), &mut e.thrust_vac_n);
                curve(p("engine.isp_vac_s"), &mut e.isp_vac_s);
            }
            curve(p("aero.ca"), &mut s.aero.ca);
            if let Some(c) = &mut s.aero.ca_power_off {
                curve(p("aero.ca_power_off"), c);
            }
            curve(p("aero.cn_alpha_per_rad"), &mut s.aero.cn_alpha_per_rad);
            if let Some(t) = &mut s.aero.cn_table {
                surfaces.push((p("aero.cn_table"), t));
            }
            if let Some(t) = &mut s.thrust_trim {
                curve(p("thrust_trim.cg_sta_m"), &mut t.cg_sta_m);
                curve(p("thrust_trim.gimbal_sta_m"), &mut t.gimbal_sta_m);
                surfaces.push((p("thrust_trim.cp_sta_m"), &mut t.cp_sta_m));
            }
        }
        for (path, surface) in surfaces {
            if let Surface::File { file } = surface {
                match source
                    .read(file)
                    .and_then(|text| table::parse_surface(&text))
                {
                    Ok((mach, alpha_deg, values)) => {
                        *surface = Surface::Grid {
                            mach,
                            alpha_deg,
                            values,
                        }
                    }
                    Err(e) => errors.push(Issue::new(path, e)),
                }
            }
        }
        if let Some(t @ Table::File { .. }) = &mut out.atmosphere.density_deviation {
            match t.rows(source) {
                Ok(rows) => *t = Table::Rows(rows),
                Err(e) => errors.push(Issue::new("atmosphere.density_deviation", e)),
            }
        }
        if let Some(t @ Table::File { .. }) = &mut out.wind.profile {
            match t.rows(source) {
                Ok(rows) => *t = Table::Rows(rows),
                Err(e) => errors.push(Issue::new("wind.profile", e)),
            }
        }
        if errors.is_empty() {
            Ok(out)
        } else {
            Err(errors)
        }
    }
}

/// JSON Schema of the configuration file
#[cfg(feature = "schema")]
pub fn json_schema() -> serde_json::Value {
    let mut schema = schemars::schema_for!(Config).to_value();
    schema["title"] = "OpenTsiolkovsky configuration".into();
    schema
}

fn one() -> f64 {
    1.0
}
fn ninety() -> Curve {
    Curve::Constant(90.0)
}
fn default_tolerance() -> f64 {
    1.0e-9
}
fn default_diameter() -> f64 {
    0.5
}
fn default_ballistic() -> f64 {
    100.0
}
fn is_zero(v: &f64) -> bool {
    *v == 0.0
}
fn is_zero3(v: &[f64; 3]) -> bool {
    v.iter().all(|x| *x == 0.0)
}
fn is_zero_curve(c: &Curve) -> bool {
    c.is_constant(0.0)
}
fn is_default<T: Default + PartialEq>(v: &T) -> bool {
    *v == T::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MINIMAL: &str = r#"{
        "name": "minimal",
        "simulation": { "end_time_s": 300 },
        "launch": { "latitude_deg": 35, "longitude_deg": 139 },
        "stages": [{
            "mass_initial_kg": 1000,
            "engine": { "thrust_vac_n": 30000, "isp_vac_s": 200, "burn_end_s": 20 }
        }]
    }"#;

    #[test]
    fn minimal_config_uses_defaults() {
        let config = Config::from_json(MINIMAL).unwrap();
        assert_eq!(config.simulation.output_step_s, 1.0);
        assert_eq!(
            config.simulation.integrator,
            Integrator::Rk4 { step_s: None }
        );
        assert_eq!(config.attitude.elevation_deg, Curve::Constant(90.0));
        assert_eq!(config.stages[0].aero.diameter_m, 0.5);
        assert_eq!(config.stages[0].free_flight, FreeFlight::Ballistic);
        assert_eq!(config.launch.time_utc, UtcTime::default());
    }

    #[test]
    fn round_trips_through_json() {
        let config = Config::from_json(MINIMAL).unwrap();
        let again = Config::from_json(&config.to_json_pretty()).unwrap();
        assert_eq!(config, again);
    }

    #[test]
    fn unknown_keys_are_rejected() {
        let text = MINIMAL.replace("\"end_time_s\"", "\"end_time\"");
        assert!(Config::from_json(&text).is_err());
        let text = MINIMAL.replace("\"burn_end_s\"", "\"burn_end_s\": 20, \"typo\"");
        assert!(Config::from_json(&text).is_err());
    }

    #[test]
    fn integrator_is_tagged_by_method() {
        let i: Integrator = serde_json::from_str(r#"{"method": "rk45", "rel_tol": 1e-8}"#).unwrap();
        assert_eq!(
            i,
            Integrator::Rk45 {
                abs_tol: 1e-9,
                rel_tol: 1e-8
            }
        );
    }
}
