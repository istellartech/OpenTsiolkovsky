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

#### 出力ファイル

| ファイル | 内容 |
| --- | --- |
| `<出力名>_trajectory.csv` | 機体の時系列（位置・速度・質量・Mach・動圧・推力・加速度・飛行モード・IIP・緯度経度・ダウンレンジ・段） |
| `<出力名>_dynamics_cpp.csv` | 旧C++版と同じ列構成の時系列 |
| `<出力名>_dynamics_cpp_<N>_fall.csv` / `_<N>_dump.csv` | 分離後の N 段・N 段の投棄物が落ちていく時系列 |
| `<出力名>_summary.json` | 最高高度・最大動圧などの概要、飛行イベント（着火・離昇・マッハ1・最大動圧・燃焼終了・分離・遠地点・着地）、燃焼終了時の軌道要素、落下点 |

各列とキーの意味は [出力ファイル](output.md) にあります。`--verbose` を付けるとイベントの一覧と燃焼終了時の軌道も表示します。

実行時には各物体の落下点も表示されます（旧C++版と同じ形式）。

```
vehicle impact point [deg]:	28.441554	142.507390	(T+1882.8 s)
1 stage impact point [deg]:	31.245380	131.125613	(T+330.8 s)
2 stage impact point [deg]:	31.220407	131.303028	(T+620.4 s)
```

使用済みの段は姿勢制御がないため、慣性飛行モードが「1: 指定姿勢」の段も、分離後は「0: 空力安定」として落下を計算します。周回軌道に入るなど地表に落ちない物体は計算しません。

#### 分散解析（モンテカルロ）

```bash
./target/release/openTsiolkovsky-cli --config examples/SS-520-4/param_SS520-4.json \
  --output ss520 --monte-carlo 500 --dispersion examples/dispersion_sample.json --seed 1
```

推力・比推力・各段の質量・抗力・姿勢（上下角・方位角）・風速・風向・大気密度（設定すれば CN・分離時刻・風速倍率も）をばらつかせて N 回飛ばし、機体と使用済みの段・投棄物の落下点を集計します。`--dispersion` の JSON には 1σ の値を書きます（省略したキーは `examples/dispersion_sample.json` と同じ既定値）。正規分布か一様分布か、段ごとに独立に引くかも選べます（[出力ファイル](output.md#モンテカルロ)）。全 CPU コアで並列に計算し、同じ `--seed` なら同じ結果になります。

- `<出力名>_montecarlo.csv`: 1 行 1 ケース。引いた乱数（各パラメータのずれ）、最高高度、物体ごとの落下時刻・緯度・経度
- `<出力名>_montecarlo_summary.json`: 物体ごとの落下数、平均落下点、南北・東西の標準偏差、1σ・95 %・99 % の誤差楕円（長径・短径・長軸の方位）、平均点からの最大のずれ

### Webフロントエンド

```bash
cd frontend
bun install
bun run dev   # frontend/src/wasm が無ければ先に WASM をビルド
```

ブラウザで http://localhost:5173 を開きます。ヘッダーからサンプル機体（MOMO、S-310、S-520、SS-520-5、イプシロン、H-IIA、H3、サターンV、アリアン5）を選ぶか、CLI 用の `param_*.json` を CSV と一緒にドロップして開けます。使用済みの段・投棄物の落下点や IIP は地図とイベント表に、分散解析は下のパネルの「分散解析」タブにあります。使い方の詳細は [frontend/README.md](../frontend/README.md) を参照してください。

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
- [出力ファイル](output.md) - 出力 CSV・JSON の列とキー
- [物理モデルと数値計算](physics.md) - 運動方程式・モデル・積分とイベント・C++版との違い
- [Webアプリ](../frontend/README.md) - 使い方と構成