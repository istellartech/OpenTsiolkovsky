import { describe, expect, it } from 'vite-plus/test'
import { DEFAULT_DISPERSION, bodyStage, casesToCsv, ellipsePoints, type CaseResult } from './montecarlo'

const M_PER_DEG = (6378137 * Math.PI) / 180

describe('ellipsePoints', () => {
  it('puts the major axis on the requested bearing', () => {
    // Major axis 10 km toward the east (90 deg), minor 2 km
    const pts = ellipsePoints(0, 0, 10_000, 2_000, 90, 4)
    expect(pts).toHaveLength(5)
    expect(pts[0].lat).toBeCloseTo(0, 9)
    expect(pts[0].lon * M_PER_DEG).toBeCloseTo(10_000, 3)
    expect(pts[1].lat * M_PER_DEG).toBeCloseTo(-2_000, 3) // minor axis 90 deg clockwise from major
    // Closed outline
    expect(pts[4].lat).toBeCloseTo(pts[0].lat, 9)
    expect(pts[4].lon).toBeCloseTo(pts[0].lon, 9)
  })

  it('stretches longitude with latitude', () => {
    const [p] = ellipsePoints(60, 10, 1_000, 1_000, 90, 4)
    expect((p.lon - 10) * M_PER_DEG * 0.5).toBeCloseTo(1_000, 3)
  })
})

describe('casesToCsv', () => {
  it('writes one row per case in index order, blank when no impact', () => {
    const c = (index: number, lat: number | null): CaseResult => ({
      index,
      perturbation: DEFAULT_DISPERSION,
      max_altitude_m: 1000,
      impacts: [{ body: 'vehicle', impact: lat === null ? null : { time_s: 50, latitude_deg: lat, longitude_deg: 2, speed_mps: 3 } }],
    })
    const lines = casesToCsv([c(1, null), c(0, 1.5)], ['vehicle']).split('\n')
    expect(lines[0].split(',')).toHaveLength(11 + 3)
    expect(lines[0]).toContain('vehicle_impact_lat[deg]')
    expect(lines[1].startsWith('0,')).toBe(true)
    expect(lines[1].endsWith(',50,1.5,2')).toBe(true)
    expect(lines[2].endsWith(',,,')).toBe(true)
  })
})

describe('bodyStage', () => {
  it('reads the stage of a body key', () => {
    expect(bodyStage('vehicle')).toBeNull()
    expect(bodyStage('stage2')).toBe(2)
    expect(bodyStage('stage3_dump')).toBe(3)
  })
})
