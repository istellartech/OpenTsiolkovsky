//! Regression against the legacy C++ simulator.
//!
//! `tests/cpp_reference/*_cpp.csv` are every-10-second samples of the C++
//! simulator (`legacy_cpp`, v0.52) run on the legacy parameter file next to
//! them. Each file is converted (`convert_legacy`) and flown. The cases use
//! a zero constant CN, because the C++ code applies a constant CN as a
//! fixed side force regardless of the angle of attack, or a CN table:
//! - `sample_01_cn0`: single stage, constant thrust, ballistic coast
//! - `momo_offsets_wind`: attitude misalignment offsets, gyro bias drift,
//!   a wind profile crossing north and an air density deviation table
//! - `momo_trim`: CN/CP tables, CG/gimbal file and thrust trim with wind
//!
//! To regenerate: run `legacy_cpp/bin/OpenTsiolkovsky <name>.json` in that
//! directory and keep the rows at multiples of 10 s of the listed columns.

use openTsiolkovsky::config::{DirSource, convert_legacy};
use openTsiolkovsky::{Vehicle, simulate};
use std::path::PathBuf;

struct Reference {
    header: Vec<String>,
    rows: Vec<Vec<f64>>,
}

fn reference(name: &str) -> Reference {
    let text = std::fs::read_to_string(dir().join(format!("{name}_cpp.csv"))).unwrap();
    let mut lines = text.lines();
    let header = lines
        .next()
        .unwrap()
        .split(',')
        .map(str::to_string)
        .collect();
    let rows = lines
        .map(|l| l.split(',').map(|v| v.trim().parse().unwrap()).collect())
        .collect();
    Reference { header, rows }
}

fn dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/cpp_reference")
}

/// Largest differences [mass kg, lat deg, lon deg, alt m, vel m/s, gimbal deg]
fn compare(name: &str) -> [f64; 6] {
    let text = std::fs::read_to_string(dir().join(format!("{name}.json"))).unwrap();
    let source = DirSource(dir());
    let converted = convert_legacy(&text, &source).expect("convert");
    assert!(converted.warnings.is_empty(), "{:?}", converted.warnings);
    let (vehicle, _) = Vehicle::load(&converted.config, &source).expect("valid");
    let flight = simulate(&vehicle);
    let reference = reference(name);
    let col = |k: &str| reference.header.iter().position(|h| h == k).unwrap();
    let mut worst = [0.0f64; 6];
    let mut matched = 0;
    for row in &reference.rows {
        let t = row[col("time(s)")];
        let Some(s) = flight
            .trajectory
            .iter()
            .find(|s| (s.time_s - t).abs() < 1e-9)
        else {
            continue;
        };
        matched += 1;
        let diffs = [
            (s.mass_kg - row[col("mass(kg)")]).abs(),
            (s.latitude_deg - row[col("lat(deg)")]).abs(),
            (s.longitude_deg - row[col("lon(deg)")]).abs(),
            (s.altitude_m - row[col("altitude(m)")]).abs(),
            (s.vel_north_mps - row[col("vel_NED_X(m/s)")])
                .abs()
                .max((s.vel_east_mps - row[col("vel_NED_Y(m/s)")]).abs())
                .max((s.vel_down_mps - row[col("vel_NED_Z(m/s)")]).abs()),
            // The C++ code keeps the last trim angles after burnout
            if s.thrust_n > 0.0 {
                (s.gimbal_pitch_deg - row[col("gimbal_angle_pitch(deg)")])
                    .abs()
                    .max((s.gimbal_yaw_deg - row[col("gimbal_angle_yaw(deg)")]).abs())
            } else {
                0.0
            },
        ];
        for (w, d) in worst.iter_mut().zip(diffs) {
            *w = w.max(d);
        }
    }
    assert_eq!(matched, reference.rows.len(), "{name}: samples not found");
    worst
}

fn assert_close(name: &str, worst: [f64; 6]) {
    let limits = [1e-3, 1e-4, 1e-4, 10.0, 0.5, 5e-3];
    let labels = ["mass", "lat", "lon", "altitude", "velocity", "gimbal"];
    for ((w, l), label) in worst.iter().zip(limits).zip(labels) {
        assert!(*w <= l, "{name}: {label} differs by {w} (limit {l})");
    }
}

#[test]
fn single_stage_matches_cpp() {
    assert_close("sample_01_cn0", compare("sample_01_cn0"));
}

#[test]
fn attitude_offsets_wind_and_density_table_match_cpp() {
    assert_close("momo_offsets_wind", compare("momo_offsets_wind"));
}

#[test]
fn thrust_trim_matches_cpp() {
    assert_close("momo_trim", compare("momo_trim"));
}
