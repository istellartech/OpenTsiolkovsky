use crate::physics::coordinates::CoordinateTransform;
/// Input/Output handling for OpenTsiolkovsky
///
/// Handles JSON configuration files and CSV data files
use crate::rocket::{NeutralityData, Rocket, RocketConfig, SurfaceData2D, TimeSeriesData};
use crate::simulator::{EventKind, FallBody, FlightEvent, SimulationState, impact_point};
use serde_json;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum IoError {
    #[error("File read error: {0}")]
    FileRead(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    JsonParse(#[from] serde_json::Error),

    #[error("CSV parse error: {0}")]
    CsvParse(#[from] csv::Error),

    #[error("Configuration validation error:\n{}", .0.join("\n"))]
    ConfigValidation(Vec<String>),
}

pub type Result<T> = std::result::Result<T, IoError>;

fn parse_numeric_record<const N: usize>(record: &csv::StringRecord) -> Option<[f64; N]> {
    if record.len() < N {
        return None;
    }

    let mut values = [0.0; N];
    for (idx, slot) in values.iter_mut().enumerate() {
        let token = record.get(idx)?.trim();
        if token.is_empty() {
            return None;
        }
        *slot = token.parse::<f64>().ok()?;
    }
    Some(values)
}

fn collect_numeric_rows<R: Read, const N: usize>(
    reader: &mut csv::Reader<R>,
) -> Result<Vec<[f64; N]>> {
    let mut rows = Vec::new();
    for result in reader.records() {
        let record = result?;
        if let Some(values) = parse_numeric_record::<N>(&record) {
            rows.push(values);
        }
    }
    Ok(rows)
}

fn load_csv_rows<P: AsRef<Path>, const N: usize>(path: P) -> Result<Vec<[f64; N]>> {
    let mut reader = csv::Reader::from_path(path)?;
    collect_numeric_rows(&mut reader)
}

fn parse_csv_rows_from_str<const N: usize>(content: &str) -> Result<Vec<[f64; N]>> {
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(true)
        .from_reader(content.as_bytes());
    collect_numeric_rows(&mut reader)
}

/// Load rocket configuration from JSON file
pub fn load_config<P: AsRef<Path>>(path: P) -> Result<RocketConfig> {
    parse_config_str(&fs::read_to_string(path)?)
}

/// Parse and validate a rocket configuration from JSON text
pub fn parse_config_str(content: &str) -> Result<RocketConfig> {
    let config: RocketConfig = serde_json::from_str(content)?;

    // Validate the configuration and return detailed errors if any
    if let Err(validation_errors) = validate_config(&config) {
        return Err(IoError::ConfigValidation(validation_errors));
    }

    Ok(config)
}

/// Validate rocket configuration and return detailed error messages
pub fn validate_config(config: &RocketConfig) -> std::result::Result<(), Vec<String>> {
    let mut errors = Vec::new();

    // Validate calculation conditions
    validate_calculate_condition(&config.calculate_condition, &mut errors);

    // Validate launch conditions
    validate_launch_condition(&config.launch, &mut errors);

    // Validate stages
    validate_stages(&config.stages, &mut errors);

    // Validate wind configuration
    validate_wind_config(&config.wind, &mut errors);

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors)
    }
}

fn validate_calculate_condition(
    calc: &crate::rocket::CalculateCondition,
    errors: &mut Vec<String>,
) {
    // Validate end time
    if !calc.end_time.is_finite() || calc.end_time <= 0.0 {
        errors.push(format!(
            "計算条件: 終了時間 '{:.3}秒' は正の有限値である必要があります",
            calc.end_time
        ));
    }

    // Validate time step
    if !calc.time_step.is_finite() || calc.time_step <= 0.0 {
        errors.push(format!(
            "計算条件: 出力時間刻み '{:.6}秒' は正の有限値である必要があります",
            calc.time_step
        ));
    }

    // Validate air density variation
    if !calc.air_density_variation.is_finite() {
        errors.push("計算条件: 大気密度変動率は有限値である必要があります".to_string());
    } else if calc.air_density_variation < -100.0 || calc.air_density_variation > 100.0 {
        errors.push(format!(
            "計算条件: 大気密度変動率 '{:.1}%' は-100%から100%の範囲内である必要があります",
            calc.air_density_variation
        ));
    }

    // Validate integrator settings
    match calc.integrator.method {
        crate::rocket::IntegratorMethod::Rk4 => {
            if let Some(step) = calc.integrator.rk4_step
                && (!step.is_finite() || step <= 0.0)
            {
                errors.push(format!(
                    "積分器設定: RK4ステップサイズ '{:.6}秒' は正の有限値である必要があります",
                    step
                ));
            }
        }
        crate::rocket::IntegratorMethod::Rk45 => {
            for (name, tol) in [
                ("絶対", calc.integrator.rk45_abs_tol),
                ("相対", calc.integrator.rk45_rel_tol),
            ] {
                if !tol.is_finite() || tol < 0.0 {
                    errors.push(format!(
                        "積分器設定: RK45の{}許容誤差 '{:e}' は非負の有限値である必要があります",
                        name, tol
                    ));
                }
            }
            if calc.integrator.rk45_abs_tol <= 0.0 && calc.integrator.rk45_rel_tol <= 0.0 {
                errors.push(
                    "積分器設定: RK45の許容誤差は少なくとも一方が正である必要があります"
                        .to_string(),
                );
            }
        }
    }
}

fn validate_launch_condition(launch: &crate::rocket::LaunchCondition, errors: &mut Vec<String>) {
    // Validate position LLH
    let [lat, lon, alt] = launch.position_llh;

    if !lat.is_finite() || !(-90.0..=90.0).contains(&lat) {
        errors.push(format!(
            "打ち上げ条件: 緯度 '{:.6}度' は-90度から90度の範囲内である必要があります",
            lat
        ));
    }

    if !lon.is_finite() || !(-180.0..=180.0).contains(&lon) {
        errors.push(format!(
            "打ち上げ条件: 経度 '{:.6}度' は-180度から180度の範囲内である必要があります",
            lon
        ));
    }

    if !alt.is_finite() {
        errors.push(format!(
            "打ち上げ条件: 高度 '{:.1}m' は有限値である必要があります",
            alt
        ));
    } else if alt < -500.0 {
        errors.push(format!("打ち上げ条件: 高度 '{:.1}m' が海面下すぎます", alt));
    }

    // Validate velocity NED
    let [vn, ve, vd] = launch.velocity_ned;

    if !vn.is_finite() || !ve.is_finite() || !vd.is_finite() {
        errors.push("打ち上げ条件: 初期速度成分は有限値である必要があります".to_string());
    }

    // Validate launch time
    let [year, month, day, hour, min, sec] = launch.launch_time;

    if !(1900..=2100).contains(&year) {
        errors.push(format!(
            "打ち上げ条件: 打ち上げ年 '{}年' は1900年から2100年の範囲内である必要があります",
            year
        ));
    }

    if !(1..=12).contains(&month) {
        errors.push(format!(
            "打ち上げ条件: 月 '{}月' は1から12の範囲内である必要があります",
            month
        ));
    }

    if !(1..=31).contains(&day) {
        errors.push(format!(
            "打ち上げ条件: 日 '{}日' は1から31の範囲内である必要があります",
            day
        ));
    }

    if !(0..=23).contains(&hour) {
        errors.push(format!(
            "打ち上げ条件: 時 '{}時' は0から23の範囲内である必要があります",
            hour
        ));
    }

    if !(0..=59).contains(&min) {
        errors.push(format!(
            "打ち上げ条件: 分 '{}分' は0から59の範囲内である必要があります",
            min
        ));
    }

    if !(0..=59).contains(&sec) {
        errors.push(format!(
            "打ち上げ条件: 秒 '{}秒' は0から59の範囲内である必要があります",
            sec
        ));
    }
}

fn validate_stages(stages: &[crate::rocket::StageConfig], errors: &mut Vec<String>) {
    if stages.is_empty() {
        errors.push("ステージ設定: 少なくとも1つのステージが必要です".to_string());
        return;
    }

    for (i, stage) in stages.iter().enumerate() {
        let stage_num = i + 1;
        validate_single_stage(stage, stage_num, errors);
    }

    // Validate stage separation timing
    validate_stage_separation_timing(stages, errors);
}

fn validate_single_stage(
    stage: &crate::rocket::StageConfig,
    stage_num: usize,
    errors: &mut Vec<String>,
) {
    // Validate mass
    if !stage.mass_initial.is_finite() || stage.mass_initial <= 0.0 {
        errors.push(format!(
            "ステージ{}: 初期質量 '{:.1}kg' は正の有限値である必要があります",
            stage_num, stage.mass_initial
        ));
    }

    // Validate thrust timing
    if !stage.thrust.burn_start_time.is_finite() || stage.thrust.burn_start_time < 0.0 {
        errors.push(format!(
            "ステージ{}: 燃焼開始時刻 '{:.3}秒' は非負の有限値である必要があります",
            stage_num, stage.thrust.burn_start_time
        ));
    }

    if !stage.thrust.burn_end_time.is_finite() || stage.thrust.burn_end_time < 0.0 {
        errors.push(format!(
            "ステージ{}: 燃焼終了時刻 '{:.3}秒' は非負の有限値である必要があります",
            stage_num, stage.thrust.burn_end_time
        ));
    }

    if stage.thrust.burn_end_time < stage.thrust.burn_start_time {
        errors.push(format!(
            "ステージ{}: 燃焼終了時刻 '{:.3}秒' は燃焼開始時刻 '{:.3}秒' 以降である必要があります",
            stage_num, stage.thrust.burn_end_time, stage.thrust.burn_start_time
        ));
    }

    // Validate thrust magnitude
    if !stage.thrust.const_thrust_vac.is_finite() || stage.thrust.const_thrust_vac < 0.0 {
        errors.push(format!(
            "ステージ{}: 真空推力 '{:.1}N' は非負の有限値である必要があります",
            stage_num, stage.thrust.const_thrust_vac
        ));
    }

    // Validate ISP
    if !stage.thrust.const_isp_vac.is_finite() || stage.thrust.const_isp_vac <= 0.0 {
        errors.push(format!(
            "ステージ{}: 真空比推力 '{:.1}秒' は正の有限値である必要があります",
            stage_num, stage.thrust.const_isp_vac
        ));
    }

    // Validate engine geometry
    if !stage.thrust.throat_diameter.is_finite() || stage.thrust.throat_diameter < 0.0 {
        errors.push(format!(
            "ステージ{}: スロート直径 '{:.4}m' は非負の有限値である必要があります",
            stage_num, stage.thrust.throat_diameter
        ));
    }

    if !stage.thrust.nozzle_expansion_ratio.is_finite() || stage.thrust.nozzle_expansion_ratio < 1.0
    {
        errors.push(format!(
            "ステージ{}: ノズル膨張比 '{:.1}' は1以上の有限値である必要があります",
            stage_num, stage.thrust.nozzle_expansion_ratio
        ));
    }

    // Validate aerodynamics
    if !stage.aero.body_diameter.is_finite() || stage.aero.body_diameter <= 0.0 {
        errors.push(format!(
            "ステージ{}: 機体直径 '{:.3}m' は正の有限値である必要があります",
            stage_num, stage.aero.body_diameter
        ));
    }
}

/// Stage times (burn start/end, forced cutoff, separation) are relative to each
/// stage's own start, i.e. the previous stage's separation (see
/// `build_stage_runtime` in `simulator.rs`). Only the following stage's own
/// timing needs to be valid; its absolute start is always the separation.
fn validate_stage_separation_timing(
    stages: &[crate::rocket::StageConfig],
    errors: &mut Vec<String>,
) {
    for (i, stage) in stages.iter().enumerate() {
        if stage.stage.following_stage_exists
            && (!stage.stage.separation_time.is_finite() || stage.stage.separation_time < 0.0)
        {
            errors.push(format!(
                "ステージ{}: 分離時刻 '{:.3}秒' (段開始からの相対時刻) は非負の有限値である必要があります",
                i + 1,
                stage.stage.separation_time
            ));
        }
    }
}

/// Collect non-fatal warnings for a configuration that passed validation.
/// These describe settings the solver accepts (e.g. by clamping) but that may
/// be unintended.
pub fn config_warnings(config: &RocketConfig) -> Vec<String> {
    let mut warnings = Vec::new();

    // Unusual but valid values (an air launch, a restart in flight, ...)
    let calc = &config.calculate_condition;
    if calc.time_step.is_finite() && calc.time_step > calc.end_time / 10.0 {
        warnings.push(format!(
            "計算条件: 出力時間刻み '{:.3}秒' が終了時間 '{:.1}秒' に対して大きく、出力点が10点未満です",
            calc.time_step, calc.end_time
        ));
    } else if calc.time_step < 0.001 {
        warnings.push(format!(
            "計算条件: 出力時間刻み '{:.6}秒' が小さく、出力データが大量になります",
            calc.time_step
        ));
    }
    if let Some(step) = calc.integrator.rk4_step
        && calc.integrator.method == crate::rocket::IntegratorMethod::Rk4
        && step.is_finite()
        && step > 1.0
    {
        warnings.push(format!(
            "積分器設定: RK4ステップサイズ '{:.3}秒' は大きく、精度が落ちる可能性があります (推奨: 1秒以下)",
            step
        ));
    }
    let alt = config.launch.position_llh[2];
    if alt > 10_000.0 {
        warnings.push(format!(
            "打ち上げ条件: 高度 '{:.1}m' から開始します (空中発射または飛行途中からの再開)",
            alt
        ));
    }
    let speed = config
        .launch
        .velocity_ned
        .iter()
        .map(|v| v * v)
        .sum::<f64>()
        .sqrt();
    if speed > 100.0 {
        warnings.push(format!(
            "打ち上げ条件: 初期速度 '{:.1}m/s' から開始します (発射台での保持・レール拘束は行いません)",
            speed
        ));
    }
    for (i, stage) in config.stages.iter().enumerate() {
        let isp = stage.thrust.const_isp_vac;
        if !stage.thrust.isp_file_exists && isp.is_finite() && !(100.0..=500.0).contains(&isp) {
            warnings.push(format!(
                "ステージ{}: 真空比推力 '{:.1}秒' は通常の範囲 (100〜500秒) の外です",
                i + 1,
                isp
            ));
        }
    }

    let end_time = config.calculate_condition.end_time;
    if end_time.is_finite() && end_time > 3600.0 {
        warnings.push(format!(
            "計算条件: 終了時間 '{:.1}秒' が1時間(3600秒)を超えています - 意図的ですか？",
            end_time
        ));
    }

    for (i, stage) in config.stages.iter().enumerate() {
        if stage.stage.following_stage_exists
            && stage.stage.separation_time.is_finite()
            && stage.stage.separation_time < stage.thrust.burn_end_time
        {
            warnings.push(format!(
                "ステージ{}: 分離時刻 '{:.3}秒' が燃焼終了時刻 '{:.3}秒' より前のため、燃焼は分離時刻で打ち切られます",
                i + 1,
                stage.stage.separation_time,
                stage.thrust.burn_end_time
            ));
        }
    }

    for (i, stage) in config.stages.iter().enumerate() {
        if stage.power_flight_mode != 0 {
            warnings.push(format!(
                "ステージ{}: 動力飛行モード '{}' は未対応のため 3DoF(0) で計算します",
                i + 1,
                stage.power_flight_mode
            ));
        }
        let six_dof = &stage.six_dof;
        if !six_dof.cg_cp_controller_position_file.is_empty()
            || !six_dof.moment_of_inertia_file_name.is_empty()
        {
            warnings.push(format!(
                "ステージ{}: 6DoF の設定ファイルは未対応のため使われません",
                i + 1
            ));
        }
    }

    for (i, stage) in config.stages.iter().enumerate() {
        let dump = &stage.dumping_product;
        if !dump.dumping_product_exists {
            continue;
        }
        let t = dump.dumping_product_separation_time;
        let stage_end = if stage.stage.following_stage_exists {
            stage.stage.separation_time
        } else {
            f64::INFINITY
        };
        if !(t > 0.0 && t < stage_end) {
            warnings.push(format!(
                "ステージ{}: 投棄物の分離時刻 '{:.3}秒' がステージの飛行中(0〜分離時刻)にないため、投棄物は無視されます",
                i + 1,
                t
            ));
        }
        if !(dump.dumping_product_mass > 0.0 && dump.dumping_product_mass < stage.mass_initial) {
            warnings.push(format!(
                "ステージ{}: 投棄物の質量 '{:.3}kg' がステージ質量 '{:.3}kg' に対して不正です",
                i + 1,
                dump.dumping_product_mass,
                stage.mass_initial
            ));
        }
    }

    warnings
}

/// Warnings that need the loaded data tables (thrust and Isp profiles)
pub fn rocket_warnings(rocket: &Rocket) -> Vec<String> {
    let mut warnings = Vec::new();
    for i in 0..rocket.stage_count() {
        let demand = rocket.propellant_demand(i);
        let usable = rocket.usable_propellant(i);
        if demand > usable * (1.0 + 1e-6) {
            warnings.push(format!(
                "ステージ{}: 燃焼に必要な推進剤 '{:.1}kg' が搭載量 '{:.1}kg' を超えるため、推進剤が尽きた時点で燃焼を終えます",
                i + 1,
                demand,
                usable
            ));
        }
        let stage = rocket.stage_config(i);
        if stage.attitude_neutrality.considering_neutrality {
            if rocket.neutrality[i].is_none() {
                warnings.push(format!(
                    "ステージ{}: 推力トリム(neutrality)の CG/CP ファイルが読めないため、トリムは無視されます",
                    i + 1
                ));
            } else if rocket.cn_surface.is_none() {
                warnings.push(format!(
                    "ステージ{}: 推力トリム(neutrality)には CN の Mach×迎角テーブルが必要なため、トリムは無視されます",
                    i + 1
                ));
            }
        }
        if let Some(dry) = stage.mass_dry
            && !(0.0..=stage.mass_initial).contains(&dry)
        {
            warnings.push(format!(
                "ステージ{}: 乾燥質量 '{:.1}kg' が初期質量 '{:.1}kg' の範囲外です",
                i + 1,
                dry,
                stage.mass_initial
            ));
        }
    }
    warnings
}

#[allow(clippy::ptr_arg)]
fn validate_wind_config(_wind: &crate::rocket::WindConfig, _errors: &mut Vec<String>) {
    // Wind configuration validation can be added here if needed
    // For now, basic wind config is typically simple and doesn't need extensive validation
}

/// Load CSV data as (time, value) pairs
pub fn load_csv_data<P: AsRef<Path>>(path: P) -> Result<Vec<(f64, f64)>> {
    Ok(load_csv_rows::<_, 2>(path)?
        .into_iter()
        .map(|row| (row[0], row[1]))
        .collect())
}

/// Load time-series data from CSV file
pub fn load_time_series<P: AsRef<Path>>(path: P) -> Result<TimeSeriesData> {
    Ok(TimeSeriesData::from_pairs(load_csv_data(path)?))
}

/// Parse time-series CSV from string content
pub fn parse_time_series_from_str(content: &str) -> Result<TimeSeriesData> {
    Ok(TimeSeriesData::from_pairs(
        parse_csv_rows_from_str::<2>(content)?
            .into_iter()
            .map(|row| (row[0], row[1])),
    ))
}

/// Load CN 2D surface from special 15-column CSV (first row: angles, first col: Mach)
pub fn load_cn_surface<P: AsRef<Path>>(path: P) -> Result<SurfaceData2D> {
    let content = std::fs::read_to_string(path)?;
    parse_cn_surface_from_str(&content)
}

/// Parse CN 2D surface from CSV string content
pub fn parse_cn_surface_from_str(content: &str) -> Result<SurfaceData2D> {
    let mut rows: Vec<Vec<f64>> = Vec::new();
    for (li, line) in content.lines().enumerate() {
        let mut vals: Vec<f64> = Vec::new();
        for token in line.split(',') {
            let t = token.trim();
            if t.is_empty() {
                vals.push(0.0);
            } else {
                match t.parse::<f64>() {
                    Ok(v) => vals.push(v),
                    Err(_) => {
                        // if header like "mach[-]" etc; skip line
                        vals.clear();
                        break;
                    }
                }
            }
        }
        if !vals.is_empty() {
            // Ensure exactly 15 columns when possible; pad or truncate
            if vals.len() > 15 {
                vals.truncate(15);
            }
            if vals.len() < 15 {
                vals.resize(15, *vals.last().unwrap_or(&0.0));
            }
            rows.push(vals);
        } else if li == 0 {
            // If the first row is non-numeric header, continue
            continue;
        }
    }

    if rows.len() < 3 {
        // need at least header+2 rows
        return Err(IoError::FileRead(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "CN surface CSV too short",
        )));
    }

    // First row (row 0): angles in columns 1..=
    let mut y: Vec<f64> = rows[0][1..].to_vec();
    // Some files may duplicate last value; ensure ascending by making non-decreasing
    for k in 1..y.len() {
        if y[k] < y[k - 1] {
            y[k] = y[k - 1];
        }
    }

    // Remaining rows: x = Mach in col 0, z row = columns 1..
    let mut x: Vec<f64> = Vec::new();
    let mut z: Vec<Vec<f64>> = Vec::new();
    for r in rows.iter().skip(1) {
        x.push(r[0]);
        z.push(r[1..].to_vec());
    }

    // Ensure ascending x as well
    let mut idx: Vec<usize> = (0..x.len()).collect();
    idx.sort_by(|&i, &j| {
        x[i].partial_cmp(&x[j]).unwrap_or_else(|| {
            // Handle NaN values by putting them at the end
            if x[i].is_nan() && x[j].is_nan() {
                std::cmp::Ordering::Equal
            } else if x[i].is_nan() {
                std::cmp::Ordering::Greater
            } else {
                std::cmp::Ordering::Less
            }
        })
    });
    let x_sorted: Vec<f64> = idx.iter().map(|&i| x[i]).collect();
    let z_sorted: Vec<Vec<f64>> = idx.iter().map(|&i| z[i].clone()).collect();

    Ok(SurfaceData2D {
        x: x_sorted,
        y,
        z: z_sorted,
    })
}

/// Load attitude data from CSV file (time, azimuth, elevation)
pub fn load_attitude_data<P: AsRef<Path>>(path: P) -> Result<Vec<(f64, f64, f64)>> {
    Ok(load_csv_rows::<_, 3>(path)?
        .into_iter()
        .map(|row| (row[0], row[1], row[2]))
        .collect())
}

/// Roll column of an attitude CSV (time, azimuth, elevation, roll), if
/// every row has one
pub fn load_attitude_roll<P: AsRef<Path>>(path: P) -> Result<Option<TimeSeriesData>> {
    let rows4 = load_csv_rows::<_, 4>(&path)?;
    let rows3 = load_csv_rows::<_, 3>(&path)?;
    Ok((!rows4.is_empty() && rows4.len() == rows3.len())
        .then(|| TimeSeriesData::from_pairs(rows4.into_iter().map(|r| (r[0], r[3])))))
}

/// Parse attitude data CSV from string content (time, azimuth, elevation)
pub fn parse_attitude_from_str(content: &str) -> Result<Vec<(f64, f64, f64)>> {
    Ok(parse_csv_rows_from_str::<3>(content)?
        .into_iter()
        .map(|row| (row[0], row[1], row[2]))
        .collect())
}

/// Load wind data from CSV file (altitude, wind_speed, wind_direction)
pub fn load_wind_data<P: AsRef<Path>>(path: P) -> Result<Vec<(f64, f64, f64)>> {
    Ok(load_csv_rows::<_, 3>(path)?
        .into_iter()
        .map(|row| (row[0], row[1], row[2]))
        .collect())
}

/// Parse wind data CSV from string content (altitude, wind_speed, wind_direction)
pub fn parse_wind_from_str(content: &str) -> Result<Vec<(f64, f64, f64)>> {
    Ok(parse_csv_rows_from_str::<3>(content)?
        .into_iter()
        .map(|row| (row[0], row[1], row[2]))
        .collect())
}

fn resolve_data_path(base: &Path, exists_flag: bool, file_name: &str) -> Option<PathBuf> {
    if !exists_flag || file_name.trim().is_empty() {
        return None;
    }

    let path = base.join(file_name);
    if path.exists() { Some(path) } else { None }
}

fn maybe_load<T, F>(base: &Path, exists_flag: bool, file_name: &str, loader: F) -> Result<Option<T>>
where
    F: FnOnce(&Path) -> Result<T>,
{
    if let Some(path) = resolve_data_path(base, exists_flag, file_name) {
        loader(&path).map(Some)
    } else {
        Ok(None)
    }
}

/// Load all CSV data files for a rocket configuration
pub fn load_rocket_data(mut rocket: Rocket, base_path: Option<&Path>) -> Result<Rocket> {
    let base = base_path.unwrap_or_else(|| Path::new("."));

    for idx in 0..rocket.stage_count() {
        let thrust_cfg = rocket.stage_config(idx).thrust.clone();
        rocket.thrust_tables[idx] = maybe_load(
            base,
            thrust_cfg.thrust_file_exists,
            &thrust_cfg.thrust_file_name,
            |p| load_time_series(p),
        )?;
        rocket.isp_tables[idx] = maybe_load(
            base,
            thrust_cfg.isp_file_exists,
            &thrust_cfg.isp_file_name,
            |p| load_time_series(p),
        )?;
    }

    for idx in 0..rocket.stage_count() {
        let n = rocket.stage_config(idx).attitude_neutrality.clone();
        if !n.considering_neutrality {
            continue;
        }
        let cg_path = resolve_data_path(base, true, &n.cg_controller_position_file);
        let cp_path = resolve_data_path(base, true, &n.cp_file);
        if let (Some(cg_path), Some(cp_path)) = (cg_path, cp_path) {
            let rows = load_csv_rows::<_, 3>(&cg_path)?;
            rocket.neutrality[idx] = Some(NeutralityData {
                cg: TimeSeriesData::from_pairs(rows.iter().map(|r| (r[0], r[1]))),
                controller: TimeSeriesData::from_pairs(rows.iter().map(|r| (r[0], r[2]))),
                cp: load_cn_surface(&cp_path)?,
            });
        }
    }

    let primary_stage = rocket.config.primary_stage();
    let aero = &primary_stage.aero;
    if let Some(path) = resolve_data_path(base, aero.cn_file_exists, &aero.cn_file_name) {
        match load_cn_surface(&path) {
            Ok(surface) => {
                rocket.cn_surface = Some(surface);
                rocket.cn_data = None;
            }
            Err(_) => {
                rocket.cn_data = Some(load_time_series(&path)?);
            }
        }
    }
    rocket.ca_data = maybe_load(base, aero.ca_file_exists, &aero.ca_file_name, |p| {
        load_time_series(p)
    })?;
    rocket.ca_power_off_data = maybe_load(base, true, &aero.ca_power_off_file_name, |p| {
        load_time_series(p)
    })?;

    let attitude = &primary_stage.attitude;
    rocket.attitude_data = maybe_load(
        base,
        attitude.attitude_file_exists,
        &attitude.attitude_file_name,
        |p| load_attitude_data(p),
    )?;
    rocket.attitude_roll = maybe_load(
        base,
        attitude.attitude_file_exists,
        &attitude.attitude_file_name,
        |p| load_attitude_roll(p),
    )?
    .flatten();

    let calc = &rocket.config.calculate_condition;
    rocket.air_density_table = maybe_load(
        base,
        calc.air_density_file_exists,
        &calc.air_density_file,
        |p| load_time_series(p),
    )?;

    let wind = &rocket.config.wind;
    rocket.wind_data = maybe_load(base, wind.wind_file_exists, &wind.wind_file_name, |p| {
        load_wind_data(p)
    })?;

    Ok(rocket)
}

/// Create rocket from configuration file and load all associated data
pub fn create_rocket_from_config<P: AsRef<Path>>(config_path: P) -> Result<Rocket> {
    let config = load_config(&config_path)?;
    let rocket = Rocket::new(config);

    // Use the config file's directory as base path for relative file paths
    let base_path = config_path.as_ref().parent();

    load_rocket_data(rocket, base_path)
}

/// Create rocket from configuration JSON text; relative CSV file names are
/// resolved against `base_path` (the current directory when `None`)
pub fn create_rocket_from_str(content: &str, base_path: Option<&Path>) -> Result<Rocket> {
    load_rocket_data(Rocket::new(parse_config_str(content)?), base_path)
}

/// CSV file names the configuration asks `load_rocket_data` to read, in
/// load order and without duplicates (whether or not the files exist)
pub fn referenced_files(config: &RocketConfig) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    let mut add = |flag: bool, name: &str| {
        let name = name.trim();
        if flag && !name.is_empty() && !names.iter().any(|n| n == name) {
            names.push(name.to_string());
        }
    };
    for stage in &config.stages {
        add(
            stage.thrust.thrust_file_exists,
            &stage.thrust.thrust_file_name,
        );
        add(stage.thrust.isp_file_exists, &stage.thrust.isp_file_name);
    }
    for stage in &config.stages {
        let n = &stage.attitude_neutrality;
        add(n.considering_neutrality, &n.cg_controller_position_file);
        add(n.considering_neutrality, &n.cp_file);
    }
    let primary = config.primary_stage();
    add(primary.aero.cn_file_exists, &primary.aero.cn_file_name);
    add(primary.aero.ca_file_exists, &primary.aero.ca_file_name);
    add(true, &primary.aero.ca_power_off_file_name);
    add(
        primary.attitude.attitude_file_exists,
        &primary.attitude.attitude_file_name,
    );
    let calc = &config.calculate_condition;
    add(calc.air_density_file_exists, &calc.air_density_file);
    add(config.wind.wind_file_exists, &config.wind.wind_file_name);
    names
}

/// Referenced CSV files that do not exist under `base_path`; the loader
/// silently falls back to the constant values for these
pub fn missing_files(config: &RocketConfig, base_path: Option<&Path>) -> Vec<String> {
    let base = base_path.unwrap_or_else(|| Path::new("."));
    referenced_files(config)
        .into_iter()
        .filter(|name| !base.join(name).exists())
        .collect()
}

/// Save trajectory data to CSV file
pub fn save_trajectory_csv<P: AsRef<Path>>(
    trajectory: &[SimulationState],
    output_path: P,
) -> Result<()> {
    let mut wtr = csv::Writer::from_path(output_path)?;

    // Write header
    wtr.write_record([
        "time[s]",
        "position_x[m]",
        "position_y[m]",
        "position_z[m]",
        "velocity_x[m/s]",
        "velocity_y[m/s]",
        "velocity_z[m/s]",
        "mass[kg]",
        "altitude[m]",
        "velocity_magnitude[m/s]",
        "mach_number[-]",
        "dynamic_pressure[Pa]",
        "thrust[N]",
        "drag_force[N]",
        "acc_eci_x[m/s2]",
        "acc_eci_y[m/s2]",
        "acc_eci_z[m/s2]",
        "acc_body_x[m/s2]",
        "acc_body_y[m/s2]",
        "acc_body_z[m/s2]",
        "flight_mode",
        "IIP_lat[deg]",
        "IIP_lon[deg]",
        "latitude[deg]",
        "longitude[deg]",
        "downrange[m]",
        "stage",
    ])?;

    let llh_of = |s: &SimulationState| {
        CoordinateTransform::pos_ecef_to_llh(&CoordinateTransform::pos_eci_to_ecef(
            &s.position,
            s.time,
        ))
    };
    let origin = trajectory.first().map(llh_of);

    // Write data
    for state in trajectory {
        let llh = llh_of(state);
        let downrange = origin.map_or(0.0, |o| CoordinateTransform::distance_surface(&o, &llh));
        wtr.write_record([
            state.time.to_string(),
            state.position.x.to_string(),
            state.position.y.to_string(),
            state.position.z.to_string(),
            state.velocity.x.to_string(),
            state.velocity.y.to_string(),
            state.velocity.z.to_string(),
            state.mass.to_string(),
            state.altitude.to_string(),
            state.velocity_magnitude.to_string(),
            state.mach_number.to_string(),
            state.dynamic_pressure.to_string(),
            state.thrust.to_string(),
            state.drag_force.to_string(),
            state.acc_eci.x.to_string(),
            state.acc_eci.y.to_string(),
            state.acc_eci.z.to_string(),
            state.acc_body.x.to_string(),
            state.acc_body.y.to_string(),
            state.acc_body.z.to_string(),
            state.flight_mode.as_str().to_string(),
            state.iip_lat_deg.map_or(String::new(), |v| v.to_string()),
            state.iip_lon_deg.map_or(String::new(), |v| v.to_string()),
            llh.x.to_string(),
            llh.y.to_string(),
            downrange.to_string(),
            state.stage.to_string(),
        ])?;
    }

    wtr.flush()?;
    Ok(())
}

/// Save simulation summary to JSON file
pub fn save_summary_json<P: AsRef<Path>>(
    trajectory: &[SimulationState],
    fall_bodies: &[FallBody],
    events: &[FlightEvent],
    config: &RocketConfig,
    output_path: P,
) -> Result<()> {
    let summary = summary_json(trajectory, fall_bodies, events, config)?;
    let json_string = serde_json::to_string_pretty(&summary)?;
    std::fs::write(output_path, json_string)?;
    Ok(())
}

/// Simulation summary, as written by `save_summary_json`
pub fn summary_json(
    trajectory: &[SimulationState],
    fall_bodies: &[FallBody],
    events: &[FlightEvent],
    config: &RocketConfig,
) -> Result<serde_json::Value> {
    if trajectory.is_empty() {
        return Err(IoError::FileRead(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            "Empty trajectory data",
        )));
    }

    let max_altitude_state = trajectory
        .iter()
        .filter(|s| !s.altitude.is_nan())
        .max_by(|a, b| {
            a.altitude
                .partial_cmp(&b.altitude)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .unwrap();
    let max_velocity_state = trajectory
        .iter()
        .filter(|s| !s.velocity_magnitude.is_nan())
        .max_by(|a, b| {
            a.velocity_magnitude
                .partial_cmp(&b.velocity_magnitude)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .unwrap();
    let max_mach_state = trajectory
        .iter()
        .filter(|s| !s.mach_number.is_nan())
        .max_by(|a, b| {
            a.mach_number
                .partial_cmp(&b.mach_number)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .unwrap();
    let final_state = trajectory.last().unwrap();
    let max_speed_state = trajectory
        .iter()
        .max_by(|a, b| {
            a.velocity_ecef_ned
                .magnitude()
                .total_cmp(&b.velocity_ecef_ned.magnitude())
        })
        .unwrap();
    let max_accel_state = trajectory
        .iter()
        .max_by(|a, b| a.acc_body.magnitude().total_cmp(&b.acc_body.magnitude()))
        .unwrap();
    let find_event = |kind: EventKind| events.iter().rev().find(|e| e.kind == kind);
    let max_q = find_event(EventKind::MaxQ);
    let final_orbit = crate::physics::orbit::elements(
        &final_state.position,
        &final_state.velocity,
        crate::physics::orbit::gmst_rad(config.launch.launch_time),
    );

    let summary = serde_json::json!({
        "rocket_name": config.name,
        "simulation_end_time": final_state.time,
        "max_altitude_m": max_altitude_state.altitude,
        "max_altitude_time_s": max_altitude_state.time,
        "max_velocity_ms": max_velocity_state.velocity_magnitude,
        "max_velocity_time_s": max_velocity_state.time,
        "max_mach_number": max_mach_state.mach_number,
        "max_mach_time_s": max_mach_state.time,
        "max_speed_earth_relative_ms": max_speed_state.velocity_ecef_ned.magnitude(),
        "max_speed_earth_relative_time_s": max_speed_state.time,
        "max_dynamic_pressure_pa": max_q.map(|e| e.dynamic_pressure_pa),
        "max_dynamic_pressure_time_s": max_q.map(|e| e.time_s),
        "max_acceleration_ms2": max_accel_state.acc_body.magnitude(),
        "max_acceleration_g": max_accel_state.acc_body.magnitude() / crate::math::constants::G0,
        "max_acceleration_time_s": max_accel_state.time,
        "burnout": find_event(EventKind::Burnout),
        "final_orbit": final_orbit,
        "final_position_eci_m": [
            final_state.position.x,
            final_state.position.y,
            final_state.position.z
        ],
        "final_velocity_eci_ms": [
            final_state.velocity.x,
            final_state.velocity.y,
            final_state.velocity.z
        ],
        "final_mass_kg": final_state.mass,
        "simulation_points": trajectory.len(),
        "impact_point": impact_point(trajectory),
        "events": events,
        "fall_bodies": fall_bodies
            .iter()
            .map(|b| serde_json::json!({
                "kind": b.kind,
                "stage": b.stage,
                "release_time_s": b.release_time_s,
                "mass_kg": b.mass_kg,
                "impact_point": b.impact,
            }))
            .collect::<Vec<_>>()
    });

    Ok(summary)
}

/// Write C++-compatible CSV using telemetry captured by simulator
pub fn save_cpp_telemetry_csv<P: AsRef<Path>>(
    rows: &[crate::simulator::CsvCppRow],
    path: P,
) -> Result<()> {
    let mut w = csv::Writer::from_path(path)?;
    w.write_record([
        "time(s)",
        "mass(kg)",
        "thrust(N)",
        "lat(deg)",
        "lon(deg)",
        "altitude(m)",
        "pos_ECI_X(m)",
        "pos_ECI_Y(m)",
        "pos_ECI_Z(m)",
        "vel_ECI_X(m/s)",
        "vel_ECI_Y(m/s)",
        "vel_ECI_Z(m/s)",
        "vel_NED_X(m/s)",
        "vel_NED_Y(m/s)",
        "vel_NED_Z(m/s)",
        "acc_ECI_X(m/s2)",
        "acc_ECI_Y(m/s2)",
        "acc_ECI_Z(m/s2)",
        "acc_Body_X(m/s2)",
        "acc_Body_Y(m/s2)",
        "acc_Body_Z(m/s2)",
        "Isp(s)",
        "Mach number",
        "attitude_azimuth(deg)",
        "attitude_elevation(deg)",
        "attitude_roll(deg)",
        "angle of attack alpha(deg)",
        "angle of attack beta(deg)",
        "all angle of attack gamma(deg)",
        "dynamic pressure(Pa)",
        "aeroforce_Body_X[N]",
        "aeroforce_Body_Y[N]",
        "aeroforce_Body_Z[N]",
        "thrust_Body_X[N]",
        "thrust_Body_Y[N]",
        "thrust_Body_Z[N]",
        "gimbal_angle_pitch(deg)",
        "gimbal_angle_yaw(deg)",
        "wind speed(m/s)",
        "wind direction(deg)",
        "downrange(m)",
        "IIP_lat(deg)",
        "IIP_lon(deg)",
        "dcmBODY2ECI_11",
        "dcmBODY2ECI_12",
        "dcmBODY2ECI_13",
        "dcmBODY2ECI_21",
        "dcmBODY2ECI_22",
        "dcmBODY2ECI_23",
        "dcmBODY2ECI_31",
        "dcmBODY2ECI_32",
        "dcmBODY2ECI_33",
        "inertial velocity(m/s)",
        "kinematic_energy_NED(J)",
        "loss_gravity(m/s2)",
        "loss_aerodynamics(m/s2)",
        "loss_thrust(m/s2)",
        "is_powered(1=powered 0=free)",
        "is_separated(1=already 0=still)",
    ])?;
    for r in rows {
        w.write_record([
            r.time.to_string(),
            r.mass.to_string(),
            r.thrust.to_string(),
            r.lat_deg.to_string(),
            r.lon_deg.to_string(),
            r.alt_m.to_string(),
            r.pos_eci.x.to_string(),
            r.pos_eci.y.to_string(),
            r.pos_eci.z.to_string(),
            r.vel_eci.x.to_string(),
            r.vel_eci.y.to_string(),
            r.vel_eci.z.to_string(),
            r.vel_ned.x.to_string(),
            r.vel_ned.y.to_string(),
            r.vel_ned.z.to_string(),
            r.acc_eci.x.to_string(),
            r.acc_eci.y.to_string(),
            r.acc_eci.z.to_string(),
            r.acc_body.x.to_string(),
            r.acc_body.y.to_string(),
            r.acc_body.z.to_string(),
            r.isp_s.to_string(),
            r.mach.to_string(),
            r.att_az_deg.to_string(),
            r.att_el_deg.to_string(),
            r.att_roll_deg.to_string(),
            r.aoa_alpha_deg.to_string(),
            r.aoa_beta_deg.to_string(),
            r.aoa_gamma_deg.to_string(),
            r.q_pa.to_string(),
            r.aero_body.x.to_string(),
            r.aero_body.y.to_string(),
            r.aero_body.z.to_string(),
            r.thrust_body.x.to_string(),
            r.thrust_body.y.to_string(),
            r.thrust_body.z.to_string(),
            r.gimbal_pitch_deg.to_string(),
            r.gimbal_yaw_deg.to_string(),
            r.wind_speed.to_string(),
            r.wind_dir_deg.to_string(),
            r.downrange.to_string(),
            r.iip_lat_deg.to_string(),
            r.iip_lon_deg.to_string(),
            r.dcm_body_to_eci[(0, 0)].to_string(),
            r.dcm_body_to_eci[(0, 1)].to_string(),
            r.dcm_body_to_eci[(0, 2)].to_string(),
            r.dcm_body_to_eci[(1, 0)].to_string(),
            r.dcm_body_to_eci[(1, 1)].to_string(),
            r.dcm_body_to_eci[(1, 2)].to_string(),
            r.dcm_body_to_eci[(2, 0)].to_string(),
            r.dcm_body_to_eci[(2, 1)].to_string(),
            r.dcm_body_to_eci[(2, 2)].to_string(),
            r.inertial_speed.to_string(),
            r.kinetic_energy_ned.to_string(),
            r.loss_gravity.to_string(),
            r.loss_aero.to_string(),
            r.loss_thrust.to_string(),
            r.is_powered.to_string(),
            r.is_separated.to_string(),
        ])?;
    }
    w.flush()?;
    Ok(())
}

/// Load a dispersion JSON; keys left out keep their defaults
pub fn load_dispersion<P: AsRef<Path>>(path: P) -> Result<crate::montecarlo::Dispersion> {
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

/// Save one row per Monte Carlo case: drawn perturbation, max altitude and
/// the impact point of every body (empty when it did not hit the ground)
pub fn save_monte_carlo_csv<P: AsRef<Path>>(
    cases: &[crate::montecarlo::CaseResult],
    output_path: P,
) -> Result<()> {
    let bodies: Vec<String> = crate::montecarlo::impact_statistics(cases)
        .into_iter()
        .map(|s| s.body)
        .collect();
    let mut wtr = csv::Writer::from_path(output_path)?;
    let mut header: Vec<String> = [
        "case",
        "thrust[%]",
        "isp[%]",
        "mass[%]",
        "drag[%]",
        "elevation[deg]",
        "azimuth[deg]",
        "wind_speed[m/s]",
        "wind_direction[deg]",
        "air_density[%]",
        "max_altitude[m]",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    for body in &bodies {
        header.push(format!("{body}_impact_time[s]"));
        header.push(format!("{body}_impact_lat[deg]"));
        header.push(format!("{body}_impact_lon[deg]"));
    }
    // Added later: appended so the earlier columns keep their place
    header.extend(
        ["normal[%]", "separation_time[s]", "wind_speed_scale[%]"]
            .iter()
            .map(|s| s.to_string()),
    );
    wtr.write_record(&header)?;

    for case in cases {
        let p = &case.perturbation;
        let mut row: Vec<String> = [
            p.thrust_percent,
            p.isp_percent,
            p.mass_percent,
            p.drag_percent,
            p.elevation_deg,
            p.azimuth_deg,
            p.wind_speed_mps,
            p.wind_direction_deg,
            p.air_density_percent,
            case.max_altitude_m,
        ]
        .iter()
        .map(|v| v.to_string())
        .collect();
        row.insert(0, case.index.to_string());
        for body in &bodies {
            let impact = case
                .impacts
                .iter()
                .find(|i| &i.body == body)
                .and_then(|i| i.impact);
            match impact {
                Some(p) => row.extend([
                    p.time_s.to_string(),
                    p.latitude_deg.to_string(),
                    p.longitude_deg.to_string(),
                ]),
                None => row.extend([String::new(), String::new(), String::new()]),
            }
        }
        row.extend([
            p.normal_percent.to_string(),
            p.separation_time_s.to_string(),
            p.wind_speed_percent.to_string(),
        ]);
        wtr.write_record(&row)?;
    }
    wtr.flush()?;
    Ok(())
}

/// Save the dispersion settings and per-body impact statistics
pub fn save_monte_carlo_summary<P: AsRef<Path>>(
    cases: &[crate::montecarlo::CaseResult],
    dispersion: &crate::montecarlo::Dispersion,
    seed: u64,
    output_path: P,
) -> Result<()> {
    let summary = serde_json::json!({
        "cases": cases.len(),
        "seed": seed,
        "dispersion_1sigma": dispersion,
        "impact_statistics": crate::montecarlo::impact_statistics(cases),
    });
    fs::write(output_path, serde_json::to_string_pretty(&summary)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_time_series_interpolation() {
        let mut ts = TimeSeriesData::new();
        ts.time = vec![0.0, 10.0, 20.0, 30.0];
        ts.values = vec![0.0, 100.0, 200.0, 300.0];

        // Test exact points
        assert_eq!(ts.interpolate(0.0), 0.0);
        assert_eq!(ts.interpolate(10.0), 100.0);

        // Test interpolation
        assert_eq!(ts.interpolate(5.0), 50.0);
        assert_eq!(ts.interpolate(15.0), 150.0);

        // Test boundary conditions
        assert_eq!(ts.interpolate(-10.0), 0.0);
        assert_eq!(ts.interpolate(40.0), 300.0);
    }

    #[test]
    fn test_csv_data_loading() -> Result<()> {
        // Create temporary CSV file
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "time,value").unwrap(); // Header
        writeln!(temp_file, "0.0,1000.0").unwrap();
        writeln!(temp_file, "10.0,2000.0").unwrap();
        writeln!(temp_file, "20.0,3000.0").unwrap();
        temp_file.flush().unwrap();

        let data = load_csv_data(temp_file.path())?;
        assert_eq!(data.len(), 3);
        assert_eq!(data[0], (0.0, 1000.0));
        assert_eq!(data[1], (10.0, 2000.0));
        assert_eq!(data[2], (20.0, 3000.0));

        Ok(())
    }

    #[test]
    fn test_attitude_data_loading() -> Result<()> {
        // Create temporary attitude CSV file
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "time,azimuth,elevation").unwrap(); // Header
        writeln!(temp_file, "0.0,0.0,90.0").unwrap();
        writeln!(temp_file, "10.0,45.0,85.0").unwrap();
        writeln!(temp_file, "20.0,90.0,80.0").unwrap();
        temp_file.flush().unwrap();

        let data = load_attitude_data(temp_file.path())?;
        assert_eq!(data.len(), 3);
        assert_eq!(data[0], (0.0, 0.0, 90.0));
        assert_eq!(data[1], (10.0, 45.0, 85.0));
        assert_eq!(data[2], (20.0, 90.0, 80.0));

        Ok(())
    }

    #[test]
    fn test_parse_time_series_from_str() -> Result<()> {
        let csv = "time,value\n0,10\n1,20\n2,30\n";
        let ts = parse_time_series_from_str(csv)?;
        assert_eq!(ts.time.len(), 3);
        assert_eq!(ts.values[1], 20.0);
        Ok(())
    }

    #[test]
    fn test_minimal_legacy_config_uses_defaults() {
        let json = r#"{
            "name(str)": "simple_test",
            "calculate condition": { "end time[s]": 300, "time step for output[s]": 1 },
            "launch": { "position LLH[deg,deg,m]": [35.0, 139.0, 0.0] },
            "stage1": {
                "mass initial[kg]": 1000,
                "thrust": {
                    "const thrust vac[N]": 30000,
                    "burn end time(time of each stage)[s]": 20
                }
            }
        }"#;
        let config: RocketConfig = serde_json::from_str(json).unwrap();
        assert_eq!(validate_config(&config), Ok(()));
        let stage = &config.stages[0];
        assert_eq!(stage.attitude.const_elevation, 90.0);
        assert_eq!(stage.thrust.const_isp_vac, 200.0);
        assert_eq!(config.wind.const_wind, [0.0, 0.0]);
        let trajectory = crate::simulator::Simulator::new(Rocket::new(config))
            .unwrap()
            .run();
        let apogee = trajectory.iter().map(|s| s.altitude).fold(0.0, f64::max);
        assert!(apogee > 1000.0, "apogee {apogee}");
    }

    #[test]
    fn test_air_launch_is_a_warning_not_an_error() {
        let mut config = load_ss520_config();
        config.launch.position_llh[2] = 12_000.0;
        config.launch.velocity_ned = [200.0, 0.0, 0.0];
        assert_eq!(validate_config(&config), Ok(()));
        let warnings = config_warnings(&config);
        assert!(warnings.iter().any(|w| w.contains("空中発射")));
        assert!(warnings.iter().any(|w| w.contains("初期速度")));
    }

    fn load_ss520_config() -> RocketConfig {
        let path =
            Path::new(env!("CARGO_MANIFEST_DIR")).join("examples/SS-520-4/param_SS520-4.json");
        let content = fs::read_to_string(path).expect("read SS-520-4 example");
        serde_json::from_str(&content).expect("parse SS-520-4 example")
    }

    #[test]
    fn test_multistage_relative_times_pass_validation() {
        // SS-520-4: stage 1 separates at 31.7 s (before its 33.0 s burn end) and
        // stage 3 burns from 0.0 s relative to its own start.
        let config = load_ss520_config();
        assert!(config.stages.len() >= 3);
        assert_eq!(validate_config(&config), Ok(()));

        let warnings = config_warnings(&config);
        assert!(
            warnings
                .iter()
                .any(|w| w.starts_with("ステージ1: 分離時刻"))
        );
        assert!(warnings.iter().any(|w| w.starts_with("計算条件: 終了時間")));
    }

    #[test]
    fn test_next_stage_burn_start_is_relative() {
        let mut config = load_ss520_config();
        // Next-stage burn start earlier than the previous stage's separation
        // time is valid because it is measured from that separation.
        config.stages[0].stage.separation_time = 100.0;
        config.stages[0].thrust.burn_end_time = 33.0;
        config.stages[1].thrust.burn_start_time = 5.0;
        assert_eq!(validate_config(&config), Ok(()));
        assert!(
            !config_warnings(&config)
                .iter()
                .any(|w| w.starts_with("ステージ1:"))
        );

        // A negative relative burn start is still rejected.
        config.stages[1].thrust.burn_start_time = -1.0;
        let errors = validate_config(&config).unwrap_err();
        assert!(
            errors
                .iter()
                .any(|e| e.starts_with("ステージ2: 燃焼開始時刻"))
        );

        // So is a negative separation time.
        config.stages[1].thrust.burn_start_time = 0.0;
        config.stages[0].stage.separation_time = -1.0;
        let errors = validate_config(&config).unwrap_err();
        assert!(errors.iter().any(|e| e.starts_with("ステージ1: 分離時刻")));
    }
}
