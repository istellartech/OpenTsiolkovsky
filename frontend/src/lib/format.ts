// Number formatting shared by the UI.
import { locale } from './i18n'

/** Fixed number of decimals with digit grouping; "—" for non-finite values. */
export const fmt = (v: number, d = 1) =>
  Number.isFinite(v) ? v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'

/** Up to `d` decimals, trailing zeros dropped. */
export const fmtMax = (v: number, d: number) => v.toLocaleString(locale(), { maximumFractionDigits: d })

export const fmtMass = (kg: number) => (kg >= 10000 ? `${fmtMax(kg / 1000, 1)} t` : `${fmtMax(Math.round(kg), 0)} kg`)

export const fmtForce = (n: number) => (n >= 1e6 ? `${fmtMax(n / 1e6, 2)} MN` : `${fmtMax(n / 1000, 1)} kN`)
