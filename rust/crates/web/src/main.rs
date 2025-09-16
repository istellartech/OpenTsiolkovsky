#![allow(non_snake_case)]
use axum::{
    extract::{Multipart, State},
    http::{self, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use std::fs;
use std::io::ErrorKind;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::cors::{Any, CorsLayer};

use core::io as core_io;
use core::{
    rocket::{Rocket, RocketConfig},
    simulator::{SimulationState, Simulator},
};
use openTsiolkovsky_core as core;

#[derive(Clone, Default)]
struct AppState;

#[tokio::main]
async fn main() {
    // CORS (allow all for dev)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
        .expose_headers([http::header::CONTENT_TYPE]);

    let app = Router::new()
        .route("/", get(|| async { "OpenTsiolkovsky Web API" }))
        .route("/healthz", get(|| async { "ok" }))
        .route("/api/simulation", post(run_simulation))
        .route("/api/simulation/path", post(run_simulation_from_path))
        .route("/api/upload", post(run_simulation_upload))
        .with_state(AppState)
        .layer(cors);

    let start_port: u16 =
        std::env::var("OT_WEB_PORT").ok().and_then(|s| s.parse().ok()).unwrap_or(3001);
    let listener = bind_with_autofallback(start_port).await;
    let local = listener
        .local_addr()
        .unwrap_or_else(|_| format!("0.0.0.0:{}", start_port).parse().unwrap());
    println!("OpenTsiolkovsky Web API listening on http://{}", local);
    axum::serve(listener, app).await.expect("server error");
}

async fn bind_with_autofallback(start_port: u16) -> tokio::net::TcpListener {
    // Try up to 20 consecutive ports starting from start_port.
    // As a last resort, fall back to port 0 (OS-assigned ephemeral port).
    let host = "0.0.0.0";
    for offset in 0u16..20u16 {
        let port = start_port.saturating_add(offset);
        let addr: SocketAddr = format!("{}:{}", host, port).parse().unwrap();
        match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => {
                if offset > 0 {
                    eprintln!("[info] Port {} in use. Falling back to {}", start_port, port);
                }
                return l;
            }
            Err(e) if e.kind() == ErrorKind::AddrInUse => {
                continue;
            }
            Err(e) => {
                eprintln!("[warn] Failed to bind {}:{}: {}", host, port, e);
                continue;
            }
        }
    }
    // Last resort: OS picks a free port
    let addr0: SocketAddr = format!("{}:{}", host, 0).parse().unwrap();
    tokio::net::TcpListener::bind(addr0).await.expect("failed to bind to any port")
}

async fn run_simulation(
    State(_state): State<AppState>,
    Json(config): Json<RocketConfig>,
) -> impl IntoResponse {
    // Build Rocket directly from JSON config (CSV等の外部ファイルは省略)
    let rocket = Rocket::new(config);
    let mut sim = match Simulator::new(rocket) {
        Ok(s) => s,
        Err(e) => {
            let body = Json(json!({
                "error": "Failed to create simulator",
                "detail": e.to_string(),
            }));
            return (StatusCode::BAD_REQUEST, body).into_response();
        }
    };

    let traj: Vec<SimulationState> = sim.run();
    (StatusCode::OK, Json(traj)).into_response()
}

#[derive(serde::Deserialize)]
struct PathPayload {
    config_path: String,
}

fn resolve_config_path(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("config_path must not be empty".to_string());
    }

    let candidate = PathBuf::from(trimmed);
    if candidate.is_absolute() {
        return if candidate.exists() {
            Ok(fs::canonicalize(&candidate).unwrap_or(candidate))
        } else {
            Err(format!("Config file not found: {}", candidate.display()))
        };
    }

    if candidate.exists() {
        return Ok(fs::canonicalize(&candidate).unwrap_or(candidate));
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for ancestor in manifest_dir.ancestors().skip(1) {
        let joined = ancestor.join(&candidate);
        if joined.exists() {
            return Ok(fs::canonicalize(&joined).unwrap_or(joined));
        }
    }

    Err(format!("Config file not found: {} (searched relative to workspace roots)", trimmed))
}

async fn run_simulation_from_path(
    State(_state): State<AppState>,
    Json(payload): Json<PathPayload>,
) -> impl IntoResponse {
    let resolved_path = match resolve_config_path(&payload.config_path) {
        Ok(p) => p,
        Err(e) => {
            let body = Json(json!({
                "error": "Failed to resolve config path",
                "detail": e,
            }));
            return (StatusCode::BAD_REQUEST, body).into_response();
        }
    };

    let rocket = match core_io::create_rocket_from_config(&resolved_path) {
        Ok(r) => r,
        Err(e) => {
            let body = Json(json!({
                "error": "Failed to load config",
                "detail": e.to_string(),
            }));
            return (StatusCode::BAD_REQUEST, body).into_response();
        }
    };
    let mut sim = match Simulator::new(rocket) {
        Ok(s) => s,
        Err(e) => {
            let body = Json(json!({
                "error": "Failed to create simulator",
                "detail": e.to_string(),
            }));
            return (StatusCode::BAD_REQUEST, body).into_response();
        }
    };
    let traj = sim.run();
    (StatusCode::OK, Json(traj)).into_response()
}

/// Multipart upload endpoint
/// Expected parts (text/csv or application/json):
/// - config: JSON (RocketConfig)
/// - thrust, isp, cn, ca, attitude, wind: optional CSVs
async fn run_simulation_upload(
    State(_state): State<AppState>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    use std::collections::HashMap;
    let mut parts: HashMap<String, Vec<u8>> = HashMap::new();

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        let data = match field.bytes().await {
            Ok(b) => b.to_vec(),
            Err(e) => {
                let body = Json(
                    json!({"error":"Failed to read field","field": name, "detail": e.to_string()}),
                );
                return (StatusCode::BAD_REQUEST, body).into_response();
            }
        };
        if !name.is_empty() {
            parts.insert(name, data);
        }
    }

    let config_bytes = match parts.remove("config") {
        Some(b) => b,
        None => {
            let body = Json(json!({"error":"Missing 'config' part"}));
            return (StatusCode::BAD_REQUEST, body).into_response();
        }
    };
    let config: RocketConfig = match serde_json::from_slice(&config_bytes) {
        Ok(c) => c,
        Err(e) => {
            let body = Json(json!({"error":"Invalid config JSON","detail": e.to_string()}));
            return (StatusCode::BAD_REQUEST, body).into_response();
        }
    };

    // Build rocket and inject uploaded CSV datasets if provided
    let mut rocket = Rocket::new(config);
    if let Some(csv) = parts.get("thrust") {
        if let Ok(ts) = core_io::parse_time_series_from_str(std::str::from_utf8(csv).unwrap_or(""))
        {
            rocket.thrust_data = Some(ts);
        }
    }
    if let Some(csv) = parts.get("isp") {
        if let Ok(ts) = core_io::parse_time_series_from_str(std::str::from_utf8(csv).unwrap_or(""))
        {
            rocket.isp_data = Some(ts);
        }
    }
    if let Some(csv) = parts.get("cn") {
        let s = std::str::from_utf8(csv).unwrap_or("");
        if let Ok(surf) = core_io::parse_cn_surface_from_str(s) {
            rocket.cn_surface = Some(surf);
        } else if let Ok(ts) = core_io::parse_time_series_from_str(s) {
            rocket.cn_data = Some(ts);
        }
    }
    if let Some(csv) = parts.get("ca") {
        if let Ok(ts) = core_io::parse_time_series_from_str(std::str::from_utf8(csv).unwrap_or(""))
        {
            rocket.ca_data = Some(ts);
        }
    }
    if let Some(csv) = parts.get("attitude") {
        if let Ok(v) = core_io::parse_attitude_from_str(std::str::from_utf8(csv).unwrap_or("")) {
            rocket.attitude_data = Some(v);
        }
    }
    if let Some(csv) = parts.get("wind") {
        if let Ok(v) = core_io::parse_wind_from_str(std::str::from_utf8(csv).unwrap_or("")) {
            rocket.wind_data = Some(v);
        }
    }

    let mut sim = match Simulator::new(rocket) {
        Ok(s) => s,
        Err(e) => {
            let body = Json(json!({
                "error": "Failed to create simulator",
                "detail": e.to_string(),
            }));
            return (StatusCode::BAD_REQUEST, body).into_response();
        }
    };
    let traj = sim.run();
    (StatusCode::OK, Json(traj)).into_response()
}
