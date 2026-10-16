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

function createSS520Preset(): ClientConfig {
  const stage1 = cloneStage({
    ...createDefaultStage(),
    power_mode: 0,
    free_mode: 2,
    mass_initial_kg: 2200,
    mass_dry_kg: 1650,
    burn_start_s: 0,
    burn_end_s: 33,
    forced_cutoff_s: 33,
    separation_time_s: 35,
    throat_diameter_m: 0.1768,
    nozzle_expansion_ratio: 8,
    nozzle_exit_pressure_pa: 101300,
    thrust_constant: 160000,
    isp_constant: 190,
    thrust_profile: [
      { time: 0.0, value: 160000 },
      { time: 10, value: 100000 },
      { time: 30.0, value: 50000 },
      { time: 31.7, value: 20000 },
      { time: 31.8, value: 0 },
    ],
  })

  const stage2 = cloneStage({
    ...createDefaultStage(),
    power_mode: 0,
    free_mode: 2,
    mass_initial_kg: 510,
    mass_dry_kg: 360,
    burn_start_s: 138.3,
    burn_end_s: 161.7,
    forced_cutoff_s: 161.7,
    separation_time_s: 228,
    throat_diameter_m: 0.1,
    nozzle_expansion_ratio: 10,
    nozzle_exit_pressure_pa: 0,
    thrust_constant: 45500,
    isp_constant: 264.8,
    thrust_profile: [
      { time: 138.3, value: 45500 },
      { time: 162.0, value: 24500 },
      { time: 162.8, value: 0 },
    ],
  })

  // Stage times are measured from the start of each stage (= previous separation).
  const stage3 = cloneStage({
    ...createDefaultStage(),
    power_mode: 0,
    free_mode: 2,
    mass_initial_kg: 86,
    mass_dry_kg: 60,
    burn_start_s: 0,
    burn_end_s: 25.6,
    forced_cutoff_s: 25.6,
    separation_time_s: 1000000,
    throat_diameter_m: 0.05,
    nozzle_expansion_ratio: 10,
    nozzle_exit_pressure_pa: 0,
    thrust_constant: 12760,
    isp_constant: 282.6,
    thrust_profile: [
      { time: 0, value: 12760 },
      { time: 25.6, value: 1970 },
      { time: 25.7, value: 0 },
    ],
  })

  return {
    name: 'SS-520-5 Sounding Rocket',
    simulation: {
      duration_s: 10000,
      output_step_s: 0.2,
      air_density_percent: 0,
      integrator: {
        method: 'rk45',
        rk4_step_s: 0.1,
      },
    },
    launch: {
      latitude_deg: 31.251808,
      longitude_deg: 131.078999,
      altitude_m: 267,
      velocity_ned_mps: [0, 0, 0],
      datetime_utc: {
        year: 2016,
        month: 1,
        day: 1,
        hour: 12,
        minute: 0,
        second: 0,
      },
    },
    stages: [stage1, stage2, stage3],
    aerodynamics: {
      body_diameter_m: 0.52,
      cn_constant: 0.2,
      cn_multiplier: 1,
      cn_profile: [],
      ca_constant: 0.5,
      ca_multiplier: 1,
      ca_profile: [],
      ballistic_coefficient: 100,
    },
    attitude: {
      elevation_deg: 82,
      azimuth_deg: 99,
      pitch_offset_deg: 0,
      yaw_offset_deg: 0,
      roll_offset_deg: 0,
      gyro_bias_deg_h: [0, 0, 0],
      profile: [
        { time: 0, azimuth_deg: 99, elevation_deg: 82 },
        { time: 31.7, azimuth_deg: 99, elevation_deg: 77 },
        { time: 31.8, azimuth_deg: 99, elevation_deg: 77 },
        { time: 106, azimuth_deg: 99, elevation_deg: 77 },
        { time: 1000, azimuth_deg: 99, elevation_deg: 77 },
      ],
    },
    wind: {
      speed_mps: 0,
      direction_deg: 0,
      profile: [],
    },
  }
}

function createFalcon9ISSPreset(): ClientConfig {
  // Rough public figures. mass_initial is each stage's own fuelled mass;
  // stage times are measured from the start of that stage.
  const stage1 = cloneStage({
    ...createDefaultStage(),
    power_mode: 2,
    free_mode: 0,
    mass_initial_kg: 433000,
    mass_dry_kg: 24000,
    burn_start_s: 0,
    burn_end_s: 162,
    forced_cutoff_s: 162,
    separation_time_s: 165,
    throat_diameter_m: 0.75,
    nozzle_expansion_ratio: 16,
    nozzle_exit_pressure_pa: 60000,
    thrust_constant: 7700000,
    isp_constant: 311,
  })

  const stage2 = cloneStage({
    ...createDefaultStage(),
    power_mode: 2,
    free_mode: 1,
    // 111.5 t fuelled second stage + ~15 t payload
    mass_initial_kg: 126500,
    mass_dry_kg: 4000,
    burn_start_s: 3,
    burn_end_s: 383,
    forced_cutoff_s: 383,
    separation_time_s: 1000000,
    throat_diameter_m: 0.92,
    nozzle_expansion_ratio: 165,
    nozzle_exit_pressure_pa: 1000,
    thrust_constant: 934000,
    isp_constant: 348,
  })

  return {
    name: 'Falcon 9 class LEO',
    simulation: {
      duration_s: 7000,
      output_step_s: 2,
      air_density_percent: 0,
      integrator: {
        method: 'rk45',
        rk4_step_s: 0.5,
      },
    },
    launch: {
      latitude_deg: 28.5,
      longitude_deg: -80.6,
      altitude_m: 15,
      velocity_ned_mps: [0, 0, 0],
      datetime_utc: {
        year: 2024,
        month: 3,
        day: 15,
        hour: 19,
        minute: 30,
        second: 0,
      },
    },
    stages: [stage1, stage2],
    aerodynamics: {
      body_diameter_m: 3.7,
      cn_constant: 0.3,
      cn_multiplier: 1,
      cn_profile: [],
      ca_constant: 0.28,
      ca_multiplier: 1,
      ca_profile: [],
      ballistic_coefficient: 350,
    },
    attitude: {
      elevation_deg: 90,
      azimuth_deg: 51.6,
      pitch_offset_deg: 0,
      yaw_offset_deg: 0,
      roll_offset_deg: 0,
      gyro_bias_deg_h: [0, 0, 0],
      profile: [
        { time: 0, azimuth_deg: 51.6, elevation_deg: 90 },
        { time: 10, azimuth_deg: 51.6, elevation_deg: 88 },
        { time: 30, azimuth_deg: 52, elevation_deg: 80 },
        { time: 60, azimuth_deg: 53, elevation_deg: 70 },
        { time: 90, azimuth_deg: 54, elevation_deg: 60 },
        { time: 120, azimuth_deg: 55, elevation_deg: 50 },
        { time: 150, azimuth_deg: 56, elevation_deg: 40 },
        { time: 162, azimuth_deg: 57, elevation_deg: 35 },
        { time: 200, azimuth_deg: 58, elevation_deg: 25 },
        { time: 300, azimuth_deg: 60, elevation_deg: 10 },
        { time: 400, azimuth_deg: 62, elevation_deg: 0 },
        { time: 500, azimuth_deg: 64, elevation_deg: -5 },
        { time: 545, azimuth_deg: 65, elevation_deg: -8 },
      ],
    },
    wind: {
      speed_mps: 5,
      direction_deg: 270,
      profile: [],
    },
  }
}

export interface PresetOption {
  id: string
  label: string
  /** What kind of vehicle / flight this is */
  kind: string
  site: string
  description: string
  create: () => ClientConfig
}

export const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'sample',
    label: 'MOMO',
    kind: '単段の観測ロケット',
    site: '北海道 大樹町',
    description: '液体1段・推力16.5 kN。宇宙空間（高度100 km）に届いて海上に落下する弾道飛行。',
    create: () => createDefaultConfig(),
  },
  {
    id: 'orbital',
    label: 'SS-520',
    kind: '3段式の固体ロケット',
    site: '鹿児島 内之浦',
    description: '固体3段。姿勢を一定に保つ設定のため軌道には乗らず、高度約750 kmまで上がる弾道飛行。',
    create: () => createSS520Preset(),
  },
  {
    id: 'hopper',
    label: 'Falcon 9 級',
    kind: '2段式の軌道投入ロケット',
    site: 'フロリダ ケープカナベラル',
    description: '液体2段・ペイロード約15 t（2段質量に含む）。簡易な姿勢プログラムで楕円の低軌道に投入し、約2時間を計算。',
    create: () => createFalcon9ISSPreset(),
  },
]
