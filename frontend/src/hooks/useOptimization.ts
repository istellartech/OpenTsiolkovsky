import { useEffect, useRef, useState } from 'react'
import { createOptimizationRun, type OptimizationRun } from '../lib/optimization-storage'
import { optimizationSnapshot, type IterationRecord, type OptimizationWorkerMessage, type ProgressSnapshot } from '../lib/optimization'

/** What the progress view needs from a running solve. */
export interface LiveProgress {
  startedAt: number
  /** Forwarded iteration records (rate-limited, in order). */
  iterations: IterationRecord[]
  /** Recent trajectory snapshots, oldest first, tagged with their iteration. */
  snapshots: { iteration: number; snapshot: ProgressSnapshot }[]
  /** Payload of every snapshot, for a payload-vs-iteration trace. */
  payload: { iteration: number; kg: number }[]
}
const KEEP_SNAPSHOTS = 8

export function useOptimization() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'solving' | 'done' | 'cancelled' | 'error'>('idle')
  const [progress, setProgress] = useState<IterationRecord | null>(null)
  const [live, setLive] = useState<LiveProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runs, setRuns] = useState<OptimizationRun[]>([])
  const [memoryBytes, setMemoryBytes] = useState<number | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const activeRun = useRef<string | null>(null)
  useEffect(
    () => () => {
      activeRun.current = null
      workerRef.current?.terminate()
    },
    [],
  )

  function cancel() {
    activeRun.current = null
    workerRef.current?.terminate()
    workerRef.current = null
    setStatus('cancelled')
  }

  function run(raw: string): boolean {
    if (workerRef.current) return false
    setError(null)
    setProgress(null)
    try {
      const runId = crypto.randomUUID()
      const input = optimizationSnapshot(raw, runId)
      const worker = new Worker(new URL('../workers/optimization.worker.ts', import.meta.url), { type: 'module' })
      activeRun.current = runId
      workerRef.current = worker
      setStatus('loading')
      setLive({ startedAt: Date.now(), iterations: [], snapshots: [], payload: [] })
      const finish = () => {
        activeRun.current = null
        worker.terminate()
        workerRef.current = null
      }
      worker.onmessage = (event: MessageEvent<OptimizationWorkerMessage>) => {
        const message = event.data
        if (activeRun.current !== message.runId) return
        if (message.type === 'progress') {
          const { snapshot, ...record } = message.record
          setProgress(record)
          setLive((old) => {
            if (!old) return old
            const next = { ...old, iterations: [...old.iterations, record] }
            if (snapshot) {
              next.snapshots = [...old.snapshots, { iteration: record.iteration, snapshot }].slice(-KEEP_SNAPSHOTS)
              next.payload = [...old.payload, { iteration: record.iteration, kg: snapshot.payload_kg }]
            }
            return next
          })
        } else if (message.type === 'stage') setStatus('solving')
        else if (message.type === 'error') {
          setError(message.error)
          setStatus('error')
          finish()
        } else if (message.type === 'result') {
          if ('error' in message.result) {
            setError(message.result.error)
            setStatus('error')
          } else {
            const result = message.result
            setRuns((old) => [createOptimizationRun(result, 'solver'), ...old].slice(0, 2))
            setProgress(result.iterations[result.iterations.length - 1] ?? null)
            setMemoryBytes(message.memoryBytes)
            setStatus('done')
          }
          finish()
        }
      }
      worker.onerror = (event) => {
        if (activeRun.current !== runId) return
        setError(event.message || 'Optimizer worker failed')
        setStatus('error')
        finish()
      }
      const wasmUrl = new URL('optimization/optimizer.wasm', new URL(import.meta.env.BASE_URL, window.location.href)).href
      worker.postMessage({ runId, input, wasmUrl })
      return true
    } catch (e) {
      activeRun.current = null
      workerRef.current?.terminate()
      workerRef.current = null
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
      return false
    }
  }
  function adopt(run: OptimizationRun, asComparison = false) {
    setRuns((old) =>
      asComparison && old[0] && old[0].id !== run.id ? [old[0], run] : [run, ...old.filter((r) => r.id !== run.id)].slice(0, 2),
    )
    if (!workerRef.current) {
      setError(null)
      setStatus('done')
      setProgress(run.result.iterations[run.result.iterations.length - 1] ?? null)
      setMemoryBytes(null)
    }
  }
  return {
    status,
    running: status === 'loading' || status === 'solving',
    progress,
    live,
    error,
    runs,
    memoryBytes,
    run,
    cancel,
    adopt,
    clearComparison: () => setRuns((old) => old.slice(0, 1)),
  }
}
