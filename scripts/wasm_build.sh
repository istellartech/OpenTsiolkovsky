#!/usr/bin/env bash
set -euo pipefail

# Build WASM package for the CLI crate with wasm-bindgen interface
# Requires: wasm-pack (https://rustwasm.github.io/wasm-pack/installer/)

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

CRATE_DIR="$REPO_ROOT/rust/crates/cli"
OUT_DIR="$REPO_ROOT/frontend/src/wasm"

echo "Building WASM (target=web, features=wasm)"
wasm-pack build "$CRATE_DIR" \
  --release \
  --target web \
  --features wasm \
  --out-dir "$OUT_DIR" \
  --out-name openTsiolkovsky_cli

echo "Done. Output written to $OUT_DIR"

