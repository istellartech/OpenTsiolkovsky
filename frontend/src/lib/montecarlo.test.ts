import { describe, expect, it } from 'vite-plus/test'
import {
  DEFAULT_DISPERSION,
  DISPERSION_KEYS,
  bodyStage,
  casesToCsv,
  ellipseAxes,
  ellipsePoints,
  type CaseResult,
  type ImpactStatistics,
} from './montecarlo'

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
  const perturbation = Object.fromEntries(DISPERSION_KEYS.map((k) => [k, 0])) as unknown as CaseResult['perturbation']
  const c = (index: number, lat: number | null, stages = false): CaseResult => ({
    index,
    perturbation: stages
      ? { ...perturbation, stages: [1, 2].map((v) => ({ ...perturbation, thrust_percent: v, normal_percent: 0, separation_time_s: 0 })) }
      : perturbation,
    max_altitude_m: 1000,
    impacts: [{ body: 'vehicle', impact: lat === null ? null : { time_s: 50, latitude_deg: lat, longitude_deg: 2, speed_mps: 3 } }],
  })

  it('writes one row per case in index order, blank when no impact', () => {
    const lines = casesToCsv([c(1, null), c(0, 1.5)], ['vehicle']).split('\n')
    // As the CLI's montecarlo_cases.csv
    expect(lines[0]).toBe(
      [
        'case',
        ...DISPERSION_KEYS,
        'max_altitude_m',
        'vehicle_impact_time_s',
        'vehicle_impact_latitude_deg',
        'vehicle_impact_longitude_deg',
      ].join(','),
    )
    expect(lines[1].startsWith('0,')).toBe(true)
    expect(lines[1].endsWith(',1000,50,1.5,2')).toBe(true)
    expect(lines[2].endsWith(',1000,,,')).toBe(true)
  })

  it('adds per-stage columns for independent stage draws', () => {
    const [header, row] = casesToCsv([c(0, 1, true)], ['vehicle']).split('\n')
    expect(header).toContain('stage2_thrust_percent')
    expect(row.split(',')[header.split(',').indexOf('stage2_thrust_percent')]).toBe('2')
  })
})

describe('bodyStage', () => {
  it('reads the stage of a body id', () => {
    expect(bodyStage('vehicle')).toBeNull()
    expect(bodyStage('stage2')).toBe(2)
    expect(bodyStage('stage3_fairing')).toBe(3)
  })
})

describe('ellipseAxes', () => {
  it('picks the ellipse of the level', () => {
    const s = {
      ellipse_major_m: 100,
      ellipse_minor_m: 50,
      ellipse_95_major_m: 7,
      ellipse_95_minor_m: 3,
      ellipse_99_major_m: 9,
      ellipse_99_minor_m: 4,
    } as ImpactStatistics
    expect(ellipseAxes(s, 'p95')).toEqual({ major: 7, minor: 3 })
    expect(ellipseAxes(s, 'p99')).toEqual({ major: 9, minor: 4 })
    expect(ellipseAxes(s, 'sigma1')).toEqual({ major: 100, minor: 50 })
  })
})

describe('DEFAULT_DISPERSION', () => {
  it('has every key', () => {
    for (const k of DISPERSION_KEYS) expect(typeof DEFAULT_DISPERSION[k]).toBe('number')
  })
})
