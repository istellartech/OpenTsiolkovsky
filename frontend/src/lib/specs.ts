// Vehicle figures derived from the configuration alone (no simulation):
// propellant used, ideal Δv, thrust-to-weight and the absolute sequence.
//
// Conventions follow the solver (src/simulator.rs):
//  - mass_initial_kg is the stage's own fuelled mass; the stack at stage i is
//    the sum of stage i and everything above it.
//  - burn / cutoff / separation times and thrust/Isp tables are measured from
//    the start of that stage, which is the previous stage's separation.
import type { ClientConfig, ClientStageConfig, ClientTimeSample } from './simulation'
import { G0 } from './geo'

export interface StageSpec {
  index: number
  ownMass: number
  /** Mass of this stage plus everything above it at ignition [kg] */
  stackMass: number
  propellant: number
  burnTime: number
  /** Peak vacuum thrust [N] */
  thrustMax: number
  /** Thrust at ignition [N] */
  thrustIgnition: number
  /** Impulse-weighted Isp [s] */
  isp: number
  /** Ideal (loss-free) Δv [m/s] */
  dv: number
  /** Absolute times from liftoff [s] */
  start: number
  ignition: number
  burnout: number
  separation: number | null
}

export interface VehicleSpec {
  stages: StageSpec[]
  liftoffMass: number
  liftoffThrust: number
  /** Vacuum thrust over liftoff weight */
  thrustToWeight: number
  dvTotal: number
  warnings: string[]
}

function interp(table: ClientTimeSample[], t: number): number {
  if (table.length === 0) return 0
  if (t < table[0].time || t > table[table.length - 1].time) return 0
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i]
    const b = table[i + 1]
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time
      return span <= 0 ? b.value : a.value + ((b.value - a.value) * (t - a.time)) / span
    }
  }
  return table[table.length - 1].value
}

function interpClamped(table: ClientTimeSample[], t: number): number {
  if (table.length === 0) return 0
  if (t <= table[0].time) return table[0].value
  if (t >= table[table.length - 1].time) return table[table.length - 1].value
  return interp(table, t)
}

function burnWindow(stage: ClientStageConfig, hasNext: boolean): [number, number] {
  let end = Math.min(stage.burn_end_s, stage.forced_cutoff_s)
  if (hasNext) end = Math.min(end, stage.separation_time_s)
  return [stage.burn_start_s, Math.max(end, stage.burn_start_s)]
}

function thrustAt(stage: ClientStageConfig, t: number): number {
  const table = stage.thrust_profile ?? []
  const base = table.length > 0 ? interp(table, t) : stage.thrust_constant
  return Math.max(base * stage.thrust_multiplier, 0)
}

function ispAt(stage: ClientStageConfig, t: number): number {
  const table = stage.isp_profile ?? []
  const base = table.length > 0 ? interpClamped(table, t) : stage.isp_constant
  return base * stage.isp_multiplier
}

export function computeSpecs(config: ClientConfig): VehicleSpec {
  const list = config.stages
  const warnings: string[] = []
  const stages: StageSpec[] = []

  let start = 0
  list.forEach((stage, i) => {
    const hasNext = i < list.length - 1
    const [b0, b1] = burnWindow(stage, hasNext)
    const steps = 2000
    const dt = (b1 - b0) / steps
    let impulse = 0
    let prop = 0
    let thrustMax = 0
    for (let k = 0; k <= steps; k++) {
      const t = b0 + k * dt
      const w = k === 0 || k === steps ? 0.5 : 1
      const f = thrustAt(stage, t)
      const isp = ispAt(stage, t)
      thrustMax = Math.max(thrustMax, f)
      impulse += w * f * dt
      if (isp > 0) prop += (w * f * dt) / (isp * G0)
    }

    const stackMass = list.slice(i).reduce((sum, s) => sum + s.mass_initial_kg, 0)
    const burnout = stackMass - prop
    const isp = prop > 0 ? impulse / (prop * G0) : ispAt(stage, b0)
    let dv = 0
    if (prop >= stage.mass_initial_kg) {
      warnings.push(`${i + 1}段: 燃焼で消費する推進剤 ${Math.round(prop).toLocaleString('ja-JP')} kg が段の質量を超えています`)
    } else if (burnout > 0) {
      dv = isp * G0 * Math.log(stackMass / burnout)
    }

    stages.push({
      index: i,
      ownMass: stage.mass_initial_kg,
      stackMass,
      propellant: prop,
      burnTime: b1 - b0,
      thrustMax,
      thrustIgnition: thrustAt(stage, b0),
      isp,
      dv,
      start,
      ignition: start + b0,
      burnout: start + b1,
      separation: hasNext ? start + stage.separation_time_s : null,
    })
    if (hasNext) start += stage.separation_time_s
  })

  const first = stages[0]
  const liftoffMass = first?.stackMass ?? 0
  const liftoffThrust = first && first.ignition <= 0 ? first.thrustIgnition : 0
  return {
    stages,
    liftoffMass,
    liftoffThrust,
    thrustToWeight: liftoffMass > 0 ? liftoffThrust / (liftoffMass * G0) : 0,
    dvTotal: stages.reduce((s, st) => s + st.dv, 0),
    warnings,
  }
}
