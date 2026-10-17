# OpenTsiolkovsky Web フロントエンド

Rust ソルバーを WebAssembly にしてブラウザだけで動く、ロケット軌道シミュレーターの画面です。
入力を変えるとその場で再計算し、3D 地図・グラフ・テレメトリを同じ時間軸で再生します。

## 使い方

| 操作                | 方法                                                                                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 機体を選ぶ          | ヘッダーの機体名 → サンプル機体（観測ロケット / 軌道投入機）または「白紙から作る」                                                                                                                                                  |
| 設定を開く          | ファイル → 設定ファイルを開く、または画面にドロップ。このアプリの `.json` のほか、CLI 用 `param_*.json` を参照 CSV と一緒に開けます                                                                                                 |
| 元に戻す / やり直す | ヘッダーの ↶ ↷、`⌘Z` / `⇧⌘Z`（Windows は `Ctrl+Z` / `Ctrl+Shift+Z`、`Ctrl+Y`）                                                                                                                                                      |
| 共有                | ファイル → 共有リンクをコピー。未編集のサンプルは `#preset=<id>`、編集した設定は URL の `#c=` に圧縮して埋め込みます（サーバーには送られません）                                                                                    |
| 比較                | グラフ欄の「比較用に固定」。いまの結果を点線で残し、サマリーに差分を表示します                                                                                                                                                      |
| 落下物・IIP         | 使用済みの段と投棄物（機体タブで設定）の落下軌道・落下点を地図に、分離時刻・落下点をイベント表に表示。IIP（瞬間落下予測点）の軌跡と現在位置も地図に出ます。地図右上で表示を切り替え                                                 |
| ILL                 | 発射タブで IIP 限界線（IIP が留まるべき範囲の緯度・経度の多角形）を設定すると、地図に線を描き、IIP が最初に外へ出た時刻を「IIPがILLを越境」イベントとして表示。判定は計算結果の IIP に対して行います（ソルバーは ILL を使いません） |
| 分散解析            | 下パネルの「分散解析」。推力・風などのばらつき（1σ）とケース数を決めて計算すると、落下点の散らばりと 3σ 楕円を地図と表に表示。CSV で保存できます                                                                                    |
| 書き出し            | ファイル → 軌道データ（CSV）/ Google Earth 用（KML）、各グラフの PNG 保存                                                                                                                                                           |
| 再生                | `Space` 再生/停止、`←` `→` ±1 秒（`Shift` で ±10 秒）。`?` でショートカット一覧                                                                                                                                                     |
| 表示                | 配色（OS に合わせる / ライト / ダーク）と言語（日本語 / English）はヘッダー右端で切り替え                                                                                                                                           |

## 開発

ツールチェーンは [Vite+](https://viteplus.dev/)（`vp`：Vite 8 / Rolldown・Vitest・Oxlint・Oxfmt）です。設定は `vite.config.ts` にまとまっています。`vp` は `node_modules/.bin` に入るので、グローバルに入れていなければ `bunx vp …` で実行します。

```bash
cd frontend
bun install
bun run dev      # src/wasm が無ければ先に scripts/wasm_build.sh を実行（wasm-pack が必要）
bun run build    # WASM ビルド → vp check → 本番ビルド（dist/）
bunx vp check    # Oxfmt・Oxlint・型チェック（--fix で整形）
bunx vp test run # Vitest（src/wasm があれば全サンプル機体を WASM で計算）
bunx vp build    # WASM を作り直さずに本番ビルド
```

WASM だけ作り直すときは、リポジトリ直下で `bash scripts/wasm_build.sh` を実行します（[docs/wasm.md](../docs/wasm.md)）。

## 構成

```
src/
├── App.tsx              画面レイアウト（パネル配置・モバイル切り替え）
├── components/          表示部品
│   ├── Header / VehiclePicker / FileMenu
│   ├── Inspector.tsx + inspector/   パラメータ入力（タブごとに 1 ファイル）
│   ├── GlobeStage / Globe           3D 地図（CesiumJS、遅延読み込み）
│   ├── BottomPanel / Charts         サマリー・グラフ・イベント表（Chart.js）
│   ├── Playback                     再生バーとテレメトリ
│   └── primitives / TableEditor     入力部品、テーブル編集
├── hooks/
│   ├── useSimulation.ts   設定の状態（Undo 履歴）、検証、デバウンス付き自動計算、ファイル読み込み
│   ├── useMonteCarlo.ts   分散解析の設定（ブラウザに保存）・実行・集計
│   └── …                  ドロップ・ショートカット・共有リンクなど
├── workers/solver.worker.ts   WASM ソルバーを別スレッドで実行
├── workers/montecarlo.worker.ts   分散解析のケースを別スレッドで実行（複数起動して分担）
├── lib/
│   ├── simulation.ts      設定・出力の型と WASM 呼び出し
│   ├── solver.ts          Worker とのやりとり（古い計算は Worker ごと破棄）
│   ├── trajectory.ts      ソルバー出力 → Track（緯度経度・イベント・サマリー・落下物・IIP）。DOM 非依存
│   ├── montecarlo.ts      分散解析の型・Worker の分担・誤差楕円の形状
│   ├── specs.ts           設定だけから求める諸元（Δv・推力重量比・シーケンス）
│   ├── validation.ts      入力チェック
│   ├── legacy.ts          CLI 用 param_*.json + CSV の読み込み
│   ├── history.ts / share.ts / kml.ts / geo.ts / format.ts
│   ├── i18n.ts / theme.ts 言語と配色
│   └── playback.ts        再生時刻の共有ストア
└── config/                サンプル機体（presets.ts）、射場、既定値
```

### データの流れ

```
入力（Inspector） ─ patch → useSimulation（履歴・検証・localStorage 保存）
   └─ 250 ms 後 → solver.ts → solver.worker.ts → WASM（run_with_fall_bodies）→ trackFromOutput → Track
分散解析 → useMonteCarlo → montecarlo.worker.ts ×N → WASM（monte_carlo_case）→ 集計（monte_carlo_statistics）
Track → GlobeStage / Charts / Playback / Summary（playback ストアの時刻で同期）
```

## 実装メモ

- **文言**: 画面の文字列はその場で `tr('日本語', 'English')` と書きます。モジュール読み込み時に作る表（プリセット一覧など）は、言語切り替えに追従するよう getter（`get label() { return tr(...) }`）にします。
- **色**: 色は `src/index.css` の CSS 変数（`--ink`、`--stage-1` など）だけを使います。Canvas / WebGL に渡す色は `lib/theme.ts` の `cssVar()` / `readStageColor()` で読み、テーマ変更時に描き直します。
- **Worker**: `lib/trajectory.ts` と `lib/simulation.ts` は Worker でも動くため、DOM・言語・テーマに依存させないでください。
- **サンプル機体の追加**: `config/presets.ts` に `config/build.ts` のヘルパー（`vehicle()`、`stage()`、`pitchProgram()`）で公開値から組み立て、出典（`sources`）とモデル化の注記（`modelNotes`）を添えます。
- **出力形式**: CSV の列名・順序は CLI と比較できるよう固定です。変更するときは README とサンプルも更新してください。
