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

`frontend/src/wasm/` に以下が生成されます（Git 管理外）：
- `openTsiolkovsky.js`
- `openTsiolkovsky_bg.wasm`
- `openTsiolkovsky.d.ts` / `openTsiolkovsky_bg.wasm.d.ts`

フロントエンドの `bun run dev` は、このフォルダが無いときに自動でビルドします。

## フロントエンドでの使用

Webフロントエンドは常にWASMでシミュレーションします。計算は画面を止めないよう Web Worker で実行されます。

- `frontend/src/lib/simulation.ts` — WASMモジュールを読み込み、設定（`ClientConfig`）をJSONで渡して結果を受け取ります
- `frontend/src/workers/solver.worker.ts` — 上記を別スレッドで実行し、結果を軌道データ（Track）に変換します
- `frontend/src/lib/solver.ts` — 画面側からWorkerを呼び出します。新しい入力が来たら古い計算は打ち切ります

```typescript
import { solver } from './lib/solver'

const track = await solver.run(config) // Track | null
```

WASM側（`src/wasm.rs` の `WasmSimulator`）は、Webの設定形式と CLI 用の `param_*.json` 形式のどちらのJSONも受け付けます。

## トラブルシューティング

- **wasm-pack が見つからない**: インストール後、PATHを再読み込み
- **wasm32ターゲットが無い**: `rustup target add wasm32-unknown-unknown` を実行
- **WASMファイルが見つからない**: `frontend/src/wasm/` にファイルが生成されているか確認
