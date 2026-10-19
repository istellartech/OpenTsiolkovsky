//! Vehicle model: the configuration with its tables loaded
//!
//! [`Vehicle::load`] validates a [`Config`], reads its tables and gives the
//! functions the simulator evaluates (thrust, aerodynamic coefficients,
//! attitude, wind, atmosphere). Monte Carlo runs perturb a `Vehicle`.

use crate::config::{self, Config, FreeFlight, Integrator, Issue, Report, TableSource, UtcTime};
use crate::math::constants::G0;
use crate::math::interp::{Grid2D, Linear, bracket};
use crate::physics::atmosphere::{AtmosphereModel, AtmosphericConditions};
use crate::physics::coordinates::CoordinateTransform;
use nalgebra::{Matrix3, UnitQuaternion, Vector3};

#[derive(Debug, Clone)]
pub struct Vehicle {
    pub name: String,
    /// Simulation end time [s]
    pub end_time: f64,
    /// Output interval [s]
    pub output_step: f64,
    pub integrator: Integrator,
    pub launch: LaunchSite,
    pub atmosphere: Atmosphere,
    pub wind: WindProfile,
    pub attitude: AttitudeProgram,
    pub stages: Vec<StageModel>,
}

#[derive(Debug, Clone)]
pub struct LaunchSite {
    /// Latitude [deg], longitude [deg], ellipsoidal height [m]
    pub llh: Vector3<f64>,
    /// Initial Earth-relative velocity, NED [m/s]
    pub velocity_ned: Vector3<f64>,
    pub time: UtcTime,
    /// Rail length [m] (0: pad only)
    pub rail_length: f64,
}

#[derive(Debug, Clone)]
pub struct Atmosphere {
    pub model: AtmosphereModel,
    /// Seasonal variation along the U.S. Standard Atmosphere profile [%]
    pub seasonal_variation: f64,
    /// Density deviation [%] over altitude [m]; replaces the seasonal variation
    pub density_deviation: Option<Linear>,
}

impl Atmosphere {
    pub fn at(&self, altitude: f64) -> AtmosphericConditions {
        self.at_scalar(altitude)
    }

    pub fn at_scalar<T: crate::physics::Scalar>(&self, altitude: T) -> AtmosphericConditions<T> {
        match &self.density_deviation {
            Some(table) => self
                .model
                .conditions_with_percent(altitude, table.eval_scalar(altitude)),
            None => self
                .model
                .conditions_with_variation(altitude, self.seasonal_variation),
        }
    }
}

/// Wind over altitude: rows of altitude [m], speed [m/s], direction [deg]
#[derive(Debug, Clone)]
pub struct WindProfile {
    pub rows: Vec<[f64; 3]>,
}

impl WindProfile {
    pub fn ned_scalar<T: crate::physics::Scalar>(&self, altitude: T) -> Vector3<T> {
        let uv = |row: &[f64; 3]| {
            Vector3::new(
                -row[1] * row[2].to_radians().cos(),
                -row[1] * row[2].to_radians().sin(),
                0.0,
            )
        };
        if self.rows.is_empty() {
            return Vector3::zeros();
        }
        let i = self
            .rows
            .partition_point(|r| r[0] <= altitude.re())
            .saturating_sub(1);
        let a = uv(&self.rows[i]);
        if i + 1 == self.rows.len() || altitude.re() <= self.rows[0][0] {
            return a.map(T::from);
        }
        let b = uv(&self.rows[i + 1]);
        let f = (altitude - self.rows[i][0]) / (self.rows[i + 1][0] - self.rows[i][0]);
        a.map(T::from) + (b - a).map(|v| f * v)
    }

    /// Speed [m/s] and direction it blows from [deg] at an altitude [m].
    /// Interpolated in north/east components, so directions across north
    /// (350 deg -> 10 deg) blend correctly.
    pub fn at(&self, altitude: f64) -> (f64, f64) {
        let altitudes: Vec<f64> = self.rows.iter().map(|r| r[0]).collect();
        let Some((i, a)) = bracket(&altitudes, altitude) else {
            return (0.0, 0.0);
        };
        let p0 = self.rows[i];
        let p1 = self.rows.get(i + 1).copied().unwrap_or(p0);
        if a == 0.0 {
            return (p0[1], p0[2]);
        }
        // Components of the velocity the wind blows toward
        let uv = |speed: f64, dir: f64| {
            let d = dir.to_radians();
            (-speed * d.sin(), -speed * d.cos())
        };
        let (u0, v0) = uv(p0[1], p0[2]);
        let (u1, v1) = uv(p1[1], p1[2]);
        let (u, v) = (u0 + a * (u1 - u0), v0 + a * (v1 - v0));
        let speed = u.hypot(v);
        if speed < 1e-12 {
            return (0.0, p0[2]);
        }
        (speed, (u.atan2(v).to_degrees() + 180.0).rem_euclid(360.0))
    }
}

/// Commanded attitude over time from launch, with the body misalignment
/// and gyro drift of the C++ simulator
#[derive(Debug, Clone)]
pub struct AttitudeProgram {
    pub azimuth: Linear,
    pub elevation: Linear,
    pub roll: Linear,
    /// Misalignment about Z, Y, X [deg]
    pub offset_deg: [f64; 3],
    /// Gyro bias about body X, Y, Z [deg/h]
    pub gyro_bias_deg_h: [f64; 3],
}

impl AttitudeProgram {
    /// NED to body DCM at time `t` and the attitude it represents
    /// (azimuth, elevation, roll [deg]).
    ///
    /// The program defines a navigation frame; the body is rotated from it
    /// by the misalignment (yaw, pitch, roll) and by the gyro drift since
    /// launch.
    pub fn dcm(&self, t: f64) -> (Matrix3<f64>, Vector3<f64>) {
        let (az, el, roll) = (
            self.azimuth.eval(t),
            self.elevation.eval(t),
            self.roll.eval(t),
        );
        let navi = CoordinateTransform::dcm_ned_to_body(
            az.to_radians(),
            el.to_radians(),
            Some(roll.to_radians()),
        );
        let [yaw, pitch, roll_offset] = self.offset_deg;
        let bias = Vector3::from(self.gyro_bias_deg_h).map(|b| b.to_radians() / 3600.0);
        if self.offset_deg == [0.0; 3] && bias == Vector3::zeros() {
            return (navi, Vector3::new(az, el, roll));
        }
        let offset = UnitQuaternion::from_axis_angle(&Vector3::z_axis(), yaw.to_radians())
            * UnitQuaternion::from_axis_angle(&Vector3::y_axis(), pitch.to_radians())
            * UnitQuaternion::from_axis_angle(&Vector3::x_axis(), roll_offset.to_radians());
        let drift = UnitQuaternion::from_scaled_axis(bias * t);
        let dcm = (offset * drift).to_rotation_matrix().into_inner() * navi;
        (
            dcm,
            CoordinateTransform::azimuth_elevation_roll(&dcm).map(f64::to_degrees),
        )
    }
}

#[derive(Debug, Clone)]
pub struct StageModel {
    /// Mass of this stage alone [kg]
    pub mass_initial: f64,
    /// Dry mass [kg] (`None`: the whole stage may burn)
    pub mass_dry: Option<f64>,
    pub engine: Option<EngineModel>,
    pub aero: AeroModel,
    pub free_flight: FreeFlight,
    /// Separation from the stage start [s] (`None` for the last stage)
    pub separation_time: Option<f64>,
    pub jettisons: Vec<JettisonModel>,
    pub trim: Option<TrimModel>,
}

#[derive(Debug, Clone)]
pub struct EngineModel {
    /// Vacuum thrust [N] over stage time
    pub thrust: Linear,
    /// Vacuum Isp [s] over stage time
    pub isp: Linear,
    pub burn_start: f64,
    pub burn_end: f64,
    pub exit_area: f64,
}

#[derive(Debug, Clone)]
pub struct AeroModel {
    /// Reference area [m²]
    pub area: f64,
    pub ca: Linear,
    pub ca_power_off: Option<Linear>,
    pub normal: NormalForce,
    pub ballistic_coefficient: f64,
}

/// Normal force coefficient
#[derive(Debug, Clone)]
pub enum NormalForce {
    /// CN-alpha [1/rad] over Mach
    Slope(Linear),
    /// CN over Mach x angle of attack [deg]
    Table(Grid2D),
}

#[derive(Debug, Clone)]
pub struct JettisonModel {
    /// Body name in the output
    pub name: String,
    /// Release time from the stage start [s]
    pub time: f64,
    pub mass: f64,
    pub ballistic_coefficient: f64,
    pub delta_v_ned: Vector3<f64>,
}

#[derive(Debug, Clone)]
pub struct TrimModel {
    /// CG STA [m] over stage time
    pub cg: Linear,
    /// Gimbal STA [m] over stage time
    pub gimbal: Linear,
    /// CP STA [m] over Mach x angle [deg]
    pub cp: Grid2D,
    pub cg_offset: Vector3<f64>,
    pub cp_offset: Vector3<f64>,
    pub gimbal_offset: Vector3<f64>,
}

impl StageModel {
    /// Propellant the stage may burn [kg]
    pub fn usable_propellant(&self) -> f64 {
        let dry = self.mass_dry.unwrap_or(0.0).clamp(0.0, self.mass_initial);
        self.mass_initial - dry
    }

    /// Propellant the programmed burn would use [kg] (ignoring depletion
    /// and an early separation)
    pub fn propellant_demand(&self) -> f64 {
        let Some(e) = &self.engine else {
            return 0.0;
        };
        if e.burn_end <= e.burn_start {
            return 0.0;
        }
        let n = 2000;
        let h = (e.burn_end - e.burn_start) / n as f64;
        let flow = |t: f64| {
            let isp = e.isp.eval(t);
            if isp > 0.0 {
                e.thrust.eval(t).max(0.0) / (isp * G0)
            } else {
                0.0
            }
        };
        (0..n)
            .map(|i| {
                let t = e.burn_start + i as f64 * h;
                0.5 * h * (flow(t) + flow(t + h))
            })
            .sum()
    }

    /// Normal force coefficient at a Mach number and crossflow angle [deg]
    pub fn cn(&self, mach: f64, angle_deg: f64) -> f64 {
        match &self.aero.normal {
            NormalForce::Table(grid) => grid.eval(mach, angle_deg.max(0.0)),
            NormalForce::Slope(slope) => slope.eval(mach) * angle_deg.to_radians(),
        }
    }

    /// Axial force coefficient with the engine on or off
    pub fn ca(&self, mach: f64, powered: bool) -> f64 {
        match (&self.aero.ca_power_off, powered) {
            (Some(off), false) => off.eval(mach),
            _ => self.aero.ca.eval(mach),
        }
    }
}

/// Loads tables and collects the errors
struct Loader<'a> {
    source: &'a dyn TableSource,
    errors: Vec<Issue>,
}

impl Loader<'_> {
    fn curve(&mut self, path: String, curve: &config::Curve) -> Linear {
        curve.load(self.source).unwrap_or_else(|e| {
            self.errors.push(Issue::new(path, e));
            Linear::constant(0.0)
        })
    }

    fn surface(&mut self, path: String, surface: &config::Surface) -> Option<Grid2D> {
        surface
            .load(self.source)
            .map_err(|e| self.errors.push(Issue::new(path, e)))
            .ok()
    }
}

impl Vehicle {
    /// Validate a configuration and load its tables. Returns the vehicle
    /// and the warnings, or the errors (with the warnings found so far).
    pub fn load(config: &Config, source: &dyn TableSource) -> Result<(Self, Vec<Issue>), Report> {
        let mut report = config::validate(config);
        if !report.is_valid() {
            return Err(report);
        }
        let mut l = Loader {
            source,
            errors: Vec::new(),
        };

        let attitude = AttitudeProgram {
            azimuth: l.curve("attitude.azimuth_deg".into(), &config.attitude.azimuth_deg),
            elevation: l.curve(
                "attitude.elevation_deg".into(),
                &config.attitude.elevation_deg,
            ),
            roll: l.curve("attitude.roll_deg".into(), &config.attitude.roll_deg),
            offset_deg: [
                config.attitude.yaw_offset_deg,
                config.attitude.pitch_offset_deg,
                config.attitude.roll_offset_deg,
            ],
            gyro_bias_deg_h: config.attitude.gyro_bias_deg_h,
        };

        let mut stages = Vec::with_capacity(config.stages.len());
        let count = config.stages.len();
        for (i, s) in config.stages.iter().enumerate() {
            let p = |key: &str| format!("stages[{i}].{key}");
            let engine = s.engine.as_ref().map(|e| EngineModel {
                thrust: l.curve(p("engine.thrust_vac_n"), &e.thrust_vac_n),
                isp: l.curve(p("engine.isp_vac_s"), &e.isp_vac_s),
                burn_start: e.burn_start_s,
                burn_end: e.burn_end_s,
                exit_area: e.nozzle_exit_area_m2,
            });
            let ca = l.curve(p("aero.ca"), &s.aero.ca);
            let ca_power_off = s
                .aero
                .ca_power_off
                .as_ref()
                .map(|c| l.curve(p("aero.ca_power_off"), c));
            let cn_slope = l.curve(p("aero.cn_alpha_per_rad"), &s.aero.cn_alpha_per_rad);
            let normal = match s
                .aero
                .cn_table
                .as_ref()
                .and_then(|t| l.surface(p("aero.cn_table"), t))
            {
                Some(grid) => NormalForce::Table(grid),
                None => NormalForce::Slope(cn_slope),
            };
            let trim = match &s.thrust_trim {
                Some(t) => {
                    let cp = l.surface(p("thrust_trim.cp_sta_m"), &t.cp_sta_m);
                    let cg = l.curve(p("thrust_trim.cg_sta_m"), &t.cg_sta_m);
                    let gimbal = l.curve(p("thrust_trim.gimbal_sta_m"), &t.gimbal_sta_m);
                    cp.map(|cp| TrimModel {
                        cg,
                        gimbal,
                        cp,
                        cg_offset: t.cg_offset_m.into(),
                        cp_offset: t.cp_offset_m.into(),
                        gimbal_offset: t.gimbal_offset_m.into(),
                    })
                }
                None => None,
            };
            stages.push(StageModel {
                mass_initial: s.mass_initial_kg,
                mass_dry: s.mass_dry_kg,
                engine,
                aero: AeroModel {
                    area: std::f64::consts::PI * (s.aero.diameter_m / 2.0).powi(2),
                    ca,
                    ca_power_off,
                    normal,
                    ballistic_coefficient: s.aero.ballistic_coefficient_kg_m2,
                },
                free_flight: s.free_flight,
                separation_time: if i + 1 < count {
                    s.separation_time_s
                } else {
                    None
                },
                jettisons: s
                    .jettisons
                    .iter()
                    .enumerate()
                    .map(|(k, j)| JettisonModel {
                        name: if j.name.is_empty() {
                            format!("jettison{}", k + 1)
                        } else {
                            j.name.clone()
                        },
                        time: j.time_s,
                        mass: j.mass_kg,
                        ballistic_coefficient: j.ballistic_coefficient_kg_m2,
                        delta_v_ned: j.delta_v_ned_mps.into(),
                    })
                    .collect(),
                trim,
            });
        }

        let density_deviation = match &config.atmosphere.density_deviation {
            Some(t) => match t.rows(source) {
                Ok(rows) => Some(Linear::from_points(rows.iter().map(|r| (r[0], r[1])))),
                Err(e) => {
                    l.errors.push(Issue::new("atmosphere.density_deviation", e));
                    None
                }
            },
            None => None,
        };
        let wind_rows = match &config.wind.profile {
            Some(t) => t.rows(source).unwrap_or_else(|e| {
                l.errors.push(Issue::new("wind.profile", e));
                Vec::new()
            }),
            None => vec![[0.0, config.wind.speed_mps, config.wind.direction_deg]],
        };
        for (path, axis) in [
            (
                "atmosphere.density_deviation",
                density_deviation
                    .as_ref()
                    .map(|d| d.points().map(|p| p.0).collect::<Vec<_>>()),
            ),
            (
                "wind.profile",
                config
                    .wind
                    .profile
                    .is_some()
                    .then(|| wind_rows.iter().map(|r| r[0]).collect()),
            ),
        ] {
            if let Some(axis) = axis
                && let Err(e) = config::table::check_axis(axis)
            {
                l.errors.push(Issue::new(path, e));
            }
        }

        if !l.errors.is_empty() {
            report.errors = l.errors;
            return Err(report);
        }

        let vehicle = Vehicle {
            name: config.name.clone(),
            end_time: config.simulation.end_time_s,
            output_step: config.simulation.output_step_s,
            integrator: config.simulation.integrator,
            launch: LaunchSite {
                llh: Vector3::new(
                    config.launch.latitude_deg,
                    config.launch.longitude_deg,
                    config.launch.altitude_m,
                ),
                velocity_ned: config.launch.velocity_ned_mps.into(),
                time: config.launch.time_utc,
                rail_length: config.launch.rail_length_m,
            },
            atmosphere: Atmosphere {
                model: AtmosphereModel::with_kind(config.atmosphere.model),
                seasonal_variation: config.atmosphere.seasonal_variation_percent,
                density_deviation,
            },
            wind: WindProfile { rows: wind_rows },
            attitude,
            stages,
        };
        let mut warnings = report.warnings;
        warnings.extend(vehicle.warnings());
        Ok((vehicle, warnings))
    }

    /// Warnings that need the loaded tables
    fn warnings(&self) -> Vec<Issue> {
        let mut warnings = Vec::new();
        for (i, stage) in self.stages.iter().enumerate() {
            let demand = stage.propellant_demand();
            let usable = stage.usable_propellant();
            if demand > usable * (1.0 + 1e-6) {
                warnings.push(Issue::new(
                    format!("stages[{i}].engine"),
                    format!(
                        "the burn needs {demand:.1} kg of propellant but the stage has {usable:.1} kg; \
                         the burn ends when it runs out"
                    ),
                ));
            }
            if let Some(e) = &stage.engine
                && e.isp.points().any(|(_, v)| v <= 0.0)
            {
                warnings.push(Issue::new(
                    format!("stages[{i}].engine.isp_vac_s"),
                    "has non-positive values: no thrust there",
                ));
            }
        }
        warnings
    }

    pub fn stage_count(&self) -> usize {
        self.stages.len()
    }
}

/// Vehicle from configuration JSON without file tables (tests)
#[cfg(test)]
pub(crate) fn test_vehicle(json: &str) -> Vehicle {
    let config = Config::from_json(json).expect("test config parses");
    match Vehicle::load(&config, &config::NoFiles) {
        Ok((vehicle, _)) => vehicle,
        Err(report) => panic!("test config invalid: {:?}", report.errors),
    }
}
