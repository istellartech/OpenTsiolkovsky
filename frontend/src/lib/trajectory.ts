// Turns raw simulator output into a flight "track": geodetic positions,
// derived quantities, flight events and an interpolator for playback.
import type { FallBodyJson, FlightModeName, ImpactPointJson, SimulationOutput, SimulationState } from './simulation'
import { vec3ToObject } from './simulation'
import { G0, haversineDistanceKm, posEciToLlh } from './geo'

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
  /** [N] */
  drag: number
  /** [kg] */
  mass: number
  /** Inertial acceleration [G] */
  accel: number
  /** Sensed axial acceleration [G] */
  accelAxial: number
  aoa: number
  sideslip: number
  azimuth: number
  elevation: number
  mode: FlightModeName
  /** Instantaneous impact point [deg]; null when there is none (orbit, escape) */
  iipLat: number | null
  iipLon: number | null
}

export type FlightEventKind = 'liftoff' | 'maxq' | 'burnout' | 'separation' | 'jettison' | 'apogee' | 'end'

export interface FlightEvent {
  kind: FlightEventKind
  t: number
  /** Stage the event belongs to (burnout, jettison), or the stage being dropped (separation) */
  stage?: number
  /** Stage that continues after a separation */
  nextStage?: number
  /** For 'end': the vehicle reached the ground */
  landed?: boolean
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

/** Where a body comes down, as a point on the ground */
export interface FallSample {
  t: number
  lat: number
  lon: number
  alt: number
}

/** A spent stage or dumping product, from its release to the ground */
export interface FallTrack {
  kind: 'stage' | 'dump'
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
  samples: TrackSample[]
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

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)

/** A sample the solver could not have produced physically (diverged run). */
function isNonPhysical(s: SimulationState): boolean {
  const p = vec3ToObject(s.position_eci || s.position)
  const r = Math.hypot(p.x, p.y, p.z)
  return (
    !Number.isFinite(r) ||
    !Number.isFinite(s.altitude) ||
    !Number.isFinite(s.velocity_magnitude) ||
    s.altitude > 1e9 || // beyond ~1,000,000 km
    s.velocity_magnitude > 5e4 // faster than any rocket here
  )
}

const MODES: FlightModeName[] = ['power_3DoF', 'free_aero_stable', 'free_3dof', 'free_ballistic']
const modeOf = (s: SimulationState): FlightModeName =>
  s.flight_mode && MODES.includes(s.flight_mode) ? s.flight_mode : s.thrust > 0 ? 'power_3DoF' : 'free_3dof'
const nullableNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

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

function buildFallTrack(body: FallBodyJson, baseLat: number, baseLon: number): FallTrack {
  const states = (body.trajectory ?? []).filter((s) => !isNonPhysical(s))
  return {
    kind: body.kind,
    stage: body.stage,
    releaseTime: body.release_time_s,
    mass: body.mass_kg,
    impact: toImpact(body.impact, baseLat, baseLon),
    samples: states.map((s) => {
      const t = num(s.time)
      const llh = posEciToLlh(vec3ToObject(s.position_eci || s.position), t)
      return { t, lat: llh.lat, lon: llh.lon, alt: num(s.altitude, llh.alt * 1000) }
    }),
  }
}

/** Track from the solver's full output (vehicle plus falling bodies). */
export function trackFromOutput(output: SimulationOutput): Track | null {
  return buildTrack(output.trajectory, output.fall_bodies)
}

export function buildTrack(input: SimulationState[], fallBodies: FallBodyJson[] = []): Track | null {
  if (!input || input.length < 2) return null
  // Keep everything up to the first non-physical sample.
  const cut = input.findIndex(isNonPhysical)
  const states = cut === -1 ? input : input.slice(0, cut)
  if (states.length < 2) return null

  const samples: TrackSample[] = []
  let baseLat = 0
  let baseLon = 0

  states.forEach((s, i) => {
    const t = num(s.time)
    const llh = posEciToLlh(vec3ToObject(s.position_eci || s.position), t)
    if (i === 0) {
      baseLat = llh.lat
      baseLon = llh.lon
    }
    const vEcef = vec3ToObject(s.velocity_ecef_ned || s.velocity_ned || [0, 0, 0])
    const accBody = vec3ToObject(s.acc_body || [0, 0, 0])
    samples.push({
      t,
      lat: llh.lat,
      lon: llh.lon,
      alt: num(s.altitude, llh.alt * 1000),
      downrange: haversineDistanceKm(baseLat, baseLon, llh.lat, llh.lon),
      stage: num(s.stage, 1),
      speed: num(s.velocity_magnitude),
      groundSpeed: Math.hypot(vEcef.x, vEcef.y, vEcef.z),
      mach: num(s.mach_number),
      q: num(s.dynamic_pressure),
      thrust: num(s.thrust),
      drag: num(s.drag_force),
      mass: num(s.mass),
      accel: num(s.acceleration_magnitude) / G0,
      accelAxial: accBody.x / G0,
      aoa: num(s.angle_of_attack),
      sideslip: num(s.sideslip_angle),
      azimuth: num(s.attitude_azimuth),
      elevation: num(s.attitude_elevation),
      mode: modeOf(s),
      iipLat: nullableNum(s.iip_lat_deg),
      iipLon: nullableNum(s.iip_lon_deg),
    })
  })

  const first = samples[0]
  const last = samples[samples.length - 1]

  // Stage spans
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

  // Events
  const events: FlightEvent[] = [{ kind: 'liftoff', t: first.t }]

  // Max-Q only means something inside the atmosphere during powered ascent.
  const maxQSample = samples[maxQIdx]
  if (maxQSample.q > 0 && maxQIdx > 0) {
    events.push({ kind: 'maxq', t: maxQSample.t })
  }

  const falls = fallBodies.map((b) => buildFallTrack(b, baseLat, baseLon))

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]
    const cur = samples[i]
    if (cur.stage !== prev.stage) {
      // The spent stage's release time is exact; the sample after it can lag by an output interval.
      const release = falls.find((f) => f.kind === 'stage' && f.stage === prev.stage)?.releaseTime
      const t = release !== undefined && release > prev.t - 1e-9 && release <= cur.t + 1e-9 ? release : cur.t
      // A stage still burning up to separation burns out there too.
      if (prev.thrust > 0) events.push({ kind: 'burnout', t, stage: prev.stage })
      events.push({ kind: 'separation', t, stage: prev.stage, nextStage: cur.stage })
    } else if (prev.thrust > 0 && cur.thrust <= 0) {
      events.push({ kind: 'burnout', t: cur.t, stage: cur.stage })
    }
  }

  for (const f of falls) {
    if (f.kind === 'dump' && f.releaseTime <= last.t) events.push({ kind: 'jettison', t: f.releaseTime, stage: f.stage })
  }

  const apogee = samples[apogeeIdx]
  const descends = apogeeIdx < samples.length - 1 && last.alt < apogee.alt - 1
  if (descends) {
    events.push({ kind: 'apogee', t: apogee.t })
  }

  const landed = last.alt <= 1
  events.push({ kind: 'end', t: last.t, landed })
  events.sort((a, b) => a.t - b.t)

  return {
    samples,
    events,
    stages,
    t0: first.t,
    t1: last.t,
    truncatedAt: cut === -1 ? undefined : num(input[cut].time),
    impact: landed ? { t: last.t, lat: last.lat, lon: last.lon, speed: last.groundSpeed, downrange: last.downrange } : null,
    fallBodies: falls,
    summary: {
      apogee: apogee.alt,
      apogeeTime: apogee.t,
      maxSpeed,
      maxMach,
      maxQ: maxQSample.q,
      maxQTime: maxQSample.t,
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

export function trackToCsv(track: Track): string {
  const header = [
    'time_s',
    'stage',
    'latitude_deg',
    'longitude_deg',
    'altitude_m',
    'downrange_km',
    'speed_inertial_mps',
    'speed_ground_mps',
    'mach',
    'dynamic_pressure_pa',
    'thrust_n',
    'drag_n',
    'mass_kg',
    'accel_g',
    'accel_axial_g',
    'aoa_deg',
    'sideslip_deg',
    'attitude_azimuth_deg',
    'attitude_elevation_deg',
    'flight_mode',
    'iip_latitude_deg',
    'iip_longitude_deg',
  ]
  const rows = track.samples.map((s) =>
    [
      s.t,
      s.stage,
      s.lat,
      s.lon,
      s.alt,
      s.downrange,
      s.speed,
      s.groundSpeed,
      s.mach,
      s.q,
      s.thrust,
      s.drag,
      s.mass,
      s.accel,
      s.accelAxial,
      s.aoa,
      s.sideslip,
      s.azimuth,
      s.elevation,
      s.mode,
      s.iipLat ?? '',
      s.iipLon ?? '',
    ].join(','),
  )
  return [header.join(','), ...rows].join('\n')
}
