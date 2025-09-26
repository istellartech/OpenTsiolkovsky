import type { ClientConfig, ClientStageConfig } from '../lib/simulation'

export const POWER_MODE_OPTIONS = [
  { value: 0, label: '0: 3DoF（標準）' },
  { value: 1, label: '1: 3DoF（遅れ付き）' },
  { value: 2, label: '2: 6DoF' },
  { value: 3, label: '3: 6DoF（空力安定）' },
]

export const FREE_MODE_OPTIONS = [
  { value: 0, label: '0: 空力安定' },
  { value: 1, label: '1: 3DoF 指定姿勢' },
  { value: 2, label: '2: 弾道飛行' },
]

export const MAX_STAGE_COUNT = 5

export function createDefaultStage(): ClientStageConfig {
  return {
    power_mode: 0,
    free_mode: 0,
    mass_initial_kg: 1150,
    mass_dry_kg: 390,
    burn_start_s: 0,
    burn_end_s: 62,
    forced_cutoff_s: 62,
    separation_time_s: 600,
    coast_time_s: 0,
    stage_num: 1,
    throat_diameter_m: 0.13,
    nozzle_expansion_ratio: 4,
    nozzle_exit_pressure_pa: 1500,
    thrust_constant: 30000,
    isp_constant: 250,
    thrust_multiplier: 1,
    isp_multiplier: 1,
    cg_position_m: [0, 0, 4.5],
    rotational_inertia_kgm2: [900, 900, 120],
    thrust_profile: [],
    isp_profile: [],
  }
}

export function cloneStage(stage: ClientStageConfig): ClientStageConfig {
  return {
    ...stage,
    cg_position_m: [...stage.cg_position_m],
    rotational_inertia_kgm2: [...stage.rotational_inertia_kgm2],
    thrust_profile: stage.thrust_profile ? stage.thrust_profile.map(sample => ({ ...sample })) : [],
    isp_profile: stage.isp_profile ? stage.isp_profile.map(sample => ({ ...sample })) : [],
  }
}

export function createDefaultConfig(): ClientConfig {
  const stage = createDefaultStage()
  return {
    name: 'MOMO Sounding Rocket',
    simulation: {
      duration_s: 400,
      output_step_s: 1,
      air_density_percent: 0,
      integrator: {
        method: 'rk45',
        rk4_step_s: 0.5,
      },
    },
    launch: {
      latitude_deg: 42.51,
      longitude_deg: 143.46,
      altitude_m: 15,
      velocity_ned_mps: [0, 0, 0],
      datetime_utc: {
        year: 2021,
        month: 1,
        day: 5,
        hour: 12,
        minute: 0,
        second: 0,
      },
    },
    stages: [cloneStage({
      ...stage,
      mass_initial_kg: 1250,
      burn_start_s: 0,
      burn_end_s: 118,
      forced_cutoff_s: 118,
      throat_diameter_m: 0.11,
      nozzle_expansion_ratio: 2.5,
      thrust_constant: 16500,
      isp_constant: 230,
    })],
    aerodynamics: {
      body_diameter_m: 0.5,
      cn_constant: 0.25,
      cn_multiplier: 1,
      cn_profile: [],
      ca_constant: 0.45,
      ca_multiplier: 1,
      ca_profile: [],
      ballistic_coefficient: 110,
    },
    attitude: {
      elevation_deg: 90,
      azimuth_deg: 117,
      pitch_offset_deg: 0,
      yaw_offset_deg: 0,
      roll_offset_deg: 0,
      gyro_bias_deg_h: [0, 0, 0],
      profile: [
        { time: 0, azimuth_deg: 117, elevation_deg: 90 },
        { time: 5, azimuth_deg: 117, elevation_deg: 90 },
        { time: 20, azimuth_deg: 117, elevation_deg: 80 },
        { time: 25, azimuth_deg: 117, elevation_deg: 80 },
        { time: 30, azimuth_deg: 117, elevation_deg: 80 },
        { time: 35, azimuth_deg: 118, elevation_deg: 80 },
        { time: 40, azimuth_deg: 120, elevation_deg: 80 },
        { time: 45, azimuth_deg: 122, elevation_deg: 80.5 },
        { time: 50, azimuth_deg: 124, elevation_deg: 81 },
        { time: 55, azimuth_deg: 126, elevation_deg: 81.5 },
        { time: 60, azimuth_deg: 128, elevation_deg: 82 },
        { time: 65, azimuth_deg: 131, elevation_deg: 82 },
        { time: 70, azimuth_deg: 132, elevation_deg: 82 },
        { time: 75, azimuth_deg: 130, elevation_deg: 82 },
        { time: 80, azimuth_deg: 125, elevation_deg: 83 },
        { time: 85, azimuth_deg: 121, elevation_deg: 84 },
        { time: 90, azimuth_deg: 117, elevation_deg: 85 },
        { time: 95, azimuth_deg: 115, elevation_deg: 85 },
        { time: 100, azimuth_deg: 115, elevation_deg: 85 },
        { time: 105, azimuth_deg: 115, elevation_deg: 86 },
        { time: 110, azimuth_deg: 115, elevation_deg: 88 },
        { time: 115, azimuth_deg: 115, elevation_deg: 90 },
        { time: 120, azimuth_deg: 115, elevation_deg: 90 },
        { time: 130, azimuth_deg: 115, elevation_deg: 90 },
      ],
    },
    wind: {
      speed_mps: 0,
      direction_deg: 270,
      profile: [],
    },
  }
}

function createOrbitalDemoPreset(): ClientConfig {
  const stage1 = cloneStage({
    ...createDefaultStage(),
    power_mode: 2,
    free_mode: 0,
    mass_initial_kg: 42000,
    burn_start_s: 0,
    burn_end_s: 160,
    forced_cutoff_s: 165,
    separation_time_s: 170,
    throat_diameter_m: 0.9,
    nozzle_expansion_ratio: 12,
    nozzle_exit_pressure_pa: 2500,
    thrust_constant: 950000,
    isp_constant: 285,
  })

  const stage2 = cloneStage({
    ...createDefaultStage(),
    power_mode: 2,
    free_mode: 1,
    mass_initial_kg: 9000,
    burn_start_s: 170,
    burn_end_s: 420,
    forced_cutoff_s: 420,
    separation_time_s: 425,
    throat_diameter_m: 0.6,
    nozzle_expansion_ratio: 35,
    nozzle_exit_pressure_pa: 1200,
    thrust_constant: 210000,
    isp_constant: 320,
  })

  return {
    name: 'Orbital Demo Launcher',
    simulation: {
      duration_s: 520,
      output_step_s: 2,
      air_density_percent: 0,
      integrator: {
        method: 'rk45',
        rk4_step_s: 1,
      },
    },
    launch: {
      latitude_deg: 30.0,
      longitude_deg: -80.5,
      altitude_m: 5,
      velocity_ned_mps: [0, 0, 0],
      datetime_utc: {
        year: 2024,
        month: 4,
        day: 12,
        hour: 14,
        minute: 30,
        second: 0,
      },
    },
    stages: [stage1, stage2],
    aerodynamics: {
      body_diameter_m: 3.5,
      cn_constant: 0.35,
      cn_multiplier: 1,
      cn_profile: [],
      ca_constant: 0.32,
      ca_multiplier: 1,
      ca_profile: [],
      ballistic_coefficient: 270,
    },
    attitude: {
      elevation_deg: 88,
      azimuth_deg: 92,
      pitch_offset_deg: 0,
      yaw_offset_deg: 0,
      roll_offset_deg: 0,
      gyro_bias_deg_h: [0, 0, 0],
      profile: [],
    },
    wind: {
      speed_mps: 4,
      direction_deg: 250,
      profile: [],
    },
  }
}

function createHopperTestPreset(): ClientConfig {
  const stage = cloneStage({
    ...createDefaultStage(),
    power_mode: 1,
    free_mode: 2,
    mass_initial_kg: 850,
    burn_start_s: 0,
    burn_end_s: 45,
    forced_cutoff_s: 48,
    separation_time_s: 60,
    throat_diameter_m: 0.25,
    nozzle_expansion_ratio: 8,
    nozzle_exit_pressure_pa: 6000,
    thrust_constant: 52000,
    isp_constant: 215,
  })

  return {
    name: 'VTOL Hopper Test',
    simulation: {
      duration_s: 180,
      output_step_s: 0.5,
      air_density_percent: 0,
      integrator: {
        method: 'rk45',
        rk4_step_s: 0.25,
      },
    },
    launch: {
      latitude_deg: 32.98,
      longitude_deg: -106.97,
      altitude_m: 1200,
      velocity_ned_mps: [0, 0, 0],
      datetime_utc: {
        year: 2024,
        month: 7,
        day: 8,
        hour: 22,
        minute: 5,
        second: 0,
      },
    },
    stages: [stage],
    aerodynamics: {
      body_diameter_m: 1.6,
      cn_constant: 0.18,
      cn_multiplier: 1,
      cn_profile: [],
      ca_constant: 0.24,
      ca_multiplier: 1,
      ca_profile: [],
      ballistic_coefficient: 140,
    },
    attitude: {
      elevation_deg: 90,
      azimuth_deg: 0,
      pitch_offset_deg: 0,
      yaw_offset_deg: 0,
      roll_offset_deg: 0,
      gyro_bias_deg_h: [0, 0, 0],
      profile: [],
    },
    wind: {
      speed_mps: 2,
      direction_deg: 180,
      profile: [],
    },
  }
}

export interface PresetOption {
  id: string
  label: string
  description: string
  create: () => ClientConfig
}

export const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'sample',
    label: 'MOMO Sounding Rocket',
    description: '観測ロケット',
    create: () => createDefaultConfig(),
  },
  {
    id: 'orbital',
    label: 'Orbital Demo Launcher',
    description: '軌道投入デモ',
    create: () => createOrbitalDemoPreset(),
  },
  {
    id: 'hopper',
    label: 'VTOL Hopper Test',
    description: '垂直着陸試験',
    create: () => createHopperTestPreset(),
  },
]
