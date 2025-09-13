# WASM Build Guide

This project exposes a WebAssembly interface from `openTsiolkovsky-cli` (feature `wasm`).

## Prerequisites

- Rust toolchain (stable)
- wasm32 target: `rustup target add wasm32-unknown-unknown`
- wasm-pack: https://rustwasm.github.io/wasm-pack/installer/

## Build

```
bash scripts/wasm_build.sh
```

Outputs JS/WASM bundle into `frontend/src/wasm` with the entry `openTsiolkovsky_cli.js`.

## Use from frontend (Vite)

```ts
// example: src/lib/wasm.ts
import init, { WasmSimulator } from '../wasm/openTsiolkovsky_cli.js'

let ready = false
export async function initWasm() {
  if (!ready) { await init(); ready = true }
}

export async function runSimulationWasm(config: any) {
  await initWasm()
  const sim = new WasmSimulator(JSON.stringify(config))
  return JSON.parse(sim.run())
}
```

