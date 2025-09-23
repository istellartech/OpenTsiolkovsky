// WASM loader utilities for OpenTsiolkovsky (optional client-side execution)
// This expects `scripts/wasm_build.sh` to have emitted artifacts into
// `frontend/src/wasm` with out-name `openTsiolkovsky`.

import type { ClientConfig, ClientStageConfig, SimulationState } from './types'

function fallbackStage(): ClientStageConfig {
  return {
    power_mode: 0,
    free_mode: 2,
    mass_initial_kg: 1000,
    burn_start_s: 0,
    burn_end_s: 30,
    forced_cutoff_s: 30,
    separation_time_s: 30,
    throat_diameter_m: 0.1,
    nozzle_expansion_ratio: 5,
    nozzle_exit_pressure_pa: 101300,
    thrust_constant: 50000,
    thrust_multiplier: 1,
    thrust_profile: [],
    isp_constant: 200,
    isp_multiplier: 1,
    isp_profile: [],
  }
}

type LegacyStage = {
  "power flight mode(int)": number
  "free flight mode(int)": number
  "mass initial[kg]": number
  thrust: {
    "Isp vac file exist?(bool)": boolean
    "Isp vac file name(str)": string
    "Isp coefficient[-]": number
    "const Isp vac[s]": number
    "thrust vac file exist?(bool)": boolean
    "thrust vac file name(str)": string
    "thrust coefficient[-]": number
    "const thrust vac[N]": number
    "burn start time(time of each stage)[s]": number
    "burn end time(time of each stage)[s]": number
    "forced cutoff time(time of each stage)[s]": number
    "throat diameter[m]": number
    "nozzle expansion ratio[-]": number
    "nozzle exhaust pressure[Pa]": number
  }
  aero: {
    "body diameter[m]": number
    "normal coefficient file exist?(bool)": boolean
    "normal coefficient file name(str)": string
    "normal multiplier[-]": number
    "const normal coefficient[-]": number
    "axial coefficient file exist?(bool)": boolean
    "axial coefficient file name(str)": string
    "axial multiplier[-]": number
    "const axial coefficient[-]": number
    "ballistic coefficient(ballistic flight mode)[kg/m2]": number
  }
  attitude: {
    "attitude file exist?(bool)": boolean
    "attitude file name(str)": string
    "const elevation[deg]": number
    "const azimuth[deg]": number
    "pitch offset[deg]": number
    "yaw offset[deg]": number
    "roll offset[deg]": number
    "gyro bias x[deg/h]": number
    "gyro bias y[deg/h]": number
    "gyro bias z[deg/h]": number
  }
  "dumping product": {
    "dumping product exist?(bool)": boolean
    "dumping product separation time[s]": number
    "dumping product mass[kg]": number
    "dumping product ballistic coefficient[kg/m2]": number
    "additional speed at dumping NED[m/s,m/s,m/s]": [number, number, number]
  }
  "attitude neutrality(3DoF)": {
    "considering neutrality?(bool)": boolean
    "CG, Controller position file(str)": string
    "CP file(str)": string
  }
  "6DoF": {
    "CG,CP,Controller position file(str)": string
    "moment of inertia file name(str)": string
  }
  stage: {
    "following stage exist?(bool)": boolean
    "separation time[s]": number
  }
}

type LegacyRocketConfig = {
  "name(str)": string
  "calculate condition": {
    "end time[s]": number
    "time step for output[s]": number
    "air density variation file exist?(bool)": boolean
    "air density variation file name(str)": string
    "variation ratio of air density[%](-100to100, default=0)": number
  }
  launch: {
    "position LLH[deg,deg,m]": [number, number, number]
    "velocity NED[m/s]": [number, number, number]
    "time(UTC)[y,m,d,h,min,sec]": [number, number, number, number, number, number]
  }
  stage1: LegacyStage
  stage2?: LegacyStage
  stage3?: LegacyStage
  wind: {
    "wind file exist?(bool)": boolean
    "wind file name(str)": string
    "const wind[m/s,deg]": [number, number]
  }
}

export function toLegacyRocketConfig(config: ClientConfig): LegacyRocketConfig {
  const { simulation, launch, aerodynamics, attitude, wind } = config
  const stageList = config.stages.length > 0 ? config.stages : [fallbackStage()]
  const stages = stageList.slice(0, 3)

  const toLegacyStage = (stage: ClientStageConfig, hasNext: boolean): LegacyStage => {
    const separation = hasNext
      ? Math.max(stage.separation_time_s ?? stage.forced_cutoff_s, stage.burn_end_s)
      : 1e6
    return {
      "power flight mode(int)": stage.power_mode,
      "free flight mode(int)": stage.free_mode,
      "mass initial[kg]": stage.mass_initial_kg,
      thrust: {
        "Isp vac file exist?(bool)": false,
        "Isp vac file name(str)": '',
        "Isp coefficient[-]": stage.isp_multiplier,
        "const Isp vac[s]": stage.isp_constant,
        "thrust vac file exist?(bool)": false,
        "thrust vac file name(str)": '',
        "thrust coefficient[-]": stage.thrust_multiplier,
        "const thrust vac[N]": stage.thrust_constant,
        "burn start time(time of each stage)[s]": stage.burn_start_s,
        "burn end time(time of each stage)[s]": stage.burn_end_s,
        "forced cutoff time(time of each stage)[s]": stage.forced_cutoff_s,
        "throat diameter[m]": stage.throat_diameter_m,
        "nozzle expansion ratio[-]": stage.nozzle_expansion_ratio,
        "nozzle exhaust pressure[Pa]": stage.nozzle_exit_pressure_pa,
      },
      aero: {
        "body diameter[m]": aerodynamics.body_diameter_m,
        "normal coefficient file exist?(bool)": false,
        "normal coefficient file name(str)": '',
        "normal multiplier[-]": aerodynamics.cn_multiplier,
        "const normal coefficient[-]": aerodynamics.cn_constant,
        "axial coefficient file exist?(bool)": false,
        "axial coefficient file name(str)": '',
        "axial multiplier[-]": aerodynamics.ca_multiplier,
        "const axial coefficient[-]": aerodynamics.ca_constant,
        "ballistic coefficient(ballistic flight mode)[kg/m2]": aerodynamics.ballistic_coefficient,
      },
      attitude: {
        "attitude file exist?(bool)": false,
        "attitude file name(str)": '',
        "const elevation[deg]": attitude.elevation_deg,
        "const azimuth[deg]": attitude.azimuth_deg,
        "pitch offset[deg]": attitude.pitch_offset_deg,
        "yaw offset[deg]": attitude.yaw_offset_deg,
        "roll offset[deg]": attitude.roll_offset_deg,
        "gyro bias x[deg/h]": attitude.gyro_bias_deg_h[0],
        "gyro bias y[deg/h]": attitude.gyro_bias_deg_h[1],
        "gyro bias z[deg/h]": attitude.gyro_bias_deg_h[2],
      },
      "dumping product": {
        "dumping product exist?(bool)": false,
        "dumping product separation time[s]": 0,
        "dumping product mass[kg]": 0,
        "dumping product ballistic coefficient[kg/m2]": 0,
        "additional speed at dumping NED[m/s,m/s,m/s]": [0, 0, 0],
      },
      "attitude neutrality(3DoF)": {
        "considering neutrality?(bool)": false,
        "CG, Controller position file(str)": '',
        "CP file(str)": '',
      },
      "6DoF": {
        "CG,CP,Controller position file(str)": '',
        "moment of inertia file name(str)": '',
      },
      stage: {
        "following stage exist?(bool)": hasNext,
        "separation time[s]": separation,
      },
    }
  }

  const stage1 = toLegacyStage(stages[0], stages.length > 1)
  const stage2 = stages[1] ? toLegacyStage(stages[1], stages.length > 2) : undefined
  const stage3 = stages[2] ? toLegacyStage(stages[2], false) : undefined

  return {
    "name(str)": config.name,
    "calculate condition": {
      "end time[s]": simulation.duration_s,
      "time step for output[s]": simulation.output_step_s,
      "air density variation file exist?(bool)": false,
      "air density variation file name(str)": '',
      "variation ratio of air density[%](-100to100, default=0)": simulation.air_density_percent,
    },
    launch: {
      "position LLH[deg,deg,m]": [launch.latitude_deg, launch.longitude_deg, launch.altitude_m],
      "velocity NED[m/s]": [...launch.velocity_ned_mps] as [number, number, number],
      "time(UTC)[y,m,d,h,min,sec]": [
        launch.datetime_utc.year,
        launch.datetime_utc.month,
        launch.datetime_utc.day,
        launch.datetime_utc.hour,
        launch.datetime_utc.minute,
        launch.datetime_utc.second,
      ],
    },
    stage1,
    ...(stage2 ? { stage2 } : {}),
    ...(stage3 ? { stage3 } : {}),
    wind: {
      "wind file exist?(bool)": false,
      "wind file name(str)": '',
      "const wind[m/s,deg]": [wind.speed_mps, wind.direction_deg],
    },
  }
}

let modPromise: Promise<any> | null = null

export function initWasm(): Promise<any> {
  if (!modPromise) {
    // Use Vite's glob import to optionally load the wasm-pack output if present.
    // This avoids build-time resolution errors when the WASM bundle has not been generated yet.
    const candidates = import.meta.glob('../wasm/openTsiolkovsky.{js,ts}') as Record<string, () => Promise<any>>
    const keys = Object.keys(candidates)
    if (keys.length === 0) {
      modPromise = Promise.reject(new Error('WASM bundle not found. Run: bash scripts/wasm_build.sh'))
    } else {
      modPromise = candidates[keys[0]]().then(async (module) => {
        if (typeof module.default === 'function') {
          await module.default()
        }
        return module
      })
    }
  }
  return modPromise
}

// Main simulation function - now using WASM only
export async function runSimulation(config: ClientConfig): Promise<SimulationState[]> {
  const mod = await initWasm()
  // WasmSimulator accepts the client config JSON and performs conversion internally
  try {
    const sim = new mod.WasmSimulator(JSON.stringify(config))
    const json = await sim.run()
    return JSON.parse(json) as SimulationState[]
  } catch (err: any) {
    const message = typeof err?.message === 'string' ? err.message : String(err)
    const needsLegacyFallback =
      message.includes('Failed to parse config JSON') && message.includes('position LLH')

    if (!needsLegacyFallback) {
      throw err
    }

    const legacyPayload = toLegacyRocketConfig(config)
    const sim = new mod.WasmSimulator(JSON.stringify(legacyPayload))
    const json = await sim.run()
    return JSON.parse(json) as SimulationState[]
  }
}

// Legacy alias for backwards compatibility
export const runSimulationWasm = runSimulation

export async function stepWasm(sim: any, dt: number) {
  const json = await sim.step(dt)
  return JSON.parse(json) as SimulationState
}
