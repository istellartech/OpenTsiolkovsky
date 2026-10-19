import { useEffect, useRef } from 'react'
import { Chart, type ChartConfiguration, type Plugin } from 'chart.js/auto'
import { cssVar, useTheme } from '../../lib/theme'
import { fmt } from '../../lib/format'
import { useLang } from '../../lib/i18n'

export interface OptSeries {
  label: string
  points: { x: number; y: number }[]
  color: string
  dash?: number[]
  width?: number
  /** Background traces (earlier iterations, reference runs). */
  faint?: boolean
  /** Draw as steps (piecewise-constant limits). */
  step?: boolean
}
export interface OptBand {
  from: number
  to: number
  color: string
}
export interface OptMarker {
  x: number
  label: string
}

interface Overlay {
  bands: OptBand[]
  markers: OptMarker[]
  cursor: number | null
  line: string
  ink: string
}
// Phase shading, event lines and the cursor, drawn under/over the datasets.
const overlay: Plugin<'line'> = {
  id: 'optOverlay',
  beforeDatasetsDraw(chart) {
    const o = (chart.options.plugins as unknown as { optOverlay?: Overlay }).optOverlay
    if (!o) return
    const { ctx, chartArea: a, scales } = chart
    ctx.save()
    for (const b of o.bands) {
      const x0 = Math.max(a.left, scales.x.getPixelForValue(b.from)),
        x1 = Math.min(a.right, scales.x.getPixelForValue(b.to))
      if (x1 <= x0) continue
      ctx.fillStyle = b.color
      ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top)
    }
    ctx.strokeStyle = o.line
    ctx.setLineDash([2, 3])
    ctx.font = '10px IBM Plex Sans JP, sans-serif'
    ctx.fillStyle = o.ink
    for (const m of o.markers) {
      const x = scales.x.getPixelForValue(m.x)
      if (x < a.left || x > a.right) continue
      ctx.beginPath()
      ctx.moveTo(x, a.top)
      ctx.lineTo(x, a.bottom)
      ctx.stroke()
    }
    ctx.restore()
  },
  afterDatasetsDraw(chart) {
    const o = (chart.options.plugins as unknown as { optOverlay?: Overlay }).optOverlay
    if (!o || o.cursor === null) return
    const { ctx, chartArea: a, scales } = chart
    const x = scales.x.getPixelForValue(o.cursor)
    if (x < a.left || x > a.right) return
    ctx.save()
    ctx.strokeStyle = o.ink
    ctx.globalAlpha = 0.55
    ctx.beginPath()
    ctx.moveTo(x, a.top)
    ctx.lineTo(x, a.bottom)
    ctx.stroke()
    ctx.restore()
  },
}

export function OptChart({
  title,
  unit,
  xLabel,
  series,
  bands = [],
  markers = [],
  cursor = null,
  onCursor,
  logY = false,
  yMin,
  yMax,
  xMin,
  xMax,
  digits = 1,
  height = 200,
  note,
  value,
}: {
  title: string
  unit: string
  xLabel: string
  series: OptSeries[]
  bands?: OptBand[]
  markers?: OptMarker[]
  cursor?: number | null
  onCursor?: (x: number) => void
  logY?: boolean
  yMin?: number
  yMax?: number
  xMin?: number
  xMax?: number
  digits?: number
  height?: number
  note?: string
  /** Text shown at the top right (e.g. the value at the cursor). */
  value?: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    chart = useRef<Chart<'line'> | null>(null)
  const theme = useTheme(),
    lang = useLang()
  const onCursorRef = useRef(onCursor)
  useEffect(() => {
    onCursorRef.current = onCursor
  }, [onCursor])
  useEffect(() => {
    if (!canvas.current) return
    const c = { ink: cssVar('--ink'), ink3: cssVar('--ink-3'), line: cssVar('--line'), surface: cssVar('--surface') }
    const config: ChartConfiguration<'line'> = {
      type: 'line',
      data: { datasets: [] },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        parsing: false as unknown as undefined,
        normalized: true,
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: c.ink,
            titleColor: c.surface,
            bodyColor: c.surface,
            titleFont: { family: 'IBM Plex Mono', size: 11, weight: 500 },
            bodyFont: { family: 'IBM Plex Mono', size: 11 },
            padding: 8,
            cornerRadius: 4,
            displayColors: false,
            filter: (item) => !(item.dataset as { faint?: boolean }).faint,
          },
        },
        scales: {
          x: {
            type: 'linear',
            border: { color: c.line },
            grid: { color: c.line, drawTicks: false },
            ticks: { color: c.ink3, font: { family: 'IBM Plex Mono', size: 10 }, maxTicksLimit: 7, padding: 4 },
            title: { display: true, color: c.ink3, font: { size: 10 } },
          },
          y: {
            border: { display: false },
            grid: { color: c.line, drawTicks: false },
            ticks: { color: c.ink3, font: { family: 'IBM Plex Mono', size: 10 }, maxTicksLimit: 6, padding: 6 },
          },
        },
        onClick: (event, _els, ch) => {
          const x = ch.scales.x.getValueForPixel((event as unknown as { x: number }).x)
          if (x !== undefined) onCursorRef.current?.(x)
        },
      },
      plugins: [overlay],
    }
    chart.current = new Chart(canvas.current, config)
    return () => {
      chart.current?.destroy()
      chart.current = null
    }
  }, [theme, lang])
  useEffect(() => {
    const ch = chart.current
    if (!ch) return
    const c = { ink: cssVar('--ink'), line: cssVar('--line-strong'), ink3: cssVar('--ink-3') }
    // Drop points outside an explicit x window so the y axis fits what is shown.
    const visible = (points: { x: number; y: number }[]) =>
      xMin === undefined && xMax === undefined
        ? points
        : points.filter((p, i) => {
            const near = (q: { x: number } | undefined) => !!q && (xMin === undefined || q.x >= xMin) && (xMax === undefined || q.x <= xMax)
            return near(p) || near(points[i - 1]) || near(points[i + 1])
          })
    ch.data.datasets = series.map((s) => ({
      label: s.label,
      data: visible(s.points),
      borderColor: s.color,
      borderWidth: s.width ?? (s.faint ? 1 : 1.75),
      borderDash: s.dash,
      pointRadius: 0,
      pointHitRadius: s.faint ? 0 : 6,
      stepped: s.step ? 'before' : false,
      tension: 0,
      faint: s.faint,
    })) as never
    const xs = ch.options.scales!.x!,
      ys = ch.options.scales!.y! as unknown as { type: string; min?: number; max?: number }
    xs.min = xMin
    xs.max = xMax
    ;(xs as { title: { text: string } }).title.text = xLabel
    ys.type = logY ? 'logarithmic' : 'linear'
    ;(ys as unknown as { ticks: { callback?: (v: number | string) => string } }).ticks.callback = logY
      ? (v) => {
          const n = Number(v),
            e = Math.log10(n)
          return Math.abs(e - Math.round(e)) < 1e-9 ? `1e${Math.round(e)}` : ''
        }
      : undefined
    ys.min = yMin
    ys.max = yMax
    ;(ch.options.plugins as unknown as { optOverlay: Overlay }).optOverlay = { bands, markers, cursor, line: c.line, ink: c.ink }
    ch.options.plugins!.tooltip!.callbacks = {
      title: (items) => `${xLabel.split(' [')[0]} ${fmt(items[0]?.parsed.x ?? 0, 1)}`,
      label: (item) => `${item.dataset.label}  ${logY ? (item.parsed.y ?? 0).toExponential(2) : fmt(item.parsed.y ?? 0, digits)} ${unit}`,
    }
    ch.update('none')
  }, [series, bands, markers, cursor, logY, yMin, yMax, xMin, xMax, xLabel, unit, digits, theme, lang])
  return (
    <figure className="flex min-w-0 flex-col rounded-[8px] border border-line bg-surface p-3 pb-2" style={{ height }}>
      <figcaption className="flex shrink-0 items-baseline gap-2 pb-1">
        <span className="text-[12px] font-semibold">{title}</span>
        {unit ? <span className="text-[11px] text-ink-3">[{unit}]</span> : null}
        {value ? <span className="num ml-auto whitespace-nowrap text-[12px] text-ink">{value}</span> : null}
      </figcaption>
      {note ? <p className="-mt-0.5 mb-1 text-[10px] leading-snug text-ink-3">{note}</p> : null}
      <div className="relative min-h-0 flex-1 cursor-crosshair">
        <canvas ref={canvas} aria-label={title} role="img" />
      </div>
      {series.some((s) => !s.faint) && series.length > 1 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1 text-[10px] text-ink-3">
          {series
            .filter((s, i, all) => all.findIndex((v) => v.label === s.label) === i && !s.faint)
            .map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1">
                <svg width="14" height="4" aria-hidden="true">
                  <line x1="0" y1="2" x2="14" y2="2" stroke={s.color} strokeWidth="2" strokeDasharray={s.dash?.join(' ')} />
                </svg>
                {s.label}
              </span>
            ))}
        </div>
      ) : null}
    </figure>
  )
}
