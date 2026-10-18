/// WGS84 ellipsoid semi-major axis [m]
pub const WGS84_A: f64 = 6378137.0;

/// WGS84 ellipsoid flattening [-]
pub const WGS84_F: f64 = 1.0 / 298.257223563;

/// WGS84 ellipsoid eccentricity squared [-]
pub const WGS84_E2: f64 = WGS84_F * (2.0 - WGS84_F);

/// Standard gravitational parameter for Earth [m³/s²]
pub const MU_EARTH: f64 = 3.986004418e14;

/// Earth's angular velocity [rad/s]
pub const OMEGA_EARTH: f64 = 7.2921159e-5;

/// Standard gravity [m/s²]
pub const G0: f64 = 9.80665;

/// Gas constant for dry air [J/(kg·K)]
pub const R_DRY_AIR: f64 = 287.05287;

/// Standard atmosphere conditions at sea level
pub const STD_PRESSURE_SL: f64 = 101325.0; // [Pa]
pub const STD_TEMPERATURE_SL: f64 = 288.15; // [K]
pub const STD_DENSITY_SL: f64 = 1.225; // [kg/m³]
