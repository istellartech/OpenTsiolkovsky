# OpenTsiolkovsky 開発ガイド

開発者向けのプロジェクト構成とよくある開発タスクを説明します。

## プロジェクト構成

```
OpenTsiolkovsky/
├── src/              # Rust 実装
│   ├── config/        # 設定ファイルの型・表（定数/表/CSV）・検証・旧C++形式の変換
│   ├── vehicle.rs     # 表を読み込んだ機体モデル
│   ├── sim/           # シミュレータ（積分・力・イベント・落下物・出力サンプル）
│   ├── physics/ math/ # 大気・座標・重力・軌道要素、積分器・補間
│   ├── output.rs      # trajectory.csv・summary.json などの出力
│   ├── montecarlo.rs  # 分散解析
│   ├── main.rs        # CLI
│   ├── agent.rs       # AI・スクリプト向けの共通処理（--json、Schema、変換、共有リンク）
│   ├── mcp.rs         # MCP サーバー
│   └── wasm.rs        # Web アプリ用の WASM バインディング
├── tests/            # 統合テスト（旧C++版の出力との回帰テスト、保存則）
├── examples/         # 設定ファイルとサンプルデータ
├── frontend/         # Web アプリ（React + TypeScript）
├── scripts/          # ビルドスクリプト（WASM、Vercel）
└── docs/             # ドキュメント
```

旧C++版（`legacy_cpp/`）と比較スクリプト（`tools/compare_cpp.py`）は git タグ `cpp-v0.52` に残してあります。

## Rust

```bash
cargo build --release
cargo test                     # tests/cpp_reference.rs は旧C++版の出力との比較
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo clippy --target wasm32-unknown-unknown --features wasm --no-default-features -- -D warnings
```

C++版との回帰テストは、旧形式の設定（`tests/cpp_reference/*.json`）を変換して飛ばし、保存してある C++ の出力（`*_cpp.csv`）と比べます。基準データの作り直し方は `tests/cpp_reference.rs` の冒頭にあります。意図した違いは [物理モデル](physics.md#旧c版との関係) にあります。

## フロントエンド

```bash
cd frontend
bun install
bun run dev          # frontend/src/wasm が無ければ先に WASM をビルド
bunx vp check        # フォーマット・Lint・型チェック（--fix で整形）
bunx vp test run     # テスト（src/wasm があれば全サンプル機体の WASM 計算も）
bun run build        # WASM ビルド → vp check → frontend/dist に本番ビルド
```

構成と実装上の約束ごと（文言の多言語化、色、Worker で動くモジュール）は [frontend/README.md](../frontend/README.md) を参照してください。

### 技術スタック

- React 18 + TypeScript、Vite+（`vp`：Vite 8 / Rolldown、Vitest、Oxlint、Oxfmt。設定は `frontend/vite.config.ts`）
- Tailwind CSS v4（色は `src/index.css` の CSS 変数、ライト/ダーク対応）
- CesiumJS（Esri タイル）、Chart.js、Lucide React
- 計算は Rust ソルバーの WASM を Web Worker で実行

## WASM

必要なもの: `rustup target add wasm32-unknown-unknown` と [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)。

```bash
bash scripts/wasm_build.sh     # frontend/src/wasm に出力（Git 管理外）
```

`src/wasm.rs` の関数は、どれも JSON のテキストを受け取って返します。設定の表はインラインで書きます（ブラウザではファイルを読めません）。

| 関数 | 内容 |
| --- | --- |
| `simulate_json(config)` | `{ trajectory, events, bodies, summary, warnings }`。`trajectory` は CLI の `trajectory.csv` と同じ列名のサンプルの配列（[出力ファイル](output.md)）。設定が無効なら JSON パス付きのエラー |
| `validate_json(config)` | `{ valid, errors, warnings }`（`{ path, message }` の配列） |
| `convert_legacy_json(param, files)` | 旧C++版の `param_*.json` と CSV（ファイル名 → 中身）を変換。`{ config, warnings }` |
| `default_dispersion_json()` | 分散解析の既定の 1σ 値 |
| `monte_carlo_case_json(config, dispersion, seed, index)` | 分散解析の 1 ケース（`seed` と `index` から乱数を決めるので再現可能） |
| `monte_carlo_statistics_json(cases)` | ケースの配列から物体ごとの平均落下点と誤差楕円 |

フロントエンドでは `frontend/src/lib/simulation.ts` が WASM を読み込み、`workers/solver.worker.ts` が別スレッドで計算し、`lib/solver.ts` が新しい入力が来たら古い計算を打ち切ります。分散解析は `workers/montecarlo.worker.ts` を複数起動してケースを分担します。AI・スクリプト向けの `agent.rs`・`mcp.rs` はネイティブ専用で、WASM には入りません。

## AI 向けインターフェース

`run --json`・`validate`・`schema`・`convert`・`share`・`mcp` の仕様は [AI エージェントからの利用](ai.md) にまとめています。MCP サーバーは標準入出力に JSON を流して試せます。

```bash
cargo build --release
printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"run_simulation","arguments":{"config_path":"examples/momo.json","trajectory_points":3}}}' \
  | ./target/release/openTsiolkovsky-cli mcp
```

JSON のキー・エラーの種類・終了ステータスは外部のエージェントが頼りにするので、変えるときは `docs/ai.md` も更新してください。
