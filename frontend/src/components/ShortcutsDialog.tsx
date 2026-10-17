import { useEffect } from 'react'
import { X } from 'lucide-react'
import { tr } from '../lib/i18n'

const mod = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'

const groups = (): { title: string; items: [keys: string[], what: string][] }[] => [
  {
    title: tr('再生', 'Playback'),
    items: [
      [['Space'], tr('再生 / 一時停止', 'Play / pause')],
      [['←', '→'], tr('1 秒戻る / 進む', 'Back / forward 1 s')],
      [['Shift', '←/→'], tr('10 秒戻る / 進む', 'Back / forward 10 s')],
    ],
  },
  {
    title: tr('編集', 'Editing'),
    items: [
      [[mod, 'Z'], tr('元に戻す', 'Undo')],
      [[mod, 'Shift', 'Z'], tr('やり直す', 'Redo')],
    ],
  },
  {
    title: tr('グラフ（拡大表示中）', 'Charts (enlarged)'),
    items: [
      [['[', ']'], tr('前 / 次のグラフ', 'Previous / next chart')],
      [[tr('ドラッグ', 'Drag')], tr('範囲を拡大', 'Zoom to range')],
      [[tr('ダブルクリック', 'Double-click')], tr('全体に戻す', 'Reset zoom')],
      [['Esc'], tr('閉じる', 'Close')],
    ],
  },
  {
    title: tr('その他', 'Other'),
    items: [
      [['?'], tr('このヘルプ', 'This help')],
      [[tr('ファイルをドロップ', 'Drop a file')], tr('設定を開く', 'Open settings')],
    ],
  },
]

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-3" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr('キーボードショートカット', 'Keyboard shortcuts')}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(30rem,100%)] rounded-[10px] border border-line bg-surface p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)]"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">{tr('キーボードショートカット', 'Keyboard shortcuts')}</h2>
          <button type="button" onClick={onClose} aria-label={tr('閉じる (Esc)', 'Close (Esc)')} className="flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-2 hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        {groups().map((g) => (
          <section key={g.title} className="mt-3">
            <h3 className="mb-1 text-[11px] font-semibold text-ink-3">{g.title}</h3>
            <dl>
              {g.items.map(([keys, what]) => (
                <div key={what} className="flex items-center justify-between gap-3 border-t border-line py-1.5 text-[12px]">
                  <dt className="text-ink-2">{what}</dt>
                  <dd className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <kbd key={k} className="num rounded-[4px] border border-line-strong bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink">
                        {k}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}
