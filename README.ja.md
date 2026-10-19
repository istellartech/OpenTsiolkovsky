# OpenTsiolkovsky [![CI](https://github.com/istellartech/OpenTsiolkovsky/workflows/ci/badge.svg)](https://github.com/istellartech/OpenTsiolkovsky/actions)

[English](README.md) | 日本語

![OpenTsiolkovsky](docs/OpenTsiolkovsky_Logo_small.png)

OpenTsiolkovsky は、多段ロケットの打ち上げから落下までを計算するオープンソースの飛行シミュレータです。コマンドラインツールとして使えるほか、ブラウザだけで計算する Web アプリもあります：**[open-tsiolkovsky.vercel.app](https://open-tsiolkovsky.vercel.app/)**

## できること

- 観測ロケットから人工衛星打上げロケットまで、質点（3DoF）として飛ばします。姿勢は指定したプログラムに従い、地球は WGS84（自転・J2 重力）、大気は U.S. 標準大気 1976、風も考慮します。
- 段・エンジン（推力と比推力は定数か表）・段ごとの空力・投棄物（フェアリングなど）・ランチャ・推力トリムを扱います。
- 飛行イベント（離昇・音速突破・最大動圧・燃焼終了・分離・最高点・着地）と軌道要素、機体・使用済みの段・投棄物の落下点を出します。
- モンテカルロ分散解析で、落下点の 1σ・95 %・99 % 誤差楕円を求めます。
- Web アプリ：3D 地球儀・グラフ・再生、公開資料から作ったサンプル機体（MOMO、S-520、イプシロン、H-IIA、H3、ファルコン9、サターンV など）、共有リンク、日本語・英語表示。
- AI エージェントから JSON 出力と MCP サーバーで操作できます。

## はじめかた

### Web アプリ

[open-tsiolkovsky.vercel.app](https://open-tsiolkovsky.vercel.app/) を開き、ヘッダーからサンプル機体を選んで編集します。入力するとすぐに再計算します。ファイルメニューから設定の保存・読み込み、CSV・KML の書き出し、共有リンクのコピーができます（設定は URL に埋め込まれ、サーバーには送られません）。

### コマンドライン

[Releases](https://github.com/istellartech/OpenTsiolkovsky/releases) から自分のマシン用のファイル（Windows x64、Apple Silicon の macOS、Linux x64 / Ubuntu 22.04 以降）をダウンロードして展開し、そのフォルダで `openTsiolkovsky-cli` を実行します。サンプル機体も入っています。macOS で実行がブロックされたら、一度だけ `xattr -d com.apple.quarantine openTsiolkovsky-cli` を実行してください。ソースからビルドする場合は Rust（stable）を入れて `cargo build --release` です。

```bash
B=./openTsiolkovsky-cli                          # またはソースからなら ./target/release/openTsiolkovsky-cli

$B run examples/momo.json -o out/momo            # trajectory.csv・summary.json・bodies/*.csv を出力
$B monte-carlo examples/SS-520-4/ss520_4.json -n 500 -o out/ss520
$B validate my_rocket.json                       # 飛ばさずに設定を確認
```

設定は JSON ファイルです。キーの末尾が単位で、変化する量は定数・表・CSV ファイルのどれでも書けます。

```json
{
  "name": "minimal",
  "simulation": { "end_time_s": 300 },
  "launch": { "latitude_deg": 35, "longitude_deg": 139 },
  "attitude": { "azimuth_deg": 90, "elevation_deg": [[0, 90], [10, 90], [60, 70]] },
  "stages": [{
    "mass_initial_kg": 1000,
    "engine": { "thrust_vac_n": 30000, "isp_vac_s": 200, "burn_end_s": 20 },
    "aero": { "diameter_m": 0.5, "ca": 0.4 }
  }]
}
```

[`examples/`](examples/) には Web アプリのサンプル機体が設定ファイルとして入っています：`momo`、`s310`、`s520`、`ss520-5`、`epsilon`、`h2a202`、`h3-22s`、`falcon9`、`saturn-v`、`ariane5`、`soyuz-2.1a`、`long-march-3b`（`SS-520-4/` は CSV テーブルの例）。Web アプリも同じファイルを読み書きします。

### AI エージェント

```bash
$B run examples/momo.json --json      # 結果を 1 つの JSON で標準出力
$B schema                             # 設定ファイルの JSON Schema
$B share examples/momo.json           # Web アプリで開くリンク
claude mcp add opentsiolkovsky -- "$PWD/target/release/openTsiolkovsky-cli" mcp
```

JSON の形式・終了ステータス・MCP のツールは [docs/ai.md](docs/ai.md) にあります。

## ドキュメント

- [設定ファイル](docs/configuration.md)：全項目・単位・既定値
- [出力ファイル](docs/output.md)：`trajectory.csv`・`summary.json`・分散解析の出力
- [物理モデルと数値計算](docs/physics.md)
- [最適化の実装と検証](docs/optimization.md)：MOMO単段・仮定した多段機の最適化、設定フォーム・3D表示・保存履歴、native/WASI・LGR・独立再積分の検証
- [AI エージェントからの利用](docs/ai.md)：JSON 出力・MCP サーバー・共有リンク
- [開発ガイド](docs/development.md)：ビルド・テスト・WASM・構成
- [Web アプリの構成](frontend/README.md)

旧C++版は git タグ [`cpp-v0.52`](https://github.com/istellartech/OpenTsiolkovsky/tree/cpp-v0.52/legacy_cpp) に残してあります。

## ライセンス

MIT
