import type { InspectorNav } from '../Inspector'
import { AlertTriangle } from 'lucide-react'
import type { Config } from '../../lib/config'
import { curveRows, curveValue, isRows, launchDate } from '../../lib/config'
import { PRESET_OPTIONS } from '../../config/presets'

import type { VehicleSpec } from '../../lib/specs'
import { fmt, fmtForce, fmtMass } from '../../lib/format'
import { pad2, type Patch } from './shared'
import { stageColorVar } from '../../lib/theme'
import { tr } from '../../lib/i18n'

export function Overview({
  config,
  patch,
  presetId,
  specs,
  onNav,
}: {
  config: Config
  patch: Patch
  presetId: string
  specs: VehicleSpec
  onNav: (n: InspectorNav) => void
}) {
  const preset = PRESET_OPTIONS.find((p) => p.id === presetId)
  const { launch } = config
  const dt = launchDate(config)
  const az = config.attitude?.azimuth_deg
  const el = config.attitude?.elevation_deg
  const programPoints = Math.max(curveRows(az).length, curveRows(el).length)
  const figures: [string, string, string?][] = [
    [tr('全備質量', 'Liftoff mass'), fmtMass(specs.liftoffMass)],
    [tr('離昇推力', 'Liftoff thrust'), fmtForce(specs.liftoffThrust), tr('真空', 'vacuum')],
    [tr('推力重量比', 'Thrust-to-weight'), fmt(specs.thrustToWeight, 2)],
    [tr('理想 Δv', 'Ideal Δv'), `${fmt(specs.dvTotal / 1000, 2)} km/s`, tr('損失なし', 'no losses')],
  ]

  return (
    <div>
      <input
        aria-label={tr('名称', 'Name')}
        value={config.name}
        onChange={(e) => patch((c) => ({ ...c, name: e.target.value }))}
        className="-mx-1.5 w-[calc(100%+12px)] rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-[17px] font-semibold tracking-tight outline-none hover:border-line focus:border-signal"
      />
      <p className="mt-0.5 text-[12px] text-ink-2">
        {preset
          ? `${preset.kind} · ${preset.site}`
          : tr(
              `${specs.stages.length}段 · カスタム設定`,
              `${specs.stages.length} stage${specs.stages.length === 1 ? '' : 's'} · Custom configuration`,
            )}
      </p>
      {preset && <p className="mt-2 text-[12px] leading-relaxed text-ink-2">{preset.description}</p>}

      <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line">
        {figures.map(([k, v, sub]) => (
          <div key={k} className="bg-surface px-3 py-2">
            <dt className="text-[11px] text-ink-3">
              {k}
              {sub && <span className="ml-1 text-[10px]">({sub})</span>}
            </dt>
            <dd className="num mt-0.5 text-[15px]">{v}</dd>
          </div>
        ))}
      </dl>

      {specs.warnings.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-[8px] border border-danger/30 bg-danger/5 px-3 py-2 text-[12px] text-danger">
          {specs.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {w}
            </li>
          ))}
        </ul>
      )}

      <h3 className="mb-1.5 mt-5 text-[12px] font-semibold">{tr('段構成', 'Stages')}</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-[11px] text-ink-3">
              <th className="py-1 pr-2 text-left font-normal">{tr('段', 'Stage')}</th>
              <th className="py-1 pr-2 text-right font-normal">{tr('質量 t', 'Mass t')}</th>
              <th className="py-1 pr-2 text-right font-normal">{tr('推進剤 t', 'Prop. t')}</th>
              <th className="py-1 pr-2 text-right font-normal">{tr('推力 kN', 'Thrust kN')}</th>
              <th className="py-1 pr-2 text-right font-normal">Isp s</th>
              <th className="whitespace-nowrap py-1 text-right font-normal">Δv km/s</th>
            </tr>
          </thead>
          <tbody>
            {specs.stages.map((s) => (
              <tr
                key={s.index}
                onClick={() => onNav({ tab: 'vehicle', stage: s.index })}
                className="cursor-pointer border-t border-line hover:bg-surface-2"
                title={tr(`${s.index + 1}段の設定を開く`, `Open stage ${s.index + 1} settings`)}
              >
                <td className="py-1.5 pr-2">
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ background: stageColorVar(s.index + 1) }}
                  />
                  {s.index + 1}
                </td>
                <td className="num py-1.5 pr-2 text-right">{fmt(s.ownMass / 1000, 1)}</td>
                <td className="num py-1.5 pr-2 text-right">{fmt(s.propellant / 1000, 1)}</td>
                <td className="num py-1.5 pr-2 text-right">{fmt(s.thrustMax / 1000, 0)}</td>
                <td className="num py-1.5 pr-2 text-right">{fmt(s.isp, 0)}</td>
                <td className="num py-1.5 text-right">{fmt(s.dv / 1000, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-ink-3">
        {tr(
          '質量は各段単体（推進剤込み）。推進剤は燃焼時間と推力・Ispから計算。',
          'Mass is each stage alone, including propellant. Propellant is computed from burn time, thrust and Isp.',
        )}
      </p>

      <h3 className="mb-1.5 mt-5 text-[12px] font-semibold">{tr('シーケンス', 'Sequence')}</h3>
      <SequenceChart specs={specs} />

      <h3 className="mb-1 mt-5 text-[12px] font-semibold">{tr('発射条件', 'Launch conditions')}</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
        <dt className="text-ink-3">{tr('地点', 'Site')}</dt>
        <dd className="num">
          {fmt(launch.latitude_deg, 3)}°, {fmt(launch.longitude_deg, 3)}° · {tr('標高', 'alt.')} {launch.altitude_m ?? 0} m
        </dd>
        <dt className="text-ink-3">{tr('日時', 'Date')}</dt>
        <dd className="num">
          {dt.getUTCFullYear()}-{pad2(dt.getUTCMonth() + 1)}-{pad2(dt.getUTCDate())} {pad2(dt.getUTCHours())}:{pad2(dt.getUTCMinutes())} UTC
        </dd>
        <dt className="text-ink-3">{tr('打上げ方位', 'Launch azimuth')}</dt>
        <dd className="num">
          {isRows(az) || isRows(el)
            ? tr(
                `${curveValue(az)}°（姿勢プログラム ${programPoints}点）`,
                `${curveValue(az)}° (attitude program, ${programPoints} points)`,
              )
            : tr(`${curveValue(az)}° · 仰角 ${curveValue(el, 90)}°`, `${curveValue(az)}° · elevation ${curveValue(el, 90)}°`)}
        </dd>
      </dl>

      {preset && (preset.sources.length > 0 || preset.modelNotes.length > 0) && (
        <>
          <h3 className="mb-1 mt-5 text-[12px] font-semibold">{tr('数値の根拠', 'Sources')}</h3>
          {preset.modelNotes.length > 0 && (
            <ul className="mb-2 list-disc space-y-0.5 pl-4 text-[11px] leading-relaxed text-ink-2">
              {preset.modelNotes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
          <ul className="space-y-0.5 text-[11px] leading-relaxed">
            {preset.sources.map((src) => (
              <li key={src.url}>
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-ink"
                >
                  {src.label}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function SequenceChart({ specs }: { specs: VehicleSpec }) {
  const end = Math.max(...specs.stages.map((s) => s.burnout), 1) * 1.08
  const pct = (t: number) => `${Math.min((t / end) * 100, 100)}%`
  const ticks = niceTicks(end)
  return (
    <div className="rounded-[8px] border border-line px-3 pb-2 pt-3">
      <div className="space-y-2.5">
        {specs.stages.map((s) => (
          <div key={s.index} className="grid grid-cols-[2.25rem_1fr] items-center gap-2">
            <span className="text-[11px] text-ink-2">{tr(`${s.index + 1}段`, `S${s.index + 1}`)}</span>
            <div className="relative h-4">
              {/* Stage lifetime */}
              <div
                className="absolute top-1/2 h-px -translate-y-1/2 bg-line-strong"
                style={{ left: pct(s.start), right: s.separation === null ? 0 : `calc(100% - ${pct(s.separation)})` }}
              />
              {/* Burn */}
              <div
                className="absolute top-0.5 h-3 rounded-[3px]"
                title={tr(
                  `点火 T+${fmt(s.ignition)} s / 燃焼終了 T+${fmt(s.burnout)} s`,
                  `Ignition T+${fmt(s.ignition)} s / burnout T+${fmt(s.burnout)} s`,
                )}
                style={{
                  left: pct(s.ignition),
                  width: `max(3px, calc(${pct(s.burnout)} - ${pct(s.ignition)}))`,
                  background: stageColorVar(s.index + 1),
                }}
              />
              {s.separation !== null && s.separation <= end && (
                <div
                  className="absolute top-0 h-4 w-px bg-ink"
                  title={tr(`分離 T+${fmt(s.separation)} s`, `Separation T+${fmt(s.separation)} s`)}
                  style={{ left: pct(s.separation) }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="relative ml-[2.75rem] mt-1.5 h-3.5 border-t border-line">
        {ticks.map((t) => (
          <span key={t} className="num absolute top-0.5 -translate-x-1/2 text-[10px] text-ink-3" style={{ left: pct(t) }}>
            {t}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-ink-3">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-[2px] bg-ink-3" /> {tr('燃焼', 'Burn')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-px bg-ink" /> {tr('分離', 'Separation')}
        </span>
        <span>{tr('横軸: 打上げからの秒', 'X axis: seconds after launch')}</span>
      </div>
    </div>
  )
}

function niceTicks(max: number): number[] {
  const raw = max / 4
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let t = 0; t <= max; t += step) out.push(Math.round(t))
  return out
}
