import type { ClientStageConfig } from '../lib/simulation'
import { tr } from '../lib/i18n'

export const POWER_MODE_OPTIONS = [
  { value: 0, get label() { return tr('0: 3DoF（標準）', '0: 3DoF (standard)') } },
  { value: 1, get label() { return tr('1: 3DoF（遅れ付き）', '1: 3DoF (with lag)') } },
  { value: 2, label: '2: 6DoF' },
  { value: 3, get label() { return tr('3: 6DoF（空力安定）', '3: 6DoF (aerodynamically stable)') } },
]

export const FREE_MODE_OPTIONS = [
  { value: 0, get label() { return tr('0: 空力安定', '0: Aerodynamically stable') } },
  { value: 1, get label() { return tr('1: 3DoF 指定姿勢', '1: 3DoF, commanded attitude') } },
  { value: 2, get label() { return tr('2: 弾道飛行', '2: Ballistic') } },
]

export const MAX_STAGE_COUNT = 5

export function createDefaultStage(): ClientStageConfig {
  return {
    power_mode: 0,
    free_mode: 0,
    mass_initial_kg: 1150,
    mass_dry_kg: 390,
    burn_start_s: 0,
    burn_end_s: 62,
    forced_cutoff_s: 62,
    separation_time_s: 600,
    coast_time_s: 0,
    stage_num: 1,
    throat_diameter_m: 0.13,
    nozzle_expansion_ratio: 4,
    nozzle_exit_pressure_pa: 1500,
    thrust_constant: 30000,
    isp_constant: 250,
    thrust_multiplier: 1,
    isp_multiplier: 1,
    cg_position_m: [0, 0, 4.5],
    rotational_inertia_kgm2: [900, 900, 120],
    thrust_profile: [],
    isp_profile: [],
  }
}
