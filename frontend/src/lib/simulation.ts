// Solver output types (src/sim/, src/output.rs) and the calls into the WASM
// module. Field names are the columns of the CLI's trajectory.csv.
import type { Config } from './config'

/** Flight mode of a body (`FlightMode` in src/sim/sample.rs) */
export type FlightMode = 'powered' | 'ballistic' | 'aero_stable' | 'attitude_program'

/** State of a body at one output time (`Sample` in src/sim/sample.rs) */
export type Sample = {
  time_s: number
  stage: number
  flight_mode: FlightMode
  latitude_deg: number
  longitude_deg: number
  altitude_m: number
  downrange_m: number
  mass_kg: number
  thrust_n: number
  isp_s: number
  vel_north_mps: number
  vel_east_mps: number
  vel_down_mps: number
  speed_earth_mps: number
  speed_inertial_mps: number
  mach: number
  dynamic_pressure_pa: number
  azimuth_deg: number
  elevation_deg: number
  roll_deg: number
  alpha_deg: number
  beta_deg: number
  aoa_total_deg: number
  accel_body_x_mps2: number
  accel_body_y_mps2: number
  accel_body_z_mps2: number
  aero_body_x_n: number
  aero_body_y_n: number
  aero_body_z_n: number
  thrust_body_x_n: number
  thrust_body_y_n: number
  thrust_body_z_n: number
  gimbal_pitch_deg: number
  gimbal_yaw_deg: number
  wind_speed_mps: number
  wind_direction_deg: number
  iip_latitude_deg: number | null
  iip_longitude_deg: number | null
  pos_eci_x_m: number
  pos_eci_y_m: number
  pos_eci_z_m: number
  vel_eci_x_mps: number
  vel_eci_y_mps: number
  vel_eci_z_mps: number
  accel_eci_x_mps2: number
  accel_eci_y_mps2: number
  accel_eci_z_mps2: number
  loss_gravity_mps2: number
  loss_aero_mps2: number
  loss_thrust_mps2: number
}

export type ImpactPointJson = {
  time_s: number
  latitude_deg: number
  longitude_deg: number
  speed_mps: number
}

/** A spent stage or jettisoned body flown to the ground (`Body` in src/sim/bodies.rs) */
export type BodyJson = {
  /** `stage<N>` or `stage<N>_<name>` */
  id: string
  kind: 'stage' | 'jettison'
  stage: number
  release_time_s: number
  mass_kg: number
  impact: ImpactPointJson | null
  trajectory: Sample[]
}

/** What happened at a solver event (`EventKind` in src/sim/events.rs) */
export type EventKindJson =
  | 'ignition'
  | 'liftoff'
  | 'rail_exit'
  | 'mach1'
  | 'max_q'
  | 'burnout'
  | 'separation'
  | 'jettison'
  | 'apogee'
  | 'impact'

/** A flight event and the vehicle state at that moment */
export type FlightEventJson = {
  kind: EventKindJson
  /** Stage the event belongs to (1-based) */
  stage: number
  time_s: number
  altitude_m: number
  latitude_deg: number
  longitude_deg: number
  downrange_m: number
  speed_earth_mps: number
  speed_inertial_mps: number
  mach: number
  dynamic_pressure_pa: number
  mass_kg: number
  /** Released body name (jettison events) */
  body?: string
}

/** A problem with one value of the configuration (`Issue` in src/config/validate.rs) */
export type Issue = { path: string; message: string }

export type SimulationOutput = {
  trajectory: Sample[]
  events: FlightEventJson[]
  bodies: BodyJson[]
  warnings: Issue[]
}

type WasmModule = typeof import('../wasm/openTsiolkovsky.js')

let modPromise: Promise<WasmModule> | null = null

/** Load and instantiate the wasm-pack bundle in `src/wasm` (built by scripts/wasm_build.sh). */
export function initWasm(): Promise<WasmModule> {
  modPromise ??= import('../wasm/openTsiolkovsky.js').then(async (mod) => {
    await mod.default()
    return mod
  })
  return modPromise
}

/** Fly the vehicle, then its spent stages and jettisoned bodies to the ground. */
export async function runSimulation(config: Config): Promise<SimulationOutput> {
  const mod = await initWasm()
  return JSON.parse(mod.simulate_json(JSON.stringify(config))) as SimulationOutput
}

export interface LegacyConversion {
  config: Config
  /** Settings the conversion could not carry over (missing files, unsupported modes) */
  warnings: string[]
}

/**
 * Convert a C++ simulator parameter file (param_*.json) and the CSV tables
 * it names (keyed by file name) to a configuration (`convert_legacy` in
 * src/config/legacy.rs).
 */
export async function convertLegacy(param: unknown, files: Map<string, string>): Promise<LegacyConversion> {
  const mod = await initWasm()
  return JSON.parse(mod.convert_legacy_json(JSON.stringify(param), JSON.stringify(Object.fromEntries(files)))) as LegacyConversion
}

/** Whether a parsed JSON value is a C++ simulator parameter file */
export const isLegacyParamFile = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && ('name(str)' in v || 'calculate condition' in v)

/** File name without any directory part ("data/a.csv" → "a.csv"). */
export const baseName = (p: string) => p.split(/[\\/]/).pop()!.trim()
