import { describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS, createBlankConfig } from '../config/presets'
import type { Stage } from './config'
import { G0 } from './geo'
import { burnEndForPropellant, computeSpecs } from './specs'

const constantStage = (burnStart = 0, burnEnd = 50): Stage => ({
  mass_initial_kg: 1000,
  engine: { thrust_vac_n: 20000, isp_vac_s: 250, burn_start_s: burnStart, burn_end_s: burnEnd },
})

describe('computeSpecs', () => {
  it('matches the rocket equation for a constant-thrust stage', () => {
    const c = createBlankConfig()
    c.stages = [constantStage()]
    const spec = computeSpecs(c)
    const prop = (20000 * 50) / (250 * G0)
    expect(spec.stages[0].propellant).toBeCloseTo(prop, 6)
    expect(spec.dvTotal).toBeCloseTo(250 * G0 * Math.log(1000 / (1000 - prop)), 6)
    expect(spec.thrustToWeight).toBeCloseTo(20000 / (1000 * G0), 9)
    expect(spec.warnings).toEqual([])
  })

  it('warns when a stage would burn more than its mass', () => {
    const c = createBlankConfig()
    c.stages = [{ ...constantStage(), mass_initial_kg: 100, engine: { ...constantStage().engine!, thrust_vac_n: 1e6 } }]
    const spec = computeSpecs(c)
    expect(spec.warnings).toHaveLength(1)
    expect(spec.dvTotal).toBe(0)
  })

  it('gives orbital presets enough ideal Δv for orbit', () => {
    for (const p of PRESET_OPTIONS.filter((p) => p.category === 'orbital')) {
      expect(computeSpecs(p.create()).dvTotal, p.id).toBeGreaterThan(8500)
    }
  })
})

describe('burnEndForPropellant', () => {
  it('solves the constant case in closed form', () => {
    const prop = (20000 * 30) / (250 * G0)
    expect(burnEndForPropellant(constantStage(2), prop)).toBeCloseTo(32, 9)
    expect(burnEndForPropellant(constantStage(2), 0)).toBeNull()
  })

  it('integrates a thrust table and round-trips with computeSpecs', () => {
    const c = createBlankConfig()
    const s = constantStage(2)
    // Thrust falling linearly from 30 kN to 10 kN over 0..60 s
    s.engine!.thrust_vac_n = [
      [0, 30000],
      [60, 10000],
    ]
    c.stages = [s]
    const end = burnEndForPropellant(s, 400)!
    expect(end).toBeGreaterThan(2)
    s.engine!.burn_end_s = end
    expect(computeSpecs(c).stages[0].propellant).toBeCloseTo(400, 1)
    // More than the whole table burns
    expect(burnEndForPropellant(s, 1e6)).toBeNull()
  })
})
