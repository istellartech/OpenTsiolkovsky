#!/usr/bin/env bash
set -euo pipefail

# Vercel build script for OpenTsiolkovsky frontend with WASM
# This script installs Rust/wasm-pack and builds both WASM and frontend

echo "[VERCEL BUILD] Starting OpenTsiolkovsky build process"

# Install Rust if not present
if ! command -v rustc >/dev/null 2>&1; then
  echo "[VERCEL BUILD] Installing Rust..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
  source "$HOME/.cargo/env"
  echo "[VERCEL BUILD] Rust installed successfully"
else
  echo "[VERCEL BUILD] Rust already installed"
fi

# The build image can ship rustup without a default toolchain, in which case
# every rustc/cargo call fails ("no default is configured").
if ! rustup show active-toolchain >/dev/null 2>&1; then
  echo "[VERCEL BUILD] No default Rust toolchain; installing stable..."
  rustup toolchain install stable --profile minimal
  rustup default stable
fi

# Add wasm32 targets (wasip1 is used by the trajectory optimizer)
echo "[VERCEL BUILD] Adding wasm32-unknown-unknown and wasm32-wasip1 targets..."
rustup target add wasm32-unknown-unknown wasm32-wasip1

# Install wasm-pack if not present
if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "[VERCEL BUILD] Installing wasm-pack..."
  curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
  echo "[VERCEL BUILD] wasm-pack installed successfully"
else
  echo "[VERCEL BUILD] wasm-pack already installed"
fi

# Build WASM package using existing script
echo "[VERCEL BUILD] Building WASM package..."
bash scripts/wasm_build.sh

# frontend/public/optimization is not committed; without it the SPA rewrite
# serves index.html for optimizer.wasm.
echo "[VERCEL BUILD] Building optimizer WASM..."
bash scripts/optimization_wasm_build.sh

# Build frontend
echo "[VERCEL BUILD] Building frontend..."
cd frontend

# Install frontend dependencies
echo "[VERCEL BUILD] Installing frontend dependencies..."
bun install

# Format, lint and type check, then build with Vite+ (vp from node_modules)
echo "[VERCEL BUILD] Running vp check..."
bunx vp check

echo "[VERCEL BUILD] Building frontend with Vite+..."
bunx vp build

echo "[VERCEL BUILD] Build completed successfully!"
echo "[VERCEL BUILD] Frontend output available in frontend/dist/"