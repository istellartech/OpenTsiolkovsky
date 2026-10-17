import type { ClientConfig, ClientMachSample, ClientStageConfig, ClientTimeSample } from './simulation'
import { FREE_MODE_OPTIONS, POWER_MODE_OPTIONS, createDefaultStage } from '../config/defaults'
import { tr } from './i18n'

export interface ValidationIssue {
  field: string
  message: string
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v)
const hasKeys = (o: Json, keys: string[]) => keys.every((k) => k in o)

/** Shape check for a config saved from this app (values are validated separately). */
export function isValidClientConfig(obj: unknown): obj is ClientConfig {
  if (!isObject(obj)) return false
  const { simulation, launch, aerodynamics, attitude, wind } = obj
  if (![simulation, launch, aerodynamics, attitude, wind].every(isObject)) return false
  const sim = simulation as Json
  const l = launch as Json
  return (
    hasKeys(sim, ['duration_s', 'output_step_s', 'air_density_percent']) &&
    hasKeys(l, ['latitude_deg', 'longitude_deg', 'altitude_m']) &&
    Array.isArray(l.velocity_ned_mps) &&
    isObject(l.datetime_utc) &&
    hasKeys(l.datetime_utc, ['year', 'month', 'day', 'hour', 'minute', 'second'])
  )
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateConfig(config: ClientConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  // Add defensive null checks
  if (!config) {
    issues.push({ field: 'config', message: tr('設定オブジェクトが見つかりません。', 'Configuration object not found.') })
    return issues
  }

  const simulation = config.simulation || {}
  const launch = config.launch || {}
  const aerodynamics = config.aerodynamics || {}
  const attitude = config.attitude || {}
  const wind = config.wind || {}
  const stageList = config.stages && config.stages.length > 0 ? config.stages : [createDefaultStage()]

  if (stageList.length === 0) {
    issues.push({ field: 'stages', message: tr('少なくとも1段は設定してください。', 'Configure at least one stage.') })
    return issues
  }

  const stage = stageList[0]

  const push = (field: string, message: string) => {
    issues.push({ field, message })
  }

  // Simulation validation
  if (!isFiniteNumber(simulation.duration_s) || simulation.duration_s <= 0) {
    push('simulation.duration_s', tr('シミュレーション時間は正の値にしてください。', 'Simulation time must be positive.'))
  } else if (simulation.duration_s > 24 * 3600) {
    push('simulation.duration_s', tr('シミュレーション時間は24時間以内で指定してください。', 'Simulation time must be 24 hours or less.'))
  }

  if (!isFiniteNumber(simulation.output_step_s) || simulation.output_step_s <= 0) {
    push('simulation.output_step_s', tr('出力間隔は正の値にしてください。', 'Output interval must be positive.'))
  } else if (simulation.output_step_s > simulation.duration_s) {
    push('simulation.output_step_s', tr('出力間隔はシミュレーション時間以下にしてください。', 'Output interval must not exceed the simulation time.'))
  }

  if (!isFiniteNumber(simulation.air_density_percent) ||
      simulation.air_density_percent < -100 ||
      simulation.air_density_percent > 100) {
    push('simulation.air_density_percent', tr('空気密度変動は-100〜100%の範囲で指定してください。', 'Air density variation must be between -100 and 100%.'))
  }

  const integrator = simulation.integrator || { method: 'rk4', rk4_step_s: simulation.output_step_s ? simulation.output_step_s / 2 : undefined }
  if (integrator.method !== 'rk4' && integrator.method !== 'rk45') {
    push('simulation.integrator.method', tr('積分器はRK4またはRK45を選択してください。', 'Integrator must be RK4 or RK45.'))
  }
  if (integrator.method === 'rk4') {
    if (!isFiniteNumber(integrator.rk4_step_s) || integrator.rk4_step_s <= 0) {
      push('simulation.integrator.rk4_step_s', tr('RK4の刻み幅は正の値にしてください。', 'RK4 step size must be positive.'))
    } else if (isFiniteNumber(simulation.duration_s) && integrator.rk4_step_s > simulation.duration_s) {
      push('simulation.integrator.rk4_step_s', tr('RK4の刻み幅はシミュレーション時間以下にしてください。', 'RK4 step size must not exceed the simulation time.'))
    }
  }

  // Launch validation
  if (!isFiniteNumber(launch.latitude_deg) || launch.latitude_deg < -90 || launch.latitude_deg > 90) {
    push('launch.latitude_deg', tr('緯度は-90〜90度の範囲で指定してください。', 'Latitude must be between -90 and 90°.'))
  }

  if (!isFiniteNumber(launch.longitude_deg) || launch.longitude_deg < -180 || launch.longitude_deg > 180) {
    push('launch.longitude_deg', tr('経度は-180〜180度の範囲で指定してください。', 'Longitude must be between -180 and 180°.'))
  }

  if (!isFiniteNumber(launch.altitude_m) || launch.altitude_m < -500 || launch.altitude_m > 100000) {
    push('launch.altitude_m', tr('発射高度は-500〜100000 mの範囲で指定してください。', 'Launch altitude must be between -500 and 100,000 m.'))
  }

  const velocityMag = Math.hypot(...launch.velocity_ned_mps)
  if (!isFiniteNumber(velocityMag)) {
    push('launch.velocity_ned_mps', tr('初期速度ベクトルに数値以外が含まれています。', 'Initial velocity vector contains non-numeric values.'))
  } else if (velocityMag > 5000) {
    push('launch.velocity_ned_mps', tr('初期速度は5,000 m/s以下にしてください。', 'Initial velocity must be 5,000 m/s or less.'))
  }

  // Safe access to datetime_utc with fallback
  const datetimeUtc = launch.datetime_utc || {}
  const { year = 2024, month = 1, day = 1, hour = 0, minute = 0, second = 0 } = datetimeUtc
  const launchDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  const isValidDate =
    launchDate.getUTCFullYear() === year &&
    launchDate.getUTCMonth() === month - 1 &&
    launchDate.getUTCDate() === day &&
    launchDate.getUTCHours() === hour &&
    launchDate.getUTCMinutes() === minute &&
    launchDate.getUTCSeconds() === second

  if (!isValidDate) {
    push('launch.datetime_utc', tr('発射日時が不正です。存在する日時を指定してください。', 'Invalid launch date/time. Enter a date and time that exists.'))
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
  stage: ClientStageConfig,
  push: (field: string, message: string) => void,
  prefix: string,
  stageNum?: number
) {
  const fieldPrefix = prefix ? `${prefix}.` : 'stage.'
  // Prefix each message with the stage number for stages after the first.
  const msg = (ja: string, en: string) =>
    stageNum ? tr(`第${stageNum}段の${ja}`, `Stage ${stageNum}: ${en}`) : tr(ja, en)

  if (!isFiniteNumber(stage.mass_initial_kg) || stage.mass_initial_kg <= 0) {
    push(`${fieldPrefix}mass_initial_kg`, msg('初期質量は正の値にしてください。', 'Initial mass must be positive.'))
  }

  if (!isFiniteNumber(stage.burn_start_s) || stage.burn_start_s < 0) {
    push(`${fieldPrefix}burn_start_s`, msg('燃焼開始時刻は0秒以上にしてください。', 'Ignition time must be 0 s or later.'))
  }

  if (!isFiniteNumber(stage.burn_end_s) || stage.burn_end_s <= stage.burn_start_s) {
    push(`${fieldPrefix}burn_end_s`, msg('燃焼終了時刻は燃焼開始より大きい値にしてください。', 'Burnout time must be after ignition.'))
  }

  // A cutoff or separation before the nominal burn end simply ends the burn
  // early (the solver clamps it); only times before ignition are invalid.
  if (!isFiniteNumber(stage.forced_cutoff_s) || stage.forced_cutoff_s <= stage.burn_start_s) {
    push(`${fieldPrefix}forced_cutoff_s`, msg('強制停止は燃焼開始より後にしてください。', 'Forced cutoff must be after ignition.'))
  }

  if (!isFiniteNumber(stage.separation_time_s) || stage.separation_time_s <= stage.burn_start_s) {
    push(`${fieldPrefix}separation_time_s`, msg('分離時刻は燃焼開始より後にしてください。', 'Separation time must be after ignition.'))
  }

  if (!isFiniteNumber(stage.throat_diameter_m) || stage.throat_diameter_m <= 0) {
    push(`${fieldPrefix}throat_diameter_m`, msg('スロート径は正の値にしてください。', 'Throat diameter must be positive.'))
  }

  if (!isFiniteNumber(stage.nozzle_expansion_ratio) || stage.nozzle_expansion_ratio < 1) {
    push(`${fieldPrefix}nozzle_expansion_ratio`, msg('ノズル膨張比は1以上にしてください。', 'Nozzle expansion ratio must be at least 1.'))
  }

  if (!isFiniteNumber(stage.nozzle_exit_pressure_pa) || stage.nozzle_exit_pressure_pa < 0) {
    push(`${fieldPrefix}nozzle_exit_pressure_pa`, msg('ノズル出口圧力は0以上にしてください。', 'Nozzle exit pressure must be 0 or greater.'))
  }

  if (!isFiniteNumber(stage.thrust_constant) || stage.thrust_constant < 0) {
    push(`${fieldPrefix}thrust_constant`, msg('推力定数は0以上にしてください。', 'Constant thrust must be 0 or greater.'))
  }

  if (!isFiniteNumber(stage.thrust_multiplier) || stage.thrust_multiplier <= 0) {
    push(`${fieldPrefix}thrust_multiplier`, msg('推力倍率は正の値にしてください。', 'Thrust multiplier must be positive.'))
  }

  if (!isFiniteNumber(stage.isp_constant) || stage.isp_constant <= 0) {
    push(`${fieldPrefix}isp_constant`, msg('比推力定数は正の値にしてください。', 'Constant Isp must be positive.'))
  }

  if (!isFiniteNumber(stage.isp_multiplier) || stage.isp_multiplier <= 0) {
    push(`${fieldPrefix}isp_multiplier`, msg('比推力倍率は正の値にしてください。', 'Isp multiplier must be positive.'))
  }

  if (!POWER_MODE_OPTIONS.some((option) => option.value === stage.power_mode)) {
    push(`${fieldPrefix}power_mode`, msg('Power flight mode は 0〜3 のプリセットから選択してください。', 'Power flight mode must be one of the presets 0–3.'))
  }

  if (!FREE_MODE_OPTIONS.some((option) => option.value === stage.free_mode)) {
    push(`${fieldPrefix}free_mode`, msg('Free flight mode は 0〜2 のプリセットから選択してください。', 'Free flight mode must be one of the presets 0–2.'))
  }

  // Profile validations
  if (stage.thrust_profile?.length) {
    validateTimeSeriesProfile(stage.thrust_profile, push, `${fieldPrefix}thrust_profile`, tr('推力プロファイル', 'Thrust table'), {
      timeMin: 0,
      valueMin: 0,
      valueName: tr('推力', 'thrust')
    })
  }

  if (stage.isp_profile?.length) {
    validateTimeSeriesProfile(stage.isp_profile, push, `${fieldPrefix}isp_profile`, tr('Ispプロファイル', 'Isp table'), {
      timeMin: 0,
      valueMin: 0.01,
      valueName: 'Isp',
      valuePositive: true
    })
  }
}

function validateAerodynamics(aerodynamics: ClientConfig['aerodynamics'], push: (field: string, message: string) => void) {
  if (!isFiniteNumber(aerodynamics.body_diameter_m) || aerodynamics.body_diameter_m <= 0) {
    push('aerodynamics.body_diameter_m', tr('機体径は正の値にしてください。', 'Body diameter must be positive.'))
  }

  if (!isFiniteNumber(aerodynamics.ballistic_coefficient) || aerodynamics.ballistic_coefficient <= 0) {
    push('aerodynamics.ballistic_coefficient', tr('弾道係数は正の値にしてください。', 'Ballistic coefficient must be positive.'))
  }

  if (!isFiniteNumber(aerodynamics.cn_constant)) {
    push('aerodynamics.cn_constant', tr('CN定数は数値で指定してください。', 'Constant CN must be a number.'))
  }

  if (!isFiniteNumber(aerodynamics.cn_multiplier) || aerodynamics.cn_multiplier <= 0) {
    push('aerodynamics.cn_multiplier', tr('CN倍率は正の値にしてください。', 'CN multiplier must be positive.'))
  }

  if (aerodynamics.cn_profile?.length > 0) {
    validateMachProfile(aerodynamics.cn_profile, push, 'aerodynamics.cn_profile', 'CN')
  }

  if (!isFiniteNumber(aerodynamics.ca_constant) || aerodynamics.ca_constant < 0) {
    push('aerodynamics.ca_constant', tr('CA定数は0以上で指定してください。', 'Constant CA must be 0 or greater.'))
  }

  if (!isFiniteNumber(aerodynamics.ca_multiplier) || aerodynamics.ca_multiplier <= 0) {
    push('aerodynamics.ca_multiplier', tr('CA倍率は正の値にしてください。', 'CA multiplier must be positive.'))
  }

  if (aerodynamics.ca_profile?.length > 0) {
    validateMachProfile(aerodynamics.ca_profile, push, 'aerodynamics.ca_profile', 'CA', { valueMin: 0 })
  }
}

function validateAttitude(attitude: ClientConfig['attitude'], push: (field: string, message: string) => void) {
  if (!isFiniteNumber(attitude.azimuth_deg) || attitude.azimuth_deg < 0 || attitude.azimuth_deg >= 360) {
    push('attitude.azimuth_deg', tr('方位角は0〜360度未満で指定してください。', 'Azimuth must be at least 0° and less than 360°.'))
  }

  if (!isFiniteNumber(attitude.elevation_deg) || attitude.elevation_deg < 0 || attitude.elevation_deg > 90) {
    push('attitude.elevation_deg', tr('仰角は0〜90度の範囲で指定してください。', 'Elevation must be between 0 and 90°.'))
  }

  if (Math.abs(attitude.pitch_offset_deg) > 45) {
    push('attitude.pitch_offset_deg', tr('ピッチオフセットは±45度以内にしてください。', 'Pitch offset must be within ±45°.'))
  }
  if (Math.abs(attitude.yaw_offset_deg) > 45) {
    push('attitude.yaw_offset_deg', tr('ヨーオフセットは±45度以内にしてください。', 'Yaw offset must be within ±45°.'))
  }
  if (Math.abs(attitude.roll_offset_deg) > 180) {
    push('attitude.roll_offset_deg', tr('ロールオフセットは±180度以内にしてください。', 'Roll offset must be within ±180°.'))
  }

  const gyroMax = 100
  attitude.gyro_bias_deg_h?.forEach((bias, idx) => {
    if (!isFiniteNumber(bias) || Math.abs(bias) > gyroMax) {
      push(`attitude.gyro_bias_deg_h[${idx}]`, tr(`ジャイロバイアスは±${gyroMax} deg/h以内にしてください。`, `Gyro bias must be within ±${gyroMax} deg/h.`))
    }
  })

  if (attitude.profile?.length > 0) {
    let prevTime = -Infinity
    for (const sample of attitude.profile) {
      if (!isFiniteNumber(sample.time) || sample.time < 0) {
        push('attitude.profile', tr('姿勢プロファイルの時刻は0以上で指定してください。', 'Attitude table times must be 0 or greater.'))
        break
      }
      if (sample.time <= prevTime) {
        push('attitude.profile', tr('姿勢プロファイルは時刻昇順に並べてください。', 'Attitude table must be sorted by time in ascending order.'))
        break
      }
      if (!isFiniteNumber(sample.azimuth_deg) || sample.azimuth_deg < 0 || sample.azimuth_deg >= 360) {
        push('attitude.profile', tr('姿勢プロファイルの方位角は0〜360度未満で指定してください。', 'Attitude table azimuths must be at least 0° and less than 360°.'))
        break
      }
      if (!isFiniteNumber(sample.elevation_deg) || sample.elevation_deg < -90 || sample.elevation_deg > 90) {
        push('attitude.profile', tr('姿勢プロファイルの仰角は-90〜90度で指定してください。', 'Attitude table elevations must be between -90 and 90°.'))
        break
      }
      prevTime = sample.time
    }
  }
}

function validateWind(wind: ClientConfig['wind'], push: (field: string, message: string) => void) {
  if (!isFiniteNumber(wind.speed_mps) || wind.speed_mps < 0) {
    push('wind.speed_mps', tr('風速は0以上で指定してください。', 'Wind speed must be 0 or greater.'))
  }

  if (!isFiniteNumber(wind.direction_deg) || wind.direction_deg < 0 || wind.direction_deg >= 360) {
    push('wind.direction_deg', tr('風向は0〜360度未満で指定してください。', 'Wind direction must be at least 0° and less than 360°.'))
  }

  if (wind.profile?.length > 0) {
    let prevAlt = -Infinity
    for (const sample of wind.profile) {
      if (!isFiniteNumber(sample.altitude_m) || sample.altitude_m < 0) {
        push('wind.profile', tr('風プロファイルの高度は0以上で指定してください。', 'Wind table altitudes must be 0 or greater.'))
        break
      }
      if (sample.altitude_m <= prevAlt) {
        push('wind.profile', tr('風プロファイルの高度は昇順に並べてください。', 'Wind table altitudes must be in ascending order.'))
        break
      }
      if (!isFiniteNumber(sample.speed_mps) || sample.speed_mps < 0) {
        push('wind.profile', tr('風プロファイルの風速は0以上で指定してください。', 'Wind table speeds must be 0 or greater.'))
        break
      }
      if (!isFiniteNumber(sample.direction_deg) || sample.direction_deg < 0 || sample.direction_deg >= 360) {
        push('wind.profile', tr('風プロファイルの風向は0〜360度未満で指定してください。', 'Wind table directions must be at least 0° and less than 360°.'))
        break
      }
      prevAlt = sample.altitude_m
    }
  }
}

function validateTimeSeriesProfile(
  profile: ClientTimeSample[],
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
      push(
        fieldName,
        tr(
          `${profileName}の時刻は${options.timeMin}以上の数値で指定してください。`,
          `${profileName} times must be numbers ≥ ${options.timeMin}.`,
        ),
      )
      break
    }
    if (sample.time <= prevTime) {
      push(fieldName, tr(`${profileName}の時刻は昇順に並べてください。`, `${profileName} times must be in ascending order.`))
      break
    }
    if (options.valuePositive) {
      if (!isFiniteNumber(sample.value) || sample.value <= options.valueMin) {
        push(
          fieldName,
          tr(
            `${profileName}の${options.valueName}は正の数値で指定してください。`,
            `${profileName} ${options.valueName} values must be positive numbers.`,
          ),
        )
        break
      }
    } else {
      if (!isFiniteNumber(sample.value) || sample.value < options.valueMin) {
        push(
          fieldName,
          tr(
            `${profileName}の${options.valueName}は${options.valueMin}以上で指定してください。`,
            `${profileName} ${options.valueName} values must be ≥ ${options.valueMin}.`,
          ),
        )
        break
      }
    }
    prevTime = sample.time
  }
}

function validateMachProfile(
  profile: ClientMachSample[],
  push: (field: string, message: string) => void,
  fieldName: string,
  profileName: string,
  options: { valueMin?: number } = {}
) {
  let prevMach = -Infinity
  for (const sample of profile) {
    if (!isFiniteNumber(sample.mach) || sample.mach < 0) {
      push(fieldName, tr(`${profileName}プロファイルのMachは0以上で指定してください。`, `${profileName} table Mach numbers must be 0 or greater.`))
      break
    }
    if (sample.mach <= prevMach) {
      push(fieldName, tr(`${profileName}プロファイルのMachは昇順に並べてください。`, `${profileName} table Mach numbers must be in ascending order.`))
      break
    }
    const minValue = options.valueMin ?? -Infinity
    if (!isFiniteNumber(sample.value) || sample.value < minValue) {
      const message = minValue > -Infinity
        ? tr(`${profileName}プロファイルの値は${minValue}以上で指定してください。`, `${profileName} table values must be ≥ ${minValue}.`)
        : tr(`${profileName}プロファイルの値は数値で指定してください。`, `${profileName} table values must be numbers.`)
      push(fieldName, message)
      break
    }
    prevMach = sample.mach
  }
}
