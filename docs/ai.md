# AI エージェントからの利用

軌道最適化の開発用ベンチマークは、独立した`openTsiolkovsky-optimize`バイナリで実行します。
そのschema・終了コード・例は[最適化の実装と検証](optimization.md)を参照してください。
以下の既存シミュレータ/MCPの入出力は変更していません。

OpenTsiolkovsky は、AI エージェントやスクリプトから次の 3 つの方法で操作できます。

| 方法 | 向いている使い方 |
| --- | --- |
| [CLI の JSON 出力](#cli) | シェルを実行できるエージェント（Claude Code、Codex など）やスクリプト |
| [MCP サーバー](#mcp-サーバー) | MCP クライアント（Claude Desktop、Claude Code、Cursor など）にツールとして組み込む |
| [Web アプリの共有リンク](#web-アプリの共有リンク) | AI が作った設定を、人が Web アプリ（3D 地球儀・グラフ）で確かめる |

どれも同じ Rust コア（`src/agent.rs`）を呼び、設定ファイルも同じ形式なので、結果は同じです。

## 対応状況（v1.0.0 時点）

| 項目 | 状況 |
| --- | --- |
| 設定ファイルの JSON Schema（`schema`、MCP `get_config_schema`） | ✅ 設定と分散ファイル（単位・既定値・説明つき） |
| 設定の検証（`validate`） | ✅ 解析エラー・値の検証・読めない表・警告。すべて JSON パス付き |
| 1 回の飛行（`run --json`、MCP `run_simulation`） | ✅ 概要・イベント・落下点・間引いた軌跡。全時系列は CSV ファイルで |
| 分散解析（`monte-carlo`、MCP `run_monte_carlo`） | ✅ 1 回 10000 ケースまで（全 CPU コアで並列） |
| Web アプリで開くリンク（`share`、MCP `create_share_link`） | ✅ CSV の表は埋め込み。リンクを開くのは人（AI に結果は返りません） |
| 旧C++版の `param_*.json` | ✅ `convert`（MCP `convert_legacy_config`）で変換してから使います |
| MCP の通信方式 | ✅ 標準入出力（ローカル）のみ。HTTP（リモート MCP）は未対応 |
| MCP の機能 | ✅ ツールのみ。リソース・プロンプト・進捗通知は未対応 |
| Web アプリを AI が直接操作する | ❌ 未対応。URL で設定を渡すことだけできます |
| Web サイトの AI 向け案内 | ✅ `/llms.txt` |
| Claude Code 用スキル | ✅ `.claude/skills/rocket-sim/`（このリポジトリで開いたとき） |

物理モデルの範囲（3DoF のみなど）は [物理モデル](physics.md) を参照してください。

## 進め方

1. 設定ファイルの形式を知る: `openTsiolkovsky-cli schema`（JSON Schema）、または [設定ファイル](configuration.md)
2. 設定 JSON を書く（最小構成は下記）
3. `validate` で確かめる
4. `run --json` で飛ばし、`summary` を読む
5. 必要なら `monte-carlo` で落下点の分散を出す
6. `share` で Web アプリのリンクを作り、人に見せる

### 間違えやすい点

- 各計算区間の時刻（`burn_start_s`、`burn_end_s`、`separation_time_s`、表の時刻）は**その区間の開始からの相対時刻**です。姿勢プログラム（`attitude`）の時刻だけは打ち上げからです。
- `mass_initial_kg` は**その区間の割当質量**です（後続区間分を含みません）。通常は段単体の初期質量ですが、ブースタ近似では同時にコアが消費する推進剤も含みます。
- 最終区間以外は `separation_time_s` が必要です。
- `stages[]` と出力の `stage` は計算区間です。ブースタの分離前後で同じ実機の段を分割する場合があります。実機の段数は任意の `presentation.stage_count`、ブースタ本数は `presentation.booster_count` で指定できます。各区間の `presentation.name` / `separation_name` / `engine_continues` と投棄物の `display_name` は表示専用です。旧設定・数値計算・JSON出力キー・ID・終了コードは変更しません。`validate` の人向け表示は計算区間数を `calculation intervals` と表記します（[詳細](configuration.md#表示専用の構成名前)）。
- 空力（`aero`）は区間ごとです。その区間の機体全体と、区間末の分離物の落下計算に使います。
- 知らないキーはエラーになります（`validate` が場所を示します）。

最小構成（真上に向けて Isp 200 秒で 20 秒燃焼、無風・空力係数なし）:

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

## CLI

```bash
cargo build --release
B=./target/release/openTsiolkovsky-cli
```

| コマンド | 内容 |
| --- | --- |
| `$B run CONFIG [-o DIR] [--json]` | 飛ばして `DIR`（既定 `output`）に結果を書く。`--json` で結果を 1 つの JSON で標準出力に |
| `$B monte-carlo CONFIG [-n N] [--dispersion FILE] [--seed S] [-o DIR] [--json]` | 分散解析 |
| `$B validate CONFIG [--json]` | 飛ばさずに設定を確かめる |
| `$B schema [config\|dispersion]` | 設定ファイル／分散ファイルの JSON Schema |
| `$B convert LEGACY.json [-o OUT.json] [--json]` | 旧C++版の `param_*.json` を変換（CSV は読み込んで埋め込み） |
| `$B share CONFIG [--base-url URL] [--json]` | Web アプリで開くリンク |
| `$B mcp` | MCP サーバー（標準入出力） |

`CONFIG` に `-` を渡すと標準入力から読みます（`{"file": ...}` の表はカレントディレクトリから探します）。

### 終了ステータス

| 値 | 意味 |
| --- | --- |
| 0 | 成功（`validate` では設定が有効） |
| 1 | ファイルの読み書きの失敗など |
| 2 | コマンドライン引数の誤り |
| 3 | 設定が JSON として読めない、または検証エラー |

`--json` のとき、エラーも標準出力に JSON で出ます。

```json
{
  "status": "error",
  "error": {
    "kind": "invalid_config",
    "message": "the configuration is invalid",
    "issues": [
      { "path": "simulation.end_time_s", "message": "-1 must be positive" }
    ]
  }
}
```

`kind` は `invalid_config`・`io`・`simulation`・`invalid_argument` のいずれかです。

### `validate --json`

```json
{
  "valid": true,
  "name": "minimal",
  "stages": 1,
  "errors": [],
  "warnings": [],
  "referenced_files": []
}
```

無効なときは `"valid": false` で、`errors` と `warnings` に `{ "path", "message" }` が並び、終了ステータスは 3 です。

### `run --json`

```bash
$B run minimal.json -o out/run1 --json --trajectory-points 3
```

```jsonc
{
  "status": "ok",
  "name": "minimal",
  "summary": {
    "name": "minimal",
    "flight_time_s": 148.93,
    "impact": { "time_s": 148.93, "latitude_deg": 35.0, "longitude_deg": 138.99997, "speed_mps": 40.15 },
    "maxima": {
      "altitude_m": { "value": 5383.5, "time_s": 27.78 },
      "dynamic_pressure_pa": { "value": 102220.0, "time_s": 20.0 },
      "...": "..."
    },
    "final_state": { "...": "..." },
    "events": [
      { "kind": "ignition", "stage": 1, "time_s": 0.0, "altitude_m": 0.0, "...": "..." },
      { "kind": "mach1", "stage": 1, "time_s": 13.87, "...": "..." },
      { "kind": "burnout", "stage": 1, "time_s": 20.0, "orbit": { "...": "..." }, "...": "..." },
      { "kind": "apogee", "stage": 1, "time_s": 27.78, "...": "..." },
      { "kind": "impact", "stage": 1, "time_s": 148.93, "...": "..." }
    ],
    "bodies": []
  },
  "warnings": [],
  "files": { "trajectory": "out/run1/trajectory.csv", "summary": "out/run1/summary.json", "bodies": [] },
  "trajectory": [
    { "time_s": 0.0, "...": "..." },
    {
      "time_s": 75.0, "stage": 1, "flight_mode": "ballistic", "altitude_m": 3211.2,
      "latitude_deg": 35.0, "longitude_deg": 138.99995, "downrange_m": 11.0,
      "speed_earth_mps": 47.2, "speed_inertial_mps": 384.5, "mach": 0.14,
      "dynamic_pressure_pa": 990.4, "mass_kg": 694.1, "thrust_n": 0.0
    },
    { "time_s": 148.93, "...": "..." }
  ]
}
```

- `summary` は `summary.json` と同じ内容です（[出力ファイル](output.md#summaryjson)）。
- `trajectory` は `--trajectory-points N` のときだけ、等間隔に間引いた N 点（最初と最後を含む）です。全点は `files.trajectory` の CSV にあります。
- `warnings` は `{ "path", "message" }` の配列です。

### `monte-carlo --json`

`status`、`name`、`cases`、`failed_cases`、`seed`、`dispersion`、`statistics`（物体ごとの平均落下点・誤差楕円。[出力ファイル](output.md#モンテカルロ)）、`warnings`、`files` を返します。

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
| `get_config_schema` | 設定（`format: "config"`）または分散（`"dispersion"`）の JSON Schema |
| `get_example_config` | 最小構成と完全な設定例、分散の既定値 |
| `validate_config` | 飛ばさずに確かめる（`validate --json` と同じ結果） |
| `run_simulation` | 飛ばして概要とイベント、間引いた軌跡を返す（`trajectory_points` 既定 50、`output_dir` を渡すとファイルも書く） |
| `run_monte_carlo` | 分散解析（`cases` 既定 100・上限 10000、`seed`、`dispersion` か `dispersion_path`、`output_dir`） |
| `create_share_link` | Web アプリで開くリンク（`base_url` 省略時は公開サイト） |
| `convert_legacy_config` | 旧C++版の `param_*.json` を変換 |

設定は、どのツールでも `config_path`（JSON ファイルのパス。`{"file": ...}` の表はその隣から探す）か `config`（JSON オブジェクト。表は `base_dir` から探す）で渡します。結果は `structuredContent` に JSON で入り、同じものが `content` にテキストでも入ります。設定が無効なときや失敗したときは `isError: true` で、中身は CLI と同じエラー JSON です。

## Web アプリの共有リンク

Web アプリは URL のフラグメントで設定を受け取ります。フラグメントはサーバーに送られません。

| 形 | 内容 |
| --- | --- |
| `#preset=<id>` | サンプル機体（`h3-22s` など） |
| `#c=<payload>` | 設定。payload は設定の JSON を raw DEFLATE で圧縮し、base64url（パディングなし）にしたもの |

`share` と `create_share_link` は、`{"file": ...}` の表を読み込んで埋め込んだ設定をリンクにします。

```bash
$B share examples/SS-520-4/ss520_4.json
# https://open-tsiolkovsky.vercel.app/#c=7Vh7a-M4EP8q...
```

既定のリンク先は公開サイト（`https://open-tsiolkovsky.vercel.app/`）です。`--base-url`（MCP では `base_url`）か環境変数 `OPENTSIOLKOVSKY_WEB_URL` で、ローカルの開発サーバー（`http://localhost:5173/`）などに変えられます。

## 実装の場所（開発者・AI 向け）

| ファイル | 役割 |
| --- | --- |
| `src/agent.rs` | 共通の処理（Schema・検証・飛行・分散解析・変換・共有リンク）とエラーの種類。CLI と MCP の両方が呼びます |
| `src/mcp.rs` | MCP サーバー（JSON-RPC の処理とツール定義）。外部の SDK は使っていません |
| `src/main.rs` | CLI（サブコマンド、`--json`、終了ステータス） |
| `src/config/` | 設定の型（`///` コメントが JSON Schema の説明になります）、検証、旧形式の変換 |
| `frontend/src/lib/share.ts`, `frontend/src/hooks/useShareLink.ts` | Web アプリ側の共有リンクの読み込み |
| `frontend/public/llms.txt` | Web サイトの AI 向け案内 |
| `.mcp.json`, `.claude/skills/rocket-sim/SKILL.md` | Claude Code 用の設定とスキル |

`agent.rs` と `mcp.rs` はネイティブ専用で、WASM には入りません。JSON のキー・エラーの種類・終了ステータスを変えるときは、このページも更新してください。
