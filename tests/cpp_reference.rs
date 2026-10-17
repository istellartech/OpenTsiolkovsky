//! Regression against the legacy C++ simulator.
//!
//! `tests/cpp_reference/*_cpp.csv` are every-10-second samples of the C++
//! simulator (`legacy_cpp`, v0.52) run on the JSON next to them. The cases
//! use a zero constant CN, because the C++ code applies a constant CN as a
//! fixed side force regardless of the angle of attack, or a CN table:
//! - `sample_01_cn0`: single stage, constant thrust, ballistic coast
//! - `momo_offsets_wind`: attitude misalignment offsets, gyro bias drift,
//!   a wind profile crossing north and an air density variation table
//! - `momo_trim`: CN/CP tables, CG/controller file and thrust trim
//!   ("attitude neutrality") with wind
//!
//! To regenerate: run `legacy_cpp/bin/OpenTsiolkovsky <name>.json` in that
//! directory and keep the rows at multiples of 10 s of the listed columns.

use openTsiolkovsky::io::create_rocket_from_config;
use openTsiolkovsky::simulator::Simulator;
use std::path::PathBuf;

struct Reference {
    header: Vec<String>,
    rows: Vec<Vec<f64>>,
}

fn reference(name: &str) -> Reference {
    let path = dir().join(format!("{name}_cpp.csv"));
    let text = std::fs::read_to_string(&path).expect("reference CSV");
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
    let rocket = create_rocket_from_config(dir().join(format!("{name}.json"))).expect("config");
    let mut sim = Simulator::new(rocket).unwrap();
    sim.run();
    let reference = reference(name);
    let col = |k: &str| reference.header.iter().position(|h| h == k).unwrap();
    let mut worst = [0.0f64; 6];
    let mut matched = 0;
    for row in &reference.rows {
        let t = row[col("time(s)")];
        let Some(r) = sim.telemetry_cpp.iter().find(|r| (r.time - t).abs() < 1e-9) else {
            continue;
        };
        matched += 1;
        let diffs = [
            (r.mass - row[col("mass(kg)")]).abs(),
            (r.lat_deg - row[col("lat(deg)")]).abs(),
            (r.lon_deg - row[col("lon(deg)")]).abs(),
            (r.alt_m - row[col("altitude(m)")]).abs(),
            (r.vel_ned.x - row[col("vel_NED_X(m/s)")])
                .abs()
                .max((r.vel_ned.y - row[col("vel_NED_Y(m/s)")]).abs())
                .max((r.vel_ned.z - row[col("vel_NED_Z(m/s)")]).abs()),
            // The C++ code keeps the last trim angles after burnout
            if r.is_powered == 1 {
                (r.gimbal_pitch_deg - row[col("gimbal_angle_pitch(deg)")])
                    .abs()
                    .max((r.gimbal_yaw_deg - row[col("gimbal_angle_yaw(deg)")]).abs())
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
