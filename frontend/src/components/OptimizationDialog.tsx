import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, FolderOpen, Play, Square, Target, X } from 'lucide-react'
import { IconButton } from './primitives'
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
} from '../lib/optimization-input'
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
import { optimizationPresetOptions, optimizationPresets } from '../lib/optimization-presets'
import { MassInventory, OptimizationEditor } from './optimization/OptimizationEditor'
import { OptimizationHistory } from './optimization/OptimizationHistory'
import { OptimizationResults } from './optimization/OptimizationResults'
import { OptTabs } from './optimization/controls'
import { OptimizationEditorContext } from './optimization/editor-context'
import { editorSections } from './optimization/editor-sections'
import { optButton, optInput, optPrimary } from './optimization/styles'
import { cn } from '../lib/cn'

type View = 'setup' | 'results' | 'history'
export function OptimizationDialog({ onClose, onNotice }: { onClose: () => void; onNotice?: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null),
    editor = useRef<HTMLDivElement>(null),
    fileInput = useRef<HTMLInputElement>(null)
  const lang = useLang(),
    opt = useOptimization()
  const [view, setView] = useState<View>('setup')
  const [draft, setDraft] = useState<OptimizationDraft>(() => ({
    raw: optimizationPresets.multi_stage,
    fields: {},
    section: 'mission',
    preset: 'multi_stage',
    updatedAt: Date.now(),
  }))
  const latestDraft = useLatest(draft)
  const touched = useRef(false),
    savedIds = useRef(new Set<string>())
  const [hydrated, setHydrated] = useState(false),
    [draftStatus, setDraftStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')
  const [saved, setSaved] = useState<Record<string, string>>({}),
    [history, setHistory] = useState<SavedRunInfo[]>([]),
    [historyLoading, setHistoryLoading] = useState(true)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null),
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
  const sections = editorSections().filter(
    (section) => !input || isRocketInput(input.problem) || section.id === 'mission' || section.id === 'json',
  )
  const section = sections.some((s) => s.id === draft.section) ? draft.section : 'mission'
  const ready = hydrated && !!input && !issues.length
  const latest = opt.runs[0]
  useLayoutEffect(() => {
    editor.current?.scrollTo({ top: 0 })
  }, [view, section, latest?.id])
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
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  useEffect(() => {
    let alive = true
    loadOptimizationDraft()
      .then((value) => {
        if (alive && !touched.current && value) setDraft(value)
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
  }, [])
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
    setDraft((old) => ({ ...update(old), updatedAt }))
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
  const ctx = useMemo(
    () => ({ edit, fields: draft.fields, setField, issues, disabled: opt.running }),
    [edit, draft.fields, setField, issues, opt.running],
  )
  const loadInput = (raw: string, preset = 'custom', target: EditorSection = 'mission') => {
    changeDraft(() => ({ raw, fields: {}, section: target, preset, updatedAt: Date.now() }))
    setView('setup')
    setNotice(null)
  }
  const editInput = (value: OptimizationInput) => loadInput(JSON.stringify(value, null, 2))
  const focusIssue = (issue: InputIssue) => {
    const target = sectionForPath(issue.path)
    onSection(target)
    setView('setup')
    requestAnimationFrame(() => {
      const fields = Array.from(editor.current?.querySelectorAll<HTMLElement>('[data-opt-field]') ?? [])
      const found =
        fields.find((el) => el.dataset.optField === issue.path) ?? fields.find((el) => issue.path.startsWith(`${el.dataset.optField}.`))
      found?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      found?.querySelector<HTMLElement>('input,textarea,button,select')?.focus()
    })
  }
  const run = (raw = draft.raw) => {
    const check = inspectOptimizationInput(raw)
    if (!check.input || check.issues.length) {
      setNotice({ text: tr('入力の問題を修正してください。', 'Correct the input issues before running.'), error: true })
      return
    }
    if (opt.run(raw)) {
      setView('results')
      setNotice(null)
    }
  }
  const refine = (value: OptimizationInput) => {
    try {
      const raw = refineFlightMesh(JSON.stringify(value))
      loadInput(raw, 'custom', 'numerics')
      run(raw)
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : String(error), error: true })
    }
  }
  const close = async () => {
    opt.cancel()
    if (hydrated) {
      try {
        await saveOptimizationDraft(latestDraft.current)
      } catch {
        onNotice?.(
          tr('下書きを端末に保存できませんでした。このタブ内には保持します。', 'Draft storage failed. It is retained within this tab.'),
        )
      }
    }
    onClose()
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
        loadInput(data.raw)
        setNotice({
          text: tr('入力を読み込みました。実行前に設定を確認してください。', 'Input loaded. Review it before running.'),
          error: false,
        })
      } else {
        opt.adopt(createOptimizationRun(data.result, 'import'))
        setView('results')
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
    solving: tr('求解・独立検証中', 'Solving and independently validating'),
    done: tr('実行結果を確認できます', 'Results are available'),
    cancelled: tr('中断しました（途中解は保存されません）', 'Cancelled (no intermediate solution saved)'),
    error: tr('入力・実行エラー', 'Input or execution error'),
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="optimization-title"
      onCancel={(event) => {
        event.preventDefault()
        void close()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
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
      className="m-auto flex h-[min(94dvh,72rem)] max-h-none w-[min(94rem,97vw)] max-w-none flex-col overflow-hidden rounded-[12px] border border-line bg-bg text-ink shadow-xl backdrop:bg-black/45 max-sm:h-[100dvh] max-sm:w-screen max-sm:rounded-none"
    >
      <header className="shrink-0 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="rounded-[8px] bg-signal/10 p-2 text-signal">
              <Target className="h-4 w-4" />
            </span>
            <div>
              <h2 id="optimization-title" className="text-[15px] font-semibold">
                {tr('軌道最適化', 'Trajectory optimization')}
              </h2>
              <p className="mt-0.5 text-[11px] text-ink-3">
                {tr('設定 → 求解 → 独立検証 → 比較', 'Configure → solve → validate → compare')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              disabled={opt.running || importing}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void importFile(file)
              }}
            />
            <button type="button" className={optButton} disabled={opt.running || importing} onClick={() => fileInput.current?.click()}>
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{importing ? tr('読込中…', 'Importing…') : tr('JSONを読み込む', 'Import JSON')}</span>
              <span className="sm:hidden">{tr('読込', 'Import')}</span>
            </button>
            <IconButton
              label={tr('閉じる（実行中は中断）', 'Close (cancels any running solve)')}
              onClick={() => void close()}
              className="h-10 w-10"
            >
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <OptTabs
            value={view}
            onChange={setView}
            label={tr('最適化ワークスペース', 'Optimization workspace')}
            options={[
              { value: 'setup', label: tr('設定', 'Settings') },
              { value: 'results', label: `${tr('結果', 'Results')}${latest ? ` · ${opt.runs.length}` : ''}` },
              {
                value: 'history',
                label: `${tr('保存した実行', 'Saved runs')}${history.length ? ` · ${history.filter((r) => !r.archived).length}` : ''}`,
              },
            ]}
          />
          <span className="hidden text-[10px] text-ink-3 sm:block">
            {tr('数値実証用 · ZERO実機性能の評価ではありません', 'Numerical demonstrator · not a ZERO performance assessment')}
          </span>
        </div>
      </header>
      {notice || storageError ? (
        <div
          className={cn(
            'flex shrink-0 items-start justify-between gap-2 border-b px-4 py-2 text-[12px]',
            notice?.error ? 'border-danger/20 bg-danger/5 text-danger' : 'border-line bg-surface-2 text-ink-2',
          )}
          role={notice?.error || storageError ? 'alert' : 'status'}
        >
          <p className="min-w-0 break-words">{notice?.text ?? storageError}</p>
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
      <main className="scroll-quiet min-h-0 flex-1 overflow-y-auto" ref={editor}>
        <div hidden={view !== 'setup'} className="h-full">
          <div className="grid min-h-full grid-cols-[minmax(0,1fr)] lg:grid-cols-[180px_minmax(0,1fr)]">
            <nav
              aria-label={tr('最適化の設定項目', 'Optimization settings sections')}
              className="min-w-0 border-b border-line bg-surface-2 p-2 lg:border-b-0 lg:border-r lg:p-3"
            >
              <div className="flex gap-1 overflow-x-auto lg:sticky lg:top-3 lg:flex-col">
                {sections.map((s) => {
                  const count = issues.filter((i) => sectionForPath(i.path) === s.id).length
                  return (
                    <button
                      key={s.id}
                      type="button"
                      aria-current={section === s.id ? 'step' : undefined}
                      onClick={() => onSection(s.id)}
                      className={cn(
                        'flex shrink-0 items-center justify-between gap-2 rounded-[7px] px-3 py-2.5 text-left text-[12px]',
                        section === s.id
                          ? 'bg-surface font-medium text-ink shadow-[0_0_0_1px_var(--line)]'
                          : 'text-ink-2 hover:bg-surface/70',
                      )}
                    >
                      <span>
                        <span className="block whitespace-nowrap">{s.label}</span>
                        <span className="mt-0.5 hidden text-[10px] font-normal text-ink-3 lg:block">{s.description}</span>
                      </span>
                      {count ? <span className="num rounded-full bg-danger/10 px-1.5 text-[10px] text-danger">{count}</span> : null}
                    </button>
                  )
                })}
              </div>
            </nav>
            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_260px] sm:p-5">
              <div className="min-w-0 space-y-4">
                <section className="rounded-[9px] border border-line bg-surface p-4">
                  <label className="block text-[11px] font-medium text-ink-2">
                    {tr('機体・ケースを選択', 'Choose a vehicle / case')}
                    <select
                      className={`${optInput} mt-1.5`}
                      value={draft.preset in optimizationPresets ? draft.preset : 'custom'}
                      disabled={opt.running}
                      onChange={(event) => {
                        const key = event.target.value as keyof typeof optimizationPresets
                        loadInput(optimizationPresets[key], key)
                      }}
                    >
                      <option value="custom" disabled>
                        {tr('編集した入力', 'Edited input')}
                      </option>
                      {optimizationPresetOptions().map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </section>
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
                            {issue.path ? `${issue.path}: ` : ''}
                            {issue.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {issues.length > 6 ? (
                      <p className="mt-1 text-[11px] text-danger">
                        {tr('ほかの問題は各設定項目で確認できます。', 'Other issues are shown in their settings sections.')}
                      </p>
                    ) : null}
                  </section>
                ) : null}
                {section === 'json' ? (
                  <section className="space-y-3 rounded-[9px] border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[14px] font-semibold">{tr('全入力JSON（SI単位）', 'Full input JSON (SI units)')}</h3>
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
                    </div>
                    <p className="text-[11px] leading-relaxed text-ink-3">
                      {tr(
                        'フォームにない空力テーブルや構成も保持します。未対応の項目や不正な値は実行前に検査します。',
                        'Settings outside the form, including aerodynamic tables and topology, are preserved. Unsupported fields and invalid values are checked before running.',
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
                    <OptimizationEditor input={input} section={section} onSection={onSection} />
                  </OptimizationEditorContext.Provider>
                ) : (
                  <section className="rounded-[9px] border border-line bg-surface p-5">
                    <p className="text-[12px] text-ink-2">
                      {tr(
                        '入力をフォームに表示できません。JSON・詳細で構文と必須項目を確認するか、プリセットを読み込んでください。',
                        'The input cannot be displayed as a form. Check its JSON syntax and required fields, or load a preset.',
                      )}
                    </p>
                    <button type="button" className={`${optButton} mt-3`} onClick={() => onSection('json')}>
                      {tr('JSONを編集', 'Edit JSON')}
                    </button>
                  </section>
                )}
              </div>
              <aside className="min-w-0 space-y-3 xl:sticky xl:top-5 xl:self-start">
                <section className="rounded-[9px] border border-line bg-surface p-4">
                  <h3 className="text-[12px] font-semibold">{tr('実行する問題', 'Problem to solve')}</h3>
                  <p className="mt-2 break-words text-[13px]">{input ? inputTitle(input) : '—'}</p>
                  <p className="mt-1 text-[11px] text-ink-3">{input?.problem.kind ?? '—'}</p>
                  {input && isRocketInput(input.problem) ? (
                    <div className="mt-4 border-t border-line pt-3">
                      <MassInventory p={input.problem} />
                    </div>
                  ) : null}
                  <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
                    {tr(
                      '実行時に入力のコピーを固定します。求解結果と独立再積分の判定は別々に表示します。',
                      'Each run freezes a copy of its input. Solver convergence and independent validation are reported separately.',
                    )}
                  </p>
                </section>
                <section className="rounded-[8px] border border-line p-3 text-[11px] leading-relaxed text-ink-3">
                  <p>
                    {tr(
                      '熱・落下域・相対分離・6DoF・再着火資源は未評価です。',
                      'Thermal, range, relative separation, 6DoF and restart resources remain unevaluated.',
                    )}
                  </p>
                  <a
                    href={`${import.meta.env.BASE_URL}optimization/NOTICE.md`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block underline"
                  >
                    pounce 0.12.0 / EPL-2.0
                  </a>
                </section>
              </aside>
            </div>
          </div>
        </div>
        {view === 'results' ? (
          <div className="mx-auto max-w-[88rem] p-4 sm:p-5">
            <OptimizationResults
              key={latest?.id ?? 'empty'}
              runs={opt.runs}
              currentInput={input}
              draftIncomplete={issues.length > 0}
              onEdit={editInput}
              onRefine={refine}
              onClearComparison={opt.clearComparison}
              running={opt.running}
              saved={saved}
              memoryBytes={opt.memoryBytes}
            />
          </div>
        ) : null}
        {view === 'history' ? (
          <div className="mx-auto max-w-[76rem] p-4 sm:p-5">
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
                  setView('results')
                })
              }
              onCompare={(id) =>
                historyAction(async () => {
                  const record = await loadOptimizationRun(id)
                  savedIds.current.add(record.id)
                  setSaved((old) => ({ ...old, [record.id]: 'saved' }))
                  opt.adopt(record, true)
                  setView('results')
                })
              }
              onEdit={(id) =>
                historyAction(async () => {
                  const record = await loadOptimizationRun(id)
                  editInput(record.result.input)
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
                  saveFile(`${fileBase(record.label)}_optimization.json`, JSON.stringify(record.result, null, 2), 'application/json')
                })
              }
            />
          </div>
        ) : null}
      </main>
      <footer className="shrink-0 border-t border-line bg-surface px-4 py-3 sm:px-5">
        {opt.error ? (
          <p role="alert" className="mb-2 max-h-24 overflow-auto break-words text-[11px] text-danger">
            {opt.error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1" role="status" aria-live="polite">
            <p className="flex items-center gap-2 text-[12px] text-ink-2">
              {opt.running ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-signal" />
              ) : (
                <span className={`h-1.5 w-1.5 rounded-full ${issues.length ? 'bg-danger' : 'bg-[var(--ok)]'}`} />
              )}{' '}
              {statusLabels[opt.status]}
            </p>
            {opt.progress ? (
              <p className="num mt-1 break-words text-[10px] text-ink-3">
                {tr('反復', 'Iteration')} {opt.progress.iteration} · f={opt.progress.objective.toPrecision(7)} ·{' '}
                {tr('制約残差', 'primal residual')}={opt.progress.primal_infeasibility.toExponential(2)} (NLP)
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-ink-3">
                {ready ? tr('入力の事前検査が通りました', 'Input preflight passed') : tr('入力を確認してください', 'Review the input')} ·{' '}
                {tr('⌘/Ctrl+Enterで実行', '⌘/Ctrl+Enter to run')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('max-w-24 text-[10px] sm:max-w-none', draftStatus === 'error' ? 'text-danger' : 'text-ink-3')}>
              {draftStatus === 'saved'
                ? tr('下書き保存済み', 'Draft saved')
                : draftStatus === 'error'
                  ? tr('下書き保存に失敗', 'Draft storage failed')
                  : draftStatus === 'loading' && !hydrated
                    ? tr('下書き復元中', 'Restoring draft')
                    : tr('下書き保存中…', 'Saving draft…')}
            </span>
            {opt.running ? (
              <button type="button" className={optButton} onClick={opt.cancel}>
                <Square className="h-3.5 w-3.5" />
                {tr('中断', 'Cancel')}
              </button>
            ) : (
              <button
                type="button"
                className={optPrimary}
                disabled={!ready || importing}
                title={input ? tr(`設定タブの入力を実行: ${inputTitle(input)}`, `Run the settings input: ${inputTitle(input)}`) : undefined}
                onClick={() => run()}
              >
                <Play className="h-3.5 w-3.5" />
                {view === 'setup' ? tr('最適化を実行', 'Run optimization') : tr('設定を実行', 'Run settings')}
              </button>
            )}
          </div>
        </div>
      </footer>
    </dialog>
  )
}
