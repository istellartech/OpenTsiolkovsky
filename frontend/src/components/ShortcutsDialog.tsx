import { useEffect } from 'react'
import { X } from 'lucide-react'

const mod = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'

const GROUPS: { title: string; items: [keys: string[], what: string][] }[] = [
  {
    title: '再生',
    items: [
      [['Space'], '再生 / 一時停止'],
      [['←', '→'], '1 秒戻る / 進む'],
      [['Shift', '←/→'], '10 秒戻る / 進む'],
    ],
  },
  {
    title: '編集',
    items: [
      [[mod, 'Z'], '元に戻す'],
      [[mod, 'Shift', 'Z'], 'やり直す'],
    ],
  },
  {
    title: 'グラフ（拡大表示中）',
    items: [
      [['[', ']'], '前 / 次のグラフ'],
      [['ドラッグ'], '範囲を拡大'],
      [['ダブルクリック'], '全体に戻す'],
      [['Esc'], '閉じる'],
    ],
  },
  {
    title: 'その他',
    items: [
      [['?'], 'このヘルプ'],
      [['ファイルをドロップ'], '設定を開く'],
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
        aria-label="キーボードショートカット"
        onClick={(e) => e.stopPropagation()}
        className="w-[min(30rem,100%)] rounded-[10px] border border-line bg-surface p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)]"
      >
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">キーボードショートカット</h2>
          <button type="button" onClick={onClose} aria-label="閉じる (Esc)" className="flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-2 hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>
        {GROUPS.map((g) => (
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
