//! OpenTsiolkovsky: a 3-DoF multi-stage rocket flight simulator
//!
//! [`Config`] (JSON) -> [`Vehicle`] (tables loaded) -> [`simulate`] ->
//! [`Flight`] (samples, events, released bodies) -> [`output`] files.
#![allow(non_snake_case)]
pub mod config;
pub mod math;
pub mod montecarlo;
pub mod output;
pub mod physics;
pub mod sim;
pub mod vehicle;

// Native only: file access, threads and stdio (the web app uses `wasm`)
#[cfg(all(feature = "cli", not(target_arch = "wasm32")))]
pub mod agent;
#[cfg(all(feature = "cli", not(target_arch = "wasm32")))]
pub mod mcp;
#[cfg(feature = "wasm")]
pub mod wasm;

pub use config::Config;
pub use sim::{Flight, Sample, simulate};
pub use vehicle::Vehicle;
