# OpenTsiolkovsky クイックスタート

## 必要環境

- Rust (stable) + cargo
- Webアプリを動かす場合:
  - Bun v1+ (https://bun.sh/)
  - Node.js 22.18 以上（ツールチェーンの Vite+ が使用）
  - wasm-pack

## CLI でシミュレーション

```bash
cargo build --release
B=./target/release/openTsiolkovsky-cli

$B run examples/SS-520-4/ss520_4.json -o out/ss520
```

出力ディレクトリ（`-o`、既定 `output`）に次のファイルができます。各列とキーの意味は [出力ファイル](output.md) にあります。

| ファイル | 内容 |
| --- | --- |
| `trajectory.csv` | 機体の時系列（位置・速度・質量・推力・Mach・動圧・姿勢・迎角・加速度・飛行モード・IIP など） |
| `summary.json` | 最高高度・最大動圧などの最大値、飛行イベント（燃焼終了時の軌道要素つき）、落下点 |
| `bodies/stage1.csv` など | 分離した段や投棄物が落ちていく時系列 |

画面にはイベントの一覧、最大値、落下点が出ます。

```
Events:
  T+    0.00 s  ignition   stage 1  alt     0.267 km  speed     0.0 m/s  Mach  0.00  q    0.00 kPa
  T+    9.25 s  mach1      stage 1  alt     1.863 km  speed   333.1 m/s  Mach  1.00  q   56.61 kPa
  ...
Impact points:
  vehicle                28.457884, 142.459587 deg at T+1880.0 s
  stage1                 31.245393, 131.125517 deg at T+330.8 s
  stage2                 31.221050, 131.298603 deg at T+619.7 s
```

使用済みの段は姿勢制御がないため、慣性飛行が「指定姿勢」の段も、分離後は「空力安定」として落下を計算します。周回軌道に入るなど地表に落ちない物体は計算しません。

### 設定ファイル

```json
{
  "name": "minimal",
  "simulation": { "end_time_s": 300 },
  "launch": { "latitude_deg": 35, "longitude_deg": 139 },
  "stages": [{
    "mass_initial_kg": 1000,
    "engine": { "thrust_vac_n": 30000, "isp_vac_s": 200, "burn_end_s": 20 }
  }]
}
```

すべての項目は [設定ファイル](configuration.md) にあります。`$B validate FILE` で飛ばさずに確かめられます。旧C++版の `param_*.json` は `$B convert param.json -o config.json` で変換できます（CSV テーブルも読み込みます）。

### 分散解析（モンテカルロ）

```bash
$B monte-carlo examples/SS-520-4/ss520_4.json -n 500 --dispersion examples/dispersion.json --seed 1 -o out/ss520
```

推力・比推力・各段の質量・抗力・姿勢・風・大気密度（設定すれば CN・分離時刻・風速倍率も）をばらつかせて N 回飛ばし、機体と使用済みの段・投棄物の落下点を集計します。`--dispersion` の JSON には 1σ の値を書きます（省略したキーは既定値。[出力ファイル](output.md#モンテカルロ)）。全 CPU コアで並列に計算し、同じ `--seed` なら同じ結果になります。

- `montecarlo_cases.csv`: 1 行 1 ケース。引いた値、最高高度、物体ごとの落下時刻・緯度・経度
- `montecarlo_summary.json`: 物体ごとの落下数、平均落下点、標準偏差、1σ・95 %・99 % の誤差楕円

### AI エージェント・スクリプトから使う

```bash
$B validate examples/momo.json --json   # 飛ばさずに確認（無効なら終了ステータス 3）
$B run examples/momo.json --json        # 結果を JSON で標準出力
$B schema                               # 設定ファイルの JSON Schema
$B share examples/momo.json             # Web アプリで開くリンク
$B mcp                                  # MCP サーバー
```

詳しくは [AI エージェントからの利用](ai.md) を参照してください。

## Webフロントエンド

```bash
cd frontend
bun install
bun run dev   # frontend/src/wasm が無ければ先に WASM をビルド
```

ブラウザで http://localhost:5173 を開きます。ヘッダーからサンプル機体（MOMO、S-310、S-520、SS-520-5、イプシロン、H-IIA、H3、サターンV、アリアン5、ファルコン9、ソユーズ2.1a、長征3B/E）を選ぶか、設定ファイルを開きます。旧C++版の `param_*.json` は CSV と一緒にドロップすれば変換して開けます。使い方の詳細は [frontend/README.md](../frontend/README.md) を参照してください。

開発用コマンド:

```bash
bunx vp check     # フォーマット・Lint・型チェック
bunx vp test run  # テスト（全サンプル機体の WASM 計算を含む）
```

## WASM（ブラウザ実行用）

```bash
bash scripts/wasm_build.sh   # frontend/src/wasm に出力
```

## 詳細情報

- [開発ガイド](development.md) - プロジェクト構成と開発方法
- [WASM ガイド](wasm.md) - WASMビルドの詳細
- [設定ファイル](configuration.md) - 設定ファイルの形式
- [出力ファイル](output.md) - 出力 CSV・JSON の列とキー
- [AI エージェントからの利用](ai.md) - JSON 出力・MCP サーバー・共有リンク
- [物理モデルと数値計算](physics.md) - 運動方程式・モデル・積分とイベント・C++版との違い
- [Webアプリ](../frontend/README.md) - 使い方と構成
