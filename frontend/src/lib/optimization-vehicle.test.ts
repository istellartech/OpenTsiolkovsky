import { describe, expect, it } from 'vite-plus/test'
import example from '../../../examples/optimization/two_stage_80t_500km_43deg.json'
import recorded from './__fixtures__/optimization-80t.json'
import type { OptimizationResult } from './optimization'
import type { MultiStageInput, OptimizationInput } from './optimization-input'
import { optimizationInputIssues, requestFingerprint, samePhysicalProblem } from './optimization-input'
import { editStage, G0, phaseLabel, vehicleMetrics, warmStartGuess, withInitialGuess } from './optimization-vehicle'
import { constraintView } from './optimization-constraints'
import { multiStageSeries } from './optimization-series'
import { setLang } from './i18n'

const input = () => structuredClone(example) as unknown as OptimizationInput
const problem = (i: OptimizationInput) => i.problem as MultiStageInput
// Native result of the example, with every 40th reintegrated sample kept.
const result = () => structuredClone(recorded) as unknown as OptimizationResult

describe('vehicle view of the 80 t example', () => {
  it('derives launch mass, burn limits and Δv from the inventory', () => {
    const m = vehicleMetrics(problem(input()))
    expect(m.launchMass).toBeCloseTo(80350, 6)
    expect(m.stages[0].massFlow).toBeCloseTo(1_200_000 / (300 * G0), 9)
    expect(m.stages[0].burnLimit).toBeCloseTo(59_400 / (1_200_000 / (300 * G0)), 9)
    expect(m.stages[0].burnLimit).toBeGreaterThanOrEqual(problem(input()).stages[0].max_total_burn_s)
    expect(m.stages[0].thrustToWeight).toBeGreaterThan(1.3)
    expect(m.idealDeltaV).toBeGreaterThan(9000)
  })
  it('keeps the coupled engine, phase and horizon fields consistent when a stage changes', () => {
    const edited = editStage(input(), 0, 'propellant_kg', 55_000)
    const p = problem(edited)
    expect(optimizationInputIssues(edited)).toEqual([])
    expect(p.vehicle.stages[0].mass_initial_kg).toBe(p.stages[0].dry_kg + 55_000)
    const flow = 1_200_000 / (300 * G0)
    expect(p.stages[0].max_total_burn_s).toBe(Math.floor(((55_000 - 600) / flow) * 10) / 10)
    expect(p.vehicle.stages[0].engine?.burn_end_s).toBe(p.stages[0].max_total_burn_s)
    // The fixed booster burns still add up to the new on-time.
    const booster = p.phases.filter((ph) => ph.stage === 0 && ph.mode === 'burn')
    expect(booster.reduce((t, ph) => t + ph.duration_s.lower, 0)).toBeCloseTo(p.stages[0].max_total_burn_s, 9)
    expect(booster.every((ph) => ph.duration_s.lower === ph.duration_s.upper)).toBe(true)
    // Upper-stage burn ranges shrink with less propellant.
    const upper = problem(editStage(input(), 1, 'propellant_kg', 8_000))
    for (const ph of upper.phases.filter((q) => q.stage === 1 && q.mode === 'burn'))
      expect(ph.duration_s.upper).toBeLessThanOrEqual(upper.stages[1].max_total_burn_s)
    expect(optimizationInputIssues({ ...input(), problem: upper })).toEqual([])
  })
  it('names phases by stage, burn count and event', () => {
    setLang('ja')
    const phases = problem(input()).phases
    expect(phases.map((_, i) => phaseLabel(phases, i))).toEqual([
      '第1段 垂直上昇',
      '第1段 燃焼（前半）',
      '第1段 燃焼（後半）',
      '第1段 慣性飛行 → 段分離',
      '第2段 分離〜着火',
      '第2段 第1回燃焼 → フェアリング投棄',
      '第2段 慣性飛行（再着火まで）',
      '第2段 第2回燃焼 → 衛星分離',
    ])
  })
})

describe('recorded 80 t result', () => {
  it('reports the limits that cap the payload, not the trivial ones', () => {
    setLang('ja')
    const r = result()
    const phases = problem(r.input).phases
    const views = r.validation!.multi_stage!.checks.map((c) =>
      constraintView(
        c,
        (i) => phaseLabel(phases, i),
        (i) => phases[i].vertical,
      ),
    )
    const active = views.filter((v) => v.active).map((v) => v.check.id)
    expect(active).toEqual(expect.arrayContaining(['Q[1]', 'ENGINE.on_time[0]', 'ENGINE.on_time[1]']))
    // The pad sits on the altitude floor and the vertical rise ends at 90°: not limits on the payload.
    expect(active).not.toContain('CLEARANCE[0]')
    expect(active.filter((id) => id.startsWith('CONTROL.elevation_max'))).toEqual([])
    expect(views.filter((v) => !v.check.passed)).toEqual([])
    const q = views.find((v) => v.check.id === 'Q[1]')!
    expect(q.unit).toBe('kPa')
    expect(q.upper).toBeCloseTo(60, 9)
    expect(views.find((v) => v.check.id === 'ORBIT.inclination')!.family).toBe('orbit')
    expect(views.find((v) => v.check.id === 'DYN.position')!.family).toBe('numerical')
    // The bar shows how much of the nearest bound is used, whatever the bound shape.
    const usage = (id: string) => views.find((v) => v.check.id === id)!.usage!
    expect(usage('Q[1]')).toBeGreaterThan(0.98)
    // Residual 856 kg against a 600 kg reserve (and a remote 60 t upper bound).
    expect(usage('MASS.reserve[0]')).toBeCloseTo(1 - (856.4596 - 600) / 600, 3)
    expect(usage('CLEARANCE[1]')).toBe(0)
    expect(usage('CONTROL.elevation_min[7]')).toBeLessThan(0.2)
    expect(usage('ENGINE.phase_duration[5]')).toBeCloseTo(1, 6)
  })
  it('derives plot series with ground distance, path angle and remaining propellant', () => {
    const s = multiStageSeries(result())!
    expect(s.samples[0].downrangeKm).toBeCloseTo(0, 6)
    expect(s.samples[0].propellantKg).toBeCloseTo(60_000, 6)
    const last = s.samples[s.samples.length - 1]
    expect(last.altKm).toBeGreaterThan(495)
    expect(Math.abs(last.gammaDeg)).toBeLessThan(0.01)
    expect(last.speed).toBeCloseTo(7612.6, 0)
    expect(s.phases).toHaveLength(8)
    expect(s.events.map((e) => e.kind)).toEqual(['separate_stage', 'jettison_fairing', 'deploy_payload'])
  })
  it('seeds a warm start only for the same phase layout and keeps it out of comparisons', () => {
    const r = result(),
      next = input()
    const guess = warmStartGuess(r, next)!
    expect(guess.phase_durations_s).toHaveLength(8)
    expect(guess.net_payload_kg).toBeCloseTo(783.643, 3)
    for (let p = 0; p < 8; p++) expect(guess.samples.filter((s) => s.phase === p).length).toBeGreaterThanOrEqual(2)
    const seeded = JSON.parse(withInitialGuess(JSON.stringify(next), guess)) as OptimizationInput
    expect(optimizationInputIssues(seeded)).toEqual([])
    expect(requestFingerprint(seeded)).toBe(requestFingerprint(next))
    expect(samePhysicalProblem(seeded, next)).toBe(true)
    const changed = input()
    problem(changed).phases.splice(6, 1)
    expect(warmStartGuess(r, changed)).toBeNull()
  })
})
