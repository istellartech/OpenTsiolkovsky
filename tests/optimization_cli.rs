#![cfg(all(feature = "cli", feature = "optimization"))]

use serde_json::Value;
use std::process::Command;

fn command() -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_openTsiolkovsky-optimize"));
    command.current_dir(env!("CARGO_MANIFEST_DIR"));
    command
}

#[test]
fn independent_schema_and_input_check_use_documented_exit_codes() {
    let schema = command().arg("--schema").output().unwrap();
    assert!(schema.status.success());
    let json: Value = serde_json::from_slice(&schema.stdout).unwrap();
    assert_eq!(json["title"], "OptimizationRequest");
    let ready = command()
        .args([
            "--check",
            "--config",
            "examples/optimization/two_stage_80t_500km_43deg.json",
        ])
        .output()
        .unwrap();
    assert_eq!(ready.status.code(), Some(0));
    let mut request: Value = serde_json::from_str(include_str!(
        "../examples/optimization/two_stage_80t_500km_43deg.json"
    ))
    .unwrap();
    request["problem"]["stages"][0]["dry_kg"] = 1.into();
    let file = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(file.path(), serde_json::to_vec(&request).unwrap()).unwrap();
    let check = command()
        .arg("--check")
        .arg("--config")
        .arg(file.path())
        .output()
        .unwrap();
    assert_eq!(check.status.code(), Some(3));
    let json: Value = serde_json::from_slice(&check.stdout).unwrap();
    assert_eq!(json["ready"], false);
    assert!(!json["issues"].as_array().unwrap().is_empty());
}

#[test]
fn solver_limit_preserves_diagnostic_json_and_is_a_failure() {
    let mut request: Value =
        serde_json::from_str(include_str!("../examples/optimization/hs071.json")).unwrap();
    request["solver"]["max_iterations"] = 1.into();
    let file = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(file.path(), serde_json::to_vec(&request).unwrap()).unwrap();
    let output = command().arg("--config").arg(file.path()).output().unwrap();
    assert_eq!(output.status.code(), Some(1));
    let json: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(json["solver_status"], "Maximum_Iterations_Exceeded");
    assert_eq!(json["converged"], false);
    assert_eq!(json["solution"]["z_lower"].as_array().unwrap().len(), 4);
}

#[test]
fn converged_rocket_with_failed_reintegration_saves_diagnostics_and_exits_one() {
    let output_file = tempfile::NamedTempFile::new().unwrap();
    let output = command()
        .args([
            "--config",
            "examples/optimization/single_stage_100km_coarse.json",
            "--output",
        ])
        .arg(output_file.path())
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(1));
    let json: Value = serde_json::from_slice(&std::fs::read(output_file.path()).unwrap()).unwrap();
    assert_eq!(json["converged"], true);
    assert_eq!(json["validation"]["status"], "failed");
    assert!(
        json["validation"]["flight"]["max_position_error_m"]
            .as_f64()
            .unwrap()
            > 5.0
    );
}
