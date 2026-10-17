import { Suspense, lazy, type ReactNode } from 'react'
import { Pin, X } from 'lucide-react'
import type { Track } from '../lib/trajectory'
import { fmt } from '../lib/format'
import { cn } from '../lib/cn'
import { Segmented } from './primitives'
import { tr } from '../lib/i18n'

const ChartGrid = lazy(() => import('./Charts').then((m) => ({ default: m.ChartGrid })))
const EventList = lazy(() => import('./Charts').then((m) => ({ default: m.EventList })))

/** An earlier result kept on screen to compare against. */
export interface Reference {
  track: Track
  label: string
}

export interface CompareProps {
  reference: Reference | null
  onPin: () => void
  onUnpin: () => void
}

export type PanelTab = 'charts' | 'events'

export function BottomPanel({
  tab,
  onTab,
  track,
  layoutSwitch,
  compare,
}: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  track: Track
  layoutSwitch: ReactNode
  compare: CompareProps
}) {
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-1.5">
        <Segmented
          size="sm"
          value={tab}
          onChange={onTab}
          options={[
            { value: 'charts', label: tr('グラフ', 'Charts') },
            { value: 'events', label: tr('イベント', 'Events') },
          ]}
        />
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Summary track={track} reference={compare.reference?.track} inline />
        </div>
        <CompareControl {...compare} />
        <div className="shrink-0">{layoutSwitch}</div>
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-2">
        <Suspense fallback={null}>
          {tab === 'charts' ? (
            <ChartGrid track={track} reference={compare.reference?.track} />
          ) : (
            <div className="rounded-[8px] border border-line bg-surface px-3 py-1">
              <EventList track={track} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}

/** Pin the current result as a dashed reference, or drop the pinned one. */
export function CompareControl({ reference, onPin, onUnpin }: CompareProps) {
  if (!reference) {
    return (
      <button
        type="button"
        onClick={onPin}
        title={tr('いまの結果を点線で残し、パラメータを変えたときの違いを比べます', 'Keep this result as a dashed line to compare against as you change parameters')}
        className="flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <Pin className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">{tr('比較用に固定', 'Pin to compare')}</span>
      </button>
    )
  }
  return (
    <span className="flex h-7 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-ink-3 pl-2.5 pr-1 text-[12px] text-ink-2">
      <span className="h-0 w-4 shrink-0 border-t-[1.5px] border-dashed border-ink-3" aria-hidden />
      <span className="truncate" title={reference.label}>
        {tr('比較', 'Pinned')}: {reference.label}
      </span>
      <button type="button" onClick={onUnpin} aria-label={tr('比較をやめる', 'Unpin')}
        title={tr('比較をやめる', 'Unpin')} className="rounded-full p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

const signed = (v: number, d: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v), d)}`

export function Summary({ track, reference, inline = false }: { track: Track; reference?: Track | null; inline?: boolean }) {
  const s = track.summary
  const r = reference?.summary
  // [label, value, unit, sub, delta vs reference]
  const items: [string, string, string, string | undefined, string | undefined][] = [
    [tr('最高高度', 'Apogee'), fmt(s.apogee / 1000, 1), 'km', `T+${fmt(s.apogeeTime, 0)} s`, r && signed((s.apogee - r.apogee) / 1000, 1)],
    [tr('最大速度', 'Max speed'), fmt(s.maxSpeed, 0), 'm/s', `M ${fmt(s.maxMach, 1)}`, r && signed(s.maxSpeed - r.maxSpeed, 0)],
    [tr('最大動圧', 'Max-Q'), fmt(s.maxQ / 1000, 1), 'kPa', `T+${fmt(s.maxQTime, 0)} s`, r && signed((s.maxQ - r.maxQ) / 1000, 1)],
    [tr('最大加速度', 'Max accel.'), fmt(s.maxAccel, 1), 'G', undefined, r && signed(s.maxAccel - r.maxAccel, 1)],
    [s.landed ? tr('落下距離', 'Impact range') : tr('到達距離', 'Range'), fmt(s.range, 1), 'km', undefined, r && signed(s.range - r.range, 1)],
    [tr('飛行時間', 'Flight time'), fmt(s.duration, 0), 's', undefined, r && signed(s.duration - r.duration, 0)],
  ]
  return (
    <dl
      className={cn(
        inline
          ? 'flex items-baseline gap-5 whitespace-nowrap'
          : 'mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-3',
      )}
    >
      {items.map(([k, v, u, sub, delta]) => (
        <div key={k} className={cn(inline ? 'flex items-baseline gap-1.5' : 'bg-surface px-3 py-2')}>
          <dt className="text-[11px] text-ink-3">{k}</dt>
          <dd className={cn('num', inline ? 'text-[12px]' : 'text-[15px]')}>
            {v}
            <span className="text-[11px] text-ink-3"> {u}</span>
            {sub && !inline && <span className="ml-1.5 text-[11px] text-ink-3">{sub}</span>}
            {delta && (
              <span className="ml-1.5 text-[11px] text-ink-3" title={tr('比較用に固定した結果との差', 'Difference from the pinned result')}>
                {delta}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Phone layout: summary, charts and events stacked in one scrolling column. */
export function MobileResults({ track, compare }: { track: Track; compare: CompareProps }) {
  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-2">
      <div className="mb-2 flex justify-end">
        <CompareControl {...compare} />
      </div>
      <Summary track={track} reference={compare.reference?.track} />
      <Suspense fallback={null}>
        <ChartGrid track={track} reference={compare.reference?.track} />
        <div className="mt-3 rounded-[8px] border border-line bg-surface px-3 py-1">
          <EventList track={track} />
        </div>
      </Suspense>
    </div>
  )
}
