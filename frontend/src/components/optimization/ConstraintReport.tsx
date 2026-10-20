import { useMemo, useState } from 'react'
import { Check, MapPin, X } from 'lucide-react'
import type { PhysicalCheck } from '../../lib/optimization'
import { constraintView, FAMILY_ORDER, familyHelp, familyLabel, type ConstraintView } from '../../lib/optimization-constraints'
import { tr } from '../../lib/i18n'
import { cn } from '../../lib/cn'

const num = (v: number | null, unit: string) => {
  if (v === null || !Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  const digits = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4
  return `${v.toLocaleString(undefined, { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`
}

export function useConstraintViews(checks: PhysicalCheck[], phaseName: (i: number) => string, prescribed: (i: number) => boolean) {
  return useMemo(() => checks.map((c) => constraintView(c, phaseName, prescribed)), [checks, phaseName, prescribed])
}

/** Limits the optimum presses against, in plain words. */
export function LimitingConstraints({
  views,
  onLocate,
  canLocate = () => true,
}: {
  views: ConstraintView[]
  onLocate?: (v: ConstraintView) => void
  canLocate?: (v: ConstraintView) => boolean
}) {
  const active = views.filter((v) => v.active)
  const [expanded, setExpanded] = useState(false)
  if (!active.length) return null
  return (
    <details className="rounded-[9px] border border-line bg-surface px-3 py-2 sm:px-4">
      <summary className="cursor-pointer text-[13px] font-semibold">
        {tr('ペイロードを制限している条件', 'Limits that cap the payload')} · {active.length}
      </summary>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-3">
        {tr(
          '上限・下限に近い条件です。ペイロードへの影響の大きさは、感度や再計算で確認してください。',
          'Conditions close to their bounds. Use sensitivities or re-solves to determine their effect on payload.',
        )}
      </p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
        {(expanded ? active : active.slice(0, 3)).map((v) => (
          <li key={v.check.id} className="flex items-center gap-2 rounded-[7px] border border-line bg-surface-2 px-2.5 py-1 text-[12px]">
            <span className="h-2 w-2 shrink-0 rounded-full bg-signal" />
            <span className="min-w-0 flex-1">
              <span className="block">{v.label}</span>
              <span className="num text-[11px] text-ink-3">
                {num(v.value, v.unit)} /{' '}
                {v.upper !== null && (v.lower === null || v.value > (v.lower + v.upper) / 2) ? tr('上限', 'max') : tr('下限', 'min')}{' '}
                {num(v.upper !== null && (v.lower === null || v.value > (v.lower + v.upper) / 2) ? v.upper : v.lower, v.unit)}
              </span>
            </span>
            {onLocate && canLocate(v) ? (
              <button
                type="button"
                className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface"
                aria-label={tr('グラフでその時刻を見る', 'Show that time in the charts')}
                title={tr('グラフでその時刻を見る', 'Show that time in the charts')}
                onClick={() => onLocate(v)}
              >
                <MapPin className="h-3.5 w-3.5 text-ink-3" />
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {active.length > 3 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 min-h-8 text-[12px] text-ink-2 underline"
        >
          {expanded ? tr('折りたたむ', 'Show fewer') : tr(`全${active.length}件を見る`, `Show all ${active.length}`)}
        </button>
      ) : null}
    </details>
  )
}

/** Every check grouped by family, with how much of each limit is used. */
export function ConstraintReport({
  views,
  onLocate,
  canLocate = () => true,
}: {
  views: ConstraintView[]
  onLocate?: (v: ConstraintView) => void
  canLocate?: (v: ConstraintView) => boolean
}) {
  const [onlyFailed, setOnlyFailed] = useState(false)
  const failures = views.filter((v) => !v.check.passed).length
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-2">
          {failures
            ? tr(`${views.length}件中 ${failures}件が満たされていません。`, `${failures} of ${views.length} checks are not met.`)
            : tr(
                `${views.length}件すべての条件を満たしています（再積分で確認）。`,
                `All ${views.length} checks are met (confirmed by reintegration).`,
              )}
        </p>
        {failures ? (
          <label className="flex min-h-9 items-center gap-2 text-[12px] text-ink-2">
            <input
              type="checkbox"
              checked={onlyFailed}
              onChange={(e) => setOnlyFailed(e.target.checked)}
              className="accent-[var(--signal)]"
            />
            {tr('満たしていない条件だけ表示', 'Show unmet checks only')}
          </label>
        ) : null}
      </div>
      {FAMILY_ORDER.map((family) => {
        const rows = views.filter((v) => v.family === family && (!onlyFailed || !v.check.passed))
        if (!rows.length) return null
        const bad = rows.filter((v) => !v.check.passed).length
        const numerical = family === 'numerical' || family === 'payload'
        return (
          <details key={family} open={!numerical || bad > 0} className="rounded-[9px] border border-line bg-surface">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2">
              {bad ? <X className="h-4 w-4 text-danger" /> : <Check className="h-4 w-4 text-[var(--ok)]" />}
              <span className="text-[13px] font-semibold">{familyLabel(family)}</span>
              <span className="text-[11px] text-ink-3">
                {bad ? tr(`${bad}件が未達`, `${bad} unmet`) : tr(`${rows.length}件 合格`, `${rows.length} passed`)}
                {rows.some((r) => r.active)
                  ? tr(
                      ` · ${rows.filter((r) => r.active).length}件が上限・下限ぎりぎり`,
                      ` · ${rows.filter((r) => r.active).length} at a limit`,
                    )
                  : ''}
              </span>
            </summary>
            <div className="border-t border-line px-3 pb-2 pt-1.5">
              <p className="mb-2 text-[11px] leading-relaxed text-ink-3">{familyHelp(family)}</p>
              <ul className="divide-y divide-line">
                {rows.map((v) => (
                  <ConstraintRow key={v.check.id} v={v} onLocate={canLocate(v) ? onLocate : undefined} />
                ))}
              </ul>
            </div>
          </details>
        )
      })}
    </div>
  )
}

function ConstraintRow({ v, onLocate }: { v: ConstraintView; onLocate?: (v: ConstraintView) => void }) {
  const range = v.equality
    ? tr(`目標 ${num(v.lower, v.unit)}`, `target ${num(v.lower, v.unit)}`)
    : v.lower !== null && v.upper !== null
      ? `${num(v.lower, v.unit)} 〜 ${num(v.upper, v.unit)}`
      : v.upper !== null
        ? tr(`上限 ${num(v.upper, v.unit)}`, `max ${num(v.upper, v.unit)}`)
        : v.lower !== null
          ? tr(`下限 ${num(v.lower, v.unit)}`, `min ${num(v.lower, v.unit)}`)
          : ''
  const usage = v.usage === null ? null : Math.max(0, Math.min(1, v.usage))
  return (
    <li className="grid items-center gap-x-3 gap-y-1 py-1 text-[12px] sm:grid-cols-[minmax(0,1fr)_9rem_minmax(0,11rem)_auto]">
      <span className="min-w-0">
        <span className={cn(!v.check.passed && 'font-medium text-danger')}>{v.label}</span>
        <span className="ml-2 text-[10px] text-ink-3">{v.check.id}</span>
      </span>
      <span className="num text-ink">{num(v.value, v.unit)}</span>
      <span className="min-w-0">
        <span className="num block text-[11px] text-ink-3">{range}</span>
        {usage !== null ? (
          <span
            className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-2"
            title={tr(`余裕の使用率 ${Math.round(usage * 100)}%`, `${Math.round(usage * 100)}% of the margin used`)}
          >
            <span
              className={cn('block h-full', !v.check.passed ? 'bg-danger' : v.active ? 'bg-signal' : 'bg-ink-3/50')}
              style={{ width: `${usage * 100}%` }}
            />
          </span>
        ) : null}
      </span>
      <span className="flex items-center gap-1 justify-self-end">
        <span className={cn('whitespace-nowrap text-[11px]', !v.check.passed ? 'text-danger' : v.active ? 'text-signal' : 'text-ink-3')}>
          {!v.check.passed ? tr('未達', 'Unmet') : v.active ? tr('ぎりぎり', 'At limit') : tr('合格', 'OK')}
        </span>
        {onLocate && v.phase !== null ? (
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-2"
            aria-label={tr('グラフでその時刻を見る', 'Show that time in the charts')}
            onClick={() => onLocate(v)}
          >
            <MapPin className="h-3.5 w-3.5 text-ink-3" />
          </button>
        ) : null}
      </span>
    </li>
  )
}
