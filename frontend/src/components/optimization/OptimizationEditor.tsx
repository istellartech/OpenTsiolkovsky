import { useContext, type ReactNode } from 'react'
import { tr } from '../../lib/i18n'
import type { Bounds, MultiStageInput, OptimizationInput, SingleStageInput } from '../../lib/optimization-input'
import { isRocketInput, phaseViews } from '../../lib/optimization-input'
import { editStage, phaseLabel, vehicleMetrics, type StageField } from '../../lib/optimization-vehicle'
import { fmt } from '../../lib/format'
import { cn } from '../../lib/cn'
import { OptGroup, OptNumber, OptText } from './controls'
import { OptimizationEditorContext } from './editor-context'
import { SequenceTimeline } from './SequenceTimeline'

const grid = 'grid gap-x-3 gap-y-2 sm:grid-cols-2'
const grid3 = 'grid gap-x-3 gap-y-2 sm:grid-cols-3'
const grid4 = 'grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4'
type Rocket = MultiStageInput | SingleStageInput
const G0 = 9.80665

/** The settings form: essentials first, everything numerical in one collapsible block. */
export function OptimizationEditor({ input, onJson }: { input: OptimizationInput; onJson: () => void }) {
  const p = input.problem
  if (!isRocketInput(p)) return <BenchmarkFields input={input} onJson={onJson} />
  return (
    <div className="space-y-3">
      <MissionFields p={p} />
      <VehicleFields p={p} />
      <SequenceFields p={p} />
      <ConstraintFields p={p} />
      <details className="group rounded-[9px] border border-line bg-surface" data-opt-details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
          <span>
            <span className="block text-[13px] font-semibold">{tr('詳細設定', 'Advanced settings')}</span>
            <span className="mt-0.5 block text-[11px] text-ink-3">
              {tr(
                '打上げ日時・出典・エンジン形状・計算メッシュ・初期推定・ソルバー・検証の許容値。通常は変更不要です。',
                'Launch time, provenance, engine geometry, mesh, initial guess, solver and validation tolerances. Usually left unchanged.',
              )}
            </span>
          </span>
          <span className="text-[12px] text-ink-3 group-open:rotate-90">›</span>
        </summary>
        <div className="space-y-3 border-t border-line px-3 py-3 sm:px-4">
          <AdvancedFields input={input} p={p} onJson={onJson} />
        </div>
      </details>
    </div>
  )
}

function Step({ n, title, note, children }: { n: number; title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <OptGroup
      title={
        <span className="flex items-center gap-2">
          <span className="num flex h-4.5 w-4.5 items-center justify-center rounded-full bg-ink text-[10px] text-surface">{n}</span>
          {title}
        </span>
      }
      note={note}
    >
      {children}
    </OptGroup>
  )
}

/** Lower/upper bounds; the initial guess is clamped into them automatically. */
function RangeField({
  path,
  label,
  value,
  unit,
  hint,
  className,
}: {
  path: string
  label: string
  value: Bounds
  unit: string
  hint?: string
  className?: string
}) {
  const ctx = useContext(OptimizationEditorContext)
  const set = (key: 'lower' | 'upper', v: number) => {
    const next = { ...value, [key]: v }
    next.initial = Math.min(Math.max(value.initial, Math.min(next.lower, next.upper)), Math.max(next.lower, next.upper))
    ctx.edit(path, next)
  }
  return (
    <div data-opt-field={path} className={cn('min-w-0', className)}>
      <p className="mb-1 text-[11px] font-medium text-ink-2">{label}</p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-1.5 [&_label]:sr-only">
        <OptNumber path={`${path}.lower`} label={tr('下限', 'Min')} value={value.lower} unit={unit} onValue={(v) => set('lower', v)} />
        <span className="pt-1.5 text-ink-3">〜</span>
        <OptNumber path={`${path}.upper`} label={tr('上限', 'Max')} value={value.upper} unit={unit} onValue={(v) => set('upper', v)} />
      </div>
      {hint ? <p className="mt-0.5 text-[10px] leading-snug text-ink-3">{hint}</p> : null}
    </div>
  )
}

function MissionFields({ p }: { p: Rocket }) {
  return (
    <Step
      n={1}
      title={tr('目標と発射地点', 'Target and launch site')}
      note={
        p.kind === 'multi_stage'
          ? tr(
              '衛星分離直後に、指定した高度の円軌道・傾斜角に入れる中で、衛星の質量が最大になる飛び方を求めます。',
              'Find the flight that delivers the heaviest satellite into the specified circular orbit and inclination.',
            )
          : tr(
              '指定した頂点高度まで運べる追加ペイロードが最大になる飛び方を求めます。',
              'Find the flight that carries the most additional payload to the specified apogee.',
            )
      }
    >
      <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.6fr)]">
        {p.kind === 'multi_stage' ? (
          <>
            <OptNumber
              path="problem.orbit.altitude_m"
              label={tr('円軌道の高度', 'Circular-orbit altitude')}
              value={p.orbit.altitude_m}
              scale={1000}
              unit="km"
            />
            <OptNumber
              path="problem.orbit.inclination_deg"
              label={tr('軌道傾斜角', 'Inclination')}
              value={p.orbit.inclination_deg}
              unit="°"
            />
          </>
        ) : (
          <>
            <OptNumber
              path="problem.target_apogee_altitude_m"
              label={tr('目標の頂点高度', 'Target apogee')}
              value={p.target_apogee_altitude_m}
              scale={1000}
              unit="km"
            />
            <OptNumber
              path="problem.azimuth_deg"
              label={tr('発射方位角（固定）', 'Launch azimuth (fixed)')}
              value={p.azimuth_deg}
              unit="°"
            />
          </>
        )}
        <OptNumber
          path="problem.vehicle.launch.latitude_deg"
          label={tr('発射地点の緯度', 'Launch latitude')}
          value={p.vehicle.launch.latitude_deg}
          unit="°N"
        />
        <OptNumber
          path="problem.vehicle.launch.longitude_deg"
          label={tr('発射地点の経度', 'Launch longitude')}
          value={p.vehicle.launch.longitude_deg}
          unit="°E"
        />
        {p.kind === 'multi_stage' ? (
          <RangeField
            path="problem.net_payload_kg"
            className="lg:col-span-2 xl:col-span-1"
            label={tr('衛星質量を探す範囲', 'Satellite mass search range')}
            value={p.net_payload_kg}
            unit="kg"
            hint={tr(
              'PAF（衛星分離機構）は含まない。結果が端に張り付いたら広げる。',
              'Excludes the payload adapter. Widen it if the result sits at an end.',
            )}
          />
        ) : (
          <RangeField
            path="problem.additional_payload_kg"
            className="lg:col-span-2 xl:col-span-1"
            label={tr('追加ペイロードを探す範囲', 'Additional payload search range')}
            value={p.additional_payload_kg}
            unit="kg"
          />
        )}
      </div>
    </Step>
  )
}

function VehicleFields({ p }: { p: Rocket }) {
  const ctx = useContext(OptimizationEditorContext)
  const metrics = vehicleMetrics(p)
  const multi = p.kind === 'multi_stage'
  const stageEdit = (i: number, field: StageField) => (v: number) => ctx.replace((input) => editStage(input, i, field, v))
  const rows: {
    label: string
    unit: string
    scale?: number
    path: (i: number) => string
    value: (i: number) => number
    field?: StageField
    hint?: string
  }[] = multi
    ? [
        {
          label: tr('乾燥質量', 'Dry mass'),
          unit: 'kg',
          path: (i) => `problem.stages.${i}.dry_kg`,
          value: (i) => p.stages[i].dry_kg,
          field: 'dry_kg',
        },
        {
          label: tr('推進剤', 'Propellant'),
          unit: 'kg',
          path: (i) => `problem.stages.${i}.propellant_kg`,
          value: (i) => p.stages[i].propellant_kg,
          field: 'propellant_kg',
        },
        {
          label: tr('うち予備（残す量）', 'of which reserve'),
          unit: 'kg',
          path: (i) => `problem.stages.${i}.reserve_kg`,
          value: (i) => p.stages[i].reserve_kg,
          field: 'reserve_kg',
        },
        {
          label: tr('真空推力', 'Vacuum thrust'),
          unit: 'kN',
          scale: 1000,
          path: (i) => `problem.vehicle.stages.${i}.engine.thrust_vac_n`,
          value: (i) => Number(p.vehicle.stages[i].engine?.thrust_vac_n ?? 0),
          field: 'thrust_vac_n',
        },
        {
          label: tr('真空比推力 Isp', 'Vacuum Isp'),
          unit: 's',
          path: (i) => `problem.vehicle.stages.${i}.engine.isp_vac_s`,
          value: (i) => Number(p.vehicle.stages[i].engine?.isp_vac_s ?? 0),
          field: 'isp_vac_s',
        },
      ]
    : [
        {
          label: tr('乾燥質量（既存搭載物込み）', 'Dry mass (incl. existing payload)'),
          unit: 'kg',
          path: () => 'problem.dry_mass_kg',
          value: () => p.dry_mass_kg,
        },
        { label: tr('推進剤', 'Propellant'), unit: 'kg', path: () => 'problem.propellant_mass_kg', value: () => p.propellant_mass_kg },
        {
          label: tr('うち予備（残す量）', 'of which reserve'),
          unit: 'kg',
          path: () => 'problem.reserve_propellant_kg',
          value: () => p.reserve_propellant_kg,
        },
      ]
  const stages = metrics.stages
  return (
    <Step
      n={2}
      title={tr('機体', 'Vehicle')}
      note={
        multi
          ? tr(
              '各段の質量とエンジン性能。燃焼できる時間・全備質量・Δvは自動で計算し、燃焼時間の上限やシーケンスにも反映します。',
              'Stage masses and engine performance. Burn time, wet mass and Δv are derived automatically and applied to the burn limits and sequence.',
            )
          : tr('MOMOのエンジン推力・燃焼時間は実績データを固定で使います。', 'MOMO engine thrust and burn time use fixed flight data.')
      }
    >
      <div className="grid gap-4">
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[420px] border-separate border-spacing-y-0.5 text-left text-[12px]">
            <thead>
              <tr className="text-[11px] text-ink-3">
                <th className="w-[38%] font-normal" />
                {stages.map((_, i) => (
                  <th key={i} className="px-1 font-medium text-ink-2">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: `var(--stage-${(i % 5) + 1})` }}
                    />
                    {tr(`第${i + 1}段`, `Stage ${i + 1}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <th className="pr-2 align-middle font-normal text-ink-2">{row.label}</th>
                  {stages.map((_, i) => (
                    <td key={i} className="px-1">
                      <CompactNumber
                        path={row.path(i)}
                        label={`${row.label} ${tr(`第${i + 1}段`, `stage ${i + 1}`)}`}
                        value={row.value(i)}
                        unit={row.unit}
                        scale={row.scale}
                        onValue={row.field ? stageEdit(i, row.field) : undefined}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <Derived label={tr('全備質量（段単体）', 'Stage wet mass')} values={stages.map((s) => `${fmt(s.wet, 0)} kg`)} />
              {multi ? (
                <>
                  <Derived label={tr('燃焼できる時間', 'Available burn time')} values={stages.map((s) => `${fmt(s.burnLimit, 1)} s`)} />
                  <Derived
                    label={tr('推力重量比（着火時）', 'Thrust/weight at ignition')}
                    values={stages.map((s, i) => fmt(s.thrustToWeight, 2) + (i === 0 ? tr('（地上）', ' (SL)') : ''))}
                    warn={stages.map((s, i) => (i === 0 ? s.thrustToWeight < 1.15 : s.thrustToWeight < 0.4))}
                  />
                  <Derived
                    label={tr('理想Δv（損失なし）', 'Ideal Δv (lossless)')}
                    values={stages.map((s) => `${fmt(s.idealDeltaV, 0)} m/s`)}
                  />
                </>
              ) : null}
            </tbody>
          </table>
          {multi ? (
            <div className={cn(grid4, 'mt-2')}>
              <OptNumber path="problem.fairing_kg" label={tr('フェアリング', 'Fairing')} value={p.fairing_kg} unit="kg" />
              <OptNumber
                path="problem.payload_adapter_kg"
                label={tr('衛星分離機構（PAF）', 'Payload adapter (PAF)')}
                value={p.payload_adapter_kg}
                unit="kg"
              />
            </div>
          ) : null}
        </div>
        <div className="xl:hidden">
          <VehicleSummary p={p} />
        </div>
      </div>
    </Step>
  )
}

function CompactNumber(props: { path: string; label: string; value: number; unit: string; scale?: number; onValue?: (v: number) => void }) {
  return (
    <div className="[&_label]:sr-only">
      <OptNumber {...props} />
    </div>
  )
}
function Derived({ label, values, warn }: { label: string; values: string[]; warn?: boolean[] }) {
  return (
    <tr className="text-[11px]">
      <th className="pr-2 font-normal text-ink-3">{label}</th>
      {values.map((v, i) => (
        <td key={i} className={cn('num px-3', warn?.[i] ? 'text-danger' : 'text-ink-2')}>
          {v}
        </td>
      ))}
    </tr>
  )
}

export function VehicleSummary({ p }: { p: Rocket }) {
  const m = vehicleMetrics(p)
  const parts =
    p.kind === 'multi_stage'
      ? [
          ...m.stages.map((s, i) => ({ label: tr(`第${i + 1}段`, `Stage ${i + 1}`), value: s.wet, color: `var(--stage-${(i % 5) + 1})` })),
          { label: tr('フェアリング・PAF', 'Fairing / PAF'), value: p.fairing_kg + p.payload_adapter_kg, color: 'var(--ink-3)' },
          { label: tr('衛星（初期推定）', 'Satellite (guess)'), value: m.payload, color: 'var(--ok)' },
        ]
      : [
          { label: tr('機体', 'Vehicle'), value: m.stages[0]?.wet ?? 0, color: 'var(--stage-1)' },
          { label: tr('追加ペイロード（初期推定）', 'Extra payload (guess)'), value: m.payload, color: 'var(--ok)' },
        ]
  return (
    <aside className="rounded-[8px] border border-line bg-surface-2 p-3 text-[12px]">
      <p className="text-[11px] text-ink-3">{tr('全備質量（打上げ時）', 'Launch mass')}</p>
      <p className="num text-[22px] font-medium">
        {fmt(m.launchMass / 1000, 2)} <span className="text-[12px] font-normal text-ink-3">t</span>
      </p>
      <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
        {parts.map((part) => (
          <span
            key={part.label}
            style={{ width: `${(Math.max(0, part.value) / Math.max(1, m.launchMass)) * 100}%`, background: part.color }}
          />
        ))}
      </div>
      <dl className="mt-2 space-y-1 text-[11px]">
        {parts.map((part) => (
          <div key={part.label} className="flex justify-between gap-2">
            <dt className="flex items-center gap-1.5 text-ink-3">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: part.color }} />
              {part.label}
            </dt>
            <dd className="num text-ink-2">{fmt(part.value, 0)} kg</dd>
          </div>
        ))}
      </dl>
      {p.kind === 'multi_stage' ? (
        <dl className="mt-3 space-y-1 border-t border-line pt-2 text-[11px]">
          <div className="flex justify-between">
            <dt className="text-ink-3">{tr('理想Δv合計', 'Total ideal Δv')}</dt>
            <dd className="num text-ink-2">{fmt(m.idealDeltaV, 0)} m/s</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-3">{tr('ペイロード比（初期推定）', 'Payload fraction (guess)')}</dt>
            <dd className="num text-ink-2">{fmt(m.payloadFraction * 100, 2)} %</dd>
          </div>
          <p className="pt-1 leading-relaxed text-ink-3">
            {tr(
              '低軌道には損失込みで約9.3〜9.8 km/sが目安です（理想Δvは重力・空気抵抗損失を含みません）。',
              'Low Earth orbit typically needs about 9.3–9.8 km/s including losses (ideal Δv excludes gravity and drag losses).',
            )}
          </p>
        </dl>
      ) : null}
    </aside>
  )
}

function DurationControl({ path, value, fixedOnly }: { path: string; value: Bounds; fixedOnly: boolean }) {
  const ctx = useContext(OptimizationEditorContext)
  const fixed = value.lower === value.upper
  return (
    <div className="flex flex-wrap items-end gap-2" data-opt-field={path}>
      {fixed ? (
        <div className="w-32 [&_label]:sr-only">
          <OptNumber
            path={`${path}.initial`}
            label={tr('継続時間', 'Duration')}
            value={value.initial}
            unit="s"
            onValue={(v) => ctx.edit(path, { initial: v, lower: v, upper: v })}
          />
        </div>
      ) : (
        <div className="grid w-[17rem] grid-cols-[1fr_auto_1fr] items-center gap-1.5 [&_label]:sr-only">
          <OptNumber
            path={`${path}.lower`}
            label={tr('下限', 'Min')}
            value={value.lower}
            unit="s"
            onValue={(v) => ctx.edit(path, { lower: v, upper: value.upper, initial: Math.min(Math.max(value.initial, v), value.upper) })}
          />
          <span className="text-ink-3">〜</span>
          <OptNumber
            path={`${path}.upper`}
            label={tr('上限', 'Max')}
            value={value.upper}
            unit="s"
            onValue={(v) => ctx.edit(path, { lower: value.lower, upper: v, initial: Math.min(Math.max(value.initial, value.lower), v) })}
          />
        </div>
      )}
      {!fixedOnly ? (
        <button
          type="button"
          disabled={ctx.disabled}
          className="min-h-9 rounded-[6px] px-2 text-[11px] text-ink-2 underline underline-offset-2 hover:text-ink disabled:opacity-40"
          onClick={() => {
            ctx.setField(`${path}.lower`, null)
            ctx.setField(`${path}.upper`, null)
            ctx.setField(`${path}.initial`, null)
            ctx.edit(
              path,
              fixed
                ? { initial: value.initial, lower: Math.max(0.1, Math.round(value.initial * 0.5)), upper: Math.round(value.initial * 1.5) }
                : { initial: value.initial, lower: value.initial, upper: value.initial },
            )
          }}
        >
          {fixed ? tr('範囲で最適化する', 'Optimize within a range') : tr('固定する', 'Fix')}
        </button>
      ) : null}
    </div>
  )
}

function SequenceFields({ p }: { p: Rocket }) {
  const phases = phaseViews(p)
  return (
    <Step
      n={3}
      title={tr('飛行シーケンス', 'Flight sequence')}
      note={tr(
        '各区間の時間です。「範囲で最適化」にした区間は、範囲の中で最適な長さを求めます。帯の長さは初期推定の値です。',
        'Duration of each segment. Segments set to “optimize within a range” get their best length inside it. Bar widths show the initial guess.',
      )}
    >
      <SequenceTimeline phases={phases} compact />
      {p.kind === 'multi_stage' ? (
        <ol className="divide-y divide-line rounded-[8px] border border-line">
          {p.phases.map((phase, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-1">
              <span className="flex min-w-0 items-center gap-2 text-[12px]">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: `var(--stage-${(phase.stage % 5) + 1})`, opacity: phase.mode === 'burn' ? 1 : 0.35 }}
                />
                <span className="min-w-0">
                  <span className="font-medium">{phaseLabel(p.phases, i)}</span>
                  <span className="ml-2 text-[10px] text-ink-3">
                    {phase.duration_s.lower === phase.duration_s.upper
                      ? tr('時間固定', 'Fixed duration')
                      : tr('時間を最適化', 'Optimized duration')}
                  </span>
                </span>
              </span>
              <DurationControl path={`problem.phases.${i}.duration_s`} value={phase.duration_s} fixedOnly={phase.vertical} />
            </li>
          ))}
        </ol>
      ) : (
        <div className={grid}>
          <OptNumber path="problem.vertical_ascent_s" label={tr('垂直上昇の時間', 'Vertical rise')} value={p.vertical_ascent_s} unit="s" />
          <RangeField
            path="problem.coast_duration_s"
            label={tr('燃焼終了から頂点までの時間', 'Coast to apogee')}
            value={p.coast_duration_s}
            unit="s"
          />
        </div>
      )}
    </Step>
  )
}

function ConstraintFields({ p }: { p: Rocket }) {
  const ctx = useContext(OptimizationEditorContext)
  return (
    <Step
      n={4}
      title={tr('守る条件（制約）', 'Limits to respect (constraints)')}
      note={tr(
        '最適化はこれらを必ず守ります。厳しくするとペイロードは減ります。結果画面で、どの条件がペイロードを制限したかを確認できます。',
        'The optimizer always respects these. Tighter limits reduce payload. The results show which limits constrained the payload.',
      )}
    >
      <LimitRow
        title={tr('最大動圧', 'Max dynamic pressure')}
        help={tr(
          '空気から受ける圧力（½×空気密度×速度²）の上限。上昇中の構造荷重を抑えます。',
          'Upper limit on ½·air density·speed². Keeps ascent structural loads down.',
        )}
      >
        <OptNumber
          path="problem.max_dynamic_pressure_pa"
          label={tr('最大動圧', 'Max dynamic pressure')}
          value={p.max_dynamic_pressure_pa}
          scale={1000}
          unit="kPa"
        />
      </LimitRow>
      {p.kind === 'multi_stage' ? (
        <>
          <div>
            <p className="text-[12px] font-medium">{tr('区間ごとの上限', 'Per-segment limits')}</p>
            <p className="mt-0.5 text-[10px] leading-snug text-ink-3">
              {tr(
                '迎角：機体の向きと気流のずれ（空気力による横向き荷重）。加速度：推力・空気力による加速度（重力を除く、1 G = 9.81 m/s²）。最低高度：地面・大気への余裕。',
                'Angle of attack: body axis vs. airflow (side load). Acceleration: from thrust and aerodynamics, gravity excluded (1 G = 9.81 m/s²). Minimum altitude: clearance.',
              )}
            </p>
            <div className="mt-1 overflow-x-auto">
              <table className="w-full min-w-[560px] border-separate border-spacing-y-0.5 text-left text-[12px]">
                <thead>
                  <tr className="text-[11px] text-ink-3">
                    <th className="font-normal">{tr('区間', 'Segment')}</th>
                    <th className="px-1 font-normal">{tr('最大迎角', 'Max AoA')}</th>
                    <th className="px-1 font-normal">{tr('最大加速度', 'Max accel.')}</th>
                    <th className="px-1 font-normal">{tr('最低高度', 'Min altitude')}</th>
                  </tr>
                </thead>
                <tbody>
                  {p.phases.map((phase, i) => (
                    <tr key={i}>
                      <th className="pr-2 font-normal text-ink-2">{phaseLabel(p.phases, i)}</th>
                      <td className="w-28 px-1 [&_label]:sr-only">
                        <OptNumber
                          path={`problem.phases.${i}.max_angle_of_attack_deg`}
                          label={tr('最大迎角', 'Max AoA')}
                          value={phase.max_angle_of_attack_deg}
                          unit="°"
                        />
                      </td>
                      <td className="w-28 px-1 [&_label]:sr-only">
                        <OptNumber
                          path={`problem.phases.${i}.max_specific_force_m_s2`}
                          label={tr('最大加速度', 'Max acceleration')}
                          value={phase.max_specific_force_m_s2}
                          scale={G0}
                          unit="G"
                        />
                      </td>
                      <td className="w-32 px-1 [&_label]:sr-only">
                        <OptNumber
                          path={`problem.phases.${i}.min_altitude_m`}
                          label={tr('最低高度', 'Min altitude')}
                          value={phase.min_altitude_m}
                          scale={1000}
                          unit="km"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <LimitRow
            title={tr('姿勢を変える速さ', 'Attitude rates')}
            help={tr(
              '姿勢（方位角・仰角）を1秒あたり何度まで変えてよいか。機体軸そのものの回転速度にも上限を設けます。',
              'How many degrees per second azimuth and elevation may change, plus a limit on the body axis rotation itself.',
            )}
          >
            <div className={grid3}>
              <OptNumber
                path="problem.max_azimuth_rate_deg_s"
                label={tr('方位角', 'Azimuth')}
                value={p.max_azimuth_rate_deg_s}
                unit="°/s"
              />
              <OptNumber
                path="problem.max_elevation_rate_deg_s"
                label={tr('仰角', 'Elevation')}
                value={p.max_elevation_rate_deg_s}
                unit="°/s"
              />
              <OptNumber
                path="problem.max_inertial_direction_rate_deg_s"
                label={tr('機体軸の回転', 'Body-axis rotation')}
                value={p.max_inertial_direction_rate_deg_s}
                unit="°/s"
              />
            </div>
          </LimitRow>
          <LimitRow
            title={tr('姿勢の範囲', 'Attitude range')}
            help={tr(
              '方位角は北から時計回り（90°が東）。仰角は水平からの角度で、上限は真上（90°）です。',
              'Azimuth from north, clockwise (90° = east). Elevation from the horizontal; the maximum is straight up (90°).',
            )}
          >
            <div className={grid3}>
              {[0, 1].map((axis) => (
                <OptNumber
                  key={axis}
                  path={`problem.azimuth_bounds_deg.${axis}`}
                  label={axis === 0 ? tr('方位角の最小', 'Min azimuth') : tr('方位角の最大', 'Max azimuth')}
                  value={p.azimuth_bounds_deg[axis]}
                  unit="°"
                />
              ))}
              <OptNumber
                path="problem.elevation_bounds_deg.0"
                label={tr('仰角の最小', 'Min elevation')}
                value={p.elevation_bounds_deg[0]}
                unit="°"
              />
            </div>
          </LimitRow>
          <LimitRow
            title={tr('フェアリング投棄', 'Fairing jettison')}
            help={tr(
              '空力加熱を避けるため、この高度より上で投棄します（熱流束そのものは評価していません）。',
              'Jettison above this altitude to avoid aerodynamic heating (heat flux itself is not evaluated).',
            )}
          >
            <div className={grid}>
              <OptNumber
                path="problem.fairing_release_min_altitude_m"
                label={tr('投棄できる最低高度', 'Minimum release altitude')}
                value={p.fairing_release_min_altitude_m}
                scale={1000}
                unit="km"
              />
            </div>
          </LimitRow>
          <p className="text-[11px] leading-relaxed text-ink-3">
            {tr(
              '予備推進剤と着火回数（機体・詳細設定）も条件として守ります。熱・落下域・分離時の相対運動・6自由度の姿勢運動は評価していません。',
              'Propellant reserves and ignition counts (vehicle / advanced settings) are also enforced. Heating, debris regions, separation dynamics and 6-DoF attitude motion are not evaluated.',
            )}
          </p>
        </>
      ) : (
        <div className={grid}>
          <OptNumber
            path="problem.max_angle_of_attack_deg"
            label={tr('最大迎角', 'Max angle of attack')}
            value={p.max_angle_of_attack_deg}
            unit="°"
          />
          <OptNumber
            path="problem.max_specific_force_m_s2"
            label={tr('最大加速度（重力を除く）', 'Max acceleration (gravity excluded)')}
            value={p.max_specific_force_m_s2}
            scale={G0}
            unit="G"
          />
          <OptNumber
            path="problem.max_pitch_rate_deg_s"
            label={tr('仰角を変える速さの上限', 'Max elevation rate')}
            value={p.max_pitch_rate_deg_s}
            unit="°/s"
          />
          <OptNumber path="problem.minimum_pitch_deg" label={tr('仰角の最小', 'Min elevation')} value={p.minimum_pitch_deg} unit="°" />
          <OptNumber
            path="problem.minimum_downrange_m"
            label={tr('射向への最小飛行距離', 'Minimum downrange')}
            value={p.minimum_downrange_m}
            scale={1000}
            unit="km"
          />
        </div>
      )}
      {ctx.disabled ? (
        <p className="text-[11px] text-ink-3">{tr('実行中は入力を変更できません。', 'Inputs are locked during a run.')}</p>
      ) : null}
    </Step>
  )
}
function LimitRow({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-4">
      <div>
        <p className="text-[12px] font-medium">{title}</p>
        <p className="mt-0.5 text-[10px] leading-snug text-ink-3">{help}</p>
      </div>
      <div className="min-w-0 max-w-xl">{children}</div>
    </div>
  )
}

function AdvancedFields({ input, p, onJson }: { input: OptimizationInput; p: Rocket; onJson: () => void }) {
  return (
    <>
      <Sub title={tr('打上げ条件と出典', 'Launch details and provenance')}>
        <OptText path="problem.vehicle.name" label={tr('ケース名', 'Case name')} value={p.vehicle.name} />
        <div className={grid}>
          <OptNumber
            path="problem.vehicle.launch.altitude_m"
            label={tr('発射地点の標高', 'Launch-site elevation')}
            value={p.vehicle.launch.altitude_m ?? 0}
            unit="m"
          />
          <OptText
            path="problem.vehicle.launch.time_utc"
            label={tr('打上げ日時（UTC）', 'Launch time (UTC)')}
            value={p.vehicle.launch.time_utc ?? '2000-01-01T00:00:00Z'}
            hint={tr('例：2026-10-19T00:00:00Z', 'Example: 2026-10-19T00:00:00Z')}
          />
        </div>
        <OptText
          path="problem.data_source"
          label={tr('データの出典・仮定', 'Data sources and assumptions')}
          value={p.data_source}
          multiline
        />
      </Sub>
      <Sub title={tr('エンジン・空力の形状', 'Engine and aerodynamic geometry')}>
        {p.vehicle.stages.map((stage, i) => (
          <div key={i} className={grid3}>
            <OptNumber
              path={`problem.vehicle.stages.${i}.engine.nozzle_exit_area_m2`}
              label={tr(`第${i + 1}段 ノズル出口面積`, `Stage ${i + 1} nozzle exit area`)}
              value={stage.engine?.nozzle_exit_area_m2 ?? 0}
              unit="m²"
              hint={
                i === 0
                  ? tr('地上では推力が出口面積×大気圧だけ減ります。', 'Sea-level thrust drops by exit area × ambient pressure.')
                  : undefined
              }
            />
            <OptNumber
              path={`problem.vehicle.stages.${i}.aero.diameter_m`}
              label={tr(`第${i + 1}段 代表直径`, `Stage ${i + 1} reference diameter`)}
              value={stage.aero?.diameter_m ?? 0.5}
              unit="m"
            />
            {p.kind === 'multi_stage' && p.stages[i] ? (
              <OptNumber
                path={`problem.stages.${i}.max_ignitions`}
                label={tr(`第${i + 1}段 着火回数の上限`, `Stage ${i + 1} max ignitions`)}
                value={p.stages[i].max_ignitions}
                integer
              />
            ) : null}
          </div>
        ))}
        {p.kind === 'multi_stage' ? (
          <OptNumber
            path="problem.fairing_off_area_scale"
            label={tr('フェアリング投棄後の空力面積倍率', 'Aerodynamic area scale after fairing jettison')}
            value={p.fairing_off_area_scale}
            unit="×"
          />
        ) : null}
      </Sub>
      <Sub
        title={tr('計算メッシュ', 'Computation mesh')}
        note={tr(
          '軌道を区間に分け、各区間を多項式で近似します。区間を増やすと精度が上がり、計算は遅くなります。結果の検証が不合格なら増やしてください。',
          'The trajectory is split into intervals, each approximated by a polynomial. More intervals are more accurate and slower. Increase them if validation fails.',
        )}
      >
        <OptNumber path="problem.degree" label={tr('多項式の次数（3〜8）', 'Polynomial degree (3–8)')} value={p.degree} integer />
        <div className={grid4}>
          {p.kind === 'multi_stage' ? (
            p.phases.map((phase, i) => (
              <OptNumber key={i} path={`problem.phases.${i}.intervals`} label={phaseLabel(p.phases, i)} value={phase.intervals} integer />
            ))
          ) : (
            <>
              <OptNumber path="problem.burn_intervals" label={tr('燃焼の区間数', 'Burn intervals')} value={p.burn_intervals} integer />
              <OptNumber path="problem.coast_intervals" label={tr('惰行の区間数', 'Coast intervals')} value={p.coast_intervals} integer />
            </>
          )}
        </div>
      </Sub>
      <Sub
        title={tr('初期推定（最適化の出発点）', 'Initial guess (starting point)')}
        note={tr(
          '各区間の終わりの姿勢の目安。最適解である必要はありませんが、大きく外れると収束しにくくなります。',
          'Rough attitude at the end of each segment. It need not be optimal, but a poor guess slows or prevents convergence.',
        )}
      >
        {p.kind === 'multi_stage' ? (
          <>
            <OptNumber
              path="problem.initial_azimuth_deg"
              label={tr('打上げ方位角の初期値', 'Initial launch azimuth')}
              value={p.initial_azimuth_deg}
              unit="°"
            />
            {p.phases.map((phase, i) =>
              phase.vertical ? null : (
                <div key={i} className={grid3}>
                  <p className="self-center text-[12px] text-ink-2">{phaseLabel(p.phases, i)}</p>
                  <OptNumber
                    path={`problem.phases.${i}.initial_attitude_end_deg.0`}
                    label={tr('方位角', 'Azimuth')}
                    value={phase.initial_attitude_end_deg[0]}
                    unit="°"
                  />
                  <OptNumber
                    path={`problem.phases.${i}.initial_attitude_end_deg.1`}
                    label={tr('仰角', 'Elevation')}
                    value={phase.initial_attitude_end_deg[1]}
                    unit="°"
                  />
                </div>
              ),
            )}
            <InitialGuessFields p={p} />
          </>
        ) : (
          <OptNumber
            path="problem.initial_pitch_end_deg"
            label={tr('燃焼終了時の仰角', 'Elevation at burnout')}
            value={p.initial_pitch_end_deg}
            unit="°"
          />
        )}
      </Sub>
      <Sub title={tr('ソルバー', 'Solver')}>
        <SolverFields input={input} />
        <OptNumber
          path="problem.vehicle.simulation.end_time_s"
          label={tr('計算時間の上限', 'Simulation time horizon')}
          value={p.vehicle.simulation.end_time_s}
          unit="s"
        />
      </Sub>
      <Sub
        title={tr('検証の許容値', 'Validation tolerances')}
        note={tr(
          '最適化後に制御を独立に積分し直し、最適化の軌道との差や制約の超過がこの値以内かを確認します。物理的な上限を緩める設定ではありません。',
          'After solving, the controls are reintegrated independently; differences and limit excesses must stay within these. They do not relax physical limits.',
        )}
      >
        <div className={grid4}>
          {(
            [
              ['position_m', tr('位置', 'Position'), 'm'],
              ['velocity_m_s', tr('速度', 'Velocity'), 'm/s'],
              ['mass_kg', tr('質量', 'Mass'), 'kg'],
              ['dynamic_pressure_pa', tr('動圧', 'Dynamic pressure'), 'Pa'],
              ['angle_of_attack_deg', tr('迎角', 'Angle of attack'), '°'],
              ['specific_force_m_s2', tr('加速度', 'Acceleration'), 'm/s²'],
              ['pitch_rate_deg_s', tr('姿勢レート', 'Attitude rate'), '°/s'],
            ] as const
          ).map(([key, label, unit]) => (
            <OptNumber key={key} path={`problem.validation.${key}`} label={label} unit={unit} value={p.validation[key]} />
          ))}
        </div>
        {p.kind === 'multi_stage' ? (
          <div className={grid4}>
            {(
              [
                ['radius_tolerance_m', tr('投入半径', 'Insertion radius'), 'm'],
                ['speed_tolerance_m_s', tr('投入速度', 'Insertion speed'), 'm/s'],
                ['radial_velocity_tolerance_m_s', tr('上下方向速度', 'Radial speed'), 'm/s'],
                ['inclination_tolerance_deg', tr('傾斜角', 'Inclination'), '°'],
                ['apsis_tolerance_m', tr('近地点・遠地点', 'Perigee / apogee'), 'm'],
              ] as const
            ).map(([key, label, unit]) => (
              <OptNumber key={key} path={`problem.orbit.${key}`} label={label} value={p.orbit[key]} unit={unit} />
            ))}
          </div>
        ) : null}
      </Sub>
      <button type="button" className="text-[12px] text-ink-2 underline underline-offset-2" onClick={onJson}>
        {tr('JSONで全設定を直接編集する', 'Edit the full input as JSON')}
      </button>
    </>
  )
}
function InitialGuessFields({ p }: { p: MultiStageInput }) {
  const ctx = useContext(OptimizationEditorContext)
  const b = p.net_payload_kg
  return (
    <div className={grid}>
      <OptNumber
        path="problem.net_payload_kg.initial"
        label={tr('衛星質量の初期推定', 'Satellite mass guess')}
        value={b.initial}
        unit="kg"
        onValue={(v) => ctx.edit('problem.net_payload_kg', { ...b, initial: Math.min(Math.max(v, b.lower), b.upper) })}
      />
    </div>
  )
}
function Sub({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
      <div>
        <h4 className="text-[13px] font-semibold">{title}</h4>
        {note ? <p className="mt-0.5 text-[10px] leading-snug text-ink-3">{note}</p> : null}
      </div>
      {children}
    </section>
  )
}

function BenchmarkFields({ input, onJson }: { input: OptimizationInput; onJson: () => void }) {
  const p = input.problem
  if (p.kind === 'double_integrator')
    return (
      <OptGroup
        title={tr('二重積分器（数値ベンチマーク）', 'Double integrator (numerical benchmark)')}
        note={tr(
          '重力・空力・推進剤を含まない、解析解のある試験問題です。',
          'A test problem with an analytic solution; no gravity, aerodynamics or propellant.',
        )}
      >
        <div className={grid}>
          <OptNumber path="problem.distance_m" label={tr('移動距離', 'Distance')} value={p.distance_m} unit="m" />
          <OptNumber path="problem.time_cost" label={tr('時間コスト', 'Time cost')} value={p.time_cost} />
        </div>
        <RangeField path="problem.duration_s" label={tr('終端時刻', 'Final time')} value={p.duration_s} unit="s" />
        <div className={grid}>
          <OptNumber path="problem.intervals" label={tr('区間数', 'Intervals')} value={p.intervals} integer />
          <OptNumber path="problem.degree" label={tr('次数', 'Degree')} value={p.degree} integer />
        </div>
        <SolverFields input={input} />
      </OptGroup>
    )
  return (
    <OptGroup
      title={p.kind === 'zero' ? tr('ZEROのテンプレート', 'ZERO template') : tr('HS071（接続試験）', 'HS071 (connection test)')}
      note={
        p.kind === 'zero'
          ? tr(
              '機体・運用データと対応する計算モデルが未整備のため実行できません。仮定した2段機を選んでください。',
              'Vehicle/operations data and a matching model are not available yet. Select an assumed two-stage vehicle.',
            )
          : tr('既知解を持つ小さな制約付き問題でソルバーを確認します。', 'A small constrained problem with a known solution.')
      }
    >
      {p.kind === 'hs071' ? <SolverFields input={input} /> : null}
      <button type="button" className="text-[12px] underline" onClick={onJson}>
        {tr('JSONを確認', 'Inspect JSON')}
      </button>
    </OptGroup>
  )
}
function SolverFields({ input }: { input: OptimizationInput }) {
  const ctx = useContext(OptimizationEditorContext)
  return (
    <>
      <div className={grid}>
        <OptNumber
          path="solver.max_iterations"
          label={tr('最大反復数', 'Maximum iterations')}
          value={input.solver?.max_iterations ?? 300}
          integer
        />
        <OptNumber path="solver.tolerance" label={tr('収束の許容値', 'Convergence tolerance')} value={input.solver?.tolerance ?? 1e-8} />
      </div>
      <label className="flex min-h-9 items-center gap-2 text-[12px] text-ink-2">
        <input
          type="checkbox"
          checked={input.solver?.derivative_test ?? false}
          disabled={ctx.disabled}
          onChange={(event) => ctx.edit('solver.derivative_test', event.target.checked)}
          className="accent-[var(--signal)]"
        />
        {tr('求解前に一次微分を検査する（開発用）', 'Check first derivatives before solving (development)')}
      </label>
    </>
  )
}
export function endEventLabel(event: string): string {
  const labels: Record<string, string> = {
    none: tr('なし', 'None'),
    separate_stage: tr('段分離', 'Stage separation'),
    jettison_fairing: tr('フェアリング投棄', 'Fairing jettison'),
    deploy_payload: tr('衛星分離', 'Payload deployment'),
  }
  return labels[event] ?? event
}
