import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart, type ChartConfiguration, type Plugin } from 'chart.js/auto'
import { Download, Maximize2, RotateCcw, X } from 'lucide-react'
import { readStageColor, sampleAt, type Track, type TrackSample } from '../lib/trajectory'
import { playback } from '../lib/playback'
import { fmt } from '../lib/format'

interface Series {
  label: string
  get: (s: TrackSample) => number
  secondary?: boolean
}

export interface ChartSpec {
  id: string
  title: string
  unit: string
  x: 'time' | 'downrange'
  series: Series[]
  digits?: number
}

export const CHARTS: ChartSpec[] = [
  { id: 'altitude', title: '高度', unit: 'km', x: 'time', digits: 1, series: [{ label: '高度', get: (s) => s.alt / 1000 }] },
  {
    id: 'velocity', title: '速度', unit: 'm/s', x: 'time', digits: 0,
    series: [
      { label: '慣性', get: (s) => s.speed },
      { label: '対地', get: (s) => s.groundSpeed, secondary: true },
    ],
  },
  { id: 'mach', title: 'マッハ数', unit: '', x: 'time', digits: 2, series: [{ label: 'Mach', get: (s) => s.mach }] },
  { id: 'q', title: '動圧', unit: 'kPa', x: 'time', digits: 1, series: [{ label: '動圧', get: (s) => s.q / 1000 }] },
  {
    id: 'force', title: '推力・抗力', unit: 'kN', x: 'time', digits: 1,
    series: [
      { label: '推力', get: (s) => s.thrust / 1000 },
      { label: '抗力', get: (s) => s.drag / 1000, secondary: true },
    ],
  },
  {
    id: 'accel', title: '加速度', unit: 'G', x: 'time', digits: 2,
    series: [
      { label: '機軸 (センサ)', get: (s) => s.accelAxial },
      { label: '慣性 |a|', get: (s) => s.accel, secondary: true },
    ],
  },
  { id: 'mass', title: '質量', unit: 'kg', x: 'time', digits: 0, series: [{ label: '質量', get: (s) => s.mass }] },
  {
    id: 'attitude', title: '姿勢', unit: '°', x: 'time', digits: 1,
    series: [
      { label: '仰角', get: (s) => s.elevation },
      { label: '方位角', get: (s) => s.azimuth, secondary: true },
    ],
  },
  {
    id: 'aoa', title: '迎角・横滑り角', unit: '°', x: 'time', digits: 2,
    series: [
      { label: '迎角', get: (s) => s.aoa },
      { label: '横滑り角', get: (s) => s.sideslip, secondary: true },
    ],
  },
  { id: 'profile', title: '高度 × ダウンレンジ', unit: 'km', x: 'downrange', digits: 1, series: [{ label: '高度', get: (s) => s.alt / 1000 }] },
]

function themeColors() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return { ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), line: v('--line'), surface: v('--surface') }
}

/** Hairlines at stage separations and burnouts. */
const eventLines = (track: Track, color: string): Plugin<'line'> => ({
  id: 'eventLines',
  beforeDatasetsDraw(chart) {
    const { ctx, chartArea, scales } = chart
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([2, 3])
    for (const e of track.events) {
      if (e.kind !== 'separation' && e.kind !== 'burnout') continue
      const x = scales.x.getPixelForValue(e.t)
      if (x < chartArea.left || x > chartArea.right) continue
      ctx.beginPath()
      ctx.moveTo(x, chartArea.top)
      ctx.lineTo(x, chartArea.bottom)
      ctx.stroke()
    }
    ctx.restore()
  },
})

interface ChartViewProps {
  spec: ChartSpec
  track: Track
  /** Pinned earlier result, drawn underneath for comparison */
  reference?: Track | null
  large?: boolean
  onExpand?: () => void
}

/** Visible y range for samples inside [x0, x1], padded. */
function yRangeFor(spec: ChartSpec, tracks: Track[], x0: number, x1: number) {
  let lo = Infinity
  let hi = -Infinity
  for (const track of tracks) {
    for (const s of track.samples) {
      const x = spec.x === 'time' ? s.t : s.downrange
      if (x < x0 || x > x1) continue
      for (const ser of spec.series) {
        const v = ser.get(s)
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
  }
  if (!Number.isFinite(lo)) return null
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.06
  return { min: lo - pad, max: hi + pad }
}

function ChartView({ spec, track, reference = null, large = false, onExpand }: ChartViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart<'line'> | null>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef<HTMLSpanElement>(null)
  const selRef = useRef<HTMLDivElement>(null)
  const placeRef = useRef<() => void>(() => {})
  const dragRef = useRef<{ x0: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    if (!canvasRef.current) return
    const c = themeColors()
    const xOf = (s: TrackSample) => (spec.x === 'time' ? s.t : s.downrange)
    const stageColors = new Map(track.stages.map((st) => [st.stage, readStageColor(st.stage)]))
    const tick = large ? 11 : 10

    const datasets = spec.series.map((ser) => ({
      label: ser.label,
      data: track.samples.map((s) => ({ x: xOf(s), y: ser.get(s), stage: s.stage })),
      borderWidth: ser.secondary ? (large ? 1.5 : 1.25) : large ? 2 : 1.75,
      borderColor: ser.secondary ? c.ink3 : stageColors.get(track.samples[0].stage),
      borderDash: ser.secondary ? [4, 3] : undefined,
      segment: ser.secondary
        ? undefined
        : {
            borderColor: (ctx: { p0DataIndex: number }) =>
              stageColors.get(track.samples[ctx.p0DataIndex]?.stage ?? 0) ?? c.ink,
          },
      pointRadius: 0,
      pointHoverRadius: 0,
      tension: 0,
    }))
    if (reference) {
      const ref = spec.series[0]
      datasets.push({
        label: `比較: ${ref.label}`,
        data: reference.samples.map((s) => ({ x: xOf(s), y: ref.get(s), stage: s.stage })),
        borderWidth: large ? 1.75 : 1.5,
        borderColor: c.ink3,
        borderDash: [6, 4],
        segment: undefined,
        pointRadius: 0,
        pointHoverRadius: 0,
        tension: 0,
      })
    }
    const t0 = reference ? Math.min(track.t0, reference.t0) : track.t0
    const t1 = reference ? Math.max(track.t1, reference.t1) : track.t1

    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: { datasets },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        parsing: false as unknown as undefined,
        normalized: true,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        layout: { padding: { top: 4, right: large ? 8 : 4 } },
        plugins: {
          legend: { display: false },
          decimation: { enabled: spec.x === 'time', algorithm: 'lttb', samples: large ? 2000 : 600 },
          tooltip: {
            backgroundColor: c.ink,
            titleColor: c.surface,
            bodyColor: c.surface,
            titleFont: { family: 'IBM Plex Mono', size: 11, weight: 500 },
            bodyFont: { family: 'IBM Plex Mono', size: 11 },
            padding: 8,
            cornerRadius: 4,
            displayColors: false,
            callbacks: {
              title: (items) =>
                spec.x === 'time' ? `T+ ${fmt(items[0].parsed.x ?? 0, 1)} s` : `${fmt(items[0].parsed.x ?? 0, 1)} km`,
              label: (item) => `${item.dataset.label}  ${fmt(item.parsed.y ?? 0, spec.digits)} ${spec.unit}`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: spec.x === 'time' ? t0 : undefined,
            max: spec.x === 'time' ? t1 : undefined,
            border: { color: c.line },
            grid: { color: c.line, drawTicks: false },
            ticks: { color: c.ink3, font: { family: 'IBM Plex Mono', size: tick }, maxTicksLimit: large ? 12 : 6, padding: 4, includeBounds: false },
            title: large
              ? { display: true, text: spec.x === 'time' ? '打上げからの時間 [s]' : 'ダウンレンジ [km]', color: c.ink3, font: { size: 11 } }
              : undefined,
          },
          y: {
            border: { display: false },
            grid: { color: c.line, drawTicks: false },
            ticks: { color: c.ink3, font: { family: 'IBM Plex Mono', size: tick }, maxTicksLimit: large ? 9 : 5, padding: 6, includeBounds: false },
            title: large && spec.unit ? { display: true, text: `${spec.title} [${spec.unit}]`, color: c.ink3, font: { size: 11 } } : undefined,
          },
        },
        onClick: (_e, _els, chart) => {
          if (suppressClick.current) {
            suppressClick.current = false
            return
          }
          const evt = _e as unknown as { x: number }
          const xv = chart.scales.x.getValueForPixel(evt.x)
          if (xv === undefined) return
          if (spec.x === 'time') playback.seek(xv)
          else {
            const hit = track.samples.find((s) => s.downrange >= xv)
            if (hit) playback.seek(hit.t)
          }
        },
      },
      plugins: [eventLines(track, c.line)],
    }

    const chart = new Chart(canvasRef.current, config)
    chartRef.current = chart

    const primary = spec.series[0]
    const colorCache = new Map<number, string>()
    const readStageColorCached = (stage: number) => {
      let v = colorCache.get(stage)
      if (!v) colorCache.set(stage, (v = readStageColor(stage)))
      return v
    }
    const place = () => {
      const t = playback.get().t
      const s = sampleAt(track, t)
      const area = chart.chartArea
      if (!area) return
      const x = chart.scales.x.getPixelForValue(spec.x === 'time' ? t : s.downrange)
      const yv = primary.get(s)
      const y = chart.scales.y.getPixelForValue(yv)
      const inside = x >= area.left - 0.5 && x <= area.right + 0.5
      const insideY = y >= area.top - 0.5 && y <= area.bottom + 0.5
      if (lineRef.current) {
        lineRef.current.style.display = inside && spec.x === 'time' ? 'block' : 'none'
        lineRef.current.style.transform = `translateX(${x}px)`
        lineRef.current.style.top = `${area.top}px`
        lineRef.current.style.height = `${area.bottom - area.top}px`
      }
      if (dotRef.current) {
        dotRef.current.style.display = inside && insideY ? 'block' : 'none'
        dotRef.current.style.transform = `translate(${x - 4}px, ${y - 4}px)`
        dotRef.current.style.background = readStageColorCached(s.stage)
      }
      if (valueRef.current) {
        valueRef.current.textContent = `${fmt(yv, spec.digits)}${spec.unit ? ` ${spec.unit}` : ''}`
      }
    }
    placeRef.current = place

    place()
    const unsub = playback.subscribe(place)
    const ro = new ResizeObserver(() => requestAnimationFrame(place))
    ro.observe(canvasRef.current)
    setZoomed(false)
    return () => {
      unsub()
      ro.disconnect()
      chart.destroy()
      chartRef.current = null
    }
  }, [spec, track, reference, large])

  const setRange = (x0?: number, x1?: number) => {
    const chart = chartRef.current
    if (!chart) return
    const xs = chart.options.scales!.x!
    const ys = chart.options.scales!.y!
    if (x0 === undefined || x1 === undefined) {
      xs.min = spec.x === 'time' ? Math.min(track.t0, reference?.t0 ?? Infinity) : undefined
      xs.max = spec.x === 'time' ? Math.max(track.t1, reference?.t1 ?? -Infinity) : undefined
      ys.min = undefined
      ys.max = undefined
      setZoomed(false)
    } else {
      xs.min = x0
      xs.max = x1
      const yr = yRangeFor(spec, reference ? [track, reference] : [track], x0, x1)
      ys.min = yr?.min
      ys.max = yr?.max
      setZoomed(true)
    }
    chart.update('none')
    placeRef.current()
  }

  // Drag across the plot to zoom into that x range (enlarged view only).
  const localX = (e: React.PointerEvent) => e.clientX - e.currentTarget.getBoundingClientRect().left
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!large || e.button !== 0) return
    dragRef.current = { x0: localX(e), moved: false }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    const sel = selRef.current
    const area = chartRef.current?.chartArea
    if (!d || !sel || !area) return
    const x = Math.min(Math.max(localX(e), area.left), area.right)
    if (!d.moved && Math.abs(x - d.x0) < 6) return
    if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId)
    d.moved = true
    sel.style.display = 'block'
    sel.style.left = `${Math.min(d.x0, x)}px`
    sel.style.width = `${Math.abs(x - d.x0)}px`
    sel.style.top = `${area.top}px`
    sel.style.height = `${area.bottom - area.top}px`
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    dragRef.current = null
    if (selRef.current) selRef.current.style.display = 'none'
    const chart = chartRef.current
    if (!d?.moved || !chart) return
    suppressClick.current = true
    const area = chart.chartArea
    const x = Math.min(Math.max(localX(e), area.left), area.right)
    const a = chart.scales.x.getValueForPixel(Math.min(d.x0, x))
    const b = chart.scales.x.getValueForPixel(Math.max(d.x0, x))
    if (a !== undefined && b !== undefined && b - a > 1e-6) setRange(a, b)
  }

  const download = () => {
    const chart = chartRef.current
    if (!chart) return
    const a = document.createElement('a')
    a.href = chart.toBase64Image('image/png', 1)
    a.download = `${spec.id}.png`
    a.click()
  }

  const iconBtn =
    'flex h-6 w-6 shrink-0 items-center justify-center rounded text-ink-3 transition-opacity hover:bg-surface-2 hover:text-ink'
  const revealOnHover = 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100'

  return (
    <figure
      className={
        large
          ? 'flex h-full min-h-0 min-w-0 flex-col'
          : 'group relative flex h-[210px] min-w-0 flex-col rounded-[8px] border border-line bg-surface p-3 pb-2'
      }
      onDoubleClick={large ? undefined : onExpand}
    >
      <figcaption className={`flex shrink-0 items-center gap-2 pb-1 ${large ? 'h-8' : 'h-6'}`}>
        <span className={large ? 'text-[15px] font-semibold' : 'text-[12px] font-semibold'}>{spec.title}</span>
        {spec.series.length > 1 && (
          <span className="hidden truncate text-[11px] text-ink-3 sm:inline">
            {spec.series[0].label} / <span className="border-b border-dashed border-ink-3">{spec.series[1].label}</span>
          </span>
        )}
        <span ref={valueRef} className={`num ml-auto whitespace-nowrap text-ink ${large ? 'text-[14px]' : 'text-[12px]'}`} />
        {large && zoomed && (
          <button type="button" onClick={() => setRange()} className="flex h-7 items-center gap-1 rounded-[6px] border border-line px-2 text-[12px] text-ink-2 hover:bg-surface-2">
            <RotateCcw className="h-3 w-3" /> 全体を表示
          </button>
        )}
        <button
          type="button"
          onClick={download}
          aria-label={`${spec.title}をPNGで保存`}
          title="PNGで保存"
          className={`${iconBtn} ${large ? '' : `-mr-1 ${revealOnHover}`}`}
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        {!large && onExpand && (
          <button type="button" onClick={onExpand} aria-label={`${spec.title}を拡大`} title="拡大（ダブルクリックでも開きます）" className={`${iconBtn} -mr-1 ${revealOnHover}`}>
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
      </figcaption>
      <div
        className="relative min-h-0 flex-1 cursor-crosshair touch-pan-y"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={large ? () => setRange() : undefined}
      >
        <canvas ref={canvasRef} />
        <div ref={lineRef} className="pointer-events-none absolute left-0 w-px bg-ink/60" style={{ top: 0 }} />
        <div ref={dotRef} className="pointer-events-none absolute left-0 top-0 h-2 w-2 rounded-full ring-2 ring-surface" />
        <div ref={selRef} className="pointer-events-none absolute hidden border-x border-signal/60 bg-signal/10" />
      </div>
      {large && (
        <p className="pt-1 text-[11px] text-ink-3">
          横にドラッグで範囲を拡大 · ダブルクリックで全体に戻す · クリックでその時刻へ移動
        </p>
      )}
    </figure>
  )
}

function ChartDialog({
  index,
  track,
  reference,
  onIndex,
  onClose,
}: {
  index: number
  track: Track
  reference: Track | null
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const spec = CHARTS[index]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'PageDown' || e.key === ']') onIndex((index + 1) % CHARTS.length)
      else if (e.key === 'PageUp' || e.key === '[') onIndex((index - 1 + CHARTS.length) % CHARTS.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, onIndex, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-2 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${spec.title}（拡大表示）`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(760px,92vh)] w-[min(1200px,100%)] flex-col rounded-[10px] border border-line bg-surface p-3 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)] sm:p-4"
      >
        <div className="mb-2 flex items-center gap-1 border-b border-line pb-2">
          <div className="scroll-quiet flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {CHARTS.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onIndex(i)}
                className={`h-7 shrink-0 rounded-[6px] px-2 text-[12px] ${i === index ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface-2'}`}
              >
                {c.title}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label="閉じる (Esc)" title="閉じる (Esc)" className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] text-ink-2 hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <ChartView key={spec.id} spec={spec} track={track} reference={reference} large />
        </div>
      </div>
    </div>
  )
}

export function ChartGrid({ track, reference = null }: { track: Track; reference?: Track | null }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-2">
        {CHARTS.map((spec, i) => (
          <ChartView key={spec.id} spec={spec} track={track} reference={reference} onExpand={() => setOpen(i)} />
        ))}
      </div>
      {open !== null && <ChartDialog index={open} track={track} reference={reference} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  )
}

export function EventList({ track }: { track: Track }) {
  const rows = useMemo(() => track.events.map((e) => ({ e, s: sampleAt(track, e.t) })), [track])
  const [active, setActive] = useState(-1)
  useEffect(() => {
    const update = () => {
      const t = playback.get().t
      let k = -1
      rows.forEach((r, i) => {
        if (r.e.t <= t + 1e-6) k = i
      })
      setActive(k)
    }
    update()
    const unsub = playback.subscribe(update)
    return () => {
      unsub()
    }
  }, [rows])
  return (
    <table className="w-full border-collapse text-left text-[12px]">
      <thead>
        <tr className="text-[11px] text-ink-3">
          <th className="py-1.5 pr-3 font-normal">時刻</th>
          <th className="py-1.5 pr-3 font-normal">イベント</th>
          <th className="py-1.5 pr-3 text-right font-normal">高度</th>
          <th className="py-1.5 pr-3 text-right font-normal">速度</th>
          <th className="hidden py-1.5 pr-3 text-right font-normal sm:table-cell">マッハ</th>
          <th className="hidden py-1.5 text-right font-normal sm:table-cell">ダウンレンジ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ e, s }, i) => (
          <tr
            key={`${e.kind}-${e.t}`}
            onClick={() => playback.seek(e.t)}
            className={`cursor-pointer border-t border-line hover:bg-surface-2 ${i === active ? 'text-ink' : 'text-ink-2'}`}
          >
            <td className="num py-1.5 pr-3">
              <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${i <= active ? 'bg-signal' : 'bg-line-strong'}`} />
              T+{fmt(e.t, 1)}
            </td>
            <td className="py-1.5 pr-3">{e.label}</td>
            <td className="num py-1.5 pr-3 text-right">{fmt(s.alt / 1000, 1)} km</td>
            <td className="num py-1.5 pr-3 text-right">{fmt(s.speed, 0)} m/s</td>
            <td className="num hidden py-1.5 pr-3 text-right sm:table-cell">{fmt(s.mach, 2)}</td>
            <td className="num hidden py-1.5 text-right sm:table-cell">{fmt(s.downrange, 1)} km</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
