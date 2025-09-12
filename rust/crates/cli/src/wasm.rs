use wasm_bindgen::prelude::*;
use openTsiolkovsky_core::{
    Simulator, 
    rocket::RocketConfig,
    // simulator::SimulationState
};
// use serde_wasm_bindgen::{to_value, from_value};

// Enable console.log! for debugging
#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

macro_rules! console_log {
    ($($t:tt)*) => (log(&format_args!($($t)*).to_string()))
}

/// Set up panic hook for better error reporting in WASM
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// WebAssembly simulator wrapper
#[wasm_bindgen]
pub struct WasmSimulator {
    inner: Simulator,
}

#[wasm_bindgen]
impl WasmSimulator {
    /// Create new simulator from JSON configuration string
    #[wasm_bindgen(constructor)]
    pub fn new(config_json: &str) -> Result<WasmSimulator, JsError> {
        console_log!("Creating WasmSimulator with config: {}", &config_json[..config_json.len().min(100)]);
        
        let config: RocketConfig = serde_json::from_str(config_json)
            .map_err(|e| JsError::new(&format!("Failed to parse config JSON: {}", e)))?;
        
        let simulator = Simulator::new(config)
            .map_err(|e| JsError::new(&format!("Failed to create simulator: {}", e)))?;
            
        Ok(WasmSimulator { inner: simulator })
    }
    
    /// Run complete simulation and return results as JSON string
    #[wasm_bindgen]
    pub fn run(&mut self) -> Result<String, JsError> {
        console_log!("Running simulation...");
        
        let trajectory = self.inner.run();
        
        console_log!("Simulation completed with {} data points", trajectory.len());
        
        serde_json::to_string(&trajectory)
            .map_err(|e| JsError::new(&format!("Failed to serialize results: {}", e)))
    }
    
    /// Execute single integration step
    #[wasm_bindgen]
    pub fn step(&mut self, dt: f64) -> Result<String, JsError> {
        self.inner.step(dt);
        let state = self.inner.current_state();
        
        serde_json::to_string(state)
            .map_err(|e| JsError::new(&format!("Failed to serialize state: {}", e)))
    }
    
    /// Get current simulation state as JSON string
    #[wasm_bindgen]
    pub fn get_current_state(&self) -> Result<String, JsError> {
        let state = self.inner.current_state();
        
        serde_json::to_string(state)
            .map_err(|e| JsError::new(&format!("Failed to serialize state: {}", e)))
    }
    
    /// Get current simulation time
    #[wasm_bindgen]
    pub fn get_time(&self) -> f64 {
        self.inner.current_state().time
    }
    
    /// Get current altitude
    #[wasm_bindgen]
    pub fn get_altitude(&self) -> f64 {
        self.inner.current_state().altitude
    }
    
    /// Get current velocity magnitude
    #[wasm_bindgen]
    pub fn get_velocity(&self) -> f64 {
        self.inner.current_state().velocity_magnitude
    }
    
    /// Get current mass
    #[wasm_bindgen]
    pub fn get_mass(&self) -> f64 {
        self.inner.current_state().mass
    }
    
    /// Check if simulation has completed (implementation-specific logic can be added)
    #[wasm_bindgen]
    pub fn is_complete(&self) -> bool {
        // This is a placeholder - actual completion logic would depend on specific conditions
        false
    }
    
    /// Reset simulation to initial state
    #[wasm_bindgen]
    pub fn reset(&mut self) -> Result<(), JsError> {
        // For now, we'd need to reconstruct the simulator with original config
        // This would require storing the original config or implementing a reset method in core
        Err(JsError::new("Reset not yet implemented - please create a new WasmSimulator"))
    }
}

/// Utility function to validate JSON configuration without creating simulator
#[wasm_bindgen]
pub fn validate_config(config_json: &str) -> Result<bool, JsError> {
    match serde_json::from_str::<RocketConfig>(config_json) {
        Ok(_) => Ok(true),
        Err(e) => Err(JsError::new(&format!("Config validation failed: {}", e)))
    }
}

/// Get version information
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Get build information
#[wasm_bindgen]
pub fn get_build_info() -> String {
    format!(
        "OpenTsiolkovsky WASM v{}, built with rustc {}",
        env!("CARGO_PKG_VERSION"),
        option_env!("CARGO_PKG_RUST_VERSION").unwrap_or("unknown")
    )
}