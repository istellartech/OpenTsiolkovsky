#![allow(non_snake_case)]
pub mod io;
pub mod math;
pub mod physics;
pub mod rocket;
pub mod simulator;

#[cfg(feature = "wasm")]
pub mod wasm;

// Re-exports
pub use rocket::{ClientConfig, Rocket, RocketConfig};
pub use simulator::{SimulationState, Simulator};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[cfg(test)]
mod tests;
