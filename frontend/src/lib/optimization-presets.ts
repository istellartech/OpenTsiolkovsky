import multiStage from '../../../examples/optimization/two_stage_500km_43deg.json?raw'
import multiCoarse from '../../../examples/optimization/two_stage_500km_43deg_coarse.json?raw'
import momo from '../../../examples/optimization/momo_single_stage.json?raw'
import momoCoarse from '../../../examples/optimization/momo_single_stage_coarse.json?raw'
import hs071 from '../../../examples/optimization/hs071.json?raw'
import doubleIntegrator from '../../../examples/optimization/double_integrator.json?raw'
import zero from '../../../examples/optimization/zero_500km_43deg.json?raw'
import { tr } from './i18n'

export const optimizationPresets = {
  multi_stage: multiStage,
  single_stage: momo,
  multi_stage_coarse: multiCoarse,
  single_stage_coarse: momoCoarse,
  double_integrator: doubleIntegrator,
  hs071,
  zero,
}
export function optimizationPresetOptions() {
  return [
    { id: 'multi_stage', label: tr('仮定した2段機 · 500 km / 43°', 'Assumed two-stage · 500 km / 43°') },
    { id: 'single_stage', label: tr('MOMO単段 · 100 km', 'Single-stage MOMO · 100 km') },
    { id: 'multi_stage_coarse', label: tr('2段機 · 粗いメッシュ（不合格例）', 'Two-stage · coarse mesh (failure example)') },
    { id: 'single_stage_coarse', label: tr('MOMO · 粗いメッシュ（不合格例）', 'MOMO · coarse mesh (failure example)') },
    { id: 'double_integrator', label: tr('二重積分器 · 数値ベンチマーク', 'Double integrator · numerical benchmark') },
    { id: 'hs071', label: tr('HS071 · 接続試験', 'HS071 · connection benchmark') },
    { id: 'zero', label: tr('ZERO · データ未設定', 'ZERO · missing data') },
  ]
}
