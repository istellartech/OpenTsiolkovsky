# 設定ファイルガイド

OpenTsiolkovskyの設定ファイルフォーマットと主要パラメータを説明します。

## 設定ファイル形式

設定ファイルはJSON形式で記述します。サンプル設定は `examples/param_sample_01.json` を参照してください。

## 主要セクション

### 計算条件 (calculate condition)
- `end time[s]`: シミュレーション終了時間
- `time step for output[s]`: 出力の時間間隔
- `air density variation file exist?(bool)`: 大気密度変動ファイルの有無
- `variation ratio of air density[%](-100to100, default=0)`: 大気密度の変動率。U.S. 標準大気の季節変動の高度分布に沿って密度を変えます（低高度と高高度で符号が逆になります）

### 打ち上げ条件 (launch)
- `position LLH[deg,deg,m]`: 緯度、経度、高度
- `velocity NED[m/s]`: 初期速度（北、東、下向き）
- `time(UTC)[y,m,d,h,min,sec]`: 打ち上げ時刻

### ステージ設定 (stage1, stage2, stage3)

#### 推力 (thrust)
- `const Isp vac[s]`: 真空比推力
- `const thrust vac[N]`: 真空推力
- `burn start time[s]`: 燃焼開始時間
- `burn end time[s]`: 燃焼終了時間

#### 飛行モード
- `power flight mode(int)`: 動力飛行のモード（Rust版は 0: 3DoF のみ）
- `free flight mode(int)`: 燃焼後のモード。`0`: 空力安定（機軸が気流に沿い、抗力 CA のみ）、`1`: 3DoF 指定姿勢（姿勢プログラムに従う）、`2`: 弾道飛行（弾道係数で減速）
- 燃焼中かどうかは、燃焼開始から「燃焼終了」と「強制停止」の早いほうまでで決まります

#### 空力 (aero)
- `body diameter[m]`: 機体直径
- `const normal coefficient[-]`: 法線力係数
- `const axial coefficient[-]`: 軸力係数

#### 姿勢 (attitude)
- `const elevation[deg]`: 仰角
- `const azimuth[deg]`: 方位角

#### 投棄物 (dumping product)
フェアリングなど、その段の飛行中に切り離す物体です。切り離すと質量が機体から減り、物体は弾道係数を使って落下点まで計算されます。
- `dumping product exist?(bool)`: 投棄物の有無
- `dumping product separation time[s]`: 切り離し時刻（その段の開始からの秒。段の分離より前）
- `dumping product mass[kg]`: 質量
- `dumping product ballistic coefficient[kg/m2]`: 弾道係数
- `additional speed at dumping NED[m/s,m/s,m/s]`: 切り離し時に加わる速度（北・東・下）

Web 用の設定形式（`ClientConfig`）では、各段の `dumping_product` に `separation_time_s`、`mass_kg`、`ballistic_coefficient`、`additional_velocity_ned_mps` を書きます。

#### 質量特性 (mass property)
- `mass initial[kg]`: 初期質量
- `inertia tensor[kg・m^2]`: 慣性テンソル
- `center of gravity[m]`: 重心位置

## 時間変動データ

推力、比推力、空力係数、姿勢、風速などは、JSONの設定で固定値またはファイル参照を指定できます。ファイル参照を使用する場合は、対応するCSVファイルを用意してください。

## 例

最小限の設定例：

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
            "const thrust vac[N]": 10000,
            "burn end time[s]": 100
        }
    }
}
```