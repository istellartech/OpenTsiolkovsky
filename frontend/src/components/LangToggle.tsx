import { setLang, useLang } from '../lib/i18n'

/** Switches the UI between Japanese and English. */
export function LangToggle() {
  const lang = useLang()
  const next = lang === 'ja' ? 'en' : 'ja'
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      title={lang === 'ja' ? 'Switch to English' : '日本語に切り替え'}
      aria-label={lang === 'ja' ? 'Switch to English' : '日本語に切り替え'}
      className="flex h-8 shrink-0 items-center rounded-[6px] px-1.5 text-[12px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
    >
      {lang === 'ja' ? 'EN' : '日本語'}
    </button>
  )
}
