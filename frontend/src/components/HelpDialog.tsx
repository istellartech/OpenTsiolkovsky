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

        <Section title={tr('まずはテンプレートを選ぶ', 'Start with a template')}>
          <p>
            {tr(
              '画面上部の機体名を押し、使いたいロケットを選びます。「概要」には機体の説明と、推定値・仮定など確認が必要な情報を表示します。選んだあとは「機体」「空力」「姿勢・風」などのタブで数値を編集できます。',
              'Click the vehicle name at the top and choose a rocket. Overview explains the model and lists estimates and assumptions that need checking. Edit its values in the Vehicle, Aerodynamics and Attitude & Wind tabs.',
            )}
          </p>
        </Section>

        <Section title={tr('軌道計算：設定した機体の飛び方を見る', 'Simulation: see how your vehicle flies')}>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              {tr(
                '「軌道計算」を選び、質量・推力・姿勢などを設定します。値を変えると自動で再計算します。',
                'Select Simulation and set mass, thrust, attitude and other values. Edits automatically trigger a new simulation.',
              )}
            </li>
            <li>
              {tr(
                '「3D」で飛行経路を、「グラフ」で高度・速度・動圧などを確認します。',
                'Use 3D to inspect the flight path, and Charts to check altitude, speed and dynamic pressure.',
              )}
            </li>
            <li>
              {tr(
                '再生バーを動かすと、計算済みの飛行を好きな時刻で表示できます。分離した段や投棄物の落下点も確認できます。',
                'Use the playback bar to inspect the computed flight at any time, including the impact points of released stages and parts.',
              )}
            </li>
          </ol>
          <p>
            {tr(
              '落下点のばらつきを調べるには「分散解析」を使います。風や推力などを変えた複数の飛行を計算します。',
              'Use Dispersion to study the spread of impact points by simulating multiple flights with variations such as wind and thrust.',
            )}
          </p>
        </Section>

        <Section title={tr('軌道最適化：目標に届く飛ばし方を探す', 'Optimization: find a flight to your target')}>
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              {tr(
                '軌道計算の「概要」で「この機体で最適化」を押します。目標や制約の初期設定が機体に合わせて作られます。',
                'In the simulation Overview, click Optimize this vehicle. Initial targets and limits are adapted to the vehicle.',
              )}
            </li>
            <li>
              {tr(
                '目標の高度・軌道と、動圧・加速度などの上限を確認します。追加で運ぶ荷物（追加ペイロード）や衛星の質量が最大になるよう、姿勢や一部の区間の長さを探します。',
                'Review the target altitude or orbit and limits such as dynamic pressure and acceleration. The optimizer varies attitude and some phase durations to maximize extra payload or satellite mass.',
              )}
            </li>
            <li>
              {tr(
                '「最適化を実行」を押して計算を始めます。最適化では、値を編集しただけでは計算を始めません。',
                'Click Run optimization to start. Editing values alone does not start a solve.',
              )}
            </li>
            <li>
              {tr(
                '結果で「収束」と「独立検証」の両方を確認します。「軌道計算で開く」で、求めた飛ばし方を軌道計算へ戻せます。',
                'Check both convergence and independent validation in the result. Open in simulation transfers the optimized flight back to the simulator.',
              )}
            </li>
          </ol>
          <p>
            {tr(
              '「収束」は最適化の終了条件を満たしたこと、「独立検証」は求めた飛行を計算し直して目標や上限を満たしたことです。どちらも実機データの正しさを確認したという意味ではありません。',
              'Convergence means the solver met its stopping criteria. Independent validation recomputes the flight and checks its targets and limits. Neither verifies the accuracy of the real vehicle data.',
            )}
          </p>
        </Section>

        <Section title={tr('テンプレートの「要確認」とは', 'What “data needs checking” means')}>
          <p>
            {tr(
              'テンプレートは、公表値だけでなく、公開情報が足りない箇所を補う推定値や計算用の仮定も使っています。機体選択の詳細と「概要」で、どの項目が該当するか確認できます。',
              'Templates combine published data with estimates and assumptions where information is missing. Vehicle details and Overview list the affected items.',
            )}
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>
              {tr(
                '推定・仮定：非公表の値や、飛行実績に合うよう調整した値。',
                'Estimated / assumed: unpublished values or parameters tuned to match a flight record.',
              )}
            </li>
            <li>
              {tr(
                '二次資料：メーカーや打上げ機関の一次資料で確認できていない値。',
                'Secondary source: values not confirmed against primary records from the manufacturer or launch organization.',
              )}
            </li>
            <li>
              {tr(
                '別機体・別号機の値：対象のロケットにも使えるか確認が必要な転用値。',
                'Other vehicle / flight: borrowed values whose applicability needs checking.',
              )}
            </li>
            <li>
              {tr(
                'モデルの簡略化：平均推力を使う、投棄を段分離にまとめるなど、実際の飛行を簡単にした扱い。',
                'Model simplification: approximations such as average thrust or combining jettisons with stage separation.',
              )}
            </li>
          </ul>
          <p>
            {tr(
              '詳しい根拠と出典リンクは「概要」の「数値の根拠」にあります。',
              'Detailed modelling notes and source links are under Sources in Overview.',
            )}
          </p>
        </Section>

        <Section title={tr('保存・読み込み・共有', 'Save, open and share')}>
          <p>
            {tr(
              'ファイルメニューの「ケースを保存」で、設定と変換履歴を保存できます。通常の設定JSONには履歴や衛星・PAFの質量内訳を含みません。保存したファイルはメニューから開くか、画面にドロップして読み込めます。',
              'Save case in the file menu preserves settings and conversion history. A plain configuration JSON omits history and the payload/adapter mass breakdown. Open saved files from the menu or drop them into the app.',
            )}
          </p>
          <p>
            {tr(
              '共有リンクでは設定をURLに含めて渡せます。計算はブラウザ内で行います。',
              'Share links carry the settings in the URL. Calculations run in your browser.',
            )}
          </p>
        </Section>

        <Section title={tr('計算で扱う範囲', 'What the model calculates')}>
          <p>
            {tr(
              'ロケットの位置・速度・質量を計算します。地球の重力・自転、大気、推力、空気による力を扱います。機体の向きは設定した姿勢に従い、機体が回転する運動や姿勢制御装置の応答は計算しません。',
              'The model computes position, velocity and mass using Earth’s gravity and rotation, atmosphere, thrust and aerodynamic forces. Orientation follows the prescribed attitude; vehicle rotation and attitude-control response are not simulated.',
            )}
          </p>
          <Links
            items={[
              [tr('物理モデルの詳しい説明', 'Physics model details'), doc('physics.md')],
              [tr('設定ファイルの項目', 'Configuration reference'), doc('configuration.md')],
              [tr('軌道最適化の詳しい使い方', 'Optimization guide'), doc('optimization.md')],
            ]}
          />
        </Section>

        <Section title={tr('CLI・AI エージェントから使う', 'Use from the CLI or an AI agent')}>
          <p>
            {tr(
              'コマンドライン（CLI）や、AI ツールから呼び出すためのMCPサーバーでも同じ計算を使えます。AIが作った設定は共有リンクにすると、この画面で開いて確認できます。',
              'AI agents such as Claude Code can run the same simulation through the CLI (JSON output) or the MCP server. A configuration an AI writes can be turned into a share link and opened in this app.',
            )}
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            <li>
              <Code>openTsiolkovsky-cli run CONFIG --json</Code> / <Code>validate --json</Code> / <Code>share</Code>
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
