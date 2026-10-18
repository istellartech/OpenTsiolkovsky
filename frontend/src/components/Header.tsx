import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Redo2, Undo2 } from 'lucide-react'
import type { RunStatus } from '../hooks/useSimulation'
import { useDismiss } from '../hooks/useDismiss'
import type { ValidationIssue } from '../lib/validation'
import { cn } from '../lib/cn'
import { IconButton } from './primitives'
import { VehiclePicker } from './VehiclePicker'
import { FileMenu, type FileActions } from './FileMenu'
import { tr } from '../lib/i18n'

export function Header(props: {
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
  /** Extra buttons placed before the file menu */
  actions?: ReactNode
}) {
  const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+'
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 sm:px-3">
      <div className="hidden shrink-0 items-baseline gap-2 pl-1 sm:flex">
        <span className="text-[14px] font-semibold tracking-tight">OpenTsiolkovsky</span>
      </div>
      <div className="mx-1 hidden h-5 w-px shrink-0 bg-line sm:block" />
      <VehiclePicker name={props.name} presetId={props.presetId} onPreset={props.onPreset} onBlank={props.onBlank} />
      <div className="hidden shrink-0 items-center sm:flex">
        <IconButton label={tr(`元に戻す (${mod}Z)`, `Undo (${mod}Z)`)} onClick={props.history.undo} disabled={!props.history.canUndo}>
          <Undo2 className="h-4 w-4" />
        </IconButton>
        <IconButton label={tr(`やり直す (${mod}⇧Z)`, `Redo (${mod}⇧Z)`)} onClick={props.history.redo} disabled={!props.history.canRedo}>
          <Redo2 className="h-4 w-4" />
        </IconButton>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <StatusIndicator {...props} />
        {props.actions}
        <FileMenu files={props.files} hasResult={props.hasResult} />
      </div>
    </header>
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
    <div ref={ref} className="relative">
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
