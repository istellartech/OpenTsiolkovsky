//! A separate WASI cdylib: no wasm-bindgen, filesystem, or ambient options.
//! The host owns every allocation and frees it with exactly the original length.
use super::{IterationRecord, solve_json};

const MAX_INPUT: usize = 1_048_576;

#[link(wasm_import_module = "optimization_host")]
unsafe extern "C" {
    fn progress(ptr: *const u8, len: usize);
}

pub(super) fn emit_progress(record: &IterationRecord) -> bool {
    if let Ok(bytes) = serde_json::to_vec(record) {
        // The import must copy the bytes synchronously; it cannot retain ptr.
        unsafe { progress(bytes.as_ptr(), bytes.len()) };
    }
    true
}

#[unsafe(no_mangle)]
pub extern "C" fn opt_alloc(len: usize) -> *mut u8 {
    if len == 0 || len > MAX_INPUT {
        return std::ptr::null_mut();
    }
    Box::into_raw(vec![0u8; len].into_boxed_slice()).cast::<u8>()
}

/// # Safety
/// `ptr` and `len` must identify a live opt_alloc/result allocation exactly once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn opt_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        unsafe { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len))) };
    }
}

/// Returns a fresh allocation: u32 little-endian JSON length, then UTF-8 JSON.
/// # Safety
/// Input must point to `len` initialized bytes in a live allocation.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn opt_solve(ptr: *const u8, len: usize) -> *mut u8 {
    let result = if ptr.is_null() || len == 0 || len > MAX_INPUT {
        Err("invalid optimization input length".to_owned())
    } else {
        let input = unsafe { std::slice::from_raw_parts(ptr, len) };
        std::str::from_utf8(input)
            .map_err(|e| e.to_string())
            .and_then(solve_json)
    };
    let json = match result {
        Ok(value) => value,
        Err(error) => serde_json::json!({"error": error}).to_string(),
    };
    let mut bytes = Vec::with_capacity(4 + json.len());
    bytes.extend_from_slice(&(json.len() as u32).to_le_bytes());
    bytes.extend_from_slice(json.as_bytes());
    Box::into_raw(bytes.into_boxed_slice()).cast::<u8>()
}
