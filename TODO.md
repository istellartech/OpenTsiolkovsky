# OpenTsiolkovsky Rust移植 TODO

## プロジェクト概要

C++で実装されたOpenTsiolkovskyロケット飛行シミュレータをRustへ移植し、TypeScript/ReactによるWeb可視化とAPIを整備するプロジェクト。Rust版はC++と数値互換の3DoF解析を実現しつつ、CLI・Web API・WASMの3経路で利用できることを目指す。

## 進捗ハイライト
- Rust workspace（core/cli/web）構築済み。CLippy/formatter設定とGitHub Actions CIを導入済み。
- 核となる数学・物理・I/O・3DoFシミュレーションはRustへ移植し、C++互換のCSV/JSON出力とダイナミクスCSVを生成できる。
- CLI（clap + 詳細ログ）、Axum製Web API（JSON/パス/ファイル入力）、Reactフロントエンド（Three.js + Chart.js）が連携。WASMラッパとビルドスクリプトも整備済み。

---

## Phase 1-5: 完了済み要約
- [x] Rust workspaceとcrate配置、ツールチェーン設定、CI/整形設定。
- [x] 数学・座標・大気・重力・I/O・ロケット設定のRust移植と3DoFシミュレーション本体、C++互換CSV/JSON出力。
- [x] CLI & wasm-bindgenラッパ、Axum Web API、React UI（土台 + 3D/グラフ/ファイルアップロード）。

---

## Phase 4+: コア機能拡張
- [ ] 6DoF剛体ダイナミクスと姿勢統合（スピン、モーメント、質量モーメント）
- [ ] 多段ロケット/段分離の質量・推力・空力切替
- [ ] Dumping product・姿勢ニュートラリティ等の追加設定項目を計算に反映
- [ ] 数値安定性向上（DP54適応制御の活用、停止条件/地面衝突処理）
- [ ] 出力サマリ拡充（IIP計算、downrange統計、ログ明細）

---

## Phase 6: テストとバリデーション

### 6.1 単体テスト
- [x] math/physics/io/simulatorモジュールの基本ユニットテスト（approx使用）を整備済み
- [ ] 風・CN/CA補間・エラー系など境界ケースの追加テスト

### 6.2 統合テスト
- [ ] `cargo test`または`cargo nextest`でparam_sample_01.jsonを用いた再現テスト
- [ ] C++版CSVとの比較を自動化（tools/compare_cpp_csv.pyをRustテスト/CIから呼び出す）
- [ ] 段分離/モンテカルロ等のシナリオテスト追加

### 6.3 性能テスト
- [ ] Rust vs C++のパフォーマンス・メモリ計測と回帰監視
- [ ] WASM実行時のCPU/メモリ測定、閾値設定

---

## Phase 7: Webインターフェース

### 7.1 APIサーバー（`rust/crates/web`）
- [x] `/api/simulation`・`/api/simulation/path`・`/api/upload`実装、CORS、ポート自動フォールバック
- [ ] ロギング/トレーシング、設定リロード、詳細なエラーメッセージ

### 7.2 フロントエンド基盤（`frontend/`）
- [x] Vite + React + TypeScript構成、APIクライアント（`lib/simulation.ts`）
- [x] WASMローダ（`lib/wasm.ts`）と`scripts/wasm_build.sh`
- [ ] npm scripts/CIでのWASMバンドル自動生成・配信
- [ ] スタイルフレームワーク導入（Tailwind、shadcn/ui等）

### 7.3 コンポーネント
- [x] SimulationPanel: JSON/ファイル入力、API/WASM切替、エラーメッセージ
- [x] TrajectoryViewer: Three.jsで軌道ラインと地球球体を描画
- [x] GraphPanel: 高度・速度・Mach・動圧グラフ
- [ ] 追加グラフ（ダウンレンジ、比較、統計分布）
- [ ] 実行状態の可視化（進捗/キャンセル/入力バリデーション強化）

### 7.4 WASM統合
- [ ] wasm-pack成果物の配信戦略（Vite assets/CI上の公開）整理
- [ ] ブラウザ実行時のエラー処理・リトライUI実装
- [ ] Web Worker等を使った非同期実行検討

---

## Phase 8: 可視化機能強化

### 8.1 Three.js
- [x] 軌道ライン描画と簡易地球モデル
- [ ] カメラ操作（マウス操作、自動追尾）
- [ ] 再生アニメーション/タイムスライダー
- [ ] 姿勢ベクトルや風向きなどのオーバーレイ表示

### 8.2 2Dグラフ (Chart.js)
- [x] 時系列グラフ: 高度・速度・Mach・動圧
- [ ] Ground track・ダウンレンジ表示
- [ ] 複数シミュレーション比較、モンテカルロ統計
- [ ] CSV/JSONダウンロード導線

### 8.3 インタラクティブ機能
- [ ] パラメータ編集→再実行の差分UI
- [ ] 結果エクスポート（CSV/JSON/画像）
- [ ] データ共有・リンク生成

---

## Phase 9: Python tools互換・移行
- [ ] `bin/make_plot.py`など既存ツールの移行方針整理
- [ ] モンテカルロバッチ処理（rayon）をRustで実装
- [ ] KML/NMEA等の地図・航跡出力のRust/フロント移植
- [ ] JSON設定フォーマット完全互換の検証と移行ガイド作成

---

## Phase 10: ドキュメント・デプロイ

### 10.1 技術ドキュメント
- [x] Web API仕様（`docs/api/web_api.md`）更新
- [ ] Rust API docコメント整備・docs.rs公開
- [ ] アーキテクチャ/モジュール設計・テスト戦略ドキュメント

### 10.2 ユーザードキュメント
- [ ] インストール/ビルドガイド（C++/Rust/Frontend）
- [ ] CLI・Web UI利用手順書
- [ ] C++版からの移行ガイド

### 10.3 デプロイ・リリース
- [ ] CI/CDパイプライン整備（ビルド・テスト・配布）
- [ ] リリースバイナリ/WASMパッケージ作成
- [ ] Web API + Frontendのデプロイ運用設計

---

## 開発フォルダ構成（現状）
```
OpenTsiolkovsky/
├── src/                 # 既存C++シミュレータ
├── rust/                # Rust workspace (core/cli/web, examples, tests, target/)
│   ├── Cargo.toml
│   ├── crates/{core,cli,web}/
│   ├── examples/
│   ├── tests/           # 統合テスト予定地
│   ├── docs/            # Rust側ドキュメント
│   └── target/
├── frontend/            # Vite + React UI
│   ├── package.json
│   └── src/{components,lib}
├── bin/                 # Pythonユーティリティ & サンプル入力
├── tools/               # 分析・比較スクリプト
├── scripts/             # wasm_build.sh 等
├── boost/, lib/         # C++依存ライブラリ
├── docs/, doc/          # 仕様・設計資料
├── test/                # C++テストスクリプト
├── misc/                # 実験用リソース
├── README.md / TODO.md
└── 要求書.md / 設計書.md
```

### 優先順位・依存関係
1. コア拡張（6DoF・段分離）とそれに伴うテスト整備
2. C++比較・性能測定を含む自動テスト/CI強化
3. WASM配信戦略とフロントエンドUX改善
4. Python工具群の移行方針決定
5. ドキュメント/リリース整備

### 品質管理メモ
- コア更新時はC++版とCSV/JSON差分を比較すること。
- `cargo fmt` / `cargo clippy -D warnings` / `cargo test` / `npm run build` をCIに組み込み、回帰検知を行う。
- 大規模シナリオやブラウザ実行時のメモリ使用を監視し、閾値超過時のアラートを計画する。

---

このTODO.mdを進捗管理に使用し、完了した項目にチェックを追加しながら計画的に進めてください。
