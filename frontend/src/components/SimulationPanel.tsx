import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import { runSimulation } from '../lib/simulation'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Switch } from './ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion'
import { Badge } from './ui/badge'
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
  onResult: (trajectory: SimulationState[], config: ClientConfig) => void
}


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

const MAX_STAGE_COUNT = 5

const pad2 = (value: number) => value.toString().padStart(2, '0')

function formatDateInput(datetime: ClientConfig['launch']['datetime_utc']): string {
  return `${datetime.year}-${pad2(datetime.month)}-${pad2(datetime.day)}`
}

function formatTimeInput(datetime: ClientConfig['launch']['datetime_utc']): string {
  return `${pad2(datetime.hour)}:${pad2(datetime.minute)}:${pad2(datetime.second)}`
}

function parseDateTimeInputs(
  dateValue: string,
  timeValue: string,
  fallback: ClientConfig['launch']['datetime_utc'],
): ClientConfig['launch']['datetime_utc'] {
  if (!dateValue) {
    return fallback
  }

  const [yearStr, monthStr, dayStr] = dateValue.split('-')
  const [hourStr = '0', minuteStr = '0', secondStr = '0'] = timeValue.split(':')

  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const second = Number(secondStr)

  if (
    [year, month, day, hour, minute, second].some((value) => !Number.isFinite(value)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return fallback
  }

  const launchDate = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (Number.isNaN(launchDate.getTime())) {
    return fallback
  }

  return {
    year: launchDate.getUTCFullYear(),
    month: launchDate.getUTCMonth() + 1,
    day: launchDate.getUTCDate(),
    hour: launchDate.getUTCHours(),
    minute: launchDate.getUTCMinutes(),
    second: launchDate.getUTCSeconds(),
  }
}

function detectHasVariations(config: ClientConfig): boolean {
  const simulationVariation = config.simulation.air_density_percent !== 0
  const stageVariation = (config.stages ?? []).some(
    (stage) => stage.thrust_multiplier !== 1 || stage.isp_multiplier !== 1,
  )
  const aeroVariation =
    config.aerodynamics.cn_multiplier !== 1 || config.aerodynamics.ca_multiplier !== 1
  const attitudeVariation =
    Math.abs(config.attitude.pitch_offset_deg) > 0 ||
    Math.abs(config.attitude.yaw_offset_deg) > 0 ||
    Math.abs(config.attitude.roll_offset_deg) > 0 ||
    config.attitude.gyro_bias_deg_h.some((bias) => Math.abs(bias) > 0)

  return simulationVariation || stageVariation || aeroVariation || attitudeVariation
}

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
  const stages = config.stages && config.stages.length > 0 ? config.stages : [createDefaultStage()]
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
  const stageList = config.stages && config.stages.length > 0 ? config.stages : [createDefaultStage()]
  if (stageList.length === 0) {
    issues.push({ field: 'stages', message: '少なくとも1段は設定してください。' })
    return issues
  }
  const stage = stageList[0]

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
    const blank = columns.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {} as T)
    onChange([...rows, blank])
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
          {addLabel ?? 'Add row'}
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">No rows yet. Add one to begin.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-slate-50/80">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-4 py-2">
                      <Input
                        type="number"
                        step={col.step ?? 'any'}
                        min={col.min}
                        value={Number(row[col.key])}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleCellChange(rowIdx, col, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(rowIdx)}
                      aria-label="Remove row"
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type NumberFieldProps = {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  step?: string
  min?: number
  max?: number
  disabled?: boolean
  className?: string
  inputMode?: 'decimal' | 'numeric'
  hasError?: boolean
  registerRef?: (el: HTMLInputElement | null) => void
}

function NumberField({
  id,
  label,
  value,
  onChange,
  step = 'any',
  min,
  max,
  disabled,
  className,
  inputMode = 'decimal',
  hasError = false,
  registerRef,
}: NumberFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id} className={cn(hasError && 'text-rose-600')}>
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(numberFromInput(e.target.value))}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        inputMode={inputMode}
        aria-invalid={hasError || undefined}
        ref={registerRef}
        className={cn(
          hasError && 'border-rose-300 bg-rose-50 focus-visible:ring-rose-300 focus-visible:ring-offset-2',
        )}
      />
    </div>
  )
}

type SelectFieldProps = {
  id: string
  label: string
  value: number
  options: { value: number; label: string }[]
  onChange: (value: number) => void
  className?: string
  hasError?: boolean
  registerRef?: (el: HTMLSelectElement | null) => void
}

function SelectField({ id, label, value, options, onChange, className, hasError = false, registerRef }: SelectFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id} className={cn(hasError && 'text-rose-600')}>
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        ref={registerRef}
        aria-invalid={hasError || undefined}
        className={cn(
          'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-inner focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1',
          hasError && 'border-rose-300 bg-rose-50 text-rose-700 focus-visible:ring-rose-300 focus-visible:ring-offset-2',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

type SwitchFieldProps = {
  id: string
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

function SwitchField({ id, label, description, checked, onCheckedChange, disabled }: SwitchFieldProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/90 px-3 py-2.5 shadow-inner">
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
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

type PresetOption = {
  id: string
  label: string
  description: string
  create: () => ClientConfig
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

const PRESET_OPTIONS: PresetOption[] = [
  {
    id: 'sample',
    label: 'Sample Vehicle (default)',
    description: 'Baseline single-stage sounding rocket useful for quick functional checks.',
    create: () => createDefaultConfig(),
  },
  {
    id: 'orbital',
    label: 'Orbital Demo Launcher',
    description: 'Two-stage launcher profile tuned for an orbital insertion rehearsal.',
    create: () => createOrbitalDemoPreset(),
  },
  {
    id: 'hopper',
    label: 'VTOL Hopper Test',
    description: 'Low-altitude vertical hop scenario for landing guidance experiments.',
    create: () => createHopperTestPreset(),
  },
]

export function SimulationPanel({ onResult }: Props) {
  const [config, setConfig] = useState<ClientConfig>(() => createDefaultConfig())
  const [useCnProfile, setUseCnProfile] = useState(() => config.aerodynamics.cn_profile.length > 0)
  const [useCaProfile, setUseCaProfile] = useState(() => config.aerodynamics.ca_profile.length > 0)
  const [useAttitudeProfile, setUseAttitudeProfile] = useState(() => config.attitude.profile.length > 0)
  const [useWindProfile, setUseWindProfile] = useState(() => config.wind.profile.length > 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showVariations, setShowVariations] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<string>('sample')
  const [openStageIds, setOpenStageIds] = useState<string[]>(['stage-0'])

  const jsonPreview = useMemo(() => JSON.stringify(config, null, 2), [config])
  const validationIssues = useMemo(() => validateConfig(config), [config])
  const hasValidationIssues = validationIssues.length > 0
  const issuesSet = useMemo(() => new Set(validationIssues.map((issue) => issue.field)), [validationIssues])
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({})
  const makeFieldRef = useCallback(
    (field?: string) => (el: HTMLElement | null) => {
      if (!field) return
      if (el) {
        fieldRefs.current[field] = el
      } else {
        delete fieldRefs.current[field]
      }
    },
    [],
  )
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [jsonMessage, setJsonMessage] = useState<string | null>(null)
  const variationsActive = useMemo(() => detectHasVariations(config), [config])
  const selectedPreset = useMemo(
    () => PRESET_OPTIONS.find((option) => option.id === selectedPresetId),
    [selectedPresetId],
  )
  const presetDescription =
    selectedPresetId === 'custom'
      ? 'Custom configuration derived from manual edits or imported settings.'
      : selectedPreset?.description ?? ''
  const markCustomized = useCallback(() => {
    setSelectedPresetId((prev) => (prev === 'custom' ? prev : 'custom'))
  }, [])

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = PRESET_OPTIONS.find((option) => option.id === presetId)
      if (!preset) return
      const presetConfig = preset.create()
      setConfig(presetConfig)
      setUseCnProfile(presetConfig.aerodynamics.cn_profile.length > 0)
      setUseCaProfile(presetConfig.aerodynamics.ca_profile.length > 0)
      setUseAttitudeProfile(presetConfig.attitude.profile.length > 0)
      setUseWindProfile(presetConfig.wind.profile.length > 0)
      setShowVariations(detectHasVariations(presetConfig))
      setSelectedPresetId(presetId)
      setError(null)
    },
    [],
  )

  const jsonSummaryLabel = hasValidationIssues
    ? `Generated JSON preview (要調整: ${validationIssues.length}件のエラー)`
    : 'Generated JSON preview (OK)'

  const stages = config.stages && config.stages.length > 0 ? config.stages : [createDefaultStage()]
  const stageCount = stages.length
  const launchDateValue = formatDateInput(config.launch.datetime_utc)
  const launchTimeValue = formatTimeInput(config.launch.datetime_utc)
  const launchDateHasError = issuesSet.has('launch.datetime_utc')
const stageAccentPalette = ['#1d4ed8', '#047857', '#ea580c', '#7c3aed']

  useEffect(() => {
    if (!hasValidationIssues && error === VALIDATION_ERROR_MESSAGE) {
      setError(null)
    }
  }, [error, hasValidationIssues])

  useEffect(() => {
    if (!jsonMessage) return
    if (typeof window === 'undefined') return
    const timeout = window.setTimeout(() => setJsonMessage(null), 2600)
    return () => window.clearTimeout(timeout)
  }, [jsonMessage])

  useEffect(() => {
    const allowed = stages.map((_, idx) => `stage-${idx}`)
    setOpenStageIds((prev) => {
      const filtered = prev.filter((id) => allowed.includes(id))
      if (filtered.length === 0 && allowed.length > 0) {
        return [allowed[0]]
      }
      return filtered
    })
  }, [stageCount, stages])

  const setStageCount = (count: number) => {
    const normalized = Math.min(MAX_STAGE_COUNT, Math.max(1, Math.round(count)))
    markCustomized()
    setConfig((prev) => {
      const stagesSnapshot = snapshotStages(prev)
      let updatedStages = stagesSnapshot
      if (normalized > stagesSnapshot.length) {
        const additions = Array.from({ length: normalized - stagesSnapshot.length }, () => cloneStage(createDefaultStage()))
        updatedStages = [...stagesSnapshot, ...additions]
      } else if (normalized < stagesSnapshot.length) {
        updatedStages = stagesSnapshot.slice(0, normalized)
      }
      return {
        ...prev,
        stages: updatedStages,
      }
    })
  }

  function updateSimulation<K extends keyof ClientConfig['simulation']>(key: K, value: number) {
    markCustomized()
    setConfig((prev) => ({
      ...prev,
      simulation: {
        ...prev.simulation,
        [key]: value,
      },
    }))
  }

  function updateLaunch<K extends keyof ClientConfig['launch']>(key: K, value: any) {
    markCustomized()
    setConfig((prev) => ({
      ...prev,
      launch: {
        ...prev.launch,
        [key]: value,
      },
    }))
  }

  function updateStage<K extends keyof ClientStageConfig>(key: K, value: ClientStageConfig[K], stageIndex = 0) {
    markCustomized()
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
        stages,
      }
    })
  }

  function updateAerodynamics<K extends keyof ClientConfig['aerodynamics']>(key: K, value: any) {
    markCustomized()
    setConfig((prev) => ({
      ...prev,
      aerodynamics: {
        ...prev.aerodynamics,
        [key]: value,
      },
    }))
  }

  function updateAttitude<K extends keyof ClientConfig['attitude']>(key: K, value: any) {
    markCustomized()
    setConfig((prev) => ({
      ...prev,
      attitude: {
        ...prev.attitude,
        [key]: value,
      },
    }))
  }

  function updateWind<K extends keyof ClientConfig['wind']>(key: K, value: any) {
    markCustomized()
    setConfig((prev) => ({
      ...prev,
      wind: {
        ...prev.wind,
        [key]: value,
      },
    }))
  }

  const handleLaunchDateChange = (field: 'date' | 'time', value: string) => {
    const current = config.launch.datetime_utc
    const nextDateValue = field === 'date' ? value : launchDateValue
    const nextTimeValue = field === 'time' ? value : launchTimeValue
    const updated = parseDateTimeInputs(nextDateValue, nextTimeValue, current)
    updateLaunch('datetime_utc', updated)
  }

  const toggleStageThrustProfile = (stageIndex: number, checked: boolean) => {
    markCustomized()
    setConfig((prev) => {
      const stages = snapshotStages(prev)
      if (stageIndex >= stages.length) {
        return prev
      }
      const stage = stages[stageIndex]
      const fallbackProfile: ClientTimeSample[] = [
        { time: stage.burn_start_s, value: stage.thrust_constant },
        { time: stage.burn_end_s, value: stage.thrust_constant },
      ]
      const nextProfile = checked
        ? stage.thrust_profile.length > 0
          ? stage.thrust_profile
          : fallbackProfile
        : []
      stages[stageIndex] = {
        ...stage,
        thrust_profile: nextProfile,
      }
      return {
        ...prev,
        stages,
      }
    })
  }

  const toggleStageIspProfile = (stageIndex: number, checked: boolean) => {
    markCustomized()
    setConfig((prev) => {
      const stages = snapshotStages(prev)
      if (stageIndex >= stages.length) {
        return prev
      }
      const stage = stages[stageIndex]
      const fallbackProfile: ClientTimeSample[] = [
        { time: stage.burn_start_s, value: stage.isp_constant },
        { time: stage.burn_end_s, value: stage.isp_constant },
      ]
      const nextProfile = checked
        ? stage.isp_profile.length > 0
          ? stage.isp_profile
          : fallbackProfile
        : []
      stages[stageIndex] = {
        ...stage,
        isp_profile: nextProfile,
      }
      return {
        ...prev,
        stages,
      }
    })
  }

  function toggleCnProfile(checked: boolean) {
    setUseCnProfile(checked)
    markCustomized()
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
    markCustomized()
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
    markCustomized()
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
    markCustomized()
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
      const firstField = validationIssues[0]?.field
      if (firstField) {
        const target = fieldRefs.current[firstField]
        if (target) {
          if (typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
          if (typeof target.focus === 'function') {
            target.focus()
          }
        }
      }
      return
    }
    setLoading(true)
    setError(null)
    try {
      const stagesSnapshot = snapshotStages(config)
      const configSnapshot: ClientConfig = {
        ...config,
        stages: stagesSnapshot,
      }
      const trajectory = await runSimulation(configSnapshot)
      onResult(trajectory, configSnapshot)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  const resetToDefault = () => {
    applyPreset('sample')
  }

  const setVelocityComponent = (index: number, value: number) => {
    const next: [number, number, number] = [...config.launch.velocity_ned_mps] as [number, number, number]
    next[index] = value
    updateLaunch('velocity_ned_mps', next)
  }

  const handleNameChange = (value: string) => {
    markCustomized()
    setConfig((prev) => ({
      ...prev,
      name: value,
    }))
  }

  const toggleStageSection = (stageId: string) => {
    setOpenStageIds((prev) => (prev.includes(stageId) ? prev.filter((value) => value !== stageId) : [...prev, stageId]))
  }

  const handlePresetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const presetId = event.target.value
    if (presetId === 'custom') {
      setSelectedPresetId('custom')
      return
    }
    applyPreset(presetId)
  }

  const handleResetVariations = () => {
    if (!variationsActive) return
    markCustomized()
    setConfig((prev) => {
      const stages = snapshotStages(prev).map((stage) => ({
        ...stage,
        thrust_multiplier: 1,
        isp_multiplier: 1,
      }))
      return {
        ...prev,
        simulation: {
          ...prev.simulation,
          air_density_percent: 0,
        },
        stages,
        aerodynamics: {
          ...prev.aerodynamics,
          cn_multiplier: 1,
          ca_multiplier: 1,
        },
        attitude: {
          ...prev.attitude,
          pitch_offset_deg: 0,
          yaw_offset_deg: 0,
          roll_offset_deg: 0,
          gyro_bias_deg_h: [0, 0, 0],
          profile: [...prev.attitude.profile],
        },
      }
    })
    setShowVariations(false)
    setJsonMessage('Variation parameters reset')
  }

  const handleCopyJson = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonPreview)
        setJsonMessage('Copied configuration to clipboard')
      } else {
        throw new Error('Clipboard access unavailable')
      }
    } catch (err) {
      setJsonMessage(err instanceof Error ? err.message : 'Copy failed')
    }
  }

  const handleDownloadJson = () => {
    if (typeof window === 'undefined') return
    const blob = new Blob([jsonPreview], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeName = config.name?.trim() ? config.name.trim().replace(/\s+/g, '_') : 'simulation-config'
    link.href = url
    link.download = `${safeName}.json`
    link.click()
    URL.revokeObjectURL(url)
    setJsonMessage('Download started')
  }

  const handleTriggerImport = () => {
    fileInputRef.current?.click()
  }

  const handleImportJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as ClientConfig
      markCustomized()
      setConfig(parsed)
      setUseCnProfile(parsed.aerodynamics?.cn_profile?.length > 0)
      setUseCaProfile(parsed.aerodynamics?.ca_profile?.length > 0)
      setUseAttitudeProfile(parsed.attitude?.profile?.length > 0)
      setUseWindProfile(parsed.wind?.profile?.length > 0)
      setShowVariations(detectHasVariations(parsed))
      setJsonMessage('Imported configuration')
      setError(null)
      setSelectedPresetId('custom')
    } catch (err) {
      setJsonMessage(err instanceof Error ? err.message : 'Failed to import JSON')
    } finally {
      event.target.value = ''
    }
  }

  return (
    <form onSubmit={handleRun} noValidate className="flex flex-col gap-6">
      <Card className="overflow-hidden border-0 shadow-soft ring-1 ring-slate-100/60">
        <CardHeader className="space-y-4 bg-linear-to-r from-white via-white to-brand/5">
          <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
            <div className="space-y-2">
              <CardTitle>Simulation setup</CardTitle>
              <CardDescription>
                Configure launch parameters.
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-1.5 sm:w-auto sm:flex-row sm:items-center">
              <Button type="submit" disabled={loading || hasValidationIssues} className="gap-2">
                {loading ? 'Running…' : 'Run'}
              </Button>
              <Button type="button" variant="outline" disabled={loading} onClick={resetToDefault}>
                Reset form
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-[minmax(0,260px)_1fr] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="config-preset">Configuration preset</Label>
              <select
                id="config-preset"
                value={selectedPresetId}
                onChange={handlePresetChange}
                className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-inner focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1"
              >
                {PRESET_OPTIONS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">Custom configuration</option>
              </select>
            </div>
            <p className="min-h-9 text-sm text-slate-600">{presetDescription}</p>
          </div>

          <div className="grid w-full gap-3 md:grid-cols-[minmax(0,260px)_1fr] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="vehicle-name">Vehicle name</Label>
              <Input
                id="vehicle-name"
                value={config.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleNameChange(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

              <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 shadow-inner">
                <div className="space-y-0.5">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monte Carlo</span>
                  <span className="text-sm text-slate-600">Show variations</span>
                </div>
                <Switch id="monte-carlo-toggle" checked={showVariations} onCheckedChange={setShowVariations} />
              </div>
            </div>
          </div>

          {!showVariations && variationsActive && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700">
              <Badge className="bg-amber-100 text-amber-800">Variations active</Badge>
              <span>Hidden variation parameters remain active for this simulation.</span>
              <button
                type="button"
                onClick={handleResetVariations}
                className="rounded border border-amber-200 bg-white px-2 py-1 font-semibold text-amber-700 shadow-xs transition hover:border-amber-300"
              >
                Reset variations
              </button>
            </div>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {hasValidationIssues && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700 shadow-xs">
              <p className="font-semibold">{VALIDATION_ERROR_MESSAGE}</p>
              <ul className="mt-2 space-y-1 text-xs">
                {validationIssues.map((issue) => (
                  <li key={`${issue.field}-${issue.message}`} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-rose-400" />
                    <span>{issue.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Tabs defaultValue="inputs" className="w-full">
            <TabsList className="w-full justify-start bg-slate-100/70">
              <TabsTrigger value="inputs" className="flex-1 sm:flex-none">
                Configuration
              </TabsTrigger>
              <TabsTrigger value="json" className="flex-1 sm:flex-none">
                JSON preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="inputs">
              <Accordion type="single" collapsible defaultValue="mission">
                <AccordionItem value="mission">
                  <AccordionTrigger>Mission basics</AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-3">
                      <div className="section-shell space-y-3">
                        <div>
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Simulation</h4>
                          <p className="text-sm text-slate-600">Define the mission horizon and output cadence.</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                          <NumberField
                            id="simulation-duration"
                            label="Duration [s]"
                            value={config.simulation.duration_s}
                            step="1"
                            min={1}
                            onChange={(value) => updateSimulation('duration_s', value)}
                            hasError={issuesSet.has('simulation.duration_s')}
                            registerRef={makeFieldRef('simulation.duration_s')}
                          />
                          <NumberField
                            id="simulation-output-step"
                            label="Output step [s]"
                            value={config.simulation.output_step_s}
                            step="0.1"
                            min={0.01}
                            onChange={(value) => updateSimulation('output_step_s', value)}
                            hasError={issuesSet.has('simulation.output_step_s')}
                            registerRef={makeFieldRef('simulation.output_step_s')}
                          />
                          {showVariations && (
                            <NumberField
                              id="simulation-air-density"
                              label="Air density variation [%]"
                              value={config.simulation.air_density_percent}
                              step="1"
                              min={-100}
                              max={100}
                              onChange={(value) => updateSimulation('air_density_percent', value)}
                              hasError={issuesSet.has('simulation.air_density_percent')}
                              registerRef={makeFieldRef('simulation.air_density_percent')}
                            />
                          )}
                        </div>
                      </div>

                      <div className="section-shell space-y-3">
                        <div>
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Launch site</h4>
                          <p className="text-sm text-slate-600">Set geodetic coordinates, altitude, and initial velocity.</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                          <NumberField
                            id="launch-latitude"
                            label="Latitude [deg]"
                            value={config.launch.latitude_deg}
                            step="0.0001"
                            min={-90}
                            max={90}
                            onChange={(value) => updateLaunch('latitude_deg', value)}
                            hasError={issuesSet.has('launch.latitude_deg')}
                            registerRef={makeFieldRef('launch.latitude_deg')}
                          />
                          <NumberField
                            id="launch-longitude"
                            label="Longitude [deg]"
                            value={config.launch.longitude_deg}
                            step="0.0001"
                            min={-180}
                            max={180}
                            onChange={(value) => updateLaunch('longitude_deg', value)}
                            hasError={issuesSet.has('launch.longitude_deg')}
                            registerRef={makeFieldRef('launch.longitude_deg')}
                          />
                          <NumberField
                            id="launch-altitude"
                            label="Altitude [m]"
                            value={config.launch.altitude_m}
                            step="1"
                            onChange={(value) => updateLaunch('altitude_m', value)}
                            hasError={issuesSet.has('launch.altitude_m')}
                            registerRef={makeFieldRef('launch.altitude_m')}
                          />
                        </div>

                        <div className="space-y-2.5">
                          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Velocity NED [m/s]</h5>
                          <div className="grid gap-2.5 sm:grid-cols-3">
                            <NumberField
                              id="launch-vel-n"
                              label="North"
                              value={config.launch.velocity_ned_mps[0]}
                              step="0.1"
                              onChange={(value) => setVelocityComponent(0, value)}
                              hasError={issuesSet.has('launch.velocity_ned_mps')}
                              registerRef={makeFieldRef('launch.velocity_ned_mps')}
                            />
                            <NumberField
                              id="launch-vel-e"
                              label="East"
                              value={config.launch.velocity_ned_mps[1]}
                              step="0.1"
                              onChange={(value) => setVelocityComponent(1, value)}
                              hasError={issuesSet.has('launch.velocity_ned_mps')}
                            />
                            <NumberField
                              id="launch-vel-d"
                              label="Down"
                              value={config.launch.velocity_ned_mps[2]}
                              step="0.1"
                              onChange={(value) => setVelocityComponent(2, value)}
                              hasError={issuesSet.has('launch.velocity_ned_mps')}
                            />
                          </div>
                        </div>

                        <div className="space-y-2.5">
                          <h5 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Launch time (UTC)</h5>
                          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                            <div className="space-y-2">
                              <Label htmlFor="launch-date" className={cn(launchDateHasError && 'text-rose-600')}>
                                Date
                              </Label>
                              <Input
                                id="launch-date"
                                type="date"
                                value={launchDateValue}
                                onChange={(event) => handleLaunchDateChange('date', event.target.value)}
                                aria-invalid={launchDateHasError || undefined}
                                ref={makeFieldRef('launch.datetime_utc')}
                                className={cn(
                                  launchDateHasError && 'border-rose-300 bg-rose-50 text-rose-700 focus-visible:ring-rose-300 focus-visible:ring-offset-2',
                                )}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="launch-time" className={cn(launchDateHasError && 'text-rose-600')}>
                                Time
                              </Label>
                              <Input
                                id="launch-time"
                                type="time"
                                step="1"
                                value={launchTimeValue}
                                onChange={(event) => handleLaunchDateChange('time', event.target.value)}
                                aria-invalid={launchDateHasError || undefined}
                                className={cn(
                                  launchDateHasError && 'border-rose-300 bg-rose-50 text-rose-700 focus-visible:ring-rose-300 focus-visible:ring-offset-2',
                                )}
                              />
                            </div>
                          </div>
                          <p className="text-xs text-slate-500">
                            Values are interpreted as UTC. Seconds precision is supported.
                          </p>
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="stages">
                  <AccordionTrigger>Vehicle stages &amp; propulsion</AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-3">
                      <div className="section-shell flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Stage count</h4>
                          <p className="text-sm text-slate-600">Simulate up to {MAX_STAGE_COUNT} stages.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setStageCount(stageCount - 1)} disabled={stageCount <= 1}>
                            -
                          </Button>
                          <Input
                            type="number"
                            value={stageCount}
                            min={1}
                            max={MAX_STAGE_COUNT}
                            onChange={(e) => setStageCount(numberFromInput(e.target.value))}
                            inputMode="numeric"
                            className="h-10 w-20 text-center"
                          />
                          <Button type="button" variant="ghost" size="sm" onClick={() => setStageCount(stageCount + 1)} disabled={stageCount >= MAX_STAGE_COUNT}>
                            +
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {stages.map((stage, idx) => {
                            const stageId = `stage-${idx}`
                            const isOpen = openStageIds.includes(stageId)
                            const burnStart = Number.isFinite(stage.burn_start_s) ? stage.burn_start_s.toFixed(0) : '—'
                            const burnEnd = Number.isFinite(stage.burn_end_s) ? stage.burn_end_s.toFixed(0) : '—'
                            const accent = stageAccentPalette[idx % stageAccentPalette.length]
                            return (
                              <button
                                key={`stage-chip-${stageId}`}
                                type="button"
                                onClick={() => toggleStageSection(stageId)}
                                className={cn(
                                  'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition',
                                  isOpen
                                    ? 'bg-white shadow-xs'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-brand-700',
                                )}
                                style={isOpen ? { borderColor: accent, color: accent } : undefined}
                              >
                                <span className="font-semibold">Stage {idx + 1}</span>
                                <span className="text-[10px] text-slate-500">Burn {burnStart}→{burnEnd}s</span>
                              </button>
                            )
                          })}
                        </div>

                        <Accordion
                          type="multiple"
                          value={openStageIds}
                          onValueChange={setOpenStageIds}
                          className="flex flex-col gap-3"
                        >
                          {stages.map((stageData, idx) => {
                            const stagePrefix = `stage-${idx}`
                            const thrustToggleId = `${stagePrefix}-thrust-profile-toggle`
                            const ispToggleId = `${stagePrefix}-isp-profile-toggle`
                            const useThrustProfileStage = stageData.thrust_profile.length > 0
                            const useIspProfileStage = stageData.isp_profile.length > 0
                            const stageFieldKey = (field: string) =>
                              idx === 0 ? `stage.${field}` : `stage[${idx + 1}].${field}`
                            const stageHasError = (field: string) => issuesSet.has(stageFieldKey(field))
                            const stageMass = Number.isFinite(stageData.mass_initial_kg)
                              ? `${stageData.mass_initial_kg.toFixed(0)} kg`
                              : '—'
                            return (
                              <AccordionItem
                                key={stagePrefix}
                                value={stagePrefix}
                                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs shadow-slate-200/60"
                              >
                                <AccordionTrigger className="px-4 py-2.5 text-left">
                                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                                    <div className="flex items-center gap-3">
                                      <Badge className="bg-slate-900 text-white">Stage {idx + 1}</Badge>
                                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                        Mass {stageMass}
                                      </span>
                                    </div>
                                    <span className="text-xs text-slate-500">Tap to {openStageIds.includes(stagePrefix) ? 'collapse' : 'expand'}</span>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent>
                                  <div className="space-y-4 px-4 pb-4">
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                      <NumberField
                                        id={`${stagePrefix}-mass`}
                                        label="Initial mass [kg]"
                                        value={stageData.mass_initial_kg}
                                        step="1"
                                        min={0}
                                        onChange={(value) => updateStage('mass_initial_kg', value, idx)}
                                        hasError={stageHasError('mass_initial_kg')}
                                        registerRef={makeFieldRef(stageFieldKey('mass_initial_kg'))}
                                      />
                                      <SelectField
                                        id={`${stagePrefix}-power-mode`}
                                        label="Power flight mode"
                                        value={stageData.power_mode}
                                        options={POWER_MODE_OPTIONS}
                                        onChange={(value) => updateStage('power_mode', value as ClientStageConfig['power_mode'], idx)}
                                        hasError={stageHasError('power_mode')}
                                        registerRef={makeFieldRef(stageFieldKey('power_mode'))}
                                      />
                                      <SelectField
                                        id={`${stagePrefix}-free-mode`}
                                        label="Free flight mode"
                                        value={stageData.free_mode}
                                        options={FREE_MODE_OPTIONS}
                                        onChange={(value) => updateStage('free_mode', value as ClientStageConfig['free_mode'], idx)}
                                        hasError={stageHasError('free_mode')}
                                        registerRef={makeFieldRef(stageFieldKey('free_mode'))}
                                      />
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                      <NumberField
                                        id={`${stagePrefix}-burn-start`}
                                        label="Burn start [s]"
                                        value={stageData.burn_start_s}
                                        step="0.1"
                                        onChange={(value) => updateStage('burn_start_s', value, idx)}
                                        hasError={stageHasError('burn_start_s')}
                                        registerRef={makeFieldRef(stageFieldKey('burn_start_s'))}
                                      />
                                      <NumberField
                                        id={`${stagePrefix}-burn-end`}
                                        label="Burn end [s]"
                                        value={stageData.burn_end_s}
                                        step="0.1"
                                        onChange={(value) => updateStage('burn_end_s', value, idx)}
                                        hasError={stageHasError('burn_end_s')}
                                        registerRef={makeFieldRef(stageFieldKey('burn_end_s'))}
                                      />
                                      <NumberField
                                        id={`${stagePrefix}-forced-cutoff`}
                                        label="Forced cutoff [s]"
                                        value={stageData.forced_cutoff_s}
                                        step="0.1"
                                        onChange={(value) => updateStage('forced_cutoff_s', value, idx)}
                                        hasError={stageHasError('forced_cutoff_s')}
                                        registerRef={makeFieldRef(stageFieldKey('forced_cutoff_s'))}
                                      />
                                      <NumberField
                                        id={`${stagePrefix}-separation-time`}
                                        label="Separation time [s]"
                                        value={stageData.separation_time_s}
                                        step="0.1"
                                        onChange={(value) => updateStage('separation_time_s', value, idx)}
                                        hasError={stageHasError('separation_time_s')}
                                        registerRef={makeFieldRef(stageFieldKey('separation_time_s'))}
                                      />
                                    </div>

                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                      <NumberField
                                        id={`${stagePrefix}-throat-diameter`}
                                        label="Throat diameter [m]"
                                        value={stageData.throat_diameter_m}
                                        step="0.001"
                                        onChange={(value) => updateStage('throat_diameter_m', value, idx)}
                                        hasError={stageHasError('throat_diameter_m')}
                                        registerRef={makeFieldRef(stageFieldKey('throat_diameter_m'))}
                                      />
                                      <NumberField
                                        id={`${stagePrefix}-nozzle-expansion`}
                                        label="Nozzle expansion ratio"
                                        value={stageData.nozzle_expansion_ratio}
                                        step="0.1"
                                        onChange={(value) => updateStage('nozzle_expansion_ratio', value, idx)}
                                        hasError={stageHasError('nozzle_expansion_ratio')}
                                        registerRef={makeFieldRef(stageFieldKey('nozzle_expansion_ratio'))}
                                      />
                                      <NumberField
                                        id={`${stagePrefix}-nozzle-exit-pressure`}
                                        label="Nozzle exit pressure [Pa]"
                                        value={stageData.nozzle_exit_pressure_pa}
                                        step="10"
                                        onChange={(value) => updateStage('nozzle_exit_pressure_pa', value, idx)}
                                        hasError={stageHasError('nozzle_exit_pressure_pa')}
                                        registerRef={makeFieldRef(stageFieldKey('nozzle_exit_pressure_pa'))}
                                      />
                                    </div>

                                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-inner">
                                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                                        <div>
                                          <h5 className="text-sm font-semibold text-slate-800">Thrust curve</h5>
                                          <p className="text-xs text-slate-500">Provide constant vacuum thrust or import a CSV time-series.</p>
                                        </div>
                                        <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-xs">
                                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profile</span>
                                          <Switch
                                            id={thrustToggleId}
                                            checked={useThrustProfileStage}
                                            onCheckedChange={(checked) => toggleStageThrustProfile(idx, checked)}
                                          />
                                        </div>
                                      </div>

                                      {useThrustProfileStage ? (
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
                                      ) : (
                                        <NumberField
                                          id={`${stagePrefix}-thrust-constant`}
                                          label="Const thrust vac [N]"
                                          value={stageData.thrust_constant}
                                          step="10"
                                          onChange={(value) => updateStage('thrust_constant', value, idx)}
                                          hasError={stageHasError('thrust_constant')}
                                          registerRef={makeFieldRef(stageFieldKey('thrust_constant'))}
                                        />
                                      )}

                                      {showVariations && (
                                        <NumberField
                                          id={`${stagePrefix}-thrust-multiplier`}
                                          label="Thrust multiplier"
                                          value={stageData.thrust_multiplier}
                                          step="0.01"
                                          onChange={(value) => updateStage('thrust_multiplier', value, idx)}
                                          hasError={stageHasError('thrust_multiplier')}
                                          registerRef={makeFieldRef(stageFieldKey('thrust_multiplier'))}
                                        />
                                      )}
                                    </div>

                                    <div className="space-y-3 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-inner">
                                      <div className="flex flex-wrap items-center justify-between gap-2.5">
                                        <div>
                                          <h5 className="text-sm font-semibold text-slate-800">Specific impulse</h5>
                                          <p className="text-xs text-slate-500">Set a constant vacuum Isp or provide a profile.</p>
                                        </div>
                                        <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-xs">
                                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profile</span>
                                          <Switch
                                            id={ispToggleId}
                                            checked={useIspProfileStage}
                                            onCheckedChange={(checked) => toggleStageIspProfile(idx, checked)}
                                          />
                                        </div>
                                      </div>

                                      {useIspProfileStage ? (
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
                                      ) : (
                                        <NumberField
                                          id={`${stagePrefix}-isp-constant`}
                                          label="Const Isp vac [s]"
                                          value={stageData.isp_constant}
                                          step="0.1"
                                          onChange={(value) => updateStage('isp_constant', value, idx)}
                                          hasError={stageHasError('isp_constant')}
                                          registerRef={makeFieldRef(stageFieldKey('isp_constant'))}
                                        />
                                      )}

                                      {showVariations && (
                                        <NumberField
                                          id={`${stagePrefix}-isp-multiplier`}
                                          label="Isp multiplier"
                                          value={stageData.isp_multiplier}
                                          step="0.01"
                                          onChange={(value) => updateStage('isp_multiplier', value, idx)}
                                          hasError={stageHasError('isp_multiplier')}
                                          registerRef={makeFieldRef(stageFieldKey('isp_multiplier'))}
                                        />
                                      )}
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            )
                          })}
                        </Accordion>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="environment">
                  <AccordionTrigger>Environment &amp; guidance</AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-3">
                      <div className="section-shell space-y-3">
                        <div className="flex flex-col gap-2">
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Aerodynamics</h4>
                          <p className="text-sm text-slate-600">Adjust reference geometry and optional Mach profiles.</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <NumberField
                            id="aero-body-diameter"
                            label="Body diameter [m]"
                            value={config.aerodynamics.body_diameter_m}
                            step="0.01"
                            onChange={(value) => updateAerodynamics('body_diameter_m', value)}
                            hasError={issuesSet.has('aerodynamics.body_diameter_m')}
                            registerRef={makeFieldRef('aerodynamics.body_diameter_m')}
                          />
                          <NumberField
                            id="aero-ballistic"
                            label="Ballistic coefficient [kg/m²]"
                            value={config.aerodynamics.ballistic_coefficient}
                            step="0.1"
                            onChange={(value) => updateAerodynamics('ballistic_coefficient', value)}
                            hasError={issuesSet.has('aerodynamics.ballistic_coefficient')}
                            registerRef={makeFieldRef('aerodynamics.ballistic_coefficient')}
                          />
                          <NumberField
                            id="aero-cn-constant"
                            label="Normal force coefficient (CNa)"
                            value={config.aerodynamics.cn_constant}
                            step="0.01"
                            onChange={(value) => updateAerodynamics('cn_constant', value)}
                            hasError={issuesSet.has('aerodynamics.cn_constant')}
                            registerRef={makeFieldRef('aerodynamics.cn_constant')}
                          />
                          {showVariations && (
                            <NumberField
                              id="aero-cn-multiplier"
                              label="CNa multiplier"
                              value={config.aerodynamics.cn_multiplier}
                              step="0.01"
                              onChange={(value) => updateAerodynamics('cn_multiplier', value)}
                              hasError={issuesSet.has('aerodynamics.cn_multiplier')}
                              registerRef={makeFieldRef('aerodynamics.cn_multiplier')}
                            />
                          )}
                          <NumberField
                            id="aero-ca-constant"
                            label="Axial force coefficient (CA)"
                            value={config.aerodynamics.ca_constant}
                            step="0.01"
                            onChange={(value) => updateAerodynamics('ca_constant', value)}
                            hasError={issuesSet.has('aerodynamics.ca_constant')}
                            registerRef={makeFieldRef('aerodynamics.ca_constant')}
                          />
                          {showVariations && (
                            <NumberField
                              id="aero-ca-multiplier"
                              label="CA multiplier"
                              value={config.aerodynamics.ca_multiplier}
                              step="0.01"
                              onChange={(value) => updateAerodynamics('ca_multiplier', value)}
                              hasError={issuesSet.has('aerodynamics.ca_multiplier')}
                              registerRef={makeFieldRef('aerodynamics.ca_multiplier')}
                            />
                          )}
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          <SwitchField
                            id="cn-profile-toggle"
                            label="Use CNa profile"
                            description="Upload Mach table for the normal force coefficient."
                            checked={useCnProfile}
                            onCheckedChange={toggleCnProfile}
                          />
                          <SwitchField
                            id="ca-profile-toggle"
                            label="Use CA profile"
                            description="Upload Mach table for the axial force coefficient."
                            checked={useCaProfile}
                            onCheckedChange={toggleCaProfile}
                          />
                        </div>
                        <div className="grid gap-3">
                          {useCnProfile && (
                            <EditableTable<ClientMachSample>
                              title="CNa profile"
                              columns={[
                                { key: 'mach', label: 'Mach [-]', step: '0.01', min: 0 },
                                { key: 'value', label: 'CNa [-]', step: '0.01' },
                              ]}
                              rows={config.aerodynamics.cn_profile}
                              onChange={(rows) => updateAerodynamics('cn_profile', rows)}
                              addLabel="Add CNa sample"
                            />
                          )}
                          {useCaProfile && (
                            <EditableTable<ClientMachSample>
                              title="CA profile"
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

                      <div className="section-shell space-y-3">
                        <div>
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Attitude guidance</h4>
                          <p className="text-sm text-slate-600">Set default pointing or provide a trajectory profile.</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                          <NumberField
                            id="attitude-elevation"
                            label="Elevation [deg]"
                            value={config.attitude.elevation_deg}
                            step="0.1"
                            onChange={(value) => updateAttitude('elevation_deg', value)}
                            hasError={issuesSet.has('attitude.elevation_deg')}
                            registerRef={makeFieldRef('attitude.elevation_deg')}
                          />
                          <NumberField
                            id="attitude-azimuth"
                            label="Azimuth [deg]"
                            value={config.attitude.azimuth_deg}
                            step="0.1"
                            onChange={(value) => updateAttitude('azimuth_deg', value)}
                            hasError={issuesSet.has('attitude.azimuth_deg')}
                            registerRef={makeFieldRef('attitude.azimuth_deg')}
                          />
                          {showVariations && (
                            <NumberField
                              id="attitude-pitch"
                              label="Pitch offset [deg]"
                              value={config.attitude.pitch_offset_deg}
                              step="0.1"
                              onChange={(value) => updateAttitude('pitch_offset_deg', value)}
                              hasError={issuesSet.has('attitude.pitch_offset_deg')}
                              registerRef={makeFieldRef('attitude.pitch_offset_deg')}
                            />
                          )}
                          {showVariations && (
                            <NumberField
                              id="attitude-yaw"
                              label="Yaw offset [deg]"
                              value={config.attitude.yaw_offset_deg}
                              step="0.1"
                              onChange={(value) => updateAttitude('yaw_offset_deg', value)}
                              hasError={issuesSet.has('attitude.yaw_offset_deg')}
                              registerRef={makeFieldRef('attitude.yaw_offset_deg')}
                            />
                          )}
                          {showVariations && (
                            <NumberField
                              id="attitude-roll"
                              label="Roll offset [deg]"
                              value={config.attitude.roll_offset_deg}
                              step="0.1"
                              onChange={(value) => updateAttitude('roll_offset_deg', value)}
                              hasError={issuesSet.has('attitude.roll_offset_deg')}
                              registerRef={makeFieldRef('attitude.roll_offset_deg')}
                            />
                          )}
                        </div>
                        {showVariations && (
                          <div className="grid gap-3 sm:grid-cols-3">
                            {(['x', 'y', 'z'] as const).map((axis, axisIdx) => {
                              const biasKey = `attitude.gyro_bias_deg_h[${axisIdx}]`
                              return (
                                <NumberField
                                  key={`gyro-${axis}`}
                                  id={`gyro-${axis}`}
                                  label={`Gyro bias ${axis.toUpperCase()} [deg/h]`}
                                  value={config.attitude.gyro_bias_deg_h[axisIdx]}
                                  step="0.01"
                                  onChange={(value) => {
                                    const next: [number, number, number] = [...config.attitude.gyro_bias_deg_h] as [number, number, number]
                                    next[axisIdx] = value
                                    updateAttitude('gyro_bias_deg_h', next)
                                  }}
                                  hasError={issuesSet.has(biasKey)}
                                  registerRef={makeFieldRef(biasKey)}
                                />
                              )
                            })}
                          </div>
                        )}
                        <SwitchField
                          id="attitude-profile-toggle"
                          label="Use attitude profile"
                          description="Upload azimuth/elevation waypoints over time."
                          checked={useAttitudeProfile}
                          onCheckedChange={toggleAttitudeProfile}
                        />
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

                      <div className="section-shell space-y-3">
                        <div>
                          <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Wind</h4>
                          <p className="text-sm text-slate-600">Select a constant wind vector or altitude profile.</p>
                        </div>
                        <SwitchField
                          id="wind-profile-toggle"
                          label="Use wind profile"
                          description="Upload altitude vs. wind speed/direction table."
                          checked={useWindProfile}
                          onCheckedChange={toggleWindProfile}
                        />
                        {!useWindProfile && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <NumberField
                              id="wind-speed"
                              label="Constant wind speed [m/s]"
                              value={config.wind.speed_mps}
                              step="0.1"
                              min={0}
                              onChange={(value) => updateWind('speed_mps', value)}
                              hasError={issuesSet.has('wind.speed_mps')}
                              registerRef={makeFieldRef('wind.speed_mps')}
                            />
                            <NumberField
                              id="wind-direction"
                              label="Direction (from) [deg]"
                              value={config.wind.direction_deg}
                              step="1"
                              min={0}
                              max={360}
                              onChange={(value) => updateWind('direction_deg', value)}
                              hasError={issuesSet.has('wind.direction_deg')}
                              registerRef={makeFieldRef('wind.direction_deg')}
                            />
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
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </TabsContent>

            <TabsContent value="json">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 shadow-inner">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-700">{jsonSummaryLabel}</h4>
                  {jsonMessage && <span className="text-xs text-slate-500">{jsonMessage}</span>}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={handleCopyJson}>
                    Copy JSON
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={handleDownloadJson}>
                    Download JSON
                  </Button>
                  <Button type="button" size="sm" onClick={handleTriggerImport}>
                    Import JSON
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={handleImportJson}
                  />
                </div>
                <pre className="mt-4 max-h-[360px] overflow-auto rounded-xl bg-slate-950/95 p-4 text-xs leading-relaxed text-slate-100 shadow-inner">
                  {jsonPreview}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-xs">
          {error}
        </div>
      )}
    </form>
  )
}
