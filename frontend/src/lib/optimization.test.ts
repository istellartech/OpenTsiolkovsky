import { describe, expect, it } from 'vite-plus/test'
import { optimizationSnapshot, refineFlightMesh } from './optimization'

describe('optimization input snapshot', () => {
  it('preserves mission and solver values, with a new immutable run identity', () => {
    const raw = '{"schema_version":1,"run_id":"old","problem":{"kind":"hs071"},"solver":{"tolerance":1e-8}}'
    const snapshot = optimizationSnapshot(raw, 'new')
    expect(snapshot).toEqual({ schema_version: 1, run_id: 'new', problem: { kind: 'hs071' }, solver: { tolerance: 1e-8 } })
    expect(JSON.parse(raw).run_id).toBe('old')
  })
  it('rejects malformed, non-object and overflowed JSON without coercing numbers to null', () => {
    for (const raw of ['null', '[]', '1', '{', '{"distance_m":1e309}']) expect(() => optimizationSnapshot(raw, 'id')).toThrow()
  })
})

describe('flight mesh refinement', () => {
  it('preserves the physical problem and tolerances while starting a new mesh run', () => {
    const input = {
      run_id: 'old',
      problem: {
        kind: 'single_stage',
        burn_intervals: 8,
        coast_intervals: 4,
        degree: 4,
        max_dynamic_pressure_pa: 50000,
        validation: { position_m: 5 },
      },
      solver: { tolerance: 1e-8 },
    }
    const result = JSON.parse(refineFlightMesh(JSON.stringify(input)))
    expect(result).toEqual({
      ...input,
      run_id: 'refined-mesh',
      problem: { ...input.problem, burn_intervals: 16, coast_intervals: 8, degree: 6 },
    })
    expect(input.problem.degree).toBe(4)
  })
  it('rejects unsupported or exhausted meshes instead of silently rerunning them', () => {
    expect(() => refineFlightMesh('{"problem":{"kind":"hs071"}}')).toThrow()
    expect(() => refineFlightMesh('{"problem":{"kind":"single_stage","burn_intervals":16,"coast_intervals":12,"degree":8}}')).toThrow()
  })
})
