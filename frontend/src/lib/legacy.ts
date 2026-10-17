// Import of CLI parameter files (param_*.json) together with the CSV tables
// they reference. Mirrors how the CLI loads them (src/io.rs, src/rocket.rs):
//  - aerodynamics and attitude come from stage 1 only; wind is global;
//  - thrust / Isp tables are per stage on stage-relative time;
//  - CSVs have a header row and use their first N numeric columns;
//  - stages after one whose "following stage exist?" is false never run;
//  - with no integrator block the CLI uses RK4 at half the output step.
import type { ClientConfig, ClientStageConfig, ClientMachSample, ClientTimeSample } from './simulation'
import { tr } from './i18n'

type Json = Record<string, unknown>

export interface LegacyImport {
  config: ClientConfig
  /** CSV file names the JSON referenced but that were not provided */
  missing: string[]
  /** Settings present in the file that this app cannot represent */
  unsupported: string[]
}

export const isLegacyParamFile = (v: unknown): v is Json => !!v && typeof v === 'object' && 'name(str)' in (v as Json)

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown) => v === true

/** Rows of the first `n` numeric columns; header and non-numeric rows are skipped. */
export function parseCsvRows(text: string, n: number): number[][] {
  const rows: number[][] = []
  // Like the CLI's csv reader, the first line is always a header.
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim())
    if (cells.length < n) continue
    const vals = cells.slice(0, n).map((c) => (c === '' ? NaN : Number(c)))
    if (vals.every(Number.isFinite)) rows.push(vals)
  }
  return rows
}

/** True when a CN file is a 2D (Mach × angle) table rather than Mach → CN pairs. */
function isSurface(text: string): boolean {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(',').filter((c) => c.trim() !== '').length)
    .some((cols) => cols > 2)
}

export function fromLegacyParamFile(json: Json, csvByName: Map<string, string>): LegacyImport {
  const missing: string[] = []
  const unsupported: string[] = []

  const table = (exists: unknown, name: unknown, n: number): number[][] | null => {
    if (!bool(exists) || typeof name !== 'string' || name.trim() === '') return null
    const key = baseName(name)
    const text = csvByName.get(key)
    if (text === undefined) {
      if (!missing.includes(key)) missing.push(key)
      return null
    }
    return parseCsvRows(text, n)
  }
  const timeSeries = (rows: number[][] | null): ClientTimeSample[] => (rows ?? []).map(([time, value]) => ({ time, value }))
  const machSeries = (rows: number[][] | null): ClientMachSample[] => (rows ?? []).map(([mach, value]) => ({ mach, value }))

  // Stages that actually run
  const rawStages: Json[] = []
  for (const key of ['stage1', 'stage2', 'stage3']) {
    const st = json[key]
    if (!st) break
    rawStages.push(obj(st))
    if (!bool(obj(obj(st).stage)['following stage exist?(bool)'])) break
  }
  if (rawStages.length === 0 && json.stage) rawStages.push(obj(json.stage))
  if (rawStages.length === 0) throw new Error(tr('段（stage1）の設定が見つかりません。', 'No stage settings (stage1) found.'))

  const stages: ClientStageConfig[] = rawStages.map((st, i) => {
    const t = obj(st.thrust)
    const hasNext = i < rawStages.length - 1
    if (bool(obj(st['dumping product'])['dumping product exist?(bool)'])) unsupported.push(tr(`${i + 1}段の投棄物（dumping product）`, `stage ${i + 1} dumping product`))
    if (bool(obj(st['attitude neutrality(3DoF)'])['considering neutrality?(bool)'])) unsupported.push(tr(`${i + 1}段の姿勢中立性（3DoF）`, `stage ${i + 1} attitude neutrality (3DoF)`))
    return {
      power_mode: num(st['power flight mode(int)']),
      free_mode: num(st['free flight mode(int)']),
      mass_initial_kg: num(st['mass initial[kg]']),
      mass_dry_kg: num(st['mass initial[kg]']),
      burn_start_s: num(t['burn start time(time of each stage)[s]']),
      burn_end_s: num(t['burn end time(time of each stage)[s]']),
      forced_cutoff_s: num(t['forced cutoff time(time of each stage)[s]'], num(t['burn end time(time of each stage)[s]'])),
      separation_time_s: hasNext ? num(obj(st.stage)['separation time[s]'], 1e6) : 1e6,
      coast_time_s: 0,
      throat_diameter_m: num(t['throat diameter[m]'], 0.1),
      nozzle_expansion_ratio: num(t['nozzle expansion ratio[-]'], 5),
      nozzle_exit_pressure_pa: num(t['nozzle exhaust pressure[Pa]']),
      thrust_constant: num(t['const thrust vac[N]']),
      thrust_multiplier: num(t['thrust coefficient[-]'], 1),
      thrust_profile: timeSeries(table(t['thrust vac file exist?(bool)'], t['thrust vac file name(str)'], 2)),
      isp_constant: num(t['const Isp vac[s]']),
      isp_multiplier: num(t['Isp coefficient[-]'], 1),
      isp_profile: timeSeries(table(t['Isp vac file exist?(bool)'], t['Isp vac file name(str)'], 2)),
      cg_position_m: [0, 0, 0],
      rotational_inertia_kgm2: [0, 0, 0],
    }
  })

  // Aerodynamics and attitude: stage 1, as in the CLI
  const s1 = rawStages[0]
  const aero = obj(s1.aero)

  // The CLI uses each stage's own diameter / coefficients (only the Mach
  // tables come from stage 1); keep the ones that differ from stage 1.
  const AERO_KEYS: [keyof NonNullable<ClientStageConfig['aero']>, string][] = [
    ['body_diameter_m', 'body diameter[m]'],
    ['cn_constant', 'const normal coefficient[-]'],
    ['cn_multiplier', 'normal multiplier[-]'],
    ['ca_constant', 'const axial coefficient[-]'],
    ['ca_multiplier', 'axial multiplier[-]'],
    ['ballistic_coefficient', 'ballistic coefficient(ballistic flight mode)[kg/m2]'],
  ]
  rawStages.forEach((st, i) => {
    if (i === 0) return
    const own = obj(st.aero)
    const diff: NonNullable<ClientStageConfig['aero']> = {}
    for (const [key, legacyKey] of AERO_KEYS) {
      if (typeof own[legacyKey] === 'number' && own[legacyKey] !== aero[legacyKey]) diff[key] = own[legacyKey] as number
    }
    if (Object.keys(diff).length) stages[i].aero = diff
  })
  const att = obj(s1.attitude)

  let cnProfile: ClientMachSample[] = []
  if (bool(aero['normal coefficient file exist?(bool)'])) {
    const name = baseName(str(aero['normal coefficient file name(str)']))
    const text = csvByName.get(name)
    if (text === undefined) missing.push(name)
    else if (isSurface(text)) unsupported.push(tr(`CN の2次元テーブル（${name}）— 定数 CN を使います`, `2-D CN table (${name}) — constant CN is used instead`))
    else cnProfile = machSeries(parseCsvRows(text, 2))
  }

  const calc = obj(json['calculate condition'])
  const outputStep = num(calc['time step for output[s]'], 1)
  const integ = obj(calc.integrator)
  const method = str(integ['method(str)'], 'rk4').toLowerCase() === 'rk45' ? 'rk45' : 'rk4'
  if (bool(calc['air density variation file exist?(bool)'])) unsupported.push(tr('大気密度変動ファイル', 'air density variation file'))

  const launch = obj(json.launch)
  const llh = (launch['position LLH[deg,deg,m]'] as number[]) ?? [0, 0, 0]
  const ned = (launch['velocity NED[m/s]'] as number[]) ?? [0, 0, 0]
  const ts = (launch['time(UTC)[y,m,d,h,min,sec]'] as number[]) ?? [2000, 1, 1, 0, 0, 0]

  const wind = obj(json.wind)
  const constWind = (wind['const wind[m/s,deg]'] as number[]) ?? [0, 0]
  const windRows = table(wind['wind file exist?(bool)'], wind['wind file name(str)'], 3)
  const attRows = table(att['attitude file exist?(bool)'], att['attitude file name(str)'], 3)

  const config: ClientConfig = {
    name: str(json['name(str)'], 'imported'),
    simulation: {
      duration_s: num(calc['end time[s]'], 100),
      output_step_s: outputStep,
      air_density_percent: num(calc['variation ratio of air density[%](-100to100, default=0)']),
      integrator: {
        method,
        rk4_step_s: num(integ['rk4 step[s]'], Math.max(outputStep / 2, 1e-6)),
      },
    },
    launch: {
      latitude_deg: num(llh[0]),
      longitude_deg: num(llh[1]),
      altitude_m: num(llh[2]),
      velocity_ned_mps: [num(ned[0]), num(ned[1]), num(ned[2])],
      datetime_utc: { year: num(ts[0]), month: num(ts[1], 1), day: num(ts[2], 1), hour: num(ts[3]), minute: num(ts[4]), second: num(ts[5]) },
    },
    stages,
    aerodynamics: {
      body_diameter_m: num(aero['body diameter[m]'], 0.5),
      cn_constant: num(aero['const normal coefficient[-]']),
      cn_multiplier: num(aero['normal multiplier[-]'], 1),
      cn_profile: cnProfile,
      ca_constant: num(aero['const axial coefficient[-]']),
      ca_multiplier: num(aero['axial multiplier[-]'], 1),
      ca_profile: machSeries(table(aero['axial coefficient file exist?(bool)'], aero['axial coefficient file name(str)'], 2)),
      ballistic_coefficient: num(aero['ballistic coefficient(ballistic flight mode)[kg/m2]'], 100),
    },
    attitude: {
      elevation_deg: num(att['const elevation[deg]'], 90),
      azimuth_deg: num(att['const azimuth[deg]']),
      pitch_offset_deg: num(att['pitch offset[deg]']),
      yaw_offset_deg: num(att['yaw offset[deg]']),
      roll_offset_deg: num(att['roll offset[deg]']),
      gyro_bias_deg_h: [num(att['gyro bias x[deg/h]']), num(att['gyro bias y[deg/h]']), num(att['gyro bias z[deg/h]'])],
      profile: (attRows ?? []).map(([time, azimuth_deg, elevation_deg]) => ({ time, azimuth_deg, elevation_deg })),
    },
    wind: {
      speed_mps: num(constWind[0]),
      direction_deg: num(constWind[1]),
      profile: (windRows ?? []).map(([altitude_m, speed_mps, direction_deg]) => ({ altitude_m, speed_mps, direction_deg })),
    },
  }

  return { config, missing, unsupported }
}

/** File name without any directory part ("data/a.csv" → "a.csv"). */
export const baseName = (p: string) => p.split(/[\\/]/).pop()!.trim()
