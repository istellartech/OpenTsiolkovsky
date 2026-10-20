#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
cd "$REPO_ROOT"
cargo build --locked --release --lib --no-default-features --features optimization --target wasm32-wasip1
OUT_DIR="$REPO_ROOT/frontend/public/optimization"
mkdir -p "$OUT_DIR"
cp "$REPO_ROOT/target/wasm32-wasip1/release/openTsiolkovsky.wasm" "$OUT_DIR/optimizer.wasm"
cp "$REPO_ROOT/third_party/pounce/EPL-2.0.txt" "$OUT_DIR/EPL-2.0.txt"
cp "$REPO_ROOT/third_party/pounce/NOTICE.md" "$OUT_DIR/NOTICE.md"
wc -c "$OUT_DIR/optimizer.wasm"
