# OpenTsiolkovsky クイックスタート

OpenTsiolkovskyのRustコアとフロントエンドを素早く開始するためのガイドです。

## 必要環境

- Rust (stable) + cargo
- Bun v1+ (https://bun.sh/)
- オプション（WASM使用時）: wasm-pack

## 基本的な使用方法

### CLIでシミュレーション実行

```bash
# ビルドして実行
cargo run --bin openTsiolkovsky-cli -- --config examples/param_sample_01.json --verbose

# リリースビルド
cargo build --release
./target/release/openTsiolkovsky-cli --config examples/param_sample_01.json --output result
```

### Webフロントエンド

```bash
cd frontend
bun install
bun run dev
```

ブラウザで http://localhost:5173 を開きます。

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