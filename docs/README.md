# OpenTsiolkovsky Docs

このドキュメントは、Rustコア、Web API、フロントエンド、WASM ビルドの基本的な使い方をまとめたものです。ここではフロントエンドは bun 利用を前提に記載します（Node/npmでも動作しますが手順は省略）。詳細は併記の各ドキュメントを参照してください。

## 前提環境
- Rust (stable) + cargo（`rustup` 推奨）
- Bun v1+（https://bun.sh/）
- wasm（任意・ブラウザ実行）:
  - `wasm-pack` が必要（https://rustwasm.github.io/wasm-pack/installer/）
  - Rustターゲット: `wasm32-unknown-unknown`

## Rust ワークスペース
- ビルド: `cargo build --workspace`
- テスト: `cargo test --workspace`

### CLI / Web API
- CLI 実行例: `cargo run -p openTsiolkovsky-cli -- --config ../bin/param_sample_01.json --verbose`
- Web API 起動: `cargo run -p openTsiolkovsky-web`
  - 既定は `:3001` で待受、使用中なら `:3002` 以降へ自動フォールバックします
  - 固定ポートにしたい場合は `OT_WEB_PORT=3002 cargo run -p openTsiolkovsky-web`
  - エンドポイント仕様: `docs/api/web_api.md`

## フロントエンド（Vite + React, bun）
- 依存インストール: `cd frontend && bun install`
- 起動: `bun run dev`（http://localhost:5173）
- ビルド: `bun run build`
- プレビュー: `bun run preview`
- 備考: Viteは `/api` を `http://localhost:3001` へプロキシします（`frontend/vite.config.ts`）。

## WASM ビルドと利用方法
ブラウザ上でシミュレーション（WASM）を動かす場合の手順です。サーバAPIでの実行のみであれば、この項は不要です。

### 1) 事前準備
1. Rustターゲットの追加（必要に応じて）
   - `rustup target add wasm32-unknown-unknown`
2. `wasm-pack` のインストール
   - インストーラ: https://rustwasm.github.io/wasm-pack/installer/
   - または `cargo binstall wasm-pack` など

### 2) ビルド手順
ルートで以下を実行します。

```
bash scripts/wasm_build.sh
```

- 成功すると、`frontend/src/wasm/` に以下などが生成されます:
  - `openTsiolkovsky_cli_bg.wasm`
  - `openTsiolkovsky_cli.js`
  - `openTsiolkovsky_cli.d.ts`

備考: WASM をビルドしていない場合でも、フロントエンドの本番ビルド（`bun run build`）は通ります。
WASM 実行モードを選ぶと、実行時に「WASM bundle not found. Run: bash scripts/wasm_build.sh」というエラーを表示します。

### 3) フロントエンドでの利用
- 画面上部の「Execution mode」で `Browser (WASM)` を選択
- 「Run from JSON」に C++互換キーのRocketConfig JSONを貼り付けて実行
  - 例のキー名は `rust/crates/core/src/rocket/mod.rs` の `serde(rename = ...)` を参照

内部的には `frontend/src/lib/wasm.ts` が `frontend/src/wasm/openTsiolkovsky_cli` を動的importし、`WasmSimulator` を用いてJSON入出力を行います。

### 4) トラブルシュート
- `wasm-pack` が見つからない: インストール後、`PATH` を再読み込みしてください。
- `wasm32-unknown-unknown` が無い: `rustup target add wasm32-unknown-unknown` を実行。
- 生成物が見つからない: `frontend/src/wasm` に成果物が出力されているか確認。

## 参考
- フロントエンド/開発ガイド: `docs/README.rust_frontend.md`
- Web API 仕様: `docs/api/web_api.md`
- WASM ビルド詳細: `docs/wasm_build.md`
