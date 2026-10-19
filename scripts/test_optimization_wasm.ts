// Run with Bun after building native and WASI artifacts. Exercises the exact
// browser shim/ABI; no Node WASI implementation masks missing browser imports.
import { instantiateOptimizer } from '../frontend/src/lib/optimization-wasm'
import { strict as assert } from 'node:assert'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'

const root = resolve(import.meta.dir, '..')
const native = resolve(root, process.argv[2] ?? 'target/release/openTsiolkovsky-optimize')
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

for (const name of ['hs071', 'double_integrator', 'momo_single_stage', 'two_stage_500km_43deg']) {
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
  assert(result.numerical_metrics.factors > 0)
  assert(result.numerical_metrics.factorization_seconds > 0)
  assert(result.physical_solution.x.every(Number.isFinite))
  near(result.physical_solution.objective, reference.physical_solution.objective)
  assert.equal(result.effective_options, reference.effective_options)
  assert.equal(result.schema_version, reference.schema_version)
  assert.deepEqual(result.variable_names, reference.variable_names)
  assert.deepEqual(result.constraint_names, reference.constraint_names)
  const multi = name === 'two_stage_500km_43deg'
  const maxima: Record<string, number> = {}
  if (multi) {
    const directory = resolve(root, 'out/optimization/wasm-parity')
    await mkdir(directory, { recursive: true })
    await Bun.write(resolve(directory, 'native-multi-stage.json'), JSON.stringify(reference))
    await Bun.write(resolve(directory, 'wasi-multi-stage.json'), JSON.stringify(result))
  }
  for (const key of ['x', 'z_lower', 'z_upper', 'constraints', 'lambda']) {
    assert.equal(result.solution[key].length, reference.solution[key].length)
    result.solution[key].forEach((v: number, i: number) => {
      const expected = reference.solution[key][i]
      assert(Number.isFinite(v) && Number.isFinite(expected))
      if (multi && key === 'x') {
        // The orbital phase/RAAN are free. Equal objectives and KKT accuracy
        // need not select bitwise-identical high-order guidance coefficients.
        // Compare every primal in physical units, below the IVP tolerances.
        const label: string = reference.variable_names[i]
        let group = 'angle_deg', scale = 180 / Math.PI, tolerance = .01
        if (label.startsWith('state[')) {
          const component = Number(label.split('.')[1].split('_')[0])
          group = component === 0 ? 'mass_kg' : component <= 3 ? 'position_m' : 'velocity_m_s'
          scale = component === 0 ? reference.flight_scaling.mass_kg : component <= 3 ? 1e6 : 8000
          tolerance = component === 0 ? .001 : component <= 3 ? 2 : .005
        } else if (label.startsWith('phase[')) { group = 'duration_s'; scale = 100; tolerance = .001 }
        else if (label === 'net_payload_scaled') { group = 'payload_kg'; scale = 1000; tolerance = .001 }
        const difference = Math.abs(v - expected) * scale
        maxima[group] = Math.max(maxima[group] ?? 0, difference)
        assert(difference <= tolerance, `${label}: ${difference} ${group} exceeds ${tolerance}`)
      } else if (multi && key === 'constraints') {
        const equality = reference.nlp_layout.g_lower[i] === reference.nlp_layout.g_upper[i]
        const active = Math.max(Math.abs(reference.solution.lambda[i]), Math.abs(result.solution.lambda[i])) > 1e-3
        const group = equality ? 'equality' : active ? 'active_inequality' : 'inactive_inequality'
        maxima[group] = Math.max(maxima[group] ?? 0, Math.abs(v - expected) / Math.max(1, Math.abs(expected)))
        // Inactive Bernstein envelopes can differ without changing the feasible
        // flight. Their bounds are still checked, as are every dense SI check.
        assert(v >= result.nlp_layout.g_lower[i] - 1e-6 && v <= result.nlp_layout.g_upper[i] + 1e-6)
        if (equality || active) near(v, expected)
      } else {
        const tolerance = multi && key === 'lambda' ? 3e-4 : 2e-5
        near(v, expected, tolerance)
        maxima[key] = Math.max(maxima[key] ?? 0, Math.abs(v - expected) / Math.max(1, Math.abs(expected)))
      }
    })
  }
  if (multi) {
    const last = result.iterations[result.iterations.length - 1]
    assert(last.dual_infeasibility <= input.solver.tolerance)
    await Bun.write(resolve(root, 'out/optimization/wasm-parity/differences.json'), JSON.stringify(maxima, null, 2))
    console.log('Multi-stage maximum native/WASI differences:', maxima)
  }
  near(result.solution.objective, reference.solution.objective)
  if (name === 'momo_single_stage') {
    const f = result.validation.flight
    const ref = reference.validation.flight
    near(f.mass_ledger.additional_payload_kg, ref.mass_ledger.additional_payload_kg, 1e-7)
    assert.deepEqual(f.checks.map((c: {id: string, passed: boolean}) => [c.id, c.passed]), ref.checks.map((c: {id: string, passed: boolean}) => [c.id, c.passed]))
    console.log(`Single stage: payload=${f.mass_ledger.additional_payload_kg} kg, position error=${f.max_position_error_m} m, velocity error=${f.max_velocity_error_m_s} m/s`)
  }
  if (name === 'two_stage_500km_43deg') {
    const f = result.validation.multi_stage
    const ref = reference.validation.multi_stage
    near(f.net_payload_kg, ref.net_payload_kg, 1e-7)
    near(f.orbit.perigee_altitude_m, ref.orbit.perigee_altitude_m, 1e-7)
    near(f.orbit.apogee_altitude_m, ref.orbit.apogee_altitude_m, 1e-7)
    assert.deepEqual(f.checks.map((c: {id: string, passed: boolean}) => [c.id, c.passed]), ref.checks.map((c: {id: string, passed: boolean}) => [c.id, c.passed]))
    assert.deepEqual(f.stage_ledgers.map((s: {ignition_count: number}) => s.ignition_count), [1, 2])
    for (const [i, e] of f.events.entries()) {
      near(e.removed_mass_kg, ref.events[i].removed_mass_kg, 1e-9)
      assert.deepEqual(e.before_eci.slice(1), e.after_eci.slice(1))
    }
    assert.deepEqual(f.unevaluated_constraints, ref.unevaluated_constraints)
    console.log(`Multi stage: payload=${f.net_payload_kg} kg, orbit=${f.orbit.perigee_altitude_m} / ${f.orbit.apogee_altitude_m} m, inclination=${f.orbit.inclination_deg} deg`)
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
// Exercise each application scaling layer, including nonidentity pounce
// gradient scaling, exact second derivatives and forced KKT strategies.
const pr3Directory = resolve(root, 'out/optimization/wasm-parity/pr3')
await mkdir(pr3Directory, { recursive: true })
const double = await Bun.file(resolve(root, 'examples/optimization/double_integrator_exact.json')).json()
const secondOrder = optimizer.solve(double) as { converged: boolean, hessian_calls: number }
assert.equal(secondOrder.converged, true)
assert(secondOrder.hessian_calls > 0)
for (const strategy of ['s0', 's1_bounds', 's1_guess', 's2', 's3']) {
  for (const kkt of ['none', 'ruiz', 'slack_based']) {
    const input = { ...double, solver: { ...double.solver, derivative_test: false, scaling: { strategy, gradient_max: 1 }, kkt_scaling: kkt } }
    const path = resolve(pr3Directory, `${strategy}_${kkt}.json`)
    await Bun.write(path, JSON.stringify(input))
    const nativeRun = Bun.spawnSync([native, '--config', path], { stdout: 'pipe', stderr: 'pipe' })
    assert.equal(nativeRun.exitCode, 0, new TextDecoder().decode(nativeRun.stderr))
    const reference = JSON.parse(new TextDecoder().decode(nativeRun.stdout))
    const result = optimizer.solve(input) as typeof reference
    assert.equal(result.converged, true)
    assert.equal(result.validation.status, 'passed')
    assert(result.hessian_calls > 0)
    assert.equal(result.numerical_metrics.kkt_scaling_forced_on_factors, kkt !== 'none')
    assert.equal(result.effective_options, reference.effective_options)
    for (const key of ['x', 'constraints', 'lambda', 'z_lower', 'z_upper']) {
      result.physical_solution[key].forEach((v: number, i: number) => near(v, reference.physical_solution[key][i], 2e-6))
    }
    near(result.physical_solution.objective, 48000, 2e-7)
    const row = result.constraint_names.indexOf('FINAL.position')
    near(result.physical_solution.lambda[row], -24, 2e-5)
    if (strategy === 's3') assert(result.scaling_report.pounce_row_gain.some((v: number) => v < 1))
    console.log(`PR3 ${strategy}/${kkt}: exact Hessian, full SI primal/duals passed`)
  }
}
const rocket = await Bun.file(resolve(root, 'examples/optimization/momo_single_stage.json')).json()
const unsupported = optimizer.solve({ ...rocket, solver: { ...rocket.solver, hessian: 'exact' } }) as { error: string }
assert.match(unsupported.error, /exact Hessian/)
const coarse = await Bun.file(resolve(root, 'examples/optimization/momo_single_stage_coarse.json')).json()
const coarseResult = optimizer.solve(coarse) as { converged: boolean, validation: { status: string } }
assert.equal(coarseResult.converged, true)
assert.equal(coarseResult.validation.status, 'failed')
assert(progress > 0, 'callback progress must cross the custom WASM import')
const zero = await Bun.file(resolve(root, 'examples/optimization/zero_500km_43deg.json')).json()
assert.match((optimizer.solve(zero) as { error: string }).error, /LC-1/)
console.log(`Parity, full primal/dual vectors, cancellation, restart, malformed input: passed; WASM ${bytes.byteLength} bytes; memory ${optimizer.memoryBytes()} bytes`)
