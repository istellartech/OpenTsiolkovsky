/// <reference lib="webworker" />
import { instantiateOptimizer } from '../lib/optimization-wasm'
import type { OptimizationResult, OptimizationWorkerRequest, IterationRecord, OptimizationWorkerMessage } from '../lib/optimization'

declare const self: DedicatedWorkerGlobalScope

// A synchronous solve cannot receive cancellation messages. Terminate this
// worker to stop, and create a fresh instance for the next run (no COOP/COEP).
self.onmessage = async (event: MessageEvent<OptimizationWorkerRequest>) => {
  const { runId, input, wasmUrl } = event.data
  const send = (message: OptimizationWorkerMessage) => self.postMessage(message)
  try {
    const response = await fetch(wasmUrl)
    if (!response.ok) throw new Error(`Optimizer WASM could not be loaded (${response.status}); run build:optimization`)
    let lastProgress = -Infinity
    const optimizer = await instantiateOptimizer(await response.arrayBuffer(), (record) => {
      const now = performance.now()
      if (now - lastProgress >= 100) {
        send({ runId, type: 'progress', record: record as IterationRecord })
        lastProgress = now
      }
    })
    send({ runId, type: 'stage', stage: 'solving' })
    const result = optimizer.solve(input) as OptimizationResult | { error: string }
    send({ runId, type: 'result', result, memoryBytes: optimizer.memoryBytes() })
  } catch (error) {
    send({ runId, type: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}
