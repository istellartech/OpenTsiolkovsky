use crate::math::constants::*;
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
        Self::dcm_eci_to_ecef_scalar(time_seconds)
    }

    pub fn dcm_eci_to_ecef_scalar<T: super::Scalar>(time_seconds: T) -> Matrix3<T> {
        let theta = time_seconds * OMEGA_EARTH;
        let cos_theta = theta.cos();
        let sin_theta = theta.sin();

        Matrix3::new(
            cos_theta,
            sin_theta,
            T::from(0.0),
            -sin_theta,
            cos_theta,
            T::from(0.0),
            T::from(0.0),
            T::from(0.0),
            T::from(1.0),
        )
    }

    /// Convert ECI position to ECEF
    pub fn pos_eci_to_ecef(pos_eci: &Vector3<f64>, time_seconds: f64) -> Vector3<f64> {
        Self::pos_eci_to_ecef_scalar(pos_eci, time_seconds)
    }

    pub fn pos_eci_to_ecef_scalar<T: super::Scalar>(
        pos_eci: &Vector3<T>,
        time_seconds: T,
    ) -> Vector3<T> {
        let dcm = Self::dcm_eci_to_ecef_scalar(time_seconds);
        dcm * pos_eci
    }

    /// Convert ECEF position to LLH (Latitude, Longitude, Height)
    ///
    /// Bowring's closed-form latitude (sub-millimetre near the Earth);
    /// the height formula holds at the poles too
    ///
    /// # Arguments
    /// * `pos_ecef` - ECEF position [m]
    ///
    /// # Returns
    /// LLH position [deg, deg, m] (latitude, longitude, height)
    pub fn pos_ecef_to_llh(pos_ecef: &Vector3<f64>) -> Vector3<f64> {
        Self::pos_ecef_to_llh_scalar(pos_ecef)
    }

    pub fn pos_ecef_to_llh_scalar<T: super::Scalar>(pos_ecef: &Vector3<T>) -> Vector3<T> {
        let x = pos_ecef.x;
        let y = pos_ecef.y;
        let z = pos_ecef.z;

        let a = T::from(WGS84_A);
        let b = a * (1.0 - WGS84_F);
        let e2 = T::from(WGS84_E2);
        let ed2 = e2 * a * a / (b * b); // Second eccentricity squared

        let p = (x * x + y * y).sqrt();
        let theta = (z * a).atan2(p * b);

        let lat_rad = (z + ed2 * b * theta.sin().powi(3)).atan2(p - e2 * a * theta.cos().powi(3));
        let lon_rad = y.atan2(x);

        // h = p cos(lat) + z sin(lat) - a sqrt(1 - e² sin²(lat))
        let (sin_lat, cos_lat) = lat_rad.sin_cos();
        let height = p * cos_lat + z * sin_lat - a * (T::from(1.0) - e2 * sin_lat * sin_lat).sqrt();

        Vector3::new(
            lat_rad * (180.0 / std::f64::consts::PI),
            lon_rad * (180.0 / std::f64::consts::PI),
            height,
        )
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
        Self::dcm_ecef_to_ned_scalar(pos_llh)
    }

    pub fn dcm_ecef_to_ned_scalar<T: super::Scalar>(pos_llh: &Vector3<T>) -> Matrix3<T> {
        let lat = pos_llh.x * (std::f64::consts::PI / 180.0);
        let lon = pos_llh.y * (std::f64::consts::PI / 180.0);

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
            T::from(0.0),
            -cos_lat * cos_lon,
            -cos_lat * sin_lon,
            -sin_lat,
        )
    }

    /// ECI to NED Direction Cosine Matrix
    pub fn dcm_eci_to_ned(pos_llh: &Vector3<f64>, time_seconds: f64) -> Matrix3<f64> {
        Self::dcm_eci_to_ned_scalar(pos_llh, time_seconds)
    }

    pub fn dcm_eci_to_ned_scalar<T: super::Scalar>(
        pos_llh: &Vector3<T>,
        time_seconds: T,
    ) -> Matrix3<T> {
        let dcm_ecef_to_ned = Self::dcm_ecef_to_ned_scalar(pos_llh);
        let dcm_eci_to_ecef = Self::dcm_eci_to_ecef_scalar(time_seconds);
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
        Self::vel_eci_to_ecef_ned_frame_scalar(pos_eci, vel_eci, dcm_eci_to_ned)
    }

    pub fn vel_eci_to_ecef_ned_frame_scalar<T: super::Scalar>(
        pos_eci: &Vector3<T>,
        vel_eci: &Vector3<T>,
        dcm_eci_to_ned: &Matrix3<T>,
    ) -> Vector3<T> {
        // Earth rotation angular velocity tensor
        let omega_tensor = Matrix3::new(
            T::from(0.0),
            T::from(-OMEGA_EARTH),
            T::from(0.0),
            T::from(OMEGA_EARTH),
            T::from(0.0),
            T::from(0.0),
            T::from(0.0),
            T::from(0.0),
            T::from(0.0),
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
    pub fn dcm_ned_to_body(
        azimuth_rad: f64,
        elevation_rad: f64,
        roll_rad: Option<f64>,
    ) -> Matrix3<f64> {
        Self::dcm_ned_to_body_scalar(azimuth_rad, elevation_rad, roll_rad)
    }

    pub fn dcm_ned_to_body_scalar<T: super::Scalar>(
        azimuth_rad: T,
        elevation_rad: T,
        roll_rad: Option<T>,
    ) -> Matrix3<T> {
        let roll = roll_rad.unwrap_or(T::from(0.0));

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

    /// Azimuth, elevation and roll [rad] of a NED to body DCM (inverse
    /// of `dcm_ned_to_body`); azimuth in [0, 2π)
    pub fn azimuth_elevation_roll(dcm_ned_to_body: &Matrix3<f64>) -> Vector3<f64> {
        let d = dcm_ned_to_body;
        let elevation = (-d[(0, 2)]).clamp(-1.0, 1.0).asin();
        let azimuth = d[(0, 1)].atan2(d[(0, 0)]).rem_euclid(std::f64::consts::TAU);
        let roll = d[(1, 2)].atan2(d[(2, 2)]);
        Vector3::new(azimuth, elevation, roll)
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

    /// Angles of the airflow from air velocity in body frame
    ///
    /// # Returns
    /// Vector3 [alpha, beta, gamma] in radians (as in the C++ simulator)
    /// - alpha: angle of attack in the body X-Z plane, `atan2(w, u)`
    /// - beta: sideslip in the body X-Y plane, `atan2(v, u)`
    /// - gamma: total angle between the body axis and the airflow
    pub fn angle_of_attack(vel_air_body: &Vector3<f64>) -> Vector3<f64> {
        Self::angle_of_attack_scalar(vel_air_body)
    }

    pub fn angle_of_attack_scalar<T: super::Scalar>(vel_air_body: &Vector3<T>) -> Vector3<T> {
        let (u, v, w) = (vel_air_body.x, vel_air_body.y, vel_air_body.z);
        if super::norm(vel_air_body) < 0.01 || u.abs() < 0.001 {
            return Vector3::zeros();
        }
        let cross = super::norm(&Vector3::new(T::from(0.0), v, w));
        Vector3::new(w.atan2(u), v.atan2(u), cross.atan2(u))
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
        let omega_cross_r = Vector3::new(-OMEGA_EARTH * pos_ecef.y, OMEGA_EARTH * pos_ecef.x, 0.0);

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

    /// Instantaneous impact point (IIP) on the WGS84 ellipsoid
    ///
    /// Ported from `posLLH_IIP` in the legacy C++ simulator: propagates a
    /// Keplerian (vacuum) ellipse from the current state and iterates the
    /// intersection with the Earth ellipsoid, accounting for Earth rotation
    /// during the time of flight.
    ///
    /// # Arguments
    /// * `pos_ecef` - Position in ECEF [m]
    /// * `vel_ecef` - Velocity relative to the Earth, in ECEF frame [m/s]
    ///
    /// # Returns
    /// `Some([lat_deg, lon_deg, 0.0])`, or `None` when no impact point exists
    /// (below the surface, escape trajectory, perigee above the surface, or
    /// the iteration does not converge)
    pub fn pos_llh_iip(pos_ecef: &Vector3<f64>, vel_ecef: &Vector3<f64>) -> Option<Vector3<f64>> {
        const N_ITER: usize = 5;
        let ra = WGS84_A;
        let rb = ra * (1.0 - WGS84_F);
        let e2 = WGS84_E2;
        let mu = MU_EARTH;
        let omega_vec = Vector3::new(0.0, 0.0, OMEGA_EARTH);

        // Initial approximation of the geocentric radius at impact
        let mut r_k1 = rb;

        let r0 = pos_ecef.magnitude();
        if r0 < r_k1 {
            return None; // below the Earth's surface
        }

        // Inertial velocity expressed in the (instantaneous) ECEF frame
        let vel_inertial = vel_ecef + omega_vec.cross(pos_ecef);
        let v0 = vel_inertial.magnitude();

        // Eccentricity times cosine of the eccentric anomaly at epoch
        let eps_cos = r0 * v0 * v0 / mu - 1.0;
        if eps_cos >= 1.0 {
            return None; // parabolic or hyperbolic trajectory
        }

        // Semi-major axis of the trajectory ellipse
        let a_t = r0 / (1.0 - eps_cos);
        // Eccentricity times sine of the eccentric anomaly at epoch
        let eps_sin = pos_ecef.dot(&vel_inertial) / (mu * a_t).sqrt();
        let eps2 = eps_cos * eps_cos + eps_sin * eps_sin;
        if eps2.sqrt() <= 1.0 && a_t * (1.0 - eps2.sqrt()) - ra >= 0.0 {
            return None; // perigee above the surface
        }

        let sqrt_a3_mu = (a_t * a_t * a_t / mu).sqrt();
        let mut eps_k_sin = 0.0;
        let mut delta_eps_k_cos = 0.0;
        let mut delta_eps_k_sin = 0.0;
        let mut impact = Vector3::zeros();
        let mut r_k2 = r_k1;
        let mut r_k1_prev = r_k1;

        for _ in 0..N_ITER {
            // Eccentric anomaly terms at impact
            let eps_k_cos = (a_t - r_k1) / a_t;
            let disc = eps2 - eps_k_cos * eps_k_cos;
            if disc < 0.0 {
                return None; // trajectory does not intersect the surface
            }
            eps_k_sin = -disc.sqrt();

            // Difference between eccentric anomalies at impact and epoch
            delta_eps_k_cos = (eps_k_cos * eps_cos + eps_k_sin * eps_sin) / eps2;
            delta_eps_k_sin = (eps_k_sin * eps_cos - eps_k_cos * eps_sin) / eps2;

            // f and g series of Kepler's equations
            let f_series = (delta_eps_k_cos - eps_cos) / (1.0 - eps_cos);
            let g_series = (delta_eps_k_sin + eps_sin - eps_k_sin) * sqrt_a3_mu;

            impact = f_series * pos_ecef + g_series * vel_inertial;

            // Geocentric radius of the ellipsoid at the impact latitude
            let z_ratio = impact.z / r_k1;
            r_k2 = ra / ((e2 / (1.0 - e2)) * z_ratio * z_ratio + 1.0).sqrt();

            r_k1_prev = r_k1;
            r_k1 = r_k2;
        }

        if (r_k1_prev - r_k2).abs() > 1.0 {
            return None; // not converged
        }

        let delta_eps = delta_eps_k_sin.atan2(delta_eps_k_cos);
        let time_of_flight = (delta_eps + eps_sin - eps_k_sin) * sqrt_a3_mu;

        // Geocentric -> geodetic latitude, and Earth rotation during flight
        let phi_geocentric = (impact.z / r_k2).clamp(-1.0, 1.0).asin();
        let phi = phi_geocentric.tan().atan2(1.0 - e2);
        let lambda = impact.y.atan2(impact.x) - OMEGA_EARTH * time_of_flight;
        let lambda = (lambda + std::f64::consts::PI).rem_euclid(std::f64::consts::TAU)
            - std::f64::consts::PI;

        Some(Vector3::new(rad2deg(phi), rad2deg(lambda), 0.0))
    }
}

fn deg2rad(degrees: f64) -> f64 {
    degrees * std::f64::consts::PI / 180.0
}

fn rad2deg(radians: f64) -> f64 {
    radians * 180.0 / std::f64::consts::PI
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
    fn test_llh_round_trip_including_poles() {
        for llh in [
            [35.0, 139.0, 0.0],
            [-60.0, -120.0, 400_000.0],
            [89.9999, 10.0, 1_000.0],
            [90.0, 0.0, 250.0],
            [-90.0, 0.0, 100_000.0],
        ] {
            let llh = Vector3::from(llh);
            let back =
                CoordinateTransform::pos_ecef_to_llh(&CoordinateTransform::pos_llh_to_ecef(&llh));
            assert_relative_eq!(back.x, llh.x, epsilon = 1e-8);
            assert_relative_eq!(back.z, llh.z, epsilon = 1e-3);
        }
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

    /// ECEF position and Earth-relative ECEF velocity from LLH [deg, deg, m] and NED velocity
    fn ecef_state(llh: [f64; 3], vel_ned: [f64; 3]) -> (Vector3<f64>, Vector3<f64>) {
        let pos_llh = Vector3::new(llh[0], llh[1], llh[2]);
        let pos_ecef = CoordinateTransform::pos_llh_to_ecef(&pos_llh);
        let dcm_ned_to_ecef = CoordinateTransform::dcm_ecef_to_ned(&pos_llh).transpose();
        let vel_ecef = dcm_ned_to_ecef * Vector3::new(vel_ned[0], vel_ned[1], vel_ned[2]);
        (pos_ecef, vel_ecef)
    }

    /// Reference impact point: propagate point-mass gravity in the inertial
    /// frame (aligned with ECEF at epoch) with RK4 until the ellipsoid is hit.
    fn propagate_impact(pos_ecef: Vector3<f64>, vel_ecef: Vector3<f64>) -> Vector3<f64> {
        let omega_vec = Vector3::new(0.0, 0.0, OMEGA_EARTH);
        let accel = |r: &Vector3<f64>| -MU_EARTH * r / r.magnitude().powi(3);
        let altitude = |r: &Vector3<f64>, t: f64| {
            let r_ecef = CoordinateTransform::dcm_eci_to_ecef(t) * r;
            CoordinateTransform::pos_ecef_to_llh(&r_ecef).z
        };

        let dt = 0.05;
        let mut t = 0.0;
        let mut r = pos_ecef;
        let mut v = vel_ecef + omega_vec.cross(&pos_ecef);
        let mut alt = altitude(&r, t);
        loop {
            let (k1r, k1v) = (v, accel(&r));
            let (k2r, k2v) = (v + 0.5 * dt * k1v, accel(&(r + 0.5 * dt * k1r)));
            let (k3r, k3v) = (v + 0.5 * dt * k2v, accel(&(r + 0.5 * dt * k2r)));
            let (k4r, k4v) = (v + dt * k3v, accel(&(r + dt * k3r)));
            let r_next = r + dt / 6.0 * (k1r + 2.0 * k2r + 2.0 * k3r + k4r);
            let v_next = v + dt / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
            let alt_next = altitude(&r_next, t + dt);
            if alt_next <= 0.0 {
                // Linear interpolation of the surface crossing
                let s = alt / (alt - alt_next);
                let t_hit = t + s * dt;
                let r_hit = r + s * (r_next - r);
                let r_ecef = CoordinateTransform::dcm_eci_to_ecef(t_hit) * r_hit;
                return CoordinateTransform::pos_ecef_to_llh(&r_ecef);
            }
            r = r_next;
            v = v_next;
            alt = alt_next;
            t += dt;
            assert!(t < 20000.0, "reference propagation did not impact");
        }
    }

    #[test]
    fn test_iip_matches_numerical_propagation() {
        let cases = [
            // Sounding-rocket-like lofted trajectory (Uchinoura)
            ([31.25, 131.08, 100_000.0], [500.0, 1500.0, -1000.0]),
            // Steep ascent, westward
            ([35.0, 139.0, 50_000.0], [0.0, -800.0, -2000.0]),
            // Suborbital with long flight time, southern hemisphere near the antimeridian
            ([-40.0, 179.0, 200_000.0], [-3000.0, 4000.0, -500.0]),
        ];
        for (llh, vel_ned) in cases {
            let (pos_ecef, vel_ecef) = ecef_state(llh, vel_ned);
            let iip = CoordinateTransform::pos_llh_iip(&pos_ecef, &vel_ecef)
                .expect("impact point should exist");
            let reference = propagate_impact(pos_ecef, vel_ecef);
            assert_relative_eq!(iip.x, reference.x, epsilon = 1e-3);
            assert_relative_eq!(iip.y, reference.y, epsilon = 1e-3);
            assert!((-180.0..=180.0).contains(&iip.y));
            assert_eq!(iip.z, 0.0);
        }
    }

    #[test]
    fn test_iip_at_rest_is_directly_below() {
        // Zero Earth-relative velocity: falls nearly straight down (small Coriolis drift)
        let (pos_ecef, vel_ecef) = ecef_state([35.0, 139.0, 10_000.0], [0.0, 0.0, 0.0]);
        let iip = CoordinateTransform::pos_llh_iip(&pos_ecef, &vel_ecef).unwrap();
        assert_relative_eq!(iip.x, 35.0, epsilon = 1e-3);
        assert_relative_eq!(iip.y, 139.0, epsilon = 1e-3);
    }

    #[test]
    fn test_iip_none_when_no_impact() {
        // Below the surface
        let pos = Vector3::new(WGS84_A * 0.5, 0.0, 0.0);
        assert!(CoordinateTransform::pos_llh_iip(&pos, &Vector3::zeros()).is_none());

        // Circular orbit at 400 km: perigee above the surface
        let r = WGS84_A + 400_000.0;
        let pos = Vector3::new(r, 0.0, 0.0);
        let v_inertial = Vector3::new(0.0, (MU_EARTH / r).sqrt(), 0.0);
        let vel_ecef = v_inertial - Vector3::new(0.0, 0.0, OMEGA_EARTH).cross(&pos);
        assert!(CoordinateTransform::pos_llh_iip(&pos, &vel_ecef).is_none());

        // Escape velocity: hyperbolic trajectory
        let vel_ecef = Vector3::new(0.0, (2.0 * MU_EARTH / r).sqrt() * 1.1, 0.0);
        assert!(CoordinateTransform::pos_llh_iip(&pos, &vel_ecef).is_none());
    }
}
