import { Plus, Trash2 } from 'lucide-react'
import type { ClientConfig, ClientStageConfig } from '../../lib/simulation'
import { FREE_MODE_OPTIONS, MAX_STAGE_COUNT, POWER_MODE_OPTIONS, createDefaultStage } from '../../config/defaults'
import { NumberField, ProfileTable, SelectField, Toggle } from '../primitives'

import type { VehicleSpec } from '../../lib/specs'
import { fmt, fmtMass } from '../../lib/format'
import { cn } from '../../lib/cn'
import { stagePath, Readout, Group, type Patch } from './shared'
import { stageColorVar } from '../../lib/theme'

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
            {i + 1}段
          </button>
        ))}
        {stages.length < MAX_STAGE_COUNT && (
          <button type="button" onClick={addStage} className="flex h-8 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink">
            <Plus className="h-3.5 w-3.5" /> 段を追加
          </button>
        )}
      </div>

      <Group title="質量と推進剤" note="推進剤の量を入れると、推力と比推力から燃焼時間（燃焼終了時刻）が決まります。">
        <NumberField
          label="段の質量"
          hint="この段単体の質量（推進剤込み）。上の段は含めません。"
          unit="kg"
          path={p('mass_initial_kg')}
          value={stage.mass_initial_kg}
          onChange={(v) => setStage({ mass_initial_kg: v })}
        />
        {canEditPropellant ? (
          <NumberField
            label="推進剤"
            hint="燃焼で消費する量"
            unit="kg"
            value={Math.round(spec.propellant * 10) / 10}
            onChange={setPropellant}
          />
        ) : (
          <div className="flex min-h-8 items-center justify-between py-[3px] text-ink-2">
            <span>
              推進剤
              <span className="block text-[10px] leading-snug text-ink-3">推力・Ispのテーブルから計算</span>
            </span>
            <span className="num w-[9.5rem] pr-2 text-right text-[13px] text-ink">{fmtMass(spec.propellant)}</span>
          </div>
        )}
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 rounded-[6px] bg-surface-2 px-2.5 py-2 text-[11px]">
          <Readout k="燃焼時間" v={`${fmt(spec.burnTime)} s`} />
          <Readout k="燃焼後" v={fmtMass(Math.max(stage.mass_initial_kg - spec.propellant, 0))} warn={spec.propellant >= stage.mass_initial_kg} />
          <Readout k="推進剤比" v={`${fmt((spec.propellant / Math.max(stage.mass_initial_kg, 1e-9)) * 100, 0)} %`} />
          <Readout k="推力重量比" v={fmt(spec.thrustIgnition / Math.max(spec.stackMass * 9.80665, 1e-9), 2)} warn={idx === 0 && spec.thrustIgnition < spec.stackMass * 9.80665} />
          <Readout k="Δv（理想）" v={`${fmt(spec.dv / 1000, 2)} km/s`} />
          <Readout k="点火時総質量" v={fmtMass(spec.stackMass)} />
        </dl>
        {idx === 0 && spec.thrustIgnition < spec.stackMass * 9.80665 && (
          <p className="mt-1 text-[11px] text-danger">推力が重量より小さく、離昇できません。</p>
        )}
      </Group>

      <Group title="推力・比推力">
        <Toggle
          label="推力を時刻テーブルで入力"
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
          <ProfileTable title={`${idx + 1}段の推力テーブル`} columns={[{ key: 'time', label: '時刻 s' }, { key: 'value', label: '推力 N' }]} rows={thrustProfile} onChange={(rows) => setStage({ thrust_profile: rows })} />
        ) : (
          <NumberField label="推力（真空）" unit="N" path={p('thrust_constant')} value={stage.thrust_constant} onChange={(v) => setStage({ thrust_constant: v })} />
        )}
        <Toggle
          label="Isp を時刻テーブルで入力"
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
          <ProfileTable title={`${idx + 1}段の比推力テーブル`} columns={[{ key: 'time', label: '時刻 s' }, { key: 'value', label: 'Isp s' }]} rows={ispProfile} onChange={(rows) => setStage({ isp_profile: rows })} />
        ) : (
          <NumberField label="比推力 Isp（真空）" unit="s" path={p('isp_constant')} value={stage.isp_constant} onChange={(v) => setStage({ isp_constant: v })} />
        )}
      </Group>

      <Group
        title="シーケンス"
        note={
          idx === 0
            ? '時刻は打上げからの秒です。'
            : `この段は ${idx}段の分離（T+${fmt(spec.start)} s）から始まり、時刻はそこからの経過秒で入力します。テーブルの時刻も同じです。`
        }
      >
        <NumberField label="点火" note={abs(stage.burn_start_s)} unit="s" path={p('burn_start_s')} value={stage.burn_start_s} onChange={(v) => setStage({ burn_start_s: v })} />
        <NumberField label="燃焼終了" note={abs(stage.burn_end_s)} unit="s" path={p('burn_end_s')} value={stage.burn_end_s} onChange={(v) => setStage(setBurnEnd(v))} />
        <NumberField
          label="強制停止"
          note={Math.abs(stage.forced_cutoff_s - stage.burn_end_s) < 1e-6 ? '燃焼終了と同じ（変更不要）' : abs(stage.forced_cutoff_s)}
          hint={Math.abs(stage.forced_cutoff_s - stage.burn_end_s) < 1e-6 ? undefined : '燃焼終了より前なら、その時刻で燃焼を打ち切ります'}
          unit="s"
          path={p('forced_cutoff_s')}
          value={stage.forced_cutoff_s}
          onChange={(v) => setStage({ forced_cutoff_s: v })}
        />
        {!isLast && (
          <NumberField label="分離" note={abs(stage.separation_time_s)} unit="s" path={p('separation_time_s')} value={stage.separation_time_s} onChange={(v) => setStage({ separation_time_s: v })} />
        )}
      </Group>

      <Group title="飛行モード・補正">
        <SelectField label="動力飛行" path={p('power_mode')} value={stage.power_mode} options={POWER_MODE_OPTIONS.map((o) => ({ ...o, label: o.label.replace(/^\d+:\s*/, '') }))} onChange={(v) => setStage({ power_mode: v })} />
        <SelectField label="慣性飛行" path={p('free_mode')} value={stage.free_mode} options={FREE_MODE_OPTIONS.map((o) => ({ ...o, label: o.label.replace(/^\d+:\s*/, '') }))} onChange={(v) => setStage({ free_mode: v })} />
        <NumberField label="推力倍率" unit="×" path={p('thrust_multiplier')} value={stage.thrust_multiplier} onChange={(v) => setStage({ thrust_multiplier: v })} />
        <NumberField label="Isp倍率" unit="×" path={p('isp_multiplier')} value={stage.isp_multiplier} onChange={(v) => setStage({ isp_multiplier: v })} />
      </Group>

      <Group title="この段の空力" note="上段で機体が細くなる場合などに使います。マッハ数テーブルは空力タブの設定を全段で共通に使います。">
        <Toggle
          label="この段だけ空力の値を変える"
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
            <NumberField label="機体直径" unit="m" value={stage.aero.body_diameter_m ?? config.aerodynamics.body_diameter_m} onChange={(v) => setStage({ aero: { ...stage.aero, body_diameter_m: v } })} />
            <NumberField label="軸力係数 CA" unit="—" value={stage.aero.ca_constant ?? config.aerodynamics.ca_constant} onChange={(v) => setStage({ aero: { ...stage.aero, ca_constant: v } })} />
            <NumberField label="法線力係数 CN" unit="—" value={stage.aero.cn_constant ?? config.aerodynamics.cn_constant} onChange={(v) => setStage({ aero: { ...stage.aero, cn_constant: v } })} />
            <NumberField label="弾道係数" unit="kg/m²" value={stage.aero.ballistic_coefficient ?? config.aerodynamics.ballistic_coefficient} onChange={(v) => setStage({ aero: { ...stage.aero, ballistic_coefficient: v } })} />
          </>
        )}
      </Group>

      <Group title="ノズル">
        <NumberField label="スロート径" unit="m" path={p('throat_diameter_m')} value={stage.throat_diameter_m} onChange={(v) => setStage({ throat_diameter_m: v })} />
        <NumberField label="膨張比" unit="—" path={p('nozzle_expansion_ratio')} value={stage.nozzle_expansion_ratio} onChange={(v) => setStage({ nozzle_expansion_ratio: v })} />
        <NumberField label="出口圧" unit="Pa" path={p('nozzle_exit_pressure_pa')} value={stage.nozzle_exit_pressure_pa} onChange={(v) => setStage({ nozzle_exit_pressure_pa: v })} />
      </Group>

      {stages.length > 1 && (
        <button type="button" onClick={removeStage} className="flex h-8 items-center gap-1.5 text-[12px] text-ink-3 hover:text-danger">
          <Trash2 className="h-3.5 w-3.5" /> {idx + 1}段を削除
        </button>
      )}
    </>
  )
}
