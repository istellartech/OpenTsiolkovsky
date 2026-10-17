import { Plus, Trash2 } from 'lucide-react'
import type { ClientConfig, ClientStageConfig } from '../../lib/simulation'
import { FREE_MODE_OPTIONS, MAX_STAGE_COUNT, POWER_MODE_OPTIONS, createDefaultStage } from '../../config/defaults'
import { NumberField, ProfileTable, SelectField, Toggle } from '../primitives'

import type { VehicleSpec } from '../../lib/specs'
import { fmt, fmtMass } from '../../lib/format'
import { cn } from '../../lib/cn'
import { stagePath, Readout, Group, type Patch } from './shared'
import { stageColorVar } from '../../lib/theme'
import { tr } from '../../lib/i18n'

export function VehicleTab({
  config,
  patch,
  specs,
  stage: active,
  onStage,
}: {
  config: ClientConfig
  patch: Patch
  specs: VehicleSpec
  stage: number
  onStage: (i: number) => void
}) {
  const stages = config.stages
  const idx = Math.min(active, stages.length - 1)
  const stage = stages[idx]
  const spec = specs.stages[idx]
  const isLast = idx === stages.length - 1

  const setStage = (s: Partial<ClientStageConfig>) =>
    patch((c) => ({ ...c, stages: c.stages.map((st, i) => (i === idx ? { ...st, ...s } : st)) }))

  const addStage = () => {
    if (stages.length >= MAX_STAGE_COUNT) return
    const prev = stages[stages.length - 1]
    const next = {
      ...createDefaultStage(),
      mass_initial_kg: Math.round(prev.mass_initial_kg * 0.25),
      burn_start_s: 2,
      burn_end_s: 60,
      forced_cutoff_s: 60,
      thrust_constant: Math.round(prev.thrust_constant * 0.25),
    }
    // The current top stage now needs a real separation time.
    patch((c) => ({
      ...c,
      stages: [
        ...c.stages.map((st, i) =>
          i === c.stages.length - 1 && st.separation_time_s > 1e5 ? { ...st, separation_time_s: st.burn_end_s + 3 } : st,
        ),
        next,
      ],
    }))
    onStage(stages.length)
  }
  const removeStage = () => {
    if (stages.length <= 1) return
    patch((c) => ({ ...c, stages: c.stages.filter((_, i) => i !== idx) }))
    onStage(Math.max(0, idx - 1))
  }

  const p = (k: keyof ClientStageConfig) => stagePath(idx, k)
  const abs = (t: number) => `T+${fmt(spec.start + t)} s`

  // Propellant ⇄ burn time (constant thrust and Isp only).
  const canEditPropellant = (stage.thrust_profile ?? []).length === 0 && (stage.isp_profile ?? []).length === 0
  const setBurnEnd = (end: number, s: ClientStageConfig = stage): Partial<ClientStageConfig> => {
    const out: Partial<ClientStageConfig> = { burn_end_s: end }
    // Keep a forced cutoff that sat at the burn end (the usual case) moving with it.
    if (Math.abs(s.forced_cutoff_s - s.burn_end_s) < 1e-6 || s.forced_cutoff_s > end) out.forced_cutoff_s = end
    if (!isLast && s.separation_time_s < end) out.separation_time_s = Math.round((end + 2) * 10) / 10
    return out
  }
  const setPropellant = (kg: number) => {
    const thrust = stage.thrust_constant * stage.thrust_multiplier
    const isp = stage.isp_constant * stage.isp_multiplier
    if (thrust <= 0 || isp <= 0 || kg <= 0) return
    const burn = (kg * isp * 9.80665) / thrust
    setStage(setBurnEnd(Math.round((stage.burn_start_s + burn) * 100) / 100))
  }
  const thrustProfile = stage.thrust_profile ?? []
  const ispProfile = stage.isp_profile ?? []

  return (
    <>
      <div className="mb-3 flex items-center gap-1">
        {stages.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onStage(i)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[6px] border px-3 text-[12px] font-medium',
              i === idx ? 'border-ink bg-ink text-surface' : 'border-line text-ink-2 hover:border-line-strong',
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: stageColorVar(i + 1) }} />
            {tr(`${i + 1}段`, `Stage ${i + 1}`)}
          </button>
        ))}
        {stages.length < MAX_STAGE_COUNT && (
          <button
            type="button"
            onClick={addStage}
            className="flex h-8 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> {tr('段を追加', 'Add stage')}
          </button>
        )}
      </div>

      <Group
        title={tr('質量と推進剤', 'Mass & propellant')}
        note={tr(
          '推進剤の量を入れると、推力と比推力から燃焼時間（燃焼終了時刻）が決まります。',
          'Entering a propellant mass sets the burn time (burnout time) from thrust and specific impulse.',
        )}
      >
        <NumberField
          label={tr('段の質量', 'Stage mass')}
          hint={tr(
            'この段単体の質量（推進剤込み）。上の段は含めません。',
            'Mass of this stage alone, including propellant. Excludes upper stages.',
          )}
          unit="kg"
          path={p('mass_initial_kg')}
          value={stage.mass_initial_kg}
          onChange={(v) => setStage({ mass_initial_kg: v })}
        />
        {canEditPropellant ? (
          <NumberField
            label={tr('推進剤', 'Propellant')}
            hint={tr('燃焼で消費する量', 'Mass consumed during the burn')}
            unit="kg"
            value={Math.round(spec.propellant * 10) / 10}
            onChange={setPropellant}
          />
        ) : (
          <div className="flex min-h-8 items-center justify-between py-[3px] text-ink-2">
            <span>
              {tr('推進剤', 'Propellant')}
              <span className="block text-[10px] leading-snug text-ink-3">
                {tr('推力・Ispのテーブルから計算', 'Computed from thrust and Isp tables')}
              </span>
            </span>
            <span className="num w-[9.5rem] pr-2 text-right text-[13px] text-ink">{fmtMass(spec.propellant)}</span>
          </div>
        )}
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 rounded-[6px] bg-surface-2 px-2.5 py-2 text-[11px]">
          <Readout k={tr('燃焼時間', 'Burn time')} v={`${fmt(spec.burnTime)} s`} />
          <Readout
            k={tr('燃焼後', 'Burnout mass')}
            v={fmtMass(Math.max(stage.mass_initial_kg - spec.propellant, 0))}
            warn={spec.propellant >= stage.mass_initial_kg}
          />
          <Readout
            k={tr('推進剤比', 'Propellant fraction')}
            v={`${fmt((spec.propellant / Math.max(stage.mass_initial_kg, 1e-9)) * 100, 0)} %`}
          />
          <Readout
            k={tr('推力重量比', 'Thrust-to-weight')}
            v={fmt(spec.thrustIgnition / Math.max(spec.stackMass * 9.80665, 1e-9), 2)}
            warn={idx === 0 && spec.thrustIgnition < spec.stackMass * 9.80665}
          />
          <Readout k={tr('Δv（理想）', 'Δv (ideal)')} v={`${fmt(spec.dv / 1000, 2)} km/s`} />
          <Readout k={tr('点火時総質量', 'Mass at ignition')} v={fmtMass(spec.stackMass)} />
        </dl>
        {idx === 0 && spec.thrustIgnition < spec.stackMass * 9.80665 && (
          <p className="mt-1 text-[11px] text-danger">
            {tr('推力が重量より小さく、離昇できません。', 'Thrust is less than weight; the vehicle cannot lift off.')}
          </p>
        )}
      </Group>

      <Group title={tr('推力・比推力', 'Thrust & specific impulse')}>
        <Toggle
          label={tr('推力を時刻テーブルで入力', 'Enter thrust as time table')}
          checked={thrustProfile.length > 0}
          onChange={(on) =>
            setStage({
              thrust_profile: on
                ? [
                    { time: stage.burn_start_s, value: stage.thrust_constant },
                    { time: stage.burn_end_s, value: stage.thrust_constant },
                  ]
                : [],
            })
          }
        />
        {thrustProfile.length > 0 ? (
          <ProfileTable
            title={tr(`${idx + 1}段の推力テーブル`, `Stage ${idx + 1} thrust table`)}
            columns={[
              { key: 'time', label: tr('時刻 s', 'Time s') },
              { key: 'value', label: tr('推力 N', 'Thrust N') },
            ]}
            rows={thrustProfile}
            onChange={(rows) => setStage({ thrust_profile: rows })}
          />
        ) : (
          <NumberField
            label={tr('推力（真空）', 'Thrust (vacuum)')}
            unit="N"
            path={p('thrust_constant')}
            value={stage.thrust_constant}
            onChange={(v) => setStage({ thrust_constant: v })}
          />
        )}
        <Toggle
          label={tr('Isp を時刻テーブルで入力', 'Enter Isp as time table')}
          checked={ispProfile.length > 0}
          onChange={(on) =>
            setStage({
              isp_profile: on
                ? [
                    { time: stage.burn_start_s, value: stage.isp_constant },
                    { time: stage.burn_end_s, value: stage.isp_constant },
                  ]
                : [],
            })
          }
        />
        {ispProfile.length > 0 ? (
          <ProfileTable
            title={tr(`${idx + 1}段の比推力テーブル`, `Stage ${idx + 1} Isp table`)}
            columns={[
              { key: 'time', label: tr('時刻 s', 'Time s') },
              { key: 'value', label: 'Isp s' },
            ]}
            rows={ispProfile}
            onChange={(rows) => setStage({ isp_profile: rows })}
          />
        ) : (
          <NumberField
            label={tr('比推力 Isp（真空）', 'Specific impulse Isp (vacuum)')}
            unit="s"
            path={p('isp_constant')}
            value={stage.isp_constant}
            onChange={(v) => setStage({ isp_constant: v })}
          />
        )}
      </Group>

      <Group
        title={tr('シーケンス', 'Sequence')}
        note={
          idx === 0
            ? tr('時刻は打上げからの秒です。', 'Times are seconds after launch.')
            : tr(
                `この段は ${idx}段の分離（T+${fmt(spec.start)} s）から始まり、時刻はそこからの経過秒で入力します。テーブルの時刻も同じです。`,
                `This stage starts at stage ${idx} separation (T+${fmt(spec.start)} s); enter times as seconds from then. Table times work the same way.`,
              )
        }
      >
        <NumberField
          label={tr('点火', 'Ignition')}
          note={abs(stage.burn_start_s)}
          unit="s"
          path={p('burn_start_s')}
          value={stage.burn_start_s}
          onChange={(v) => setStage({ burn_start_s: v })}
        />
        <NumberField
          label={tr('燃焼終了', 'Burnout')}
          note={abs(stage.burn_end_s)}
          unit="s"
          path={p('burn_end_s')}
          value={stage.burn_end_s}
          onChange={(v) => setStage(setBurnEnd(v))}
        />
        <NumberField
          label={tr('強制停止', 'Forced cutoff')}
          note={
            Math.abs(stage.forced_cutoff_s - stage.burn_end_s) < 1e-6
              ? tr('燃焼終了と同じ（変更不要）', 'Same as burnout (no change needed)')
              : abs(stage.forced_cutoff_s)
          }
          hint={
            Math.abs(stage.forced_cutoff_s - stage.burn_end_s) < 1e-6
              ? undefined
              : tr('燃焼終了より前なら、その時刻で燃焼を打ち切ります', 'If earlier than burnout, the burn is cut off at this time')
          }
          unit="s"
          path={p('forced_cutoff_s')}
          value={stage.forced_cutoff_s}
          onChange={(v) => setStage({ forced_cutoff_s: v })}
        />
        {!isLast && (
          <NumberField
            label={tr('分離', 'Separation')}
            note={abs(stage.separation_time_s)}
            unit="s"
            path={p('separation_time_s')}
            value={stage.separation_time_s}
            onChange={(v) => setStage({ separation_time_s: v })}
          />
        )}
      </Group>

      <Group title={tr('飛行モード・補正', 'Flight modes & corrections')}>
        <SelectField
          label={tr('動力飛行', 'Powered flight')}
          path={p('power_mode')}
          value={stage.power_mode}
          options={POWER_MODE_OPTIONS.map((o) => ({ ...o, label: o.label.replace(/^\d+:\s*/, '') }))}
          onChange={(v) => setStage({ power_mode: v })}
        />
        <SelectField
          label={tr('慣性飛行', 'Coast')}
          path={p('free_mode')}
          value={stage.free_mode}
          options={FREE_MODE_OPTIONS.map((o) => ({ ...o, label: o.label.replace(/^\d+:\s*/, '') }))}
          onChange={(v) => setStage({ free_mode: v })}
        />
        <NumberField
          label={tr('推力倍率', 'Thrust multiplier')}
          unit="×"
          path={p('thrust_multiplier')}
          value={stage.thrust_multiplier}
          onChange={(v) => setStage({ thrust_multiplier: v })}
        />
        <NumberField
          label={tr('Isp倍率', 'Isp multiplier')}
          unit="×"
          path={p('isp_multiplier')}
          value={stage.isp_multiplier}
          onChange={(v) => setStage({ isp_multiplier: v })}
        />
      </Group>

      <Group
        title={tr('この段の空力', 'Stage aerodynamics')}
        note={tr(
          '上段で機体が細くなる場合などに使います。マッハ数テーブルは空力タブの設定を全段で共通に使います。',
          'Use when, for example, the upper stage is narrower. Mach tables from the Aero tab apply to all stages.',
        )}
      >
        <Toggle
          label={tr('この段だけ空力の値を変える', 'Override aerodynamics for this stage')}
          checked={!!stage.aero}
          onChange={(on) =>
            setStage({
              aero: on
                ? {
                    body_diameter_m: config.aerodynamics.body_diameter_m,
                    ca_constant: config.aerodynamics.ca_constant,
                    cn_constant: config.aerodynamics.cn_constant,
                    ballistic_coefficient: config.aerodynamics.ballistic_coefficient,
                  }
                : undefined,
            })
          }
        />
        {stage.aero && (
          <>
            <NumberField
              label={tr('機体直径', 'Body diameter')}
              unit="m"
              value={stage.aero.body_diameter_m ?? config.aerodynamics.body_diameter_m}
              onChange={(v) => setStage({ aero: { ...stage.aero, body_diameter_m: v } })}
            />
            <NumberField
              label={tr('軸力係数 CA', 'Axial force coefficient CA')}
              unit="—"
              value={stage.aero.ca_constant ?? config.aerodynamics.ca_constant}
              onChange={(v) => setStage({ aero: { ...stage.aero, ca_constant: v } })}
            />
            <NumberField
              label={tr('法線力係数 CN', 'Normal force coefficient CN')}
              unit="—"
              value={stage.aero.cn_constant ?? config.aerodynamics.cn_constant}
              onChange={(v) => setStage({ aero: { ...stage.aero, cn_constant: v } })}
            />
            <NumberField
              label={tr('弾道係数', 'Ballistic coefficient')}
              unit="kg/m²"
              value={stage.aero.ballistic_coefficient ?? config.aerodynamics.ballistic_coefficient}
              onChange={(v) => setStage({ aero: { ...stage.aero, ballistic_coefficient: v } })}
            />
          </>
        )}
      </Group>

      <Group title={tr('ノズル', 'Nozzle')}>
        <NumberField
          label={tr('スロート径', 'Throat diameter')}
          unit="m"
          path={p('throat_diameter_m')}
          value={stage.throat_diameter_m}
          onChange={(v) => setStage({ throat_diameter_m: v })}
        />
        <NumberField
          label={tr('膨張比', 'Expansion ratio')}
          unit="—"
          path={p('nozzle_expansion_ratio')}
          value={stage.nozzle_expansion_ratio}
          onChange={(v) => setStage({ nozzle_expansion_ratio: v })}
        />
        <NumberField
          label={tr('出口圧', 'Exit pressure')}
          unit="Pa"
          path={p('nozzle_exit_pressure_pa')}
          value={stage.nozzle_exit_pressure_pa}
          onChange={(v) => setStage({ nozzle_exit_pressure_pa: v })}
        />
      </Group>

      {stages.length > 1 && (
        <button type="button" onClick={removeStage} className="flex h-8 items-center gap-1.5 text-[12px] text-ink-3 hover:text-danger">
          <Trash2 className="h-3.5 w-3.5" /> {tr(`${idx + 1}段を削除`, `Delete stage ${idx + 1}`)}
        </button>
      )}
    </>
  )
}
