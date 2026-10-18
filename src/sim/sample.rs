//! Output sample: the state of a body and the forces on it at one instant
//!
//! The field order is the column order of `trajectory.csv`, and the field
//! names are its headers and the JSON keys.

use crate::config::FreeFlight;
use serde::{Deserialize, Serialize};

/// Flight mode of a body
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FlightMode {
    /// Engine burning, attitude from the program
    #[default]
    Powered,
    /// Engine off, drag from the ballistic coefficient
    Ballistic,
    /// Engine off, body aligned with the airflow
    AeroStable,
    /// Engine off, attitude from the program
    AttitudeProgram,
}

impl FlightMode {
    pub fn free(mode: FreeFlight) -> Self {
        match mode {
            FreeFlight::Ballistic => Self::Ballistic,
            FreeFlight::AeroStable => Self::AeroStable,
            FreeFlight::AttitudeProgram => Self::AttitudeProgram,
        }
    }

    /// Whether the body follows the attitude program (otherwise it is
    /// aligned with the airflow)
    pub fn follows_attitude_program(&self) -> bool {
        matches!(self, Self::Powered | Self::AttitudeProgram)
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Powered => "powered",
            Self::Ballistic => "ballistic",
            Self::AeroStable => "aero_stable",
            Self::AttitudeProgram => "attitude_program",
        }
    }
}

/// State of a body at one output time. Angles in degrees, SI units
/// otherwise; NED is the local north-east-down frame, ECI the inertial frame
/// aligned with ECEF at launch, body axes have X forward.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Sample {
    /// Time from launch
    pub time_s: f64,
    /// Stage flying (1-based); for a released body, the stage it came from
    pub stage: u8,
    pub flight_mode: FlightMode,
    pub latitude_deg: f64,
    pub longitude_deg: f64,
    /// Height above the WGS84 ellipsoid
    pub altitude_m: f64,
    /// Surface distance from the launch point
    pub downrange_m: f64,
    pub mass_kg: f64,
    /// Thrust after the nozzle exit pressure loss
    pub thrust_n: f64,
    /// Effective specific impulse, thrust / (mass flow x g0); 0 without thrust
    pub isp_s: f64,
    /// Earth-relative velocity, NED
    pub vel_north_mps: f64,
    pub vel_east_mps: f64,
    pub vel_down_mps: f64,
    /// Earth-relative speed
    pub speed_earth_mps: f64,
    /// Inertial speed
    pub speed_inertial_mps: f64,
    /// Mach number of the air-relative speed
    pub mach: f64,
    pub dynamic_pressure_pa: f64,
    /// Body attitude: azimuth (clockwise from north), elevation, roll
    pub azimuth_deg: f64,
    pub elevation_deg: f64,
    pub roll_deg: f64,
    /// Angle of attack atan2(w, u), sideslip atan2(v, u) and the total angle
    pub alpha_deg: f64,
    pub beta_deg: f64,
    pub aoa_total_deg: f64,
    /// Sensed acceleration (without gravity) in body axes
    pub accel_body_x_mps2: f64,
    pub accel_body_y_mps2: f64,
    pub accel_body_z_mps2: f64,
    /// Aerodynamic force in body axes
    pub aero_body_x_n: f64,
    pub aero_body_y_n: f64,
    pub aero_body_z_n: f64,
    /// Thrust in body axes
    pub thrust_body_x_n: f64,
    pub thrust_body_y_n: f64,
    pub thrust_body_z_n: f64,
    /// Thrust trim angles (0 without trim)
    pub gimbal_pitch_deg: f64,
    pub gimbal_yaw_deg: f64,
    /// Wind speed and the direction it blows from
    pub wind_speed_mps: f64,
    pub wind_direction_deg: f64,
    /// Instantaneous impact point; empty when none exists (orbit, escape)
    pub iip_latitude_deg: Option<f64>,
    pub iip_longitude_deg: Option<f64>,
    /// Position, velocity and acceleration (with gravity) in ECI
    pub pos_eci_x_m: f64,
    pub pos_eci_y_m: f64,
    pub pos_eci_z_m: f64,
    pub vel_eci_x_mps: f64,
    pub vel_eci_y_mps: f64,
    pub vel_eci_z_mps: f64,
    pub accel_eci_x_mps2: f64,
    pub accel_eci_y_mps2: f64,
    pub accel_eci_z_mps2: f64,
    /// Velocity losses: gravity along the flight path, aerodynamic drag,
    /// nozzle back pressure
    pub loss_gravity_mps2: f64,
    pub loss_aero_mps2: f64,
    pub loss_thrust_mps2: f64,
}

impl Sample {
    /// Upward Earth-relative speed [m/s]
    pub fn vertical_speed(&self) -> f64 {
        -self.vel_down_mps
    }

    /// Magnitude of the sensed acceleration [m/s²]
    pub fn sensed_acceleration(&self) -> f64 {
        (self.accel_body_x_mps2.powi(2)
            + self.accel_body_y_mps2.powi(2)
            + self.accel_body_z_mps2.powi(2))
        .sqrt()
    }

    pub fn pos_eci(&self) -> [f64; 3] {
        [self.pos_eci_x_m, self.pos_eci_y_m, self.pos_eci_z_m]
    }

    pub fn vel_eci(&self) -> [f64; 3] {
        [self.vel_eci_x_mps, self.vel_eci_y_mps, self.vel_eci_z_mps]
    }
}
