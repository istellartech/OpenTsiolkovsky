import type { ClientConfig } from '../lib/simulation'
import { createDefaultStage } from '../config/defaults'
import { POWER_MODE_OPTIONS, FREE_MODE_OPTIONS } from '../config/defaults'

export interface ValidationIssue {
  field: string
  message: string
}

export const VALIDATION_ERROR_MESSAGE = '入力値に問題があります。リストを確認して修正してください。'

export function numberFromInput(value: string): number {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateConfig(config: ClientConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { simulation, launch, aerodynamics, attitude, wind } = config
  const stageList = config.stages && config.stages.length > 0 ? config.stages : [createDefaultStage()]

  if (stageList.length === 0) {
    issues.push({ field: 'stages', message: '少なくとも1段は設定してください。' })
    return issues
  }

  const stage = stageList[0]

  const push = (field: string, message: string) => {
    issues.push({ field, message })
  }

  // Simulation validation
  if (!isFiniteNumber(simulation.duration_s) || simulation.duration_s <= 0) {
    push('simulation.duration_s', 'シミュレーション時間は正の値にしてください。')
  } else if (simulation.duration_s > 24 * 3600) {
    push('simulation.duration_s', 'シミュレーション時間は24時間以内で指定してください。')
  }

  if (!isFiniteNumber(simulation.output_step_s) || simulation.output_step_s <= 0) {
    push('simulation.output_step_s', '出力間隔は正の値にしてください。')
  } else if (simulation.output_step_s > simulation.duration_s) {
    push('simulation.output_step_s', '出力間隔はシミュレーション時間以下にしてください。')
  }

  if (!isFiniteNumber(simulation.air_density_percent) ||
      simulation.air_density_percent < -100 ||
      simulation.air_density_percent > 100) {
    push('simulation.air_density_percent', '空気密度変動は-100〜100%の範囲で指定してください。')
  }

  // Launch validation
  if (!isFiniteNumber(launch.latitude_deg) || launch.latitude_deg < -90 || launch.latitude_deg > 90) {
    push('launch.latitude_deg', '緯度は-90〜90度の範囲で指定してください。')
  }

  if (!isFiniteNumber(launch.longitude_deg) || launch.longitude_deg < -180 || launch.longitude_deg > 180) {
    push('launch.longitude_deg', '経度は-180〜180度の範囲で指定してください。')
  }

  if (!isFiniteNumber(launch.altitude_m) || launch.altitude_m < -500 || launch.altitude_m > 100000) {
    push('launch.altitude_m', '発射高度は-500〜100000 mの範囲で指定してください。')
  }

  const velocityMag = Math.hypot(...launch.velocity_ned_mps)
  if (!isFiniteNumber(velocityMag)) {
    push('launch.velocity_ned_mps', '初期速度ベクトルに数値以外が含まれています。')
  } else if (velocityMag > 5000) {
    push('launch.velocity_ned_mps', '初期速度は5,000 m/s以下にしてください。')
  }

  const { year, month, day, hour, minute, second } = launch.datetime_utc
  const launchDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const isValidDate =
    launchDate.getUTCFullYear() === year &&
    launchDate.getUTCMonth() === month - 1 &&
    launchDate.getUTCDate() === day &&
    launchDate.getUTCHours() === hour &&
    launchDate.getUTCMinutes() === minute &&
    launchDate.getUTCSeconds() === second

  if (!isValidDate) {
    push('launch.datetime_utc', '発射日時が不正です。存在する日時を指定してください。')
  }

  // First stage validation
  validateStage(stage, push, '')

  // Additional stages validation
  stageList.slice(1).forEach((extraStage, idx) => {
    const stageLabel = `stage[${idx + 2}]`
    validateStage(extraStage, push, stageLabel, idx + 2)
  })

  // Aerodynamics validation
  validateAerodynamics(aerodynamics, push)

  // Attitude validation
  validateAttitude(attitude, push)

  // Wind validation
  validateWind(wind, push)

  return issues
}

function validateStage(
  stage: any,
  push: (field: string, message: string) => void,
  prefix: string,
  stageNum?: number
) {
  const fieldPrefix = prefix ? `${prefix}.` : 'stage.'
  const stageLabel = stageNum ? `第${stageNum}段の` : ''

  if (!isFiniteNumber(stage.mass_initial_kg) || stage.mass_initial_kg <= 0) {
    push(`${fieldPrefix}mass_initial_kg`, `${stageLabel}初期質量は正の値にしてください。`)
  }

  if (!isFiniteNumber(stage.burn_start_s) || stage.burn_start_s < 0) {
    push(`${fieldPrefix}burn_start_s`, `${stageLabel}燃焼開始時刻は0秒以上にしてください。`)
  }

  if (!isFiniteNumber(stage.burn_end_s) || stage.burn_end_s <= stage.burn_start_s) {
    push(`${fieldPrefix}burn_end_s`, `${stageLabel}燃焼終了時刻は燃焼開始より大きい値にしてください。`)
  }

  if (!isFiniteNumber(stage.forced_cutoff_s) || stage.forced_cutoff_s < stage.burn_end_s) {
    push(`${fieldPrefix}forced_cutoff_s`, `${stageLabel}強制カットオフは燃焼終了時刻以降にしてください。`)
  }

  if (!isFiniteNumber(stage.separation_time_s) || stage.separation_time_s < stage.burn_end_s) {
    push(`${fieldPrefix}separation_time_s`, `${stageLabel}分離時刻は燃焼終了時刻以上にしてください。`)
  }

  if (!isFiniteNumber(stage.throat_diameter_m) || stage.throat_diameter_m <= 0) {
    push(`${fieldPrefix}throat_diameter_m`, `${stageLabel}スロート径は正の値にしてください。`)
  }

  if (!isFiniteNumber(stage.nozzle_expansion_ratio) || stage.nozzle_expansion_ratio < 1) {
    push(`${fieldPrefix}nozzle_expansion_ratio`, `${stageLabel}ノズル膨張比は1以上にしてください。`)
  }

  if (!isFiniteNumber(stage.nozzle_exit_pressure_pa) || stage.nozzle_exit_pressure_pa < 0) {
    push(`${fieldPrefix}nozzle_exit_pressure_pa`, `${stageLabel}ノズル出口圧力は0以上にしてください。`)
  }

  if (!isFiniteNumber(stage.thrust_constant) || stage.thrust_constant < 0) {
    push(`${fieldPrefix}thrust_constant`, `${stageLabel}推力定数は0以上にしてください。`)
  }

  if (!isFiniteNumber(stage.thrust_multiplier) || stage.thrust_multiplier <= 0) {
    push(`${fieldPrefix}thrust_multiplier`, `${stageLabel}推力倍率は正の値にしてください。`)
  }

  if (!isFiniteNumber(stage.isp_constant) || stage.isp_constant <= 0) {
    push(`${fieldPrefix}isp_constant`, `${stageLabel}比推力定数は正の値にしてください。`)
  }

  if (!isFiniteNumber(stage.isp_multiplier) || stage.isp_multiplier <= 0) {
    push(`${fieldPrefix}isp_multiplier`, `${stageLabel}比推力倍率は正の値にしてください。`)
  }

  if (!POWER_MODE_OPTIONS.some((option) => option.value === stage.power_mode)) {
    push(`${fieldPrefix}power_mode`, `${stageLabel}Power flight mode は 0〜3 のプリセットから選択してください。`)
  }

  if (!FREE_MODE_OPTIONS.some((option) => option.value === stage.free_mode)) {
    push(`${fieldPrefix}free_mode`, `${stageLabel}Free flight mode は 0〜2 のプリセットから選択してください。`)
  }

  // Profile validations
  if (stage.thrust_profile?.length > 0) {
    validateTimeSeriesProfile(stage.thrust_profile, push, `${fieldPrefix}thrust_profile`, '推力プロファイル', {
      timeMin: 0,
      valueMin: 0,
      valueName: '推力'
    })
  }

  if (stage.isp_profile?.length > 0) {
    validateTimeSeriesProfile(stage.isp_profile, push, `${fieldPrefix}isp_profile`, 'Ispプロファイル', {
      timeMin: 0,
      valueMin: 0.01,
      valueName: 'Isp',
      valuePositive: true
    })
  }
}

function validateAerodynamics(aerodynamics: any, push: (field: string, message: string) => void) {
  if (!isFiniteNumber(aerodynamics.body_diameter_m) || aerodynamics.body_diameter_m <= 0) {
    push('aerodynamics.body_diameter_m', '機体径は正の値にしてください。')
  }

  if (!isFiniteNumber(aerodynamics.ballistic_coefficient) || aerodynamics.ballistic_coefficient <= 0) {
    push('aerodynamics.ballistic_coefficient', '弾道係数は正の値にしてください。')
  }

  if (!isFiniteNumber(aerodynamics.cn_constant)) {
    push('aerodynamics.cn_constant', 'CN定数は数値で指定してください。')
  }

  if (!isFiniteNumber(aerodynamics.cn_multiplier) || aerodynamics.cn_multiplier <= 0) {
    push('aerodynamics.cn_multiplier', 'CN倍率は正の値にしてください。')
  }

  if (aerodynamics.cn_profile?.length > 0) {
    validateMachProfile(aerodynamics.cn_profile, push, 'aerodynamics.cn_profile', 'CN')
  }

  if (!isFiniteNumber(aerodynamics.ca_constant) || aerodynamics.ca_constant < 0) {
    push('aerodynamics.ca_constant', 'CA定数は0以上で指定してください。')
  }

  if (!isFiniteNumber(aerodynamics.ca_multiplier) || aerodynamics.ca_multiplier <= 0) {
    push('aerodynamics.ca_multiplier', 'CA倍率は正の値にしてください。')
  }

  if (aerodynamics.ca_profile?.length > 0) {
    validateMachProfile(aerodynamics.ca_profile, push, 'aerodynamics.ca_profile', 'CA', { valueMin: 0 })
  }
}

function validateAttitude(attitude: any, push: (field: string, message: string) => void) {
  if (!isFiniteNumber(attitude.azimuth_deg) || attitude.azimuth_deg < 0 || attitude.azimuth_deg >= 360) {
    push('attitude.azimuth_deg', '方位角は0〜360度未満で指定してください。')
  }

  if (!isFiniteNumber(attitude.elevation_deg) || attitude.elevation_deg < 0 || attitude.elevation_deg > 90) {
    push('attitude.elevation_deg', '仰角は0〜90度の範囲で指定してください。')
  }

  if (Math.abs(attitude.pitch_offset_deg) > 45) {
    push('attitude.pitch_offset_deg', 'ピッチオフセットは±45度以内にしてください。')
  }
  if (Math.abs(attitude.yaw_offset_deg) > 45) {
    push('attitude.yaw_offset_deg', 'ヨーオフセットは±45度以内にしてください。')
  }
  if (Math.abs(attitude.roll_offset_deg) > 180) {
    push('attitude.roll_offset_deg', 'ロールオフセットは±180度以内にしてください。')
  }

  const gyroMax = 100
  attitude.gyro_bias_deg_h?.forEach((bias: any, idx: number) => {
    if (!isFiniteNumber(bias) || Math.abs(bias) > gyroMax) {
      push(`attitude.gyro_bias_deg_h[${idx}]`, `ジャイロバイアスは±${gyroMax} deg/h以内にしてください。`)
    }
  })

  if (attitude.profile?.length > 0) {
    let prevTime = -Infinity
    for (const sample of attitude.profile) {
      if (!isFiniteNumber(sample.time) || sample.time < 0) {
        push('attitude.profile', '姿勢プロファイルの時刻は0以上で指定してください。')
        break
      }
      if (sample.time <= prevTime) {
        push('attitude.profile', '姿勢プロファイルは時刻昇順に並べてください。')
        break
      }
      if (!isFiniteNumber(sample.azimuth_deg) || sample.azimuth_deg < 0 || sample.azimuth_deg >= 360) {
        push('attitude.profile', '姿勢プロファイルの方位角は0〜360度未満で指定してください。')
        break
      }
      if (!isFiniteNumber(sample.elevation_deg) || sample.elevation_deg < 0 || sample.elevation_deg > 90) {
        push('attitude.profile', '姿勢プロファイルの仰角は0〜90度で指定してください。')
        break
      }
      prevTime = sample.time
    }
  }
}

function validateWind(wind: any, push: (field: string, message: string) => void) {
  if (!isFiniteNumber(wind.speed_mps) || wind.speed_mps < 0) {
    push('wind.speed_mps', '風速は0以上で指定してください。')
  }

  if (!isFiniteNumber(wind.direction_deg) || wind.direction_deg < 0 || wind.direction_deg >= 360) {
    push('wind.direction_deg', '風向は0〜360度未満で指定してください。')
  }

  if (wind.profile?.length > 0) {
    let prevAlt = -Infinity
    for (const sample of wind.profile) {
      if (!isFiniteNumber(sample.altitude_m) || sample.altitude_m < 0) {
        push('wind.profile', '風プロファイルの高度は0以上で指定してください。')
        break
      }
      if (sample.altitude_m <= prevAlt) {
        push('wind.profile', '風プロファイルの高度は昇順に並べてください。')
        break
      }
      if (!isFiniteNumber(sample.speed_mps) || sample.speed_mps < 0) {
        push('wind.profile', '風プロファイルの風速は0以上で指定してください。')
        break
      }
      if (!isFiniteNumber(sample.direction_deg) || sample.direction_deg < 0 || sample.direction_deg >= 360) {
        push('wind.profile', '風プロファイルの風向は0〜360度未満で指定してください。')
        break
      }
      prevAlt = sample.altitude_m
    }
  }
}

function validateTimeSeriesProfile(
  profile: any[],
  push: (field: string, message: string) => void,
  fieldName: string,
  profileName: string,
  options: {
    timeMin: number
    valueMin: number
    valueName: string
    valuePositive?: boolean
  }
) {
  let prevTime = -Infinity
  for (const sample of profile) {
    if (!isFiniteNumber(sample.time) || sample.time < options.timeMin) {
      push(fieldName, `${profileName}の時刻は${options.timeMin}以上の数値で指定してください。`)
      break
    }
    if (sample.time <= prevTime) {
      push(fieldName, `${profileName}の時刻は昇順に並べてください。`)
      break
    }
    if (options.valuePositive) {
      if (!isFiniteNumber(sample.value) || sample.value <= options.valueMin) {
        push(fieldName, `${profileName}の${options.valueName}は正の数値で指定してください。`)
        break
      }
    } else {
      if (!isFiniteNumber(sample.value) || sample.value < options.valueMin) {
        push(fieldName, `${profileName}の${options.valueName}は${options.valueMin}以上で指定してください。`)
        break
      }
    }
    prevTime = sample.time
  }
}

function validateMachProfile(
  profile: any[],
  push: (field: string, message: string) => void,
  fieldName: string,
  profileName: string,
  options: { valueMin?: number } = {}
) {
  let prevMach = -Infinity
  for (const sample of profile) {
    if (!isFiniteNumber(sample.mach) || sample.mach < 0) {
      push(fieldName, `${profileName}プロファイルのMachは0以上で指定してください。`)
      break
    }
    if (sample.mach <= prevMach) {
      push(fieldName, `${profileName}プロファイルのMachは昇順に並べてください。`)
      break
    }
    const minValue = options.valueMin ?? -Infinity
    if (!isFiniteNumber(sample.value) || sample.value < minValue) {
      const message = minValue > -Infinity
        ? `${profileName}プロファイルの値は${minValue}以上で指定してください。`
        : `${profileName}プロファイルの値は数値で指定してください。`
      push(fieldName, message)
      break
    }
    prevMach = sample.mach
  }
}