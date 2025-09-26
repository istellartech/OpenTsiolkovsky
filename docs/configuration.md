# 設定ファイルガイド

OpenTsiolkovskyの設定ファイルフォーマットと主要パラメータを説明します。

## 設定ファイル形式

設定ファイルはJSON形式で記述します。サンプル設定は `examples/param_sample_01.json` を参照してください。

## 主要セクション

### 計算条件 (calculate condition)
- `end time[s]`: シミュレーション終了時間
- `time step for output[s]`: 出力の時間間隔
- `air density variation file exist?(bool)`: 大気密度変動ファイルの有無

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

#### 空力 (aero)
- `body diameter[m]`: 機体直径
- `const normal coefficient[-]`: 法線力係数
- `const axial coefficient[-]`: 軸力係数

#### 姿勢 (attitude)
- `const elevation[deg]`: 仰角
- `const azimuth[deg]`: 方位角

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