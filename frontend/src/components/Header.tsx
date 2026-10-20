import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Info, Orbit, Play, Redo2, Square, Target, Undo2 } from 'lucide-react'
import type { RunStatus } from '../hooks/useSimulation'
import { useDismiss } from '../hooks/useDismiss'
import type { ValidationIssue } from '../lib/validation'
import { cn } from '../lib/cn'
import { IconButton } from './primitives'
import { VehiclePicker } from './VehiclePicker'
import { FileMenu, type FileActions } from './FileMenu'
import { tr } from '../lib/i18n'
import type { CaseContext, Workspace } from '../lib/case'
import type { OptimizationControls } from '../lib/workspace'
import { optButton, optPrimary } from './optimization/styles'

/** The two solvers that share one vehicle model. */
export type { Workspace } from '../lib/case'

export function Header(props: {
  workspace: Workspace
  context: CaseContext
  optimization: OptimizationControls | null
  onCaseDetails: () => void
  onWorkspace: (w: Workspace) => void
  name: string
  presetId: string
  onPreset: (id: string) => void
  onBlank: () => void
  files: FileActions
  hasResult: boolean
  status: RunStatus
  error: string | null
  issues: ValidationIssue[]
  onIssue: (i: ValidationIssue) => void
  compact: boolean
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void }
  /** Help, language and theme, placed after the file menu */
  actions?: ReactNode
}) {
  const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'
  const simulating = props.workspace === 'simulate'
  const opt = props.optimization
  const history = simulating ? props.history : opt?.history
  const context = simulating ? props.context : opt?.context
  const source = context?.history[context.history.length - 1]
  return (
    <header className="relative z-30 flex h-12 shrink-0 items-center gap-1 border-b border-line bg-surface px-2 sm:gap-1.5 sm:px-3">
      <span className="mr-1 hidden shrink-0 text-[14px] font-semibold tracking-tight xl:block">OpenTsiolkovsky</span>
      <WorkspaceSwitch value={props.workspace} onChange={props.onWorkspace} optimizing={!!opt?.running} />
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <div className="flex min-w-0 max-w-[28rem] items-center">
          {simulating ? (
            <VehiclePicker name={props.name} presetId={props.presetId} onPreset={props.onPreset} onBlank={props.onBlank} />
          ) : opt ? (
            <Menu
              align="left"
              wide
              trigger={(toggle) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-haspopup="menu"
                  className="flex h-9 min-w-0 max-w-full items-center gap-2 rounded-[6px] px-2 text-left hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate text-[13px] font-medium">{opt.context.name}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                </button>
              )}
              items={[
                ...opt.presets.map((p) => ({
                  label: tr(`例題：${p.label}`, `Example: ${p.label}`),
                  onSelect: () => opt.preset(p.id),
                  disabled: opt.running,
                })),
                {
                  label: tr('軌道計算の機体から作成', 'From the simulation vehicle'),
                  onSelect: opt.fromSimulation,
                  disabled: opt.running,
                },
                { label: tr('保存した実行を開く…', 'Open a saved run…'), onSelect: opt.showHistory },
              ]}
            />
          ) : (
            <span className="px-2 text-[12px] text-ink-3">{tr('読み込み中…', 'Loading…')}</span>
          )}
        </div>
        <IconButton
          label={
            context
              ? `${tr('ケース情報・質量内訳・変換履歴', 'Case details, masses and conversion history')} (${context.id.slice(0, 6)} · r${context.revision}${
                  source ? ` · ${tr('由来', 'from')} ${source.sourceName}` : ''
                })`
              : tr('ケース情報', 'Case details')
          }
          onClick={props.onCaseDetails}
          disabled={!context}
        >
          <Info className="h-4 w-4" />
        </IconButton>
        <div className="hidden shrink-0 items-center sm:flex">
          <IconButton label={tr(`元に戻す (${mod}Z)`, `Undo (${mod}Z)`)} onClick={history?.undo} disabled={!history?.canUndo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label={tr(`やり直す (${mod}⇧Z)`, `Redo (${mod}⇧Z)`)} onClick={history?.redo} disabled={!history?.canRedo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {simulating ? <StatusIndicator {...props} /> : null}
        {!simulating && opt ? (
          <button
            type="button"
            className={cn(opt.running ? optButton : optPrimary, 'max-sm:px-2')}
            disabled={!opt.running && !opt.ready}
            onClick={opt.running ? opt.cancel : opt.run}
            title={opt.running ? opt.status : opt.ready ? tr('⌘/Ctrl+Enterでも実行できます', '⌘/Ctrl+Enter also runs') : opt.status}
          >
            {opt.running ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span className="max-sm:sr-only">{opt.running ? tr('中断', 'Cancel') : tr('最適化を実行', 'Run optimization')}</span>
            {opt.running && opt.iteration !== null ? <span className="num text-ink-3 max-md:hidden">{opt.iteration}</span> : null}
          </button>
        ) : null}
        {simulating ? (
          <FileMenu files={props.files} hasResult={props.hasResult} />
        ) : opt ? (
          <FileMenu files={opt.files} hasResult={opt.hasResult} />
        ) : null}
        {props.actions}
      </div>
    </header>
  )
}

function WorkspaceSwitch({ value, onChange, optimizing }: { value: Workspace; onChange: (w: Workspace) => void; optimizing: boolean }) {
  const items = [
    ['simulate', tr('軌道計算', 'Simulation'), Orbit],
    ['optimize', tr('軌道最適化', 'Optimization'), Target],
  ] as const
  return (
    <div role="tablist" aria-label={tr('機能', 'Workspace')} className="flex shrink-0 rounded-[8px] bg-surface-2 p-0.5">
      {items.map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={value === id}
          tabIndex={value === id ? 0 : -1}
          onKeyDown={(e) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
              e.preventDefault()
              const next = e.key === 'Home' ? 'simulate' : e.key === 'End' ? 'optimize' : value === 'simulate' ? 'optimize' : 'simulate'
              onChange(next)
              const tabs = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role=tab]')
              tabs?.[next === 'simulate' ? 0 : 1]?.focus()
            }
          }}
          title={id === 'optimize' && optimizing ? tr('軌道最適化（実行中）', 'Optimization (running)') : label}
          onClick={() => onChange(id)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-[6px] px-2 text-[12px] transition-colors',
            value === id ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(0,0,0,0.12)]' : 'text-ink-3 hover:text-ink',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {id === 'optimize' && optimizing ? (
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" aria-label={tr('最適化実行中', 'Optimization running')} />
          ) : null}
          <span className={value === id ? 'max-sm:sr-only' : 'max-md:sr-only'}>{label}</span>
        </button>
      ))}
    </div>
  )
}

function StatusIndicator({
  status,
  error,
  issues,
  onIssue,
  compact,
}: {
  status: RunStatus
  error: string | null
  issues: ValidationIssue[]
  onIssue: (i: ValidationIssue) => void
  compact: boolean
}) {
  // Runs usually finish in a blink, so nothing is shown when the result is up to
  // date, and "Computing" only appears once a run has taken a noticeable time.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (status !== 'running') return
    const id = setTimeout(() => setSlow(true), 400)
    return () => {
      clearTimeout(id)
      setSlow(false)
    }
  }, [status])
  if (status === 'ok' || (status === 'running' && !slow)) return null

  const dot = {
    running: 'bg-ink-3 animate-pulse',
    invalid: 'bg-danger',
    error: 'bg-danger',
  }[status]

  const text =
    status === 'running'
      ? compact
        ? ''
        : tr('計算中', 'Computing')
      : status === 'invalid'
        ? tr(`入力エラー ${issues.length}件`, `${issues.length} input error${issues.length === 1 ? '' : 's'}`)
        : tr('計算エラー', 'Solver error')

  const body = (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {text && <span className="num whitespace-nowrap">{text}</span>}
    </span>
  )

  if (status === 'invalid' || status === 'error') {
    return (
      <Menu
        align="right"
        trigger={(toggle) => (
          <button type="button" onClick={toggle} className="flex h-8 items-center rounded-[6px] px-2 hover:bg-surface-2">
            {body}
          </button>
        )}
        items={
          status === 'invalid'
            ? issues.map((i) => ({ label: i.message, onSelect: () => onIssue(i) }))
            : [{ label: error ?? tr('不明なエラー', 'Unknown error'), onSelect: () => {} }]
        }
        wide
      />
    )
  }
  return <div className="flex h-8 items-center px-2">{body}</div>
}

export function Menu({
  trigger,
  items,
  align = 'right',
  wide = false,
}: {
  trigger: (toggle: () => void) => ReactNode
  items: { label: string; onSelect: () => void; disabled?: boolean }[]
  align?: 'left' | 'right'
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  return (
    <div ref={ref} className="relative min-w-0">
      {trigger(() => setOpen((v) => !v))}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-50 mt-1 overflow-hidden rounded-[8px] border border-line bg-surface py-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]',
            align === 'right' ? 'right-0' : 'left-0',
            wide ? 'w-[min(22rem,90vw)]' : 'w-52',
          )}
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className="block w-full px-3 py-1.5 text-left text-[12px] leading-snug text-ink hover:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-transparent"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
