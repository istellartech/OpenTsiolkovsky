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
        std::array::from_fn(|i| state[i] + dt * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]) / 6.0)
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
    component_error: [f64; N],
    finite: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AdaptiveStats {
    pub accepted: usize,
    pub rejected: usize,
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum IntegrationError {
    #[error("invalid integration interval, step settings or component tolerances")]
    InvalidSettings,
    #[error("non-finite state or derivative at t={0}")]
    InvalidEvaluation(f64),
    #[error("accuracy not reached at t={time}, h={step}, error norm={error}")]
    AccuracyNotReached { time: f64, step: f64, error: f64 },
    #[error("integration step budget exhausted at t={0}")]
    StepLimit(f64),
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

    fn step<const N: usize, const CHECKED: bool, F>(
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
        let invalid = || Step {
            y: [f64::NAN; N],
            error: f64::INFINITY,
            k_end: [f64::NAN; N],
            component_error: [f64::NAN; N],
            finite: false,
        };
        if CHECKED && k1.iter().any(|v| !v.is_finite()) {
            return invalid();
        }
        for s in 1..7 {
            let yt: [f64; N] =
                std::array::from_fn(|i| y[i] + h * (0..s).map(|j| A[s][j] * k[j][i]).sum::<f64>());
            if CHECKED && yt.iter().any(|v| !v.is_finite()) {
                return invalid();
            }
            k[s] = system(t + C[s] * h, &yt);
            if CHECKED && k[s].iter().any(|v| !v.is_finite()) {
                return invalid();
            }
        }
        // The 7th stage is evaluated at the 5th order solution
        let y5: [f64; N] =
            std::array::from_fn(|i| y[i] + h * (0..7).map(|j| B5[j] * k[j][i]).sum::<f64>());
        let component_error: [f64; N] =
            std::array::from_fn(|i| h * (0..7).map(|j| (B5[j] - B4[j]) * k[j][i]).sum::<f64>());
        let mut error: f64 = 0.0;
        for i in 0..N {
            let e = component_error[i];
            let scale = self.abs_tol + self.rel_tol * y[i].abs().max(y5[i].abs());
            error = error.max((e / scale).abs());
        }
        Step {
            y: y5,
            error,
            k_end: k[6],
            component_error,
            finite: !CHECKED || y5.iter().chain(&component_error).all(|v| v.is_finite()),
        }
    }

    /// Strict validation path using the same fixed-array DP54/FSAL kernel.
    /// Component absolute tolerances override `abs_tol`; `rel_tol` is shared.
    /// Rejects accuracy failure instead of forcing a step at `h_min`. Every
    /// accepted state belongs to the exact time written to `t`. On error the
    /// last accepted state remains available, and an event map must not run.
    pub fn try_advance_to<const N: usize, F>(
        &self,
        state: &mut [f64; N],
        t: &mut f64,
        target: f64,
        absolute_tolerances: &[f64; N],
        max_steps: usize,
        system: F,
    ) -> Result<AdaptiveStats, IntegrationError>
    where
        F: Fn(f64, &[f64; N]) -> [f64; N],
    {
        if N == 0
            || !t.is_finite()
            || !target.is_finite()
            || target < *t
            || !(target - *t).is_finite()
            || max_steps == 0
            || absolute_tolerances
                .iter()
                .any(|v| !v.is_finite() || *v <= 0.0)
            || !self.rel_tol.is_finite()
            || self.rel_tol < 0.0
            || !self.h_min.is_finite()
            || self.h_min <= 0.0
            || !self.h_max.is_finite()
            || self.h_max < self.h_min
        {
            return Err(IntegrationError::InvalidSettings);
        }
        if state.iter().any(|v| !v.is_finite()) {
            return Err(IntegrationError::InvalidEvaluation(*t));
        }
        let mut stats = AdaptiveStats::default();
        if *t == target {
            return Ok(stats);
        }
        let mut h = ((target - *t) / 10.0).clamp(self.h_min, self.h_max);
        let mut k1 = system(*t, state);
        for _ in 0..max_steps {
            let next = (*t + h).min(target);
            let used_h = next - *t;
            if used_h <= 0.0 {
                return Err(IntegrationError::AccuracyNotReached {
                    time: *t,
                    step: used_h,
                    error: f64::INFINITY,
                });
            }
            let step = self.step::<N, true, F>(*t, state, k1, used_h, &system);
            if !step.finite {
                return Err(IntegrationError::InvalidEvaluation(*t));
            }
            let mut norm = 0.0_f64;
            for i in 0..N {
                let scale =
                    absolute_tolerances[i] + self.rel_tol * state[i].abs().max(step.y[i].abs());
                if !scale.is_finite() {
                    return Err(IntegrationError::InvalidSettings);
                }
                norm = norm.max((step.component_error[i] / scale).abs());
            }
            if norm <= 1.0 {
                *t = next;
                *state = step.y;
                k1 = step.k_end;
                stats.accepted += 1;
                if *t == target {
                    return Ok(stats);
                }
                h = (used_h * Self::factor(norm, 5.0)).clamp(self.h_min, self.h_max);
            } else {
                stats.rejected += 1;
                if used_h <= self.h_min || *t + self.h_min == *t {
                    return Err(IntegrationError::AccuracyNotReached {
                        time: *t,
                        step: used_h,
                        error: norm,
                    });
                }
                h = (used_h * Self::factor(norm, 0.5)).max(self.h_min);
            }
        }
        Err(IntegrationError::StepLimit(*t))
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
            let step = self.step::<N, false, F>(*t, state, k1, h_try, &system);
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
    fn strict_rejects_at_minimum_without_advancing_time_or_state() {
        let solver = DormandPrince54::new(1e-20, 0.0, 0.5, 0.5);
        let (mut y, mut t) = ([1.0], 0.0);
        let error = solver
            .try_advance_to(&mut y, &mut t, 1.0, &[1e-20], 100, |_, y| [y[0] * y[0]])
            .unwrap_err();
        assert!(matches!(error, IntegrationError::AccuracyNotReached { .. }));
        assert_eq!(t, 0.0);
        assert_eq!(y, [1.0]);
    }

    #[test]
    fn strict_reports_nonfinite_evaluation_settings_and_budget() {
        let solver = DormandPrince54::new(1e-10, 1e-10, 1e-8, 0.01);
        let (mut y, mut t) = ([1.0], 0.0);
        assert!(matches!(
            solver.try_advance_to(&mut y, &mut t, 1.0, &[1e-10], 100, |_, _| [f64::NAN]),
            Err(IntegrationError::InvalidEvaluation(_))
        ));
        assert_eq!(t, 0.0);
        assert_eq!(y, [1.0]);
        assert!(matches!(
            solver.try_advance_to(&mut y, &mut t, 1.0, &[1e-10], 1, |_, y| [-y[0]]),
            Err(IntegrationError::StepLimit(_))
        ));
        let (mut y, mut t) = ([1e308], 0.0);
        let overflow = DormandPrince54::new(1e-10, 1e308, 1e-8, 0.01);
        assert_eq!(
            overflow.try_advance_to(&mut y, &mut t, 1.0, &[1e-10], 100, |_, _| [0.0]),
            Err(IntegrationError::InvalidSettings)
        );
    }

    #[test]
    fn strict_never_passes_overflowed_internal_states_to_dynamics() {
        let solver = DormandPrince54::new(1.0, 0.0, 1.0, 1.0);
        let (mut y, mut t) = ([1e308], 0.0);
        let result = solver.try_advance_to(&mut y, &mut t, 1.0, &[1.0], 100, |_, y| {
            assert!(y.iter().all(|v| v.is_finite()));
            [1e308]
        });
        assert!(matches!(
            result,
            Err(IntegrationError::InvalidEvaluation(_))
        ));
        assert_eq!(y, [1e308]);
        assert_eq!(t, 0.0);
    }

    #[test]
    fn strict_stops_at_event_and_preserves_mass_jump_across_output_grids() {
        let solver = DormandPrince54::new(1e-10, 1e-11, 1e-9, 0.2);
        let event: f64 = 0.373;
        for dt in [0.13, 0.07, 0.31] {
            let (mut y, mut t) = ([1000.0, 0.0, 0.0], 0.0);
            while t < event {
                let target = (t + dt).min(event);
                solver
                    .try_advance_to(
                        &mut y,
                        &mut t,
                        target,
                        &[1e-9, 1e-10, 1e-10],
                        1000,
                        |_, y| [-2.0, y[2], 3.0],
                    )
                    .unwrap();
            }
            assert_eq!(t, event);
            y[0] -= 100.0;
            solver
                .try_advance_to(&mut y, &mut t, 1.0, &[1e-9, 1e-10, 1e-10], 1000, |_, y| {
                    [0.0, y[2], 0.0]
                })
                .unwrap();
            assert_eq!(t, 1.0);
            assert!((y[0] - (900.0 - 2.0 * event)).abs() < 1e-9);
            assert!((y[1] - (1.5 * event * event + 3.0 * event * (1.0 - event))).abs() < 1e-10);
            assert!((y[2] - 3.0 * event).abs() < 1e-10);
        }
    }

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
            let y = RungeKutta4.integrate_const([1.0], 0.0, 1.0, dt, |_t, y| [-y[0]], |_, _| {});
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
