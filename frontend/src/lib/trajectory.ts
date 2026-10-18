import type { Config } from './config'
import { displayEvents, presentationFromConfig, type FlightPresentation } from './presentation'
// Turns solver output into a flight "track": samples in display units,
// flight events, released bodies and an interpolator for playback.
import type { BodyJson, FlightEventJson, FlightMode, ImpactPointJson, Sample, SimulationOutput } from './simulation'
import { G0, haversineDistanceKm } from './geo'

export interface TrackSample {
  t: number
  lat: number
  lon: number
  /** Altitude above the ellipsoid [m] */
  alt: number
  /** Great-circle distance from the launch point [km] */
  downrange: number
  stage: number
  /** Inertial speed [m/s] */
  speed: number
  /** Earth-relative speed [m/s] */
  groundSpeed: number
  mach: number
  /** Dynamic pressure [Pa] */
  q: number
  /** [N] */
  thrust: number
  /** Axial aerodynamic force [N] */
  drag: number
  /** [kg] */
  mass: number
  /** Inertial acceleration (with gravity) [G] */
  accel: number
  /** Sensed axial acceleration [G] */
  accelAxial: number
  aoa: number
  sideslip: number
  azimuth: number
  elevation: number
  mode: FlightMode
  /** Instantaneous impact point [deg]; null when there is none (orbit, escape) */
  iipLat: number | null
  iipLon: number | null
}

export type FlightEventKind =
  | 'ignition'
  | 'liftoff'
  | 'railexit'
  | 'mach1'
  | 'maxq'
  | 'burnout'
  | 'separation'
  | 'jettison'
  | 'apogee'
  | 'end'

export interface FlightEvent {
  kind: FlightEventKind
  t: number
  /** Stage the event belongs to (burnout, jettison), or the stage being dropped (separation) */
  stage?: number
  /** Stage that continues after a separation */
  nextStage?: number
  /** Released body name (jettison) */
  body?: string
  /** For 'end': the vehicle reached the ground */
  landed?: boolean
  /** Vehicle state at the event (absent for an 'end' the solver did not locate) */
  at?: Pick<TrackSample, 'alt' | 'groundSpeed' | 'mach' | 'downrange'>
}

export interface ImpactPoint {
  t: number
  lat: number
  lon: number
  /** Earth-relative speed at impact [m/s] */
  speed: number
  /** Great-circle distance from the launch point [km] */
  downrange: number
}

/** A point of a released body's path */
export interface FallSample {
  t: number
  lat: number
  lon: number
  alt: number
}

/** A spent stage or jettisoned body, from its release to the ground */
export interface FallTrack {
  /** `stage<N>` or `stage<N>_<name>` */
  id: string
  kind: 'stage' | 'jettison'
  stage: number
  releaseTime: number
  /** [kg] */
  mass: number
  /** null when it does not come down (orbit, escape) */
  impact: ImpactPoint | null
  samples: FallSample[]
}

export interface StageSpan {
  stage: number
  t0: number
  t1: number
}

export interface TrackSummary {
  apogee: number
  apogeeTime: number
  /** Peak values below are over the ascent only */
  maxSpeed: number
  maxMach: number
  maxQ: number
  maxQTime: number
  maxAccel: number
  range: number
  duration: number
  landed: boolean
}

export interface Track {
  /** Snapshot of the names used by this run (also retained for pinned comparisons). */
  presentation?: FlightPresentation
  samples: TrackSample[]
  /** The solver's samples as they came (for the CSV export) */
  raw: Sample[]
  events: FlightEvent[]
  stages: StageSpan[]
  summary: TrackSummary
  t0: number
  t1: number
  /** Set when the solver output turned non-physical and was cut off here [s] */
  truncatedAt?: number
  /** Where the vehicle itself came down (null if it did not) */
  impact: ImpactPoint | null
  fallBodies: FallTrack[]
}

/** A sample the solver could not have produced physically (diverged run). */
function isNonPhysical(s: Sample): boolean {
  return (
    !Number.isFinite(s.altitude_m) ||
    !Number.isFinite(s.speed_inertial_mps) ||
    s.altitude_m > 1e9 || // beyond ~1,000,000 km
    s.speed_inertial_mps > 5e4 // faster than any rocket here
  )
}

function toImpact(p: ImpactPointJson | null | undefined, baseLat: number, baseLon: number): ImpactPoint | null {
  if (!p) return null
  return {
    t: p.time_s,
    lat: p.latitude_deg,
    lon: p.longitude_deg,
    speed: p.speed_mps,
    downrange: haversineDistanceKm(baseLat, baseLon, p.latitude_deg, p.longitude_deg),
  }
}

function buildFallTrack(body: BodyJson, baseLat: number, baseLon: number): FallTrack {
  return {
    id: body.id,
    kind: body.kind,
    stage: body.stage,
    releaseTime: body.release_time_s,
    mass: body.mass_kg,
    impact: toImpact(body.impact, baseLat, baseLon),
    samples: body.trajectory
      .filter((s) => !isNonPhysical(s))
      .map((s) => ({ t: s.time_s, lat: s.latitude_deg, lon: s.longitude_deg, alt: s.altitude_m })),
  }
}

const EVENT_KINDS = {
  ignition: 'ignition',
  liftoff: 'liftoff',
  rail_exit: 'railexit',
  burnout: 'burnout',
  separation: 'separation',
  jettison: 'jettison',
  mach1: 'mach1',
  max_q: 'maxq',
  apogee: 'apogee',
  impact: 'end',
} as const satisfies Record<FlightEventJson['kind'], FlightEventKind>

/** Solver events up to `tEnd`; an 'end' is added when the vehicle did not come down. */
function trackEvents(input: FlightEventJson[], tEnd: number, landed: boolean): FlightEvent[] {
  const events: FlightEvent[] = []
  for (const e of input) {
    if (e.time_s > tEnd + 1e-9) continue
    const kind = EVENT_KINDS[e.kind]
    if (!kind) continue
    const ev: FlightEvent = {
      kind,
      t: e.time_s,
      at: { alt: e.altitude_m, groundSpeed: e.speed_earth_mps, mach: e.mach, downrange: e.downrange_m / 1000 },
    }
    if (kind === 'end') ev.landed = true
    else if (kind === 'separation') Object.assign(ev, { stage: e.stage, nextStage: e.stage + 1 })
    else if (kind === 'ignition' || kind === 'burnout') ev.stage = e.stage
    else if (kind === 'jettison') Object.assign(ev, { stage: e.stage, body: e.body })
    events.push(ev)
  }
  if (!events.some((e) => e.kind === 'end')) events.push({ kind: 'end', t: tEnd, landed })
  return events.sort((a, b) => a.t - b.t)
}

function toTrackSample(s: Sample): TrackSample {
  return {
    t: s.time_s,
    lat: s.latitude_deg,
    lon: s.longitude_deg,
    alt: s.altitude_m,
    downrange: s.downrange_m / 1000,
    stage: s.stage,
    speed: s.speed_inertial_mps,
    groundSpeed: s.speed_earth_mps,
    mach: s.mach,
    q: s.dynamic_pressure_pa,
    thrust: s.thrust_n,
    drag: Math.abs(s.aero_body_x_n),
    mass: s.mass_kg,
    accel: Math.hypot(s.accel_eci_x_mps2, s.accel_eci_y_mps2, s.accel_eci_z_mps2) / G0,
    accelAxial: s.accel_body_x_mps2 / G0,
    aoa: s.alpha_deg,
    sideslip: s.beta_deg,
    azimuth: s.azimuth_deg,
    elevation: s.elevation_deg,
    mode: s.flight_mode,
    iipLat: s.iip_latitude_deg ?? null,
    iipLon: s.iip_longitude_deg ?? null,
  }
}

/** Track of a solver run; null when it produced fewer than two usable samples. */
export function trackFromOutput(output: Pick<SimulationOutput, 'trajectory' | 'events' | 'bodies'>, config?: Config): Track | null {
  const input = output.trajectory
  if (!input || input.length < 2) return null
  // Keep everything up to the first non-physical sample.
  const cut = input.findIndex(isNonPhysical)
  const raw = cut === -1 ? input : input.slice(0, cut)
  if (raw.length < 2) return null

  const samples = raw.map(toTrackSample)
  const first = samples[0]
  const last = samples[samples.length - 1]

  const stages: StageSpan[] = []
  for (const s of samples) {
    const cur = stages[stages.length - 1]
    if (!cur || cur.stage !== s.stage) {
      if (cur) cur.t1 = s.t
      stages.push({ stage: s.stage, t0: s.t, t1: s.t })
    }
  }
  stages[stages.length - 1].t1 = last.t

  // Extremes. Peak loads are taken over the ascent (up to apogee): an
  // unrecovered vehicle re-entering at the end would otherwise dominate them.
  let apogeeIdx = 0
  samples.forEach((s, i) => {
    if (s.alt > samples[apogeeIdx].alt) apogeeIdx = i
  })
  let maxQIdx = 0
  let maxSpeed = 0
  let maxMach = 0
  let maxAccel = 0
  for (let i = 0; i <= apogeeIdx; i++) {
    const s = samples[i]
    if (s.q > samples[maxQIdx].q) maxQIdx = i
    maxSpeed = Math.max(maxSpeed, s.speed)
    maxMach = Math.max(maxMach, s.mach)
    maxAccel = Math.max(maxAccel, Math.abs(s.accelAxial))
  }

  const landed = last.alt <= 1
  const apogee = samples[apogeeIdx]
  return {
    samples,
    raw,
    presentation: config ? presentationFromConfig(config) : undefined,
    events: displayEvents(trackEvents(output.events ?? [], last.t, landed), config),
    stages,
    t0: first.t,
    t1: last.t,
    truncatedAt: cut === -1 ? undefined : input[cut].time_s,
    impact: landed ? { t: last.t, lat: last.lat, lon: last.lon, speed: last.groundSpeed, downrange: last.downrange } : null,
    fallBodies: (output.bodies ?? []).map((b) => buildFallTrack(b, first.lat, first.lon)),
    summary: {
      apogee: apogee.alt,
      apogeeTime: apogee.t,
      maxSpeed,
      maxMach,
      maxQ: samples[maxQIdx].q,
      maxQTime: samples[maxQIdx].t,
      maxAccel,
      range: last.downrange,
      duration: last.t - first.t,
      landed,
    },
  }
}

/** Index of the last sample with time <= t. */
export function indexAt(samples: TrackSample[], t: number): number {
  let lo = 0
  let hi = samples.length - 1
  if (t <= samples[0].t) return 0
  if (t >= samples[hi].t) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (samples[mid].t <= t) lo = mid
    else hi = mid
  }
  return lo
}

const NUMERIC_KEYS = [
  'lat',
  'lon',
  'alt',
  'downrange',
  'speed',
  'groundSpeed',
  'mach',
  'q',
  'thrust',
  'drag',
  'mass',
  'accel',
  'accelAxial',
  'aoa',
  'sideslip',
  'azimuth',
  'elevation',
] as const

/** Linearly interpolated state at time t. */
export function sampleAt(track: Track, t: number): TrackSample {
  const { samples } = track
  const i = indexAt(samples, t)
  const a = samples[i]
  const b = samples[Math.min(i + 1, samples.length - 1)]
  if (a === b || b.t === a.t) return { ...a, t }
  const f = Math.min(Math.max((t - a.t) / (b.t - a.t), 0), 1)
  const out = { ...a, t } as TrackSample
  for (const k of NUMERIC_KEYS) {
    out[k] = a[k] + (b[k] - a[k]) * f
  }
  // Longitude wrap-around
  if (Math.abs(b.lon - a.lon) > 180) out.lon = f < 0.5 ? a.lon : b.lon
  // Discrete or wrapping values: take the nearer sample
  const near = f < 0.5 ? a : b
  out.mode = near.mode
  out.iipLat = near.iipLat
  out.iipLon = near.iipLon
  return out
}

/** The solver samples as CSV, with the columns of the CLI's trajectory.csv. */
export function samplesToCsv(samples: Sample[]): string {
  if (samples.length === 0) return ''
  const header = Object.keys(samples[0]) as (keyof Sample)[]
  const rows = samples.map((s) => header.map((k) => s[k] ?? '').join(','))
  return [header.join(','), ...rows].join('\n')
}
