OpenTsiolkovsky Rust + Frontend 利用ガイド

概要: Rustワークスペース（core/cli/web）と Frontend（Vite + React）の使い方を簡潔にまとめます。

前提環境
- Rust (stable) + cargo
- Node.js 18+（または bun）
- オプション（WASM連携時）: wasm32-unknown-unknown ターゲット、wasm-pack

Rust ワークスペース
- 全体ビルド: cargo build --workspace
- テスト実行: cargo test --workspace

CLI の使い方
- 実行: cargo run -p openTsiolkovsky-cli -- --config bin/param_sample_01.json --output output --verbose
- 出力: output_trajectory.csv, output_summary.json, output_dynamics_cpp.csv

Web API サーバー
- 起動: cargo run -p openTsiolkovsky-web （http://localhost:3001）
- 主要エンドポイント: /api/simulation, /api/simulation/path, /api/upload（詳細: docs/api/web_api.md）

Frontend（Vite + React）
- 起動: cd frontend && npm i && npm run dev （http://localhost:5173）
- devサーバーは /api を http://localhost:3001 にプロキシ（frontend/vite.config.ts）

WASM（任意）
- 準備: rustup target add wasm32-unknown-unknown, wasm-pack をインストール
- ビルド: bash scripts/wasm_build.sh（出力: frontend/src/wasm）

入力データ
- JSON: bin/param_sample_01.json
- CSV: bin/sample/ 配下（thrust.csv, Isp.csv, CN.csv, CA.csv, attitude.csv, wind.csv）

トラブルシュート
- 3001/5173 ポート競合: 他プロセスの利用確認
- CORS: dev用に全許可済み。Viteプロキシも確認
- WASMが見つからない: scripts/wasm_build.sh 実行で frontend/src/wasm 出力を確認

参考
- Web API 仕様: docs/api/web_api.md
- WASM ビルド: docs/wasm_build.md
- 設計: 設計書.md / 要求: 要求書.md
