import { useMemo } from 'react'
import type { SimulationState, ClientConfig } from '../lib/types'
import { computeDownrangeKm, eciToLatLon } from '../lib/geo'
import { vec3ToObject } from '../lib/types'
import type { EventMarker, StageBand, StageSummary } from '../charts/config'
import { stagePalette } from '../charts/config'
import { sanitizeLandingPhaseNoise } from '../utils/denoise'

interface StagePlan {
  index: number
  startTime: number
  burnStartTime: number
  burnEndTime: number
  cutoffTime: number
  separationTime: number
}

export function useChartData(data: SimulationState[], stagePlanConfig?: ClientConfig) {
  return useMemo(() => {
    if (!data || data.length === 0) {
      console.log('useChartData: No data provided')
      return null
    }

    console.log('useChartData: Processing data', {
      dataLength: data.length,
      firstState: data[0],
      sampleFields: Object.keys(data[0] || {})
    })

    // Process simulation data
    const processedData = data.map((state, index) => {
      try {
        // Use position_eci if available, otherwise fall back to position
        const position = state.position_eci || state.position
        if (!position) {
          console.warn(`No position data at index ${index}:`, state)
        }
        const pos = vec3ToObject(position)
        const { latitude, longitude } = eciToLatLon(pos, state.time || 0)
        const downrange_km = computeDownrangeKm(latitude, longitude, data[0])

        if (index < 3) {
          console.log(`Processed state ${index}:`, {
            time: state.time,
            altitude: state.altitude,
            velocity_magnitude: state.velocity_magnitude,
            mach_number: state.mach_number,
            thrust: state.thrust,
            position: pos,
            downrange_km
          })
        }

        return {
          ...state,
          downrange_km
        }
      } catch (error) {
        console.warn('Error processing simulation state:', error, state)
        return {
          ...state,
          downrange_km: 0
        }
      }
    })

    const displayData = sanitizeLandingPhaseNoise(processedData)

    // Build stage plans
    const stagePlans = buildStagePlans(stagePlanConfig)

    // Generate stage summaries
    const stageSummaries = generateStageSummaries(displayData, stagePlans)

    // Create stage bands and markers
    const stageBands = createStageBands(stageSummaries)
    const eventMarkers = createEventMarkers(stagePlans)

    console.log('useChartData: Final result', {
      processedDataLength: processedData.length,
      displayDataLength: displayData.length,
      stageSummariesLength: stageSummaries.length,
      stageBandsLength: stageBands.length,
      eventMarkersLength: eventMarkers.length,
      firstChartPoint: displayData[0] ? {
        time: displayData[0].time,
        altitude: displayData[0].altitude,
        velocity_magnitude: displayData[0].velocity_magnitude
      } : 'no data'
    })

    return {
      data: displayData,
      rawData: processedData,
      stageSummaries,
      stageBands,
      eventMarkers,
      stagePlans
    }
  }, [data, stagePlanConfig])
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

function generateStageSummaries(data: SimulationState[], plans: StagePlan[]): StageSummary[] {
  const summaries: StageSummary[] = []

  plans.forEach((plan, idx) => {
    const startIdx = data.findIndex(d => d.time >= plan.startTime)
    const endIdx = data.findIndex(d => d.time >= plan.separationTime)

    if (startIdx === -1 || endIdx === -1) return

    const stageData = data.slice(startIdx, endIdx + 1)
    const palette = stagePalette[idx % stagePalette.length]

    const maxAltitude = Math.max(...stageData.map(d => d.altitude))
    const maxMach = Math.max(...stageData.map(d => d.mach_number))
    const maxThrust = Math.max(...stageData.map(d => d.thrust))

    summaries.push({
      stage: plan.index,
      startIndex: startIdx,
      endIndex: endIdx,
      startTime: plan.startTime,
      endTime: plan.separationTime,
      duration: plan.separationTime - plan.startTime,
      poweredDuration: plan.burnEndTime - plan.burnStartTime,
      maxAltitude,
      maxMach,
      maxThrust,
      accentColor: palette.accent,
      fillColor: palette.fill
    })
  })

  return summaries
}

function createStageBands(summaries: StageSummary[]): StageBand[] {
  return summaries
    .map((summary) => {
      const start = Number(summary.startTime)
      const end = Number(summary.endTime)
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
        return null
      }
      return {
        start,
        end,
        color: summary.fillColor,
        label: `Stage ${summary.stage}`,
        labelColor: summary.accentColor,
      }
    })
    .filter((band): band is StageBand => band !== null)
}

function createEventMarkers(plans: StagePlan[]): EventMarker[] {
  const markers: EventMarker[] = []

  plans.forEach((plan, idx) => {
    const palette = stagePalette[idx % stagePalette.length]

    // Burn start
    const startTime = Number(plan.startTime)
    const burnStart = Number(plan.burnStartTime)
    const burnEnd = Number(plan.burnEndTime)
    const separation = Number(plan.separationTime)

    if (Number.isFinite(burnStart) && Number.isFinite(startTime) && burnStart > startTime) {
      markers.push({
        time: burnStart,
        label: `S${plan.index} Ignition`,
        color: palette.accent
      })
    }

    // Burn end
    if (Number.isFinite(burnEnd)) {
      markers.push({
        time: burnEnd,
        label: `S${plan.index} MECO`,
        color: palette.accent,
        dashed: true
      })
    }

    // Separation (if not the last stage)
    if (idx < plans.length - 1 && Number.isFinite(separation)) {
      markers.push({
        time: separation,
        label: `S${plan.index} Sep`,
        color: palette.accent,
        dashed: true
      })
    }
  })

  return markers
}

export function formatValue(value: number, unit: string, decimals = 1): string {
  if (!Number.isFinite(value)) return `-- ${unit}`
  return `${value.toFixed(decimals)} ${unit}`
}
