import type { SimulationState } from '../lib/types'

type MetricKey =
  | 'velocity_magnitude'
  | 'mach_number'
  | 'drag_force'
  | 'acceleration_magnitude'
  | 'dynamic_pressure'

interface MetricRule {
  key: MetricKey
  relativeTolerance: number
  minTolerance: number
  madFactor: number
  nonNegative?: boolean
  windowSize?: number
}

export interface SanitizeNoiseOptions {
  altitudeThreshold: number
  relativeAltitudeFraction: number
  altitudeFloor: number
  fallbackSampleCount: number
  baselineWindowSize: number
  metricRules: MetricRule[]
}

const DEFAULT_RULES: MetricRule[] = [
  {
    key: 'velocity_magnitude',
    relativeTolerance: 0.35,
    minTolerance: 15,
    madFactor: 5,
    nonNegative: true,
  },
  {
    key: 'mach_number',
    relativeTolerance: 0.4,
    minTolerance: 0.08,
    madFactor: 5,
    nonNegative: true,
  },
  {
    key: 'drag_force',
    relativeTolerance: 0.45,
    minTolerance: 800,
    madFactor: 5,
    nonNegative: true,
  },
  {
    key: 'acceleration_magnitude',
    relativeTolerance: 0.45,
    minTolerance: 6,
    madFactor: 5,
    nonNegative: true,
  },
  {
    key: 'dynamic_pressure',
    relativeTolerance: 0.45,
    minTolerance: 500,
    madFactor: 5,
    nonNegative: true,
  },
]

const DEFAULT_OPTIONS: SanitizeNoiseOptions = {
  altitudeThreshold: 250,
  relativeAltitudeFraction: 0.05,
  altitudeFloor: 25,
  fallbackSampleCount: 18,
  baselineWindowSize: 8,
  metricRules: DEFAULT_RULES,
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function pushWithLimit(window: number[], value: number, limit: number) {
  window.push(value)
  if (window.length > limit) {
    window.shift()
  }
}

function sanitizeMetric(
  states: SimulationState[],
  startIndex: number,
  rule: MetricRule,
  globalOptions: SanitizeNoiseOptions
) {
  const windowSize = rule.windowSize ?? globalOptions.baselineWindowSize
  const baselineWindow: number[] = []

  const values = states.map((state) => {
    const raw = (state as Record<string, unknown>)[rule.key]
    const numeric = Number(raw)
    return Number.isFinite(numeric) ? numeric : 0
  })

  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (!Number.isFinite(value)) {
      continue
    }

    if (i < startIndex) {
      pushWithLimit(baselineWindow, value, windowSize)
      continue
    }

    const referenceWindow = baselineWindow.length > 0 ? baselineWindow : [value]
    const baseline = median(referenceWindow)
    const absoluteBaseline = Math.abs(baseline)
    const deviations = referenceWindow.map((sample) => Math.abs(sample - baseline))
    const mad = median(deviations)

    const tolerance = Math.max(
      rule.madFactor * (mad || 0),
      absoluteBaseline * rule.relativeTolerance,
      rule.minTolerance,
    )

    const baselineMagnitude = Math.abs(baseline)
    const valueMagnitude = Math.abs(value)
    const magnitudeDiff = valueMagnitude - baselineMagnitude

    let sanitized = value
    if (magnitudeDiff > tolerance) {
      const targetMagnitude = baselineMagnitude + tolerance
      const sign = value === 0 ? Math.sign(baseline) || 1 : Math.sign(value)
      sanitized = sign * targetMagnitude
    }

    if (rule.nonNegative && sanitized < 0) {
      sanitized = 0
    }

    values[i] = sanitized
    pushWithLimit(baselineWindow, sanitized, windowSize)
  }

  for (let i = startIndex; i < states.length; i++) {
    const state = states[i] as Record<string, unknown>
    state[rule.key] = values[i]
  }
}

export function sanitizeLandingPhaseNoise(
  data: SimulationState[],
  options?: Partial<SanitizeNoiseOptions>
): SimulationState[] {
  if (!Array.isArray(data) || data.length < 2) {
    return data
  }

  const mergedOptions: SanitizeNoiseOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    metricRules: options?.metricRules ?? DEFAULT_OPTIONS.metricRules,
  }

  const clones = data.map((state) => ({ ...state }))
  const altitudes = clones.map((state) => Number(state.altitude ?? 0))
  const maxAltitude = altitudes.reduce((max, value) => (Number.isFinite(value) ? Math.max(max, value) : max), 0)

  const effectiveAltitudeThreshold = Math.max(
    mergedOptions.altitudeFloor,
    Math.min(mergedOptions.altitudeThreshold, maxAltitude * mergedOptions.relativeAltitudeFraction),
  )

  const fallbackStart = Math.max(0, clones.length - mergedOptions.fallbackSampleCount)
  const lastIndex = clones.length - 1
  let tailStartIndex = fallbackStart

  for (let idx = lastIndex; idx >= 0; idx--) {
    const altitude = altitudes[idx]
    if (Number.isFinite(altitude) && altitude > effectiveAltitudeThreshold) {
      tailStartIndex = Math.min(lastIndex, idx + 1)
      break
    }
  }

  tailStartIndex = Math.max(0, Math.min(tailStartIndex, lastIndex))
  if (tailStartIndex >= lastIndex) {
    return clones
  }

  mergedOptions.metricRules.forEach((rule) => {
    sanitizeMetric(clones, tailStartIndex, rule, mergedOptions)
  })

  if (import.meta.env.MODE !== 'production') {
    console.debug('sanitizeLandingPhaseNoise applied', {
      dataLength: clones.length,
      tailStartIndex,
      effectiveAltitudeThreshold,
    })
  }

  return clones
}
