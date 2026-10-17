import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ClientConfig } from '../lib/simulation'
import { SolverCancelled, solver } from '../lib/solver'
import { PRESET_OPTIONS, createBlankConfig } from '../config/presets'
import { isValidClientConfig, validateConfig } from '../lib/validation'
import type { Track } from '../lib/trajectory'
import { baseName, fromLegacyParamFile, isLegacyParamFile } from '../lib/legacy'

const LOCALSTORAGE_KEY = 'openTsiolkovsky_config'
const LOCALSTORAGE_PRESET_KEY = 'openTsiolkovsky_preset'
const RUN_DEBOUNCE_MS = 250

function loadStored(): { config: ClientConfig; presetId: string } | null {
  try {
    const stored = localStorage.getItem(LOCALSTORAGE_KEY)
    if (!stored) return null
    const presetId = localStorage.getItem(LOCALSTORAGE_PRESET_KEY) ?? 'custom'
    // An unedited preset is rebuilt from code so fixes to presets take effect.
    const preset = PRESET_OPTIONS.find((p) => p.id === presetId)
    if (preset) return { config: preset.create(), presetId }
    const config = JSON.parse(stored)
    if (!isValidClientConfig(config)) return null
    return { config, presetId: 'custom' }
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

export interface ImportResult {
  ok: boolean
  message: string
}

export interface SimulationResult {
  track: Track
  /** Wall-clock solve time [ms] */
  ms: number
}

export function useSimulation() {
  const initial = useMemo(() => loadStored() ?? { config: PRESET_OPTIONS[0].create(), presetId: PRESET_OPTIONS[0].id }, [])
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
        const track = await solver.run(config)
        if (seq !== runSeq.current) return
        if (!track) throw new Error('計算結果のデータ点が不足しています。計算時間や出力間隔を確認してください。')
        setResult({ track, ms: Math.round(performance.now() - t0) })
        setError(null)
        setStatus('ok')
      } catch (err) {
        if (err instanceof SolverCancelled || seq !== runSeq.current) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }, RUN_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [config, issues.length, presetId])

  const startBlank = useCallback(() => {
    setConfigState((c) => createBlankConfig(c.launch))
    setPresetId('custom')
  }, [])

  const applyPreset = useCallback((id: string) => {
    const preset = PRESET_OPTIONS.find((p) => p.id === id)
    if (!preset) return
    setConfigState(preset.create())
    setPresetId(id)
  }, [])

  /**
   * Open a settings file: either one saved from this app, or a CLI parameter
   * file (param_*.json) together with the CSV tables it references.
   * Resolves with a user-facing result message.
   */
  const importFiles = useCallback(async (files: File[]): Promise<ImportResult> => {
    const jsonFiles = files.filter((f) => /\.json$/i.test(f.name) || f.type === 'application/json')
    const csvFiles = files.filter((f) => /\.csv$/i.test(f.name))
    if (jsonFiles.length === 0) {
      return { ok: false, message: csvFiles.length ? 'CSV だけでは開けません。設定の .json ファイルも一緒に選んでください。' : '.json ファイルを選んでください。' }
    }
    if (jsonFiles.length > 1) return { ok: false, message: '設定の .json ファイルは1つだけ選んでください。' }
    const file = jsonFiles[0]

    let parsed: unknown
    try {
      parsed = JSON.parse(await file.text())
    } catch {
      return { ok: false, message: `「${file.name}」はJSONとして読めませんでした。` }
    }

    if (isLegacyParamFile(parsed)) {
      const csv = new Map<string, string>()
      for (const f of csvFiles) csv.set(baseName(f.name), await f.text())
      let imported
      try {
        imported = fromLegacyParamFile(parsed, csv)
      } catch (err) {
        return { ok: false, message: `「${file.name}」を変換できませんでした：${err instanceof Error ? err.message : String(err)}` }
      }
      setConfigState(imported.config)
      setPresetId('custom')
      const notes: string[] = []
      if (imported.missing.length) {
        notes.push(`参照しているCSVが見つからないため定数値を使っています（${imported.missing.join('、')}）。JSONと一緒に選ぶかドロップしてください。`)
      }
      if (imported.unsupported.length) notes.push(`この画面では扱えない設定は無視しました：${imported.unsupported.join('、')}。`)
      const used = csvFiles.length ? `（CSV ${csvFiles.length}件）` : ''
      return { ok: imported.missing.length === 0, message: [`CLI用の「${file.name}」${used}を読み込みました。`, ...notes].join(' ') }
    }

    if (!isValidClientConfig(parsed)) {
      return { ok: false, message: `「${file.name}」は設定ファイルとして読めませんでした（このアプリで保存した設定か、CLI用の param_*.json を選んでください）。` }
    }
    setConfigState(parsed)
    setPresetId('custom')
    return { ok: true, message: `「${file.name}」を読み込みました。` }
  }, [])

  return { config, patch, presetId, applyPreset, startBlank, importFiles, status, error, result, issues, issueMap }
}
