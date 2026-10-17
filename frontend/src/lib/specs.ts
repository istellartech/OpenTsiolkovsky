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
import { locale, tr } from './i18n'

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

/**
 * Burnout time (stage-relative) at which `propellant` kg has been burned,
 * integrating thrust / (Isp g0) from ignition with the same tables the
 * solver uses. null when the thrust table ends before that much is burned.
 */
export function burnEndForPropellant(stage: ClientStageConfig, propellant: number): number | null {
  if (!(propellant > 0)) return null
  const t0 = stage.burn_start_s
  const table = stage.thrust_profile ?? []
  if (table.length === 0 && (stage.isp_profile ?? []).length === 0) {
    // Constant thrust and Isp: closed form
    const thrust = thrustAt(stage, t0)
    const isp = ispAt(stage, t0)
    return thrust > 0 && isp > 0 ? t0 + (propellant * isp * G0) / thrust : null
  }
  // Thrust is zero past the end of its table; a constant thrust with an Isp
  // table runs until the propellant is gone (bounded to a day).
  const tEnd = table.length > 0 ? table[table.length - 1].time : t0 + 86400
  const steps = 20000
  const dt = (tEnd - t0) / steps
  if (!(dt > 0)) return null
  let burned = 0
  let prev = rate(stage, t0)
  for (let k = 1; k <= steps; k++) {
    const t = t0 + k * dt
    const cur = rate(stage, t)
    const add = 0.5 * (prev + cur) * dt
    if (burned + add >= propellant) {
      // Linear inside the step
      const f = add > 0 ? (propellant - burned) / add : 0
      return t - dt + f * dt
    }
    burned += add
    prev = cur
  }
  return null
}

/** Propellant flow rate [kg/s] at stage-relative time t (no burn window). */
function rate(stage: ClientStageConfig, t: number): number {
  const isp = ispAt(stage, t)
  return isp > 0 ? thrustAt(stage, t) / (isp * G0) : 0
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
      const propKg = Math.round(prop).toLocaleString(locale())
      warnings.push(
        tr(
          `${i + 1}段: 燃焼で消費する推進剤 ${propKg} kg が段の質量を超えています`,
          `Stage ${i + 1}: propellant burned (${propKg} kg) exceeds the stage mass`,
        ),
      )
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
