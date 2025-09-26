# OpenTsiolkovsky 開発ガイド

開発者向けのプロジェクト構成とよくある開発タスクを説明します。

## プロジェクト構成

```
OpenTsiolkovsky/
├── src/              # メインRust実装
├── tests/            # Rust統合テスト
├── examples/         # 設定ファイルとサンプルデータ
├── frontend/         # React/TypeScript Webインターフェース
├── legacy_cpp/       # 旧C++実装（参考用）
├── scripts/          # ビルドスクリプト
└── docs/             # ドキュメント
```

## ビルド・テストコマンド

### Rust
```bash
# ビルド
cargo build --workspace
cargo build --release

# テスト
cargo test --workspace

# リント・フォーマット
cargo fmt
cargo clippy
```

### フロントエンド
```bash
cd frontend

# 依存関係インストール
bun install

# 開発サーバー
bun run dev

# プロダクションビルド
bun run build

# 型チェック
bunx tsc --noEmit
```

## 技術スタック

### フロントエンド
- **Core**: React 18 + TypeScript + Vite
- **スタイリング**: Tailwind CSS v4
- **UI コンポーネント**: Radix UI
- **チャート**: Chart.js
- **アイコン**: Lucide React
