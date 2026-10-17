import { describe, expect, it } from 'vite-plus/test'
import type { FallBodyJson, SimulationState } from './simulation'
import { buildTrack, indexAt, sampleAt, trackToCsv } from './trajectory'
import { generateKML } from './kml'

const R = 6378137

/** A straight-up flight from (0°, 0°): two stages, apogee at 20 s, impact at 40 s. */
function hop(): SimulationState[] {
  const out: SimulationState[] = []
  for (let t = 0; t <= 40; t++) {
    const alt = (1000 * (20 * 20 - (t - 20) ** 2)) / 4
    out.push({
      time: t,
      position: [R + alt, 0, 0],
      velocity: [0, 0, 0],
      mass: 100 - t,
      stage: t < 10 ? 1 : 2,
      altitude: alt,
      velocity_magnitude: Math.abs(20 - t) * 500,
      mach_number: Math.abs(20 - t) * 1.5,
      dynamic_pressure: t < 20 ? 1000 * t * (20 - t) : 0,
      thrust: t < 5 || (t >= 10 && t < 15) ? 1000 : 0,
      drag_force: 0,
      flight_mode: t < 5 || (t >= 10 && t < 15) ? 'power_3DoF' : 'free_ballistic',
      iip_lat_deg: t < 40 ? 0.001 * t : null,
      iip_lon_deg: t < 40 ? 0 : null,
    })
  }
  return out
}

/** Stage 1 released at 10 s, a fairing at 12 s; the fairing has no impact. */
function falls(): FallBodyJson[] {
  const body = (kind: 'stage' | 'dump', t0: number): FallBodyJson => ({
    kind,
    stage: kind === 'stage' ? 1 : 2,
    release_time_s: t0,
    mass_kg: 10,
    impact: kind === 'stage' ? { time_s: 30, latitude_deg: 0.1, longitude_deg: 0, speed_mps: 100 } : null,
    trajectory: [t0, 30].map((t, i) => ({
      ...hop()[t],
      position: [R + (i ? 0 : 5000), 0, 0],
      altitude: i ? 0 : 5000,
    })),
  })
  return [body('stage', 10), body('dump', 12)]
}

describe('buildTrack', () => {
  const track = buildTrack(hop(), falls())!

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

  it('finds events in time order', () => {
    expect(track.events.map((e) => [e.kind, e.t])).toEqual([
      ['liftoff', 0],
      ['burnout', 5],
      ['maxq', 10],
      ['separation', 10],
      ['jettison', 12],
      ['burnout', 15],
      ['apogee', 20],
      ['end', 40],
    ])
    expect(track.events.find((e) => e.kind === 'separation')).toMatchObject({ stage: 1, nextStage: 2 })
  })

  it('keeps flight mode, IIP and falling bodies', () => {
    expect(track.samples[0].mode).toBe('power_3DoF')
    expect(track.samples[6].mode).toBe('free_ballistic')
    expect(track.samples[10].iipLat).toBeCloseTo(0.01, 12)
    expect(track.samples[40].iipLat).toBeNull()
    // Discrete values are not interpolated
    expect(sampleAt(track, 4.6).mode).toBe('free_ballistic')
    expect(sampleAt(track, 4.4).mode).toBe('power_3DoF')

    expect(track.impact).toMatchObject({ t: 40 })
    expect(track.fallBodies).toHaveLength(2)
    const [stage, dump] = track.fallBodies
    expect(stage).toMatchObject({ kind: 'stage', stage: 1, releaseTime: 10, mass: 10 })
    expect(stage.samples.map((s) => s.alt)).toEqual([5000, 0])
    expect(stage.impact?.lat).toBe(0.1)
    expect(stage.impact?.downrange).toBeCloseTo(11.1, 0)
    expect(dump.impact).toBeNull()
  })

  it('cuts a diverged run at the first non-physical sample', () => {
    const states = hop()
    states[30] = { ...states[30], altitude: 5e9 }
    const cut = buildTrack(states)!
    expect(cut.t1).toBe(29)
    expect(cut.truncatedAt).toBe(30)
  })

  it('returns null without enough samples', () => {
    expect(buildTrack(hop().slice(0, 1))).toBeNull()
  })

  it('interpolates between samples', () => {
    expect(indexAt(track.samples, 12.5)).toBe(12)
    const s = sampleAt(track, 12.5)
    expect(s.alt).toBeCloseTo((track.samples[12].alt + track.samples[13].alt) / 2, 9)
    expect(sampleAt(track, -5).t).toBe(-5)
  })

  it('exports CSV with a fixed header', () => {
    const lines = trackToCsv(track).split('\n')
    expect(lines[0]).toBe(
      'time_s,stage,latitude_deg,longitude_deg,altitude_m,downrange_km,speed_inertial_mps,speed_ground_mps,mach,dynamic_pressure_pa,thrust_n,drag_n,mass_kg,accel_g,accel_axial_g,aoa_deg,sideslip_deg,attitude_azimuth_deg,attitude_elevation_deg,flight_mode,iip_latitude_deg,iip_longitude_deg',
    )
    expect(lines).toHaveLength(42)
    expect(lines[1].endsWith(',power_3DoF,0,0')).toBe(true)
    expect(lines[41].endsWith(',free_ballistic,,')).toBe(true)
  })

  it('exports KML with the path and event placemarks', () => {
    const kml = generateKML(track, 'A & B')
    expect(kml).toContain('<name>A &amp; B Trajectory</name>')
    // launch + path + events (no liftoff) + per fall body: path and impact (if any)
    expect(kml.match(/<Placemark>/g)).toHaveLength(2 + track.events.length - 1 + 3)
  })
})
