import type { CaseContext } from './case'
import type { FileActions } from '../components/FileMenu'

/** Small UI projection of the optimizer. Large results stay in its workspace/worker. */
export interface OptimizationControls {
  context: CaseContext
  running: boolean
  status: string
  iteration: number | null
  hasResult: boolean
  resultPassed: boolean
  issueCount: number
  presets: { id: string; label: string }[]
  files: FileActions
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void }
  run: () => void
  cancel: () => void
  fromSimulation: () => void
  preset: (id: string) => void
  showResults: () => void
  showHistory: () => void
  ready: boolean
}
