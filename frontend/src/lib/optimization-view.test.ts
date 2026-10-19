import { describe, expect, it } from 'vite-plus/test'
import recorded from './__fixtures__/optimization-map.json'
import type { OptimizationResult } from './optimization'
import { checkTime, optimizationMapPath, resultPhaseViews } from './optimization-view'

// Unmodified native output slices; no optimizer or physics is run by these view tests.
const result = () => structuredClone(recorded) as unknown as OptimizationResult
describe('recorded optimization presentation', () => {
  it('maps native ECI samples to the actual launch site and retains SI heights', () => {
    const path = optimizationMapPath(result(), 'saved-run')!
    expect(path.id).toBe('saved-run')
    expect(path.points[0].lat).toBeCloseTo(42.5, 7)
    expect(path.points[0].lon).toBeCloseTo(143.44, 7)
    expect(path.points[0].alt).toBeCloseTo(15, 7)
    expect(path.points[path.points.length - 1].alt).toBeCloseTo(507539.1384645533, 6)
    expect(path.markers).toHaveLength(4)
    expect(path.markers[1].time).toBe(148)
    expect(path.markers[1].lat).toBeCloseTo(path.points[5].lat, 7)
    expect(path.markers[1].alt).toBeCloseTo(path.points[5].alt, 5)
    expect(path.points).not.toEqual(expect.arrayContaining([expect.objectContaining({ mach: expect.anything() })]))
  })
  it('uses reintegrated durations rather than the initial guesses on result timelines', () => {
    const r = result(),
      phases = resultPhaseViews(r)
    expect(phases[5].duration).toBeCloseTo(251.4246849787037, 6)
    expect(phases[5].duration).not.toBe((r.input.problem as { phases: { duration_s: { initial: number } }[] }).phases[5].duration_s.initial)
    expect(phases[6].end).toBeCloseTo(704.4246849787037, 6)
  })
  it('locates an orbital check at deployment and declines checks without recorded time information', () => {
    const r = result(),
      check = r.validation!.multi_stage!.checks[0]
    expect(checkTime(r, check)).toBeCloseTo(704.4246849787037, 6)
    expect(checkTime(r, { ...check, id: 'MASS.global_balance' })).toBeNull()
    expect(checkTime(r, { ...check, id: 'Q[99]' })).toBeNull()
  })
  it('does not send invalid or absent coordinates to the globe', () => {
    expect(optimizationMapPath({ validation: null } as OptimizationResult, 'empty')).toBeNull()
    const r = result()
    r.validation!.multi_stage!.samples[0].state_eci[1] = NaN
    expect(optimizationMapPath(r, 'invalid')).toBeNull()
  })
})
