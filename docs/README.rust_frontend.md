# OpenTsiolkovsky Rust + Frontend 開発ガイド

## 概要
Rustワークスペース（core/cli/web）とモダンなReact/TypeScriptフロントエンドの開発・利用方法をまとめます。

## 前提環境
- Rust (stable) + cargo
- Bun v1+（推奨）または Node.js 18+
- オプション（WASM連携時）: wasm32-unknown-unknown ターゲット、wasm-pack

Rust ワークスペース
- 全体ビルド: cargo build --workspace
- テスト実行: cargo test --workspace

CLI の使い方
- 実行: cargo run -p openTsiolkovsky-cli -- --config bin/param_sample_01.json --output output --verbose
- 出力: output_trajectory.csv, output_summary.json, output_dynamics_cpp.csv

Web API サーバー
- 起動: cargo run -p openTsiolkovsky-web（既定 :3001 / 使用中なら自動で次ポートにフォールバック）
- 固定ポート指定: `OT_WEB_PORT=3002 cargo run -p openTsiolkovsky-web`
- 主要エンドポイント: /api/simulation, /api/simulation/path, /api/upload（詳細: docs/api/web_api.md）

## Frontend（React + TypeScript + Vite）

### 技術スタック
- **Core**: React 18 + TypeScript + Vite
- **スタイリング**: Tailwind CSS v4 + PostCSS
- **UI コンポーネント**: Radix UI（アコーディオン、タブ、スイッチ等）
- **3D 可視化**: Three.js（軌道表示）
- **チャート**: Chart.js（パフォーマンス分析）
- **アイコン**: Lucide React
- **ユーティリティ**: clsx, tailwind-merge, class-variance-authority

### 主要機能とコンポーネント
- **SimulationPanel**: ロケット設定（段階別設定、推力、環境パラメータ等）
- **GraphPanel**: リアルタイム性能グラフ（高度、速度、質量等）
- **TrajectoryViewer**: インタラクティブ3D軌道表示（フルスクリーン対応）
- **データエクスポート**: KMLファイル生成・ダウンロード
- **実行モード切替**: サーバーAPI / ブラウザWASM

### 開発・起動
- 依存インストール: `cd frontend && bun install`
- 開発サーバー: `bun run dev` （http://localhost:5173）
- プロダクションビルド: `bun run build`
- プレビュー: `bun run preview`
- devサーバーは `/api` を `http://localhost:3001` にプロキシ（`frontend/vite.config.ts`）
  - Web API が別ポートで起動した場合は、`vite.config.ts` のプロキシ先を合わせてください

WASM（任意）
- 準備: rustup target add wasm32-unknown-unknown, wasm-pack をインストール
- ビルド: bash scripts/wasm_build.sh（出力: frontend/src/wasm）

入力データ
- JSON: bin/param_sample_01.json
- CSV: bin/sample/ 配下（thrust.csv, Isp.csv, CN.csv, CA.csv, attitude.csv, wind.csv）

## トラブルシュート

### 一般的な問題
- **ポート競合 (3001/5173)**: 他プロセスの利用確認、または環境変数で別ポート指定
- **CORS エラー**: dev用に全許可済み。Viteプロキシ設定を確認
- **WASM が見つからない**: `scripts/wasm_build.sh` 実行で `frontend/src/wasm` の出力を確認

### フロントエンド固有
- **Tailwind CSS が適用されない**: PostCSS設定とTailwind v4の設定を確認
- **3D表示が動作しない**: Three.jsの依存関係とWebGL対応ブラウザを確認
- **チャートが表示されない**: Chart.jsとCanvas対応を確認
- **型エラー**: TypeScript設定と型定義ファイルを確認（特にWASM関連）

参考
- Web API 仕様: docs/api/web_api.md
- WASM ビルド: docs/wasm_build.md
- 設計: 設計書.md / 要求: 要求書.md
