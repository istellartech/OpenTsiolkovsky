//! Explicit multi-stage phase transcription and conservative event connections.
pub mod problem;
pub mod transcription;
pub mod validation;
pub use problem::MultiStageProblem;
pub use transcription::MultiStage;
