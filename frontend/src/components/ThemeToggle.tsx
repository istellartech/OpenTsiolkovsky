import { Monitor, Moon, Sun } from 'lucide-react'
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme'
import { IconButton } from './primitives'
import { tr } from '../lib/i18n'

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const label = (p: ThemePref) =>
  ({ system: tr('OSの設定に合わせる', 'Match OS'), light: tr('ライト', 'Light'), dark: tr('ダーク', 'Dark') })[p]
const ICON = { system: Monitor, light: Sun, dark: Moon }

/** Cycles OS → light → dark. */
export function ThemeToggle() {
  const pref = useThemePref()
  const Icon = ICON[pref]
  return (
    <IconButton
      label={tr(`配色: ${label(pref)}（クリックで「${label(NEXT[pref])}」）`, `Theme: ${label(pref)} (click for ${label(NEXT[pref])})`)}
      onClick={() => setThemePref(NEXT[pref])}
    >
      <Icon className="h-4 w-4" />
    </IconButton>
  )
}
