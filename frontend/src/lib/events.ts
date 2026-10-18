import { displayName, phaseLabel, type FlightPresentation } from './presentation'
// Display names for flight events (kept out of lib/trajectory, which also
// runs in the solver worker where the UI language is unknown).
import { tr } from './i18n'
import type { FlightMode } from './simulation'
import type { FallTrack, FlightEvent } from './trajectory'

export function eventLabel(e: FlightEvent, presentation?: FlightPresentation): string {
  const phase = phaseLabel(presentation, e.stage ?? 1)
  switch (e.kind) {
    case 'ignition':
      return tr(`${phase} 点火`, `${phase} ignition`)
    case 'liftoff':
      return tr('リフトオフ', 'Liftoff')
    case 'railexit':
      return tr('ランチャー離脱', 'Rail exit')
    case 'mach1':
      return tr('音速突破', 'Mach 1')
    case 'maxq':
      return tr('最大動圧', 'Max-Q')
    case 'separation':
      return tr(`${separationLabel(e.stage ?? 1, presentation)} 分離`, `${separationLabel(e.stage ?? 1, presentation)} separation`)
    case 'burnout':
      return tr(`${phase} 燃焼終了`, `${phase} burnout`)
    case 'jettison': {
      const name = displayName(presentation?.bodies[`stage${e.stage}_${e.body}`]) || e.body || tr('投棄物', 'Jettisoned part')
      return tr(`${name} 分離`, `${name} jettison`)
    }
    case 'apogee':
      return tr('最高到達点', 'Apogee')
    case 'end':
      return e.landed ? tr('着地', 'Impact') : tr('計算終了', 'End of run')
  }
}

/** Short tag for the timeline. */
export function eventShort(e: FlightEvent, presentation?: FlightPresentation): string {
  switch (e.kind) {
    case 'ignition':
      return tr('点火', 'IGN')
    case 'liftoff':
      return 'LO'
    case 'railexit':
      return 'RAIL'
    case 'mach1':
      return 'M1'
    case 'maxq':
      return 'Max-Q'
    case 'separation':
      return displayName(presentation?.phases[(e.stage ?? 1) - 1]?.separation_name) || tr('分離', 'SEP')
    case 'burnout':
      return tr('燃焼終了', 'BO')
    case 'jettison':
      return tr('投棄', 'JET')
    case 'apogee':
      return 'APO'
    case 'end':
      return e.landed ? 'IMP' : 'END'
  }
}

/** Name of a released body's jettison (the id after `stage<N>_`), if any */
const jettisonName = (id: string) => /^stage\d+_(.+)$/.exec(id)?.[1]

/** A released group may be several boosters; its stable body ID is unchanged. */
function separationLabel(stage: number, presentation?: FlightPresentation): string {
  return displayName(presentation?.phases[stage - 1]?.separation_name) || tr(`区間${stage}の分離物`, `Interval ${stage} released body`)
}

/** Name of a released body, shared by the globe, tables, KML and Monte Carlo. */
export function fallBodyLabel(b: Pick<FallTrack, 'kind' | 'stage' | 'id'>, presentation?: FlightPresentation): string {
  if (b.kind === 'stage') return separationLabel(b.stage, presentation)
  return (
    displayName(presentation?.bodies[b.id]) || jettisonName(b.id) || tr(`区間${b.stage}の投棄物`, `Interval ${b.stage} jettisoned part`)
  )
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
export function mcBodyLabel(body: string, presentation?: FlightPresentation): string {
  if (body === 'vehicle') return tr('機体', 'Vehicle')
  const m = /^stage(\d+)(_.+)?$/.exec(body)
  if (!m) return body
  return fallBodyLabel({ id: body, kind: m[2] ? 'jettison' : 'stage', stage: Number(m[1]) }, presentation)
}
