# OpenTsiolkovsky Rust移植 実装TODO

## プロジェクト概要

C++で実装されているOpenTsiolkovskyロケット飛行シミュレータをRustに移植し、TypeScriptでWebブラウザ対応の可視化を実現する大規模実装プロジェクト。

### 移植元コードマッピング

| C++モジュール | Rust移植先 | 責務 |
|-------------|----------|------|
| `main.cpp` | `cli::main.rs` | エントリーポイント |
| `rocket.cpp/.hpp` | `core::simulator` | メインシミュレータ・ロケットモデル |
| `air.cpp/.hpp` | `core::physics::atmosphere` | ISA大気モデル |
| `gravity.cpp/.hpp` | `core::physics::gravity` | WGS84重力モデル |
| `coordinate_transform.cpp/.hpp` | `core::physics::coordinates` | 座標変換（LLH/ECEF/ECI） |
| `Orbit.cpp/.hpp` | `core::simulator` | 軌道計算（統合） |
| `fileio.cpp/.hpp` | `core::io` | JSON/CSVファイル入出力 |
| Python tools (`bin/`) | 一部Web UIへ統合 | 後処理・可視化ツール |

---

## Phase 1: プロジェクト構造セットアップ

### 1.1 Rust Workspace構成
- [x] **ルートCargo.toml作成** - workspace定義、共通依存関係設定
- [x] **crates/core/Cargo.toml** - コアシミュレータcrate（nalgebra, serde, csv, rayon）
- [x] **crates/cli/Cargo.toml** - CLI + WASM crate（clap, wasm-bindgen）
- [x] **crates/web/Cargo.toml** - APIサーバーcrate（axum, tokio）
- [x] **ディレクトリ構造作成** - src/, tests/, docs/, examples/フォルダ

### 1.2 開発環境セットアップ
- [ ] **Rust toolchain設定** - wasm32-unknown-unknown target追加
- [ ] **開発用設定ファイル** - .gitignore, rustfmt.toml, clippy設定
- [ ] **CI/CD基盤** - GitHub Actions for testing

---

## Phase 2: コア数学・物理ライブラリ基盤（core crate）

### 2.1 数学モジュール (`core/src/math/`)
- [x] **integrator.rs** - Runge-Kutta4積分器実装（boost::odeint代替）
- [x] **linalg.rs** - 線形代数ヘルパー関数（nalgebra wrapper）
- [x] **constants.rs** - 物理定数定義（地球半径、重力定数等）
- [x] **単体テスト** - 積分精度検証、行列演算テスト

### 2.2 座標変換モジュール (`core/src/physics/coordinates/`)
- [x] **coordinate_transform.cpp移植**
  - [x] **LLH ↔ ECEF変換** - WGS84楕円体パラメータ
  - [x] **ECEF ↔ ECI変換** - 地球自転考慮
  - [x] **NED座標変換** - 局所座標系
  - [x] **回転行列・クォータニオン** - 姿勢表現
- [x] **単体テスト** - 各座標変換の精度検証
- [x] **C++版結果との比較テスト**

### 2.3 大気モデル (`core/src/physics/atmosphere.rs`)
- [x] **air.cpp/hpp移植**
  - [x] **ISA標準大気実装** - 温度・圧力・密度計算
  - [x] **高度別層構造** - 対流圏～熱圏対応
  - [x] **大気密度変動** - ファイル入力対応
- [x] **単体テスト** - 各高度での標準値検証
- [x] **精度テスト** - C++版との相対誤差 < 1e-10確認

### 2.4 重力モデル (`core/src/physics/gravity.rs`)
- [x] **gravity.cpp/hpp移植**
  - [x] **WGS84重力場** - 扁平楕円体重力計算
  - [x] **高度変化対応** - 逆2乗則からの補正
  - [x] **重力ベクトル計算** - ECEF座標系
- [x] **単体テスト** - 地表・軌道高度での重力値検証
- [x] **精度検証** - 標準重力値との比較

---

## Phase 3: I/Oとデータ構造 (`core/src/io/`, `core/src/rocket/`)

### 3.1 設定ファイル処理 (`core/src/io/`)
- [x] **fileio.cpp移植**
  - [x] **JSON設定読み込み** - param_sample.json互換フォーマット
  - [x] **CSV時系列データ** - 推力・比推力・姿勢・風データ
  - [x] **出力ファイル生成** - CSV軌道データ、JSON統計情報
- [x] **構造体定義** - RocketConfig, StageConfig, LaunchCondition
- [x] **エラーハンドリング** - ファイル読み込みエラー対応
- [x] **互換性テスト** - 既存JSONファイルでのパース確認

### 3.2 ロケットデータ構造 (`core/src/rocket/`)
- [x] **RocketStage構造体** - rocket.hpp移植
  - [x] **推進系パラメータ** - 推力、比推力、燃焼時間
  - [x] **空力パラメータ** - CN、CA、弾道係数
  - [x] **質量特性** - 初期質量、燃料消費
  - [x] **姿勢制御** - TVC、姿勢プログラム
- [x] **多段ロケット対応** - 段分離条件、連続計算（基本実装）
- [x] **飛行モード** - 3DoF実装完了

---

## Phase 4: シミュレーションエンジン (`core/src/simulator/`)

### 4.1 メインシミュレータ
- [x] **rocket.cpp主要部分移植**
  - [x] **状態量定義** - SimulationState構造体（位置・速度・質量・姿勢）
  - [x] **Simulator構造体** - 設定・物理エンジン・積分器統合
  - [x] **ステップ実行** - step()メソッド、時間積分
- [x] **Orbit.cpp軌道計算統合**
  - [x] **3DoF飛行** - 質点運動方程式
  - [ ] **6DoF飛行** - 剛体運動方程式（未実装）
  - [x] **段分離処理** - 状態量継承（基本実装）

### 4.2 物理計算統合
- [x] **PhysicsEngine構造体** - 各物理モデル統合
- [x] **力・モーメント計算** - 推力、空力、重力統合
- [x] **環境条件** - 風モデル、大気密度変動
- [x] **積分テスト** - Runge-Kutta4での軌道計算精度

### 4.3 出力・ログ機能
- [x] **軌道データ出力** - CSV形式、時系列状態量
- [x] **統計情報** - JSON形式、到達高度・速度等
- [x] **ログ機能** - 計算進捗、エラー情報
- [x] **デバッグ出力** - 詳細物理量（開発用）

---

## Phase 5: CLIアプリケーション (`crates/cli/`)

### 5.1 コマンドラインインターフェース
- [x] **main.cpp移植** - CLI引数処理、シミュレーション実行制御
- [x] **clap設定** - 設定ファイルパス指定、オプション定義
- [x] **実行制御** - Simulatorインスタンス化、結果出力
- [x] **エラーハンドリング** - ファイルエラー、計算エラー対応

### 5.2 WASM Bindgen対応
- [ ] **wasm.rs実装** - WebAssembly向けインターフェース
- [ ] **WasmSimulator構造体** - JavaScript API設計
- [ ] **JSON入出力** - 設定・結果のJSON変換
- [ ] **エラー変換** - Rust Error → JsError

### 5.3 ビルド設定
- [ ] **Cargo.toml設定** - crate-type = ["cdylib"], wasm-bindgen features
- [ ] **ビルドスクリプト** - wasm-pack使用
- [ ] **型定義生成** - TypeScript型定義ファイル

---

## Phase 6: テストとバリデーション

### 6.1 単体テスト (`tests/unit/`)
- [x] **数学モジュール** - 積分器精度、座標変換正確性
- [x] **物理モデル** - 大気・重力モデルの標準値検証
- [x] **I/O機能** - JSON/CSV読み書き、エラー処理
- [x] **カバレッジ** - 27テスト全合格（十分な網羅率）

### 6.2 統合テスト (`tests/integration/`)
- [ ] **サンプルデータテスト** - param_sample_01.json使用
- [ ] **C++版比較** - 同一条件での結果比較
- [ ] **数値精度検証** - 相対誤差 < 1e-10確認
- [ ] **多段ロケット** - SS-520-4パラメータテスト

### 6.3 性能テスト (`tests/benchmark/`)
- [ ] **計算速度** - C++版との実行時間比較
- [ ] **メモリ使用量** - 大規模モンテカルロ時のメモリ効率
- [ ] **WASM性能** - ブラウザでの実行性能測定

---

## Phase 7: Webインターフェース (`crates/web/`, `frontend/`)

### 7.1 APIサーバー (`crates/web/`)
- [ ] **axum REST API** - シミュレーション実行エンドポイント
- [ ] **ファイルアップロード** - 設定・データファイル受信
- [ ] **CORS設定** - フロントエンドとの連携
- [ ] **エラーレスポンス** - API エラーハンドリング

### 7.2 フロントエンド基盤 (`frontend/`)
- [ ] **React + TypeScript** - プロジェクト初期設定
- [ ] **bun設定** - package.json、依存関係
- [ ] **Vite設定** - ビルド設定、WASM対応
- [ ] **Tailwind CSS** - CSS設定、CDN使用
- [ ] **shadcn/ui** - UIコンポーネントライブラリ

### 7.3 コンポーネント実装
- [ ] **SimulationPanel** - パラメータ入力・実行制御
- [ ] **TrajectoryViewer** - Three.js 3D軌道表示
- [ ] **GraphPanel** - Chart.js 2Dグラフ表示
- [ ] **FileUpload** - 設定・データファイルアップロード

### 7.4 WASM統合
- [ ] **simulation.ts** - WASM呼び出し処理
- [ ] **型定義** - TypeScript型定義ファイル
- [ ] **エラーハンドリング** - WASM実行エラー対応
- [ ] **非同期処理** - Web Worker使用検討

---

## Phase 8: 可視化機能強化

### 8.1 3D可視化 (Three.js)
- [ ] **軌道描画** - 3D空間での軌道線表示
- [ ] **地球モデル** - WGS84楕円体、テクスチャマッピング
- [ ] **カメラ制御** - 軌道追跡、マウス操作
- [ ] **アニメーション** - 時系列再生、速度制御

### 8.2 2Dグラフ (Chart.js)
- [ ] **時系列グラフ** - 高度・速度・加速度
- [ ] **軌跡プロット** - Ground track表示
- [ ] **比較表示** - 複数シミュレーション重ね合わせ
- [ ] **統計グラフ** - モンテカルロ結果分布

### 8.3 インタラクティブ機能
- [ ] **パラメータ調整** - リアルタイム設定変更
- [ ] **結果エクスポート** - CSV/JSON/画像ダウンロード
- [ ] **データ共有** - 結果URL生成

---

## Phase 9: Python tools移植判断・互換性

### 9.1 既存Python toolsの分析
- [ ] **bin/make_plot.py** → Web UI統合検討
- [ ] **bin/monte_carlo.py** → Rust並列処理実装
- [ ] **bin/make_kml.py** → 地図表示機能統合
- [ ] **bin/make_html.py** → Web UI置き換え

### 9.2 重要ツールの移植
- [ ] **モンテカルロシミュレーション** - Rust rayon使用
- [ ] **統計解析** - 分散・共分散計算
- [ ] **可視化データ生成** - KML、NMEA出力

### 9.3 互換性維持
- [ ] **出力フォーマット** - CSV互換性確保
- [ ] **設定ファイル** - JSON完全互換
- [ ] **移行ガイド** - ユーザー向けドキュメント

---

## Phase 10: ドキュメント・デプロイ

### 10.1 技術ドキュメント
- [ ] **API文書** - Rust docコメント、Web API仕様
- [ ] **設計文書** - アーキテクチャ、モジュール設計
- [ ] **テスト文書** - テスト戦略、カバレッジレポート

### 10.2 ユーザードキュメント
- [ ] **インストールガイド** - Rust/bun環境構築
- [ ] **使用方法** - CLI・Web UI操作方法
- [ ] **移行ガイド** - C++版からの移行手順

### 10.3 デプロイ・リリース
- [ ] **ビルドパイプライン** - CI/CD自動化
- [ ] **リリースバイナリ** - クロスプラットフォームビルド
- [ ] **Web デプロイ** - 静的サイト・APIサーバー

---

## プロジェクト管理

### 開発フォルダ構成（提案）
```
OpenTsiolkovsky/
├── rust/                        # 新規Rust実装
│   ├── Cargo.toml              # Workspace設定
│   ├── crates/
│   │   ├── core/               # コアシミュレータ
│   │   │   ├── src/
│   │   │   │   ├── lib.rs
│   │   │   │   ├── simulator/
│   │   │   │   ├── physics/    # 物理モデル
│   │   │   │   ├── rocket/     # ロケットモデル
│   │   │   │   ├── math/       # 数学ライブラリ
│   │   │   │   └── io/         # ファイル入出力
│   │   │   └── Cargo.toml
│   │   ├── cli/                # CLI + WASM
│   │   │   ├── src/
│   │   │   │   ├── main.rs     # CLI entry
│   │   │   │   └── wasm.rs     # WASM bindings
│   │   │   └── Cargo.toml
│   │   └── web/                # APIサーバー
│   │       ├── src/main.rs
│   │       └── Cargo.toml
│   ├── tests/                  # 統合テスト
│   │   ├── integration/
│   │   ├── benchmark/
│   │   └── data/              # テストデータ
│   └── examples/              # 使用例
├── frontend/                    # Web UI
│   ├── package.json           # bun設定
│   ├── vite.config.ts
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── lib/              # ユーティリティ・型定義
│   │   └── wasm/            # WASM出力先
│   └── public/
├── src/                         # 既存C++コード（参照用）
├── bin/                         # 既存Python tools（参照用）
├── docs/                        # 新規ドキュメント
│   ├── design/
│   ├── api/
│   └── user/
└── TODO.md                      # 本ファイル
```

### 優先順位・依存関係
1. **Phase 1-2** - 数学・物理基盤（他すべてに影響）
2. **Phase 3-4** - I/O・シミュレータ（コア機能）
3. **Phase 5-6** - CLI・テスト（機能完成・品質確保）
4. **Phase 7-8** - Web UI（ユーザビリティ）
5. **Phase 9-10** - 移植・文書（運用・保守）

### 品質管理
- **コードレビュー** - 各Phase完了時
- **C++版比較テスト** - 数値精度・性能確認
- **継続的統合** - 自動テスト・ビルド
- **メモリ安全性** - Rustのメリット活用
- **エラーハンドリング** - Result型使用、panic回避

---

このTODO.mdを実装の進捗管理とマイルストーン確認に使用し、完了項目にチェックを入れながら着実に進めてください。