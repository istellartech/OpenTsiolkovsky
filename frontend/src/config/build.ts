// Helpers to describe a vehicle from published figures (propellant, Isp,
// burn time, thrust) and turn it into a solver config.
//
// Solver conventions (src/simulator.rs):
//  - mass_initial_kg is each stage's own fuelled mass;
//  - stage times are measured from that stage's start (previous separation);
//  - thrust = F_vac − A_exit · p_ambient, mass flow = F_vac / (Isp_vac · g0).
import type { ClientConfig, ClientStageConfig } from '../lib/simulation'
import { G0 } from '../lib/geo'
import { createDefaultStage } from './defaults'

const P0 = 101325

export interface StageInput {
  /** Fuelled mass of this stage alone [kg] (exclude upper stages) */
  mass: number
  /** Propellant burned [kg] */
  propellant: number
  /** Vacuum Isp [s] */
  isp: number
  /** Stage-local ignition time [s] */
  ignition?: number
  /** Burn duration [s] */
  burn: number
  /** Stage-local separation time [s]; omit for the last stage */
  separation?: number
  /** Shut down after this many seconds of burning (guidance cutoff) */
  cutoff?: number
  /**
   * Nozzle exit area [m²]. Use `exitAreaFromThrust` when vacuum and sea-level
   * thrust are both published; otherwise from throat diameter and expansion.
   */
  exitArea: number
  /** Normalised thrust shape over the burn: [fraction of burn, relative level] */
  shape?: [number, number][]
  /** Vacuum Isp over the burn: [fraction of burn, Isp]; `isp` is then the impulse-weighted mean */
  ispShape?: [number, number][]
  powerMode?: number
  freeMode?: number
}

/** Exit area implied by published vacuum and sea-level thrust. */
export const exitAreaFromThrust = (fVac: number, fSl: number) => Math.max(fVac - fSl, 0) / P0

/** Exit area from nozzle exit diameter. */
export const exitAreaFromDiameter = (d: number) => (Math.PI * d * d) / 4

/** Average vacuum thrust that burns `propellant` in `burn` seconds at `isp`. */
export const avgThrust = (propellant: number, isp: number, burn: number) => (propellant * isp * G0) / burn

export function stage(s: StageInput): ClientStageConfig {
  const ignition = s.ignition ?? 0
  // A guidance cutoff ends the burn early; unburned propellant stays aboard.
  const end = ignition + (s.cutoff !== undefined ? Math.min(s.cutoff, s.burn) : s.burn)
  const meanVac = avgThrust(s.propellant, s.isp, s.burn)
  // Represent the exit area as throat diameter × expansion ratio (ε fixed at 10).
  const expansion = 10
  const throat = Math.sqrt((4 * s.exitArea) / (Math.PI * expansion))

  let profile: { time: number; value: number }[] = []
  if (s.shape && s.shape.length > 1) {
    // Scale the shape so its integral equals the total impulse.
    let area = 0
    for (let i = 1; i < s.shape.length; i++) {
      const [x0, y0] = s.shape[i - 1]
      const [x1, y1] = s.shape[i]
      area += ((y0 + y1) / 2) * (x1 - x0)
    }
    const k = meanVac / area
    profile = s.shape.map(([x, y]) => ({ time: round(ignition + x * s.burn, 2), value: Math.round(y * k) }))
  }

  return {
    ...createDefaultStage(),
    power_mode: s.powerMode ?? 0,
    free_mode: s.freeMode ?? 0,
    mass_initial_kg: s.mass,
    mass_dry_kg: s.mass - s.propellant,
    burn_start_s: ignition,
    burn_end_s: round(end, 2),
    forced_cutoff_s: round(end, 2),
    separation_time_s: s.separation ?? 1e6,
    throat_diameter_m: round(throat, 4),
    nozzle_expansion_ratio: expansion,
    nozzle_exit_pressure_pa: 0,
    thrust_constant: Math.round(meanVac),
    thrust_multiplier: 1,
    thrust_profile: profile,
    isp_constant: s.isp,
    isp_multiplier: 1,
    isp_profile: (s.ispShape ?? []).map(([x, v]) => ({ time: round(ignition + x * s.burn, 2), value: round(v, 3) })),
  }
}

/**
 * Two parallel phases (e.g. core + SRBs) as sequential solver stages: the
 * first carries the boosters plus the core propellant burned while they fire,
 * the second is the core with what is left.
 *
 * By default the phase burns at a constant rate until jettison. With `shaped`,
 * it has boosters + core thrust until the boosters burn out, then core thrust
 * alone (with the matching Isp) until jettison.
 */
export function parallelPhase(o: {
  booster: { mass: number; propellant: number; isp: number; burn: number; exitArea: number }
  core: { propellant: number; isp: number; burn: number; exitArea: number }
  /** When the boosters are jettisoned (≥ booster burn) */
  jettison: number
  shaped?: boolean
}): { phase: StageInput; coreUsed: number } {
  const coreFlow = o.core.propellant / o.core.burn
  const coreUsed = coreFlow * o.jettison
  // Total impulse over the phase; propellant mass and impulse stay exact.
  const impulse = o.booster.propellant * o.booster.isp * G0 + coreUsed * o.core.isp * G0
  const prop = o.booster.propellant + coreUsed
  const phase: StageInput = {
    mass: o.booster.mass + coreUsed,
    propellant: prop,
    isp: impulse / (prop * G0),
    burn: o.jettison,
    separation: o.jettison,
    exitArea: o.booster.exitArea + o.core.exitArea,
  }
  if (o.shaped && o.booster.burn < o.jettison - 0.5) {
    const boosterFlow = o.booster.propellant / o.booster.burn
    const fCore = coreFlow * o.core.isp * G0
    const fBoth = boosterFlow * o.booster.isp * G0 + fCore
    const ispBoth = fBoth / ((boosterFlow + coreFlow) * G0)
    const x = o.booster.burn / o.jettison
    phase.shape = [
      [0, fBoth],
      [x, fBoth],
      [x + 0.0005, fCore],
      [1, fCore],
    ]
    phase.ispShape = [
      [0, ispBoth],
      [x, ispBoth],
      [x + 0.0005, o.core.isp],
      [1, o.core.isp],
    ]
  }
  return { phase, coreUsed }
}

export interface VehicleInput {
  name: string
  site: { lat: number; lon: number; alt: number }
  /** UTC [y, m, d, h, min, s] */
  date: [number, number, number, number, number, number]
  stages: ClientStageConfig[]
  diameter: number
  ca: number | [number, number][]
  cn?: number
  /** [t, azimuth, elevation] from liftoff, or a fixed attitude */
  attitude: [number, number, number][] | { azimuth: number; elevation: number }
  duration: number
  step: number
  ballistic?: number
}

export function vehicle(v: VehicleInput): ClientConfig {
  const fixed = !Array.isArray(v.attitude)
  const az = fixed ? (v.attitude as { azimuth: number }).azimuth : (v.attitude as [number, number, number][])[0][1]
  const el = fixed ? (v.attitude as { elevation: number }).elevation : (v.attitude as [number, number, number][])[0][2]
  return {
    name: v.name,
    simulation: {
      duration_s: v.duration,
      output_step_s: v.step,
      air_density_percent: 0,
      integrator: { method: 'rk45', rk4_step_s: 0.1 },
    },
    launch: {
      latitude_deg: v.site.lat,
      longitude_deg: v.site.lon,
      altitude_m: v.site.alt,
      velocity_ned_mps: [0, 0, 0],
      datetime_utc: { year: v.date[0], month: v.date[1], day: v.date[2], hour: v.date[3], minute: v.date[4], second: v.date[5] },
    },
    stages: v.stages,
    aerodynamics: {
      body_diameter_m: v.diameter,
      cn_constant: v.cn ?? 0.2,
      cn_multiplier: 1,
      cn_profile: [],
      ca_constant: typeof v.ca === 'number' ? v.ca : v.ca[0][1],
      ca_multiplier: 1,
      ca_profile: typeof v.ca === 'number' ? [] : v.ca.map(([mach, value]) => ({ mach, value })),
      ballistic_coefficient: v.ballistic ?? 100,
    },
    attitude: {
      elevation_deg: el,
      azimuth_deg: az,
      pitch_offset_deg: 0,
      yaw_offset_deg: 0,
      roll_offset_deg: 0,
      gyro_bias_deg_h: [0, 0, 0],
      profile: fixed
        ? []
        : (v.attitude as [number, number, number][]).map(([time, azimuth_deg, elevation_deg]) => ({ time, azimuth_deg, elevation_deg })),
    },
    wind: { speed_mps: 0, direction_deg: 0, profile: [] },
  }
}

/**
 * Pitch program: vertical for 8 s, then linear between [t, elevation] knots
 * at a constant azimuth, holding the last value afterwards.
 */
export function pitchProgram(azimuth: number, knots: [number, number][]): [number, number, number][] {
  const last = knots[knots.length - 1]
  return [
    [0, azimuth, 90],
    [8, azimuth, 90],
    ...knots.map(([t, e]) => [t, azimuth, e] as [number, number, number]),
    [last[0] + 5000, azimuth, last[1]],
  ]
}

function round(v: number, d: number) {
  const k = 10 ** d
  return Math.round(v * k) / k
}

/** A typical subsonic→supersonic axial-force curve for slender rockets. */
export const CA_SLENDER: [number, number][] = [
  [0, 0.35],
  [0.8, 0.38],
  [1.1, 0.55],
  [1.5, 0.5],
  [2.5, 0.4],
  [4, 0.32],
  [8, 0.26],
]
