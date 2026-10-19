import { useEffect, useRef, useState } from 'react'
import { optimizationSnapshot, type IterationRecord, type OptimizationResult, type OptimizationWorkerMessage } from '../lib/optimization'

export function useOptimization() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'solving' | 'done' | 'cancelled' | 'error'>('idle')
  const [progress, setProgress] = useState<IterationRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<OptimizationResult[]>([])
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

  function run(raw: string) {
    if (workerRef.current) return
    setError(null)
    setProgress(null)
    try {
      const runId = crypto.randomUUID()
      const input = optimizationSnapshot(raw, runId)
      const worker = new Worker(new URL('../workers/optimization.worker.ts', import.meta.url), { type: 'module' })
      activeRun.current = runId
      workerRef.current = worker
      setStatus('loading')
      const finish = () => {
        activeRun.current = null
        worker.terminate()
        workerRef.current = null
      }
      worker.onmessage = (event: MessageEvent<OptimizationWorkerMessage>) => {
        const message = event.data
        if (activeRun.current !== message.runId) return
        if (message.type === 'progress') setProgress(message.record)
        else if (message.type === 'stage') setStatus('solving')
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
            setResults((old) => [result, ...old].slice(0, 2))
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
    } catch (e) {
      activeRun.current = null
      workerRef.current?.terminate()
      workerRef.current = null
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }
  return { status, running: status === 'loading' || status === 'solving', progress, error, results, memoryBytes, run, cancel }
}
