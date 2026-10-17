// Colour theme: follow the OS, or force light/dark. The choice is stored per
// browser and applied as <html data-theme="..."> (see index.css and the
// pre-paint script in index.html).
import { useSyncExternalStore } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'ot.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref: ThemePref = readPref()

const resolve = (p: ThemePref): Theme => (p === 'system' ? (media().matches ? 'dark' : 'light') : p)

function apply() {
  const root = document.documentElement
  if (pref === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', pref)
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim())
  listeners.forEach((l) => l())
}

media().addEventListener('change', () => pref === 'system' && apply())

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch {
    /* storage may be unavailable */
  }
  apply()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useThemePref = () => useSyncExternalStore(subscribe, () => pref)

/** The theme in effect ('system' resolved against the OS setting). */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, () => resolve(pref))

/** Read a CSS custom property from the root element, e.g. cssVar('--ink'). */
export const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

// Keep the browser chrome colour in step with the theme from the start.
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cssVar('--bg') || '#f2f1ed')

const stageSlot = (stage: number) => ((Math.max(stage, 1) - 1) % 5) + 1

/** CSS colour of a stage, for styles. */
export const stageColorVar = (stage: number) => `var(--stage-${stageSlot(stage)})`

/** Resolved stage colour for canvas/WebGL drawing. */
export const readStageColor = (stage: number) => cssVar(`--stage-${stageSlot(stage)}`) || '#e2491b'
