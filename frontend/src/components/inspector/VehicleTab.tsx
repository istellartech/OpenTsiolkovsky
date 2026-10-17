import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ClientConfig, ClientDumpingProduct, ClientStageConfig } from '../../lib/simulation'
import { FREE_MODE_OPTIONS, MAX_STAGE_COUNT, POWER_MODE_OPTIONS, createDefaultStage } from '../../config/defaults'
import { NumberField, ProfileTable, SelectField, Toggle, VectorField } from '../primitives'

import { burnEndForPropellant, type VehicleSpec } from '../../lib/specs'
import { fmt, fmtMass, fmtMax } from '../../lib/format'
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

  // Propellant ⇄ burn time, following the thrust and Isp tables when present.
  const usesTables = (stage.thrust_profile ?? []).length > 0 || (stage.isp_profile ?? []).length > 0
  // Kept per stage so switching stages does not carry the message over
  const [propellantIssue, setPropellantIssue] = useState<{ stage: number; message: string } | null>(null)
  const propellantError = propellantIssue?.stage === idx ? propellantIssue.message : null
  const setPropellantError = (message: string | null) => setPropellantIssue(message ? { stage: idx, message } : null)
  const setBurnEnd = (end: number, s: ClientStageConfig = stage): Partial<ClientStageConfig> => {
    const out: Partial<ClientStageConfig> = { burn_end_s: end }
    // Keep a forced cutoff that sat at the burn end (the usual case) moving with it.
    if (Math.abs(s.forced_cutoff_s - s.burn_end_s) < 1e-6 || s.forced_cutoff_s > end) out.forced_cutoff_s = end
    if (!isLast && s.separation_time_s < end) out.separation_time_s = Math.round((end + 2) * 10) / 10
    return out
  }
  const setPropellant = (kg: number) => {
    if (!(kg > 0)) return
    const end = burnEndForPropellant(stage, kg)
    if (end === null) {
      setPropellantError(
        usesTables
          ? tr('推力テーブルの範囲では、この量を燃やしきれません。', 'The thrust table ends before this much propellant is burned.')
          : tr('推力と比推力を正の値にしてください。', 'Set a positive thrust and Isp first.'),
      )
      return
    }
    setPropellantError(null)
    setStage(setBurnEnd(Math.round(end * 100) / 100))
  }
  const dump = stage.dumping_product
  const setDump = (d: Partial<ClientDumpingProduct>) => dump && setStage({ dumping_product: { ...dump, ...d } })
  const dumpPath = (k: keyof ClientDumpingProduct) => `${p('dumping_product')}.${k}`
  const modeLabel = (opts: { value: number; label: string }[], v: number) =>
    opts.find((o) => o.value === v)?.label.replace(/^\d+:\s*/, '') ?? String(v)
  const multipliers = stage.thrust_multiplier !== 1 || stage.isp_multiplier !== 1
  const modeBadge = `${modeLabel(POWER_MODE_OPTIONS, stage.power_mode)} / ${modeLabel(FREE_MODE_OPTIONS, stage.free_mode)}${
    multipliers ? tr(' · 倍率あり', ' · scaled') : ''
  }`
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
        <NumberField
          key={`propellant-${idx}`}
          label={tr('推進剤', 'Propellant')}
          hint={
            usesTables
              ? tr(
                  '燃焼で消費する量。推力・Ispのテーブルに沿って燃焼終了時刻を決めます。',
                  'Mass consumed during the burn; sets the burnout time along the thrust and Isp tables.',
                )
              : tr('燃焼で消費する量', 'Mass consumed during the burn')
          }
          unit="kg"
          value={Math.round(spec.propellant * 10) / 10}
          onChange={setPropellant}
        />
        {propellantError && <p className="mb-1 text-right text-[11px] text-danger">{propellantError}</p>}
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

      <Group
        key={`dump-${idx}`}
        collapsible
        defaultOpen={!!dump}
        badge={dump ? tr('あり', 'On') : tr('なし', 'None')}
        title={tr('投棄物', 'Jettisoned part')}
        note={tr(
          'フェアリングなど、この段の飛行中に切り離す物体です。切り離した質量は機体から減り、物体は弾道係数で落下点まで計算します。',
          'A part released while this stage flies, such as a fairing. Its mass leaves the vehicle, and it is flown to the ground with its ballistic coefficient.',
        )}
      >
        <Toggle
          label={tr('この段で投棄物を切り離す', 'Jettison a part during this stage')}
          checked={!!dump}
          onChange={(on) =>
            setStage({
              dumping_product: on
                ? {
                    separation_time_s:
                      Math.round(Math.min(stage.burn_end_s + 5, isLast ? Infinity : stage.separation_time_s - 1) * 10) / 10,
                    mass_kg: Math.max(Math.round(stage.mass_initial_kg * 0.02), 1),
                    ballistic_coefficient: 30,
                    additional_velocity_ned_mps: [0, 0, 0],
                  }
                : undefined,
            })
          }
        />
        {dump && (
          <>
            <NumberField
              label={tr('切り離し', 'Release')}
              note={abs(dump.separation_time_s)}
              hint={tr('この段の開始からの秒', 'Seconds from the start of this stage')}
              unit="s"
              path={dumpPath('separation_time_s')}
              value={dump.separation_time_s}
              onChange={(v) => setDump({ separation_time_s: v })}
            />
            <NumberField
              label={tr('質量', 'Mass')}
              unit="kg"
              path={dumpPath('mass_kg')}
              value={dump.mass_kg}
              onChange={(v) => setDump({ mass_kg: v })}
            />
            <NumberField
              label={tr('弾道係数', 'Ballistic coefficient')}
              hint={tr('質量 ÷（抗力係数 × 面積）。小さいほど減速しやすい', 'Mass ÷ (drag coefficient × area); smaller slows down faster')}
              unit="kg/m²"
              path={dumpPath('ballistic_coefficient')}
              value={dump.ballistic_coefficient}
              onChange={(v) => setDump({ ballistic_coefficient: v })}
            />
            <VectorField
              label={tr('切り離し時の追加速度', 'Release velocity')}
              axes={['N', 'E', 'D']}
              unit="m/s"
              path={dumpPath('additional_velocity_ned_mps')}
              value={dump.additional_velocity_ned_mps}
              onChange={(v) => setDump({ additional_velocity_ned_mps: v })}
            />
          </>
        )}
      </Group>

      <Group
        key={`modes-${idx}`}
        collapsible
        defaultOpen={false}
        badge={modeBadge}
        title={tr('飛行モード・補正', 'Flight modes & corrections')}
        note={tr(
          '慣性飛行のモードは、燃焼後のこの段（上段が載っている間）の飛び方です。分離後に落ちていく使用済みの段は姿勢制御がないため、「指定姿勢」は「空力安定」として計算します。',
          'The coast mode sets how this stage flies after burnout while it still carries the upper stages. A spent stage falling after separation has no attitude control, so "commanded attitude" is flown as "aerodynamically stable".',
        )}
      >
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
        key={`aero-${idx}`}
        collapsible
        defaultOpen={!!stage.aero}
        badge={stage.aero ? tr('この段で変更', 'Overridden') : tr('全段共通', 'Shared')}
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
            <Toggle
              label={tr('燃焼していないときの CA を別に指定', 'Separate engine-off CA')}
              checked={stage.aero.ca_power_off_constant !== undefined}
              onChange={(on) =>
                setStage({
                  aero: {
                    ...stage.aero,
                    ca_power_off_constant: on
                      ? (config.aerodynamics.ca_power_off_constant ?? stage.aero?.ca_constant ?? config.aerodynamics.ca_constant)
                      : undefined,
                  },
                })
              }
            />
            {stage.aero.ca_power_off_constant !== undefined && (
              <NumberField
                label={tr('燃焼していないときの CA', 'Engine-off CA')}
                unit="—"
                note={
                  (config.aerodynamics.ca_power_off_profile?.length ?? 0) > 0
                    ? tr('空力タブのマッハ数テーブルが優先されます', 'The Mach table on the Aero tab takes precedence')
                    : undefined
                }
                value={stage.aero.ca_power_off_constant}
                onChange={(v) => setStage({ aero: { ...stage.aero, ca_power_off_constant: v } })}
              />
            )}
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

      <Group
        key={`nozzle-${idx}`}
        collapsible
        defaultOpen={false}
        badge={`ε ${fmtMax(stage.nozzle_expansion_ratio, 1)}`}
        title={tr('ノズル', 'Nozzle')}
      >
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
