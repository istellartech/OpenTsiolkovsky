import type { OptimizationInput } from './optimization-input'

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

export interface FlightSample {
  time_s: number
  altitude_m: number
  downrange_m: number
  velocity_up_m_s: number
  state_eci: number[]
  pitch_deg: number
  pitch_rate_deg_s: number
  dynamic_pressure_pa: number
  angle_of_attack_deg: number
  specific_force_m_s2: number
  powered: boolean
}

export interface PhysicalCheck {
  id: string
  unit: string
  value: number
  lower: number | null
  upper: number | null
  tolerance: number
  violation: number
  passed: boolean
}

export interface FlightValidation {
  final_time_s: number
  max_position_error_m: number
  max_velocity_error_m_s: number
  position_tolerance_m: number
  velocity_tolerance_m_s: number
  tighter_rk_position_difference_m: number
  tighter_rk_velocity_difference_m_s: number
  mass_ledger: {
    additional_payload_kg: number
    propellant_burned_kg: number
    propellant_remaining_kg: number
    initial_total_kg: number
    final_total_kg: number
  }
  checks: PhysicalCheck[]
  samples: FlightSample[]
}

export interface MultiStageValidation {
  net_payload_kg: number
  final_time_s: number
  initial_total_mass_kg: number
  payload_adapter_kg: number
  fairing_kg: number
  deployed_state_eci: number[]
  max_position_error_m: number
  max_velocity_error_m_s: number
  max_mass_error_kg: number
  position_tolerance_m: number
  velocity_tolerance_m_s: number
  tighter_rk_position_difference_m: number
  orbit: { perigee_altitude_m: number; apogee_altitude_m: number | null; inclination_deg: number; eccentricity: number }
  stage_ledgers: {
    stage: number
    dry_kg: number
    propellant_loaded_kg: number
    propellant_consumed_kg: number
    residual_kg: number
    required_reserve_kg: number
    total_burn_s: number
    ignition_count: number
  }[]
  events: {
    kind: 'separate_stage' | 'jettison_fairing' | 'deploy_payload'
    phase: number
    stage: number
    time_s: number
    before_eci: number[]
    after_eci: number[]
    dry_removed_kg: number
    propellant_removed_kg: number
    fairing_removed_kg: number
    adapter_removed_kg: number
    removed_mass_kg: number
    position_jump_m: number
    velocity_jump_m_s: number
  }[]
  samples: {
    time_s: number
    altitude_m: number
    state_eci: number[]
    phase: number
    stage: number
    powered: boolean
    azimuth_deg: number
    elevation_deg: number
    dynamic_pressure_pa: number
    angle_of_attack_deg: number
    specific_force_m_s2: number
    inertial_direction_rate_deg_s: number
  }[]
  checks: PhysicalCheck[]
  unevaluated_constraints: string[]
}

export interface OptimizationResult {
  schema_version: number
  input: OptimizationInput
  effective_options?: string
  flight_scaling?: {
    strategy: string
    mass_kg: number
    position_m: number
    velocity_m_s: number
    time_s: number
    payload_objective_kg: number
  } | null
  nlp_layout?: { variables: string[]; constraints: string[]; jacobian: [number, number][] }
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
    flight?: FlightValidation | null
    multi_stage?: MultiStageValidation | null
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

/** Explicit new run: preserve all physics, limits and tolerances when refining. */
export function refineFlightMesh(raw: string): string {
  const input = optimizationSnapshot(raw, 'refined-mesh')
  const problem = input.problem as Record<string, unknown> | undefined
  if (problem?.kind === 'multi_stage') {
    const { degree, phases } = problem
    if (typeof degree !== 'number' || !Number.isInteger(degree) || degree < 3 || degree > 8 || !Array.isArray(phases)) {
      throw new Error('Invalid multistage mesh')
    }
    const nextPhases = phases.map((p: unknown) => {
      if (
        !p ||
        typeof p !== 'object' ||
        !('intervals' in p) ||
        typeof p.intervals !== 'number' ||
        !Number.isInteger(p.intervals) ||
        p.intervals < 1 ||
        p.intervals > 16
      )
        throw new Error('Invalid phase mesh')
      return { ...p, intervals: Math.min(16, p.intervals * 2) }
    })
    const nextDegree = Math.min(8, Math.max(6, degree + 1))
    if (nextPhases.reduce((sum, p) => sum + p.intervals, 0) > 64) throw new Error('Refined mesh exceeds 64 intervals')
    if (nextDegree === degree && nextPhases.every((p, i) => p.intervals === phases[i].intervals)) {
      throw new Error('The mesh is already at the supported limit')
    }
    return JSON.stringify({ ...input, problem: { ...problem, phases: nextPhases, degree: nextDegree } }, null, 2)
  }
  if (problem?.kind !== 'single_stage') throw new Error('Mesh refinement requires a single-stage problem')
  const { burn_intervals: burn, coast_intervals: coast, degree } = problem
  if (![burn, coast, degree].every((v) => typeof v === 'number' && Number.isInteger(v) && v > 0)) {
    throw new Error('Invalid single-stage mesh')
  }
  if ((burn as number) > 16 || (coast as number) > 12 || (degree as number) < 3 || (degree as number) > 8)
    throw new Error('Mesh is outside the supported range')
  const next = {
    burn_intervals: Math.min(16, (burn as number) * 2),
    coast_intervals: Math.min(12, (coast as number) * 2),
    degree: Math.min(8, Math.max(6, (degree as number) + 1)),
  }
  if (next.burn_intervals === burn && next.coast_intervals === coast && next.degree === degree) {
    throw new Error('The mesh is already at the supported limit')
  }
  return JSON.stringify({ ...input, problem: { ...problem, ...next } }, null, 2)
}
