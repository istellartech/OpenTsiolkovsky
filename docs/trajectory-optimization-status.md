# 軌道最適化の進捗

更新: 2026-10-19。実装は`2c6bfea`・`e50bcae`、比較記録は[PR 3の数値検証](optimization-numerics.md#2026-10-19の比較結果)。PR番号は[設計計画](trajectory-optimization-plan.md)の作業区分を指す。

MOMO単段と仮定した2段機は、ブラウザで編集・求解・独立検証・比較・保存まで動作する。ZERO実機の基準ケースは未完了。

## 計画との対応

| PR | 完了範囲 | 残作業 |
| --- | --- | --- |
| 0〜2 | pounce接続、共通3DoF物理・局所AD、厳密RK45、イベント・質量写像、native/WASI照合 | 新しいモデルを追加する際の検証 |
| 3 | LGR、自由時間、S0〜S3、SI主双対、単位不変性、小問題の厳密Hessian、KKT比較 | ロケットの厳密Hessian、フェーズ別質量尺度、詳細な線形系診断 |
| 4 | MOMOの追加ペイロード最適化、荷重・制御制約、ノード外検査 | 自由射向・スロットル・燃焼時間、warm start細分化 |
| 5a | 仮定した2段機の500 km / 43°投入、再着火・残量・分離・質量収支 | フェアリング投棄後の熱 |
| 5b | ZEROの不足データを検出するテンプレート | 実データ、ミッション/台帳と転写の接続、適用制約・外部検証 |
| 6 | 設定フォーム、地図、制約・診断、SI比較、JSON/IndexedDB保存 | 以下のUI残作業 |

## 物理・数値計算側

PR 3はnative 184条件・WASI 67条件を比較した。新方式には停滞例があり、既定はS0・L-BFGSを維持する。熱・回廊・相対分離・6DoF・再着火資源は未評価。多段の系統的な検証は2段機で行っており、3/4段の基準ケースは未検証。

| 次の作業 | 確認すること |
| --- | --- |
| warm start・誤差による区間細分化 | イベント前後を混ぜず補間し、誤差のある区間を改善する。cold startとSI結果・費用を比較 |
| ロケットの厳密Hessian | 局所二階AD、自由時間・接続・質量の交差項を監査。既存の1e-8停滞も調査 |
| 熱・荷重・エンジン包絡 | モデルと上限の出典・適用域を確定し、固定軌道で検証してからNLPへ接続 |
| ZERO基準ケース | LC-1/UTC、段別質量・推進・空力、PAF/投棄物、回廊、始動/分離条件を版付きで用意し、転写へ接続 |
| 名目外の検証 | 最適化制御を再生し、版付きの風・密度・推力・質量等のシナリオで評価 |

`Problem::Zero`は現在も実行を拒否する。データを埋めるだけで解ける状態ではない。

## UI側

新しい物理を追加せず進められる順序は次のとおり。

1. 自動ブラウザ回帰：入力エラー、正常/不合格、中断、保存・再読込・比較、狭幅とキーボード。
2. 制約状態の一元表示：必須・不足・未実装・外部検証・非適用を、再積分の検査結果と対応づける。
3. フェーズ構成のフォーム編集：燃焼/惰行、使用段、終了イベント、追加・削除・並替え。
4. 数値診断の拡充：入力差分、NLP配置・bounds・疎構造、S0〜S3/Hessian/KKTの操作とSI乗数。

現在の詳細設定はJSONで編集できる。保存記録の読込は再求解ではなく、メッシュ変更はcold start。地図は本体と分離位置を表示し、落下域/IIPは計算しない。

## 実装の入口

- 数値基盤：[optimization/](../src/optimization/)、共有物理：[flight.rs](../src/physics/flight.rs)、積分：[integrator.rs](../src/math/integrator.rs)
- UI：[OptimizationDialog.tsx](../frontend/src/components/OptimizationDialog.tsx)、[optimization/](../frontend/src/components/optimization/)、[useOptimization.ts](../frontend/src/hooks/useOptimization.ts)
- 入出力：[optimization-input.ts](../frontend/src/lib/optimization-input.ts)、[optimization-storage.ts](../frontend/src/lib/optimization-storage.ts)
- 操作・実行方法：[optimization.md](optimization.md)
