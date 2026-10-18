//! WebAssembly interface of the web app
//!
//! Every function takes and returns JSON text. Configurations carry their
//! tables inline (no file access in the browser).

use crate::config::{Config, MemorySource, NoFiles, convert_legacy};
use crate::montecarlo::{CaseResult, Dispersion, impact_statistics, run_case};
use crate::output::Summary;
use crate::sim::simulate;
use crate::vehicle::Vehicle;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

fn to_json(value: &impl Serialize) -> Result<String, JsError> {
    serde_json::to_string(value).map_err(|e| JsError::new(&format!("serialize: {e}")))
}

/// Vehicle of a configuration; errors list every invalid value
fn load(config_json: &str) -> Result<(Vehicle, Vec<crate::config::Issue>), JsError> {
    let config =
        Config::from_json(config_json).map_err(|e| JsError::new(&format!("configuration: {e}")))?;
    Vehicle::load(&config, &NoFiles).map_err(|report| {
        let lines: Vec<String> = report.errors.iter().map(|e| e.to_string()).collect();
        JsError::new(&format!("invalid configuration:\n{}", lines.join("\n")))
    })
}

/// Fly the vehicle and its released bodies. Returns
/// `{ trajectory: Sample[], events: FlightEvent[], bodies: Body[], summary, warnings }`
#[wasm_bindgen]
pub fn simulate_json(config_json: &str) -> Result<String, JsError> {
    let (vehicle, warnings) = load(config_json)?;
    let flight = simulate(&vehicle);
    let summary = Summary::new(&vehicle, &flight);
    to_json(&json!({
        "trajectory": flight.trajectory,
        "events": flight.events,
        "bodies": flight.bodies,
        "summary": summary,
        "warnings": warnings,
    }))
}

/// Check a configuration: `{ valid, errors: Issue[], warnings: Issue[] }`
#[wasm_bindgen]
pub fn validate_json(config_json: &str) -> String {
    let result = match Config::from_json(config_json) {
        Err(e) => json!({
            "valid": false,
            "errors": [{ "path": "", "message": e.to_string() }],
            "warnings": [],
        }),
        Ok(config) => match Vehicle::load(&config, &NoFiles) {
            Ok((_, warnings)) => json!({ "valid": true, "errors": [], "warnings": warnings }),
            Err(report) => json!({
                "valid": false,
                "errors": report.errors,
                "warnings": report.warnings,
            }),
        },
    };
    result.to_string()
}

/// Convert a legacy C++ parameter file; `files_json` maps CSV file names
/// to their contents. Returns `{ config, warnings: string[] }`
#[wasm_bindgen]
pub fn convert_legacy_json(legacy_json: &str, files_json: &str) -> Result<String, JsError> {
    let files: HashMap<String, String> = if files_json.trim().is_empty() {
        HashMap::new()
    } else {
        serde_json::from_str(files_json).map_err(|e| JsError::new(&format!("files: {e}")))?
    };
    let c = convert_legacy(legacy_json, &MemorySource(files)).map_err(|e| JsError::new(&e))?;
    to_json(&json!({ "config": c.config, "warnings": c.warnings }))
}

/// Default 1-sigma dispersions
#[wasm_bindgen]
pub fn default_dispersion_json() -> String {
    serde_json::to_string(&Dispersion::default()).unwrap_or_default()
}

/// Fly Monte Carlo case `index` (perturbation drawn from `seed` and
/// `index`); returns a `CaseResult`
#[wasm_bindgen]
pub fn monte_carlo_case_json(
    config_json: &str,
    dispersion_json: &str,
    seed: u32,
    index: u32,
) -> Result<String, JsError> {
    let (vehicle, _) = load(config_json)?;
    let dispersion: Dispersion = serde_json::from_str(dispersion_json)
        .map_err(|e| JsError::new(&format!("dispersion: {e}")))?;
    to_json(&run_case(&vehicle, &dispersion, u64::from(seed), index))
}

/// Per-body impact statistics of a JSON array of `CaseResult`
#[wasm_bindgen]
pub fn monte_carlo_statistics_json(cases_json: &str) -> Result<String, JsError> {
    let cases: Vec<CaseResult> =
        serde_json::from_str(cases_json).map_err(|e| JsError::new(&format!("cases: {e}")))?;
    to_json(&impact_statistics(&cases))
}

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
