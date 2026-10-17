import { describe, expect, it } from 'vite-plus/test'
import { haversineDistanceKm, posEciToLlh } from './geo'

const WGS84_A = 6378137

describe('posEciToLlh', () => {
  it('maps the equator/prime meridian at t = 0', () => {
    const p = posEciToLlh({ x: WGS84_A + 1000, y: 0, z: 0 }, 0)
    expect(p.lat).toBeCloseTo(0, 9)
    expect(p.lon).toBeCloseTo(0, 9)
    expect(p.alt).toBeCloseTo(1, 6) // km
  })

  it('accounts for Earth rotation since launch', () => {
    // A fixed inertial point drifts west by ω·t.
    const t = 3600
    const p = posEciToLlh({ x: WGS84_A, y: 0, z: 0 }, t)
    expect(p.lon).toBeCloseTo((-7.2921159e-5 * t * 180) / Math.PI, 6)
  })

  it('handles the poles', () => {
    const b = 6356752.314245 // polar radius
    const p = posEciToLlh({ x: 0, y: 0, z: b + 500 }, 0)
    expect(p.lat).toBeCloseTo(90, 6)
    expect(p.alt).toBeCloseTo(0.5, 3)
  })
})

describe('haversineDistanceKm', () => {
  it('measures a quarter of a great circle', () => {
    expect(haversineDistanceKm(0, 0, 0, 90)).toBeCloseTo((Math.PI / 2) * 6371, 6)
    expect(haversineDistanceKm(35, 139, 35, 139)).toBe(0)
  })
})
