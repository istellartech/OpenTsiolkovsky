import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { runSimulation } from '../lib/simulation'
import type {
  ClientAttitudeSample,
  ClientConfig,
  ClientMachSample,
  ClientStageConfig,
  ClientTimeSample,
  ClientWindSample,
  SimulationState,
} from '../lib/types'

type Props = {
  onResult: (trajectory: SimulationState[]) => void
}

type Mode = 'api' | 'wasm'

type Column<T extends Record<string, number>> = {
  key: keyof T
  label: string
  step?: string
  min?: number
}

type TableProps<T extends Record<string, number>> = {
  title: string
  columns: Column<T>[]
  rows: T[]
  onChange: (rows: T[]) => void
  addLabel?: string
}

type ValidationIssue = {
  field: string
  message: string
}

const VALIDATION_ERROR_MESSAGE = '入力値に問題があります。リストを確認して修正してください。'

const POWER_MODE_OPTIONS = [
  { value: 0, label: '0: 3DoF（標準）' },
  { value: 1, label: '1: 3DoF（遅れ付き）' },
  { value: 2, label: '2: 6DoF' },
  { value: 3, label: '3: 6DoF（空力安定）' },
]

const FREE_MODE_OPTIONS = [
  { value: 0, label: '0: 空力安定' },
  { value: 1, label: '1: 3DoF 指定姿勢' },
  { value: 2, label: '2: 弾道飛行' },
]

const MAX_STAGE_COUNT = 3

function createDefaultStage(): ClientStageConfig {
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

function cloneStage(stage: ClientStageConfig): ClientStageConfig {
  return {
    ...stage,
    thrust_profile: stage.thrust_profile.map((sample) => ({ ...sample })),
    isp_profile: stage.isp_profile.map((sample) => ({ ...sample })),
  }
}

function snapshotStages(config: ClientConfig): ClientStageConfig[] {
  const stages = config.stages && config.stages.length > 0 ? config.stages : [config.stage]
  return stages.map((stage) => cloneStage(stage))
}

function numberFromInput(value: string): number {
  if (value.trim() === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateConfig(config: ClientConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const { simulation, launch, aerodynamics, attitude, wind } = config
  const stageList = config.stages && config.stages.length > 0 ? config.stages : [config.stage]
  if (stageList.length === 0) {
    issues.push({ field: 'stages', message: '少なくとも1段は設定してください。' })
    return issues
  }
  const stage = stageList[0] ?? config.stage

  const push = (field: string, message: string) => {
    issues.push({ field, message })
  }

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

  if (!isFiniteNumber(stage.mass_initial_kg) || stage.mass_initial_kg <= 0) {
    push('stage.mass_initial_kg', '初期質量は正の値にしてください。')
  }

  if (!isFiniteNumber(stage.burn_start_s) || stage.burn_start_s < 0) {
    push('stage.burn_start_s', '燃焼開始時刻は0秒以上にしてください。')
  }

  if (!isFiniteNumber(stage.burn_end_s) || stage.burn_end_s <= stage.burn_start_s) {
    push('stage.burn_end_s', '燃焼終了時刻は燃焼開始より大きい値にしてください。')
  }

  if (!isFiniteNumber(stage.forced_cutoff_s) || stage.forced_cutoff_s < stage.burn_end_s) {
    push('stage.forced_cutoff_s', '強制カットオフは燃焼終了時刻以降にしてください。')
  }

  if (!isFiniteNumber(stage.separation_time_s) || stage.separation_time_s < stage.burn_end_s) {
    push('stage.separation_time_s', '分離時刻は燃焼終了時刻以上にしてください。')
  }

  if (!isFiniteNumber(stage.throat_diameter_m) || stage.throat_diameter_m <= 0) {
    push('stage.throat_diameter_m', 'スロート径は正の値にしてください。')
  }

  if (!isFiniteNumber(stage.nozzle_expansion_ratio) || stage.nozzle_expansion_ratio < 1) {
    push('stage.nozzle_expansion_ratio', 'ノズル膨張比は1以上にしてください。')
  }

  if (!isFiniteNumber(stage.nozzle_exit_pressure_pa) || stage.nozzle_exit_pressure_pa < 0) {
    push('stage.nozzle_exit_pressure_pa', 'ノズル出口圧力は0以上にしてください。')
  }

  if (!isFiniteNumber(stage.thrust_constant) || stage.thrust_constant < 0) {
    push('stage.thrust_constant', '推力定数は0以上にしてください。')
  }

  if (!isFiniteNumber(stage.thrust_multiplier) || stage.thrust_multiplier <= 0) {
    push('stage.thrust_multiplier', '推力倍率は正の値にしてください。')
  }

  if (!isFiniteNumber(stage.isp_constant) || stage.isp_constant <= 0) {
    push('stage.isp_constant', '比推力定数は正の値にしてください。')
  }

  if (!isFiniteNumber(stage.isp_multiplier) || stage.isp_multiplier <= 0) {
    push('stage.isp_multiplier', '比推力倍率は正の値にしてください。')
  }

  if (!POWER_MODE_OPTIONS.some((option) => option.value === stage.power_mode)) {
    push('stage.power_mode', 'Power flight mode は 0〜3 のプリセットから選択してください。')
  }

  if (!FREE_MODE_OPTIONS.some((option) => option.value === stage.free_mode)) {
    push('stage.free_mode', 'Free flight mode は 0〜2 のプリセットから選択してください。')
  }

  if (stage.thrust_profile.length > 0) {
    let prevTime = -Infinity
    for (const sample of stage.thrust_profile) {
      if (!isFiniteNumber(sample.time) || sample.time < 0) {
        push('stage.thrust_profile', '推力プロファイルの時刻は0以上の数値で指定してください。')
        break
      }
      if (sample.time <= prevTime) {
        push('stage.thrust_profile', '推力プロファイルの時刻は昇順に並べてください。')
        break
      }
      if (!isFiniteNumber(sample.value) || sample.value < 0) {
        push('stage.thrust_profile', '推力プロファイルの推力は0以上で指定してください。')
        break
      }
      prevTime = sample.time
    }
  }

  if (stage.isp_profile.length > 0) {
    let prevTime = -Infinity
    for (const sample of stage.isp_profile) {
      if (!isFiniteNumber(sample.time) || sample.time < 0) {
        push('stage.isp_profile', 'Ispプロファイルの時刻は0以上の数値で指定してください。')
        break
      }
      if (sample.time <= prevTime) {
        push('stage.isp_profile', 'Ispプロファイルの時刻は昇順に並べてください。')
        break
      }
      if (!isFiniteNumber(sample.value) || sample.value <= 0) {
        push('stage.isp_profile', 'Ispプロファイルの値は正の数値で指定してください。')
        break
      }
      prevTime = sample.time
    }
  }

  stageList.slice(1).forEach((extraStage, idx) => {
    const stageLabel = `stage[${idx + 2}]`
    if (!isFiniteNumber(extraStage.mass_initial_kg) || extraStage.mass_initial_kg <= 0) {
      push(`${stageLabel}.mass_initial_kg`, `第${idx + 2}段の初期質量は正の値にしてください。`)
    }
    if (!isFiniteNumber(extraStage.burn_start_s) || extraStage.burn_start_s < 0) {
      push(`${stageLabel}.burn_start_s`, `第${idx + 2}段の燃焼開始時刻は0秒以上にしてください。`)
    }
    if (!isFiniteNumber(extraStage.burn_end_s) || extraStage.burn_end_s <= extraStage.burn_start_s) {
      push(`${stageLabel}.burn_end_s`, `第${idx + 2}段の燃焼終了時刻は燃焼開始より大きい値にしてください。`)
    }
    if (!isFiniteNumber(extraStage.forced_cutoff_s) || extraStage.forced_cutoff_s < extraStage.burn_end_s) {
      push(`${stageLabel}.forced_cutoff_s`, `第${idx + 2}段の強制カットオフは燃焼終了時刻以降にしてください。`)
    }
    if (!isFiniteNumber(extraStage.thrust_constant) || extraStage.thrust_constant < 0) {
      push(`${stageLabel}.thrust_constant`, `第${idx + 2}段の推力定数は0以上で指定してください。`)
    }
    if (!isFiniteNumber(extraStage.isp_constant) || extraStage.isp_constant <= 0) {
      push(`${stageLabel}.isp_constant`, `第${idx + 2}段の比推力定数は正の値にしてください。`)
    }
    if (!isFiniteNumber(extraStage.thrust_multiplier) || extraStage.thrust_multiplier <= 0) {
      push(`${stageLabel}.thrust_multiplier`, `第${idx + 2}段の推力倍率は正の値にしてください。`)
    }
    if (!isFiniteNumber(extraStage.isp_multiplier) || extraStage.isp_multiplier <= 0) {
      push(`${stageLabel}.isp_multiplier`, `第${idx + 2}段の比推力倍率は正の値にしてください。`)
    }
    if (!isFiniteNumber(extraStage.throat_diameter_m) || extraStage.throat_diameter_m <= 0) {
      push(`${stageLabel}.throat_diameter_m`, `第${idx + 2}段のスロート径は正の値にしてください。`)
    }
    if (!isFiniteNumber(extraStage.nozzle_expansion_ratio) || extraStage.nozzle_expansion_ratio < 1) {
      push(`${stageLabel}.nozzle_expansion_ratio`, `第${idx + 2}段のノズル膨張比は1以上にしてください。`)
    }
    if (!isFiniteNumber(extraStage.nozzle_exit_pressure_pa) || extraStage.nozzle_exit_pressure_pa < 0) {
      push(`${stageLabel}.nozzle_exit_pressure_pa`, `第${idx + 2}段のノズル出口圧力は0以上で指定してください。`)
    }
    if (!POWER_MODE_OPTIONS.some((option) => option.value === extraStage.power_mode)) {
      push(`${stageLabel}.power_mode`, `第${idx + 2}段のPower flight modeは0〜3のプリセットから選択してください。`)
    }
    if (!FREE_MODE_OPTIONS.some((option) => option.value === extraStage.free_mode)) {
      push(`${stageLabel}.free_mode`, `第${idx + 2}段のFree flight modeは0〜2のプリセットから選択してください。`)
    }
    if (!isFiniteNumber(extraStage.separation_time_s) || extraStage.separation_time_s < extraStage.burn_end_s) {
      push(`${stageLabel}.separation_time_s`, `第${idx + 2}段の分離時刻は燃焼終了時刻以上にしてください。`)
    }
  })

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

  if (aerodynamics.cn_profile.length > 0) {
    let prevMach = -Infinity
    for (const sample of aerodynamics.cn_profile) {
      if (!isFiniteNumber(sample.mach) || sample.mach < 0) {
        push('aerodynamics.cn_profile', 'CNプロファイルのMachは0以上で指定してください。')
        break
      }
      if (sample.mach <= prevMach) {
        push('aerodynamics.cn_profile', 'CNプロファイルのMachは昇順に並べてください。')
        break
      }
      if (!isFiniteNumber(sample.value)) {
        push('aerodynamics.cn_profile', 'CNプロファイルの値は数値で指定してください。')
        break
      }
      prevMach = sample.mach
    }
  }

  if (!isFiniteNumber(aerodynamics.ca_constant) || aerodynamics.ca_constant < 0) {
    push('aerodynamics.ca_constant', 'CA定数は0以上で指定してください。')
  }

  if (!isFiniteNumber(aerodynamics.ca_multiplier) || aerodynamics.ca_multiplier <= 0) {
    push('aerodynamics.ca_multiplier', 'CA倍率は正の値にしてください。')
  }

  if (aerodynamics.ca_profile.length > 0) {
    let prevMach = -Infinity
    for (const sample of aerodynamics.ca_profile) {
      if (!isFiniteNumber(sample.mach) || sample.mach < 0) {
        push('aerodynamics.ca_profile', 'CAプロファイルのMachは0以上で指定してください。')
        break
      }
      if (sample.mach <= prevMach) {
        push('aerodynamics.ca_profile', 'CAプロファイルのMachは昇順に並べてください。')
        break
      }
      if (!isFiniteNumber(sample.value) || sample.value < 0) {
        push('aerodynamics.ca_profile', 'CAプロファイルの値は0以上で指定してください。')
        break
      }
      prevMach = sample.mach
    }
  }

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
  attitude.gyro_bias_deg_h.forEach((bias, idx) => {
    if (!isFiniteNumber(bias) || Math.abs(bias) > gyroMax) {
      push(`attitude.gyro_bias_deg_h[${idx}]`, `ジャイロバイアスは±${gyroMax} deg/h以内にしてください。`)
    }
  })

  if (attitude.profile.length > 0) {
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

  if (!isFiniteNumber(wind.speed_mps) || wind.speed_mps < 0) {
    push('wind.speed_mps', '風速は0以上で指定してください。')
  }

  if (!isFiniteNumber(wind.direction_deg) || wind.direction_deg < 0 || wind.direction_deg >= 360) {
    push('wind.direction_deg', '風向は0〜360度未満で指定してください。')
  }

  if (wind.profile.length > 0) {
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

  return issues
}

function EditableTable<T extends Record<string, number>>({ title, columns, rows, onChange, addLabel }: TableProps<T>) {
  const handleCellChange = (rowIdx: number, column: Column<T>, value: string) => {
    const parsed = numberFromInput(value)
    const next = rows.map((row, idx) => {
      if (idx !== rowIdx) return row
      return { ...row, [column.key]: parsed } as T
    })
    onChange(next)
  }

  const handleRemove = (rowIdx: number) => {
    const next = rows.filter((_, idx) => idx !== rowIdx)
    onChange(next)
  }

  const handleAdd = () => {
    const blank = columns.reduce((acc, col) => {
      return { ...acc, [col.key]: 0 }
    }, {} as T)
    onChange([...rows, blank])
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>{title}</h4>
        <button type="button" onClick={handleAdd}>{addLabel ?? 'Add row'}</button>
      </div>
      {rows.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No rows yet. Add one to begin.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={String(col.key)} style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 6 }}>
                  {col.label}
                </th>
              ))}
              <th style={{ width: 48 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {columns.map((col) => (
                  <td key={String(col.key)} style={{ padding: '4px 8px 4px 0' }}>
                    <input
                      type="number"
                      step={col.step ?? 'any'}
                      min={col.min}
                      value={Number(row[col.key])}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleCellChange(rowIdx, col, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}>
                  <button type="button" onClick={() => handleRemove(rowIdx)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function createDefaultConfig(): ClientConfig {
  const stage = createDefaultStage()
  return {
    name: 'Sample Vehicle',
    simulation: {
      duration_s: 120,
      output_step_s: 1,
      air_density_percent: 0,
    },
    launch: {
      latitude_deg: 35,
      longitude_deg: 139,
      altitude_m: 0,
      velocity_ned_mps: [0, 0, 0],
      datetime_utc: {
        year: 2023,
        month: 1,
        day: 1,
        hour: 12,
        minute: 0,
        second: 0,
      },
    },
    stage,
    stages: [cloneStage(stage)],
    aerodynamics: {
      body_diameter_m: 0.5,
      cn_constant: 0.2,
      cn_multiplier: 1,
      cn_profile: [],
      ca_constant: 0.2,
      ca_multiplier: 1,
      ca_profile: [],
      ballistic_coefficient: 100,
    },
    attitude: {
      elevation_deg: 83,
      azimuth_deg: 113,
      pitch_offset_deg: 0,
      yaw_offset_deg: 0,
      roll_offset_deg: 0,
      gyro_bias_deg_h: [0, 0, 0],
      profile: [],
    },
    wind: {
      speed_mps: 0,
      direction_deg: 270,
      profile: [],
    },
  }
}

export function SimulationPanel({ onResult }: Props) {
  const [config, setConfig] = useState<ClientConfig>(() => createDefaultConfig())
  const [useThrustProfile, setUseThrustProfile] = useState(() => config.stage.thrust_profile.length > 0)
  const [useIspProfile, setUseIspProfile] = useState(() => config.stage.isp_profile.length > 0)
  const [useCnProfile, setUseCnProfile] = useState(() => config.aerodynamics.cn_profile.length > 0)
  const [useCaProfile, setUseCaProfile] = useState(() => config.aerodynamics.ca_profile.length > 0)
  const [useAttitudeProfile, setUseAttitudeProfile] = useState(() => config.attitude.profile.length > 0)
  const [useWindProfile, setUseWindProfile] = useState(() => config.wind.profile.length > 0)
  const [mode, setMode] = useState<Mode>('api')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showVariations, setShowVariations] = useState(false)

  const jsonPreview = useMemo(() => JSON.stringify(config, null, 2), [config])
  const validationIssues = useMemo(() => validateConfig(config), [config])
  const hasValidationIssues = validationIssues.length > 0

  const jsonSummaryLabel = hasValidationIssues
    ? `Generated JSON preview (要調整: ${validationIssues.length}件のエラー)`
    : 'Generated JSON preview (OK)'

  const stages = config.stages && config.stages.length > 0 ? config.stages : [config.stage]
  const stageCount = stages.length

  useEffect(() => {
    if (!hasValidationIssues && error === VALIDATION_ERROR_MESSAGE) {
      setError(null)
    }
  }, [error, hasValidationIssues])

  const setStageCount = (count: number) => {
    const normalized = Math.min(MAX_STAGE_COUNT, Math.max(1, Math.round(count)))
    let nextStages: ClientStageConfig[] = []
    setConfig((prev) => {
      const stagesSnapshot = snapshotStages(prev)
      let updatedStages = stagesSnapshot
      if (normalized > stagesSnapshot.length) {
        const additions = Array.from({ length: normalized - stagesSnapshot.length }, () => cloneStage(createDefaultStage()))
        updatedStages = [...stagesSnapshot, ...additions]
      } else if (normalized < stagesSnapshot.length) {
        updatedStages = stagesSnapshot.slice(0, normalized)
      }
      nextStages = updatedStages
      return {
        ...prev,
        stage: updatedStages[0],
        stages: updatedStages,
      }
    })
    if (nextStages.length > 0) {
      setUseThrustProfile(nextStages[0].thrust_profile.length > 0)
      setUseIspProfile(nextStages[0].isp_profile.length > 0)
    }
  }

  function updateSimulation<K extends keyof ClientConfig['simulation']>(key: K, value: number) {
    setConfig((prev) => ({
      ...prev,
      simulation: {
        ...prev.simulation,
        [key]: value,
      },
    }))
  }

  function updateLaunch<K extends keyof ClientConfig['launch']>(key: K, value: any) {
    setConfig((prev) => ({
      ...prev,
      launch: {
        ...prev.launch,
        [key]: value,
      },
    }))
  }

  function updateStage<K extends keyof ClientStageConfig>(key: K, value: ClientStageConfig[K], stageIndex = 0) {
    setConfig((prev) => {
      const stages = snapshotStages(prev)
      if (stageIndex >= stages.length) {
        return prev
      }
      const updatedStage: ClientStageConfig = {
        ...stages[stageIndex],
        [key]: value,
      }
      stages[stageIndex] = updatedStage
      return {
        ...prev,
        stage: stageIndex === 0 ? updatedStage : stages[0],
        stages,
      }
    })
  }

  function updateAerodynamics<K extends keyof ClientConfig['aerodynamics']>(key: K, value: any) {
    setConfig((prev) => ({
      ...prev,
      aerodynamics: {
        ...prev.aerodynamics,
        [key]: value,
      },
    }))
  }

  function updateAttitude<K extends keyof ClientConfig['attitude']>(key: K, value: any) {
    setConfig((prev) => ({
      ...prev,
      attitude: {
        ...prev.attitude,
        [key]: value,
      },
    }))
  }

  function updateWind<K extends keyof ClientConfig['wind']>(key: K, value: any) {
    setConfig((prev) => ({
      ...prev,
      wind: {
        ...prev.wind,
        [key]: value,
      },
    }))
  }

  function toggleThrustProfile(checked: boolean) {
    setUseThrustProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.stage.thrust_profile.length > 0
          ? prev.stage.thrust_profile
          : [
              { time: prev.stage.burn_start_s, value: prev.stage.thrust_constant },
              { time: prev.stage.burn_end_s, value: prev.stage.thrust_constant },
            ]
        : []
      const stages = snapshotStages(prev)
      const updatedStage = {
        ...prev.stage,
        thrust_profile: nextProfile,
      }
      stages[0] = updatedStage
      return {
        ...prev,
        stage: updatedStage,
        stages,
      }
    })
  }

  function toggleIspProfile(checked: boolean) {
    setUseIspProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.stage.isp_profile.length > 0
          ? prev.stage.isp_profile
          : [
              { time: prev.stage.burn_start_s, value: prev.stage.isp_constant },
              { time: prev.stage.burn_end_s, value: prev.stage.isp_constant },
            ]
        : []
      const stages = snapshotStages(prev)
      const updatedStage = {
        ...prev.stage,
        isp_profile: nextProfile,
      }
      stages[0] = updatedStage
      return {
        ...prev,
        stage: updatedStage,
        stages,
      }
    })
  }

  function toggleCnProfile(checked: boolean) {
    setUseCnProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.aerodynamics.cn_profile.length > 0
          ? prev.aerodynamics.cn_profile
          : [
              { mach: 0, value: prev.aerodynamics.cn_constant },
              { mach: 1, value: prev.aerodynamics.cn_constant },
            ]
        : []
      return {
        ...prev,
        aerodynamics: {
          ...prev.aerodynamics,
          cn_profile: nextProfile,
        },
      }
    })
  }

  function toggleCaProfile(checked: boolean) {
    setUseCaProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.aerodynamics.ca_profile.length > 0
          ? prev.aerodynamics.ca_profile
          : [
              { mach: 0, value: prev.aerodynamics.ca_constant },
              { mach: 1, value: prev.aerodynamics.ca_constant },
            ]
        : []
      return {
        ...prev,
        aerodynamics: {
          ...prev.aerodynamics,
          ca_profile: nextProfile,
        },
      }
    })
  }

  function toggleAttitudeProfile(checked: boolean) {
    setUseAttitudeProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.attitude.profile.length > 0
          ? prev.attitude.profile
          : [
              {
                time: 0,
                azimuth_deg: prev.attitude.azimuth_deg,
                elevation_deg: prev.attitude.elevation_deg,
              },
            ]
        : []
      return {
        ...prev,
        attitude: {
          ...prev.attitude,
          profile: nextProfile,
        },
      }
    })
  }

  function toggleWindProfile(checked: boolean) {
    setUseWindProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.wind.profile.length > 0
          ? prev.wind.profile
          : [
              { altitude_m: 0, speed_mps: prev.wind.speed_mps, direction_deg: prev.wind.direction_deg },
              {
                altitude_m: Math.max(1, prev.simulation.duration_s * 10),
                speed_mps: prev.wind.speed_mps,
                direction_deg: prev.wind.direction_deg,
              },
            ]
        : []
      return {
        ...prev,
        wind: {
          ...prev.wind,
          profile: nextProfile,
        },
      }
    })
  }

  const handleRun = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (hasValidationIssues) {
      setError(VALIDATION_ERROR_MESSAGE)
      return
    }
    setLoading(true)
    setError(null)
    try {
      let trajectory: SimulationState[]
      if (mode === 'wasm') {
        const { runSimulationWasm } = await import('../lib/wasm')
        trajectory = await runSimulationWasm(config)
      } else {
        trajectory = await runSimulation(config)
      }
      onResult(trajectory)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  const resetToDefault = () => {
    setConfig(createDefaultConfig())
    setUseThrustProfile(false)
    setUseIspProfile(false)
    setUseCnProfile(false)
    setUseCaProfile(false)
    setUseAttitudeProfile(false)
    setUseWindProfile(false)
  }

  const setVelocityComponent = (index: number, value: number) => {
    const next: [number, number, number] = [...config.launch.velocity_ned_mps] as [number, number, number]
    next[index] = value
    updateLaunch('velocity_ned_mps', next)
  }

  const updateDateField = (key: keyof ClientConfig['launch']['datetime_utc'], value: number) => {
    setConfig((prev) => ({
      ...prev,
      launch: {
        ...prev.launch,
        datetime_utc: {
          ...prev.launch.datetime_utc,
          [key]: value,
        },
      },
    }))
  }

  return (
    <form onSubmit={handleRun} style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600 }}>Vehicle name</label>
          <input
            value={config.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig((prev) => ({ ...prev, name: e.target.value }))}
            style={{ width: 240 }}
          />
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Execution mode</div>
          <label>
            <input type="radio" value="api" checked={mode === 'api'} onChange={() => setMode('api')} />
            <span style={{ marginLeft: 6 }}>Server API</span>
          </label>
          <label style={{ marginLeft: 16 }}>
            <input type="radio" value="wasm" checked={mode === 'wasm'} onChange={() => setMode('wasm')} />
            <span style={{ marginLeft: 6 }}>Browser (WASM)</span>
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={showVariations}
            onChange={(e) => setShowVariations(e.target.checked)}
          />
          <span>Show Monte Carlo variations</span>
        </label>
        <div style={{ marginLeft: 'auto' }}>
          <button type="submit" disabled={loading || hasValidationIssues} style={{ padding: '8px 16px' }}>
            {loading ? 'Running…' : `Run (${mode.toUpperCase()})`}
          </button>
          <button type="button" disabled={loading} onClick={resetToDefault} style={{ marginLeft: 8 }}>
            Reset form
          </button>
        </div>
      </div>

      {hasValidationIssues && (
        <div>
          <div style={{ fontWeight: 600, color: 'crimson' }}>
            {`設定に${validationIssues.length}件の問題があります。`}
          </div>
          <ul style={{ marginTop: 8, paddingLeft: 20, color: 'crimson' }}>
            {validationIssues.map((issue) => (
              <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Simulation</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <label>
              <div>Duration [s]</div>
              <input
                type="number"
                min={1}
                step="1"
                value={config.simulation.duration_s}
                onChange={(e) => updateSimulation('duration_s', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Output step [s]</div>
              <input
                type="number"
                min={0.01}
                step="any"
                value={config.simulation.output_step_s}
                onChange={(e) => updateSimulation('output_step_s', numberFromInput(e.target.value))}
              />
            </label>
            {showVariations && (
              <label>
                <div>Air density variation [%]</div>
                <input
                  type="number"
                  step="1"
                  value={config.simulation.air_density_percent}
                  onChange={(e) => updateSimulation('air_density_percent', numberFromInput(e.target.value))}
                />
              </label>
            )}
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Launch</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <label>
              <div>Latitude [deg]</div>
              <input
                type="number"
                step="0.0001"
                value={config.launch.latitude_deg}
                onChange={(e) => updateLaunch('latitude_deg', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Longitude [deg]</div>
              <input
                type="number"
                step="0.0001"
                value={config.launch.longitude_deg}
                onChange={(e) => updateLaunch('longitude_deg', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Altitude [m]</div>
              <input
                type="number"
                step="1"
                value={config.launch.altitude_m}
                onChange={(e) => updateLaunch('altitude_m', numberFromInput(e.target.value))}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
            <label>
              <div>Velocity North [m/s]</div>
              <input
                type="number"
                step="0.1"
                value={config.launch.velocity_ned_mps[0]}
                onChange={(e) => setVelocityComponent(0, numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Velocity East [m/s]</div>
              <input
                type="number"
                step="0.1"
                value={config.launch.velocity_ned_mps[1]}
                onChange={(e) => setVelocityComponent(1, numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Velocity Down [m/s]</div>
              <input
                type="number"
                step="0.1"
                value={config.launch.velocity_ned_mps[2]}
                onChange={(e) => setVelocityComponent(2, numberFromInput(e.target.value))}
              />
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Launch time (UTC)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['year', 'month', 'day', 'hour', 'minute', 'second'] as const).map((field) => (
                <label key={field} style={{ display: 'flex', flexDirection: 'column', minWidth: 90 }}>
                  <span style={{ textTransform: 'capitalize' }}>{field}</span>
                  <input
                    type="number"
                    step="1"
                    value={config.launch.datetime_utc[field]}
                    onChange={(e) => updateDateField(field, numberFromInput(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Stage & Motor</h3>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', maxWidth: 180 }}>
              <span>Stage count</span>
              <select
                value={stageCount}
                onChange={(e) => setStageCount(Number(e.target.value))}
                style={{ padding: '4px 8px' }}
              >
                {Array.from({ length: MAX_STAGE_COUNT }, (_, idx) => idx + 1).map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
            {stages.map((stageData, idx) => {
              const stageLabel = `Stage ${idx + 1}`
              return (
                <details key={`stage-${idx}`} open={idx === 0} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{stageLabel}</summary>
                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                    <label>
                      <div>Mass initial [kg]</div>
                      <input
                        type="number"
                        step="1"
                        value={stageData.mass_initial_kg}
                        onChange={(e) => updateStage('mass_initial_kg', numberFromInput(e.target.value), idx)}
                      />
                    </label>
                    <label>
                      <div>Power flight mode</div>
                      <select
                        value={stageData.power_mode}
                        onChange={(e) => updateStage('power_mode', Number(e.target.value), idx)}
                        style={{ padding: '4px 8px' }}
                      >
                        {POWER_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <div>Free flight mode</div>
                      <select
                        value={stageData.free_mode}
                        onChange={(e) => updateStage('free_mode', Number(e.target.value), idx)}
                        style={{ padding: '4px 8px' }}
                      >
                        {FREE_MODE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                    <label>
                      <div>Burn start [s]</div>
                      <input
                        type="number"
                        step="0.1"
                        value={stageData.burn_start_s}
                        onChange={(e) => updateStage('burn_start_s', numberFromInput(e.target.value), idx)}
                      />
                    </label>
                    <label>
                      <div>Burn end [s]</div>
                      <input
                        type="number"
                        step="0.1"
                        value={stageData.burn_end_s}
                        onChange={(e) => updateStage('burn_end_s', numberFromInput(e.target.value), idx)}
                      />
                    </label>
                    <label>
                      <div>Forced cutoff [s]</div>
                      <input
                        type="number"
                        step="0.1"
                        value={stageData.forced_cutoff_s}
                        onChange={(e) => updateStage('forced_cutoff_s', numberFromInput(e.target.value), idx)}
                      />
                    </label>
                    <label>
                      <div>Separation time [s]</div>
                      <input
                        type="number"
                        step="0.1"
                        value={stageData.separation_time_s}
                        onChange={(e) => updateStage('separation_time_s', numberFromInput(e.target.value), idx)}
                      />
                    </label>
                  </div>

                  <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                    <label>
                      <div>Throat diameter [m]</div>
                      <input
                        type="number"
                        step="0.001"
                        value={stageData.throat_diameter_m}
                        onChange={(e) => updateStage('throat_diameter_m', numberFromInput(e.target.value), idx)}
                      />
                    </label>
                    <label>
                      <div>Nozzle expansion ratio</div>
                      <input
                        type="number"
                        step="0.1"
                        value={stageData.nozzle_expansion_ratio}
                        onChange={(e) => updateStage('nozzle_expansion_ratio', numberFromInput(e.target.value), idx)}
                      />
                    </label>
                    <label>
                      <div>Nozzle exit pressure [Pa]</div>
                      <input
                        type="number"
                        step="10"
                        value={stageData.nozzle_exit_pressure_pa}
                        onChange={(e) => updateStage('nozzle_exit_pressure_pa', numberFromInput(e.target.value), idx)}
                      />
                    </label>
                  </div>

                  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 12 }}>
                    <div style={{ fontWeight: 600 }}>Thrust curve</div>
                    {idx === 0 ? (
                      <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <input
                            type="checkbox"
                            checked={useThrustProfile}
                            onChange={(e) => toggleThrustProfile(e.target.checked)}
                          />
                          <span>Use thrust profile (CSV / time-series)</span>
                        </label>
                        {!useThrustProfile && (
                          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                            <label>
                              <div>Const thrust vac [N]</div>
                              <input
                                type="number"
                                step="10"
                                value={stageData.thrust_constant}
                                onChange={(e) => updateStage('thrust_constant', numberFromInput(e.target.value), idx)}
                              />
                            </label>
                          </div>
                        )}
                        {showVariations && (
                          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                            <label>
                              <div>Thrust multiplier</div>
                              <input
                                type="number"
                                step="0.01"
                                value={stageData.thrust_multiplier}
                                onChange={(e) => updateStage('thrust_multiplier', numberFromInput(e.target.value), idx)}
                              />
                            </label>
                          </div>
                        )}
                        {useThrustProfile && (
                          <EditableTable<ClientTimeSample>
                            title="Thrust profile (time-series)"
                            columns={[
                              { key: 'time', label: 'Time [s]', step: '0.1', min: 0 },
                              { key: 'value', label: 'Thrust [N]', step: '10' },
                            ]}
                            rows={stageData.thrust_profile}
                            onChange={(rows) => updateStage('thrust_profile', rows, idx)}
                            addLabel="Add thrust sample"
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                          <label>
                            <div>Const thrust vac [N]</div>
                            <input
                              type="number"
                              step="10"
                              value={stageData.thrust_constant}
                              onChange={(e) => updateStage('thrust_constant', numberFromInput(e.target.value), idx)}
                            />
                          </label>
                        </div>
                        {showVariations && (
                          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                            <label>
                              <div>Thrust multiplier</div>
                              <input
                                type="number"
                                step="0.01"
                                value={stageData.thrust_multiplier}
                                onChange={(e) => updateStage('thrust_multiplier', numberFromInput(e.target.value), idx)}
                              />
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 12 }}>
                    <div style={{ fontWeight: 600 }}>Specific impulse</div>
                    {idx === 0 ? (
                      <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                          <input
                            type="checkbox"
                            checked={useIspProfile}
                            onChange={(e) => toggleIspProfile(e.target.checked)}
                          />
                          <span>Use Isp profile (CSV / time-series)</span>
                        </label>
                        {!useIspProfile && (
                          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                            <label>
                              <div>Const Isp vac [s]</div>
                              <input
                                type="number"
                                step="0.1"
                                value={stageData.isp_constant}
                                onChange={(e) => updateStage('isp_constant', numberFromInput(e.target.value), idx)}
                              />
                            </label>
                          </div>
                        )}
                        {showVariations && (
                          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                            <label>
                              <div>Isp multiplier</div>
                              <input
                                type="number"
                                step="0.01"
                                value={stageData.isp_multiplier}
                                onChange={(e) => updateStage('isp_multiplier', numberFromInput(e.target.value), idx)}
                              />
                            </label>
                          </div>
                        )}
                        {useIspProfile && (
                          <EditableTable<ClientTimeSample>
                            title="Isp profile (time-series)"
                            columns={[
                              { key: 'time', label: 'Time [s]', step: '0.1', min: 0 },
                              { key: 'value', label: 'Isp [s]', step: '0.1' },
                            ]}
                            rows={stageData.isp_profile}
                            onChange={(rows) => updateStage('isp_profile', rows, idx)}
                            addLabel="Add Isp sample"
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                          <label>
                            <div>Const Isp vac [s]</div>
                            <input
                              type="number"
                              step="0.1"
                              value={stageData.isp_constant}
                              onChange={(e) => updateStage('isp_constant', numberFromInput(e.target.value), idx)}
                            />
                          </label>
                        </div>
                        {showVariations && (
                          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                            <label>
                              <div>Isp multiplier</div>
                              <input
                                type="number"
                                step="0.01"
                                value={stageData.isp_multiplier}
                                onChange={(e) => updateStage('isp_multiplier', numberFromInput(e.target.value), idx)}
                              />
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </details>
              )
            })}
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Aerodynamics</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label>
              <div>Body diameter [m]</div>
              <input
                type="number"
                step="0.01"
                value={config.aerodynamics.body_diameter_m}
                onChange={(e) => updateAerodynamics('body_diameter_m', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Ballistic coefficient [kg/m²]</div>
              <input
                type="number"
                step="1"
                value={config.aerodynamics.ballistic_coefficient}
                onChange={(e) => updateAerodynamics('ballistic_coefficient', numberFromInput(e.target.value))}
              />
            </label>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 12 }}>
            <div style={{ fontWeight: 600 }}>Normal force coefficient (CN)</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={useCnProfile}
                onChange={(e) => toggleCnProfile(e.target.checked)}
              />
              <span>Use CN profile (CSV / Mach table)</span>
            </label>
            {!useCnProfile && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>
                  <div>CN constant</div>
                  <input
                    type="number"
                    step="0.01"
                    value={config.aerodynamics.cn_constant}
                    onChange={(e) => updateAerodynamics('cn_constant', numberFromInput(e.target.value))}
                  />
                </label>
              </div>
            )}
            {showVariations && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>
                  <div>CN multiplier</div>
                  <input
                    type="number"
                    step="0.01"
                    value={config.aerodynamics.cn_multiplier}
                    onChange={(e) => updateAerodynamics('cn_multiplier', numberFromInput(e.target.value))}
                  />
                </label>
              </div>
            )}
            {useCnProfile && (
              <EditableTable<ClientMachSample>
                title="CN vs Mach"
                columns={[
                  { key: 'mach', label: 'Mach [-]', step: '0.01', min: 0 },
                  { key: 'value', label: 'CN [-]', step: '0.01' },
                ]}
                rows={config.aerodynamics.cn_profile}
                onChange={(rows) => updateAerodynamics('cn_profile', rows)}
                addLabel="Add CN sample"
              />
            )}
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 12 }}>
            <div style={{ fontWeight: 600 }}>Axial force coefficient (CA)</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={useCaProfile}
                onChange={(e) => toggleCaProfile(e.target.checked)}
              />
              <span>Use CA profile (CSV / Mach table)</span>
            </label>
            {!useCaProfile && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>
                  <div>CA constant</div>
                  <input
                    type="number"
                    step="0.01"
                    value={config.aerodynamics.ca_constant}
                    onChange={(e) => updateAerodynamics('ca_constant', numberFromInput(e.target.value))}
                  />
                </label>
              </div>
            )}
            {showVariations && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>
                  <div>CA multiplier</div>
                  <input
                    type="number"
                    step="0.01"
                    value={config.aerodynamics.ca_multiplier}
                    onChange={(e) => updateAerodynamics('ca_multiplier', numberFromInput(e.target.value))}
                  />
                </label>
              </div>
            )}
            {useCaProfile && (
              <EditableTable<ClientMachSample>
                title="CA vs Mach"
                columns={[
                  { key: 'mach', label: 'Mach [-]', step: '0.01', min: 0 },
                  { key: 'value', label: 'CA [-]', step: '0.01' },
                ]}
                rows={config.aerodynamics.ca_profile}
                onChange={(rows) => updateAerodynamics('ca_profile', rows)}
                addLabel="Add CA sample"
              />
            )}
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Attitude guidance</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={useAttitudeProfile}
              onChange={(e) => toggleAttitudeProfile(e.target.checked)}
            />
            <span>Use attitude profile (CSV / time-series)</span>
          </label>
          {!useAttitudeProfile && (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
              <label>
                <div>Azimuth [deg]</div>
                <input
                  type="number"
                  step="0.1"
                  value={config.attitude.azimuth_deg}
                  onChange={(e) => updateAttitude('azimuth_deg', numberFromInput(e.target.value))}
                />
              </label>
              <label>
                <div>Elevation [deg]</div>
                <input
                  type="number"
                  step="0.1"
                  value={config.attitude.elevation_deg}
                  onChange={(e) => updateAttitude('elevation_deg', numberFromInput(e.target.value))}
                />
              </label>
            </div>
          )}
          {showVariations && (
            <>
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>
                  <div>Pitch offset [deg]</div>
                  <input
                    type="number"
                    step="0.1"
                    value={config.attitude.pitch_offset_deg}
                    onChange={(e) => updateAttitude('pitch_offset_deg', numberFromInput(e.target.value))}
                  />
                </label>
                <label>
                  <div>Yaw offset [deg]</div>
                  <input
                    type="number"
                    step="0.1"
                    value={config.attitude.yaw_offset_deg}
                    onChange={(e) => updateAttitude('yaw_offset_deg', numberFromInput(e.target.value))}
                  />
                </label>
                <label>
                  <div>Roll offset [deg]</div>
                  <input
                    type="number"
                    step="0.1"
                    value={config.attitude.roll_offset_deg}
                    onChange={(e) => updateAttitude('roll_offset_deg', numberFromInput(e.target.value))}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
                {(['x', 'y', 'z'] as const).map((axis, idx) => (
                  <label key={axis} style={{ display: 'flex', flexDirection: 'column', minWidth: 140 }}>
                    <span>Gyro bias {axis.toUpperCase()} [deg/h]</span>
                    <input
                      type="number"
                      step="0.01"
                      value={config.attitude.gyro_bias_deg_h[idx]}
                      onChange={(e) => {
                        const next: [number, number, number] = [...config.attitude.gyro_bias_deg_h] as [number, number, number]
                        next[idx] = numberFromInput(e.target.value)
                        updateAttitude('gyro_bias_deg_h', next)
                      }}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          {useAttitudeProfile && (
            <EditableTable<ClientAttitudeSample>
              title="Attitude profile"
              columns={[
                { key: 'time', label: 'Time [s]', step: '0.1', min: 0 },
                { key: 'azimuth_deg', label: 'Azimuth [deg]', step: '0.1' },
                { key: 'elevation_deg', label: 'Elevation [deg]', step: '0.1' },
              ]}
              rows={config.attitude.profile}
              onChange={(rows) => updateAttitude('profile', rows)}
              addLabel="Add attitude waypoint"
            />
          )}
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Wind</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={useWindProfile}
              onChange={(e) => toggleWindProfile(e.target.checked)}
            />
            <span>Use wind profile (CSV / altitude table)</span>
          </label>
          {!useWindProfile && (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
              <label>
                <div>Constant wind speed [m/s]</div>
                <input
                  type="number"
                  step="0.1"
                  value={config.wind.speed_mps}
                  onChange={(e) => updateWind('speed_mps', numberFromInput(e.target.value))}
                />
              </label>
              <label>
                <div>Direction (from) [deg]</div>
                <input
                  type="number"
                  step="1"
                  value={config.wind.direction_deg}
                  onChange={(e) => updateWind('direction_deg', numberFromInput(e.target.value))}
                />
              </label>
            </div>
          )}
          {useWindProfile && (
            <EditableTable<ClientWindSample>
              title="Wind profile"
              columns={[
                { key: 'altitude_m', label: 'Altitude [m]', step: '1', min: 0 },
                { key: 'speed_mps', label: 'Speed [m/s]', step: '0.1' },
                { key: 'direction_deg', label: 'Direction [deg]', step: '1' },
              ]}
              rows={config.wind.profile}
              onChange={(rows) => updateWind('profile', rows)}
              addLabel="Add wind datum"
            />
          )}
        </div>
      </div>

      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      <details style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{jsonSummaryLabel}</summary>
        <pre style={{ maxHeight: 240, overflow: 'auto', background: '#f9fafb', padding: 12, borderRadius: 6 }}>
          {jsonPreview}
        </pre>
      </details>
    </form>
  )
}
