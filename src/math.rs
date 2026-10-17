pub mod constants {
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
}

pub mod integrator {
    //! Explicit Runge-Kutta integrators on fixed-size state arrays
    //!
    //! Self-contained replacements for Boost ODEINT in the C++ simulator.
    //! States are `[f64; N]` so a step never allocates.

    /// Classic 4th order Runge-Kutta, fixed step
    pub struct RungeKutta4;

    fn axpy<const N: usize>(y: &[f64; N], h: f64, k: &[f64; N]) -> [f64; N] {
        std::array::from_fn(|i| y[i] + h * k[i])
    }

    impl RungeKutta4 {
        /// One step of `dt` from `(t, state)` for `dy/dt = system(t, y)`
        pub fn integrate<const N: usize, F>(
            &self,
            state: &[f64; N],
            t: f64,
            dt: f64,
            system: F,
        ) -> [f64; N]
        where
            F: Fn(f64, &[f64; N]) -> [f64; N],
        {
            let k1 = system(t, state);
            let k2 = system(t + 0.5 * dt, &axpy(state, 0.5 * dt, &k1));
            let k3 = system(t + 0.5 * dt, &axpy(state, 0.5 * dt, &k2));
            let k4 = system(t + dt, &axpy(state, dt, &k3));
            std::array::from_fn(|i| {
                state[i] + dt * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]) / 6.0
            })
        }

        /// Integrate from `t_start` to `t_end` with steps of `dt` (the last
        /// one shortened), calling `observer(t, state)` after every step and
        /// at the start
        pub fn integrate_const<const N: usize, F, O>(
            &self,
            mut state: [f64; N],
            t_start: f64,
            t_end: f64,
            dt: f64,
            system: F,
            mut observer: O,
        ) -> [f64; N]
        where
            F: Fn(f64, &[f64; N]) -> [f64; N],
            O: FnMut(f64, &[f64; N]),
        {
            let mut t = t_start;
            observer(t, &state);
            let mut k = 0u64;
            while t < t_end {
                // Step count based time avoids accumulating round-off
                let t_next = (t_start + (k + 1) as f64 * dt).min(t_end);
                state = self.integrate(&state, t, t_next - t, &system);
                t = t_next;
                k += 1;
                observer(t, &state);
            }
            state
        }
    }

    /// Dormand-Prince 5(4) adaptive integrator with step control
    ///
    /// The error of each component is scaled by
    /// `abs_tol + rel_tol * max(|y|, |y_new|)` and the step is accepted when
    /// the largest scaled error is at most 1.
    #[derive(Clone, Copy, Debug)]
    pub struct DormandPrince54 {
        pub abs_tol: f64,
        pub rel_tol: f64,
        pub h_min: f64,
        pub h_max: f64,
    }

    // Butcher tableau of Dormand-Prince 5(4)
    const C: [f64; 7] = [0.0, 1.0 / 5.0, 3.0 / 10.0, 4.0 / 5.0, 8.0 / 9.0, 1.0, 1.0];
    const A: [[f64; 6]; 7] = [
        [0.0; 6],
        [1.0 / 5.0, 0.0, 0.0, 0.0, 0.0, 0.0],
        [3.0 / 40.0, 9.0 / 40.0, 0.0, 0.0, 0.0, 0.0],
        [44.0 / 45.0, -56.0 / 15.0, 32.0 / 9.0, 0.0, 0.0, 0.0],
        [
            19372.0 / 6561.0,
            -25360.0 / 2187.0,
            64448.0 / 6561.0,
            -212.0 / 729.0,
            0.0,
            0.0,
        ],
        [
            9017.0 / 3168.0,
            -355.0 / 33.0,
            46732.0 / 5247.0,
            49.0 / 176.0,
            -5103.0 / 18656.0,
            0.0,
        ],
        [
            35.0 / 384.0,
            0.0,
            500.0 / 1113.0,
            125.0 / 192.0,
            -2187.0 / 6784.0,
            11.0 / 84.0,
        ],
    ];
    /// 5th order weights (equal to the last row of `A`: FSAL)
    const B5: [f64; 7] = [
        35.0 / 384.0,
        0.0,
        500.0 / 1113.0,
        125.0 / 192.0,
        -2187.0 / 6784.0,
        11.0 / 84.0,
        0.0,
    ];
    /// Embedded 4th order weights
    const B4: [f64; 7] = [
        5179.0 / 57600.0,
        0.0,
        7571.0 / 16695.0,
        393.0 / 640.0,
        -92097.0 / 339200.0,
        187.0 / 2100.0,
        1.0 / 40.0,
    ];

    /// Result of one embedded step
    struct Step<const N: usize> {
        y: [f64; N],
        /// Largest scaled error (accept when <= 1)
        error: f64,
        /// Derivative at the end of the step (first stage of the next one)
        k_end: [f64; N],
    }

    impl DormandPrince54 {
        pub fn new(abs_tol: f64, rel_tol: f64, h_min: f64, h_max: f64) -> Self {
            Self {
                abs_tol,
                rel_tol,
                h_min,
                h_max,
            }
        }

        fn step<const N: usize, F>(
            &self,
            t: f64,
            y: &[f64; N],
            k1: [f64; N],
            h: f64,
            system: &F,
        ) -> Step<N>
        where
            F: Fn(f64, &[f64; N]) -> [f64; N],
        {
            let mut k = [[0.0; N]; 7];
            k[0] = k1;
            for s in 1..7 {
                let yt: [f64; N] = std::array::from_fn(|i| {
                    y[i] + h * (0..s).map(|j| A[s][j] * k[j][i]).sum::<f64>()
                });
                k[s] = system(t + C[s] * h, &yt);
            }
            // The 7th stage is evaluated at the 5th order solution
            let y5: [f64; N] =
                std::array::from_fn(|i| y[i] + h * (0..7).map(|j| B5[j] * k[j][i]).sum::<f64>());
            let mut error: f64 = 0.0;
            for i in 0..N {
                let e = h * (0..7).map(|j| (B5[j] - B4[j]) * k[j][i]).sum::<f64>();
                let scale = self.abs_tol + self.rel_tol * y[i].abs().max(y5[i].abs());
                error = error.max((e / scale).abs());
            }
            Step {
                y: y5,
                error,
                k_end: k[6],
            }
        }

        /// Step size factor from the scaled error
        fn factor(error: f64, max_growth: f64) -> f64 {
            if error == 0.0 {
                return max_growth;
            }
            (0.9 * error.powf(-0.2)).clamp(0.2, max_growth)
        }

        /// Advance `state` from `*t` to `t_target` with adaptive steps.
        ///
        /// `h_hint` carries the step size between calls (pass the same
        /// variable each time; `None` starts from a tenth of the interval).
        /// When the step falls to `h_min` and still fails, it is accepted
        /// anyway so the integration cannot stall; the number of such forced
        /// steps is returned.
        pub fn advance_to<const N: usize, F>(
            &self,
            state: &mut [f64; N],
            t: &mut f64,
            t_target: f64,
            h_hint: &mut Option<f64>,
            system: F,
        ) -> usize
        where
            F: Fn(f64, &[f64; N]) -> [f64; N],
        {
            let span = t_target - *t;
            if span <= 0.0 {
                return 0;
            }
            let mut h = h_hint.unwrap_or(span / 10.0).clamp(self.h_min, self.h_max);
            let mut k1 = system(*t, state);
            let mut forced = 0;
            while *t < t_target {
                let remaining = t_target - *t;
                let last = h >= remaining;
                let h_try = if last { remaining } else { h };
                let step = self.step(*t, state, k1, h_try, &system);
                if step.error <= 1.0 || h_try <= self.h_min {
                    if step.error > 1.0 {
                        forced += 1;
                    }
                    *t = if last { t_target } else { *t + h_try };
                    *state = step.y;
                    k1 = step.k_end;
                    // A shortened final step says nothing about the step size
                    if !last || step.error > 0.0 {
                        h = (h_try * Self::factor(step.error, 5.0)).clamp(self.h_min, self.h_max);
                    }
                    if last {
                        break;
                    }
                } else {
                    h = (h_try * Self::factor(step.error, 0.5)).clamp(self.h_min, self.h_max);
                }
            }
            *h_hint = Some(h);
            forced
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use approx::assert_relative_eq;

        #[test]
        fn test_simple_exponential_decay() {
            // dy/dt = -y, y(0) = 1 -> y(t) = exp(-t)
            let final_state =
                RungeKutta4.integrate_const([1.0], 0.0, 1.0, 0.1, |_t, y| [-y[0]], |_t, _y| {});
            assert_relative_eq!(final_state[0], (-1.0f64).exp(), epsilon = 1e-6);
        }

        #[test]
        fn test_harmonic_oscillator() {
            // x'' = -x, x(0) = 1 -> x(pi/2) = 0, v(pi/2) = -1
            let t_end = std::f64::consts::FRAC_PI_2;
            let final_state = RungeKutta4.integrate_const(
                [1.0, 0.0],
                0.0,
                t_end,
                0.01,
                |_t, s| [s[1], -s[0]],
                |_t, _y| {},
            );
            assert_relative_eq!(final_state[0], 0.0, epsilon = 1e-9);
            assert_relative_eq!(final_state[1], -1.0, epsilon = 1e-9);
        }

        #[test]
        fn test_rk4_is_fourth_order() {
            let err = |dt: f64| {
                let y =
                    RungeKutta4.integrate_const([1.0], 0.0, 1.0, dt, |_t, y| [-y[0]], |_, _| {});
                (y[0] - (-1.0f64).exp()).abs()
            };
            let ratio = err(0.1) / err(0.05);
            assert!((ratio - 16.0).abs() < 1.0, "error ratio {ratio}");
        }

        #[test]
        fn test_dp54_meets_tolerance() {
            let solver = DormandPrince54::new(1e-12, 1e-10, 1e-9, 1.0);
            let mut y = [1.0, 0.0];
            let mut t = 0.0;
            let mut hint = None;
            let forced = solver.advance_to(&mut y, &mut t, 10.0, &mut hint, |_t, s| [s[1], -s[0]]);
            assert_eq!(forced, 0);
            assert_eq!(t, 10.0);
            assert_relative_eq!(y[0], 10.0f64.cos(), epsilon = 1e-8);
            assert_relative_eq!(y[1], -10.0f64.sin(), epsilon = 1e-8);
        }

        #[test]
        fn test_dp54_forced_step_keeps_time_and_state_consistent() {
            // A tolerance no step can meet: every step is forced at h_min,
            // and the state must match the time it is reported at.
            let solver = DormandPrince54::new(1e-300, 0.0, 1e-3, 1e-3);
            let mut y = [0.0];
            let mut t = 0.0;
            let mut hint = None;
            let forced = solver.advance_to(&mut y, &mut t, 0.1, &mut hint, |t, _y| [t * t]);
            assert!(forced > 0);
            assert_relative_eq!(t, 0.1, epsilon = 1e-12);
            assert_relative_eq!(y[0], 0.1f64.powi(3) / 3.0, epsilon = 1e-12);
        }
    }
}

pub mod linalg {
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

    /// Normalize angle to the (-π, π] range
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
}

pub use constants::*;
pub use integrator::RungeKutta4;
pub use linalg::{deg2rad, rad2deg};
