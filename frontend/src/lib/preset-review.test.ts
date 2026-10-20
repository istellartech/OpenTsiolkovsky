import { describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS } from '../config/presets'
import { getLang, setLang } from './i18n'

describe('preset information that needs checking', () => {
  it('covers every vehicle with specific, localized review points', () => {
    const previous = getLang()
    try {
      for (const preset of PRESET_OPTIONS) {
        setLang('ja')
        const ja = preset.reviewPoints
        expect(ja.length, preset.id).toBeGreaterThan(0)
        expect(new Set(ja.map((p) => p.label)).size).toBe(ja.length)
        expect(
          ja.some((p) => p.basis !== 'simplified'),
          preset.id,
        ).toBe(true)
        for (const point of ja) {
          expect(point.label.trim()).not.toBe('')
          expect(point.detail.trim()).not.toBe('')
        }
        setLang('en')
        const en = preset.reviewPoints
        expect(en.map((p) => p.basis)).toEqual(ja.map((p) => p.basis))
        en.forEach((point, i) => {
          expect(point.label).not.toBe(ja[i].label)
          expect(point.detail).not.toBe(ja[i].detail)
        })
      }
    } finally {
      setLang(previous)
    }
  })
})
