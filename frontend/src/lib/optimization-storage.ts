import type { OptimizationResult } from './optimization'
import { assertFiniteJson, inspectOptimizationInput, inputTitle } from './optimization-input'
import type { EditorSection, NumericDraft } from './optimization-input'
import { tr } from './i18n'

export interface OptimizationRun {
  id: string
  createdAt: number
  label: string
  origin: 'solver' | 'import'
  result: OptimizationResult
}
export interface SavedRunInfo extends Omit<OptimizationRun, 'result'> {
  runId: string
  problemKind: string
  converged: boolean
  validation: string
  payloadKg: number | null
  archived: boolean
}
export interface OptimizationDraft {
  raw: string
  fields: Record<string, NumericDraft>
  section: EditorSection
  preset: string
  updatedAt: number
}
export const MAX_OPTIMIZATION_FILE_BYTES = 64 * 1024 * 1024
const DATABASE = 'ot-optimization'
let database: Promise<IDBDatabase> | null = null
let sessionDraft: OptimizationDraft | null = null
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const numbers = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => typeof n === 'number' && Number.isFinite(n))
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')
const numeric = (v: Record<string, unknown>, keys: string[]) => keys.every((key) => typeof v[key] === 'number' && Number.isFinite(v[key]))
const resultError = () =>
  new Error(
    tr(
      '結果JSONの形式が正しくありません。入力と全結果を保存したJSONを選んでください。',
      'Invalid result JSON. Select an exported full result with its input.',
    ),
  )

/** Validate external files before storing/rendering them; never repair a result. */
export function readOptimizationResult(value: unknown): OptimizationResult {
  assertFiniteJson(value)
  if (!object(value) || value.schema_version !== 1 || !object(value.input)) throw resultError()
  const input = inspectOptimizationInput(JSON.stringify(value.input))
  if (!input.input || input.issues.length) throw resultError()
  if (
    typeof value.converged !== 'boolean' ||
    !['solver_status', 'solver_version', 'code_revision', 'model_fidelity'].every((key) => typeof value[key] === 'string') ||
    !strings(value.variable_names) ||
    !strings(value.constraint_names) ||
    !Array.isArray(value.iterations)
  )
    throw resultError()
  if (
    !value.iterations.every(
      (r) =>
        object(r) &&
        typeof r.restoration === 'boolean' &&
        numeric(r, ['iteration', 'objective', 'primal_infeasibility', 'dual_infeasibility']),
    )
  )
    throw resultError()
  const s = value.solution
  if (
    s !== null &&
    (!object(s) || !['x', 'z_lower', 'z_upper', 'constraints', 'lambda'].every((key) => numbers(s[key])) || !numeric(s, ['objective']))
  )
    throw resultError()
  if (object(s)) {
    for (const key of ['x', 'z_lower', 'z_upper']) if ((s[key] as number[]).length !== value.variable_names.length) throw resultError()
    for (const key of ['constraints', 'lambda']) if ((s[key] as number[]).length !== value.constraint_names.length) throw resultError()
  }
  if (value.converged && (value.solver_status !== 'Solve_Succeeded' || s === null)) throw resultError()
  const v = value.validation
  if (v !== null) {
    if (
      !object(v) ||
      !['passed', 'failed'].includes(String(v.status)) ||
      !numeric(v, ['max_bound_violation']) ||
      (v.error !== null && typeof v.error !== 'string')
    )
      throw resultError()
    const checkFlight = (f: Record<string, unknown>, multi: boolean) => {
      if (
        !Array.isArray(f.samples) ||
        f.samples.length === 0 ||
        !Array.isArray(f.checks) ||
        !numeric(f, [
          'final_time_s',
          'max_position_error_m',
          'max_velocity_error_m_s',
          'position_tolerance_m',
          'velocity_tolerance_m_s',
          'tighter_rk_position_difference_m',
        ])
      )
        throw resultError()
      let previous = -Infinity
      for (const point of f.samples) {
        if (
          !object(point) ||
          !numbers(point.state_eci) ||
          point.state_eci.length !== 7 ||
          !numeric(point, ['time_s', 'altitude_m', 'dynamic_pressure_pa', 'angle_of_attack_deg', 'specific_force_m_s2']) ||
          (point.time_s as number) < previous - 1e-9
        )
          throw resultError()
        if (multi && !numeric(point, ['phase', 'stage', 'azimuth_deg', 'elevation_deg', 'inertial_direction_rate_deg_s']))
          throw resultError()
        if (!multi && !numeric(point, ['pitch_deg', 'pitch_rate_deg_s', 'downrange_m', 'velocity_up_m_s'])) throw resultError()
        previous = point.time_s as number
      }
      for (const check of f.checks)
        if (
          !object(check) ||
          typeof check.id !== 'string' ||
          typeof check.unit !== 'string' ||
          typeof check.passed !== 'boolean' ||
          !numeric(check, ['value', 'tolerance', 'violation']) ||
          !['lower', 'upper'].every((key) => check[key] === null || typeof check[key] === 'number')
        )
          throw resultError()
      if (v.status === 'passed' && f.checks.some((c) => !c.passed)) throw resultError()
    }
    if (v.multi_stage !== undefined && v.multi_stage !== null) {
      if (!object(v.multi_stage)) throw resultError()
      const f = v.multi_stage
      checkFlight(f, true)
      if (
        !numeric(f, ['net_payload_kg', 'initial_total_mass_kg', 'payload_adapter_kg', 'fairing_kg', 'max_mass_error_kg']) ||
        !numbers(f.deployed_state_eci) ||
        f.deployed_state_eci.length !== 7 ||
        !strings(f.unevaluated_constraints) ||
        !object(f.orbit) ||
        !numeric(f.orbit, ['perigee_altitude_m', 'inclination_deg', 'eccentricity']) ||
        (f.orbit.apogee_altitude_m !== null && typeof f.orbit.apogee_altitude_m !== 'number') ||
        !Array.isArray(f.events) ||
        !Array.isArray(f.stage_ledgers)
      )
        throw resultError()
      for (const e of f.events)
        if (
          !object(e) ||
          !['separate_stage', 'jettison_fairing', 'deploy_payload'].includes(String(e.kind)) ||
          !numbers(e.before_eci) ||
          e.before_eci.length !== 7 ||
          !numbers(e.after_eci) ||
          e.after_eci.length !== 7 ||
          !numeric(e, [
            'phase',
            'stage',
            'time_s',
            'dry_removed_kg',
            'propellant_removed_kg',
            'fairing_removed_kg',
            'adapter_removed_kg',
            'removed_mass_kg',
            'position_jump_m',
            'velocity_jump_m_s',
          ])
        )
          throw resultError()
      for (const ledger of f.stage_ledgers)
        if (
          !object(ledger) ||
          !numeric(ledger, [
            'stage',
            'dry_kg',
            'propellant_loaded_kg',
            'propellant_consumed_kg',
            'residual_kg',
            'required_reserve_kg',
            'total_burn_s',
            'ignition_count',
          ])
        )
          throw resultError()
    }
    if (v.flight !== undefined && v.flight !== null) {
      if (!object(v.flight)) throw resultError()
      checkFlight(v.flight, false)
      if (
        !object(v.flight.mass_ledger) ||
        !numeric(v.flight.mass_ledger, [
          'additional_payload_kg',
          'propellant_burned_kg',
          'propellant_remaining_kg',
          'initial_total_kg',
          'final_total_kg',
        ])
      )
        throw resultError()
    }
    if (v.trajectory !== undefined && v.trajectory !== null) {
      const t = v.trajectory
      if (
        !object(t) ||
        !numeric(t, [
          'duration_s',
          'reference_duration_s',
          'max_position_error_m',
          'max_velocity_error_m_s',
          'position_tolerance_m',
          'velocity_tolerance_m_s',
        ]) ||
        !Array.isArray(t.samples) ||
        !t.samples.length ||
        !t.samples.every((p) => object(p) && numeric(p, ['time_s', 'position_m', 'velocity_m_s', 'acceleration_m_s2']))
      )
        throw resultError()
    }
  }
  return value as unknown as OptimizationResult
}
export function readOptimizationFile(raw: string): { kind: 'result'; result: OptimizationResult } | { kind: 'input'; raw: string } {
  const value: unknown = JSON.parse(raw)
  if (object(value) && 'input' in value) return { kind: 'result', result: readOptimizationResult(value) }
  const { input, issues } = inspectOptimizationInput(raw)
  // Structurally valid inputs may still need edits before running.
  if (!input) throw new Error(issues[0]?.message ?? tr('入力JSONを確認してください。', 'Check the input JSON.'))
  return { kind: 'input', raw: JSON.stringify(value, null, 2) }
}
export function createOptimizationRun(result: OptimizationResult, origin: OptimizationRun['origin']): OptimizationRun {
  return {
    id: origin === 'solver' ? result.input.run_id : crypto.randomUUID(),
    createdAt: Date.now(),
    label: inputTitle(result.input),
    origin,
    result,
  }
}
function runInfo(run: OptimizationRun, archived = false): SavedRunInfo {
  return {
    id: run.id,
    createdAt: run.createdAt,
    label: run.label,
    origin: run.origin,
    runId: run.result.input.run_id,
    problemKind: run.result.input.problem.kind,
    converged: run.result.converged,
    validation: run.result.validation?.status ?? 'not_evaluated',
    payloadKg:
      run.result.validation?.multi_stage?.net_payload_kg ?? run.result.validation?.flight?.mass_ledger.additional_payload_kg ?? null,
    archived,
  }
}
function openDatabase(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DATABASE, 1)
    let failed = false
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore('runs', { keyPath: 'id' })
      db.createObjectStore('results')
      db.createObjectStore('drafts')
    }
    request.onerror = () => {
      failed = true
      reject(request.error)
    }
    request.onblocked = () => {
      failed = true
      reject(new Error('Database update blocked by another tab'))
    }
    request.onsuccess = () => {
      const db = request.result
      if (failed) {
        db.close()
        return
      }
      db.onversionchange = () => {
        db.close()
        database = null
      }
      resolve(db)
    }
  }).catch((error) => {
    database = null
    throw error
  })
  return database
}
const requestValue = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
async function transaction<T>(stores: string[], mode: IDBTransactionMode, action: (tx: IDBTransaction) => Promise<T>): Promise<T> {
  const db = await openDatabase(),
    tx = db.transaction(stores, mode)
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted'))
    tx.onerror = () => reject(tx.error)
  })
  try {
    const value = await action(tx)
    await done
    return value
  } catch (error) {
    try {
      tx.abort()
    } catch {
      /* already closed */
    }
    await done.catch(() => {})
    throw error
  }
}
export async function saveOptimizationRun(run: OptimizationRun): Promise<SavedRunInfo> {
  return transaction(['runs', 'results'], 'readwrite', async (tx) => {
    const existing = (await requestValue(tx.objectStore('runs').get(run.id))) as SavedRunInfo | undefined
    const info = runInfo(run, existing?.archived ?? false)
    await Promise.all([requestValue(tx.objectStore('runs').put(info)), requestValue(tx.objectStore('results').put(run.result, run.id))])
    return info
  })
}
export async function listOptimizationRuns(): Promise<SavedRunInfo[]> {
  const values = (await transaction(['runs'], 'readonly', (tx) => requestValue(tx.objectStore('runs').getAll()))) as SavedRunInfo[]
  return values.sort((a, b) => b.createdAt - a.createdAt)
}
export async function loadOptimizationRun(id: string): Promise<OptimizationRun> {
  return transaction(['runs', 'results'], 'readonly', async (tx) => {
    const [info, result] = (await Promise.all([
      requestValue(tx.objectStore('runs').get(id)),
      requestValue(tx.objectStore('results').get(id)),
    ])) as [SavedRunInfo | undefined, unknown]
    if (!info || !result) throw new Error(tr('保存した実行が見つかりません。', 'Saved run not found.'))
    return { id: info.id, createdAt: info.createdAt, label: info.label, origin: info.origin, result: readOptimizationResult(result) }
  })
}
export async function archiveOptimizationRun(id: string, archived: boolean): Promise<void> {
  return transaction(['runs'], 'readwrite', async (tx) => {
    const info = (await requestValue(tx.objectStore('runs').get(id))) as SavedRunInfo | undefined
    if (!info) throw new Error('Saved run not found')
    await requestValue(tx.objectStore('runs').put({ ...info, archived }))
  })
}
export async function saveOptimizationDraft(draft: OptimizationDraft): Promise<void> {
  sessionDraft = structuredClone(draft)
  if (draft.raw.length > 2 * 1024 * 1024) throw new Error('Draft exceeds 2 MiB')
  await transaction(['drafts'], 'readwrite', async (tx) => {
    await requestValue(tx.objectStore('drafts').put(draft, 'current'))
  })
}
export async function loadOptimizationDraft(): Promise<OptimizationDraft | null> {
  if (sessionDraft) return structuredClone(sessionDraft)
  const draft: unknown = await transaction(['drafts'], 'readonly', (tx) => requestValue(tx.objectStore('drafts').get('current')))
  if (draft === undefined) return null
  if (
    !object(draft) ||
    typeof draft.raw !== 'string' ||
    !object(draft.fields) ||
    !Object.values(draft.fields).every(
      (v) => object(v) && typeof v.text === 'string' && typeof v.scale === 'number' && Number.isFinite(v.scale) && v.scale > 0,
    ) ||
    !['mission', 'vehicle', 'sequence', 'constraints', 'numerics', 'json'].includes(String(draft.section)) ||
    typeof draft.preset !== 'string' ||
    typeof draft.updatedAt !== 'number'
  )
    throw new Error('Invalid saved draft')
  return draft as unknown as OptimizationDraft
}
/** Close connections on application teardown / in isolated storage tests. */
export async function closeOptimizationStorage(): Promise<void> {
  sessionDraft = null
  const current = database
  database = null
  if (current) {
    const db = await current.catch(() => null)
    db?.close()
  }
}
