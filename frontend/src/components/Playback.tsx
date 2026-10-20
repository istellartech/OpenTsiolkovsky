import { phaseLabel } from '../lib/presentation'
import { useRef } from 'react'
import { ChevronDown, ChevronUp, Pause, Play, RotateCcw } from 'lucide-react'
import { SPEEDS, playback, usePlayback, type PlaybackController } from '../lib/playback'
import { sampleAt, type FlightEvent, type Track, type TimelineTrack } from '../lib/trajectory'
import { cn } from '../lib/cn'
import { fmt } from '../lib/format'
import { stageColorVar } from '../lib/theme'
import { eventLabel, eventShort, flightModeLabel } from '../lib/events'
import { tr } from '../lib/i18n'

/** Stage colour for stage events; neutral for the rest. */
const eventColor = (e: FlightEvent) =>
  (e.kind === 'burnout' || e.kind === 'separation' || e.kind === 'jettison') && e.stage !== undefined
    ? stageColorVar(e.stage)
    : 'var(--ink-3)'

/** Event labels that would collide with the previous one are dropped. */
function spacedLabels(track: TimelineTrack, pct: (t: number) => number, minGap = 4.5) {
  let last = -Infinity
  return track.events
    .filter((e) => e.kind !== 'liftoff' && e.kind !== 'end' && e.t > track.t0)
    .filter((e) => {
      const p = pct(e.t)
      if (p - last < minGap) return false
      last = p
      return true
    })
}

function Scrubber({ track, player }: { track: TimelineTrack; player: PlaybackController }) {
  const ref = useRef<HTMLDivElement>(null)
  const t = usePlayback((s) => s.t, player)
  const span = track.t1 - track.t0 || 1
  const pct = (v: number) => ((v - track.t0) / span) * 100

  const seekFromEvent = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const f = Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
    player.seek(track.t0 + f * span)
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={tr('再生位置', 'Playback position')}
      aria-valuemin={track.t0}
      aria-valuemax={track.t1}
      aria-valuenow={Math.round(t * 10) / 10}
      aria-valuetext={tr(`T+${fmt(t)}秒`, `T+${fmt(t)} s`)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekFromEvent(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromEvent(e.clientX)
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowRight') player.step(step)
        else if (e.key === 'ArrowLeft') player.step(-step)
        else if (e.key === 'Home') player.seek(track.t0)
        else if (e.key === 'End') player.seek(track.t1)
        else return
        e.preventDefault()
        e.stopPropagation()
      }}
      className="group relative h-8 min-w-0 flex-1 cursor-pointer touch-none select-none"
    >
      {/* Event ticks */}
      {track.events.map((e) => (
        <div
          key={`${e.kind}-${e.t}`}
          title={`${eventLabel(e, track.presentation)}  T+${fmt(e.t)} s`}
          className="absolute top-0 flex h-3 w-2.5 -translate-x-1/2 justify-center"
          style={{ left: `${pct(e.t)}%` }}
        >
          <span className="h-2 w-px" style={{ background: eventColor(e) }} />
        </div>
      ))}
      {/* Track: stage segments, faint ahead of the playhead and solid behind it */}
      <div className="absolute inset-x-0 top-3 h-1.5 overflow-hidden rounded-full bg-line">
        {track.stages.map((s) => (
          <div
            key={s.stage}
            className="absolute inset-y-0 opacity-25"
            style={{ left: `${pct(s.t0)}%`, width: `${pct(s.t1) - pct(s.t0)}%`, background: stageColorVar(s.stage) }}
          />
        ))}
        {track.stages.map((s) => {
          const end = Math.min(t, s.t1)
          if (end <= s.t0) return null
          return (
            <div
              key={`p${s.stage}`}
              className="absolute inset-y-0"
              style={{ left: `${pct(s.t0)}%`, width: `${pct(end) - pct(s.t0)}%`, background: stageColorVar(s.stage) }}
            />
          )
        })}
      </div>
      <div
        className="absolute top-[7px] h-[14px] w-[14px] -translate-x-1/2 rounded-full border-2 border-surface bg-ink shadow-[0_0_0_1px_var(--line-strong)] transition-transform group-active:scale-110"
        style={{ left: `${pct(t)}%` }}
      />
      {/* Event short labels under the track on wide screens */}
      <div className="pointer-events-none absolute inset-x-0 top-[22px] hidden h-3 md:block">
        {spacedLabels(track, pct).map((e) => (
          <span
            key={`l-${e.kind}-${e.t}`}
            title={`${eventLabel(e, track.presentation)}  T+${fmt(e.t)} s`}
            className="num pointer-events-auto absolute max-w-24 -translate-x-1/2 truncate whitespace-nowrap text-[9px] leading-none"
            style={{ left: `${pct(e.t)}%`, color: eventColor(e) }}
          >
            {eventShort(e, track.presentation)}
          </span>
        ))}
      </div>
    </div>
  )
}

export function PlaybackBar({ track, player = playback }: { track: TimelineTrack; player?: PlaybackController }) {
  const { t, playing, speed } = usePlayback((s) => s, player)
  const atEnd = t >= track.t1
  return (
    <div className="flex items-center gap-2 border-t border-line bg-surface px-2 py-1.5 sm:gap-3 sm:px-3">
      <button
        type="button"
        onClick={() => player.toggle()}
        aria-label={playing ? tr('一時停止', 'Pause') : tr('再生', 'Play')}
        title={playing ? tr('一時停止 (Space)', 'Pause (Space)') : tr('再生 (Space)', 'Play (Space)')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-surface hover:opacity-90"
      >
        {playing ? (
          <Pause className="h-3.5 w-3.5" fill="currentColor" />
        ) : atEnd ? (
          <RotateCcw className="h-3.5 w-3.5" />
        ) : (
          <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />
        )}
      </button>
      <div className="num w-[5.5rem] shrink-0 text-[13px] sm:w-[6.5rem]">
        <span className="text-ink-3">T+</span>
        {fmt(t)}
        <span className="text-ink-3"> s</span>
      </div>
      <Scrubber track={track} player={player} />
      <div className="num hidden shrink-0 text-[12px] text-ink-3 sm:block">{fmt(track.t1)} s</div>
      <label className="relative shrink-0">
        <span className="sr-only">{tr('再生速度', 'Playback speed')}</span>
        <select
          value={speed}
          onChange={(e) => player.setSpeed(Number(e.target.value))}
          className="num h-7 cursor-pointer appearance-none rounded-[6px] border border-line bg-surface-2 pl-2 pr-2 text-[12px] text-ink-2 hover:border-line-strong"
          title={tr('再生速度', 'Playback speed')}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              ×{s}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

export function Telemetry({
  track,
  compact = false,
  collapsed = false,
  onToggle,
}: {
  track: Track
  compact?: boolean
  /** Show only the clock and stage. */
  collapsed?: boolean
  onToggle?: () => void
}) {
  const t = usePlayback((s) => s.t)
  const s = sampleAt(track, t)
  const last = [...track.events].reverse().find((e) => e.t <= t + 1e-6)

  const rows: [string, string, string][] = [
    [tr('高度', 'Altitude'), fmt(s.alt / 1000, 1), 'km'],
    [tr('速度', 'Velocity'), fmt(s.speed, 0), 'm/s'],
    [tr('マッハ', 'Mach'), fmt(s.mach, 2), ''],
    [tr('動圧', 'Dyn. pressure'), fmt(s.q / 1000, 1), 'kPa'],
    [tr('機軸加速度（重力を除く）', 'Axial accel. (no gravity)'), fmt(s.accelAxial, 1), 'G'],
    [tr('距離', 'Downrange'), fmt(s.downrange, 1), 'km'],
  ]
  // Instantaneous impact point, while one exists
  if (s.iipLat !== null && s.iipLon !== null) {
    rows.push(['IIP', `${fmt(s.iipLat, 3)}, ${fmt(s.iipLon, 3)}`, '°'])
  }

  return (
    <div
      className={cn(
        'pointer-events-none select-none rounded-[8px] bg-surface/95 text-ink ring-1 ring-line-strong shadow-[0_1px_3px_rgba(0,0,0,0.08)]',
        compact || collapsed ? 'px-2.5 py-2' : 'w-[13.5rem] px-3 py-2.5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="num text-[15px] font-medium">
          <span className="text-ink-3">T+</span>
          {fmt(t, 1)}
          <span className="text-[11px] text-ink-3"> s</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ background: stageColorVar(s.stage) }} />
          <span className="max-w-[16rem] truncate" title={phaseLabel(track.presentation, s.stage)}>
            {phaseLabel(track.presentation, s.stage)}
          </span>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={!collapsed}
              aria-label={collapsed ? tr('テレメトリを開く', 'Expand telemetry') : tr('テレメトリをたたむ', 'Collapse telemetry')}
              title={collapsed ? tr('テレメトリを開く', 'Expand telemetry') : tr('テレメトリをたたむ', 'Collapse telemetry')}
              className="pointer-events-auto -mr-1 flex h-5 w-5 items-center justify-center rounded-[4px] text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
      {collapsed ? null : (
        <>
          {!compact && <div className="h-4 truncate text-[11px] text-ink-3">{last && eventLabel(last, track.presentation)}</div>}
          {!compact && (
            <div className="mb-1.5 flex h-4 items-center gap-1.5 truncate text-[11px] text-ink-2">
              <span
                aria-hidden
                className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.mode === 'powered' ? 'bg-signal' : 'bg-line-strong')}
              />
              {flightModeLabel(s.mode)}
            </div>
          )}
          <dl className={cn('grid gap-x-3', compact ? 'mt-1 grid-cols-3 gap-y-0.5' : 'grid-cols-1 gap-y-[3px]')}>
            {(compact ? rows.slice(0, 3) : rows).map(([k, v, u]) => (
              <div key={k} className={cn('flex items-baseline', compact ? 'flex-col' : 'justify-between')}>
                <dt className="text-[11px] text-ink-3">{k}</dt>
                <dd className="num text-[13px]">
                  {v}
                  {u && <span className="text-[10px] text-ink-3"> {u}</span>}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </div>
  )
}
