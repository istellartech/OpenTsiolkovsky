use nalgebra::{Vector3, Matrix3};
use crate::math::{deg2rad, rad2deg};
use crate::math::constants::*;

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
        
        Matrix3::new(
            cos_theta, sin_theta, 0.0,
            -sin_theta, cos_theta, 0.0,
            0.0, 0.0, 1.0
        )
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
        
        let lat_rad = (z + ed2 * b * theta.sin().powi(3)).atan2(
            p - e2 * a * theta.cos().powi(3)
        );
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
            -sin_lat * cos_lon, -sin_lat * sin_lon,  cos_lat,
            -sin_lon,            cos_lon,            0.0,
            -cos_lat * cos_lon, -cos_lat * sin_lon, -sin_lat
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
        dcm_eci_to_ned: &Matrix3<f64>
    ) -> Vector3<f64> {
        // Earth rotation angular velocity tensor
        let omega_tensor = Matrix3::new(
            0.0, -OMEGA_EARTH, 0.0,
            OMEGA_EARTH, 0.0, 0.0,
            0.0, 0.0, 0.0
        );
        
        // Transform to NED frame accounting for Earth rotation
        dcm_eci_to_ned * (vel_eci - omega_tensor * pos_eci)
    }
    
    /// NED to BODY Direction Cosine Matrix
    /// 
    /// # Arguments
    /// * `azimuth_rad` - Azimuth angle [rad] (0 = North, positive clockwise)
    /// * `elevation_rad` - Elevation angle [rad] (positive = up from horizontal)
    /// * `roll_rad` - Roll angle [rad] (optional, defaults to 0)
    pub fn dcm_ned_to_body(azimuth_rad: f64, elevation_rad: f64, roll_rad: Option<f64>) -> Matrix3<f64> {
        let roll = roll_rad.unwrap_or(0.0);
        
        let ca = azimuth_rad.cos();
        let sa = azimuth_rad.sin();
        let ce = elevation_rad.cos();
        let se = elevation_rad.sin();
        let cr = roll.cos();
        let sr = roll.sin();
        
        // Combined rotation: R_roll * R_elevation * R_azimuth
        Matrix3::new(
            ca * ce,  sa * ce, -se,
            ca * se * sr - sa * cr,  sa * se * sr + ca * cr,  ce * sr,
            ca * se * cr + sa * sr,  sa * se * cr - ca * sr,  ce * cr
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
            0.0                               // Down component
        )
    }
    
    /// Convert relative air velocity to body frame
    pub fn vel_air_body_frame(
        dcm_ned_to_body: &Matrix3<f64>,
        vel_ecef_ned: &Vector3<f64>,
        vel_wind_ned: &Vector3<f64>
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
        
        let alpha = (vel_air_body.z / vel_air_body.x).atan();  // pitch AoA
        let beta = (vel_air_body.y / vel_air_body.x).atan();   // yaw sideslip
        
        Vector3::new(alpha, beta, 0.0)
    }
    
    /// Initialize ECI position from LLH at launch
    pub fn pos_eci_init(pos_llh: &Vector3<f64>) -> Vector3<f64> {
        let pos_ecef = Self::pos_llh_to_ecef(pos_llh);
        // At initialization, assume t=0 (no rotation from ECEF to ECI)
        pos_ecef
    }
    
    /// Initialize ECI velocity from NED velocity and LLH position
    pub fn vel_eci_init(vel_ned: &Vector3<f64>, pos_llh: &Vector3<f64>) -> Vector3<f64> {
        let dcm_ecef_to_ned = Self::dcm_ecef_to_ned(pos_llh);
        let dcm_ned_to_ecef = dcm_ecef_to_ned.transpose();
        let pos_ecef = Self::pos_llh_to_ecef(pos_llh);
        
        // Convert NED velocity to ECEF
        let vel_ecef = dcm_ned_to_ecef * vel_ned;
        
        // Add Earth rotation effect
        let omega_cross_r = Vector3::new(
            -OMEGA_EARTH * pos_ecef.y,
            OMEGA_EARTH * pos_ecef.x,
            0.0
        );
        
        vel_ecef + omega_cross_r
    }

    /// Surface distance between two LLH points using ECEF chord angle
    pub fn distance_surface(pos_llh0: &Vector3<f64>, pos_llh1: &Vector3<f64>) -> f64 {
        let pos0_ecef = Self::pos_llh_to_ecef(pos_llh0);
        let pos1_ecef = Self::pos_llh_to_ecef(pos_llh1);
        let dot = pos0_ecef.dot(&pos1_ecef);
        let n0 = pos0_ecef.magnitude();
        let n1 = pos1_ecef.magnitude();
        if n0 <= 0.0 || n1 <= 0.0 { return 0.0; }
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
        assert_relative_eq!(ned.x, 0.0, epsilon = 1e-10);   // North
        assert_relative_eq!(ned.y, 0.0, epsilon = 1e-12);   // East
        assert_relative_eq!(ned.z, -1.0, epsilon = 1e-12);  // Down (ECEF Z maps to NED -Z)
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
