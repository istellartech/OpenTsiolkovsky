import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart, ChartConfiguration } from 'chart.js/auto'
import type { Plugin } from 'chart.js'
import type { SimulationState, ClientConfig } from '../lib/types'
import { vec3ToObject } from '../lib/types'
import { computeDownrangeKm, eciToLatLon } from '../lib/geo'
import { Badge } from './ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion'
import { cn } from '../lib/utils'

type EventMarker = {
  time: number
  label: string
  color: string
  dashed?: boolean
}

type StageBand = {
  start: number
  end: number
  color: string
  label: string
  labelColor: string
}

type StagePlan = {
  index: number
  startTime: number
  burnStartTime: number
  burnEndTime: number
  cutoffTime: number
  separationTime: number
}

type StageSummary = {
  stage: number
  startIndex: number
  endIndex: number
  startTime: number
  endTime: number
  duration: number
  poweredDuration: number
  maxAltitude: number
  maxMach: number
  maxThrust: number
  accentColor: string
  fillColor: string
  missing?: boolean
  plan?: StagePlan
}

type ChartDefinition = {
  key: string
  config: ChartConfiguration
  height?: number
}

type StagePanelDefinition = {
  summary: StageSummary
  label: string
  charts: ChartDefinition[]
  missing?: boolean
}

type SummaryCard = {
  key: string
  label: string
  value: string
  detail?: string
}

const stagePalette = [
  { accent: '#1d4ed8', fill: 'rgba(37, 99, 235, 0.09)' },
  { accent: '#047857', fill: 'rgba(16, 185, 129, 0.12)' },
  { accent: '#ea580c', fill: 'rgba(249, 115, 22, 0.12)' },
  { accent: '#7c3aed', fill: 'rgba(147, 51, 234, 0.12)' },
]

function resolveStageNumber(summary: StageSummary, idx: number): number {
  const numeric = Number(summary.stage)
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric
  }
  return idx + 1
}

function formatStageLabel(summary: StageSummary, idx: number): string {
  return `Stage ${resolveStageNumber(summary, idx)}`
}

function adjustAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgba(')) {
    const body = color.slice(5, -1).split(',').map((token) => token.trim())
    if (body.length === 4) {
      return `rgba(${body[0]}, ${body[1]}, ${body[2]}, ${alpha})`
    }
  }
  return color
}

function buildStagePlans(config?: ClientConfig): StagePlan[] {
  if (!config || !config.stages || config.stages.length === 0) return []
  const duration = Number.isFinite(config.simulation.duration_s)
    ? config.simulation.duration_s
    : Math.max(0, config.simulation.duration_s)

  const plans: StagePlan[] = []
  let cursor = 0
  config.stages.forEach((stage, idx) => {
    const stageStart = cursor
    const burnStart = stageStart + Math.max(0, stage.burn_start_s ?? 0)
    const burnEndRelative = Math.max(stage.burn_end_s ?? 0, stage.burn_start_s ?? 0)
    const burnEnd = stageStart + burnEndRelative
    const cutoffRelative = Math.max(stage.forced_cutoff_s ?? 0, burnEndRelative)
    const cutoff = stageStart + cutoffRelative

    let separationRelative = stage.separation_time_s ?? cutoffRelative
    separationRelative = Math.max(separationRelative, cutoffRelative)

    let separation = idx < config.stages.length - 1 ? stageStart + separationRelative : duration
    if (!Number.isFinite(separation) || separation <= stageStart) {
      separation = stageStart + cutoffRelative
    }
    if (!Number.isFinite(separation) || separation <= stageStart) {
      separation = stageStart + 1
    }
    separation = Math.max(separation, stageStart)
    separation = Number.isFinite(duration) ? Math.min(separation, duration) : separation

    plans.push({
      index: idx + 1,
      startTime: stageStart,
      burnStartTime: burnStart,
      burnEndTime: burnEnd,
      cutoffTime: cutoff,
      separationTime: separation,
    })

    cursor = separation
  })

  return plans
}

const eventMarkerPlugin: Plugin = {
  id: 'eventMarkers',
  beforeDraw(chart) {
    const opts = (chart.options.plugins as any)?.eventMarkers as {
      stageBands?: StageBand[]
    } | undefined
    if (!opts?.stageBands || opts.stageBands.length === 0) return
    const xScale = chart.scales.x as any
    if (!xScale) return
    const { top, bottom, left, right } = chart.chartArea
    const ctx = chart.ctx
    ctx.save()
    opts.stageBands.forEach((band) => {
      const start = Math.max(band.start, xScale.min)
      const end = Math.min(band.end, xScale.max)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return
      }
      const xStart = xScale.getPixelForValue(start)
      const xEnd = xScale.getPixelForValue(end)
      if (!Number.isFinite(xStart) || !Number.isFinite(xEnd)) {
        return
      }
      ctx.fillStyle = band.color
      ctx.fillRect(xStart, top, xEnd - xStart, bottom - top)
      if (band.label) {
        const labelX = Math.min(Math.max(xStart + 6, left + 4), right - 24)
        ctx.fillStyle = band.labelColor
        ctx.font = '10px "Helvetica Neue", Arial, sans-serif'
        ctx.textBaseline = 'top'
        ctx.textAlign = 'left'
        ctx.fillText(band.label, labelX, top + 4)
      }
    })
    ctx.restore()
  },
  afterDraw(chart) {
    const opts = (chart.options.plugins as any)?.eventMarkers as {
      markers?: EventMarker[]
    } | undefined
    if (!opts?.markers || opts.markers.length === 0) return
    const xScale = chart.scales.x as any
    if (!xScale) return
    const { top, bottom, left, right } = chart.chartArea
    const ctx = chart.ctx
    opts.markers.forEach((marker, idx) => {
      if (!Number.isFinite(marker.time)) return
      if (marker.time < xScale.min || marker.time > xScale.max) return
      const x = xScale.getPixelForValue(marker.time)
      if (!Number.isFinite(x)) return
      ctx.save()
      ctx.strokeStyle = marker.color
      ctx.lineWidth = 1
      if (marker.dashed) {
        ctx.setLineDash([4, 4])
      } else {
        ctx.setLineDash([])
      }
      ctx.beginPath()
      ctx.moveTo(x, top)
      ctx.lineTo(x, bottom)
      ctx.stroke()
      ctx.restore()

      if (marker.label) {
        ctx.save()
        ctx.fillStyle = marker.color
        ctx.font = '10px "Helvetica Neue", Arial, sans-serif'
        ctx.textBaseline = 'top'
        const isRight = x > (left + right) / 2
        ctx.textAlign = isRight ? 'right' : 'left'
        const offsetY = top + 6 + (idx % 3) * 12
        const offsetX = isRight ? x - 6 : x + 6
        ctx.fillText(marker.label, offsetX, offsetY)
        ctx.restore()
      }
    })
  },
}

let eventPluginRegistered = false
if (!eventPluginRegistered) {
  Chart.register(eventMarkerPlugin)
  eventPluginRegistered = true
}

function ChartCard({ config, height = 260 }: { config: ChartConfiguration; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }
    chartRef.current = new Chart(ctx, config)

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [config])

  return (
    <div style={{ height }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

export function GraphPanel({ data, stagePlanConfig }: { data: SimulationState[]; stagePlanConfig?: ClientConfig }) {
  const [showStagePanels, setShowStagePanels] = useState(true)
  const [showGlobalCharts, setShowGlobalCharts] = useState(true)
  const [expandedStagePanels, setExpandedStagePanels] = useState<string[]>([])
  const computed = useMemo(() => {
    if (!data || data.length === 0) return null

    const times = data.map((s) => s.time)
    const altitude = data.map((s) => s.altitude)
    const altitudeKm = altitude.map((m) => m / 1000)
    const velocity = data.map((s) => s.velocity_magnitude)
    const mach = data.map((s) => s.mach_number)
    const dynamicPressure = data.map((s) => s.dynamic_pressure)
    const dynamicPressureKPa = dynamicPressure.map((q) => q / 1000)
    const mass = data.map((s) => s.mass)
    const thrust = data.map((s) => s.thrust)
    const drag = data.map((s) => s.drag_force)
    const positions = data.map((s) => eciToLatLon(vec3ToObject(s.position)))
    const downrangeKm = computeDownrangeKm(positions)

    const verticalSpeed = altitude.map((alt, idx) => {
      if (idx === 0) return 0
      const dt = Math.max(1e-6, times[idx] - times[idx - 1])
      return (alt - altitude[idx - 1]) / dt
    })
    const horizontalSpeed = downrangeKm.map((dr, idx) => {
      if (idx === 0) return 0
      const dt = Math.max(1e-6, times[idx] - times[idx - 1])
      return ((dr - downrangeKm[idx - 1]) * 1000) / dt
    })
    const flightPathDeg = verticalSpeed.map((vz, idx) => {
      const vx = horizontalSpeed[idx]
      return Number.isFinite(vx) ? (Math.atan2(vz, vx) * 180) / Math.PI : 0
    })
    const accelApprox = velocity.map((v, idx) => {
      if (idx === 0) return 0
      const dt = Math.max(1e-6, times[idx] - times[idx - 1])
      return (v - velocity[idx - 1]) / dt
    })
    const accelG = accelApprox.map((a) => a / 9.80665)

    const maxThrust = thrust.reduce((acc, t) => Math.max(acc, Math.abs(t)), 0)
    const thrustThreshold = maxThrust > 0 ? Math.max(maxThrust * 0.02, 1e-3) : 0
    const isPowered = thrust.map((t) => Math.abs(t) > thrustThreshold)

    const stageSummariesRaw: StageSummary[] = []
    if (data.length > 0) {
      let stageStart = 0
      let stageIndex = 0
      let currentStage = data[0].stage ?? 0
      const lastIndex = data.length

      const pushStage = (endIdx: number) => {
        const safeEnd = Math.max(stageStart + 1, endIdx)
        const startTime = times[stageStart]
        const endTime = times[Math.min(safeEnd - 1, times.length - 1)]
        const duration = Math.max(0, endTime - startTime)
        let poweredDuration = 0
        for (let i = stageStart + 1; i < safeEnd; i++) {
          const dt = Math.max(0, times[i] - times[i - 1])
          if (isPowered[i - 1] || isPowered[i]) {
            poweredDuration += dt
          }
        }
        const altSlice = altitude.slice(stageStart, safeEnd)
        const machSlice = mach.slice(stageStart, safeEnd)
        const thrustSlice = thrust.slice(stageStart, safeEnd).map((v) => Math.abs(v))
        const maxAlt = altSlice.length > 0 ? Math.max(...altSlice) : 0
        const maxMachStage = machSlice.length > 0 ? Math.max(...machSlice) : 0
        const maxThrustStage = thrustSlice.length > 0 ? Math.max(...thrustSlice) : 0
        const stageValue = data[Math.min(stageStart, lastIndex - 1)]?.stage ?? currentStage
        stageSummariesRaw.push({
          stage: stageValue,
          startIndex: stageStart,
          endIndex: safeEnd,
          startTime,
          endTime,
          duration,
          poweredDuration,
          maxAltitude: maxAlt,
          maxMach: maxMachStage,
          maxThrust: maxThrustStage,
          accentColor: '',
          fillColor: '',
        })
        stageIndex += 1
      }

      for (let i = 1; i < lastIndex; i++) {
        if (data[i].stage !== currentStage) {
          pushStage(i)
          stageStart = i
          currentStage = data[i].stage
        }
      }
      pushStage(lastIndex)
    }

    const executedSummaries = stageSummariesRaw.map((summary, idx) => {
      const numericStage = Number(summary.stage)
      const resolvedStage = Number.isFinite(numericStage) && numericStage > 0 ? numericStage : idx + 1
      return { ...summary, stage: resolvedStage }
    })

    const stagePlans = buildStagePlans(stagePlanConfig)
    const stageOrder = stagePlans.length > 0
      ? stagePlans.map((plan) => plan.index)
      : executedSummaries.map((summary) => summary.stage)

    const summaryByStage = new Map<number, StageSummary>()
    executedSummaries.forEach((summary) => {
      summaryByStage.set(summary.stage, summary)
    })

    const orderedSummaries: StageSummary[] = []

    stageOrder.forEach((stageIdx, idx) => {
      const palette = stagePalette[idx % stagePalette.length]
      const plan = stagePlans.find((entry) => entry.index === stageIdx)
      const summary = summaryByStage.get(stageIdx)
      if (summary) {
        summaryByStage.delete(stageIdx)
        orderedSummaries.push({
          ...summary,
          stage: stageIdx,
          accentColor: palette.accent,
          fillColor: palette.fill,
          plan,
          missing: false,
        })
      } else if (plan) {
        orderedSummaries.push({
          stage: stageIdx,
          startIndex: 0,
          endIndex: 0,
          startTime: plan.startTime,
          endTime: plan.separationTime,
          duration: Math.max(0, plan.separationTime - plan.startTime),
          poweredDuration: Math.max(0, plan.cutoffTime - plan.startTime),
          maxAltitude: Number.NaN,
          maxMach: Number.NaN,
          maxThrust: Number.NaN,
          accentColor: palette.accent,
          fillColor: palette.fill,
          plan,
          missing: true,
        })
      }
    })

    if (summaryByStage.size > 0) {
      const extras = Array.from(summaryByStage.values()).sort((a, b) => a.stage - b.stage)
      extras.forEach((summary, extraIdx) => {
        const palette = stagePalette[(orderedSummaries.length + extraIdx) % stagePalette.length]
        orderedSummaries.push({
          ...summary,
          accentColor: palette.accent,
          fillColor: palette.fill,
          plan: stagePlans.find((plan) => plan.index === summary.stage),
          missing: false,
        })
      })
    }

    if (orderedSummaries.length === 0) {
      executedSummaries.forEach((summary, idx) => {
        const palette = stagePalette[idx % stagePalette.length]
        orderedSummaries.push({
          ...summary,
          accentColor: palette.accent,
          fillColor: palette.fill,
          plan: stagePlans.find((plan) => plan.index === summary.stage),
          missing: false,
        })
      })
    }

    const stageSummaries = orderedSummaries
    const stageBands: StageBand[] = stageSummaries.map((summary, idx) => {
      const number = resolveStageNumber(summary, idx)
      const labelBase = `S${number}`
      const label = summary.missing ? `${labelBase} (予定)` : labelBase
      const baseFill = summary.fillColor || stagePalette[idx % stagePalette.length].fill
      const bandColor = summary.missing ? adjustAlpha(baseFill, 0.04) : baseFill
      return {
        start: summary.startTime,
        end: summary.endTime,
        color: bandColor,
        label,
        labelColor: summary.accentColor,
      }
    })

    const markers: EventMarker[] = []
    const seen = new Set<string>()
    const addMarker = (marker: EventMarker) => {
      if (!Number.isFinite(marker.time)) return
      const key = `${marker.label}-${marker.time.toFixed(3)}`
      if (seen.has(key)) return
      seen.add(key)
      markers.push(marker)
    }

    stageBands.slice(1).forEach((band) => {
      addMarker({
        time: band.start,
        label: `${band.label} start`,
        color: band.labelColor,
      })
    })

    let prevPowered = isPowered[0]
    for (let i = 1; i < isPowered.length; i++) {
      if (isPowered[i] !== prevPowered) {
        addMarker({
          time: times[i],
          label: isPowered[i] ? 'Engine ignition' : 'Engine cutoff',
          color: isPowered[i] ? '#f97316' : '#dc2626',
          dashed: !isPowered[i],
        })
        prevPowered = isPowered[i]
      }
    }

    const apogeeIndex = altitude.reduce((best, value, idx) => (value > altitude[best] ? idx : best), 0)
    addMarker({ time: times[apogeeIndex], label: 'Apogee', color: '#db2777' })
    const maxQIndex = dynamicPressure.reduce((best, value, idx) => (value > dynamicPressure[best] ? idx : best), 0)
    addMarker({ time: times[maxQIndex], label: 'Max Q', color: '#7c3aed', dashed: true })

    const thrustKn = thrust.map((v) => v / 1000)
    const dragKn = drag.map((v) => v / 1000)

    const stagePanels: StagePanelDefinition[] = stageSummaries.map((summary, idx) => {
      const startIdx = summary.startIndex
      const endIdx = summary.endIndex
      const missing = Boolean(summary.missing)
      const baseLabel = formatStageLabel(summary, idx)
      const label = missing ? `${baseLabel} (未到達)` : baseLabel
      if (startIdx >= endIdx || missing) {
        return {
          summary,
          label,
          charts: [],
          missing,
        }
      }
      const stageTimes = times.slice(startIdx, endIdx)
      const stageMarkers = markers.filter(
        (marker) => marker.time >= summary.startTime && marker.time <= summary.endTime,
      )

      const altitudeStage = altitudeKm.slice(startIdx, endIdx)
      const velocityStage = velocity.slice(startIdx, endIdx)
      const verticalStage = verticalSpeed.slice(startIdx, endIdx)
      const horizontalStage = horizontalSpeed.slice(startIdx, endIdx)
      const thrustStage = thrustKn.slice(startIdx, endIdx)
      const dragStage = dragKn.slice(startIdx, endIdx)

      const accent = summary.accentColor

      const stageCharts: ChartDefinition[] = [
        {
          key: `stage-${idx}-altitude`,
          config: {
            type: 'line',
            data: {
              labels: stageTimes,
              datasets: [
                {
                  label: 'Altitude [km]',
                  data: altitudeStage,
                  borderColor: accent,
                  borderWidth: 2,
                  tension: 0.18,
                  pointRadius: 0,
                  fill: false,
                },
              ],
            },
            options: {
              responsive: true,
              animation: false,
              maintainAspectRatio: false,
              scales: {
                x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
                y: { title: { display: true, text: 'Altitude [km]' } },
              },
              plugins: {
                legend: { display: false },
                title: { display: true, text: `${label}: Altitude`, align: 'start' },
                tooltip: { intersect: false },
                eventMarkers: { markers: stageMarkers },
              },
            } as any,
          },
          height: 220,
        },
        {
          key: `stage-${idx}-velocity`,
          config: {
            type: 'line',
            data: {
              labels: stageTimes,
              datasets: [
                {
                  label: '|Velocity| [m/s]',
                  data: velocityStage,
                  borderColor: '#0ea5e9',
                  borderWidth: 2,
                  tension: 0.18,
                  pointRadius: 0,
                },
                {
                  label: 'Vertical [m/s]',
                  data: verticalStage,
                  borderColor: '#14b8a6',
                  borderWidth: 1.5,
                  borderDash: [6, 3],
                  tension: 0.15,
                  pointRadius: 0,
                },
                {
                  label: 'Horizontal [m/s]',
                  data: horizontalStage,
                  borderColor: '#f59e0b',
                  borderWidth: 1.5,
                  borderDash: [4, 4],
                  tension: 0.15,
                  pointRadius: 0,
                },
              ],
            },
            options: {
              responsive: true,
              animation: false,
              maintainAspectRatio: false,
              scales: {
                x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
                y: { title: { display: true, text: 'Velocity [m/s]' } },
              },
              plugins: {
                legend: { display: true, position: 'bottom' },
                title: { display: true, text: `${label}: Velocity`, align: 'start' },
                tooltip: { intersect: false },
                eventMarkers: { markers: stageMarkers },
              },
            } as any,
          },
          height: 220,
        },
        {
          key: `stage-${idx}-thrust`,
          config: {
            type: 'line',
            data: {
              labels: stageTimes,
              datasets: [
                {
                  label: 'Thrust [kN]',
                  data: thrustStage,
                  borderColor: '#ef4444',
                  borderWidth: 2,
                  tension: 0.18,
                  pointRadius: 0,
                },
                {
                  label: 'Drag [kN]',
                  data: dragStage,
                  borderColor: '#2563eb',
                  borderWidth: 2,
                  borderDash: [4, 4],
                  tension: 0.18,
                  pointRadius: 0,
                },
              ],
            },
            options: {
              responsive: true,
              animation: false,
              maintainAspectRatio: false,
              scales: {
                x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
                y: { title: { display: true, text: 'Force [kN]' } },
              },
              plugins: {
                legend: { display: true, position: 'bottom' },
                title: { display: true, text: `${label}: Thrust vs. drag`, align: 'start' },
                tooltip: { intersect: false },
                eventMarkers: { markers: stageMarkers },
              },
            } as any,
          },
          height: 220,
        },
      ]

      return {
        summary,
        label,
        charts: stageCharts,
        missing: false,
      }
    })

    const altitudeDownrange = downrangeKm.map((x, idx) => ({ x, y: altitudeKm[idx] }))

    const charts: ChartDefinition[] = [
      {
        key: 'altitude',
        config: {
          type: 'line',
          data: {
            labels: times,
            datasets: [
              {
                label: 'Altitude [km]',
                data: altitudeKm,
                borderColor: '#2563eb',
                borderWidth: 2,
                tension: 0.18,
                pointRadius: 0,
              },
            ],
          },
          options: {
            responsive: true,
            animation: false,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
              y: { title: { display: true, text: 'Altitude [km]' } },
            },
            plugins: {
              legend: { display: false },
              title: { display: true, text: 'Altitude over time', align: 'start' },
              tooltip: { intersect: false },
              eventMarkers: { markers, stageBands },
            },
          } as any,
        },
      },
      {
        key: 'downrange',
        config: {
          type: 'line',
          data: {
            labels: times,
            datasets: [
              {
                label: 'Downrange [km]',
                data: downrangeKm,
                borderColor: '#0f766e',
                borderWidth: 2,
                tension: 0.15,
                pointRadius: 0,
              },
            ],
          },
          options: {
            responsive: true,
            animation: false,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
              y: { title: { display: true, text: 'Downrange [km]' } },
            },
            plugins: {
              legend: { display: false },
              title: { display: true, text: 'Downrange over time', align: 'start' },
              tooltip: { intersect: false },
              eventMarkers: { markers, stageBands },
            },
          } as any,
        },
      },
      {
        key: 'altitude-downrange',
        config: {
          type: 'scatter',
          data: {
            datasets: [
              {
                label: 'Trajectory',
                data: altitudeDownrange,
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.2)',
                showLine: true,
                pointRadius: 1.5,
              },
            ],
          },
          options: {
            responsive: true,
            animation: false,
            maintainAspectRatio: false,
            parsing: false,
            scales: {
              x: { title: { display: true, text: 'Downrange [km]' } },
              y: { title: { display: true, text: 'Altitude [km]' } },
            },
            plugins: {
              legend: { display: false },
              title: { display: true, text: 'Altitude vs. downrange', align: 'start' },
              tooltip: { intersect: false },
            },
          },
        },
      },
      {
        key: 'velocity',
        config: {
          type: 'line',
          data: {
            labels: times,
            datasets: [
              {
                label: '|Velocity| [m/s]',
                data: velocity,
                borderColor: '#0ea5e9',
                borderWidth: 2,
                tension: 0.18,
                pointRadius: 0,
              },
              {
                label: 'Vertical [m/s]',
                data: verticalSpeed,
                borderColor: '#14b8a6',
                borderWidth: 1.5,
                borderDash: [6, 3],
                tension: 0.15,
                pointRadius: 0,
              },
              {
                label: 'Horizontal [m/s]',
                data: horizontalSpeed,
                borderColor: '#f59e0b',
                borderWidth: 1.5,
                borderDash: [4, 4],
                tension: 0.15,
                pointRadius: 0,
              },
            ],
          },
          options: {
            responsive: true,
            animation: false,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
              y: { title: { display: true, text: 'Velocity [m/s]' } },
            },
            plugins: {
              legend: { display: true, position: 'bottom' },
              title: { display: true, text: 'Velocity components', align: 'start' },
              tooltip: { intersect: false },
              eventMarkers: { markers, stageBands },
            },
          } as any,
        },
      },
      {
        key: 'flight-path',
        config: {
          type: 'line',
          data: {
            labels: times,
            datasets: [
              {
                label: 'Flight path angle [deg]',
                data: flightPathDeg,
                borderColor: '#6366f1',
                borderWidth: 2,
                tension: 0.2,
                pointRadius: 0,
                yAxisID: 'angle',
              },
              {
                label: 'Vertical speed [m/s]',
                data: verticalSpeed,
                borderColor: '#22d3ee',
                borderWidth: 1.5,
                borderDash: [6, 2],
                tension: 0.15,
                pointRadius: 0,
                yAxisID: 'vertical',
              },
            ],
          },
          options: {
            responsive: true,
            animation: false,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
              angle: {
                position: 'left',
                title: { display: true, text: 'Flight path angle [deg]' },
                ticks: { callback: (value: string | number) => `${value}` },
              },
              vertical: {
                position: 'right',
                title: { display: true, text: 'Vertical speed [m/s]' },
                grid: { drawOnChartArea: false },
              },
            },
            plugins: {
              legend: { display: true, position: 'bottom' },
              title: { display: true, text: 'Flight path angle', align: 'start' },
              tooltip: { intersect: false },
              eventMarkers: { markers, stageBands },
            },
          } as any,
        },
      },
      {
        key: 'mach-q',
        config: {
          type: 'line',
          data: {
            labels: times,
            datasets: [
              {
                label: 'Mach [-]',
                data: mach,
                borderColor: '#9333ea',
                borderWidth: 2,
                tension: 0.18,
                pointRadius: 0,
                yAxisID: 'mach',
              },
              {
                label: 'Dynamic pressure [kPa]',
                data: dynamicPressureKPa,
                borderColor: '#dc2626',
                borderWidth: 2,
                tension: 0.18,
                pointRadius: 0,
                yAxisID: 'q',
              },
            ],
          },
          options: {
            responsive: true,
            animation: false,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
              mach: { position: 'left', title: { display: true, text: 'Mach [-]' } },
              q: {
                position: 'right',
                title: { display: true, text: 'Dynamic pressure [kPa]' },
                grid: { drawOnChartArea: false },
              },
            },
            plugins: {
              legend: { display: true, position: 'bottom' },
              title: { display: true, text: 'Mach & dynamic pressure', align: 'start' },
              tooltip: { intersect: false },
              eventMarkers: { markers, stageBands },
            },
          } as any,
        },
      },
      {
        key: 'mass',
        config: {
          type: 'line',
          data: {
            labels: times,
            datasets: [
              {
                label: 'Mass [kg]',
                data: mass,
                borderColor: '#0f172a',
                backgroundColor: 'rgba(15, 23, 42, 0.08)',
                borderWidth: 2,
                tension: 0.18,
                pointRadius: 0,
                fill: true,
              },
            ],
          },
          options: {
            responsive: true,
            animation: false,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
              y: { title: { display: true, text: 'Mass [kg]' } },
            },
            plugins: {
              legend: { display: false },
              title: { display: true, text: 'Vehicle mass', align: 'start' },
              tooltip: { intersect: false },
              eventMarkers: { markers, stageBands },
            },
          } as any,
        },
      },
      {
        key: 'thrust-drag',
        config: {
          type: 'line',
          data: {
            labels: times,
            datasets: [
              {
                label: 'Thrust [kN]',
                data: thrustKn,
                borderColor: '#ef4444',
                borderWidth: 2,
                tension: 0.18,
                pointRadius: 0,
              },
              {
                label: 'Drag [kN]',
                data: dragKn,
                borderColor: '#2563eb',
                borderWidth: 2,
                borderDash: [4, 4],
                tension: 0.18,
                pointRadius: 0,
              },
            ],
          },
          options: {
            responsive: true,
            animation: false,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
              y: { title: { display: true, text: 'Force [kN]' } },
            },
            plugins: {
              legend: { display: true, position: 'bottom' },
              title: { display: true, text: 'Thrust vs. drag', align: 'start' },
              tooltip: { intersect: false },
              eventMarkers: { markers, stageBands },
            },
          } as any,
        },
      },
      {
        key: 'acceleration',
        config: {
          type: 'line',
          data: {
            labels: times,
            datasets: [
              {
                label: 'Approx. acceleration [G]',
                data: accelG,
                borderColor: '#15803d',
                borderWidth: 2,
                tension: 0.18,
                pointRadius: 0,
              },
            ],
          },
          options: {
            responsive: true,
            animation: false,
            maintainAspectRatio: false,
            scales: {
              x: { type: 'linear', title: { display: true, text: 'Time [s]' } },
              y: { title: { display: true, text: 'Acceleration [G]' } },
            },
            plugins: {
              legend: { display: false },
              title: { display: true, text: 'Approximate acceleration (|v| derivative)', align: 'start' },
              tooltip: { intersect: false },
              eventMarkers: { markers, stageBands },
            },
          } as any,
        },
      },
    ]

    const summaryCards: SummaryCard[] = []
    const maxAltitude = altitude[apogeeIndex] / 1000
    summaryCards.push({
      key: 'apogee',
      label: 'Apogee',
      value: `${maxAltitude.toFixed(2)} km`,
      detail: `@ ${times[apogeeIndex].toFixed(1)} s`,
    })
    const maxDownrange = downrangeKm.reduce((best, value, idx) => (value > downrangeKm[best] ? idx : best), 0)
    summaryCards.push({
      key: 'downrange',
      label: 'Max downrange',
      value: `${downrangeKm[maxDownrange].toFixed(2)} km`,
      detail: `@ ${times[maxDownrange].toFixed(1)} s`,
    })
    const maxMachIdx = mach.reduce((best, value, idx) => (value > mach[best] ? idx : best), 0)
    summaryCards.push({
      key: 'mach',
      label: 'Max Mach',
      value: mach[maxMachIdx].toFixed(2),
      detail: `@ ${times[maxMachIdx].toFixed(1)} s`,
    })
    summaryCards.push({
      key: 'maxq',
      label: 'Max Q',
      value: `${dynamicPressureKPa[maxQIndex].toFixed(1)} kPa`,
      detail: `@ ${times[maxQIndex].toFixed(1)} s`,
    })

    const ignition = markers.find((m) => m.label === 'Engine ignition')
    if (ignition) {
      summaryCards.push({
        key: 'ignition',
        label: 'Ignition',
        value: `${ignition.time.toFixed(1)} s`,
      })
    }
    const cutoff = markers.find((m) => m.label === 'Engine cutoff')
    if (cutoff) {
      summaryCards.push({
        key: 'cutoff',
        label: 'Cutoff',
        value: `${cutoff.time.toFixed(1)} s`,
      })
    }

    return {
      charts,
      stageSummaries,
      stagePanels,
      summaryCards,
    }
  }, [data, stagePlanConfig])

  if (!computed) {
    return <div className="text-sm text-slate-500">No simulation data.</div>
  }

  const { charts, stageSummaries, stagePanels, summaryCards } = computed

  useEffect(() => {
    const allowed = stagePanels.map((panel, idx) => `stage-${panel.summary.stage}-${idx}`)
    setExpandedStagePanels((prev) => {
      const filtered = prev.filter((id) => allowed.includes(id))
      if (filtered.length === 0 && allowed.length > 0) {
        return [allowed[0]]
      }
      return filtered
    })
  }, [stagePanels])

  const formatSeconds = (value: number) => (Number.isFinite(value) ? `${value.toFixed(1)} s` : 'N/A')
  const formatKilometers = (value: number) => (Number.isFinite(value) ? `${value.toFixed(2)} km` : 'N/A')
  const formatKn = (value: number) => (Number.isFinite(value) ? `${value.toFixed(1)} kN` : 'N/A')
  const formatMach = (value: number) => (Number.isFinite(value) ? value.toFixed(2) : 'N/A')

  const handleStagePanelToggle = (panelId: string) => {
    setShowStagePanels(true)
    setExpandedStagePanels((prev) => (prev.includes(panelId) ? prev.filter((id) => id !== panelId) : [...prev, panelId]))
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const element = document.getElementById(`graph-${panelId}`)
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
    }
  }

  return (
    <div className="grid gap-4">
      {summaryCards.length > 0 && (
        <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.key}
              className="rounded-xl border border-slate-200 bg-white/95 p-3 text-slate-900 shadow-xs shadow-slate-200/60"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</div>
              <div className="mt-2 text-2xl font-semibold text-slate-950">{card.value}</div>
              {card.detail && <div className="mt-1 text-xs text-slate-500">{card.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {stageSummaries.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Stage timeline</div>
          <div className="flex flex-wrap items-center gap-2">
            {stageSummaries.map((stage, idx) => {
              const panelId = `stage-${stage.stage}-${idx}`
              const isOpen = expandedStagePanels.includes(panelId)
              const label = formatStageLabel(stage, idx)
              const startText = Number.isFinite(stage.startTime) ? `${stage.startTime.toFixed(0)}s` : '—'
              const endText = Number.isFinite(stage.endTime) ? `${stage.endTime.toFixed(0)}s` : '—'
              const durationText = Number.isFinite(stage.duration) ? `${stage.duration.toFixed(1)}s` : 'N/A'
              const accent = stage.accentColor || '#1d4ed8'
              return (
                <button
                  key={`${stage.stage}-${idx}`}
                  type="button"
                  onClick={() => handleStagePanelToggle(panelId)}
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition',
                    isOpen ? 'bg-white shadow-xs' : 'bg-white text-slate-600 hover:border-slate-300 hover:text-brand-700',
                  )}
                  style={isOpen ? { borderColor: accent, color: accent } : { borderColor: adjustAlpha(accent, 0.3) }}
                >
                  <span className="font-semibold">{stage.missing ? `${label} (予定)` : label}</span>
                  <span className="text-[10px] text-slate-500">t0 {startText} → t1 {endText}</span>
                  <span className="text-[10px] text-slate-400">Δt {durationText}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {(stagePanels.length > 0 || charts.length > 0) && (
        <div className="mb-2 flex flex-wrap items-center justify-end gap-1.5">
          {stagePanels.length > 0 && (
            <button
              type="button"
              onClick={() => setShowStagePanels((prev) => !prev)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-xs transition hover:bg-slate-100"
            >
              {showStagePanels ? 'Hide stage panels' : 'Show stage panels'}
            </button>
          )}
          {charts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowGlobalCharts((prev) => !prev)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-xs transition hover:bg-slate-100"
            >
              {showGlobalCharts ? 'Hide global charts' : 'Show global charts'}
            </button>
          )}
        </div>
      )}

      {stagePanels.length > 0 && showStagePanels && (
        <Accordion
          type="multiple"
          value={expandedStagePanels}
          onValueChange={setExpandedStagePanels}
          className="grid gap-3"
        >
          {stagePanels.map((panel, idx) => {
            const { summary } = panel
            const plan = summary.plan
            const durationValue = summary.missing
              ? plan
                ? `${(plan.separationTime - plan.startTime).toFixed(1)} s (予定)`
                : 'N/A'
              : formatSeconds(summary.duration)
            const poweredValue = summary.missing
              ? plan
                ? `${(plan.cutoffTime - plan.startTime).toFixed(1)} s (予定)`
                : 'N/A'
              : formatSeconds(summary.poweredDuration)
            const maxAltValue = Number.isFinite(summary.maxAltitude)
              ? formatKilometers(summary.maxAltitude / 1000)
              : 'N/A'
            const maxMachValue = formatMach(summary.maxMach)
            const maxThrustValue = Number.isFinite(summary.maxThrust)
              ? formatKn(summary.maxThrust / 1000)
              : 'N/A'
            const stats = [
              { key: 'duration', label: 'Duration', value: durationValue },
              { key: 'powered', label: 'Powered flight', value: poweredValue },
              { key: 'max-alt', label: 'Max altitude', value: maxAltValue },
              { key: 'max-mach', label: 'Max Mach', value: maxMachValue },
              { key: 'max-thrust', label: 'Max thrust', value: maxThrustValue },
            ]
            const accordionValue = `stage-${summary.stage}-${idx}`
            return (
              <AccordionItem
                key={`stage-panel-${summary.stage}-${idx}`}
                value={accordionValue}
                id={`graph-${accordionValue}`}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xs shadow-slate-200/60"
              >
                <AccordionTrigger className="flex flex-wrap items-center justify-between gap-2.5 px-4 py-3 text-left">
                  <div className="flex items-center gap-2.5">
                    <Badge className="bg-brand/10 text-brand-700">{panel.label}</Badge>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      t0 {formatSeconds(summary.startTime)} → t1 {formatSeconds(summary.endTime)}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">{summary.missing ? 'Telemetry missing' : 'Telemetry captured'}</span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 px-4 pb-4">
                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
                      {stats.map((stat) => (
                        <div
                          key={stat.key}
                          className="rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 shadow-inner"
                        >
                          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat.label}</div>
                          <div className="mt-1 text-base font-semibold text-slate-900">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                    {panel.missing && (
                      <div className="text-xs text-slate-500">
                        テレメトリは取得されませんでした。
                        {plan && (
                          <span className="ml-1">予定: t0 {plan.startTime.toFixed(1)} s → 分離 {plan.separationTime.toFixed(1)} s</span>
                        )}
                      </div>
                    )}
                    {panel.charts.length > 0 && (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {panel.charts.map((chart) => (
                          <div
                            key={chart.key}
                            className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 shadow-inner"
                          >
                            <ChartCard config={chart.config} height={chart.height ?? 220} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      )}

      {charts.length > 0 && showGlobalCharts && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {charts.map((chart) => (
            <div
              key={chart.key}
              className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xs shadow-slate-200/60"
            >
              <ChartCard config={chart.config} height={chart.height ?? 260} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
