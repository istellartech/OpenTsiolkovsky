// Types shared with the Rust/WASM solver, and the call into it.
import type { Vec3 } from './geo'

export type Vec3Json = { x: number; y: number; z: number } | [number, number, number]

/** Flight mode of a body, named as in the C++ simulator */
export type FlightModeName = 'power_3DoF' | 'free_aero_stable' | 'free_3dof' | 'free_ballistic'

export type SimulationState = {
  time: number
  position: Vec3Json
  position_eci?: Vec3Json // For compatibility with older data formats
  velocity: Vec3Json
  mass: number
  stage: number
  altitude: number
  velocity_magnitude: number
  mach_number: number
  dynamic_pressure: number
  thrust: number
  drag_force: number
  downrange_km?: number
  // New fields for enhanced visualization
  velocity_ned?: Vec3Json // NED velocity components [m/s] (backward compatibility)
  velocity_eci_ned?: Vec3Json // ECI velocity in NED frame [m/s]
  velocity_ecef_ned?: Vec3Json // ECEF velocity in NED frame [m/s]
  sea_level_mach?: number // Mach number based on sea level sound speed
  acceleration_magnitude?: number // Total acceleration magnitude [m/s²]
  acc_eci?: Vec3Json // ECI acceleration components [m/s²]
  acc_body?: Vec3Json // Body-frame acceleration components [m/s²]
  angle_of_attack?: number // Attack of angle [deg]
  sideslip_angle?: number // Sideslip angle [deg]
  attitude_azimuth?: number // Attitude azimuth [deg]
  attitude_elevation?: number // Attitude elevation [deg]
  flight_mode?: FlightModeName
  /** Instantaneous impact point [deg]; null when none exists (orbit, escape) */
  iip_lat_deg?: number | null
  iip_lon_deg?: number | null
}

export type ImpactPointJson = {
  time_s: number
  latitude_deg: number
  longitude_deg: number
  speed_mps: number
}

/** A spent stage or dumping product propagated to the ground */
export type FallBodyJson = {
  kind: 'stage' | 'dump'
  stage: number
  release_time_s: number
  mass_kg: number
  impact: ImpactPointJson | null
  trajectory: SimulationState[]
}

/** What happened at a solver event (`EventKind` in src/simulator.rs) */
export type EventKindJson =
  | 'ignition'
  | 'liftoff'
  | 'rail_exit'
  | 'burnout'
  | 'separation'
  | 'dump'
  | 'mach1'
  | 'max_q'
  | 'apogee'
  | 'impact'

/** A flight event located by the solver, with the vehicle state at that moment */
export type FlightEventJson = {
  kind: EventKindJson
  /** Stage the event belongs to (1-based) */
  stage: number
  time_s: number
  altitude_m: number
  latitude_deg: number
  longitude_deg: number
  /** Surface distance from the launch point [m] */
  downrange_m: number
  /** Earth-relative speed [m/s] */
  speed_mps: number
  /** Inertial speed [m/s] */
  inertial_speed_mps: number
  mach: number
  dynamic_pressure_pa: number
  mass_kg: number
}

export type SimulationOutput = {
  trajectory: SimulationState[]
  fall_bodies: FallBodyJson[]
  /** Missing from outputs of older solver builds */
  events?: FlightEventJson[]
}

export function vec3ToObject(vec: Vec3Json | undefined): Vec3 {
  if (!vec) {
    return { x: 0, y: 0, z: 0 }
  }

  if (Array.isArray(vec)) {
    // Older outputs may carry short or non-numeric arrays.
    return {
      x: Number(vec[0]) || 0,
      y: Number(vec[1]) || 0,
      z: Number(vec[2]) || 0,
    }
  }

  return {
    x: Number(vec?.x || 0),
    y: Number(vec?.y || 0),
    z: Number(vec?.z || 0),
  }
}

export type ClientTimeSample = { time: number; value: number }
export type ClientMachSample = { mach: number; value: number }
/** `roll_deg` is used only when every row of the program has it */
export type ClientAttitudeSample = { time: number; azimuth_deg: number; elevation_deg: number; roll_deg?: number }
export type ClientWindSample = { altitude_m: number; speed_mps: number; direction_deg: number }
export type ClientDensitySample = { altitude_m: number; percent: number }

/** Standard atmosphere (`AtmosphereKind` in src/physics.rs) */
export type AtmosphereModel = 'legacy' | 'ussa1976'

export type ClientStageConfig = {
  power_mode: number
  free_mode: number
  stage_num?: number
  mass_initial_kg: number
  mass_dry_kg: number
  burn_start_s: number
  burn_end_s: number
  forced_cutoff_s: number
  separation_time_s: number
  coast_time_s: number
  throat_diameter_m: number
  nozzle_expansion_ratio: number
  nozzle_exit_pressure_pa: number
  thrust_constant: number
  thrust_multiplier: number
  thrust_profile?: ClientTimeSample[]
  isp_constant: number
  isp_multiplier: number
  isp_profile?: ClientTimeSample[]
  cg_position_m: [number, number, number]
  rotational_inertia_kgm2: [number, number, number]
  /** Values for this stage only; unset fields use `aerodynamics` (Mach tables are always vehicle-wide) */
  aero?: ClientStageAero
  /** Product jettisoned while this stage flies (fairing, etc.) */
  dumping_product?: ClientDumpingProduct
}

export type ClientDumpingProduct = {
  /** Release time from the stage start [s] */
  separation_time_s: number
  mass_kg: number
  ballistic_coefficient: number
  /** Velocity added at release, NED [m/s] */
  additional_velocity_ned_mps: [number, number, number]
}

export type ClientStageAero = {
  body_diameter_m?: number
  cn_constant?: number
  cn_multiplier?: number
  ca_constant?: number
  ca_multiplier?: number
  /** CA with the engine off for this stage */
  ca_power_off_constant?: number
  ballistic_coefficient?: number
}

export type ClientIntegratorConfig = {
  method: 'rk4' | 'rk45'
  rk4_step_s?: number | null
  /** RK45 tolerances (default 1e-9) */
  rk45_abs_tol?: number
  rk45_rel_tol?: number
}

export type ClientConfig = {
  name: string
  simulation: {
    duration_s: number
    output_step_s: number
    air_density_percent: number
    /** Density variation over altitude; replaces `air_density_percent` when set */
    air_density_profile?: ClientDensitySample[]
    /** Default `legacy` (as the C++ simulator) */
    atmosphere_model?: AtmosphereModel
    integrator: ClientIntegratorConfig
  }
  launch: {
    latitude_deg: number
    longitude_deg: number
    altitude_m: number
    velocity_ned_mps: [number, number, number]
    datetime_utc: {
      year: number
      month: number
      day: number
      hour: number
      minute: number
      second: number
    }
    timezone_offset?: number // Timezone offset in hours from UTC (default: 9 for JST)
    /** Launcher rail length [m]; 0 or unset: held on the pad only */
    rail_length_m?: number
  }
  stages: ClientStageConfig[]
  aerodynamics: {
    body_diameter_m: number
    cn_constant: number
    cn_multiplier: number
    cn_profile: ClientMachSample[]
    ca_constant: number
    ca_multiplier: number
    ca_profile: ClientMachSample[]
    /** CA with the engine off (unset: the powered CA) */
    ca_power_off_constant?: number
    ca_power_off_profile?: ClientMachSample[]
    ballistic_coefficient: number
  }
  attitude: {
    elevation_deg: number
    azimuth_deg: number
    /** Constant roll angle [deg] (default 0) */
    roll_deg?: number
    pitch_offset_deg: number
    yaw_offset_deg: number
    roll_offset_deg: number
    gyro_bias_deg_h: [number, number, number]
    profile: ClientAttitudeSample[]
  }
  wind: {
    speed_mps: number
    direction_deg: number
    profile: ClientWindSample[]
  }
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

/**
 * Run the solver to completion, then fly the spent stages and dumping
 * products to the ground. The WASM side accepts this config as JSON.
 */
export async function runSimulation(config: ClientConfig): Promise<SimulationOutput> {
  const mod = await initWasm()
  // Each WasmSimulator owns WASM heap memory that JS garbage collection does
  // not reclaim; free it explicitly or repeated runs exhaust the heap.
  const sim = new mod.WasmSimulator(JSON.stringify(config))
  try {
    return JSON.parse(sim.run_with_fall_bodies()) as SimulationOutput
  } finally {
    sim.free()
  }
}
