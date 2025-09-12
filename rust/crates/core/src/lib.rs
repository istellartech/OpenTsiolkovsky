pub mod math;
pub mod physics;
pub mod rocket;
pub mod io;
pub mod simulator;

pub use simulator::Simulator;
pub use rocket::{Rocket, RocketConfig};

pub type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;