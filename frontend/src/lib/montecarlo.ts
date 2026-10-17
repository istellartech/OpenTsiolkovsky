// Monte Carlo dispersion runs: types shared with the Rust/WASM side
// (src/montecarlo.rs), the parallel runner and geometry for the error ellipse.
import { initWasm, type ClientConfig, type ImpactPointJson } from './simulation'

/** 1-sigma dispersions (Gaussian); same keys as the Rust `Dispersion` */
export type Dispersion = {
  thrust_percent: number
  isp_percent: number
  mass_percent: number
  drag_percent: number
  elevation_deg: number
  azimuth_deg: number
  wind_speed_mps: number
  wind_direction_deg: number
  air_density_percent: number
}

/** Rust `Dispersion::default()` */
export const DEFAULT_DISPERSION: Dispersion = {
  thrust_percent: 1,
  isp_percent: 0.5,
  mass_percent: 1,
  drag_percent: 5,
  elevation_deg: 0.5,
  azimuth_deg: 0.5,
  wind_speed_mps: 2,
  wind_direction_deg: 10,
  air_density_percent: 5,
}

export const DISPERSION_KEYS = Object.keys(DEFAULT_DISPERSION) as (keyof Dispersion)[]

export type BodyImpact = { body: string; impact: ImpactPointJson | null }

export type CaseResult = {
  index: number
  perturbation: Dispersion
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
  max_distance_m: number
}

export interface MonteCarloSettings {
  count: number
  seed: number
  dispersion: Dispersion
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

/** One row per case, columns as the CLI's `<out>_montecarlo.csv`. */
export function casesToCsv(cases: CaseResult[], bodies: string[]): string {
  const header = [
    'case',
    'thrust[%]',
    'isp[%]',
    'mass[%]',
    'drag[%]',
    'elevation[deg]',
    'azimuth[deg]',
    'wind_speed[m/s]',
    'wind_direction[deg]',
    'air_density[%]',
    'max_altitude[m]',
    ...bodies.flatMap((b) => [`${b}_impact_time[s]`, `${b}_impact_lat[deg]`, `${b}_impact_lon[deg]`]),
  ]
  const rows = [...cases]
    .sort((a, b) => a.index - b.index)
    .map((c) => {
      const p = c.perturbation
      const impacts = bodies.flatMap((b): (number | string)[] => {
        const i = c.impacts.find((x) => x.body === b)?.impact
        return i ? [i.time_s, i.latitude_deg, i.longitude_deg] : ['', '', '']
      })
      return [c.index, ...DISPERSION_KEYS.map((k) => p[k]), c.max_altitude_m ?? '', ...impacts].join(',')
    })
  return [header.join(','), ...rows].join('\n')
}

export type McWorkerRequest = {
  config: ClientConfig
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
export function startMonteCarlo(config: ClientConfig, settings: MonteCarloSettings, onProgress: (p: McProgress) => void): () => void {
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

/** Per-body statistics, computed by the Rust code (`monte_carlo_statistics`). */
export async function impactStatistics(cases: CaseResult[]): Promise<ImpactStatistics[]> {
  const mod = await initWasm()
  return JSON.parse(mod.monte_carlo_statistics(JSON.stringify(cases))) as ImpactStatistics[]
}
