#![allow(non_snake_case)]
pub mod io;
pub mod math;
pub mod montecarlo;
pub mod physics;
pub mod rocket;
pub mod simulator;

// Native only: file access, threads and stdio (the web app uses `wasm`)
#[cfg(all(feature = "cli", not(target_arch = "wasm32")))]
pub mod agent;
#[cfg(all(feature = "cli", not(target_arch = "wasm32")))]
pub mod mcp;
#[cfg(feature = "wasm")]
pub mod wasm;

// Re-exports
pub use rocket::{ClientConfig, Rocket, RocketConfig};
pub use simulator::{SimulationState, Simulator};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[cfg(test)]
mod tests;
