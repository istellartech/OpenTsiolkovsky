import type { FreeFlight, Stage } from '../lib/config'
import { tr } from '../lib/i18n'

export const FREE_FLIGHT_OPTIONS: { value: FreeFlight; label: string }[] = [
  {
    value: 'aero_stable',
    get label() {
      return tr('空力安定', 'Aerodynamically stable')
    },
  },
  {
    value: 'attitude_program',
    get label() {
      return tr('指定姿勢', 'Commanded attitude')
    },
  },
  {
    value: 'ballistic',
    get label() {
      return tr('弾道飛行', 'Ballistic')
    },
  },
]

export const MAX_STAGE_COUNT = 5

/** Exit area of a nozzle from its throat diameter and expansion ratio [m²] */
export const exitArea = (throatDiameter: number, expansion: number) => (Math.PI / 4) * throatDiameter ** 2 * expansion

export function createDefaultStage(): Stage {
  return {
    mass_initial_kg: 1150,
    mass_dry_kg: 390,
    engine: {
      thrust_vac_n: 30000,
      isp_vac_s: 250,
      burn_start_s: 0,
      burn_end_s: 62,
      nozzle_exit_area_m2: Math.round(exitArea(0.13, 4) * 1e4) / 1e4,
    },
    aero: { diameter_m: 0.5, ca: 0.4, cn_alpha_per_rad: 0.2, ballistic_coefficient_kg_m2: 100 },
    free_flight: 'aero_stable',
  }
}
