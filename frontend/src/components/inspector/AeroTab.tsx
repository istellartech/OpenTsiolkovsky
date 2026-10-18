import type { Aero, Config } from '../../lib/config'
import { DEFAULTS, curveValue } from '../../lib/config'
import { CurveField, NumberField, Toggle } from '../primitives'
import { Group, StagePills, patchStage, stagePath, type Patch } from './shared'
import { tr } from '../../lib/i18n'

export function AeroTab({
  config,
  patch,
  stage: active,
  onStage,
}: {
  config: Config
  patch: Patch
  stage: number
  onStage: (i: number) => void
}) {
  const idx = Math.min(active, config.stages.length - 1)
  const a = config.stages[idx].aero ?? {}
  const set = (v: Partial<Aero>) => patchStage(patch, idx, (st) => ({ ...st, aero: { ...st.aero, ...v } }))
  const p = (k: string) => stagePath(idx, `aero.${k}`)
  const powerOff = a.ca_power_off !== undefined
  const many = config.stages.length > 1
  return (
    <>
      {many && <StagePills count={config.stages.length} active={idx} onStage={onStage} />}
      <Group
        title={tr('形状', 'Geometry')}
        note={
          many
            ? tr(
                '空力は段ごとです。各段の値は、その段より上を載せて飛んでいる間（と分離後に落ちていくとき）に使います。',
                'Aerodynamics are per stage: each stage’s values apply while it flies with the stages above it (and when it falls after separation).',
              )
            : undefined
        }
      >
        <NumberField
          label={tr('機体直径', 'Body diameter')}
          hint={tr('基準面積 = π/4 × 直径²', 'Reference area = π/4 × diameter²')}
          unit="m"
          path={p('diameter_m')}
          value={a.diameter_m ?? DEFAULTS.diameter}
          onChange={(v) => set({ diameter_m: v })}
        />
      </Group>
      <Group
        title={tr('軸力係数 CA', 'Axial force coefficient CA')}
        note={tr(
          '機軸方向の抵抗。マッハ数で変わる場合はテーブルで入力します。',
          'Drag along the body axis. Use a table if it varies with Mach number.',
        )}
      >
        <CurveField
          label="CA"
          tableLabel={tr('マッハ数テーブルで入力', 'Enter as Mach table')}
          title={tr('軸力係数 CA のマッハ数テーブル', 'Axial force coefficient CA vs. Mach')}
          unit="—"
          xLabel="Mach"
          yLabel="CA"
          span={[0, 5]}
          path={p('ca')}
          value={a.ca ?? 0}
          onChange={(v) => set({ ca: v })}
        />
      </Group>
      <Group
        collapsible
        defaultOpen={powerOff}
        badge={powerOff ? tr('別の値', 'Separate') : tr('燃焼中と同じ', 'Same as powered')}
        title={tr('燃焼していないときの CA', 'Engine-off CA')}
        note={tr(
          '燃焼前・燃焼後はベース抗力が増えるので、別の CA を使えます。指定しなければ燃焼中と同じ CA です。',
          'Base drag rises when the engine is not firing, so a separate CA can be used before ignition and after burnout. Unset, the powered CA applies.',
        )}
      >
        <Toggle
          label={tr('燃焼中と別の CA を使う', 'Use a separate CA')}
          checked={powerOff}
          onChange={(on) => set({ ca_power_off: on ? (a.ca ?? 0) : undefined })}
        />
        {powerOff && (
          <CurveField
            label="CA"
            tableLabel={tr('マッハ数テーブルで入力', 'Enter as Mach table')}
            title={tr('燃焼していないときの CA のマッハ数テーブル', 'Engine-off CA vs. Mach')}
            unit="—"
            xLabel="Mach"
            yLabel="CA"
            span={[0, 5]}
            path={p('ca_power_off')}
            value={a.ca_power_off}
            onChange={(v) => set({ ca_power_off: v })}
          />
        )}
      </Group>
      <Group
        title={tr('法線力係数 CNα', 'Normal force slope CNα')}
        note={tr(
          '法線力 = CNα × 迎角 [rad] × 動圧 × 基準面積',
          'Normal force = CNα × angle of attack [rad] × dynamic pressure × reference area',
        )}
      >
        {a.cn_table ? (
          <div className="flex min-h-8 items-center justify-between gap-2 text-[12px] text-ink-2">
            <span>{tr('Mach × 迎角の CN テーブルを使用中', 'Using a CN table over Mach × angle of attack')}</span>
            <button
              type="button"
              onClick={() => set({ cn_table: undefined })}
              className="h-7 rounded-[6px] border border-line px-2 text-[11px] hover:border-ink hover:text-ink"
            >
              {tr('CNα に戻す', 'Use CNα')}
            </button>
          </div>
        ) : (
          <CurveField
            label="CNα"
            tableLabel={tr('マッハ数テーブルで入力', 'Enter as Mach table')}
            title={tr('法線力係数 CNα のマッハ数テーブル', 'Normal force slope CNα vs. Mach')}
            unit="/rad"
            xLabel="Mach"
            yLabel="CNα"
            span={[0, 5]}
            path={p('cn_alpha_per_rad')}
            value={a.cn_alpha_per_rad ?? 0}
            onChange={(v) => set({ cn_alpha_per_rad: v })}
          />
        )}
      </Group>
      <Group
        title={tr('弾道飛行', 'Ballistic flight')}
        note={tr('慣性飛行モードが「弾道飛行」のとき使います。', 'Used when the coast mode is "Ballistic".')}
      >
        <NumberField
          label={tr('弾道係数', 'Ballistic coefficient')}
          hint={tr(
            '質量 ÷（抗力係数 × 面積）。抗力加速度 = 動圧 ÷ 弾道係数',
            'Mass ÷ (drag coefficient × area); drag deceleration = dynamic pressure ÷ coefficient',
          )}
          unit="kg/m²"
          path={p('ballistic_coefficient_kg_m2')}
          value={a.ballistic_coefficient_kg_m2 ?? DEFAULTS.ballistic}
          onChange={(v) => set({ ballistic_coefficient_kg_m2: v })}
        />
      </Group>
      {many && (
        <button
          type="button"
          onClick={() => patch((c) => ({ ...c, stages: c.stages.map((st) => ({ ...st, aero: { ...a } })) }))}
          className="h-8 rounded-[6px] border border-line px-3 text-[12px] text-ink-2 hover:border-ink hover:text-ink"
          title={tr(`CA ${curveValue(a.ca)} などを全段にコピー`, `Copy CA ${curveValue(a.ca)} etc. to every stage`)}
        >
          {tr(`${idx + 1}段の空力を全段に適用`, `Apply stage ${idx + 1} aerodynamics to all stages`)}
        </button>
      )}
    </>
  )
}
