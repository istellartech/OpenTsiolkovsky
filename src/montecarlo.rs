//! Monte Carlo dispersion analysis
//!
//! Each case perturbs the nominal vehicle with random draws (thrust, Isp,
//! mass, drag, attitude, wind, air density, ...), flies it together with
//! its spent stages and jettisoned bodies, and records where every body
//! comes down. [`impact_statistics`] reduces the cases to a mean impact
//! point and error ellipses per body.

use crate::math::constants::WGS84_A;
use crate::sim::{ImpactPoint, simulate};
use crate::vehicle::{NormalForce, Vehicle};
use serde::{Deserialize, Serialize};

/// 1-sigma dispersions (zero mean)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(default, deny_unknown_fields)]
pub struct Dispersion {
    /// Thrust scale: the burn is shorter in proportion, same impulse [%]
    pub thrust_percent: f64,
    /// Specific impulse scale: thrust scales too, same mass flow [%]
    pub isp_percent: f64,
    /// Initial and dry mass of every stage [%]
    pub mass_percent: f64,
    /// Axial force coefficient (ballistic coefficients scale inversely) [%]
    pub drag_percent: f64,
    /// Normal force coefficient [%]
    pub normal_percent: f64,
    /// Stage separation time [s]
    pub separation_time_s: f64,
    /// Attitude elevation offset [deg]
    pub elevation_deg: f64,
    /// Attitude azimuth offset [deg]
    pub azimuth_deg: f64,
    /// Wind speed scale, all altitudes [%] (applied before the offset)
    pub wind_speed_percent: f64,
    /// Wind speed offset, all altitudes [m/s]
    pub wind_speed_mps: f64,
    /// Wind direction offset, all altitudes [deg]
    pub wind_direction_deg: f64,
    /// Air density: added to the seasonal variation, or to the density
    /// deviation table when one is given [%]
    pub air_density_percent: f64,
    /// Shape of the draws (the values above are 1-sigma either way)
    pub distribution: Distribution,
    /// Draw thrust, Isp, mass, drag, normal force and separation time for
    /// every stage separately (otherwise one draw scales all stages alike)
    pub independent_stages: bool,
}

/// Probability distribution of a dispersed parameter
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "schema", derive(schemars::JsonSchema))]
#[serde(rename_all = "lowercase")]
pub enum Distribution {
    /// Gaussian with the given 1-sigma
    #[default]
    Normal,
    /// Uniform with the same standard deviation (range +-sqrt(3) sigma)
    Uniform,
}

impl Default for Dispersion {
    fn default() -> Self {
        Self {
            thrust_percent: 1.0,
            isp_percent: 0.5,
            mass_percent: 1.0,
            drag_percent: 5.0,
            normal_percent: 0.0,
            separation_time_s: 0.0,
            elevation_deg: 0.5,
            azimuth_deg: 0.5,
            wind_speed_percent: 0.0,
            wind_speed_mps: 2.0,
            wind_direction_deg: 10.0,
            air_density_percent: 5.0,
            distribution: Distribution::Normal,
            independent_stages: false,
        }
    }
}

/// Perturbation drawn for one case, in the units of [`Dispersion`]
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Perturbation {
    pub thrust_percent: f64,
    pub isp_percent: f64,
    pub mass_percent: f64,
    pub drag_percent: f64,
    pub normal_percent: f64,
    pub separation_time_s: f64,
    pub elevation_deg: f64,
    pub azimuth_deg: f64,
    pub wind_speed_percent: f64,
    pub wind_speed_mps: f64,
    pub wind_direction_deg: f64,
    pub air_density_percent: f64,
    /// Per-stage draws (stage 1 first) with `independent_stages`; the
    /// common fields then hold stage 1's values
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub stages: Vec<StagePerturbation>,
}

/// Perturbation of one stage (see [`Dispersion::independent_stages`])
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct StagePerturbation {
    pub thrust_percent: f64,
    pub isp_percent: f64,
    pub mass_percent: f64,
    pub drag_percent: f64,
    pub normal_percent: f64,
    pub separation_time_s: f64,
}

impl Perturbation {
    /// CSV column names of [`Perturbation::values`]
    pub const COLUMNS: [&str; 12] = [
        "thrust_percent",
        "isp_percent",
        "mass_percent",
        "drag_percent",
        "normal_percent",
        "separation_time_s",
        "elevation_deg",
        "azimuth_deg",
        "wind_speed_percent",
        "wind_speed_mps",
        "wind_direction_deg",
        "air_density_percent",
    ];

    pub fn values(&self) -> [f64; 12] {
        [
            self.thrust_percent,
            self.isp_percent,
            self.mass_percent,
            self.drag_percent,
            self.normal_percent,
            self.separation_time_s,
            self.elevation_deg,
            self.azimuth_deg,
            self.wind_speed_percent,
            self.wind_speed_mps,
            self.wind_direction_deg,
            self.air_density_percent,
        ]
    }
}

impl StagePerturbation {
    /// CSV column names of [`StagePerturbation::values`]
    pub const COLUMNS: [&str; 6] = [
        "thrust_percent",
        "isp_percent",
        "mass_percent",
        "drag_percent",
        "normal_percent",
        "separation_time_s",
    ];

    pub fn values(&self) -> [f64; 6] {
        [
            self.thrust_percent,
            self.isp_percent,
            self.mass_percent,
            self.drag_percent,
            self.normal_percent,
            self.separation_time_s,
        ]
    }
}

/// SplitMix64: small, seedable and identical on every platform (incl. WASM)
struct Rng(u64);

impl Rng {
    fn new(seed: u64, index: u32) -> Self {
        let mut rng = Rng(seed ^ u64::from(index).wrapping_mul(0x9E37_79B9_7F4A_7C15));
        rng.next_u64(); // decorrelate neighbouring seeds
        rng
    }

    fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }

    /// Uniform in (0, 1]
    fn uniform(&mut self) -> f64 {
        ((self.next_u64() >> 11) + 1) as f64 / (1u64 << 53) as f64
    }

    /// Standard normal (Box-Muller)
    fn normal(&mut self) -> f64 {
        let (u1, u2) = (self.uniform(), self.uniform());
        (-2.0 * u1.ln()).sqrt() * (std::f64::consts::TAU * u2).cos()
    }

    /// Zero mean, unit variance draw of the given shape
    fn standard(&mut self, distribution: Distribution) -> f64 {
        match distribution {
            Distribution::Normal => self.normal(),
            Distribution::Uniform => 3f64.sqrt() * (2.0 * self.uniform() - 1.0),
        }
    }
}

impl Perturbation {
    /// Draw the perturbation of case `index` for a vehicle of `stage_count`
    /// stages; the same seed and index always give the same draw
    pub fn draw(dispersion: &Dispersion, seed: u64, index: u32, stage_count: usize) -> Self {
        let mut rng = Rng::new(seed, index);
        let shape = dispersion.distribution;
        let mut n = |sigma: f64| sigma * rng.standard(shape);
        let d = dispersion;
        let mut p = Self {
            thrust_percent: n(d.thrust_percent),
            isp_percent: n(d.isp_percent),
            mass_percent: n(d.mass_percent),
            drag_percent: n(d.drag_percent),
            normal_percent: n(d.normal_percent),
            separation_time_s: n(d.separation_time_s),
            elevation_deg: n(d.elevation_deg),
            azimuth_deg: n(d.azimuth_deg),
            wind_speed_percent: n(d.wind_speed_percent),
            wind_speed_mps: n(d.wind_speed_mps),
            wind_direction_deg: n(d.wind_direction_deg),
            air_density_percent: n(d.air_density_percent),
            stages: Vec::new(),
        };
        if d.independent_stages {
            p.stages.push(p.common_stage());
            for _ in 1..stage_count {
                p.stages.push(StagePerturbation {
                    thrust_percent: n(d.thrust_percent),
                    isp_percent: n(d.isp_percent),
                    mass_percent: n(d.mass_percent),
                    drag_percent: n(d.drag_percent),
                    normal_percent: n(d.normal_percent),
                    separation_time_s: n(d.separation_time_s),
                });
            }
        }
        p
    }

    fn common_stage(&self) -> StagePerturbation {
        StagePerturbation {
            thrust_percent: self.thrust_percent,
            isp_percent: self.isp_percent,
            mass_percent: self.mass_percent,
            drag_percent: self.drag_percent,
            normal_percent: self.normal_percent,
            separation_time_s: self.separation_time_s,
        }
    }

    /// Perturbation of stage `index`
    fn stage(&self, index: usize) -> StagePerturbation {
        self.stages
            .get(index)
            .cloned()
            .unwrap_or_else(|| self.common_stage())
    }

    /// Copy of `vehicle` with this perturbation applied
    pub fn apply(&self, vehicle: &Vehicle) -> Vehicle {
        let scale = |percent: f64| (1.0 + percent / 100.0).max(0.0);
        let mut out = vehicle.clone();
        for (i, stage) in out.stages.iter_mut().enumerate() {
            let sp = self.stage(i);
            let thrust = scale(sp.thrust_percent).max(1e-6);
            let isp = scale(sp.isp_percent);
            let mass = scale(sp.mass_percent);
            let drag = scale(sp.drag_percent).max(1e-6);
            let normal = scale(sp.normal_percent);
            if let Some(e) = &mut stage.engine {
                // Faster burn of the same impulse; Isp scales thrust at the
                // same mass flow
                e.thrust = e.thrust.compressed(thrust).scaled(thrust * isp);
                e.isp = e.isp.compressed(thrust).scaled(isp);
                e.burn_end = e.burn_start + (e.burn_end - e.burn_start) / thrust;
            }
            stage.mass_initial *= mass;
            stage.mass_dry = stage.mass_dry.map(|m| m * mass);
            stage.aero.ca = stage.aero.ca.scaled(drag);
            stage.aero.ca_power_off = stage.aero.ca_power_off.as_ref().map(|c| c.scaled(drag));
            stage.aero.ballistic_coefficient /= drag;
            for j in &mut stage.jettisons {
                j.ballistic_coefficient /= drag;
            }
            stage.aero.normal = match &stage.aero.normal {
                NormalForce::Slope(s) => NormalForce::Slope(s.scaled(normal)),
                NormalForce::Table(t) => NormalForce::Table(t.scaled(normal)),
            };
            if let Some(t) = &mut stage.separation_time {
                *t = (*t + sp.separation_time_s).max(0.0);
            }
        }

        let att = &mut out.attitude;
        att.azimuth = att.azimuth.offset(self.azimuth_deg);
        let del = self.elevation_deg;
        att.elevation = att.elevation.map(|el| (el + del).clamp(-90.0, 90.0));

        let wind_scale = scale(self.wind_speed_percent);
        for row in &mut out.wind.rows {
            row[1] = (row[1] * wind_scale + self.wind_speed_mps).max(0.0);
            row[2] += self.wind_direction_deg;
        }

        let atm = &mut out.atmosphere;
        match &atm.density_deviation {
            Some(table) => {
                atm.density_deviation =
                    Some(table.map(|v| (v + self.air_density_percent).max(-100.0)))
            }
            None => {
                atm.seasonal_variation =
                    (atm.seasonal_variation + self.air_density_percent).clamp(-100.0, 100.0)
            }
        }
        out
    }
}

/// Where one body of a case came down
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyImpact {
    /// `vehicle`, or the id of a released body (`stage1`, `stage2_fairing`, ...)
    pub body: String,
    pub impact: Option<ImpactPoint>,
}

/// Result of one Monte Carlo case
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseResult {
    pub index: u32,
    pub perturbation: Perturbation,
    /// NaN when the case produced no trajectory
    pub max_altitude_m: f64,
    pub impacts: Vec<BodyImpact>,
}

impl CaseResult {
    pub fn impact_of(&self, body: &str) -> Option<ImpactPoint> {
        self.impacts
            .iter()
            .find(|i| i.body == body)
            .and_then(|i| i.impact)
    }
}

/// Fly case `index` of a dispersion run
pub fn run_case(vehicle: &Vehicle, dispersion: &Dispersion, seed: u64, index: u32) -> CaseResult {
    let perturbation = Perturbation::draw(dispersion, seed, index, vehicle.stage_count());
    let flight = simulate(&perturbation.apply(vehicle));
    let max_altitude_m = flight
        .trajectory
        .iter()
        .map(|s| s.altitude_m)
        .fold(f64::NAN, f64::max);
    let mut impacts = vec![BodyImpact {
        body: "vehicle".to_string(),
        impact: flight.impact(),
    }];
    impacts.extend(flight.bodies.into_iter().map(|b| BodyImpact {
        body: b.id,
        impact: b.impact,
    }));
    CaseResult {
        index,
        perturbation,
        max_altitude_m,
        impacts,
    }
}

/// Run `count` cases; uses every CPU core where threads are available
pub fn run_cases(
    vehicle: &Vehicle,
    dispersion: &Dispersion,
    seed: u64,
    count: u32,
) -> Vec<CaseResult> {
    #[cfg(not(target_arch = "wasm32"))]
    {
        let workers = std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(1)
            .min(count.max(1) as usize) as u32;
        let mut cases: Vec<CaseResult> = std::thread::scope(|scope| {
            let handles: Vec<_> = (0..workers)
                .map(|w| {
                    scope.spawn(move || {
                        (w..count)
                            .step_by(workers as usize)
                            .map(|i| run_case(vehicle, dispersion, seed, i))
                            .collect::<Vec<_>>()
                    })
                })
                .collect();
            handles
                .into_iter()
                .flat_map(|h| h.join().expect("Monte Carlo worker panicked"))
                .collect()
        });
        cases.sort_by_key(|c| c.index);
        cases
    }
    #[cfg(target_arch = "wasm32")]
    {
        (0..count)
            .map(|i| run_case(vehicle, dispersion, seed, i))
            .collect()
    }
}

/// A complete Monte Carlo run
#[derive(Debug, Clone)]
pub struct MonteCarlo {
    pub seed: u64,
    pub dispersion: Dispersion,
    pub cases: Vec<CaseResult>,
    pub statistics: Vec<ImpactStatistics>,
}

/// Overview of a Monte Carlo run (`montecarlo_summary.json`)
#[derive(Debug, Clone, Serialize)]
pub struct MonteCarloSummary {
    pub cases: usize,
    /// Cases that produced no trajectory
    pub failed_cases: usize,
    pub seed: u64,
    pub dispersion: Dispersion,
    pub statistics: Vec<ImpactStatistics>,
}

impl MonteCarlo {
    pub fn run(vehicle: &Vehicle, dispersion: &Dispersion, seed: u64, count: u32) -> Self {
        let cases = run_cases(vehicle, dispersion, seed, count);
        let statistics = impact_statistics(&cases);
        Self {
            seed,
            dispersion: dispersion.clone(),
            cases,
            statistics,
        }
    }

    pub fn summary(&self) -> MonteCarloSummary {
        MonteCarloSummary {
            cases: self.cases.len(),
            failed_cases: self
                .cases
                .iter()
                .filter(|c| c.max_altitude_m.is_nan())
                .count(),
            seed: self.seed,
            dispersion: self.dispersion.clone(),
            statistics: self.statistics.clone(),
        }
    }
}

/// Impact dispersion of one body over all cases
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImpactStatistics {
    pub body: String,
    /// Cases in which the body hit the ground
    pub impacts: usize,
    pub cases: usize,
    pub mean_latitude_deg: f64,
    pub mean_longitude_deg: f64,
    pub sigma_north_m: f64,
    pub sigma_east_m: f64,
    /// 1-sigma error ellipse: semi-axes and azimuth of the major axis
    /// (clockwise from north)
    pub ellipse_major_m: f64,
    pub ellipse_minor_m: f64,
    pub ellipse_azimuth_deg: f64,
    /// Error ellipses holding 95 % and 99 % of a 2-D Gaussian
    /// (1-sigma semi-axes x 2.448 and x 3.035)
    pub ellipse_95_major_m: f64,
    pub ellipse_95_minor_m: f64,
    pub ellipse_99_major_m: f64,
    pub ellipse_99_minor_m: f64,
    /// Farthest impact from the mean point
    pub max_distance_m: f64,
}

/// Wrap a longitude difference to [-180, 180)
fn wrap_deg(d: f64) -> f64 {
    (d + 180.0).rem_euclid(360.0) - 180.0
}

/// Mean impact point and error ellipses of every body, in first-seen order
pub fn impact_statistics(cases: &[CaseResult]) -> Vec<ImpactStatistics> {
    let mut bodies: Vec<String> = Vec::new();
    for case in cases {
        for impact in &case.impacts {
            if !bodies.contains(&impact.body) {
                bodies.push(impact.body.clone());
            }
        }
    }

    bodies
        .into_iter()
        .map(|body| {
            let points: Vec<(f64, f64)> = cases
                .iter()
                .filter_map(|c| c.impact_of(&body))
                .map(|p| (p.latitude_deg, p.longitude_deg))
                .collect();
            let n = points.len();
            let mut stats = ImpactStatistics {
                body,
                impacts: n,
                cases: cases.len(),
                mean_latitude_deg: f64::NAN,
                mean_longitude_deg: f64::NAN,
                sigma_north_m: 0.0,
                sigma_east_m: 0.0,
                ellipse_major_m: 0.0,
                ellipse_minor_m: 0.0,
                ellipse_azimuth_deg: 0.0,
                ellipse_95_major_m: 0.0,
                ellipse_95_minor_m: 0.0,
                ellipse_99_major_m: 0.0,
                ellipse_99_minor_m: 0.0,
                max_distance_m: 0.0,
            };
            if n == 0 {
                return stats;
            }

            // Mean, with longitudes taken relative to the first point
            let lon_ref = points[0].1;
            let lat0 = points.iter().map(|p| p.0).sum::<f64>() / n as f64;
            let dlon0 = points.iter().map(|p| wrap_deg(p.1 - lon_ref)).sum::<f64>() / n as f64;
            let lon0 = wrap_deg(lon_ref + dlon0);
            stats.mean_latitude_deg = lat0;
            stats.mean_longitude_deg = lon0;

            // Local north/east offsets [m] (spherical approximation)
            let m_per_deg = WGS84_A * std::f64::consts::PI / 180.0;
            let ne: Vec<(f64, f64)> = points
                .iter()
                .map(|&(lat, lon)| {
                    (
                        (lat - lat0) * m_per_deg,
                        wrap_deg(lon - lon0) * m_per_deg * lat0.to_radians().cos(),
                    )
                })
                .collect();
            stats.max_distance_m = ne.iter().map(|(n, e)| n.hypot(*e)).fold(0.0, f64::max);
            if n < 2 {
                return stats;
            }

            let dof = (n - 1) as f64;
            let cnn = ne.iter().map(|(n, _)| n * n).sum::<f64>() / dof;
            let cee = ne.iter().map(|(_, e)| e * e).sum::<f64>() / dof;
            let cne = ne.iter().map(|(n, e)| n * e).sum::<f64>() / dof;
            stats.sigma_north_m = cnn.sqrt();
            stats.sigma_east_m = cee.sqrt();

            // Eigen-decomposition of the 2x2 covariance
            let mid = 0.5 * (cnn + cee);
            let rad = (0.25 * (cnn - cee).powi(2) + cne * cne).sqrt();
            stats.ellipse_major_m = (mid + rad).max(0.0).sqrt();
            stats.ellipse_minor_m = (mid - rad).max(0.0).sqrt();
            // Angle from the north axis toward east
            stats.ellipse_azimuth_deg = (0.5 * (2.0 * cne).atan2(cnn - cee))
                .to_degrees()
                .rem_euclid(180.0);
            // Radius of the p-probability contour of a 2-D Gaussian in sigmas
            let k = |p: f64| (-2.0 * (1.0f64 - p).ln()).sqrt();
            stats.ellipse_95_major_m = k(0.95) * stats.ellipse_major_m;
            stats.ellipse_95_minor_m = k(0.95) * stats.ellipse_minor_m;
            stats.ellipse_99_major_m = k(0.99) * stats.ellipse_major_m;
            stats.ellipse_99_minor_m = k(0.99) * stats.ellipse_minor_m;
            stats
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vehicle::test_vehicle;
    use approx::assert_relative_eq;

    fn vehicle() -> Vehicle {
        test_vehicle(
            r#"{
            "name": "mc",
            "simulation": { "end_time_s": 400 },
            "launch": { "latitude_deg": 31.25, "longitude_deg": 131.08 },
            "attitude": { "elevation_deg": 80, "azimuth_deg": 90 },
            "stages": [
                { "mass_initial_kg": 500, "separation_time_s": 12,
                  "engine": { "thrust_vac_n": 20000, "isp_vac_s": 200, "burn_end_s": 10 },
                  "aero": { "diameter_m": 0.3, "ca": 0.4, "ballistic_coefficient_kg_m2": 300 } },
                { "mass_initial_kg": 100,
                  "engine": { "thrust_vac_n": 4000, "isp_vac_s": 220, "burn_end_s": 8 },
                  "aero": { "diameter_m": 0.3, "ca": 0.4, "ballistic_coefficient_kg_m2": 300 } }
            ]
        }"#,
        )
    }

    #[test]
    fn draws_are_deterministic_and_scaled() {
        let d = Dispersion::default();
        assert_eq!(
            Perturbation::draw(&d, 7, 3, 1),
            Perturbation::draw(&d, 7, 3, 1)
        );
        assert_ne!(
            Perturbation::draw(&d, 7, 3, 1),
            Perturbation::draw(&d, 7, 4, 1)
        );

        let zero = Dispersion {
            thrust_percent: 0.0,
            isp_percent: 0.0,
            mass_percent: 0.0,
            drag_percent: 0.0,
            elevation_deg: 0.0,
            azimuth_deg: 0.0,
            wind_speed_mps: 0.0,
            wind_direction_deg: 0.0,
            air_density_percent: 0.0,
            ..Dispersion::default()
        };
        assert_eq!(Perturbation::draw(&zero, 1, 0, 1), Perturbation::default());

        // Sample sigma close to the requested one
        let n = 4000;
        let draws: Vec<f64> = (0..n)
            .map(|i| Perturbation::draw(&d, 42, i, 1).wind_direction_deg)
            .collect();
        let mean = draws.iter().sum::<f64>() / n as f64;
        let sigma = (draws.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n as f64).sqrt();
        assert!(mean.abs() < 0.5, "mean {mean}");
        assert!((sigma - 10.0).abs() < 0.5, "sigma {sigma}");
    }

    #[test]
    fn apply_scales_vehicle() {
        let vehicle = vehicle();
        let p = Perturbation {
            thrust_percent: 10.0,
            mass_percent: -5.0,
            drag_percent: 25.0,
            elevation_deg: 15.0,
            wind_speed_mps: 3.0,
            air_density_percent: 200.0,
            ..Default::default()
        };
        let out = p.apply(&vehicle);
        let s = &out.stages[0];
        let e = s.engine.as_ref().unwrap();
        assert_relative_eq!(e.thrust.eval(0.0), 22000.0, epsilon = 1e-9);
        // Same impulse: the burn is 1/1.1 as long
        assert_relative_eq!(e.burn_end, 10.0 / 1.1, epsilon = 1e-9);
        assert_relative_eq!(s.mass_initial, 475.0, epsilon = 1e-9);
        assert_relative_eq!(s.ca(0.5, true), 0.5, epsilon = 1e-12);
        assert_relative_eq!(s.aero.ballistic_coefficient, 240.0, epsilon = 1e-9);
        assert_eq!(out.attitude.elevation.eval(0.0), 90.0); // clamped
        assert_eq!(out.stages[1].mass_initial, 95.0);
        assert_eq!(out.wind.rows[0][1], 3.0);
        assert_eq!(out.atmosphere.seasonal_variation, 100.0);
    }

    #[test]
    fn independent_stages_draw_per_stage() {
        let more = Dispersion {
            normal_percent: 5.0,
            separation_time_s: 0.2,
            independent_stages: true,
            ..Dispersion::default()
        };
        let p = Perturbation::draw(&more, 3, 7, 3);
        assert_eq!(p.stages.len(), 3);
        assert_eq!(p.stages[0].thrust_percent, p.thrust_percent);
        assert_ne!(p.stages[1].thrust_percent, p.stages[2].thrust_percent);

        let p = Perturbation {
            stages: vec![
                StagePerturbation {
                    thrust_percent: 10.0,
                    separation_time_s: 0.5,
                    ..Default::default()
                },
                StagePerturbation {
                    thrust_percent: -10.0,
                    ..Default::default()
                },
            ],
            ..Default::default()
        };
        let out = p.apply(&vehicle());
        let thrust = |i: usize| out.stages[i].engine.as_ref().unwrap().thrust.eval(0.0);
        assert_relative_eq!(thrust(0), 22000.0, epsilon = 1e-9);
        assert_relative_eq!(thrust(1), 4000.0 * 0.9, epsilon = 1e-9);
        assert_relative_eq!(
            out.stages[0].separation_time.unwrap(),
            12.5,
            epsilon = 1e-12
        );
    }

    #[test]
    fn uniform_draws_stay_in_range_with_the_same_sigma() {
        let d = Dispersion {
            thrust_percent: 2.0,
            distribution: Distribution::Uniform,
            ..Dispersion::default()
        };
        let draws: Vec<f64> = (0..20_000)
            .map(|i| Perturbation::draw(&d, 11, i, 1).thrust_percent)
            .collect();
        let limit = 2.0 * 3f64.sqrt();
        assert!(draws.iter().all(|x| x.abs() <= limit));
        let sigma = (draws.iter().map(|x| x * x).sum::<f64>() / draws.len() as f64).sqrt();
        assert!((sigma - 2.0).abs() < 0.05, "sigma {sigma}");
    }

    #[test]
    fn cases_report_every_body() {
        let vehicle = vehicle();
        let mc = MonteCarlo::run(&vehicle, &Dispersion::default(), 1, 6);
        assert_eq!(mc.cases.len(), 6);
        assert!(
            mc.cases
                .iter()
                .enumerate()
                .all(|(i, c)| c.index == i as u32)
        );
        for case in &mc.cases {
            let bodies: Vec<&str> = case.impacts.iter().map(|i| i.body.as_str()).collect();
            assert_eq!(bodies, ["vehicle", "stage1"]);
            assert!(case.impacts.iter().all(|i| i.impact.is_some()));
        }
        // Same seed, same results; parallel and sequential agree
        let again = run_case(&vehicle, &Dispersion::default(), 1, 4);
        assert_eq!(again.impact_of("vehicle"), mc.cases[4].impact_of("vehicle"));

        let stats = &mc.statistics;
        assert_eq!(stats.len(), 2);
        assert_eq!(stats[0].body, "vehicle");
        assert_eq!(stats[0].impacts, 6);
        assert!(stats[0].ellipse_major_m >= stats[0].ellipse_minor_m);
        assert!(stats[0].ellipse_major_m > 0.0);
        assert_relative_eq!(
            stats[0].ellipse_95_major_m / stats[0].ellipse_major_m,
            2.4477,
            epsilon = 1e-4
        );
        assert_relative_eq!(
            stats[0].ellipse_99_minor_m / stats[0].ellipse_minor_m,
            3.0349,
            epsilon = 1e-4
        );
    }

    #[test]
    fn ellipse_of_known_points() {
        // Points spread along north-east: major axis at 45 deg
        let mk = |lat: f64, lon: f64| CaseResult {
            index: 0,
            perturbation: Perturbation::default(),
            max_altitude_m: 0.0,
            impacts: vec![BodyImpact {
                body: "vehicle".into(),
                impact: Some(ImpactPoint {
                    time_s: 0.0,
                    latitude_deg: lat,
                    longitude_deg: lon,
                    speed_mps: 0.0,
                }),
            }],
        };
        let d = 0.01;
        let cases = [mk(-d, -d), mk(0.0, 0.0), mk(d, d)];
        let s = &impact_statistics(&cases)[0];
        assert_relative_eq!(s.mean_latitude_deg, 0.0, epsilon = 1e-12);
        assert_relative_eq!(s.mean_longitude_deg, 0.0, epsilon = 1e-12);
        assert_relative_eq!(s.ellipse_azimuth_deg, 45.0, epsilon = 1e-6);
        assert!(s.ellipse_minor_m < 1e-6);
        let m = d * WGS84_A * std::f64::consts::PI / 180.0;
        // sample variance of (-m, 0, m) along both axes -> major = sqrt(2) * m
        assert_relative_eq!(s.ellipse_major_m, 2f64.sqrt() * m, epsilon = 1e-6);

        // Across the antimeridian
        let cases = [mk(0.0, 179.99), mk(0.0, -179.99)];
        let s = &impact_statistics(&cases)[0];
        assert!(s.mean_longitude_deg.abs() > 179.9);
    }
}
