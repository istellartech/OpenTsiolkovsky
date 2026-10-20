import twoStage from '../../../examples/optimization/two_stage_80t_500km_43deg.json?raw'
import singleStage from '../../../examples/optimization/single_stage_100km.json?raw'
import { tr } from './i18n'

/** The two example cases offered in the browser: orbital two-stage and single-stage sounding rocket. */
export const optimizationPresets = {
  two_stage_80t: twoStage,
  single_stage: singleStage,
}
export type OptimizationPresetId = keyof typeof optimizationPresets
export const DEFAULT_OPTIMIZATION_PRESET: OptimizationPresetId = 'two_stage_80t'

export function rocketPresetOptions(): { id: OptimizationPresetId; label: string; description: string }[] {
  return [
    {
      id: 'two_stage_80t',
      label: tr('2段ロケット（軌道投入）', 'Two-stage rocket (orbital)'),
      description: tr(
        '全備約80 t · 高度500 km・傾斜角43°の円軌道へ衛星を投入',
        'About 80 t at launch · satellite to a 500 km, 43° circular orbit',
      ),
    },
    {
      id: 'single_stage',
      label: tr('単段観測ロケット', 'Single-stage sounding rocket'),
      description: tr('頂点高度100 kmまで運べる追加ペイロード', 'Extra payload to a 100 km apogee'),
    },
  ]
}

/**
 * How the simulation's sample vehicles fare when turned into an optimization
 * case with their simulated flight (`optimizationFromSimulation`) and solved
 * with the adapted defaults. Measured 2026-10-21 with native/WASI solvers; a
 * vehicle edited after loading is no longer covered.
 * - `validated`: converges and passes the independent check
 * - `refine`: converges; the check passes after re-running with a finer mesh
 * - `unsolved`: does not converge without adjusting the mission or limits
 */
export type SampleOptimizationStatus = 'validated' | 'refine' | 'unsolved'
const SAMPLE_OPTIMIZATION: Record<string, SampleOptimizationStatus> = {
  momo: 'validated',
  h2a202: 'validated',
  'h3-22s': 'validated',
  s310: 'validated',
  s520: 'validated',
  epsilon: 'validated',
  falcon9: 'validated',
  ariane5: 'validated',
  'long-march-3b': 'validated',
  'saturn-v': 'validated',
  'soyuz-2.1a': 'validated',
  'ss520-5': 'validated',
}
export const sampleOptimizationStatus = (presetId: string): SampleOptimizationStatus | null => SAMPLE_OPTIMIZATION[presetId] ?? null
