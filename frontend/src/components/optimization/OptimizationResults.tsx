import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, MoreHorizontal, Rocket, SplitSquareHorizontal } from 'lucide-react'
import { tr, useLang } from '../../lib/i18n'
import { fileBase, saveFile } from '../../lib/download'
import { fmt } from '../../lib/format'
import { requestFingerprint, samePhysicalProblem } from '../../lib/optimization-input'
import type { OptimizationInput } from '../../lib/optimization-input'
import type { OptimizationRun } from '../../lib/optimization-storage'
import type { MultiStageValidation, OptimizationResult } from '../../lib/optimization'
import { checkTime, optimizationMapPath, optimizationTimeline, resultPhaseViews } from '../../lib/optimization-view'
import { phaseLabel } from '../../lib/optimization-vehicle'
import type { ConstraintView } from '../../lib/optimization-constraints'
import { pointOnPath } from '../../lib/globe-path'
import { SequenceTimeline } from './SequenceTimeline'
import { OptGroup, OptTabs } from './controls'
import { optButton, optInput, optPrimary } from './styles'
import { Menu } from '../Header'
import { ConstraintReport, LimitingConstraints, useConstraintViews } from './ConstraintReport'
import { ResultCharts } from './ResultCharts'
import { cn } from '../../lib/cn'
import { caseFile, type CaseContext } from '../../lib/case'
import { CaseDetails } from '../CaseDetails'
import { PlaybackBar } from '../Playback'
import { usePlayerKeys } from '../../hooks/usePlayer'
import { createPlayback, suggestedSpeed, usePlayback } from '../../lib/playback'
import { SplitView, useSplitRatio } from '../SplitView'

const Globe = lazy(() => import('../Globe'))
const number = (v: number | null | undefined, digits = 3) =>
  v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString(undefined, { maximumFractionDigits: digits })
export type ResultTab = 'charts' | 'map' | 'split' | 'sequence' | 'checks' | 'compare' | 'diagnostics' | 'history'

export function OptimizationResults({
  runs,
  currentInput,
  draftIncomplete,
  onEdit,
  onRefine,
  onSimulate,
  onClearComparison,
  running,
  saved,
  memoryBytes,
  active = true,
  selectedTab,
  onTab,
  history,
  historyCount,
  progress,
}: {
  runs: OptimizationRun[]
  currentInput: OptimizationInput | null
  draftIncomplete: boolean
  onEdit: (input: OptimizationInput, context?: CaseContext) => void
  onRefine: (result: OptimizationResult) => void
  /** Fly this result in the trajectory simulation */
  onSimulate: (result: OptimizationResult) => void
  onClearComparison: () => void
  running: boolean
  saved: Record<string, string>
  memoryBytes: number | null
  active?: boolean
  selectedTab?: ResultTab
  onTab?: (tab: ResultTab) => void
  /** The saved-runs list, shown as the last tab */
  history: ReactNode
  historyCount: number
  /** Shown instead of the result while a solve is running */
  progress?: ReactNode
}) {
  const run = runs[0],
    reference = runs[1]
  const [localTab, setLocalTab] = useState<ResultTab>('charts')
  const tab = selectedTab ?? localTab
  const setTab = onTab ?? setLocalTab
  const [player] = useState(createPlayback)
  const time = usePlayback((s) => s.t, player)
  usePlayerKeys(undefined, active && !!run, player)
  const setCursor = useCallback((t: number) => player.seek(t), [player])
  const split = useSplitRatio('ot.optimization.split', 0.5)
  const [showCase, setShowCase] = useState(false)
  const lang = useLang()
  const result = run?.result,
    validation = result?.validation
  const multi = validation?.multi_stage,
    flight = validation?.flight
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
  const inputPhases = result?.input.problem.kind === 'multi_stage' ? result.input.problem.phases : null
  const phaseName = useCallback(
    (i: number) => {
      void lang
      return inputPhases
        ? phaseLabel(inputPhases, i, result?.input.problem.kind === 'multi_stage' ? result.input.problem.vehicle : undefined)
        : tr(`区間${i + 1}`, `segment ${i + 1}`)
    },
    [inputPhases, lang, result],
  )
  const prescribed = useCallback((i: number) => !!inputPhases?.[i]?.vertical, [inputPhases])
  const checks = multi?.checks ?? flight?.checks ?? []
  const views = useConstraintViews(checks, phaseName, prescribed)
  const timeline = useMemo(() => (result ? optimizationTimeline(result) : null), [result])
  useEffect(() => {
    if (!timeline) return
    player.pause()
    player.load(timeline.t0, timeline.t1, { speed: suggestedSpeed(timeline.t1 - timeline.t0) })
    player.seek(timeline.t1)
    return () => player.pause()
  }, [player, timeline])
  useEffect(() => {
    if (!active) player.pause()
  }, [active, player])
  const historyTab = { value: 'history' as const, label: `${tr('保存した実行', 'Saved runs')} · ${historyCount}` }
  if (!result || tab === 'history' || progress) {
    const shown = tab === 'history' ? 'history' : progress ? 'progress' : 'empty'
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ResultTabBar
          value={shown === 'history' ? 'history' : 'charts'}
          onChange={setTab}
          options={[
            {
              value: 'charts',
              label: progress ? tr('実行中…', 'Running…') : result ? tr('結果', 'Result') : tr('結果', 'Result'),
            },
            historyTab,
          ]}
        />
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-3">
          {shown === 'history' ? (
            history
          ) : shown === 'progress' ? (
            progress
          ) : (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-[10px] border border-dashed border-line-strong bg-surface p-8 text-center">
              <SplitSquareHorizontal className="mb-3 h-7 w-7 text-ink-3" />
              <h3 className="text-[15px] font-medium">{tr('実行結果はここに表示されます', 'Your results will appear here')}</h3>
              <p className="mt-2 max-w-md text-[12px] leading-relaxed text-ink-2">
                {tr(
                  '左の設定を確認して「最適化を実行」（⌘/Ctrl+Enter）を押すか、保存した実行を開いてください。',
                  'Review the settings on the left and press Run optimization (⌘/Ctrl+Enter), or open a saved run.',
                )}
              </p>
              {historyCount ? (
                <button type="button" className={cn(optButton, 'mt-4')} onClick={() => setTab('history')}>
                  {tr(`保存した実行を開く（${historyCount}件）`, `Open saved runs (${historyCount})`)}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    )
  }
  const currentPoint = mapPath ? pointOnPath(mapPath.points, time) : null
  const stale = draftIncomplete || !currentInput || requestFingerprint(currentInput) !== requestFingerprint(result.input)
  const locate = (v: ConstraintView) => {
    const t = checkTime(result, v.check)
    if (t !== null) {
      setCursor(t)
      setTab('charts')
    }
  }
  const canLocate = (v: ConstraintView) => checkTime(result, v.check) !== null
  const renderMap = (embedded = false) =>
    mapPath ? (
      <div className={cn('flex min-h-0 flex-col gap-1.5', embedded ? 'h-full' : 'h-full min-h-[320px]')}>
        <div
          className="min-h-[100px] flex-1 overflow-hidden rounded-[8px] border border-line"
          aria-label={tr('最適化軌道の3D地図', '3D map of the optimized trajectory')}
          onWheelCapture={(event) => {
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
        {embedded ? null : (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-[11px] text-ink-2">
            <span>
              {tr('実線：燃焼 · 破線：慣性飛行 · Ctrl/⌘＋ホイールで拡大', 'Solid: burn · dashed: coast · Ctrl/⌘ + wheel to zoom')}
              {mapReference ? ` · ${tr('灰色破線：比較対象', 'gray dashed: reference')}` : ''}
              {' · '}
              {tr('分離した段・フェアリングの落下位置は計算していません。', 'Impact points of separated bodies are not computed.')}
            </span>
            <span className="num">
              T+{number(time, 1)} s · {number(currentPoint?.alt === undefined ? undefined : currentPoint.alt / 1000, 1)} km
            </span>
          </div>
        )}
      </div>
    ) : null
  const failedCount = views.filter((v) => !v.check.passed).length
  // Map views fill the panel; the others scroll under the summary.
  const fills = tab === 'split' || tab === 'map'
  return (
    <div className="@container flex min-h-0 flex-1 flex-col">
      <ResultTabBar
        value={tab}
        onChange={setTab}
        options={[
          { value: 'charts', label: tr('グラフ', 'Charts') },
          { value: 'map', label: tr('地図', 'Map'), disabled: !mapPath },
          { value: 'split', label: tr('地図＋グラフ', 'Map + charts'), disabled: !mapPath },
          { value: 'sequence', label: tr('シーケンス・質量', 'Sequence and mass'), disabled: !hasPath },
          { value: 'checks', label: `${tr('条件の確認', 'Checks')}${failedCount ? ` · ${failedCount}` : ''}` },
          ...(reference ? [{ value: 'compare' as const, label: tr('比較', 'Compare') }] : []),
          { value: 'diagnostics', label: tr('計算の詳細', 'Solver details') },
          historyTab,
        ]}
      />
      {showCase && run.context ? <CaseDetails context={run.context} onClose={() => setShowCase(false)} /> : null}
      <div className={cn('flex min-h-0 flex-1 flex-col gap-2 p-3', fills ? 'overflow-hidden' : 'scroll-quiet overflow-y-auto')}>
        <Verdict
          result={result}
          run={run}
          saved={saved[run.id]}
          onEdit={onEdit}
          running={running}
          onRefine={onRefine}
          onSimulate={hasPath ? onSimulate : undefined}
          onCase={run.context ? () => setShowCase(true) : undefined}
          compact={fills}
          note={
            running
              ? tr(
                  '新しい入力を求解中。完了まで前回の結果を表示しています。',
                  'Solving the new input; showing the previous result until it finishes.',
                )
              : stale
                ? tr(
                    'この結果は編集中の設定とは異なる入力で計算したものです。',
                    'This result was computed from an input that differs from the settings being edited.',
                  )
                : null
          }
        />
        {tab === 'charts' || tab === 'sequence' ? (
          <LimitingConstraints canLocate={canLocate} views={views} onLocate={hasPath ? locate : undefined} />
        ) : null}
        {timeline && tab !== 'split' && tab !== 'checks' && tab !== 'compare' && tab !== 'diagnostics' ? (
          <div className="shrink-0 overflow-hidden rounded-[8px] border border-line">
            <PlaybackBar track={timeline} player={player} />
          </div>
        ) : null}
        {tab === 'charts' ? <ResultCharts result={result} reference={reference?.result} cursor={time} onCursor={setCursor} /> : null}
        {tab === 'map' ? <div className="min-h-0 flex-1">{renderMap()}</div> : null}
        {tab === 'split' && timeline ? (
          <div className="flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-[8px] border border-line">
            <SplitView
              ratio={split.ratio}
              onRatio={split.setRatio}
              top={renderMap(true)}
              bar={<PlaybackBar track={timeline} player={player} />}
              bottom={
                <div className="scroll-quiet h-full overflow-y-auto p-2">
                  <ResultCharts result={result} reference={reference?.result} cursor={time} onCursor={setCursor} />
                </div>
              }
            />
          </div>
        ) : null}
        {tab === 'sequence' ? (
          <>
            <OptGroup title={tr('飛行シーケンス', 'Flight sequence')}>
              <SequenceTimeline
                phases={phases}
                actual
                onSelect={(i) => {
                  setCursor(phases[i].start)
                  setTab('charts')
                }}
              />
            </OptGroup>
            {multi ? <MassLedger m={multi} /> : flight ? <SingleLedger result={result} /> : null}
          </>
        ) : null}
        {tab === 'checks' ? (
          <>
            <ConstraintReport canLocate={canLocate} views={views} onLocate={hasPath ? locate : undefined} />
            {multi?.unevaluated_constraints.length ? <Unevaluated items={multi.unevaluated_constraints} /> : null}
          </>
        ) : null}
        {tab === 'compare' && reference ? <Comparison a={run} b={reference} onClear={onClearComparison} /> : null}
        {tab === 'diagnostics' ? <Diagnostics result={result} memoryBytes={memoryBytes} /> : null}
      </div>
    </div>
  )
}

function ResultTabBar({
  value,
  onChange,
  options,
}: {
  value: ResultTab
  onChange: (tab: ResultTab) => void
  options: { value: ResultTab; label: string; disabled?: boolean }[]
}) {
  return (
    <div className="shrink-0 border-b border-line bg-surface px-1.5">
      <OptTabs value={value} onChange={onChange} options={options} label={tr('結果の表示', 'Result views')} variant="underline" />
    </div>
  )
}

function Verdict({
  result,
  run,
  saved,
  onEdit,
  onRefine,
  onSimulate,
  onCase,
  compact,
  note,
  running,
}: {
  result: OptimizationResult
  run: OptimizationRun
  saved: string | undefined
  onEdit: (input: OptimizationInput, context?: CaseContext) => void
  onRefine: (result: OptimizationResult) => void
  onSimulate?: (result: OptimizationResult) => void
  onCase?: () => void
  /** Headline only (the map views need the room) */
  compact?: boolean
  note: string | null
  running: boolean
}) {
  const v = result.validation,
    multi = v?.multi_stage,
    flight = v?.flight
  const p = result.input.problem
  const ok = result.converged && v?.status === 'passed'
  const failed = v?.multi_stage?.checks.filter((c) => !c.passed) ?? v?.flight?.checks.filter((c) => !c.passed) ?? []
  const meshFailure = failed.some((c) => /^(DYN|RK45|Q|AEROLOAD|ACCEL|CONTROL)/.test(c.id))
  const headline = (() => {
    if (multi && p.kind === 'multi_stage') {
      const text = tr(
        `衛星 ${fmt(multi.net_payload_kg, 1)} kg を 高度${fmt(p.orbit.altitude_m / 1000, 0)} km・傾斜角${fmt(p.orbit.inclination_deg, 1)}° の円軌道へ`,
        `${fmt(multi.net_payload_kg, 1)} kg satellite to a ${fmt(p.orbit.altitude_m / 1000, 0)} km, ${fmt(p.orbit.inclination_deg, 1)}° circular orbit`,
      )
      return ok ? text : tr(`暫定：${text}`, `Provisional: ${text}`)
    }
    if (flight && p.kind === 'single_stage')
      return tr(
        `追加ペイロード ${fmt(flight.mass_ledger.additional_payload_kg, 2)} kg で 頂点${fmt(p.target_apogee_altitude_m / 1000, 1)} km へ`,
        `${fmt(flight.mass_ledger.additional_payload_kg, 2)} kg extra payload to a ${fmt(p.target_apogee_altitude_m / 1000, 1)} km apogee`,
      )
    return tr(`目的値 ${number(result.solution?.objective, 8)}`, `Objective ${number(result.solution?.objective, 8)}`)
  })()
  const advice = !result.converged
    ? result.solver_status === 'Maximum_Iterations_Exceeded'
      ? tr(
          '反復数の上限に達しました。詳細設定で最大反復数を増やすか、初期推定（姿勢・衛星質量）を見直してください。',
          'The iteration limit was reached. Increase the maximum iterations in the advanced settings, or revise the initial guess.',
        )
      : tr(
          `最適化が完了しませんでした（${result.solver_status}）。条件が厳しすぎて満たせない可能性があります。制約や機体性能を見直してください。`,
          `The optimization did not finish (${result.solver_status}). The limits may be impossible to meet; revise constraints or vehicle performance.`,
        )
    : v?.status !== 'passed'
      ? meshFailure
        ? tr(
            '最適化は収束しましたが、独立に積分し直すと一部の条件がわずかに満たされませんでした。計算メッシュを細かくして再実行してください。',
            'The optimization converged, but an independent reintegration slightly violates some limits. Re-run with a finer mesh.',
          )
        : tr('独立検証で不合格の項目があります。「条件の確認」を見てください。', 'Independent validation failed; see “Checks”.')
      : null
  const kpis: { label: string; value: string; unit: string }[] = []
  if (multi) {
    const maxQ = Math.max(...multi.samples.map((s) => s.dynamic_pressure_pa))
    const maxG = Math.max(...multi.samples.map((s) => s.specific_force_m_s2)) / 9.80665
    kpis.push(
      { label: tr('正味衛星質量', 'Net satellite'), value: fmt(multi.net_payload_kg, 1), unit: 'kg' },
      { label: tr('全備質量', 'Launch mass'), value: fmt(multi.initial_total_mass_kg / 1000, 2), unit: 't' },
      {
        label: tr('ペイロード比', 'Payload fraction'),
        value: fmt((multi.net_payload_kg / multi.initial_total_mass_kg) * 100, 2),
        unit: '%',
      },
      {
        label: tr('近地点 / 遠地点', 'Perigee / apogee'),
        value: `${fmt(multi.orbit.perigee_altitude_m / 1000, 1)} / ${fmt((multi.orbit.apogee_altitude_m ?? NaN) / 1000, 1)}`,
        unit: 'km',
      },
      { label: tr('衛星分離', 'Deployment'), value: `T+${fmt(multi.final_time_s, 0)}`, unit: 's' },
      { label: tr('最大動圧 / 最大加速度', 'Max q / max accel.'), value: `${fmt(maxQ / 1000, 1)} / ${fmt(maxG, 1)}`, unit: 'kPa / G' },
    )
  } else if (flight) {
    kpis.push(
      { label: tr('追加ペイロード', 'Extra payload'), value: fmt(flight.mass_ledger.additional_payload_kg, 2), unit: 'kg' },
      { label: tr('打上げ質量', 'Launch mass'), value: fmt(flight.mass_ledger.initial_total_kg, 1), unit: 'kg' },
      { label: tr('終端時刻', 'Final time'), value: fmt(flight.final_time_s, 1), unit: 's' },
    )
  }
  const more: { label: string; onSelect: () => void; disabled?: boolean }[] = [
    {
      label: tr('この入力を設定に読み込んで編集', 'Load this input into the settings'),
      onSelect: () => onEdit(result.input, run.context),
      disabled: running,
    },
    ...(onSimulate && !(meshFailure && result.converged && !ok)
      ? [{ label: tr('計算メッシュを細かくして再実行', 'Re-run with a finer mesh'), onSelect: () => onRefine(result), disabled: running }]
      : []),
    ...(run.context
      ? [
          {
            label: tr('結果ケースを保存（.otcase.json）', 'Save result case (.otcase.json)'),
            onSelect: () =>
              saveFile(`${fileBase(run.label)}_result.otcase.json`, caseFile('optimize', run.context!, result), 'application/json'),
          },
        ]
      : []),
    {
      label: tr('全結果JSONを保存', 'Save full result JSON'),
      onSelect: () => saveFile(`${fileBase(run.label)}_optimization.json`, JSON.stringify(result, null, 2), 'application/json'),
    },
    ...(onCase ? [{ label: tr('ケース情報・変換履歴', 'Case details and history'), onSelect: onCase }] : []),
  ]
  return (
    <section
      className={cn(
        'shrink-0 rounded-[10px] border px-3 py-2',
        ok ? 'border-[var(--ok)]/35 bg-[var(--ok)]/5' : 'border-danger/30 bg-danger/5',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex min-w-[min(100%,16rem)] flex-1 items-center gap-2">
          {ok ? <CircleCheck className="h-5 w-5 shrink-0 text-[var(--ok)]" /> : <CircleAlert className="h-5 w-5 shrink-0 text-danger" />}
          <div className="min-w-0">
            <h3 className="break-words text-[14px] font-semibold leading-snug">{headline}</h3>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
              <Badge ok={result.converged} label={result.converged ? tr('収束', 'Converged') : tr('未収束', 'Not converged')} />
              <Badge
                ok={v?.status === 'passed'}
                label={
                  v?.status === 'passed'
                    ? tr('独立検証 合格', 'Check passed')
                    : v
                      ? tr('独立検証 不合格', 'Check failed')
                      : tr('独立検証 未実施', 'Not checked')
                }
              />
              <span className="min-w-0 truncate">
                {run.label} · {new Date(run.createdAt).toLocaleString()}
                {run.origin === 'import' ? tr(' · 読み込んだ結果（再計算なし）', ' · imported, not re-solved') : ''}
                {saved === 'error' ? tr(' · 端末への保存失敗', ' · not saved on this device') : ''}
              </span>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {!ok && meshFailure && result.converged ? (
            <button type="button" className={optPrimary} disabled={running} onClick={() => onRefine(result)}>
              {tr('メッシュを細かくして再実行', 'Re-run with a finer mesh')}
            </button>
          ) : null}
          {onSimulate ? (
            <button
              type="button"
              className={optButton}
              onClick={() => onSimulate(result)}
              title={tr(
                '最適解の姿勢・燃焼時刻・ペイロードを設定した機体を軌道計算で開きます（風・分散の評価に使えます）。',
                'Opens a vehicle with the optimized attitude, burn times and payload in the simulation (for wind and dispersion studies).',
              )}
            >
              <Rocket className="h-3.5 w-3.5" />
              {tr('軌道計算で開く', 'Open in simulation')}
            </button>
          ) : null}
          <Menu
            align="right"
            wide
            trigger={(toggle) => (
              <button
                type="button"
                className={cn(optButton, 'px-2')}
                onClick={toggle}
                aria-haspopup="menu"
                aria-label={tr('その他の操作', 'More actions')}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
            items={more}
          />
        </div>
      </div>
      {kpis.length && !compact ? (
        <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 border-t border-line/70 pt-1.5">
          {kpis.map((k) => (
            <div key={k.label} className="flex min-w-0 items-baseline gap-1.5">
              <dt className="text-[11px] text-ink-3">{k.label}</dt>
              <dd className="num text-[13px] font-medium">
                {k.value} <span className="text-[10px] font-normal text-ink-3">{k.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {advice || note ? (
        <p className="mt-1.5 max-w-4xl text-[12px] leading-snug text-ink-2">
          {advice}
          {advice && note ? ' ' : ''}
          {note ? <span className="text-ink-3">{note}</span> : null}
        </p>
      ) : null}
      {v?.error && !ok ? (
        <details className="mt-1 text-[11px] text-ink-2">
          <summary className="cursor-pointer">{tr('検証メッセージの原文', 'Raw validation message')}</summary>
          <p className="mt-1 break-words">{v.error}</p>
        </details>
      ) : null}
    </section>
  )
}
function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full border bg-surface px-1.5 py-px',
        ok ? 'border-[var(--ok)]/40 text-[var(--ok)]' : 'border-danger/40 text-danger',
      )}
    >
      {label}
    </span>
  )
}

function MassLedger({ m }: { m: MultiStageValidation }) {
  const eventLabels = {
    separate_stage: tr('段分離', 'Stage separation'),
    jettison_fairing: tr('フェアリング投棄', 'Fairing jettison'),
    deploy_payload: tr('衛星分離', 'Payload deployment'),
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <OptGroup
        title={tr('段ごとの推進剤', 'Propellant by stage')}
        note={tr(
          `打上げ質量 ${fmt(m.initial_total_mass_kg, 0)} kg = 各段 + フェアリング ${fmt(m.fairing_kg, 0)} kg + PAF ${fmt(m.payload_adapter_kg, 0)} kg + 衛星 ${fmt(m.net_payload_kg, 1)} kg`,
          `Launch mass ${fmt(m.initial_total_mass_kg, 0)} kg = stages + fairing ${fmt(m.fairing_kg, 0)} kg + PAF ${fmt(m.payload_adapter_kg, 0)} kg + satellite ${fmt(m.net_payload_kg, 1)} kg`,
        )}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px]">
            <thead className="text-[11px] text-ink-3">
              <tr>
                <th className="py-1 font-normal">{tr('段', 'Stage')}</th>
                <th className="py-1 text-right font-normal">{tr('搭載', 'Loaded')}</th>
                <th className="py-1 text-right font-normal">{tr('消費', 'Used')}</th>
                <th className="py-1 text-right font-normal">{tr('残り（予備）', 'Left (reserve)')}</th>
                <th className="py-1 text-right font-normal">{tr('燃焼 / 着火', 'Burn / ignitions')}</th>
              </tr>
            </thead>
            <tbody>
              {m.stage_ledgers.map((s) => (
                <tr key={s.stage} className="border-t border-line">
                  <th className="py-1.5 font-normal">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-full"
                      style={{ background: `var(--stage-${(s.stage % 5) + 1})` }}
                    />
                    {tr(`第${s.stage + 1}段`, `Stage ${s.stage + 1}`)}
                  </th>
                  <td className="num py-1.5 text-right">{fmt(s.propellant_loaded_kg, 0)} kg</td>
                  <td className="num py-1.5 text-right">{fmt(s.propellant_consumed_kg, 0)} kg</td>
                  <td className="num py-1.5 text-right">
                    {fmt(s.residual_kg, 0)} <span className="text-ink-3">({fmt(s.required_reserve_kg, 0)})</span> kg
                  </td>
                  <td className="num py-1.5 text-right">
                    {fmt(s.total_burn_s, 1)} s / {s.ignition_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </OptGroup>
      <OptGroup title={tr('分離・投棄', 'Separation and jettison')}>
        <ul className="divide-y divide-line text-[12px]">
          {m.events.map((e) => (
            <li key={e.phase} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
              <span>
                {eventLabels[e.kind]}
                {e.kind === 'separate_stage' ? tr(`（第${e.stage + 1}段）`, ` (stage ${e.stage + 1})`) : ''}
              </span>
              <span className="num text-ink-2">
                T+{fmt(e.time_s, 1)} s · {tr('高度', 'alt')} {fmt(altitudeAt(m, e.time_s) / 1000, 1)} km · −{fmt(e.removed_mass_kg, 0)} kg
              </span>
            </li>
          ))}
        </ul>
      </OptGroup>
    </div>
  )
}
function altitudeAt(m: MultiStageValidation, t: number) {
  let best = m.samples[0]
  for (const s of m.samples) if (Math.abs(s.time_s - t) < Math.abs(best.time_s - t)) best = s
  return best?.altitude_m ?? NaN
}
function SingleLedger({ result }: { result: OptimizationResult }) {
  const f = result.validation?.flight
  if (!f) return null
  return (
    <OptGroup title={tr('質量収支', 'Mass ledger')}>
      <dl className="grid gap-3 text-[12px] sm:grid-cols-2">
        {Object.entries({
          [tr('打上げ質量', 'Launch mass')]: f.mass_ledger.initial_total_kg,
          [tr('消費した推進剤', 'Propellant used')]: f.mass_ledger.propellant_burned_kg,
          [tr('残った推進剤', 'Propellant left')]: f.mass_ledger.propellant_remaining_kg,
          [tr('終端質量', 'Final mass')]: f.mass_ledger.final_total_kg,
        }).map(([label, v]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt className="text-ink-2">{label}</dt>
            <dd className="num">{number(v)} kg</dd>
          </div>
        ))}
      </dl>
    </OptGroup>
  )
}
function Unevaluated({ items }: { items: string[] }) {
  const labels: Record<string, string> = {
    FAIRING: tr('フェアリング投棄後の空力加熱', 'Aerodynamic heating after fairing jettison'),
    RANGE: tr('飛行経路の制限区域・分離物の落下域', 'Flight corridor and impact regions of separated bodies'),
    STAGING: tr('分離時の相対運動・再接触', 'Relative motion and recontact at separation'),
    'GNC/ENV': tr('姿勢運動（6自由度）・制御応答・構造/音響荷重', '6-DoF attitude motion, control response, structural/acoustic loads'),
    ENGINE: tr('再着火のための推進剤沈降・熱/電力', 'Propellant settling and thermal/power resources for restart'),
  }
  return (
    <section className="rounded-[9px] border border-line bg-surface p-4 text-[12px]">
      <h3 className="font-semibold">{tr('この計算で評価していない条件', 'Conditions not evaluated here')}</h3>
      <p className="mt-1 text-ink-2">
        {tr(
          '次は合否に含まれていません。実機の成立性はこれらの検討も必要です。',
          'These are outside the pass/fail result; real missions need them too.',
        )}
      </p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink-2">
        {items.map((text) => (
          <li key={text}>{labels[text.split(' ')[0]] ?? text}</li>
        ))}
      </ul>
    </section>
  )
}

function Comparison({ a, b, onClear }: { a: OptimizationRun; b: OptimizationRun; onClear: () => void }) {
  const compatible = samePhysicalProblem(a.result.input, b.result.input)
  const rows: { label: string; read: (r: OptimizationResult) => string }[] = [
    { label: tr('最適化', 'Optimization'), read: (r) => (r.converged ? tr('収束', 'converged') : r.solver_status) },
    {
      label: tr('独立検証', 'Independent check'),
      read: (r) => (r.validation ? (r.validation.status === 'passed' ? tr('合格', 'passed') : tr('不合格', 'failed')) : '—'),
    },
  ]
  if (a.result.validation?.multi_stage && b.result.validation?.multi_stage)
    rows.push(
      { label: tr('正味衛星 [kg]', 'Net satellite [kg]'), read: (r) => number(r.validation?.multi_stage?.net_payload_kg, 3) },
      { label: tr('全備質量 [kg]', 'Launch mass [kg]'), read: (r) => number(r.validation?.multi_stage?.initial_total_mass_kg, 1) },
      { label: tr('衛星分離 [s]', 'Deployment [s]'), read: (r) => number(r.validation?.multi_stage?.final_time_s, 1) },
      {
        label: tr('近地点 [km]', 'Perigee [km]'),
        read: (r) => number((r.validation?.multi_stage?.orbit.perigee_altitude_m ?? NaN) / 1000, 3),
      },
      {
        label: tr('遠地点 [km]', 'Apogee [km]'),
        read: (r) => number((r.validation?.multi_stage?.orbit.apogee_altitude_m ?? NaN) / 1000, 3),
      },
      { label: tr('傾斜角 [°]', 'Inclination [°]'), read: (r) => number(r.validation?.multi_stage?.orbit.inclination_deg, 5) },
    )
  else if (a.result.validation?.flight && b.result.validation?.flight)
    rows.push({
      label: tr('追加ペイロード [kg]', 'Extra payload [kg]'),
      read: (r) => number(r.validation?.flight?.mass_ledger.additional_payload_kg, 4),
    })
  rows.push(
    {
      label: tr('再積分の位置差 [m]', 'Reintegration position diff. [m]'),
      read: (r) => number(r.validation?.multi_stage?.max_position_error_m ?? r.validation?.flight?.max_position_error_m, 4),
    },
    { label: tr('反復数', 'Iterations'), read: (r) => String(r.iterations.length) },
  )
  return (
    <OptGroup
      title={
        <span className="flex items-center justify-between gap-2">
          {tr('2件の比較', 'Two-run comparison')}
          <button type="button" className="text-[11px] font-normal text-ink-3 underline" onClick={onClear}>
            {tr('比較をやめる', 'Remove comparison')}
          </button>
        </span>
      }
      note={
        compatible
          ? tr(
              '物理条件は同じです（メッシュ・初期推定・ソルバー設定のみ異なる）。グラフの灰色破線が比較対象です。',
              'Same physical problem (only mesh, guess or solver settings differ). The gray dashed lines in the charts are the reference.',
            )
          : tr(
              '物理条件（機体・目標・制約）が異なります。グラフの灰色破線が比較対象です。',
              'The physical problem differs (vehicle, target or limits). The gray dashed lines in the charts are the reference.',
            )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr>
              <th className="p-2" />
              {[a, b].map((record, index) => (
                <th key={record.id} className="min-w-44 p-2 align-top">
                  <span className="block text-[10px] font-normal text-ink-3">
                    {index === 0 ? tr('表示中', 'Shown') : tr('比較対象', 'Reference')}
                  </span>
                  {record.label}
                  <span className="mt-1 block text-[10px] font-normal text-ink-3">{new Date(record.createdAt).toLocaleString()}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
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

function Diagnostics({ result, memoryBytes }: { result: OptimizationResult; memoryBytes: number | null }) {
  const [query, setQuery] = useState(''),
    [showVectors, setShowVectors] = useState(false)
  const scaling = result.flight_scaling
  return (
    <div className="space-y-3">
      <OptGroup title={tr('実行の記録', 'Run record')}>
        <dl className="grid gap-2 break-all text-[12px] sm:grid-cols-2">
          {Object.entries({
            [tr('実行ID', 'Run ID')]: result.input.run_id,
            [tr('ソルバー', 'Solver')]: result.solver_version,
            [tr('コード版', 'Code revision')]: result.code_revision,
            [tr('終了理由', 'Solver status')]: result.solver_status,
            [tr('反復数', 'Iterations')]: String(result.iterations.length),
            [tr('WASMメモリ', 'WASM memory')]: memoryBytes === null ? '—' : `${number(memoryBytes / 1024 / 1024, 2)} MiB`,
            [tr('再積分の最大位置差', 'Max reintegration position diff.')]: `${number(
              result.validation?.multi_stage?.max_position_error_m ??
                result.validation?.flight?.max_position_error_m ??
                result.validation?.trajectory?.max_position_error_m,
              4,
            )} m`,
            [tr('再積分の最大速度差', 'Max reintegration velocity diff.')]: `${number(
              result.validation?.multi_stage?.max_velocity_error_m_s ??
                result.validation?.flight?.max_velocity_error_m_s ??
                result.validation?.trajectory?.max_velocity_error_m_s,
              5,
            )} m/s`,
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
        <OptGroup title={tr('変数の尺度（求解中は固定）', 'Variable scales (fixed during the solve)')}>
          <dl className="grid grid-cols-2 gap-3 text-[12px] sm:grid-cols-5">
            {Object.entries({
              [tr('質量 [kg]', 'Mass [kg]')]: scaling.mass_kg,
              [tr('位置 [m]', 'Position [m]')]: scaling.position_m,
              [tr('速度 [m/s]', 'Velocity [m/s]')]: scaling.velocity_m_s,
              [tr('時間 [s]', 'Time [s]')]: scaling.time_s,
              [tr('目的の質量 [kg]', 'Objective mass [kg]')]: scaling.payload_objective_kg,
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
        title={tr('最適化変数・ラグランジュ乗数', 'Variables and multipliers')}
        note={tr(
          '最適化内部の尺度での値です。全件は結果JSONにあります。',
          'Values in the solver’s internal scaling. All values are in the result JSON.',
        )}
      >
        <button type="button" className={optButton} aria-expanded={showVectors} onClick={() => setShowVectors(!showVectors)}>
          {showVectors ? tr('閉じる', 'Hide') : tr('表示する', 'Show')} ({result.variable_names.length} / {result.constraint_names.length})
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
            <p className="text-[11px] text-ink-3">{tr('各一覧は最大200件まで表示します。', 'Each list shows at most 200 matches.')}</p>
          </>
        ) : null}
      </OptGroup>
      <details className="rounded-[8px] border border-line bg-surface p-4">
        <summary className="cursor-pointer text-[12px] text-ink-2">
          {tr('実行時の入力とソルバー設定', 'Recorded input and solver options')}
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
