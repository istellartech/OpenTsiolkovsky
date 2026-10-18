// The simulation configuration: the same JSON the CLI, the WASM solver and
// the MCP server read (`Config` in src/config/mod.rs). Keys are snake_case
// and end in their unit. Every quantity that may vary is a `Curve`: a
// constant or `[x, y]` rows (piecewise linear, clamped at the ends). Stage
// times are measured from the stage start (the previous separation);
// attitude times from launch.

/** `[x, y]` rows with ascending x */
export type Rows = [number, number][]

/** A CSV file table; only the CLI can read these (the web app needs tables inline) */
export type FileTable = { file: string; columns?: number[] }

/** Constant or table */
export type Curve = number | Rows | FileTable

/** Values over Mach number × angle of attack [deg] */
export type Surface = { mach: number[]; alpha_deg: number[]; values: number[][] } | FileTable

export type Integrator = { method: 'rk4'; step_s?: number } | { method: 'rk45'; abs_tol?: number; rel_tol?: number }

/** Standard atmosphere (`AtmosphereKind` in src/physics/atmosphere.rs) */
export type AtmosphereModel = 'ussa1976' | 'legacy'

/** Motion of a stage while its engine is off */
export type FreeFlight = 'ballistic' | 'aero_stable' | 'attitude_program'

export interface Engine {
  /** Vacuum thrust over stage time [N] */
  thrust_vac_n: Curve
  /** Vacuum specific impulse over stage time [s] */
  isp_vac_s: Curve
  burn_start_s?: number
  burn_end_s: number
  /** Nozzle exit area for the ambient pressure loss [m²] */
  nozzle_exit_area_m2?: number
}

export interface Aero {
  diameter_m?: number
  /** Axial force coefficient over Mach */
  ca?: Curve
  /** CA while the engine is off; unset: `ca` */
  ca_power_off?: Curve
  /** Normal force slope over Mach [1/rad] */
  cn_alpha_per_rad?: Curve
  /** CN over Mach × angle of attack; replaces `cn_alpha_per_rad` */
  cn_table?: Surface
  ballistic_coefficient_kg_m2?: number
}

export interface Jettison {
  display_name?: DisplayName | null
  name?: string
  /** Release time from the stage start [s] */
  time_s: number
  mass_kg: number
  ballistic_coefficient_kg_m2?: number
  delta_v_ned_mps?: [number, number, number]
}

export interface ThrustTrim {
  cg_sta_m: Curve
  gimbal_sta_m: Curve
  cp_sta_m: Surface
  cg_offset_m?: [number, number, number]
  cp_offset_m?: [number, number, number]
  gimbal_offset_m?: [number, number, number]
}

/** Display-only metadata, accepted by Rust but never used in flight calculations. */
export type DisplayName = string | { ja: string; en: string }
export interface VehiclePresentation {
  stage_count?: number | null
  booster_count?: number | null
}
export interface PhasePresentation {
  name?: DisplayName | null
  separation_name?: DisplayName | null
  /** Hide only the synthetic stop/start at this interval's separation boundary. */
  engine_continues?: boolean
}

export interface Stage {
  presentation?: PhasePresentation | null
  /** Mass allocated to this calculation interval, excluding later intervals [kg] */
  mass_initial_kg: number
  /** Without propellant [kg]; unset: the whole stage may burn */
  mass_dry_kg?: number
  engine?: Engine
  aero?: Aero
  free_flight?: FreeFlight
  /** From the stage start [s]; required for every stage but the last */
  separation_time_s?: number
  jettisons?: Jettison[]
  thrust_trim?: ThrustTrim
}

export interface Config {
  $schema?: string
  name: string
  simulation: {
    end_time_s: number
    output_step_s?: number
    integrator?: Integrator
  }
  launch: {
    latitude_deg: number
    longitude_deg: number
    altitude_m?: number
    /** ISO 8601, e.g. 2024-07-01T01:00:00Z */
    time_utc?: string
    velocity_ned_mps?: [number, number, number]
    rail_length_m?: number
  }
  atmosphere?: {
    model?: AtmosphereModel
    seasonal_variation_percent?: number
    /** Rows `[altitude_m, percent]`; replaces the seasonal variation */
    density_deviation?: Rows | FileTable
  }
  wind?: {
    speed_mps?: number
    direction_deg?: number
    /** Rows `[altitude_m, speed_mps, direction_deg]`; replaces the constant wind */
    profile?: [number, number, number][] | FileTable
  }
  attitude?: {
    azimuth_deg?: Curve
    elevation_deg?: Curve
    roll_deg?: Curve
    yaw_offset_deg?: number
    pitch_offset_deg?: number
    roll_offset_deg?: number
    gyro_bias_deg_h?: [number, number, number]
  }
  presentation?: VehiclePresentation | null
  stages: Stage[]
}

/** Defaults of the Rust side for keys left out */
export const DEFAULTS = {
  outputStep: 1,
  diameter: 0.5,
  ballistic: 100,
  elevation: 90,
  tolerance: 1e-9,
  epoch: '2000-01-01T00:00:00Z',
} as const

export const isRows = (c: unknown): c is Rows => Array.isArray(c)
export const isFileTable = (c: unknown): c is FileTable =>
  !!c && typeof c === 'object' && !Array.isArray(c) && typeof (c as FileTable).file === 'string'

/** Rows of a curve (empty for a constant or a file) */
export const curveRows = (c: Curve | undefined): Rows => (isRows(c) ? c : [])

/** A representative value: the constant, or the first row's value */
export function curveValue(c: Curve | undefined, fallback = 0): number {
  if (typeof c === 'number') return c
  if (isRows(c) && c.length > 0) return c[0][1]
  return fallback
}

/** Value at x: linear between rows, clamped at the ends (as the solver) */
export function evalCurve(c: Curve | undefined, x: number, fallback = 0): number {
  if (typeof c === 'number') return c
  if (!isRows(c) || c.length === 0) return fallback
  if (x <= c[0][0]) return c[0][1]
  const last = c[c.length - 1]
  if (x >= last[0]) return last[1]
  for (let i = 0; i < c.length - 1; i++) {
    const [x0, y0] = c[i]
    const [x1, y1] = c[i + 1]
    if (x >= x0 && x <= x1) return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1
  }
  return last[1]
}

/** The integrator settings with the Rust defaults filled in */
export function integratorOf(config: Config): { method: 'rk4'; step_s: number } | { method: 'rk45'; abs_tol: number; rel_tol: number } {
  const i = config.simulation.integrator
  const step = config.simulation.output_step_s ?? DEFAULTS.outputStep
  if (i?.method === 'rk45') return { method: 'rk45', abs_tol: i.abs_tol ?? DEFAULTS.tolerance, rel_tol: i.rel_tol ?? DEFAULTS.tolerance }
  return { method: 'rk4', step_s: i?.step_s ?? Math.max(step / 2, 1e-6) }
}

/** Launch time as a JS Date (UTC); the epoch default when unset or invalid */
export function launchDate(config: Config): Date {
  const d = new Date(config.launch.time_utc ?? DEFAULTS.epoch)
  return Number.isNaN(d.getTime()) ? new Date(DEFAULTS.epoch) : d
}

/** Whether a date-time text is one the solver accepts (`UtcTime::parse` in src/config/time.rs) */
export function isValidDateTime(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2})(?::(\d{2})(?::(\d{2}(?:\.\d+)?))?)?)?(?:[Zz]|[+-]\d{2}(?::?\d{2})?)?$/.exec(
    text.trim(),
  )
  if (!m) return false
  const [y, mo, d, h = 0, mi = 0] = m.slice(1, 6).map((v) => Number(v ?? 0))
  const sec = Number(m[6] ?? 0)
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi))
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d && h < 24 && mi < 60 && sec < 60
}

/** ISO 8601 UTC text without milliseconds, as the Rust side writes it */
export const isoUtc = (d: Date) => d.toISOString().replace(/\.000Z$/, 'Z')

/** Shape check of a parsed JSON value (values are validated separately) */
export function isConfig(v: unknown): v is Config {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false
  const c = v as Record<string, unknown>
  const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
  return (
    typeof c.name === 'string' &&
    obj(c.simulation) &&
    typeof c.simulation.end_time_s === 'number' &&
    obj(c.launch) &&
    typeof c.launch.latitude_deg === 'number' &&
    typeof c.launch.longitude_deg === 'number' &&
    Array.isArray(c.stages) &&
    c.stages.every((s) => obj(s) && typeof s.mass_initial_kg === 'number')
  )
}

/** Absolute start time of each stage [s] (the sum of the previous separations) */
export function stageStarts(config: Config): number[] {
  let t = 0
  return config.stages.map((s) => {
    const start = t
    t += s.separation_time_s ?? Infinity
    return start
  })
}

// --- CSV tables -------------------------------------------------------------
// The browser cannot read `{file}` tables, so the web app inlines them from
// CSV files opened together with the configuration. Parsing follows
// src/config/table.rs.

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/
const SPECIAL = /^[+-]?(?:inf|infinity|nan)$/i

/** A number as Rust's `f64::from_str` reads it, or null */
function parseNumber(text: string): number | null {
  if (NUMBER.test(text)) return Number(text)
  if (SPECIAL.test(text)) return /nan/i.test(text) ? NaN : text.startsWith('-') ? -Infinity : Infinity
  return null
}

const csvFields = (line: string) =>
  line.split(',').map((t) =>
    t
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim(),
  )

/** Numeric CSV rows with at least `minCols` leading numeric fields; other rows are skipped (`parse_csv`) */
export function parseCsv(text: string, minCols: number): number[][] {
  const rows: number[][] = []
  for (const line of text.split(/\r?\n/)) {
    const values: number[] = []
    for (const field of csvFields(line)) {
      const v = parseNumber(field)
      if (v === null) break
      values.push(v)
    }
    if (values.length >= minCols) rows.push(values)
  }
  return rows
}

/**
 * Mach × angle grid of a surface CSV (`parse_surface`): rows must be all numeric
 * (an empty field is 0, other rows are skipped); the first row is anything,
 * then the angles; every other row Mach, then the values. Rows are sorted by
 * Mach; a short row is padded with its last value.
 */
export function parseSurface(text: string): { mach: number[]; alpha_deg: number[]; values: number[][] } {
  const lines: number[][] = []
  for (const line of text.split(/\r?\n/)) {
    const row = line.split(',').map((t) => (t.trim() === '' ? 0 : parseNumber(t.trim())))
    if (row.length >= 2 && row.every((v) => v !== null)) lines.push(row as number[])
  }
  const [header, ...rows] = lines
  if (!header) throw new Error('empty surface table')
  if (rows.length < 2) throw new Error('surface table needs at least 2 Mach rows')
  const alpha = header.slice(1)
  rows.sort((a, b) => a[0] - b[0])
  return {
    mach: rows.map((r) => r[0]),
    alpha_deg: alpha,
    values: rows.map((r) => {
      const v = r.slice(1)
      const last = v.length ? v[v.length - 1] : 0
      while (v.length < alpha.length) v.push(last)
      return v.slice(0, alpha.length)
    }),
  }
}

/** Rows of `n` columns from a file table (`Table::rows`) */
function tableRows(table: FileTable, text: string, n: number): number[][] {
  const picks = table.columns ?? Array.from({ length: n }, (_, i) => i)
  if (picks.length !== n) throw new Error(`give ${n} columns, not ${picks.length}`)
  const width = Math.max(...picks) + 1
  const rows = parseCsv(text, width)
  if (rows.length === 0) throw new Error(`no numeric rows with ${width} columns`)
  return rows.map((r) => picks.map((i) => r[i]))
}

export interface InlinedTables {
  config: Config
  /** File names referenced but not given */
  missing: string[]
  /** `file: reason` for files that could not be read as tables */
  errors: string[]
  /** Number of tables filled in */
  inlined: number
}

/**
 * Replace every `{file}` table with its rows (or Mach × angle grid) from
 * `files`, keyed by file name (a path matches by its base name, as
 * `MemorySource`). Tables whose file is missing or unreadable are kept.
 */
export function inlineFileTables(config: Config, files: ReadonlyMap<string, string>): InlinedTables {
  const out = structuredClone(config)
  const missing = new Set<string>()
  const errors: string[] = []
  let inlined = 0
  const read = (name: string) => files.get(name) ?? files.get(name.split(/[\\/]/).pop()!.trim())
  const resolve = <T>(value: unknown, parse: (t: FileTable, text: string) => T): T | undefined => {
    if (!isFileTable(value)) return undefined
    const text = read(value.file)
    if (text === undefined) {
      missing.add(value.file)
      return undefined
    }
    try {
      const result = parse(value, text)
      inlined++
      return result
    } catch (err) {
      errors.push(`${value.file}: ${err instanceof Error ? err.message : String(err)}`)
      return undefined
    }
  }
  /** Inline `obj[key]` when it is a file table */
  const fill = <O extends object>(obj: O | undefined, key: keyof O, kind: 2 | 3 | 'surface') => {
    if (!obj) return
    const v = resolve(obj[key], (t, text) => (kind === 'surface' ? parseSurface(text) : tableRows(t, text, kind)))
    if (v !== undefined) obj[key] = v as O[keyof O]
  }

  fill(out.attitude, 'azimuth_deg', 2)
  fill(out.attitude, 'elevation_deg', 2)
  fill(out.attitude, 'roll_deg', 2)
  fill(out.atmosphere, 'density_deviation', 2)
  fill(out.wind, 'profile', 3)
  for (const s of out.stages) {
    fill(s.engine, 'thrust_vac_n', 2)
    fill(s.engine, 'isp_vac_s', 2)
    fill(s.aero, 'ca', 2)
    fill(s.aero, 'ca_power_off', 2)
    fill(s.aero, 'cn_alpha_per_rad', 2)
    fill(s.aero, 'cn_table', 'surface')
    fill(s.thrust_trim, 'cg_sta_m', 2)
    fill(s.thrust_trim, 'gimbal_sta_m', 2)
    fill(s.thrust_trim, 'cp_sta_m', 'surface')
  }
  return { config: out, missing: [...missing], errors, inlined }
}
