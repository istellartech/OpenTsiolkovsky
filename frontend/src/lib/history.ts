// Undo/redo stack. Quick successive edits (typing into a field) are merged
// into one step so that undo goes back to the value before the burst.

export interface History<T> {
  past: T[]
  present: T
  future: T[]
  /** Last coalescable edit, to merge the next one into it */
  last: { key: string; at: number } | null
}

export const HISTORY_LIMIT = 100
export const COALESCE_MS = 800

export const initHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], last: null })

/**
 * Make `next` the present state. With a `key`, an edit within COALESCE_MS of
 * the previous edit with the same key replaces it instead of adding a step.
 */
export function commit<T>(h: History<T>, next: T, opts: { key?: string; now?: number } = {}): History<T> {
  if (Object.is(next, h.present)) return h
  const now = opts.now ?? Date.now()
  const merge = opts.key !== undefined && h.last?.key === opts.key && now - h.last.at < COALESCE_MS
  return {
    past: merge ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    last: opts.key !== undefined ? { key: opts.key, at: now } : null,
  }
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], last: null }
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), last: null }
}
