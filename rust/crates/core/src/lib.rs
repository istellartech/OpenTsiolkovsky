#![allow(non_snake_case)]
pub mod io;
pub mod math;
pub mod physics;
pub mod rocket;
pub mod simulator;

pub use rocket::{ClientConfig, Rocket, RocketConfig};
pub use simulator::Simulator;

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;
