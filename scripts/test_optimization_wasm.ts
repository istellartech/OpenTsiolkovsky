// Run with Bun after building native and WASI artifacts. Exercises the exact
// browser shim/ABI; no Node WASI implementation masks missing browser imports.
import { instantiateOptimizer } from '../frontend/src/lib/optimization-wasm'
import { strict as assert } from 'node:assert'
import { resolve } from 'node:path'

const root = resolve(import.meta.dir, '..')
const native = resolve(root, process.argv[2] ?? 'target/debug/openTsiolkovsky-optimize')
const wasmPath = resolve(root, 'frontend/public/optimization/optimizer.wasm')
const bytes = await Bun.file(wasmPath).arrayBuffer()
const module = await WebAssembly.compile(bytes)
console.log('WASI imports:', WebAssembly.Module.imports(module).map((i) => `${i.module}.${i.name}`).join(', '))
let progress = 0
const optimizer = await instantiateOptimizer(bytes, () => { progress++ })

function near(actual: number, expected: number, tolerance = 2e-5) {
  assert(Number.isFinite(actual) && Number.isFinite(expected))
  assert(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`)
}

for (const name of ['hs071', 'double_integrator', 'momo_single_stage']) {
  const path = resolve(root, `examples/optimization/${name}.json`)
  const input = await Bun.file(path).json()
  const run = Bun.spawnSync([native, '--config', path], { stdout: 'pipe', stderr: 'pipe' })
  assert.equal(run.exitCode, 0, new TextDecoder().decode(run.stderr))
  const reference = JSON.parse(new TextDecoder().decode(run.stdout))
  const result = optimizer.solve(input) as typeof reference
  assert.equal(result.solver_status, reference.solver_status)
  assert.equal(result.converged, true)
  assert.equal(result.validation.status, 'passed')
  assert.equal(result.hessian_calls, 0)
  assert.equal(result.effective_options, reference.effective_options)
  assert.equal(result.schema_version, reference.schema_version)
  assert.deepEqual(result.variable_names, reference.variable_names)
  assert.deepEqual(result.constraint_names, reference.constraint_names)
  for (const key of ['x', 'z_lower', 'z_upper', 'constraints', 'lambda']) {
    assert.equal(result.solution[key].length, reference.solution[key].length)
    result.solution[key].forEach((v: number, i: number) => near(v, reference.solution[key][i]))
  }
  near(result.solution.objective, reference.solution.objective)
  if (name === 'momo_single_stage') {
    const f = result.validation.flight
    const ref = reference.validation.flight
    near(f.mass_ledger.additional_payload_kg, ref.mass_ledger.additional_payload_kg, 1e-7)
    assert.deepEqual(f.checks.map((c: {id: string, passed: boolean}) => [c.id, c.passed]), ref.checks.map((c: {id: string, passed: boolean}) => [c.id, c.passed]))
    console.log(`Single stage: payload=${f.mass_ledger.additional_payload_kg} kg, position error=${f.max_position_error_m} m, velocity error=${f.max_velocity_error_m_s} m/s`)
  }
  console.log(`${name}: ${result.solver_status}, validation=${result.validation.status}, objective=${result.solution.objective}`)
  const cancelled = optimizer.solve({ ...input, solver: { ...input.solver, stop_after_iteration: 0 } }) as typeof reference
  assert.equal(cancelled.solver_status, 'User_Requested_Stop')
  assert.equal(cancelled.converged, false)
  const limited = optimizer.solve({ ...input, solver: { ...input.solver, max_iterations: 1 } }) as typeof reference
  assert.equal(limited.solver_status, 'Maximum_Iterations_Exceeded')
  assert.equal(limited.converged, false)
  const error = optimizer.solve({ ...input, schema_version: 999 }) as { error: string }
  assert.match(error.error, /schema_version/)
  const restarted = optimizer.solve(input) as typeof reference
  assert.equal(restarted.converged, true)
}
const coarse = await Bun.file(resolve(root, 'examples/optimization/momo_single_stage_coarse.json')).json()
const coarseResult = optimizer.solve(coarse) as { converged: boolean, validation: { status: string } }
assert.equal(coarseResult.converged, true)
assert.equal(coarseResult.validation.status, 'failed')
assert(progress > 0, 'callback progress must cross the custom WASM import')
const zero = await Bun.file(resolve(root, 'examples/optimization/zero_500km_43deg.json')).json()
assert.match((optimizer.solve(zero) as { error: string }).error, /LC-1/)
console.log(`Parity, full primal/dual vectors, cancellation, restart, malformed input: passed; WASM ${bytes.byteLength} bytes; memory ${optimizer.memoryBytes()} bytes`)
