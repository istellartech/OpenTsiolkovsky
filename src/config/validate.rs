//! Checks of a configuration's values
//!
//! Errors are physically invalid values the simulator cannot fly; warnings
//! are unusual but valid settings. Each issue names the JSON path of the
//! value it is about. Table contents (axes, files) are checked when the
//! tables are loaded (`Vehicle::from_config`).

use super::{Config, Curve, Integrator, Stage};
use serde::Serialize;
use std::fmt;

/// A problem with one value of the configuration
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Issue {
    /// JSON path of the value, e.g. `stages[1].engine.burn_end_s`
    pub path: String,
    pub message: String,
}

impl Issue {
    pub fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            path: path.into(),
            message: message.into(),
        }
    }
}

impl fmt::Display for Issue {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.path.is_empty() {
            write!(f, "{}", self.message)
        } else {
            write!(f, "{}: {}", self.path, self.message)
        }
    }
}

/// Errors and warnings of a configuration
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct Report {
    pub errors: Vec<Issue>,
    pub warnings: Vec<Issue>,
}

impl Report {
    pub fn is_valid(&self) -> bool {
        self.errors.is_empty()
    }

    fn error(&mut self, path: impl Into<String>, message: impl Into<String>) {
        self.errors.push(Issue::new(path, message));
    }

    fn warn(&mut self, path: impl Into<String>, message: impl Into<String>) {
        self.warnings.push(Issue::new(path, message));
    }

    /// Error unless `value` is finite and satisfies `ok`
    fn check(&mut self, path: &str, value: f64, ok: bool, requirement: &str) {
        if !value.is_finite() || !ok {
            self.error(path, format!("{value} {requirement}"));
        }
    }

    fn positive(&mut self, path: &str, value: f64) {
        self.check(path, value, value > 0.0, "must be positive");
    }

    fn non_negative(&mut self, path: &str, value: f64) {
        self.check(path, value, value >= 0.0, "must not be negative");
    }

    fn finite(&mut self, path: &str, value: f64) {
        self.check(path, value, true, "must be finite");
    }

    fn finite3(&mut self, path: &str, values: &[f64; 3]) {
        if values.iter().any(|v| !v.is_finite()) {
            self.error(path, "components must be finite");
        }
    }

    /// Checks the value of a constant curve (tables are checked on loading)
    fn curve(&mut self, path: &str, curve: &Curve, ok: impl Fn(f64) -> bool, requirement: &str) {
        if let Some(v) = curve.as_constant() {
            self.check(path, v, ok(v), requirement);
        }
    }
}

/// Check every value of `config`
pub fn validate(config: &Config) -> Report {
    let mut r = Report::default();

    let sim = &config.simulation;
    r.positive("simulation.end_time_s", sim.end_time_s);
    r.positive("simulation.output_step_s", sim.output_step_s);
    if sim.output_step_s > 0.0 && sim.output_step_s > sim.end_time_s / 10.0 {
        r.warn(
            "simulation.output_step_s",
            "gives fewer than 10 output samples",
        );
    }
    match sim.integrator {
        Integrator::Rk4 { step_s: Some(step) } => {
            r.positive("simulation.integrator.step_s", step);
            if step > 1.0 {
                r.warn(
                    "simulation.integrator.step_s",
                    format!("{step} s is large; accuracy may suffer (1 s or less recommended)"),
                );
            }
        }
        Integrator::Rk4 { step_s: None } => {}
        Integrator::Rk45 { abs_tol, rel_tol } => {
            r.non_negative("simulation.integrator.abs_tol", abs_tol);
            r.non_negative("simulation.integrator.rel_tol", rel_tol);
            if abs_tol <= 0.0 && rel_tol <= 0.0 {
                r.error(
                    "simulation.integrator",
                    "at least one tolerance must be positive",
                );
            }
        }
    }

    let launch = &config.launch;
    let lat = launch.latitude_deg;
    r.check(
        "launch.latitude_deg",
        lat,
        lat.abs() <= 90.0,
        "must be within -90 to 90",
    );
    let lon = launch.longitude_deg;
    r.check(
        "launch.longitude_deg",
        lon,
        lon.abs() <= 180.0,
        "must be within -180 to 180",
    );
    let alt = launch.altitude_m;
    r.check(
        "launch.altitude_m",
        alt,
        alt >= -500.0,
        "is too far below sea level",
    );
    r.finite3("launch.velocity_ned_mps", &launch.velocity_ned_mps);
    r.non_negative("launch.rail_length_m", launch.rail_length_m);
    if alt > 10_000.0 {
        r.warn(
            "launch.altitude_m",
            format!("starts at {alt} m (air launch or restart in flight)"),
        );
    }
    let speed = launch
        .velocity_ned_mps
        .iter()
        .map(|v| v * v)
        .sum::<f64>()
        .sqrt();
    if speed > 100.0 {
        r.warn(
            "launch.velocity_ned_mps",
            format!("starts at {speed:.1} m/s: no pad hold and no rail"),
        );
    }

    let variation = config.atmosphere.seasonal_variation_percent;
    r.check(
        "atmosphere.seasonal_variation_percent",
        variation,
        variation.abs() <= 100.0,
        "must be within -100 to 100",
    );
    r.non_negative("wind.speed_mps", config.wind.speed_mps);
    r.finite("wind.direction_deg", config.wind.direction_deg);

    let att = &config.attitude;
    r.curve(
        "attitude.azimuth_deg",
        &att.azimuth_deg,
        |_| true,
        "must be finite",
    );
    r.curve(
        "attitude.elevation_deg",
        &att.elevation_deg,
        |v| v.abs() <= 90.0,
        "must be within -90 to 90",
    );
    r.curve(
        "attitude.roll_deg",
        &att.roll_deg,
        |_| true,
        "must be finite",
    );
    r.finite("attitude.yaw_offset_deg", att.yaw_offset_deg);
    r.finite("attitude.pitch_offset_deg", att.pitch_offset_deg);
    r.finite("attitude.roll_offset_deg", att.roll_offset_deg);
    r.finite3("attitude.gyro_bias_deg_h", &att.gyro_bias_deg_h);

    if config.stages.is_empty() {
        r.error("stages", "at least one stage is required");
    }
    let count = config.stages.len();
    for (i, stage) in config.stages.iter().enumerate() {
        validate_stage(&mut r, &format!("stages[{i}]"), stage, i + 1 == count);
    }
    r
}

fn validate_stage(r: &mut Report, path: &str, stage: &Stage, last: bool) {
    let p = |key: &str| format!("{path}.{key}");
    r.positive(&p("mass_initial_kg"), stage.mass_initial_kg);
    if let Some(dry) = stage.mass_dry_kg {
        r.check(
            &p("mass_dry_kg"),
            dry,
            (0.0..=stage.mass_initial_kg).contains(&dry),
            "must be within 0 and the initial mass",
        );
    }

    let separation = stage.separation_time_s;
    match (separation, last) {
        (Some(t), false) => r.non_negative(&p("separation_time_s"), t),
        (None, false) => r.error(
            p("separation_time_s"),
            "is required for every stage but the last",
        ),
        (Some(_), true) => r.warn(p("separation_time_s"), "is ignored for the last stage"),
        (None, true) => {}
    }

    if let Some(engine) = &stage.engine {
        let e = |key: &str| format!("{path}.engine.{key}");
        r.curve(
            &e("thrust_vac_n"),
            &engine.thrust_vac_n,
            |v| v >= 0.0,
            "must not be negative",
        );
        r.curve(
            &e("isp_vac_s"),
            &engine.isp_vac_s,
            |v| v > 0.0,
            "must be positive",
        );
        if let Some(isp) = engine.isp_vac_s.as_constant()
            && isp > 0.0
            && !(100.0..=500.0).contains(&isp)
        {
            r.warn(
                e("isp_vac_s"),
                format!("{isp} s is outside the usual 100-500 s"),
            );
        }
        r.non_negative(&e("burn_start_s"), engine.burn_start_s);
        r.non_negative(&e("burn_end_s"), engine.burn_end_s);
        if engine.burn_end_s < engine.burn_start_s {
            r.error(
                e("burn_end_s"),
                format!(
                    "{} must not be earlier than burn_start_s ({})",
                    engine.burn_end_s, engine.burn_start_s
                ),
            );
        }
        r.non_negative(&e("nozzle_exit_area_m2"), engine.nozzle_exit_area_m2);
        if let Some(sep) = separation
            && !last
            && sep < engine.burn_end_s
        {
            r.warn(
                e("burn_end_s"),
                format!(
                    "the stage separates at {sep} s, before the burn ends; the burn stops there"
                ),
            );
        }
    }

    let a = |key: &str| format!("{path}.aero.{key}");
    r.positive(&a("diameter_m"), stage.aero.diameter_m);
    r.positive(
        &a("ballistic_coefficient_kg_m2"),
        stage.aero.ballistic_coefficient_kg_m2,
    );
    r.curve(&a("ca"), &stage.aero.ca, |_| true, "must be finite");
    if let Some(ca) = &stage.aero.ca_power_off {
        r.curve(&a("ca_power_off"), ca, |_| true, "must be finite");
    }
    r.curve(
        &a("cn_alpha_per_rad"),
        &stage.aero.cn_alpha_per_rad,
        |_| true,
        "must be finite",
    );
    if stage.aero.cn_table.is_some() && !stage.aero.cn_alpha_per_rad.is_constant(0.0) {
        r.warn(a("cn_alpha_per_rad"), "is ignored: cn_table is given");
    }

    let end = if last {
        f64::INFINITY
    } else {
        separation.unwrap_or(f64::INFINITY)
    };
    for (k, jettison) in stage.jettisons.iter().enumerate() {
        let j = |key: &str| format!("{path}.jettisons[{k}].{key}");
        r.check(
            &j("time_s"),
            jettison.time_s,
            jettison.time_s > 0.0 && jettison.time_s < end,
            "must be after the stage start and before its separation",
        );
        r.check(
            &j("mass_kg"),
            jettison.mass_kg,
            jettison.mass_kg > 0.0 && jettison.mass_kg < stage.mass_initial_kg,
            "must be positive and less than the stage mass",
        );
        r.positive(
            &j("ballistic_coefficient_kg_m2"),
            jettison.ballistic_coefficient_kg_m2,
        );
        r.finite3(&j("delta_v_ned_mps"), &jettison.delta_v_ned_mps);
    }

    if let Some(trim) = &stage.thrust_trim {
        let t = |key: &str| format!("{path}.thrust_trim.{key}");
        r.curve(&t("cg_sta_m"), &trim.cg_sta_m, |_| true, "must be finite");
        r.curve(
            &t("gimbal_sta_m"),
            &trim.gimbal_sta_m,
            |_| true,
            "must be finite",
        );
        r.finite3(&t("cg_offset_m"), &trim.cg_offset_m);
        r.finite3(&t("cp_offset_m"), &trim.cp_offset_m);
        r.finite3(&t("gimbal_offset_m"), &trim.gimbal_offset_m);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(stages: &str) -> Config {
        Config::from_json(&format!(
            r#"{{"name": "t", "simulation": {{"end_time_s": 100}},
                "launch": {{"latitude_deg": 35, "longitude_deg": 139}}, "stages": {stages}}}"#
        ))
        .unwrap()
    }

    #[test]
    fn valid_two_stage_vehicle() {
        let report = validate(&config(
            r#"[{"mass_initial_kg": 100, "separation_time_s": 10,
                 "engine": {"thrust_vac_n": 5000, "isp_vac_s": 250, "burn_end_s": 8}},
                {"mass_initial_kg": 20}]"#,
        ));
        assert!(report.is_valid(), "{report:?}");
        assert!(report.warnings.is_empty(), "{report:?}");
    }

    #[test]
    fn errors_name_their_paths() {
        let report = validate(&config(
            r#"[{"mass_initial_kg": -1,
                 "engine": {"thrust_vac_n": 5000, "isp_vac_s": 250, "burn_start_s": 5, "burn_end_s": 2}},
                {"mass_initial_kg": 20}]"#,
        ));
        let paths: Vec<&str> = report.errors.iter().map(|e| e.path.as_str()).collect();
        assert!(paths.contains(&"stages[0].mass_initial_kg"), "{paths:?}");
        assert!(paths.contains(&"stages[0].engine.burn_end_s"), "{paths:?}");
        assert!(paths.contains(&"stages[0].separation_time_s"), "{paths:?}");
    }

    #[test]
    fn early_separation_warns() {
        let report = validate(&config(
            r#"[{"mass_initial_kg": 100, "separation_time_s": 5,
                 "engine": {"thrust_vac_n": 5000, "isp_vac_s": 250, "burn_end_s": 8}},
                {"mass_initial_kg": 20}]"#,
        ));
        assert!(report.is_valid());
        assert_eq!(report.warnings[0].path, "stages[0].engine.burn_end_s");
    }

    #[test]
    fn jettison_outside_the_stage_flight_is_an_error() {
        let report = validate(&config(
            r#"[{"mass_initial_kg": 100, "separation_time_s": 5,
                 "jettisons": [{"time_s": 6, "mass_kg": 1}]},
                {"mass_initial_kg": 20}]"#,
        ));
        assert_eq!(report.errors[0].path, "stages[0].jettisons[0].time_s");
    }
}
