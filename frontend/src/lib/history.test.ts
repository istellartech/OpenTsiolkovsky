import { describe, expect, it } from 'vite-plus/test'
import { COALESCE_MS, HISTORY_LIMIT, commit, initHistory, redo, undo } from './history'

describe('history', () => {
  it('undoes and redoes single steps', () => {
    let h = initHistory(0)
    h = commit(h, 1)
    h = commit(h, 2)
    h = undo(h)
    expect(h.present).toBe(1)
    h = undo(h)
    expect(h.present).toBe(0)
    expect(undo(h)).toBe(h)
    h = redo(redo(h))
    expect(h.present).toBe(2)
    expect(redo(h)).toBe(h)
  })

  it('merges quick edits with the same key into one step', () => {
    let h = initHistory('a')
    h = commit(h, 'ab', { key: 'edit', now: 0 })
    h = commit(h, 'abc', { key: 'edit', now: COALESCE_MS - 1 })
    expect(h.past).toEqual(['a'])
    h = commit(h, 'abcd', { key: 'edit', now: 2 * COALESCE_MS + 10 })
    expect(h.past).toEqual(['a', 'abc'])
  })

  it('does not merge across keyless commits or after undo', () => {
    let h = initHistory(0)
    h = commit(h, 1, { key: 'edit', now: 0 })
    h = commit(h, 2) // e.g. a preset
    h = commit(h, 3, { key: 'edit', now: 1 })
    expect(h.past).toEqual([0, 1, 2])
    h = undo(h)
    h = commit(h, 4, { key: 'edit', now: 2 })
    expect(h.past).toEqual([0, 1, 2])
    expect(h.future).toEqual([])
  })

  it('ignores a commit of the same value and caps its length', () => {
    let h = initHistory(0)
    expect(commit(h, 0)).toBe(h)
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i)
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.past[0]).toBe(20)
  })
})
