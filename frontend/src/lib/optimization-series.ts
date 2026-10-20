// Plot-ready series from a validated optimization result (independent reintegration).
import type { MultiStageValidation, OptimizationResult } from './optimization'
import type { MultiStageInput, SingleStageInput } from './optimization-input'
import { G0, haversineDistanceKm, posEciToLlh } from './geo'

const OMEGA_EARTH = 7.2921159e-5

export interface ResultSample {
  t: number
  phase: number
  stage: number
  powered: boolean
  altKm: number
  downrangeKm: number
  /** Inertial speed [m/s]. */
  speed: number
  /** Earth-relative speed [m/s]. */
  groundSpeed: number
  /** Inertial flight-path angle [deg]. */
  gammaDeg: number
  massKg: number
  qKpa: number
  aoaDeg: number
  accelG: number
  elevationDeg: number
  azimuthDeg: number
  thrustKn: number
  bodyRateDegS: number
  /** Remaining propellant of the active stage [kg]. */
  propellantKg: number
}
export interface PhaseSpan {
  index: number
  stage: number
  powered: boolean
  start: number
  end: number
}
export interface ResultEvent {
  t: number
  kind: string
  stage: number
}
export interface ResultSeries {
  samples: ResultSample[]
  phases: PhaseSpan[]
  events: ResultEvent[]
  final: number
}

/** Multistage samples with derived quantities; null for other result kinds. */
export function multiStageSeries(result: OptimizationResult): ResultSeries | null {
  const v = result.validation?.multi_stage
  const p = result.input.problem
  if (!v || p.kind !== 'multi_stage' || !v.samples.length) return null
  const launch = p.vehicle.launch
  const samples = v.samples.map((s): ResultSample => {
    const [m, x, y, z, vx, vy, vz] = s.state_eci
    const llh = posEciToLlh({ x, y, z }, s.time_s)
    const r = Math.hypot(x, y, z),
      speed = Math.hypot(vx, vy, vz)
    const rel = Math.hypot(vx + OMEGA_EARTH * y, vy - OMEGA_EARTH * x, vz)
    const loaded = p.stages[s.stage]?.propellant_kg ?? 0
    return {
      t: s.time_s,
      phase: s.phase,
      stage: s.stage,
      powered: s.powered,
      altKm: s.altitude_m / 1000,
      downrangeKm: haversineDistanceKm(launch.latitude_deg, launch.longitude_deg, llh.lat, llh.lon),
      speed,
      groundSpeed: rel,
      gammaDeg: speed > 0 && r > 0 ? (Math.asin(Math.max(-1, Math.min(1, (x * vx + y * vy + z * vz) / (r * speed)))) * 180) / Math.PI : 0,
      massKg: m,
      qKpa: s.dynamic_pressure_pa / 1000,
      aoaDeg: s.angle_of_attack_deg,
      accelG: s.specific_force_m_s2 / G0,
      elevationDeg: s.elevation_deg,
      azimuthDeg: s.azimuth_deg,
      thrustKn: s.thrust_n / 1000,
      bodyRateDegS: s.inertial_direction_rate_deg_s,
      propellantKg: loaded - (s.consumed_propellant_kg[s.stage] ?? 0),
    }
  })
  return { samples, phases: phaseSpans(samples, p), events: events(v), final: v.final_time_s }
}

function phaseSpans(samples: ResultSample[], p: MultiStageInput | SingleStageInput): PhaseSpan[] {
  if (p.kind !== 'multi_stage') return []
  return p.phases.map((ph, index) => {
    const own = samples.filter((s) => s.phase === index)
    return {
      index,
      stage: ph.stage,
      powered: ph.mode === 'burn',
      start: own[0]?.t ?? 0,
      end: own[own.length - 1]?.t ?? 0,
    }
  })
}
function events(v: MultiStageValidation): ResultEvent[] {
  return v.events.map((e) => ({ t: e.time_s, kind: e.kind, stage: e.stage }))
}

/** A per-phase limit as a step line over the phase spans (null limits are skipped). */
export function phaseLimit(phases: PhaseSpan[], limit: (phase: number) => number | null): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (const ph of phases) {
    const y = limit(ph.index)
    if (y === null || !Number.isFinite(y)) continue
    out.push({ x: ph.start, y }, { x: ph.end, y })
  }
  return out
}

/** Index of the sample closest to time t (samples sorted by time). */
export function sampleIndexAt(samples: { t: number }[], t: number): number {
  let lo = 0,
    hi = samples.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t < t) lo = mid
    else hi = mid
  }
  return Math.abs(samples[lo].t - t) <= Math.abs(samples[hi].t - t) ? lo : hi
}
