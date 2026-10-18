// Display names for flight events (kept out of lib/trajectory, which also
// runs in the solver worker where the UI language is unknown).
import { tr } from './i18n'
import type { FlightMode } from './simulation'
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
      return e.body
        ? tr(`${e.stage}段 ${e.body} 分離`, `Stage ${e.stage} ${e.body} jettison`)
        : tr(`${e.stage}段 投棄物分離`, `Stage ${e.stage} jettison`)
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

/** Name of a released body's jettison (the id after `stage<N>_`), if any */
const jettisonName = (id: string) => /^stage\d+_(.+)$/.exec(id)?.[1]

/** Name of a spent stage or jettisoned body. */
export function fallBodyLabel(b: Pick<FallTrack, 'kind' | 'stage' | 'id'>): string {
  if (b.kind === 'stage') return tr(`${b.stage}段（使用済み）`, `Spent stage ${b.stage}`)
  const name = jettisonName(b.id)
  return name ? tr(`${b.stage}段の${name}`, `Stage ${b.stage} ${name}`) : tr(`${b.stage}段の投棄物`, `Stage ${b.stage} jettisoned part`)
}

/** Flight mode, as shown in the telemetry readout. */
export function flightModeLabel(mode: FlightMode): string {
  switch (mode) {
    case 'powered':
      return tr('動力飛行', 'Powered')
    case 'aero_stable':
      return tr('慣性飛行（空力安定）', 'Coast (aero-stable)')
    case 'attitude_program':
      return tr('慣性飛行（指定姿勢）', 'Coast (commanded attitude)')
    case 'ballistic':
      return tr('弾道飛行', 'Ballistic')
  }
}

/** Name of a Monte Carlo body (`vehicle`, `stage1`, `stage2_fairing`). */
export function mcBodyLabel(body: string): string {
  if (body === 'vehicle') return tr('機体', 'Vehicle')
  const m = /^stage(\d+)(_.+)?$/.exec(body)
  if (!m) return body
  return fallBodyLabel({ id: body, kind: m[2] ? 'jettison' : 'stage', stage: Number(m[1]) })
}
