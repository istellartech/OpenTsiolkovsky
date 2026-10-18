/// <reference lib="webworker" />
// Flies Monte Carlo cases with the WASM solver, posting each result as it
// finishes so the UI can show progress.
import { initWasm } from '../lib/simulation'
import type { McWorkerMessage, McWorkerRequest } from '../lib/montecarlo'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (e: MessageEvent<McWorkerRequest>) => {
  const { config, dispersion, seed, indices } = e.data
  const post = (msg: McWorkerMessage) => self.postMessage(msg)
  try {
    const mod = await initWasm()
    const configJson = JSON.stringify(config)
    const dispersionJson = JSON.stringify(dispersion)
    for (const index of indices) {
      post({ type: 'case', case: JSON.parse(mod.monte_carlo_case_json(configJson, dispersionJson, seed, index)) })
    }
    post({ type: 'done' })
  } catch (err) {
    post({ type: 'error', error: err instanceof Error ? err.message : String(err) })
  }
}
