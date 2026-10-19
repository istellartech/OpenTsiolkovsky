export interface IterationRecord {
  iteration: number
  objective: number
  primal_infeasibility: number
  dual_infeasibility: number
  restoration: boolean
}

export interface TrajectorySample {
  time_s: number
  position_m: number
  velocity_m_s: number
  acceleration_m_s2: number
}

export interface OptimizationResult {
  schema_version: number
  input: { run_id: string; problem: { kind: string } }
  solver_status: string
  converged: boolean
  solver_version: string
  code_revision: string
  model_fidelity: string
  variable_names: string[]
  constraint_names: string[]
  iterations: IterationRecord[]
  solution: { x: number[]; constraints: number[]; z_lower: number[]; z_upper: number[]; lambda: number[]; objective: number } | null
  validation: {
    status: string
    method: string
    max_bound_violation: number
    reference_objective_error: number
    error: string | null
    trajectory: {
      duration_s: number
      reference_duration_s: number
      max_position_error_m: number
      max_velocity_error_m_s: number
      position_tolerance_m: number
      velocity_tolerance_m_s: number
      integrated_objective_si: number
      samples: TrajectorySample[]
    } | null
  } | null
}

export interface OptimizationWorkerRequest {
  runId: string
  input: Record<string, unknown>
  wasmUrl: string
}

export type OptimizationWorkerMessage = { runId: string } & (
  | { type: 'progress'; record: IterationRecord }
  | { type: 'stage'; stage: 'solving' }
  | { type: 'result'; result: OptimizationResult | { error: string }; memoryBytes: number }
  | { type: 'error'; error: string }
)

/** Keep an immutable run snapshot; Rust is the authority for the input schema. */
export function optimizationSnapshot(raw: string, runId: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Input must be a JSON object')
  // JSON.parse accepts 1e309 as Infinity; do not silently serialize it as null.
  JSON.stringify(parsed, (_key, value: unknown) => {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Input contains a non-finite number')
    return value
  })
  return { ...parsed, run_id: runId }
}
