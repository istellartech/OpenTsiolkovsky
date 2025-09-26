# WASM ビルドガイド

ブラウザ上でOpenTsiolkovskyを実行するためのWASMビルド方法を説明します。

## 必要環境

- Rust toolchain (stable)
- wasm32ターゲット: `rustup target add wasm32-unknown-unknown`
- wasm-pack: https://rustwasm.github.io/wasm-pack/installer/

## ビルド

```bash
bash scripts/wasm_build.sh
```

`frontend/src/wasm/` に以下が生成されます：
- `openTsiolkovsky_cli.js`
- `openTsiolkovsky_cli_bg.wasm`
- `openTsiolkovsky_cli.d.ts`

## フロントエンドでの使用

シミュレーション設定パネルで「Execution mode」を `Browser (WASM)` に設定することで、ブラウザ上でシミュレーションが実行されます。

内部的には `frontend/src/lib/wasm.ts` がWASMモジュールを動的にロードし、JSON形式でデータをやりとりします。

```typescript
// 使用例
import { runSimulationWasm } from '../lib/wasm'

const result = await runSimulationWasm(configObject)
```

## トラブルシューティング

- **wasm-pack が見つからない**: インストール後、PATHを再読み込み
- **wasm32ターゲットが無い**: `rustup target add wasm32-unknown-unknown` を実行
- **WASMファイルが見つからない**: `frontend/src/wasm/` にファイルが生成されているか確認