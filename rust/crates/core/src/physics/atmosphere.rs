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

        AtmosphericConditions {
            temperature,
            pressure,
            density,
            speed_of_sound,
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
