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
    /// Runge-Kutta 4th order integrator
    ///
    /// This is a self-contained implementation that replaces Boost ODEINT
    /// from the original C++ implementation.
    pub struct RungeKutta4;

    impl RungeKutta4 {
        /// Integrate system of differential equations using RK4 method
        ///
        /// # Arguments
        /// * `state` - Current state vector [mass, x, y, z, vx, vy, vz]
        /// * `t` - Current time
        /// * `dt` - Time step
        /// * `system` - Function that computes derivatives: dy/dt = f(t, y)
        ///
        /// # Returns
        /// New state vector after integration step
        pub fn integrate<F>(&self, state: &[f64], t: f64, dt: f64, system: F) -> Vec<f64>
        where
            F: Fn(f64, &[f64]) -> Vec<f64>,
        {
            let n = state.len();
            let mut new_state = vec![0.0; n];

            // k1 = f(t, y)
            let k1 = system(t, state);

            // k2 = f(t + dt/2, y + dt*k1/2)
            let mut y1 = vec![0.0; n];
            for i in 0..n {
                y1[i] = state[i] + 0.5 * dt * k1[i];
            }
            let k2 = system(t + 0.5 * dt, &y1);

            // k3 = f(t + dt/2, y + dt*k2/2)
            let mut y2 = vec![0.0; n];
            for i in 0..n {
                y2[i] = state[i] + 0.5 * dt * k2[i];
            }
            let k3 = system(t + 0.5 * dt, &y2);

            // k4 = f(t + dt, y + dt*k3)
            let mut y3 = vec![0.0; n];
            for i in 0..n {
                y3[i] = state[i] + dt * k3[i];
            }
            let k4 = system(t + dt, &y3);

            // y(t+dt) = y(t) + dt/6 * (k1 + 2*k2 + 2*k3 + k4)
            for i in 0..n {
                new_state[i] = state[i] + dt * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]) / 6.0;
            }

            new_state
        }

        /// Integrate over a time interval with multiple steps
        ///
        /// # Arguments
        /// * `state` - Initial state vector
        /// * `t_start` - Start time
        /// * `t_end` - End time
        /// * `dt` - Time step size
        /// * `system` - System dynamics function
        /// * `observer` - Function called at each step: observer(t, state)
        pub fn integrate_const<F, O>(
            &self,
            mut state: Vec<f64>,
            t_start: f64,
            t_end: f64,
            dt: f64,
            system: F,
            mut observer: O,
        ) -> Vec<f64>
        where
            F: Fn(f64, &[f64]) -> Vec<f64>,
            O: FnMut(f64, &[f64]),
        {
            let mut t = t_start;
            observer(t, &state);

            while t < t_end {
                let step_size = if t + dt > t_end { t_end - t } else { dt };
                state = self.integrate(&state, t, step_size, &system);
                t += step_size;
                observer(t, &state);
            }

            state
        }
    }

    /// Dormand-Prince 5(4) adaptive integrator with step control
    #[derive(Clone, Copy, Debug)]
    pub struct DormandPrince54 {
        pub abs_tol: f64,
        pub rel_tol: f64,
        pub h_min: f64,
        pub h_max: f64,
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

        /// Single DP54 step with error estimate
        fn step<F>(&self, t: f64, y: &[f64], h: f64, system: &F) -> (Vec<f64>, Vec<f64>)
        where
            F: Fn(f64, &[f64]) -> Vec<f64>,
        {
            // Coefficients for Dormand-Prince 5(4)
            let c2 = 1.0 / 5.0;
            let c3 = 3.0 / 10.0;
            let c4 = 4.0 / 5.0;
            let c5 = 8.0 / 9.0;
            let c6 = 1.0;
            let c7 = 1.0;

            let a21 = 1.0 / 5.0;
            let a31 = 3.0 / 40.0;
            let a32 = 9.0 / 40.0;
            let a41 = 44.0 / 45.0;
            let a42 = -56.0 / 15.0;
            let a43 = 32.0 / 9.0;
            let a51 = 19372.0 / 6561.0;
            let a52 = -25360.0 / 2187.0;
            let a53 = 64448.0 / 6561.0;
            let a54 = -212.0 / 729.0;
            let a61 = 9017.0 / 3168.0;
            let a62 = -355.0 / 33.0;
            let a63 = 46732.0 / 5247.0;
            let a64 = 49.0 / 176.0;
            let a65 = -5103.0 / 18656.0;
            let a71 = 35.0 / 384.0;
            let a72 = 0.0;
            let a73 = 500.0 / 1113.0;
            let a74 = 125.0 / 192.0;
            let a75 = -2187.0 / 6784.0;
            let a76 = 11.0 / 84.0;

            // b coefficients for 5th order solution (y5)
            let b1 = 35.0 / 384.0;
            let b2 = 0.0;
            let b3 = 500.0 / 1113.0;
            let b4 = 125.0 / 192.0;
            let b5 = -2187.0 / 6784.0;
            let b6 = 11.0 / 84.0;
            // b* for 4th order (y4)
            let bs1 = 5179.0 / 57600.0;
            let bs2 = 0.0;
            let bs3 = 7571.0 / 16695.0;
            let bs4 = 393.0 / 640.0;
            let bs5 = -92097.0 / 339200.0;
            let bs6 = 187.0 / 2100.0;
            let bs7 = 1.0 / 40.0;

            let k1 = system(t, y);
            let n = y.len();
            let mut yt = vec![0.0; n];

            for i in 0..n {
                yt[i] = y[i] + h * a21 * k1[i];
            }
            let k2 = system(t + c2 * h, &yt);

            for i in 0..n {
                yt[i] = y[i] + h * (a31 * k1[i] + a32 * k2[i]);
            }
            let k3 = system(t + c3 * h, &yt);

            for i in 0..n {
                yt[i] = y[i] + h * (a41 * k1[i] + a42 * k2[i] + a43 * k3[i]);
            }
            let k4 = system(t + c4 * h, &yt);

            for i in 0..n {
                yt[i] = y[i] + h * (a51 * k1[i] + a52 * k2[i] + a53 * k3[i] + a54 * k4[i]);
            }
            let k5 = system(t + c5 * h, &yt);

            for i in 0..n {
                yt[i] = y[i]
                    + h * (a61 * k1[i] + a62 * k2[i] + a63 * k3[i] + a64 * k4[i] + a65 * k5[i]);
            }
            let k6 = system(t + c6 * h, &yt);

            // k7 for dense/embedded estimate
            for i in 0..n {
                yt[i] = y[i]
                    + h * (a71 * k1[i]
                        + a72 * k2[i]
                        + a73 * k3[i]
                        + a74 * k4[i]
                        + a75 * k5[i]
                        + a76 * k6[i]);
            }
            let k7 = system(t + c7 * h, &yt);

            // 5th order solution y5
            let mut y5 = vec![0.0; n];
            for i in 0..n {
                y5[i] = y[i]
                    + h * (b1 * k1[i]
                        + b2 * k2[i]
                        + b3 * k3[i]
                        + b4 * k4[i]
                        + b5 * k5[i]
                        + b6 * k6[i]);
            }

            // 4th order solution y4
            let mut y4 = vec![0.0; n];
            for i in 0..n {
                y4[i] = y[i]
                    + h * (bs1 * k1[i]
                        + bs2 * k2[i]
                        + bs3 * k3[i]
                        + bs4 * k4[i]
                        + bs5 * k5[i]
                        + bs6 * k6[i]
                        + bs7 * k7[i]);
            }

            // error estimate = y5 - y4
            let err: Vec<f64> = y5.iter().zip(y4.iter()).map(|(a, b)| a - b).collect();
            (y5, err)
        }

        /// Adaptive integration with outputs at fixed time grid.
        /// Observer returns false to stop early.
        pub fn integrate_with_outputs<F, O>(
            &self,
            state0: Vec<f64>,
            t0: f64,
            t_end: f64,
            dt_out: f64,
            system: F,
            mut observer: O,
        ) where
            F: Fn(f64, &[f64]) -> Vec<f64>,
            O: FnMut(f64, &[f64]) -> bool,
        {
            let mut t = t0;
            let mut y = state0;
            let mut next_out = t0;
            let mut h = (dt_out / 10.0).max(self.h_min).min(self.h_max);

            // Emit initial state
            if !observer(t, &y) {
                return;
            }

            while t < t_end {
                // Limit step to next output or end
                let target = next_out + dt_out;
                let limit = if t + h > target { target - t } else { h };
                let limit = if t + limit > t_end { t_end - t } else { limit };
                let (y5, err) = self.step(t, &y, limit, &system);

                // Error norm
                let mut max_err: f64 = 0.0;
                for i in 0..y.len() {
                    let sc = self.abs_tol + self.rel_tol * y5[i].abs().max(y[i].abs());
                    max_err = max_err.max((err[i] / sc).abs());
                }

                if max_err <= 1.0 {
                    // accept
                    t += limit;
                    y = y5;
                    // step size update
                    let safety = 0.9;
                    let p = 5.0;
                    let factor = (safety * (1.0 / max_err).powf(1.0 / (p + 1.0))).clamp(0.2, 5.0);
                    h = (limit * factor).clamp(self.h_min, self.h_max);
                    // Output at grid points
                    if (t - next_out).abs() < 1e-12 || t >= next_out + dt_out - 1e-12 {
                        next_out += dt_out;
                        if !observer(t, &y) {
                            break;
                        }
                    }
                } else {
                    // reject and reduce step size
                    let safety = 0.9;
                    let p = 5.0;
                    let factor = (safety * (1.0 / max_err).powf(1.0 / (p + 1.0))).clamp(0.2, 0.5);
                    h = (limit * factor).clamp(self.h_min, self.h_max);
                    if h <= self.h_min * 1.01 {
                        // give up and accept to avoid stall
                        t += limit;
                        y = y5;
                        if !observer(t, &y) {
                            break;
                        }
                    }
                }
            }
        }

        /// Advance solution from t to t_target with adaptive steps
        pub fn advance_to<F>(&self, state: &mut Vec<f64>, t: &mut f64, t_target: f64, system: F)
        where
            F: Fn(f64, &[f64]) -> Vec<f64>,
        {
            let mut h = ((t_target - *t) / 10.0)
                .abs()
                .max(self.h_min)
                .min(self.h_max);
            while *t < t_target - 1e-12 {
                if *t + h > t_target {
                    h = t_target - *t;
                }
                let (y5, err) = self.step(*t, state, h, &system);
                let mut max_err: f64 = 0.0;
                for i in 0..state.len() {
                    let sc = self.abs_tol + self.rel_tol * y5[i].abs().max(state[i].abs());
                    max_err = max_err.max((err[i] / sc).abs());
                }
                if max_err <= 1.0 {
                    *t += h;
                    *state = y5;
                    let safety = 0.9;
                    let p = 5.0;
                    let factor = (safety * (1.0 / max_err).powf(1.0 / (p + 1.0))).clamp(0.2, 5.0);
                    h = (h * factor).clamp(self.h_min, self.h_max);
                } else {
                    let safety = 0.9;
                    let p = 5.0;
                    let factor = (safety * (1.0 / max_err).powf(1.0 / (p + 1.0))).clamp(0.2, 0.5);
                    h = (h * factor).clamp(self.h_min, self.h_max);
                    if h <= self.h_min * 1.01 {
                        // accept to prevent stall
                        *t += h;
                        *state = y5;
                    }
                }
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use approx::assert_relative_eq;

        #[test]
        fn test_simple_exponential_decay() {
            let integrator = RungeKutta4;

            // dy/dt = -y, y(0) = 1
            // Analytical solution: y(t) = exp(-t)
            let system = |_t: f64, y: &[f64]| vec![-y[0]];

            let initial_state = vec![1.0];
            let dt = 0.1;
            let t_end = 1.0;

            let final_state = integrator.integrate_const(
                initial_state,
                0.0,
                t_end,
                dt,
                system,
                |_t, _y| {}, // no observer
            );

            let expected = (-t_end).exp(); // e^(-1) ≈ 0.36788
            assert_relative_eq!(final_state[0], expected, epsilon = 1e-4);
        }

        #[test]
        fn test_harmonic_oscillator() {
            let integrator = RungeKutta4;

            // Simple harmonic oscillator: d²x/dt² = -ω²x
            // State vector: [x, dx/dt], ω = 1
            // dx/dt = v, dv/dt = -x
            let system = |_t: f64, state: &[f64]| vec![state[1], -state[0]];

            let initial_state = vec![1.0, 0.0]; // x(0)=1, v(0)=0
            let dt = 0.01;
            let t_end = std::f64::consts::PI / 2.0; // quarter period

            let final_state =
                integrator.integrate_const(initial_state, 0.0, t_end, dt, system, |_t, _y| {});

            // At t = π/2, x should be ≈ 0, v should be ≈ -1
            assert_relative_eq!(final_state[0], 0.0, epsilon = 1e-3);
            assert_relative_eq!(final_state[1], -1.0, epsilon = 1e-3);
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
}

pub use constants::*;
pub use integrator::RungeKutta4;
pub use linalg::{deg2rad, rad2deg};
