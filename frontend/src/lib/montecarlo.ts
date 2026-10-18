// Monte Carlo dispersion runs: types shared with the Rust/WASM side
// (src/montecarlo.rs), the parallel runner and geometry for the error ellipse.
import type { Config } from './config'
import { initWasm, type ImpactPointJson } from './simulation'

/** How each dispersion is drawn (`Distribution` in src/montecarlo.rs) */
export type Distribution = 'normal' | 'uniform'

/** Numeric 1-sigma dispersions, in the CSV column order of the Rust side */
export const DISPERSION_KEYS = [
  'thrust_percent',
  'isp_percent',
  'mass_percent',
  'drag_percent',
  'normal_percent',
  'separation_time_s',
  'elevation_deg',
  'azimuth_deg',
  'wind_speed_percent',
  'wind_speed_mps',
  'wind_direction_deg',
  'air_density_percent',
] as const

export type NumericDispersionKey = (typeof DISPERSION_KEYS)[number]

/** 1-sigma dispersions (`Dispersion` in src/montecarlo.rs) */
export type Dispersion = Record<NumericDispersionKey, number> & {
  /** `uniform` draws ±√3σ with the same standard deviation */
  distribution: Distribution
  /** Draw thrust, Isp, mass, drag, CN and separation time for each stage separately */
  independent_stages: boolean
}

/** Rust `Dispersion::default()` */
export const DEFAULT_DISPERSION: Dispersion = {
  thrust_percent: 1,
  isp_percent: 0.5,
  mass_percent: 1,
  drag_percent: 5,
  normal_percent: 0,
  separation_time_s: 0,
  elevation_deg: 0.5,
  azimuth_deg: 0.5,
  wind_speed_percent: 0,
  wind_speed_mps: 2,
  wind_direction_deg: 10,
  air_density_percent: 5,
  distribution: 'normal',
  independent_stages: false,
}

/** One stage's draw when the dispersion has `independent_stages` */
export type StagePerturbation = {
  thrust_percent: number
  isp_percent: number
  mass_percent: number
  drag_percent: number
  normal_percent: number
  separation_time_s: number
}

/** The values drawn for one case (Rust `Perturbation`) */
export type Perturbation = Record<NumericDispersionKey, number> & {
  /** Per-stage draws, stage 1 first; the common fields then hold stage 1's values */
  stages?: StagePerturbation[]
}

export type BodyImpact = { body: string; impact: ImpactPointJson | null }

export type CaseResult = {
  index: number
  perturbation: Perturbation
  max_altitude_m: number | null
  impacts: BodyImpact[]
}

export type ImpactStatistics = {
  body: string
  impacts: number
  cases: number
  mean_latitude_deg: number | null
  mean_longitude_deg: number | null
  sigma_north_m: number
  sigma_east_m: number
  /** 1-sigma error ellipse */
  ellipse_major_m: number
  ellipse_minor_m: number
  /** Azimuth of the major axis, clockwise from north [deg] */
  ellipse_azimuth_deg: number
  /** Ellipses holding 95 % and 99 % of a 2-D Gaussian (1-sigma × 2.448 and × 3.035) */
  ellipse_95_major_m: number
  ellipse_95_minor_m: number
  ellipse_99_major_m: number
  ellipse_99_minor_m: number
  max_distance_m: number
}

/** Which error ellipse to draw */
export type EllipseLevel = 'sigma1' | 'p95' | 'p99'

export const ELLIPSE_LEVELS: EllipseLevel[] = ['sigma1', 'p95', 'p99']
export const DEFAULT_ELLIPSE: EllipseLevel = 'p99'

/** Short name of an ellipse level, e.g. "95%" */
export const ellipseLabel = (level: EllipseLevel) => (level === 'sigma1' ? '1σ' : level === 'p95' ? '95%' : '99%')

/** Semi-axes [m] of the chosen ellipse */
export function ellipseAxes(s: ImpactStatistics, level: EllipseLevel): { major: number; minor: number } {
  if (level === 'p95') return { major: s.ellipse_95_major_m, minor: s.ellipse_95_minor_m }
  if (level === 'p99') return { major: s.ellipse_99_major_m, minor: s.ellipse_99_minor_m }
  return { major: s.ellipse_major_m, minor: s.ellipse_minor_m }
}

export interface MonteCarloSettings {
  count: number
  seed: number
  dispersion: Dispersion
  /** Ellipse shown on the map and in the table (display only; default 99 %) */
  ellipse?: EllipseLevel
}

/** Stage number of a body key (`vehicle` has none). */
export function bodyStage(body: string): number | null {
  const m = /^stage(\d+)/.exec(body)
  return m ? Number(m[1]) : null
}

const M_PER_DEG = (6378137 * Math.PI) / 180

/**
 * Closed outline of an ellipse on the ground: semi-axes [m], major axis at
 * `azimuthDeg` clockwise from north. Flat-earth offsets around the centre,
 * matching how the Rust statistics are computed.
 */
export function ellipsePoints(
  lat: number,
  lon: number,
  major: number,
  minor: number,
  azimuthDeg: number,
  n = 72,
): { lat: number; lon: number }[] {
  const az = (azimuthDeg * Math.PI) / 180
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 1e-6)
  const out: { lat: number; lon: number }[] = []
  for (let k = 0; k <= n; k++) {
    const th = (2 * Math.PI * k) / n
    const a = major * Math.cos(th)
    const b = minor * Math.sin(th)
    const north = a * Math.cos(az) - b * Math.sin(az)
    const east = a * Math.sin(az) + b * Math.cos(az)
    out.push({ lat: lat + north / M_PER_DEG, lon: lon + east / (M_PER_DEG * cosLat) })
  }
  return out
}

/** One row per case, with the columns of the CLI's montecarlo_cases.csv. */
export function casesToCsv(cases: CaseResult[], bodies: string[]): string {
  const stageCount = Math.max(0, ...cases.map((c) => c.perturbation.stages?.length ?? 0))
  const stageKeys = ['thrust_percent', 'isp_percent', 'mass_percent', 'drag_percent', 'normal_percent', 'separation_time_s'] as const
  const header = [
    'case',
    ...DISPERSION_KEYS,
    ...Array.from({ length: stageCount }, (_, k) => stageKeys.map((c) => `stage${k + 1}_${c}`)).flat(),
    'max_altitude_m',
    ...bodies.flatMap((b) => [`${b}_impact_time_s`, `${b}_impact_latitude_deg`, `${b}_impact_longitude_deg`]),
  ]
  const rows = [...cases]
    .sort((a, b) => a.index - b.index)
    .map((c) => {
      const p = c.perturbation
      const stages = Array.from({ length: stageCount }, (_, k) => stageKeys.map((key) => p.stages?.[k]?.[key] ?? '')).flat()
      const impacts = bodies.flatMap((b): (number | string)[] => {
        const i = c.impacts.find((x) => x.body === b)?.impact
        return i ? [i.time_s, i.latitude_deg, i.longitude_deg] : ['', '', '']
      })
      return [c.index, ...DISPERSION_KEYS.map((k) => p[k]), ...stages, c.max_altitude_m ?? '', ...impacts].join(',')
    })
  return [header.join(','), ...rows].join('\n')
}

export type McWorkerRequest = {
  config: Config
  dispersion: Dispersion
  seed: number
  indices: number[]
}

export type McWorkerMessage = { type: 'case'; case: CaseResult } | { type: 'done' } | { type: 'error'; error: string }

export interface McProgress {
  cases: CaseResult[]
  done: boolean
  error?: string
}

const createWorker = () => new Worker(new URL('../workers/montecarlo.worker.ts', import.meta.url), { type: 'module' })

/**
 * Run `count` cases split over several workers. `onProgress` receives the
 * cases finished so far (in completion order). Returns a cancel function.
 */
export function startMonteCarlo(config: Config, settings: MonteCarloSettings, onProgress: (p: McProgress) => void): () => void {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2
  const n = Math.max(1, Math.min(settings.count, Math.max(cores - 1, 1), 8))
  const cases: CaseResult[] = []
  let finished = 0
  let stopped = false
  const workers: Worker[] = []
  const stop = () => {
    stopped = true
    workers.forEach((w) => w.terminate())
  }

  for (let w = 0; w < n; w++) {
    const indices: number[] = []
    for (let i = w; i < settings.count; i += n) indices.push(i)
    const worker = createWorker()
    workers.push(worker)
    worker.onmessage = (e: MessageEvent<McWorkerMessage>) => {
      if (stopped) return
      const msg = e.data
      if (msg.type === 'case') {
        cases.push(msg.case)
        onProgress({ cases, done: false })
      } else if (msg.type === 'done') {
        worker.terminate()
        if (++finished === n) onProgress({ cases, done: true })
      } else {
        stop()
        onProgress({ cases, done: true, error: msg.error })
      }
    }
    worker.onerror = (e) => {
      if (stopped) return
      stop()
      onProgress({ cases, done: true, error: e.message || 'Monte Carlo worker failed' })
    }
    worker.postMessage({ config, dispersion: settings.dispersion, seed: settings.seed, indices } satisfies McWorkerRequest)
  }
  return stop
}

/** Per-body statistics, computed by the Rust code (`impact_statistics`). */
export async function impactStatistics(cases: CaseResult[]): Promise<ImpactStatistics[]> {
  const mod = await initWasm()
  return JSON.parse(mod.monte_carlo_statistics_json(JSON.stringify(cases))) as ImpactStatistics[]
}
