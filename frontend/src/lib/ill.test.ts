import { describe, expect, it } from 'vite-plus/test'
import { defaultIll, findIllViolation, insideIll, withIll, type IllPoint } from './ill'
import type { Track, TrackSample } from './trajectory'

/** Square from 0° to 1° in latitude and longitude. */
const SQUARE: IllPoint[] = [
  { lat_deg: 0, lon_deg: 0 },
  { lat_deg: 0, lon_deg: 1 },
  { lat_deg: 1, lon_deg: 1 },
  { lat_deg: 1, lon_deg: 0 },
]

/** Samples whose IIP moves east along latitude 0.5° from `lon0` at 0.1°/s. */
function eastward(lon0: number, n: number): TrackSample[] {
  return Array.from({ length: n }, (_, t) => ({ t, iipLat: 0.5, iipLon: lon0 + 0.1 * t }) as TrackSample)
}

describe('insideIll', () => {
  it('tells inside from outside', () => {
    expect(insideIll(SQUARE, 0.5, 0.5)).toBe(true)
    expect(insideIll(SQUARE, 0.5, 1.5)).toBe(false)
    expect(insideIll(SQUARE, -0.5, 0.5)).toBe(false)
  })

  it('handles a line across the antimeridian', () => {
    const ill: IllPoint[] = [
      { lat_deg: 0, lon_deg: 179 },
      { lat_deg: 0, lon_deg: -179 },
      { lat_deg: 1, lon_deg: -179 },
      { lat_deg: 1, lon_deg: 179 },
    ]
    expect(insideIll(ill, 0.5, 179.5)).toBe(true)
    expect(insideIll(ill, 0.5, -179.5)).toBe(true)
    expect(insideIll(ill, 0.5, 0)).toBe(false)
  })
})

describe('findIllViolation', () => {
  it('interpolates the crossing time', () => {
    // From 0.05° east at 0.1°/s, the IIP reaches 1° at t = 9.5 s.
    const v = findIllViolation(eastward(0.05, 15), SQUARE)
    expect(v?.t).toBeCloseTo(9.5, 6)
    expect(v?.lon).toBeCloseTo(1, 6)
    expect(v?.lat).toBeCloseTo(0.5, 6)
    expect(v?.reentryT).toBeNull()
  })

  it('is null when the IIP stays inside', () => {
    expect(findIllViolation(eastward(0.05, 5), SQUARE)).toBeNull()
  })

  it('flags a start outside the line at the first sample', () => {
    expect(findIllViolation(eastward(-0.5, 3), SQUARE)?.t).toBe(0)
  })

  it('reports re-entry', () => {
    const samples = eastward(0.75, 10).map((s) => (s.t >= 5 ? { ...s, iipLon: 1.25 - 0.1 * (s.t - 5) } : s))
    const v = findIllViolation(samples, SQUARE)
    expect(v?.t).toBeCloseTo(2.5, 6)
    expect(v?.reentryT).toBeCloseTo(7.5, 6)
  })

  it('does not bridge a gap without an IIP', () => {
    const samples = eastward(0.05, 5).map((s) => (s.t === 2 ? { ...s, iipLat: null, iipLon: null } : s))
    expect(findIllViolation(samples, SQUARE)).toBeNull()
  })
})

describe('withIll', () => {
  const track = { samples: eastward(0.05, 15), events: [{ kind: 'end', t: 14 }] } as unknown as Track

  it('adds the crossing as an event, in time order', () => {
    const out = withIll(track, SQUARE)
    expect(out.events.map((e) => e.kind)).toEqual(['ill', 'end'])
    expect(out.ill?.violation?.t).toBeCloseTo(9.5, 6)
  })

  it('leaves the track alone without a usable line', () => {
    expect(withIll(track, undefined)).toBe(track)
    expect(withIll(track, SQUARE.slice(0, 2))).toBe(track)
  })
})

describe('defaultIll', () => {
  it('contains the launch site and the downrange corridor', () => {
    const ill = defaultIll(31.25, 131.08, 90)
    expect(insideIll(ill, 31.25, 131.08)).toBe(true)
    expect(insideIll(ill, 31.25, 135)).toBe(true) // ~370 km east
    expect(insideIll(ill, 31.25, 130.5)).toBe(false) // behind the pad
    expect(insideIll(ill, 34, 132)).toBe(false) // far north of the corridor
  })
})
