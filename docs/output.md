# 出力ファイル

CLI（`openTsiolkovsky-cli --output <出力名>`）が書き出すファイルの内容です。時系列の行は出力間隔ごと（時刻 = `k × 間隔`）で、着地した場合は最後の行が着地の瞬間（高度 0）になります。

| ファイル | 内容 |
| --- | --- |
| `<出力名>_trajectory.csv` | 機体の時系列（下記） |
| `<出力名>_dynamics_cpp.csv` | 旧C++版と同じ列構成の時系列 |
| `<出力名>_dynamics_cpp_<N>_fall.csv` | 分離後の N 段（使用済み）が落ちていく時系列（列は上と同じ） |
| `<出力名>_dynamics_cpp_<N>_dump.csv` | N 段の投棄物（フェアリングなど）の時系列 |
| `<出力名>_summary.json` | 概要・イベント・落下点（下記） |
| `<出力名>_montecarlo.csv` / `_montecarlo_summary.json` | `--monte-carlo` の結果（下記） |

## `_trajectory.csv`

| 列 | 内容 |
| --- | --- |
| `time[s]` | 打ち上げからの時刻 |
| `position_x/y/z[m]`, `velocity_x/y/z[m/s]` | ECI の位置・速度（慣性速度） |
| `mass[kg]` | 機体（上段を含む）の質量 |
| `altitude[m]` | WGS84 楕円体高 |
| `velocity_magnitude[m/s]` | 慣性速度の大きさ |
| `mach_number[-]`, `dynamic_pressure[Pa]` | 対気速度による Mach 数と動圧 |
| `thrust[N]` | ノズル背圧損失を引いた推力 |
| `drag_force[N]` | 軸方向の空力の大きさ（飛行モードに応じた値） |
| `acc_eci_x/y/z[m/s2]` | ECI の加速度（重力を含む） |
| `acc_body_x/y/z[m/s2]` | 機体軸の加速度（重力を除く。加速度計で測る値） |
| `flight_mode` | `power_3DoF` / `free_aero_stable` / `free_3dof` / `free_ballistic` |
| `IIP_lat[deg]`, `IIP_lon[deg]` | 瞬間落下予測点（無いときは空欄） |
| `latitude[deg]`, `longitude[deg]` | 緯度・経度 |
| `downrange[m]` | 最初の行の地点からの地表距離 |
| `stage` | 飛行中の段（1 始まり） |

## `_dynamics_cpp.csv`

列名と順序は旧C++版と同じです。値の意味で注意する列は次のとおりです。

- `thrust(N)`: 背圧損失を引いた推力（負にはならない）
- `Isp(s)`: 有効比推力 `推力 / (質量流量 × g0)`（C++ 版と同じ）
- `attitude_azimuth/elevation/roll(deg)`: 姿勢プログラムに取り付け誤差とジャイロドリフトを加えた機体姿勢。気流に沿うモードでは気流の向き
- `angle of attack alpha/beta(deg)`: `atan2(w, u)`, `atan2(v, u)`。`all angle of attack gamma(deg)` は全迎角
- `aeroforce_Body_X/Y/Z[N]`: 運動方程式で使った空力（弾道・空力安定モードでは機軸方向だけ）
- `gimbal_angle_pitch/yaw(deg)`: 推力トリムのジンバル角（トリムを使わないときは 0）
- `IIP_lat/lon(deg)`: 落下予測点が無いときは 0
- `loss_gravity/aerodynamics/thrust(m/s2)`: 重力損失（全区間）、空力損失、背圧損失（燃焼中）

## `_summary.json`

| キー | 内容 |
| --- | --- |
| `max_altitude_m`, `max_altitude_time_s` | 出力点での最高高度（正確な遠地点は `events` の `apogee`） |
| `max_velocity_ms`, `max_velocity_time_s` | 最大**慣性**速度（地球の自転分を含む） |
| `max_speed_earth_relative_ms`, `_time_s` | 最大対地速度 |
| `max_mach_number`, `max_mach_time_s` | 最大 Mach 数 |
| `max_dynamic_pressure_pa`, `_time_s` | 最大動圧（根探索した値） |
| `max_acceleration_ms2`, `max_acceleration_g`, `_time_s` | 機体が感じる加速度の最大値 |
| `burnout` | 最後の燃焼終了イベント（軌道要素付き） |
| `final_orbit` | 最後の状態の軌道要素 |
| `final_position_eci_m`, `final_velocity_eci_ms`, `final_mass_kg` | 最後の状態 |
| `impact_point` | 機体の落下点（`time_s`, `latitude_deg`, `longitude_deg`, `speed_mps`）。着地しないときは `null` |
| `fall_bodies` | 使用済みの段・投棄物ごとの種類・段・分離時刻・質量・落下点 |
| `events` | 飛行イベント（下記） |

### イベント

`events` は時刻順の配列で、各要素は `kind`、`stage`、`time_s`、`altitude_m`、`latitude_deg`、`longitude_deg`、`downrange_m`、`speed_mps`（対地）、`inertial_speed_mps`、`mach`、`dynamic_pressure_pa`、`mass_kg` を持ちます。燃焼終了（`burnout`）と分離（`separation`）には `orbit` も付きます。

| `kind` | 内容 |
| --- | --- |
| `ignition` | 着火 |
| `liftoff` | 発射台から動き出した瞬間 |
| `rail_exit` | ランチャのレールを離れた瞬間 |
| `mach1` | Mach 数が 1 を上向きに越えた瞬間 |
| `max_q` | 最大動圧 |
| `burnout` | 燃焼終了（燃焼終了時刻・強制停止・推進剤切れのいずれか） |
| `separation` | 段の分離（分離する段の番号） |
| `dump` | 投棄物の切り離し |
| `apogee` | 対地の鉛直速度が上向きから下向きに変わった瞬間 |
| `impact` | 着地 |

### 軌道要素 (`orbit`, `final_orbit`)

点質量地球のケプラー要素です。`semi_major_axis_m`（双曲線では負）、`eccentricity`、`inclination_deg`、`raan_deg`（打ち上げ時刻の平均恒星時で春分点基準）、`argument_of_perigee_deg`、`true_anomaly_deg`、`perigee_altitude_m` / `apogee_altitude_m`（赤道半径からの高さ。閉じない軌道では遠地点は `null`）、`period_s`、`specific_energy_j_kg`。

## モンテカルロ

`--monte-carlo N --dispersion FILE --seed S` で、各パラメータを 1σ の値に従ってばらつかせて N 回飛ばします。分散 JSON のキー（省略したキーは既定値）:

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `thrust_percent` | 1.0 | 推力係数（燃焼時間は逆比で変わり、全力積は同じ）[%] |
| `isp_percent` | 0.5 | 比推力係数（推力も変わり、質量流量は同じ）[%] |
| `mass_percent` | 1.0 | 各段の初期質量・乾燥質量 [%] |
| `drag_percent` | 5.0 | CA（弾道係数は逆比）[%] |
| `elevation_deg`, `azimuth_deg` | 0.5, 0.5 | 姿勢のずれ [deg] |
| `wind_speed_mps`, `wind_direction_deg` | 2.0, 10.0 | 全高度の風速・風向のずれ |
| `air_density_percent` | 5.0 | 大気密度変動率 [%] |
| `normal_percent` | 0 | CN [%] |
| `separation_time_s` | 0 | 分離時刻 [s] |
| `wind_speed_percent` | 0 | 全高度の風速の倍率 [%]（ずれより先に掛けます） |
| `distribution` | `"normal"` | `"normal"`（正規分布）または `"uniform"`（同じ標準偏差の一様分布、±√3σ） |
| `independent_stages` | false | true にすると、推力・比推力・質量・抗力・CN・分離時刻を段ごとに独立に引きます（false では 1 回の値を全段に使います） |

同じ `--seed` なら同じ結果になります。新しいキーを足しても、それまでのキーの乱数は変わりません。

- `_montecarlo.csv`: 1 行 1 ケース。引いた値、最高高度、物体ごとの落下時刻・緯度・経度、最後に `normal[%]`、`separation_time[s]`、`wind_speed_scale[%]`
- `_montecarlo_summary.json`: 物体ごとの落下数、平均落下点、南北・東西の標準偏差、1σ 誤差楕円（長径・短径・長軸の方位）、95 % と 99 % の楕円（2 次元正規分布でその確率を含む楕円。1σ の 2.448 倍と 3.035 倍）、平均点からの最大のずれ
