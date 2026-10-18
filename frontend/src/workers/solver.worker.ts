/// <reference lib="webworker" />
// Runs the WASM solver off the main thread so the UI stays responsive during
// long runs (orbital vehicles take a noticeable fraction of a second).
import type { Config } from '../lib/config'
import { runSimulation } from '../lib/simulation'
import { trackFromOutput } from '../lib/trajectory'
import type { SolverRequest, SolverResponse } from '../lib/solver'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (e: MessageEvent<SolverRequest>) => {
  const { id, config } = e.data
  let msg: SolverResponse
  try {
    const track = trackFromOutput(await runSimulation(config as Config))
    msg = { id, ok: true, track }
  } catch (err) {
    msg = { id, ok: false, error: err instanceof Error ? err.message : String(err) }
  }
  self.postMessage(msg)
}
