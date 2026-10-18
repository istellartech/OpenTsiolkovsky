//! Keplerian elements of an inertial state

use crate::math::constants::{MU_EARTH, WGS84_A};
use nalgebra::Vector3;
use serde::{Deserialize, Serialize};

/// Osculating Keplerian elements (point-mass Earth)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct OrbitalElements {
    /// Semi-major axis [m] (negative for a hyperbolic trajectory)
    pub semi_major_axis_m: f64,
    pub eccentricity: f64,
    pub inclination_deg: f64,
    /// Right ascension of the ascending node [deg], from the vernal
    /// equinox (Greenwich mean sidereal time at launch applied)
    pub raan_deg: f64,
    pub argument_of_perigee_deg: f64,
    pub true_anomaly_deg: f64,
    /// Perigee radius minus the equatorial radius [m]
    pub perigee_altitude_m: f64,
    /// Apogee radius minus the equatorial radius [m]; `None` when the
    /// trajectory is not closed
    pub apogee_altitude_m: Option<f64>,
    /// Orbital period [s]; `None` when the trajectory is not closed
    pub period_s: Option<f64>,
    /// Specific orbital energy [J/kg]
    pub specific_energy_j_kg: f64,
}

/// Elements of the ECI state `(r, v)`. The simulator's ECI frame is
/// aligned with ECEF at t = 0, i.e. rotated by `frame_angle_rad` (the
/// sidereal angle of Greenwich at launch) from the equinox frame.
pub fn elements(r: &Vector3<f64>, v: &Vector3<f64>, frame_angle_rad: f64) -> OrbitalElements {
    let mu = MU_EARTH;
    let rn = r.magnitude();
    let energy = 0.5 * v.magnitude_squared() - mu / rn;
    let h = r.cross(v);
    let hn = h.magnitude();
    let node = Vector3::z().cross(&h);
    let e_vec = ((v.magnitude_squared() - mu / rn) * r - r.dot(v) * v) / mu;
    let e = e_vec.magnitude();
    let a = -mu / (2.0 * energy);
    let p = hn * hn / mu;
    let inclination = (h.z / hn).clamp(-1.0, 1.0).acos();

    let tau = std::f64::consts::TAU;
    let angle = |a: &Vector3<f64>, b: &Vector3<f64>| {
        (a.dot(b) / (a.magnitude() * b.magnitude()))
            .clamp(-1.0, 1.0)
            .acos()
    };
    const EPS: f64 = 1e-10;
    let equatorial = node.magnitude() < EPS * hn;
    let circular = e < EPS;
    let raan = if equatorial {
        0.0
    } else {
        node.y.atan2(node.x)
    };
    // Reference direction in the orbit plane for the angles
    let reference = if equatorial { Vector3::x() } else { node };
    let argp = if circular {
        0.0
    } else if equatorial {
        // Longitude of perigee, measured in the direction of motion
        let w = e_vec.y.atan2(e_vec.x).rem_euclid(tau);
        if h.z < 0.0 {
            (tau - w).rem_euclid(tau)
        } else {
            w
        }
    } else {
        let w = angle(&node, &e_vec);
        if e_vec.z < 0.0 { tau - w } else { w }
    };
    let from = if circular { reference } else { e_vec };
    let mut nu = angle(&from, r);
    if h.cross(&from).dot(r) < 0.0 {
        nu = tau - nu;
    }

    let closed = e < 1.0;
    OrbitalElements {
        semi_major_axis_m: a,
        eccentricity: e,
        inclination_deg: inclination.to_degrees(),
        raan_deg: (raan + frame_angle_rad).rem_euclid(tau).to_degrees(),
        argument_of_perigee_deg: argp.to_degrees(),
        true_anomaly_deg: nu.to_degrees(),
        perigee_altitude_m: p / (1.0 + e) - WGS84_A,
        apogee_altitude_m: closed.then(|| p / (1.0 - e) - WGS84_A),
        period_s: closed.then(|| tau * (a.powi(3) / mu).sqrt()),
        specific_energy_j_kg: energy,
    }
}

/// Greenwich mean sidereal time [rad] at a Julian date (IAU 1982, UT1
/// taken as UTC)
pub fn gmst_rad(julian_date: f64) -> f64 {
    let t = (julian_date - 2_451_545.0) / 36_525.0;
    let seconds = 67_310.548_41 + (876_600.0 * 3600.0 + 8_640_184.812_866) * t + 0.093_104 * t * t
        - 6.2e-6 * t * t * t;
    (seconds.rem_euclid(86_400.0) / 86_400.0) * std::f64::consts::TAU
}

#[cfg(test)]
mod tests {
    use super::*;
    use approx::assert_relative_eq;

    #[test]
    fn circular_inclined_orbit() {
        let r0 = WGS84_A + 400_000.0;
        let v0 = (MU_EARTH / r0).sqrt();
        let inc = 51.6f64.to_radians();
        let r = Vector3::new(r0, 0.0, 0.0);
        let v = Vector3::new(0.0, v0 * inc.cos(), v0 * inc.sin());
        let el = elements(&r, &v, 0.0);
        assert_relative_eq!(el.semi_major_axis_m, r0, max_relative = 1e-12);
        assert!(el.eccentricity < 1e-9);
        assert_relative_eq!(el.inclination_deg, 51.6, epsilon = 1e-9);
        assert_relative_eq!(el.raan_deg, 0.0, epsilon = 1e-9);
        assert_relative_eq!(el.perigee_altitude_m, 400_000.0, epsilon = 1e-3);
        assert_relative_eq!(el.apogee_altitude_m.unwrap(), 400_000.0, epsilon = 1e-3);
        assert_relative_eq!(
            el.period_s.unwrap(),
            std::f64::consts::TAU * (r0.powi(3) / MU_EARTH).sqrt(),
            max_relative = 1e-12
        );
        // The frame angle shifts only the node
        let shifted = elements(&r, &v, 0.5);
        assert_relative_eq!(shifted.raan_deg, 0.5f64.to_degrees(), epsilon = 1e-9);
    }

    #[test]
    fn elliptic_orbit_angles() {
        // Perigee 200 km on +X, apogee 2000 km; state 90 deg after perigee
        let (rp, ra) = (WGS84_A + 200_000.0, WGS84_A + 2_000_000.0);
        let a = 0.5 * (rp + ra);
        let e = (ra - rp) / (ra + rp);
        let p = a * (1.0 - e * e);
        let r_mag = p; // at nu = 90 deg
        let vr = (MU_EARTH / p).sqrt() * e;
        let vt = (MU_EARTH / p).sqrt();
        let r = Vector3::new(0.0, r_mag, 0.0);
        let v = Vector3::new(-vt, vr, 0.0);
        let el = elements(&r, &v, 0.0);
        assert_relative_eq!(el.eccentricity, e, max_relative = 1e-9);
        assert_relative_eq!(el.true_anomaly_deg, 90.0, epsilon = 1e-7);
        // 0 deg (equatorial: longitude of perigee), possibly as 360 - tiny
        let argp = (el.argument_of_perigee_deg + 180.0).rem_euclid(360.0) - 180.0;
        assert_relative_eq!(argp, 0.0, epsilon = 1e-7);
        assert_relative_eq!(el.perigee_altitude_m, 200_000.0, epsilon = 1e-3);
        assert_relative_eq!(el.apogee_altitude_m.unwrap(), 2_000_000.0, epsilon = 1e-2);
    }

    #[test]
    fn gmst_reference_values() {
        // J2000.0 epoch (2000-01-01 12:00 UT): 280.46062 deg
        assert_relative_eq!(
            gmst_rad(2_451_545.0).to_degrees(),
            280.460_618_37,
            epsilon = 1e-6
        );
        // Vallado example 3-5: 1992-08-20 12:14 UT1 -> 152.578788 deg
        assert_relative_eq!(
            gmst_rad(2_448_855.009_722_222).to_degrees(),
            152.578_787_8,
            epsilon = 1e-5
        );
    }
}
