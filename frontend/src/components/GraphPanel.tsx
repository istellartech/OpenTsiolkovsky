import { useEffect, useMemo, useRef } from 'react'
import { Chart, ChartConfiguration } from 'chart.js/auto'
import type { Plugin } from 'chart.js'
import type { SimulationState } from '../lib/types'
import { vec3ToObject } from '../lib/types'
import { computeDownrangeKm, eciToLatLon } from '../lib/geo'

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

type StageSummary = {
  stage: number
  startTime: number
  endTime: number
  duration: number
  poweredDuration: number
  maxAltitude: number
  maxMach: number
  maxThrust: number
  accentColor: string
  fillColor: string
}

type ChartDefinition = {
  key: string
  config: ChartConfiguration
  height?: number
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

export function GraphPanel({ data }: { data: SimulationState[] }) {
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

    const stageSummaries: StageSummary[] = []
    if (data.length > 0) {
      let stageStart = 0
      let stageIndex = 0
      let currentStage = data[0].stage ?? 0
      const lastIndex = data.length

      const pushStage = (endIdx: number) => {
        const palette = stagePalette[stageIndex % stagePalette.length]
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
        stageSummaries.push({
          stage: currentStage,
          startTime,
          endTime,
          duration,
          poweredDuration,
          maxAltitude: maxAlt,
          maxMach: maxMachStage,
          maxThrust: maxThrustStage,
          accentColor: palette.accent,
          fillColor: palette.fill,
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

    const zeroIndexedStages = stageSummaries.length > 0 && stageSummaries[0].stage === 0
    const stageBands: StageBand[] = stageSummaries.map((summary, idx) => {
      const stageNumber = zeroIndexedStages ? summary.stage + 1 : summary.stage
      const label = Number.isFinite(stageNumber) ? `S${stageNumber}` : `S${idx + 1}`
      return {
        start: summary.startTime,
        end: summary.endTime,
        color: summary.fillColor,
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
      summaryCards,
      zeroIndexedStages,
    }
  }, [data])

  if (!computed) {
    return <div>No simulation data.</div>
  }

  const { charts, stageSummaries, summaryCards, zeroIndexedStages } = computed

  const stageDisplay = (summary: StageSummary, idx: number) => {
    const base = zeroIndexedStages ? summary.stage + 1 : summary.stage
    if (!Number.isFinite(base)) return `Stage ${idx + 1}`
    if (!zeroIndexedStages && base !== summary.stage) {
      return `Stage ${base} (ID ${summary.stage})`
    }
    return `Stage ${base}`
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {summaryCards.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {summaryCards.map((card) => (
            <div
              key={card.key}
              style={{
                padding: '12px 14px',
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.08)',
              }}
            >
              <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#0f172a' }}>{card.value}</div>
              {card.detail && <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{card.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {stageSummaries.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Stage timeline</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {stageSummaries.map((stage, idx) => (
              <div
                key={`${stage.stage}-${idx}`}
                style={{
                  padding: '14px 16px',
                  borderRadius: 10,
                  background: stage.fillColor,
                  border: `1px solid ${stage.accentColor}33`,
                }}
              >
                <div style={{ fontWeight: 600, color: stage.accentColor, marginBottom: 6 }}>{stageDisplay(stage, idx)}</div>
                <div style={{ fontSize: 12, color: '#0f172a' }}>
                  <div>t0: {stage.startTime.toFixed(1)} s</div>
                  <div>t1: {stage.endTime.toFixed(1)} s</div>
                  <div>dt: {stage.duration.toFixed(1)} s (powered {stage.poweredDuration.toFixed(1)} s)</div>
                  <div>Max alt: {(stage.maxAltitude / 1000).toFixed(2)} km</div>
                  <div>Max Mach: {stage.maxMach.toFixed(2)}</div>
                  <div>Max thrust: {(stage.maxThrust / 1000).toFixed(1)} kN</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18 }}>
        {charts.map((chart) => (
          <div
            key={chart.key}
            style={{
              padding: 16,
              borderRadius: 12,
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
            }}
          >
            <ChartCard config={chart.config} height={chart.height ?? 260} />
          </div>
        ))}
      </div>
    </div>
  )
}
