import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Maximize2, Minimize2, X } from 'lucide-react'
import { useOptimization } from '../hooks/useOptimization'
import { useLatest } from '../hooks/useLatest'
import { tr, useLang } from '../lib/i18n'
import { fileBase, saveFile } from '../lib/download'
import { refineFlightMesh } from '../lib/optimization'
import {
  editOptimizationInput,
  inspectOptimizationInput,
  inputTitle,
  isRocketInput,
  numericDraftValue,
  sectionForPath,
  withoutInitialGuess,
  requestFingerprint,
} from '../lib/optimization-input'
import { warmStartGuess, withInitialGuess } from '../lib/optimization-vehicle'
import type { OptimizationResult } from '../lib/optimization'
import type { Config } from '../lib/config'
import {
  optimizationFromSimulation,
  optimizationUsesSimulation,
  optimizationKindFor,
  simulationFromOptimization,
  type SimulatedFlight,
} from '../lib/optimization-bridge'
import type { EditorSection, InputIssue, NumericDraft, OptimizationInput } from '../lib/optimization-input'
import {
  archiveOptimizationRun,
  createOptimizationRun,
  listOptimizationRuns,
  loadOptimizationDraft,
  loadOptimizationRun,
  MAX_OPTIMIZATION_FILE_BYTES,
  readOptimizationFile,
  saveOptimizationDraft,
  saveOptimizationRun,
} from '../lib/optimization-storage'
import type { OptimizationDraft, SavedRunInfo } from '../lib/optimization-storage'
import {
  DEFAULT_OPTIMIZATION_PRESET,
  optimizationPresets,
  rocketPresetOptions,
  type OptimizationPresetId,
} from '../lib/optimization-presets'
import { OptimizationEditor, VehicleSummary } from './optimization/OptimizationEditor'
import { OptimizationHistory } from './optimization/OptimizationHistory'
import { OptimizationResults, type ResultTab } from './optimization/OptimizationResults'
import { WorkspaceNav } from './WorkspaceNav'
import { OptTabs } from './optimization/controls'
import { IconButton } from './primitives'
import { OptimizationEditorContext } from './optimization/editor-context'
import { ProgressView } from './optimization/ProgressView'
import { optButton } from './optimization/styles'
import { cn } from '../lib/cn'
import { caseFile, editCase, newCase, type CaseContext } from '../lib/case'
import type { OptimizationControls } from '../lib/workspace'
import { commit, initHistory, redo, undo } from '../lib/history'
import { useUndoKeys } from '../hooks/useUndoKeys'
import { useMediaQuery } from '../hooks/useMediaQuery'

/** On phones and tablets one pane is shown at a time; desktops show both. */
type Pane = 'setup' | 'results'
/** Draft preset id of an input converted from the simulation's vehicle. */
const FROM_SIMULATION = 'simulation'

/**
 * Trajectory optimization, side by side with the simulation: it can start
 * from the simulation's vehicle and hand an optimized trajectory back to it.
 */
export function OptimizationWorkspace({
  simConfig,
  simContext,
  simFlight,
  active,
  onControls,
  onOpenInSimulation,
}: {
  /** The vehicle currently in the simulation */
  simConfig: Config
  simContext: CaseContext
  /** The simulated flight of `simConfig`, when it is up to date */
  simFlight?: SimulatedFlight
  active: boolean
  onControls: (controls: OptimizationControls) => void
  onOpenInSimulation: (config: Config, notes: string[], context?: CaseContext) => void
}) {
  const editor = useRef<HTMLElement>(null)
  const lang = useLang(),
    opt = useOptimization()
  const [view, setView] = useState<Pane>('setup')
  const [resultTab, setResultTab] = useState<ResultTab>('charts')
  /** Bring the result (not the saved-runs list) into view. */
  const showResults = useCallback(() => {
    setView('results')
    setResultTab((t) => (t === 'history' ? 'charts' : t))
  }, [])
  const showHistory = useCallback(() => {
    setView('results')
    setResultTab('history')
  }, [])
  const [draftHistory, setDraftHistory] = useState(() =>
    initHistory<OptimizationDraft>({
      raw: optimizationPresets[DEFAULT_OPTIMIZATION_PRESET],
      fields: {},
      section: 'mission',
      preset: DEFAULT_OPTIMIZATION_PRESET,
      updatedAt: Date.now(),
      context: newCase('Assumed 80 t two-stage small launcher'),
    }),
  )
  const draft = draftHistory.present
  const setDraft = useCallback(
    (update: (draft: OptimizationDraft) => OptimizationDraft) => setDraftHistory((h) => ({ ...h, present: update(h.present) })),
    [],
  )
  const undoDraft = useCallback(
    () =>
      setDraftHistory((h) => {
        const next = undo(h)
        return { ...next, present: { ...next.present, fields: {} } }
      }),
    [],
  )
  const redoDraft = useCallback(
    () =>
      setDraftHistory((h) => {
        const next = redo(h)
        return { ...next, present: { ...next.present, fields: {} } }
      }),
    [],
  )
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [expanded, setExpanded] = useState(false)
  useUndoKeys(undoDraft, redoDraft, active && !opt.running)
  const latestDraft = useLatest(draft)
  const touched = useRef(false),
    savedIds = useRef(new Set<string>())
  const [hydrated, setHydrated] = useState(false),
    [draftStatus, setDraftStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [saved, setSaved] = useState<Record<string, string>>({}),
    [history, setHistory] = useState<SavedRunInfo[]>([]),
    [historyLoading, setHistoryLoading] = useState(true)
  const [notice, setNotice] = useState<{ text: string; error: boolean; details?: string[] } | null>(null),
    [storageError, setStorageError] = useState<string | null>(null),
    [importing, setImporting] = useState(false)
  const inspected = useMemo(() => {
    void lang
    return inspectOptimizationInput(draft.raw)
  }, [draft.raw, lang])
  const input = inspected.input
  const issues = useMemo(() => {
    void lang
    const numeric = Object.entries(draft.fields)
      .filter(([, v]) => numericDraftValue(v) === null)
      .map(([path]) => ({ path, message: tr('数値の入力を完了してください。', 'Complete this numeric value.') }))
    return [...numeric, ...inspected.issues].filter(
      (issue, i, all) => all.findIndex((v) => v.path === issue.path && v.message === issue.message) === i,
    )
  }, [draft.fields, inspected.issues, lang])
  const section = draft.section
  const ready = hydrated && !!input && !issues.length
  const latest = opt.runs[0]
  useLayoutEffect(() => {
    editor.current?.scrollTo({ top: 0 })
  }, [section])
  const refreshHistory = async () => {
    setHistoryLoading(true)
    try {
      setHistory(await listOptimizationRuns())
    } catch (error) {
      setStorageError(
        tr(
          '保存した実行を読み込めません。JSONファイルからの読込は利用できます。',
          'Saved runs could not be loaded. You can still import JSON files.',
        ),
      )
      void error
    } finally {
      setHistoryLoading(false)
    }
  }
  useEffect(() => {
    let alive = true
    loadOptimizationDraft()
      .then((value) => {
        if (alive && !touched.current && value)
          setDraft(() =>
            // Former preset ids (benchmarks, the old default) are no longer offered.
            value.preset !== 'custom' && value.preset !== FROM_SIMULATION && !(value.preset in optimizationPresets)
              ? {
                  ...value,
                  raw: optimizationPresets[DEFAULT_OPTIMIZATION_PRESET],
                  preset: DEFAULT_OPTIMIZATION_PRESET,
                  fields: {},
                  context: newCase('Assumed 80 t two-stage small launcher'),
                }
              : {
                  ...value,
                  context:
                    value.context ??
                    newCase(
                      inspectOptimizationInput(value.raw).input ? inputTitle(inspectOptimizationInput(value.raw).input!) : 'Optimization',
                    ),
                },
          )
      })
      .catch(() => {
        if (alive)
          setStorageError(
            tr(
              '下書きを復元できません。新しい入力はこのタブ内で編集できます。',
              'The draft could not be restored. You can edit a new input in this tab.',
            ),
          )
      })
      .finally(() => {
        if (alive) setHydrated(true)
      })
    void listOptimizationRuns()
      .then((values) => {
        if (alive) setHistory(values)
      })
      .catch(() => {
        if (alive)
          setStorageError(
            tr(
              '保存した実行を読み込めません。JSONからの読込は利用できます。',
              'Saved runs could not be loaded. You can still import JSON.',
            ),
          )
      })
      .finally(() => {
        if (alive) setHistoryLoading(false)
      })
    return () => {
      alive = false
    }
  }, [setDraft])
  useEffect(() => {
    if (!hydrated) return
    const timer = window.setTimeout(() => {
      void saveOptimizationDraft(draft)
        .then(() => {
          if (latestDraft.current === draft) setDraftStatus('saved')
        })
        .catch(() => {
          if (latestDraft.current === draft) setDraftStatus('error')
        })
    }, 150)
    return () => window.clearTimeout(timer)
  }, [draft, hydrated, latestDraft])
  useEffect(() => {
    for (const run of opt.runs) {
      if (savedIds.current.has(run.id)) continue
      savedIds.current.add(run.id)
      void saveOptimizationRun(run)
        .then((info) => {
          setSaved((old) => ({ ...old, [run.id]: 'saved' }))
          setHistory((old) => [info, ...old.filter((v) => v.id !== info.id)].sort((a, b) => b.createdAt - a.createdAt))
        })
        .catch(() => {
          savedIds.current.delete(run.id)
          setSaved((old) => ({ ...old, [run.id]: 'error' }))
          setStorageError(
            tr(
              '結果を端末に保存できませんでした。全結果JSONを保存してください。',
              'The result could not be saved on this device. Download the full result JSON.',
            ),
          )
        })
    }
  }, [opt.runs])
  const changeDraft = useCallback((update: (value: OptimizationDraft) => OptimizationDraft) => {
    touched.current = true
    const updatedAt = Date.now()
    setDraftStatus('saving')
    setDraftHistory((h) => {
      const old = h.present,
        next = update(old)
      const parsed = inspectOptimizationInput(next.raw).input
      const name = parsed ? inputTitle(parsed) : (old.context?.name ?? 'Optimization')
      const context =
        next.context !== old.context ? next.context : next.raw !== old.raw ? editCase(old.context ?? newCase(name), name) : old.context
      const present = { ...next, context, updatedAt }
      if (next.raw === old.raw && context === old.context) return { ...h, present }
      return commit(h, present, { key: next.context?.id !== old.context?.id ? undefined : 'edit' })
    })
  }, [])
  const edit = useCallback(
    (path: string, value: unknown) =>
      changeDraft((old) => {
        const current = inspectOptimizationInput(old.raw).input
        return current ? { ...old, raw: JSON.stringify(editOptimizationInput(current, path, value), null, 2), preset: 'custom' } : old
      }),
    [changeDraft],
  )
  const setField = useCallback(
    (path: string, value: NumericDraft | null) =>
      changeDraft((old) => {
        const fields = { ...old.fields }
        if (value) fields[path] = value
        else delete fields[path]
        return { ...old, fields }
      }),
    [changeDraft],
  )
  const onSection = useCallback((value: EditorSection) => changeDraft((old) => ({ ...old, section: value })), [changeDraft])
  const replace = useCallback(
    (update: (input: OptimizationInput) => OptimizationInput) =>
      changeDraft((old) => {
        const current = inspectOptimizationInput(old.raw).input
        return current ? { ...old, raw: JSON.stringify(update(current), null, 2), preset: 'custom' } : old
      }),
    [changeDraft],
  )
  const ctx = useMemo(
    () => ({ edit, replace, fields: draft.fields, setField, issues, disabled: opt.running }),
    [edit, replace, draft.fields, setField, issues, opt.running],
  )
  const loadInput = (raw: string, preset = 'custom', target: EditorSection = 'mission', context?: CaseContext) => {
    const parsed = inspectOptimizationInput(raw).input
    changeDraft(() => ({
      raw,
      fields: {},
      section: target,
      preset,
      updatedAt: Date.now(),
      context: context ?? newCase(parsed ? inputTitle(parsed) : 'Optimization'),
    }))
    setView('setup')
    setNotice(null)
  }
  const editInput = (value: OptimizationInput, context?: CaseContext) =>
    loadInput(JSON.stringify(withoutInitialGuess(value), null, 2), 'custom', 'mission', context)
  const focusIssue = (issue: InputIssue) => {
    const target = sectionForPath(issue.path)
    onSection(target)
    setView('setup')
    requestAnimationFrame(() => {
      editor.current?.querySelectorAll<HTMLDetailsElement>('details[data-opt-details]').forEach((d) => (d.open = true))
      const fields = Array.from(editor.current?.querySelectorAll<HTMLElement>('[data-opt-field]') ?? [])
      const found =
        fields.find((el) => el.dataset.optField === issue.path) ?? fields.find((el) => issue.path.startsWith(`${el.dataset.optField}.`))
      found?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      found?.querySelector<HTMLElement>('input,textarea,button,select')?.focus()
    })
  }
  const [runningInput, setRunningInput] = useState<OptimizationInput | null>(null)
  const [warm, setWarm] = useState(true)
  // A converged, validated earlier run of the same phase layout can seed the next solve.
  const warmFrom = latest?.result.converged && latest.result.validation?.status === 'passed' ? latest.result : null
  const warmAvailable = useMemo(() => !!(warmFrom && input && warmStartGuess(warmFrom, input, 1000)), [warmFrom, input])
  const run = (raw = draft.raw, seed: OptimizationResult | null = warm ? warmFrom : null) => {
    const check = inspectOptimizationInput(raw)
    if (!check.input || check.issues.length) {
      setNotice({ text: tr('入力の問題を修正してください。', 'Correct the input issues before running.'), error: true })
      return
    }
    const guess = seed ? warmStartGuess(seed, check.input) : null
    const solveRaw = guess ? withInitialGuess(raw, guess) : raw
    if (opt.run(solveRaw, draft.context)) {
      setRunningInput(guess ? (JSON.parse(solveRaw) as OptimizationInput) : check.input)
      showResults()
      setNotice(null)
    }
  }
  const refine = (result: OptimizationResult) => {
    try {
      const raw = refineFlightMesh(JSON.stringify(withoutInitialGuess(result.input)))
      loadInput(raw, 'custom', 'numerics', latest?.context)
      // The coarser solution is a good start for the finer mesh.
      run(raw, result.validation?.multi_stage ? result : null)
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : String(error), error: true })
    }
  }
  /** Reuse mission edits only for the same source case, so another rocket gets its own defaults. */
  const importFromSimulation = () => {
    if (opt.running) return
    const kind = optimizationKindFor(simConfig)
    const keep = !!input && input.problem.kind === kind && optimizationUsesSimulation(caseContext, simContext)
    const preset = optimizationPresets[kind === 'single_stage' ? 'single_stage' : DEFAULT_OPTIMIZATION_PRESET]
    const template = keep ? input : (JSON.parse(preset) as OptimizationInput)
    const converted = optimizationFromSimulation(simConfig, withoutInitialGuess(template), simContext, simFlight)
    if (!converted.ok) {
      setNotice({
        text: tr('軌道計算の機体を最適化に使えません。', 'The simulation vehicle cannot be used for optimization.'),
        error: true,
        details: converted.errors,
      })
      return
    }
    loadInput(JSON.stringify(converted.value, null, 2), FROM_SIMULATION, 'mission', converted.context)
    setNotice({
      text: tr(
        `軌道計算の機体「${simConfig.name}」を読み込みました。目標・制約は${keep ? '編集中の設定' : '例題'}を基に、機体に合わせて調整しています（詳細を確認してください）。`,
        `Loaded the simulation vehicle “${simConfig.name}”. The target and limits start from ${keep ? 'the current settings' : 'the example'}, adjusted to the vehicle (see the details).`,
      ),
      error: false,
      details: converted.notes,
    })
  }
  const openInSimulation = (result: OptimizationResult) => {
    const converted = simulationFromOptimization(result, opt.runs.find((r) => r.result === result)?.context)
    if (converted.ok) onOpenInSimulation(converted.value, converted.notes, converted.context)
    else setNotice({ text: converted.errors.join(' '), error: true })
  }
  const importFile = async (file: File) => {
    if (opt.running) {
      setNotice({ text: tr('実行が終わるか中断してから読み込んでください。', 'Finish or cancel the run before importing.'), error: true })
      return
    }
    setImporting(true)
    setNotice(null)
    try {
      if (file.size > MAX_OPTIMIZATION_FILE_BYTES)
        throw new Error(tr('ファイルは64 MiB以下にしてください。', 'Files must be at most 64 MiB.'))
      const data = readOptimizationFile(await file.text())
      if (data.kind === 'input') {
        loadInput(data.raw, 'custom', 'mission', data.context)
        setNotice({
          text: tr('入力を読み込みました。実行前に設定を確認してください。', 'Input loaded. Review it before running.'),
          error: false,
        })
      } else {
        opt.adopt(createOptimizationRun(data.result, 'import', data.context))
        showResults()
        setNotice({
          text: tr(
            '結果の記録を読み込みました。再求解・再検証はしていません。',
            'Recorded result loaded. It has not been re-solved or revalidated.',
          ),
          error: false,
        })
      }
    } catch (error) {
      setNotice({
        text:
          tr('読み込めませんでした。現在の設定・結果は保持しています。', 'Import failed; the current settings and results are unchanged.') +
          ' ' +
          (error instanceof Error ? error.message : String(error)),
        error: true,
      })
    } finally {
      setImporting(false)
    }
  }
  const historyAction = async (action: () => Promise<void>) => {
    try {
      await action()
      setNotice(null)
    } catch (error) {
      setNotice({
        text:
          tr('保存した実行を開けませんでした。', 'Could not open the saved run.') +
          ' ' +
          (error instanceof Error ? error.message : String(error)),
        error: true,
      })
    }
  }
  const statusLabels = {
    idle: ready ? tr('実行の準備ができました', 'Ready to run') : tr('入力を確認してください', 'Review the input'),
    loading: tr('最適化WASMを読み込み中…', 'Loading optimizer WASM…'),
    solving: tr('最適化を計算中（完了後に独立検証）', 'Optimizing (independent check follows)'),
    done:
      latest &&
      (!input ||
        issues.length > 0 ||
        latest.context?.id !== draft.context?.id ||
        requestFingerprint(input) !== requestFingerprint(latest.result.input))
        ? tr('設定に未実行の変更があります', 'Settings have unrun changes')
        : latest?.result.converged && latest.result.validation?.status === 'passed'
          ? tr('最適化・独立検証が完了', 'Optimization and validation complete')
          : tr('実行完了・結果を確認してください', 'Run finished; review the result'),
    cancelled: tr('中断しました（途中解は保存されません）', 'Cancelled (no intermediate solution saved)'),
    error: tr('入力・実行エラー', 'Input or execution error'),
  }
  const controlsActions = useLatest({ run, cancel: opt.cancel, importFromSimulation, importFile, loadInput, undoDraft, redoDraft })
  const [fallbackContext] = useState(() => newCase(input ? inputTitle(input) : 'Optimization'))
  const caseContext = draft.context ?? fallbackContext
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('dialog, [role=dialog]')) return
      if (
        !event.defaultPrevented &&
        active &&
        ready &&
        !opt.running &&
        (event.ctrlKey || event.metaKey) &&
        event.key === 'Enter' &&
        !event.isComposing
      ) {
        event.preventDefault()
        controlsActions.current.run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, ready, opt.running, controlsActions])
  const contextRef = useLatest(caseContext)
  const inputRef = useLatest(input)
  const latestRun = useLatest(latest)
  useEffect(() => {
    onControls({
      context: caseContext,
      running: opt.running,
      status: statusLabels[opt.status],
      iteration: opt.progress?.iteration ?? null,
      issueCount: issues.length,
      presets: rocketPresetOptions(),
      hasResult: !!latest,
      resultPassed: !!latest?.result.converged && latest.result.validation?.status === 'passed',
      ready: ready && !importing,
      run: () => controlsActions.current.run(),
      cancel: () => controlsActions.current.cancel(),
      fromSimulation: () => controlsActions.current.importFromSimulation(),
      preset: (id) => controlsActions.current.loadInput(optimizationPresets[id as OptimizationPresetId], id),
      showResults,
      showHistory,
      history: {
        canUndo: !!draftHistory.past.length && !opt.running,
        canRedo: !!draftHistory.future.length && !opt.running,
        undo: () => controlsActions.current.undoDraft(),
        redo: () => controlsActions.current.redoDraft(),
      },
      files: {
        base: fileBase(caseContext.name),
        optimization: true,
        busy: opt.running || importing,
        open: (files) => {
          if (files.length === 1) void controlsActions.current.importFile(files[0])
        },
        saveJson: () => saveFile(`${fileBase(contextRef.current.name)}_input.json`, latestDraft.current.raw, 'application/json'),
        saveCase: () => {
          const data = inputRef.current
          if (data)
            saveFile(`${fileBase(contextRef.current.name)}.otcase.json`, caseFile('optimize', contextRef.current, data), 'application/json')
        },
        saveResult: () => {
          const r = latestRun.current
          if (r) saveFile(`${fileBase(r.label)}_optimization.json`, JSON.stringify(r.result, null, 2), 'application/json')
        },
      },
    })
    // Actions read current refs; only the small header projection updates its parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onControls,
    draft.context,
    opt.running,
    opt.status,
    opt.progress?.iteration,
    ready,
    importing,
    issues.length,
    latest?.id,
    draftHistory.past.length,
    draftHistory.future.length,
    lang,
  ])
  return (
    <section
      aria-label={tr('軌道最適化', 'Trajectory optimization')}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing && ready && !opt.running) {
          event.preventDefault()
          run()
        }
      }}
      onDragEnter={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.stopPropagation()
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onDrop={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault()
          event.stopPropagation()
          if (event.dataTransfer.files.length === 1) void importFile(event.dataTransfer.files[0])
          else setNotice({ text: tr('JSONファイルを1つずつ読み込んでください。', 'Import one JSON file at a time.'), error: true })
        }
      }}
      className="flex h-full min-h-0 flex-col bg-bg text-ink"
    >
      {opt.error ? (
        <p
          role="alert"
          className="max-h-24 shrink-0 overflow-auto break-words border-b border-danger/20 bg-danger/5 px-4 py-2 text-[12px] text-danger"
        >
          {opt.error}
        </p>
      ) : null}
      {notice || storageError ? (
        <div
          className={cn(
            'flex shrink-0 items-start justify-between gap-2 border-b px-4 py-2 text-[12px]',
            notice?.error ? 'border-danger/20 bg-danger/5 text-danger' : 'border-line bg-surface-2 text-ink-2',
          )}
          role={notice?.error || storageError ? 'alert' : 'status'}
        >
          <div className="min-w-0 break-words">
            <p>{notice?.text ?? storageError}</p>
            {notice?.details?.length ? (
              <details open={notice.error} className="mt-1 text-[11px]">
                <summary className="cursor-pointer">{tr('変換・読込の詳細', 'Conversion/import details')}</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
                  {notice.details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
          <button
            type="button"
            className="shrink-0 rounded p-1"
            aria-label={tr('通知を閉じる', 'Dismiss notification')}
            onClick={() => {
              setNotice(null)
              setStorageError(null)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <aside
          ref={editor}
          className={cn(
            '@container scroll-quiet shrink-0 overflow-y-auto border-r border-line bg-surface-2',
            desktop ? (expanded ? 'w-[min(70vw,900px)]' : 'w-[400px]') : view === 'setup' ? 'w-full' : 'hidden',
          )}
        >
          <div className="sticky top-0 z-20 flex items-center border-b border-line bg-surface pl-1.5 pr-1">
            <OptTabs
              className="min-w-0 flex-1"
              variant="underline"
              value={section}
              onChange={onSection}
              label={tr('設定項目', 'Settings sections')}
              options={[
                { value: 'mission', label: tr('目標・概要', 'Mission') },
                { value: 'vehicle', label: tr('機体', 'Vehicle') },
                { value: 'sequence', label: tr('飛行', 'Flight') },
                { value: 'constraints', label: tr('拘束条件', 'Constraints') },
                { value: 'numerics', label: tr('詳細', 'Advanced') },
                { value: 'json', label: 'JSON' },
              ]}
            />
            {desktop ? (
              <IconButton
                label={expanded ? tr('設定欄を狭める', 'Narrow the settings') : tr('設定欄を広げる', 'Widen the settings')}
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </IconButton>
            ) : null}
          </div>
          <div className="space-y-3 p-3">
            {issues.length ? (
              <section className="rounded-[8px] border border-danger/25 bg-danger/5 p-3" aria-label={tr('入力の問題', 'Input issues')}>
                <p className="text-[12px] font-medium text-danger">
                  {tr(`${issues.length}件の入力を確認してください`, `${issues.length} input issues to review`)}
                </p>
                <ul className="mt-2 space-y-1">
                  {issues.slice(0, 6).map((issue, i) => (
                    <li key={`${issue.path}-${i}`}>
                      <button
                        type="button"
                        onClick={() => focusIssue(issue)}
                        className="block max-w-full break-words py-1 text-left text-[11px] text-danger underline underline-offset-2"
                      >
                        {issue.message}
                        {issue.path ? <span className="ml-1 text-danger/70">({issue.path})</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {section === 'json' ? (
              <section className="space-y-3 rounded-[9px] border border-line bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold">{tr('全入力JSON（SI単位）', 'Full input JSON (SI units)')}</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={optButton}
                      onClick={() =>
                        saveFile(`${fileBase(input ? inputTitle(input) : 'optimization')}_input.json`, draft.raw, 'application/json')
                      }
                    >
                      <ArrowDownToLine className="h-3.5 w-3.5" />
                      {tr('入力を保存', 'Save input')}
                    </button>
                    <button type="button" className={optButton} disabled={!input} onClick={() => onSection('mission')}>
                      {tr('フォームに戻る', 'Back to the form')}
                    </button>
                  </div>
                </div>
                <p className="text-[11px] leading-relaxed text-ink-3">
                  {tr(
                    'フォームにない空力テーブルやフェーズ構成も編集できます。不正な値は実行前に検査します。',
                    'Edit settings outside the form, such as aerodynamic tables and the phase layout. Invalid values are checked before running.',
                  )}
                </p>
                <label className="block text-[11px] text-ink-2">
                  {tr('入力JSON', 'Input JSON')}
                  <textarea
                    className="num mt-1 h-[min(60vh,38rem)] w-full rounded-[6px] border border-line bg-surface-2 p-3 text-[11px] text-ink"
                    maxLength={2 * 1024 * 1024}
                    spellCheck={false}
                    disabled={opt.running}
                    value={draft.raw}
                    onChange={(event) => changeDraft((old) => ({ ...old, raw: event.target.value, fields: {}, preset: 'custom' }))}
                  />
                </label>
              </section>
            ) : input ? (
              <OptimizationEditorContext.Provider value={ctx}>
                <OptimizationEditor input={input} section={section} onJson={() => onSection('json')} />
              </OptimizationEditorContext.Provider>
            ) : (
              <section className="rounded-[9px] border border-line bg-surface p-5">
                <p className="text-[12px] text-ink-2">
                  {tr(
                    '入力をフォームに表示できません。JSONの構文と必須項目を確認するか、機体を選び直してください。',
                    'The input cannot be shown as a form. Check its JSON syntax and required fields, or pick a vehicle again.',
                  )}
                </p>
                <button type="button" className={`${optButton} mt-3`} onClick={() => onSection('json')}>
                  {tr('JSONを編集', 'Edit JSON')}
                </button>
              </section>
            )}

            {section === 'mission' && input && isRocketInput(input.problem) ? (
              <>
                <VehicleSummary p={input.problem} />
                <p className="text-[11px] text-ink-3">
                  {tr(
                    '例題の機体諸元は仮定です。空力加熱・落下域・相対分離・6自由度の姿勢運動は評価していません。',
                    'Example vehicle data are assumed. Heating, impact regions, relative separation and 6-DoF attitude motion are not evaluated.',
                  )}
                </p>
              </>
            ) : null}
            {warmAvailable ? (
              <label className="flex min-h-10 items-start gap-2 text-[12px] text-ink-2">
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--signal)]"
                  checked={warm}
                  disabled={opt.running}
                  onChange={(e) => setWarm(e.target.checked)}
                />
                <span>
                  {tr('前回の結果を初期値に使う', 'Start from the previous result')}
                  <span className="block text-[11px] text-ink-3">
                    {tr('同じシーケンスの解を使って再計算を速めます。', 'Reuse a solution with the same sequence to accelerate the solve.')}
                  </span>
                </span>
              </label>
            ) : null}
            <p className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[10px] text-ink-3">
              <span className={draftStatus === 'error' ? 'text-danger' : undefined} role="status">
                {draftStatus === 'saved'
                  ? tr('下書きはこの端末に自動保存されます', 'The draft is saved on this device automatically')
                  : draftStatus === 'error'
                    ? tr('下書きを保存できませんでした', 'Draft storage failed')
                    : draftStatus === 'loading' && !hydrated
                      ? tr('下書きを復元中…', 'Restoring draft…')
                      : tr('下書きを保存中…', 'Saving draft…')}
              </span>
              <a href={`${import.meta.env.BASE_URL}optimization/NOTICE.md`} target="_blank" rel="noreferrer" className="underline">
                pounce / EPL-2.0
              </a>
            </p>
          </div>
        </aside>
        <main className={cn('flex min-w-0 flex-1 flex-col', !desktop && view === 'setup' && 'hidden')}>
          <OptimizationResults
            key={latest?.id ?? 'empty'}
            selectedTab={resultTab}
            onTab={setResultTab}
            runs={opt.runs}
            currentInput={input}
            draftIncomplete={issues.length > 0}
            onEdit={editInput}
            onRefine={refine}
            onSimulate={openInSimulation}
            onClearComparison={opt.clearComparison}
            running={opt.running}
            saved={saved}
            memoryBytes={opt.memoryBytes}
            active={active && (desktop || view !== 'setup')}
            historyCount={history.filter((r) => !r.archived).length}
            progress={
              opt.running && opt.live ? (
                <ProgressView
                  live={opt.live}
                  input={runningInput}
                  status={opt.status === 'loading' ? 'loading' : 'solving'}
                  onCancel={opt.cancel}
                />
              ) : undefined
            }
            history={
              <OptimizationHistory
                runs={history}
                loading={historyLoading}
                active={latest?.id}
                hasResult={!!latest}
                running={opt.running}
                onRefresh={refreshHistory}
                onOpen={(id) =>
                  historyAction(async () => {
                    const record = await loadOptimizationRun(id)
                    savedIds.current.add(record.id)
                    setSaved((old) => ({ ...old, [record.id]: 'saved' }))
                    opt.adopt(record)
                    showResults()
                  })
                }
                onCompare={(id) =>
                  historyAction(async () => {
                    const record = await loadOptimizationRun(id)
                    savedIds.current.add(record.id)
                    setSaved((old) => ({ ...old, [record.id]: 'saved' }))
                    opt.adopt(record, true)
                    setResultTab('compare')
                  })
                }
                onEdit={(id) =>
                  historyAction(async () => {
                    const record = await loadOptimizationRun(id)
                    editInput(record.result.input, record.context)
                  })
                }
                onArchive={(id, value) =>
                  historyAction(async () => {
                    await archiveOptimizationRun(id, value)
                    setHistory((old) => old.map((info) => (info.id === id ? { ...info, archived: value } : info)))
                  })
                }
                onExport={(id) =>
                  historyAction(async () => {
                    const record = await loadOptimizationRun(id)
                    saveFile(
                      `${fileBase(record.label)}_result.otcase.json`,
                      caseFile('optimize', record.context ?? newCase(record.label), record.result),
                      'application/json',
                    )
                  })
                }
              />
            }
          />
        </main>
      </div>
      {!desktop ? (
        <WorkspaceNav
          value={view === 'setup' ? 'params' : resultTab === 'history' ? null : resultTab === 'map' ? 'globe' : 'charts'}
          onChange={(v) => {
            setView(v === 'params' ? 'setup' : 'results')
            if (v !== 'params') setResultTab(v === 'globe' ? 'map' : 'charts')
          }}
        />
      ) : null}
    </section>
  )
}
