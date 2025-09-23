pub mod atmosphere {
    use crate::math::constants::*;

    /// International Standard Atmosphere (ISA) Model
    ///
    /// Implements the standard atmosphere model up to 84.852 km altitude
    /// with 8 atmospheric layers as per ISO 2533 standard.
    #[derive(Debug, Clone)]
    pub struct AtmosphereModel {
        /// Height of atmospheric layers [m]
        height_layers: [f64; 8],
        /// Temperature lapse rates [K/m]  
        lapse_rates: [f64; 8],
        /// Base temperatures at each layer [K]
        base_temperatures: [f64; 8],
        /// Base pressures at each layer [Pa]
        base_pressures: [f64; 8],
        /// Specific gas constant for dry air [J/(kg·K)]
        gas_constant: f64,
        /// Ratio of specific heats [-]
        gamma: f64,
    }

    /// Atmospheric conditions at a specific altitude
    #[derive(Debug, Clone)]
    pub struct AtmosphericConditions {
        pub temperature: f64,    // [K]
        pub pressure: f64,       // [Pa]
        pub density: f64,        // [kg/m³]
        pub speed_of_sound: f64, // [m/s]
    }

    impl Default for AtmosphereModel {
        fn default() -> Self {
            Self::new()
        }
    }

    impl AtmosphereModel {
        /// Create new standard atmosphere model
        pub fn new() -> Self {
            AtmosphereModel {
                // Height of atmospheric layers [m]
                height_layers: [0.0, 11000.0, 20000.0, 32000.0, 47000.0, 51000.0, 71000.0, 84852.0],
                // Temperature lapse rates [K/m]
                lapse_rates: [-0.0065, 0.0, 0.001, 0.0028, 0.0, -0.0028, -0.002, 0.0],
                // Base temperatures [K]
                base_temperatures: [288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.95],
                // Base pressures [Pa]
                base_pressures: [101325.0, 22632.0, 5474.9, 868.02, 110.91, 66.939, 3.9564, 0.3734],
                gas_constant: R_DRY_AIR,
                gamma: 1.4,
            }
        }

        /// Calculate atmospheric conditions at given altitude
        ///
        /// # Arguments
        /// * `altitude` - Geometric altitude [m]
        ///
        /// # Returns
        /// Atmospheric conditions (temperature, pressure, density, speed of sound)
        pub fn conditions(&self, altitude: f64) -> AtmosphericConditions {
            let layer_index = self.determine_layer(altitude);

            let h = altitude;
            let h_base = self.height_layers[layer_index];
            let t_base = self.base_temperatures[layer_index];
            let p_base = self.base_pressures[layer_index];
            let lapse_rate = self.lapse_rates[layer_index];

            // Temperature calculation
            let temperature = t_base + lapse_rate * (h - h_base);

            // Pressure calculation
            let pressure = if lapse_rate.abs() < 1e-10 {
                // Isothermal layer (zero lapse rate)
                p_base * (-(G0 / self.gas_constant) * (h - h_base) / t_base).exp()
            } else {
                // Non-isothermal layer
                let temp_ratio = temperature / t_base;
                p_base * temp_ratio.powf(-G0 / (lapse_rate * self.gas_constant))
            };

            // Density from ideal gas law
            let density = pressure / (self.gas_constant * temperature);

            // Speed of sound
            let speed_of_sound = (self.gamma * self.gas_constant * temperature).sqrt();

            AtmosphericConditions { temperature, pressure, density, speed_of_sound }
        }

        /// Calculate density at given altitude
        pub fn density(&self, altitude: f64) -> f64 {
            self.conditions(altitude).density
        }

        /// Calculate pressure at given altitude  
        pub fn pressure(&self, altitude: f64) -> f64 {
            self.conditions(altitude).pressure
        }

        /// Calculate temperature at given altitude
        pub fn temperature(&self, altitude: f64) -> f64 {
            self.conditions(altitude).temperature
        }

        /// Calculate speed of sound at given altitude
        pub fn speed_of_sound(&self, altitude: f64) -> f64 {
            self.conditions(altitude).speed_of_sound
        }

        /// Calculate atmospheric conditions with density variation
        ///
        /// # Arguments
        /// * `altitude` - Geometric altitude [m]
        /// * `variation_percent` - Density variation percentage [-100 to +100]
        ///
        /// # Returns
        /// Atmospheric conditions with modified density
        pub fn conditions_with_variation(
            &self,
            altitude: f64,
            variation_percent: f64,
        ) -> AtmosphericConditions {
            let mut conditions = self.conditions(altitude);
            let variation_coeff = self.density_variation_coefficient(altitude, variation_percent);
            conditions.density *= 1.0 + variation_coeff;
            conditions
        }

        /// Determine which atmospheric layer the altitude falls into
        fn determine_layer(&self, altitude: f64) -> usize {
            for i in 0..7 {
                if altitude < self.height_layers[i + 1] {
                    return i;
                }
            }
            7 // Highest layer
        }

        /// Calculate density variation coefficient based on U.S. Standard Atmosphere
        ///
        /// # Arguments
        /// * `altitude` - Altitude [m]
        /// * `input_percent` - Input variation percentage [-100 to +100]
        ///
        /// # Returns
        /// Density variation coefficient [-1.0 to +1.0]
        fn density_variation_coefficient(&self, altitude: f64, input_percent: f64) -> f64 {
            if input_percent.abs() < 1e-10 {
                return 0.0;
            }

            // Data from U.S. Standard Atmosphere - negative variation
            let minus_x = [
                21.6, 7.4, -1.3, -14.3, -15.9, -18.6, -32.1, -38.6, -50.0, -55.3, -65.0, -68.1,
                -76.7, -42.2,
            ];
            let minus_y = [
                1010.0, 4300.0, 8030.0, 10220.0, 16360.0, 20300.0, 26220.0, 29950.0, 40250.0,
                50110.0, 59970.0, 70270.0, 80140.0, 90220.0,
            ];

            // Data from U.S. Standard Atmosphere - positive variation
            let plus_x =
                [-12.8, -7.9, 1.5, 5.3, 26.7, 20.2, 14.3, 18.2, 33.6, 47.4, 59.5, 72.2, 58.7, 41.4];
            let plus_y = [
                1230.0, 4300.0, 8030.0, 10000.0, 16360.0, 20300.0, 26220.0, 29950.0, 40250.0,
                50110.0, 59970.0, 70270.0, 80360.0, 90880.0,
            ];

            let percent_with_altitude = if input_percent < 0.0 {
                linear_interpolate(altitude, &minus_y, &minus_x)
            } else {
                linear_interpolate(altitude, &plus_y, &plus_x)
            };

            percent_with_altitude / 100.0 * input_percent.abs() / 100.0
        }
    }

    /// Linear interpolation helper function
    ///
    /// # Arguments
    /// * `y` - Target y-value to interpolate for
    /// * `y_array` - Array of y-values (monotonic)
    /// * `x_array` - Array of corresponding x-values
    ///
    /// # Returns
    /// Interpolated x-value
    fn linear_interpolate(y: f64, y_array: &[f64], x_array: &[f64]) -> f64 {
        let n = y_array.len();

        // Handle boundary cases
        if y <= y_array[0] {
            return x_array[0];
        }
        if y >= y_array[n - 1] {
            return x_array[n - 1];
        }

        // Find interval for interpolation
        for i in 0..n - 1 {
            if y >= y_array[i] && y <= y_array[i + 1] {
                let t = (y - y_array[i]) / (y_array[i + 1] - y_array[i]);
                return x_array[i] + t * (x_array[i + 1] - x_array[i]);
            }
        }

        x_array[n - 1]
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use approx::assert_relative_eq;

        #[test]
        fn test_sea_level_conditions() {
            let atm = AtmosphereModel::new();
            let conditions = atm.conditions(0.0);

            // Test against standard sea level conditions
            assert_relative_eq!(conditions.temperature, STD_TEMPERATURE_SL, epsilon = 0.01);
            assert_relative_eq!(conditions.pressure, STD_PRESSURE_SL, epsilon = 1.0);
            assert_relative_eq!(conditions.density, STD_DENSITY_SL, epsilon = 0.001);
        }

        #[test]
        fn test_temperature_profile() {
            let atm = AtmosphereModel::new();

            // Test troposphere (negative lapse rate)
            let temp_5km = atm.temperature(5000.0);
            let expected_5km = 288.15 + (-0.0065) * 5000.0; // 255.65 K
            assert_relative_eq!(temp_5km, expected_5km, epsilon = 0.01);

            // Test tropopause (isothermal layer)
            let temp_15km = atm.temperature(15000.0);
            assert_relative_eq!(temp_15km, 216.65, epsilon = 0.01); // Constant in isothermal layer
        }

        #[test]
        fn test_density_decreases_with_altitude() {
            let atm = AtmosphereModel::new();

            let density_0 = atm.density(0.0);
            let density_10km = atm.density(10000.0);
            let density_20km = atm.density(20000.0);

            // Density should decrease with altitude
            assert!(density_0 > density_10km);
            assert!(density_10km > density_20km);
        }

        #[test]
        fn test_speed_of_sound() {
            let atm = AtmosphereModel::new();

            // At sea level, speed of sound should be ~340 m/s
            let sound_speed_sl = atm.speed_of_sound(0.0);
            assert_relative_eq!(sound_speed_sl, 340.3, epsilon = 1.0);
        }

        #[test]
        fn test_linear_interpolation() {
            let y_vals = [0.0, 10.0, 20.0, 30.0];
            let x_vals = [0.0, 1.0, 4.0, 9.0];

            // Test exact points
            assert_relative_eq!(linear_interpolate(10.0, &y_vals, &x_vals), 1.0, epsilon = 1e-12);

            // Test midpoint
            assert_relative_eq!(linear_interpolate(15.0, &y_vals, &x_vals), 2.5, epsilon = 1e-12);

            // Test boundary cases
            assert_relative_eq!(linear_interpolate(-5.0, &y_vals, &x_vals), 0.0, epsilon = 1e-12);
            assert_relative_eq!(linear_interpolate(35.0, &y_vals, &x_vals), 9.0, epsilon = 1e-12);
        }

        #[test]
        fn test_density_variation() {
            let atm = AtmosphereModel::new();

            // Test nominal conditions (no variation)
            let conditions_nominal = atm.conditions_with_variation(10000.0, 0.0);
            let conditions_standard = atm.conditions(10000.0);
            assert_relative_eq!(
                conditions_nominal.density,
                conditions_standard.density,
                epsilon = 1e-12
            );

            // Test that variation changes density
            let conditions_plus = atm.conditions_with_variation(10000.0, 20.0);
            let conditions_minus = atm.conditions_with_variation(10000.0, -20.0);

            assert!(conditions_plus.density > conditions_standard.density);
            assert!(conditions_minus.density < conditions_standard.density);
        }
    }
}

pub mod coordinates {
    use crate::math::constants::*;
    use crate::math::{deg2rad, rad2deg};
    use nalgebra::{Matrix3, Vector3};

    /// Coordinate transformation utilities
    ///
    /// Provides transformations between different coordinate systems:
    /// - LLH (Latitude, Longitude, Height)
    /// - ECEF (Earth-Centered Earth-Fixed)
    /// - ECI (Earth-Centered Inertial)
    /// - NED (North-East-Down)
    /// - BODY (Body-fixed)
    pub struct CoordinateTransform;

    impl CoordinateTransform {
        /// ECI to ECEF Direction Cosine Matrix
        ///
        /// # Arguments
        /// * `time_seconds` - Time since J2000 epoch [s]
        ///
        /// # Returns
        /// 3x3 DCM matrix for ECI to ECEF transformation
        pub fn dcm_eci_to_ecef(time_seconds: f64) -> Matrix3<f64> {
            let theta = OMEGA_EARTH * time_seconds;
            let cos_theta = theta.cos();
            let sin_theta = theta.sin();

            Matrix3::new(cos_theta, sin_theta, 0.0, -sin_theta, cos_theta, 0.0, 0.0, 0.0, 1.0)
        }

        /// Convert ECI position to ECEF
        pub fn pos_eci_to_ecef(pos_eci: &Vector3<f64>, time_seconds: f64) -> Vector3<f64> {
            let dcm = Self::dcm_eci_to_ecef(time_seconds);
            dcm * pos_eci
        }

        /// Convert ECEF position to LLH (Latitude, Longitude, Height)
        ///
        /// Uses iterative algorithm for accurate conversion from WGS84 ellipsoid
        ///
        /// # Arguments
        /// * `pos_ecef` - ECEF position [m]
        ///
        /// # Returns
        /// LLH position [deg, deg, m] (latitude, longitude, height)
        pub fn pos_ecef_to_llh(pos_ecef: &Vector3<f64>) -> Vector3<f64> {
            let x = pos_ecef.x;
            let y = pos_ecef.y;
            let z = pos_ecef.z;

            let a = WGS84_A;
            let _one_f = 1.0 / WGS84_F;
            let b = a * (1.0 - WGS84_F);
            let e2 = WGS84_E2;
            let ed2 = e2 * a * a / (b * b); // Second eccentricity squared

            let p = (x * x + y * y).sqrt();
            let theta = (z * a).atan2(p * b);

            let lat_rad =
                (z + ed2 * b * theta.sin().powi(3)).atan2(p - e2 * a * theta.cos().powi(3));
            let lon_rad = y.atan2(x);

            let n = a / (1.0 - e2 * lat_rad.sin().powi(2)).sqrt();
            let height = p / lat_rad.cos() - n;

            Vector3::new(rad2deg(lat_rad), rad2deg(lon_rad), height)
        }

        /// Convert LLH to ECEF position
        pub fn pos_llh_to_ecef(pos_llh: &Vector3<f64>) -> Vector3<f64> {
            let lat_rad = deg2rad(pos_llh.x);
            let lon_rad = deg2rad(pos_llh.y);
            let height = pos_llh.z;

            let a = WGS84_A;
            let e2 = WGS84_E2;

            let n = a / (1.0 - e2 * lat_rad.sin().powi(2)).sqrt();

            let x = (n + height) * lat_rad.cos() * lon_rad.cos();
            let y = (n + height) * lat_rad.cos() * lon_rad.sin();
            let z = (n * (1.0 - e2) + height) * lat_rad.sin();

            Vector3::new(x, y, z)
        }

        /// ECEF to NED (North-East-Down) Direction Cosine Matrix
        ///
        /// # Arguments
        /// * `pos_llh` - Reference LLH position [deg, deg, m]
        ///
        /// # Returns
        /// 3x3 DCM matrix for ECEF to NED transformation
        pub fn dcm_ecef_to_ned(pos_llh: &Vector3<f64>) -> Matrix3<f64> {
            let lat = deg2rad(pos_llh.x);
            let lon = deg2rad(pos_llh.y);

            let sin_lat = lat.sin();
            let cos_lat = lat.cos();
            let sin_lon = lon.sin();
            let cos_lon = lon.cos();

            Matrix3::new(
                -sin_lat * cos_lon,
                -sin_lat * sin_lon,
                cos_lat,
                -sin_lon,
                cos_lon,
                0.0,
                -cos_lat * cos_lon,
                -cos_lat * sin_lon,
                -sin_lat,
            )
        }

        /// ECI to NED Direction Cosine Matrix
        pub fn dcm_eci_to_ned(pos_llh: &Vector3<f64>, time_seconds: f64) -> Matrix3<f64> {
            let dcm_ecef_to_ned = Self::dcm_ecef_to_ned(pos_llh);
            let dcm_eci_to_ecef = Self::dcm_eci_to_ecef(time_seconds);
            dcm_ecef_to_ned * dcm_eci_to_ecef
        }

        /// Convert ECI velocity to ECEF velocity in NED frame
        ///
        /// Accounts for Earth's rotation effect on velocity transformation
        pub fn vel_eci_to_ecef_ned_frame(
            pos_eci: &Vector3<f64>,
            vel_eci: &Vector3<f64>,
            dcm_eci_to_ned: &Matrix3<f64>,
        ) -> Vector3<f64> {
            // Earth rotation angular velocity tensor
            let omega_tensor =
                Matrix3::new(0.0, -OMEGA_EARTH, 0.0, OMEGA_EARTH, 0.0, 0.0, 0.0, 0.0, 0.0);

            // Transform to NED frame accounting for Earth rotation
            dcm_eci_to_ned * (vel_eci - omega_tensor * pos_eci)
        }

        /// NED to BODY Direction Cosine Matrix
        ///
        /// # Arguments
        /// * `azimuth_rad` - Azimuth angle [rad] (0 = North, positive clockwise)
        /// * `elevation_rad` - Elevation angle [rad] (positive = up from horizontal)
        /// * `roll_rad` - Roll angle [rad] (optional, defaults to 0)
        pub fn dcm_ned_to_body(
            azimuth_rad: f64,
            elevation_rad: f64,
            roll_rad: Option<f64>,
        ) -> Matrix3<f64> {
            let roll = roll_rad.unwrap_or(0.0);

            let ca = azimuth_rad.cos();
            let sa = azimuth_rad.sin();
            let ce = elevation_rad.cos();
            let se = elevation_rad.sin();
            let cr = roll.cos();
            let sr = roll.sin();

            // Combined rotation: R_roll * R_elevation * R_azimuth
            Matrix3::new(
                ca * ce,
                sa * ce,
                -se,
                ca * se * sr - sa * cr,
                sa * se * sr + ca * cr,
                ce * sr,
                ca * se * cr + sa * sr,
                sa * se * cr - ca * sr,
                ce * cr,
            )
        }

        /// Calculate wind velocity in NED frame
        ///
        /// # Arguments
        /// * `wind_speed` - Wind speed [m/s]
        /// * `wind_direction` - Wind direction [deg] (meteorological convention: direction wind comes FROM)
        pub fn vel_wind_ned_frame(wind_speed: f64, wind_direction_deg: f64) -> Vector3<f64> {
            let wind_dir_rad = deg2rad(wind_direction_deg);
            Vector3::new(
                -wind_speed * wind_dir_rad.cos(), // North component
                -wind_speed * wind_dir_rad.sin(), // East component
                0.0,                              // Down component
            )
        }

        /// Convert relative air velocity to body frame
        pub fn vel_air_body_frame(
            dcm_ned_to_body: &Matrix3<f64>,
            vel_ecef_ned: &Vector3<f64>,
            vel_wind_ned: &Vector3<f64>,
        ) -> Vector3<f64> {
            dcm_ned_to_body * (vel_ecef_ned - vel_wind_ned)
        }

        /// Calculate angle of attack from air velocity in body frame
        ///
        /// # Returns
        /// Vector3 [alpha, beta, gamma] in radians
        /// - alpha: Angle of attack
        /// - beta: Sideslip angle  
        /// - gamma: Bank angle (always 0 for this simplified calculation)
        pub fn angle_of_attack(vel_air_body: &Vector3<f64>) -> Vector3<f64> {
            let vel_magnitude = vel_air_body.magnitude();

            if vel_magnitude < 0.01 || vel_air_body.x.abs() < 0.001 {
                return Vector3::zeros();
            }

            let alpha = (vel_air_body.z / vel_air_body.x).atan(); // pitch AoA
            let beta = (vel_air_body.y / vel_air_body.x).atan(); // yaw sideslip

            Vector3::new(alpha, beta, 0.0)
        }

        /// Initialize ECI position from LLH at launch
        pub fn pos_eci_init(pos_llh: &Vector3<f64>) -> Vector3<f64> {
            // At initialization, assume t=0 (no rotation from ECEF to ECI)
            Self::pos_llh_to_ecef(pos_llh)
        }

        /// Initialize ECI velocity from NED velocity and LLH position
        pub fn vel_eci_init(vel_ned: &Vector3<f64>, pos_llh: &Vector3<f64>) -> Vector3<f64> {
            let dcm_ecef_to_ned = Self::dcm_ecef_to_ned(pos_llh);
            let dcm_ned_to_ecef = dcm_ecef_to_ned.transpose();
            let pos_ecef = Self::pos_llh_to_ecef(pos_llh);

            // Convert NED velocity to ECEF
            let vel_ecef = dcm_ned_to_ecef * vel_ned;

            // Add Earth rotation effect
            let omega_cross_r =
                Vector3::new(-OMEGA_EARTH * pos_ecef.y, OMEGA_EARTH * pos_ecef.x, 0.0);

            vel_ecef + omega_cross_r
        }

        /// Surface distance between two LLH points using ECEF chord angle
        pub fn distance_surface(pos_llh0: &Vector3<f64>, pos_llh1: &Vector3<f64>) -> f64 {
            let pos0_ecef = Self::pos_llh_to_ecef(pos_llh0);
            let pos1_ecef = Self::pos_llh_to_ecef(pos_llh1);
            let dot = pos0_ecef.dot(&pos1_ecef);
            let n0 = pos0_ecef.magnitude();
            let n1 = pos1_ecef.magnitude();
            if n0 <= 0.0 || n1 <= 0.0 {
                return 0.0;
            }
            let cos_theta = (dot / (n0 * n1)).clamp(-1.0, 1.0);
            let theta = cos_theta.acos();
            WGS84_A * theta
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use approx::assert_relative_eq;

        #[test]
        fn test_dcm_eci_to_ecef() {
            // Test at t=0, should be identity
            let dcm = CoordinateTransform::dcm_eci_to_ecef(0.0);
            let identity = Matrix3::identity();
            assert_relative_eq!(dcm, identity, epsilon = 1e-12);

            // Test orthogonality
            assert_relative_eq!(dcm * dcm.transpose(), identity, epsilon = 1e-12);
        }

        #[test]
        fn test_llh_ecef_conversion() {
            // Test known point: Equator at prime meridian, sea level
            let llh = Vector3::new(0.0, 0.0, 0.0);
            let ecef = CoordinateTransform::pos_llh_to_ecef(&llh);
            let llh_converted = CoordinateTransform::pos_ecef_to_llh(&ecef);

            assert_relative_eq!(llh, llh_converted, epsilon = 1e-6);

            // Check expected ECEF coordinates at equator/prime meridian
            let expected_x = WGS84_A; // Earth's semi-major axis
            assert_relative_eq!(ecef.x, expected_x, epsilon = 1.0);
            assert_relative_eq!(ecef.y, 0.0, epsilon = 1.0);
            assert_relative_eq!(ecef.z, 0.0, epsilon = 1.0);
        }

        #[test]
        fn test_dcm_ecef_to_ned() {
            // Test at north pole
            let pos_llh = Vector3::new(90.0, 0.0, 0.0);
            let dcm = CoordinateTransform::dcm_ecef_to_ned(&pos_llh);

            // At north pole, ECEF Z should map to NED Down
            let ecef_z = Vector3::new(0.0, 0.0, 1.0);
            let ned = dcm * ecef_z;
            assert_relative_eq!(ned.x, 0.0, epsilon = 1e-10); // North
            assert_relative_eq!(ned.y, 0.0, epsilon = 1e-12); // East
            assert_relative_eq!(ned.z, -1.0, epsilon = 1e-12); // Down (ECEF Z maps to NED -Z)
        }

        #[test]
        fn test_wind_velocity() {
            // North wind at 10 m/s (wind FROM north)
            let wind_vel = CoordinateTransform::vel_wind_ned_frame(10.0, 0.0);
            assert_relative_eq!(wind_vel.x, -10.0, epsilon = 1e-12); // Southward
            assert_relative_eq!(wind_vel.y, 0.0, epsilon = 1e-12);
            assert_relative_eq!(wind_vel.z, 0.0, epsilon = 1e-12);

            // East wind at 5 m/s (wind FROM east)
            let wind_vel = CoordinateTransform::vel_wind_ned_frame(5.0, 90.0);
            assert_relative_eq!(wind_vel.x, 0.0, epsilon = 1e-12);
            assert_relative_eq!(wind_vel.y, -5.0, epsilon = 1e-12); // Westward
            assert_relative_eq!(wind_vel.z, 0.0, epsilon = 1e-12);
        }
    }
}

pub mod gravity {
    use crate::math::constants::*;
    use nalgebra::Vector3;

    /// WGS84 Earth gravity model
    ///
    /// Implements the WGS84 EGM96 gravity model with J2 perturbation
    /// for accurate gravity calculation in Earth-Centered Inertial (ECI) coordinates.
    pub struct GravityModel {
        /// Gravitational coefficient \bar{C}_{20} (normalized)
        pub bar_c20: f64,
    }

    impl Default for GravityModel {
        fn default() -> Self {
            Self::new()
        }
    }

    impl GravityModel {
        /// Create new WGS84 gravity model
        pub fn new() -> Self {
            GravityModel {
                // WGS84 EGM96 normalized gravitational coefficient
                bar_c20: -0.484165371736e-3,
            }
        }

        /// Calculate gravity vector in ECI coordinates
        ///
        /// Uses WGS84 EGM96 model with J2 perturbation to account for Earth's oblateness.
        ///
        /// # Arguments
        /// * `pos_eci` - Position vector in ECI coordinates [m]
        ///
        /// # Returns
        /// Gravity acceleration vector in ECI coordinates [m/s²]
        pub fn gravity_eci(&self, pos_eci: &Vector3<f64>) -> Vector3<f64> {
            let x = pos_eci.x;
            let y = pos_eci.y;
            let z = pos_eci.z;

            let r = (x * x + y * y + z * z).sqrt();

            // Handle degenerate case
            if r < 1e-10 {
                return Vector3::zeros();
            }

            // Unit position vector components
            let irx = x / r;
            let iry = y / r;
            let irz = z / r;

            // WGS84 constants
            let a = WGS84_A;
            let _one_f = 1.0 / WGS84_F;
            let f = WGS84_F;
            let b = a * (1.0 - f); // Polar radius

            // Ensure position is above Earth surface
            let effective_r = if r < b { b } else { r };

            // Normalized associated Legendre function \bar{P}_{20} and its derivative
            let bar_p20 = (5.0_f64).sqrt() * (3.0 * irz * irz - 1.0) * 0.5;
            let bar_p20_d = (5.0_f64).sqrt() * 3.0 * irz;

            // Gravity components
            let mu = MU_EARTH;
            let a_over_r_squared = (a / effective_r).powi(2);

            // Radial component of gravity
            let g_ir = -mu / (effective_r * effective_r)
                * (1.0 + self.bar_c20 * a_over_r_squared * (3.0 * bar_p20 + irz * bar_p20_d));

            // Z-component contribution from J2
            let g_iz =
                mu / (effective_r * effective_r) * a_over_r_squared * self.bar_c20 * bar_p20_d;

            Vector3::new(g_ir * irx, g_ir * iry, g_ir * irz + g_iz)
        }

        /// Calculate gravity magnitude at given altitude and latitude
        ///
        /// Simplified calculation for quick estimates.
        ///
        /// # Arguments
        /// * `altitude` - Altitude above sea level [m]
        /// * `latitude_rad` - Latitude in radians
        ///
        /// # Returns
        /// Gravity magnitude [m/s²]
        pub fn gravity_magnitude(&self, altitude: f64, latitude_rad: f64) -> f64 {
            let re = WGS84_A;
            let epsilon = WGS84_F;
            let j2 = -self.bar_c20 * (5.0_f64).sqrt(); // Convert from \bar{C}_{20} to J2

            // Distance from Earth center
            let r = altitude + re * (1.0 - epsilon * latitude_rad.sin().powi(2));

            // Central gravity with J2 perturbation
            let mu = MU_EARTH;
            let gc = mu / (r * r)
                * (1.0 - 1.5 * j2 * (re / r).powi(2) * (3.0 * latitude_rad.sin().powi(2) - 1.0));

            gc.abs()
        }

        /// Calculate surface gravity at given latitude
        ///
        /// # Arguments
        /// * `latitude_rad` - Latitude in radians
        ///
        /// # Returns
        /// Surface gravity [m/s²]
        pub fn surface_gravity(&self, latitude_rad: f64) -> f64 {
            self.gravity_magnitude(0.0, latitude_rad)
        }
    }

    /// Simple point mass gravity model (for comparison/testing)
    pub struct PointMassGravity;

    impl PointMassGravity {
        /// Calculate gravity for point mass model
        ///
        /// # Arguments
        /// * `pos_eci` - Position vector in ECI coordinates [m]
        ///
        /// # Returns
        /// Gravity acceleration vector [m/s²]
        pub fn gravity_eci(pos_eci: &Vector3<f64>) -> Vector3<f64> {
            let r_magnitude = pos_eci.magnitude();

            if r_magnitude < 1e-10 {
                return Vector3::zeros();
            }

            let unit_vector = pos_eci / r_magnitude;
            let gravity_magnitude = MU_EARTH / (r_magnitude * r_magnitude);

            -gravity_magnitude * unit_vector
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use approx::assert_relative_eq;

        #[test]
        fn test_surface_gravity() {
            let gravity_model = GravityModel::new();

            // Test at equator (latitude = 0)
            let g_equator = gravity_model.surface_gravity(0.0);
            assert_relative_eq!(g_equator, G0, epsilon = 0.1); // Should be close to standard gravity

            // Test at pole (latitude = π/2)
            let g_pole = gravity_model.surface_gravity(std::f64::consts::FRAC_PI_2);

            // Gravity at pole should be slightly higher than at equator due to Earth's oblateness
            assert!(g_pole > g_equator);
            assert_relative_eq!(g_pole, 9.832, epsilon = 0.01);
        }

        #[test]
        fn test_gravity_decreases_with_altitude() {
            let gravity_model = GravityModel::new();

            let g_surface = gravity_model.gravity_magnitude(0.0, 0.0);
            let g_10km = gravity_model.gravity_magnitude(10000.0, 0.0);
            let g_100km = gravity_model.gravity_magnitude(100000.0, 0.0);

            // Gravity should decrease with altitude
            assert!(g_surface > g_10km);
            assert!(g_10km > g_100km);
        }

        #[test]
        fn test_gravity_eci_vector() {
            let gravity_model = GravityModel::new();

            // Test at equator on Earth's surface
            let pos_eci = Vector3::new(WGS84_A, 0.0, 0.0); // On equator
            let gravity = gravity_model.gravity_eci(&pos_eci);

            // Gravity should point toward Earth center
            assert!(gravity.x < 0.0); // Points toward origin
            assert_relative_eq!(gravity.y, 0.0, epsilon = 1e-10); // No Y component
            assert_relative_eq!(gravity.z, 0.0, epsilon = 0.1); // Small Z component due to J2

            // Check magnitude
            let magnitude = gravity.magnitude();
            assert_relative_eq!(magnitude, G0, epsilon = 0.1);
        }

        #[test]
        fn test_point_mass_vs_wgs84() {
            let gravity_model = GravityModel::new();

            // At very high altitudes, WGS84 model should approach point mass model
            let high_altitude_pos = Vector3::new(0.0, 0.0, WGS84_A + 1000000.0); // 1000 km altitude

            let gravity_wgs84 = gravity_model.gravity_eci(&high_altitude_pos);
            let gravity_point_mass = PointMassGravity::gravity_eci(&high_altitude_pos);

            // At high altitude, difference should be small
            let relative_error =
                (gravity_wgs84 - gravity_point_mass).magnitude() / gravity_point_mass.magnitude();
            assert!(relative_error < 0.01); // Less than 1% difference
        }

        #[test]
        fn test_underground_protection() {
            let gravity_model = GravityModel::new();

            // Test position underground (should be clamped to surface)
            let underground_pos = Vector3::new(1000000.0, 0.0, 0.0); // Much closer than Earth radius
            let gravity = gravity_model.gravity_eci(&underground_pos);

            // Should not blow up to infinity
            assert!(gravity.magnitude() < 100.0); // Reasonable upper bound
            assert!(gravity.magnitude() > 1.0); // Should still be significant
        }

        #[test]
        fn test_j2_effect() {
            let gravity_model = GravityModel::new();
            // Compare at pole vs equator
            let pos_pole = Vector3::new(0.0, 0.0, WGS84_A);
            let pos_equator = Vector3::new(WGS84_A, 0.0, 0.0);

            let gravity_pole_wgs84 = gravity_model.gravity_eci(&pos_pole);
            let gravity_equator_wgs84 = gravity_model.gravity_eci(&pos_equator);

            let gravity_pole_point = PointMassGravity::gravity_eci(&pos_pole);
            let gravity_equator_point = PointMassGravity::gravity_eci(&pos_equator);

            // WGS84 should show difference between pole and equator
            let wgs84_ratio = gravity_pole_wgs84.magnitude() / gravity_equator_wgs84.magnitude();
            let point_ratio = gravity_pole_point.magnitude() / gravity_equator_point.magnitude();

            // WGS84 ratio should be different from 1.0 (point mass ratio)
            assert!((wgs84_ratio - 1.0).abs() > (point_ratio - 1.0).abs());
        }
    }
}

pub use coordinates::CoordinateTransform;
