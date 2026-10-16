import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClientConfig, SimulationState } from '../lib/simulation'
import { runSimulation } from '../lib/simulation'
import { PRESET_OPTIONS, createDefaultConfig } from '../config/defaults'
import { isValidClientConfig, validateConfig } from '../utils/validation'
import { buildTrack, type Track } from '../lib/trajectory'

const LOCALSTORAGE_KEY = 'openTsiolkovsky_config'
const LOCALSTORAGE_PRESET_KEY = 'openTsiolkovsky_preset'
const RUN_DEBOUNCE_MS = 250

function loadStored(): { config: ClientConfig; presetId: string } | null {
  try {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY)
    if (!stored) return null
    const config = JSON.parse(stored)
    if (!isValidClientConfig(config)) return null
    return { config, presetId: localStorage.getItem(LOCALSTORAGE_PRESET_KEY) ?? 'custom' }
  } catch {
    return null
  }
}

function store(config: ClientConfig, presetId: string) {
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(config))
    localStorage.setItem(LOCALSTORAGE_PRESET_KEY, presetId)
  } catch {
    /* storage may be unavailable */
  }
}

export type RunStatus = 'running' | 'ok' | 'invalid' | 'error'

export interface SimulationResult {
  states: SimulationState[]
  track: Track
  config: ClientConfig
  ms: number
}

export function useSimulation() {
  const initial = useMemo(() => loadStored() ?? { config: createDefaultConfig(), presetId: 'sample' }, [])
  const [config, setConfigState] = useState<ClientConfig>(initial.config)
  const [presetId, setPresetId] = useState(initial.presetId)
  const [status, setStatus] = useState<RunStatus>('running')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const runSeq = useRef(0)

  const issues = useMemo(() => validateConfig(config), [config])
  const issueMap = useMemo(() => new Map(issues.map((i) => [i.field, i.message])), [issues])

  const patch = useCallback((fn: (c: ClientConfig) => ClientConfig) => {
    setConfigState((c) => fn(c))
    setPresetId('custom')
  }, [])

  // Persist and re-run on every change (debounced). The solver is fast enough
  // that results follow the inputs without an explicit "run" step.
  useEffect(() => {
    store(config, presetId)
    if (issues.length > 0) {
      setStatus('invalid')
      return
    }
    const seq = ++runSeq.current
    setStatus('running')
    const timer = window.setTimeout(async () => {
      const t0 = performance.now()
      try {
        const states = await runSimulation(config)
        if (seq !== runSeq.current) return
        const track = buildTrack(states)
        if (!track) throw new Error('計算結果のデータ点が不足しています。計算時間や出力間隔を確認してください。')
        setResult({ states, track, config, ms: Math.round(performance.now() - t0) })
        setError(null)
        setStatus('ok')
      } catch (err) {
        if (seq !== runSeq.current) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }, RUN_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [config, issues.length, presetId])

  const applyPreset = useCallback((id: string) => {
    const preset = PRESET_OPTIONS.find((p) => p.id === id)
    if (!preset) return
    setConfigState(preset.create())
    setPresetId(id)
  }, [])

  const importConfig = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result))
        if (!isValidClientConfig(parsed)) {
          setError('設定ファイルの構造が不正です（simulation, launch, aerodynamics, attitude, wind が必要です）。')
          setStatus('error')
          return
        }
        setConfigState(parsed)
        setPresetId('custom')
      } catch {
        setError('JSONとして読み込めませんでした。')
        setStatus('error')
      }
    }
    reader.readAsText(file)
  }, [])

  return { config, patch, presetId, applyPreset, importConfig, status, error, result, issues, issueMap }
}
