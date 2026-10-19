import { describe, expect, it } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import {
  canonicalJson,
  editOptimizationInput,
  inspectOptimizationInput,
  phaseViews,
  requestFingerprint,
  samePhysicalProblem,
  numericDraftValue,
  sectionForPath,
} from './optimization-input'

const read = (name = 'two_stage_500km_43deg') =>
  JSON.parse(readFileSync(new URL(`../../../examples/optimization/${name}.json`, import.meta.url), 'utf8'))

describe('optimization form input', () => {
  for (const name of [
    'two_stage_500km_43deg',
    'two_stage_500km_43deg_coarse',
    'momo_single_stage',
    'momo_single_stage_coarse',
    'hs071',
    'double_integrator',
  ]) {
    it(`accepts the canonical ${name} input without filling or removing keys`, () => {
      const original = read(name),
        result = inspectOptimizationInput(JSON.stringify(original))
      expect(result.issues).toEqual([])
      expect(result.input).toEqual(original)
    })
  }
  it('retains the incomplete ZERO template and blocks solving it', () => {
    const result = inspectOptimizationInput(JSON.stringify(read('zero_500km_43deg')))
    expect(result.input?.problem.kind).toBe('zero')
    expect(result.issues.length).toBeGreaterThan(0)
  })
  it('rejects unknown fields and overflow instead of silently fixing them', () => {
    const original = read()
    original.problem.stages[0].propelant_kg = 1
    expect(inspectOptimizationInput(JSON.stringify(original)).input).toBeNull()
    expect(inspectOptimizationInput('{"problem":1e309}').input).toBeNull()
    for (const raw of ['null', '[]', '{']) expect(inspectOptimizationInput(raw).input).toBeNull()
  })
  it('updates derived wet/dry masses without changing reserves, source or other settings', () => {
    const original = read(),
      changed = editOptimizationInput(original, 'problem.stages.0.dry_kg', 13001)
    expect(changed).toEqual({
      ...original,
      problem: {
        ...original.problem,
        stages: original.problem.stages.map((s: object, i: number) => (i ? s : { ...s, dry_kg: 13001 })),
        vehicle: {
          ...original.problem.vehicle,
          stages: original.problem.vehicle.stages.map((s: object, i: number) =>
            i ? s : { ...s, mass_initial_kg: 178001, mass_dry_kg: 13001 },
          ),
        },
      },
    })
    expect(inspectOptimizationInput(JSON.stringify(changed)).issues).toEqual([])
    expect(original.problem.stages[0].dry_kg).toBe(13000)
  })
  it('keeps single-stage base mass separate from additional payload', () => {
    const original = read('momo_single_stage'),
      changed = editOptimizationInput(original, 'problem.propellant_mass_kg', 900)
    expect(changed.problem.kind).toBe('single_stage')
    if (changed.problem.kind !== 'single_stage') return
    expect(changed.problem.vehicle.stages[0].mass_initial_kg).toBeCloseTo(original.problem.dry_mass_kg + 900)
    expect(changed.problem.additional_payload_kg).toEqual(original.problem.additional_payload_kg)
  })
  it('reports bounds, event order and inventory mismatches at their fields', () => {
    const input = read()
    input.problem.phases[4].duration_s.initial = 400
    input.problem.phases[2].end_event = 'none'
    input.problem.stages[1].reserve_kg = 50000
    const result = inspectOptimizationInput(JSON.stringify(input))
    expect(result.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining(['problem.phases.4.duration_s.initial', 'problem.phases.3.stage', 'problem.stages.1.reserve_kg']),
    )
  })
  it('preserves phase times and distinguishes mesh changes from physical changes', () => {
    const input = read(),
      coarse = read('two_stage_500km_43deg_coarse')
    expect(samePhysicalProblem(input, coarse)).toBe(true)
    const phases = phaseViews(input.problem)
    expect(phases[0].fixed).toBe(true)
    expect(phases[2].event).toBe('separate_stage')
    expect(phases[2].end).toBe(148)
    expect(phases[3].start).toBe(148)
    expect(samePhysicalProblem(input, editOptimizationInput(input, 'problem.stages.0.dry_kg', 13001))).toBe(false)
    expect(requestFingerprint({ ...input, run_id: 'another' })).toBe(requestFingerprint(input))
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }))
  })
  it('refuses prototype paths', () => {
    expect(() => editOptimizationInput(read(), 'problem.__proto__.x', 1)).toThrow()
    expect({}).not.toHaveProperty('x')
  })
  it('accepts PR3 solver settings and directs unsupported exact flight Hessians to JSON', () => {
    const exact = read('double_integrator_exact')
    expect(inspectOptimizationInput(JSON.stringify(exact)).issues).toEqual([])
    const input = read()
    input.solver.hessian = 'exact'
    expect(inspectOptimizationInput(JSON.stringify(input)).issues.map((i) => i.path)).toContain('solver.hessian')
    expect(sectionForPath('solver.hessian')).toBe('json')
    input.solver.hessian = 'limited_memory'
    input.solver.scaling = { strategy: 's2', floor: 0 }
    expect(inspectOptimizationInput(JSON.stringify(input)).issues.map((i) => i.path)).toContain('solver.scaling.floor')
  })
  it('compares omitted schema defaults with recorded serde defaults without changing the draft', () => {
    const draft = read('momo_single_stage'),
      recorded = structuredClone(draft)
    recorded.problem.vehicle.simulation.integrator.abs_tol = 1e-9
    recorded.problem.vehicle.simulation.integrator.rel_tol = 1e-9
    recorded.solver.stop_after_iteration = null
    expect(requestFingerprint(draft)).toBe(requestFingerprint(recorded))
    expect(samePhysicalProblem(draft, recorded)).toBe(true)
    expect(draft.solver).not.toHaveProperty('stop_after_iteration')
    recorded.problem.vehicle.simulation.integrator.abs_tol = 1e-8
    expect(requestFingerprint(draft)).not.toBe(requestFingerprint(recorded))
  })
  it('keeps numeric range errors editable and never interprets partial input as zero', () => {
    for (const text of ['', '-', '1e', 'Infinity', '1e309', '1,2']) expect(numericDraftValue({ text, scale: 1000 })).toBeNull()
    expect(numericDraftValue({ text: '1,200.5', scale: 1 })).toBe(1200.5)
    expect(numericDraftValue({ text: '1.25', scale: 1000 })).toBe(1250)
    expect(numericDraftValue({ text: '1.25', scale: 1, integer: true })).toBeNull()
    const draft = read()
    draft.problem.phases[1].intervals = 0.5
    const inspected = inspectOptimizationInput(JSON.stringify(draft))
    expect(inspected.input).not.toBeNull()
    expect(inspected.issues.length).toBeGreaterThan(0)
  })
  it('takes inventory and initial-guess issues to the corresponding forms', () => {
    expect(sectionForPath('problem.stages.0.reserve_kg')).toBe('vehicle')
    expect(sectionForPath('problem.stages.0.max_total_burn_s')).toBe('vehicle')
    expect(sectionForPath('problem.phases.1.duration_s.lower')).toBe('sequence')
    expect(sectionForPath('problem.phases.1.initial_attitude_end_deg.0')).toBe('numerics')
    expect(sectionForPath('problem.minimum_downrange_m')).toBe('mission')
    expect(sectionForPath('problem.validation.position_m')).toBe('numerics')
  })
})
