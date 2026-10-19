# 軌道最適化の数値仕様と比較

PR 3の尺度・SI変換・Hessianを記録する。[操作方法](optimization.md)、[進捗](trajectory-optimization-status.md)、[設計要件](trajectory-optimization-plan.md#5-微分とスケーリング)は別文書を参照。

## 設定

`solver`に追加する設定例。全入力は[double_integrator_exact.json](../examples/optimization/double_integrator_exact.json)にある。ブラウザでは「JSON・詳細」から指定する。

```json
{"hessian":"exact","scaling":{"strategy":"s3","gradient_max":1},"kkt_scaling":"ruiz"}
```

| 設定 | 動作 |
| --- | --- |
| `scaling.strategy: s0`（既定） | 既存の物理尺度を維持 |
| `s1_bounds` | 有限boundsの中点・半幅。固定幅0はgain=1、無限境界はguess方式へ |
| `s1_guess` | 変数種別の初期範囲の中点をoffset、半幅・各初期絶対値・1の最大をgainに使用 |
| `s2` | S0変数を保ち、代表3点の局所ADヤコビアンを使い、制約種別内の最大絶対微分の逆数で行補正 |
| `s3` | S0にpounceのgradient-based補正を追加 |
| `hessian` | `limited_memory`（既定）/ `exact`。exactはHS071・二重積分器のみ。ロケット指定は拒否 |
| `kkt_scaling` | `upstream_default`（既定）/ `none` / `ruiz` / `slack_based`。明示方式ではon-demandを無効化 |

S1/S2のgainは`floor=1e-6`、`cap=1e6`で制限する。S2は初期点と`±0.001 max(1,abs(x))`のbounds内摂動点を使い、ゼロ近傍行を増幅しない。種別は名前の区間/ノード添字を除いて集約する。フェーズ別質量尺度は未実装。

S3の既定は`gradient_max=100`、`gradient_min=1e-8`。固定変数を補正した初期点に、pounce 0.12.0の公開gradient scaling関数を適用して係数を記録する。係数設定は正・有限、floor≤1≤cap、gradient_min≤1を要求する。係数は1求解中固定し、SI入力・物理上限・検証許容値は変更しない。

## 変換と結果JSON

S0座標を`x0,g0,f0`、アプリ変換後を`z,gA,fA`とする。D/Rは正の対角係数、aは正の目的係数。SI写像は`xSI=o+S x0, gSI=T g0, fSI=F f0`。

```text
x0 = b + D z,  gA = R g0,  fA = a f0
JA = R J0 D
HA = D [a obj_factor Hf0 + Σ_j R_j lambdaA_j Hg0_j] D
lambda0 = R lambdaA/a,        z0 = D^-1 zA/a
lambdaSI = F T^-1 lambda0,    zSI = F S^-1 z0
```

±1e19の無限境界は倍率変換しない。有限境界が変換後にこの閾値を越える設定は拒否する。pounce内部のS3補正はpounceが戻すため、二重適用しない。

| 結果フィールド | 内容 |
| --- | --- |
| `solution`, `nlp_layout`, 名前配列 | 従来のS0座標。独立検証・既存UIもこれを使う |
| `solver_solution`, `solver_layout` | アプリ変換後のTNLP座標。pounce内部補正は復元済み |
| `scaling_report` | 方式・参照点・全係数・floor/cap・SI写像と単位 |
| `physical_solution` | SI主変数・物理残差・目的・上下限/制約乗数 |
| `numerical_metrics` | setup/solve/validation・微分・factor/backsolve時間、評価/復元数、KKT誤差、factor/pivot統計 |

追加フィールドのない旧結果も読める。SI乗数の単位は目的単位/残差または変数の単位。負のペイロードを最小化する符号に注意する。円錐/cos残差は無次元のままであり、kg/deg等の実パラメータ感度には残差定義の微分が必要。

厳密Hessianは疎な下三角を解析組立し、自由時間×制御/速度と制約乗数を含む。全NLPの有限差分を実装には使わない。方向差分・`second-order`検査で監査し、L-BFGSは`eval_h`呼出し0を保つ。

`kkt_scaling_forced_on_factors`は方式接続・on-demand無効化・factor数に基づく記録。反復ごとの非単位係数や線形系残差はバックエンド非公開で未計測。pivot範囲だけで良条件とは判断しない。

## 2026-10-19の比較結果

固定実行物`2c6bfea57424`でnative 184条件・WASI 67条件を比較した。同じSI物理・初期推定・メッシュ・予算で、失敗も保存した。`e50bcae`の定数行S2処理は比較問題の係数を変えない。

全条件：[native CSV](verification/pr3-native.csv)、[WASI CSV](verification/pr3-wasi.csv)、[実行物ハッシュ・環境・WASI対象一覧](verification/pr3-environment.json)。

| 問題群 | nativeの収束かつ検証合格 | WASIの収束かつ検証合格 |
| --- | ---: | ---: |
| HS071・二重積分器 | 106 / 106 | 46 / 46 |
| MOMO基準メッシュ | 24 / 24 | 9 / 9 |
| 多段基準メッシュ | 20 / 24 | 11 / 12 |
| 単段/多段の粗メッシュ | 0 / 30 | 対象外 |

二重積分器は3初期時間×3メッシュ×5尺度の各45件で両Hessian方式が合格した。反復中央値はL-BFGS 26、厳密Hessian 11。m/kmでの実求解、距離±0.1 mの再求解、解析式から同じSI解と感度`dJ*/dd=24`を確認した。二階微分検査2,055成分と多段ヤコビアン146,995成分の監査も合格した。

次表は多段の上流既定KKT・L-BFGS、初期射向98/99/100°。全ケースとも再積分は合格したが、反復上限を収束へ読み替えない。

| 尺度 | native合格 | native反復数 | WASI合格 |
| --- | ---: | --- | ---: |
| S0 | 3 / 3 | 219 / 156 / 330 | 3 / 3 |
| S1 bounds | 0 / 3 | 500 / 500 / 500 | 対象外 |
| S1 guess | 3 / 3 | 274 / 250 / 240 | 2 / 3 |
| S2 | 2 / 3 | 272 / 244 / 500 | 3 / 3 |
| S3 | 3 / 3 | 201 / 494 / 237 | 対象外 |

S1 boundsの最終双対残差は1.25e-5〜9.27e-5で、許容値1e-7へ届かない。S2の100°もnativeで停滞した。WASIと終了理由が違ったのはS1 guessの99°とS2の100°。多段ペイロードの方式間幅は0.001 kg未満、native/WASI差は最大0.000408 kgだった。

独立したKKT none/Ruiz/slack-based比較は、nativeの単段/多段で各3初期推定とも合格。WASI多段99°も3方式とも合格。上流既定はnoneで、明示noneの対照試験は同じ反復・SI結果を返した。

S3閾値100では小問題の係数は1だったため、別の回帰試験では閾値1も使う。MOMO/多段基準の非単位補正は85/552行。粗メッシュでは単段約36.34 m、多段30.91〜45.80 mの再積分差と投入/荷重違反が残った。尺度変更ではメッシュ誤差を解消できない。

既定はS0・L-BFGS・KKT上流既定を維持する。ロケットの厳密Hessian・拘束独立性・線形系診断は後続。WASIは5,258,735 bytes、ケースごとの線形メモリ容量は最大107 MiB。時間は単発・一部並行負荷を含むため、速度順位の確定には使わない。

## 再現

```sh
cargo build --locked --release --features optimization --bin openTsiolkovsky-optimize
bash scripts/optimization_wasm_build.sh
python3 scripts/study_optimization_numerics.py --output out/optimization/study-new
# manifestの全条件。任意の正規表現引数で対象を絞れる
bun scripts/study_optimization_numerics_wasm.ts out/optimization/study-new/manifest.json
python3 scripts/summarize_optimization_numerics.py out/optimization/study-new out/optimization/study-new/records
```

入力・全結果・stderrと逐次集計を保存し、既存保存先は上書き拒否する。WASIの任意引数は`NAME_REGEX, WASM_PATH, OUTPUT_DIR`。公開CSVは全予定条件の記録完了を検査して出力する。反復数は履歴の最大iteration、復元数はrestoration記録数。process時間はモデル再構築・入出力も含み、個別timerの和とは異なる。

回帰はRust単体141件・統合10件、通常構成109件・統合7件、native/WASM/WASIのclippy、フロント130件・本番ビルドが合格。主双対・中断/再実行、旧結果互換、新しい全結果のIndexedDB再読込も確認した。
