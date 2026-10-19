import { useEffect, useMemo, useState } from 'react'
import { Square } from 'lucide-react'
import type { LiveProgress } from '../../hooks/useOptimization'
import type { OptimizationInput } from '../../lib/optimization-input'
import { isRocketInput } from '../../lib/optimization-input'
import { fmt } from '../../lib/format'
import { tr } from '../../lib/i18n'
import { cssVar } from '../../lib/theme'
import { OptChart, type OptSeries } from './OptChart'
import { optButton } from './styles'
import { cn } from '../../lib/cn'

const MU = 3.986004418e14

/** What the solver is doing, in words, from the scaled constraint violation. */
function solverStage(primal: number, tolerance: number, restoration: boolean) {
  if (restoration)
    return {
      title: tr('立て直し中', 'Recovering'),
      text: tr(
        '改善が止まったため、いったんペイロードを気にせず制約違反を減らす方向へ探索しています（復元フェーズ）。',
        'Progress stalled, so the solver is temporarily ignoring payload and reducing constraint violation (restoration phase).',
      ),
    }
  if (primal > 1e-3)
    return {
      title: tr('条件を満たす軌道を探索中', 'Looking for a feasible trajectory'),
      text: tr(
        'まだ軌道投入・荷重・運動方程式の条件を満たしていません。条件を満たす方向へ軌道を修正しています。',
        'Orbit, load and dynamics conditions are not yet met. The trajectory is being corrected toward them.',
      ),
    }
  if (primal > tolerance * 10)
    return {
      title: tr('条件をほぼ満たし、ペイロードを増加中', 'Nearly feasible, increasing payload'),
      text: tr(
        '条件の違反は小さくなりました。違反を減らしながらペイロードを増やしています。',
        'Violations are small. Payload is being increased while violations shrink further.',
      ),
    }
  return {
    title: tr('最終調整中', 'Final convergence'),
    text: tr(
      '条件は満たしています。これ以上ペイロードを増やせないこと（最適性）を確認しています。',
      'Conditions are met. The solver is confirming that payload cannot be increased further (optimality).',
    ),
  }
}

export function ProgressView({
  live,
  input,
  status,
  onCancel,
}: {
  live: LiveProgress
  input: OptimizationInput | null
  status: 'loading' | 'solving'
  onCancel: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [])
  const last = live.iterations[live.iterations.length - 1]
  const snapshot = live.snapshots[live.snapshots.length - 1]?.snapshot
  const p = input?.problem
  const orbit = p?.kind === 'multi_stage' ? p.orbit : null
  const targetKm = orbit ? orbit.altitude_m / 1000 : p?.kind === 'single_stage' ? p.target_apogee_altitude_m / 1000 : null
  const targetSpeed = orbit ? Math.sqrt(MU / (orbit.reference_radius_m + orbit.altitude_m)) : null
  const tolerance = input?.solver?.tolerance ?? 1e-8
  const maxIter = input?.solver?.max_iterations ?? 300
  const elapsed = Math.max(0, (now - live.startedAt) / 1000)
  // L-BFGS iterates oscillate; judge the phase from the best recent violation.
  const recent = live.iterations.slice(-12)
  const stage = last ? solverStage(Math.min(...recent.map((r) => r.primal_infeasibility)), tolerance, last.restoration) : null
  const colors = useMemo(
    () => ({ signal: cssVar('--signal'), ink3: cssVar('--ink-3'), danger: cssVar('--danger'), s2: cssVar('--stage-2') }),
    [],
  )
  const trajectory = useMemo(() => {
    const out: OptSeries[] = live.snapshots.map((s, i, all) => {
      const current = i === all.length - 1
      return {
        label: current ? tr(`反復${s.iteration}`, `iteration ${s.iteration}`) : tr('以前の反復', 'earlier iterations'),
        points: s.snapshot.downrange_m.map((d, k) => ({ x: d / 1000, y: s.snapshot.altitude_m[k] / 1000 })),
        color: current ? colors.signal : colors.ink3,
        faint: !current,
        width: current ? 2.25 : 1,
      }
    })
    if (targetKm !== null && snapshot) {
      const xMax = Math.max(...snapshot.downrange_m) / 1000
      out.push({
        label: tr('目標高度', 'Target altitude'),
        points: [
          { x: 0, y: targetKm },
          { x: xMax, y: targetKm },
        ],
        color: colors.s2,
        dash: [5, 4],
      })
    }
    return out
  }, [live.snapshots, snapshot, targetKm, colors])
  const speed = useMemo(() => {
    const out: OptSeries[] = live.snapshots.map((s, i, all) => ({
      label: i === all.length - 1 ? tr('慣性速度', 'Inertial speed') : tr('以前の反復', 'earlier iterations'),
      points: s.snapshot.time_s.map((t, k) => ({ x: t, y: s.snapshot.speed_m_s[k] / 1000 })),
      color: i === all.length - 1 ? colors.signal : colors.ink3,
      faint: i !== all.length - 1,
    }))
    if (targetSpeed !== null && snapshot) {
      const tMax = snapshot.time_s[snapshot.time_s.length - 1]
      out.push({
        label: tr('円軌道速度', 'Circular speed'),
        points: [
          { x: 0, y: targetSpeed / 1000 },
          { x: tMax, y: targetSpeed / 1000 },
        ],
        color: colors.s2,
        dash: [5, 4],
      })
    }
    return out
  }, [live.snapshots, snapshot, targetSpeed, colors])
  const convergence = useMemo<OptSeries[]>(() => {
    const it = live.iterations.filter((r) => r.primal_infeasibility > 0 && r.dual_infeasibility > 0)
    return [
      {
        label: tr('制約違反', 'Constraint violation'),
        points: it.map((r) => ({ x: r.iteration, y: r.primal_infeasibility })),
        color: colors.signal,
      },
      {
        label: tr('最適性の残差', 'Optimality residual'),
        points: it.map((r) => ({ x: r.iteration, y: r.dual_infeasibility })),
        color: colors.s2,
      },
      {
        label: tr('収束の許容値', 'Tolerance'),
        points: it.length
          ? [
              { x: 0, y: tolerance },
              { x: Math.max(1, it[it.length - 1].iteration), y: tolerance },
            ]
          : [],
        color: colors.ink3,
        dash: [4, 4],
      },
    ]
  }, [live.iterations, tolerance, colors])
  const payload = useMemo<OptSeries[]>(
    () => [{ label: tr('ペイロード', 'Payload'), points: live.payload.map((p) => ({ x: p.iteration, y: p.kg })), color: colors.signal }],
    [live.payload, colors],
  )
  const perigee = snapshot?.perigee_altitude_m ?? null,
    apogee = snapshot?.apogee_altitude_m ?? null,
    incl = snapshot?.inclination_deg ?? null
  const maxAlt = snapshot ? Math.max(...snapshot.altitude_m) / 1000 : null
  return (
    <div className="space-y-3">
      <section className="rounded-[10px] border border-signal/30 bg-signal/5 px-3 py-3 sm:px-4" role="status" aria-live="polite">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[11px] text-ink-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-signal" />
              {status === 'loading' ? tr('最適化エンジンを準備中…', 'Preparing the optimizer…') : tr('最適化を実行中', 'Optimizing')}
              <span className="num">· {fmt(elapsed, 0)} s</span>
              {input?.problem.kind === 'multi_stage' && input.problem.initial_guess ? (
                <span className="rounded-full border border-line bg-surface px-2 py-0.5">
                  {tr('前回の結果から開始', 'Started from the previous result')}
                </span>
              ) : null}
            </p>
            <h3 className="mt-0.5 text-[15px] font-semibold">
              {stage?.title ?? tr('初期軌道を作成中', 'Building the initial trajectory')}
            </h3>
            <p className="mt-0.5 max-w-3xl text-[11px] leading-snug text-ink-2">
              {stage?.text ??
                tr(
                  '入力した姿勢の初期値から軌道を積分し、最適化の出発点を作っています。',
                  'Integrating the initial attitude guess to build the starting trajectory.',
                )}
            </p>
          </div>
          <button type="button" className={optButton} onClick={onCancel}>
            <Square className="h-3.5 w-3.5" />
            {tr('中断', 'Cancel')}
          </button>
        </div>
        <div className="mt-2">
          <div className="flex justify-between text-[10px] text-ink-3">
            <span className="num">
              {tr('反復', 'Iteration')} {last?.iteration ?? 0} / {maxIter}
            </span>
            <span>{tr('反復数は目安です（多くは上限より早く終わります）', 'Upper limit; most runs finish earlier')}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full bg-signal transition-[width]"
              style={{ width: `${Math.min(100, ((last?.iteration ?? 0) / maxIter) * 100)}%` }}
            />
          </div>
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Kpi
            label={isRocketInput(p ?? { kind: 'hs071' }) ? tr('現在のペイロード', 'Current payload') : tr('目的値', 'Objective')}
            value={snapshot ? fmt(snapshot.payload_kg, 1) : last ? last.objective.toPrecision(6) : '—'}
            unit={snapshot ? 'kg' : ''}
            note={tr('条件を満たすまでは暫定値', 'Provisional until feasible')}
          />
          {orbit ? (
            <>
              <Kpi
                label={tr('近地点 / 遠地点', 'Perigee / apogee')}
                value={`${perigee === null ? '—' : fmt(perigee / 1000, 0)} / ${apogee === null ? '—' : fmt(apogee / 1000, 0)}`}
                unit="km"
                note={tr(
                  `目標 ${fmt(orbit.altitude_m / 1000, 0)} km 円軌道 · 終端の状態から計算`,
                  `Target ${fmt(orbit.altitude_m / 1000, 0)} km circular · from the final state`,
                )}
                ok={
                  perigee !== null &&
                  apogee !== null &&
                  Math.abs(perigee - orbit.altitude_m) < 5000 &&
                  Math.abs(apogee - orbit.altitude_m) < 5000
                }
              />
              <Kpi
                label={tr('軌道傾斜角', 'Inclination')}
                value={incl === null ? '—' : fmt(incl, 2)}
                unit="°"
                note={tr(`目標 ${fmt(orbit.inclination_deg, 1)}°`, `Target ${fmt(orbit.inclination_deg, 1)}°`)}
                ok={incl !== null && Math.abs(incl - orbit.inclination_deg) < 0.05}
              />
            </>
          ) : (
            <Kpi
              label={tr('最高高度', 'Max altitude')}
              value={maxAlt === null ? '—' : fmt(maxAlt, 1)}
              unit="km"
              note={targetKm !== null ? tr(`目標 ${fmt(targetKm, 1)} km`, `Target ${fmt(targetKm, 1)} km`) : undefined}
            />
          )}
          <Kpi
            label={tr('制約違反（無次元）', 'Constraint violation (scaled)')}
            value={last ? last.primal_infeasibility.toExponential(1) : '—'}
            unit=""
            note={tr(`許容値 ${tolerance.toExponential(0)} まで下げる`, `Driven below ${tolerance.toExponential(0)}`)}
            ok={!!last && last.primal_infeasibility <= tolerance}
          />
        </dl>
      </section>
      <div className="grid gap-2 lg:grid-cols-2 2xl:grid-cols-4">
        <OptChart
          title={tr('軌道の変化（高度 × 地表距離）', 'Trajectory evolution (altitude vs. ground distance)')}
          unit="km"
          xLabel={tr('地表距離 [km]', 'Ground distance [km]')}
          series={trajectory}
          height={230}
          note={tr(
            '赤：最新の反復の軌道、灰色：以前の反復。反復ごとに軌道が目標へ近づく様子です。',
            'Red: latest iteration; gray: earlier ones. Watch the trajectory move toward the target.',
          )}
        />
        <OptChart
          title={tr('速度の変化', 'Speed evolution')}
          unit="km/s"
          xLabel={tr('打上げからの時間 [s]', 'Time since launch [s]')}
          series={speed}
          digits={3}
          height={230}
          note={tr(
            '最後に目標の円軌道速度（青破線）へ届けば投入できます。',
            'Insertion requires reaching the circular speed (blue dashed).',
          )}
        />
        <OptChart
          title={tr('収束の進み具合', 'Convergence')}
          unit=""
          xLabel={tr('反復', 'Iteration')}
          series={convergence}
          logY
          height={200}
          note={tr('2本とも許容値（灰破線）を下回ると収束です。', 'Converged when both fall below the tolerance (gray dashed).')}
        />
        <OptChart
          title={tr('ペイロードの推移', 'Payload history')}
          unit="kg"
          xLabel={tr('反復', 'Iteration')}
          series={payload}
          height={200}
          note={tr(
            '条件を満たす前の値は物理的に成立していません。最終的な値は結果で確認してください。',
            'Values before feasibility are not physically achievable. Read the final value in the results.',
          )}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-ink-3">
        {tr(
          'グラフはソルバーが最後に評価した点を約0.25秒ごとに表示しています。途中の軌道は運動方程式をまだ満たしていない（区間のつなぎ目がずれている）ことがあり、近地点・遠地点は終端の状態だけから計算した値です。制約違反が上下に振れるのはこの解法では普通です。完了後に、最適化した制御を独立に積分し直して合否を判定します。',
          'Charts show the solver’s most recently evaluated point about every 0.25 s. Intermediate trajectories may not satisfy the equations of motion yet (segments may not join), and perigee/apogee come from the final state alone. The violation oscillating up and down is normal for this method. After the solve, the controls are reintegrated independently to judge the result.',
        )}
      </p>
    </div>
  )
}

function Kpi({ label, value, unit, note, ok }: { label: string; value: string; unit: string; note?: string; ok?: boolean }) {
  return (
    <div className="min-w-0 rounded-[8px] border border-line bg-surface px-3 py-1.5">
      <dt className="flex items-center gap-1.5 text-[11px] text-ink-2">
        {ok !== undefined ? <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-[var(--ok)]' : 'bg-line-strong')} /> : null}
        {label}
      </dt>
      <dd className="num text-[16px] font-medium">
        {value} <span className="text-[11px] font-normal text-ink-3">{unit}</span>
      </dd>
      {note ? <p className="mt-0.5 text-[10px] text-ink-3">{note}</p> : null}
    </div>
  )
}
