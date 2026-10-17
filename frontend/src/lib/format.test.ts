import { describe, expect, it } from 'vite-plus/test'
import { fmtInput, unitHint } from './format'

describe('fmtInput', () => {
  it('rounds long fractions to about six significant digits', () => {
    expect(fmtInput(234282.4921024479)).toBe('234,282')
    expect(fmtInput(336.759847898553)).toBe('336.76')
    expect(fmtInput(0.0012345678)).toBe('0.001235')
  })

  it('never rounds integer digits', () => {
    expect(fmtInput(6157499)).toBe('6,157,499')
    expect(fmtInput(-1234567.8)).toBe('-1,234,568')
  })

  it('keeps short values as typed', () => {
    expect(fmtInput(0)).toBe('0')
    expect(fmtInput(1.5)).toBe('1.5')
    expect(fmtInput(-5.97)).toBe('-5.97')
    expect(fmtInput(NaN)).toBe('')
  })
})

describe('unitHint', () => {
  it('scales large base-unit values', () => {
    expect(unitHint(6157499, 'N')).toMatch(/6\.16 MN/)
    expect(unitHint(137000, 'N')).toMatch(/137 kN/)
    expect(unitHint(234282, 'kg')).toMatch(/234\.28 t/)
  })

  it('leaves small values and other units alone', () => {
    expect(unitHint(5000, 'kg')).toBeNull()
    expect(unitHint(1e6, 's')).toBeNull()
    expect(unitHint(1e6, undefined)).toBeNull()
  })
})
