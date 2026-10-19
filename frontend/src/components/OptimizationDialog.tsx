import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './primitives'
import { useOptimization } from '../hooks/useOptimization'
import { tr } from '../lib/i18n'
import { fileBase, saveFile } from '../lib/download'
import { refineFlightMesh } from '../lib/optimization'
import { MultiStageReport, PhysicalChecks, TrajectoryChart } from './OptimizationReport'
import type { OptimizationResult } from '../lib/optimization'
import hs071 from '../../../examples/optimization/hs071.json?raw'
import doubleIntegrator from '../../../examples/optimization/double_integrator.json?raw'
import momo from '../../../examples/optimization/momo_single_stage.json?raw'
import momoCoarse from '../../../examples/optimization/momo_single_stage_coarse.json?raw'
import multiStage from '../../../examples/optimization/two_stage_500km_43deg.json?raw'
import multiStageCoarse from '../../../examples/optimization/two_stage_500km_43deg_coarse.json?raw'
import zero from '../../../examples/optimization/zero_500km_43deg.json?raw'

const presets = {
  multi_stage: multiStage,
  multi_stage_coarse: multiStageCoarse,
  single_stage: momo,
  single_stage_coarse: momoCoarse,
  double_integrator: doubleIntegrator,
  hs071,
  zero,
}
const number = (value: number | undefined) => (value === undefined ? '—' : value.toPrecision(8))
const button = 'rounded-[6px] border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink hover:border-line-strong disabled:opacity-40'

export function OptimizationDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [input, setInput] = useState(momo)
  const [preset, setPreset] = useState<keyof typeof presets | 'custom'>('single_stage')
  const opt = useOptimization()
  const [showVariables, setShowVariables] = useState(false)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const latest = opt.results[0]
  const trajectory = latest?.validation?.trajectory
  const flight = latest?.validation?.flight
  const multi = latest?.validation?.multi_stage
  const [refineError, setRefineError] = useState<string | null>(null)
  const refine = () => {
    try {
      const next = refineFlightMesh(input)
      setRefineError(null)
      setInput(next)
      setPreset('custom')
      opt.run(next)
    } catch (error) {
      setRefineError(String(error))
    }
  }
  const statusLabels = {
    idle: tr('待機', 'Ready'),
    loading: tr('最適化WASM読込', 'Loading optimizer WASM'),
    solving: tr('求解・数値検証', 'Solving and validating'),
    done: tr('求解終了', 'Solve finished'),
    cancelled: tr('中断（途中解は保存されません）', 'Cancelled (no intermediate solution saved)'),
    error: tr('入力・実行エラー', 'Input or execution error'),
  }
  const rows: { label: string; read: (result: OptimizationResult) => string }[] = [
    {
      label: tr('メッシュ（区間数 / 次数）', 'Mesh (intervals / degree)'),
      read: (r) => {
        const p = r.input.problem
        return p.kind === 'single_stage'
          ? `${p.burn_intervals}+1 ${tr('燃焼', 'burn')} + ${p.coast_intervals} ${tr('惰行', 'coast')} / ${p.degree}`
          : p.kind === 'multi_stage'
            ? `${p.phases?.map((phase) => phase.intervals).join('+')} / ${p.degree}`
            : p.kind === 'double_integrator'
              ? `${p.intervals} / ${p.degree}`
              : '—'
      },
    },
    { label: tr('求解終了理由', 'Solver status'), read: (r) => r.solver_status },
    { label: tr('数値検証', 'Validation'), read: (r) => r.validation?.status ?? tr('未評価', 'Not evaluated') },
    { label: tr('反復記録数', 'Iteration records'), read: (r) => String(r.iterations.length) },
    { label: tr('目的値（TNLP尺度）', 'Objective (TNLP units)'), read: (r) => number(r.solution?.objective) },
    {
      label: tr('終端時刻 [s]', 'Final time [s]'),
      read: (r) =>
        number(r.validation?.multi_stage?.final_time_s ?? r.validation?.flight?.final_time_s ?? r.validation?.trajectory?.duration_s),
    },
    { label: tr('解析解の時刻 [s]', 'Reference time [s]'), read: (r) => number(r.validation?.trajectory?.reference_duration_s) },
    {
      label: tr('最大位置差 [m]', 'Max position difference [m]'),
      read: (r) =>
        number(
          r.validation?.multi_stage?.max_position_error_m ??
            r.validation?.flight?.max_position_error_m ??
            r.validation?.trajectory?.max_position_error_m,
        ),
    },
    {
      label: tr('位置許容差 [m]', 'Position tolerance [m]'),
      read: (r) =>
        number(
          r.validation?.multi_stage?.position_tolerance_m ??
            r.validation?.flight?.position_tolerance_m ??
            r.validation?.trajectory?.position_tolerance_m,
        ),
    },
    {
      label: tr('最大速度差 [m/s]', 'Max velocity difference [m/s]'),
      read: (r) =>
        number(
          r.validation?.multi_stage?.max_velocity_error_m_s ??
            r.validation?.flight?.max_velocity_error_m_s ??
            r.validation?.trajectory?.max_velocity_error_m_s,
        ),
    },
    {
      label: tr('速度許容差 [m/s]', 'Velocity tolerance [m/s]'),
      read: (r) =>
        number(
          r.validation?.multi_stage?.velocity_tolerance_m_s ??
            r.validation?.flight?.velocity_tolerance_m_s ??
            r.validation?.trajectory?.velocity_tolerance_m_s,
        ),
    },
  ]
  if (opt.results.some((r) => r.input.problem.kind === 'single_stage'))
    rows.push(
      {
        label: tr('追加ペイロード [kg]', 'Additional payload [kg]'),
        read: (r) => number(r.validation?.flight?.mass_ledger.additional_payload_kg),
      },
      {
        label: tr('残推進剤 [kg]', 'Remaining propellant [kg]'),
        read: (r) => number(r.validation?.flight?.mass_ledger.propellant_remaining_kg),
      },
      {
        label: tr('厳密化したRK45との位置差 [m]', 'Tighter RK45 position difference [m]'),
        read: (r) => number(r.validation?.flight?.tighter_rk_position_difference_m),
      },
    )

  if (opt.results.some((r) => r.input.problem.kind === 'multi_stage'))
    rows.push(
      { label: tr('正味衛星質量 [kg]', 'Net satellite mass [kg]'), read: (r) => number(r.validation?.multi_stage?.net_payload_kg) },
      {
        label: tr('近地点高度 [m・WGS84赤道半径基準]', 'Perigee altitude [m above WGS84 equatorial radius]'),
        read: (r) => number(r.validation?.multi_stage?.orbit.perigee_altitude_m),
      },
      {
        label: tr('遠地点高度 [m・WGS84赤道半径基準]', 'Apogee altitude [m above WGS84 equatorial radius]'),
        read: (r) => number(r.validation?.multi_stage?.orbit.apogee_altitude_m ?? undefined),
      },
      { label: tr('軌道傾斜角 [deg]', 'Inclination [deg]'), read: (r) => number(r.validation?.multi_stage?.orbit.inclination_deg) },
      { label: tr('最大質量差 [kg]', 'Max mass difference [kg]'), read: (r) => number(r.validation?.multi_stage?.max_mass_error_kg) },
    )

  return (
    <dialog
      ref={dialog}
      aria-labelledby="optimization-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className="scroll-quiet m-auto max-h-[92dvh] w-[min(76rem,96vw)] max-w-none overflow-y-auto rounded-[10px] border border-line bg-bg p-4 text-ink shadow-xl backdrop:bg-black/40"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id="optimization-title" className="text-[15px] font-semibold">
            {tr('軌道最適化', 'Trajectory optimization')}
          </h2>
          <p className="mt-1 text-[12px] text-ink-2">
            {tr(
              '単段の追加ペイロードと、仮定した多段機の正味衛星質量を最適化します。ZEROの実機性能を示すものではありません。',
              'Optimize single-stage additional payload or net satellite mass with an assumed multistage vehicle. These demonstrations do not establish ZERO performance.',
            )}
          </p>
        </div>
        <IconButton label={tr('閉じる（実行中は中断）', 'Close (cancels any running solve)')} onClick={onClose}>
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <section className="space-y-3 rounded-[8px] border border-line bg-surface p-3">
          <label className="block text-[12px] text-ink-2">
            {tr('問題', 'Problem')}
            <select
              className="mt-1 w-full rounded-[6px] border border-line bg-surface-2 p-2 text-ink"
              value={preset}
              disabled={opt.running}
              onChange={(event) => {
                const key = event.target.value as keyof typeof presets
                setPreset(key)
                setInput(presets[key])
                setRefineError(null)
              }}
            >
              <option value="custom" disabled>
                {tr('編集した問題', 'Edited problem')}
              </option>
              <option value="multi_stage">
                {tr(
                  '仮定した2段機：500 km / 43°・正味衛星質量最大化',
                  'Assumed two-stage vehicle: 500 km / 43°, maximum net satellite mass',
                )}
              </option>
              <option value="multi_stage_coarse">
                {tr('仮定した2段機：粗いメッシュ（不合格例）', 'Assumed two-stage vehicle: coarse mesh (failure example)')}
              </option>
              <option value="single_stage">
                {tr('MOMO単段：100 km・追加ペイロード最大化', 'Single-stage MOMO: 100 km, maximum additional payload')}
              </option>
              <option value="single_stage_coarse">
                {tr('MOMO単段：粗いメッシュ（検証不合格の例）', 'Single-stage MOMO: coarse mesh (validation failure example)')}
              </option>
              <option value="double_integrator">{tr('二重積分器：自由終端時刻', 'Double integrator: free final time')}</option>
              <option value="hs071">{tr('HS071：ソルバー接続試験', 'HS071: solver connection')}</option>
              <option value="zero">{tr('ZERO：500 km / 43°（データ未設定）', 'ZERO: 500 km / 43° (missing data)')}</option>
            </select>
          </label>
          <label className="block text-[12px] text-ink-2">
            {tr('入力JSON（SI単位）', 'Input JSON (SI units)')}
            <textarea
              className="num mt-1 h-80 w-full rounded-[6px] border border-line bg-surface-2 p-2 text-[11px] text-ink"
              value={input}
              disabled={opt.running}
              onChange={(event) => {
                setInput(event.target.value)
                setPreset('custom')
                setRefineError(null)
              }}
              spellCheck={false}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" className={button} onClick={() => opt.run(input)} disabled={opt.running}>
              {tr('最適化を実行', 'Run optimization')}
            </button>
            <button type="button" className={button} onClick={opt.cancel} disabled={!opt.running}>
              {tr('中断', 'Cancel')}
            </button>
          </div>
          <div role="status" aria-live="polite" className="text-[12px] text-ink-2">
            <p>{statusLabels[opt.status]}</p>
            {opt.progress ? (
              <p className="num mt-1">
                {tr('反復', 'Iteration')} {opt.progress.iteration} · f={number(opt.progress.objective)} ·{' '}
                {tr('制約残差', 'primal residual')}={number(opt.progress.primal_infeasibility)} (TNLP)
              </p>
            ) : null}
          </div>
          {latest && ['single_stage', 'multi_stage'].includes(latest.input.problem.kind) ? (
            <button type="button" className={button} disabled={opt.running} onClick={refine}>
              {tr('メッシュを細分化して再実行', 'Refine mesh and run again')}
            </button>
          ) : null}
          {refineError ? (
            <p role="alert" className="text-[11px] text-danger">
              {refineError}
            </p>
          ) : null}
          {opt.error ? (
            <pre role="alert" className="whitespace-pre-wrap break-words rounded-[6px] bg-surface-2 p-2 text-[11px] text-danger">
              {opt.error}
            </pre>
          ) : null}
          <p className="text-[11px] text-ink-3">
            {tr(
              '実行中は入力を固定します。中断はWorkerを終了します。履歴はこの画面を閉じるまで直近2件を保持します。',
              'Each run freezes its input. Cancellation terminates the Worker. The last two results remain until this dialog closes.',
            )}
          </p>
          <a
            className="text-[11px] text-ink-2 underline"
            href={`${import.meta.env.BASE_URL}optimization/NOTICE.md`}
            target="_blank"
            rel="noreferrer"
          >
            pounce 0.12.0 / EPL-2.0
          </a>
        </section>
        <div className="min-w-0 space-y-3">
          <section className="overflow-x-auto rounded-[8px] border border-line bg-surface p-3">
            <h3 className="mb-2 text-[13px] font-semibold">{tr('求解と独立検証', 'Solve and independent validation')}</h3>
            {opt.results.length ? (
              <>
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr>
                      <th className="p-1.5">{tr('項目', 'Metric')}</th>
                      {opt.results.map((r, i) => (
                        <th className="p-1.5" key={r.input.run_id}>
                          {i === 0 ? tr('最新', 'Latest') : tr('前回', 'Previous')} · {r.input.problem.kind}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ label, read }) => (
                      <tr key={label} className="border-t border-line">
                        <th className="p-1.5 font-normal text-ink-2">{label}</th>
                        {opt.results.map((r) => (
                          <td className="num p-1.5" key={r.input.run_id}>
                            {read(r)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-ink-3">
                  {tr(
                    '比較時は問題・物理設定・尺度を確認してください。数値検証の合格は実飛行の合否を表しません。',
                    'Compare runs with matching problems, physical inputs and scales. Numerical validation does not certify flight feasibility.',
                  )}
                </p>
              </>
            ) : (
              <p className="text-[12px] text-ink-3">{tr('実行すると結果が表示されます。', 'Run a benchmark to display results.')}</p>
            )}
          </section>
          {trajectory ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <TrajectoryChart samples={trajectory.samples} read={(s) => s.position_m} label={tr('位置 [m]', 'Position [m]')} />
              <TrajectoryChart samples={trajectory.samples} read={(s) => s.velocity_m_s} label={tr('速度 [m/s]', 'Velocity [m/s]')} />
              <TrajectoryChart
                samples={trajectory.samples}
                read={(s) => s.acceleration_m_s2}
                label={tr('制御加速度 [m/s²]', 'Control acceleration [m/s²]')}
              />
            </div>
          ) : null}
          {flight ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <TrajectoryChart samples={flight.samples} read={(s) => s.altitude_m} label={tr('測地高度 [m]', 'Geodetic altitude [m]')} />
                <TrajectoryChart
                  samples={flight.samples}
                  read={(s) => s.downrange_m}
                  label={tr('射向への地表投影距離 [m]', 'Ground projection along launch azimuth [m]')}
                />
                <TrajectoryChart
                  samples={flight.samples}
                  read={(s) => s.dynamic_pressure_pa}
                  label={tr('動圧 [Pa]', 'Dynamic pressure [Pa]')}
                />
                <TrajectoryChart
                  samples={flight.samples}
                  read={(s) => s.specific_force_m_s2}
                  label={tr('比力 [m/s²]', 'Specific force [m/s²]')}
                />
                <TrajectoryChart
                  samples={flight.samples.filter((s) => s.powered)}
                  read={(s) => s.pitch_deg}
                  label={tr('燃焼中の仰角 [deg]', 'Powered-flight elevation [deg]')}
                />
                <TrajectoryChart
                  samples={flight.samples}
                  read={(s) => s.angle_of_attack_deg}
                  label={tr('迎角 [deg]', 'Angle of attack [deg]')}
                />
              </div>
              <PhysicalChecks checks={flight.checks} />
            </>
          ) : null}
          {multi ? <MultiStageReport flight={multi} /> : null}
          {latest ? (
            <section className="space-y-2 rounded-[8px] border border-line bg-surface p-3">
              <h3 className="text-[13px] font-semibold">{tr('保存と診断', 'Save and inspect')}</h3>
              <p className="num break-all text-[10px] text-ink-3">
                ID: {latest.input.run_id}
                <br />
                {latest.solver_version} / revision {latest.code_revision}
                <br />
                {tr('WASMメモリ', 'WASM memory')}: {opt.memoryBytes} bytes
              </p>
              {latest.validation?.error ? (
                <p role="alert" className="text-danger">
                  {latest.validation.error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {opt.results.map((r, i) => (
                  <button
                    type="button"
                    className={button}
                    key={r.input.run_id}
                    onClick={() =>
                      saveFile(`${fileBase(`optimization-${r.input.run_id}`)}.json`, JSON.stringify(r, null, 2), 'application/json')
                    }
                  >
                    {i === 0
                      ? tr('最新の全結果JSONを保存', 'Save latest full result JSON')
                      : tr('前回の全結果JSONを保存', 'Save previous full result JSON')}
                  </button>
                ))}
              </div>
              <details onToggle={(event) => setShowVariables(event.currentTarget.open)}>
                <summary className="cursor-pointer text-[12px] text-ink-2">
                  {tr('名前付き主変数・双対変数（TNLP尺度）', 'Named primal and dual variables (TNLP units)')}
                </summary>
                {showVariables ? (
                  <div className="num max-h-64 overflow-auto text-[10px]">
                    <table className="w-full text-left">
                      <thead>
                        <tr>
                          <th>{tr('変数', 'Variable')}</th>
                          <th>{tr('値', 'Value')}</th>
                          <th>zL</th>
                          <th>zU</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latest.variable_names.map((name, i) => (
                          <tr key={name}>
                            <th className="font-normal">{name}</th>
                            <td>{number(latest.solution?.x[i])}</td>
                            <td>{number(latest.solution?.z_lower[i])}</td>
                            <td>{number(latest.solution?.z_upper[i])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <table className="mt-3 w-full text-left">
                      <thead>
                        <tr>
                          <th>{tr('制約', 'Constraint')}</th>
                          <th>{tr('値', 'Value')}</th>
                          <th>lambda</th>
                        </tr>
                      </thead>
                      <tbody>
                        {latest.constraint_names.map((name, i) => (
                          <tr key={name}>
                            <th className="font-normal">{name}</th>
                            <td>{number(latest.solution?.constraints[i])}</td>
                            <td>{number(latest.solution?.lambda[i])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </details>
            </section>
          ) : null}
        </div>
      </div>
    </dialog>
  )
}
