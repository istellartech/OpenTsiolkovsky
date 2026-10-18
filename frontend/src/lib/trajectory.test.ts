import { describe, expect, it } from 'vite-plus/test'
import type { BodyJson, FlightEventJson, Sample } from './simulation'
import { indexAt, sampleAt, samplesToCsv, trackFromOutput } from './trajectory'
import { generateKML } from './kml'

const ZERO: Sample = {
  time_s: 0,
  stage: 1,
  flight_mode: 'powered',
  latitude_deg: 0,
  longitude_deg: 0,
  altitude_m: 0,
  downrange_m: 0,
  mass_kg: 0,
  thrust_n: 0,
  isp_s: 0,
  vel_north_mps: 0,
  vel_east_mps: 0,
  vel_down_mps: 0,
  speed_earth_mps: 0,
  speed_inertial_mps: 0,
  mach: 0,
  dynamic_pressure_pa: 0,
  azimuth_deg: 0,
  elevation_deg: 90,
  roll_deg: 0,
  alpha_deg: 0,
  beta_deg: 0,
  aoa_total_deg: 0,
  accel_body_x_mps2: 0,
  accel_body_y_mps2: 0,
  accel_body_z_mps2: 0,
  aero_body_x_n: 0,
  aero_body_y_n: 0,
  aero_body_z_n: 0,
  thrust_body_x_n: 0,
  thrust_body_y_n: 0,
  thrust_body_z_n: 0,
  gimbal_pitch_deg: 0,
  gimbal_yaw_deg: 0,
  wind_speed_mps: 0,
  wind_direction_deg: 0,
  iip_latitude_deg: null,
  iip_longitude_deg: null,
  pos_eci_x_m: 0,
  pos_eci_y_m: 0,
  pos_eci_z_m: 0,
  vel_eci_x_mps: 0,
  vel_eci_y_mps: 0,
  vel_eci_z_mps: 0,
  accel_eci_x_mps2: 0,
  accel_eci_y_mps2: 0,
  accel_eci_z_mps2: 0,
  loss_gravity_mps2: 0,
  loss_aero_mps2: 0,
  loss_thrust_mps2: 0,
}

/** A straight-up flight from (0°, 0°): two stages, apogee at 20 s, impact at 40 s. */
function hop(): Sample[] {
  const out: Sample[] = []
  for (let t = 0; t <= 40; t++) {
    const powered = t < 5 || (t >= 10 && t < 15)
    out.push({
      ...ZERO,
      time_s: t,
      stage: t < 10 ? 1 : 2,
      altitude_m: (1000 * (20 * 20 - (t - 20) ** 2)) / 4,
      mass_kg: 100 - t,
      speed_inertial_mps: Math.abs(20 - t) * 500,
      speed_earth_mps: Math.abs(20 - t) * 480,
      mach: Math.abs(20 - t) * 1.5,
      dynamic_pressure_pa: t < 20 ? 1000 * t * (20 - t) : 0,
      thrust_n: powered ? 1000 : 0,
      flight_mode: powered ? 'powered' : 'ballistic',
      iip_latitude_deg: t < 40 ? 0.001 * t : null,
      iip_longitude_deg: t < 40 ? 0 : null,
    })
  }
  return out
}

/** Stage 1 released at 10 s, a fairing at 12 s; the fairing has no impact. */
function bodies(): BodyJson[] {
  const body = (kind: 'stage' | 'jettison', t0: number): BodyJson => ({
    id: kind === 'stage' ? 'stage1' : 'stage2_fairing',
    kind,
    stage: kind === 'stage' ? 1 : 2,
    release_time_s: t0,
    mass_kg: 10,
    impact: kind === 'stage' ? { time_s: 30, latitude_deg: 0.1, longitude_deg: 0, speed_mps: 100 } : null,
    trajectory: [t0, 30].map((t, i) => ({ ...hop()[t], altitude_m: i ? 0 : 5000 })),
  })
  return [body('stage', 10), body('jettison', 12)]
}

const ev = (kind: FlightEventJson['kind'], time_s: number, stage = 1): FlightEventJson => ({
  kind,
  stage,
  time_s,
  altitude_m: 1000 * time_s,
  latitude_deg: 0,
  longitude_deg: 0,
  downrange_m: 500,
  speed_earth_mps: 300,
  speed_inertial_mps: 700,
  mach: 0.9,
  dynamic_pressure_pa: 0,
  mass_kg: 50,
})

const EVENTS = [
  ev('ignition', 0),
  ev('liftoff', 0.2),
  ev('rail_exit', 0.8),
  ev('burnout', 4.6),
  ev('mach1', 6.1),
  ev('max_q', 7.3),
  ev('separation', 9.5),
  ev('ignition', 9.5, 2),
  { ...ev('jettison', 12, 2), body: 'fairing' },
  ev('apogee', 20.04, 2),
  ev('impact', 40, 2),
  ev('burnout', 41, 2),
]

describe('trackFromOutput', () => {
  const track = trackFromOutput({ trajectory: hop(), events: EVENTS, bodies: bodies() })!

  it('derives the summary', () => {
    expect(track.t0).toBe(0)
    expect(track.t1).toBe(40)
    expect(track.summary.apogee).toBe(100000)
    expect(track.summary.apogeeTime).toBe(20)
    expect(track.summary.landed).toBe(true)
    expect(track.stages).toEqual([
      { stage: 1, t0: 0, t1: 10 },
      { stage: 2, t0: 10, t1: 40 },
    ])
  })

  it('takes the events located by the solver', () => {
    expect(track.events.map((e) => [e.kind, e.t, e.stage])).toEqual([
      ['ignition', 0, 1],
      ['liftoff', 0.2, undefined],
      ['railexit', 0.8, undefined],
      ['burnout', 4.6, 1],
      ['mach1', 6.1, undefined],
      ['maxq', 7.3, undefined],
      ['separation', 9.5, 1],
      ['ignition', 9.5, 2],
      ['jettison', 12, 2],
      ['apogee', 20.04, undefined],
      ['end', 40, undefined],
    ])
    const sep = track.events.find((e) => e.kind === 'separation')!
    expect(sep.nextStage).toBe(2)
    expect(sep.at).toEqual({ alt: 9500, groundSpeed: 300, mach: 0.9, downrange: 0.5 })
    expect(track.events.find((e) => e.kind === 'jettison')?.body).toBe('fairing')
    expect(track.events[track.events.length - 1].landed).toBe(true)
  })

  it('ends a run without an impact event', () => {
    const t = trackFromOutput({ trajectory: hop(), events: EVENTS.slice(0, 3), bodies: [] })!
    expect(t.events.slice(-1)[0]).toEqual({ kind: 'end', t: 40, landed: true })
  })

  it('keeps flight mode, IIP and released bodies', () => {
    expect(track.samples[0].mode).toBe('powered')
    expect(track.samples[6].mode).toBe('ballistic')
    expect(track.samples[10].iipLat).toBeCloseTo(0.01, 12)
    expect(track.samples[40].iipLat).toBeNull()
    // Discrete values are not interpolated
    expect(sampleAt(track, 4.6).mode).toBe('ballistic')
    expect(sampleAt(track, 4.4).mode).toBe('powered')

    expect(track.impact).toMatchObject({ t: 40 })
    expect(track.fallBodies).toHaveLength(2)
    const [stage, fairing] = track.fallBodies
    expect(stage).toMatchObject({ id: 'stage1', kind: 'stage', stage: 1, releaseTime: 10, mass: 10 })
    expect(stage.samples.map((s) => s.alt)).toEqual([5000, 0])
    expect(stage.impact?.lat).toBe(0.1)
    expect(stage.impact?.downrange).toBeCloseTo(11.1, 0)
    expect(fairing).toMatchObject({ id: 'stage2_fairing', kind: 'jettison' })
    expect(fairing.impact).toBeNull()
  })

  it('cuts a diverged run at the first non-physical sample', () => {
    const states = hop()
    states[30] = { ...states[30], altitude_m: 5e9 }
    const cut = trackFromOutput({ trajectory: states, events: [], bodies: [] })!
    expect(cut.t1).toBe(29)
    expect(cut.truncatedAt).toBe(30)
  })

  it('returns null without enough samples', () => {
    expect(trackFromOutput({ trajectory: hop().slice(0, 1), events: [], bodies: [] })).toBeNull()
  })

  it('interpolates between samples', () => {
    expect(indexAt(track.samples, 12.5)).toBe(12)
    const s = sampleAt(track, 12.5)
    expect(s.alt).toBeCloseTo((track.samples[12].alt + track.samples[13].alt) / 2, 9)
    expect(sampleAt(track, -5).t).toBe(-5)
  })

  it('exports the solver samples with the CLI columns', () => {
    const lines = samplesToCsv(track.raw).split('\n')
    expect(lines[0].split(',').slice(0, 4)).toEqual(['time_s', 'stage', 'flight_mode', 'latitude_deg'])
    expect(lines[0].split(',')).toHaveLength(Object.keys(ZERO).length)
    expect(lines).toHaveLength(42)
    expect(lines[1].startsWith('0,1,powered,')).toBe(true)
    // Missing IIP: empty cells
    expect(lines[41]).toContain(',,,')
  })

  it('exports KML with the path and event placemarks', () => {
    const kml = generateKML(track, 'A & B')
    expect(kml).toContain('<name>A &amp; B Trajectory</name>')
    // launch + path + events (no liftoff) + per released body: path and impact (if any)
    expect(kml.match(/<Placemark>/g)).toHaveLength(2 + track.events.length - 1 + 3)
  })
})
