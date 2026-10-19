import { describe, expect, it } from 'vite-plus/test'
import { optimizationSnapshot } from './optimization'

describe('optimization input snapshot', () => {
  it('preserves mission and solver values, with a new immutable run identity', () => {
    const raw = '{"schema_version":1,"run_id":"old","problem":{"kind":"hs071"},"solver":{"tolerance":1e-8}}'
    const snapshot = optimizationSnapshot(raw, 'new')
    expect(snapshot).toEqual({ schema_version: 1, run_id: 'new', problem: { kind: 'hs071' }, solver: { tolerance: 1e-8 } })
    expect(JSON.parse(raw).run_id).toBe('old')
  })
  it('rejects malformed, non-object and overflowed JSON without coercing numbers to null', () => {
    for (const raw of ['null', '[]', '1', '{', '{"distance_m":1e309}']) expect(() => optimizationSnapshot(raw, 'id')).toThrow()
  })
})
