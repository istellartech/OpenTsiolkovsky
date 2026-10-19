import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './primitives'
import { useOptimization } from '../hooks/useOptimization'
import { tr } from '../lib/i18n'
import { fileBase, saveFile } from '../lib/download'
import type { OptimizationResult, TrajectorySample } from '../lib/optimization'
import hs071 from '../../../examples/optimization/hs071.json?raw'
import doubleIntegrator from '../../../examples/optimization/double_integrator.json?raw'
import zero from '../../../examples/optimization/zero_500km_43deg.json?raw'

const presets = { double_integrator: doubleIntegrator, hs071, zero }
const number = (value: number | undefined) => (value === undefined ? '—' : value.toPrecision(8))
const button = 'rounded-[6px] border border-line bg-surface-2 px-3 py-2 text-[12px] text-ink hover:border-line-strong disabled:opacity-40'

type ChartField = 'position_m' | 'velocity_m_s' | 'acceleration_m_s2'
function TrajectoryChart({ samples, field, label }: { samples: TrajectorySample[]; field: ChartField; label: string }) {
  const values = samples.map((p) => p[field])
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = Math.max(high - low, 1e-12)
  const duration = samples[samples.length - 1].time_s
  const points = samples.map((p) => `${55 + (400 * p.time_s) / duration},${135 - (105 * (p[field] - low)) / span}`).join(' ')
  return (
    <figure className="rounded-[8px] border border-line bg-surface p-3">
      <figcaption className="text-[12px] text-ink-2">
        {label} · {tr('再積分', 'Reintegrated')}
      </figcaption>
      <svg viewBox="0 0 480 165" role="img" aria-label={label}>
        <path d="M55 20V135H455" stroke="var(--line-strong)" fill="none" />
        <polyline points={points} stroke="var(--signal)" fill="none" strokeWidth="2" />
        <g fontSize="10" fill="var(--ink-3)">
          <text x="0" y="30">
            {high.toPrecision(3)}
          </text>
          <text x="0" y="135">
            {low.toPrecision(3)}
          </text>
          <text x="55" y="157">
            0 s
          </text>
          <text x="405" y="157">
            {duration.toPrecision(4)} s
          </text>
        </g>
      </svg>
    </figure>
  )
}

export function OptimizationDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [input, setInput] = useState(doubleIntegrator)
  const opt = useOptimization()
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const latest = opt.results[0]
  const trajectory = latest?.validation?.trajectory
  const statusLabels = {
    idle: tr('待機', 'Ready'),
    loading: tr('最適化WASM読込', 'Loading optimizer WASM'),
    solving: tr('求解・数値検証', 'Solving and validating'),
    done: tr('求解終了', 'Solve finished'),
    cancelled: tr('中断（途中解は保存されません）', 'Cancelled (no intermediate solution saved)'),
    error: tr('入力・実行エラー', 'Input or execution error'),
  }
  const rows: { label: string; read: (result: OptimizationResult) => string }[] = [
    { label: tr('求解終了理由', 'Solver status'), read: (r) => r.solver_status },
    { label: tr('数値検証', 'Validation'), read: (r) => r.validation?.status ?? tr('未評価', 'Not evaluated') },
    { label: tr('反復記録数', 'Iteration records'), read: (r) => String(r.iterations.length) },
    { label: tr('目的値（TNLP尺度）', 'Objective (TNLP units)'), read: (r) => number(r.solution?.objective) },
    { label: tr('終端時刻 [s]', 'Final time [s]'), read: (r) => number(r.validation?.trajectory?.duration_s) },
    { label: tr('解析解の時刻 [s]', 'Reference time [s]'), read: (r) => number(r.validation?.trajectory?.reference_duration_s) },
    { label: tr('最大位置差 [m]', 'Max position difference [m]'), read: (r) => number(r.validation?.trajectory?.max_position_error_m) },
    { label: tr('位置許容差 [m]', 'Position tolerance [m]'), read: (r) => number(r.validation?.trajectory?.position_tolerance_m) },
    {
      label: tr('最大速度差 [m/s]', 'Max velocity difference [m/s]'),
      read: (r) => number(r.validation?.trajectory?.max_velocity_error_m_s),
    },
    { label: tr('速度許容差 [m/s]', 'Velocity tolerance [m/s]'), read: (r) => number(r.validation?.trajectory?.velocity_tolerance_m_s) },
  ]
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
            {tr('軌道最適化・数値試験', 'Trajectory optimization · benchmarks')}
          </h2>
          <p className="mt-1 text-[12px] text-ink-2">
            {tr(
              '既知解で転写と求解を検証する開発版です。ロケット飛行とZERO性能の最適化は後続段階です。',
              'A development benchmark for transcription and solver validation. Rocket flight and ZERO performance optimization follow later.',
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
              defaultValue="double_integrator"
              disabled={opt.running}
              onChange={(event) => setInput(presets[event.target.value as keyof typeof presets])}
            >
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
              onChange={(event) => setInput(event.target.value)}
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
                      {opt.results.map((r) => (
                        <th className="p-1.5" key={r.input.run_id}>
                          {r.input.problem.kind}
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
              <TrajectoryChart samples={trajectory.samples} field="position_m" label={tr('位置 [m]', 'Position [m]')} />
              <TrajectoryChart samples={trajectory.samples} field="velocity_m_s" label={tr('速度 [m/s]', 'Velocity [m/s]')} />
              <TrajectoryChart
                samples={trajectory.samples}
                field="acceleration_m_s2"
                label={tr('制御加速度 [m/s²]', 'Control acceleration [m/s²]')}
              />
            </div>
          ) : null}
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
              <details>
                <summary className="cursor-pointer text-[12px] text-ink-2">
                  {tr('名前付き主変数・双対変数（TNLP尺度）', 'Named primal and dual variables (TNLP units)')}
                </summary>
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
              </details>
            </section>
          ) : null}
        </div>
      </div>
    </dialog>
  )
}
