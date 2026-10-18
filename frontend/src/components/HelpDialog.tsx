import type { ReactNode } from 'react'
import { useEffect } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { tr } from '../lib/i18n'

const mod = typeof navigator !== 'undefined' && navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl'
const repo = 'https://github.com/istellartech/OpenTsiolkovsky'
const doc = (name: string) => `${repo}/blob/master/docs/${name}`

const shortcuts = (): { title: string; items: [keys: string[], what: string][] }[] => [
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-[12px] font-semibold text-ink">{title}</h3>
      <div className="space-y-1.5 text-[12px] leading-relaxed text-ink-2">{children}</div>
    </section>
  )
}

function Links({ items }: { items: [label: string, href: string][] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1">
      {items.map(([label, href]) => (
        <li key={href}>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 text-ink underline-offset-2 hover:underline"
          >
            {label}
            <ArrowUpRight className="h-3 w-3 text-ink-3" />
          </a>
        </li>
      ))}
    </ul>
  )
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="num rounded-[4px] bg-surface-2 px-1 py-0.5 text-[11px] text-ink">{children}</code>
)

export function HelpDialog({ onClose, showShortcuts }: { onClose: () => void; showShortcuts: boolean }) {
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
        aria-label={tr('ヘルプ', 'Help')}
        onClick={(e) => e.stopPropagation()}
        className="scroll-quiet max-h-full w-[min(32rem,100%)] overflow-y-auto rounded-[10px] border border-line bg-surface p-4 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)]"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">{tr('ヘルプ', 'Help')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('閉じる (Esc)', 'Close (Esc)')}
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-2 hover:bg-surface-2"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Section title={tr('このアプリについて', 'About')}>
          <p>
            {tr(
              '多段ロケットの打ち上げから落下までを計算するオープンソースの飛行シミュレータです。計算はすべてブラウザ内（WebAssembly）で行い、入力を変えるとすぐに再計算します。設定はサーバーに送られません。',
              'An open-source flight simulator for multi-stage rockets, from launch to impact. Everything runs in your browser (WebAssembly) and is recomputed as you edit; your settings are never sent to a server.',
            )}
          </p>
          <p>
            {tr(
              'パラメータを編集し、地球儀とグラフで結果を確かめます。分散解析では落下点のばらつきを出せます。ファイルメニューから設定の保存や共有リンクの作成ができます。',
              'Edit the parameters and check the result on the globe and charts. Monte Carlo gives the dispersion of impact points. The file menu saves settings and makes share links.',
            )}
          </p>
        </Section>

        <Section title={tr('理論・物理モデル', 'Theory and physics')}>
          <p>
            {tr(
              '質点の 3 自由度（3DoF）運動を地球中心慣性系で解きます。重力は WGS84 の J2 項まで、大気は標準大気、空力は CA・CN テーブル、姿勢は指定したプログラムに従います（姿勢の運動は解きません）。',
              'Point-mass three-degree-of-freedom (3DoF) motion in an Earth-centred inertial frame: WGS84 gravity up to J2, a standard atmosphere, CA/CN aerodynamic tables and a prescribed attitude program (attitude dynamics are not solved).',
            )}
          </p>
          <Links
            items={[
              [tr('物理モデルと数値計算', 'Physics models and numerics'), doc('physics.md')],
              [tr('設定ファイルの項目', 'Parameter reference'), doc('configuration.md')],
              [tr('技術資料 (PDF)', 'Technical document (PDF)'), doc('OpenTsiolkovsky_techdoc.pdf')],
            ]}
          />
        </Section>

        <Section title={tr('AI 連携', 'Using with AI')}>
          <p>
            {tr(
              'Claude Code などの AI エージェントから、CLI（JSON 出力）や MCP サーバーで同じ計算を実行できます。AI が作った設定は共有リンクにして、このアプリの地球儀とグラフで確かめられます。',
              'AI agents such as Claude Code can run the same simulation through the CLI (JSON output) or the MCP server. Settings an AI writes can be turned into a share link and checked on this app’s globe and charts.',
            )}
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>
              <Code>openTsiolkovsky-cli run --json</Code> / <Code>validate --json</Code> / <Code>share</Code>
            </li>
            <li>
              {tr('MCP サーバー:', 'MCP server:')} <Code>openTsiolkovsky-cli mcp</Code>
            </li>
          </ul>
          <Links
            items={[
              [tr('AI エージェントからの利用', 'Using from AI agents'), doc('ai.md')],
              [tr('ソースコード (GitHub)', 'Source code (GitHub)'), repo],
            ]}
          />
        </Section>

        {showShortcuts && (
          <Section title={tr('キーボードショートカット', 'Keyboard shortcuts')}>
            {shortcuts().map((g) => (
              <div key={g.title} className="pt-1">
                <h4 className="mb-0.5 text-[11px] font-semibold text-ink-3">{g.title}</h4>
                <dl>
                  {g.items.map(([keys, what]) => (
                    <div key={what} className="flex items-center justify-between gap-3 border-t border-line py-1.5">
                      <dt>{what}</dt>
                      <dd className="flex shrink-0 gap-1">
                        {keys.map((k) => (
                          <kbd
                            key={k}
                            className="num rounded-[4px] border border-line-strong bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink"
                          >
                            {k}
                          </kbd>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </Section>
        )}
      </div>
    </div>
  )
}
