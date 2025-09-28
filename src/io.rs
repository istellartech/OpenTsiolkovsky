/// Input/Output handling for OpenTsiolkovsky
///
/// Handles JSON configuration files and CSV data files
use crate::rocket::{Rocket, RocketConfig, SurfaceData2D, TimeSeriesData};
use crate::simulator::SimulationState;
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
    let content = fs::read_to_string(path)?;
    let config: RocketConfig = serde_json::from_str(&content)?;

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

fn validate_calculate_condition(calc: &crate::rocket::CalculateCondition, errors: &mut Vec<String>) {
    // Validate end time
    if !calc.end_time.is_finite() || calc.end_time <= 0.0 {
        errors.push(format!(
            "計算条件: 終了時間 '{:.3}秒' は正の有限値である必要があります",
            calc.end_time
        ));
    } else if calc.end_time > 3600.0 {
        errors.push(format!(
            "計算条件: 終了時間 '{:.1}秒' は通常1時間(3600秒)を超えません - 意図的ですか？",
            calc.end_time
        ));
    }

    // Validate time step
    if !calc.time_step.is_finite() || calc.time_step <= 0.0 {
        errors.push(format!(
            "計算条件: 出力時間刻み '{:.6}秒' は正の有限値である必要があります",
            calc.time_step
        ));
    } else if calc.time_step > calc.end_time / 10.0 {
        errors.push(format!(
            "計算条件: 出力時間刻み '{:.3}秒' が終了時間 '{:.1}秒' に対して大きすぎます (推奨: <{:.3}秒)",
            calc.time_step, calc.end_time, calc.end_time / 100.0
        ));
    } else if calc.time_step < 0.001 {
        errors.push(format!(
            "計算条件: 出力時間刻み '{:.6}秒' が小さすぎて大量の出力データが生成される可能性があります",
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
            if let Some(step) = calc.integrator.rk4_step {
                if !step.is_finite() || step <= 0.0 {
                    errors.push(format!(
                        "積分器設定: RK4ステップサイズ '{:.6}秒' は正の有限値である必要があります",
                        step
                    ));
                } else if step > 1.0 {
                    errors.push(format!(
                        "積分器設定: RK4ステップサイズ '{:.3}秒' が大きすぎます (推奨: <1.0秒)",
                        step
                    ));
                } else if step < 1e-6 {
                    errors.push(format!(
                        "積分器設定: RK4ステップサイズ '{:.6}秒' が小さすぎて計算時間が過大になる可能性があります",
                        step
                    ));
                }
            }
        },
        crate::rocket::IntegratorMethod::Rk45 => {
            // RK45 doesn't have explicit tolerance settings in this implementation
            // The adaptive algorithm handles tolerance internally
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
        errors.push(format!(
            "打ち上げ条件: 高度 '{:.1}m' が海面下すぎます",
            alt
        ));
    } else if alt > 10000.0 {
        errors.push(format!(
            "打ち上げ条件: 高度 '{:.1}m' が高すぎます (通常の発射台は10km未満)",
            alt
        ));
    }

    // Validate velocity NED
    let [vn, ve, vd] = launch.velocity_ned;
    let velocity_mag = (vn*vn + ve*ve + vd*vd).sqrt();

    if !vn.is_finite() || !ve.is_finite() || !vd.is_finite() {
        errors.push("打ち上げ条件: 初期速度成分は有限値である必要があります".to_string());
    } else if velocity_mag > 100.0 {
        errors.push(format!(
            "打ち上げ条件: 初期速度 '{:.1}m/s' が大きすぎます (通常は地面からの静止状態)",
            velocity_mag
        ));
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

    if stages.len() > 10 {
        errors.push(format!(
            "ステージ設定: ステージ数 '{}個' が多すぎます (通常は1-4個)",
            stages.len()
        ));
    }

    for (i, stage) in stages.iter().enumerate() {
        let stage_num = i + 1;
        validate_single_stage(stage, stage_num, errors);
    }

    // Validate stage separation timing
    validate_stage_separation_timing(stages, errors);
}

fn validate_single_stage(stage: &crate::rocket::StageConfig, stage_num: usize, errors: &mut Vec<String>) {
    // Validate mass
    if !stage.mass_initial.is_finite() || stage.mass_initial <= 0.0 {
        errors.push(format!(
            "ステージ{}: 初期質量 '{:.1}kg' は正の有限値である必要があります",
            stage_num, stage.mass_initial
        ));
    } else if stage.mass_initial > 1000000.0 {
        errors.push(format!(
            "ステージ{}: 初期質量 '{:.0}kg' が大きすぎます (通常は100万kg未満)",
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

    if stage.thrust.burn_end_time <= stage.thrust.burn_start_time {
        errors.push(format!(
            "ステージ{}: 燃焼終了時刻 '{:.3}秒' は燃焼開始時刻 '{:.3}秒' より後である必要があります",
            stage_num, stage.thrust.burn_end_time, stage.thrust.burn_start_time
        ));
    }

    // Validate thrust magnitude
    if !stage.thrust.const_thrust_vac.is_finite() || stage.thrust.const_thrust_vac < 0.0 {
        errors.push(format!(
            "ステージ{}: 真空推力 '{:.1}N' は非負の有限値である必要があります",
            stage_num, stage.thrust.const_thrust_vac
        ));
    } else if stage.thrust.const_thrust_vac > 50000000.0 {
        errors.push(format!(
            "ステージ{}: 真空推力 '{:.0}N' が大きすぎます (通常は50MN未満)",
            stage_num, stage.thrust.const_thrust_vac
        ));
    }

    // Validate ISP
    if !stage.thrust.const_isp_vac.is_finite() || stage.thrust.const_isp_vac <= 0.0 {
        errors.push(format!(
            "ステージ{}: 真空比推力 '{:.1}秒' は正の有限値である必要があります",
            stage_num, stage.thrust.const_isp_vac
        ));
    } else if stage.thrust.const_isp_vac > 500.0 {
        errors.push(format!(
            "ステージ{}: 真空比推力 '{:.1}秒' が高すぎます (通常は500秒未満)",
            stage_num, stage.thrust.const_isp_vac
        ));
    } else if stage.thrust.const_isp_vac < 100.0 {
        errors.push(format!(
            "ステージ{}: 真空比推力 '{:.1}秒' が低すぎます (通常は100秒以上)",
            stage_num, stage.thrust.const_isp_vac
        ));
    }

    // Validate engine geometry
    if !stage.thrust.throat_diameter.is_finite() || stage.thrust.throat_diameter <= 0.0 {
        errors.push(format!(
            "ステージ{}: スロート直径 '{:.4}m' は正の有限値である必要があります",
            stage_num, stage.thrust.throat_diameter
        ));
    }

    if !stage.thrust.nozzle_expansion_ratio.is_finite() || stage.thrust.nozzle_expansion_ratio < 1.0 {
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
    } else if stage.aero.body_diameter > 50.0 {
        errors.push(format!(
            "ステージ{}: 機体直径 '{:.1}m' が大きすぎます (通常は50m未満)",
            stage_num, stage.aero.body_diameter
        ));
    }
}

fn validate_stage_separation_timing(stages: &[crate::rocket::StageConfig], errors: &mut Vec<String>) {
    for i in 0..stages.len() - 1 {
        let current_stage = &stages[i];
        let next_stage = &stages[i + 1];

        // Check if separation time is reasonable
        if current_stage.stage.following_stage_exists {
            if current_stage.stage.separation_time <= current_stage.thrust.burn_end_time {
                errors.push(format!(
                    "ステージ{}: 分離時刻 '{:.3}秒' は燃焼終了時刻 '{:.3}秒' より後である必要があります",
                    i + 1, current_stage.stage.separation_time, current_stage.thrust.burn_end_time
                ));
            }

            if next_stage.thrust.burn_start_time < current_stage.stage.separation_time {
                errors.push(format!(
                    "ステージ{}: 次段燃焼開始時刻 '{:.3}秒' は前段分離時刻 '{:.3}秒' より後である必要があります",
                    i + 2, next_stage.thrust.burn_start_time, current_stage.stage.separation_time
                ));
            }
        }
    }
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

    let attitude = &primary_stage.attitude;
    rocket.attitude_data = maybe_load(
        base,
        attitude.attitude_file_exists,
        &attitude.attitude_file_name,
        |p| load_attitude_data(p),
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
    ])?;

    // Write data
    for state in trajectory {
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
        ])?;
    }

    wtr.flush()?;
    Ok(())
}

/// Save simulation summary to JSON file
pub fn save_summary_json<P: AsRef<Path>>(
    trajectory: &[SimulationState],
    config: &RocketConfig,
    output_path: P,
) -> Result<()> {
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

    let summary = serde_json::json!({
        "rocket_name": config.name,
        "simulation_end_time": final_state.time,
        "max_altitude_m": max_altitude_state.altitude,
        "max_altitude_time_s": max_altitude_state.time,
        "max_velocity_ms": max_velocity_state.velocity_magnitude,
        "max_velocity_time_s": max_velocity_state.time,
        "max_mach_number": max_mach_state.mach_number,
        "max_mach_time_s": max_mach_state.time,
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
        "simulation_points": trajectory.len()
    });

    let json_string = serde_json::to_string_pretty(&summary)?;
    std::fs::write(output_path, json_string)?;

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
}
