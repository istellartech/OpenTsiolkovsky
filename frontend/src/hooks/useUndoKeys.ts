import { useEffect } from 'react'
import { useLatest } from './useLatest'

/**
 * ⌘Z / Ctrl+Z = undo, ⇧⌘Z / Ctrl+Shift+Z / Ctrl+Y = redo. Text areas keep
 * their native undo (the table editor edits free text there). Off while
 * `enabled` is false (another workspace is shown).
 */
export function useUndoKeys(undo: () => void, redo: () => void, enabled = true) {
  const latest = useLatest({ undo, redo })
  useEffect(() => {
    if (!enabled) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      if (e.target instanceof HTMLElement && e.target.closest('textarea, [contenteditable="true"]')) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        latest.current.undo()
      } else if ((key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey)) {
        e.preventDefault()
        latest.current.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [latest, enabled])
}
