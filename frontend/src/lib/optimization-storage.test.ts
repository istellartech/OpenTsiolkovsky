import { caseFile, convertedCase, newCase } from './case'
import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import fixture from './__fixtures__/optimization-result.json'
import {
  archiveOptimizationRun,
  closeOptimizationStorage,
  createOptimizationRun,
  listOptimizationRuns,
  loadOptimizationDraft,
  loadOptimizationRun,
  readOptimizationFile,
  readOptimizationResult,
  saveOptimizationDraft,
  saveOptimizationRun,
} from './optimization-storage'

const result = () => readOptimizationResult(structuredClone(fixture))
afterEach(async () => {
  await closeOptimizationStorage()
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('ot-optimization')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})
describe('optimization result import and local storage', () => {
  it('round-trips a full native result through a closed/reopened database', async () => {
    const run = createOptimizationRun(result(), 'solver')
    await saveOptimizationRun(run)
    await closeOptimizationStorage()
    const list = await listOptimizationRuns()
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('result')
    expect(await loadOptimizationRun(run.id)).toEqual(run)
  })
  it('retains failed runs and archives/restores without destroying the result', async () => {
    const input = result()
    input.converged = false
    input.solver_status = 'Maximum_Iterations_Exceeded'
    const run = createOptimizationRun(input, 'solver')
    await saveOptimizationRun(run)
    await archiveOptimizationRun(run.id, true)
    expect((await listOptimizationRuns())[0].archived).toBe(true)
    expect((await loadOptimizationRun(run.id)).result.converged).toBe(false)
    await saveOptimizationRun(run)
    expect((await listOptimizationRuns())[0].archived).toBe(true)
    await archiveOptimizationRun(run.id, false)
    expect((await listOptimizationRuns())[0].archived).toBe(false)
  })
  it('preserves invalid draft text and incomplete numeric fields across reopening', async () => {
    const draft = {
      raw: '{',
      fields: { 'problem.orbit.altitude_m': { text: '1e', scale: 1000 } },
      section: 'mission' as const,
      preset: 'custom',
      updatedAt: Date.now(),
    }
    await saveOptimizationDraft(draft)
    await closeOptimizationStorage()
    expect(await loadOptimizationDraft()).toEqual(draft)
  })
  it('keeps imports with the same source run ID as separate immutable records', async () => {
    const a = createOptimizationRun(result(), 'import'),
      b = createOptimizationRun(result(), 'import')
    expect(a.id).not.toBe(b.id)
    expect(a.result.input.run_id).toBe(b.result.input.run_id)
    await Promise.all([saveOptimizationRun(a), saveOptimizationRun(b)])
    expect(await listOptimizationRuns()).toHaveLength(2)
  })
  it('distinguishes inputs from results without discarding full vectors or diagnostics', () => {
    const full = readOptimizationFile(JSON.stringify(fixture))
    expect(full.kind).toBe('result')
    if (full.kind === 'result') expect(full.result).toEqual(fixture)
    expect(readOptimizationFile(JSON.stringify(fixture.input)).kind).toBe('input')
  })
  it('rejects malformed vectors, forged convergence and non-finite numbers', () => {
    const a = structuredClone(fixture)
    a.solution.x.pop()
    expect(() => readOptimizationResult(a)).toThrow()
    const b = structuredClone(fixture)
    b.solver_status = 'Maximum_Iterations_Exceeded'
    expect(() => readOptimizationResult(b)).toThrow()
    const c = structuredClone(fixture)
    c.solution.objective = Infinity
    expect(() => readOptimizationResult(c)).toThrow()
    expect(() => readOptimizationResult({ schema_version: 1 })).toThrow()
  })
  it('returns a clear error for missing runs without damaging other records', async () => {
    const run = createOptimizationRun(result(), 'solver')
    await saveOptimizationRun(run)
    await expect(loadOptimizationRun('missing')).rejects.toThrow()
    expect(await loadOptimizationRun(run.id)).toEqual(run)
  })
})

it('retains immutable case metadata through result storage and case-file import', async () => {
  const context = convertedCase(newCase('Source'), 'optimize', 'Optimization copy', ['constant thrust'])
  const run = createOptimizationRun(result(), 'solver', context)
  context.name = 'Edited after running'
  context.history[0].notes.push('not in the run')
  expect(run.context!.name).toBe('Optimization copy')
  expect(run.context!.history[0].notes).toEqual(['constant thrust'])
  await saveOptimizationRun(run)
  await closeOptimizationStorage()
  const restored = await loadOptimizationRun(run.id)
  expect(restored.context).toEqual(run.context)
  const imported = readOptimizationFile(caseFile('optimize', restored.context!, restored.result))
  expect(imported.context).toEqual(run.context)
  expect(imported.kind).toBe('result')
  expect(() => readOptimizationFile(caseFile('simulate', restored.context!, restored.result))).toThrow()
})
