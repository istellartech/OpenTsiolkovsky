// Display names for flight events (kept out of lib/trajectory, which also
// runs in the solver worker where the UI language is unknown).
import { tr } from './i18n'
import type { FlightModeName } from './simulation'
import type { FallTrack, FlightEvent } from './trajectory'

export function eventLabel(e: FlightEvent): string {
  switch (e.kind) {
    case 'ignition':
      return tr(`${e.stage}段 点火`, `Stage ${e.stage} ignition`)
    case 'liftoff':
      return tr('リフトオフ', 'Liftoff')
    case 'railexit':
      return tr('ランチャー離脱', 'Rail exit')
    case 'mach1':
      return tr('音速突破', 'Mach 1')
    case 'maxq':
      return tr('最大動圧', 'Max-Q')
    case 'separation':
      return tr(`${e.stage}/${e.nextStage}段 分離`, `Stage ${e.stage}/${e.nextStage} separation`)
    case 'burnout':
      return tr(`${e.stage}段 燃焼終了`, `Stage ${e.stage} burnout`)
    case 'jettison':
      return tr(`${e.stage}段 投棄物分離`, `Stage ${e.stage} jettison`)
    case 'apogee':
      return tr('最高到達点', 'Apogee')
    case 'end':
      return e.landed ? tr('着地', 'Impact') : tr('計算終了', 'End of run')
  }
}

/** Short tag for the timeline. */
export function eventShort(e: FlightEvent): string {
  switch (e.kind) {
    case 'ignition':
      return `IGN${e.stage}`
    case 'liftoff':
      return 'LO'
    case 'railexit':
      return 'RAIL'
    case 'mach1':
      return 'M1'
    case 'maxq':
      return 'Max-Q'
    case 'separation':
      return `SEP${e.stage}`
    case 'burnout':
      return `BO${e.stage}`
    case 'jettison':
      return `JET${e.stage}`
    case 'apogee':
      return 'APO'
    case 'end':
      return e.landed ? 'IMP' : 'END'
  }
}

/** Name of a spent stage or dumping product. */
export function fallBodyLabel(b: Pick<FallTrack, 'kind' | 'stage'>): string {
  return b.kind === 'stage'
    ? tr(`${b.stage}段（使用済み）`, `Spent stage ${b.stage}`)
    : tr(`${b.stage}段の投棄物`, `Stage ${b.stage} jettisoned part`)
}

/** Flight mode, as shown in the telemetry readout. */
export function flightModeLabel(mode: FlightModeName): string {
  switch (mode) {
    case 'power_3DoF':
      return tr('動力飛行', 'Powered')
    case 'free_aero_stable':
      return tr('慣性飛行（空力安定）', 'Coast (aero-stable)')
    case 'free_3dof':
      return tr('慣性飛行（指定姿勢）', 'Coast (commanded attitude)')
    case 'free_ballistic':
      return tr('弾道飛行', 'Ballistic')
  }
}

/** Name of a Monte Carlo body key (`vehicle`, `stage1`, `stage2_dump`). */
export function mcBodyLabel(body: string): string {
  if (body === 'vehicle') return tr('機体', 'Vehicle')
  const m = /^stage(\d+)(_dump)?$/.exec(body)
  if (!m) return body
  return fallBodyLabel({ kind: m[2] ? 'dump' : 'stage', stage: Number(m[1]) })
}
