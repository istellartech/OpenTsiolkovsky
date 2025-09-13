//! Linear algebra helper functions using nalgebra
//!
//! Provides convenient wrappers and additional functionality
//! for common vector/matrix operations in rocket flight simulation.

use nalgebra::{Matrix3, Vector3};

/// Convert degrees to radians
pub fn deg2rad(degrees: f64) -> f64 {
    degrees * std::f64::consts::PI / 180.0
}

/// Convert radians to degrees
pub fn rad2deg(radians: f64) -> f64 {
    radians * 180.0 / std::f64::consts::PI
}

/// Create rotation matrix around X-axis
pub fn rotation_x(angle_rad: f64) -> Matrix3<f64> {
    let c = angle_rad.cos();
    let s = angle_rad.sin();

    Matrix3::new(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c)
}

/// Create rotation matrix around Y-axis
pub fn rotation_y(angle_rad: f64) -> Matrix3<f64> {
    let c = angle_rad.cos();
    let s = angle_rad.sin();

    Matrix3::new(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c)
}

/// Create rotation matrix around Z-axis
pub fn rotation_z(angle_rad: f64) -> Matrix3<f64> {
    let c = angle_rad.cos();
    let s = angle_rad.sin();

    Matrix3::new(c, -s, 0.0, s, c, 0.0, 0.0, 0.0, 1.0)
}

/// Create skew-symmetric matrix from vector
/// Used for cross product: a × b = [a]× * b
pub fn skew_symmetric(v: &Vector3<f64>) -> Matrix3<f64> {
    Matrix3::new(0.0, -v.z, v.y, v.z, 0.0, -v.x, -v.y, v.x, 0.0)
}

/// Normalize angle to [-π, π) range
pub fn normalize_angle(angle: f64) -> f64 {
    let two_pi = 2.0 * std::f64::consts::PI;
    let result = angle % two_pi;

    if result > std::f64::consts::PI {
        result - two_pi
    } else if result <= -std::f64::consts::PI {
        result + two_pi
    } else {
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn test_angle_conversion() {
        assert_relative_eq!(deg2rad(180.0), std::f64::consts::PI, epsilon = 1e-12);
        assert_relative_eq!(rad2deg(std::f64::consts::PI), 180.0, epsilon = 1e-12);
    }

    #[test]
    fn test_rotation_matrices() {
        let angle = std::f64::consts::PI / 4.0; // 45 degrees

        // Test that rotation matrices are orthogonal (R * R^T = I)
        let rx = rotation_x(angle);
        let ry = rotation_y(angle);
        let rz = rotation_z(angle);

        let identity = Matrix3::identity();

        assert_relative_eq!((rx * rx.transpose()), identity, epsilon = 1e-12);
        assert_relative_eq!((ry * ry.transpose()), identity, epsilon = 1e-12);
        assert_relative_eq!((rz * rz.transpose()), identity, epsilon = 1e-12);
    }

    #[test]
    fn test_skew_symmetric() {
        let a = Vector3::new(1.0, 2.0, 3.0);
        let b = Vector3::new(4.0, 5.0, 6.0);

        let cross_product = a.cross(&b);
        let skew_a = skew_symmetric(&a);
        let cross_via_skew = skew_a * b;

        assert_relative_eq!(cross_product, cross_via_skew, epsilon = 1e-12);
    }

    #[test]
    fn test_normalize_angle() {
        let pi = std::f64::consts::PI;

        // Test basic functionality - angles in range should stay the same
        assert_relative_eq!(normalize_angle(pi / 2.0), pi / 2.0, epsilon = 1e-12);
        assert_relative_eq!(normalize_angle(-pi / 2.0), -pi / 2.0, epsilon = 1e-12);

        // Test that the function constrains angles to the correct range
        let result1 = normalize_angle(3.0 * pi);
        assert!(result1 > -pi && result1 <= pi);

        let result2 = normalize_angle(-3.0 * pi);
        assert!(result2 > -pi && result2 <= pi);
    }
}
