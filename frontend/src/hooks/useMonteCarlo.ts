// Monte Carlo dispersion runs for the current configuration: settings
// (remembered per browser), the run in progress and its statistics.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientConfig } from '../lib/simulation'
import {
  DEFAULT_DISPERSION,
  DISPERSION_KEYS,
  ELLIPSE_LEVELS,
  EXTRA_DISPERSION_KEYS,
  impactStatistics,
  startMonteCarlo,
  type CaseResult,
  type ImpactStatistics,
  type MonteCarloSettings,
} from '../lib/montecarlo'

const KEY = 'ot.montecarlo'
export const MAX_CASES = 2000

const DEFAULT_SETTINGS: MonteCarloSettings = { count: 100, seed: 1, dispersion: DEFAULT_DISPERSION }

function loadSettings(): MonteCarloSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<MonteCarloSettings> | null
    if (!raw) return DEFAULT_SETTINGS
    const dispersion = { ...DEFAULT_DISPERSION }
    for (const k of [...DISPERSION_KEYS, ...EXTRA_DISPERSION_KEYS]) {
      const v = raw.dispersion?.[k]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) dispersion[k] = v
    }
    if (raw.dispersion?.distribution === 'uniform') dispersion.distribution = 'uniform'
    if (raw.dispersion?.independent_stages === true) dispersion.independent_stages = true
    const count = Number.isInteger(raw.count) ? Math.min(Math.max(raw.count!, 1), MAX_CASES) : DEFAULT_SETTINGS.count
    const seed = Number.isInteger(raw.seed) && raw.seed! >= 0 ? raw.seed! : DEFAULT_SETTINGS.seed
    const ellipse = ELLIPSE_LEVELS.find((l) => l === raw.ellipse)
    return { count, seed, dispersion, ...(ellipse && { ellipse }) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export type McStatus = 'idle' | 'running' | 'done' | 'cancelled' | 'error'

export interface McResult {
  cases: CaseResult[]
  statistics: ImpactStatistics[]
  total: number
  /** The configuration these cases were flown with */
  configJson: string
  settings: MonteCarloSettings
}

export function useMonteCarlo(config: ClientConfig) {
  const [settings, setSettingsState] = useState<MonteCarloSettings>(loadSettings)
  const [status, setStatus] = useState<McStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<McResult | null>(null)
  const cancelRef = useRef<(() => void) | null>(null)
  const runId = useRef(0)

  const setSettings = useCallback((next: MonteCarloSettings) => {
    setSettingsState(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* storage may be unavailable */
    }
  }, [])

  const cancel = useCallback(() => {
    cancelRef.current?.()
    cancelRef.current = null
    runId.current++
    setStatus((s) => (s === 'running' ? 'cancelled' : s))
  }, [])

  const run = useCallback(() => {
    cancelRef.current?.()
    const id = ++runId.current
    const configJson = JSON.stringify(config)
    const frozen = settings
    setStatus('running')
    setError(null)
    setResult({ cases: [], statistics: [], total: frozen.count, configJson, settings: frozen })

    // Statistics come from WASM; refresh them at most a few times a second.
    let pending: CaseResult[] | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = (final: boolean) => {
      const cases = pending
      if (!cases) return
      pending = null
      const snapshot = [...cases]
      void impactStatistics(snapshot).then((statistics) => {
        if (id !== runId.current && !final) return
        setResult((r) => (r && r.configJson === configJson ? { ...r, cases: snapshot, statistics } : r))
      })
    }

    cancelRef.current = startMonteCarlo(config, frozen, (p) => {
      if (id !== runId.current) return
      pending = p.cases
      if (p.done) {
        if (timer) clearTimeout(timer)
        refresh(true)
        cancelRef.current = null
        if (p.error) {
          setError(p.error)
          setStatus('error')
        } else setStatus('done')
      } else if (!timer) {
        timer = setTimeout(() => {
          timer = null
          refresh(false)
        }, 250)
      }
    })
  }, [config, settings])

  // Stop workers when the page goes away.
  useEffect(() => () => cancelRef.current?.(), [])

  const stale = !!result && result.configJson !== JSON.stringify(config)
  const clear = useCallback(() => {
    cancel()
    setResult(null)
    setStatus('idle')
  }, [cancel])

  return { settings, setSettings, status, error, result, stale, run, cancel, clear }
}

export type MonteCarloState = ReturnType<typeof useMonteCarlo>
