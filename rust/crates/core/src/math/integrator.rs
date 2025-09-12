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
            |_t, _y| {} // no observer
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
        
        let final_state = integrator.integrate_const(
            initial_state,
            0.0,
            t_end,
            dt,
            system,
            |_t, _y| {}
        );
        
        // At t = π/2, x should be ≈ 0, v should be ≈ -1
        assert_relative_eq!(final_state[0], 0.0, epsilon = 1e-3);
        assert_relative_eq!(final_state[1], -1.0, epsilon = 1e-3);
    }
}