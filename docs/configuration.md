# 設定ファイル

CLI・Webアプリ・WASM・MCP サーバーは同じ JSON 設定を読みます。キーは snake_case で、末尾が単位です（`_s` 秒、`_m` メートル、`_kg`、`_n` ニュートン、`_deg` 度、`_mps` m/s、`_percent` % など）。サンプルは `examples/sample_01.json`、`examples/momo.json`、`examples/SS-520-4/ss520_4.json`（CSV テーブル付きの3段）です。

- 機械可読な定義（JSON Schema）: `openTsiolkovsky-cli schema`
- 飛ばさずに確認: `openTsiolkovsky-cli validate CONFIG`（問題のある値を JSON パスで示します）
- 旧C++版の `param_*.json` からの変換: `openTsiolkovsky-cli convert param.json -o config.json`（[下記](#旧c版の設定ファイルからの変換)）

知らないキー（綴りの誤りなど）はエラーになります。表で既定値のあるキーは省略できます。

## 最小構成

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

真上（仰角 90°）に向けて 20 秒燃焼し、無風・空力係数なし（弾道係数 100 kg/m²）で飛びます。

## 定数・表・CSV（`Curve`）

時刻や Mach 数で変わりうる量は、次の3つの書き方ができます。表は線形補間で、範囲外は端の値を使います。

```jsonc
"thrust_vac_n": 15000                          // 定数
"thrust_vac_n": [[0, 16000], [10, 12000], [30, 5000]]   // 表 [x, y]（x は昇順）
"thrust_vac_n": { "file": "thrust.csv" }        // CSV ファイル（1列目が x、2列目が y）
"elevation_deg": { "file": "attitude.csv", "columns": [0, 2] }  // 使う列を指定（0 始まり）
```

CSV は数値でない行（ヘッダーなど）を読み飛ばし、設定ファイルのあるディレクトリから相対パスで探します。Webアプリはファイルを読めないため、表は設定の中に書きます（`openTsiolkovsky-cli share` はファイルを読み込んで埋め込みます）。

## 全体

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `name` | — | 名前 |
| `simulation` | — | 計算条件 |
| `launch` | — | 打ち上げ条件 |
| `atmosphere` | USSA1976・変動なし | 大気 |
| `wind` | 無風 | 風 |
| `attitude` | 真上 | 姿勢プログラム（機体全体） |
| `stages` | — | 段（1段目から順に） |

## `simulation`

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `end_time_s` | — | 計算終了時刻（打ち上げから）。着地でも終わります |
| `output_step_s` | 1 | 出力間隔。出力時刻は `k × 間隔` で、丸め誤差は積み重なりません |
| `integrator` | `{"method": "rk4"}` | 積分器（下記） |

`integrator` は `method` で種類を選びます。

| 書き方 | 内容 |
| --- | --- |
| `{"method": "rk4", "step_s": 0.1}` | 固定刻みの RK4。`step_s` の既定は出力間隔の半分。区間は等分され、イベントや出力時刻にぴったり止まります |
| `{"method": "rk45", "abs_tol": 1e-9, "rel_tol": 1e-9}` | Dormand–Prince 5(4)、刻み幅を自動調整。許容誤差は全成分共通（kg・m・m/s）、既定 1e-9 |

## `launch`

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `latitude_deg`, `longitude_deg` | — | 発射地点 |
| `altitude_m` | 0 | WGS84 楕円体高 |
| `time_utc` | `"2000-01-01T00:00:00Z"` | 打ち上げ時刻（ISO 8601。`+09:00` などの時差付きは UTC に換算）。軌道要素の昇交点赤経に使います |
| `velocity_ned_mps` | [0, 0, 0] | 初速（地球に対する北・東・下）。0 なら発射台で保持します。0 以外（空中発射・飛行途中からの再開）では保持もレールもありません |
| `rail_length_m` | 0 | ランチャのレール長（打ち上げ時の機軸の向き）。0 なら保持のみ（[ランチャ](physics.md#発射台とランチャ)） |

## `atmosphere`

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `model` | `"ussa1976"` | `"ussa1976"`: 86 km までジオポテンシャル高度で計算し、86〜1000 km は U.S. 標準大気 1976 の表値。`"legacy"`: 旧C++版と同じ（各層を幾何高度で評価し、84.852 km 以上は等温で外挿）（[大気](physics.md#大気)） |
| `seasonal_variation_percent` | 0 | 季節変動（-100〜100）。U.S. 標準大気の季節変動の高度分布に沿って密度を変えます（低高度と高高度で符号が逆） |
| `density_deviation` | なし | 高度ごとの密度の偏差の表 `[高度 m, 偏差 %]`。指定すると季節変動の代わりに使います |

## `wind`

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `speed_mps`, `direction_deg` | 0, 0 | 一定の風。風向は風が吹いてくる方位（北から時計回り） |
| `profile` | なし | 高度ごとの風の表 `[高度 m, 風速 m/s, 風向 deg]`。指定すると一定の風の代わりに使います |

表は北・東成分に分けて補間するので、350° と 10° の中間は 0°（北）になります。

## `attitude`

姿勢プログラムは機体全体に共通で、時刻は打ち上げからの秒です。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `azimuth_deg` | 0 | 機軸の方位角（北から時計回り）。定数か表 |
| `elevation_deg` | 90 | 機軸の仰角（水平から上向き）。定数か表（ピッチプログラム） |
| `roll_deg` | 0 | ロール角。定数か表 |
| `yaw_offset_deg`, `pitch_offset_deg`, `roll_offset_deg` | 0 | 機体の取り付け誤差。姿勢プログラムから Z→Y→X 軸まわりに回します（旧C++版と同じ） |
| `gyro_bias_deg_h` | [0, 0, 0] | 機体 X・Y・Z 軸のジャイロバイアス。打ち上げからの時間に比例して姿勢がずれます |

## `stages[]`

各段の時刻はその段の開始（前段の分離）からの秒です。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `mass_initial_kg` | — | この段単体の初期質量（上段を含まない） |
| `mass_dry_kg` | なし | 推進剤を除いた質量。推進剤（初期 − 乾燥）を使い切ると燃焼を終えます。省略時は段の質量すべてを燃やせます |
| `engine` | なし | エンジン（下記）。省略するとこの段は推力なし |
| `aero` | 下記の既定値 | 空力（下記） |
| `free_flight` | `"ballistic"` | 燃焼していないときの飛び方。`"ballistic"`: 弾道係数で減速、`"aero_stable"`: 機軸が気流に沿う（軸力のみ）、`"attitude_program"`: 姿勢プログラムに従う（軸力と法線力） |
| `separation_time_s` | — | 上段の分離時刻。最終段以外は必須 |
| `jettisons` | [] | この段の飛行中に切り離す物体（下記） |
| `thrust_trim` | なし | 推力トリム（下記） |

### `engine`

推力は `真空推力 − 出口面積 × 大気圧`（負にはしません）、質量流量は `真空推力 / (真空Isp × g0)` です。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `thrust_vac_n` | — | 真空推力。定数か段の時刻の表 |
| `isp_vac_s` | — | 真空比推力。定数か段の時刻の表 |
| `burn_start_s` | 0 | 点火 |
| `burn_end_s` | — | 燃焼終了。分離が先ならそこで、推進剤が先に尽きればそこで終わります |
| `nozzle_exit_area_m2` | 0 | ノズル出口面積（背圧損失）。スロート径 d と開口比 ε からは π/4·d²·ε |

### `aero`

空力は段ごとです。その段より上を載せて飛んでいる間と、分離後に落ちていくときに使います。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `diameter_m` | 0.5 | 基準直径（基準面積 = π/4 × 直径²） |
| `ca` | 0 | 軸力係数 CA。定数か Mach の表 |
| `ca_power_off` | `ca` と同じ | 燃焼していないときの CA（ベース抗力の違い）。定数か Mach の表 |
| `cn_alpha_per_rad` | 0 | 法線力傾斜 CNα [1/rad]。法線力 = CNα × 迎角 [rad] × 動圧 × 基準面積。定数か Mach の表 |
| `cn_table` | なし | Mach × 迎角の CN の表（下記）。指定すると `cn_alpha_per_rad` の代わりに使います |
| `ballistic_coefficient_kg_m2` | 100 | `free_flight: "ballistic"` の弾道係数 β（抗力加速度 = 動圧 / β） |

迎角が両軸にあるときは、全迎角での CN を気流の横成分の向きにかけます（[空力](physics.md#空力)）。

### Mach × 迎角の表（`cn_table`、`thrust_trim.cp_sta_m`）

```json
"cn_table": {
  "mach": [0, 0.5, 1.2, 3],
  "alpha_deg": [0, 2, 5, 10, 20, 90],
  "values": [[0, 0.12, 0.30, 0.6, 1.2, 1.8], ...]
}
```

`values[i][j]` が `mach[i]`・`alpha_deg[j]` の値です。補間は旧C++版と同じ三角形分割、範囲外は端の値です。CSV で書くときは 1 行目が「任意の値, 迎角…」、2 行目以降が「Mach, 値…」です（旧C++版の CN・CP ファイルと同じ）。

```
0,0,1,2,3,4,6,8,10,15,20,30,45,90,180
0.0,0,0.06,0.12,...
```

### `jettisons[]`

フェアリングなど、その段の飛行中に切り離す物体です。質量は機体から減り、物体は弾道係数で落下点まで計算されます。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `name` | `jettison<N>` | 出力での名前（`stage2_fairing` のように使います） |
| `time_s` | — | 切り離し時刻（段の開始後、分離より前） |
| `mass_kg` | — | 質量（段の乾燥質量の一部） |
| `ballistic_coefficient_kg_m2` | 100 | 弾道係数 |
| `delta_v_ned_mps` | [0, 0, 0] | 切り離し時に加わる速度（北・東・下） |

### `thrust_trim`

重心・圧力中心・推力点の位置から、空力モーメントを打ち消すように推力の向き（ジンバル角）を決めます（旧C++版の neutrality と同じ計算）。位置は機首から後方への距離 STA [m] です。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `cg_sta_m` | — | 重心。定数か段の時刻の表 |
| `gimbal_sta_m` | — | 推力点（ジンバル）。定数か段の時刻の表 |
| `cp_sta_m` | — | 圧力中心の Mach × 迎角の表 |
| `cg_offset_m`, `cp_offset_m`, `gimbal_offset_m` | [0, 0, 0] | 機体軸（X 前方）でのずれ |

求めたジンバル角は出力の `gimbal_pitch_deg` / `gimbal_yaw_deg` に出ます。

## 検証

`validate` と読み込み時の検証は、物理的に不正な値（負の質量、範囲外の緯度、燃焼終了が開始より前、最終段以外の分離時刻なし、読めない表など）をエラーに、珍しいが有効な値（高度 10 km 以上や初速 100 m/s 以上からの開始、Isp が 100〜500 秒の外、分離が燃焼終了より前、推進剤が足りない燃焼など）を警告にします。どちらも JSON パス付きです。

```
Error: stages[1].engine.burn_end_s: 2 must not be earlier than burn_start_s (5)
Warning: stages[0].engine.burn_end_s: the stage separates at 31.7 s, before the burn ends; the burn stops there
```

## 旧C++版の設定ファイルからの変換

```bash
openTsiolkovsky-cli convert param_sample_01.json -o sample_01.json
```

`"burn end time(time of each stage)[s]"` のようなキーの旧形式（`param_*.json`）を、旧C++版と同じ計算になるように変換します。CSV テーブルは読み込んで設定の中に書き込みます。

- 推力係数・Isp 係数・CA/CN の倍率は値に掛け込みます（推力係数 k は推力を k 倍、時間を 1/k に）。強制停止は燃焼終了に反映します
- 1段目から読んでいた CA・CN の表と姿勢プログラムは、各段・`attitude` に書き込みます
- 推力トリムの CG ファイル（打ち上げからの時刻）は段の時刻に直します
- 大気モデルは `"legacy"` になります
- 見つからない CSV は（旧版と同じく）定数を使い、警告を出します。動力飛行モード（0 以外）と 6DoF の設定は使いません

Webアプリにも旧形式の JSON を CSV と一緒にドロップすれば、同じ変換で開けます。
