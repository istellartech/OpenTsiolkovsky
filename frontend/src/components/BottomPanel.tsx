import { Suspense, lazy, type ReactNode } from 'react'
import { Pin, X } from 'lucide-react'
import type { Track } from '../lib/trajectory'
import { fmt } from '../lib/format'
import { Segmented } from './primitives'
import { tr } from '../lib/i18n'
import type { MonteCarloState } from '../hooks/useMonteCarlo'
import { FallList } from './FallList'
import { MonteCarloPanel } from './MonteCarloPanel'

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

export type PanelTab = 'charts' | 'events' | 'montecarlo'

/** Monte Carlo state plus what the panel needs to label and save results */
export interface McProps {
  mc: MonteCarloState
  fileBase: string
}

export function BottomPanel({
  tab,
  onTab,
  track,
  layoutSwitch,
  compare,
  montecarlo,
}: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  track: Track
  layoutSwitch: ReactNode
  compare: CompareProps
  montecarlo: McProps
}) {
  const lastStage = track.samples[track.samples.length - 1].stage
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-1.5">
        <PanelTabs tab={tab} onTab={onTab} />
        <span className="flex-1" />
        <div className="shrink-0">{layoutSwitch}</div>
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-2">
        <PanelBody tab={tab} track={track} compare={compare} montecarlo={montecarlo} lastStage={lastStage} />
      </div>
    </div>
  )
}

function PanelTabs({ tab, onTab }: { tab: PanelTab; onTab: (t: PanelTab) => void }) {
  return (
    <Segmented
      size="sm"
      value={tab}
      onChange={onTab}
      options={[
        { value: 'charts', label: tr('グラフ', 'Charts') },
        { value: 'events', label: tr('イベント', 'Events') },
        {
          value: 'montecarlo',
          label: tr('分散解析', 'Dispersion'),
          title: tr('モンテカルロ法で落下点のばらつきを調べる', 'Monte Carlo spread of impact points'),
        },
      ]}
    />
  )
}

/** Contents of one results tab; shared by the desktop panel and the phone view. */
function PanelBody({
  tab,
  track,
  compare,
  montecarlo,
  lastStage,
}: {
  tab: PanelTab
  track: Track
  compare: CompareProps
  montecarlo: McProps
  lastStage: number
}) {
  return (
    <Suspense fallback={null}>
      {tab === 'charts' ? (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[12px] font-semibold text-ink-2">{tr('飛行結果', 'Flight results')}</h2>
            <CompareControl {...compare} />
          </div>
          <Summary track={track} reference={compare.reference?.track} />
          <ChartGrid track={track} reference={compare.reference?.track} />
        </>
      ) : tab === 'events' ? (
        <div className="grid items-start gap-2 2xl:grid-cols-2">
          <div className="min-w-0 rounded-[8px] border border-line bg-surface px-3 py-1">
            <EventList track={track} />
          </div>
          <FallSection track={track} />
        </div>
      ) : (
        <MonteCarloPanel mc={montecarlo.mc} lastStage={lastStage} fileBase={montecarlo.fileBase} />
      )}
    </Suspense>
  )
}

/** Impact points of the vehicle, spent stages and jettisoned parts. */
function FallSection({ track }: { track: Track }) {
  if (!track.impact && track.fallBodies.length === 0) return null
  return (
    <div className="min-w-0 rounded-[8px] border border-line bg-surface px-3 py-1">
      <FallList track={track} />
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
        title={tr(
          'いまの結果を点線で残し、パラメータを変えたときの違いを比べます',
          'Keep this result as a dashed line to compare against as you change parameters',
        )}
        className="flex h-7 shrink-0 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink"
      >
        <Pin className="h-3.5 w-3.5" />
        <span>{tr('比較用に固定', 'Pin to compare')}</span>
      </button>
    )
  }
  return (
    <span className="flex h-7 max-w-[14rem] shrink-0 items-center gap-1.5 rounded-full border border-dashed border-ink-3 pl-2.5 pr-1 text-[12px] text-ink-2">
      <span className="h-0 w-4 shrink-0 border-t-[1.5px] border-dashed border-ink-3" aria-hidden />
      <span className="truncate" title={reference.label}>
        {tr('比較', 'Pinned')}: {reference.label}
      </span>
      <button
        type="button"
        onClick={onUnpin}
        aria-label={tr('比較をやめる', 'Unpin')}
        title={tr('比較をやめる', 'Unpin')}
        className="rounded-full p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  )
}

const signed = (v: number, d: number) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${fmt(Math.abs(v), d)}`

export function Summary({ track, reference }: { track: Track; reference?: Track | null }) {
  const s = track.summary
  const r = reference?.summary
  // [label, value, unit, sub, delta vs reference]
  const items: [string, string, string, string | undefined, string | undefined][] = [
    [tr('最高高度', 'Apogee'), fmt(s.apogee / 1000, 1), 'km', `T+${fmt(s.apogeeTime, 0)} s`, r && signed((s.apogee - r.apogee) / 1000, 1)],
    [tr('最大速度', 'Max speed'), fmt(s.maxSpeed, 0), 'm/s', `M ${fmt(s.maxMach, 1)}`, r && signed(s.maxSpeed - r.maxSpeed, 0)],
    [tr('最大動圧', 'Max-Q'), fmt(s.maxQ / 1000, 1), 'kPa', `T+${fmt(s.maxQTime, 0)} s`, r && signed((s.maxQ - r.maxQ) / 1000, 1)],
    [tr('最大機軸加速度', 'Max axial accel.'), fmt(s.maxAccel, 1), 'G', undefined, r && signed(s.maxAccel - r.maxAccel, 1)],
    [
      s.landed ? tr('落下距離', 'Impact range') : tr('到達距離', 'Range'),
      fmt(s.range, 1),
      'km',
      undefined,
      r && signed(s.range - r.range, 1),
    ],
    [tr('飛行時間', 'Flight time'), fmt(s.duration, 0), 's', undefined, r && signed(s.duration - r.duration, 0)],
  ]
  return (
    <dl className="mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
      {items.map(([k, v, u, sub, delta]) => (
        <div key={k} className="bg-surface px-3 py-2">
          <dt className="text-[11px] text-ink-3">{k}</dt>
          <dd className="num text-[15px]">
            {v}
            <span className="text-[11px] text-ink-3"> {u}</span>
            {delta && (
              <span className="ml-1.5 text-[11px] text-ink-3" title={tr('比較用に固定した結果との差', 'Difference from the pinned result')}>
                {delta}
              </span>
            )}
            {sub && <span className="block text-[11px] leading-tight text-ink-3">{sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** Phone layout: the same three tabs as the desktop panel, in one scrolling column. */
export function MobileResults({
  tab,
  onTab,
  track,
  compare,
  montecarlo,
}: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  track: Track
  compare: CompareProps
  montecarlo: McProps
}) {
  return (
    <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 flex justify-center border-b border-line bg-surface px-2 py-1.5">
        <PanelTabs tab={tab} onTab={onTab} />
      </div>
      <div className="p-2">
        <PanelBody
          tab={tab}
          track={track}
          compare={compare}
          montecarlo={montecarlo}
          lastStage={track.samples[track.samples.length - 1].stage}
        />
      </div>
    </div>
  )
}
