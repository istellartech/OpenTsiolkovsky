import { tr } from '../../lib/i18n'
import type { PhaseView } from '../../lib/optimization-input'

export function SequenceTimeline({
  phases,
  onSelect,
  selected,
  actual = false,
}: {
  phases: PhaseView[]
  onSelect?: (i: number) => void
  selected?: number
  actual?: boolean
}) {
  const total = phases[phases.length - 1]?.end ?? 0
  if (!phases.length) return null
  return (
    <div>
      <div className="mb-2 flex flex-wrap justify-between gap-2 text-[11px] text-ink-3">
        <span>{actual ? tr('再積分の時刻', 'Reintegrated times') : tr('初期推定の時刻', 'Initial-guess times')}</span>
        <span className="num">T+0 — {total.toFixed(2)} s</span>
      </div>
      <div className="flex h-8 overflow-hidden rounded-[6px] border border-line" aria-hidden="true">
        {phases.map((phase, i) => (
          <div
            key={i}
            title={`${phase.name}: ${phase.duration} s`}
            style={{
              width: `${(Math.max(0, phase.duration) / Math.max(1, total)) * 100}%`,
              backgroundColor: `var(--stage-${(phase.stage % 5) + 1})`,
              opacity: phase.powered ? 1 : 0.28,
            }}
          />
        ))}
      </div>
      <ol className="mt-3 grid gap-1 sm:grid-cols-2">
        {phases.map((phase, i) => (
          <li key={i}>
            <button
              type="button"
              disabled={!onSelect}
              onClick={() => onSelect?.(i)}
              aria-pressed={onSelect ? selected === i : undefined}
              className={`flex min-h-10 w-full items-center gap-2 rounded-[6px] border px-2 py-1.5 text-left text-[11px] ${selected === i ? 'border-signal bg-signal/5' : 'border-transparent'} ${onSelect ? 'hover:bg-surface-2' : 'cursor-default'}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: `var(--stage-${(phase.stage % 5) + 1})`, opacity: phase.powered ? 1 : 0.4 }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-ink-2">{phase.name}</span>
                <span className="text-ink-3">
                  {tr(`第${phase.stage + 1}段`, `Stage ${phase.stage + 1}`)} · {phase.powered ? tr('燃焼', 'Burn') : tr('惰行', 'Coast')} ·{' '}
                  {phase.fixed ? tr('固定', 'Fixed') : tr('時間を最適化', 'Optimized duration')}
                </span>
              </span>
              <span className="num shrink-0 text-right text-ink-2">
                {phase.start.toFixed(1)}–{phase.end.toFixed(1)}
                <span className="block text-ink-3">{phase.duration.toFixed(2)} s</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
