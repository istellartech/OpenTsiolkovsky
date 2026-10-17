// Display names for flight events (kept out of lib/trajectory, which also
// runs in the solver worker where the UI language is unknown).
import { tr } from './i18n'
import type { FlightEvent } from './trajectory'

export function eventLabel(e: FlightEvent): string {
  switch (e.kind) {
    case 'liftoff':
      return tr('リフトオフ', 'Liftoff')
    case 'maxq':
      return tr('最大動圧', 'Max-Q')
    case 'separation':
      return tr(`${e.stage}/${e.nextStage}段 分離`, `Stage ${e.stage}/${e.nextStage} separation`)
    case 'burnout':
      return tr(`${e.stage}段 燃焼終了`, `Stage ${e.stage} burnout`)
    case 'apogee':
      return tr('最高到達点', 'Apogee')
    case 'end':
      return e.landed ? tr('着地', 'Impact') : tr('計算終了', 'End of run')
  }
}

/** Short tag for the timeline. */
export function eventShort(e: FlightEvent): string {
  switch (e.kind) {
    case 'liftoff':
      return 'LO'
    case 'maxq':
      return 'Max-Q'
    case 'separation':
      return `SEP${e.stage}`
    case 'burnout':
      return `BO${e.stage}`
    case 'apogee':
      return 'APO'
    case 'end':
      return e.landed ? 'IMP' : 'END'
  }
}
