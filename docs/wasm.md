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

- `frontend/src/lib/simulation.ts` — WASMモジュールを読み込み、設定（CLI と同じ形式。型は `frontend/src/lib/config.ts`）をJSONで渡して結果を受け取ります
- `frontend/src/workers/solver.worker.ts` — 上記を別スレッドで実行し、結果を軌道データ（Track）に変換します
- `frontend/src/lib/solver.ts` — 画面側からWorkerを呼び出します。新しい入力が来たら古い計算は打ち切ります

```typescript
import { solver } from './lib/solver'

const track = await solver.run(config) // Track | null
```

WASM側（`src/wasm.rs`）の関数は、どれも JSON のテキストを受け取って返します。設定の表はインラインで書きます（ブラウザではファイルを読めません）。

| 関数 | 内容 |
| --- | --- |
| `simulate_json(config)` | `{ trajectory, events, bodies, summary, warnings }`。`trajectory` は CLI の `trajectory.csv` と同じ列名のサンプルの配列、`bodies` は切り離された物体ごとの分離時刻・質量・落下点・時系列（[出力ファイル](output.md)）。設定が無効なら JSON パス付きのエラー |
| `validate_json(config)` | `{ valid, errors, warnings }`（`{ path, message }` の配列） |
| `convert_legacy_json(param, files)` | 旧C++版の `param_*.json` と CSV（ファイル名 → 中身）を変換。`{ config, warnings }` |
| `default_dispersion_json()` | 分散解析の既定の 1σ 値 |
| `monte_carlo_case_json(config, dispersion, seed, index)` | 分散解析の 1 ケース（`seed` と `index` から乱数を決めるので再現可能） |
| `monte_carlo_statistics_json(cases)` | ケースの配列から物体ごとの平均落下点と誤差楕円（1σ・95 %・99 %） |

分散解析は `frontend/src/workers/montecarlo.worker.ts` を複数起動してケースを分担し、`frontend/src/hooks/useMonteCarlo.ts` が進み具合と集計を管理します。

## トラブルシューティング

- **wasm-pack が見つからない**: インストール後、PATHを再読み込み
- **wasm32ターゲットが無い**: `rustup target add wasm32-unknown-unknown` を実行
- **WASMファイルが見つからない**: `frontend/src/wasm/` にファイルが生成されているか確認
