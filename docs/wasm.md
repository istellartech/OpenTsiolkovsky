# WASM ビルドガイド

ブラウザ上でOpenTsiolkovskyを実行するためのWASMビルド方法を説明します。

AI・スクリプト向けの機能（`src/agent.rs`・`src/mcp.rs`）はネイティブの CLI 専用で、WASM には入りません（[AI エージェントからの利用](ai.md)）。

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

| 関数 | 内容 |
| --- | --- |
| `WasmSimulator.run()` | 機体の時系列（`SimulationState[]`）の JSON |
| `WasmSimulator.run_with_fall_bodies()` | `{ trajectory, fall_bodies, events }`。`fall_bodies` は使用済みの段・投棄物ごとの分離時刻・質量・落下点・時系列、`events` は根探索で求めた飛行イベント（[出力ファイル](output.md#イベント)） |
| `default_dispersion()` | 分散解析の既定の 1σ 値 |
| `monte_carlo_case(config, dispersion, seed, index)` | 分散解析の 1 ケース（`seed` と `index` から乱数を決めるので再現可能） |
| `monte_carlo_statistics(cases)` | ケースの配列から物体ごとの平均落下点と誤差楕円（1σ・95 %・99 %） |

分散解析は `frontend/src/workers/montecarlo.worker.ts` を複数起動してケースを分担し、`frontend/src/hooks/useMonteCarlo.ts` が進み具合と集計を管理します。

## トラブルシューティング

- **wasm-pack が見つからない**: インストール後、PATHを再読み込み
- **wasm32ターゲットが無い**: `rustup target add wasm32-unknown-unknown` を実行
- **WASMファイルが見つからない**: `frontend/src/wasm/` にファイルが生成されているか確認
