import type { ClientConfig } from '../../lib/simulation'
import { NumberField, ProfileTable, Toggle } from '../primitives'
import { Group, type Patch } from './shared'
import { tr } from '../../lib/i18n'

export function AeroTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const a = config.aerodynamics
  const set = (v: Partial<ClientConfig['aerodynamics']>) => patch((c) => ({ ...c, aerodynamics: { ...c.aerodynamics, ...v } }))
  return (
    <>
      <Group title={tr('形状', 'Geometry')}>
        <NumberField label={tr('機体直径', 'Body diameter')} unit="m" path="aerodynamics.body_diameter_m" value={a.body_diameter_m} onChange={(v) => set({ body_diameter_m: v })} />
      </Group>
      <Group title={tr('軸力係数 CA', 'Axial force coefficient CA')} note={tr('機軸方向の抵抗。マッハ数で変わる場合はテーブルで入力します。', 'Drag along the body axis. Use a table if it varies with Mach number.')}>
        <Toggle label={tr('マッハ数テーブルで入力', 'Enter as Mach table')} checked={a.ca_profile.length > 0} onChange={(on) => set({ ca_profile: on ? [{ mach: 0, value: a.ca_constant }, { mach: 5, value: a.ca_constant }] : [] })} />
        {a.ca_profile.length > 0 ? (
          <ProfileTable title={tr('軸力係数 CA のマッハ数テーブル', 'Axial force coefficient CA vs. Mach')} columns={[{ key: 'mach', label: 'Mach' }, { key: 'value', label: 'CA' }]} rows={a.ca_profile} onChange={(rows) => set({ ca_profile: rows })} />
        ) : (
          <NumberField label="CA" unit="—" path="aerodynamics.ca_constant" value={a.ca_constant} onChange={(v) => set({ ca_constant: v })} />
        )}
        <NumberField label={tr('CA倍率', 'CA multiplier')} unit="×" path="aerodynamics.ca_multiplier" value={a.ca_multiplier} onChange={(v) => set({ ca_multiplier: v })} />
      </Group>
      <Group title={tr('法線力係数 CN', 'Normal force coefficient CN')}>
        <Toggle label={tr('マッハ数テーブルで入力', 'Enter as Mach table')} checked={a.cn_profile.length > 0} onChange={(on) => set({ cn_profile: on ? [{ mach: 0, value: a.cn_constant }, { mach: 5, value: a.cn_constant }] : [] })} />
        {a.cn_profile.length > 0 ? (
          <ProfileTable title={tr('法線力係数 CN のマッハ数テーブル', 'Normal force coefficient CN vs. Mach')} columns={[{ key: 'mach', label: 'Mach' }, { key: 'value', label: 'CN' }]} rows={a.cn_profile} onChange={(rows) => set({ cn_profile: rows })} />
        ) : (
          <NumberField label="CN" unit="—" path="aerodynamics.cn_constant" value={a.cn_constant} onChange={(v) => set({ cn_constant: v })} />
        )}
        <NumberField label={tr('CN倍率', 'CN multiplier')} unit="×" path="aerodynamics.cn_multiplier" value={a.cn_multiplier} onChange={(v) => set({ cn_multiplier: v })} />
      </Group>
      <Group title={tr('弾道飛行', 'Ballistic flight')} note={tr('慣性飛行モードが「弾道飛行」の段で使います。', 'Used by stages whose coast mode is "Ballistic flight".')}>
        <NumberField label={tr('弾道係数', 'Ballistic coefficient')} unit="kg/m²" path="aerodynamics.ballistic_coefficient" value={a.ballistic_coefficient} onChange={(v) => set({ ballistic_coefficient: v })} />
      </Group>
    </>
  )
}
