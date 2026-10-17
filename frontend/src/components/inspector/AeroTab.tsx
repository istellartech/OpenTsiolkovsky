import type { ClientConfig } from '../../lib/simulation'
import { NumberField, ProfileTable, Toggle } from '../primitives'
import { Group, type Patch } from './shared'

export function AeroTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const a = config.aerodynamics
  const set = (v: Partial<ClientConfig['aerodynamics']>) => patch((c) => ({ ...c, aerodynamics: { ...c.aerodynamics, ...v } }))
  return (
    <>
      <Group title="形状">
        <NumberField label="機体直径" unit="m" path="aerodynamics.body_diameter_m" value={a.body_diameter_m} onChange={(v) => set({ body_diameter_m: v })} />
      </Group>
      <Group title="軸力係数 CA" note="機軸方向の抵抗。マッハ数で変わる場合はテーブルで入力します。">
        <Toggle label="マッハ数テーブルで入力" checked={a.ca_profile.length > 0} onChange={(on) => set({ ca_profile: on ? [{ mach: 0, value: a.ca_constant }, { mach: 5, value: a.ca_constant }] : [] })} />
        {a.ca_profile.length > 0 ? (
          <ProfileTable title="軸力係数 CA のマッハ数テーブル" columns={[{ key: 'mach', label: 'Mach' }, { key: 'value', label: 'CA' }]} rows={a.ca_profile} onChange={(rows) => set({ ca_profile: rows })} />
        ) : (
          <NumberField label="CA" unit="—" path="aerodynamics.ca_constant" value={a.ca_constant} onChange={(v) => set({ ca_constant: v })} />
        )}
        <NumberField label="CA倍率" unit="×" path="aerodynamics.ca_multiplier" value={a.ca_multiplier} onChange={(v) => set({ ca_multiplier: v })} />
      </Group>
      <Group title="法線力係数 CN">
        <Toggle label="マッハ数テーブルで入力" checked={a.cn_profile.length > 0} onChange={(on) => set({ cn_profile: on ? [{ mach: 0, value: a.cn_constant }, { mach: 5, value: a.cn_constant }] : [] })} />
        {a.cn_profile.length > 0 ? (
          <ProfileTable title="法線力係数 CN のマッハ数テーブル" columns={[{ key: 'mach', label: 'Mach' }, { key: 'value', label: 'CN' }]} rows={a.cn_profile} onChange={(rows) => set({ cn_profile: rows })} />
        ) : (
          <NumberField label="CN" unit="—" path="aerodynamics.cn_constant" value={a.cn_constant} onChange={(v) => set({ cn_constant: v })} />
        )}
        <NumberField label="CN倍率" unit="×" path="aerodynamics.cn_multiplier" value={a.cn_multiplier} onChange={(v) => set({ cn_multiplier: v })} />
      </Group>
      <Group title="弾道飛行" note="慣性飛行モードが「弾道飛行」の段で使います。">
        <NumberField label="弾道係数" unit="kg/m²" path="aerodynamics.ballistic_coefficient" value={a.ballistic_coefficient} onChange={(v) => set({ ballistic_coefficient: v })} />
      </Group>
    </>
  )
}
