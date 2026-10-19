//! Single-stage sounding rocket: fixed burn, free coast to apogee, maximum
//! additional payload. ECI translation and piecewise LGR commanded elevation.
use super::{
    lgr::{Lgr, interpolate},
    problem::DurationBounds,
    tnlp::{Layout, NlpModel},
};
use crate::{
    config::{Config, NoFiles},
    math::integrator::DormandPrince54,
    physics::{
        Scalar,
        coordinates::CoordinateTransform as C,
        flight::{self, PhaseContext},
    },
    vehicle::{NormalForce, Vehicle},
};
use nalgebra::{SVector, Vector3};
use num_dual::jacobian;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct FlightTolerances {
    pub position_m: f64,
    pub velocity_m_s: f64,
    pub mass_kg: f64,
    pub dynamic_pressure_pa: f64,
    pub angle_of_attack_deg: f64,
    pub specific_force_m_s2: f64,
    pub pitch_rate_deg_s: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(deny_unknown_fields)]
pub struct SingleStageProblem {
    /// Inline simulator configuration; external CSV files are not read.
    pub vehicle: Config,
    pub data_source: String,
    /// Base dry mass includes all carried hardware; additional payload is separate.
    pub dry_mass_kg: f64,
    pub propellant_mass_kg: f64,
    pub reserve_propellant_kg: f64,
    pub additional_payload_kg: DurationBounds,
    pub coast_duration_s: DurationBounds,
    pub vertical_ascent_s: f64,
    pub azimuth_deg: f64,
    pub target_apogee_altitude_m: f64,
    pub minimum_downrange_m: f64,
    pub minimum_pitch_deg: f64,
    pub initial_pitch_end_deg: f64,
    pub max_dynamic_pressure_pa: f64,
    pub max_angle_of_attack_deg: f64,
    pub max_specific_force_m_s2: f64,
    pub max_pitch_rate_deg_s: f64,
    pub burn_intervals: usize,
    pub coast_intervals: usize,
    pub degree: usize,
    pub validation: FlightTolerances,
}

fn bounds_ok(b: &DurationBounds, minimum: f64) -> bool {
    [b.initial, b.lower, b.upper].iter().all(|v| v.is_finite())
        && b.lower >= minimum
        && b.upper >= b.lower
        && (b.lower..=b.upper).contains(&b.initial)
}

impl SingleStageProblem {
    pub fn load_vehicle(&self) -> Result<Vehicle, String> {
        let positive = [
            self.dry_mass_kg,
            self.propellant_mass_kg,
            self.vertical_ascent_s,
            self.target_apogee_altitude_m,
            self.max_dynamic_pressure_pa,
            self.max_angle_of_attack_deg,
            self.max_specific_force_m_s2,
            self.max_pitch_rate_deg_s,
            self.validation.position_m,
            self.validation.velocity_m_s,
            self.validation.mass_kg,
            self.validation.dynamic_pressure_pa,
            self.validation.angle_of_attack_deg,
            self.validation.specific_force_m_s2,
            self.validation.pitch_rate_deg_s,
        ];
        if !positive.iter().all(|v| v.is_finite() && *v > 0.0)
            || !self.reserve_propellant_kg.is_finite()
            || !(0.0..self.propellant_mass_kg).contains(&self.reserve_propellant_kg)
            || !bounds_ok(&self.additional_payload_kg, 0.0)
            || !bounds_ok(&self.coast_duration_s, 1.0)
            || !(1..=16).contains(&self.burn_intervals)
            || !(1..=12).contains(&self.coast_intervals)
            || !(3..=8).contains(&self.degree)
            || !(0.0..90.0).contains(&self.minimum_pitch_deg)
            || !(self.minimum_pitch_deg..=90.0).contains(&self.initial_pitch_end_deg)
            || !(0.0..=360.0).contains(&self.azimuth_deg)
            || !self.minimum_downrange_m.is_finite()
            || self.minimum_downrange_m < 0.0
            || self.max_angle_of_attack_deg >= 90.0
            || self.data_source.trim().is_empty()
        {
            return Err("single_stage: invalid inventory, bounds, mesh, physical limits, tolerances or source".into());
        }
        let (v, warnings) = Vehicle::load(&self.vehicle, &NoFiles)
            .map_err(|r| format!("single_stage.vehicle: {:?}", r.errors))?;
        if !warnings.is_empty() {
            return Err(format!(
                "single_stage.vehicle has unresolved warnings: {warnings:?}"
            ));
        }
        if v.stages.len() != 1
            || v.launch.rail_length != 0.0
            || v.launch.velocity_ned.norm() > 1e-12
        {
            return Err("single_stage requires one stage, no rail, and zero initial Earth-relative velocity".into());
        }
        let s = &v.stages[0];
        let e = s.engine.as_ref().ok_or("single_stage requires an engine")?;
        if s.trim.is_some()
            || !s.jettisons.is_empty()
            || s.separation_time.is_some()
            || !matches!(s.aero.normal, NormalForce::Slope(_))
            || !matches!(s.free_flight, crate::config::FreeFlight::AeroStable)
            || !e.thrust.is_constant()
            || !e.isp.is_constant()
            || e.burn_start != 0.0
            || e.thrust.eval(0.0) <= 0.0
            || e.isp.eval(0.0) <= 0.0
            || self.vertical_ascent_s >= e.burn_end
            || e.burn_end + self.coast_duration_s.upper > v.end_time
        {
            return Err("single_stage currently requires a constant positive engine starting at t=0, aero_stable coast, CN-alpha, no trim/separation/jettisons, and simulation end after the allowed coast".into());
        }
        let initial = self.dry_mass_kg + self.propellant_mass_kg;
        if !initial.is_finite()
            || !(initial + self.additional_payload_kg.upper).is_finite()
            || (s.mass_initial - initial).abs() > 1e-6
            || s.mass_dry
                .is_none_or(|d| (d - self.dry_mass_kg).abs() > 1e-6)
            || s.propellant_demand() > self.propellant_mass_kg - self.reserve_propellant_kg + 1e-8
        {
            return Err("single_stage mass ledger disagrees with the simulator or the fixed burn consumes the propellant reserve".into());
        }
        if self.target_apogee_altitude_m <= v.launch.llh.z {
            return Err("target apogee must be above the launch site".into());
        }
        Ok(v)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FlightScaling {
    pub strategy: String,
    pub mass_kg: f64,
    pub position_m: f64,
    pub velocity_m_s: f64,
    pub time_s: f64,
    pub payload_objective_kg: f64,
    pub angle_constraint_speed_m_s: f64,
    pub position_origin_eci_m: [f64; 3],
}

pub struct SingleStage {
    pub input: SingleStageProblem,
    pub vehicle: Vehicle,
    pub grid: Lgr,
    pub scaling: FlightScaling,
    pub burn_end: f64,
    /// Includes the initial fixed vertical interval.
    pub burn_intervals: usize,
    layout: Layout,
    origin: [f64; 7],
    bernstein: Vec<Vec<f64>>,
}

pub use super::control::basis;
use super::control::bernstein_weights;

impl SingleStage {
    pub fn new(input: SingleStageProblem) -> Result<Self, String> {
        let vehicle = input.load_vehicle()?;
        let grid = Lgr::new(input.degree)?;
        let burn_end = vehicle.stages[0].engine.as_ref().unwrap().burn_end;
        let r = C::pos_eci_init(&vehicle.launch.llh);
        let v = C::vel_eci_init(&vehicle.launch.velocity_ned, &vehicle.launch.llh);
        let origin = [0.0, r.x, r.y, r.z, 0.0, 0.0, 0.0];
        let scaling = FlightScaling {
            strategy: "S0 SI scales; ECI position translated by launch position".into(),
            mass_kg: vehicle.stages[0].mass_initial,
            position_m: 100_000.0,
            velocity_m_s: 1000.0,
            time_s: burn_end,
            payload_objective_kg: 100.0,
            angle_constraint_speed_m_s: 10.0,
            position_origin_eci_m: r.into(),
        };
        let bernstein = bernstein_weights(&grid.nodes[1..]);
        let mut m = Self {
            burn_intervals: input.burn_intervals + 1,
            input,
            vehicle,
            grid,
            scaling,
            burn_end,
            layout: Layout {
                variables: vec![],
                constraints: vec![],
                initial: vec![],
                x_lower: vec![],
                x_upper: vec![],
                g_lower: vec![],
                g_upper: vec![],
                jacobian: vec![],
            },
            origin,
            bernstein,
        };
        let count = m.count();
        let n = 7 * (count + 1) + m.burn_intervals * m.input.degree + 2;
        m.layout.initial = vec![0.0; n];
        m.layout.x_lower = vec![-10.0; n];
        m.layout.x_upper = vec![10.0; n];
        for node in 0..=count {
            for field in [
                "mass", "x_eci", "y_eci", "z_eci", "vx_eci", "vy_eci", "vz_eci",
            ] {
                m.layout
                    .variables
                    .push(format!("state[{node}].{field}_scaled"));
            }
            m.layout.x_lower[7 * node] = m.input.dry_mass_kg / m.scaling.mass_kg;
            m.layout.x_upper[7 * node] = (m.vehicle.stages[0].mass_initial
                + m.input.additional_payload_kg.upper)
                / m.scaling.mass_kg;
        }
        for k in 0..m.burn_intervals * m.input.degree {
            let i = m.control_index(k);
            m.layout
                .variables
                .push(format!("control[{k}].elevation_rad"));
            m.layout.x_lower[i] = m.input.minimum_pitch_deg.to_radians();
            m.layout.x_upper[i] = 90.0_f64.to_radians();
            if k < m.input.degree {
                m.layout.x_lower[i] = 90.0_f64.to_radians();
            }
        }
        m.layout.variables.extend([
            "additional_payload_scaled".into(),
            "coast_duration_scaled".into(),
        ]);
        let pi = m.payload_index();
        let ti = m.time_index();
        for (i, b, scale) in [
            (
                pi,
                &m.input.additional_payload_kg,
                m.scaling.payload_objective_kg,
            ),
            (ti, &m.input.coast_duration_s, m.scaling.time_s),
        ] {
            m.layout.x_lower[i] = b.lower / scale;
            m.layout.x_upper[i] = b.upper / scale;
            m.layout.initial[i] = b.initial / scale;
        }
        for k in 0..count {
            for field in 0..7 {
                m.row(format!("DYN[{k}].{field}"), 0.0, 0.0);
            }
        }
        for field in 0..7 {
            m.row(format!("INIT.{field}"), 0.0, 0.0);
        }
        m.row(
            "APOGEE.altitude".into(),
            m.input.target_apogee_altitude_m / m.scaling.position_m,
            m.input.target_apogee_altitude_m / m.scaling.position_m,
        );
        m.row("APOGEE.velocity_down".into(), 0.0, 0.0);
        m.row(
            "RANGE.signed_projection".into(),
            m.input.minimum_downrange_m / m.scaling.position_m,
            1e19,
        );
        for k in 0..count {
            m.row(format!("Q[{k}]"), -1e19, 1.0);
            m.row(format!("AEROLOAD.cone[{k}]"), 0.0, 1e19);
            m.row(format!("AEROLOAD.forward[{k}]"), 0.0, 1e19);
            m.row(format!("ACCEL[{k}]"), -1e19, 1.0);
            m.row(format!("CLEARANCE[{k}]"), 0.0, 1e19);
            m.row(format!("MASS.reserve[{k}]"), 0.0, 1e19);
        }
        for interval in 1..m.burn_intervals {
            m.row(format!("CONTROL.continuity[{interval}]"), 0.0, 0.0);
        }
        for interval in 0..m.burn_intervals {
            for j in 0..m.input.degree - 1 {
                m.row(format!("CONTROL.rate_envelope[{interval},{j}]"), -1.0, 1.0);
            }
        }
        // End coefficients are already bounded by nodal limits and continuity.
        for interval in 1..m.burn_intervals {
            for j in 1..m.input.degree - 1 {
                m.row(
                    format!("CONTROL.pitch_envelope[{interval},{j}]"),
                    m.input.minimum_pitch_deg.to_radians(),
                    90.0_f64.to_radians(),
                );
            }
        }
        // Integrate the seed command from the prescribed launch state; no state
        // values from the desired trajectory or optimal payload are assumed.
        let mut x = m.layout.initial.clone();
        for interval in 0..m.burn_intervals {
            for j in 0..m.input.degree {
                let (t, _) = m.interval_time(&x, interval, m.grid.nodes[j + 1]);
                let a = ((t - m.input.vertical_ascent_s)
                    / (m.burn_end - m.input.vertical_ascent_s))
                    .clamp(0.0, 1.0);
                x[m.control_index(interval * m.input.degree + j)] = (90.0
                    - (90.0 - m.input.initial_pitch_end_deg) * a * a * (3.0 - 2.0 * a))
                    .to_radians();
            }
        }
        let mut y = [
            m.vehicle.stages[0].mass_initial + m.input.additional_payload_kg.initial,
            r.x,
            r.y,
            r.z,
            v.x,
            v.y,
            v.z,
        ];
        let mut t = 0.0;
        for c in 0..7 {
            x[c] = (y[c] - m.origin[c]) / m.state_scale(c);
        }
        let rk = DormandPrince54::new(1e-10, 1e-11, 1e-10, 0.5);
        for interval in 0..m.intervals() {
            for j in 1..=m.input.degree {
                let (target, _) = m.interval_time(&x, interval, m.grid.nodes[j]);
                rk.try_advance_to(
                    &mut y,
                    &mut t,
                    target,
                    &[1e-7, 1e-4, 1e-4, 1e-4, 1e-6, 1e-6, 1e-6],
                    100000,
                    |t, y| m.physical_derivative(&x, interval, t, y),
                )
                .map_err(|e| format!("initial trajectory: {e}"))?;
                let node = interval * m.input.degree + j;
                for c in 0..7 {
                    x[7 * node + c] = (y[c] - m.origin[c]) / m.state_scale(c);
                }
            }
        }
        m.layout.initial = x;
        let entries = m.entries(&m.layout.initial);
        m.layout.jacobian = entries.keys().map(|&(r, c)| (r as i32, c as i32)).collect();
        Ok(m)
    }
    fn row(&mut self, name: String, lower: f64, upper: f64) {
        self.layout.constraints.push(name);
        self.layout.g_lower.push(lower);
        self.layout.g_upper.push(upper);
    }
    pub fn intervals(&self) -> usize {
        self.burn_intervals + self.input.coast_intervals
    }
    pub fn count(&self) -> usize {
        self.intervals() * self.input.degree
    }
    pub fn control_index(&self, k: usize) -> usize {
        7 * (self.count() + 1) + k
    }
    pub fn payload_index(&self) -> usize {
        self.control_index(self.burn_intervals * self.input.degree)
    }
    pub fn time_index(&self) -> usize {
        self.payload_index() + 1
    }
    pub fn payload(&self, x: &[f64]) -> f64 {
        x[self.payload_index()] * self.scaling.payload_objective_kg
    }
    pub fn coast_duration(&self, x: &[f64]) -> f64 {
        x[self.time_index()] * self.scaling.time_s
    }
    pub fn state_scale(&self, c: usize) -> f64 {
        match c {
            0 => self.scaling.mass_kg,
            1..=3 => self.scaling.position_m,
            _ => self.scaling.velocity_m_s,
        }
    }
    pub fn state<T: Scalar>(&self, x: &[T], node: usize) -> [T; 7] {
        std::array::from_fn(|c| T::from(self.origin[c]) + x[7 * node + c] * self.state_scale(c))
    }
    pub fn interval_time<T: Scalar>(&self, x: &[T], interval: usize, tau: f64) -> (T, T) {
        // One canonical expression for each boundary, shared by both sides.
        // Computing a previous end as start+dt can otherwise overshoot the
        // next start by one ULP, which the strict IVP correctly rejects.
        let (start, end) = if interval == 0 {
            (T::from(0.0), T::from(self.input.vertical_ascent_s))
        } else if interval < self.burn_intervals {
            let boundary = |i: usize| {
                T::from(
                    self.input.vertical_ascent_s
                        + (self.burn_end - self.input.vertical_ascent_s)
                            * (i as f64 / self.input.burn_intervals as f64),
                )
            };
            (boundary(interval - 1), boundary(interval))
        } else {
            let i = interval - self.burn_intervals;
            let duration = x[self.time_index()] * self.scaling.time_s;
            let boundary = |i: usize| {
                T::from(self.burn_end) + duration * (i as f64 / self.input.coast_intervals as f64)
            };
            (boundary(i), boundary(i + 1))
        };
        let dt = end - start;
        (
            if tau == -1.0 {
                start
            } else if tau == 1.0 {
                end
            } else {
                start + dt * ((tau + 1.0) * 0.5)
            },
            dt,
        )
    }

    pub fn control<T: Scalar>(&self, x: &[T], interval: usize, tau: f64) -> T {
        if interval >= self.burn_intervals {
            return x[self.control_index(self.burn_intervals * self.input.degree - 1)];
        }
        let (b, _) = basis(&self.grid.nodes[1..], tau);
        b.iter().enumerate().fold(T::from(0.0), |v, (j, w)| {
            v + x[self.control_index(interval * self.input.degree + j)] * *w
        })
    }
    pub fn pitch_rate(&self, x: &[f64], interval: usize, tau: f64) -> f64 {
        if interval >= self.burn_intervals {
            return 0.0;
        }
        let (_, dt) = self.interval_time(x, interval, tau);
        let (_, d) = basis(&self.grid.nodes[1..], tau);
        d.iter()
            .enumerate()
            .map(|(j, w)| x[self.control_index(interval * self.input.degree + j)] * w)
            .sum::<f64>()
            * 2.0
            / dt
    }
    pub fn physical_derivative(
        &self,
        x: &[f64],
        interval: usize,
        t: f64,
        y: &[f64; 7],
    ) -> [f64; 7] {
        let (start, dt) = self.interval_time(x, interval, -1.0);
        let tau = 2.0 * (t - start) / dt - 1.0;
        flight::evaluate(
            &self.vehicle,
            PhaseContext::new(0, interval < self.burn_intervals),
            t,
            0.0,
            y,
            [
                self.input.azimuth_deg.to_radians(),
                self.control(x, interval, tau),
                0.0,
            ],
        )
        .map(|e| e.derivative)
        .unwrap_or([f64::NAN; 7])
    }
    /// Dynamics in scaled coordinates, followed by path observables.
    fn local<T: Scalar>(&self, z: SVector<T, 9>, powered: bool) -> SVector<T, 13> {
        let y = std::array::from_fn(|c| T::from(self.origin[c]) + z[c] * self.state_scale(c));
        let eval = flight::evaluate(
            &self.vehicle,
            PhaseContext::new(0, powered),
            z[8],
            T::from(0.0),
            &y,
            [
                T::from(self.input.azimuth_deg.to_radians()),
                z[7],
                T::from(0.0),
            ],
        );
        let Ok(e) = eval else {
            return SVector::repeat(T::from(f64::NAN));
        };
        let mut out = SVector::zeros();
        for c in 0..7 {
            out[c] = e.derivative[c] / self.state_scale(c);
        }
        out[7] = e.environment.q / self.input.max_dynamic_pressure_pa;
        // Equivalent forward cone, without dividing by tiny launch airspeed.
        // The strictly positive denominator changes only constraint scaling.
        let speed2 = e.environment.air_ned.dot(&e.environment.air_ned);
        let denominator = speed2 + self.scaling.angle_constraint_speed_m_s.powi(2);
        let cosine = self.input.max_angle_of_attack_deg.to_radians().cos();
        out[8] = (e.air_body.x * e.air_body.x - speed2 * (cosine * cosine)) / denominator;
        out[9] = e.air_body.x / denominator.sqrt();
        out[10] = e.specific_force / self.input.max_specific_force_m_s2;
        out[11] = (e.environment.llh.z - self.vehicle.launch.llh.z) / self.scaling.position_m;
        out[12] = y[0] / self.scaling.mass_kg;
        out
    }
    fn local_input(&self, x: &[f64], interval: usize, j: usize) -> SVector<f64, 9> {
        let node = interval * self.input.degree + j;
        let (t, _) = self.interval_time(x, interval, self.grid.nodes[j]);
        SVector::from_fn(|c, _| match c {
            0..=6 => x[7 * node + c],
            7 => self.control(x, interval, self.grid.nodes[j]),
            _ => t,
        })
    }
    pub fn terminal<T: Scalar>(&self, x: &[T]) -> SVector<T, 3> {
        let y = self.state(x, self.count());
        let (t, _) = self.interval_time(x, self.intervals() - 1, 1.0);
        self.terminal_from_state(&y, t)
    }
    pub fn terminal_from_state<T: Scalar>(&self, y: &[T; 7], t: T) -> SVector<T, 3> {
        let e = flight::environment(&self.vehicle, t, y);
        let launch_to_ned = C::dcm_ecef_to_ned(&self.vehicle.launch.llh);
        let along_ned = Vector3::new(
            self.input.azimuth_deg.to_radians().cos(),
            self.input.azimuth_deg.to_radians().sin(),
            0.0,
        );
        let along_ecef = launch_to_ned.transpose() * along_ned;
        let r = C::pos_eci_to_ecef_scalar(&Vector3::new(y[1], y[2], y[3]), t);
        let delta = r - Vector3::new(
            T::from(self.origin[1]),
            T::from(self.origin[2]),
            T::from(self.origin[3]),
        );
        let along = delta.dot(&along_ecef.map(T::from));
        SVector::<T, 3>::new(
            e.llh.z / self.scaling.position_m,
            e.velocity_ned.z / self.scaling.velocity_m_s,
            along / self.scaling.position_m,
        )
    }
    pub fn interpolated_state(&self, x: &[f64], interval: usize, tau: f64) -> [f64; 7] {
        std::array::from_fn(|c| {
            let values: Vec<_> = (0..=self.input.degree)
                .map(|j| self.state(x, interval * self.input.degree + j)[c])
                .collect();
            interpolate(&self.grid.nodes, &values, tau)
        })
    }

    fn entries(&self, x: &[f64]) -> BTreeMap<(usize, usize), f64> {
        let mut a = BTreeMap::new();
        let degree = self.input.degree;
        let count = self.count();
        let ti = self.time_index();
        let pi = self.payload_index();
        for k in 0..count {
            let interval = k / degree;
            let j = k % degree + 1;
            let node = interval * degree + j;
            let z = self.local_input(x, interval, j);
            let (values, jac) = jacobian(|z| self.local(z, interval < self.burn_intervals), &z);
            let (_, dt) = self.interval_time(x, interval, self.grid.nodes[j]);
            let dt_deriv = if interval >= self.burn_intervals {
                self.scaling.time_s / self.input.coast_intervals as f64
            } else {
                0.0
            };
            let t_deriv = if interval >= self.burn_intervals {
                self.scaling.time_s / self.input.coast_intervals as f64
                    * ((interval - self.burn_intervals) as f64 + (self.grid.nodes[j] + 1.0) * 0.5)
            } else {
                0.0
            };
            for c in 0..7 {
                for l in 0..=degree {
                    a.insert(
                        (7 * k + c, 7 * (interval * degree + l) + c),
                        self.grid.differentiation[j - 1][l],
                    );
                }
                for l in 0..7 {
                    *a.entry((7 * k + c, 7 * node + l)).or_default() -= dt * 0.5 * jac[(c, l)];
                }
                if interval < self.burn_intervals {
                    a.insert((7 * k + c, self.control_index(k)), -dt * 0.5 * jac[(c, 7)]);
                }
                a.insert(
                    (7 * k + c, ti),
                    -0.5 * (dt_deriv * values[c] + dt * jac[(c, 8)] * t_deriv),
                );
            }
            let row = 7 * count + 10 + 6 * k;
            for c in 0..6 {
                for l in 0..7 {
                    a.insert((row + c, 7 * node + l), jac[(7 + c, l)]);
                }
                if interval < self.burn_intervals {
                    a.insert((row + c, self.control_index(k)), jac[(7 + c, 7)]);
                }
                a.insert((row + c, ti), jac[(7 + c, 8)] * t_deriv);
            }
            a.insert(
                (row + 5, pi),
                -self.scaling.payload_objective_kg / self.scaling.mass_kg,
            );
        }
        let init = 7 * count;
        for c in 0..7 {
            a.insert((init + c, c), 1.0);
        }
        a.insert(
            (init, pi),
            -self.scaling.payload_objective_kg / self.scaling.mass_kg,
        );
        let end = 7 * count + 7;
        let local = SVector::<f64, 8>::from_fn(|c, _| if c < 7 { x[7 * count + c] } else { x[ti] });
        let (_, jac) = jacobian(
            |z| {
                let y = std::array::from_fn(|c| {
                    num_dual::DualSVec64::<8>::from_re(self.origin[c]) + z[c] * self.state_scale(c)
                });
                self.terminal_from_state(
                    &y,
                    num_dual::DualSVec64::<8>::from_re(self.burn_end) + z[7] * self.scaling.time_s,
                )
            },
            &local,
        );
        for r in 0..3 {
            for c in 0..7 {
                a.insert((end + r, 7 * count + c), jac[(r, c)]);
            }
            a.insert((end + r, ti), jac[(r, 7)]);
        }
        let start = end + 3 + 6 * count;
        let (b, _) = basis(&self.grid.nodes[1..], -1.0);
        for interval in 1..self.burn_intervals {
            let row = start + interval - 1;
            for (j, w) in b.iter().enumerate() {
                a.insert((row, self.control_index(interval * degree + j)), *w);
            }
            a.insert((row, self.control_index(interval * degree - 1)), -1.0);
        }
        let start = start + self.burn_intervals - 1;
        let n = degree - 1;
        for interval in 0..self.burn_intervals {
            let (_, dt) = self.interval_time(x, interval, 0.0);
            for j in 0..n {
                let row = start + interval * n + j;
                for l in 0..degree {
                    a.insert(
                        (row, self.control_index(interval * degree + l)),
                        (self.bernstein[j + 1][l] - self.bernstein[j][l]) * n as f64
                            / dt
                            / self.input.max_pitch_rate_deg_s.to_radians(),
                    );
                }
            }
        }
        let start = start + self.burn_intervals * n;
        for interval in 1..self.burn_intervals {
            for j in 1..n {
                let row = start + (interval - 1) * (n - 1) + j - 1;
                for l in 0..degree {
                    a.insert(
                        (row, self.control_index(interval * degree + l)),
                        self.bernstein[j][l],
                    );
                }
            }
        }

        a
    }
}

impl NlpModel for SingleStage {
    fn coordinates(&self) -> super::scaling::PhysicalCoordinates {
        use super::scaling::{Coordinate, PhysicalCoordinates};
        let mut map = PhysicalCoordinates::dimensionless(self.layout());
        let units = ["kg", "m", "m", "m", "m/s", "m/s", "m/s"];
        for node in 0..=self.count() {
            for (c, unit) in units.iter().enumerate() {
                map.variables[7 * node + c] = Coordinate {
                    offset: self.origin[c],
                    scale: self.state_scale(c),
                    unit: (*unit).into(),
                };
            }
        }
        for k in 0..self.burn_intervals * self.input.degree {
            map.variables[self.control_index(k)] = Coordinate::new(1.0, "rad");
        }
        map.variables[self.payload_index()] =
            Coordinate::new(self.scaling.payload_objective_kg, "kg");
        map.variables[self.time_index()] = Coordinate::new(self.scaling.time_s, "s");
        for (i, name) in self.layout.constraints.iter().enumerate() {
            map.constraints[i] = if name.starts_with("DYN[") || name.starts_with("INIT.") {
                let c = name.rsplit('.').next().unwrap().parse::<usize>().unwrap();
                Coordinate::new(self.state_scale(c), units[c])
            } else if name == "APOGEE.altitude"
                || name.starts_with("RANGE.")
                || name.starts_with("CLEARANCE[")
            {
                Coordinate::new(self.scaling.position_m, "m")
            } else if name == "APOGEE.velocity_down" {
                Coordinate::new(self.scaling.velocity_m_s, "m/s")
            } else if name.starts_with("Q[") {
                Coordinate::new(self.input.max_dynamic_pressure_pa, "Pa")
            } else if name.starts_with("ACCEL[") {
                Coordinate::new(self.input.max_specific_force_m_s2, "m/s^2")
            } else if name.starts_with("MASS.") {
                Coordinate::new(self.scaling.mass_kg, "kg")
            } else if name.starts_with("CONTROL.rate") {
                Coordinate::new(self.input.max_pitch_rate_deg_s.to_radians(), "rad/s")
            } else if name.starts_with("CONTROL.") {
                Coordinate::new(1.0, "rad")
            } else {
                Coordinate::new(1.0, "1")
            };
        }
        map.objective = Coordinate::new(self.scaling.payload_objective_kg, "kg");
        map
    }
    fn layout(&self) -> &Layout {
        &self.layout
    }
    fn objective(&self, x: &[f64]) -> f64 {
        -x[self.payload_index()]
    }
    fn gradient(&self, _: &[f64], out: &mut [f64]) {
        out.fill(0.0);
        out[self.payload_index()] = -1.0;
    }
    fn constraints(&self, x: &[f64], out: &mut [f64]) {
        let degree = self.input.degree;
        let count = self.count();
        for k in 0..count {
            let interval = k / degree;
            let j = k % degree + 1;
            let (_, dt) = self.interval_time(x, interval, self.grid.nodes[j]);
            let local = self.local(
                self.local_input(x, interval, j),
                interval < self.burn_intervals,
            );
            for c in 0..7 {
                out[7 * k + c] = (0..=degree)
                    .map(|l| {
                        self.grid.differentiation[j - 1][l] * x[7 * (interval * degree + l) + c]
                    })
                    .sum::<f64>()
                    - dt * 0.5 * local[c];
            }
            let row = 7 * count + 10 + 6 * k;
            out[row..row + 6].copy_from_slice(&local.as_slice()[7..13]);
            out[row + 5] -=
                (self.input.dry_mass_kg + self.input.reserve_propellant_kg + self.payload(x))
                    / self.scaling.mass_kg;
        }
        for c in 0..7 {
            out[7 * count + c] = x[c];
        }
        out[7 * count] -=
            (self.vehicle.stages[0].mass_initial + self.payload(x)) / self.scaling.mass_kg;
        let v = C::vel_eci_init(&self.vehicle.launch.velocity_ned, &self.vehicle.launch.llh);
        for c in 4..7 {
            out[7 * count + c] -= v[c - 4] / self.state_scale(c);
        }
        let end = 7 * count + 7;
        out[end..end + 3].copy_from_slice(self.terminal(x).as_slice());
        let start = end + 3 + 6 * count;
        for interval in 1..self.burn_intervals {
            out[start + interval - 1] =
                self.control(x, interval, -1.0) - self.control(x, interval - 1, 1.0);
        }
        let start = start + self.burn_intervals - 1;
        let n = degree - 1;
        let coefficient = |interval: usize, j: usize| {
            (0..degree)
                .map(|l| self.bernstein[j][l] * x[self.control_index(interval * degree + l)])
                .sum::<f64>()
        };
        for interval in 0..self.burn_intervals {
            let (_, dt) = self.interval_time(x, interval, 0.0);
            for j in 0..n {
                out[start + interval * n + j] =
                    (coefficient(interval, j + 1) - coefficient(interval, j)) * n as f64
                        / dt
                        / self.input.max_pitch_rate_deg_s.to_radians();
            }
        }
        let start = start + self.burn_intervals * n;
        for interval in 1..self.burn_intervals {
            for j in 1..n {
                out[start + (interval - 1) * (n - 1) + j - 1] = coefficient(interval, j);
            }
        }
    }
    fn jacobian(&self, x: &[f64], out: &mut [f64]) {
        let entries = self.entries(x);
        for (v, &(r, c)) in out.iter_mut().zip(&self.layout.jacobian) {
            *v = entries[&(r as usize, c as usize)];
        }
    }
    fn snapshot(&self, x: &[f64]) -> Option<super::ProgressSnapshot> {
        let mut s = super::ProgressSnapshot {
            payload_kg: self.payload(x),
            phase_end_s: vec![
                self.input.vertical_ascent_s,
                self.burn_end,
                self.burn_end + self.coast_duration(x),
            ],
            ..Default::default()
        };
        for k in 0..self.intervals() {
            let phase = if k == 0 {
                0
            } else if k < self.burn_intervals {
                1
            } else {
                2
            };
            for j in 0..=self.input.degree {
                let (t, _) = self.interval_time(x, k, self.grid.nodes[j]);
                let y = self.state(x, k * self.input.degree + j);
                s.push(&self.vehicle.launch.llh, t, phase, &y);
            }
        }
        Some(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::optimization::{
        problem::{OptimizationRequest, Problem},
        solve,
    };
    fn request() -> OptimizationRequest {
        serde_json::from_str(include_str!(
            "../../examples/optimization/single_stage_100km.json"
        ))
        .unwrap()
    }
    pub fn model() -> SingleStage {
        let Problem::SingleStage(p) = request().problem else {
            panic!()
        };
        SingleStage::new(*p).unwrap()
    }
    #[test]
    fn sparse_local_ad_matches_full_transcription_directions() {
        let m = model();
        let mut x = m.layout.initial.clone();
        for (i, v) in x.iter_mut().enumerate() {
            *v += 0.0002 * (i as f64 * 0.7).sin();
        }
        let d: Vec<_> = (0..x.len())
            .map(|i| (i as f64 * 1.13 + 0.4).sin() * 0.05)
            .collect();
        let mut j = vec![0.0; m.layout.jacobian.len()];
        m.jacobian(&x, &mut j);
        let mut jd = vec![0.0; m.layout.constraints.len()];
        for (&v, &(r, c)) in j.iter().zip(&m.layout.jacobian) {
            jd[r as usize] += v * d[c as usize];
        }
        let mut best = vec![f64::INFINITY; jd.len()];
        // One scaled perturbation corresponds to different SI distances and
        // velocities. Near liftoff the airspeed is small; inspect convergence
        // over step sizes before roundoff in Earth-centred position dominates.
        for h in [1e-4, 1e-5, 1e-6, 1e-7] {
            let xp: Vec<_> = x.iter().zip(&d).map(|(x, d)| x + h * d).collect();
            let xm: Vec<_> = x.iter().zip(&d).map(|(x, d)| x - h * d).collect();
            let mut gp = vec![0.0; jd.len()];
            let mut gm = gp.clone();
            m.constraints(&xp, &mut gp);
            m.constraints(&xm, &mut gm);
            for row in 0..jd.len() {
                let fd = (gp[row] - gm[row]) / (2.0 * h);
                best[row] = best[row].min((fd - jd[row]).abs());
            }
        }
        for row in 0..jd.len() {
            assert!(
                best[row] < 2e-6 * (1.0 + jd[row].abs()),
                "{}: best direction error {}",
                m.layout.constraints[row],
                best[row]
            );
        }
    }
    #[test]
    fn boundary_times_are_identical_from_both_sides() {
        let m = model();
        let mut x = m.layout.initial.clone();
        for duration in [61.123456789, 118.14968396902496, 179.999999] {
            x[m.time_index()] = duration / m.scaling.time_s;
            for i in 1..m.intervals() {
                assert_eq!(
                    m.interval_time(&x, i - 1, 1.0).0,
                    m.interval_time(&x, i, -1.0).0
                );
            }
        }
    }
    #[test]
    fn bernstein_envelopes_bound_interpolated_control_and_derivative() {
        for degree in 3..=8 {
            let grid = Lgr::new(degree).unwrap();
            let w = bernstein_weights(&grid.nodes[1..]);
            let u: Vec<_> = (0..degree).map(|i| (i as f64 * 1.3 + 0.4).sin()).collect();
            let b: Vec<f64> = w
                .iter()
                .map(|row| row.iter().zip(&u).map(|(a, u)| a * u).sum())
                .collect();
            let low = b.iter().copied().fold(f64::INFINITY, f64::min);
            let high = b.iter().copied().fold(f64::NEG_INFINITY, f64::max);
            let rate = b
                .windows(2)
                .map(|b| (b[1] - b[0]).abs() * (degree - 1) as f64)
                .fold(0.0, f64::max);
            for k in 0..=100 {
                let tau = -1.0 + 2.0 * k as f64 / 100.0;
                let (v, d) = basis(&grid.nodes[1..], tau);
                let value = v.iter().zip(&u).map(|(a, u)| a * u).sum::<f64>();
                let derivative = d.iter().zip(&u).map(|(a, u)| a * u).sum::<f64>() * 2.0;
                assert!(value >= low - 1e-9 && value <= high + 1e-9);
                assert!(derivative.abs() <= rate + 1e-8);
            }
        }
    }
    #[test]
    fn coarse_mesh_convergence_is_rejected_by_independent_integration() {
        let r: OptimizationRequest = serde_json::from_str(include_str!(
            "../../examples/optimization/single_stage_100km_coarse.json"
        ))
        .unwrap();
        let r = solve(r).unwrap();
        assert!(r.converged);
        let v = r.validation.unwrap();
        assert_eq!(v.status, "failed");
        assert!(
            v.flight
                .unwrap()
                .checks
                .iter()
                .any(|c| c.id == "DYN.position" && !c.passed)
        );
    }
    #[test]
    fn fixed_payload_and_time_are_supported_before_free_design_variables() {
        let mut r = request();
        let Problem::SingleStage(ref mut p) = r.problem else {
            panic!()
        };
        p.additional_payload_kg = DurationBounds {
            initial: 10.0,
            lower: 10.0,
            upper: 10.0,
        };
        p.coast_duration_s = DurationBounds {
            initial: 118.16,
            lower: 118.16,
            upper: 118.16,
        };
        let r = solve(r).unwrap();
        assert!(r.converged);
        assert_eq!(r.validation.unwrap().status, "passed");
    }
    #[test]
    fn impossible_fixed_throttle_load_is_not_success() {
        let mut r = request();
        let Problem::SingleStage(ref mut p) = r.problem else {
            panic!()
        };
        p.max_specific_force_m_s2 = 35.0;
        p.burn_intervals = 4;
        p.coast_intervals = 2;
        p.degree = 3;
        r.solver.max_iterations = 200;
        let r = solve(r).unwrap();
        assert!(!r.converged);
        assert_ne!(r.validation.unwrap().status, "passed");
    }
    #[test]
    fn invalid_inventory_and_unsupported_modes_are_rejected() {
        let mut m = model().input;
        m.propellant_mass_kg -= 1.0;
        assert!(m.load_vehicle().is_err());
        let mut m = model().input;
        m.reserve_propellant_kg = 1.0;
        assert!(m.load_vehicle().is_err());
    }
    #[test]
    fn solve_single_stage() {
        let r = solve(request()).unwrap();
        eprintln!(
            "{} iterations={} objective={:?}",
            r.solver_status,
            r.iterations.len(),
            r.solution.as_ref().map(|s| s.objective)
        );
        if let Some(s) = &r.solution {
            let m = model();
            let mut g = vec![0.0; m.layout.constraints.len()];
            m.constraints(&s.x, &mut g);
            for (i, v) in g.iter().enumerate() {
                let violation = (m.layout.g_lower[i] - v)
                    .max(v - m.layout.g_upper[i])
                    .max(0.0);
                if violation > 1e-6 {
                    eprintln!("{}: {v} (violation {violation})", m.layout.constraints[i]);
                }
            }
        }
        assert!(r.converged);
        assert_eq!(r.validation.as_ref().unwrap().status, "passed");
        let f = r.validation.unwrap().flight.unwrap();
        assert!((f.mass_ledger.additional_payload_kg - 16.89).abs() < 0.03);
        assert!(f.checks.iter().all(|c| c.passed));
    }
}
