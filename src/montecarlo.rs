//! Monte Carlo dispersion analysis
//!
//! Each case perturbs the nominal vehicle with Gaussian draws (thrust, Isp,
//! mass, drag, launch attitude, wind, air density), flies it together with
//! its spent stages and dumping products, and records where every body comes
//! down. `impact_statistics` reduces the cases to a mean impact point and a
//! 1-sigma error ellipse per body.

use crate::math::constants::WGS84_A;
use crate::rocket::{Rocket, StageConfig};
use crate::simulator::{FallBodyKind, ImpactPoint, Simulator, impact_point};
use serde::{Deserialize, Serialize};

/// 1-sigma dispersions (Gaussian, zero mean)
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Dispersion {
    /// Thrust scale [%]
    pub thrust_percent: f64,
    /// Specific impulse scale [%]
    pub isp_percent: f64,
    /// Initial mass of every stage [%]
    pub mass_percent: f64,
    /// Axial force coefficient (ballistic coefficients scale inversely) [%]
    pub drag_percent: f64,
    /// Attitude elevation offset [deg]
    pub elevation_deg: f64,
    /// Attitude azimuth offset [deg]
    pub azimuth_deg: f64,
    /// Wind speed offset, all altitudes [m/s]
    pub wind_speed_mps: f64,
    /// Wind direction offset, all altitudes [deg]
    pub wind_direction_deg: f64,
    /// Air density variation [%] (U.S. Standard Atmosphere profile)
    pub air_density_percent: f64,
}

impl Default for Dispersion {
    fn default() -> Self {
        Self {
            thrust_percent: 1.0,
            isp_percent: 0.5,
            mass_percent: 1.0,
            drag_percent: 5.0,
            elevation_deg: 0.5,
            azimuth_deg: 0.5,
            wind_speed_mps: 2.0,
            wind_direction_deg: 10.0,
            air_density_percent: 5.0,
        }
    }
}

/// Perturbation drawn for one case, in the units of `Dispersion`
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Perturbation {
    pub thrust_percent: f64,
    pub isp_percent: f64,
    pub mass_percent: f64,
    pub drag_percent: f64,
    pub elevation_deg: f64,
    pub azimuth_deg: f64,
    pub wind_speed_mps: f64,
    pub wind_direction_deg: f64,
    pub air_density_percent: f64,
}

/// SplitMix64: small, seedable and identical on every platform (incl. WASM)
struct Rng(u64);

impl Rng {
    fn new(seed: u64, index: u32) -> Self {
        let mut rng = Rng(seed ^ (index as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15));
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
}

impl Perturbation {
    /// Draw the perturbation of case `index` for `seed`
    pub fn draw(dispersion: &Dispersion, seed: u64, index: u32) -> Self {
        let mut rng = Rng::new(seed, index);
        let mut n = |sigma: f64| sigma * rng.normal();
        Self {
            thrust_percent: n(dispersion.thrust_percent),
            isp_percent: n(dispersion.isp_percent),
            mass_percent: n(dispersion.mass_percent),
            drag_percent: n(dispersion.drag_percent),
            elevation_deg: n(dispersion.elevation_deg),
            azimuth_deg: n(dispersion.azimuth_deg),
            wind_speed_mps: n(dispersion.wind_speed_mps),
            wind_direction_deg: n(dispersion.wind_direction_deg),
            air_density_percent: n(dispersion.air_density_percent),
        }
    }

    /// Copy of `rocket` with this perturbation applied
    pub fn apply(&self, rocket: &Rocket) -> Rocket {
        let scale = |percent: f64| (1.0 + percent / 100.0).max(0.0);
        let (thrust, isp, mass) = (
            scale(self.thrust_percent),
            scale(self.isp_percent),
            scale(self.mass_percent),
        );
        let drag = scale(self.drag_percent).max(1e-6);
        let elevation = |el: f64| (el + self.elevation_deg).clamp(-90.0, 90.0);

        let perturb_stage = |stage: &mut StageConfig| {
            // Constant and tabulated values: each path uses one of the pair
            stage.thrust.const_thrust_vac *= thrust;
            stage.thrust.thrust_coefficient *= thrust;
            stage.thrust.const_isp_vac *= isp;
            stage.thrust.isp_coefficient *= isp;
            stage.mass_initial *= mass;
            stage.aero.const_axial_coefficient *= drag;
            stage.aero.axial_multiplier *= drag;
            stage.aero.ballistic_coefficient /= drag;
            stage.dumping_product.dumping_product_ballistic_coefficient /= drag;
            stage.attitude.const_azimuth += self.azimuth_deg;
            stage.attitude.const_elevation = elevation(stage.attitude.const_elevation);
        };

        let mut out = rocket.clone();
        out.stage_configs.iter_mut().for_each(perturb_stage);
        out.config.stages = out.stage_configs.clone();
        if let Some(profile) = out.attitude_data.as_mut() {
            for (_, az, el) in profile.iter_mut() {
                *az += self.azimuth_deg;
                *el = elevation(*el);
            }
        }

        let wind = &mut out.config.wind.const_wind;
        wind[0] = (wind[0] + self.wind_speed_mps).max(0.0);
        wind[1] += self.wind_direction_deg;
        if let Some(profile) = out.wind_data.as_mut() {
            for (_, speed, dir) in profile.iter_mut() {
                *speed = (*speed + self.wind_speed_mps).max(0.0);
                *dir += self.wind_direction_deg;
            }
        }

        let calc = &mut out.config.calculate_condition;
        calc.air_density_variation =
            (calc.air_density_variation + self.air_density_percent).clamp(-100.0, 100.0);
        out
    }
}

/// Where one body of a case came down
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BodyImpact {
    /// `vehicle`, `stage<N>` (spent stage) or `stage<N>_dump`
    pub body: String,
    pub impact: Option<ImpactPoint>,
}

/// Result of one Monte Carlo case
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaseResult {
    pub index: u32,
    pub perturbation: Perturbation,
    pub max_altitude_m: f64,
    pub impacts: Vec<BodyImpact>,
}

/// Fly case `index` of the dispersion run
pub fn run_case(rocket: &Rocket, dispersion: &Dispersion, seed: u64, index: u32) -> CaseResult {
    let perturbation = Perturbation::draw(dispersion, seed, index);
    let mut impacts = Vec::new();
    let mut max_altitude_m = f64::NAN;
    if let Ok(mut sim) = Simulator::new(perturbation.apply(rocket)) {
        let trajectory = sim.run();
        max_altitude_m = trajectory
            .iter()
            .map(|s| s.altitude)
            .fold(f64::NAN, f64::max);
        impacts.push(BodyImpact {
            body: "vehicle".to_string(),
            impact: impact_point(&trajectory),
        });
        for body in sim.simulate_fall_bodies() {
            impacts.push(BodyImpact {
                body: match body.kind {
                    FallBodyKind::Stage => format!("stage{}", body.stage),
                    FallBodyKind::Dump => format!("stage{}_dump", body.stage),
                },
                impact: body.impact,
            });
        }
    }
    CaseResult {
        index,
        perturbation,
        max_altitude_m,
        impacts,
    }
}

/// Run `count` cases; uses every CPU core where threads are available
pub fn run_cases(
    rocket: &Rocket,
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
                            .map(|i| run_case(rocket, dispersion, seed, i))
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
            .map(|i| run_case(rocket, dispersion, seed, i))
            .collect()
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
    /// Farthest impact from the mean point
    pub max_distance_m: f64,
}

/// Wrap a longitude difference to [-180, 180)
fn wrap_deg(d: f64) -> f64 {
    (d + 180.0).rem_euclid(360.0) - 180.0
}

/// Mean impact point and error ellipse of every body, in first-seen order
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
                .filter_map(|c| c.impacts.iter().find(|i| i.body == body))
                .filter_map(|i| i.impact.map(|p| (p.latitude_deg, p.longitude_deg)))
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
            stats
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rocket::ClientConfig;
    use approx::assert_relative_eq;

    fn rocket() -> Rocket {
        let json = r#"{
            "name": "mc",
            "simulation": { "duration_s": 400, "output_step_s": 1 },
            "launch": {
                "latitude_deg": 31.25, "longitude_deg": 131.08,
                "datetime_utc": { "year": 2020, "month": 1, "day": 1, "hour": 0, "minute": 0, "second": 0 }
            },
            "stages": [
                { "mass_initial_kg": 500, "burn_end_s": 10, "forced_cutoff_s": 10, "separation_time_s": 12,
                  "thrust_constant": 20000, "isp_constant": 200 },
                { "mass_initial_kg": 100, "burn_end_s": 8, "forced_cutoff_s": 8,
                  "thrust_constant": 4000, "isp_constant": 220 }
            ],
            "aerodynamics": { "body_diameter_m": 0.3, "ca_constant": 0.4, "ballistic_coefficient": 300 },
            "attitude": { "elevation_deg": 80, "azimuth_deg": 90 }
        }"#;
        serde_json::from_str::<ClientConfig>(json)
            .unwrap()
            .into_rocket()
    }

    #[test]
    fn draws_are_deterministic_and_scaled() {
        let d = Dispersion::default();
        assert_eq!(Perturbation::draw(&d, 7, 3), Perturbation::draw(&d, 7, 3));
        assert_ne!(Perturbation::draw(&d, 7, 3), Perturbation::draw(&d, 7, 4));

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
        };
        assert_eq!(Perturbation::draw(&zero, 1, 0), Perturbation::default());

        // Sample sigma close to the requested one
        let n = 4000;
        let draws: Vec<f64> = (0..n)
            .map(|i| Perturbation::draw(&d, 42, i).wind_direction_deg)
            .collect();
        let mean = draws.iter().sum::<f64>() / n as f64;
        let sigma = (draws.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n as f64).sqrt();
        assert!(mean.abs() < 0.5, "mean {mean}");
        assert!((sigma - 10.0).abs() < 0.5, "sigma {sigma}");
    }

    #[test]
    fn apply_scales_vehicle() {
        let rocket = rocket();
        let p = Perturbation {
            thrust_percent: 10.0,
            mass_percent: -5.0,
            drag_percent: 25.0,
            elevation_deg: 15.0,
            wind_speed_mps: 3.0,
            air_density_percent: 200.0,
            ..Default::default()
        };
        let out = p.apply(&rocket);
        let s = out.stage_config(0);
        assert_relative_eq!(s.thrust.const_thrust_vac, 22000.0, epsilon = 1e-9);
        assert_relative_eq!(s.mass_initial, 475.0, epsilon = 1e-9);
        assert_relative_eq!(s.aero.const_axial_coefficient, 0.5, epsilon = 1e-12);
        assert_relative_eq!(s.aero.ballistic_coefficient, 240.0, epsilon = 1e-9);
        assert_eq!(s.attitude.const_elevation, 90.0); // clamped
        assert_eq!(out.config.stages[1].mass_initial, 95.0);
        assert_eq!(out.config.wind.const_wind[0], 3.0);
        assert_eq!(out.config.calculate_condition.air_density_variation, 100.0);
    }

    #[test]
    fn cases_report_every_body() {
        let rocket = rocket();
        let cases = run_cases(&rocket, &Dispersion::default(), 1, 6);
        assert_eq!(cases.len(), 6);
        assert!(cases.iter().enumerate().all(|(i, c)| c.index == i as u32));
        for case in &cases {
            let bodies: Vec<&str> = case.impacts.iter().map(|i| i.body.as_str()).collect();
            assert_eq!(bodies, ["vehicle", "stage1"]);
            assert!(case.impacts.iter().all(|i| i.impact.is_some()));
        }
        // Same seed, same results; parallel and sequential agree
        let again = run_case(&rocket, &Dispersion::default(), 1, 4);
        assert_eq!(
            again.impacts[0].impact.unwrap(),
            cases[4].impacts[0].impact.unwrap()
        );

        let stats = impact_statistics(&cases);
        assert_eq!(stats.len(), 2);
        assert_eq!(stats[0].body, "vehicle");
        assert_eq!(stats[0].impacts, 6);
        assert!(stats[0].ellipse_major_m >= stats[0].ellipse_minor_m);
        assert!(stats[0].ellipse_major_m > 0.0);
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
