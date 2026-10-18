// Checks of the configuration for the editor, with localized messages. The
// fields are the JSON paths the solver's validator reports
// (src/config/validate.rs), e.g. `stages[1].engine.burn_end_s`, so an issue
// from either side points at the same input.
import type { Config, Curve, FileTable } from './config'
import { isFileTable, isRows, isValidDateTime } from './config'
import { tr } from './i18n'

export interface ValidationIssue {
  field: string
  message: string
}

export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

type Push = (field: string, message: string) => void

interface Requirement {
  ja: string
  en: string
}

/** Rows with ascending first column and every value passing `ok`; reports the first problem. */
function checkRows(rows: number[][], push: Push, field: string, name: string, ok: (v: number) => boolean, requirement: Requirement) {
  let prev = -Infinity
  for (const row of rows) {
    if (!row.every(isFiniteNumber)) {
      push(field, tr(`${name}に数値以外が含まれています。`, `${name} contains values that are not numbers.`))
      return
    }
    if (row[0] < prev) {
      push(field, tr(`${name}の1列目は昇順に並べてください。`, `${name}: the first column must be in ascending order.`))
      return
    }
    if (!row.slice(1).every(ok)) {
      push(field, tr(`${name}の値は${requirement.ja}にしてください。`, `${name} values must be ${requirement.en}.`))
      return
    }
    prev = row[0]
  }
  if (rows.length === 0) push(field, tr(`${name}に行がありません。`, `${name} has no rows.`))
}

const ANY: [(v: number) => boolean, Requirement] = [() => true, { ja: '数値', en: 'numbers' }]
const NON_NEGATIVE: [(v: number) => boolean, Requirement] = [(v) => v >= 0, { ja: '0以上', en: '0 or greater' }]
const POSITIVE: [(v: number) => boolean, Requirement] = [(v) => v > 0, { ja: '正の値', en: 'positive' }]

/** A curve: a constant passing the check, or a valid table. Files cannot be read in the browser. */
function checkCurve(c: Curve | undefined, push: Push, field: string, name: string, [ok, req]: [(v: number) => boolean, Requirement]) {
  if (c === undefined) return
  if (typeof c === 'number') {
    if (!isFiniteNumber(c) || !ok(c)) push(field, tr(`${name}は${req.ja}にしてください。`, `${name} must be ${req.en}.`))
  } else if (isRows(c)) {
    checkRows(c, push, field, tr(`${name}のテーブル`, `${name} table`), ok, req)
  } else if (isFileTable(c)) {
    fileIssue(c, push, field)
  }
}

function fileIssue(f: FileTable, push: Push, field: string) {
  push(
    field,
    tr(
      `CSVファイル（${f.file}）はブラウザでは読めません。表に読み込んでください。`,
      `The CSV file (${f.file}) cannot be read in the browser; load it into a table.`,
    ),
  )
}

function checkRequired(v: number | undefined, push: Push, field: string, ok: boolean, ja: string, en: string) {
  if (!isFiniteNumber(v) || !ok) push(field, tr(ja, en))
}

export function validateConfig(config: Config): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const push: Push = (field, message) => issues.push({ field, message })

  const sim = config.simulation
  checkRequired(
    sim.end_time_s,
    push,
    'simulation.end_time_s',
    sim.end_time_s > 0,
    '計算時間は正の値にしてください。',
    'Simulation time must be positive.',
  )
  if (sim.end_time_s > 24 * 3600)
    push('simulation.end_time_s', tr('計算時間は24時間以内で指定してください。', 'Simulation time must be 24 hours or less.'))
  const step = sim.output_step_s ?? 1
  checkRequired(step, push, 'simulation.output_step_s', step > 0, '出力間隔は正の値にしてください。', 'Output interval must be positive.')
  if (step > sim.end_time_s)
    push('simulation.output_step_s', tr('出力間隔は計算時間以下にしてください。', 'Output interval must not exceed the simulation time.'))
  const integ = sim.integrator
  if (integ?.method === 'rk4' && integ.step_s !== undefined) {
    checkRequired(
      integ.step_s,
      push,
      'simulation.integrator.step_s',
      integ.step_s > 0,
      'RK4の刻み幅は正の値にしてください。',
      'RK4 step size must be positive.',
    )
  }
  if (integ?.method === 'rk45') {
    for (const key of ['abs_tol', 'rel_tol'] as const) {
      const tol = integ[key]
      if (tol !== undefined && (!isFiniteNumber(tol) || tol <= 0))
        push(`simulation.integrator.${key}`, tr('RK45の許容誤差は正の値にしてください。', 'RK45 tolerances must be positive.'))
    }
  }

  const launch = config.launch
  const lat = launch.latitude_deg
  checkRequired(
    lat,
    push,
    'launch.latitude_deg',
    Math.abs(lat) <= 90,
    '緯度は-90〜90度の範囲で指定してください。',
    'Latitude must be between -90 and 90°.',
  )
  const lon = launch.longitude_deg
  checkRequired(
    lon,
    push,
    'launch.longitude_deg',
    Math.abs(lon) <= 180,
    '経度は-180〜180度の範囲で指定してください。',
    'Longitude must be between -180 and 180°.',
  )
  const alt = launch.altitude_m ?? 0
  checkRequired(
    alt,
    push,
    'launch.altitude_m',
    alt >= -500 && alt <= 100000,
    '発射高度は-500〜100000 mの範囲で指定してください。',
    'Launch altitude must be between -500 and 100,000 m.',
  )
  const rail = launch.rail_length_m ?? 0
  checkRequired(rail, push, 'launch.rail_length_m', rail >= 0, 'レール長は0以上で指定してください。', 'Rail length must be 0 or greater.')
  const vel = launch.velocity_ned_mps ?? [0, 0, 0]
  if (!vel.every(isFiniteNumber)) {
    push(
      'launch.velocity_ned_mps',
      tr('初期速度ベクトルに数値以外が含まれています。', 'Initial velocity vector contains non-numeric values.'),
    )
  } else if (Math.hypot(...vel) > 5000) {
    push('launch.velocity_ned_mps', tr('初期速度は5,000 m/s以下にしてください。', 'Initial velocity must be 5,000 m/s or less.'))
  }
  if (launch.time_utc !== undefined && !isValidDateTime(launch.time_utc)) {
    push(
      'launch.time_utc',
      tr('発射日時が不正です。存在する日時を指定してください。', 'Invalid launch date/time. Enter a date and time that exists.'),
    )
  }

  const atm = config.atmosphere
  const seasonal = atm?.seasonal_variation_percent ?? 0
  checkRequired(
    seasonal,
    push,
    'atmosphere.seasonal_variation_percent',
    Math.abs(seasonal) <= 100,
    '大気密度の変動は-100〜100%の範囲で指定してください。',
    'Air density variation must be between -100 and 100%.',
  )
  const dev = atm?.density_deviation
  if (isRows(dev)) {
    checkRows(dev, push, 'atmosphere.density_deviation', tr('密度変動テーブル', 'Density table'), (v) => v > -100, {
      ja: '-100%より大きい値',
      en: 'above -100%',
    })
  } else if (isFileTable(dev)) fileIssue(dev, push, 'atmosphere.density_deviation')

  const wind = config.wind
  const ws = wind?.speed_mps ?? 0
  checkRequired(ws, push, 'wind.speed_mps', ws >= 0, '風速は0以上で指定してください。', 'Wind speed must be 0 or greater.')
  const wd = wind?.direction_deg ?? 0
  checkRequired(wd, push, 'wind.direction_deg', true, '風向は数値で指定してください。', 'Wind direction must be a number.')
  if (isRows(wind?.profile)) {
    checkRows(wind.profile as number[][], push, 'wind.profile', tr('高度別の風', 'Wind table'), (v) => v >= 0, {
      ja: '0以上',
      en: '0 or greater',
    })
  } else if (isFileTable(wind?.profile)) fileIssue(wind!.profile as FileTable, push, 'wind.profile')

  const att = config.attitude ?? {}
  checkCurve(att.azimuth_deg, push, 'attitude.azimuth_deg', tr('方位角', 'Azimuth'), ANY)
  checkCurve(att.elevation_deg, push, 'attitude.elevation_deg', tr('仰角', 'Elevation'), [
    (v) => Math.abs(v) <= 90,
    { ja: '-90〜90度', en: 'between -90 and 90°' },
  ])
  checkCurve(att.roll_deg, push, 'attitude.roll_deg', tr('ロール角', 'Roll'), ANY)
  for (const [key, limit] of [
    ['pitch_offset_deg', 45],
    ['yaw_offset_deg', 45],
    ['roll_offset_deg', 180],
  ] as const) {
    const v = att[key] ?? 0
    if (!isFiniteNumber(v) || Math.abs(v) > limit)
      push(`attitude.${key}`, tr(`姿勢の誤差は±${limit}度以内にしてください。`, `Attitude errors must be within ±${limit}°.`))
  }
  if (!(att.gyro_bias_deg_h ?? [0, 0, 0]).every((b) => isFiniteNumber(b) && Math.abs(b) <= 100))
    push('attitude.gyro_bias_deg_h', tr('ジャイロバイアスは±100 deg/h以内にしてください。', 'Gyro bias must be within ±100 deg/h.'))

  if (config.stages.length === 0) push('stages', tr('少なくとも1段は設定してください。', 'Configure at least one stage.'))
  config.stages.forEach((_, i) => validateStage(config, i, push))
  return issues
}

function validateStage(config: Config, i: number, push: Push) {
  const stage = config.stages[i]
  const last = i === config.stages.length - 1
  const p = (key: string) => `stages[${i}].${key}`
  // Messages of later stages name the stage
  const msg = (ja: string, en: string) => (i > 0 ? tr(`${i + 1}段の${ja}`, `Stage ${i + 1}: ${en}`) : tr(ja, en))
  const name = (ja: string, en: string) => (i > 0 ? tr(`${i + 1}段の${ja}`, `Stage ${i + 1} ${en}`) : tr(ja, en))

  const mass = stage.mass_initial_kg
  if (!isFiniteNumber(mass) || mass <= 0)
    push(p('mass_initial_kg'), msg('初期質量は正の値にしてください。', 'Initial mass must be positive.'))
  const dry = stage.mass_dry_kg
  if (dry !== undefined && (!isFiniteNumber(dry) || dry < 0 || dry > mass))
    push(p('mass_dry_kg'), msg('乾燥質量は0から初期質量の間にしてください。', 'Dry mass must be between 0 and the initial mass.'))

  const sep = stage.separation_time_s
  if (!last && (!isFiniteNumber(sep) || sep < 0))
    push(p('separation_time_s'), msg('分離時刻は0秒以上にしてください。', 'Separation time must be 0 s or later.'))

  const e = stage.engine
  if (e) {
    const start = e.burn_start_s ?? 0
    if (!isFiniteNumber(start) || start < 0)
      push(p('engine.burn_start_s'), msg('燃焼開始時刻は0秒以上にしてください。', 'Ignition time must be 0 s or later.'))
    if (!isFiniteNumber(e.burn_end_s) || e.burn_end_s <= start)
      push(p('engine.burn_end_s'), msg('燃焼終了時刻は燃焼開始より後にしてください。', 'Burnout time must be after ignition.'))
    checkCurve(e.thrust_vac_n, push, p('engine.thrust_vac_n'), name('推力', 'thrust'), NON_NEGATIVE)
    checkCurve(e.isp_vac_s, push, p('engine.isp_vac_s'), name('比推力', 'Isp'), POSITIVE)
    const area = e.nozzle_exit_area_m2 ?? 0
    if (!isFiniteNumber(area) || area < 0)
      push(p('engine.nozzle_exit_area_m2'), msg('ノズル出口面積は0以上にしてください。', 'Nozzle exit area must be 0 or greater.'))
  }

  const a = stage.aero ?? {}
  const d = a.diameter_m ?? 0.5
  if (!isFiniteNumber(d) || d <= 0) push(p('aero.diameter_m'), msg('機体直径は正の値にしてください。', 'Body diameter must be positive.'))
  const beta = a.ballistic_coefficient_kg_m2 ?? 100
  if (!isFiniteNumber(beta) || beta <= 0)
    push(p('aero.ballistic_coefficient_kg_m2'), msg('弾道係数は正の値にしてください。', 'Ballistic coefficient must be positive.'))
  checkCurve(a.ca, push, p('aero.ca'), name('軸力係数 CA', 'CA'), NON_NEGATIVE)
  checkCurve(a.ca_power_off, push, p('aero.ca_power_off'), name('燃焼していないときの CA', 'engine-off CA'), NON_NEGATIVE)
  checkCurve(a.cn_alpha_per_rad, push, p('aero.cn_alpha_per_rad'), name('法線力係数 CNα', 'CNα'), ANY)
  if (a.cn_table && isFileTable(a.cn_table)) fileIssue(a.cn_table, push, p('aero.cn_table'))

  const end = last ? Infinity : (sep ?? Infinity)
  ;(stage.jettisons ?? []).forEach((j, k) => {
    const q = (key: string) => p(`jettisons[${k}].${key}`)
    if (!isFiniteNumber(j.time_s) || j.time_s <= 0 || j.time_s >= end)
      push(
        q('time_s'),
        msg(
          '投棄物の分離時刻は段の開始後、分離前にしてください。',
          'Jettison time must be after the stage start and before its separation.',
        ),
      )
    if (!isFiniteNumber(j.mass_kg) || j.mass_kg <= 0 || j.mass_kg >= mass)
      push(
        q('mass_kg'),
        msg('投棄物の質量は正で、段の質量より小さくしてください。', 'Jettisoned mass must be positive and less than the stage mass.'),
      )
    const jb = j.ballistic_coefficient_kg_m2 ?? 100
    if (!isFiniteNumber(jb) || jb <= 0)
      push(
        q('ballistic_coefficient_kg_m2'),
        msg('投棄物の弾道係数は正の値にしてください。', 'Jettisoned body ballistic coefficient must be positive.'),
      )
    if (!(j.delta_v_ned_mps ?? [0, 0, 0]).every(isFiniteNumber))
      push(q('delta_v_ned_mps'), msg('投棄時の追加速度は数値にしてください。', 'Jettison velocity must be numbers.'))
  })
}
