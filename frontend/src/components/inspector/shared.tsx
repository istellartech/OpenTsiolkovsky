import { useId, useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { ClientConfig, ClientStageConfig } from '../../lib/simulation'
import { cn } from '../../lib/cn'
import { InfoButton } from '../primitives'
import { tr } from '../../lib/i18n'

export type Patch = (fn: (c: ClientConfig) => ClientConfig) => void

export const pad2 = (n: number) => String(n).padStart(2, '0')

/** Validation keys: the first stage is `stage.*`, later ones `stage[n].*` (1-based). */
export const stagePath = (i: number, key: keyof ClientStageConfig) => (i === 0 ? `stage.${key}` : `stage[${i + 1}].${key}`)

export function Readout({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-ink-3">{k}</dt>
      <dd className={cn('num', warn ? 'text-danger' : 'text-ink')}>{v}</dd>
    </div>
  )
}

interface GroupProps {
  title: string
  note?: ReactNode
  children: ReactNode
  /** Fold the group behind its heading; closed groups open themselves when an issue inside is focused. */
  collapsible?: boolean
  defaultOpen?: boolean
  /** Controlled open state (optional). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Short state shown at the right of the heading, e.g. "on" or "2 cases". */
  badge?: ReactNode
  className?: string
}

export function Group({ title, note, children, collapsible, defaultOpen = true, open, onOpenChange, badge, className }: GroupProps) {
  const [own, setOwn] = useState(defaultOpen)
  const isOpen = open ?? own
  // A long explanation stays behind an ⓘ toggle so the fields come first; a one-liner stays visible.
  const [showNote, setShowNote] = useState(false)
  const noteId = useId()
  const shortNote = typeof note === 'string' && note.length <= 40
  const info =
    note && !shortNote ? (
      <InfoButton open={showNote} onToggle={() => setShowNote((v) => !v)} controls={noteId} label={tr('説明', 'About this section')} />
    ) : null
  const noteEl = shortNote ? (
    <p className="mb-1.5 mt-1.5 text-[11px] leading-relaxed text-ink-3">{note}</p>
  ) : (
    note &&
    showNote && (
      <p id={noteId} className="mb-1.5 mt-1.5 rounded-[6px] bg-surface-2 px-2 py-1.5 text-[11px] leading-relaxed text-ink-2">
        {note}
      </p>
    )
  )
  if (!collapsible) {
    return (
      <section className={cn('mb-5', className)}>
        <h3 className="mb-1 flex items-center gap-1 border-b border-line pb-1.5 text-[12px] font-semibold text-ink">
          {title}
          {info}
        </h3>
        {noteEl}
        {children}
      </section>
    )
  }
  return (
    <details
      open={isOpen}
      onToggle={(e) => {
        const next = e.currentTarget.open
        if (next === isOpen) return
        setOwn(next)
        onOpenChange?.(next)
      }}
      className={cn('group/fold', isOpen ? 'mb-5' : 'mb-2', className)}
    >
      <summary className="mb-1 flex cursor-pointer list-none items-center gap-1 border-b border-line pb-1.5 text-[12px] font-semibold text-ink select-none hover:text-ink-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="-ml-0.5 h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform group-open/fold:rotate-90" aria-hidden />
        <span className="flex min-w-0 flex-1 items-center gap-1">
          {title}
          {info}
        </span>
        {badge && <span className="min-w-0 truncate text-[11px] font-normal text-ink-3">{badge}</span>}
      </summary>
      {noteEl}
      {children}
    </details>
  )
}
