import { tr } from '../../lib/i18n'
import type { EditorSection } from '../../lib/optimization-input'

export function editorSections(): { id: EditorSection; label: string; description: string }[] {
  return [
    { id: 'mission', label: tr('ミッション', 'Mission'), description: tr('目標・発射条件', 'Target and launch') },
    { id: 'vehicle', label: tr('機体・質量', 'Vehicle and mass'), description: tr('内訳・エンジン', 'Inventory and engines') },
    { id: 'sequence', label: tr('シーケンス', 'Sequence'), description: tr('フェーズ・時間', 'Phases and durations') },
    { id: 'constraints', label: tr('制約', 'Constraints'), description: tr('荷重・制御・予備量', 'Loads and guidance') },
    { id: 'numerics', label: tr('数値設定', 'Numerics'), description: tr('メッシュ・検証精度', 'Mesh and tolerances') },
    { id: 'json', label: tr('JSON・詳細', 'JSON and details'), description: tr('全設定を直接編集', 'Edit the full input') },
  ]
}
