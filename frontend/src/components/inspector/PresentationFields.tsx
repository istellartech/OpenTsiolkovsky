import type { Config, DisplayName } from '../../lib/config'
import { getLang, tr } from '../../lib/i18n'
import { NumberField, Toggle, useFieldState } from '../primitives'
import { Group, type Patch } from './shared'

/** Edits the current UI language while retaining a preset's other translation. */
export function DisplayNameField({
  label,
  value,
  onChange,
  placeholder,
  path,
}: {
  label: string
  value?: DisplayName | null
  onChange: (value: DisplayName | undefined) => void
  placeholder?: string
  path?: string
}) {
  const { error, ref } = useFieldState(path)
  const text = typeof value === 'string' ? value : value?.[getLang()]
  return (
    <label className="my-2 block text-[12px] text-ink-2">
      {label}
      <input
        ref={ref}
        value={typeof text === 'string' ? text : ''}
        placeholder={placeholder}
        onChange={(e) =>
          onChange(typeof value === 'object' && value !== null ? { ...value, [getLang()]: e.target.value } : e.target.value || undefined)
        }
        className="mt-1 h-8 w-full rounded-[6px] border border-line bg-surface-2 px-2 text-ink outline-none focus:border-signal"
      />
      {error && <span className="mt-1 block text-danger">{error}</span>}
    </label>
  )
}

export function StructureFields({ config, patch }: { config: Config; patch: Patch }) {
  const presentation = config.presentation ?? {}
  const set = (values: Partial<NonNullable<Config['presentation']>>) =>
    patch((c) => ({ ...c, presentation: { ...c.presentation, ...values } }))
  return (
    <Group
      title={tr('実機の段構成', 'Vehicle structure')}
      note={tr(
        '段数は機種の公称に合わせて指定します。計算区間の追加・削除では変わりません。ブースタを段数に含む機種もあります。',
        'Use the vehicle’s published stage count. Adding or deleting calculation intervals does not change it. Some vehicles count boosters as a stage.',
      )}
    >
      <Toggle
        label={tr('公称段数を指定', 'Specify published stage count')}
        checked={presentation.stage_count != null}
        onChange={(on) => set({ stage_count: on ? config.stages.length : undefined })}
      />
      {presentation.stage_count != null && (
        <NumberField
          label={tr('公称段数', 'Published stage count')}
          value={presentation.stage_count}
          path="presentation.stage_count"
          onChange={(stage_count) => set({ stage_count })}
        />
      )}
      <Toggle
        label={tr('ブースタ本数を指定', 'Specify booster count')}
        checked={presentation.booster_count != null}
        onChange={(on) => set({ booster_count: on ? 0 : undefined })}
      />
      {presentation.booster_count != null && (
        <NumberField
          label={tr('ブースタ本数', 'Booster count')}
          value={presentation.booster_count}
          path="presentation.booster_count"
          onChange={(booster_count) => set({ booster_count })}
        />
      )}
    </Group>
  )
}
