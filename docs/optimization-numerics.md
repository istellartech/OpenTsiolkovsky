# PR 3: 軌道最適化の尺度・双対・Hessian

この文書は[導入計画](trajectory-optimization-plan.md)第5.4〜5.5節、PR 3の数値基盤を扱う。既存のLGR転写とS0物理モデルの外側に座標変換を置き、同じSI入力と再積分検証を維持する。熱や推進系等の新しい物理は追加しない。

## 設定と互換性

入力JSONの`solver`に次の設定を追加した。省略時は従来のS0・L-BFGS・上流既定KKT設定であり、成功判定も変更しない。未知の項目・方式名、不正なfloor/capは拒否する。

```json
{
  "hessian": "exact",
  "scaling": {
    "strategy": "s3",
    "floor": 0.000001,
    "cap": 1000000,
    "gradient_max": 1.0,
    "gradient_min": 0.00000001
  },
  "kkt_scaling": "ruiz"
}
```

上記は`solver`の追加部分。実行可能な全入力は[double_integrator_exact.json](../examples/optimization/double_integrator_exact.json)を参照する。入力の`*_m`、`*_kg`、`*_pa`等の意味はSIのままであり、スケーリング設定で物理上限や数値検証許容値を変更しない。ブラウザでは「JSON・詳細」から設定できる。

| 設定 | 意味 |
| --- | --- |
| `scaling.strategy: s0` | 既存転写の物理尺度をそのまま使用 |
| `s1_bounds` | 有限な上下限の中点・半幅で変数を変換。固定変数は差分0、gain=1。無限境界には初期推定の種別ごとの範囲を使う |
| `s1_guess` | 変数種別ごとの初期軌道範囲・代表絶対値を使用。一定/ゼロの初期推定に有限なfallbackを持つ。フェーズ別質量尺度の方式ではない |
| `s2` | S0変数を保ち、初期点と上下方向の微小摂動点の3点で局所ADヤコビアンを評価。制約種別ごとの最大値で行を補正。ゼロ近傍は増幅せず、floor/capを適用 |
| `s3` | S0にpounceの`nlp_scaling_method=gradient-based`を追加。`gradient_max`/`gradient_min`を明示して記録 |
| `hessian: limited_memory` / `exact` | 既定はL-BFGS。厳密HessianはHS071と二重積分器で使用可能。ロケットを指定した場合は入力検査で拒否し、暗黙にL-BFGSへ戻さない |
| `kkt_scaling: upstream_default` / `none` / `ruiz` / `slack_based` | アプリ/NLPの尺度と独立したKKT線形系の方式。明示方式では`linear_scaling_on_demand=no`とし、設定が発動待ちのままになることを避ける |

S1/S2の係数はS0座標上で生成し、`floor`/`cap`でgainを制限する。S2の摂動は各非固定変数へ`±0.001 max(1, abs(x_initial))`を加えてbounds内へ収める。制約種別は名前からノード/区間添字を除いたものとし、異なる状態成分は別種別に保つ。係数と参照点は1求解中に固定する。

S3の係数は、採用pounce 0.12.0の公開`gradient_obj_scale`/`gradient_row_scale`を、同じ固定変数の補正後の初期点とヤコビアンへ適用して記録する。目的は非固定変数の勾配、制約は上流と同じ全列の行最大値を使う。上流既定の閾値100では係数がすべて1になる問題もあり、方式名だけで有効な補正が発生したとは判断しない。

## 変換と結果JSON

既存転写のS0座標を`x0, g0, f0`、新しくソルバーへ渡すアプリ座標を`z, gA, fA`とする。`D`は正の対角gain、`R`は正の行gain、`a`は正の目的gain。

```text
x0 = b + D z
gA = R g0
fA = a f0
JA = R J0 D
HA = D [a obj_factor Hf0 + Σ_j R_j lambdaA_j Hg0_j] D
```

意味上の無限境界（±1e19）は乗除せず保持する。有限境界が変換後に無限境界の閾値を越える設定はエラーにする。固定変数や幅0で除算しない。疎構造は変換で変えず、同じ要素への寄与を加算する。

| 結果フィールド | 座標・内容 |
| --- | --- |
| `solution`, `nlp_layout`, 名前配列 | 従来のS0座標。新方式の解を戻してから既存の独立検証・フロントエンドへ渡す |
| `solver_solution`, `solver_layout` | アプリ変換後にpounceへ渡したTNLP座標。pounce内部のgradient-based補正はpounce自身が戻している |
| `scaling_report` | 方式、floor/cap、参照点、アプリのoffset/gain/行/目的係数、pounce補正係数、SI変換のoffset/scale/unit |
| `physical_solution` | SIの状態・制御・時間・ペイロードと、対応する物理残差・目的・上下限/制約乗数 |
| `numerical_metrics` | setup/solve/validation時間、微分・因子分解・backsolve時間、評価数、復元記録数、scaled/unscaled KKT誤差、factor数・pivotの利用可能な統計、KKT方式 |

新フィールドは追加項目で、Rust側も欠落した古い結果JSONを読み込める。旧版の結果に後から数値情報を補完したとは扱わない。

SIへの変換を`xSI = o + S x0`, `gSI = T g0`, `fSI = F f0`とすると、乗数を次の順に戻す。

```text
lambda0 = R lambdaA / a
z0      = D^-1 zA / a
lambdaSI = F T^-1 lambda0
zSI      = F S^-1 z0
```

pounceが戻した内部補正を二重適用しない。乗数は最小化目的（ロケットでは負のペイロード）のLagrangianに対するもの。境界を変えたときの最適値変化は符号も含めて確認する。二重積分器では到達距離1,000 mで`dJ*/dd=24`を解析式・SI乗数・距離を±0.1 m動かした再求解の三者で照合する。

`physical_solution`の制約は物理残差の定義に対応する。迎角円錐の正規化残差や傾斜角のcos残差等は無次元のままであり、それらの乗数を直接「kg/deg」の設計感度と解釈しない。実パラメータへの感度には、その残差定義・上限パラメータの微分も必要になる。

## Hessianと検証

- HS071は目的と2制約の厳密解析Hessianを疎な下三角で返す。
- 二重積分器は制御エネルギーの二階項と、自由時間×制御・自由時間×速度の交差項を組み立てる。`obj_factor`と制約乗数の両方を含む。
- 座標変換後もHessianとLagrangian勾配の方向差分を照合し、pounceの`derivative_test=second-order`でも検査する。全NLPの有限差分をHessianの実装には使わない。
- L-BFGSではHessian構造を公開せず、`eval_h`呼出し0の既存契約を保つ。
- 単位不変性はm↔km、kg↔t、Pa↔kPa等の座標で同じ物理関数を評価し、SIへ戻した値・微分を比較する。入力ファイルの単位ラベルを書き換えるだけの試験にはしない。
- 各方式の求解後は、従来と同じSI上限・許容値で独立再積分する。収束、検証合否、残差、性能値を別々に保存する。

ロケットの局所二階ADと自由時間を含む厳密Hessianの疎組立は、この小問題版からの後続段階である。多段で厳密Hessianを比較済み、または最適なHessian既定値を確定したとは扱わない。

KKTの`kkt_scaling_forced_on_factors`は、採用版の方式接続・on-demand無効化と実行factor数に基づく記録で、個々の反復の係数が非単位であったことを示す計測値ではない。pivot範囲だけで良条件とは判断しない。バックエンドが公開していない線形系残差等は値を捏造せず、未取得の診断として区別する。

## 再現と比較

```sh
cargo test --locked --features optimization
cargo build --locked --release --features optimization --bin openTsiolkovsky-optimize
target/release/openTsiolkovsky-optimize --config examples/optimization/double_integrator_exact.json --output /tmp/exact.json
python3 scripts/study_optimization_numerics.py
# 一部を確認する場合
python3 scripts/study_optimization_numerics.py --filter 'multi_base_99_*' --output out/optimization/pr3-smoke
```

比較スクリプトはHS071、二重積分器、MOMO単段、仮定した多段機を対象に、方式ごとに同一の物理・初期推定・メッシュ・予算を使う。3初期推定、粗/細メッシュ、S0〜S3、小問題のL-BFGS/厳密Hessian、独立したKKT軸を含む。全組合せの総当たりではない。実行物をコピーしてハッシュを保存し、入力・全結果・stderr・逐次summaryを`out/optimization/pr3-numerics/`へ保存する。失敗・反復上限も残し、自動再試行や物理上限の緩和は行わない。

時間は単発の実行記録であり、環境負荷を含む。方式の優劣は最速例だけで決めず、合格率・SI最悪値・性能・初期値/メッシュ依存と併せて評価する。生データはローカル生成物であり、再現スクリプトと結果の要約を区別して管理する。
