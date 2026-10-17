import { useRef } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { SPEEDS, playback, usePlayback } from '../lib/playback'
import { sampleAt, stageColorVar, type Track } from '../lib/trajectory'
import { cn } from '../lib/cn'
import { fmt } from '../lib/format'

/** Event labels that would collide with the previous one are dropped. */
function spacedLabels(track: Track, pct: (t: number) => number, minGap = 4.5) {
  let last = -Infinity
  return track.events
    .filter((e) => e.kind !== 'liftoff' && e.kind !== 'end')
    .filter((e) => {
      const p = pct(e.t)
      if (p - last < minGap) return false
      last = p
      return true
    })
}

function Scrubber({ track }: { track: Track }) {
  const ref = useRef<HTMLDivElement>(null)
  const t = usePlayback((s) => s.t)
  const span = track.t1 - track.t0 || 1
  const pct = (v: number) => ((v - track.t0) / span) * 100

  const seekFromEvent = (clientX: number) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const f = Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
    playback.seek(track.t0 + f * span)
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="再生位置"
      aria-valuemin={track.t0}
      aria-valuemax={track.t1}
      aria-valuenow={Math.round(t * 10) / 10}
      aria-valuetext={`T+${fmt(t)}秒`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekFromEvent(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromEvent(e.clientX)
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowRight') playback.step(step)
        else if (e.key === 'ArrowLeft') playback.step(-step)
        else if (e.key === 'Home') playback.seek(track.t0)
        else if (e.key === 'End') playback.seek(track.t1)
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
          title={`${e.label}  T+${fmt(e.t)} s`}
          className="absolute top-0 h-2 w-px bg-ink-3"
          style={{ left: `${pct(e.t)}%` }}
        />
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
              className="num absolute -translate-x-1/2 whitespace-nowrap text-[9px] leading-none text-ink-3"
              style={{ left: `${pct(e.t)}%` }}
            >
              {e.short}
            </span>
          ))}
      </div>
    </div>
  )
}

export function PlaybackBar({ track }: { track: Track }) {
  const { t, playing, speed } = usePlayback((s) => s)
  const atEnd = t >= track.t1
  return (
    <div className="flex items-center gap-2 border-t border-line bg-surface px-2 py-1.5 sm:gap-3 sm:px-3">
      <button
        type="button"
        onClick={() => playback.toggle()}
        aria-label={playing ? '一時停止' : '再生'}
        title={playing ? '一時停止 (Space)' : '再生 (Space)'}
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
      <Scrubber track={track} />
      <div className="num hidden shrink-0 text-[12px] text-ink-3 sm:block">{fmt(track.t1)} s</div>
      <label className="relative shrink-0">
        <span className="sr-only">再生速度</span>
        <select
          value={speed}
          onChange={(e) => playback.setSpeed(Number(e.target.value))}
          className="num h-7 cursor-pointer appearance-none rounded-[6px] border border-line bg-surface-2 pl-2 pr-2 text-[12px] text-ink-2 hover:border-line-strong"
          title="再生速度"
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

export function Telemetry({ track, compact = false }: { track: Track; compact?: boolean }) {
  const t = usePlayback((s) => s.t)
  const s = sampleAt(track, t)
  const last = [...track.events].reverse().find((e) => e.t <= t + 1e-6)

  const rows: [string, string, string][] = [
    ['高度', fmt(s.alt / 1000, 1), 'km'],
    ['速度', fmt(s.speed, 0), 'm/s'],
    ['マッハ', fmt(s.mach, 2), ''],
    ['動圧', fmt(s.q / 1000, 1), 'kPa'],
    ['加速度', fmt(s.accelAxial, 1), 'G'],
    ['距離', fmt(s.downrange, 1), 'km'],
  ]

  return (
    <div
      className={cn(
        'pointer-events-none select-none rounded-[8px] bg-surface/95 text-ink ring-1 ring-line-strong shadow-[0_1px_3px_rgba(0,0,0,0.08)]',
        compact ? 'px-2.5 py-2' : 'w-[13.5rem] px-3 py-2.5',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="num text-[15px] font-medium">
          <span className="text-ink-3">T+</span>
          {fmt(t, 1)}
          <span className="text-[11px] text-ink-3"> s</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ background: stageColorVar(s.stage) }} />
          {s.stage}段
        </div>
      </div>
      {!compact && <div className="mb-1.5 h-4 truncate text-[11px] text-ink-3">{last?.label}</div>}
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
    </div>
  )
}
