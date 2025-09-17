#![allow(non_snake_case)]
use axum::{
    extract::State,
    http::{self, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use std::io::ErrorKind;
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};

use core::{
    rocket::ClientConfig,
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
    Json(config): Json<ClientConfig>,
) -> impl IntoResponse {
    // Build Rocket from unified client config (CSV等の外部ファイルは不要)
    let rocket = config.into_rocket();
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
