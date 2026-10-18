# 出力ファイル

`openTsiolkovsky-cli run CONFIG -o DIR` は出力ディレクトリ `DIR`（既定 `output`）に次のファイルを書きます。`--json` を付けると、`summary.json` の内容などを標準出力にも JSON で出します（[AI エージェントからの利用](ai.md#run---json)）。Webアプリの CSV 出力と WASM の結果も同じ列名・キーです。

| ファイル | 内容 |
| --- | --- |
| `trajectory.csv` | 機体の時系列（下記） |
| `summary.json` | 最大値・イベント・落下点などの概要（下記） |
| `bodies/<id>.csv` | 切り離された物体が落ちていく時系列（列は `trajectory.csv` と同じ）。`<id>` は使用済みの段が `stage<N>`、投棄物が `stage<N>_<名前>` |
| `montecarlo_cases.csv` / `montecarlo_summary.json` | `monte-carlo` サブコマンドの結果（[下記](#モンテカルロ)） |

時系列の行は出力間隔ごと（時刻 = `k × 間隔`）で、着地した場合は最後の行が着地の瞬間（高度 0）です。

## `trajectory.csv`

角度は度、それ以外は SI 単位です。NED は局所の北・東・下、ECI は打ち上げ時に ECEF と一致する慣性座標、機体軸は X が前方です。

| 列 | 内容 |
| --- | --- |
| `time_s` | 打ち上げからの時刻 |
| `stage` | 飛行中の段（1 始まり）。落下物ではその物体の段 |
| `flight_mode` | `powered`（燃焼中）/ `ballistic` / `aero_stable` / `attitude_program` |
| `latitude_deg`, `longitude_deg`, `altitude_m` | 位置（WGS84 楕円体高） |
| `downrange_m` | 発射地点からの地表距離 |
| `mass_kg` | 質量（上段を含む） |
| `thrust_n` | 背圧損失を引いた推力 |
| `isp_s` | 有効比推力 `推力 / (質量流量 × g0)`（推力なしで 0） |
| `vel_north_mps`, `vel_east_mps`, `vel_down_mps` | 対地速度（NED） |
| `speed_earth_mps`, `speed_inertial_mps` | 対地速度・慣性速度の大きさ |
| `mach`, `dynamic_pressure_pa` | 対気速度による Mach 数と動圧 |
| `azimuth_deg`, `elevation_deg`, `roll_deg` | 機体姿勢（姿勢プログラムに取り付け誤差とジャイロドリフトを加えたもの。気流に沿うモードでは気流の向き） |
| `alpha_deg`, `beta_deg`, `aoa_total_deg` | 迎角 `atan2(w, u)`、横滑り角 `atan2(v, u)`、全迎角 |
| `accel_body_x/y/z_mps2` | 機体軸の加速度（重力を除く。加速度計で測る値） |
| `aero_body_x/y/z_n` | 運動方程式で使った空気力（弾道・空力安定モードでは機軸方向のみ） |
| `thrust_body_x/y/z_n` | 推力ベクトル（推力トリムで傾く） |
| `gimbal_pitch_deg`, `gimbal_yaw_deg` | 推力トリムのジンバル角（トリムなしで 0） |
| `wind_speed_mps`, `wind_direction_deg` | 風速と風が吹いてくる方位 |
| `iip_latitude_deg`, `iip_longitude_deg` | 瞬間落下予測点（無いときは空欄） |
| `pos_eci_x/y/z_m`, `vel_eci_x/y/z_mps`, `accel_eci_x/y/z_mps2` | ECI の位置・速度・加速度（重力を含む） |
| `loss_gravity_mps2`, `loss_aero_mps2`, `loss_thrust_mps2` | 重力損失（飛行経路方向）、空力損失、背圧損失（燃焼中） |

## `summary.json`

```jsonc
{
  "name": "SS-520-4",
  "flight_time_s": 1882.79,               // 最後の行の時刻
  "impact": { "time_s": 1882.79, "latitude_deg": 28.44, "longitude_deg": 142.51, "speed_mps": 271.3 },
  "maxima": {
    "altitude_m":          { "value": 1465643.3, "time_s": 928.53 },   // 遠地点（根探索）
    "speed_earth_mps":     { "value": ..., "time_s": ... },
    "speed_inertial_mps":  { "value": ..., "time_s": ... },
    "mach":                { "value": ..., "time_s": ... },
    "dynamic_pressure_pa": { "value": 108595.0, "time_s": 21.52 },     // 最大動圧（根探索）
    "acceleration_g":      { "value": ..., "time_s": ... }              // 機体が感じる加速度
  },
  "final_state": { "time_s", "mass_kg", "altitude_m", "latitude_deg", "longitude_deg",
                   "speed_earth_mps", "speed_inertial_mps", "position_eci_m", "velocity_eci_mps", "orbit" },
  "events": [ ... ],                       // 下記
  "bodies": [ { "id": "stage1", "kind": "stage", "stage": 1, "release_time_s": 31.7, "mass_kg": 1123.4,
                "impact": { ... } }, ... ]
}
```

着地しない物体の `impact` は `null` です。

### イベント（`events`）

時刻順の配列で、各要素は `kind`、`stage`、`time_s`、`altitude_m`、`latitude_deg`、`longitude_deg`、`downrange_m`、`speed_earth_mps`、`speed_inertial_mps`、`mach`、`dynamic_pressure_pa`、`mass_kg` を持ちます。燃焼終了と分離には `orbit`、投棄物の切り離しには `body`（名前）が付きます。

| `kind` | 内容 |
| --- | --- |
| `ignition` | 着火 |
| `liftoff` | 発射台から動き出した瞬間 |
| `rail_exit` | ランチャのレールを離れた瞬間 |
| `mach1` | Mach 数が 1 を上向きに越えた瞬間 |
| `max_q` | 最大動圧 |
| `burnout` | 燃焼終了（燃焼終了時刻・分離・推進剤切れのいずれか） |
| `separation` | 段の分離（`stage` は分離する段） |
| `jettison` | 投棄物の切り離し |
| `apogee` | 対地の鉛直速度が上向きから下向きに変わった瞬間 |
| `impact` | 着地 |

### 軌道要素（`orbit`）

点質量地球のケプラー要素です。`semi_major_axis_m`（双曲線では負）、`eccentricity`、`inclination_deg`、`raan_deg`（打ち上げ時刻の平均恒星時で春分点基準）、`argument_of_perigee_deg`、`true_anomaly_deg`、`perigee_altitude_m` / `apogee_altitude_m`（赤道半径からの高さ。閉じない軌道では遠地点は `null`）、`period_s`、`specific_energy_j_kg`。

## モンテカルロ

```bash
openTsiolkovsky-cli monte-carlo CONFIG -n 500 --dispersion examples/dispersion.json --seed 1 -o DIR
```

各パラメータを 1σ の値に従ってばらつかせて N 回飛ばし、機体と切り離された物体の落下点を集計します。分散の JSON（`schema dispersion`、省略したキーは既定値）:

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `thrust_percent` | 1.0 | 推力（燃焼時間は逆比で変わり、全力積は同じ）[%] |
| `isp_percent` | 0.5 | 比推力（推力も変わり、質量流量は同じ）[%] |
| `mass_percent` | 1.0 | 各段の初期質量・乾燥質量 [%] |
| `drag_percent` | 5.0 | CA（弾道係数は逆比）[%] |
| `normal_percent` | 0 | CN [%] |
| `separation_time_s` | 0 | 分離時刻 [s] |
| `elevation_deg`, `azimuth_deg` | 0.5, 0.5 | 姿勢のずれ [deg] |
| `wind_speed_percent` | 0 | 全高度の風速の倍率 [%]（ずれより先に掛けます） |
| `wind_speed_mps`, `wind_direction_deg` | 2.0, 10.0 | 全高度の風速・風向のずれ |
| `air_density_percent` | 5.0 | 大気密度 [%]（季節変動に加えます。密度偏差の表があればその値に加えます） |
| `distribution` | `"normal"` | `"normal"`（正規分布）または `"uniform"`（同じ標準偏差の一様分布、±√3σ） |
| `independent_stages` | false | true にすると、推力・比推力・質量・抗力・CN・分離時刻を段ごとに独立に引きます |

同じ `--seed` なら同じ結果になります（全 CPU コアで並列に計算しても同じ）。

- `montecarlo_cases.csv`: 1 行 1 ケース。`case`、引いた値（上の数値キーと同じ列名。段ごとに引いたときは `stage<N>_thrust_percent` なども）、`max_altitude_m`、物体ごとの `<id>_impact_time_s` / `_impact_latitude_deg` / `_impact_longitude_deg`（着地しなければ空欄）
- `montecarlo_summary.json`: `cases`、`failed_cases`、`seed`、`dispersion`、物体ごとの `statistics`（落下数、平均落下点、南北・東西の標準偏差、1σ 誤差楕円の長径・短径・長軸の方位、95 % と 99 % の楕円（2 次元正規分布でその確率を含む楕円。1σ の 2.448 倍と 3.035 倍）、平均点からの最大のずれ）
