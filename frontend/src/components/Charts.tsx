import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart, type ChartConfiguration, type Plugin } from 'chart.js/auto'
import { Download } from 'lucide-react'
import { readStageColor, sampleAt, type Track, type TrackSample } from '../lib/trajectory'
import { playback } from '../lib/playback'

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

function useColorScheme() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

const fmt = (v: number, digits = 1) =>
  Number.isFinite(v) ? v.toLocaleString('ja-JP', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—'

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

function ChartCard({ spec, track, dark }: { spec: ChartSpec; track: Track; dark: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart<'line'> | null>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const valueRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const c = themeColors()
    const xOf = (s: TrackSample) => (spec.x === 'time' ? s.t : s.downrange)
    const stageColors = new Map(track.stages.map((st) => [st.stage, readStageColor(st.stage)]))

    const datasets = spec.series.map((ser) => ({
      label: ser.label,
      data: track.samples.map((s) => ({ x: xOf(s), y: ser.get(s), stage: s.stage })),
      borderWidth: ser.secondary ? 1.25 : 1.75,
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
        layout: { padding: { top: 4, right: 4 } },
        plugins: {
          legend: { display: false },
          decimation: { enabled: spec.x === 'time', algorithm: 'lttb', samples: 600 },
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
            min: spec.x === 'time' ? track.t0 : undefined,
            max: spec.x === 'time' ? track.t1 : undefined,
            border: { color: c.line },
            grid: { color: c.line, drawTicks: false },
            ticks: { color: c.ink3, font: { family: 'IBM Plex Mono', size: 10 }, maxTicksLimit: 6, padding: 4 },
          },
          y: {
            border: { display: false },
            grid: { color: c.line, drawTicks: false },
            ticks: { color: c.ink3, font: { family: 'IBM Plex Mono', size: 10 }, maxTicksLimit: 5, padding: 6 },
          },
        },
        onClick: (_e, _els, chart) => {
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
    const place = () => {
      const t = playback.get().t
      const s = sampleAt(track, t)
      const area = chart.chartArea
      if (!area) return
      const x = chart.scales.x.getPixelForValue(spec.x === 'time' ? t : s.downrange)
      const yv = primary.get(s)
      const y = chart.scales.y.getPixelForValue(yv)
      const inside = x >= area.left - 0.5 && x <= area.right + 0.5
      if (lineRef.current) {
        lineRef.current.style.display = inside && spec.x === 'time' ? 'block' : 'none'
        lineRef.current.style.transform = `translateX(${x}px)`
        lineRef.current.style.top = `${area.top}px`
        lineRef.current.style.height = `${area.bottom - area.top}px`
      }
      if (dotRef.current) {
        dotRef.current.style.display = inside ? 'block' : 'none'
        dotRef.current.style.transform = `translate(${x - 4}px, ${y - 4}px)`
        dotRef.current.style.background = readStageColorCached(s.stage)
      }
      if (valueRef.current) {
        valueRef.current.textContent = `${fmt(yv, spec.digits)}${spec.unit ? ` ${spec.unit}` : ''}`
      }
    }
    const colorCache = new Map<number, string>()
    const readStageColorCached = (stage: number) => {
      let v = colorCache.get(stage)
      if (!v) colorCache.set(stage, (v = readStageColor(stage)))
      return v
    }

    place()
    const unsub = playback.subscribe(place)
    const ro = new ResizeObserver(() => requestAnimationFrame(place))
    ro.observe(canvasRef.current)
    return () => {
      unsub()
      ro.disconnect()
      chart.destroy()
      chartRef.current = null
    }
  }, [spec, track, dark])

  const download = () => {
    const chart = chartRef.current
    if (!chart) return
    const a = document.createElement('a')
    a.href = chart.toBase64Image('image/png', 1)
    a.download = `${spec.id}.png`
    a.click()
  }

  return (
    <figure className="group relative flex h-[210px] min-w-0 flex-col rounded-[8px] border border-line bg-surface p-3 pb-2">
      <figcaption className="flex items-baseline gap-2 pb-1">
        <span className="text-[12px] font-semibold">{spec.title}</span>
        {spec.series.length > 1 && (
          <span className="hidden truncate text-[11px] text-ink-3 sm:inline">
            {spec.series[0].label} / <span className="border-b border-dashed border-ink-3">{spec.series[1].label}</span>
          </span>
        )}
        <span ref={valueRef} className="num ml-auto whitespace-nowrap text-[12px] text-ink" />
        <button
          type="button"
          onClick={download}
          aria-label={`${spec.title}をPNGで保存`}
          title="PNGで保存"
          className="-mr-1 hidden h-5 w-5 items-center justify-center rounded text-ink-3 hover:text-ink group-hover:flex"
        >
          <Download className="h-3 w-3" />
        </button>
      </figcaption>
      <div className="relative min-h-0 flex-1 cursor-crosshair">
        <canvas ref={canvasRef} />
        <div ref={lineRef} className="pointer-events-none absolute left-0 w-px bg-ink/60" style={{ top: 0 }} />
        <div ref={dotRef} className="pointer-events-none absolute left-0 top-0 h-2 w-2 rounded-full ring-2 ring-surface" />
      </div>
    </figure>
  )
}

export function ChartGrid({ track }: { track: Track }) {
  const dark = useColorScheme()
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-2">
      {CHARTS.map((spec) => (
        <ChartCard key={spec.id} spec={spec} track={track} dark={dark} />
      ))}
    </div>
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
