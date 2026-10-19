// Matched WASI measurements through the browser ABI. Each case gets a fresh
// instance. Keep failures and platform differences; do not retry/select winners.
// Usage: bun scripts/study_optimization_numerics_wasm.ts MANIFEST [NAME_REGEX]
import { instantiateOptimizer } from '../frontend/src/lib/optimization-wasm'
import { createHash } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { platform, arch } from 'node:os'

type Solution = { x: number[], constraints: number[], objective: number, lambda: number[], z_lower: number[], z_upper: number[] }
type Result = {
  error?: string
  code_revision: string
  solver_status: string
  converged: boolean
  iterations: unknown[]
  physical_solution: Solution | null
  numerical_metrics: unknown
  validation: { status: string, flight?: Flight, multi_stage?: Flight }
}
type Flight = { net_payload_kg?: number, mass_ledger?: { additional_payload_kg: number }, max_position_error_m: number, max_velocity_error_m_s: number, orbit?: unknown, checks: { id: string, passed: boolean }[] }
type Case = { name: string, input: unknown, problem_fingerprint: string }

const root = resolve(import.meta.dir, '..')
const manifest = resolve(process.argv[2] ?? 'out/optimization/pr3-numerics/manifest.json')
const directory = resolve(dirname(manifest), 'wasi')
const selected = (await Bun.file(manifest).json() as Case[]).filter(c => new RegExp(process.argv[3] ?? '.*').test(c.name))
if (!selected.length) throw new Error('no matching cases')
await mkdir(directory, { recursive: true })
const bytes = await Bun.file(resolve(root, 'frontend/public/optimization/optimizer.wasm')).arrayBuffer()
// Freeze the bytes/hash even if another build completes while the study runs.
await Bun.write(resolve(directory, 'optimizer.wasm'), bytes)
await Bun.write(resolve(directory, 'environment.json'), JSON.stringify({ runtime: Bun.version, platform: platform(), arch: arch(), wasm_bytes: bytes.byteLength, wasm_sha256: createHash('sha256').update(new Uint8Array(bytes)).digest('hex'), cases: selected.map(c => c.name) }, null, 2))
const rows: Record<string, unknown>[] = []
for (const c of selected) {
  const start = performance.now()
  const row: Record<string, unknown> = { name: c.name, problem_fingerprint: c.problem_fingerprint }
  try {
    let callbacks = 0
    const optimizer = await instantiateOptimizer(bytes, () => { callbacks++ })
    const result = optimizer.solve(c.input) as Result
    await Bun.write(resolve(directory, `${c.name}-result.json`), JSON.stringify(result))
    if (result.error) throw new Error(result.error)
    const v = result.validation
    const flight = v.flight ?? v.multi_stage
    Object.assign(row, { code_revision: result.code_revision, solver_status: result.solver_status, converged: result.converged, validation: v.status, iterations: result.iterations.length, numerical_metrics: result.numerical_metrics, memory_bytes: optimizer.memoryBytes(), callbacks, physical_objective: result.physical_solution?.objective, net_payload_kg: flight?.net_payload_kg, additional_payload_kg: flight?.mass_ledger?.additional_payload_kg, max_position_error_m: flight?.max_position_error_m, max_velocity_error_m_s: flight?.max_velocity_error_m_s, orbit: flight?.orbit, failed_checks: flight?.checks.filter(x => !x.passed).map(x => x.id) })
    const referenceFile = Bun.file(resolve(dirname(manifest), `${c.name}-result.json`))
    if (await referenceFile.exists()) {
      const reference = await referenceFile.json() as Result
      row.native_status_matches = result.solver_status === reference.solver_status
      row.native_validation_matches = v.status === reference.validation.status
      if (reference.physical_solution && result.physical_solution) {
        const objective = reference.physical_solution.objective
        row.native_objective_absolute_difference = Math.abs(objective - result.physical_solution.objective)
        row.native_objective_relative_difference = Math.abs(objective - result.physical_solution.objective) / Math.max(1, Math.abs(objective))
        const quantities: Record<string, number> = {}
        // State units differ. Report unit-specific maxima, rather than comparing
        // metres to kilograms or silently relaxing a parity tolerance.
        const native = await referenceFile.json()
        native.scaling_report.physical_coordinates.variables.forEach((coordinate: { unit: string }, i: number) => {
          const unit = coordinate.unit
          quantities[unit] = Math.max(quantities[unit] ?? 0, Math.abs(reference.physical_solution!.x[i] - result.physical_solution!.x[i]))
        })
        row.native_primal_absolute_differences_by_unit = quantities
      }
    }
  } catch (error) { row.error = String(error) }
  row.process_seconds = (performance.now() - start) / 1000
  rows.push(row)
  await Bun.write(resolve(directory, 'summary.json'), JSON.stringify(rows, null, 2))
  console.log(`${c.name}: ${row.solver_status ?? row.error}, validation=${row.validation}, ${Number(row.process_seconds).toFixed(3)}s`)
}
console.log(`${rows.length} cases recorded: ${directory}/summary.json`)
