use super::problem::{EndEvent, MultiStageProblem};
use crate::{
    math::{constants::MU_EARTH, integrator::DormandPrince54},
    optimization::{
        control::{basis, bernstein_weights},
        events::{constant_mass_flow, separated_mass},
        lgr::Lgr,
        single_stage::FlightScaling,
        tnlp::{Layout, NlpModel},
    },
    physics::{
        Scalar,
        coordinates::CoordinateTransform as C,
        flight::{self, PhaseContext},
    },
    vehicle::Vehicle,
};
use nalgebra::{SVector, Vector3};
use num_dual::jacobian;
use std::collections::BTreeMap;

const OBS: usize = 7;
#[derive(Clone, Copy)]
pub struct Interval {
    pub phase: usize,
    pub ordinal: usize,
}
#[derive(Clone)]
enum Row {
    Dynamics(usize, usize, usize),
    Initial(usize),
    Link(usize, usize),
    Orbit(usize),
    Path(usize, usize, usize),
    Budget(usize),
    Continuity(usize, usize),
    Rate(usize, usize, usize),
    Envelope(usize, usize, usize),
    FairingAltitude(usize),
    CoastAffine(usize, usize, usize),
}

pub struct MultiStage {
    pub input: MultiStageProblem,
    pub vehicle: Vehicle,
    pub grid: Lgr,
    pub scaling: FlightScaling,
    pub intervals: Vec<Interval>,
    pub phase_first: Vec<usize>,
    pub stage_first_phase: Vec<usize>,
    pub fairing_on: Vec<bool>,
    pub flow: Vec<f64>,
    pub(crate) layout: Layout,
    rows: Vec<Row>,
    origin: [f64; 7],
    bernstein: Vec<Vec<f64>>,
}
impl MultiStage {
    pub fn new(input: MultiStageProblem) -> Result<Self, String> {
        let vehicle = input.load_vehicle()?;
        let grid = Lgr::new(input.degree)?;
        let bernstein = bernstein_weights(&grid.nodes[1..]);
        let r = C::pos_eci_init(&vehicle.launch.llh);
        let scaling = FlightScaling {
            strategy: "S0 physical scales, explicit phase/event connections".into(),
            mass_kg: input.initial_mass(input.net_payload_kg.initial),
            position_m: 1e6,
            velocity_m_s: 8000.0,
            time_s: 100.0,
            payload_objective_kg: 1000.0,
            angle_constraint_speed_m_s: 10.0,
            position_origin_eci_m: r.into(),
        };
        let mut intervals = vec![];
        let mut phase_first = vec![];
        let mut stage_first_phase = vec![usize::MAX; input.stages.len()];
        let mut fairing_on = vec![];
        let mut carried = input.fairing_kg > 0.0;
        for (p, phase) in input.phases.iter().enumerate() {
            phase_first.push(intervals.len());
            stage_first_phase[phase.stage] = stage_first_phase[phase.stage].min(p);
            fairing_on.push(carried);
            for ordinal in 0..phase.intervals {
                intervals.push(Interval { phase: p, ordinal });
            }
            if phase.end_event == EndEvent::JettisonFairing {
                carried = false;
            }
        }
        let flow = vehicle.stages.iter().map(constant_mass_flow).collect();
        let mut m = Self {
            input,
            vehicle,
            grid,
            scaling,
            intervals,
            phase_first,
            stage_first_phase,
            fairing_on,
            flow,
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
            rows: vec![],
            origin: [0.0, r.x, r.y, r.z, 0.0, 0.0, 0.0],
            bernstein,
        };
        let count = m.intervals.len();
        let degree = m.input.degree;
        for node in 0..m.state_nodes() {
            for c in 0..7 {
                m.variable(
                    format!("state[{node}].{c}_scaled"),
                    if c == 0 {
                        1.0 / m.scaling.mass_kg
                    } else {
                        -20.0
                    },
                    if c == 0 {
                        m.input.initial_mass(m.input.net_payload_kg.upper) / m.scaling.mass_kg
                    } else {
                        20.0
                    },
                    0.0,
                );
            }
        }
        for i in 0..count {
            for j in 0..degree {
                for axis in 0..2 {
                    let bounds = if axis == 0 {
                        m.input.azimuth_bounds_deg
                    } else {
                        m.input.elevation_bounds_deg
                    };
                    let fixed = m.input.phases[m.intervals[i].phase].vertical;
                    let value = if axis == 0 {
                        m.input.initial_azimuth_deg
                    } else {
                        90.0
                    };
                    m.variable(
                        format!(
                            "control[{i},{j}].{}_rad",
                            if axis == 0 { "azimuth" } else { "elevation" }
                        ),
                        if fixed { value } else { bounds[0] }.to_radians(),
                        if fixed { value } else { bounds[1] }.to_radians(),
                        value.to_radians(),
                    );
                }
            }
        }
        for p in 0..m.input.phases.len() {
            let b = &m.input.phases[p].duration_s;
            let (lo, hi, initial) = (b.lower / 100.0, b.upper / 100.0, b.initial / 100.0);
            m.variable(format!("phase[{p}].duration_scaled"), lo, hi, initial);
        }
        let b = &m.input.net_payload_kg;
        let (lo, hi, initial) = (b.lower / 1000.0, b.upper / 1000.0, b.initial / 1000.0);
        m.variable("net_payload_scaled".into(), lo, hi, initial);
        for i in 0..count {
            for j in 1..=degree {
                for c in 0..7 {
                    m.row(
                        Row::Dynamics(i, j, c),
                        format!("DYN[{i},{j}].{c}"),
                        0.0,
                        0.0,
                    );
                }
            }
        }
        for c in 0..7 {
            m.row(Row::Initial(c), format!("INIT.{c}"), 0.0, 0.0);
        }
        for i in 0..count {
            for c in 0..7 {
                m.row(
                    Row::Link(i, c),
                    format!("EVENT_OR_CONTINUITY[{i}].{c}"),
                    0.0,
                    0.0,
                );
            }
        }
        for c in 0..4 {
            m.row(Row::Orbit(c), format!("ORBIT.{c}"), 0.0, 0.0);
        }
        for i in 0..count {
            let p = m.intervals[i].phase;
            for j in 0..=degree {
                if j == 0 && (i == 0 || m.intervals[i - 1].phase == p) {
                    continue;
                }
                for c in 0..OBS {
                    let (id, lo, hi) = match c {
                        0 => ("Q", -1e19, 1.0),
                        1 => ("AEROLOAD.cone", 0.0, 1e19),
                        2 => ("AEROLOAD.forward", 0.0, 1e19),
                        3 => ("ACCEL", -1e19, 1.0),
                        4 => (
                            "CLEARANCE",
                            (m.input.phases[p].min_altitude_m - m.vehicle.launch.llh.z)
                                / m.scaling.position_m,
                            1e19,
                        ),
                        5 => ("MASS.reserve", 0.0, 1e19),
                        _ => ("CONTROL.inertial_rate", -1e19, 1.0),
                    };
                    m.row(Row::Path(i, j, c), format!("{id}[{i},{j}]"), lo, hi);
                }
            }
        }
        for s in 0..m.input.stages.len() {
            if !m
                .input
                .phases
                .iter()
                .any(|p| p.stage == s && p.powered() && p.duration_s.lower < p.duration_s.upper)
            {
                continue;
            }
            let allowed = m.input.stages[s]
                .max_total_burn_s
                .min((m.input.stages[s].propellant_kg - m.input.stages[s].reserve_kg) / m.flow[s]);
            m.row(
                Row::Budget(s),
                format!("ENGINE.burn_budget[{s}]"),
                0.0,
                allowed / m.scaling.time_s,
            );
        }
        for i in 1..count {
            for axis in 0..2 {
                m.row(
                    Row::Continuity(i, axis),
                    format!("CONTROL.continuity[{i}].{axis}"),
                    0.0,
                    0.0,
                );
            }
        }
        for i in 0..count {
            for axis in 0..2 {
                for j in 0..degree - 1 {
                    m.row(
                        Row::Rate(i, axis, j),
                        format!("CONTROL.rate_envelope[{i},{axis},{j}]"),
                        -1.0,
                        1.0,
                    );
                }
                if !m.input.phases[m.intervals[i].phase].vertical {
                    let b = if axis == 0 {
                        m.input.azimuth_bounds_deg
                    } else {
                        m.input.elevation_bounds_deg
                    };
                    for j in 1..degree - 1 {
                        m.row(
                            Row::Envelope(i, axis, j),
                            format!("CONTROL.angle_envelope[{i},{axis},{j}]"),
                            b[0].to_radians(),
                            b[1].to_radians(),
                        );
                    }
                }
            }
        }
        for i in 0..count {
            if m.event(i) == EndEvent::JettisonFairing {
                m.row(
                    Row::FairingAltitude(i),
                    format!("FAIRING.release_altitude[{i}]"),
                    (m.input.fairing_release_min_altitude_m - m.vehicle.launch.llh.z)
                        / m.scaling.position_m,
                    1e19,
                );
            }
        }
        // In coast, attitude is an affine slew between phase endpoints. Free
        // high-order coast polynomials have essentially no force sensitivity
        // in vacuum and otherwise introduce physically irrelevant null modes.
        for p in 0..m.input.phases.len() {
            if !m.input.phases[p].powered() {
                let total = m.input.phases[p].intervals * degree;
                for k in 1..total - 1 {
                    for axis in 0..2 {
                        m.row(
                            Row::CoastAffine(p, k, axis),
                            format!("CONTROL.coast_affine[{p},{k},{axis}]"),
                            0.0,
                            0.0,
                        );
                    }
                }
            }
        }
        m.initialize()?;
        let (_, a) = m.assemble(&m.layout.initial, true);
        m.layout.jacobian = a.keys().map(|&(r, c)| (r as i32, c as i32)).collect();
        Ok(m)
    }
    fn variable(&mut self, name: String, lo: f64, hi: f64, value: f64) {
        self.layout.variables.push(name);
        self.layout.x_lower.push(lo);
        self.layout.x_upper.push(hi);
        self.layout.initial.push(value);
    }
    fn row(&mut self, row: Row, name: String, lo: f64, hi: f64) {
        self.rows.push(row);
        self.layout.constraints.push(name);
        self.layout.g_lower.push(lo);
        self.layout.g_upper.push(hi);
    }
    pub fn state_nodes(&self) -> usize {
        self.intervals.len() * (self.input.degree + 1) + 1
    }
    pub fn node(&self, i: usize, j: usize) -> usize {
        i * (self.input.degree + 1) + j
    }
    pub fn final_node(&self) -> usize {
        self.state_nodes() - 1
    }
    pub fn control_index(&self, i: usize, j: usize, axis: usize) -> usize {
        7 * self.state_nodes() + 2 * (i * self.input.degree + j) + axis
    }
    pub fn time_index(&self, p: usize) -> usize {
        7 * self.state_nodes() + 2 * self.intervals.len() * self.input.degree + p
    }
    pub fn payload_index(&self) -> usize {
        self.time_index(self.input.phases.len())
    }
    pub fn payload(&self, x: &[f64]) -> f64 {
        x[self.payload_index()] * self.scaling.payload_objective_kg
    }
    pub fn scale(&self, c: usize) -> f64 {
        match c {
            0 => self.scaling.mass_kg,
            1..=3 => self.scaling.position_m,
            _ => self.scaling.velocity_m_s,
        }
    }
    pub fn state<T: Scalar>(&self, x: &[T], node: usize) -> [T; 7] {
        std::array::from_fn(|c| T::from(self.origin[c]) + x[7 * node + c] * self.scale(c))
    }
    pub fn duration<T: Scalar>(&self, x: &[T], p: usize) -> T {
        x[self.time_index(p)] * self.scaling.time_s
    }
    pub fn phase_start<T: Scalar>(&self, x: &[T], p: usize) -> T {
        (0..p).fold(T::from(0.0), |t, q| t + self.duration(x, q))
    }
    pub fn stage_start<T: Scalar>(&self, x: &[T], p: usize) -> T {
        self.phase_start(x, self.stage_first_phase[self.input.phases[p].stage])
    }
    pub fn interval_time<T: Scalar>(&self, x: &[T], i: usize, tau: f64) -> (T, T) {
        let interval = self.intervals[i];
        let p = interval.phase;
        let h = self.duration(x, p);
        let start = self.phase_start(x, p);
        let n = self.input.phases[p].intervals as f64;
        let boundary = |j: usize| {
            if j == self.input.phases[p].intervals {
                self.phase_start(x, p + 1)
            } else {
                start + h * (j as f64 / n)
            }
        };
        let (a, b) = (boundary(interval.ordinal), boundary(interval.ordinal + 1));
        let dt = b - a;
        (
            if tau == -1.0 {
                a
            } else if tau == 1.0 {
                b
            } else {
                a + dt * ((tau + 1.0) * 0.5)
            },
            dt,
        )
    }
    pub fn control<T: Scalar>(&self, x: &[T], i: usize, tau: f64) -> [T; 2] {
        let (b, _) = basis(&self.grid.nodes[1..], tau);
        std::array::from_fn(|axis| {
            b.iter().enumerate().fold(T::from(0.0), |v, (j, w)| {
                v + x[self.control_index(i, j, axis)] * *w
            })
        })
    }
    pub fn control_rate(&self, x: &[f64], i: usize, tau: f64) -> [f64; 2] {
        let (_, d) = basis(&self.grid.nodes[1..], tau);
        let (_, dt) = self.interval_time(x, i, tau);
        std::array::from_fn(|axis| {
            d.iter()
                .enumerate()
                .map(|(j, w)| w * x[self.control_index(i, j, axis)] * 2.0 / dt)
                .sum()
        })
    }
    pub fn context(&self, p: usize) -> PhaseContext {
        PhaseContext {
            stage: self.input.phases[p].stage,
            powered: self.input.phases[p].powered(),
            aero_area_scale: if self.fairing_on[p] {
                1.0
            } else {
                self.input.fairing_off_area_scale
            },
        }
    }
    pub fn event(&self, i: usize) -> EndEvent {
        let v = self.intervals[i];
        if v.ordinal + 1 == self.input.phases[v.phase].intervals {
            self.input.phases[v.phase].end_event
        } else {
            EndEvent::None
        }
    }
    pub fn burn_time<T: Scalar>(&self, x: &[T], stage: usize, through: usize) -> T {
        (0..=through)
            .filter(|&p| self.input.phases[p].stage == stage && self.input.phases[p].powered())
            .fold(T::from(0.0), |v, p| v + self.duration(x, p))
    }
    pub fn removed_mass<T: Scalar>(&self, x: &[T], i: usize) -> T {
        let p = self.intervals[i].phase;
        let stage = self.input.phases[p].stage;
        match self.event(i) {
            EndEvent::None => T::from(0.0),
            EndEvent::JettisonFairing => T::from(self.input.fairing_kg),
            EndEvent::SeparateStage => separated_mass(
                &self.input.stages[stage],
                self.flow[stage],
                self.burn_time(x, stage, p),
            ),
            EndEvent::DeployPayload => {
                separated_mass(
                    &self.input.stages[stage],
                    self.flow[stage],
                    self.burn_time(x, stage, p),
                ) + self.input.payload_adapter_kg
            }
        }
    }
    pub fn mass_floor(&self, x: &[f64], p: usize) -> f64 {
        let s = self.input.phases[p].stage;
        self.payload(x)
            + self.input.payload_adapter_kg
            + if self.fairing_on[p] {
                self.input.fairing_kg
            } else {
                0.0
            }
            + self.input.stages[s].dry_kg
            + self.input.stages[s].reserve_kg
            + self.input.stages[s + 1..]
                .iter()
                .map(|s| s.wet())
                .sum::<f64>()
    }
    fn local<T: Scalar>(&self, z: SVector<T, 13>, p: usize) -> SVector<T, 14> {
        let y = std::array::from_fn(|c| T::from(self.origin[c]) + z[c] * self.scale(c));
        let Ok(e) = flight::evaluate(
            &self.vehicle,
            self.context(p),
            z[11],
            z[12],
            &y,
            [z[7], z[8], T::from(0.0)],
        ) else {
            return SVector::repeat(T::from(f64::NAN));
        };
        let mut out = SVector::zeros();
        for c in 0..7 {
            out[c] = e.derivative[c] / self.scale(c);
        }
        let v2 = e.environment.air_ned.dot(&e.environment.air_ned);
        let denominator = v2 + self.scaling.angle_constraint_speed_m_s.powi(2);
        let co = self.input.phases[p]
            .max_angle_of_attack_deg
            .to_radians()
            .cos();
        out[7] = e.environment.q / self.input.max_dynamic_pressure_pa;
        out[8] = (e.air_body.x * e.air_body.x - v2 * (co * co)) / denominator;
        out[9] = e.air_body.x / denominator.sqrt();
        out[10] = e.specific_force / self.input.phases[p].max_specific_force_m_s2;
        out[11] = (e.environment.llh.z - self.vehicle.launch.llh.z) / self.scaling.position_m;
        out[12] = y[0] / self.scaling.mass_kg;
        let rate = flight::direction_rate(z[11], &y, z[7], z[8], z[9], z[10]);
        out[13] = rate.dot(&rate)
            / self
                .input
                .max_inertial_direction_rate_deg_s
                .to_radians()
                .powi(2);
        out
    }
    fn local_input(&self, x: &[f64], i: usize, j: usize) -> SVector<f64, 13> {
        let tau = self.grid.nodes[j];
        let u = self.control(x, i, tau);
        let rate = self.control_rate(x, i, tau);
        let p = self.intervals[i].phase;
        let (t, _) = self.interval_time(x, i, tau);
        SVector::from_fn(|c, _| match c {
            0..=6 => x[7 * self.node(i, j) + c],
            7 => u[0],
            8 => u[1],
            9 => rate[0],
            10 => rate[1],
            11 => t,
            _ => self.stage_start(x, p),
        })
    }
    pub fn physical_derivative(&self, x: &[f64], i: usize, t: f64, y: &[f64; 7]) -> [f64; 7] {
        let (start, dt) = self.interval_time(x, i, -1.0);
        let u = self.control(x, i, 2.0 * (t - start) / dt - 1.0);
        let p = self.intervals[i].phase;
        flight::evaluate(
            &self.vehicle,
            self.context(p),
            t,
            self.stage_start(x, p),
            y,
            [u[0], u[1], 0.0],
        )
        .map(|e| e.derivative)
        .unwrap_or([f64::NAN; 7])
    }
    pub fn orbit<T: Scalar>(&self, y: &[T; 7]) -> SVector<T, 4> {
        let r = Vector3::new(y[1], y[2], y[3]);
        let v = Vector3::new(y[4], y[5], y[6]);
        let rt = self.input.orbit.reference_radius_m + self.input.orbit.altitude_m;
        let vt = (MU_EARTH / rt).sqrt();
        let h = r.cross(&v);
        let rn = r.dot(&r).sqrt();
        let hn = h.dot(&h).sqrt();
        SVector::<T, 4>::new(
            (r.dot(&r) - rt * rt) / (2.0 * rt * self.scaling.position_m),
            (v.dot(&v) - vt * vt) / (2.0 * vt * self.scaling.velocity_m_s),
            r.dot(&v) / rn / self.scaling.velocity_m_s,
            h.z / hn - self.input.orbit.inclination_deg.to_radians().cos(),
        )
    }
    fn initialize(&mut self) -> Result<(), String> {
        let mut x = self.layout.initial.clone();
        for i in 0..self.intervals.len() {
            let interval = self.intervals[i];
            let p = interval.phase;
            let previous = if p == 0 {
                [self.input.initial_azimuth_deg, 90.0]
            } else {
                self.input.phases[p - 1].initial_attitude_end_deg
            };
            let end = self.input.phases[p].initial_attitude_end_deg;
            for j in 0..self.input.degree {
                let s = (interval.ordinal as f64 + (self.grid.nodes[j + 1] + 1.0) * 0.5)
                    / self.input.phases[p].intervals as f64;
                let blend = if self.input.phases[p].powered() {
                    s * s * (3.0 - 2.0 * s)
                } else {
                    s
                };
                for axis in 0..2 {
                    x[self.control_index(i, j, axis)] =
                        (previous[axis] + blend * (end[axis] - previous[axis])).to_radians();
                }
            }
        }
        let r = C::pos_eci_init(&self.vehicle.launch.llh);
        let v = C::vel_eci_init(&self.vehicle.launch.velocity_ned, &self.vehicle.launch.llh);
        let mut y = [
            self.input.initial_mass(self.payload(&x)),
            r.x,
            r.y,
            r.z,
            v.x,
            v.y,
            v.z,
        ];
        let mut t = 0.0;
        for i in 0..self.intervals.len() {
            for j in 0..=self.input.degree {
                let (target, dt) = self.interval_time(&x, i, self.grid.nodes[j]);
                let rk = DormandPrince54::new(1e-10, 1e-11, 1e-10, (dt / 20.0).min(1.0));
                rk.try_advance_to(
                    &mut y,
                    &mut t,
                    target,
                    &[1e-5, 1e-3, 1e-3, 1e-3, 1e-5, 1e-5, 1e-5],
                    100000,
                    |t, y| self.physical_derivative(&x, i, t, y),
                )
                .map_err(|e| format!("initial phase {}, t={t}: {e}", self.intervals[i].phase))?;
                for c in 0..7 {
                    x[7 * self.node(i, j) + c] = (y[c] - self.origin[c]) / self.scale(c);
                }
            }
            y[0] -= self.removed_mass(&x, i);
        }
        for c in 0..7 {
            x[7 * self.final_node() + c] = (y[c] - self.origin[c]) / self.scale(c);
        }
        self.layout.initial = x;
        Ok(())
    }
    pub fn interpolated_state(&self, x: &[f64], i: usize, tau: f64) -> [f64; 7] {
        let (b, _) = basis(&self.grid.nodes, tau);
        std::array::from_fn(|c| {
            b.iter()
                .enumerate()
                .map(|(j, w)| w * self.state(x, self.node(i, j))[c])
                .sum()
        })
    }
    fn chain(&self, x: &[f64], i: usize, j: usize, deriv: &SVector<f64, 13>) -> Vec<(usize, f64)> {
        let mut out = vec![];
        for c in 0..7 {
            out.push((7 * self.node(i, j) + c, deriv[c]));
        }
        let p = self.intervals[i].phase;
        let tau = self.grid.nodes[j];
        let (b, d) = basis(&self.grid.nodes[1..], tau);
        let (_, dt) = self.interval_time(x, i, tau);
        let rate = self.control_rate(x, i, tau);
        for k in 0..self.input.degree {
            for axis in 0..2 {
                out.push((
                    self.control_index(i, k, axis),
                    deriv[7 + axis] * b[k] + deriv[9 + axis] * d[k] * 2.0 / dt,
                ));
            }
        }
        let f = (self.intervals[i].ordinal as f64 + (tau + 1.0) * 0.5)
            / self.input.phases[p].intervals as f64;
        for q in 0..=p {
            let mut v = deriv[11] * self.scaling.time_s * if q == p { f } else { 1.0 };
            if q < self.stage_first_phase[self.input.phases[p].stage] {
                v += deriv[12] * self.scaling.time_s;
            }
            if q == p {
                v -= (deriv[9] * rate[0] + deriv[10] * rate[1]) / x[self.time_index(p)];
            }
            out.push((self.time_index(q), v));
        }
        out
    }
    fn assemble(&self, x: &[f64], with_jac: bool) -> (Vec<f64>, BTreeMap<(usize, usize), f64>) {
        let degree = self.input.degree;
        let mut values = vec![];
        let mut jacobians = vec![];
        for i in 0..self.intervals.len() {
            for j in 0..=degree {
                let z = self.local_input(x, i, j);
                let p = self.intervals[i].phase;
                if with_jac {
                    let (v, j) = jacobian(|z| self.local(z, p), &z);
                    values.push(v);
                    jacobians.push(j);
                } else {
                    values.push(self.local(z, p));
                }
            }
        }
        let y = self.state(x, self.final_node());
        let end = self.orbit(&y);
        let end_jac = if with_jac {
            Some(
                jacobian(
                    |z| {
                        self.orbit(&std::array::from_fn(|c| {
                            num_dual::DualSVec64::<7>::from_re(self.origin[c])
                                + z[c] * self.scale(c)
                        }))
                    },
                    &SVector::<f64, 7>::from_fn(|c, _| x[7 * self.final_node() + c]),
                )
                .1,
            )
        } else {
            None
        };
        let mut g = vec![0.0; self.rows.len()];
        let mut entries = BTreeMap::new();
        for (row, kind) in self.rows.iter().enumerate() {
            let mut a = vec![];
            match *kind {
                Row::Dynamics(i, j, c) => {
                    let (_, dt) = self.interval_time(x, i, self.grid.nodes[j]);
                    let point = self.node(i, j);
                    g[row] = (0..=degree)
                        .map(|l| self.grid.differentiation[j - 1][l] * x[7 * self.node(i, l) + c])
                        .sum::<f64>()
                        - dt * 0.5 * values[point][c];
                    if with_jac {
                        for l in 0..=degree {
                            a.push((7 * self.node(i, l) + c, self.grid.differentiation[j - 1][l]));
                        }
                        for (col, v) in self.chain(x, i, j, &jacobians[point].row(c).transpose()) {
                            a.push((col, -dt * 0.5 * v));
                        }
                        let p = self.intervals[i].phase;
                        a.push((
                            self.time_index(p),
                            -0.5 * self.scaling.time_s / self.input.phases[p].intervals as f64
                                * values[point][c],
                        ));
                    }
                }
                Row::Initial(c) => {
                    let v = C::vel_eci_init(
                        &self.vehicle.launch.velocity_ned,
                        &self.vehicle.launch.llh,
                    );
                    let expected = match c {
                        0 => self.input.initial_mass(self.payload(x)) / self.scale(c),
                        1..=3 => 0.0,
                        _ => v[c - 4] / self.scale(c),
                    };
                    g[row] = x[c] - expected;
                    a.push((c, 1.0));
                    if c == 0 {
                        a.push((
                            self.payload_index(),
                            -self.scaling.payload_objective_kg / self.scale(c),
                        ));
                    }
                }
                Row::Link(i, c) => {
                    let before = self.node(i, degree);
                    let after = if i + 1 == self.intervals.len() {
                        self.final_node()
                    } else {
                        self.node(i + 1, 0)
                    };
                    g[row] = x[7 * after + c] - x[7 * before + c];
                    a.extend([(7 * after + c, 1.0), (7 * before + c, -1.0)]);
                    if c == 0 {
                        g[row] += self.removed_mass(x, i) / self.scale(0);
                        let p = self.intervals[i].phase;
                        let s = self.input.phases[p].stage;
                        if matches!(
                            self.event(i),
                            EndEvent::SeparateStage | EndEvent::DeployPayload
                        ) {
                            for q in 0..=p {
                                if self.input.phases[q].stage == s && self.input.phases[q].powered()
                                {
                                    a.push((
                                        self.time_index(q),
                                        -self.flow[s] * self.scaling.time_s / self.scale(0),
                                    ));
                                }
                            }
                        }
                    }
                }
                Row::Orbit(c) => {
                    g[row] = end[c];
                    if let Some(j) = &end_jac {
                        for k in 0..7 {
                            a.push((7 * self.final_node() + k, j[(c, k)]));
                        }
                    }
                }
                Row::Path(i, j, c) => {
                    let point = self.node(i, j);
                    g[row] = values[point][7 + c];
                    if c == 5 {
                        g[row] -= self.mass_floor(x, self.intervals[i].phase) / self.scale(0);
                        a.push((
                            self.payload_index(),
                            -self.scaling.payload_objective_kg / self.scale(0),
                        ));
                    }
                    if with_jac {
                        a.extend(self.chain(x, i, j, &jacobians[point].row(7 + c).transpose()));
                    }
                }
                Row::Budget(s) => {
                    for (p, phase) in self.input.phases.iter().enumerate() {
                        if phase.stage == s && phase.powered() {
                            g[row] += x[self.time_index(p)];
                            a.push((self.time_index(p), 1.0));
                        }
                    }
                }
                Row::Continuity(i, axis) => {
                    let (b, _) = basis(&self.grid.nodes[1..], -1.0);
                    g[row] = self.control(x, i, -1.0)[axis] - self.control(x, i - 1, 1.0)[axis];
                    for (j, w) in b.iter().enumerate() {
                        a.push((self.control_index(i, j, axis), *w));
                    }
                    a.push((self.control_index(i - 1, degree - 1, axis), -1.0));
                }
                Row::Rate(i, axis, j) => {
                    let (_, dt) = self.interval_time(x, i, 0.0);
                    let limit = if axis == 0 {
                        self.input.max_azimuth_rate_deg_s
                    } else {
                        self.input.max_elevation_rate_deg_s
                    }
                    .to_radians();
                    for l in 0..degree {
                        let w = (self.bernstein[j + 1][l] - self.bernstein[j][l])
                            * (degree - 1) as f64
                            / dt
                            / limit;
                        g[row] += w * x[self.control_index(i, l, axis)];
                        a.push((self.control_index(i, l, axis), w));
                    }
                    let p = self.intervals[i].phase;
                    a.push((self.time_index(p), -g[row] / x[self.time_index(p)]));
                }
                Row::Envelope(i, axis, j) => {
                    for l in 0..degree {
                        let w = self.bernstein[j][l];
                        g[row] += w * x[self.control_index(i, l, axis)];
                        a.push((self.control_index(i, l, axis), w));
                    }
                }
                Row::CoastAffine(p, k, axis) => {
                    let first = self.phase_first[p];
                    let last = first + self.input.phases[p].intervals - 1;
                    let i = first + k / degree;
                    let j = k % degree;
                    let fa =
                        (self.grid.nodes[1] + 1.0) * 0.5 / self.input.phases[p].intervals as f64;
                    let f = ((k / degree) as f64 + (self.grid.nodes[j + 1] + 1.0) * 0.5)
                        / self.input.phases[p].intervals as f64;
                    let w = (f - fa) / (1.0 - fa);
                    let c = self.control_index(i, j, axis);
                    let ca = self.control_index(first, 0, axis);
                    let cb = self.control_index(last, degree - 1, axis);
                    g[row] = x[c] - (1.0 - w) * x[ca] - w * x[cb];
                    a.extend([(c, 1.0), (ca, -(1.0 - w)), (cb, -w)]);
                }
                Row::FairingAltitude(i) => {
                    let point = self.node(i, degree);
                    g[row] = values[point][11];
                    if with_jac {
                        a.extend(self.chain(x, i, degree, &jacobians[point].row(11).transpose()));
                    }
                }
            }
            if with_jac {
                for (col, value) in a {
                    *entries.entry((row, col)).or_default() += value;
                }
            }
        }
        (g, entries)
    }
}
impl NlpModel for MultiStage {
    fn coordinates(&self) -> crate::optimization::scaling::PhysicalCoordinates {
        use crate::optimization::scaling::{Coordinate, PhysicalCoordinates};
        let mut map = PhysicalCoordinates::dimensionless(self.layout());
        let units = ["kg", "m", "m", "m", "m/s", "m/s", "m/s"];
        for node in 0..self.state_nodes() {
            for (c, unit) in units.iter().enumerate() {
                map.variables[7 * node + c] = Coordinate {
                    offset: self.origin[c],
                    scale: self.scale(c),
                    unit: (*unit).into(),
                };
            }
        }
        for i in 0..self.intervals.len() {
            for j in 0..self.input.degree {
                for axis in 0..2 {
                    map.variables[self.control_index(i, j, axis)] = Coordinate::new(1.0, "rad")
                }
            }
        }
        for p in 0..self.input.phases.len() {
            map.variables[self.time_index(p)] = Coordinate::new(self.scaling.time_s, "s")
        }
        map.variables[self.payload_index()] =
            Coordinate::new(self.scaling.payload_objective_kg, "kg");
        for (i, row) in self.rows.iter().enumerate() {
            map.constraints[i] = match *row {
                Row::Dynamics(_, _, c) | Row::Initial(c) | Row::Link(_, c) => {
                    Coordinate::new(self.scale(c), units[c])
                }
                Row::Orbit(c) => Coordinate::new(
                    if c == 0 {
                        self.scaling.position_m
                    } else if c < 3 {
                        self.scaling.velocity_m_s
                    } else {
                        1.0
                    },
                    if c == 0 {
                        "m"
                    } else if c < 3 {
                        "m/s"
                    } else {
                        "1"
                    },
                ),
                Row::Path(interval, _, c) => match c {
                    0 => Coordinate::new(self.input.max_dynamic_pressure_pa, "Pa"),
                    3 => Coordinate::new(
                        self.input.phases[self.intervals[interval].phase].max_specific_force_m_s2,
                        "m/s^2",
                    ),
                    4 => Coordinate::new(self.scaling.position_m, "m"),
                    5 => Coordinate::new(self.scaling.mass_kg, "kg"),
                    _ => Coordinate::new(1.0, "1"),
                },
                Row::Budget(_) => Coordinate::new(self.scaling.time_s, "s"),
                Row::Rate(_, axis, _) => Coordinate::new(
                    if axis == 0 {
                        self.input.max_azimuth_rate_deg_s
                    } else {
                        self.input.max_elevation_rate_deg_s
                    }
                    .to_radians(),
                    "rad/s",
                ),
                Row::FairingAltitude(_) => Coordinate::new(self.scaling.position_m, "m"),
                _ => Coordinate::new(1.0, "rad"),
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
        out.copy_from_slice(&self.assemble(x, false).0);
    }
    fn jacobian(&self, x: &[f64], out: &mut [f64]) {
        let (_, a) = self.assemble(x, true);
        for (v, &(r, c)) in out.iter_mut().zip(&self.layout.jacobian) {
            *v = a[&(r as usize, c as usize)];
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::optimization::problem::{OptimizationRequest, Problem};
    pub fn request() -> OptimizationRequest {
        serde_json::from_str(include_str!(
            "../../../examples/optimization/two_stage_500km_43deg.json"
        ))
        .unwrap()
    }
    pub fn model() -> MultiStage {
        let Problem::MultiStage(p) = request().problem else {
            panic!()
        };
        MultiStage::new(*p).unwrap()
    }
    #[test]
    fn sparse_phase_time_event_and_orbit_derivatives_match_directions() {
        let m = model();
        let mut x = m.layout.initial.clone();
        for (i, v) in x.iter_mut().enumerate() {
            *v += 1e-5 * (i as f64 * 0.7).sin();
        }
        let d: Vec<_> = (0..x.len())
            .map(|i| 0.01 * (i as f64 * 1.13 + 0.4).sin())
            .collect();
        let mut j = vec![0.0; m.layout.jacobian.len()];
        m.jacobian(&x, &mut j);
        let mut jd = vec![0.0; m.layout.constraints.len()];
        for (&a, &(r, c)) in j.iter().zip(&m.layout.jacobian) {
            jd[r as usize] += a * d[c as usize];
        }
        let mut best = vec![f64::INFINITY; jd.len()];
        for h in [1e-4, 1e-5, 1e-6, 1e-7] {
            let xp: Vec<_> = x.iter().zip(&d).map(|(x, d)| x + h * d).collect();
            let xm: Vec<_> = x.iter().zip(&d).map(|(x, d)| x - h * d).collect();
            let mut gp = vec![0.0; jd.len()];
            let mut gm = gp.clone();
            m.constraints(&xp, &mut gp);
            m.constraints(&xm, &mut gm);
            for r in 0..jd.len() {
                best[r] = best[r].min(((gp[r] - gm[r]) / (2.0 * h) - jd[r]).abs());
            }
        }
        for r in 0..jd.len() {
            assert!(
                best[r] < 3e-6 * (1.0 + jd[r].abs()),
                "{}: best={} derivative={}",
                m.layout.constraints[r],
                best[r],
                jd[r]
            );
        }
    }
    #[test]
    fn seed_mass_ledger_closes_through_stage_fairing_and_payload_events() {
        let m = model();
        let x = &m.layout.initial;
        let y = m.state(x, m.final_node());
        assert!((y[0] - m.payload(x)).abs() < 1e-6);
        for i in 0..m.intervals.len() {
            if i + 1 < m.intervals.len() {
                assert_eq!(
                    m.interval_time(x, i, 1.0).0,
                    m.interval_time(x, i + 1, -1.0).0
                );
            }
            let before = m.state(x, m.node(i, m.input.degree));
            let after = m.state(
                x,
                if i + 1 == m.intervals.len() {
                    m.final_node()
                } else {
                    m.node(i + 1, 0)
                },
            );
            assert!((before[0] - after[0] - m.removed_mass(x, i)).abs() < 1e-8);
            for c in 1..7 {
                assert!((before[c] - after[c]).abs() < 1e-8);
            }
        }
    }
    #[test]
    fn independent_integration_detects_corrupted_retained_mass() {
        let m = model();
        let mut x = m.layout.initial.clone();
        let interval = m
            .intervals
            .iter()
            .position(|i| m.input.phases[i.phase].stage == 1)
            .unwrap();
        x[7 * m.node(interval, 0)] += 1.0 / m.scaling.mass_kg;
        let report = super::super::validation::validate_trajectory(&m, &x).unwrap();
        assert!(report.max_mass_error_kg > 0.999);
        assert!(
            !report
                .checks
                .iter()
                .find(|c| c.id == "DYN.mass")
                .unwrap()
                .passed
        );
        // Its own integrated event maps still conserve the actual inventory.
        assert!(
            report
                .events
                .iter()
                .all(|e| e.program_mass_difference_kg < 1e-6)
        );
    }
    #[test]
    fn low_speed_cone_derivatives_converge_under_central_differences() {
        let m = model();
        let x = &m.layout.initial;
        let (g, jac) = m.assemble(x, true);
        let row = m
            .layout
            .constraints
            .iter()
            .position(|c| c == "AEROLOAD.cone[0,1]")
            .unwrap();
        for c in 4..7 {
            let col = 7 * m.node(0, 1) + c;
            let analytic = jac[&(row, col)];
            let mut best = f64::INFINITY;
            for h in [1e-6, 1e-7, 1e-8, 1e-9] {
                let mut xp = x.clone();
                let mut xm = x.clone();
                xp[col] += h;
                xm[col] -= h;
                let gp = m.assemble(&xp, false).0[row];
                let gm = m.assemble(&xm, false).0[row];
                best = best.min(((gp - gm) / (2.0 * h) - analytic).abs());
            }
            assert!(
                best < 1e-6 * analytic.abs().max(1.0),
                "{c}: {best}; g={}",
                g[row]
            );
        }
    }
    #[test]
    #[ignore = "full component audit; run explicitly in release mode"]
    fn central_jacobian_audit() {
        let m = model();
        let x = &m.layout.initial;
        let (_, analytic) = m.assemble(x, true);
        let mut columns = vec![vec![]; x.len()];
        for (&(row, col), &value) in &analytic {
            columns[col].push((row, value));
        }
        let mut worst = (0.0_f64, String::new());
        for (col, entries) in columns.iter().enumerate() {
            let mut best = vec![f64::INFINITY; entries.len()];
            for step in [1e-4, 1e-5, 1e-6, 1e-7, 1e-8] {
                let h = step * x[col].abs().max(1.0);
                let mut xp = x.clone();
                let mut xm = x.clone();
                xp[col] += h;
                xm[col] -= h;
                let gp = m.assemble(&xp, false).0;
                let gm = m.assemble(&xm, false).0;
                for (k, &(row, value)) in entries.iter().enumerate() {
                    best[k] = best[k].min(
                        ((gp[row] - gm[row]) / (2.0 * h) - value).abs() / value.abs().max(1.0),
                    );
                }
            }
            for (k, &(row, _)) in entries.iter().enumerate() {
                if best[k] > worst.0 {
                    worst = (
                        best[k],
                        format!(
                            "{} / {}",
                            m.layout.constraints[row], m.layout.variables[col]
                        ),
                    );
                }
                assert!(
                    best[k] < 1e-7,
                    "{} / {}: {}",
                    m.layout.constraints[row],
                    m.layout.variables[col],
                    best[k]
                );
            }
        }
        eprintln!(
            "Full central audit: {} entries, worst normalized error {} at {}",
            analytic.len(),
            worst.0,
            worst.1
        );
    }
    #[test]
    #[ignore = "numerical flight study; run explicitly in release mode"]
    fn orbital_solve() {
        let r = crate::optimization::solve(request()).unwrap();
        assert!(r.converged, "{}", r.solver_status);
        let v = r.validation.unwrap();
        assert_eq!(v.status, "passed", "{:?}", v.error);
        let flight = v.multi_stage.unwrap();
        assert!((flight.net_payload_kg - 2557.5).abs() < 0.1);
        assert!(flight.checks.iter().all(|c| c.passed));
        assert_eq!(flight.events.len(), 3);
        assert_eq!(flight.stage_ledgers[1].ignition_count, 2);
        assert!(
            flight
                .events
                .iter()
                .all(|e| e.position_jump_m == 0.0 && e.velocity_jump_m_s == 0.0)
        );
    }
}
