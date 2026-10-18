/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vite-plus/test'
import { inlineFileTables, isFileTable, parseCsv, parseSurface, type Config } from './config'
import { validateConfig } from './validation'

const base: Config = {
  name: 't',
  simulation: { end_time_s: 10 },
  launch: { latitude_deg: 0, longitude_deg: 0 },
  stages: [{ mass_initial_kg: 100 }],
}

describe('parseCsv', () => {
  it('skips headers and keeps leading numeric fields (as parse_csv)', () => {
    const text = 'time[s],thrust[N],isp[s]\r\n0,100,200\n10, 200 ,300,extra\n# note\n\n5,abc\n'
    expect(parseCsv(text, 2)).toEqual([
      [0, 100, 200],
      [10, 200, 300],
    ])
    expect(parseCsv(text, 1)).toEqual([[0, 100, 200], [10, 200, 300], [5]])
    expect(parseCsv('1e3,-.5,+2\n', 3)).toEqual([[1000, -0.5, 2]])
    expect(parseCsv(',1\n', 1)).toEqual([])
  })
})

describe('parseSurface', () => {
  it('sorts Mach rows and pads short rows (as parse_surface)', () => {
    expect(parseSurface('0,0,10\n1.0,0,3\n0.5,0,1\n')).toEqual({
      mach: [0.5, 1],
      alpha_deg: [0, 10],
      values: [
        [0, 1],
        [0, 3],
      ],
    })
    expect(parseSurface(',0,5,10\nmach,a,b,c\n0,1\n1,2,3\n').values).toEqual([
      [1, 1, 1],
      [2, 3, 3],
    ])
    expect(() => parseSurface('-,0,10\n0,1,2\n')).toThrow(/2 Mach rows/)
  })
})

describe('inlineFileTables', () => {
  const files = new Map([
    ['t.csv', 'time,thrust,isp\n0,100,200\n10,200,300\n'],
    ['wind.csv', 'alt,speed,dir\n0,1,90\n1000,5,270\n'],
    ['cn.csv', ',0,10\n0,0,1\n1,0,2\n'],
  ])

  it('fills every kind of table and leaves the input unchanged', () => {
    const config: Config = {
      ...base,
      attitude: { elevation_deg: { file: 'dir/t.csv', columns: [0, 2] } },
      wind: { profile: { file: 'wind.csv' } },
      atmosphere: { density_deviation: { file: 't.csv' } },
      stages: [
        {
          mass_initial_kg: 100,
          engine: { thrust_vac_n: { file: 't.csv' }, isp_vac_s: { file: 't.csv', columns: [0, 2] }, burn_end_s: 10 },
          aero: { ca: { file: 't.csv' }, cn_table: { file: 'cn.csv' } },
          thrust_trim: { cg_sta_m: { file: 't.csv' }, gimbal_sta_m: 1, cp_sta_m: { file: 'cn.csv' } },
        },
      ],
    }
    const r = inlineFileTables(config, files)
    expect(r.missing).toEqual([])
    expect(r.errors).toEqual([])
    expect(r.inlined).toBe(9)
    expect(r.config.attitude?.elevation_deg).toEqual([
      [0, 200],
      [10, 300],
    ])
    expect(r.config.wind?.profile).toEqual([
      [0, 1, 90],
      [1000, 5, 270],
    ])
    const s = r.config.stages[0]
    expect(s.engine?.thrust_vac_n).toEqual([
      [0, 100],
      [10, 200],
    ])
    expect(s.aero?.cn_table).toEqual({
      mach: [0, 1],
      alpha_deg: [0, 10],
      values: [
        [0, 1],
        [0, 2],
      ],
    })
    expect(s.thrust_trim?.cp_sta_m).toEqual(s.aero?.cn_table)
    expect(s.thrust_trim?.gimbal_sta_m).toBe(1)
    expect(isFileTable(config.stages[0].engine?.thrust_vac_n)).toBe(true)
  })

  it('reports missing and unreadable files and keeps those tables', () => {
    const config: Config = {
      ...base,
      attitude: { azimuth_deg: { file: 'gone.csv' }, roll_deg: { file: 't.csv', columns: [0] } },
      stages: [{ mass_initial_kg: 1, aero: { ca: { file: 'gone.csv' }, cn_alpha_per_rad: { file: 't.csv', columns: [0, 7] } } }],
    }
    const r = inlineFileTables(config, files)
    expect(r.missing).toEqual(['gone.csv'])
    expect(r.errors).toEqual(['t.csv: give 2 columns, not 1', 't.csv: no numeric rows with 8 columns'])
    expect(r.inlined).toBe(0)
    expect(r.config.attitude?.azimuth_deg).toEqual({ file: 'gone.csv' })
  })

  it('makes the SS-520-4 example valid in the browser', () => {
    const dir = fileURLToPath(new URL('../../../examples/SS-520-4/', import.meta.url))
    const config = JSON.parse(readFileSync(dir + 'ss520_4.json', 'utf8')) as Config
    const csv = new Map(
      readdirSync(dir)
        .filter((f) => f.endsWith('.csv'))
        .map((f) => [f, readFileSync(dir + f, 'utf8')]),
    )
    expect(validateConfig(config).length).toBeGreaterThan(0)
    const r = inlineFileTables(config, csv)
    expect(r.missing).toEqual([])
    expect(r.errors).toEqual([])
    expect(validateConfig(r.config)).toEqual([])
  })
})
