// Filtering for the vehicle picker: category, country and a free-text query.
import type { PresetCategory, PresetCountry, PresetOption } from '../config/presets'

export interface PresetFilter {
  query: string
  category: PresetCategory | 'all'
  country: PresetCountry | null
}

/**
 * Fold width, case, kana and punctuation so "ｓｓ５２０", "SS-520" and
 * "ss 520" meet: NFKC, lower case, katakana → hiragana, then drop everything
 * but letters and digits.
 */
export function normalizeSearch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[^\p{L}\p{N}]/gu, '')
}

const haystack = (p: PresetOption, countryLabel: string) =>
  [p.label, p.id, p.kind, p.site, countryLabel, ...(p.aliases ?? [])].map(normalizeSearch).join('\u0000')

/** Presets matching every whitespace-separated term of the query. */
export function filterPresets(
  presets: PresetOption[],
  f: PresetFilter,
  countryLabel: (c: PresetCountry) => string = () => '',
): PresetOption[] {
  const terms = f.query.split(/\s+/).map(normalizeSearch).filter(Boolean)
  return presets.filter((p) => {
    if (f.category !== 'all' && p.category !== f.category) return false
    if (f.country && p.country !== f.country) return false
    if (terms.length === 0) return true
    const h = haystack(p, countryLabel(p.country))
    return terms.every((t) => h.includes(t))
  })
}
