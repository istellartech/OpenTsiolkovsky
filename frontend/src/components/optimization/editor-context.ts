import { createContext } from 'react'
import type { InputIssue, NumericDraft } from '../../lib/optimization-input'

export interface EditorContextValue {
  edit: (path: string, value: unknown) => void
  fields: Record<string, NumericDraft>
  setField: (path: string, value: NumericDraft | null) => void
  issues: InputIssue[]
  disabled: boolean
}
export const OptimizationEditorContext = createContext<EditorContextValue>({
  edit: () => {},
  fields: {},
  setField: () => {},
  issues: [],
  disabled: false,
})
