import type { ChartConfiguration } from 'chart.js'
import type { SimulationState } from '../lib/types'

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

function createPluginOptions(stageBands: StageBand[], markers: EventMarker[]) {
  return {
    legend: { display: false },
    eventMarkers: { stageBands, markers },
  } as Record<string, unknown>
}

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

  console.log('createAltitudeChart: Chart data analysis', {
    totalInputPoints: data.length,
    usablePoints: numericPoints.length,
    timeRange: timeRange ?? 'auto',
    altitudeRange: altitudeRange ?? 'auto',
    firstPoint: datasetPoints[0],
    lastPoint: datasetPoints[datasetPoints.length - 1],
    sampleRawData: data.slice(0, 3).map((d) => ({ time: d.time, altitude: d.altitude })),
    sampleChartData: datasetPoints.slice(0, 5),
  })

  if (!hasUsableRange) {
    console.error('❌ createAltitudeChart: Insufficient valid data points for altitude chart:', numericPoints.length)
  }

  const paddedAltitudeMax = altitudeRange && altitudeRange.max > 0 ? altitudeRange.max * 1.1 : undefined

  return {
    type: 'line',
    data: {
      datasets: [{
        label: 'Altitude',
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
          title: { display: true, text: 'Altitude (km)' },
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
  markers: EventMarker[]
): ChartConfiguration {
  const totalVelPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => state.velocity_magnitude ?? 0,
    ),
    { x: 0, y: 0 },
  )

  // Vertical velocity (up is positive)
  const verticalVelPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => {
        if (state.velocity_ned) {
          const vel_ned = typeof state.velocity_ned === 'object' && 'z' in state.velocity_ned
            ? state.velocity_ned.z
            : Array.isArray(state.velocity_ned) ? state.velocity_ned[2] : 0;
          return -vel_ned; // NED Z is down, so negate for upward positive
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
        if (state.velocity_ned) {
          const vel_ned = typeof state.velocity_ned === 'object' && 'x' in state.velocity_ned
            ? { x: state.velocity_ned.x, y: state.velocity_ned.y }
            : Array.isArray(state.velocity_ned)
            ? { x: state.velocity_ned[0], y: state.velocity_ned[1] }
            : { x: 0, y: 0 };
          return Math.sqrt(vel_ned.x * vel_ned.x + vel_ned.y * vel_ned.y);
        }
        return 0;
      },
    ),
    { x: 0, y: 0 },
  )

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Total Velocity',
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
          label: 'Vertical Velocity',
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
          label: 'Horizontal Velocity',
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
          title: { display: true, text: 'Velocity (m/s)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
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

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Mach Number (Altitude)',
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
          label: 'Mach Number (Sea Level)',
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
          title: { display: true, text: 'Mach Number' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
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

  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Thrust',
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
          label: 'Drag Force',
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
          beginAtZero: true
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
  const datasetPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => (state.acceleration_magnitude ?? 0) / 9.80665, // Convert to G
    ),
    { x: 0, y: 0 },
  )

  return {
    type: 'line',
    data: {
      datasets: [{
        label: 'Acceleration',
        data: datasetPoints,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
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
          title: { display: true, text: 'Acceleration (G)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
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

  return {
    type: 'line',
    data: {
      datasets: [{
        label: 'Dynamic Pressure',
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
          title: { display: true, text: 'Dynamic Pressure (kPa)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
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

  const aoaPoints = extendSeriesFallback(
    buildNumericSeries(
      data,
      (state) => state.time,
      (state) => state.angle_of_attack ?? 0,
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
        },
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
        label: 'Trajectory',
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
          title: { display: true, text: 'Downrange (km)' },
          grid: { color: '#f1f5f9' }
        },
        y: {
          type: 'linear',
          title: { display: true, text: 'Altitude (km)' },
          grid: { color: '#f1f5f9' },
          beginAtZero: true
        }
      }
    }
  }
}
