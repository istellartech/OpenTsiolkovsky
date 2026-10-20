/// <reference types="node" />
// Full convergence study: OPTIMIZATION_PRESETS=native (release CLI) or wasm.
// Without the flag, check the real simulation → optimization conversion only.
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS } from '../config/presets'
import orbital from '../../../examples/optimization/two_stage_80t_500km_43deg.json'
import sounding from '../../../examples/optimization/single_stage_100km.json'
import { optimizationFromSimulation } from './optimization-bridge'
import { optimizationInputIssues, type OptimizationInput } from './optimization-input'
import type { OptimizationResult } from './optimization'
import type { SimulationOutput } from './simulation'
import { trackFromOutput } from './trajectory'
import { instantiateOptimizer } from './optimization-wasm'
import { setLang } from './i18n'
import { newCase } from './case'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const simWasm = resolve(root, 'frontend/src/wasm/openTsiolkovsky_bg.wasm')
const backend = process.env.OPTIMIZATION_PRESETS
const enabled = backend === 'native' || backend === 'wasm'

describe.skipIf(!existsSync(simWasm))('sample vehicle missions', () => {
  let simulate: (config: string) => string
  let optimizer: Awaited<ReturnType<typeof instantiateOptimizer>>
  let directory: string
  beforeAll(async () => {
    setLang('en')
    const mod = await import('../wasm/openTsiolkovsky.js')
    await mod.default({ module_or_path: readFileSync(simWasm) })
    simulate = mod.simulate_json
    directory = mkdtempSync(resolve(tmpdir(), 'optimization-presets-'))
    if (backend === 'wasm')
      optimizer = await instantiateOptimizer(readFileSync(resolve(root, 'frontend/public/optimization/optimizer.wasm')), () => {})
  })
  afterAll(() => {
    if (directory) rmSync(directory, { recursive: true, force: true })
  })

  it('uses the recorded adapter in the initial mass ledger', () => {
    const config = PRESET_OPTIONS.find((p) => p.id === 'falcon9')!.create()
    const track = trackFromOutput(JSON.parse(simulate(JSON.stringify(config))) as SimulationOutput, config)!
    const context = newCase(config.name)
    context.carriedMass = { stage: 1, stageCount: 2, payloadKg: 1700, adapterKg: 200 }
    const converted = optimizationFromSimulation(config, structuredClone(orbital) as OptimizationInput, context, {
      apogeeM: track.summary.apogee,
      apogeeTimeS: track.summary.apogeeTime,
      maxQPa: track.summary.maxQ,
      trajectory: track.raw,
    })
    expect(converted.ok).toBe(true)
    if (!converted.ok || converted.value.problem.kind !== 'multi_stage') return
    const p = converted.value.problem
    expect(p.payload_adapter_kg).toBe(200)
    expect(p.initial_guess!.samples[0].state_eci[0]).toBeCloseTo(
      p.stages.reduce((m, s) => m + s.dry_kg + s.propellant_kg, p.fairing_kg + 200 + p.net_payload_kg.initial),
      8,
    )
  })

  it.each(PRESET_OPTIONS.map((p) => [p.id, p] as const))(
    'adapts and validates %s',
    (id, preset) => {
      const config = preset.create()
      const sim = JSON.parse(simulate(JSON.stringify(config))) as SimulationOutput
      const track = trackFromOutput(sim, config)!
      const converted = optimizationFromSimulation(
        config,
        structuredClone(config.stages.length === 1 ? sounding : orbital) as OptimizationInput,
        undefined,
        {
          apogeeM: track.summary.apogee,
          apogeeTimeS: track.summary.apogeeTime,
          maxQPa: track.summary.maxQ,
          trajectory: track.raw,
        },
      )
      expect(converted.ok).toBe(true)
      if (!converted.ok) return
      expect(optimizationInputIssues(converted.value)).toEqual([])
      const p = converted.value.problem
      if (p.kind === 'multi_stage') {
        expect(p.initial_guess?.samples[0].state_eci[0]).toBeCloseTo(
          p.stages.reduce((m, s) => m + s.dry_kg + s.propellant_kg, p.fairing_kg + p.payload_adapter_kg + p.net_payload_kg.initial),
          8,
        )
        expect(p.initial_guess?.samples.every((s) => s.state_eci.every(Number.isFinite))).toBe(true)
        expect(p.phases.every((_, i) => p.initial_guess!.samples.filter((s) => s.phase === i).length >= 2)).toBe(true)
        if (id === 'ss520-5') {
          expect(p.phases[0].vertical).toBe(false)
          expect(p.phases[p.phases.length - 1].max_specific_force_m_s2).toBeGreaterThan(700)
          expect(converted.value.solver?.tolerance).toBeLessThanOrEqual(1e-8)
        }
        if (['h2a202', 'h3-22s', 'falcon9'].includes(id)) expect(p.orbit.inclination_deg).toBeGreaterThan(90)
      }
      if (!enabled) return
      let result: OptimizationResult
      if (backend === 'native') {
        const inputFile = resolve(directory, `${id}.json`)
        const outputFile = resolve(directory, `${id}-result.json`)
        writeFileSync(inputFile, JSON.stringify(converted.value))
        const process = spawnSync(
          resolve(root, 'target/release/openTsiolkovsky-optimize'),
          ['--config', inputFile, '--output', outputFile],
          { encoding: 'utf8', timeout: 300_000 },
        )
        expect(process.error).toBeUndefined()
        expect(process.stderr).toBe('')
        result = JSON.parse(readFileSync(outputFile, 'utf8')) as OptimizationResult
      } else result = optimizer.solve(converted.value) as OptimizationResult
      expect(result.solver_status).toBe('Solve_Succeeded')
      expect(result.converged).toBe(true)
      expect(result.validation?.status).toBe('passed')
      const flight = result.validation?.multi_stage ?? result.validation?.flight
      expect(flight?.checks.filter((c) => !c.passed)).toEqual([])
    },
    360_000,
  )
})
