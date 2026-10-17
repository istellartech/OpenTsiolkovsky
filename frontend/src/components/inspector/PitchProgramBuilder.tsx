import { useState } from 'react'
import type { ClientConfig } from '../../lib/simulation'
import { NumberField } from '../primitives'
import { fmt } from '../../lib/format'

export function PitchProgramBuilder({
  latitude,
  azimuth,
  onApply,
}: {
  latitude: number
  azimuth: number
  onApply: (profile: ClientConfig['attitude']['profile']) => void
}) {
  const [v, setV] = useState({ azimuth, vertical: 10, pitchTime: 60, pitchEl: 65, finalTime: 300, finalEl: 0, inclination: NaN })
  const set = (patch: Partial<typeof v>) => setV((old) => ({ ...old, ...patch }))

  // Launch azimuth for a target inclination: sin(Az) = cos(i) / cos(φ)
  const ratio = Math.cos((v.inclination * Math.PI) / 180) / Math.cos((latitude * Math.PI) / 180)
  const azNorth = Number.isFinite(ratio) && Math.abs(ratio) <= 1 ? (Math.asin(ratio) * 180) / Math.PI : NaN
  const azChoices = Number.isFinite(azNorth) ? [((azNorth % 360) + 360) % 360, 180 - azNorth] : []

  const valid = v.vertical >= 0 && v.pitchTime > v.vertical && v.finalTime > v.pitchTime
  return (
    <div>
      <NumberField label="打上げ方位角" unit="°" value={v.azimuth} onChange={(azimuth) => set({ azimuth })} />
      <NumberField label="（目標の軌道傾斜角）" hint="入れると方位角の候補を出します" unit="°" value={v.inclination} onChange={(inclination) => set({ inclination })} />
      {Number.isFinite(v.inclination) && (
        <p className="mb-1 text-right text-[11px] text-ink-3">
          {azChoices.length ? (
            <>
              候補：
              {azChoices.map((az) => (
                <button key={az} type="button" onClick={() => set({ azimuth: Math.round(az * 10) / 10 })} className="num ml-1.5 rounded border border-line px-1.5 text-ink-2 hover:border-ink hover:text-ink">
                  {fmt(az, 1)}°
                </button>
              ))}
            </>
          ) : (
            <span className="text-danger">この緯度からは直接投入できない傾斜角です（緯度 {fmt(Math.abs(latitude), 1)}° 以上が必要）</span>
          )}
        </p>
      )}
      <NumberField label="垂直上昇" unit="s" value={v.vertical} onChange={(vertical) => set({ vertical })} />
      <NumberField label="傾け終わる時刻" unit="s" value={v.pitchTime} onChange={(pitchTime) => set({ pitchTime })} />
      <NumberField label="そのときの仰角" unit="°" value={v.pitchEl} onChange={(pitchEl) => set({ pitchEl })} />
      <NumberField label="最終の時刻" unit="s" value={v.finalTime} onChange={(finalTime) => set({ finalTime })} />
      <NumberField label="最終の仰角" unit="°" value={v.finalEl} onChange={(finalEl) => set({ finalEl })} />
      <div className="mt-1 flex items-center justify-end gap-2">
        {!valid && <span className="text-[11px] text-danger">時刻は 垂直上昇 ＜ 傾け終わり ＜ 最終 の順にしてください</span>}
        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            onApply([
              { time: 0, azimuth_deg: v.azimuth, elevation_deg: 90 },
              { time: v.vertical, azimuth_deg: v.azimuth, elevation_deg: 90 },
              { time: v.pitchTime, azimuth_deg: v.azimuth, elevation_deg: v.pitchEl },
              { time: v.finalTime, azimuth_deg: v.azimuth, elevation_deg: v.finalEl },
            ])
          }
          className="h-8 rounded-[6px] bg-ink px-3 text-[12px] font-medium text-surface hover:opacity-90 disabled:opacity-40"
        >
          姿勢テーブルに反映
        </button>
      </div>
    </div>
  )
}
