import { Monitor, Moon, Sun } from 'lucide-react'
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme'
import { IconButton } from './primitives'

const NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' }
const LABEL: Record<ThemePref, string> = { system: 'OSの設定に合わせる', light: 'ライト', dark: 'ダーク' }
const ICON = { system: Monitor, light: Sun, dark: Moon }

/** Cycles OS → light → dark. */
export function ThemeToggle() {
  const pref = useThemePref()
  const Icon = ICON[pref]
  return (
    <IconButton label={`配色: ${LABEL[pref]}（クリックで「${LABEL[NEXT[pref]]}」）`} onClick={() => setThemePref(NEXT[pref])}>
      <Icon className="h-4 w-4" />
    </IconButton>
  )
}
