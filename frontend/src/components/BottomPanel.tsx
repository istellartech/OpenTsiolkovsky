import { Suspense, lazy, type ReactNode } from 'react'
import type { Track } from '../lib/trajectory'
import { fmt } from '../lib/format'
import { cn } from '../lib/cn'
import { Segmented } from './primitives'

const ChartGrid = lazy(() => import('./Charts').then((m) => ({ default: m.ChartGrid })))
const EventList = lazy(() => import('./Charts').then((m) => ({ default: m.EventList })))

export type PanelTab = 'charts' | 'events'

export function BottomPanel({
  tab,
  onTab,
  track,
  layoutSwitch,
}: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  track: Track
  layoutSwitch: ReactNode
}) {
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-1.5">
        <Segmented
          size="sm"
          value={tab}
          onChange={onTab}
          options={[
            { value: 'charts', label: 'グラフ' },
            { value: 'events', label: 'イベント' },
          ]}
        />
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Summary track={track} inline />
        </div>
        <div className="shrink-0">{layoutSwitch}</div>
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-2">
        <Suspense fallback={null}>
          {tab === 'charts' ? (
            <ChartGrid track={track} />
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

export function Summary({ track, inline = false }: { track: Track; inline?: boolean }) {
  const s = track.summary
  const items: [string, string, string, string?][] = [
    ['最高高度', fmt(s.apogee / 1000, 1), 'km', `T+${fmt(s.apogeeTime, 0)} s`],
    ['最大速度', fmt(s.maxSpeed, 0), 'm/s', `M ${fmt(s.maxMach, 1)}`],
    ['最大動圧', fmt(s.maxQ / 1000, 1), 'kPa', `T+${fmt(s.maxQTime, 0)} s`],
    ['最大加速度', fmt(s.maxAccel, 1), 'G'],
    [s.landed ? '落下距離' : '到達距離', fmt(s.range, 1), 'km'],
    ['飛行時間', fmt(s.duration, 0), 's'],
  ]
  return (
    <dl
      className={cn(
        inline
          ? 'flex items-baseline gap-5 whitespace-nowrap'
          : 'mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-3',
      )}
    >
      {items.map(([k, v, u, sub]) => (
        <div key={k} className={cn(inline ? 'flex items-baseline gap-1.5' : 'bg-surface px-3 py-2')}>
          <dt className="text-[11px] text-ink-3">{k}</dt>
          <dd className={cn('num', inline ? 'text-[12px]' : 'text-[15px]')}>
            {v}
            <span className="text-[11px] text-ink-3"> {u}</span>
            {sub && !inline && <span className="ml-1.5 text-[11px] text-ink-3">{sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Phone layout: summary, charts and events stacked in one scrolling column. */
export function MobileResults({ track }: { track: Track }) {
  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-2">
      <Summary track={track} />
      <Suspense fallback={null}>
        <ChartGrid track={track} />
        <div className="mt-3 rounded-[8px] border border-line bg-surface px-3 py-1">
          <EventList track={track} />
        </div>
      </Suspense>
    </div>
  )
}
