import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Config, Engine, Jettison, Stage } from '../../lib/config'
import { curveValue, isRows } from '../../lib/config'
import { FREE_FLIGHT_OPTIONS, MAX_STAGE_COUNT, createDefaultStage } from '../../config/defaults'
import { CurveField, NumberField, SelectField, Toggle, VectorField } from '../primitives'
import { burnEndForPropellant, type VehicleSpec } from '../../lib/specs'
import { fmt, fmtMass } from '../../lib/format'
import { stagePath, patchStage, Readout, Group, StagePills, type Patch } from './shared'
import { tr } from '../../lib/i18n'

export function VehicleTab({
  config,
  patch,
  specs,
  stage: active,
  onStage,
}: {
  config: Config
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
  const engine = stage.engine

  const setStage = (s: Partial<Stage>) => patchStage(patch, idx, (st) => ({ ...st, ...s }))
  const setEngine = (e: Partial<Engine>) => engine && setStage({ engine: { ...engine, ...e } })

  const addStage = () => {
    if (stages.length >= MAX_STAGE_COUNT) return
    const prev = stages[stages.length - 1]
    const base = createDefaultStage()
    const next: Stage = {
      ...base,
      mass_initial_kg: Math.round(prev.mass_initial_kg * 0.25),
      mass_dry_kg: Math.round(prev.mass_initial_kg * 0.25 * 0.3),
      engine: {
        ...base.engine!,
        burn_start_s: 2,
        burn_end_s: 60,
        thrust_vac_n: Math.round(curveValue(prev.engine?.thrust_vac_n, 30000) * 0.25),
      },
      aero: prev.aero,
    }
    // The current top stage now needs a separation time.
    patch((c) => ({
      ...c,
      stages: [
        ...c.stages.map((st, i) =>
          i === c.stages.length - 1 && st.separation_time_s === undefined
            ? { ...st, separation_time_s: Math.round(((st.engine?.burn_end_s ?? 0) + 3) * 10) / 10 }
            : st,
        ),
        next,
      ],
    }))
    onStage(stages.length)
  }
  const removeStage = () => {
    if (stages.length <= 1) return
    patch((c) => {
      const kept = c.stages.filter((_, i) => i !== idx)
      // The new last stage has no separation
      return { ...c, stages: kept.map((st, i) => (i === kept.length - 1 ? { ...st, separation_time_s: undefined } : st)) }
    })
    onStage(Math.max(0, idx - 1))
  }

  const p = (k: string) => stagePath(idx, k)
  const abs = (t: number) => `T+${fmt(spec.start + t)} s`

  // Propellant ⇄ burn time, following the thrust and Isp tables when present.
  const usesTables = !!engine && (isRows(engine.thrust_vac_n) || isRows(engine.isp_vac_s))
  // Kept per stage so switching stages does not carry the message over
  const [propellantIssue, setPropellantIssue] = useState<{ stage: number; message: string } | null>(null)
  const propellantError = propellantIssue?.stage === idx ? propellantIssue.message : null
  const setPropellantError = (message: string | null) => setPropellantIssue(message ? { stage: idx, message } : null)
  const setBurnEnd = (end: number): Partial<Stage> => {
    const out: Partial<Stage> = { engine: { ...engine!, burn_end_s: end } }
    if (!isLast && (stage.separation_time_s ?? 0) < end) out.separation_time_s = Math.round((end + 2) * 10) / 10
    return out
  }
  const setPropellant = (kg: number) => {
    if (!(kg > 0) || !engine) return
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
    // The dry mass follows, so the burn is not cut short by depletion
    setStage({
      ...setBurnEnd(Math.round(end * 100) / 100),
      ...(stage.mass_dry_kg !== undefined && { mass_dry_kg: Math.max(stage.mass_initial_kg - kg, 0) }),
    })
  }

  const jettisons = stage.jettisons ?? []
  const setJettison = (k: number, j: Partial<Jettison>) => setStage({ jettisons: jettisons.map((x, i) => (i === k ? { ...x, ...j } : x)) })
  const addJettison = () =>
    setStage({
      jettisons: [
        ...jettisons,
        {
          name: jettisons.length === 0 ? 'fairing' : `jettison${jettisons.length + 1}`,
          time_s: Math.round(Math.min((engine?.burn_end_s ?? 0) + 5, isLast ? Infinity : (stage.separation_time_s ?? 1) - 1) * 10) / 10,
          mass_kg: Math.max(Math.round(stage.mass_initial_kg * 0.02), 1),
          ballistic_coefficient_kg_m2: 30,
        },
      ],
    })
  const freeFlight = stage.free_flight ?? 'ballistic'
  const freeLabel = FREE_FLIGHT_OPTIONS.find((o) => o.value === freeFlight)?.label ?? freeFlight

  return (
    <>
      <StagePills count={stages.length} active={idx} onStage={onStage}>
        {stages.length < MAX_STAGE_COUNT && (
          <button
            type="button"
            onClick={addStage}
            className="flex h-8 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> {tr('段を追加', 'Add stage')}
          </button>
        )}
      </StagePills>

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
        {engine && (
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
        )}
        {propellantError && <p className="mb-1 text-right text-[11px] text-danger">{propellantError}</p>}
        <Toggle
          label={tr('乾燥質量を指定（推進剤切れで燃焼終了）', 'Dry mass (burn ends when the propellant runs out)')}
          checked={stage.mass_dry_kg !== undefined}
          onChange={(on) => setStage({ mass_dry_kg: on ? Math.max(Math.round(stage.mass_initial_kg - spec.propellant), 0) : undefined })}
        />
        {stage.mass_dry_kg !== undefined && (
          <NumberField
            label={tr('乾燥質量', 'Dry mass')}
            unit="kg"
            path={p('mass_dry_kg')}
            value={stage.mass_dry_kg}
            onChange={(v) => setStage({ mass_dry_kg: v })}
          />
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

      <Group title={tr('エンジン', 'Engine')}>
        <Toggle
          label={tr('この段はエンジンを持つ', 'This stage has an engine')}
          checked={!!engine}
          onChange={(on) => setStage({ engine: on ? createDefaultStage().engine : undefined })}
        />
        {engine && (
          <>
            <CurveField
              label={tr('推力（真空）', 'Thrust (vacuum)')}
              tableLabel={tr('推力を時刻テーブルで入力', 'Enter thrust as time table')}
              title={tr(`${idx + 1}段の推力テーブル`, `Stage ${idx + 1} thrust table`)}
              unit="N"
              xLabel={tr('時刻 s', 'Time s')}
              yLabel={tr('推力 N', 'Thrust N')}
              span={[engine.burn_start_s ?? 0, engine.burn_end_s]}
              path={p('engine.thrust_vac_n')}
              value={engine.thrust_vac_n}
              onChange={(v) => setEngine({ thrust_vac_n: v })}
            />
            <CurveField
              label={tr('比推力 Isp（真空）', 'Specific impulse Isp (vacuum)')}
              tableLabel={tr('Isp を時刻テーブルで入力', 'Enter Isp as time table')}
              title={tr(`${idx + 1}段の比推力テーブル`, `Stage ${idx + 1} Isp table`)}
              unit="s"
              xLabel={tr('時刻 s', 'Time s')}
              yLabel="Isp s"
              span={[engine.burn_start_s ?? 0, engine.burn_end_s]}
              path={p('engine.isp_vac_s')}
              value={engine.isp_vac_s}
              onChange={(v) => setEngine({ isp_vac_s: v })}
            />
            <NumberField
              label={tr('ノズル出口面積', 'Nozzle exit area')}
              hint={tr(
                '大気圧による推力損失（出口面積 × 大気圧）に使います。スロート径 d と膨張比 ε からは π/4·d²·ε。',
                'For the thrust lost to ambient pressure (exit area × pressure). From throat diameter d and expansion ratio ε: π/4·d²·ε.',
              )}
              note={
                engine.nozzle_exit_area_m2
                  ? tr(
                      `出口径 ${fmt(Math.sqrt((4 * engine.nozzle_exit_area_m2) / Math.PI), 3)} m 相当`,
                      `≈ ${fmt(Math.sqrt((4 * engine.nozzle_exit_area_m2) / Math.PI), 3)} m exit diameter`,
                    )
                  : undefined
              }
              unit="m²"
              path={p('engine.nozzle_exit_area_m2')}
              value={engine.nozzle_exit_area_m2 ?? 0}
              onChange={(v) => setEngine({ nozzle_exit_area_m2: v })}
            />
          </>
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
        {engine && (
          <>
            <NumberField
              label={tr('点火', 'Ignition')}
              note={abs(engine.burn_start_s ?? 0)}
              unit="s"
              path={p('engine.burn_start_s')}
              value={engine.burn_start_s ?? 0}
              onChange={(v) => setEngine({ burn_start_s: v })}
            />
            <NumberField
              label={tr('燃焼終了', 'Burnout')}
              note={abs(engine.burn_end_s)}
              unit="s"
              path={p('engine.burn_end_s')}
              value={engine.burn_end_s}
              onChange={(v) => setStage(setBurnEnd(v))}
            />
          </>
        )}
        {!isLast && (
          <NumberField
            label={tr('分離', 'Separation')}
            note={abs(stage.separation_time_s ?? 0)}
            unit="s"
            path={p('separation_time_s')}
            value={stage.separation_time_s ?? 0}
            onChange={(v) => setStage({ separation_time_s: v })}
          />
        )}
      </Group>

      <Group
        key={`jettison-${idx}`}
        collapsible
        defaultOpen={jettisons.length > 0}
        badge={jettisons.length > 0 ? tr(`${jettisons.length}個`, `${jettisons.length}`) : tr('なし', 'None')}
        title={tr('投棄物', 'Jettisoned parts')}
        note={tr(
          'フェアリングなど、この段の飛行中に切り離す物体です。切り離した質量は機体から減り、物体は弾道係数で落下点まで計算します。',
          'Parts released while this stage flies, such as a fairing. Their mass leaves the vehicle, and they are flown to the ground with their ballistic coefficient.',
        )}
      >
        {jettisons.map((j, k) => {
          const q = (key: string) => p(`jettisons[${k}].${key}`)
          return (
            <div key={k} className="mb-2 border-b border-line pb-2 last:border-b-0">
              <div className="flex min-h-8 items-center justify-between gap-2">
                <input
                  aria-label={tr('名前', 'Name')}
                  value={j.name ?? ''}
                  placeholder={`jettison${k + 1}`}
                  onChange={(e) => setJettison(k, { name: e.target.value.replace(/[^\w-]/g, '') })}
                  className="h-7 w-[9.5rem] rounded-[6px] border border-line bg-surface-2 px-2 text-[12px] outline-none focus:border-signal"
                />
                <button
                  type="button"
                  onClick={() => setStage({ jettisons: jettisons.filter((_, i) => i !== k) })}
                  className="flex h-7 items-center gap-1 text-[11px] text-ink-3 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {tr('削除', 'Remove')}
                </button>
              </div>
              <NumberField
                label={tr('切り離し', 'Release')}
                note={abs(j.time_s)}
                hint={tr('この段の開始からの秒', 'Seconds from the start of this stage')}
                unit="s"
                path={q('time_s')}
                value={j.time_s}
                onChange={(v) => setJettison(k, { time_s: v })}
              />
              <NumberField
                label={tr('質量', 'Mass')}
                unit="kg"
                path={q('mass_kg')}
                value={j.mass_kg}
                onChange={(v) => setJettison(k, { mass_kg: v })}
              />
              <NumberField
                label={tr('弾道係数', 'Ballistic coefficient')}
                hint={tr(
                  '質量 ÷（抗力係数 × 面積）。小さいほど減速しやすい',
                  'Mass ÷ (drag coefficient × area); smaller slows down faster',
                )}
                unit="kg/m²"
                path={q('ballistic_coefficient_kg_m2')}
                value={j.ballistic_coefficient_kg_m2 ?? 100}
                onChange={(v) => setJettison(k, { ballistic_coefficient_kg_m2: v })}
              />
              <VectorField
                label={tr('切り離し時の追加速度', 'Release velocity')}
                axes={['N', 'E', 'D']}
                unit="m/s"
                path={q('delta_v_ned_mps')}
                value={j.delta_v_ned_mps ?? [0, 0, 0]}
                onChange={(v) => setJettison(k, { delta_v_ned_mps: v })}
              />
            </div>
          )
        })}
        <button
          type="button"
          onClick={addJettison}
          className="flex h-8 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" /> {tr('投棄物を追加', 'Add jettisoned part')}
        </button>
      </Group>

      <Group
        key={`modes-${idx}`}
        collapsible
        defaultOpen={false}
        badge={freeLabel}
        title={tr('慣性飛行モード', 'Coast mode')}
        note={tr(
          '燃焼後のこの段（上段が載っている間）の飛び方です。分離後に落ちていく使用済みの段は姿勢制御がないため、「指定姿勢」は「空力安定」として計算します。',
          'How this stage flies after burnout while it still carries the upper stages. A spent stage falling after separation has no attitude control, so "commanded attitude" is flown as "aerodynamically stable".',
        )}
      >
        <SelectField
          label={tr('慣性飛行', 'Coast')}
          path={p('free_flight')}
          value={freeFlight}
          options={FREE_FLIGHT_OPTIONS}
          onChange={(v) => setStage({ free_flight: v })}
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
