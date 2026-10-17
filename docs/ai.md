# AI エージェントからの利用

OpenTsiolkovsky は、AI エージェントやスクリプトから次の 3 つの方法で操作できます。

| 方法 | 向いている使い方 |
| --- | --- |
| [CLI の JSON 出力](#cli) | シェルを実行できるエージェント（Claude Code、Codex など）やスクリプト |
| [MCP サーバー](#mcp-サーバー) | MCP クライアント（Claude Desktop、Claude Code、Cursor など）にツールとして組み込む |
| [Web アプリの共有リンク](#web-アプリの共有リンク) | AI が作った設定を、人が Web アプリ（3D 地球儀・グラフ）で確かめる |

どれも同じ Rust コア（`src/agent.rs`）を呼ぶので、結果は同じです。

## 進め方

1. 設定ファイルの形式を知る: `openTsiolkovsky-cli schema`（JSON Schema）、または [設定ファイルガイド](configuration.md)
2. `param_*.json` を書く（最小構成は下記）
3. `validate` で確かめる（エラー・警告・見つからない CSV）
4. `run --json` で飛ばし、`summary` を読む
5. 必要なら `--monte-carlo N` で落下点の分散を出す
6. `share` で Web アプリのリンクを作り、人に見せる

### 間違えやすい点

- キー名は単位まで含めて一字一句そのまま書きます（`"burn end time(time of each stage)[s]"`）。知らないキーは無視されるので、`validate` の結果と Schema で確かめてください。
- 各段の時刻（燃焼開始・終了・分離）は**その段の開始からの相対時刻**です。姿勢プログラムの時刻だけは打ち上げからです。
- `mass initial[kg]` は**その段単体**の質量です（上段を含みません。旧C++版とは異なります）。
- CA・CN・姿勢のテーブルは機体全体で共通で、1 段目の設定から読みます。
- 参照した CSV が見つからないと、エラーにはならず定数値で計算します。`validate` の `missing_files` と警告に出ます。

最小構成の例（省略した項目は既定値。真上に向けて Isp 200 秒で 20 秒燃焼、無風・空力なし）:

```json
{
    "name(str)": "simple_test",
    "calculate condition": { "end time[s]": 300, "time step for output[s]": 1 },
    "launch": { "position LLH[deg,deg,m]": [35.0, 139.0, 0.0] },
    "stage1": {
        "mass initial[kg]": 1000,
        "thrust": { "const thrust vac[N]": 30000, "burn end time(time of each stage)[s]": 20 }
    }
}
```

## CLI

```bash
cargo build --release
B=./target/release/openTsiolkovsky-cli
```

| コマンド | 内容 |
| --- | --- |
| `$B run -c FILE --json` | 飛ばして、結果を 1 つの JSON で標準出力に書く（出力ファイルも書く） |
| `$B validate -c FILE [--json]` | 飛ばさずに設定を確かめる |
| `$B schema [param\|dispersion]` | 設定ファイル／分散ファイルの JSON Schema（単位・既定値つき） |
| `$B share -c FILE [--json] [--base-url URL]` | Web アプリで開くリンク |
| `$B mcp` | MCP サーバー（標準入出力） |

サブコマンドを省くと `run` と同じです（従来の `--config` / `--output` / `--monte-carlo` などはそのまま使えます）。`-c -` で設定を標準入力から読みます（CSV のファイル名はカレントディレクトリから探します）。Web アプリが保存した設定（`ClientConfig`）も読めます。

### 終了ステータス

| 値 | 意味 |
| --- | --- |
| 0 | 成功（`validate` では設定が有効） |
| 1 | ファイルの読み書きやシミュレーションの失敗 |
| 2 | コマンドライン引数の誤り |
| 3 | 設定が JSON として読めない、または検証エラー |

`--json` のとき、エラーも標準出力に JSON で出ます。警告は `warnings` に入ります（テキスト出力のときは標準エラー出力）。

```json
{
  "status": "error",
  "error": {
    "kind": "invalid_config",
    "message": "Configuration validation failed",
    "details": ["計算条件: 終了時間 '-1.000秒' は正の有限値である必要があります"]
  }
}
```

`kind` は `invalid_config`・`io`・`simulation`・`invalid_argument` のいずれかです。

### `validate --json`

```json
{
  "valid": true,
  "format": "param",
  "name": "simple_test",
  "stages": 1,
  "errors": [],
  "warnings": [],
  "referenced_files": [],
  "missing_files": []
}
```

無効なときは `"valid": false` と `error_kind`、`errors`（1 行 1 件）になり、終了ステータスは 3 です。`format` は `param`（CLI の `param_*.json`）か `web`（Web アプリの `ClientConfig`）です。

### `run --json`

上の最小構成を `simple_test.json` に保存した場合（値は抜粋して丸めています）:

```bash
$B run -c simple_test.json -o out/run1 --json --trajectory-points 3
```

```json
{
  "status": "ok",
  "name": "simple_test",
  "summary": {
    "max_altitude_m": 5383.55,
    "max_altitude_time_s": 28.0,
    "max_dynamic_pressure_pa": 102180.7,
    "max_mach_number": 1.62,
    "impact_point": { "latitude_deg": 35.0, "longitude_deg": 139.0, "speed_mps": 40.15, "time_s": 148.93 },
    "events": [
      { "kind": "ignition", "time_s": 0.0, "altitude_m": 0.0, "...": "..." },
      { "kind": "mach1", "time_s": 13.87, "altitude_m": 2171.97, "...": "..." },
      { "kind": "burnout", "time_s": 20.0, "altitude_m": 4768.07, "...": "..." },
      { "kind": "apogee", "time_s": 27.79, "altitude_m": 5383.78, "...": "..." },
      { "kind": "impact", "time_s": 148.93, "altitude_m": 0.0, "...": "..." }
    ],
    "...": "..."
  },
  "warnings": [],
  "files": {
    "trajectory": "out/run1_trajectory.csv",
    "summary": "out/run1_summary.json",
    "dynamics_cpp": "out/run1_dynamics_cpp.csv",
    "fall_bodies": []
  },
  "trajectory": [
    { "time_s": 0.0, "...": "..." },
    {
      "time_s": 75.0, "altitude_m": 3211.23, "latitude_deg": 35.0, "longitude_deg": 138.99995,
      "downrange_m": 10.99, "speed_inertial_mps": 384.53, "speed_earth_mps": 47.19, "mach": 0.14,
      "dynamic_pressure_pa": 990.41, "mass_kg": 694.09, "thrust_n": 0.0, "stage": 1, "flight_mode": "free_ballistic"
    },
    { "time_s": 148.93, "...": "..." }
  ]
}
```

- `summary` は `<出力名>_summary.json` と同じ内容です（最高高度、最大動圧、燃焼終了時の軌道要素、落下点、飛行イベント、使用済みの段・投棄物の落下点。各キーは [出力ファイル](output.md) を参照）。
- `trajectory` は `--trajectory-points N` を付けたときだけ、等間隔に間引いた N 点（最初と最後を含む）です。全点は `files.trajectory` の CSV にあります。
- `--monte-carlo N` を付けると `monte_carlo` が加わります（下記 MCP の `run_monte_carlo` と同じ内容）。

## MCP サーバー

`openTsiolkovsky-cli mcp` は [Model Context Protocol](https://modelcontextprotocol.io/) のサーバーです。標準入出力で 1 行 1 メッセージの JSON-RPC を読み書きし、ログは標準エラー出力に出します。

### 登録

先にリリースビルドします（`cargo build --release`）。

Claude Code:

```bash
claude mcp add opentsiolkovsky -- /path/to/OpenTsiolkovsky/target/release/openTsiolkovsky-cli mcp
```

このリポジトリで Claude Code を開くと、`.mcp.json` のサーバー（`cargo run --release` で起動）を使うか確認されます。

Claude Desktop（`claude_desktop_config.json`）など:

```json
{
  "mcpServers": {
    "opentsiolkovsky": {
      "command": "/path/to/OpenTsiolkovsky/target/release/openTsiolkovsky-cli",
      "args": ["mcp"]
    }
  }
}
```

ファイルの相対パスは、サーバーの作業ディレクトリ（クライアントが起動した場所）から解決します。確実にするには絶対パスを渡してください。

### ツール

| ツール | 内容 |
| --- | --- |
| `get_config_schema` | 設定ファイル（`format: "param"`）または分散（`"dispersion"`）の JSON Schema |
| `get_example_config` | 最小構成と完全な設定例、分散の既定値 |
| `validate_config` | 飛ばさずに確かめる（`validate --json` と同じ結果） |
| `run_simulation` | 飛ばして概要とイベント、間引いた軌跡を返す（`trajectory_points` 既定 50、`output_prefix` を渡すと CSV なども書く） |
| `run_monte_carlo` | 分散解析。物体ごとの平均落下点と 1σ・95 %・99 % 誤差楕円（`cases` 既定 100・上限 10000、`seed`、`dispersion` か `dispersion_path`、`output_prefix`） |
| `create_share_link` | Web アプリで開くリンク（`base_url` 省略時は公開サイト） |

設定は、どのツールでも `config_path`（`param_*.json` のパス。CSV はその隣から探す）か `config`（JSON オブジェクト。CSV は `base_dir` から探す）で渡します。結果は `structuredContent` に JSON で入り、同じものが `content` にテキストでも入ります。設定が無効なときや失敗したときは `isError: true` で、中身は CLI と同じエラー JSON です。

## Web アプリの共有リンク

Web アプリは URL のフラグメントで設定を受け取ります。フラグメントはサーバーに送られません。

| 形 | 内容 |
| --- | --- |
| `#preset=<id>` | サンプル機体（`h3-22s` など） |
| `#c=<payload>` | 設定。payload は JSON を raw DEFLATE で圧縮し、base64url（パディングなし）にしたもの |

`#c=` の JSON は次のどれかです。

- Web アプリの設定（`ClientConfig`。Web アプリの「共有リンク」が作る形）
- CLI の `param_*.json` そのもの
- `{ "legacy": <param_*.json>, "files": { "<CSV ファイル名>": "<CSV の中身>" } }` — `share` と `create_share_link` が作る形。参照する CSV を同梱するので、テーブルも含めて CLI と同じ結果になります

```bash
$B share -c examples/SS-520-4/param_SS520-4.json
# https://open-tsiolkovsky.vercel.app/#c=7Vh7a-M4EP8q...
```

既定のリンク先は公開サイト（`https://open-tsiolkovsky.vercel.app/`）です。`--base-url`（MCP では `base_url`）か環境変数 `OPENTSIOLKOVSKY_WEB_URL` で、ローカルの開発サーバー（`http://localhost:5173/`）などに変えられます。CSV の大きい設定ではリンクが長くなります（SS-520-4 で約 1.7 kB）。
