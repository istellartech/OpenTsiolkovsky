import { tr } from '../../lib/i18n'
import type { PhaseView } from '../../lib/optimization-input'
import { fmt } from '../../lib/format'

const stageColor = (stage: number) => `var(--stage-${(stage % 5) + 1})`

/** Phase bar (burn solid, coast pale) with optional clickable list. */
export function SequenceTimeline({
  phases,
  onSelect,
  selected,
  actual = false,
  compact = false,
}: {
  phases: PhaseView[]
  onSelect?: (i: number) => void
  selected?: number
  actual?: boolean
  compact?: boolean
}) {
  const total = phases[phases.length - 1]?.end ?? 0
  if (!phases.length) return null
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-[11px] text-ink-3">
        <span>
          {actual ? tr('実際の時刻（再積分）', 'Actual times (reintegrated)') : tr('初期推定の時刻', 'Initial-guess times')} ·{' '}
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-ink-3" /> {tr('燃焼', 'burn')}
          </span>{' '}
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-ink-3/30" /> {tr('慣性飛行', 'coast')}
          </span>
        </span>
        <span className="num">T+0 — {fmt(total, 1)} s</span>
      </div>
      <div className="flex h-7 overflow-hidden rounded-[6px] border border-line">
        {phases.map((phase, i) => (
          <button
            type="button"
            key={i}
            disabled={!onSelect}
            onClick={() => onSelect?.(i)}
            title={`${phase.name}: ${fmt(phase.start, 1)}–${fmt(phase.end, 1)} s`}
            aria-label={`${phase.name}: ${fmt(phase.duration, 1)} s`}
            className={`h-full border-r border-surface last:border-r-0 ${selected === i ? 'outline outline-2 -outline-offset-2 outline-ink' : ''}`}
            style={{
              width: `${(Math.max(0, phase.duration) / Math.max(1, total)) * 100}%`,
              backgroundColor: stageColor(phase.stage),
              opacity: phase.powered ? 1 : 0.3,
            }}
          />
        ))}
      </div>
      {compact ? null : (
        <ol className="mt-3 grid gap-1 sm:grid-cols-2">
          {phases.map((phase, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!onSelect}
                onClick={() => onSelect?.(i)}
                aria-pressed={onSelect ? selected === i : undefined}
                className={`flex min-h-9 w-full items-center gap-2 rounded-[6px] border px-2 py-1 text-left text-[11px] ${selected === i ? 'border-signal bg-signal/5' : 'border-transparent'} ${onSelect ? 'hover:bg-surface-2' : 'cursor-default'}`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: stageColor(phase.stage), opacity: phase.powered ? 1 : 0.4 }}
                />
                <span className="min-w-0 flex-1 truncate text-ink-2">{phase.name}</span>
                <span className="num shrink-0 text-right text-ink-3">
                  T+{fmt(phase.start, 0)} · {fmt(phase.duration, 1)} s{phase.fixed ? '' : ' *'}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {compact ? null : <p className="mt-1 text-[10px] text-ink-3">{tr('* 時間を最適化した区間', '* optimized duration')}</p>}
    </div>
  )
}
