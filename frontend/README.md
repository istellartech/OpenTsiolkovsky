# OpenTsiolkovsky Web フロントエンド

Rust ソルバーを WebAssembly にしてブラウザだけで動く、ロケット軌道シミュレーターの画面です。
入力を変えるとその場で再計算し、3D 地図・グラフ・テレメトリを同じ時間軸で再生します。

## 使い方

| 操作                | 方法                                                                                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 機体を選ぶ          | ヘッダーの機体名 → サンプル機体（種別・国で絞り込み、名称で検索、↑↓・Enter で選択）または「白紙から作る」                                                                                                                                                                   |
| 設定を開く          | ファイル → 設定ファイルを開く、または画面にドロップ。CLI と同じ形式の設定 `.json` のほか、旧C++版の `param_*.json` を参照 CSV と一緒にドロップすると変換して開けます                                                                                                        |
| 元に戻す / やり直す | ヘッダーの ↶ ↷、`⌘Z` / `⇧⌘Z`（Windows は `Ctrl+Z` / `Ctrl+Shift+Z`、`Ctrl+Y`）                                                                                                                                                                                              |
| 共有                | ファイル → 共有リンクをコピー。未編集のサンプルは `#preset=<id>`、編集した設定は URL の `#c=` に圧縮して埋め込みます（サーバーには送られません）。CLI の `share` や MCP サーバーが作るリンクも開けます（[AI エージェントからの利用](../docs/ai.md#web-アプリの共有リンク)） |
| 比較                | グラフ欄の「比較用に固定」。いまの結果を点線で残し、サマリーに差分を表示します                                                                                                                                                                                              |
| 落下物・IIP         | 使用済みの段と投棄物（機体タブで設定）の落下軌道・落下点を地図に、分離時刻・落下点をイベント表に表示。IIP（瞬間落下予測点）の軌跡と現在位置も地図に出ます。地図右上で表示を切り替え                                                                                         |
| 分散解析            | 下パネルの「分散解析」。推力・風などのばらつき（1σ）とケース数を決めて計算すると、落下点の散らばりと 3σ 楕円を地図と表に表示。CSV で保存できます                                                                                                                            |
| 書き出し            | ファイル → 軌道データ（CSV。列は CLI の trajectory.csv と同じ）/ Google Earth 用（KML）、各グラフの PNG 保存                                                                                                                                                                |
| 再生                | `Space` 再生/停止、`←` `→` ±1 秒（`Shift` で ±10 秒）。`?` でショートカット一覧                                                                                                                                                                                             |
| 表示                | 配色（OS に合わせる / ライト / ダーク）と言語（日本語 / English）はヘッダー右端で切り替え                                                                                                                                                                                   |

## AI・外部ツールとの連携

- 設定は URL のフラグメント（`#preset=` / `#c=`）で受け取れます。CLI の `share` や MCP の `create_share_link` が作るリンクで、AI が用意した設定をそのまま開けます。
- サイトの `/llms.txt`（`public/llms.txt`）に、AI 向けにリンクの形式とドキュメントの場所を書いています。
- 画面そのものを AI が操作する仕組み（WebMCP など）はまだありません。計算を AI に任せるときは CLI か MCP サーバーを使います（[AI エージェントからの利用](../docs/ai.md)）。

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

WASM だけ作り直すときは、リポジトリ直下で `bash scripts/wasm_build.sh` を実行します（[開発ガイド](../docs/development.md#wasm)）。

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
│   ├── config.ts          設定の型（CLI と同じ JSON）と定数・表の扱い
│   ├── simulation.ts      出力の型と WASM 呼び出し（計算、旧C++形式の変換）
│   ├── solver.ts          Worker とのやりとり（古い計算は Worker ごと破棄）
│   ├── trajectory.ts      ソルバー出力 → Track（緯度経度・イベント・サマリー・落下物・IIP）。DOM 非依存
│   ├── montecarlo.ts      分散解析の型・Worker の分担・誤差楕円の形状
│   ├── specs.ts           設定だけから求める諸元（Δv・推力重量比・シーケンス）
│   ├── validation.ts      入力チェック（ソルバーと同じ JSON パスで報告）
│   ├── history.ts / share.ts / kml.ts / geo.ts / format.ts
│   ├── i18n.ts / theme.ts 言語と配色
│   └── playback.ts        再生時刻の共有ストア
└── config/                サンプル機体（presets.ts）、射場、既定値
```

### データの流れ

```
入力（Inspector） ─ patch → useSimulation（履歴・検証・localStorage 保存）
   └─ 250 ms 後 → solver.ts → solver.worker.ts → WASM（simulate_json）→ trackFromOutput → Track
分散解析 → useMonteCarlo → montecarlo.worker.ts ×N → WASM（monte_carlo_case_json）→ 集計（monte_carlo_statistics_json）
Track → GlobeStage / Charts / Playback / Summary（playback ストアの時刻で同期）
```

## 実装メモ

- **文言**: 画面の文字列はその場で `tr('日本語', 'English')` と書きます。モジュール読み込み時に作る表（プリセット一覧など）は、言語切り替えに追従するよう getter（`get label() { return tr(...) }`）にします。
- **色**: 色は `src/index.css` の CSS 変数（`--ink`、`--stage-1` など）だけを使います。Canvas / WebGL に渡す色は `lib/theme.ts` の `cssVar()` / `readStageColor()` で読み、テーマ変更時に描き直します。
- **Worker**: `lib/trajectory.ts` と `lib/simulation.ts` は Worker でも動くため、DOM・言語・テーマに依存させないでください。
- **サンプル機体の追加**: `config/presets.ts` に `config/build.ts` のヘルパー（`vehicle()`、`stage()`、`pitchProgram()`）で公開値から組み立て、出典（`sources`）とモデル化の注記（`modelNotes`）、選択画面の絞り込み用に国（`country`）と検索用の別名（`aliases`）を添えます。
- **出力形式**: 軌道 CSV はソルバーのサンプル（`src/sim/sample.rs`）をそのまま書くので、列名・順序は CLI の `trajectory.csv` と同じです。
- **設定の型**: `lib/config.ts` は Rust の `src/config/mod.rs` と同じ形です。片方を変えたらもう片方と `lib/validation.ts` も直してください（ソルバーは知らないキーをエラーにします）。
