import { useCallback, useRef, useState } from 'react'
import { Check, CircleHelp, Settings2 } from 'lucide-react'
import { useDismiss } from '../hooks/useDismiss'
import { setLang, useLang, type Lang } from '../lib/i18n'
import { setThemePref, useThemePref, type ThemePref } from '../lib/theme'
import { tr } from '../lib/i18n'
import { cn } from '../lib/cn'
import { IconButton } from './primitives'

/** Help, plus the display preferences (language, theme) in one menu. */
export function AppMenu({ onHelp }: { onHelp: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)
  const lang = useLang()
  const theme = useThemePref()
  const langs: [Lang, string][] = [
    ['ja', '日本語'],
    ['en', 'English'],
  ]
  const themes: [ThemePref, string][] = [
    ['system', tr('OSに合わせる', 'Match OS')],
    ['light', tr('ライト', 'Light')],
    ['dark', tr('ダーク', 'Dark')],
  ]
  const item = (selected: boolean, label: string, onSelect: () => void) => (
    <button
      key={label}
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[12px] text-ink hover:bg-surface-2"
    >
      <Check className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-signal' : 'invisible')} />
      {label}
    </button>
  )
  return (
    <div className="flex shrink-0 items-center">
      <IconButton label={tr('ヘルプ (?)', 'Help (?)')} onClick={onHelp}>
        <CircleHelp className="h-4 w-4" />
      </IconButton>
      <div ref={ref} className="relative">
        <IconButton label={tr('表示設定（言語・配色）', 'Display settings (language, theme)')} onClick={() => setOpen((v) => !v)}>
          <Settings2 className="h-4 w-4" />
        </IconButton>
        {open ? (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-48 rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)]"
          >
            <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold text-ink-2">{tr('言語', 'Language')}</p>
            {langs.map(([id, label]) => item(lang === id, label, () => setLang(id)))}
            <div className="my-1 h-px bg-line" />
            <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold text-ink-2">{tr('配色', 'Theme')}</p>
            {themes.map(([id, label]) => item(theme === id, label, () => setThemePref(id)))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
