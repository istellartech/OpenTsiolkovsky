import { phaseLabel, presentationFromConfig, type FlightPresentation } from './presentation'
// Vehicle figures derived from the configuration alone (no simulation):
// propellant used, ideal Δv, thrust-to-weight and the absolute sequence.
//
// Conventions follow the solver (src/sim/):
//  - mass_initial_kg is the stage's own fuelled mass; the stack at stage i is
//    the sum of stage i and everything above it.
//  - burn and separation times and thrust/Isp tables are measured from the
//    start of that stage, which is the previous stage's separation.
import type { Config, Stage } from './config'
import { curveRows, evalCurve, isRows } from './config'
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
  presentation?: FlightPresentation
  stages: StageSpec[]
  liftoffMass: number
  liftoffThrust: number
  /** Vacuum thrust over liftoff weight */
  thrustToWeight: number
  dvTotal: number
  warnings: string[]
}

function burnWindow(stage: Stage, hasNext: boolean): [number, number] {
  const e = stage.engine
  if (!e) return [0, 0]
  const start = e.burn_start_s ?? 0
  let end = e.burn_end_s
  if (hasNext && stage.separation_time_s !== undefined) end = Math.min(end, stage.separation_time_s)
  return [start, Math.max(end, start)]
}

const thrustAt = (stage: Stage, t: number) => Math.max(evalCurve(stage.engine?.thrust_vac_n, t), 0)
const ispAt = (stage: Stage, t: number) => evalCurve(stage.engine?.isp_vac_s, t)

/**
 * Burnout time (stage-relative) at which `propellant` kg has been burned,
 * integrating thrust / (Isp g0) from ignition with the same tables the
 * solver uses. null when the thrust table ends before that much is burned.
 */
export function burnEndForPropellant(stage: Stage, propellant: number): number | null {
  if (!(propellant > 0) || !stage.engine) return null
  const t0 = stage.engine.burn_start_s ?? 0
  const table = curveRows(stage.engine.thrust_vac_n)
  if (!isRows(stage.engine.thrust_vac_n) && !isRows(stage.engine.isp_vac_s)) {
    // Constant thrust and Isp: closed form
    const thrust = thrustAt(stage, t0)
    const isp = ispAt(stage, t0)
    return thrust > 0 && isp > 0 ? t0 + (propellant * isp * G0) / thrust : null
  }
  // A thrust table ends where its last row is (the thrust is held after it,
  // so burning past it is not what the table describes); a constant thrust
  // with an Isp table runs until the propellant is gone (bounded to a day).
  const tEnd = table.length > 0 ? table[table.length - 1][0] : t0 + 86400
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
function rate(stage: Stage, t: number): number {
  const isp = ispAt(stage, t)
  return isp > 0 ? thrustAt(stage, t) / (isp * G0) : 0
}

export function computeSpecs(config: Config): VehicleSpec {
  const presentation = presentationFromConfig(config)
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
          `${phaseLabel(presentation, i + 1)}: 推進剤消費量 ${propKg} kg が割当質量を超えています`,
          `${phaseLabel(presentation, i + 1)}: propellant burned (${propKg} kg) exceeds the allocated mass`,
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
      separation: hasNext ? start + (stage.separation_time_s ?? 0) : null,
    })
    if (hasNext) start += stage.separation_time_s ?? 0
  })

  const first = stages[0]
  const liftoffMass = first?.stackMass ?? 0
  const liftoffThrust = first && first.ignition <= 0 ? first.thrustIgnition : 0
  return {
    presentation,
    stages,
    liftoffMass,
    liftoffThrust,
    thrustToWeight: liftoffMass > 0 ? liftoffThrust / (liftoffMass * G0) : 0,
    dvTotal: stages.reduce((s, st) => s + st.dv, 0),
    warnings,
  }
}
