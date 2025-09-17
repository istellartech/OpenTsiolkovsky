export type Vec3Json = { x: number, y: number, z: number } | [number, number, number]

export type SimulationState = {
  time: number
  position: Vec3Json
  velocity: Vec3Json
  mass: number
  stage: number
  altitude: number
  velocity_magnitude: number
  mach_number: number
  dynamic_pressure: number
  thrust: number
  drag_force: number
}

export function vec3ToObject(vec: Vec3Json): { x: number, y: number, z: number } {
  if (Array.isArray(vec)) {
    const [x, y, z] = vec
    return {
      x: Number(x),
      y: Number(y),
      z: Number(z),
    }
  }
  return {
    x: Number(vec.x),
    y: Number(vec.y),
    z: Number(vec.z),
  }
}

export type ApiError = { error: string, detail?: string }

export type ClientTimeSample = { time: number, value: number }
export type ClientMachSample = { mach: number, value: number }
export type ClientAttitudeSample = { time: number, azimuth_deg: number, elevation_deg: number }
export type ClientWindSample = { altitude_m: number, speed_mps: number, direction_deg: number }

export type ClientConfig = {
  name: string
  simulation: {
    duration_s: number
    output_step_s: number
    air_density_percent: number
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
  }
  stage: {
    power_mode: number
    free_mode: number
    mass_initial_kg: number
    burn_start_s: number
    burn_end_s: number
    forced_cutoff_s: number
    throat_diameter_m: number
    nozzle_expansion_ratio: number
    nozzle_exit_pressure_pa: number
    thrust_constant: number
    thrust_multiplier: number
    thrust_profile: ClientTimeSample[]
    isp_constant: number
    isp_multiplier: number
    isp_profile: ClientTimeSample[]
  }
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
