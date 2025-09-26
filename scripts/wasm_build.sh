#!/usr/bin/env bash
set -euo pipefail

# Build WASM package for the CLI crate with wasm-bindgen interface
# Requires: wasm-pack (https://rustwasm.github.io/wasm-pack/installer/)

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

CRATE_DIR="$REPO_ROOT"
OUT_DIR="$REPO_ROOT/frontend/src/wasm"

# Check wasm-pack
if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "[ERROR] wasm-pack is not installed."
  echo "Install: https://rustwasm.github.io/wasm-pack/installer/"
  echo "Or via cargo-binstall: cargo binstall wasm-pack"
  exit 1
fi

# Ensure wasm target is available (best-effort)
if command -v rustup >/dev/null 2>&1; then
  rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true
fi

echo "[WASM] Building (target=web, features=wasm)"
wasm-pack build "$CRATE_DIR" \
  --release \
  --target web \
  --features wasm

PKG_DIR="$REPO_ROOT/pkg"
if [ ! -d "$PKG_DIR" ]; then
  echo "[ERROR] wasm-pack did not produce expected pkg/ directory" >&2
  exit 1
fi

rm -rf "$OUT_DIR"
mkdir -p "$(dirname "$OUT_DIR")"
mv "$PKG_DIR" "$OUT_DIR"

echo "[WASM] Done. Output moved to $OUT_DIR"
