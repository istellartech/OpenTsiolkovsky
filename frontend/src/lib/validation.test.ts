import { describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS, createBlankConfig } from '../config/presets'
import { isConfig, isValidDateTime } from './config'
import { validateConfig } from './validation'

describe('validateConfig', () => {
  it.each(PRESET_OPTIONS.map((p) => [p.id, p] as const))('accepts preset %s', (_id, preset) => {
    const config = preset.create()
    expect(isConfig(config)).toBe(true)
    expect(validateConfig(config)).toEqual([])
  })

  it('has a preset for every vehicle in examples/', () => {
    const files = Object.keys(import.meta.glob('../../../examples/*.json'))
      .map((f) => f.replace(/^.*\//, '').replace(/\.json$/, ''))
      .filter((id) => id !== 'dispersion')
    expect(files.sort()).toEqual(PRESET_OPTIONS.map((p) => p.id).sort())
  })

  it('accepts the blank config', () => {
    expect(validateConfig(createBlankConfig())).toEqual([])
  })

  it('reports fields with the solver’s JSON paths', () => {
    const c = createBlankConfig()
    c.simulation.end_time_s = -1
    c.launch.latitude_deg = 120
    const s = c.stages[0]
    c.stages = [
      { ...s, separation_time_s: 10 },
      { ...s, engine: { ...s.engine!, burn_end_s: s.engine!.burn_start_s ?? 0 } },
    ]
    c.wind = {
      profile: [
        [1000, 5, 0],
        [500, 5, 0],
      ],
    }
    const fields = validateConfig(c).map((i) => i.field)
    expect(fields).toContain('simulation.end_time_s')
    expect(fields).toContain('launch.latitude_deg')
    expect(fields).toContain('stages[1].engine.burn_end_s')
    expect(fields).toContain('wind.profile')
  })

  it('needs a separation time on every stage but the last', () => {
    const c = createBlankConfig()
    c.stages = [c.stages[0], c.stages[0]]
    expect(validateConfig(c).map((i) => i.field)).toEqual(['stages[0].separation_time_s'])
  })

  it('rejects an impossible launch date', () => {
    const c = createBlankConfig()
    c.launch.time_utc = '2025-02-30T00:00:00Z'
    expect(validateConfig(c).map((i) => i.field)).toContain('launch.time_utc')
  })

  it('flags file tables, which the browser cannot read', () => {
    const c = createBlankConfig()
    c.stages[0].engine!.thrust_vac_n = { file: 'thrust.csv' }
    expect(validateConfig(c).map((i) => i.field)).toEqual(['stages[0].engine.thrust_vac_n'])
  })
})

describe('isValidDateTime', () => {
  it('accepts what the solver parses', () => {
    for (const t of ['2024-07-01T01:00:00Z', '2024-07-01 01:00', '2024-02-29T23:59:59.5+09:00', '2024-07-01'])
      expect(isValidDateTime(t), t).toBe(true)
    for (const t of ['2023-02-29T00:00:00Z', '2024-13-01T00:00:00Z', '2024-01-01T24:00:00Z', 'x']) expect(isValidDateTime(t), t).toBe(false)
  })
})

describe('isConfig', () => {
  it('rejects non-config JSON', () => {
    expect(isConfig(null)).toBe(false)
    expect(isConfig({ 'name(str)': 'cli file' })).toBe(false)
    const { launch: _launch, ...noLaunch } = createBlankConfig()
    expect(isConfig(noLaunch)).toBe(false)
  })
})
