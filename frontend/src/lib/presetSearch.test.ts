import { describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS } from '../config/presets'
import { filterPresets, normalizeSearch } from './presetSearch'

const ids = (f: Parameters<typeof filterPresets>[1]) => filterPresets(PRESET_OPTIONS, f).map((p) => p.id)

describe('normalizeSearch', () => {
  it('folds width, case, punctuation and kana', () => {
    expect(normalizeSearch('ＳＳ－５２０')).toBe('ss520')
    expect(normalizeSearch('H-IIA 202')).toBe('hiia202')
    expect(normalizeSearch('イプシロン')).toBe(normalizeSearch('いぷしろん'))
  })
})

describe('filterPresets', () => {
  it('returns everything without a filter', () => {
    expect(ids({ query: '', category: 'all', country: null })).toHaveLength(PRESET_OPTIONS.length)
  })

  it('filters by category and country', () => {
    expect(ids({ query: '', category: 'sounding', country: null })).toEqual(
      PRESET_OPTIONS.filter((p) => p.category === 'sounding').map((p) => p.id),
    )
    for (const id of ids({ query: '', category: 'all', country: 'jp' })) {
      expect(PRESET_OPTIONS.find((p) => p.id === id)!.country).toBe('jp')
    }
  })

  it('matches labels, aliases and every term', () => {
    expect(ids({ query: 'h2a', category: 'all', country: null })).toEqual(['h2a202'])
    expect(ids({ query: 'ss 520', category: 'all', country: null })).toEqual(['ss520-5'])
    expect(ids({ query: 'apollo', category: 'all', country: null })).toEqual(['saturn-v'])
    expect(ids({ query: 'h2a epsilon', category: 'all', country: null })).toEqual([])
    expect(ids({ query: 'h3', category: 'sounding', country: null })).toEqual([])
  })
})
