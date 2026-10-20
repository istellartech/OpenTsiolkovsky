import type { Config } from './config'
import { phaseLabel as intervalLabel, presentationFromConfig } from './presentation'
// Human-facing view of an optimization vehicle: derived performance numbers,
// readable phase names, and edits that keep the coupled JSON fields in step
// (stage wet mass, engine on-time, fixed burn phases and the time horizon).
import type { InitialGuess, MultiStageInput, OptimizationInput, OptimizationPhase, SingleStageInput } from './optimization-input'
import type { OptimizationResult } from './optimization'
import { tr } from './i18n'

export const G0 = 9.80665
const SEA_LEVEL_PA = 101325

export interface StageMetrics {
  dry: number
  propellant: number
  reserve: number
  wet: number
  thrustVac: number
  isp: number
  massFlow: number
  /** Maximum on-time the loaded usable propellant allows [s]. */
  burnLimit: number
  /** Stack mass at this stage's ignition (upper stages, fairing, PAF, payload included) [kg]. */
  stackInitial: number
  /** Stack mass after burning all usable propellant [kg]. */
  stackFinal: number
  /** Ideal (lossless) Δv with vacuum Isp [m/s]. */
  idealDeltaV: number
  /** Thrust-to-weight ratio at ignition; sea-level thrust for the first stage. */
  thrustToWeight: number
}
export interface VehicleMetrics {
  stages: StageMetrics[]
  launchMass: number
  payload: number
  payloadFraction: number
  idealDeltaV: number
}

type Rocket = MultiStageInput | SingleStageInput

/** Δv and T/W from the input as written, using the payload's initial guess. */
export function vehicleMetrics(p: Rocket): VehicleMetrics {
  const payload = p.kind === 'multi_stage' ? p.net_payload_kg.initial : p.additional_payload_kg.initial
  const fairing = p.kind === 'multi_stage' ? p.fairing_kg : 0
  const adapter = p.kind === 'multi_stage' ? p.payload_adapter_kg : 0
  const inventory =
    p.kind === 'multi_stage'
      ? p.stages.map((s) => ({ dry: s.dry_kg, propellant: s.propellant_kg, reserve: s.reserve_kg }))
      : [{ dry: p.dry_mass_kg, propellant: p.propellant_mass_kg, reserve: p.reserve_propellant_kg }]
  const wets = inventory.map((s) => s.dry + s.propellant)
  const stages = inventory.map((s, i): StageMetrics => {
    const engine = p.vehicle.stages[i]?.engine
    const thrustVac = typeof engine?.thrust_vac_n === 'number' ? engine.thrust_vac_n : 0
    const isp = typeof engine?.isp_vac_s === 'number' ? engine.isp_vac_s : 0
    const massFlow = thrustVac > 0 && isp > 0 ? thrustVac / (isp * G0) : 0
    const above = wets.slice(i + 1).reduce((a, b) => a + b, 0)
    const stackInitial = wets[i] + above + fairing + adapter + payload
    const usable = Math.max(0, s.propellant - s.reserve)
    // The fairing usually leaves during the last stage's burn; count it as
    // carried to stay conservative in the ideal Δv.
    const stackFinal = stackInitial - usable
    const thrust = i === 0 ? thrustVac - (engine?.nozzle_exit_area_m2 ?? 0) * SEA_LEVEL_PA : thrustVac
    return {
      ...s,
      wet: wets[i],
      thrustVac,
      isp,
      massFlow,
      burnLimit: massFlow > 0 ? usable / massFlow : 0,
      stackInitial,
      stackFinal,
      idealDeltaV: stackFinal > 0 && isp > 0 ? isp * G0 * Math.log(stackInitial / stackFinal) : 0,
      thrustToWeight: stackInitial > 0 ? thrust / (stackInitial * G0) : 0,
    }
  })
  const launchMass = stages[0]?.stackInitial ?? 0
  return {
    stages,
    launchMass,
    payload,
    payloadFraction: launchMass > 0 ? payload / launchMass : 0,
    idealDeltaV: stages.reduce((a, s) => a + s.idealDeltaV, 0),
  }
}

export type StageField = 'dry_kg' | 'propellant_kg' | 'reserve_kg' | 'thrust_vac_n' | 'isp_vac_s'

/**
 * Edit one stage quantity of a multistage input and re-derive the dependent
 * fields: wet/dry mass in the vehicle config, the engine on-time limit
 * (whole 0.1 s, within the usable propellant), fixed burn phases of that
 * stage, the separation time and the simulation horizon.
 */
export function editStage(input: OptimizationInput, stage: number, field: StageField, value: number): OptimizationInput {
  const out = structuredClone(input)
  const p = out.problem
  if (p.kind !== 'multi_stage') return out
  const inv = p.stages[stage],
    cfg = p.vehicle.stages[stage]
  if (!inv || !cfg?.engine) return out
  if (field === 'thrust_vac_n' || field === 'isp_vac_s') cfg.engine[field] = value
  else inv[field] = value
  cfg.mass_initial_kg = inv.dry_kg + inv.propellant_kg
  cfg.mass_dry_kg = inv.dry_kg
  const thrust = cfg.engine.thrust_vac_n,
    isp = cfg.engine.isp_vac_s
  if (typeof thrust === 'number' && typeof isp === 'number' && thrust > 0 && isp > 0 && inv.propellant_kg > inv.reserve_kg) {
    const flow = thrust / (isp * G0)
    const limit = Math.floor(((inv.propellant_kg - inv.reserve_kg) / flow) * 10) / 10
    if (limit > 0) setStageBurnLimit(p, stage, limit)
  }
  return out
}

function setStageBurnLimit(p: MultiStageInput, stage: number, limit: number) {
  const inv = p.stages[stage],
    cfg = p.vehicle.stages[stage]
  inv.max_total_burn_s = limit
  if (cfg.engine) cfg.engine.burn_end_s = limit
  const burns = p.phases.filter((ph) => ph.stage === stage && ph.mode === 'burn')
  const fixed = (ph: OptimizationPhase) => ph.duration_s.lower === ph.duration_s.upper
  if (burns.length && burns.every(fixed)) {
    // A fully prescribed burn (e.g. a booster) burns to the limit: stretch the last fixed phase.
    const last = burns[burns.length - 1]
    const others = burns.slice(0, -1).reduce((t, ph) => t + ph.duration_s.lower, 0)
    const d = round(limit - others)
    if (d > 0.01) last.duration_s = { initial: d, lower: d, upper: d }
  } else {
    for (const ph of burns) {
      if (fixed(ph)) continue
      const upper = Math.min(ph.duration_s.upper, limit)
      const lower = Math.min(ph.duration_s.lower, upper)
      ph.duration_s = { lower, upper, initial: Math.min(Math.max(ph.duration_s.initial, lower), upper) }
    }
  }
  // The vehicle config counts separation from the stage's own ignition.
  const first = p.phases.findIndex((ph) => ph.stage === stage)
  const separating = p.phases.findIndex((ph) => ph.stage === stage && ph.end_event === 'separate_stage')
  if (first >= 0 && separating >= 0 && cfg.separation_time_s !== undefined) {
    const sum = (a: number, b: number) => p.phases.slice(a, b).reduce((t, ph) => t + ph.duration_s.initial, 0)
    cfg.separation_time_s = Math.max(limit, round(sum(first, separating + 1)))
  }
  fitHorizon(p)
}

const round = (v: number) => Math.round(v * 1000) / 1000

/** Keep the simulation horizon just above the sum of phase upper bounds. */
export function fitHorizon(p: MultiStageInput) {
  const total = p.phases.reduce((t, ph) => t + ph.duration_s.upper, 0)
  if (p.vehicle.simulation.end_time_s < total || p.vehicle.simulation.end_time_s > total + 600)
    p.vehicle.simulation.end_time_s = Math.ceil(total + 100)
}

interface PhaseLike {
  stage: number
  mode: 'burn' | 'coast'
  vertical?: boolean
  end_event: string
}
/** Readable phase name from stage, mode, burn count and end event; the JSON name stays the identifier. */
export function phaseLabel(phases: PhaseLike[], i: number, vehicle?: Config): string {
  const ph = phases[i]
  if (!ph) return ''
  const stage = vehicle ? intervalLabel(presentationFromConfig(vehicle), ph.stage + 1) : tr(`第${ph.stage + 1}段`, `Stage ${ph.stage + 1}`)
  // Consecutive burn phases of one stage are one ignition, possibly split into segments.
  const starts = (k: number) => phases[k].stage === ph.stage && phases[k].mode === 'burn' && phases[k - 1]?.mode !== 'burn'
  const ignitions = phases.filter((_, k) => starts(k)).length
  let first = i
  while (first > 0 && phases[first - 1].mode === 'burn' && phases[first - 1].stage === ph.stage) first--
  let last = i
  while (last + 1 < phases.length && phases[last + 1].mode === 'burn' && phases[last + 1].stage === ph.stage) last++
  const ignition = phases.slice(0, first + 1).filter((_, k) => starts(k)).length
  const segments = phases.slice(first, last + 1).filter((q) => !q.vertical)
  const segment = segments.indexOf(ph)
  let what: string
  if (ph.vertical) what = tr('垂直上昇', 'vertical rise')
  else if (ph.mode === 'burn') {
    what = ignitions > 1 ? tr(`第${ignition}回燃焼`, `burn ${ignition}`) : tr('燃焼', 'burn')
    if (segments.length === 2) what += segment === 0 ? tr('（前半）', ' (first part)') : tr('（後半）', ' (second part)')
    else if (segments.length > 2) what += tr(`（${segment + 1}/${segments.length}）`, ` (${segment + 1}/${segments.length})`)
  } else if (i > 0 && phases[i - 1]?.stage !== ph.stage) what = tr('分離〜着火', 'separation to ignition')
  else if (phases[i + 1]?.mode === 'burn' && phases[i + 1]?.stage === ph.stage) what = tr('慣性飛行（再着火まで）', 'coast to restart')
  else what = tr('慣性飛行', 'coast')
  const event =
    ph.end_event === 'separate_stage'
      ? tr(' → 段分離', ' → separation')
      : ph.end_event === 'jettison_fairing'
        ? tr(' → フェアリング投棄', ' → fairing jettison')
        : ph.end_event === 'deploy_payload'
          ? tr(' → 衛星分離', ' → payload deployment')
          : ''
  return `${stage} ${what}${event}`
}

/**
 * Warm-start trajectory from an earlier multistage result with the same phase
 * layout (stages, burn/coast order and events), or null when it cannot seed
 * `input`. Every `stride`-th reintegrated sample is kept, plus phase ends.
 */
export function warmStartGuess(result: OptimizationResult, input: OptimizationInput, stride = 4): InitialGuess | null {
  const v = result.validation?.multi_stage,
    from = result.input.problem,
    to = input.problem
  if (!v || from.kind !== 'multi_stage' || to.kind !== 'multi_stage' || from.phases.length !== to.phases.length) return null
  const same = from.phases.every((ph, i) => {
    const q = to.phases[i]
    return ph.stage === q.stage && ph.mode === q.mode && ph.end_event === q.end_event && ph.vertical === q.vertical
  })
  if (!same || from.stages.length !== to.stages.length) return null
  const byPhase = to.phases.map((_, p) => v.samples.filter((s) => s.phase === p))
  if (byPhase.some((s) => s.length < 2)) return null
  return {
    net_payload_kg: v.net_payload_kg,
    phase_durations_s: byPhase.map((s) => s[s.length - 1].time_s - s[0].time_s),
    samples: byPhase.flatMap((s) =>
      s
        .filter((_, k) => k % stride === 0 || k === s.length - 1)
        .map((x) => ({
          phase: x.phase,
          time_s: x.time_s,
          state_eci: x.state_eci,
          azimuth_deg: x.azimuth_deg,
          elevation_deg: x.elevation_deg,
        })),
    ),
  }
}
/** `raw` with a warm-start trajectory attached (the draft itself stays without one). */
export function withInitialGuess(raw: string, guess: InitialGuess): string {
  const input = JSON.parse(raw) as OptimizationInput
  if (input.problem.kind !== 'multi_stage') return raw
  return JSON.stringify({ ...input, problem: { ...input.problem, initial_guess: guess } })
}
