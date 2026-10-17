// UI language. Strings are written in place as tr('日本語', 'English') so each
// translation sits next to the code that uses it. The App root subscribes to
// the language, so a switch re-renders the whole tree; values computed once
// at module load must use getters (`get label() { return tr(...) }`).
import { useSyncExternalStore } from 'react'

export type Lang = 'ja' | 'en'

const KEY = 'ot.lang'
const listeners = new Set<() => void>()

function readLang(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'ja' || v === 'en') return v
  } catch {
    /* storage may be unavailable */
  }
  return typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('ja') ? 'en' : 'ja'
}

let lang: Lang = readLang()

export const getLang = () => lang

/** Pick the string for the current language. */
export const tr = (ja: string, en: string) => (lang === 'ja' ? ja : en)

/** BCP 47 locale for number and date formatting. */
export const locale = () => (lang === 'ja' ? 'ja-JP' : 'en-US')

export function setLang(next: Lang) {
  lang = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    /* storage may be unavailable */
  }
  document.documentElement.lang = next
  listeners.forEach((l) => l())
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useLang = () => useSyncExternalStore(subscribe, getLang)

if (typeof document !== 'undefined') document.documentElement.lang = lang
