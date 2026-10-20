// Hand-off between the two solvers that share one vehicle model (`Config`).
//
// - An optimization result becomes a simulation configuration: the solved
//   attitude becomes the attitude program, the burn phases become burn windows
//   (a restart is a zero-thrust gap in the thrust table), and the payload,
//   adapter and fairing are folded back into the stage masses.
// - A simulation configuration seeds an optimization input: the vehicle,
//   launch site, burn timeline and attitude program; mission settings (target,
//   payload range, limits, numerics) come from a template input.
//
// Neither direction is lossless; every approximation is reported as a note.
import type { Config, Curve, Rows, Stage } from './config'
import { convertedCase, newCase, withoutCarriedMass, type CaseContext } from './case'
import { evalCurve, isRows } from './config'
import type { OptimizationResult } from './optimization'
import type { MultiStageInput, OptimizationInput, OptimizationPhase, SingleStageInput } from './optimization-input'
import { fitHorizon, G0 } from './optimization-vehicle'
import { tr } from './i18n'

export type Handoff<T> = { ok: true; value: T; notes: string[]; context?: CaseContext } | { ok: false; errors: string[] }

const round = (v: number, digits = 3) => Math.round(v * 10 ** digits) / 10 ** digits
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
const kg = (v: number) => `${Math.round(v).toLocaleString('en-US')} kg`

// --- Optimization result → simulation configuration --------------------------

/** A simulation configuration that flies the optimized trajectory open-loop. */
export function simulationFromOptimization(result: OptimizationResult, source?: CaseContext): Handoff<Config> {
  const converted = rawSimulationFromOptimization(result)
  if (!converted.ok) return converted
  if (!result.converged || result.validation?.status !== 'passed')
    converted.notes.unshift(
      tr(
        '暫定結果（未収束または独立検証不合格）から作成したケースです。',
        'This case was created from a provisional result (not converged or independent validation failed).',
      ),
    )
  const context = convertedCase(
    source ??
      newCase(
        result.input.problem.kind === 'multi_stage' || result.input.problem.kind === 'single_stage'
          ? result.input.problem.vehicle.name
          : 'Optimization',
      ),
    'simulate',
    converted.value.name,
    converted.notes,
    result.input.run_id,
  )
  context.carriedMass = {
    stage: converted.value.stages.length - 1,
    stageCount: converted.value.stages.length,
    payloadKg: result.validation?.multi_stage?.net_payload_kg ?? result.validation?.flight?.mass_ledger.additional_payload_kg ?? 0,
    adapterKg: result.input.problem.kind === 'multi_stage' ? result.input.problem.payload_adapter_kg : 0,
  }
  if (![context.carriedMass.payloadKg, context.carriedMass.adapterKg].every((v) => Number.isFinite(v) && v >= 0))
    return {
      ok: false,
      errors: [
        tr(
          '搭載質量が不正なため、この暫定結果は軌道計算へ渡せません。',
          'The provisional result has invalid carried masses and cannot be opened in simulation.',
        ),
      ],
    }
  return { ...converted, context }
}
function rawSimulationFromOptimization(result: OptimizationResult): Handoff<Config> {
  const p = result.input.problem
  if (p.kind === 'multi_stage') return fromMultiStage(result, p)
  if (p.kind === 'single_stage') return fromSingleStage(result, p)
  return {
    ok: false,
    errors: [tr('ロケットの問題ではないため軌道計算に渡せません。', 'Only rocket problems can be opened in the simulation.')],
  }
}

function fromMultiStage(result: OptimizationResult, p: MultiStageInput): Handoff<Config> {
  const v = result.validation?.multi_stage
  const samples = v?.samples ?? []
  const spans = p.phases.map((_, i) => {
    const s = samples.filter((x) => x.phase === i)
    return s.length ? { start: s[0].time_s, end: s[s.length - 1].time_s } : null
  })
  if (!v || spans.some((s) => !s))
    return {
      ok: false,
      errors: [
        tr(
          'この結果には独立検証の軌道がないため軌道計算に渡せません。',
          'This result has no validated trajectory to open in the simulation.',
        ),
      ],
    }
  const span = spans as { start: number; end: number }[]
  const config = structuredClone(p.vehicle)
  const notes: string[] = []
  const last = config.stages.length - 1
  config.stages.forEach((stage, s) => {
    const first = p.phases.findIndex((ph) => ph.stage === s)
    const t0 = first >= 0 ? span[first].start : 0
    // Consecutive burn phases are one ignition.
    const windows: [number, number][] = []
    p.phases.forEach((ph, i) => {
      if (ph.stage !== s || ph.mode !== 'burn') return
      const a = span[i].start - t0,
        b = span[i].end - t0
      const prev = windows[windows.length - 1]
      if (prev && Math.abs(prev[1] - a) < 1e-6) prev[1] = b
      else windows.push([a, b])
    })
    const engine = stage.engine
    if (engine && windows.length) {
      const thrust = typeof engine.thrust_vac_n === 'number' ? engine.thrust_vac_n : evalCurve(engine.thrust_vac_n, 0)
      engine.burn_start_s = round(windows[0][0])
      engine.burn_end_s = round(windows[windows.length - 1][1])
      if (windows.length > 1) {
        // Equal x rows make a step: at the boundary the later row applies.
        const rows: Rows = []
        windows.forEach(([a, b], k) => {
          if (k > 0) rows.push([round(a), 0])
          rows.push([round(a), thrust], [round(b), thrust])
          if (k < windows.length - 1) rows.push([round(b), 0])
        })
        engine.thrust_vac_n = rows
        notes.push(
          tr(
            `第${s + 1}段の再着火を推力表の0区間で表しました（${windows.length}回燃焼）。`,
            `Stage ${s + 1} restarts are written as zero-thrust gaps in its thrust table (${windows.length} burns).`,
          ),
        )
      }
    }
    const sep = p.phases.findIndex((ph) => ph.stage === s && ph.end_event === 'separate_stage')
    if (sep >= 0) stage.separation_time_s = round(span[sep].end - t0)
    else if (s !== last) delete stage.separation_time_s
    const fairing = p.phases.findIndex((ph) => ph.stage === s && ph.end_event === 'jettison_fairing')
    if (fairing >= 0 && p.fairing_kg > 0) {
      // The released mass belongs to this interval; the propellant floor drops with it.
      stage.jettisons = [
        {
          name: 'fairing',
          display_name: { ja: 'フェアリング', en: 'Fairing' },
          time_s: round(span[fairing].end - t0),
          mass_kg: p.fairing_kg,
        },
      ]
      stage.mass_initial_kg += p.fairing_kg
      stage.mass_dry_kg = (stage.mass_dry_kg ?? 0) + p.fairing_kg
      if (p.fairing_off_area_scale !== 1)
        notes.push(
          tr(
            `フェアリング投棄後の空力面積の変化（×${p.fairing_off_area_scale}）は軌道計算では表せないため、投棄後も同じ空力で計算します。`,
            `The aerodynamic area change after fairing jettison (×${p.fairing_off_area_scale}) cannot be expressed in the simulation; the same aerodynamics apply after it.`,
          ),
        )
    }
  })
  const top = config.stages[last]
  const carried = v.net_payload_kg + p.payload_adapter_kg
  top.mass_initial_kg += carried
  top.mass_dry_kg = (top.mass_dry_kg ?? 0) + carried
  config.attitude = attitudeFromSamples(samples)
  config.simulation = { ...config.simulation, end_time_s: round(v.final_time_s) }
  config.name = optimizedName(p.vehicle.name)
  notes.unshift(
    tr(
      `最適解の姿勢・燃焼時刻を設定し、ペイロード ${kg(v.net_payload_kg)}（＋PAF ${kg(p.payload_adapter_kg)}）を最終段に載せました。計算はペイロード分離時刻で終わります。`,
      `The optimized attitude and burn times are set, and the ${kg(v.net_payload_kg)} payload (+ ${kg(p.payload_adapter_kg)} adapter) rides on the last stage. The run ends at payload deployment.`,
    ),
  )
  return { ok: true, value: config, notes }
}

function fromSingleStage(result: OptimizationResult, p: SingleStageInput): Handoff<Config> {
  const f = result.validation?.flight
  if (!f || f.samples.length < 2)
    return {
      ok: false,
      errors: [
        tr(
          'この結果には独立検証の軌道がないため軌道計算に渡せません。',
          'This result has no validated trajectory to open in the simulation.',
        ),
      ],
    }
  const config = structuredClone(p.vehicle)
  const stage = config.stages[0]
  const payload = f.mass_ledger.additional_payload_kg
  stage.mass_initial_kg += payload
  stage.mass_dry_kg = (stage.mass_dry_kg ?? 0) + payload
  config.attitude = {
    azimuth_deg: p.azimuth_deg,
    elevation_deg: rowsFrom(f.samples.map((s) => [s.time_s, s.pitch_deg])),
  }
  config.name = optimizedName(p.vehicle.name)
  return {
    ok: true,
    value: config,
    notes: [
      tr(
        `最適解のピッチ角を姿勢プログラムに設定し、追加ペイロード ${kg(payload)} を段の質量に加えました。`,
        `The optimized pitch is set as the attitude program and the ${kg(payload)} extra payload is added to the stage mass.`,
      ),
    ],
  }
}

function attitudeFromSamples(samples: { time_s: number; azimuth_deg: number; elevation_deg: number }[]): Config['attitude'] {
  // Roll, mounting offsets and gyro bias are not part of the solved attitude.
  const sorted = [...samples].sort((a, b) => a.time_s - b.time_s)
  return {
    azimuth_deg: rowsFrom(sorted.map((s) => [s.time_s, s.azimuth_deg])),
    elevation_deg: rowsFrom(sorted.map((s) => [s.time_s, s.elevation_deg])),
  }
}

/** Largest deviation of the attitude table from the solved angles [deg]. */
const ATTITUDE_TOLERANCE_DEG = 0.01

/**
 * Rounded rows that follow the points within `ATTITUDE_TOLERANCE_DEG`
 * (Douglas–Peucker on each run between steps); equal times stay as a step.
 */
function rowsFrom(points: [number, number][]): Rows {
  const rows: Rows = []
  for (const [t, y] of points) {
    const row: [number, number] = [round(t), round(y, 4)]
    const prev = rows[rows.length - 1]
    if (prev && prev[0] === row[0] && prev[1] === row[1]) continue
    rows.push(row)
  }
  const out: Rows = []
  let from = 0
  for (let i = 1; i <= rows.length; i++) {
    if (i < rows.length && rows[i][0] !== rows[i - 1][0]) continue
    out.push(...simplify(rows.slice(from, i)))
    from = i
  }
  return out
}

function simplify(rows: Rows): Rows {
  if (rows.length < 3) return rows
  const keep = rows.map(() => false)
  keep[0] = keep[rows.length - 1] = true
  const stack: [number, number][] = [[0, rows.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [x0, y0] = rows[a],
      [x1, y1] = rows[b]
    let worst = -1,
      error = ATTITUDE_TOLERANCE_DEG
    for (let k = a + 1; k < b; k++) {
      const e = Math.abs(rows[k][1] - (y0 + ((y1 - y0) * (rows[k][0] - x0)) / (x1 - x0)))
      if (e > error) [worst, error] = [k, e]
    }
    if (worst > 0) {
      keep[worst] = true
      stack.push([a, worst], [worst, b])
    }
  }
  return rows.filter((_, k) => keep[k])
}

function optimizedName(name: string) {
  const suffix = tr('（最適化結果）', ' (optimized)')
  return name.endsWith(suffix) ? name : `${name}${suffix}`
}

// --- Simulation configuration → optimization input ---------------------------

/** The template kind a configuration needs: one stage is a sounding rocket, 2–4 an orbital launcher. */
export const optimizationKindFor = (config: Config): 'single_stage' | 'multi_stage' | null =>
  config.stages.length === 1 ? 'single_stage' : config.stages.length >= 2 && config.stages.length <= 4 ? 'multi_stage' : null

interface Burn {
  thrust: number
  isp: number
  /** Engine on-time [s] */
  onTime: number
  /** Ignition from the stage start [s] */
  start: number
  /** Burns from the stage start [s]; zero-thrust gaps of a thrust table are coasts before a restart */
  windows: [number, number][]
}

/**
 * Seed an optimization input with the vehicle, launch site, burn timeline
 * and attitude program of a simulation configuration. Mission settings come
 * from `template`, which must be of the kind `optimizationKindFor` names.
 */
export function optimizationFromSimulation(
  config: Config,
  template: OptimizationInput,
  source?: CaseContext,
  flight?: SimulatedFlight,
): Handoff<OptimizationInput> {
  let vehicle: Config
  try {
    vehicle = withoutCarriedMass(config, source)
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] }
  }
  const converted = rawOptimizationFromSimulation(vehicle, template, !!source?.carriedMass, flight)
  if (!converted.ok) return converted
  if (source?.carriedMass && converted.value.problem.kind === 'multi_stage')
    converted.value.problem.payload_adapter_kg = source.carriedMass.adapterKg
  if (source?.carriedMass)
    converted.notes.unshift(
      tr(
        `衛星 ${kg(source.carriedMass.payloadKg)}・PAF ${kg(source.carriedMass.adapterKg)} を段の質量から除き、最適化で別に数えます。`,
        `Removed the ${kg(source.carriedMass.payloadKg)} payload and ${kg(source.carriedMass.adapterKg)} adapter from stage masses; optimization counts them separately.`,
      ),
    )
  return { ...converted, context: convertedCase(source ?? newCase(config.name), 'optimize', config.name, converted.notes) }
}
/** Figures of the simulated flight of the same configuration, used to size a sounding-rocket mission. */
export interface SimulatedFlight {
  apogeeM: number
  apogeeTimeS: number
  maxQPa: number
}

function rawOptimizationFromSimulation(
  config: Config,
  template: OptimizationInput,
  payloadAccounted: boolean,
  flight?: SimulatedFlight,
): Handoff<OptimizationInput> {
  const kind = optimizationKindFor(config)
  const errors: string[] = []
  if (!kind)
    errors.push(
      tr(
        `段（計算区間）が${config.stages.length}個です。最適化は単段か2〜4段に対応しています。`,
        `The vehicle has ${config.stages.length} stages (intervals); optimization supports one or 2–4.`,
      ),
    )
  else if (template.problem.kind !== kind)
    errors.push(tr('最適化のひな形の種類が機体と合いません。', 'The optimization template does not fit this vehicle.'))
  const notes: string[] = []
  if (config.presentation?.stage_count && config.presentation.stage_count !== config.stages.length)
    notes.push(
      tr(
        'この機体の計算区間は実機の段数と一致しません。最適化でも合成推進系の計算区間として扱います。',
        'Calculation intervals differ from physical stages; optimization retains the combined propulsion interval model.',
      ),
    )
  const vehicle = structuredClone(config)
  const burns: Burn[] = []
  vehicle.stages.forEach((stage, s) => {
    const label = tr(`第${s + 1}段`, `Stage ${s + 1}`)
    const burn = stageBurn(stage, label, errors, notes)
    if (burn) burns.push(burn)
    if (stage.aero?.cn_table)
      errors.push(
        tr(
          `${label}：法線力のMach×迎角表（cn_table）には未対応です。cn_alpha_per_rad で指定してください。`,
          `${label}: the normal-force Mach × angle table (cn_table) is not supported; use cn_alpha_per_rad.`,
        ),
      )
    for (const c of [stage.aero?.ca, stage.aero?.ca_power_off, stage.aero?.cn_alpha_per_rad])
      if (isFile(c))
        errors.push(tr(`${label}：CSVファイル参照の空力表は読み込めません。`, `${label}: aerodynamic tables in CSV files cannot be read.`))
    if (stage.thrust_trim) {
      delete stage.thrust_trim
      notes.push(tr(`${label}の推力トリム（モーメント釣り合い）を外しました。`, `${label}: thrust trim (moment balance) was removed.`))
    }
  })
  if (vehicle.launch.rail_length_m || vehicle.launch.velocity_ned_mps?.some((v) => v !== 0)) {
    delete vehicle.launch.rail_length_m
    delete vehicle.launch.velocity_ned_mps
    notes.push(
      tr(
        'ランチャーと初速度を外し、静止状態から打ち上げます。',
        'The launcher and the initial velocity were removed; the launch starts at rest.',
      ),
    )
  }
  if (errors.length || burns.length !== vehicle.stages.length) return { ok: false, errors }
  const out = structuredClone(template)
  delete (out.problem as { initial_guess?: unknown }).initial_guess
  const source = tr(`軌道計算の機体「${config.name}」から変換`, `Converted from the simulation vehicle “${config.name}”`)
  if (out.problem.kind === 'single_stage') toSingleStage(out.problem, vehicle, burns[0], source, notes, flight)
  else if (out.problem.kind === 'multi_stage') toMultiStage(out.problem, vehicle, burns, source, notes, payloadAccounted)
  return { ok: true, value: out, notes }
}

const isFile = (c: Curve | undefined) => !!c && typeof c === 'object' && !isRows(c)

/** Constant-thrust equivalent of a stage's engine: same impulse and propellant, within the loaded propellant. */
function stageBurn(stage: Stage, label: string, errors: string[], notes: string[]): Burn | null {
  const e = stage.engine
  if (!e) {
    errors.push(tr(`${label}：エンジンがありません。`, `${label}: no engine.`))
    return null
  }
  if (stage.mass_dry_kg === undefined) {
    errors.push(tr(`${label}：乾燥質量を指定してください。`, `${label}: set the dry mass.`))
    return null
  }
  if (isFile(e.thrust_vac_n) || isFile(e.isp_vac_s)) {
    errors.push(tr(`${label}：CSVファイル参照の推力表は読み込めません。`, `${label}: thrust tables in CSV files cannot be read.`))
    return null
  }
  const start = e.burn_start_s ?? 0
  const end = e.burn_end_s
  let impulse = 0,
    propellant = 0,
    onTime = 0
  let windows: [number, number][] = []
  const n = 4000,
    h = (end - start) / n
  for (let i = 0; i < n && h > 0; i++) {
    const t = start + (i + 0.5) * h
    const thrust = Math.max(0, evalCurve(e.thrust_vac_n, t))
    const isp = evalCurve(e.isp_vac_s, t)
    if (thrust <= 0 || isp <= 0) continue
    impulse += thrust * h
    propellant += (thrust / (isp * G0)) * h
    onTime += h
    const last = windows[windows.length - 1]
    if (last && t - h / 2 - last[1] < 1) last[1] = t + h / 2
    else windows.push([t - h / 2, t + h / 2])
  }
  if (impulse <= 0) {
    errors.push(tr(`${label}：燃焼時間に推力がありません。`, `${label}: no thrust during the burn.`))
    return null
  }
  const constant = typeof e.thrust_vac_n === 'number' && typeof e.isp_vac_s === 'number'
  if (constant) {
    onTime = end - start
    windows = [[start, end]]
  } else {
    // Snap the sampled edges to the table rows they fall next to.
    const xs = isRows(e.thrust_vac_n) ? e.thrust_vac_n.map(([x]) => x) : []
    const snap = (t: number) => xs.find((x) => Math.abs(x - t) <= h) ?? t
    windows = windows.map(([a, b]) => [snap(a), snap(b)])
    onTime = windows.reduce((d, [a, b]) => d + b - a, 0)
  }
  const thrust = constant ? (e.thrust_vac_n as number) : impulse / onTime
  const isp = constant ? (e.isp_vac_s as number) : impulse / (propellant * G0)
  if (!constant)
    notes.push(
      tr(
        `${label}：推力・比推力の表を一定値 ${round(thrust / 1000, 1)} kN・${round(isp, 1)} s に置き換えました（総力積と推進剤消費量は同じ）。`,
        `${label}: thrust and Isp tables became constants, ${round(thrust / 1000, 1)} kN and ${round(isp, 1)} s (same total impulse and propellant).`,
      ),
    )
  const flow = thrust / (isp * G0)
  const usable = stage.mass_initial_kg - stage.mass_dry_kg
  if (flow * onTime > usable) {
    windows = shorten(windows, onTime - usable / flow)
    onTime = usable / flow
    notes.push(
      tr(
        `${label}：燃焼時間を推進剤で燃やせる ${round(onTime, 1)} s に短くしました。`,
        `${label}: the burn was shortened to the ${round(onTime, 1)} s the propellant allows.`,
      ),
    )
  }
  return { thrust, isp, onTime, start: windows[0][0], windows }
}

/** Windows with `by` seconds of burning removed from the end. */
function shorten(windows: [number, number][], by: number): [number, number][] {
  const out: [number, number][] = []
  let left = windows.reduce((d, [a, b]) => d + b - a, 0) - by
  for (const [a, b] of windows) {
    if (left <= 1e-9) break
    out.push([a, Math.min(b, a + left)])
    left -= b - a
  }
  return out
}

/** Engine of the converted stage: constant, igniting at the stage start (ignition delays become coast phases). */
function constantEngine(stage: Stage, b: Burn, burnEnd: number) {
  stage.engine = {
    thrust_vac_n: round(b.thrust, 3),
    isp_vac_s: round(b.isp, 4),
    burn_start_s: 0,
    burn_end_s: burnEnd,
    ...(stage.engine?.nozzle_exit_area_m2 !== undefined ? { nozzle_exit_area_m2: stage.engine.nozzle_exit_area_m2 } : {}),
  }
}

/** Largest on-time [s] (whole 0.1 s) within the propellant above the reserve. */
const burnLimit = (b: Burn, propellant: number, reserve: number) =>
  Math.floor(Math.min(b.onTime, (propellant - reserve) / (round(b.thrust, 3) / (round(b.isp, 4) * G0))) * 10) / 10

/**
 * Fit the template's mission to what the simulated flight shows the vehicle can
 * do: a target apogee it can exceed with added payload, a dynamic-pressure
 * limit above its own peak, and a coast that reaches that apogee.
 */
function sizeSoundingMission(p: SingleStageInput, flight: SimulatedFlight, burn: number, notes: string[]) {
  const { apogeeM, apogeeTimeS, maxQPa } = flight
  if (!(apogeeM > 0 && apogeeTimeS > burn && maxQPa > 0)) return
  const target = p.target_apogee_altitude_m
  if (target > 0.95 * apogeeM || target < 0.75 * apogeeM) {
    const step = apogeeM > 200e3 ? 10e3 : 5e3
    p.target_apogee_altitude_m = Math.max(step, Math.floor((0.9 * apogeeM) / step) * step)
    notes.push(
      tr(
        `目標頂点高度を、軌道計算の頂点 ${round(apogeeM / 1000, 1)} km より低い ${round(p.target_apogee_altitude_m / 1000, 0)} km にしました（差分を追加ペイロードに充てます）。`,
        `The target apogee is now ${round(p.target_apogee_altitude_m / 1000, 0)} km, below the simulated ${round(apogeeM / 1000, 1)} km; the margin goes to extra payload.`,
      ),
    )
  }
  if (maxQPa * 1.1 > p.max_dynamic_pressure_pa) {
    p.max_dynamic_pressure_pa = Math.ceil((maxQPa * 1.2) / 5000) * 5000
    notes.push(
      tr(
        `最大動圧の上限を、軌道計算の最大動圧 ${round(maxQPa / 1000, 1)} kPa を上回る ${round(p.max_dynamic_pressure_pa / 1000, 0)} kPa にしました。`,
        `The dynamic-pressure limit is now ${round(p.max_dynamic_pressure_pa / 1000, 0)} kPa, above the simulated peak of ${round(maxQPa / 1000, 1)} kPa.`,
      ),
    )
  }
  const coast = apogeeTimeS - burn
  if (coast < p.coast_duration_s.lower || coast > p.coast_duration_s.upper) {
    const lower = Math.max(10, Math.floor(coast * 0.4))
    const upper = Math.ceil(coast * 1.3)
    p.coast_duration_s = { lower, upper, initial: clamp(Math.round(coast * 0.9), lower, upper) }
  }
  const loaded = p.dry_mass_kg + p.propellant_mass_kg
  if (p.additional_payload_kg.upper < 0.15 * loaded)
    p.additional_payload_kg = { ...p.additional_payload_kg, upper: Math.ceil((0.15 * loaded) / 10) * 10 }
}

function attitudeAt(config: Config, t: number): [number, number] {
  return [evalCurve(config.attitude?.azimuth_deg, t, 0), evalCurve(config.attitude?.elevation_deg, t, 90)]
}

function toSingleStage(p: SingleStageInput, vehicle: Config, b: Burn, source: string, notes: string[], flight?: SimulatedFlight) {
  const stage = vehicle.stages[0]
  if (stage.jettisons?.length) {
    delete stage.jettisons
    notes.push(tr('投棄物は外し、その質量は機体に残します。', 'Jettisoned bodies were removed; their mass stays on the vehicle.'))
  }
  delete stage.separation_time_s
  if (stage.free_flight !== 'aero_stable') {
    stage.free_flight = 'aero_stable'
    notes.push(tr('燃焼後の飛び方を「機軸が気流に沿う」にしました。', 'After burnout the vehicle now follows the airflow (aero-stable).'))
  }
  const dry = stage.mass_dry_kg ?? 0
  const propellant = stage.mass_initial_kg - dry
  const reserve = Math.min(p.reserve_propellant_kg, propellant * 0.01)
  const limit = burnLimit(b, propellant, reserve)
  if (b.start > 0) notes.push(tr('点火遅れを0にしました。', 'The ignition delay was set to zero.'))
  constantEngine(stage, b, limit)
  const [azimuth] = attitudeAt(vehicle, 0)
  Object.assign(p, {
    vehicle,
    data_source: source,
    dry_mass_kg: dry,
    propellant_mass_kg: propellant,
    reserve_propellant_kg: reserve,
    vertical_ascent_s: round(Math.min(p.vertical_ascent_s, limit / 4), 1),
    azimuth_deg: round(((azimuth % 360) + 360) % 360, 4),
    initial_pitch_end_deg: round(clamp(attitudeAt(vehicle, limit)[1], p.minimum_pitch_deg, 89.9), 3),
    max_specific_force_m_s2: Math.max(p.max_specific_force_m_s2, Math.ceil((1.1 * b.thrust) / (dry + reserve))),
  })
  if (flight) sizeSoundingMission(p, flight, limit, notes)
  vehicle.simulation.end_time_s = Math.max(vehicle.simulation.end_time_s, Math.ceil(limit + p.coast_duration_s.upper + 10))
}

function toMultiStage(p: MultiStageInput, vehicle: Config, burns: Burn[], source: string, notes: string[], payloadAccounted: boolean) {
  const n = vehicle.stages.length
  const lastStage = n - 1
  if (!payloadAccounted)
    notes.push(
      tr(
        `ペイロードとPAFは最適化で別に数えます。軌道計算の第${n}段の質量（乾燥 ${kg(vehicle.stages[lastStage].mass_dry_kg ?? 0)}）に含まれている場合は、機体の欄で差し引いてください。`,
        `The payload and adapter are counted separately here. If the simulation's stage ${n} mass (dry ${kg(vehicle.stages[lastStage].mass_dry_kg ?? 0)}) includes them, subtract them in the vehicle section.`,
      ),
    )
  const alt = vehicle.launch.altitude_m ?? 0
  // Absolute timeline of the simulation (stage starts, jettison times).
  const starts: number[] = []
  vehicle.stages.reduce((t, s) => (starts.push(t), t + (s.separation_time_s ?? 0)), 0)
  // The first jettison above the first stage is the fairing; others stay on board.
  let fairing: { stage: number; time: number } | null = null
  let fairingKg = 0
  vehicle.stages.forEach((stage, s) => {
    const js = stage.jettisons ?? []
    if (!js.length) return
    const mass = js.reduce((m, j) => m + j.mass_kg, 0)
    if (!fairing && s > 0 && (stage.mass_dry_kg ?? 0) > mass) {
      fairing = { stage: s, time: starts[s] + Math.min(...js.map((j) => j.time_s)) }
      fairingKg = mass
      stage.mass_initial_kg -= mass
      stage.mass_dry_kg = (stage.mass_dry_kg ?? 0) - mass
      notes.push(
        tr(
          `第${s + 1}段の投棄物 ${kg(mass)} をフェアリングとして扱います。`,
          `The ${kg(mass)} jettisoned from stage ${s + 1} is treated as the fairing.`,
        ),
      )
    } else
      notes.push(
        tr(
          `第${s + 1}段の投棄物は外し、その質量は段の分離まで残します。`,
          `Stage ${s + 1} jettisons were removed; their mass stays until separation.`,
        ),
      )
    delete stage.jettisons
  })
  const template = p
  const plan = vehicle.stages.map((stage, s) => {
    const b = burns[s]
    const dry = stage.mass_dry_kg ?? 0
    const propellant = stage.mass_initial_kg - dry
    const ratio = template.stages[Math.min(s, template.stages.length - 1)]
    const reserve = round(Math.min(propellant * (ratio ? ratio.reserve_kg / ratio.propellant_kg : 0.01), propellant * 0.05), 3)
    const limit = burnLimit(b, propellant, reserve)
    if (limit < round(b.onTime, 1) - 0.1)
      notes.push(
        tr(
          `第${s + 1}段：残す推進剤 ${kg(reserve)} を確保するため燃焼を ${limit} s にしました。`,
          `Stage ${s + 1}: the burn is ${limit} s to keep a ${kg(reserve)} propellant reserve.`,
        ),
      )
    if (s === 0 && b.start > 0) notes.push(tr('第1段の点火遅れを0にしました。', 'The stage 1 ignition delay was set to zero.'))
    if (b.windows.length > 1)
      notes.push(
        tr(
          `第${s + 1}段：推力表の0推力区間を惰行とし、${b.windows.length}回の燃焼に分けました。`,
          `Stage ${s + 1}: zero-thrust gaps in the thrust table became coasts between ${b.windows.length} burns.`,
        ),
      )
    if (stage.free_flight !== 'attitude_program') {
      stage.free_flight = 'attitude_program'
      notes.push(
        tr(`第${s + 1}段の惰行中も姿勢プログラムに従うようにしました。`, `Stage ${s + 1} now follows the attitude program while coasting.`),
      )
    }
    constantEngine(stage, b, limit)
    return {
      inventory: {
        dry_kg: dry,
        propellant_kg: propellant,
        reserve_kg: reserve,
        max_total_burn_s: limit,
        max_ignitions: b.windows.length,
        source,
      },
      // Burns from the ignition, cut to the on-time limit.
      windows: shorten(
        b.windows.map(([a, c]): [number, number] => [a - b.start, c - b.start]),
        b.onTime - limit,
      ),
    }
  })
  const stages = plan.map((x) => x.inventory)

  // Phases follow the simulated timeline; only the last burn is left free.
  const lower = template.phases[0],
    upper = template.phases[template.phases.length - 1]
  const coastLower = template.phases.find((ph) => ph.stage === 0 && ph.mode === 'coast') ?? lower
  const limits = (s: number, coast: boolean) => {
    const from = s === 0 ? (coast ? coastLower : lower) : upper
    return {
      max_angle_of_attack_deg: from.max_angle_of_attack_deg,
      max_specific_force_m_s2: from.max_specific_force_m_s2,
      min_altitude_m: alt,
    }
  }
  const fixed = (d: number) => {
    const v = round(d, 3)
    return { initial: v, lower: v, upper: v }
  }
  const intervals = (d: number, burn: boolean) => (burn ? clamp(Math.round(d / 12), 4, 16) : d > 60 ? 4 : 1)
  const phases: (Omit<OptimizationPhase, 'initial_attitude_end_deg'> & { start: number })[] = []
  let t = 0
  const add = (
    name: string,
    stage: number,
    mode: 'burn' | 'coast',
    duration: OptimizationPhase['duration_s'],
    extra: Partial<OptimizationPhase> = {},
  ) => {
    phases.push({
      name,
      stage,
      mode,
      duration_s: duration,
      intervals: intervals(duration.initial, mode === 'burn'),
      vertical: false,
      end_event: 'none',
      ...limits(stage, mode === 'coast'),
      ...extra,
      start: t,
    })
    t += duration.initial
  }
  const tag = (s: number) => `stage${s + 1}`
  plan.forEach(({ windows, inventory: { max_total_burn_s: limit } }, s) => {
    const last = s === lastStage
    // Stage time at ignition; the first stage ignites at liftoff.
    const ignition = s === 0 ? 0 : Math.max(burns[s].start, 1)
    if (s > 0) add(`${tag(s)}_ignition_coast`, s, 'coast', fixed(ignition))
    windows.forEach(([a, b], k) => {
      const suffix = windows.length > 1 ? `_${k + 1}` : ''
      if (k > 0) {
        const gap = a - windows[k - 1][1]
        // Restart coasts of the last stage are free, as in a parking orbit.
        add(
          `${tag(s)}_coast${suffix}`,
          s,
          'coast',
          last ? { initial: round(gap), lower: round(Math.min(gap, 10)), upper: round(Math.max(2 * gap, gap + 600)) } : fixed(gap),
        )
      }
      let d = b - a
      if (s === 0 && k === 0) {
        const vertical = round(Math.min(lower.vertical ? lower.duration_s.initial : 10, d / 4), 1)
        add('vertical', 0, 'burn', fixed(vertical), { vertical: true, intervals: 1 })
        d -= vertical
      }
      add(
        `${tag(s)}_burn${suffix}`,
        s,
        'burn',
        last ? { initial: round(d), lower: round(Math.min(d, Math.max(1, d * 0.2)), 1), upper: limit } : fixed(d),
      )
    })
    if (!last) {
      const sep = vehicle.stages[s].separation_time_s ?? 0
      const end = ignition + windows[windows.length - 1][1]
      add(`${tag(s)}_to_separation`, s, 'coast', fixed(Math.max(sep - end, 1)), { end_event: 'separate_stage' })
    }
  })
  phases[phases.length - 1].end_event = 'deploy_payload'
  // The whole mesh has at most 64 intervals.
  while (phases.reduce((c, ph) => c + ph.intervals, 0) > 64) {
    const widest = phases.reduce((w, ph) => (ph.intervals > w.intervals ? ph : w))
    if (widest.intervals <= 1) break
    widest.intervals--
  }

  // The fairing leaves at the end of a phase: split the burn it falls in, or use the nearest phase end.
  let hasFairing = false
  const f = fairing as { stage: number; time: number } | null
  if (f && fairingKg > 0) {
    const own = phases.map((ph, i) => ({ ph, i })).filter(({ ph }) => ph.stage === f.stage)
    const inside = own.find(({ ph }) => ph.mode === 'burn' && f.time > ph.start + 1 && f.time < ph.start + ph.duration_s.initial - 1)
    if (inside) {
      const { ph, i } = inside
      const a = round(f.time - ph.start, 3)
      const free = ph.duration_s.lower !== ph.duration_s.upper
      const rest = free
        ? {
            initial: round(ph.duration_s.initial - a),
            lower: Math.max(1, round(ph.duration_s.lower - a)),
            upper: round(ph.duration_s.upper - a),
          }
        : fixed(ph.duration_s.initial - a)
      rest.lower = Math.min(rest.lower, rest.initial)
      const first = {
        ...ph,
        name: `${ph.name}_to_fairing`,
        duration_s: fixed(a),
        intervals: intervals(a, true),
        end_event: 'jettison_fairing' as const,
      }
      const second = { ...ph, start: ph.start + a, duration_s: rest, intervals: intervals(rest.initial, true) }
      phases.splice(i, 1, first, second)
      hasFairing = true
    } else {
      const open = own.filter(({ ph }) => ph.end_event === 'none')
      const nearest = open.sort(
        (x, y) => Math.abs(x.ph.start + x.ph.duration_s.initial - f.time) - Math.abs(y.ph.start + y.ph.duration_s.initial - f.time),
      )[0]
      if (nearest) {
        nearest.ph.end_event = 'jettison_fairing'
        hasFairing = true
      }
    }
    if (!hasFairing) {
      const st = vehicle.stages[f.stage]
      st.mass_initial_kg += fairingKg
      st.mass_dry_kg = (st.mass_dry_kg ?? 0) + fairingKg
      stages[f.stage].dry_kg += fairingKg
      notes.push(
        tr(
          'フェアリングの投棄時刻を置けないため、質量を段に残しました。',
          'The fairing jettison could not be placed; its mass stays on the stage.',
        ),
      )
    }
  }

  // Seed commands from the simulated attitude program; azimuth bounds around it.
  const azimuths = phases.map((ph) => attitudeAt(vehicle, ph.start + ph.duration_s.initial)[0])
  const az0 = attitudeAt(vehicle, 0)[0]
  const azBounds: [number, number] = [Math.floor(Math.min(az0 - 20, ...azimuths) - 5), Math.ceil(Math.max(az0 + 30, ...azimuths) + 5)]
  const [elLo] = template.elevation_bounds_deg
  const finished: OptimizationPhase[] = phases.map(({ start, ...ph }) => {
    const [az, el] = attitudeAt(vehicle, start + ph.duration_s.initial)
    return {
      ...ph,
      initial_attitude_end_deg: ph.vertical
        ? [round(az0, 3), 90]
        : [round(clamp(az, azBounds[0], azBounds[1]), 3), round(clamp(el, elLo, 90), 3)],
    }
  })

  // Separation counted from each stage's own start, as in the simulation.
  vehicle.stages.forEach((stage, s) => {
    const first = finished.findIndex((ph) => ph.stage === s)
    const sep = finished.findIndex((ph) => ph.stage === s && ph.end_event === 'separate_stage')
    if (sep >= 0)
      stage.separation_time_s = round(
        finished.slice(first, sep + 1).reduce((d, ph) => d + ph.duration_s.initial, 0),
        3,
      )
    else delete stage.separation_time_s
  })

  // Highest thrust acceleration at burnout with the lightest payload, with margin.
  const payloadLow = template.net_payload_kg.lower + template.payload_adapter_kg
  stages.forEach((inv, s) => {
    const above = stages.slice(s + 1).reduce((m, x) => m + x.dry_kg + x.propellant_kg, 0)
    const burnout = inv.dry_kg + inv.reserve_kg + above + payloadLow + (hasFairing && f && f.stage > s ? fairingKg : 0)
    const needed = Math.ceil((1.1 * burns[s].thrust) / burnout)
    for (const ph of finished)
      if (ph.stage === s && needed > ph.max_specific_force_m_s2) {
        ph.max_specific_force_m_s2 = needed
      }
  })

  // Payload range scaled with the launch mass, so a larger vehicle is not pinned at the template's upper bound.
  const dryStack = (inv: { dry_kg: number; propellant_kg: number }[], extra: number) =>
    inv.reduce((m, x) => m + x.dry_kg + x.propellant_kg, 0) + extra
  const scale =
    dryStack(stages, (hasFairing ? fairingKg : 0) + template.payload_adapter_kg) /
    dryStack(template.stages, template.fairing_kg + template.payload_adapter_kg)
  if (Math.abs(scale - 1) > 0.2) {
    const b = template.net_payload_kg
    const lowerKg = Math.max(1, Math.round(b.lower * scale))
    const upperKg = Math.max(lowerKg, Math.round(b.upper * scale))
    p.net_payload_kg = { lower: lowerKg, upper: upperKg, initial: clamp(Math.round(b.initial * scale), lowerKg, upperKg) }
    notes.push(
      tr(
        `衛星質量を探す範囲を全備質量に合わせて ${kg(lowerKg)}〜${kg(upperKg)} にしました。`,
        `The payload search range follows the launch mass: ${kg(lowerKg)} to ${kg(upperKg)}.`,
      ),
    )
  }
  Object.assign(p, {
    vehicle,
    data_source: source,
    stages,
    phases: finished,
    fairing_kg: hasFairing ? fairingKg : 0,
    initial_azimuth_deg: round(az0, 4),
    azimuth_bounds_deg: azBounds,
  })
  const lat = Math.abs(vehicle.launch.latitude_deg)
  if (p.orbit.inclination_deg < lat + 0.5) {
    p.orbit = { ...p.orbit, inclination_deg: Math.min(88, Math.ceil(lat + 1)) }
    notes.push(
      tr(
        `射場の緯度より低い傾斜角には直接投入できないため、目標傾斜角を ${p.orbit.inclination_deg}° にしました。`,
        `The target inclination is now ${p.orbit.inclination_deg}°, since an orbit below the launch latitude cannot be reached directly.`,
      ),
    )
  }
  fitHorizon(p)
}
