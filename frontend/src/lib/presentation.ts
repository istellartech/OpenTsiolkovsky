// Display terminology is independent of the solver's stable, 1-based interval IDs.
import type { Config, DisplayName, PhasePresentation, VehiclePresentation } from './config'
import type { FlightEvent } from './trajectory'
import { tr } from './i18n'

export interface FlightPresentation {
  vehicle?: VehiclePresentation | null
  phases: PhasePresentation[]
  /** Display names keyed by the existing solver body IDs. */
  bodies: Record<string, DisplayName>
}

export function displayName(name: DisplayName | null | undefined): string {
  if (typeof name === 'string') return name.trim()
  return name && typeof name.ja === 'string' && typeof name.en === 'string' ? tr(name.ja, name.en).trim() : ''
}

export function presentationFromConfig(config: Config): FlightPresentation {
  return {
    vehicle: config.presentation,
    phases: config.stages.map((s) => s.presentation ?? {}),
    bodies: Object.fromEntries(
      config.stages.flatMap((s, i) =>
        (s.jettisons ?? []).flatMap((j, k) =>
          j.display_name == null ? [] : [[`stage${i + 1}_${j.name || `jettison${k + 1}`}`, j.display_name]],
        ),
      ),
    ),
  }
}

export function phaseLabel(presentation: FlightPresentation | undefined, stage: number): string {
  return displayName(presentation?.phases[stage - 1]?.name) || tr(`区間${stage}`, `Interval ${stage}`)
}

export function structureLabel(presentation: VehiclePresentation | null | undefined, intervals: number): string {
  const stages = presentation?.stage_count
  const boosters = presentation?.booster_count
  const main = stages
    ? tr(`${stages}段式`, `${stages}-stage`)
    : tr(`${intervals}計算区間`, `${intervals} calculation interval${intervals === 1 ? '' : 's'}`)
  return boosters ? `${main} · ${tr(`ブースタ${boosters}本`, `${boosters} booster${boosters === 1 ? '' : 's'}`)}` : main
}

// Rounded virtual propellant allocations can deplete just before separation
// (H3: about 6 ms). This display-only window never changes solver events.
const CONTINUITY_WINDOW_S = 0.01

/** Remove only stop/start markers at a declared continuing-burn boundary. */
export function displayEvents(events: FlightEvent[], config?: Config): FlightEvent[] {
  if (!config) return events
  let start = 0
  const boundaries = new Map<number, { end: number; burnout: number }>()
  config.stages.forEach((s, i) => {
    const end = start + (s.separation_time_s ?? 0)
    const burnout = events.find((e) => e.kind === 'burnout' && e.stage === i + 1 && e.t <= end + 1e-9 && end - e.t <= CONTINUITY_WINDOW_S)
    if (i < config.stages.length - 1 && s.presentation?.engine_continues && burnout) {
      boundaries.set(i + 1, { end, burnout: burnout.t })
    }
    start = end
  })
  return events.filter((e) => {
    const stage = e.stage ?? 0
    const boundary =
      e.kind === 'burnout' ? boundaries.get(stage)?.burnout : e.kind === 'ignition' ? boundaries.get(stage - 1)?.end : undefined
    return boundary === undefined || Math.abs(e.t - boundary) >= 1e-9
  })
}
