import { describe, expect, it } from 'vite-plus/test'
import { newCase, readCaseContext, readCaseFile, withoutCarriedMass } from './case'
import { PRESET_OPTIONS } from '../config/presets'

describe('case boundaries', () => {
  it('rejects unsupported packages and malformed accounting instead of loading them as raw solver JSON', () => {
    const context = newCase('Case')
    expect(() => readCaseFile({ format: 'opentsiolkovsky-case', version: 2 })).toThrow()
    expect(() => readCaseContext({ ...context, carriedMass: { stage: 0, stageCount: 1, payloadKg: -1, adapterKg: 0 } })).toThrow()
    expect(() => readCaseContext({ ...context, history: [{ notes: 'not an array' }] })).toThrow()
    expect(readCaseFile(PRESET_OPTIONS[0].create())).toBeNull()
  })
  it('refuses inconsistent payload accounting, retaining the original input', () => {
    const config = PRESET_OPTIONS[0].create()
    const original = structuredClone(config)
    const context = newCase(config.name)
    context.carriedMass = { stage: 0, stageCount: 1, payloadKg: config.stages[0].mass_initial_kg * 2, adapterKg: 0 }
    expect(() => withoutCarriedMass(config, context)).toThrow()
    expect(config).toEqual(original)
  })
})
