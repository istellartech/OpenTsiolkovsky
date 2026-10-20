import type { OptimizationResult, PhysicalCheck } from './optimization'
import type { PhaseView } from './optimization-input'
import { phaseViews } from './optimization-input'
import { posEciToLlh } from './geo'
import type { GeographicMarker, GeographicPath, GeographicPoint } from './globe-path'
import { tr } from './i18n'
import type { TimelineTrack } from './trajectory'
import { presentationFromConfig } from './presentation'

/** Presentation adapter only: solver results and solver validation remain distinct. */
export function optimizationTimeline(result: OptimizationResult): TimelineTrack | null {
  const p = result.input.problem
  if (!result.validation?.multi_stage && !result.validation?.flight) return null
  const phases = resultPhaseViews(result)
  if ((p.kind !== 'multi_stage' && p.kind !== 'single_stage') || !phases.length) return null
  const spans = new Map<number, { stage: number; t0: number; t1: number }>()
  for (const phase of phases) {
    const key = phase.stage + 1
    const prev = spans.get(key)
    spans.set(key, { stage: key, t0: prev?.t0 ?? phase.start, t1: phase.end })
  }
  return {
    t0: phases[0].start,
    t1: phases[phases.length - 1].end,
    stages: [...spans.values()],
    presentation: presentationFromConfig(p.vehicle),
    events:
      result.validation?.multi_stage?.events.map((e) => ({
        kind: e.kind === 'separate_stage' ? 'separation' : e.kind === 'jettison_fairing' ? 'jettison' : 'end',
        stage: e.stage + 1,
        t: e.time_s,
        ...(e.kind === 'jettison_fairing' ? { body: 'fairing' } : {}),
      })) ?? [],
  }
}

export function resultPhaseViews(result: OptimizationResult): PhaseView[] {
  const phases = phaseViews(result.input.problem),
    multi = result.validation?.multi_stage,
    single = result.validation?.flight
  if (multi)
    return phases.map((phase, i) => {
      const samples = multi.samples.filter((p) => p.phase === i)
      if (!samples.length) return phase
      const start = samples[0].time_s,
        end = samples[samples.length - 1].time_s
      return { ...phase, start, end, duration: end - start }
    })
  if (single && phases.length === 3) phases[2] = { ...phases[2], duration: single.final_time_s - phases[2].start, end: single.final_time_s }
  return phases
}
export function optimizationMapPath(result: OptimizationResult, id: string): GeographicPath | null {
  const multi = result.validation?.multi_stage,
    flight = result.validation?.flight
  const samples = multi?.samples ?? flight?.samples
  if (!samples || samples.length < 2) return null
  const points: GeographicPoint[] = samples.map((p) => {
    const llh = posEciToLlh({ x: p.state_eci[1], y: p.state_eci[2], z: p.state_eci[3] }, p.time_s)
    return { time: p.time_s, lat: llh.lat, lon: llh.lon, alt: p.altitude_m, stage: 'stage' in p ? p.stage + 1 : 1, powered: p.powered }
  })
  if (points.some((p) => ![p.time, p.lat, p.lon, p.alt].every(Number.isFinite) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180))
    return null
  const markers: GeographicMarker[] = [{ ...points[0], label: tr('発射点', 'Launch site') }]
  if (multi)
    for (const e of multi.events) {
      const at = posEciToLlh({ x: e.before_eci[1], y: e.before_eci[2], z: e.before_eci[3] }, e.time_s)
      const label =
        e.kind === 'separate_stage'
          ? tr(`第${e.stage + 1}段分離`, `Stage ${e.stage + 1} separation`)
          : e.kind === 'jettison_fairing'
            ? tr('フェアリング投棄', 'Fairing jettison')
            : tr('衛星分離', 'Payload deployment')
      markers.push({ time: e.time_s, lat: at.lat, lon: at.lon, alt: at.alt * 1000, stage: e.stage + 1, powered: false, label })
    }
  else markers.push({ ...points[points.length - 1], label: tr('終端', 'Final state') })
  return { id, label: result.input.problem.kind, points, markers }
}
export function checkTime(result: OptimizationResult, check: PhysicalCheck): number | null {
  const multi = result.validation?.multi_stage
  if (!multi) return null
  if (check.id.startsWith('ORBIT.')) return multi.final_time_s
  const match = /^(Q|AEROLOAD|ACCEL|CLEARANCE|CONTROL\.inertial_direction_rate)\[(\d+)\]$/.exec(check.id)
  if (!match) return null
  const samples = multi.samples.filter((p) => p.phase === Number(match[2]))
  const key =
    match[1] === 'Q'
      ? 'dynamic_pressure_pa'
      : match[1] === 'AEROLOAD'
        ? 'angle_of_attack_deg'
        : match[1] === 'ACCEL'
          ? 'specific_force_m_s2'
          : match[1] === 'CLEARANCE'
            ? 'altitude_m'
            : 'inertial_direction_rate_deg_s'
  const sign = match[1] === 'CLEARANCE' ? -1 : 1
  return (
    samples.reduce<(typeof samples)[number] | null>((best, p) => (!best || sign * p[key] > sign * best[key] ? p : best), null)?.time_s ??
    null
  )
}
