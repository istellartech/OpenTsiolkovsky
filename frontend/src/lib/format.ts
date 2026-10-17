// Number formatting shared by the UI.
import { locale } from './i18n'

/** Fixed number of decimals with digit grouping; "—" for non-finite values. */
export const fmt = (v: number, d = 1) =>
  Number.isFinite(v) ? v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'

/** Up to `d` decimals, trailing zeros dropped. */
export const fmtMax = (v: number, d: number) => v.toLocaleString(locale(), { maximumFractionDigits: d })

export const fmtMass = (kg: number) => (kg >= 10000 ? `${fmtMax(kg / 1000, 1)} t` : `${fmtMax(Math.round(kg), 0)} kg`)

export const fmtForce = (n: number) => (n >= 1e6 ? `${fmtMax(n / 1e6, 2)} MN` : `${fmtMax(n / 1000, 1)} kN`)

/**
 * A stored input value shown compactly while the field is not being edited:
 * digit grouping, about six significant digits, integer digits never rounded.
 */
export function fmtInput(v: number): string {
  if (!Number.isFinite(v)) return ''
  const a = Math.abs(v)
  if (a === 0) return '0'
  if (a < 1e-4 || a >= 1e15) return String(v)
  const intDigits = a >= 1 ? Math.floor(Math.log10(a)) + 1 : 0
  const decimals = a >= 1 ? Math.max(0, 6 - intDigits) : Math.min(-Math.floor(Math.log10(a)) + 3, 10)
  return v.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

/** "≈ 6.16 MN" style hint for large SI values typed in base units; null when the value already reads well. */
export function unitHint(v: number, unit: string | undefined): string | null {
  if (!Number.isFinite(v)) return null
  const a = Math.abs(v)
  if (unit === 'N' && a >= 1e4) return `≈ ${fmtForce(v)}`
  if (unit === 'kg' && a >= 1e4) return `≈ ${fmtMax(v / 1000, 2)} t`
  if (unit === 'Pa' && a >= 1e4) return a >= 1e6 ? `≈ ${fmtMax(v / 1e6, 2)} MPa` : `≈ ${fmtMax(v / 1000, 1)} kPa`
  return null
}
