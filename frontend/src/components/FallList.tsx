import type { Track } from '../lib/trajectory'
import { playback } from '../lib/playback'
import { fmt, fmtMass } from '../lib/format'
import { fallBodyLabel } from '../lib/events'
import { stageColorVar } from '../lib/theme'
import { tr } from '../lib/i18n'

/** Where the vehicle, its spent stages and jettisoned parts come down. */
export function FallList({ track }: { track: Track }) {
  const last = track.samples[track.samples.length - 1]
  const rows = [
    {
      key: 'vehicle',
      label: tr('機体', 'Vehicle'),
      stage: last.stage,
      release: null as number | null,
      mass: last.mass,
      impact: track.impact,
    },
    ...track.fallBodies.map((b, i) => ({
      key: `${b.kind}-${b.stage}-${i}`,
      label: fallBodyLabel(b),
      stage: b.stage,
      release: b.releaseTime,
      mass: b.mass,
      impact: b.impact,
    })),
  ]
  if (rows.length === 1 && !track.impact) return null
  return (
    <table className="w-full border-collapse text-left text-[12px]">
      <thead>
        <tr className="text-[11px] text-ink-3">
          <th className="py-1.5 pr-3 font-normal">{tr('落下物', 'Body')}</th>
          <th className="py-1.5 pr-3 text-right font-normal">{tr('分離', 'Release')}</th>
          <th className="hidden py-1.5 pr-3 text-right font-normal sm:table-cell">{tr('質量', 'Mass')}</th>
          <th className="py-1.5 pr-3 text-right font-normal">{tr('落下', 'Impact')}</th>
          <th className="py-1.5 pr-3 text-right font-normal">{tr('落下点（緯度, 経度）', 'Impact (lat, lon)')}</th>
          <th className="hidden py-1.5 text-right font-normal sm:table-cell">{tr('射点から', 'From launch')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            onClick={() => playback.seek(r.release ?? r.impact?.t ?? track.t1)}
            className="cursor-pointer border-t border-line text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            <td className="py-1.5 pr-3">
              <span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: stageColorVar(r.stage) }} />
              {r.label}
            </td>
            <td className="num py-1.5 pr-3 text-right">{r.release === null ? '—' : `T+${fmt(r.release, 1)}`}</td>
            <td className="num hidden py-1.5 pr-3 text-right sm:table-cell">{fmtMass(r.mass)}</td>
            <td className="num py-1.5 pr-3 text-right">{r.impact ? `T+${fmt(r.impact.t, 1)}` : '—'}</td>
            <td className="num py-1.5 pr-3 text-right">
              {r.impact ? (
                `${fmt(r.impact.lat, 4)}, ${fmt(r.impact.lon, 4)}`
              ) : (
                <span className="text-ink-3">
                  {r.release === null ? tr('落下せず', 'No impact') : tr('落下せず（周回など）', 'No impact (orbit, etc.)')}
                </span>
              )}
            </td>
            <td className="num hidden py-1.5 text-right sm:table-cell">{r.impact ? `${fmt(r.impact.downrange, 1)} km` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
