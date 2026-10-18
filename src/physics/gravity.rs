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
        let g_iz = mu / (effective_r * effective_r) * a_over_r_squared * self.bar_c20 * bar_p20_d;

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
