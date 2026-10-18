import { DisplayNameField } from './PresentationFields'
import { phaseLabel } from '../../lib/presentation'
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
      <StagePills presentation={specs.presentation} count={stages.length} active={idx} onStage={onStage}>
        {stages.length < MAX_STAGE_COUNT && (
          <button
            type="button"
            onClick={addStage}
            className="flex h-8 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <Plus className="h-3.5 w-3.5" /> {tr('区間を追加', 'Add interval')}
          </button>
        )}
      </StagePills>

      <Group
        title={tr('計算区間の表示', 'Calculation interval display')}
        note={tr(
          '表示名は計算結果に影響しません。翻訳付きの名前は現在の表示言語で編集します。',
          'Names do not affect flight calculations. Translated names are edited in the current UI language.',
        )}
      >
        <DisplayNameField
          label={tr('区間名', 'Interval name')}
          value={stage.presentation?.name}
          path={p('presentation.name')}
          placeholder={tr(`区間${idx + 1}`, `Interval ${idx + 1}`)}
          onChange={(name) => setStage({ presentation: { ...stage.presentation, name } })}
        />
        {!isLast && (
          <>
            <DisplayNameField
              label={tr('区間末に分離する物体名', 'Body released at interval end')}
              path={p('presentation.separation_name')}
              value={stage.presentation?.separation_name}
              placeholder={tr(`区間${idx + 1}の分離物`, `Interval ${idx + 1} released body`)}
              onChange={(separation_name) => setStage({ presentation: { ...stage.presentation, separation_name } })}
            />
            <Toggle
              label={tr('分離後もエンジンの燃焼が継続する', 'Engine burn continues after separation')}
              checked={stage.presentation?.engine_continues ?? false}
              onChange={(engine_continues) => setStage({ presentation: { ...stage.presentation, engine_continues } })}
            />
            <p className="text-[11px] leading-relaxed text-ink-3">
              {tr(
                '区間境界の計算上の停止・点火表示だけを省略します。推力・燃焼時刻の設定は変わりません。',
                'Hides only the synthetic stop/start at the interval boundary. Thrust and burn time settings are unchanged.',
              )}
            </p>
          </>
        )}
      </Group>

      <Group
        title={tr('質量と推進剤', 'Mass & propellant')}
        note={tr(
          '推進剤の量を入れると、推力と比推力から燃焼時間（燃焼終了時刻）が決まります。',
          'Entering a propellant mass sets the burn time (burnout time) from thrust and specific impulse.',
        )}
      >
        <NumberField
          label={tr('区間の割当質量', 'Interval allocated mass')}
          hint={tr(
            'この区間の割当質量（消費する推進剤・投棄物・残る機体部分を含む）。後続区間分は含みません。通常の直列段では段単体の初期質量です。',
            'Mass allocated to this interval, including consumed propellant, jettisons and the remaining vehicle part. Excludes later intervals. For an ordinary serial stage, this is its initial mass.',
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
          label={tr('この区間に推力がある', 'Thrust in this interval')}
          checked={!!engine}
          onChange={(on) => setStage({ engine: on ? createDefaultStage().engine : undefined })}
        />
        {engine && (
          <>
            <CurveField
              label={tr('推力（真空）', 'Thrust (vacuum)')}
              tableLabel={tr('推力を時刻テーブルで入力', 'Enter thrust as time table')}
              title={tr(
                `${phaseLabel(specs.presentation, idx + 1)}の推力テーブル`,
                `${phaseLabel(specs.presentation, idx + 1)} thrust table`,
              )}
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
              title={tr(
                `${phaseLabel(specs.presentation, idx + 1)}の比推力テーブル`,
                `${phaseLabel(specs.presentation, idx + 1)} Isp table`,
              )}
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
                `この区間は前区間の分離（T+${fmt(spec.start)} s）から始まり、時刻はそこからの経過秒で入力します。テーブルの時刻も同じです。`,
                `This interval starts at the previous interval’s separation (T+${fmt(spec.start)} s); enter times as seconds from then. Table times work the same way.`,
              )
        }
      >
        {engine && (
          <>
            <NumberField
              label={tr('区間内の推力開始', 'Thrust start in interval')}
              note={abs(engine.burn_start_s ?? 0)}
              unit="s"
              path={p('engine.burn_start_s')}
              value={engine.burn_start_s ?? 0}
              onChange={(v) => setEngine({ burn_start_s: v })}
            />
            <NumberField
              label={tr('区間内の推力終了', 'Thrust end in interval')}
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
          'フェアリングなど、この区間の飛行中に切り離す物体です。切り離した質量は機体から減り、物体は弾道係数で落下点まで計算します。',
          'Parts released during this calculation interval, such as a fairing. Their mass leaves the vehicle, and they are flown to the ground with their ballistic coefficient.',
        )}
      >
        {jettisons.map((j, k) => {
          const q = (key: string) => p(`jettisons[${k}].${key}`)
          return (
            <div key={k} className="mb-2 border-b border-line pb-2 last:border-b-0">
              <div className="flex min-h-8 items-center justify-between gap-2">
                <input
                  aria-label={tr('出力ID', 'Output ID')}
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
              <DisplayNameField
                label={tr('投棄物の表示名', 'Jettisoned body display name')}
                path={q('display_name')}
                value={j.display_name}
                placeholder={j.name || `jettison${k + 1}`}
                onChange={(display_name) => setJettison(k, { display_name })}
              />
              <NumberField
                label={tr('切り離し', 'Release')}
                note={abs(j.time_s)}
                hint={tr('この区間の開始からの秒', 'Seconds from the start of this interval')}
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
          'この区間の燃焼後の機体の飛び方です。分離後の物体は姿勢制御がないため、「指定姿勢」は「空力安定」として計算します。',
          'How the vehicle flies after burnout in this interval. Released bodies have no attitude control, so "commanded attitude" is flown as "aerodynamically stable".',
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
          <Trash2 className="h-3.5 w-3.5" />{' '}
          {tr(`${phaseLabel(specs.presentation, idx + 1)}を削除`, `Delete ${phaseLabel(specs.presentation, idx + 1)}`)}
        </button>
      )}
    </>
  )
}
