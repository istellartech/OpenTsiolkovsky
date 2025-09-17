// WASM loader utilities for OpenTsiolkovsky (optional client-side execution)
// This expects `scripts/wasm_build.sh` to have emitted artifacts into
// `frontend/src/wasm` with out-name `openTsiolkovsky_cli`.

import type { ClientConfig, SimulationState } from './types'

let modPromise: Promise<any> | null = null

export function initWasm(): Promise<any> {
  if (!modPromise) {
    // Use Vite's glob import to optionally load the wasm-pack output if present.
    // This avoids build-time resolution errors when the WASM bundle has not been generated yet.
    const candidates = import.meta.glob('../wasm/openTsiolkovsky_cli.{js,ts}') as Record<string, () => Promise<any>>
    const keys = Object.keys(candidates)
    if (keys.length === 0) {
      modPromise = Promise.reject(new Error('WASM bundle not found. Run: bash scripts/wasm_build.sh'))
    } else {
      modPromise = candidates[keys[0]]().then(async (module) => {
        if (typeof module.default === 'function') {
          await module.default()
        }
        return module
      })
    }
  }
  return modPromise
}

export async function runSimulationWasm(config: ClientConfig): Promise<SimulationState[]> {
  const mod = await initWasm()
  // WasmSimulator accepts the client config JSON and performs conversion internally
  const sim = new mod.WasmSimulator(JSON.stringify(config))
  const json = await sim.run()
  return JSON.parse(json) as SimulationState[]
}

export async function stepWasm(sim: any, dt: number) {
  const json = await sim.step(dt)
  return JSON.parse(json) as SimulationState
}
