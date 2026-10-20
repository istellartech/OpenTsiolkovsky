import { createContext } from 'react'
import type { InputIssue, NumericDraft, OptimizationInput } from '../../lib/optimization-input'

export interface EditorContextValue {
  edit: (path: string, value: unknown) => void
  /** Replace the whole input (for edits that keep coupled fields in step). */
  replace: (update: (input: OptimizationInput) => OptimizationInput) => void
  fields: Record<string, NumericDraft>
  setField: (path: string, value: NumericDraft | null) => void
  issues: InputIssue[]
  disabled: boolean
}
export const OptimizationEditorContext = createContext<EditorContextValue>({
  edit: () => {},
  replace: () => {},
  fields: {},
  setField: () => {},
  issues: [],
  disabled: false,
})
