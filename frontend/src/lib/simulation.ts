// WASM loader utilities for OpenTsiolkovsky (optional client-side execution)
// This expects `scripts/wasm_build.sh` to have emitted artifacts into
// `frontend/src/wasm` with out-name `openTsiolkovsky`.

// Type Definitions
export type Vec3Json = { x: number, y: number, z: number } | [number, number, number]

export type SimulationState = {
  time: number
  position: Vec3Json
  position_eci?: Vec3Json  // For compatibility with older data formats
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
  velocity_ned?: Vec3Json       // NED velocity components [m/s] (backward compatibility)
  velocity_eci_ned?: Vec3Json   // ECI velocity in NED frame [m/s]
  velocity_ecef_ned?: Vec3Json  // ECEF velocity in NED frame [m/s]
  sea_level_mach?: number       // Mach number based on sea level sound speed
  acceleration_magnitude?: number  // Total acceleration magnitude [m/s²]
  acc_eci?: Vec3Json  // ECI acceleration components [m/s²]
  acc_body?: Vec3Json  // Body-frame acceleration components [m/s²]
  angle_of_attack?: number  // Attack of angle [deg]
  sideslip_angle?: number   // Sideslip angle [deg]
  attitude_azimuth?: number  // Attitude azimuth [deg]
  attitude_elevation?: number  // Attitude elevation [deg]
}

export function vec3ToObject(vec: Vec3Json): { x: number, y: number, z: number } {
  if (!vec) {
    return { x: 0, y: 0, z: 0 }
  }

  if (Array.isArray(vec)) {
    const [x = 0, y = 0, z = 0] = vec
    return {
      x: Number(x),
      y: Number(y),
      z: Number(z),
    }
  }

  return {
    x: Number(vec?.x || 0),
    y: Number(vec?.y || 0),
    z: Number(vec?.z || 0),
  }
}

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

function toRadians(value: number | undefined): number {
  return (Number.isFinite(value) ? (value as number) : 0) * DEG2RAD
}

function toDegrees(value: number): number {
  return value * RAD2DEG
}

type Vec3 = { x: number; y: number; z: number }

function subtractVec(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }
}

function mulMat3Vec3(m: number[][], v: Vec3): Vec3 {
  return {
    x: m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
    y: m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
    z: m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
  }
}

function dcmNedToBody(azimuthRad: number, elevationRad: number, rollRad = 0): number[][] {
  const ca = Math.cos(azimuthRad)
  const sa = Math.sin(azimuthRad)
  const ce = Math.cos(elevationRad)
  const se = Math.sin(elevationRad)
  const cr = Math.cos(rollRad)
  const sr = Math.sin(rollRad)

  return [
    [ca * ce, sa * ce, -se],
    [ca * se * sr - sa * cr, sa * se * sr + ca * cr, ce * sr],
    [ca * se * cr + sa * sr, sa * se * cr - ca * sr, ce * cr],
  ]
}

function windVectorFromSample(speed: number, direction: number): Vec3 {
  const dirRad = toRadians(direction)
  return {
    x: -speed * Math.cos(dirRad),
    y: -speed * Math.sin(dirRad),
    z: 0,
  }
}

function interpolateWindVector(
  altitude: number,
  profile: ClientWindSample[]
): Vec3 {
  if (profile.length === 0) {
    return { x: 0, y: 0, z: 0 }
  }

  if (!Number.isFinite(altitude)) {
    altitude = 0
  }

  if (altitude <= profile[0].altitude_m) {
    return windVectorFromSample(profile[0].speed_mps, profile[0].direction_deg)
  }

  const last = profile[profile.length - 1]
  if (altitude >= last.altitude_m) {
    return windVectorFromSample(last.speed_mps, last.direction_deg)
  }

  for (let i = 0; i < profile.length - 1; i++) {
    const lower = profile[i]
    const upper = profile[i + 1]
    if (altitude >= lower.altitude_m && altitude <= upper.altitude_m) {
      const span = Math.max(upper.altitude_m - lower.altitude_m, 1e-6)
      const t = (altitude - lower.altitude_m) / span
      const lowVec = windVectorFromSample(lower.speed_mps, lower.direction_deg)
      const highVec = windVectorFromSample(upper.speed_mps, upper.direction_deg)
      return {
        x: lowVec.x + t * (highVec.x - lowVec.x),
        y: lowVec.y + t * (highVec.y - lowVec.y),
        z: 0,
      }
    }
  }

  return windVectorFromSample(last.speed_mps, last.direction_deg)
}

function augmentAerodynamicAngles(states: SimulationState[], config: ClientConfig) {
  if (!Array.isArray(states) || states.length === 0) return

  const constantWind = windVectorFromSample(
    config.wind?.speed_mps ?? 0,
    config.wind?.direction_deg ?? 0
  )

  const windProfile = (config.wind?.profile || [])
    .slice()
    .sort((a, b) => a.altitude_m - b.altitude_m)

  for (const state of states) {
    if (!Number.isFinite(state.angle_of_attack)) {
      state.angle_of_attack = 0
    }
    if (!Number.isFinite(state.sideslip_angle)) {
      state.sideslip_angle = 0
    }

    const hasAlpha = Number.isFinite(state.angle_of_attack) && Math.abs(state.angle_of_attack ?? 0) > 1e-6
    const hasBeta = Number.isFinite(state.sideslip_angle) && Math.abs(state.sideslip_angle ?? 0) > 1e-6
    if (hasAlpha && hasBeta) {
      continue
    }

    const velNed = vec3ToObject(state.velocity_ned || state.velocity || [0, 0, 0])

    const windVec = windProfile.length > 0
      ? interpolateWindVector(state.altitude ?? 0, windProfile)
      : constantWind

    const velAirNed = subtractVec(velNed, windVec)
    const velMagSq = velAirNed.x * velAirNed.x + velAirNed.y * velAirNed.y + velAirNed.z * velAirNed.z
    if (velMagSq < 1e-8) {
      continue
    }

    const azimuthDeg = Number.isFinite(state.attitude_azimuth)
      ? (state.attitude_azimuth as number)
      : config.attitude?.azimuth_deg ?? 0
    const elevationDeg = Number.isFinite(state.attitude_elevation)
      ? (state.attitude_elevation as number)
      : config.attitude?.elevation_deg ?? 0
    const rollDeg = config.attitude?.roll_offset_deg ?? 0

    const transform = dcmNedToBody(
      toRadians(azimuthDeg),
      toRadians(elevationDeg),
      toRadians(rollDeg)
    )
    const velBody = mulMat3Vec3(transform, velAirNed)

    const longitudinal = Math.abs(velBody.x)
    if (longitudinal < 1e-6) {
      continue
    }

    const alpha = toDegrees(Math.atan2(velBody.z, velBody.x))
    const beta = toDegrees(Math.atan2(velBody.y, velBody.x))

    if (!hasAlpha) {
      state.angle_of_attack = alpha
    }
    if (!hasBeta) {
      state.sideslip_angle = beta
    }
  }
}

export type ClientTimeSample = { time: number, value: number }
export type ClientMachSample = { mach: number, value: number }
export type ClientAttitudeSample = { time: number, azimuth_deg: number, elevation_deg: number }
export type ClientWindSample = { altitude_m: number, speed_mps: number, direction_deg: number }

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
}

export type ClientIntegratorConfig = {
  method: 'rk4' | 'rk45'
  rk4_step_s?: number | null
}

export type ClientConfig = {
  name: string
  simulation: {
    duration_s: number
    output_step_s: number
    air_density_percent: number
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
    ballistic_coefficient: number
  }
  attitude: {
    elevation_deg: number
    azimuth_deg: number
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

function fallbackStage(): ClientStageConfig {
  return {
    power_mode: 0,
    free_mode: 2,
    mass_initial_kg: 1150,
    mass_dry_kg: 390,
    burn_start_s: 0,
    burn_end_s: 62,
    forced_cutoff_s: 62,
    separation_time_s: 600,
    coast_time_s: 0,
    throat_diameter_m: 0.13,
    nozzle_expansion_ratio: 4,
    nozzle_exit_pressure_pa: 1500,
    thrust_constant: 30000,
    thrust_multiplier: 1,
    thrust_profile: [],
    isp_constant: 250,
    isp_multiplier: 1,
    isp_profile: [],
    cg_position_m: [0, 0, 4.5],
    rotational_inertia_kgm2: [900, 900, 120],
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
    integrator: {
      "method(str)": 'rk4' | 'rk45'
      "rk4 step[s]"?: number
    }
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

  const integrator = simulation.integrator ?? { method: 'rk45' as const, rk4_step_s: null }
  const method = integrator.method === 'rk45' ? 'rk45' : 'rk4'
  const legacyIntegrator: LegacyRocketConfig['calculate condition']['integrator'] = {
    'method(str)': method,
  }
  if (method === 'rk4') {
    const step = integrator.rk4_step_s
    if (typeof step === 'number' && Number.isFinite(step) && step > 0) {
      legacyIntegrator['rk4 step[s]'] = step
    }
  }

  return {
    "name(str)": config.name,
    "calculate condition": {
      "end time[s]": simulation.duration_s,
      "time step for output[s]": simulation.output_step_s,
      "air density variation file exist?(bool)": false,
      "air density variation file name(str)": '',
      "variation ratio of air density[%](-100to100, default=0)": simulation.air_density_percent,
      integrator: legacyIntegrator,
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
    const glob = (import.meta as any)?.glob

    if (typeof glob === 'function') {
      // Use Vite's glob import to optionally load the wasm-pack output if present.
      // This avoids build-time resolution errors when the WASM bundle has not been generated yet.
      const candidates = glob('../wasm/openTsiolkovsky.{js,ts}') as Record<string, () => Promise<any>>
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
    } else {
      modPromise = import('../wasm/openTsiolkovsky.js').then(async (module) => {
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
    const result = JSON.parse(json) as SimulationState[]

    augmentAerodynamicAngles(result, config)

    // Detailed validation and logging
    console.log('WASM simulation result details:', {
      count: result.length,
      configDuration: config.simulation.duration_s,
      configOutputStep: config.simulation.output_step_s,
      expectedPoints: Math.ceil(config.simulation.duration_s / config.simulation.output_step_s),
      firstPoint: result[0],
      lastPoint: result[result.length - 1],
      sampleFields: Object.keys(result[0] || {}),
      timeRange: result.length > 1 ? `${result[0]?.time} to ${result[result.length - 1]?.time}` : 'single point',
      altitudeRange: result.length > 1 ? `${result[0]?.altitude} to ${Math.max(...result.map(r => r.altitude || 0))}` : 'single altitude',
      hasValidData: result.length > 1 && result.every(r => typeof r.time === 'number' && typeof r.altitude === 'number')
    })

    // Validate data quality
    if (result.length < 2) {
      console.error('❌ Simulation returned insufficient data points:', result.length)
    } else if (result.length < config.simulation.duration_s / config.simulation.output_step_s * 0.5) {
      console.warn('⚠️ Simulation may have terminated early. Expected ~' + Math.ceil(config.simulation.duration_s / config.simulation.output_step_s) + ' points, got ' + result.length)
    } else {
      console.log('✅ Simulation completed successfully with', result.length, 'data points')
    }

    return result
  } catch (err: any) {
    const message = typeof err?.message === 'string' ? err.message : String(err)
    const needsLegacyFallback =
      message.includes('Failed to parse config JSON') && message.includes('position LLH')

    if (!needsLegacyFallback) {
      throw err
    }

    console.log('Falling back to legacy config format')
    const legacyPayload = toLegacyRocketConfig(config)
    const sim = new mod.WasmSimulator(JSON.stringify(legacyPayload))
    const json = await sim.run()
    const result = JSON.parse(json) as SimulationState[]

    augmentAerodynamicAngles(result, config)

    // Detailed validation and logging for legacy format
    console.log('Legacy WASM simulation result details:', {
      count: result.length,
      configDuration: config.simulation.duration_s,
      configOutputStep: config.simulation.output_step_s,
      expectedPoints: Math.ceil(config.simulation.duration_s / config.simulation.output_step_s),
      firstPoint: result[0],
      lastPoint: result[result.length - 1],
      sampleFields: Object.keys(result[0] || {}),
      timeRange: result.length > 1 ? `${result[0]?.time} to ${result[result.length - 1]?.time}` : 'single point',
      altitudeRange: result.length > 1 ? `${result[0]?.altitude} to ${Math.max(...result.map(r => r.altitude || 0))}` : 'single altitude',
      hasValidData: result.length > 1 && result.every(r => typeof r.time === 'number' && typeof r.altitude === 'number')
    })

    // Validate data quality for legacy format
    if (result.length < 2) {
      console.error('❌ Legacy simulation returned insufficient data points:', result.length)
    } else if (result.length < config.simulation.duration_s / config.simulation.output_step_s * 0.5) {
      console.warn('⚠️ Legacy simulation may have terminated early. Expected ~' + Math.ceil(config.simulation.duration_s / config.simulation.output_step_s) + ' points, got ' + result.length)
    } else {
      console.log('✅ Legacy simulation completed successfully with', result.length, 'data points')
    }

    return result
  }
}

// Legacy alias for backwards compatibility
export const runSimulationWasm = runSimulation

export async function stepWasm(sim: any, dt: number) {
  const json = await sim.step(dt)
  return JSON.parse(json) as SimulationState
}
