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

// Minimal API error shape returned by the web server
export type ApiError = { error: string, detail?: string }

// RocketConfig (ergonomic TypeScript shape for client-side usage)
// Note: Server expects C++-compatible JSON keys; when sending manual JSON,
// ensure keys match `rust/crates/core/src/rocket/mod.rs` serde rename strings.
export interface RocketConfig {
  name: string
  calculate_condition: {
    end_time: number
    time_step: number
    air_density_file_exists?: boolean
    air_density_file?: string
    air_density_variation?: number
  }
  launch: {
    position_llh: [number, number, number]
    velocity_ned: [number, number, number]
    launch_time: [number, number, number, number, number, number]
  }
  stage1: {
    power_flight_mode: number
    free_flight_mode: number
    mass_initial: number
    thrust: {
      isp_file_exists: boolean
      isp_file_name: string
      isp_coefficient: number
      const_isp_vac: number
      thrust_file_exists: boolean
      thrust_file_name: string
      thrust_coefficient: number
      const_thrust_vac: number
      burn_start_time: number
      burn_end_time: number
      forced_cutoff_time: number
      throat_diameter: number
      nozzle_expansion_ratio: number
      nozzle_exhaust_pressure: number
    }
    aero: {
      body_diameter: number
      cn_file_exists: boolean
      cn_file_name: string
      normal_multiplier: number
      const_normal_coefficient: number
      ca_file_exists: boolean
      ca_file_name: string
      axial_multiplier: number
      const_axial_coefficient: number
      ballistic_coefficient: number
    }
    attitude: {
      attitude_file_exists: boolean
      attitude_file_name: string
      const_elevation: number
      const_azimuth: number
      pitch_offset: number
      yaw_offset: number
      roll_offset: number
      gyro_bias_x: number
      gyro_bias_y: number
      gyro_bias_z: number
    }
    dumping_product: {
      dumping_product_exists: boolean
      dumping_product_separation_time: number
      dumping_product_mass: number
      dumping_product_ballistic_coefficient: number
      additional_speed_at_dumping_ned: [number, number, number]
    }
    attitude_neutrality: {
      considering_neutrality: boolean
      cg_controller_position_file: string
      cp_file: string
    }
    six_dof: {
      cg_cp_controller_position_file: string
      moment_of_inertia_file_name: string
    }
    stage: {
      following_stage_exists: boolean
      separation_time: number
    }
  }
  wind: {
    wind_file_exists: boolean
    wind_file_name: string
    const_wind: [number, number] // [speed(m/s), direction(deg)]
  }
}
