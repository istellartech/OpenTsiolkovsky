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

# Add wasm32 target
echo "[VERCEL BUILD] Adding wasm32-unknown-unknown target..."
rustup target add wasm32-unknown-unknown

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

# Build frontend
echo "[VERCEL BUILD] Building frontend..."
cd frontend

# Install frontend dependencies
echo "[VERCEL BUILD] Installing frontend dependencies..."
bun install

# Type check
echo "[VERCEL BUILD] Running TypeScript type check..."
bunx tsc --noEmit

# Build frontend with Vite
echo "[VERCEL BUILD] Building frontend with Vite..."
bun run build

echo "[VERCEL BUILD] Build completed successfully!"
echo "[VERCEL BUILD] Frontend output available in frontend/dist/"