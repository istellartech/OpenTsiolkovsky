/// Input/Output handling for OpenTsiolkovsky
///
/// Handles JSON configuration files and CSV data files
use crate::rocket::{Rocket, RocketConfig, SurfaceData2D, TimeSeriesData};
use crate::simulator::SimulationState;
use serde_json;
use std::fs;
use std::path::Path;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum IoError {
    #[error("File read error: {0}")]
    FileRead(#[from] std::io::Error),

    #[error("JSON parse error: {0}")]
    JsonParse(#[from] serde_json::Error),

    #[error("CSV parse error: {0}")]
    CsvParse(#[from] csv::Error),
}

pub type Result<T> = std::result::Result<T, IoError>;

/// Load rocket configuration from JSON file
pub fn load_config<P: AsRef<Path>>(path: P) -> Result<RocketConfig> {
    let content = fs::read_to_string(path)?;
    let config = serde_json::from_str(&content)?;
    Ok(config)
}

/// Load CSV data as (time, value) pairs
pub fn load_csv_data<P: AsRef<Path>>(path: P) -> Result<Vec<(f64, f64)>> {
    let mut reader = csv::Reader::from_path(path)?;
    let mut data = Vec::new();

    for result in reader.records() {
        let record = result?;
        if record.len() >= 2 {
            if let (Ok(time), Ok(value)) =
                (record[0].trim().parse::<f64>(), record[1].trim().parse::<f64>())
            {
                data.push((time, value));
            }
        }
    }

    Ok(data)
}

/// Load time-series data from CSV file
pub fn load_time_series<P: AsRef<Path>>(path: P) -> Result<TimeSeriesData> {
    let data = load_csv_data(path)?;
    let mut ts = TimeSeriesData::new();

    for (time, value) in data {
        ts.time.push(time);
        ts.values.push(value);
    }

    Ok(ts)
}

/// Parse time-series CSV from string content
pub fn parse_time_series_from_str(content: &str) -> Result<TimeSeriesData> {
    let mut rdr = csv::ReaderBuilder::new().has_headers(true).from_reader(content.as_bytes());
    let mut ts = TimeSeriesData::new();
    for result in rdr.records() {
        let record = result?;
        if record.len() >= 2 {
            if let (Ok(time), Ok(value)) =
                (record[0].trim().parse::<f64>(), record[1].trim().parse::<f64>())
            {
                ts.time.push(time);
                ts.values.push(value);
            }
        }
    }
    Ok(ts)
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
    idx.sort_by(|&i, &j| x[i].partial_cmp(&x[j]).unwrap());
    let x_sorted: Vec<f64> = idx.iter().map(|&i| x[i]).collect();
    let z_sorted: Vec<Vec<f64>> = idx.iter().map(|&i| z[i].clone()).collect();

    Ok(SurfaceData2D { x: x_sorted, y, z: z_sorted })
}

/// Load attitude data from CSV file (time, azimuth, elevation)
pub fn load_attitude_data<P: AsRef<Path>>(path: P) -> Result<Vec<(f64, f64, f64)>> {
    let mut reader = csv::Reader::from_path(path)?;
    let mut data = Vec::new();

    for result in reader.records() {
        let record = result?;
        if record.len() >= 3 {
            if let (Ok(time), Ok(azimuth), Ok(elevation)) = (
                record[0].trim().parse::<f64>(),
                record[1].trim().parse::<f64>(),
                record[2].trim().parse::<f64>(),
            ) {
                data.push((time, azimuth, elevation));
            }
        }
    }

    Ok(data)
}

/// Parse attitude data CSV from string content (time, azimuth, elevation)
pub fn parse_attitude_from_str(content: &str) -> Result<Vec<(f64, f64, f64)>> {
    let mut reader = csv::ReaderBuilder::new().has_headers(true).from_reader(content.as_bytes());
    let mut data = Vec::new();
    for result in reader.records() {
        let record = result?;
        if record.len() >= 3 {
            if let (Ok(time), Ok(azimuth), Ok(elevation)) = (
                record[0].trim().parse::<f64>(),
                record[1].trim().parse::<f64>(),
                record[2].trim().parse::<f64>(),
            ) {
                data.push((time, azimuth, elevation));
            }
        }
    }
    Ok(data)
}

/// Load wind data from CSV file (altitude, wind_speed, wind_direction)
pub fn load_wind_data<P: AsRef<Path>>(path: P) -> Result<Vec<(f64, f64, f64)>> {
    let mut reader = csv::Reader::from_path(path)?;
    let mut data = Vec::new();

    for result in reader.records() {
        let record = result?;
        if record.len() >= 3 {
            if let (Ok(altitude), Ok(speed), Ok(direction)) = (
                record[0].trim().parse::<f64>(),
                record[1].trim().parse::<f64>(),
                record[2].trim().parse::<f64>(),
            ) {
                data.push((altitude, speed, direction));
            }
        }
    }

    Ok(data)
}

/// Parse wind data CSV from string content (altitude, wind_speed, wind_direction)
pub fn parse_wind_from_str(content: &str) -> Result<Vec<(f64, f64, f64)>> {
    let mut reader = csv::ReaderBuilder::new().has_headers(true).from_reader(content.as_bytes());
    let mut data = Vec::new();
    for result in reader.records() {
        let record = result?;
        if record.len() >= 3 {
            if let (Ok(altitude), Ok(speed), Ok(direction)) = (
                record[0].trim().parse::<f64>(),
                record[1].trim().parse::<f64>(),
                record[2].trim().parse::<f64>(),
            ) {
                data.push((altitude, speed, direction));
            }
        }
    }
    Ok(data)
}

/// Load all CSV data files for a rocket configuration
pub fn load_rocket_data(mut rocket: Rocket, base_path: Option<&Path>) -> Result<Rocket> {
    let base = base_path.unwrap_or_else(|| Path::new("."));

    // Load thrust data if file exists
    if rocket.config.stage1.thrust.thrust_file_exists {
        let thrust_path = base.join(&rocket.config.stage1.thrust.thrust_file_name);
        if thrust_path.exists() {
            rocket.thrust_data = Some(load_time_series(thrust_path)?);
        }
    }

    // Load Isp data if file exists
    if rocket.config.stage1.thrust.isp_file_exists {
        let isp_path = base.join(&rocket.config.stage1.thrust.isp_file_name);
        if isp_path.exists() {
            rocket.isp_data = Some(load_time_series(isp_path)?);
        }
    }

    // Load CN coefficient data if file exists (prefer 2D surface)
    if rocket.config.stage1.aero.cn_file_exists {
        let cn_path = base.join(&rocket.config.stage1.aero.cn_file_name);
        if cn_path.exists() {
            match load_cn_surface(&cn_path) {
                Ok(s) => rocket.cn_surface = Some(s),
                Err(_) => {
                    // Fallback to 1D timeseries if parsing as surface fails
                    rocket.cn_data = Some(load_time_series(cn_path)?);
                }
            }
        }
    }

    // Load CA coefficient data if file exists
    if rocket.config.stage1.aero.ca_file_exists {
        let ca_path = base.join(&rocket.config.stage1.aero.ca_file_name);
        if ca_path.exists() {
            rocket.ca_data = Some(load_time_series(ca_path)?);
        }
    }

    // Load attitude data if file exists
    if rocket.config.stage1.attitude.attitude_file_exists {
        let attitude_path = base.join(&rocket.config.stage1.attitude.attitude_file_name);
        if attitude_path.exists() {
            rocket.attitude_data = Some(load_attitude_data(attitude_path)?);
        }
    }

    // Load wind data if file exists
    if rocket.config.wind.wind_file_exists {
        let wind_path = base.join(&rocket.config.wind.wind_file_name);
        if wind_path.exists() {
            rocket.wind_data = Some(load_wind_data(wind_path)?);
        }
    }

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

    let max_altitude_state =
        trajectory.iter().max_by(|a, b| a.altitude.partial_cmp(&b.altitude).unwrap()).unwrap();
    let max_velocity_state = trajectory
        .iter()
        .max_by(|a, b| a.velocity_magnitude.partial_cmp(&b.velocity_magnitude).unwrap())
        .unwrap();
    let max_mach_state = trajectory
        .iter()
        .max_by(|a, b| a.mach_number.partial_cmp(&b.mach_number).unwrap())
        .unwrap();

    let summary = serde_json::json!({
        "rocket_name": config.name,
        "simulation_end_time": trajectory.last().unwrap().time,
        "max_altitude_m": max_altitude_state.altitude,
        "max_altitude_time_s": max_altitude_state.time,
        "max_velocity_ms": max_velocity_state.velocity_magnitude,
        "max_velocity_time_s": max_velocity_state.time,
        "max_mach_number": max_mach_state.mach_number,
        "max_mach_time_s": max_mach_state.time,
        "final_position_eci_m": [
            trajectory.last().unwrap().position.x,
            trajectory.last().unwrap().position.y,
            trajectory.last().unwrap().position.z
        ],
        "final_velocity_eci_ms": [
            trajectory.last().unwrap().velocity.x,
            trajectory.last().unwrap().velocity.y,
            trajectory.last().unwrap().velocity.z
        ],
        "final_mass_kg": trajectory.last().unwrap().mass,
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
