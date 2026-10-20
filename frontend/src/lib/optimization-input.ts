import Ajv2020 from 'ajv/dist/2020.js'
import type { ErrorObject, ValidateFunction } from 'ajv'
import schema from './optimization-schema.json'
import type { Config } from './config'
import { isValidDateTime } from './config'
import { tr } from './i18n'
import { phaseLabel } from './optimization-vehicle'

export interface NumericDraft {
  text: string
  scale: number
  integer?: boolean
}
export function numericDraftValue(draft: NumericDraft): number | null {
  const raw = draft.text.trim()
  if (raw.includes(',') && !/^[+-]?\d{1,3}(?:,\d{3})+(?:\.\d*)?(?:e[+-]?\d+)?$/i.test(raw)) return null
  const text = raw.replace(/,/g, '')
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null
  const n = Number(text) * draft.scale
  return Number.isFinite(n) && (!draft.integer || Number.isInteger(n)) ? n : null
}
export interface Bounds {
  initial: number
  lower: number
  upper: number
}
export interface SolverSettings {
  max_iterations?: number
  tolerance?: number
  derivative_test?: boolean
  stop_after_iteration?: number | null
  hessian?: 'limited_memory' | 'exact'
  kkt_scaling?: 'upstream_default' | 'none' | 'ruiz' | 'slack_based'
  scaling?: {
    strategy?: 's0' | 's1_bounds' | 's1_guess' | 's2' | 's3'
    floor?: number
    cap?: number
    gradient_max?: number
    gradient_min?: number
  }
}
export interface FlightTolerances {
  position_m: number
  velocity_m_s: number
  mass_kg: number
  dynamic_pressure_pa: number
  angle_of_attack_deg: number
  specific_force_m_s2: number
  pitch_rate_deg_s: number
}
export interface StageInventory {
  dry_kg: number
  propellant_kg: number
  reserve_kg: number
  max_total_burn_s: number
  max_ignitions: number
  source: string
}
export type EndEvent = 'none' | 'separate_stage' | 'jettison_fairing' | 'deploy_payload'
export interface OptimizationPhase {
  name: string
  stage: number
  mode: 'burn' | 'coast'
  duration_s: Bounds
  intervals: number
  vertical: boolean
  end_event: EndEvent
  max_angle_of_attack_deg: number
  max_specific_force_m_s2: number
  min_altitude_m: number
  initial_attitude_end_deg: [number, number]
}
interface RocketProblem {
  vehicle: Config
  data_source: string
  degree: number
  validation: FlightTolerances
  max_dynamic_pressure_pa: number
}
export interface InitialGuess {
  net_payload_kg: number
  phase_durations_s: number[]
  samples: { phase: number; time_s: number; state_eci: number[]; azimuth_deg: number; elevation_deg: number }[]
}
export interface MultiStageInput extends RocketProblem {
  kind: 'multi_stage'
  /** Warm start from an earlier trajectory of the same phase layout. */
  initial_guess?: InitialGuess
  stages: StageInventory[]
  phases: OptimizationPhase[]
  net_payload_kg: Bounds
  payload_adapter_kg: number
  fairing_kg: number
  fairing_off_area_scale: number
  fairing_release_min_altitude_m: number
  initial_azimuth_deg: number
  azimuth_bounds_deg: [number, number]
  elevation_bounds_deg: [number, number]
  max_azimuth_rate_deg_s: number
  max_elevation_rate_deg_s: number
  max_inertial_direction_rate_deg_s: number
  orbit: {
    reference_radius_m: number
    altitude_m: number
    inclination_deg: number
    radius_tolerance_m: number
    speed_tolerance_m_s: number
    radial_velocity_tolerance_m_s: number
    inclination_tolerance_deg: number
    apsis_tolerance_m: number
  }
}
export interface SingleStageInput extends RocketProblem {
  kind: 'single_stage'
  dry_mass_kg: number
  propellant_mass_kg: number
  reserve_propellant_kg: number
  additional_payload_kg: Bounds
  coast_duration_s: Bounds
  vertical_ascent_s: number
  azimuth_deg: number
  target_apogee_altitude_m: number
  minimum_downrange_m: number
  minimum_pitch_deg: number
  initial_pitch_end_deg: number
  max_angle_of_attack_deg: number
  max_specific_force_m_s2: number
  max_pitch_rate_deg_s: number
  burn_intervals: number
  coast_intervals: number
}
export interface DoubleIntegratorInput {
  kind: 'double_integrator'
  distance_m: number
  duration_s: Bounds
  time_cost: number
  intervals: number
  degree: number
  position_tolerance_m: number
  velocity_tolerance_m_s: number
}
export type OptimizationProblem = MultiStageInput | SingleStageInput | DoubleIntegratorInput | { kind: 'hs071' }
export interface OptimizationInput {
  schema_version: number
  run_id: string
  problem: OptimizationProblem
  solver?: SolverSettings
}
export type EditorSection = 'mission' | 'vehicle' | 'sequence' | 'constraints' | 'numerics' | 'json'
export interface InputIssue {
  path: string
  message: string
}
export interface PhaseView {
  name: string
  stage: number
  powered: boolean
  fixed: boolean
  start: number
  duration: number
  end: number
  event: EndEvent
  path: string
}

const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false })
const validators = new Map<string, ValidateFunction>()
const jsonObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
export const isRocketInput = (p: OptimizationProblem): p is MultiStageInput | SingleStageInput =>
  p.kind === 'multi_stage' || p.kind === 'single_stage'

/** Use the Rust-generated schema, without coercion, defaults or removing keys. */
function validator(kind: string): ValidateFunction {
  const key = schema.$defs.Problem.oneOf.some((v) => v.properties.kind.const === kind) ? kind : 'unknown'
  const existing = validators.get(key)
  if (existing) return existing
  const selected = structuredClone(schema)
  const branch = selected.$defs.Problem.oneOf.find((v) => v.properties.kind.const === kind)
  if (branch) selected.$defs.Problem.oneOf = [branch]
  const compiled = ajv.compile(selected)
  validators.set(key, compiled)
  return compiled
}
function schemaIssue(error: ErrorObject): InputIssue {
  const suffix =
    error.keyword === 'required'
      ? error.params.missingProperty
      : error.keyword === 'additionalProperties'
        ? error.params.additionalProperty
        : ''
  const path = [error.instancePath.replace(/^\//, '').replace(/\//g, '.'), suffix].filter(Boolean).join('.')
  const message =
    error.keyword === 'required'
      ? tr('値を入力してください。', 'A value is required.')
      : error.keyword === 'additionalProperties'
        ? tr('対応していない項目です。', 'This field is not supported.')
        : error.keyword === 'type'
          ? tr('値の形式を確認してください。', 'Check the value type.')
          : tr('入力形式・値の範囲を確認してください。', 'Check the value format and range.')
  return { path, message }
}
export function inspectOptimizationInput(raw: string): { input: OptimizationInput | null; issues: InputIssue[] } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { input: null, issues: [{ path: '', message: tr('JSONの構文を確認してください。', 'Check the JSON syntax.') }] }
  }
  try {
    assertFiniteJson(value)
  } catch {
    return { input: null, issues: [{ path: '', message: tr('有限の数値を入力してください。', 'Enter finite numbers.') }] }
  }
  const kind = jsonObject(value) && jsonObject(value.problem) && typeof value.problem.kind === 'string' ? value.problem.kind : ''
  const validate = validator(kind)
  if (!validate(value)) {
    const issues = (validate.errors ?? []).filter((e) => !['oneOf', 'anyOf'].includes(e.keyword)).map(schemaIssue)
    const numericOnly = (validate.errors ?? []).every((error) => {
      if (['oneOf', 'anyOf', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'].includes(error.keyword)) return true
      if (error.keyword !== 'type' || error.params.type !== 'integer') return false
      let at: unknown = value
      for (const key of error.instancePath.split('/').slice(1)) at = (at as Record<string, unknown> | undefined)?.[key]
      return typeof at === 'number' && Number.isFinite(at)
    })
    if (!numericOnly) return { input: null, issues: issues.slice(0, 24) }
    const input = value as OptimizationInput
    return { input, issues: [...issues, ...optimizationInputIssues(input)].slice(0, 24) }
  }
  const input = value as OptimizationInput
  return { input, issues: optimizationInputIssues(input) }
}
export function assertFiniteJson(value: unknown): void {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite JSON number')
  if (Array.isArray(value)) for (const item of value) assertFiniteJson(item)
  else if (jsonObject(value)) for (const item of Object.values(value)) assertFiniteJson(item)
}
export function optimizationInputIssues(input: OptimizationInput): InputIssue[] {
  const issues: InputIssue[] = []
  const add = (path: string, message: string) => issues.push({ path, message })
  const positive = (path: string, value: number, allowZero = false) => {
    if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0))
      add(
        path,
        allowZero ? tr('0以上にしてください。', 'Must be zero or positive.') : tr('0より大きい値にしてください。', 'Must be positive.'),
      )
  }
  const range = (path: string, value: number, lo: number, hi: number, integer = false) => {
    if (!Number.isFinite(value) || value < lo || value > hi || (integer && !Number.isInteger(value)))
      add(
        path,
        tr(
          `${lo}〜${hi}${integer ? 'の整数' : ''}で指定してください。`,
          `Enter ${integer ? 'an integer ' : 'a value '}from ${lo} to ${hi}.`,
        ),
      )
  }
  const bounds = (path: string, b: Bounds, min: number) => {
    if (b.lower < min) add(`${path}.lower`, tr(`下限は${min}以上にしてください。`, `The lower bound must be at least ${min}.`))
    if (b.upper < b.lower) add(`${path}.upper`, tr('上限は下限以上にしてください。', 'The upper bound must be at least the lower bound.'))
    if (b.initial < b.lower || b.initial > b.upper)
      add(`${path}.initial`, tr('初期値を上下限の範囲内にしてください。', 'The initial value must be inside the bounds.'))
  }
  if (input.schema_version !== 1) add('schema_version', tr('対応する入力版は1です。', 'Supported input version: 1.'))
  if (new TextEncoder().encode(input.run_id).length < 1 || new TextEncoder().encode(input.run_id).length > 128)
    add('run_id', tr('実行IDは1〜128バイトで指定してください。', 'Run ID must contain 1–128 bytes.'))
  range('solver.max_iterations', input.solver?.max_iterations ?? 300, 1, 100000, true)
  range('solver.tolerance', input.solver?.tolerance ?? 1e-8, 1e-12, 1e-3)
  const scale = input.solver?.scaling
  if (scale) {
    range('solver.scaling.floor', scale.floor ?? 1e-6, Number.MIN_VALUE, 1)
    range('solver.scaling.cap', scale.cap ?? 1e6, 1, Number.MAX_VALUE)
    range('solver.scaling.gradient_max', scale.gradient_max ?? 100, Number.MIN_VALUE, Number.MAX_VALUE)
    range('solver.scaling.gradient_min', scale.gradient_min ?? 1e-8, Number.MIN_VALUE, 1)
  }
  if (input.solver?.hessian === 'exact' && !['hs071', 'double_integrator'].includes(input.problem.kind))
    add(
      'solver.hessian',
      tr('厳密Hessianは現在HS071と二重積分器に対応しています。', 'Exact Hessians currently support HS071 and the double integrator.'),
    )
  const p = input.problem
  if (p.kind === 'double_integrator') {
    bounds('problem.duration_s', p.duration_s, Number.MIN_VALUE)
    positive('problem.distance_m', p.distance_m)
    positive('problem.time_cost', p.time_cost, true)
    range('problem.intervals', p.intervals, 1, 16, true)
    range('problem.degree', p.degree, 3, 8, true)
    return issues
  }
  if (!isRocketInput(p)) return issues
  range('problem.degree', p.degree, 3, 8, true)
  range('problem.vehicle.launch.latitude_deg', p.vehicle.launch.latitude_deg, -90, 90)
  range('problem.vehicle.launch.longitude_deg', p.vehicle.launch.longitude_deg, -180, 180)
  if (!isValidDateTime(p.vehicle.launch.time_utc ?? '2000-01-01T00:00:00Z'))
    add('problem.vehicle.launch.time_utc', tr('UTC日時を確認してください。', 'Check the UTC date and time.'))
  if (!p.data_source.trim())
    add('problem.data_source', tr('データの出典・仮定を記入してください。', 'Describe the data source and assumptions.'))
  positive('problem.max_dynamic_pressure_pa', p.max_dynamic_pressure_pa)
  for (const [key, value] of Object.entries(p.validation)) positive(`problem.validation.${key}`, value)
  if (p.kind === 'single_stage') {
    bounds('problem.additional_payload_kg', p.additional_payload_kg, 0)
    bounds('problem.coast_duration_s', p.coast_duration_s, 1)
    positive('problem.dry_mass_kg', p.dry_mass_kg)
    positive('problem.propellant_mass_kg', p.propellant_mass_kg)
    range('problem.reserve_propellant_kg', p.reserve_propellant_kg, 0, p.propellant_mass_kg - Number.EPSILON)
    range('problem.burn_intervals', p.burn_intervals, 1, 16, true)
    range('problem.coast_intervals', p.coast_intervals, 1, 12, true)
    range('problem.azimuth_deg', p.azimuth_deg, 0, 360)
    range('problem.minimum_pitch_deg', p.minimum_pitch_deg, 0, 89.999999)
    range('problem.initial_pitch_end_deg', p.initial_pitch_end_deg, p.minimum_pitch_deg, 90)
    positive('problem.max_angle_of_attack_deg', p.max_angle_of_attack_deg)
    range('problem.max_angle_of_attack_deg', p.max_angle_of_attack_deg, 0.000001, 89.999999)
    positive('problem.max_specific_force_m_s2', p.max_specific_force_m_s2)
    positive('problem.max_pitch_rate_deg_s', p.max_pitch_rate_deg_s)
    positive('problem.minimum_downrange_m', p.minimum_downrange_m, true)
    const burn = p.vehicle.stages[0]?.engine?.burn_end_s ?? 0
    range('problem.vertical_ascent_s', p.vertical_ascent_s, 0.000001, burn - 0.000001)
    if (p.target_apogee_altitude_m <= (p.vehicle.launch.altitude_m ?? 0))
      add('problem.target_apogee_altitude_m', tr('目標高度は発射地点より高くしてください。', 'The target must be above the launch site.'))
    if (burn + p.coast_duration_s.upper > p.vehicle.simulation.end_time_s)
      add(
        'problem.vehicle.simulation.end_time_s',
        tr('計算終了を燃焼と惰行の上限より後にしてください。', 'The time horizon must cover the burn and allowed coast.'),
      )
    if (p.vehicle.stages.length !== 1)
      add('problem.vehicle.stages', tr('単段の設定には1段だけ指定してください。', 'A single-stage problem requires one stage.'))
    const stage = p.vehicle.stages[0]
    if (stage && (Math.abs(stage.mass_initial_kg - p.dry_mass_kg - p.propellant_mass_kg) > 1e-6 || stage.mass_dry_kg !== p.dry_mass_kg))
      add('problem.dry_mass_kg', tr('質量内訳と機体設定が一致していません。', 'The mass inventory and vehicle configuration disagree.'))
  } else {
    bounds('problem.net_payload_kg', p.net_payload_kg, 1)
    positive('problem.payload_adapter_kg', p.payload_adapter_kg, true)
    positive('problem.fairing_kg', p.fairing_kg, true)
    positive('problem.fairing_off_area_scale', p.fairing_off_area_scale)
    positive('problem.fairing_release_min_altitude_m', p.fairing_release_min_altitude_m, true)
    range('problem.orbit.inclination_deg', p.orbit.inclination_deg, 1, 178.999999)
    for (const [key, value] of Object.entries(p.orbit)) if (key !== 'inclination_deg') positive(`problem.orbit.${key}`, value)
    range('problem.stages.length', p.stages.length, 2, 4, true)
    range('problem.phases.length', p.phases.length, 3, 16, true)
    if (p.vehicle.stages.length !== p.stages.length)
      add('problem.stages', tr('機体と在庫の段数が一致していません。', 'Vehicle and inventory stage counts disagree.'))
    positive('problem.max_azimuth_rate_deg_s', p.max_azimuth_rate_deg_s)
    positive('problem.max_elevation_rate_deg_s', p.max_elevation_rate_deg_s)
    positive('problem.max_inertial_direction_rate_deg_s', p.max_inertial_direction_rate_deg_s)
    range('problem.initial_azimuth_deg', p.initial_azimuth_deg, ...p.azimuth_bounds_deg)
    for (const key of ['azimuth_bounds_deg', 'elevation_bounds_deg'] as const) {
      if (p[key][1] <= p[key][0] || p[key][1] - p[key][0] > 360)
        add(
          `problem.${key}`,
          tr('連続した角度の下限・上限を確認してください（幅360°以下）。', 'Check the continuous angle bounds (width at most 360°).'),
        )
    }
    if (p.elevation_bounds_deg[0] < -90 || p.elevation_bounds_deg[1] !== 90)
      add(
        'problem.elevation_bounds_deg',
        tr('仰角範囲は下限−90°以上、上限90°にしてください。', 'Elevation must start at or above −90° and end at 90°.'),
      )
    const burns = p.stages.map(() => 0),
      ignitions = p.stages.map(() => 0)
    let stageIndex = 0,
      powered = false,
      fairing = p.fairing_kg > 0
    p.phases.forEach((phase, i) => {
      const path = `problem.phases.${i}`
      bounds(`${path}.duration_s`, phase.duration_s, 0.01)
      range(`${path}.intervals`, phase.intervals, 1, 16, true)
      range(`${path}.max_angle_of_attack_deg`, phase.max_angle_of_attack_deg, 0.000001, 89.999999)
      positive(`${path}.max_specific_force_m_s2`, phase.max_specific_force_m_s2)
      if (!phase.name.trim()) add(`${path}.name`, tr('フェーズ名を入力してください。', 'Enter a phase name.'))
      if (phase.stage !== stageIndex)
        add(`${path}.stage`, tr('段分離の順序と使用段が一致していません。', 'The active stage does not match the separation sequence.'))
      if (phase.min_altitude_m < (p.vehicle.launch.altitude_m ?? 0))
        add(`${path}.min_altitude_m`, tr('最低高度を発射地点以上にしてください。', 'Minimum altitude must be at or above the launch site.'))
      if (
        phase.vertical &&
        (i !== 0 ||
          phase.mode !== 'burn' ||
          phase.duration_s.lower !== phase.duration_s.upper ||
          phase.initial_attitude_end_deg[0] !== p.initial_azimuth_deg ||
          phase.initial_attitude_end_deg[1] !== 90)
      )
        add(
          `${path}.duration_s`,
          tr('垂直姿勢は最初の固定時間の燃焼だけに指定できます。', 'Only the initial fixed-duration burn may be vertical.'),
        )
      for (const [axis, limits] of [p.azimuth_bounds_deg, p.elevation_bounds_deg].entries())
        range(`${path}.initial_attitude_end_deg.${axis}`, phase.initial_attitude_end_deg[axis], ...limits)
      if (phase.mode === 'burn' && burns[phase.stage] !== undefined) {
        burns[phase.stage] += phase.duration_s.lower
        if (!powered) ignitions[phase.stage]++
      }
      powered = phase.mode === 'burn'
      if (phase.end_event === 'separate_stage') {
        stageIndex++
        powered = false
      }
      if (phase.end_event === 'jettison_fairing') {
        if (!fairing) add(`${path}.end_event`, tr('フェアリングの二重投棄です。', 'The fairing was already jettisoned.'))
        fairing = false
      }
      if (phase.end_event === 'deploy_payload' && (i !== p.phases.length - 1 || phase.stage !== p.stages.length - 1 || fairing))
        add(
          `${path}.end_event`,
          tr(
            '衛星分離を全段分離・フェアリング投棄後の最後のイベントにしてください。',
            'Deploy only as the last event, after stage separation and fairing jettison.',
          ),
        )
    })
    if (p.phases[p.phases.length - 1]?.end_event !== 'deploy_payload')
      add('problem.phases', tr('最終イベントに衛星分離が必要です。', 'The final event must deploy the payload.'))
    if (p.phases.reduce((n, phase) => n + phase.intervals, 0) > 64)
      add('problem.phases', tr('区間数の合計は64以下にしてください。', 'The mesh must contain at most 64 intervals.'))
    if (p.phases.reduce((t, phase) => t + phase.duration_s.upper, 0) > p.vehicle.simulation.end_time_s)
      add(
        'problem.vehicle.simulation.end_time_s',
        tr('計算終了を全フェーズの時間上限合計以降にしてください。', 'The time horizon must cover the sum of phase upper bounds.'),
      )
    p.stages.forEach((stage, i) => {
      const path = `problem.stages.${i}`
      positive(`${path}.dry_kg`, stage.dry_kg)
      positive(`${path}.propellant_kg`, stage.propellant_kg)
      positive(`${path}.max_total_burn_s`, stage.max_total_burn_s)
      if (stage.reserve_kg < 0 || stage.reserve_kg >= stage.propellant_kg)
        add(
          `${path}.reserve_kg`,
          tr('予備量は0以上、搭載推進剤未満にしてください。', 'Reserve must be nonnegative and below loaded propellant.'),
        )
      if (!stage.source.trim()) add(`${path}.source`, tr('出典・仮定を入力してください。', 'Enter a source or assumption.'))
      range(`${path}.max_ignitions`, stage.max_ignitions, 1, 8, true)
      if (burns[i] > stage.max_total_burn_s + 1e-9)
        add(
          `${path}.max_total_burn_s`,
          tr('燃焼時間の下限合計が段の上限を超えています。', 'The minimum prescribed burn exceeds the stage on-time limit.'),
        )
      if (ignitions[i] < 1 || ignitions[i] > stage.max_ignitions)
        add(
          `${path}.max_ignitions`,
          tr('シーケンスの着火回数と上限を確認してください。', 'Check the prescribed ignitions against the limit.'),
        )
      const v = p.vehicle.stages[i]
      if (v && (Math.abs(v.mass_initial_kg - stage.dry_kg - stage.propellant_kg) > 1e-6 || v.mass_dry_kg !== stage.dry_kg))
        add(`${path}.dry_kg`, tr('質量内訳と機体設定が一致していません。', 'The mass inventory and vehicle configuration disagree.'))
      if (v?.engine?.burn_end_s !== stage.max_total_burn_s)
        add(
          `${path}.max_total_burn_s`,
          tr('エンジンの最大燃焼時間と一致していません。', 'The engine and inventory on-time limits disagree.'),
        )
    })
  }
  p.vehicle.stages.forEach((s, i) => {
    if (
      !s.engine ||
      typeof s.engine.thrust_vac_n !== 'number' ||
      typeof s.engine.isp_vac_s !== 'number' ||
      s.engine.thrust_vac_n <= 0 ||
      s.engine.isp_vac_s <= 0
    )
      add(
        `problem.vehicle.stages.${i}.engine`,
        tr('現在は一定の正の真空推力・Ispが必要です。', 'A constant positive vacuum thrust and Isp are required.'),
      )
  })
  return issues
}

/** Update just the requested value; keep non-form settings and their provenance. */
export function editOptimizationInput(input: OptimizationInput, path: string, value: unknown): OptimizationInput {
  const out = structuredClone(input)
  const parts = path.split('.')
  if (parts.some((s) => ['__proto__', 'prototype', 'constructor'].includes(s))) throw new Error('Invalid field path')
  let at = out as unknown as Record<string, unknown>
  for (const part of parts.slice(0, -1)) {
    if (at[part] === undefined) at[part] = {}
    at = at[part] as Record<string, unknown>
  }
  at[parts[parts.length - 1]] = value
  const p = out.problem
  if (p.kind === 'single_stage' && ['problem.dry_mass_kg', 'problem.propellant_mass_kg'].includes(path) && p.vehicle.stages[0]) {
    p.vehicle.stages[0].mass_initial_kg = p.dry_mass_kg + p.propellant_mass_kg
    p.vehicle.stages[0].mass_dry_kg = p.dry_mass_kg
  }
  if (p.kind === 'multi_stage') {
    const match = /^problem\.stages\.(\d+)\.(dry_kg|propellant_kg|max_total_burn_s)$/.exec(path)
    if (match) {
      const i = Number(match[1]),
        inventory = p.stages[i],
        stage = p.vehicle.stages[i]
      if (stage && inventory) {
        if (match[2] !== 'max_total_burn_s') {
          stage.mass_initial_kg = inventory.dry_kg + inventory.propellant_kg
          stage.mass_dry_kg = inventory.dry_kg
        } else if (stage.engine) {
          stage.engine.burn_end_s = inventory.max_total_burn_s
          if (stage.separation_time_s !== undefined) stage.separation_time_s = Math.max(stage.separation_time_s, inventory.max_total_burn_s)
        }
      }
    }
    if (path === 'problem.initial_azimuth_deg' && p.phases[0]?.vertical) p.phases[0].initial_attitude_end_deg = [p.initial_azimuth_deg, 90]
  }
  return out
}
export function phaseViews(p: OptimizationProblem): PhaseView[] {
  if (p.kind === 'multi_stage') {
    let time = 0
    return p.phases.map((phase, i) => {
      const start = time
      time += phase.duration_s.initial
      return {
        name: phaseLabel(p.phases, i, p.vehicle),
        stage: phase.stage,
        powered: phase.mode === 'burn',
        fixed: phase.duration_s.lower === phase.duration_s.upper,
        start,
        duration: phase.duration_s.initial,
        end: time,
        event: phase.end_event,
        path: `problem.phases.${i}`,
      }
    })
  }
  if (p.kind !== 'single_stage') return []
  const burn = p.vehicle.stages[0]?.engine?.burn_end_s ?? 0
  return [
    {
      name: tr('垂直上昇', 'Vertical ascent'),
      stage: 0,
      powered: true,
      fixed: true,
      start: 0,
      duration: p.vertical_ascent_s,
      end: p.vertical_ascent_s,
      event: 'none',
      path: 'problem.vertical_ascent_s',
    },
    {
      name: tr('誘導燃焼', 'Guided burn'),
      stage: 0,
      powered: true,
      fixed: true,
      start: p.vertical_ascent_s,
      duration: burn - p.vertical_ascent_s,
      end: burn,
      event: 'none',
      path: 'problem.vehicle.stages.0.engine.burn_end_s',
    },
    {
      name: tr('頂点まで惰行', 'Coast to apogee'),
      stage: 0,
      powered: false,
      fixed: p.coast_duration_s.lower === p.coast_duration_s.upper,
      start: burn,
      duration: p.coast_duration_s.initial,
      end: burn + p.coast_duration_s.initial,
      event: 'none',
      path: 'problem.coast_duration_s',
    },
  ]
}
export function inputTitle(input: OptimizationInput): string {
  const p = input.problem
  return isRocketInput(p) ? p.vehicle.name : p.kind === 'double_integrator' ? tr('二重積分器', 'Double integrator') : 'HS071'
}
export function sectionForPath(path: string): EditorSection {
  if (/^solver\.(scaling|hessian|kkt_scaling)/.test(path)) return 'json'
  if (path.startsWith('solver') || /degree|intervals|validation\.|simulation\.|initial_azimuth|initial_pitch|initial_attitude/.test(path))
    return 'numerics'
  if (/stages|dry_mass|propellant_mass|fairing_kg|adapter/.test(path)) return 'vehicle'
  if (/minimum_downrange/.test(path)) return 'mission'
  if (/max_|minimum_|min_altitude|reserve|tolerance|bounds_deg|fairing_release/.test(path)) return 'constraints'
  if (/phases|duration|vertical_ascent|burn_end/.test(path)) return 'sequence'
  if (/problem|run_id/.test(path)) return 'mission'
  return 'json'
}
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (jsonObject(value))
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  return JSON.stringify(value)
}
/** The same input without a warm-start trajectory (which only changes the starting point). */
export function withoutInitialGuess(input: OptimizationInput): OptimizationInput {
  if (input.problem.kind !== 'multi_stage' || !input.problem.initial_guess) return input
  const { initial_guess: _guess, ...problem } = input.problem
  return { ...input, problem }
}
export function requestFingerprint(input: OptimizationInput): string {
  const { run_id: _id, ...rest } = schemaDefaultedInput(withoutInitialGuess(input))
  return canonicalJson(rest)
}
/** Compare serde's recorded input with a draft that may omit schema defaults.
 * This only normalizes copies for comparison; editing and solving keep the original JSON. */
function schemaDefaultedInput(input: OptimizationInput): OptimizationInput {
  const expand = (value: unknown, rule: Record<string, unknown>): unknown => {
    if (value === undefined) {
      if (!Object.prototype.hasOwnProperty.call(rule, 'default')) return undefined
      value = structuredClone(rule.default)
    }
    if (typeof rule.$ref === 'string') {
      const name = rule.$ref.split('/').pop()!
      return expand(value, (schema.$defs as Record<string, Record<string, unknown>>)[name])
    }
    if (jsonObject(value)) {
      if (Array.isArray(rule.oneOf)) {
        const object = value
        const branch = rule.oneOf.find(
          (r) =>
            jsonObject(r) &&
            jsonObject(r.properties) &&
            Object.entries(r.properties).some(([key, field]) => jsonObject(field) && 'const' in field && object[key] === field.const),
        )
        if (branch) return expand(value, branch)
      }
      if (jsonObject(rule.properties)) {
        const copy = { ...value }
        for (const [key, field] of Object.entries(rule.properties)) {
          if (!jsonObject(field)) continue
          const expanded = expand(copy[key], field)
          if (expanded !== undefined) copy[key] = expanded
        }
        return copy
      }
    }
    if (Array.isArray(value) && jsonObject(rule.items)) return value.map((item) => expand(item, rule.items as Record<string, unknown>))
    return value
  }
  return expand(input, schema) as OptimizationInput
}
export function samePhysicalProblem(a: OptimizationInput, b: OptimizationInput): boolean {
  const strip = (input: OptimizationInput) => {
    const p = structuredClone(schemaDefaultedInput(withoutInitialGuess(input)).problem) as unknown as Record<string, unknown>
    for (const key of ['degree', 'intervals', 'burn_intervals', 'coast_intervals', 'initial_pitch_end_deg']) delete p[key]
    for (const value of Object.values(p)) if (jsonObject(value) && 'lower' in value && 'upper' in value) delete value.initial
    if (Array.isArray(p.phases))
      for (const phase of p.phases) {
        delete phase.intervals
        delete phase.initial_attitude_end_deg
        if (jsonObject(phase.duration_s)) delete phase.duration_s.initial
      }
    return canonicalJson(p)
  }
  return strip(a) === strip(b)
}
