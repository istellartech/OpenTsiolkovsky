use crate::math::constants::*;

/// Which standard atmosphere `AtmosphereModel` evaluates
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum AtmosphereKind {
    /// U.S. Standard Atmosphere 1976: layers in geopotential altitude
    /// up to 86 km, tabulated values (log-linear) from 86 to 1000 km
    #[default]
    Ussa1976,
    /// As the C++ simulator: the 1976 layers evaluated at the geometric
    /// altitude, isothermal (186.95 K) above 84.852 km
    Legacy,
}

/// U.S. Standard Atmosphere 1976 above 86 km: geometric altitude [m],
/// temperature [K], pressure [Pa], density [kg/m³]
const USSA1976_UPPER: [[f64; 4]; 23] = [
    [86_000.0, 186.87, 3.7338e-1, 6.958e-6],
    [90_000.0, 186.87, 1.8359e-1, 3.416e-6],
    [95_000.0, 188.42, 7.5966e-2, 1.393e-6],
    [100_000.0, 195.08, 3.2011e-2, 5.604e-7],
    [110_000.0, 240.00, 7.1042e-3, 9.708e-8],
    [120_000.0, 360.00, 2.5382e-3, 2.222e-8],
    [130_000.0, 469.27, 1.2505e-3, 8.152e-9],
    [140_000.0, 559.63, 7.2028e-4, 3.831e-9],
    [150_000.0, 634.39, 4.5422e-4, 2.076e-9],
    [160_000.0, 696.29, 3.0395e-4, 1.233e-9],
    [180_000.0, 790.07, 1.5271e-4, 5.194e-10],
    [200_000.0, 854.56, 8.4736e-5, 2.541e-10],
    [250_000.0, 941.33, 2.4767e-5, 6.073e-11],
    [300_000.0, 976.01, 8.7704e-6, 1.916e-11],
    [350_000.0, 990.06, 3.4518e-6, 7.014e-12],
    [400_000.0, 995.83, 1.4518e-6, 2.803e-12],
    [450_000.0, 998.22, 6.4468e-7, 1.184e-12],
    [500_000.0, 999.24, 3.0236e-7, 5.215e-13],
    [600_000.0, 999.85, 8.2130e-8, 1.137e-13],
    [700_000.0, 999.97, 3.1908e-8, 3.070e-14],
    [800_000.0, 999.99, 1.7036e-8, 1.136e-14],
    [900_000.0, 1000.0, 1.0873e-8, 5.759e-15],
    [1_000_000.0, 1000.0, 7.5138e-9, 3.561e-15],
];

/// Effective Earth radius of the geopotential altitude [m]
const R0_GEOPOTENTIAL: f64 = 6_356_766.0;

/// International Standard Atmosphere (ISA) Model
///
/// The 1976 standard atmosphere layers (ISO 2533) up to 84.852 km
/// geopotential altitude; see `AtmosphereKind` for the altitude used
/// and the upper atmosphere.
#[derive(Debug, Clone)]
pub struct AtmosphereModel {
    kind: AtmosphereKind,
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
pub struct AtmosphericConditions<T = f64> {
    pub temperature: T,    // [K]
    pub pressure: T,       // [Pa]
    pub density: T,        // [kg/m³]
    pub speed_of_sound: T, // [m/s]
}

impl Default for AtmosphereModel {
    fn default() -> Self {
        Self::with_kind(AtmosphereKind::default())
    }
}

impl AtmosphereModel {
    /// Standard atmosphere of the given kind
    pub fn with_kind(kind: AtmosphereKind) -> Self {
        AtmosphereModel {
            kind,
            // Height of atmospheric layers [m]
            height_layers: [
                0.0, 11000.0, 20000.0, 32000.0, 47000.0, 51000.0, 71000.0, 84852.0,
            ],
            // Temperature lapse rates [K/m]
            lapse_rates: [-0.0065, 0.0, 0.001, 0.0028, 0.0, -0.0028, -0.002, 0.0],
            // Base temperatures [K]
            base_temperatures: [
                288.15, 216.65, 216.65, 228.65, 270.65, 270.65, 214.65, 186.95,
            ],
            // Base pressures [Pa]
            base_pressures: [
                101325.0, 22632.0, 5474.9, 868.02, 110.91, 66.939, 3.9564, 0.3734,
            ],
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
        self.conditions_scalar(altitude)
    }

    pub fn conditions_scalar<T: super::Scalar>(&self, altitude: T) -> AtmosphericConditions<T> {
        // Handle negative altitude (below sea level) by using sea level conditions
        let altitude = if altitude.re() < 0.0 {
            T::from(0.0)
        } else {
            altitude
        };
        let effective_altitude = match self.kind {
            AtmosphereKind::Legacy => altitude,
            AtmosphereKind::Ussa1976 if altitude.re() >= USSA1976_UPPER[0][0] => {
                return self.upper_conditions(altitude);
            }
            AtmosphereKind::Ussa1976 => altitude * R0_GEOPOTENTIAL / (altitude + R0_GEOPOTENTIAL),
        };

        let layer_index = self.determine_layer(effective_altitude.re());

        let h = effective_altitude;
        let h_base = self.height_layers[layer_index];
        let t_base = self.base_temperatures[layer_index];
        let p_base = self.base_pressures[layer_index];
        let lapse_rate = self.lapse_rates[layer_index];

        // Temperature calculation
        let temperature = T::from(t_base) + (h - h_base) * lapse_rate;

        // Pressure calculation
        let pressure = if lapse_rate.abs() < 1e-10 {
            // Isothermal layer (zero lapse rate)
            ((h - h_base) * -(G0 / self.gas_constant) / t_base).exp() * p_base
        } else {
            // Non-isothermal layer
            let temp_ratio = temperature / t_base;
            temp_ratio.powf(-G0 / (lapse_rate * self.gas_constant)) * p_base
        };

        // Density from ideal gas law
        let density = pressure / (temperature * self.gas_constant);

        // Speed of sound
        let speed_of_sound = (temperature * (self.gamma * self.gas_constant)).sqrt();

        AtmosphericConditions {
            temperature,
            pressure,
            density,
            speed_of_sound,
        }
    }

    /// USSA 1976 above 86 km: log-linear in pressure and density,
    /// linear in temperature; extrapolated with the last segment
    fn upper_conditions<T: super::Scalar>(&self, altitude: T) -> AtmosphericConditions<T> {
        let t = &USSA1976_UPPER;
        let n = t.len();
        let i = t
            .partition_point(|row| row[0] <= altitude.re())
            .clamp(1, n - 1)
            - 1;
        let (a, b) = (t[i], t[i + 1]);
        let f = (altitude - a[0]) / (b[0] - a[0]);
        let temperature = if f.re() <= 1.0 {
            T::from(a[1]) + f * (b[1] - a[1])
        } else {
            T::from(b[1])
        };
        let log_interp = |x0: f64, x1: f64| (T::from(x0.ln()) + f * (x1.ln() - x0.ln())).exp();
        AtmosphericConditions {
            temperature,
            pressure: log_interp(a[2], b[2]),
            density: log_interp(a[3], b[3]),
            speed_of_sound: (temperature * (self.gamma * self.gas_constant)).sqrt(),
        }
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

    /// Conditions with the density scaled by `1 + percent / 100`
    pub fn conditions_with_percent<T: super::Scalar>(
        &self,
        altitude: T,
        percent: T,
    ) -> AtmosphericConditions<T> {
        let mut conditions = self.conditions_scalar(altitude);
        conditions.density *= T::from(1.0) + percent / 100.0;
        conditions
    }

    /// Calculate atmospheric conditions with density variation
    ///
    /// # Arguments
    /// * `altitude` - Geometric altitude [m]
    /// * `variation_percent` - Density variation percentage [-100 to +100]
    ///
    /// # Returns
    /// Atmospheric conditions with modified density
    pub fn conditions_with_variation<T: super::Scalar>(
        &self,
        altitude: T,
        variation_percent: f64,
    ) -> AtmosphericConditions<T> {
        let mut conditions = self.conditions_scalar(altitude);
        let variation_coeff = self.density_variation_coefficient(altitude, variation_percent);
        conditions.density *= T::from(1.0) + variation_coeff;
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
    fn density_variation_coefficient<T: super::Scalar>(
        &self,
        altitude: T,
        input_percent: f64,
    ) -> T {
        if input_percent.abs() < 1e-10 {
            return T::from(0.0);
        }

        // Data from U.S. Standard Atmosphere - negative variation
        let minus_x = [
            21.6, 7.4, -1.3, -14.3, -15.9, -18.6, -32.1, -38.6, -50.0, -55.3, -65.0, -68.1, -76.7,
            -42.2,
        ];
        let minus_y = [
            1010.0, 4300.0, 8030.0, 10220.0, 16360.0, 20300.0, 26220.0, 29950.0, 40250.0, 50110.0,
            59970.0, 70270.0, 80140.0, 90220.0,
        ];

        // Data from U.S. Standard Atmosphere - positive variation
        let plus_x = [
            -12.8, -7.9, 1.5, 5.3, 26.7, 20.2, 14.3, 18.2, 33.6, 47.4, 59.5, 72.2, 58.7, 41.4,
        ];
        let plus_y = [
            1230.0, 4300.0, 8030.0, 10000.0, 16360.0, 20300.0, 26220.0, 29950.0, 40250.0, 50110.0,
            59970.0, 70270.0, 80360.0, 90880.0,
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
fn linear_interpolate<T: super::Scalar>(y: T, y_array: &[f64], x_array: &[f64]) -> T {
    let n = y_array.len();

    // Handle boundary cases
    if y.re() <= y_array[0] {
        return T::from(x_array[0]);
    }
    if y.re() >= y_array[n - 1] {
        return T::from(x_array[n - 1]);
    }

    // Find interval for interpolation
    for i in 0..n - 1 {
        if y.re() >= y_array[i] && y.re() <= y_array[i + 1] {
            let t = (y - y_array[i]) / (y_array[i + 1] - y_array[i]);
            return T::from(x_array[i]) + t * (x_array[i + 1] - x_array[i]);
        }
    }

    T::from(x_array[n - 1])
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn test_sea_level_conditions() {
        let atm = AtmosphereModel::with_kind(AtmosphereKind::Legacy);
        let conditions = atm.conditions(0.0);

        // Test against standard sea level conditions
        assert_relative_eq!(conditions.temperature, STD_TEMPERATURE_SL, epsilon = 0.01);
        assert_relative_eq!(conditions.pressure, STD_PRESSURE_SL, epsilon = 1.0);
        assert_relative_eq!(conditions.density, STD_DENSITY_SL, epsilon = 0.001);
    }

    #[test]
    fn test_temperature_profile() {
        let atm = AtmosphereModel::with_kind(AtmosphereKind::Legacy);

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
        let atm = AtmosphereModel::with_kind(AtmosphereKind::Legacy);

        let density_0 = atm.density(0.0);
        let density_10km = atm.density(10000.0);
        let density_20km = atm.density(20000.0);

        // Density should decrease with altitude
        assert!(density_0 > density_10km);
        assert!(density_10km > density_20km);
    }

    #[test]
    fn test_speed_of_sound() {
        let atm = AtmosphereModel::with_kind(AtmosphereKind::Legacy);

        // At sea level, speed of sound should be ~340 m/s
        let sound_speed_sl = atm.speed_of_sound(0.0);
        assert_relative_eq!(sound_speed_sl, 340.3, epsilon = 1.0);
    }

    #[test]
    fn test_linear_interpolation() {
        let y_vals = [0.0, 10.0, 20.0, 30.0];
        let x_vals = [0.0, 1.0, 4.0, 9.0];

        // Test exact points
        assert_relative_eq!(
            linear_interpolate(10.0, &y_vals, &x_vals),
            1.0,
            epsilon = 1e-12
        );

        // Test midpoint
        assert_relative_eq!(
            linear_interpolate(15.0, &y_vals, &x_vals),
            2.5,
            epsilon = 1e-12
        );

        // Test boundary cases
        assert_relative_eq!(
            linear_interpolate(-5.0, &y_vals, &x_vals),
            0.0,
            epsilon = 1e-12
        );
        assert_relative_eq!(
            linear_interpolate(35.0, &y_vals, &x_vals),
            9.0,
            epsilon = 1e-12
        );
    }

    #[test]
    fn test_ussa1976_geopotential_and_upper_atmosphere() {
        let atm = AtmosphereModel::with_kind(AtmosphereKind::Ussa1976);
        // USSA 1976 table values (geometric altitude)
        for (z, t, p, rho) in [
            (10_000.0, 223.252, 26_499.9, 0.413510),
            (30_000.0, 226.509, 1_197.03, 1.84101e-2),
            (50_000.0, 270.650, 79.7787, 1.02688e-3),
            (80_000.0, 198.639, 1.05247, 1.84580e-5),
            (100_000.0, 195.08, 3.2011e-2, 5.604e-7),
            (300_000.0, 976.01, 8.7704e-6, 1.916e-11),
        ] {
            let c = atm.conditions(z);
            assert_relative_eq!(c.temperature, t, max_relative = 2e-4);
            assert_relative_eq!(c.pressure, p, max_relative = 2e-3);
            assert_relative_eq!(c.density, rho, max_relative = 3e-3);
        }
        // Continuous across 86 km
        let below = atm.conditions(85_999.0).density;
        let above = atm.conditions(86_000.0).density;
        assert_relative_eq!(below, above, max_relative = 2e-3);

        // The legacy model evaluates the layers at the geometric altitude
        let legacy = AtmosphereModel::with_kind(AtmosphereKind::Legacy);
        assert!(legacy.conditions(80_000.0).density < atm.conditions(80_000.0).density);
    }

    #[test]
    fn test_density_variation() {
        let atm = AtmosphereModel::with_kind(AtmosphereKind::Legacy);

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
