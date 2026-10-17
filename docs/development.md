# OpenTsiolkovsky 開発ガイド

開発者向けのプロジェクト構成とよくある開発タスクを説明します。

## プロジェクト構成

```
OpenTsiolkovsky/
├── src/              # メインRust実装
├── tests/            # Rust統合テスト（旧C++版の出力との回帰テストを含む）
├── examples/         # 設定ファイルとサンプルデータ
├── frontend/         # React/TypeScript Webインターフェース
├── legacy_cpp/       # 旧C++実装（参考用）
├── scripts/          # ビルドスクリプト
├── tools/            # compare_cpp.py（Rust版とC++版の比較）
└── docs/             # ドキュメント
```

## ビルド・テストコマンド

### Rust
```bash
# ビルド
cargo build --workspace
cargo build --release

# テスト（tests/cpp_reference.rs は旧C++版の出力との比較）
cargo test --workspace

# リント・フォーマット
cargo fmt
cargo clippy --all-targets -- -D warnings
cargo clippy --target wasm32-unknown-unknown --features wasm --no-default-features -- -D warnings
```

### 旧C++版との比較

C++版のビルドには Boost が必要です（macOS では Homebrew の Boost を Makefile が参照します）。

```bash
brew install boost
cd legacy_cpp && make        # -> legacy_cpp/bin/OpenTsiolkovsky
```

同じ設定ファイルを両方で計算し、時刻ごとの差の最大値を表示します（Rust版は `cargo build --release` が必要）。

```bash
python3 tools/compare_cpp.py examples/param_momo.json
```

C++版はCSVのヘッダー名を照合するので、テーブルのヘッダーは [設定ファイル](configuration.md#csv-テーブルの形式) の名前にしてください。定数 CN が 0 でない設定や多段機の質量は、両者で意図的に扱いが異なります（[物理モデル](physics.md#旧c版との関係)）。回帰テストの基準データ（`tests/cpp_reference/*_cpp.csv`）の作り方は `tests/cpp_reference.rs` の冒頭にあります。

### フロントエンド
```bash
cd frontend

# 依存関係インストール
bun install

# 開発サーバー
bun run dev

# プロダクションビルド
bun run build

# フォーマット・Lint・型チェック
bunx vp check      # --fix で整形

# テスト（src/wasm があれば WASM での全サンプル機体の計算も含む）
bunx vp test run
```

## 技術スタック

### フロントエンド
- **Core**: React 18 + TypeScript
- **ツールチェーン**: Vite+（`vp`：Vite 8 / Rolldown、Vitest、Oxlint、Oxfmt。設定は `frontend/vite.config.ts`）
- **スタイリング**: Tailwind CSS v4（色は `src/index.css` の CSS 変数、ライト/ダーク対応）
- **3D 地図**: CesiumJS（Esri タイル）
- **チャート**: Chart.js
- **アイコン**: Lucide React
- **計算**: Rust ソルバーの WASM を Web Worker で実行

構成と実装上の約束ごと（文言の多言語化、色、Worker で動くモジュール）は [frontend/README.md](../frontend/README.md) を参照してください。
