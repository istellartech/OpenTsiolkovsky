# OpenTsiolkovsky

![OpenTsiolkovsky](doc/OpenTsiolkovsky_Logo_small.png)

OpenTsiolkovsky is a free , specific usage rocket flight simulator that allow you calcurate rocket trajectry.

The main features include:

* Six-degree-of-freedom flight simulation with attitude control system(like TVC)
* Command line interface software
* NOT fully-featured. It's tool kit
* Now it corresponded three stage rocket without booster
* It corresponds only to the sub-orbital and the Low-earth-orbit
* Including multi purpose python script
* It depends on boost library
* Cross-platform(modern C++ based)

3段ロケットまで対応したロケットフライトシミュレータ。
現在はブースター無しの姿勢制御機構付きロケットのシミュレーションが可能。
現在開発コードTsiolkovskyをオープンソース版OpenTsiolkovskyに変更予定。

## コンパイル

    $ cd OpenTsiolkovsky
    $ make

でコンパイルできます。色々エラーはきますがたぶんできます。

    $ cd bin
    $ ./OpenTsiolkovsky

で実行。

    $ ./OpenTsiolkovsky input.json

で引数のjsonファイルを入力ファイルにすることができます。（デフォルトはparams.json）

## 結果
OpenTsiolkovskyを実行した後は、結果outputフォルダに入ります。
結果ファイルはjsonファイルのnameに記述されている名前入りのファイルで
- (name)\_dynamics_xth.csv

### 結果のグラフ化

    $ python plot_rocket.py (JSON_FILE)

とPythonスクリプトを使うと可視化されます。グラフのまとめは以下のPDFにまとまります。
- (name)\_input.pdf
- (name)\_output.pdf

### 飛翔履歴をGoogle Earthにプロット

    $ python create_kml.py (JSON_FILE)

とPythonスクリプトを使うと.kmlファイルが作られます。多段ロケットの場合であれば段ごとのファイルになります。Google Earthなどをインストールしていれば.kmlファイルを読み込むことに寄って飛翔履歴が可視化されます。


## 実行に使うファイル
実行ファイルのOpenTsiolkovsky以外に以下のファイルが実行ファイルを同じフォルダに必要です。
- OpenTsiolkovsky(実行ファイル)
- パラメータを記述したjsonファイル(default:params.json)
- 推力履歴を記述したcsvファイル（任意、パラメータjsonフォルダ内でファイル名指定）
- 姿勢履歴を記述したcsvファイル（任意、パラメータjsonフォルダ内でファイル名指定）
- 抗力係数を記述したcsvファイル（任意、パラメータjsonフォルダ内でファイル名指定）
- 揚力係数を記述したcsvファイル（任意、パラメータjsonフォルダ内でファイル名指定）
- 風を記述したcsvファイル（任意、パラメータjsonフォルダ内でファイル名指定）

姿勢はその時々の局所NED座標系に沿った角度を指定

## パラメータファイルcsvの仕様
### 推力・姿勢
1列目に時間(秒)、2列目3列目にデータを入れる。
プログラム中では間の時間は線形補間された値が代入されている。
### 抗力係数・揚力係数
揚力係数・抗力係数はマッハ数の関数としている。1列目にマッハ数、2列目に係数の値を入れる。プログラム中では間のマッハ数のときは線形補間された値が代入されている。

## 結果の可視化
OpenTsiolkovskyを実行するとoutputフォルダに(name)dynamics.csvというファイルが作られる。
pythonで出力ファイルの結果の可視化を行なう。

	$ python rocket_dunamics.py

とするとoutputフォルダがの中のcsvファイルを読み取ってグラフ化する。

## Done
- Cd.csvを読み込み
- thrust.csvを読み込み
- altitude.csvを読み込み
- wind.csvを読み込み
- パラメタファイルを可読性とウェブアプリ対応可能なようにjsonに
- ロケットの状態によってパラメタ変化
- 多段化（取り敢えず3段）
- magic numberナシに
- 多段化に伴ってインスタンスを多段にする
- 重力モデル組み込み
- 時変変数を関数に
- xcodeでEdit SchmeによりWorking directoryを変更して絶対パスを使わないように。
- ファイルを絶対アドレスにしない
- output file
- input jsonからmain関数の中身を分岐
- xcodeを使わないでコンパイル
- クロスコンパイル
- 観測ロケットのsample
- 軌道投入のsample
- progress bar
- 軌道要素のクラス
- 軌道要素出力の出力
- 軌道要素からECI座標系の位置速度出力
- 近地点出力より人工衛星になったかどうかの判断
- 出力ファイルの情報量を増やす（落下位置や最大飛翔角速度なども）
- boostライブラリを使わない
- 機体座標系の加速度の値を出力
- 運動、条件の可視化
- ダウンレンジの計算
- PDFに条件や結果などをまとめる
- 上空で推力が上昇するのをモデル化
- ジオイド高の関係の処理（デバッグ）
- 風の分散
- モンテカルロ法
- 最適化ルーチンのサンプル


## Future works
- 多段切り離ししたときの1段目の重量変更処理を入れる
- 多段化の部分にブースター対応→初期重量ではなく減少重量にするなど
- rocketクラスとrocket_dunamicsクラスの整理
- 説明文
- CL,CDを迎角の変数に
- 時間要素から時刻込みの軌道要素出力
- ユリアス時刻の実装
- 時刻機能実装
- KMLファイルに時刻付与し、アニメーションに
- 英語説明
- 例外処理
- 質量ゼロなどの際にエラーを吐かせる
- TVC
- 空力安定モード

## 最適化ルーチン
- 軌道最適化
- 落下位置最適化
- ステージング最適化
- 能力最適化

## 軌道投入に成功したかの判断について
1. 現在時刻でのECI座標系での位置・速度取得
1. ECI位置速度から軌道要素を計算
1. 軌道要素からM=0もしくはν=0のときのECI座標系での位置・速度を計算
1. 近地点での位置速度がわかるので、軌道投入されたかの閾値演算
1. 軌道投入に成功したかの判断

### 軌道投入の閾値について
軌道は必ず円錐曲線になる。その中でも楕円軌道になる。楕円の焦点の一つは地球中心になる。その中で、地表に落下せずに人工衛星になるための条件は下記
- 近地点距離が地球半径以上


## Monte Carlo analysis
モンテカルロ法により飛翔の分布を算出する。任意のパラメータをガウス分布による分散として、出力し、Tsiolkovskyに計算させ、出力から求めたいものを求める。
一様分布列を一様乱数からBox-Muller法により出して、パラメータ作りするのが良い。
pythonではnumpy.random.normal(mu,sigma,num)で出力

## Input file
You can change input "json" file value.
"json" file structure is following.

| key1                | key2                    | value type            | Unit    | Note                                  |
|:--------------------|:------------------------|:----------------------|:--------|:--------------------------------------|
| name                |                         | string                |         |                                       |
| output file name    |                         | string                |         |                                       |
| calculate condition | start time[s]           | value                 | second  |                                       |
|                     | end time[s]             | value                 | second  |                                       |
|                     | time step[s]            | value                 | second  |                                       |
| launch              | position LLH[deg,deg,m] |                       |         |                                       |
|                     | velocity NED[m/s]       |                       |         |                                       |
|                     | time                    | [yyyy,mm,dd,hh,mm,ss] |         | unimplemented                         |
| payload             | weight                  | value                 | kg      | unimplemented                         |
|                     | deploy time             | value                 | second  | unimplemented                         |
| parachute           | exist                   | true or false         |         | unimplemented                         |
|                     | drag coefficient        | value                 | -       | unimplemented                         |
|                     | diameter                | value                 | m       | unimplemented                         |
|                     | deploy time             | value                 | second  | unimplemented                         |
| wind                | file exist              | true or false         |         | compete against "const wind"          |
|                     | file name               | string                |         | compete against "const wind"          |
|                     | const wind              | [speed, direction]    | m/s,deg | compete against "...exist", "...name" |

### key1 is [1st, 2nd, 3rd] stage

rocket stage key is following.

| key2             | key3                        | value type    | Unit   | Note                                     |
|:-----------------|:----------------------------|:--------------|:-------|:-----------------------------------------|
| mass initial[kg] |                             | value         | kg     |                                          |
| thrust           | Isp[s]                      | value         | second |                                          |
|                  | file exist                  | true or false |        | compete against "const thrust[N]"        |
|                  | file name                   | string        |        | compete against "const thrust[N]"        |
|                  | const thrust[N]             | value         | N      | compete against "file exist","file name" |
|                  | burn start time[s]          | value         | second | compete against "file exist","file name" |
|                  | burn end time[s]            | value         | second | compete against "file exist","file name" |
|                  | throat diameter[m]          | value         | m      |                                          |
|                  | nozzle expansion ratio      | value         | -      |                                          |
|                  | nozzle exhaust pressure[Pa] | value         | Pa     |                                          |
| aero             | body diameter[m]            |               | m      |                                          |
|                  | lift coefficient file exist | true or false |        | compete against "lift coefficient"       |
|                  | lift coefficient file name  | string        |        | compete against "lift coefficient"       |
|                  | lift coefficient            | value         | -      | compete against "...exist", "...name"    |
|                  | drag coefficient file exist | true or false |        | compete against "drag coefficient"       |
|                  | drag coefficient file name  | string        |        | compete against "drag coefficient"       |
|                  | drag coefficient            | value         |        | compete against "...exist", "...name"    |
| attitude         | file exist                  | true or false |        | compete against "initial ..."            |
|                  | file naem                   | string        |        | compete against "initial ..."            |
|                  | initial elevation[deg]      | value         | degree | compete against "...exist", "...name"    |
|                  | initial azimth[deg]         | value         | degree | compete against "...exist", "...name"    |
| stage            | following stage exist       | true or false |        |                                          |
|                  | separation time[s]          | value         | second |                                          |


## License
OpenTsiolkovsky is an Open Source project licensed under the MIT License
