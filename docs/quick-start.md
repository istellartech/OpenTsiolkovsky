# OpenTsiolkovsky クイックスタート

OpenTsiolkovskyのRustコアとフロントエンドを素早く開始するためのガイドです。

## 必要環境

- Rust (stable) + cargo
- Webアプリを動かす場合:
  - Bun v1+ (https://bun.sh/)
  - Node.js 22.18 以上（ツールチェーンの Vite+ が使用）
  - wasm-pack

## 基本的な使用方法

### CLIでシミュレーション実行

```bash
# ビルドして実行
cargo run --bin openTsiolkovsky-cli -- --config examples/param_sample_01.json --verbose

# リリースビルド
cargo build --release
./target/release/openTsiolkovsky-cli --config examples/param_sample_01.json --output result
```

`result_trajectory.csv`（時系列）、`result_summary.json`（概要）、`result_dynamics_cpp.csv`（旧C++版と同じ列構成）が出力されます。`examples/` には `param_momo.json` や、CSVテーブル付きの `SS-520-4/` もあります。

### Webフロントエンド

```bash
cd frontend
bun install
bun run dev   # frontend/src/wasm が無ければ先に WASM をビルド
```

ブラウザで http://localhost:5173 を開きます。ヘッダーからサンプル機体（MOMO、S-310、S-520、SS-520-5、イプシロン、H-IIA、H3、サターンV、アリアン5）を選ぶか、CLI 用の `param_*.json` を CSV と一緒にドロップして開けます。使い方の詳細は [frontend/README.md](../frontend/README.md) を参照してください。

開発用コマンド:

```bash
bunx vp check     # フォーマット・Lint・型チェック
bunx vp test run  # テスト（全サンプル機体の WASM 計算を含む）
```

### WASM（ブラウザ実行用）

```bash
# wasm-packをインストール（未導入の場合）
# cargo install wasm-pack

# WASMビルド
bash scripts/wasm_build.sh
```

## 詳細情報

- [開発ガイド](development.md) - プロジェクト構成と開発方法
- [WASM ガイド](wasm.md) - WASMビルドの詳細
- [設定ファイル](configuration.md) - 設定ファイルフォーマット
- [Webアプリ](../frontend/README.md) - 使い方と構成