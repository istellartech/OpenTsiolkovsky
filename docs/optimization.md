# 軌道最適化の使い方

MOMO単段と仮定した2段機のペイロード最適化に対応する。[進捗と残作業](trajectory-optimization-status.md)、[設計計画](trajectory-optimization-plan.md)、[尺度・Hessian・比較結果](optimization-numerics.md)は別文書にまとめる。

## Nativeでの実行

```sh
cargo build --locked --release --features optimization --bin openTsiolkovsky-optimize
target/release/openTsiolkovsky-optimize \
  --config examples/optimization/two_stage_500km_43deg.json --output /tmp/opt-result.json
# 求解せず入力を検査
target/release/openTsiolkovsky-optimize --config examples/optimization/zero_500km_43deg.json --check
```

| 入力例（examples/optimization/） | 問題と対応範囲 |
| --- | --- |
| `hs071.json` | 4変数の既知解。最適目的値は約17.014017289 |
| `double_integrator.json` | x′=v、v′=a。静止から1,000 m先の静止へ。J=∫a²dt+3600T、解析解T=10 s・J=48,000 |
| `double_integrator_exact.json` | 同じ問題を厳密Hessian・非単位S3補正・Ruizで解く |
| `momo_single_stage.json` | MOMO Flight 3モデル。100 km頂点への追加ペイロードを最大化。射向・燃焼・スロットル固定、仰角と惰行時間を最適化 |
| `two_stage_500km_43deg.json` | 仮定した2段機。衛星分離直後の500 km円軌道・傾斜角43°へ正味衛星質量を最大化。7フェーズ・上段2回着火 |
| `*_coarse.json` | 求解収束と独立検証の合否が一致しないことを確認する粗メッシュ例 |
| `zero_500km_43deg.json` | 不足データを検出するテンプレート。ZERO実機の求解は未対応 |

終了コードは0=収束かつ検証合格、1=求解/検証/IO失敗、2=引数誤り、3=入力不正・未設定。反復上限や中断でも診断用の結果JSONを保存する。

## モデルと成功判定

状態は質量・ECI位置/速度の並進3DoF。J2重力、地球回転、大気、風、推進・空力を既存シミュレータと共有する。姿勢は直接指定し、回転運動やTVC応答は解かない。MOMO惰行は対気流へ瞬時整列する`aero_stable`近似、多段惰行は角度がフェーズ内で線形に変わる制御に限定する。現在のロケット最適化は一定の正の真空推力/Ispと固定スロットルに対応する。

- ペイロードを初期質量へ加え、全飛行へ影響させる。乾燥質量・搭載推進剤・予備量・投棄物・PAF・正味衛星を分ける。
- 段分離では乾燥質量と実際の残推進剤を除き、位置・速度を連続に保つ。分離インパルスは0。着火回数・イベント順序は固定する。
- 動圧、迎角、非重力比力、制御角・レートを制約する。低速迎角は円錐残差、制御多項式の角度/レートはBernstein包絡でも制限する。
- 最適化制御を初期状態から独立RK45で再積分する。イベントで停止し、後続区間をNLP状態へリセットしない。多段では推進剤累積消費も独立に積分して投棄残量を計算する。ロケットでは各区間60分割・LGR点・イベント両側、10倍厳しいRK45とも照合する。

成功には`Solve_Succeeded`と同じSI上限・検証許容値での再積分合格が必要。密な標本検査は連続時間の保証ではない。熱、回廊/落下域、相対分離、6DoF、沈降・再着火資源は未評価として結果に残す。仮定した2段機の数値はZEROの性能値ではない。

## ブラウザでの実行

```sh
rustup target add wasm32-wasip1
cd frontend
bun install
bun run dev:optimization
```

ヘッダの「軌道最適化」から開く。

1. **設定**でケース、質量、フェーズ時間、制約、メッシュ・許容値を編集する。時間/ペイロードの上下限が等しければ固定。構成や尺度/Hessian/KKTは「JSON・詳細」で編集する。
2. **最適化を実行**で入力を固定し、別Workerで求解・検証する。中断後は再実行できるが途中解は失われる。
3. **結果**で収束と検証、SI値、質量・イベント、制約、尺度・主双対・コード版を確認する。地図とグラフは時間カーソルを共有する。通常ホイールはスクロール、Ctrl/⌘＋ホイールは地図ズーム。
4. **保存した実行**から復元・2件比較・入力の再編集・アーカイブ・全結果JSON保存を行う。下書きと全結果はIndexedDBへ自動保存する。バックアップにはJSONを使う。

入力/全結果JSONは読込ボタンかドロップで取り込める（64 MiBまで）。結果読込は記録の表示であり再検証ではない。不正ファイルは現在の設定を残して拒否する。比較では物理条件の違いを示す。メッシュ細分化は新しいcold startとして保存する。

最適化は専用の`wasm32-wasip1`とJSON ABI/WASI shimを使う。既存のwasm-bindgenシミュレータは別モジュール。Worker中断にCOOP/COEPやSharedArrayBufferは不要。

## 入出力

最適化専用の`schema_version: 1`を使い、既存シミュレータの入力・CSV・summaryは変更しない。入力には物理上限、検証許容値、尺度を別々に指定する。pounceは0.12.0固定。内部cold retryは無効化し、復元フェーズと終了理由を記録する。

結果には入力、コードSHA、solver版、実効オプション、変数/制約名、反復履歴、全主双対、独立検証を保存する。`nlp_layout`は初期値・bounds・疎構造を含む。PR 3で追加したSI変換・数値診断のフィールドは[数値仕様](optimization-numerics.md#変換と結果json)を参照。古い結果も読める。

入力schemaの更新後は、フロントエンドの型・検査・例も同期する。

```sh
target/release/openTsiolkovsky-optimize --schema > frontend/src/lib/optimization-schema.json
cd frontend && bunx vp check --fix && bunx vp test run
```

Git情報のないソース配布ではビルド時に`OPENTSIOLKOVSKY_REVISION`を指定する。未コミットのRust変更があるビルドはrevisionに`-dirty`を付ける。

## 検証と再現

```sh
cargo test --locked --features optimization
cargo clippy --all-targets --features optimization -- -D warnings
bash scripts/optimization_wasm_build.sh
bun scripts/test_optimization_wasm.ts
python3 scripts/verify_single_stage.py
python3 scripts/verify_multi_stage.py
# 全疎成分の中心差分監査（release専用）
cargo test --release --features optimization central_jacobian_audit -- --ignored --nocapture
cd frontend && bunx vp check && bunx vp test run && bun run build
```

| S0の基準ケース | ペイロード | 再積分の最大位置差 / 速度差 |
| --- | ---: | ---: |
| MOMO | 追加16.89234 kg | 0.09141 m / 0.01463 m/s |
| 仮定した2段機 | 正味2,557.50407 kg | 2.00164 m / 0.003802 m/s |

多段基準の近地点/遠地点は499,999.9987 / 500,009.6400 m、傾斜角42.999999455°。KKT許容値1e-7で収束し、1e-8では500反復上限でも再積分は合格する。粗メッシュは単段・多段とも検証不合格。高次数化や全体の区間数増加だけでは誤差が単調に減らない。

`verify_*`は固定条件・メッシュ・3初期推定・不適合例の入力と全結果を`out/optimization/`へ保存する。native/WASI照合は全主双対とSI軌道を確認し、inactive不等式の値には一致を要求しない。多段ヤコビアン146,995成分の中心差分監査は最大規格化誤差2.33e-8。尺度・Hessianを変えた全条件は[PR 3の比較記録](optimization-numerics.md#2026-10-19の比較結果)にまとめる。

## ライセンス

本体はMIT、pounceはEPL-2.0。最適化WASMにはEPL本文と[固定版ソース](https://crates.io/crates/pounce-algorithm/0.12.0)の入手先を同梱する。
