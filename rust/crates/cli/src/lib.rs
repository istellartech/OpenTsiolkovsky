#![allow(non_snake_case)]
// Re-export core types for convenience
pub use openTsiolkovsky_core::*;

// WASM module - conditionally compiled
#[cfg(feature = "wasm")]
pub mod wasm;
