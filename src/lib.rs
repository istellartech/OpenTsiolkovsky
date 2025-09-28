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

/// Configuration validation error
#[derive(Debug)]
pub struct ConfigValidationError {
    pub errors: Vec<String>,
}

impl std::fmt::Display for ConfigValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "設定検証エラー:\n{}", self.errors.join("\n"))
    }
}

impl std::error::Error for ConfigValidationError {}

#[cfg(test)]
mod tests;
