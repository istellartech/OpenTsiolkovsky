import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inlineFileTables, isConfig, type Config } from '../lib/config'
import { baseName, convertLegacy, isLegacyParamFile } from '../lib/simulation'
import { SolverCancelled, solver } from '../lib/solver'
import { PRESET_OPTIONS, createBlankConfig } from '../config/presets'
import { validateConfig } from '../lib/validation'
import type { Track } from '../lib/trajectory'
import { commit, initHistory, redo as redoHistory, undo as undoHistory, type History } from '../lib/history'
import { tr, useLang } from '../lib/i18n'
import { useLatest } from './useLatest'
import { editedSimulationCase, newCase, readCaseContext, readCaseFile, type CaseContext } from '../lib/case'

const LOCALSTORAGE_KEY = 'openTsiolkovsky_config'
const LOCALSTORAGE_PRESET_KEY = 'openTsiolkovsky_preset'
const CASE_KEY = 'openTsiolkovsky_case'
const ENTRY_KEY = 'openTsiolkovsky_case_entry'
const RUN_DEBOUNCE_MS = 250

interface Entry {
  config: Config
  context: CaseContext
  /** Preset the config came from unchanged, or 'custom' */
  presetId: string
}

function loadStored(): Entry | null {
  try {
    const entry = localStorage.getItem(ENTRY_KEY)
    if (entry) {
      const saved = JSON.parse(entry) as Entry
      if (isConfig(saved.config) && typeof saved.presetId === 'string') {
        const preset = PRESET_OPTIONS.find((p) => p.id === saved.presetId)
        return { ...saved, config: preset ? preset.create() : saved.config, context: readCaseContext(saved.context) }
      }
    }
    const stored = localStorage.getItem(LOCALSTORAGE_KEY)
    if (!stored) return null
    const presetId = localStorage.getItem(LOCALSTORAGE_PRESET_KEY) ?? 'custom'
    const meta = localStorage.getItem(CASE_KEY)
    const context = meta ? readCaseContext(JSON.parse(meta)) : null
    // An unedited preset is rebuilt from code so fixes to presets take effect.
    const preset = PRESET_OPTIONS.find((p) => p.id === presetId)
    if (preset) return { config: preset.create(), presetId, context: context ?? newCase(preset.create().name) }
    const config = JSON.parse(stored)
    if (!isConfig(config)) return null
    return { config, presetId: 'custom', context: context ?? newCase(config.name) }
  } catch {
    return null
  }
}

function store(config: Config, presetId: string, context: CaseContext) {
  try {
    localStorage.setItem(ENTRY_KEY, JSON.stringify({ config, presetId, context }))
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(config))
    localStorage.setItem(LOCALSTORAGE_PRESET_KEY, presetId)
    localStorage.setItem(CASE_KEY, JSON.stringify(context))
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
  caseId: string
  context: CaseContext
  config: Config
  track: Track
  /** Wall-clock solve time [ms] */
  ms: number
}

export function useSimulation() {
  const [history, setHistory] = useState<History<Entry>>(() =>
    initHistory(
      loadStored() ?? {
        config: PRESET_OPTIONS[0].create(),
        presetId: PRESET_OPTIONS[0].id,
        context: newCase(PRESET_OPTIONS[0].create().name),
      },
    ),
  )
  const { config, presetId, context } = history.present
  const contextRef = useLatest(context)
  const [status, setStatus] = useState<RunStatus>('running')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SimulationResult | null>(null)
  const runSeq = useRef(0)

  // Messages are localized, so re-validate when the language changes.
  const lang = useLang()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const issues = useMemo(() => validateConfig(config), [config, lang])
  const issueMap = useMemo(() => new Map(issues.map((i) => [i.field, i.message])), [issues])

  /** Edit the config. Rapid successive edits become a single undo step. */
  const patch = useCallback((fn: (c: Config) => Config) => {
    setHistory((h) => {
      const next = fn(h.present.config)
      return next === h.present.config
        ? h
        : commit(
            h,
            { config: next, presetId: 'custom', context: editedSimulationCase(h.present.context, h.present.config, next) },
            { key: 'edit' },
          )
    })
  }, [])

  /** Replace the whole config (preset, file, shared link) as one undo step. */
  const load = useCallback((config: Config, presetId = 'custom', context = newCase(config.name)) => {
    setHistory((h) => commit(h, { config, presetId, context }))
  }, [])

  const undo = useCallback(() => setHistory(undoHistory), [])
  const redo = useCallback(() => setHistory(redoHistory), [])

  const updateContext = useCallback((context: CaseContext) => {
    setHistory((h) => commit(h, { ...h.present, context: { ...context, revision: h.present.context.revision + 1 } }))
  }, [])
  useEffect(() => {
    store(config, presetId, context)
  }, [config, presetId, context])

  // Persist and re-run on every change (debounced). The solver is fast enough
  // that results follow the inputs without an explicit "run" step.
  useEffect(() => {
    const seq = ++runSeq.current
    const inputContext = contextRef.current
    if (issues.length > 0) {
      setStatus('invalid')
      return
    }
    setStatus('running')
    const timer = window.setTimeout(async () => {
      const t0 = performance.now()
      try {
        const track = await solver.run(config)
        if (seq !== runSeq.current) return
        if (!track)
          throw new Error(
            tr(
              '計算結果のデータ点が不足しています。計算時間や出力間隔を確認してください。',
              'Not enough output data points. Check the simulation time and output interval.',
            ),
          )
        setResult({ track, caseId: inputContext.id, context: inputContext, config, ms: Math.round(performance.now() - t0) })
        setError(null)
        setStatus('ok')
      } catch (err) {
        if (err instanceof SolverCancelled || seq !== runSeq.current) return
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    }, RUN_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [config, issues.length, presetId, context.id, contextRef])

  const startBlank = useCallback(() => {
    setHistory((h) =>
      commit(h, {
        config: createBlankConfig(h.present.config.launch),
        presetId: 'custom',
        context: newCase(createBlankConfig(h.present.config.launch).name),
      }),
    )
  }, [])

  const applyPreset = useCallback(
    (id: string) => {
      const preset = PRESET_OPTIONS.find((p) => p.id === id)
      if (preset) load(preset.create(), id)
    },
    [load],
  )

  /**
   * Open a configuration file (as the CLI reads it), or a C++ simulator
   * parameter file (param_*.json) together with the CSV tables it
   * references, converted by the solver. Resolves with a user-facing result
   * message.
   */
  const importFiles = useCallback(
    async (files: File[]): Promise<ImportResult> => {
      const jsonFiles = files.filter((f) => /\.json$/i.test(f.name) || f.type === 'application/json')
      const csvFiles = files.filter((f) => /\.csv$/i.test(f.name))
      if (jsonFiles.length === 0) {
        return {
          ok: false,
          message: csvFiles.length
            ? tr(
                'CSV だけでは開けません。設定の .json ファイルも一緒に選んでください。',
                'CSV files alone cannot be opened. Select the configuration .json file as well.',
              )
            : tr('.json ファイルを選んでください。', 'Select a .json file.'),
        }
      }
      if (jsonFiles.length > 1)
        return { ok: false, message: tr('設定の .json ファイルは1つだけ選んでください。', 'Select only one configuration .json file.') }
      const file = jsonFiles[0]

      let parsed: unknown
      try {
        parsed = JSON.parse(await file.text())
        const envelope = readCaseFile(parsed)
        if (envelope) {
          if (envelope.workspace !== 'simulate' || !isConfig(envelope.data))
            throw new Error(tr('軌道計算のケースを選んでください。', 'Select a simulation case.'))
          load(envelope.data, 'custom', envelope.context)
          return {
            ok: true,
            message: tr('質量内訳・変換履歴を含むケースを読み込みました。', 'Case loaded with its mass breakdown and conversion history.'),
          }
        }
      } catch {
        return { ok: false, message: tr(`「${file.name}」はJSONとして読めませんでした。`, `Could not parse "${file.name}" as JSON.`) }
      }

      if (isLegacyParamFile(parsed)) {
        const csv = new Map<string, string>()
        for (const f of csvFiles) csv.set(baseName(f.name), await f.text())
        let converted
        try {
          converted = await convertLegacy(parsed, csv)
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err)
          return {
            ok: false,
            message: tr(`「${file.name}」を変換できませんでした：${reason}`, `Could not convert "${file.name}": ${reason}`),
          }
        }
        load(converted.config)
        const n = csvFiles.length
        const loaded = n
          ? tr(
              `旧C++版の設定「${file.name}」（CSV ${n}件）を変換して読み込みました。`,
              `Converted and loaded the C++ simulator file "${file.name}" (${n} CSV file${n === 1 ? '' : 's'}).`,
            )
          : tr(`旧C++版の設定「${file.name}」を変換して読み込みました。`, `Converted and loaded the C++ simulator file "${file.name}".`)
        const notes = converted.warnings.length
          ? [
              tr(
                `変換時の注意：${converted.warnings.join('／')}（CSVはJSONと一緒に選ぶかドロップしてください）`,
                `Conversion notes: ${converted.warnings.join(' / ')} (select or drop CSV files together with the JSON).`,
              ),
            ]
          : []
        return { ok: converted.warnings.length === 0, message: [loaded, ...notes].join(' ') }
      }

      if (!isConfig(parsed)) {
        return {
          ok: false,
          message: tr(
            `「${file.name}」は設定ファイルとして読めませんでした（設定の .json か、旧C++版の param_*.json を選んでください）。`,
            `Could not read "${file.name}" as a configuration file. Select a configuration .json or a C++ simulator param_*.json file.`,
          ),
        }
      }
      // `{file}` tables are filled in from the CSV files opened with it.
      const csv = new Map<string, string>()
      for (const f of csvFiles) csv.set(baseName(f.name), await f.text())
      const { config, missing, errors, inlined } = inlineFileTables(parsed, csv)
      load(config)
      const loaded = inlined
        ? tr(
            `「${file.name}」（CSVの表 ${inlined}件）を読み込みました。`,
            `Loaded "${file.name}" (${inlined} CSV table${inlined === 1 ? '' : 's'}).`,
          )
        : tr(`「${file.name}」を読み込みました。`, `Loaded "${file.name}".`)
      const notes = [
        ...(missing.length
          ? [
              tr(
                `見つからないCSV：${missing.join('、')}（JSONと一緒に選ぶかドロップしてください）`,
                `Missing CSV files: ${missing.join(', ')} (select or drop them together with the JSON).`,
              ),
            ]
          : []),
        ...(errors.length ? [tr(`読めないCSV：${errors.join('／')}`, `Unreadable CSV files: ${errors.join(' / ')}.`)] : []),
      ]
      return { ok: notes.length === 0, message: [loaded, ...notes].join(' ') }
    },
    [load],
  )

  return {
    config,
    context,
    updateContext,
    patch,
    load,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    presetId,
    applyPreset,
    startBlank,
    importFiles,
    status,
    error,
    result,
    issues,
    issueMap,
  }
}
