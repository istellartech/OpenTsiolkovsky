import twoStage80t from '../../../examples/optimization/two_stage_80t_500km_43deg.json?raw'
import multiStage from '../../../examples/optimization/two_stage_500km_43deg.json?raw'
import multiCoarse from '../../../examples/optimization/two_stage_500km_43deg_coarse.json?raw'
import momo from '../../../examples/optimization/momo_single_stage.json?raw'
import momoCoarse from '../../../examples/optimization/momo_single_stage_coarse.json?raw'
import hs071 from '../../../examples/optimization/hs071.json?raw'
import doubleIntegrator from '../../../examples/optimization/double_integrator.json?raw'
import zero from '../../../examples/optimization/zero_500km_43deg.json?raw'
import { tr } from './i18n'

export const optimizationPresets = {
  two_stage_80t: twoStage80t,
  single_stage: momo,
  multi_stage: multiStage,
  multi_stage_coarse: multiCoarse,
  single_stage_coarse: momoCoarse,
  double_integrator: doubleIntegrator,
  hs071,
  zero,
}
export type OptimizationPresetId = keyof typeof optimizationPresets
export const DEFAULT_OPTIMIZATION_PRESET: OptimizationPresetId = 'two_stage_80t'

/** Vehicles a user would start from. */
export function rocketPresetOptions(): { id: OptimizationPresetId; label: string; description: string }[] {
  return [
    {
      id: 'two_stage_80t',
      label: tr('小型2段ロケット（仮定）', 'Small two-stage launcher (assumed)'),
      description: tr(
        '全備約80 t · 高度500 km・傾斜角43°の円軌道へ衛星を投入',
        'About 80 t at launch · satellite to a 500 km, 43° circular orbit',
      ),
    },
    {
      id: 'single_stage',
      label: tr('MOMO（単段観測ロケット）', 'MOMO (single-stage sounding rocket)'),
      description: tr('3号機の実績モデル · 頂点高度100 kmへの追加ペイロード', 'Flight 3 model · extra payload to a 100 km apogee'),
    },
  ]
}
/** Regression and numerical test cases kept for development. */
export function developerPresetOptions(): { id: OptimizationPresetId; label: string }[] {
  return [
    { id: 'multi_stage', label: tr('大型2段機（約225 t・旧既定ケース）', 'Large two-stage (≈225 t, former default)') },
    {
      id: 'multi_stage_coarse',
      label: tr('大型2段機 · 粗いメッシュ（検証不合格の例）', 'Large two-stage · coarse mesh (failing example)'),
    },
    { id: 'single_stage_coarse', label: tr('MOMO · 粗いメッシュ（検証不合格の例）', 'MOMO · coarse mesh (failing example)') },
    { id: 'double_integrator', label: tr('二重積分器（解析解のある試験問題）', 'Double integrator (analytic test problem)') },
    { id: 'hs071', label: tr('HS071（ソルバー接続試験）', 'HS071 (solver connection test)') },
    { id: 'zero', label: tr('ZERO（データ未整備・実行不可）', 'ZERO (data missing, cannot run)') },
  ]
}
export function optimizationPresetOptions() {
  return [...rocketPresetOptions(), ...developerPresetOptions()]
}
