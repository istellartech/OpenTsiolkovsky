import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { fromLegacyParamFile, isLegacyParamFile, parseCsvRows } from './legacy'
import { validateConfig } from './validation'

const examples = join(import.meta.dirname, '../../../examples')
const read = (...p: string[]) => readFileSync(join(examples, ...p), 'utf8')

describe('parseCsvRows', () => {
  it('skips the header and non-numeric rows', () => {
    expect(parseCsvRows('t,v\n0,1\n1, 2 ,extra\nx,3\n\n2', 2)).toEqual([
      [0, 1],
      [1, 2],
    ])
  })
})

describe('fromLegacyParamFile', () => {
  it.each(['param_sample_01.json', 'param_momo.json'])('imports %s into a valid config', (file) => {
    const json = JSON.parse(read(file)) as unknown
    expect(isLegacyParamFile(json)).toBe(true)
    if (!isLegacyParamFile(json)) return
    const { config } = fromLegacyParamFile(json, new Map())
    expect(validateConfig(config)).toEqual([])
  })

  it('reads the CSV tables SS-520-4 references', () => {
    const dir = 'SS-520-4'
    const csv = new Map(
      readdirSync(join(examples, dir))
        .filter((f) => f.endsWith('.csv'))
        .map((f) => [f, read(dir, f)]),
    )
    const json = JSON.parse(read(dir, 'param_SS520-4.json')) as Record<string, unknown>
    const all = fromLegacyParamFile(json, csv)
    expect(all.missing).toEqual([])
    expect(all.config.stages).toHaveLength(3)
    expect(all.config.stages[0].thrust_profile?.length).toBeGreaterThan(3)
    expect(validateConfig(all.config)).toEqual([])

    const none = fromLegacyParamFile(json, new Map())
    expect(none.missing).toContain('SS520-4-1_thrust.csv')
  })
})
