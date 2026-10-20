/// <reference types="node" />
// Hand-off between the optimizer and the simulator. The end-to-end checks fly
// the converted configuration with the simulation WASM and load converted
// inputs into the optimizer WASM; each is skipped when its bundle is missing.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import example from '../../../examples/optimization/two_stage_80t_500km_43deg.json'
import singleExample from '../../../examples/optimization/single_stage_100km.json'
import recorded from './__fixtures__/optimization-80t.json'
import { PRESET_OPTIONS } from '../config/presets'
import type { Config } from './config'
import type { OptimizationResult } from './optimization'
import type { MultiStageInput, OptimizationInput, SingleStageInput } from './optimization-input'
import { optimizationInputIssues } from './optimization-input'
import { optimizationFromSimulation, optimizationKindFor, simulationFromOptimization } from './optimization-bridge'
import { instantiateOptimizer } from './optimization-wasm'
import { runSimulation } from './simulation'
import { validateConfig } from './validation'
import { setLang } from './i18n'

setLang('en')
const result = () => structuredClone(recorded) as unknown as OptimizationResult
const template = (config: Config) =>
  structuredClone(optimizationKindFor(config) === 'single_stage' ? singleExample : example) as unknown as OptimizationInput
const simulated = () => {
  const r = simulationFromOptimization(result())
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r
}
const seeded = (config: Config) => {
  const r = optimizationFromSimulation(config, template(config))
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r
}

describe('optimization result → simulation', () => {
  it('folds payload, adapter and fairing into the stage masses and keeps the burn timeline', () => {
    const { value: config, notes } = simulated()
    const p = result().input.problem as MultiStageInput
    const v = result().validation!.multi_stage!
    expect(validateConfig(config)).toEqual([])
    const [s1, s2] = config.stages
    expect(s1.separation_time_s).toBeCloseTo(148, 9)
    expect(s1.mass_initial_kg).toBe(p.vehicle.stages[0].mass_initial_kg)
    expect(s2.mass_initial_kg).toBeCloseTo(13600 + p.fairing_kg + p.payload_adapter_kg + v.net_payload_kg, 6)
    expect(s2.mass_initial_kg - (s2.mass_dry_kg ?? 0)).toBeCloseTo(p.stages[1].propellant_kg, 6)
    expect(s2.jettisons).toEqual([expect.objectContaining({ name: 'fairing', mass_kg: p.fairing_kg, time_s: 353 })])
    // Upper stage: ignition 5 s after separation, two burns with a zero-thrust coast between them.
    expect(s2.engine?.burn_start_s).toBe(5)
    expect(s2.engine?.burn_end_s).toBeCloseTo(1778.144, 3)
    const thrust = s2.engine?.thrust_vac_n as [number, number][]
    expect(thrust.map(([, f]) => f)).toEqual([110000, 110000, 0, 0, 110000, 110000])
    expect(config.simulation.end_time_s).toBeCloseTo(v.final_time_s, 3)
    expect(config.name).toMatch(/optimized/)
    expect(notes.join(' ')).toMatch(/restart/)
  })
  it('refuses a result without a validated trajectory', () => {
    const r = result()
    r.validation = null
    expect(simulationFromOptimization(r).ok).toBe(false)
  })
})

describe('simulation → optimization input', () => {
  it('reproduces the template inventory from its own vehicle', () => {
    const p = example.problem as unknown as MultiStageInput
    const { value } = seeded(structuredClone(p.vehicle))
    const q = value.problem as MultiStageInput
    expect(optimizationInputIssues(value)).toEqual([])
    expect(q.stages.map((s) => [s.dry_kg, s.propellant_kg])).toEqual(p.stages.map((s) => [s.dry_kg, s.propellant_kg]))
    expect(q.stages.map((s) => s.max_total_burn_s)).toEqual([145, 353])
    expect(q.vehicle.stages.map((s) => s.engine?.burn_end_s)).toEqual([145, 353])
    // Without a jettison in the simulation there is no fairing to drop.
    expect(q.fairing_kg).toBe(0)
    expect(q.phases.filter((ph) => ph.end_event !== 'none').map((ph) => ph.end_event)).toEqual(['separate_stage', 'deploy_payload'])
    // Timeline: stage 1 burns to its limit and separates at 148 s, as in the vehicle.
    expect(q.vehicle.stages[0].separation_time_s).toBe(148)
    expect(q.phases[0]).toMatchObject({ vertical: true, duration_s: { initial: 10, lower: 10, upper: 10 } })
  })
  it('recovers the fairing and restart burn from an optimized simulation', () => {
    const { value, notes } = seeded(simulated().value)
    const q = value.problem as MultiStageInput
    expect(optimizationInputIssues(value)).toEqual([])
    expect(q.fairing_kg).toBe(400)
    expect(q.stages[1].dry_kg).toBeCloseTo(1600 + 50 + result().validation!.multi_stage!.net_payload_kg, 6)
    const fairing = q.phases.findIndex((ph) => ph.end_event === 'jettison_fairing')
    expect(q.phases[fairing].stage).toBe(1)
    // The fairing leaves where it did in the simulation (absolute 501 s).
    const end = q.phases.slice(0, fairing + 1).reduce((t, ph) => t + ph.duration_s.initial, 0)
    expect(end).toBeCloseTo(501, 3)
    expect(notes.join(' ')).toMatch(/fairing/)
    // The zero-thrust gap in the upper stage's thrust table is the restart coast again.
    expect(q.stages[1].max_ignitions).toBe(2)
    const upper = q.phases.filter((ph) => ph.stage === 1).map((ph) => [ph.mode, ph.end_event])
    expect(upper).toEqual([
      ['coast', 'none'],
      ['burn', 'jettison_fairing'],
      ['coast', 'none'],
      ['burn', 'deploy_payload'],
    ])
    const coast = q.phases[fairing + 1].duration_s
    expect(coast.initial).toBeCloseTo(1420.144, 2)
    expect(coast.upper).toBeGreaterThan(coast.initial)
  })
  it('seeds the single-stage problem from a sounding rocket', () => {
    const config = PRESET_OPTIONS.find((p) => p.id === 'momo')!.create()
    const { value } = seeded(config)
    const q = value.problem as SingleStageInput
    expect(optimizationInputIssues(value)).toEqual([])
    expect(q.dry_mass_kg + q.propellant_mass_kg).toBe(config.stages[0].mass_initial_kg)
    expect(q.vehicle.stages[0].free_flight).toBe('aero_stable')
  })
  it('reports what cannot be converted', () => {
    const config = PRESET_OPTIONS.find((p) => p.id === 'momo')!.create()
    delete config.stages[0].mass_dry_kg
    config.stages[0].aero = { ...config.stages[0].aero, cn_table: { file: 'cn.csv' } }
    const r = optimizationFromSimulation(config, template(config))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/dry mass/)
  })
  it.each(PRESET_OPTIONS.map((p) => [p.id, p] as const))('converts the %s sample vehicle', (_, preset) => {
    const { value } = seeded(preset.create())
    expect(optimizationInputIssues(value)).toEqual([])
  })
})

const simWasm = fileURLToPath(new URL('../wasm/openTsiolkovsky_bg.wasm', import.meta.url))
describe.skipIf(!existsSync(simWasm))('optimized trajectory flown by the simulator', () => {
  beforeAll(async () => {
    const mod = await import('../wasm/openTsiolkovsky.js')
    await mod.default({ module_or_path: readFileSync(simWasm) })
  })
  it('reaches the optimizer’s deployment state', async () => {
    const out = await runSimulation(simulated().value)
    const end = out.trajectory[out.trajectory.length - 1]
    const samples = result().validation!.multi_stage!.samples
    const ref = samples[samples.length - 1].state_eci
    const pos = Math.hypot(end.pos_eci_x_m - ref[1], end.pos_eci_y_m - ref[2], end.pos_eci_z_m - ref[3])
    const vel = Math.hypot(end.vel_eci_x_mps - ref[4], end.vel_eci_y_mps - ref[5], end.vel_eci_z_mps - ref[6])
    // The fixture keeps every 40th sample, so the attitude table is coarse.
    expect(pos).toBeLessThan(1000)
    expect(vel).toBeLessThan(0.5)
    expect(end.mass_kg).toBeCloseTo(ref[0], 2)
  })
})

const optWasm = fileURLToPath(new URL('../../public/optimization/optimizer.wasm', import.meta.url))
describe.skipIf(!existsSync(optWasm))('converted inputs in the optimizer', () => {
  const vehicles = [...PRESET_OPTIONS.map((p) => [p.id, () => p.create()] as const), ['optimized 80 t', () => simulated().value] as const]
  it.each(vehicles)('accepts the %s vehicle', async (_, create) => {
    const optimizer = await instantiateOptimizer(readFileSync(optWasm), () => {})
    const { value } = seeded(create())
    value.solver = { ...value.solver, max_iterations: 1 }
    const solved = optimizer.solve(value) as OptimizationResult | { error: string }
    expect('error' in solved ? solved.error : solved.solver_status).toBe('Maximum_Iterations_Exceeded')
  })
})
