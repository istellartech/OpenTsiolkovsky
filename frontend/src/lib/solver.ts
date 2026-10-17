// Main-thread side of the solver worker.
//
// The WASM solver runs synchronously, so a run in progress cannot be
// interrupted from inside; a superseded run is cancelled by terminating its
// worker and starting a fresh one.
import type { ClientConfig } from './simulation'
import { runSimulation } from './simulation'
import { trackFromOutput, type Track } from './trajectory'

export interface SolverRequest {
  id: number
  config: ClientConfig
}

export type SolverResponse = { id: number; ok: true; track: Track | null } | { id: number; ok: false; error: string }

/** Rejection reason for a run replaced by a newer one. */
export class SolverCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'SolverCancelled'
  }
}

interface Pending {
  id: number
  resolve: (track: Track | null) => void
  reject: (err: Error) => void
}

const createWorker = () => new Worker(new URL('../workers/solver.worker.ts', import.meta.url), { type: 'module' })

class Solver {
  private worker: Worker | null = null
  private pending: Pending | null = null
  private seq = 0
  private useWorker = typeof Worker !== 'undefined'

  /** Solve `config`; a call made while another is running cancels the older one. */
  run(config: ClientConfig): Promise<Track | null> {
    if (!this.useWorker) return runSimulation(config).then(trackFromOutput)
    if (this.pending) {
      this.pending.reject(new SolverCancelled())
      this.pending = null
      this.worker?.terminate()
      this.worker = null
    }
    const worker = this.ensureWorker()
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.pending = { id, resolve, reject }
      worker.postMessage({ id, config } satisfies SolverRequest)
    })
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = createWorker()
    worker.onmessage = (e: MessageEvent<SolverResponse>) => {
      const p = this.pending
      if (!p || p.id !== e.data.id) return
      this.pending = null
      if (e.data.ok) p.resolve(e.data.track)
      else p.reject(new Error(e.data.error))
    }
    worker.onerror = (e) => {
      // A crash (e.g. a WASM abort) leaves the worker unusable; start over next run.
      const p = this.pending
      this.pending = null
      this.worker?.terminate()
      this.worker = null
      p?.reject(new Error(e.message || 'solver worker failed'))
    }
    this.worker = worker
    return worker
  }
}

export const solver = new Solver()
