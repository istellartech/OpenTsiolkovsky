import type { Plugin, ChartConfiguration, Chart } from 'chart.js'
import JSZip from 'jszip'
import type { SimulationState } from './simulation'
import { vec3ToObject } from './simulation'

// Chart Plugin
export interface EventMarker {
  time: number
  label: string
  color: string
  dashed?: boolean
}

export interface StageBand {
  start: number
  end: number
  color: string
  label: string
  labelColor: string
}

export const eventMarkerPlugin: Plugin = {
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
    const { top, bottom } = chart.chartArea
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
      if (marker.label) {
        ctx.fillStyle = marker.color
        ctx.font = '9px "Helvetica Neue", Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        const labelY = top - 2
        ctx.fillText(marker.label, x, labelY)
      }
      ctx.restore()
    })
  },
}

// Chart Configuration Utilities
type XYPoint = { x: number; y: number }

function buildNumericSeries(
  data: SimulationState[],
  xSelector: (state: SimulationState) => unknown,
  ySelector: (state: SimulationState) => unknown,
): XYPoint[] {
  return data
    .map((state) => {
      const x = Number(xSelector(state))
      const y = Number(ySelector(state))
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null
      }
      return { x, y }
    })
    .filter((point): point is XYPoint => point !== null)
}

function extendSeriesFallback(series: XYPoint[], fallback: XYPoint): XYPoint[] {
  return series.length > 0 ? series : [fallback]
}

function getMaxBeforeCutoff(
  data: SimulationState[],
  valueSelector: (state: SimulationState) => number
): number {
  const cutoffIndex = data.findIndex(state => (state.thrust ?? 0) <= 1);
  const activeData = cutoffIndex > 0 ? data.slice(0, cutoffIndex) : data;
  const values = activeData.map(valueSelector).filter(v => Number.isFinite(v) && v > 0);
  return values.length > 0 ? Math.max(...values) : 0;
}

function getMinBeforeCutoff(
  data: SimulationState[],
  valueSelector: (state: SimulationState) => number
): number {
  const cutoffIndex = data.findIndex(state => (state.thrust ?? 0) <= 1);
  const activeData = cutoffIndex > 0 ? data.slice(0, cutoffIndex) : data;
  const values = activeData.map(valueSelector).filter(v => Number.isFinite(v));
  return values.length > 0 ? Math.min(...values) : 0;
}

function createPluginOptions(stageBands: StageBand[], markers: EventMarker[]) {
  return {
    legend: { display: false },
    eventMarkers: { stageBands, markers },
  } as Record<string, unknown>
}

export interface StageSummary {
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
}

export const stagePalette = [
  { accent: '#1d4ed8', fill: 'rgba(37, 99, 235, 0.09)' },
  { accent: '#047857', fill: 'rgba(16, 185, 129, 0.12)' },
  { accent: '#ea580c', fill: 'rgba(249, 115, 22, 0.12)' },
  { accent: '#7c3aed', fill: 'rgba(147, 51, 234, 0.12)' },
]

export function createAltitudeChart(
  data: SimulationState[],
  stageBands: StageBand[],
  markers: EventMarker[]
): ChartConfiguration {
  const numericPoints = buildNumericSeries(
    data,
    (state) => state.time,
    (state) => (state.altitude ?? 0) / 1000,
  )
  const datasetPoints = extendSeriesFallback(numericPoints, { x: 0, y: 0 })

  const hasUsableRange = numericPoints.length >= 2
  const timeRange = hasUsableRange
    ? {
        min: Math.min(...numericPoints.map((p) => p.x)),
        max: Math.max(...numericPoints.map((p) => p.x)),
      }
    : null
  const altitudeRange = numericPoints.length > 0
    ? {
        min: Math.min(...numericPoints.map((p) => p.y)),
        max: Math.max(...numericPoints.map((p) => p.y)),
      }
    : null

  const paddedAltitudeMax = altitudeRange && altitudeRange.max > 0 ? altitudeRange.max * 1.1 : undefined

  return {
    type: 'line',
    data: {
      datasets: [{
        label: '高度',
        data: datasetPoints,
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
        borderWidth: 2,
        pointRadius: numericPoints.length > 0 && numericPoints.length < 10 ? 4 : 0,
        tension: 0.1,
        fill: 'origin',
        parsing: false,
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: createPluginOptions(stageBands, markers) as any,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' },
          grid: { color: '#f1f5f9' },
          min: timeRange ? timeRange.min : undefined,
          max: timeRange ? timeRange.max : undefined,
        },
        y: {
          type: 'linear',
          title: { display: true, text: '高度 (km)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true,
          max: paddedAltitudeMax ?? 10,
        },
      },
    },
  }
}

export function createVelocityChart(
  data: SimulationState[],
  stageBands: StageBand[],
  markers: EventMarker[],
  coordinateFrame: 'eci' | 'ecef' = 'ecef'
): ChartConfiguration {
  // Helper function to get the appropriate velocity field based on coordinate frame
  const getVelocityNED = (state: SimulationState) => {
    if (coordinateFrame === 'eci') {
      return state.velocity_eci_ned || state.velocity_ned
    } else {
      return state.velocity_ecef_ned || state.velocity_ned
    }
  }

  const totalVelPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => {
        const velocityField = getVelocityNED(state);
        if (velocityField) {
          const vel_ned = vec3ToObject(velocityField);
          const totalVel = Math.sqrt(vel_ned.x * vel_ned.x + vel_ned.y * vel_ned.y + vel_ned.z * vel_ned.z);

          // Debug logging to compare coordinate frames
          if (state.time < 10) { // Only log first 10 seconds to avoid spam
            console.log(`t=${state.time}s (${coordinateFrame.toUpperCase()}): total_vel=${totalVel.toFixed(2)}`);
          }

          return totalVel;
        }
        // Fallback to backend value if velocity fields are not available
        return state.velocity_magnitude ?? 0;
      },
    ),
    { x: 0, y: 0 },
  )

  // Vertical velocity (up is positive)
  const verticalVelPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => {
        const velocityField = getVelocityNED(state);
        if (velocityField) {
          const vel_ned = vec3ToObject(velocityField);
          return -vel_ned.z; // NED Z is down, so negate for upward positive
        }
        return 0;
      },
    ),
    { x: 0, y: 0 },
  )

  // Horizontal velocity (North-East magnitude)
  const horizontalVelPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => {
        const velocityField = getVelocityNED(state);
        if (velocityField) {
          const vel_ned = vec3ToObject(velocityField);
          const horizontalSpeed = Math.sqrt(vel_ned.x * vel_ned.x + vel_ned.y * vel_ned.y);
          // Debug logging - remove after testing
          if (state.time < 10) { // Only log first 10 seconds to avoid spam
            console.log(`t=${state.time}s (${coordinateFrame.toUpperCase()}): horizontal_vel=${horizontalSpeed.toFixed(2)}`);
          }
          return horizontalSpeed;
        }
        return 0;
      },
    ),
    { x: 0, y: 0 },
  )

  // Calculate max velocity before engine cutoff
  const maxTotalVel = getMaxBeforeCutoff(data, (state) => {
    const velocityField = getVelocityNED(state);
    if (velocityField) {
      const vel_ned = vec3ToObject(velocityField);
      return Math.sqrt(vel_ned.x * vel_ned.x + vel_ned.y * vel_ned.y + vel_ned.z * vel_ned.z);
    }
    return state.velocity_magnitude ?? 0;
  })
  const maxVerticalVel = getMaxBeforeCutoff(data, (state) => {
    const velocityField = getVelocityNED(state);
    if (velocityField) {
      const vel_ned = vec3ToObject(velocityField);
      return Math.abs(-vel_ned.z); // Take absolute value for max scale calculation
    }
    return 0;
  })
  const maxHorizontalVel = getMaxBeforeCutoff(data, (state) => {
    const velocityField = getVelocityNED(state);
    if (velocityField) {
      const vel_ned = vec3ToObject(velocityField);
      return Math.sqrt(vel_ned.x * vel_ned.x + vel_ned.y * vel_ned.y);
    }
    return 0;
  })

  // Calculate min velocity before engine cutoff (important for vertical velocity which can be negative)
  const minVerticalVel = getMinBeforeCutoff(data, (state) => {
    const velocityField = getVelocityNED(state);
    if (velocityField) {
      const vel_ned = vec3ToObject(velocityField);
      return -vel_ned.z; // NED Z is down, so negate for upward positive
    }
    return 0;
  })

  const maxVelocity = Math.max(maxTotalVel, maxVerticalVel, maxHorizontalVel)
  const maxScale = maxVelocity > 0 ? maxVelocity * 1.1 : 1000 // 10% margin or default 1000m/s

  // Set minimum scale to either 0 or the minimum velocity (whichever is lower)
  const minScale = Math.min(0, minVerticalVel * 1.1) // 10% margin for negative values

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: '合計速度',
          data: totalVelPoints,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        },
        {
          label: '垂直速度',
          data: verticalVelPoints,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        },
        {
          label: '水平速度',
          data: horizontalVelPoints,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...createPluginOptions(stageBands, markers),
        legend: { display: true, position: 'top' }
      } as any,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: '速度 (m/s)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: minScale >= 0, // Only begin at zero if minimum is not negative
          min: minScale,
          max: maxScale
        }
      }
    }
  }
}

export function createMachChart(
  data: SimulationState[],
  stageBands: StageBand[],
  markers: EventMarker[]
): ChartConfiguration {
  const altitudeMachPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => state.mach_number ?? 0,
    ),
    { x: 0, y: 0 },
  )

  const seaLevelMachPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => state.sea_level_mach ?? 0,
    ),
    { x: 0, y: 0 },
  )

  // Calculate max Mach number before engine cutoff
  const maxAltitudeMach = getMaxBeforeCutoff(data, (state) => state.mach_number ?? 0)
  const maxSeaLevelMach = getMaxBeforeCutoff(data, (state) => state.sea_level_mach ?? 0)
  const maxMach = Math.max(maxAltitudeMach, maxSeaLevelMach)
  const maxScale = maxMach > 0 ? maxMach * 1.1 : 5 // 10% margin or default Mach 5

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'マッハ数 (高度)',
          data: altitudeMachPoints,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        },
        {
          label: 'マッハ数 (海面)',
          data: seaLevelMachPoints,
          borderColor: '#ea580c',
          backgroundColor: 'rgba(234, 88, 12, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
          borderDash: [5, 5],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...createPluginOptions(stageBands, markers),
        legend: { display: true, position: 'top' }
      } as any,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'マッハ数' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true,
          max: maxScale
        }
      }
    }
  }
}

export function createThrustChart(
  data: SimulationState[],
  stageBands: StageBand[],
  markers: EventMarker[]
): ChartConfiguration {
  const thrustPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => (state.thrust ?? 0) / 1000,
    ),
    { x: 0, y: 0 },
  )

  const dragPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => (state.drag_force ?? 0) / 1000,
    ),
    { x: 0, y: 0 },
  )

  // Calculate max force (thrust or drag) before engine cutoff
  const maxThrust = getMaxBeforeCutoff(data, (state) => (state.thrust ?? 0) / 1000)
  const maxDrag = getMaxBeforeCutoff(data, (state) => (state.drag_force ?? 0) / 1000)
  const maxForce = Math.max(maxThrust, maxDrag)
  const maxScale = maxForce > 0 ? maxForce * 1.1 : 1000 // 10% margin or default 1000kN

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: '推力',
          data: thrustPoints,
          borderColor: '#ea580c',
          backgroundColor: 'rgba(234, 88, 12, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        },
        {
          label: '抗力',
          data: dragPoints,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...createPluginOptions(stageBands, markers),
        legend: { display: true, position: 'top' }
      } as any,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'Force (kN)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true,
          max: maxScale
        }
      }
    }
  }
}

export function createAccelerationChart(
  data: SimulationState[],
  stageBands: StageBand[],
  markers: EventMarker[]
): ChartConfiguration {
  // Total acceleration magnitude
  const totalAccPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => (state.acceleration_magnitude ?? 0) / 9.80665, // Convert to G
    ),
    { x: 0, y: 0 },
  )

  // Body-frame acceleration components
  const bodyXPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => {
        const acc_body = vec3ToObject(state.acc_body || [0, 0, 0])
        return acc_body.x / 9.80665 // Convert to G
      },
    ),
    { x: 0, y: 0 },
  )

  const bodyYPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => {
        const acc_body = vec3ToObject(state.acc_body || [0, 0, 0])
        return acc_body.y / 9.80665 // Convert to G
      },
    ),
    { x: 0, y: 0 },
  )

  const bodyZPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => {
        const acc_body = vec3ToObject(state.acc_body || [0, 0, 0])
        return acc_body.z / 9.80665 // Convert to G
      },
    ),
    { x: 0, y: 0 },
  )

  // Calculate max acceleration before engine cutoff for all components
  const maxTotal = getMaxBeforeCutoff(data, (state) => (state.acceleration_magnitude ?? 0) / 9.80665)

  // Body X-axis max and min values
  const maxBodyX = getMaxBeforeCutoff(data, (state) => {
    const acc_body = vec3ToObject(state.acc_body || [0, 0, 0])
    return acc_body.x / 9.80665
  })
  const minBodyX = getMinBeforeCutoff(data, (state) => {
    const acc_body = vec3ToObject(state.acc_body || [0, 0, 0])
    return acc_body.x / 9.80665
  })

  // Body Y-axis max and min values
  const maxBodyY = getMaxBeforeCutoff(data, (state) => {
    const acc_body = vec3ToObject(state.acc_body || [0, 0, 0])
    return acc_body.y / 9.80665
  })
  const minBodyY = getMinBeforeCutoff(data, (state) => {
    const acc_body = vec3ToObject(state.acc_body || [0, 0, 0])
    return acc_body.y / 9.80665
  })

  // Body Z-axis max and min values
  const maxBodyZ = getMaxBeforeCutoff(data, (state) => {
    const acc_body = vec3ToObject(state.acc_body || [0, 0, 0])
    return acc_body.z / 9.80665
  })
  const minBodyZ = getMinBeforeCutoff(data, (state) => {
    const acc_body = vec3ToObject(state.acc_body || [0, 0, 0])
    return acc_body.z / 9.80665
  })

  // Calculate overall max and min for scaling
  const maxPositive = Math.max(maxTotal, maxBodyX, maxBodyY, maxBodyZ, 0)
  const minNegative = Math.min(minBodyX, minBodyY, minBodyZ, 0)

  const maxScale = maxPositive > 0 ? maxPositive * 1.1 : 10 // 10% margin or default 10G
  const minScale = minNegative < 0 ? minNegative * 1.1 : 0 // 10% margin for negative or 0

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: '合計加速度',
          data: totalAccPoints,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        },
        {
          label: '機体X軸 (前後)',
          data: bodyXPoints,
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        },
        {
          label: '機体Y軸 (左右)',
          data: bodyYPoints,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        },
        {
          label: '機体Z軸 (上下)',
          data: bodyZPoints,
          borderColor: '#7c3aed',
          backgroundColor: 'rgba(124, 58, 237, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...createPluginOptions(stageBands, markers),
        legend: { display: true, position: 'top' }
      } as any,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: '加速度 (G)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: false,
          max: maxScale,
          min: minScale
        }
      }
    }
  }
}

export function createDynamicPressureChart(
  data: SimulationState[],
  stageBands: StageBand[],
  markers: EventMarker[]
): ChartConfiguration {
  const datasetPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => (state.dynamic_pressure ?? 0) / 1000, // Convert to kPa
    ),
    { x: 0, y: 0 },
  )

  // Calculate max dynamic pressure before engine cutoff
  const maxPressure = getMaxBeforeCutoff(data, (state) => (state.dynamic_pressure ?? 0) / 1000)
  const maxScale = maxPressure > 0 ? maxPressure * 1.1 : 50 // 10% margin or default 50kPa

  return {
    type: 'line',
    data: {
      datasets: [{
        label: '動圧',
        data: datasetPoints,
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1,
        fill: 'origin',
        parsing: false,
        spanGaps: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: createPluginOptions(stageBands, markers) as any,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: '動圧 (kPa)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true,
          max: maxScale
        }
      }
    }
  }
}

export function createAttitudeChart(
  data: SimulationState[],
  stageBands: StageBand[],
  markers: EventMarker[]
): ChartConfiguration {
  const azimuthPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => state.attitude_azimuth ?? 0,
    ),
    { x: 0, y: 0 },
  )

  const elevationPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => state.attitude_elevation ?? 0,
    ),
    { x: 0, y: 0 },
  )


  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Azimuth',
          data: azimuthPoints,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        },
        {
          label: 'Elevation',
          data: elevationPoints,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...createPluginOptions(stageBands, markers),
        legend: { display: true, position: 'top' }
      } as any,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'Angle (deg)' },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  }
}

export function createAoAChart(
  data: SimulationState[],
  stageBands: StageBand[],
  markers: EventMarker[]
): ChartConfiguration {
  const aoaPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => state.angle_of_attack ?? 0,
    ),
    { x: 0, y: 0 },
  )

  const sideslipPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => state.sideslip_angle ?? 0,
    ),
    { x: 0, y: 0 },
  )

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Angle of Attack',
          data: aoaPoints,
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
        },
        {
          label: 'Sideslip Angle',
          data: sideslipPoints,
          borderColor: '#e11d48',
          backgroundColor: 'rgba(225, 29, 72, 0.1)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
          parsing: false,
          spanGaps: true,
          borderDash: [3, 3],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        ...createPluginOptions(stageBands, markers),
        legend: { display: true, position: 'top' }
      } as any,
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: 'Time (s)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'Angle (deg)' },
          grid: { color: '#f1f5f9' }
        }
      }
    }
  }
}

export function createTrajectoryChart(
  data: SimulationState[]
): ChartConfiguration {
  const datasetPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.downrange_km ?? 0,
      (state) => (state.altitude ?? 0) / 1000,
    ),
    { x: 0, y: 0 },
  )

  return {
    type: 'line',
    data: {
      datasets: [{
        label: '軸道',
        data: datasetPoints,
        borderColor: '#059669',
        backgroundColor: 'rgba(5, 150, 105, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1,
        fill: 'origin',
        parsing: false,
        spanGaps: true,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: '水平距離 (km)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: '高度 (km)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
        }
      }
    }
  }
}

export function createMassChart(
  data: SimulationState[],
  stageBands: StageBand[],
  markers: EventMarker[]
): ChartConfiguration {
  const massPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => state.mass ?? 0,
    ),
    { x: 0, y: 0 },
  )

  return {
    type: 'line',
    data: {
      datasets: [{
        label: '質量 (kg)',
        data: massPoints,
        borderColor: '#059669',
        backgroundColor: 'rgba(5, 150, 105, 0.1)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.1,
        fill: false,
        parsing: false,
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index',
      },
      plugins: createPluginOptions(stageBands, markers),
      scales: {
        x: {
          type: 'linear',
          title: { display: true, text: '時間 (s)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          title: { display: true, text: '質量 (kg)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
        }
      }
    }
  }
}

// Chart Utilities
export function downloadChartAsImage(chart: Chart, filename?: string): void {
  if (!chart || !chart.canvas) {
    console.error('Invalid chart instance or canvas not available')
    return
  }

  try {
    const canvas = chart.canvas

    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create blob from canvas')
        return
      }

      const link = document.createElement('a')
      const url = URL.createObjectURL(blob)

      const timestamp = new Date().toISOString().split('T')[0]
      const defaultFilename = `chart-${timestamp}`
      const finalFilename = `${filename || defaultFilename}.png`

      link.href = url
      link.download = finalFilename

      document.body.appendChild(link)
      link.click()

      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }, 'image/png')
  } catch (error) {
    console.error('Error downloading chart:', error)
  }
}

export function getChartFilename(chartTitle: string): string {
  return chartTitle
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export async function downloadAllChartsAsZip(
  charts: Array<{ chart: Chart; title: string }>,
  rocketName?: string
): Promise<void> {
  try {
    const zip = new JSZip()

    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-')

    const sanitizedRocketName = rocketName
      ? rocketName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      : 'rocket'

    const zipFilename = `${sanitizedRocketName}-graphs-${dateStr}-${timeStr}.zip`

    const promises = charts.map(({ chart, title }) => {
      return new Promise<void>((resolve, reject) => {
        if (!chart || !chart.canvas) {
          console.warn(`Skipping chart "${title}": Invalid chart instance`)
          resolve()
          return
        }

        const filename = `${getChartFilename(title)}.png`

        chart.canvas.toBlob((blob) => {
          if (!blob) {
            console.warn(`Failed to create blob for chart "${title}"`)
            resolve()
            return
          }

          zip.file(filename, blob)
          resolve()
        }, 'image/png')
      })
    })

    await Promise.all(promises)

    const content = await zip.generateAsync({ type: 'blob' })

    const link = document.createElement('a')
    const url = URL.createObjectURL(content)

    link.href = url
    link.download = zipFilename

    document.body.appendChild(link)
    link.click()

    document.body.removeChild(link)
    URL.revokeObjectURL(url)

  } catch (error) {
    console.error('Error creating ZIP file:', error)
  }
}
