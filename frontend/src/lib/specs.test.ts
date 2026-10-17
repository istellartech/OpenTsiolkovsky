import { describe, expect, it } from 'vite-plus/test'
import { createBlankConfig } from '../config/presets'
import { PRESET_OPTIONS } from '../config/presets'
import { G0 } from './geo'
import { computeSpecs } from './specs'

describe('computeSpecs', () => {
  it('matches the rocket equation for a constant-thrust stage', () => {
    const c = createBlankConfig()
    const s = c.stages[0]
    Object.assign(s, {
      mass_initial_kg: 1000,
      thrust_constant: 20000,
      isp_constant: 250,
      burn_start_s: 0,
      burn_end_s: 50,
      forced_cutoff_s: 50,
    })
    s.thrust_profile = []
    s.isp_profile = []
    const spec = computeSpecs(c)
    const prop = (20000 * 50) / (250 * G0)
    expect(spec.stages[0].propellant).toBeCloseTo(prop, 6)
    expect(spec.dvTotal).toBeCloseTo(250 * G0 * Math.log(1000 / (1000 - prop)), 6)
    expect(spec.thrustToWeight).toBeCloseTo(20000 / (1000 * G0), 9)
    expect(spec.warnings).toEqual([])
  })

  it('warns when a stage would burn more than its mass', () => {
    const c = createBlankConfig()
    Object.assign(c.stages[0], { mass_initial_kg: 100, thrust_constant: 1e6 })
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
