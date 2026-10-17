# 設定ファイルガイド

CLI が読む `param_*.json`（旧C++版と同じ形式）の項目と、そこから参照する CSV テーブルの形式を説明します。サンプルは `examples/param_sample_01.json`、`examples/param_momo.json`、`examples/SS-520-4/` にあります。Webアプリが使う設定形式（`ClientConfig`）は最後にまとめます。

キー名は単位や型を含めて一字一句そのまま書きます（例: `"burn end time(time of each stage)[s]"`）。表で既定値のある項目は省略できます。既定値が「—」の項目は必須です。

## 最小構成の例

```json
{
    "name(str)": "simple_test",
    "calculate condition": {
        "end time[s]": 300,
        "time step for output[s]": 1
    },
    "launch": {
        "position LLH[deg,deg,m]": [35.0, 139.0, 0.0]
    },
    "stage1": {
        "mass initial[kg]": 1000,
        "thrust": {
            "const thrust vac[N]": 30000,
            "burn end time(time of each stage)[s]": 20
        }
    }
}
```

省略した項目は既定値になります。この例では、真上（仰角 90°）に向けて Isp 200 秒で 20 秒間燃焼し、無風・空力なし・ノズル背圧損失なしで飛びます。

## 全体

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `name(str)` | — | 名前 |
| `calculate condition` | — | 計算条件（下記） |
| `launch` | — | 打ち上げ条件（下記） |
| `stage1`, `stage2`, `stage3` | — | 各段（`stage1` は必須。`stages` 配列や単段の `stage` でも可） |
| `wind` | 無風 | 風（下記） |

## 計算条件 (`calculate condition`)

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `end time[s]` | — | 計算終了時刻 |
| `time step for output[s]` | — | 出力の時間間隔。出力時刻は `k × 間隔` で、丸め誤差は積み重なりません |
| `variation ratio of air density[%](-100to100, default=0)` | 0 | 大気密度の変動率。U.S. 標準大気の季節変動の高度分布に沿って密度を変えます（低高度と高高度で符号が逆になります） |
| `air density variation file exist?(bool)` | false | 高度ごとの密度変動テーブルを使う（使うと上の変動率は無視） |
| `air density variation file name(str)` | "" | 密度変動テーブル（下記 CSV） |
| `atmosphere model(str)` | `"legacy"` | 標準大気モデル。`"legacy"`: 旧C++版と同じ（1976年標準大気の各層を幾何高度で評価し、84.852 km 以上は 186.95 K の等温層として外挿）。`"ussa1976"`: 86 km まではジオポテンシャル高度で計算し、86〜1000 km は U.S. 標準大気 1976 の表値（[物理モデル](physics.md#大気)） |
| `integrator` | RK4 | 積分器（下記） |

### 積分器 (`integrator`)

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `method(str)` | `"rk4"` | `"rk4"`（固定刻み）または `"rk45"`（Dormand–Prince 5(4)、刻み幅を自動調整） |
| `rk4 step[s]` | 出力間隔の半分 | RK4 の刻み幅。区間は等分され、イベント時刻や出力時刻にぴったり止まります |
| `rk45 absolute tolerance[-]` | 1e-9 | RK45 の絶対許容誤差（全成分共通。質量 kg、位置 m、速度 m/s） |
| `rk45 relative tolerance[-]` | 1e-9 | RK45 の相対許容誤差 |

## 打ち上げ条件 (`launch`)

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `position LLH[deg,deg,m]` | — | 緯度・経度・高度（WGS84 楕円体高） |
| `velocity NED[m/s]` | [0, 0, 0] | 初速（地球に対する北・東・下）。0 のときは発射台で保持します。0 以外（空中発射や飛行途中からの再開）では保持もレール拘束もしません |
| `time(UTC)[y,m,d,h,min,sec]` | [2000,1,1,0,0,0] | 打ち上げ時刻（UTC）。軌道要素の昇交点赤経を春分点基準にするのに使います |
| `launcher rail length[m]` | 0 | ランチャのレール長。0 なら発射台での保持のみ（[ランチャ](physics.md#発射台とランチャ)） |

## 段 (`stage1` など)

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `power flight mode(int)` | 0 | 動力飛行のモード。Rust版は `0`（3DoF）のみ。ほかの値は警告を出して 3DoF で計算します |
| `free flight mode(int)` | 2 | 燃焼後のモード。`0`: 空力安定（機軸が気流に沿い、抗力 CA のみ）、`1`: 3DoF 指定姿勢（姿勢プログラムに従う）、`2`: 弾道飛行（弾道係数で減速） |
| `mass initial[kg]` | — | この段単体の初期質量（上段を含まない。旧C++版はその段より上の総質量なので注意） |
| `mass dry[kg]` | なし | 推進剤を除いた質量。推進剤（初期質量 − 乾燥質量）を使い切った時点で燃焼を終えます。省略時はこの段の質量すべてを燃やせます |

燃焼中かどうかは、燃焼開始から「燃焼終了」「強制停止」「推進剤切れ」の最も早い時刻までで決まります。各段の時刻はその段の開始（前段の分離）からの相対時刻です。

### 推力 (`thrust`)

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `const thrust vac[N]` | 0 | 真空推力（テーブルを使わないとき） |
| `thrust vac file exist?(bool)` / `thrust vac file name(str)` | false / "" | 真空推力テーブル（時刻 [s], 推力 [N]。段の開始からの時刻） |
| `thrust coefficient[-]` | 1 | 推力係数 k。推力を k 倍し、燃焼時間を 1/k にします（全力積は同じ）。旧C++版と同じ定義で、定数にもテーブルにも効きます |
| `const Isp vac[s]` | 200 | 真空比推力 |
| `Isp vac file exist?(bool)` / `Isp vac file name(str)` | false / "" | 比推力テーブル（時刻 [s], Isp [s]） |
| `Isp coefficient[-]` | 1 | 比推力係数 k。推力と Isp を共に k 倍します（質量流量は同じ） |
| `burn start time(time of each stage)[s]` | 0 | 燃焼開始時刻 |
| `burn end time(time of each stage)[s]` | 0 | 燃焼終了時刻 |
| `forced cutoff time(time of each stage)[s]` | 1e9 | 強制停止時刻 |
| `throat diameter[m]` | 0 | スロート直径 |
| `nozzle expansion ratio[-]` | 1 | ノズル開口比。出口面積 = π/4 × スロート直径² × 開口比 |
| `nozzle exhaust pressure[Pa]` | 0 | 読み込むだけで使いません（旧C++版も同じ） |

推力は `真空推力 − 出口面積 × 大気圧`（負にはしません）、質量流量は `真空推力 / (真空Isp × g0)` です。

### 空力 (`aero`)

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `body diameter[m]` | 0.5 | 機体直径（基準面積 = π/4 × 直径²） |
| `const axial coefficient[-]` | 0 | 軸力係数 CA |
| `axial coefficient file exist?(bool)` / `axial coefficient file name(str)` | false / "" | CA テーブル（Mach, CA） |
| `axial multiplier[-]` | 1 | CA テーブルの倍率 |
| `const normal coefficient[-]` | 0 | 法線力係数の傾き CNα [1/rad]。法線力 = CNα × 迎角 [rad] × 動圧 × 基準面積 |
| `normal coefficient file exist?(bool)` / `normal coefficient file name(str)` | false / "" | CN テーブル。Mach × 迎角の 2 次元表（下記）か、1 次元の CNα(Mach) [1/rad] |
| `normal multiplier[-]` | 1 | CN テーブルの倍率 |
| `ballistic coefficient(ballistic flight mode)[kg/m2]` | 100 | 弾道飛行モードの弾道係数 β（抗力加速度 = 動圧 / β） |

CA・CN・姿勢のテーブルは機体全体で共通で、1段目の設定から読みます（定数と倍率、直径は段ごと）。

> 旧C++版では CN を定数で与えると、迎角によらず機体の Y・Z 軸に常に −CN × 動圧 × 面積の力がかかります。Rust版は定数 CN を CNα（迎角に比例）として扱うため、定数 CN が 0 でない設定では結果が C++ 版と異なります。

### 姿勢 (`attitude`)

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `const elevation[deg]` / `const azimuth[deg]` | 90 / 0 | 仰角・方位角（北から時計回り） |
| `const roll[deg]` | 0 | ロール角 |
| `attitude file exist?(bool)` / `attitude file name(str)` | false / "" | 姿勢プログラム（時刻 [s], 方位角 [deg], 仰角 [deg][, ロール角 [deg]]。打ち上げからの時刻） |
| `yaw offset[deg]` / `pitch offset[deg]` / `roll offset[deg]` | 0 | 機体の取り付け誤差。姿勢プログラム（航法座標）から機体を Z→Y→X 軸まわりに回します（旧C++版と同じ） |
| `gyro bias x[deg/h]` / `y` / `z` | 0 | ジャイロバイアス。打ち上げからの時間に比例して機体姿勢がずれます |

### 投棄物 (`dumping product`)

フェアリングなど、その段の飛行中に切り離す物体です。切り離すと質量が機体から減り、物体は弾道係数を使って落下点まで計算されます。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `dumping product exist?(bool)` | false | 投棄物の有無 |
| `dumping product separation time[s]` | 0 | 切り離し時刻（その段の開始からの秒。段の分離より前） |
| `dumping product mass[kg]` | 0 | 質量（段の乾燥質量の一部として扱います） |
| `dumping product ballistic coefficient[kg/m2]` | 100 | 弾道係数 |
| `additional speed at dumping NED[m/s,m/s,m/s]` | [0,0,0] | 切り離し時に加わる速度（北・東・下） |

### 推力トリム (`attitude neutrality(3DoF)`)

重心・圧力中心・推力点の位置から、空力モーメントを打ち消すように推力の向き（ジンバル角）を決めます（旧C++版の neutrality と同じ計算）。CN は Mach × 迎角の 2 次元表が必要です。

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `considering neutrality?(bool)` | false | トリムを計算する |
| `CG, Controller position file(str)` | "" | 時刻 [s], 重心 STA [m], 制御点（ジンバル）STA [m]。STA は機首からの後方距離。時刻は打ち上げから |
| `CP file(str)` | "" | 圧力中心 STA [m] の Mach × 迎角の表（CN の 2 次元表と同じ形式） |
| `Xcg offset[m]` など `X/Y/Z` × `cg/cp/t` | 0 | 重心・圧力中心・推力点のずれ（X は STA と逆向き） |

求めたジンバル角は `dynamics_cpp.csv` の `gimbal_angle_pitch/yaw(deg)` に出ます。

### 段の分離 (`stage`)

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `following stage exist?(bool)` | false | 次の段があるか |
| `separation time[s]` | 1e6 | 分離時刻（その段の開始から） |

`6DoF` の項目は読み込みますが使いません（ファイル名があると警告）。

## 風 (`wind`)

| キー | 既定値 | 内容 |
| --- | --- | --- |
| `const wind[m/s,deg]` | [0, 0] | 風速と風向（風が吹いてくる方位） |
| `wind file exist?(bool)` / `wind file name(str)` | false / "" | 風のテーブル（高度 [m], 風速 [m/s], 風向 [deg]） |

テーブルは北・東成分に分けて高度方向に線形補間します（旧C++版と同じ）。350° と 10° の中間は 0°（北）になります。範囲外の高度では端の値を使います。

## CSV テーブルの形式

1 行目はヘッダー（読み飛ばします）。Rust版は列の位置で読みますが、旧C++版はヘッダー名を照合するので、両方で使うなら次の名前にしてください。範囲外は端の値を使います（旧C++版は 2 次元表の範囲外でエラー終了）。

| テーブル | 列（C++ 版のヘッダー名） |
| --- | --- |
| 推力 | `time[s]`, `thrust vac[N]`（3 列目以降は無視） |
| 比推力 | `time[s]`, `Isp vac[s]` |
| CA | `mach[-]`, `CA[-]` |
| 姿勢 | `time[s]`, `azimuth[deg]`, `elevation[deg]`[, `roll[deg]`] |
| 風 | `altitude[m]`, `wind_speed[m/s]`, `direction[deg]` |
| 密度変動 | `altitude[m]`, `air density variation[percent]` |
| 重心・制御点 | `time[s]`, `CG_pos_STA[m]`, `Controller_pos_STA[m]` |

CN と CP の 2 次元表はヘッダーなしの 15 列です。1 行目は「任意の値, 迎角 [deg] × 14」、2 行目以降は「Mach, 各迎角での値 × 14」です。迎角は 0〜90°（後ろからの気流も考えるなら 180° まで）をカバーしてください。

```
0,0,1,2,3,4,6,8,10,15,20,30,45,90,180
0.0,0,0.06,0.12,...
0.5,0,0.06,0.12,...
```

## 設定の検証

読み込み時に、物理的に不正な値（負の質量、範囲外の緯度、燃焼終了が開始より前など）はエラーになります。珍しいが有効な値（高度 10 km 以上や初速 100 m/s 以上からの開始、Isp が 100〜500 秒の外、推進剤が足りない燃焼など）は警告を表示して計算します。

## Webアプリの設定形式 (`ClientConfig`)

Webアプリと WASM は、より簡潔な JSON（`ClientConfig`）も受け付けます。主な対応は次のとおりです（すべて省略可能で、既定値は `src/rocket.rs` の `default_*`）。

- `simulation`: `duration_s`, `output_step_s`, `air_density_percent`, `air_density_profile`（`[{ altitude_m, percent }]`）, `atmosphere_model`（`"legacy"` / `"ussa1976"`）, `integrator`（`method`, `rk4_step_s`, `rk45_abs_tol`, `rk45_rel_tol`）
- `launch`: `latitude_deg`, `longitude_deg`, `altitude_m`, `velocity_ned_mps`, `datetime_utc`, `rail_length_m`
- `stages[]`: `mass_initial_kg`, `mass_dry_kg`, `burn_start_s`, `burn_end_s`, `forced_cutoff_s`, `separation_time_s`, `thrust_constant`, `thrust_multiplier`, `thrust_profile`, `isp_constant`, `isp_multiplier`, `isp_profile`, `throat_diameter_m`, `nozzle_expansion_ratio`, `power_mode`, `free_mode`, `aero`（段ごとの直径・係数）, `dumping_product`（`separation_time_s`, `mass_kg`, `ballistic_coefficient`, `additional_velocity_ned_mps`）
- `aerodynamics`: `body_diameter_m`, `cn_constant`, `cn_multiplier`, `cn_profile`, `ca_constant`, `ca_multiplier`, `ca_profile`, `ballistic_coefficient`
- `attitude`: `elevation_deg`, `azimuth_deg`, `roll_deg`, `pitch_offset_deg`, `yaw_offset_deg`, `roll_offset_deg`, `gyro_bias_deg_h`, `profile`（`[{ time, azimuth_deg, elevation_deg, roll_deg? }]`）
- `wind`: `speed_mps`, `direction_deg`, `profile`（`[{ altitude_m, speed_mps, direction_deg }]`）
