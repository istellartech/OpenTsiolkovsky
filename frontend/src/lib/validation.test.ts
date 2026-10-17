import { describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS, createBlankConfig } from '../config/presets'
import { isValidClientConfig, validateConfig } from './validation'

describe('validateConfig', () => {
  it.each(PRESET_OPTIONS.map((p) => [p.id, p] as const))('accepts preset %s', (_id, preset) => {
    const config = preset.create()
    expect(isValidClientConfig(config)).toBe(true)
    expect(validateConfig(config)).toEqual([])
  })

  it('accepts the blank config', () => {
    expect(validateConfig(createBlankConfig())).toEqual([])
  })

  it('reports fields with their paths', () => {
    const c = createBlankConfig()
    c.simulation.duration_s = -1
    c.launch.latitude_deg = 120
    c.stages.push({ ...c.stages[0], burn_end_s: c.stages[0].burn_start_s })
    c.wind.profile = [
      { altitude_m: 1000, speed_mps: 5, direction_deg: 0 },
      { altitude_m: 500, speed_mps: 5, direction_deg: 0 },
    ]
    const fields = validateConfig(c).map((i) => i.field)
    expect(fields).toContain('simulation.duration_s')
    expect(fields).toContain('launch.latitude_deg')
    expect(fields).toContain('stage[2].burn_end_s')
    expect(fields).toContain('wind.profile')
  })

  it('rejects an impossible launch date', () => {
    const c = createBlankConfig()
    c.launch.datetime_utc = { ...c.launch.datetime_utc, month: 2, day: 30 }
    expect(validateConfig(c).map((i) => i.field)).toContain('launch.datetime_utc')
  })
})

describe('isValidClientConfig', () => {
  it('rejects non-config JSON', () => {
    expect(isValidClientConfig(null)).toBe(false)
    expect(isValidClientConfig({ 'name(str)': 'cli file' })).toBe(false)
    const { launch: _launch, ...noLaunch } = createBlankConfig()
    expect(isValidClientConfig(noLaunch)).toBe(false)
  })
})
