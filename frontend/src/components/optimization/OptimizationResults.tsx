import { lazy, Suspense, useMemo, useState } from 'react'
import { ArrowDownToLine, Copy, SplitSquareHorizontal } from 'lucide-react'
import { tr, useLang } from '../../lib/i18n'
import { fileBase, saveFile } from '../../lib/download'
import { requestFingerprint, samePhysicalProblem } from '../../lib/optimization-input'
import type { OptimizationInput } from '../../lib/optimization-input'
import type { OptimizationRun } from '../../lib/optimization-storage'
import type { OptimizationResult } from '../../lib/optimization'
import { checkTime, optimizationMapPath, resultPhaseViews } from '../../lib/optimization-view'
import { pointOnPath } from '../../lib/globe-path'
import { MultiStageReport, PhysicalChecks, TrajectoryChart } from '../OptimizationReport'
import { SequenceTimeline } from './SequenceTimeline'
import { OptGroup, OptTabs } from './controls'
import { optButton, optInput } from './styles'

const Globe = lazy(() => import('../Globe'))
const number = (v: number | null | undefined, digits = 3) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits })
type ResultTab = 'overview' | 'orbit' | 'checks' | 'diagnostics'
export function OptimizationResults({
  runs,
  currentInput,
  draftIncomplete,
  onEdit,
  onRefine,
  onClearComparison,
  running,
  saved,
  memoryBytes,
}: {
  runs: OptimizationRun[]
  currentInput: OptimizationInput | null
  draftIncomplete: boolean
  onEdit: (input: OptimizationInput) => void
  onRefine: (input: OptimizationInput) => void
  onClearComparison: () => void
  running: boolean
  saved: Record<string, string>
  memoryBytes: number | null
}) {
  const run = runs[0],
    reference = runs[1]
  const [tab, setTab] = useState<ResultTab>('overview')
  const [cursor, setCursor] = useState<number | null>(null)
  const lang = useLang()
  const result = run?.result,
    validation = result?.validation
  const multi = validation?.multi_stage,
    flight = validation?.flight,
    numerical = validation?.trajectory
  const hasPath = !!multi || !!flight
  const mapPath = useMemo(() => {
    void lang
    return result ? optimizationMapPath(result, run.id) : null
  }, [result, run?.id, lang])
  const mapReference = useMemo(() => {
    void lang
    return reference ? optimizationMapPath(reference.result, reference.id) : null
  }, [reference, lang])
  const phases = useMemo(() => {
    void lang
    return result ? resultPhaseViews(result) : []
  }, [result, lang])
  if (!result)
    return (
      <div className="flex min-h-72 flex-col items-center justify-center rounded-[10px] border border-dashed border-line-strong bg-surface p-8 text-center">
        <SplitSquareHorizontal className="mb-3 h-7 w-7 text-ink-3" />
        <h3 className="text-[15px] font-medium">
          {running
            ? tr('軌道を求解・検証しています', 'Solving and validating the trajectory')
            : tr('実行結果はここに表示されます', 'Your results will appear here')}
        </h3>
        <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-2">
          {running
            ? tr(
                '反復数・目的値・制約残差は下の実行バーで確認できます。画面の操作は続けられます。',
                'Follow iteration, objective and residual in the run bar below. You can keep using the interface.',
              )
            : tr(
                '設定から実行するか、保存した実行・結果JSONを読み込んでください。',
                'Run the settings, or open a saved run or result JSON.',
              )}
        </p>
      </div>
    )
  const time = cursor ?? multi?.final_time_s ?? flight?.final_time_s ?? 0
  const currentPoint = mapPath ? pointOnPath(mapPath.points, time) : null
  const stale = draftIncomplete || !currentInput || requestFingerprint(currentInput) !== requestFingerprint(result.input)
  const checks = multi?.checks ?? flight?.checks ?? []
  const failureCount = checks.filter((c) => !c.passed).length
  const payload = multi?.net_payload_kg ?? flight?.mass_ledger.additional_payload_kg
  const position = multi?.max_position_error_m ?? flight?.max_position_error_m ?? numerical?.max_position_error_m
  const posTolerance = multi?.position_tolerance_m ?? flight?.position_tolerance_m ?? numerical?.position_tolerance_m
  const selectedPhase = phases.findIndex((p) => time >= p.start && time <= p.end)
  return (
    <div className="space-y-4">
      {running ? (
        <p role="status" className="rounded-[8px] border border-signal/25 bg-signal/5 p-3 text-[12px]">
          {tr(
            '新しい入力を求解中です。完了するまで前回の結果を表示しています。',
            'Solving the new input. The previous result remains visible until it finishes.',
          )}
        </p>
      ) : null}
      <section className="rounded-[9px] border border-line bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] text-ink-3">
              {new Date(run.createdAt).toLocaleString()} ·{' '}
              {run.origin === 'import'
                ? tr('読み込んだ結果（再求解なし）', 'Imported result (not re-solved)')
                : tr('このブラウザで実行', 'Solved in this browser')}{' '}
              ·{' '}
              {saved[run.id] === 'saved'
                ? tr('端末に保存済み', 'Saved on this device')
                : saved[run.id] === 'error'
                  ? tr('保存に失敗・JSON保存を利用してください', 'Storage failed · download JSON')
                  : tr('保存中', 'Saving')}
            </p>
            <h3 className="break-words text-[16px] font-semibold">{run.label}</h3>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
              <span
                className={`rounded-full border px-2 py-1 ${result.converged ? 'border-[var(--ok)]/30 text-[var(--ok)]' : 'border-danger/30 text-danger'}`}
              >
                {tr('求解', 'Solve')}: {result.converged ? tr('収束', 'Converged') : tr('未収束', 'Not converged')}
              </span>
              <span
                className={`rounded-full border px-2 py-1 ${validation?.status === 'passed' ? 'border-[var(--ok)]/30 text-[var(--ok)]' : 'border-danger/30 text-danger'}`}
              >
                {tr('数値検証', 'Validation')}:{' '}
                {validation?.status === 'passed'
                  ? tr('許容差内', 'Within tolerances')
                  : validation
                    ? tr('不合格', 'Failed')
                    : tr('未評価', 'Not evaluated')}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={optButton} disabled={running} onClick={() => onEdit(result.input)}>
              <Copy className="h-3.5 w-3.5" />
              {tr('この入力で編集', 'Edit these inputs')}
            </button>
            <button
              type="button"
              className={optButton}
              onClick={() => saveFile(`${fileBase(run.label)}_optimization.json`, JSON.stringify(result, null, 2), 'application/json')}
            >
              <ArrowDownToLine className="h-3.5 w-3.5" />
              {tr('全結果JSON', 'Full result JSON')}
            </button>
          </div>
        </div>
        {stale ? (
          <p className="mt-3 rounded-[6px] bg-surface-2 px-3 py-2 text-[11px] text-ink-2">
            {tr(
              'この結果は実行時の入力に対応します。現在編集中の設定とは異なります。',
              'This result belongs to its recorded input, which differs from the current draft.',
            )}
          </p>
        ) : null}
        {validation?.error ? (
          <div className="mt-3 rounded-[6px] border border-danger/25 bg-danger/5 p-3">
            <p className="text-[12px] font-medium text-danger">{tr('検証で問題が見つかりました', 'Validation found a problem')}</p>
            <p className="mt-1 break-words text-[11px] text-danger">{validation.error}</p>
            <button type="button" className="mt-2 text-[12px] underline" onClick={() => setTab('checks')}>
              {tr('制約ごとの結果を確認', 'Inspect constraint checks')}
            </button>
          </div>
        ) : null}
        {!result.converged ? (
          <p className="mt-3 text-[11px] text-danger">
            {tr('終了理由', 'Solver status')}: {result.solver_status}.{' '}
            {tr('数値検証が許容差内でも、最適化の完了にはなりません。', 'Passing numerical checks does not establish convergence.')}
          </p>
        ) : null}
        <dl className="mt-4 grid divide-y divide-line rounded-[8px] border border-line bg-surface-2 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Metric
            label={
              hasPath
                ? multi
                  ? tr('正味衛星質量', 'Net satellite mass')
                  : tr('追加ペイロード', 'Additional payload')
                : tr('目的値（NLP尺度）', 'Objective (NLP units)')
            }
            value={hasPath ? number(payload) : number(result.solution?.objective, 8)}
            unit={hasPath ? 'kg' : ''}
          />
          <Metric
            label={multi ? tr('近地点 / 遠地点', 'Perigee / apogee') : tr('終端時刻', 'Final time')}
            value={
              multi
                ? `${number(multi.orbit.perigee_altitude_m / 1000, 3)} / ${number((multi.orbit.apogee_altitude_m ?? NaN) / 1000, 3)}`
                : number(flight?.final_time_s ?? numerical?.duration_s)
            }
            unit={multi ? 'km' : 's'}
            detail={
              multi
                ? tr(
                    `傾斜角 ${number(multi.orbit.inclination_deg, 6)}° · WGS84赤道半径基準`,
                    `Inclination ${number(multi.orbit.inclination_deg, 6)}° · above WGS84 equatorial radius`,
                  )
                : undefined
            }
          />
          <Metric
            label={tr('最大位置差（再積分）', 'Max reintegration position difference')}
            value={number(position, 4)}
            unit="m"
            detail={tr(`許容値 ${number(posTolerance)} m`, `Tolerance ${number(posTolerance)} m`)}
          />
        </dl>
      </section>
      <div className="sticky top-0 z-20 rounded-[8px] bg-surface-2 p-1 shadow-[0_1px_0_var(--line)]">
        <OptTabs
          value={tab}
          onChange={setTab}
          label={tr('結果の表示', 'Result views')}
          options={[
            { value: 'overview', label: tr('概要・比較', 'Overview and comparison') },
            { value: 'orbit', label: tr('軌道・グラフ', 'Trajectory and plots'), disabled: !hasPath && !numerical },
            { value: 'checks', label: `${tr('制約', 'Checks')}${failureCount ? ` · ${failureCount}` : ''}` },
            { value: 'diagnostics', label: tr('診断', 'Diagnostics') },
          ]}
        />
      </div>
      {tab === 'overview' ? (
        <>
          {reference ? (
            <Comparison a={run} b={reference} onClear={onClearComparison} />
          ) : (
            <p className="text-[12px] text-ink-3">
              {tr(
                '「保存した実行」から比較対象を選べます。新しい実行の後は、直前の結果を並べます。',
                'Choose a reference from saved runs. A new solve is compared with the previous result.',
              )}
            </p>
          )}
          {phases.length && (multi || flight) ? (
            <OptGroup title={tr('飛行シーケンス', 'Flight sequence')}>
              <SequenceTimeline
                phases={phases}
                actual
                onSelect={(i) => {
                  setCursor(phases[i].start)
                  setTab('orbit')
                }}
              />
            </OptGroup>
          ) : null}
          {multi ? (
            <MultiStageReport flight={multi} overviewOnly />
          ) : flight ? (
            <OptGroup title={tr('質量収支', 'Mass ledger')}>
              <dl className="grid gap-3 text-[12px] sm:grid-cols-2">
                {Object.entries({
                  [tr('初期全質量', 'Initial total')]: flight.mass_ledger.initial_total_kg,
                  [tr('消費推進剤', 'Consumed propellant')]: flight.mass_ledger.propellant_burned_kg,
                  [tr('残推進剤', 'Residual propellant')]: flight.mass_ledger.propellant_remaining_kg,
                  [tr('終端全質量', 'Final total')]: flight.mass_ledger.final_total_kg,
                }).map(([label, v]) => (
                  <div key={label} className="flex justify-between gap-3">
                    <dt className="text-ink-2">{label}</dt>
                    <dd className="num">{number(v)} kg</dd>
                  </div>
                ))}
              </dl>
            </OptGroup>
          ) : (
            <OptGroup title={tr('数値ベンチマーク', 'Numerical benchmark')}>
              <p className="text-[12px] text-ink-2">
                {tr('ロケットの性能値を表すケースではありません。', 'This case does not represent rocket performance.')}
              </p>
            </OptGroup>
          )}
          {hasPath ? (
            <button type="button" className={optButton} disabled={running} onClick={() => onRefine(result.input)}>
              {tr('同じ入力のメッシュを細分化して実行', 'Refine this input mesh and run')}
            </button>
          ) : null}
        </>
      ) : null}
      {tab === 'orbit' ? (
        <>
          {mapPath ? (
            <OptGroup
              title={tr('本体軌道と分離位置', 'Vehicle trajectory and separation locations')}
              note={tr(
                '実行結果のECI位置を地図へ変換しています。分離物の落下軌道・落下域・IIPは未計算です。',
                'Recorded ECI positions are converted for display. Discarded-body trajectories, landing regions and IIP are not computed.',
              )}
            >
              <div
                className="h-[clamp(240px,42dvh,440px)] overflow-hidden rounded-[8px] border border-line"
                aria-label={tr('最適化軌道の3D地図', '3D map of the optimized trajectory')}
                onWheelCapture={(event) => {
                  // Let the enclosing results page scroll. Cesium may consume
                  // wheel events only when map zoom is explicitly requested.
                  if (!event.ctrlKey && !event.metaKey) event.stopPropagation()
                }}
              >
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-[12px] text-ink-3">
                      {tr('3D地図を読み込み中…', 'Loading 3D map…')}
                    </div>
                  }
                >
                  <Globe track={null} recordedPath={mapPath} recordedReference={mapReference} recordedTime={time} />
                </Suspense>
              </div>
              <p className="mt-2 text-[11px] text-ink-2">
                {tr(
                  'スクロールでページ移動 · Ctrl/⌘＋ホイールで地図を拡大縮小 · ドラッグで地図を操作',
                  'Scroll the page · Ctrl/⌘ + wheel to zoom the map · drag to navigate',
                )}
              </p>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-2">
                <span>
                  {tr('実線：燃焼 · 破線：惰行 · 細線：地上軌跡', 'Solid: burn · dashed: coast · thin: ground track')}
                  {mapReference ? ` · ${tr('灰色破線：比較対象', 'gray dashed: reference')}` : ''}
                </span>
                <span className="num">
                  T+{number(time, 2)} s · {number(currentPoint?.alt === undefined ? undefined : currentPoint.alt / 1000)} km
                </span>
              </div>
              <label className="block text-[12px] text-ink-2">
                {tr('表示時刻', 'Display time')}
                <input
                  className="mt-2 w-full accent-[var(--signal)]"
                  type="range"
                  min={mapPath.points[0].time}
                  max={mapPath.points[mapPath.points.length - 1].time}
                  step="0.1"
                  value={time}
                  onChange={(e) => setCursor(Number(e.target.value))}
                />
              </label>
              <SequenceTimeline phases={phases} actual selected={selectedPhase} onSelect={(i) => setCursor(phases[i].start)} />
            </OptGroup>
          ) : null}
          <FlightPlots result={result} cursorTime={time} />
        </>
      ) : null}
      {tab === 'checks' ? (
        <>
          <p className="text-[12px] leading-relaxed text-ink-2">
            {tr(
              '数値許容値を含む判定です。制約を緩めて成功扱いにはしません。位置アイコンから、再積分での極値の時刻へ移動できます。',
              'Checks include explicit numerical tolerances. Constraints are not relaxed to claim success. Location buttons open the time of the reintegrated extremum.',
            )}
          </p>
          {checks.length ? (
            <PhysicalChecks
              checks={checks}
              onLocate={(c) => {
                const t = checkTime(result, c)
                if (t !== null) {
                  setCursor(t)
                  setTab('orbit')
                }
              }}
              canLocate={(c) => checkTime(result, c) !== null}
            />
          ) : (
            <OptGroup title={tr('検証結果', 'Validation result')}>
              <p className="text-[12px]">{validation?.status ?? tr('未評価', 'Not evaluated')}</p>
              <p className="num text-[12px]">
                {tr('NLP最大違反', 'Max NLP violation')}: {number(validation?.max_bound_violation, 10)}
              </p>
            </OptGroup>
          )}
          <p className="text-[12px] leading-relaxed text-ink-3">
            {tr(
              '熱・落下域・相対分離・6DoF・再着火資源等の未評価条件は、数値検証の合否に含みません。',
              'Unevaluated thermal, range, relative separation, 6DoF and restart resource conditions are outside the pass/fail assessment.',
            )}
          </p>
        </>
      ) : null}
      {tab === 'diagnostics' ? <Diagnostics result={result} memoryBytes={memoryBytes} /> : null}
    </div>
  )
}
function Metric({ label, value, unit, detail }: { label: string; value: string; unit: string; detail?: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-[11px] text-ink-2">{label}</dt>
      <dd className="num mt-1 break-words text-[20px] font-medium">
        {value} <span className="text-[11px] font-normal text-ink-3">{unit}</span>
      </dd>
      {detail ? <p className="mt-1 text-[10px] leading-relaxed text-ink-3">{detail}</p> : null}
    </div>
  )
}
function Comparison({ a, b, onClear }: { a: OptimizationRun; b: OptimizationRun; onClear: () => void }) {
  const compatible = samePhysicalProblem(a.result.input, b.result.input)
  const common = [
    { label: tr('求解', 'Solver'), read: (r: OptimizationResult) => r.solver_status },
    { label: tr('数値検証', 'Validation'), read: (r: OptimizationResult) => r.validation?.status ?? '—' },
    {
      label: tr('位置差 [m]', 'Position difference [m]'),
      read: (r: OptimizationResult) =>
        number(
          r.validation?.multi_stage?.max_position_error_m ??
            r.validation?.flight?.max_position_error_m ??
            r.validation?.trajectory?.max_position_error_m,
          5,
        ),
    },
    {
      label: tr('速度差 [m/s]', 'Velocity difference [m/s]'),
      read: (r: OptimizationResult) =>
        number(
          r.validation?.multi_stage?.max_velocity_error_m_s ??
            r.validation?.flight?.max_velocity_error_m_s ??
            r.validation?.trajectory?.max_velocity_error_m_s,
          6,
        ),
    },
  ]
  if (a.result.input.problem.kind === b.result.input.problem.kind && ['single_stage', 'multi_stage'].includes(a.result.input.problem.kind))
    common.push({
      label:
        a.result.input.problem.kind === 'multi_stage'
          ? tr('正味衛星 [kg]', 'Net satellite [kg]')
          : tr('追加ペイロード [kg]', 'Additional payload [kg]'),
      read: (r) => number(r.validation?.multi_stage?.net_payload_kg ?? r.validation?.flight?.mass_ledger.additional_payload_kg, 6),
    })
  if (a.result.validation?.multi_stage && b.result.validation?.multi_stage)
    common.push(
      { label: tr('近地点高度 [m]', 'Perigee altitude [m]'), read: (r) => number(r.validation?.multi_stage?.orbit.perigee_altitude_m, 3) },
      { label: tr('遠地点高度 [m]', 'Apogee altitude [m]'), read: (r) => number(r.validation?.multi_stage?.orbit.apogee_altitude_m, 3) },
      { label: tr('軌道傾斜角 [°]', 'Inclination [°]'), read: (r) => number(r.validation?.multi_stage?.orbit.inclination_deg, 7) },
    )
  return (
    <OptGroup
      title={
        <span className="flex items-center justify-between gap-2">
          {tr('2件の比較', 'Two-run comparison')}
          <button type="button" className="text-[11px] font-normal text-ink-3 underline" onClick={onClear}>
            {tr('比較を外す', 'Remove comparison')}
          </button>
        </span>
      }
      note={
        compatible
          ? tr(
              '物理設定は同じです。メッシュ・初期推定・ソルバー設定の違いを許容し、SI単位で並べています。',
              'Physical settings match. Mesh, initial guess and solver differences are allowed; metrics are in SI units.',
            )
          : tr(
              '物理設定が異なります。ペイロード差をメッシュや数値手法の差だけで解釈しないでください。',
              'Physical settings differ. Payload differences cannot be attributed to mesh or numerical methods alone.',
            )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr>
              <th className="p-2">{tr('項目', 'Metric')}</th>
              {[a, b].map((record, index) => (
                <th key={record.id} className="min-w-44 p-2 align-top">
                  <span className="block text-[10px] font-normal text-ink-3">
                    {index === 0 ? tr('表示中', 'Selected') : tr('比較対象', 'Reference')}
                  </span>
                  {record.label}
                  <span className="mt-1 block text-[10px] font-normal text-ink-3">
                    {new Date(record.createdAt).toLocaleString()} · {record.id.slice(0, 8)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {common.map((row) => (
              <tr key={row.label} className="border-t border-line">
                <th className="p-2 font-normal text-ink-2">{row.label}</th>
                <td className="num p-2">{row.read(a.result)}</td>
                <td className="num p-2">{row.read(b.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </OptGroup>
  )
}
function FlightPlots({ result, cursorTime }: { result: OptimizationResult; cursorTime: number }) {
  const multi = result.validation?.multi_stage,
    flight = result.validation?.flight,
    numerical = result.validation?.trajectory
  if (multi)
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TrajectoryChart
          samples={multi.samples}
          read={(p) => p.altitude_m / 1000}
          label={tr('測地高度 [km]', 'Geodetic altitude [km]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={[...multi.samples, { ...multi.samples[multi.samples.length - 1], state_eci: multi.deployed_state_eci }]}
          read={(p) => p.state_eci[0]}
          label={tr('機体質量 [kg]', 'Stack mass [kg]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={multi.samples}
          read={(p) => p.dynamic_pressure_pa / 1000}
          label={tr('動圧 [kPa]', 'Dynamic pressure [kPa]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={multi.samples}
          read={(p) => p.specific_force_m_s2}
          label={tr('比力 [m/s²]', 'Specific force [m/s²]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={multi.samples}
          read={(p) => p.elevation_deg}
          label={tr('仰角 [°]', 'Elevation [°]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={multi.samples}
          read={(p) => p.azimuth_deg}
          label={tr('方位角 [°]', 'Azimuth [°]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={multi.samples}
          read={(p) => p.angle_of_attack_deg}
          label={tr('迎角 [°]', 'Angle of attack [°]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={multi.samples}
          read={(p) => p.inertial_direction_rate_deg_s}
          label={tr('ECI機体軸の変化率 [°/s]', 'Inertial body-axis rate [°/s]')}
          cursorTime={cursorTime}
        />
      </div>
    )
  if (flight)
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TrajectoryChart
          samples={flight.samples}
          read={(p) => p.altitude_m / 1000}
          label={tr('測地高度 [km]', 'Geodetic altitude [km]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={flight.samples}
          read={(p) => p.dynamic_pressure_pa / 1000}
          label={tr('動圧 [kPa]', 'Dynamic pressure [kPa]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={flight.samples}
          read={(p) => p.specific_force_m_s2}
          label={tr('比力 [m/s²]', 'Specific force [m/s²]')}
          cursorTime={cursorTime}
        />
        <TrajectoryChart
          samples={flight.samples}
          read={(p) => p.pitch_deg}
          label={tr('仰角 [°]', 'Elevation [°]')}
          cursorTime={cursorTime}
        />
      </div>
    )
  if (numerical)
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <TrajectoryChart samples={numerical.samples} read={(p) => p.position_m} label={tr('位置 [m]', 'Position [m]')} />
        <TrajectoryChart samples={numerical.samples} read={(p) => p.velocity_m_s} label={tr('速度 [m/s]', 'Velocity [m/s]')} />
      </div>
    )
  return null
}
function Diagnostics({ result, memoryBytes }: { result: OptimizationResult; memoryBytes: number | null }) {
  const [query, setQuery] = useState(''),
    [showVectors, setShowVectors] = useState(false)
  const scaling = result.flight_scaling
  return (
    <div className="space-y-4">
      <OptGroup title={tr('実行の記録', 'Run record')}>
        <dl className="grid gap-2 break-all text-[12px] sm:grid-cols-2">
          {Object.entries({
            [tr('実行ID', 'Run ID')]: result.input.run_id,
            [tr('ソルバー', 'Solver')]: result.solver_version,
            [tr('コード版', 'Code revision')]: result.code_revision,
            [tr('終了理由', 'Solver status')]: result.solver_status,
            [tr('反復記録数', 'Iteration records')]: String(result.iterations.length),
            [tr('WASMメモリ', 'WASM memory')]: memoryBytes === null ? '—' : `${number(memoryBytes / 1024 / 1024, 2)} MiB`,
          }).map(([label, v]) => (
            <div key={label}>
              <dt className="text-[11px] text-ink-3">{label}</dt>
              <dd className="num mt-1">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[11px] leading-relaxed text-ink-2">{result.model_fidelity}</p>
      </OptGroup>
      {scaling ? (
        <OptGroup title={tr('実効スケール（求解中固定）', 'Effective scales (fixed during solve)')}>
          <dl className="grid grid-cols-2 gap-3 text-[12px]">
            {Object.entries({
              [tr('質量 [kg]', 'Mass [kg]')]: scaling.mass_kg,
              [tr('位置 [m]', 'Position [m]')]: scaling.position_m,
              [tr('速度 [m/s]', 'Velocity [m/s]')]: scaling.velocity_m_s,
              [tr('時間 [s]', 'Time [s]')]: scaling.time_s,
              [tr('目的専用質量 [kg]', 'Objective mass [kg]')]: scaling.payload_objective_kg,
            }).map(([label, v]) => (
              <div key={label}>
                <dt className="text-ink-3">{label}</dt>
                <dd className="num mt-1">{number(v, 6)}</dd>
              </div>
            ))}
          </dl>
        </OptGroup>
      ) : null}
      <OptGroup
        title={tr('主変数・双対変数', 'Primal and dual variables')}
        note={tr(
          'NLP尺度の値です。SI感度への変換値ではありません。全件は結果JSONへ保存されます。',
          'Values are in NLP units, not SI sensitivities. Full vectors are retained in the result JSON.',
        )}
      >
        <button type="button" className={optButton} aria-expanded={showVectors} onClick={() => setShowVectors(!showVectors)}>
          {showVectors ? tr('変数を閉じる', 'Hide variables') : tr('変数を表示', 'Show variables')} ({result.variable_names.length} /{' '}
          {result.constraint_names.length})
        </button>
        {showVectors ? (
          <>
            <label className="block text-[12px] text-ink-2">
              {tr('名前で絞り込み', 'Filter by name')}
              <input className={`${optInput} mt-1`} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <div className="max-h-80 overflow-auto">
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr>
                    <th className="p-1">{tr('変数', 'Variable')}</th>
                    <th>x</th>
                    <th>zL</th>
                    <th>zU</th>
                  </tr>
                </thead>
                <tbody>
                  {result.variable_names
                    .map((name, i) => ({ name, i }))
                    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, 200)
                    .map(({ name, i }) => (
                      <tr key={name} className="border-t border-line">
                        <th className="p-1 font-normal">{name}</th>
                        <td className="num p-1">{number(result.solution?.x[i], 10)}</td>
                        <td className="num p-1">{number(result.solution?.z_lower[i], 10)}</td>
                        <td className="num p-1">{number(result.solution?.z_upper[i], 10)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <table className="mt-4 w-full text-left text-[11px]">
                <thead>
                  <tr>
                    <th className="p-1">{tr('制約', 'Constraint')}</th>
                    <th>g</th>
                    <th>λ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.constraint_names
                    .map((name, i) => ({ name, i }))
                    .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
                    .slice(0, 200)
                    .map(({ name, i }) => (
                      <tr key={name} className="border-t border-line">
                        <th className="p-1 font-normal">{name}</th>
                        <td className="num p-1">{number(result.solution?.constraints[i], 10)}</td>
                        <td className="num p-1">{number(result.solution?.lambda[i], 10)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-ink-3">
              {tr(
                '各一覧は最大200件を表示します。名前で絞り込むか、全結果JSONを確認してください。',
                'Each list displays at most 200 matches. Filter names or inspect the full result JSON.',
              )}
            </p>
          </>
        ) : null}
      </OptGroup>
      <details className="rounded-[8px] border border-line bg-surface p-4">
        <summary className="cursor-pointer text-[12px] text-ink-2">
          {tr('実行時の入力とソルバーオプション', 'Recorded input and solver options')}
        </summary>
        <pre className="num mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words text-[10px] text-ink-2">
          {result.effective_options}
          {'\n'}
          {JSON.stringify(result.input, null, 2)}
        </pre>
      </details>
    </div>
  )
}
