# 軌道最適化の実装と検証

実装計画は [trajectory-optimization-plan.md](trajectory-optimization-plan.md)。現在は
PR 0のソルバー接続と、PR 3の先行部分である二重積分器の多区間LGR試験を実装した。
既存シミュレーションの入力・CSV・summaryは変更していない。

| 計画の段階 | この実装の範囲 |
| --- | --- |
| PR 0 | pounce版固定、native/WASI TNLP、全解・終了理由・微分検査・中断/再実行、ZERO入力の不足検出 |
| PR 1 | 未着手。共通のジェネリック飛行物理・num-dual・nalgebra更新は後続 |
| PR 2 | 検証用の厳密RK45 APIを先行追加。既存シミュレータの積分経路の移行は後続 |
| PR 3 | flipped LGR、複数区間、疎解析微分、S0物理尺度、固定/自由時間、解析解との比較を先行実装。局所AD、厳密Hessian、S1〜S3・双対のSI逆変換は後続 |
| PR 4〜6 | ロケット飛行の求解、多段・ZERO性能、機体制約、運用UI・永続化は後続。現在の画面は数値試験用 |

## Nativeでの実行

```sh
cargo run --release --features optimization --bin openTsiolkovsky-optimize -- \
  --config examples/optimization/hs071.json --output /tmp/hs071-result.json
cargo run --features optimization --bin openTsiolkovsky-optimize -- \
  --config examples/optimization/zero_500km_43deg.json --check
```

HS071は4変数・2制約の既知解問題。目的値は約17.014017289、変数は約
`[1, 4.74299964, 3.82114998, 1.37940829]`。実機の性能試験ではない。
ZEROの500 km円軌道・43°プリセットは、LC-1位置、打上げUTC、質量内訳、機体制約等が
未設定のため意図的に実行できない。`--check`は不足項目をJSONで返し終了コード3となる。
未設定値を0や無制約へ置換しない。
`--schema`で最適化専用のJSON Schemaを出力できる。終了コードは0=成功、1=求解/検証/IO失敗、2=引数誤り、3=入力不正または未設定。

```sh
cargo run --release --features optimization --bin openTsiolkovsky-optimize -- \
  --config examples/optimization/double_integrator.json --output /tmp/trajectory-result.json
```

二重積分器は `x'=v, v'=a`、静止状態から1000 m先の静止状態への移動で、
`J=∫a²dt + 3600 T` を最小化する。重力・空力・推進剤を含まない解析用問題である。
固定時間の最適制御は `a(t)=6d/T²(1-2t/T)`、`J=12d²/T³+3600T`。
自由時間の最適値は `T=(36d²/3600)^(1/4)=10 s`、目的値48,000 m²/s³。
入力例の初期値12 sでの物理尺度を求解中は固定するため、TNLP尺度の目的値は82.944。
初期推定は線形位置・速度0・制御0とし、解析解を初期値へ埋め込んでいない。

状態は各区間の左端と右LGR点、制御は右LGR点だけに置き、隣接区間の端点状態を共有する。
4区間×次数4を例とし、終端時刻は上下限を同じ値にすると固定できる。
入力・状態・時間・制約の微分は解析式。非線形なロケット物理を有限差分で代用する実装は追加していない。

入力・結果は独立した`schema_version: 1`。pounce一式は0.12.0に固定する。
目的・制約の尺度と検証許容値は別に扱う。HS071は単位尺度、
`nlp_scaling_method=none`、KKTは上流既定、HessianはL-BFGS。
採用版は内部のcold retryを持つため、`presolve`、`l1_fallback_on_restoration_failure`、`mu_strategy_fallback`、`dual_divergence_retry`を明示的に無効にし、実効オプションへ記録する。復元フェーズは通常の内点法の一部として接続する。
結果は全主変数、上下限乗数、全制約値・乗数、変数/制約名、反復履歴、入力、
実効オプション、ソルバー版、ビルド時のcommit SHA（未コミットのコード変更は`-dirty`）を保存する。
`nlp_layout`には初期値、上下限、疎ヤコビアンの位置も保存する。主・双対変数はTNLP座標であり、SI感度への逆変換は後続とする。
配布ソースにGit情報がない場合はビルド時の`OPENTSIOLKOVSKY_REVISION`で指定できる。

終了コード0には`Solve_Succeeded`と数値検証合格の両方が必要。
反復上限・中断・許容精度での終了は成功扱いしない。結果JSONは診断用に保存する。
`solver.stop_after_iteration`は中断経路を再現するための設定で、0なら最初のcallbackで停止する。
ソルバーの実行不能判定は、非凸問題に解が存在しないという数学的証明を意味しない。

## 再積分と数値検証

二重積分器はLGR制御多項式を復元し、初期端点の制御を明示的に外挿する。
指定された初期状態からRK45で前進し、区間境界で厳密に停止する。
後続区間を最適化ノードの状態でリセットしない。ノードと各区間20分割の検査点で
状態多項式との位置・速度差を検査し、制御エネルギーも別状態として再積分する。
RK許容値をさらに10倍厳しくした計算との差、解析的な時刻・目的値との誤差も保存する。

`try_advance_to`は状態成分別の絶対許容値、相対許容値、最小/最大刻み、反復上限を持つ。
最小刻みで精度未達なら時刻も状態も進めずエラーとし、中間段の非有限値もエラーにする。固定長配列により状態/微分の次元は型で一致させる。
最新の固定長配列・FSALカーネルを共有する。既存シミュレータの`advance_to`は強制採択/警告の仕様を維持する。旧`integrate_with_outputs`は最新構成に存在しない。
ロケット用検証器へ接続する前にPR 2のイベント/誤差伝播を仕上げる必要がある。
密な検査点の合格は連続時間のパス制約保証を意味しない。

## ブラウザでの実行

```sh
rustup target add wasm32-wasip1
bash scripts/optimization_wasm_build.sh
cd frontend
bun install
bun run dev:optimization
```

ヘッダの的のアイコン「軌道最適化（数値試験）」から専用ダイアログを開く。日本語/英語とテーマは現在のアプリに従う。入力JSONを編集して実行する。
画面は求解終了理由、数値検証、軌道グラフ、直近2件の比較、全結果JSON保存を持つ。
比較する実行の物理設定と尺度はユーザーが確認する。
実行IDごとに入力を固定し、中断したWorkerのメッセージを後続結果へ混入させない。
保存はJSONダウンロード、画面の履歴はメモリのみ。warm startとIndexedDBは未実装。

既存wasm-bindgenシミュレータと別の`wasm32-wasip1`モジュールをビルドする。
長さ付きUTF-8 JSON ABIと小さなWASI shimで通信し、求解と検証はWorker内で実行する。
中断方式は`worker.terminate()`を選択した。COOP/COEP・SharedArrayBufferは不要で、
途中の解は失われる。callbackによる協調停止はnative/WASIの試験設定で検証済み。
反復分割によるwarm startやSharedArrayBuffer方式の性能比較は未実施。
ファイル操作用WASIインポートにはエラーを返し、環境変数も渡さない。
`clock_time_get`、`fd_write`、ハッシュ用乱数等、採用版の実際のインポートをテストで確認する。

## 回帰の実行

```sh
cargo test --locked --features optimization
cargo clippy --all-targets --features optimization -- -D warnings
cargo build --locked --features optimization --bin openTsiolkovsky-optimize
bash scripts/optimization_wasm_build.sh
bun scripts/test_optimization_wasm.ts
cd frontend
bunx vp check
bunx vp test run
bun run build
```

WASI試験はブラウザと同じshimを使い、nativeに対する全主双対ベクトル、目的値、
終了理由、検証合否の一致、中断・反復上限・入力エラー・再実行を確認する。
製品ビルドをローカル配信し、ブラウザでも求解合格、大きなメッシュの実行中断、その後の新しいWorkerでの再実行、ZEROの未設定エラー、既存MOMO画面への復帰を確認した。

2026-10-19の検証結果（macOS arm64 / Rust 1.97.1 / pounce 0.12.0）:

- Rust: 最適化feature有効113件、無効105件の単体テスト。C++比較・保存則・プレゼンテーション7件、最適化CLI統合2件も合格。フロント96件。Clippy警告なし。従来のwasm-bindgenターゲットも型検査合格。
- HS071: native/WASIとも`Solve_Succeeded`、目的値17.014017289176、微分検査12項目に疑義なし、L-BFGSでHessian呼出し0。
- 二重積分器: native/WASIとも`Solve_Succeeded`。4×4メッシュは28反復記録、T=10.000000000301544 s、再積分目的約48,000。
- 同ケースの位置多項式と再積分の最大差1.6681e-9 m、速度差5.6843e-14 m/s。許容値はそれぞれ0.001 m、0.0001 m/s。
- 疎ヤコビアンと目的の方向微分を3種類の差分刻みで検証。pounceの微分検査279項目に疑義なし。
- 初期時刻尺度8/12/20 sと2×3、4×4、6×5メッシュを比較し、同じ解析解と再積分合格を確認。
- WASMは約4.1 MB（非圧縮、サイズの正確な値はビルドスクリプトが表示）。試験時の線形メモリ2,359,296 bytes。

この精度は低次数多項式で表せる既知解問題の結果であり、ロケット飛行で同じ精度や収束性を保証しない。
ZEROの性能値・投入誤差・荷重・回廊等はまだ評価していない。

## 依存のライセンス

pounceは改変せずcrates.ioの依存として利用する。pounceはEPL-2.0、
本プロジェクトのコードはMIT。配布する最適化WASMにはEPL本文とpounceのソース入手先を同梱する。
ソース: <https://github.com/jkitchin/pounce>、
固定配布物: <https://crates.io/crates/pounce-algorithm/0.12.0>。
