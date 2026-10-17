import type { ReactNode } from 'react'
import type { ClientConfig, ClientStageConfig } from '../../lib/simulation'
import { cn } from '../../lib/cn'

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

export function Group({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1 border-b border-line pb-1.5 text-[12px] font-semibold text-ink">{title}</h3>
      {note && <p className="mb-1.5 mt-1.5 text-[11px] leading-relaxed text-ink-3">{note}</p>}
      {children}
    </section>
  )
}
