import { useMemo, useState } from 'react'
import type { OptimizationResult } from '../../lib/optimization'
import { multiStageSeries, phaseLimit, sampleIndexAt, type ResultSample, type ResultSeries } from '../../lib/optimization-series'
import { fmt } from '../../lib/format'
import { tr } from '../../lib/i18n'
import { cssVar } from '../../lib/theme'
import { CHART_HEIGHT_LARGE, OptChart, type OptBand, type OptMarker, type OptSeries } from './OptChart'

const G0 = 9.80665
const MU = 3.986004418e14

function eventName(kind: string, stage: number) {
  return kind === 'separate_stage'
    ? tr(`第${stage + 1}段分離`, `Stage ${stage + 1} separation`)
    : kind === 'jettison_fairing'
      ? tr('フェアリング投棄', 'Fairing jettison')
      : tr('衛星分離', 'Payload deployment')
}

/** All result charts with a shared time cursor; the reference run is overlaid in gray. */
export function ResultCharts({
  result,
  reference,
  cursor,
  onCursor,
}: {
  result: OptimizationResult
  reference?: OptimizationResult | null
  cursor: number
  onCursor: (t: number) => void
}) {
  const series = useMemo(() => multiStageSeries(result), [result])
  const ref = useMemo(() => (reference ? multiStageSeries(reference) : null), [reference])
  if (!series) return <SingleStageCharts result={result} cursor={cursor} onCursor={onCursor} />
  return <MultiCharts result={result} s={series} ref_={ref} cursor={cursor} onCursor={onCursor} />
}

function MultiCharts({
  result,
  s,
  ref_,
  cursor,
  onCursor,
}: {
  result: OptimizationResult
  s: ResultSeries
  ref_: ResultSeries | null
  cursor: number
  onCursor: (t: number) => void
}) {
  const p = result.input.problem
  const colors = useMemo(
    () => ({
      ink: cssVar('--ink'),
      ink3: cssVar('--ink-3'),
      danger: cssVar('--danger'),
      signal: cssVar('--signal'),
      stage: [1, 2, 3, 4, 5].map((i) => cssVar(`--stage-${i}`)),
    }),
    [],
  )
  const bands = useMemo<OptBand[]>(
    () =>
      s.phases.map((ph) => ({
        from: ph.start,
        to: ph.end,
        color: hexAlpha(colors.stage[ph.stage % 5], ph.powered ? 0.1 : 0.035),
      })),
    [s.phases, colors],
  )
  const markers = useMemo<OptMarker[]>(() => s.events.map((e) => ({ x: e.t, label: eventName(e.kind, e.stage) })), [s.events])
  const at = s.samples[sampleIndexAt(s.samples, cursor)]
  const line = (get: (x: ResultSample) => number, label: string, color = colors.signal): OptSeries => ({
    label,
    points: s.samples.map((x) => ({ x: x.t, y: get(x) })),
    color,
  })
  const refLine = (get: (x: ResultSample) => number): OptSeries[] =>
    ref_
      ? [
          {
            label: tr('比較対象', 'Reference'),
            points: ref_.samples.map((x) => ({ x: x.t, y: get(x) })),
            color: colors.ink3,
            dash: [4, 3],
            width: 1.25,
          },
        ]
      : []
  const limit = (points: { x: number; y: number }[], label = tr('上限', 'Limit')): OptSeries => ({
    label,
    points,
    color: colors.danger,
    dash: [5, 4],
    width: 1.25,
  })
  const multi = p.kind === 'multi_stage' ? p : null
  const xT = tr('打上げからの時間 [s]', 'Time since launch [s]')
  // A long coast before the final burn squeezes the ascent; offer a view up to it.
  const longCoast = s.phases.filter((ph) => !ph.powered && ph.end - ph.start > 120).sort((a, b) => b.end - b.start - (a.end - a.start))[0]
  const ascentEnd = longCoast ? longCoast.start + Math.min(60, (longCoast.end - longCoast.start) * 0.1) : null
  const [range, setRange] = useState<'all' | 'ascent'>('all')
  const tMax = range === 'ascent' && ascentEnd !== null ? ascentEnd : undefined
  const common = { bands, markers, cursor, onCursor, xLabel: xT, xMax: tMax }
  const downrangeMax = tMax === undefined ? undefined : s.samples[sampleIndexAt(s.samples, tMax)].downrangeKm
  const value = (v: number, d: number, unit: string) => `T+${fmt(cursor, 0)}s  ${fmt(v, d)} ${unit}`
  const targetKm = multi ? multi.orbit.altitude_m / 1000 : null
  const vCirc = multi ? Math.sqrt(MU / (multi.orbit.reference_radius_m + multi.orbit.altitude_m)) / 1000 : null
  return (
    <div className="space-y-2">
      {ascentEnd !== null ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-ink-3">{tr('表示範囲', 'Time range')}</span>
          {(
            [
              ['all', tr(`全体（0〜${fmt(s.final, 0)} s）`, `All (0–${fmt(s.final, 0)} s)`)],
              ['ascent', tr(`上昇部分（0〜${fmt(ascentEnd, 0)} s）`, `Ascent (0–${fmt(ascentEnd, 0)} s)`)],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={range === id}
              onClick={() => setRange(id)}
              className={`rounded-[6px] border px-2.5 py-1.5 ${range === id ? 'border-ink bg-ink text-surface' : 'border-line hover:bg-surface-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid gap-2 @min-[760px]:grid-cols-2">
        <OptChart
          title={tr('飛行経路（高度 × 地表距離）', 'Flight path (altitude vs. ground distance)')}
          unit="km"
          xLabel={tr('発射点からの地表距離 [km]', 'Ground distance from launch [km]')}
          series={[
            ...stageSegments(s.samples, (x) => ({ x: x.downrangeKm, y: x.altKm }), colors.stage),
            ...(ref_
              ? [
                  {
                    label: tr('比較対象', 'Reference'),
                    points: ref_.samples.map((x) => ({ x: x.downrangeKm, y: x.altKm })),
                    color: colors.ink3,
                    dash: [4, 3],
                    width: 1.25,
                  },
                ]
              : []),
          ]}
          cursor={null}
          xMax={downrangeMax}
          value={`${fmt(at.downrangeKm, 0)} km · ${fmt(at.altKm, 1)} km`}
          height={CHART_HEIGHT_LARGE}
          note={tr('色は段（実線：燃焼中、細線：慣性飛行）。', 'Color shows the stage (thick: burning, thin: coasting).')}
        />
        <OptChart
          {...common}
          title={tr('高度', 'Altitude')}
          unit="km"
          series={[
            line((x) => x.altKm, tr('高度', 'Altitude')),
            ...refLine((x) => x.altKm),
            ...(targetKm !== null
              ? [
                  limit(
                    [
                      { x: 0, y: targetKm },
                      { x: s.final, y: targetKm },
                    ],
                    tr('目標高度', 'Target'),
                  ),
                ]
              : []),
          ]}
          value={value(at.altKm, 1, 'km')}
          height={CHART_HEIGHT_LARGE}
        />
      </div>
      <div className="grid gap-2 @min-[760px]:grid-cols-2 @min-[1280px]:grid-cols-3">
        <OptChart
          {...common}
          title={tr('速度', 'Speed')}
          unit="km/s"
          digits={3}
          series={[
            line((x) => x.speed / 1000, tr('慣性速度', 'Inertial')),
            line((x) => x.groundSpeed / 1000, tr('対地速度', 'Earth-relative'), colors.ink3),
            ...refLine((x) => x.speed / 1000),
            ...(vCirc !== null
              ? [
                  limit(
                    [
                      { x: 0, y: vCirc },
                      { x: s.final, y: vCirc },
                    ],
                    tr('円軌道速度', 'Circular speed'),
                  ),
                ]
              : []),
          ]}
          value={value(at.speed / 1000, 3, 'km/s')}
        />
        <OptChart
          {...common}
          title={tr('飛行経路角（水平からの上向き角）', 'Flight-path angle (above horizontal)')}
          unit="°"
          series={[line((x) => x.gammaDeg, tr('経路角', 'Path angle')), ...refLine((x) => x.gammaDeg)]}
          value={value(at.gammaDeg, 1, '°')}
          note={tr('投入時は0°（水平）になります。', 'It reaches 0° (horizontal) at insertion.')}
        />
        <OptChart
          {...common}
          title={tr('機体の質量', 'Vehicle mass')}
          unit="t"
          digits={2}
          series={[line((x) => x.massKg / 1000, tr('質量', 'Mass')), ...refLine((x) => x.massKg / 1000)]}
          value={value(at.massKg / 1000, 2, 't')}
        />
        <OptChart
          {...common}
          title={tr('残りの推進剤（使用中の段）', 'Remaining propellant (active stage)')}
          unit="t"
          digits={2}
          series={[
            ...stageSegments(s.samples, (x) => ({ x: x.t, y: x.propellantKg / 1000 }), colors.stage, true),
            ...(multi
              ? [
                  limit(
                    phaseLimit(s.phases, (i) => (multi.stages[multi.phases[i].stage]?.reserve_kg ?? 0) / 1000),
                    tr('予備量', 'Reserve'),
                  ),
                ]
              : []),
          ]}
          value={value(at.propellantKg / 1000, 2, 't')}
        />
        <OptChart
          {...common}
          title={tr('動圧', 'Dynamic pressure')}
          unit="kPa"
          series={[
            line((x) => x.qKpa, tr('動圧', 'Dynamic pressure')),
            ...refLine((x) => x.qKpa),
            ...(multi
              ? [
                  limit([
                    { x: 0, y: multi.max_dynamic_pressure_pa / 1000 },
                    { x: s.final, y: multi.max_dynamic_pressure_pa / 1000 },
                  ]),
                ]
              : []),
          ]}
          xMax={Math.min(tMax ?? s.final, maxAeroTime(s.samples))}
          value={value(at.qKpa, 1, 'kPa')}
          note={tr('大気中（高度約100 kmまで）を拡大表示。', 'Zoomed to the atmospheric part (below ~100 km).')}
        />
        <OptChart
          {...common}
          title={tr('迎角', 'Angle of attack')}
          unit="°"
          series={[
            line((x) => x.aoaDeg, tr('迎角', 'Angle of attack')),
            ...refLine((x) => x.aoaDeg),
            ...(multi
              ? [
                  limit(
                    // Upper-stage limits (tens of degrees in vacuum) would flatten the plot.
                    phaseLimit(s.phases, (i) =>
                      multi.phases[i].max_angle_of_attack_deg <= 30 ? multi.phases[i].max_angle_of_attack_deg : null,
                    ),
                  ),
                ]
              : []),
          ]}
          xMax={Math.min(tMax ?? s.final, maxAeroTime(s.samples))}
          value={value(at.aoaDeg, 2, '°')}
          note={tr(
            '空気の薄い高空の迎角は荷重になりません（大気中のみ表示）。',
            'Above the atmosphere AoA carries no load (atmospheric part shown).',
          )}
        />
        <OptChart
          {...common}
          title={tr('加速度（重力を除く）', 'Acceleration (gravity excluded)')}
          unit="G"
          digits={2}
          series={[
            line((x) => x.accelG, tr('加速度', 'Acceleration')),
            ...refLine((x) => x.accelG),
            ...(multi ? [limit(phaseLimit(s.phases, (i) => multi.phases[i].max_specific_force_m_s2 / G0))] : []),
          ]}
          value={value(at.accelG, 2, 'G')}
        />
        <OptChart
          {...common}
          title={tr('推力', 'Thrust')}
          unit="kN"
          digits={0}
          series={[line((x) => x.thrustKn, tr('推力', 'Thrust')), ...refLine((x) => x.thrustKn)]}
          value={value(at.thrustKn, 0, 'kN')}
        />
        <OptChart
          {...common}
          title={tr('姿勢：仰角（水平からの機首の角度）', 'Attitude: elevation (nose above horizontal)')}
          unit="°"
          series={[
            line((x) => x.elevationDeg, tr('仰角', 'Elevation')),
            line((x) => x.gammaDeg, tr('飛行経路角', 'Flight-path angle'), colors.ink3),
            ...refLine((x) => x.elevationDeg),
          ]}
          value={value(at.elevationDeg, 1, '°')}
          note={tr('仰角と経路角の差がほぼ迎角です。', 'The gap to the flight-path angle is roughly the angle of attack.')}
        />
        <OptChart
          {...common}
          title={tr('姿勢：方位角（北から時計回り）', 'Attitude: azimuth (from north, clockwise)')}
          unit="°"
          series={[line((x) => x.azimuthDeg, tr('方位角', 'Azimuth')), ...refLine((x) => x.azimuthDeg)]}
          value={value(at.azimuthDeg, 1, '°')}
        />
        <OptChart
          {...common}
          title={tr('機体軸の回転速度', 'Body-axis rotation rate')}
          unit="°/s"
          digits={2}
          series={[
            line((x) => x.bodyRateDegS, tr('回転速度', 'Rate')),
            ...refLine((x) => x.bodyRateDegS),
            ...(multi
              ? [
                  limit([
                    { x: 0, y: multi.max_inertial_direction_rate_deg_s },
                    { x: s.final, y: multi.max_inertial_direction_rate_deg_s },
                  ]),
                ]
              : []),
          ]}
          value={value(at.bodyRateDegS, 2, '°/s')}
        />
      </div>
      <p className="text-[11px] leading-relaxed text-ink-3">
        {tr(
          '背景の色帯は段（濃い：燃焼中、薄い：慣性飛行）、縦の点線は分離・投棄、赤破線は上限です。グラフをクリックするとその時刻をすべてのグラフと地図に表示します。',
          'Background bands show stages (dark: burning, light: coasting), dotted lines mark separation/jettison, red dashed lines are limits. Click a chart to set the time across all charts and the map.',
        )}
      </p>
    </div>
  )
}

/** Last time the vehicle is below 100 km (the part where aerodynamics matter). */
function maxAeroTime(samples: ResultSample[]) {
  let t = samples[0]?.t ?? 0
  for (const x of samples) if (x.altKm <= 100) t = x.t
  return t + 10
}

/** One series per contiguous stage/power segment so color and width follow the flight. */
function stageSegments(
  samples: ResultSample[],
  map: (x: ResultSample) => { x: number; y: number },
  colors: string[],
  byStageOnly = false,
): OptSeries[] {
  const out: OptSeries[] = []
  let key = ''
  for (const x of samples) {
    const k = byStageOnly ? `${x.stage}` : `${x.stage}-${x.powered}`
    if (k !== key) {
      const last = out[out.length - 1]
      const prev = last ? last.points[last.points.length - 1] : undefined
      out.push({
        label: tr(`第${x.stage + 1}段`, `Stage ${x.stage + 1}`),
        points: prev && !byStageOnly ? [prev] : [],
        color: colors[x.stage % 5],
        width: byStageOnly || x.powered ? 2.25 : 1.1,
      })
      key = k
    }
    out[out.length - 1].points.push(map(x))
  }
  return out
}
function hexAlpha(color: string, alpha: number) {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return `rgba(128,128,128,${alpha})`
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

function SingleStageCharts({ result, cursor, onCursor }: { result: OptimizationResult; cursor: number; onCursor: (t: number) => void }) {
  const flight = result.validation?.flight
  const numerical = result.validation?.trajectory
  const signal = cssVar('--signal'),
    danger = cssVar('--danger')
  const p = result.input.problem
  if (flight) {
    const xs = flight.samples
    const end = xs[xs.length - 1]?.time_s ?? 0
    const l = (y: number) => [
      { x: 0, y },
      { x: end, y },
    ]
    const common = { xLabel: tr('打上げからの時間 [s]', 'Time since launch [s]'), cursor, onCursor }
    const series = (get: (x: (typeof xs)[number]) => number, label: string) => ({
      label,
      points: xs.map((x) => ({ x: x.time_s, y: get(x) })),
      color: signal,
    })
    return (
      <div className="grid gap-3 @min-[760px]:grid-cols-2">
        <OptChart
          {...common}
          title={tr('飛行経路（高度 × 距離）', 'Flight path (altitude vs. downrange)')}
          unit="km"
          xLabel={tr('射向への距離 [km]', 'Downrange [km]')}
          cursor={null}
          series={[
            { label: tr('高度', 'Altitude'), points: xs.map((x) => ({ x: x.downrange_m / 1000, y: x.altitude_m / 1000 })), color: signal },
          ]}
        />
        <OptChart
          {...common}
          title={tr('高度', 'Altitude')}
          unit="km"
          series={[series((x) => x.altitude_m / 1000, tr('高度', 'Altitude'))]}
        />
        <OptChart
          {...common}
          title={tr('動圧', 'Dynamic pressure')}
          unit="kPa"
          series={[
            series((x) => x.dynamic_pressure_pa / 1000, tr('動圧', 'Dynamic pressure')),
            ...(p.kind === 'single_stage'
              ? [{ label: tr('上限', 'Limit'), points: l(p.max_dynamic_pressure_pa / 1000), color: danger, dash: [5, 4] }]
              : []),
          ]}
        />
        <OptChart
          {...common}
          title={tr('加速度（重力を除く）', 'Acceleration (gravity excluded)')}
          unit="G"
          digits={2}
          series={[
            series((x) => x.specific_force_m_s2 / G0, tr('加速度', 'Acceleration')),
            ...(p.kind === 'single_stage'
              ? [{ label: tr('上限', 'Limit'), points: l(p.max_specific_force_m_s2 / G0), color: danger, dash: [5, 4] }]
              : []),
          ]}
        />
        <OptChart
          {...common}
          title={tr('迎角', 'Angle of attack')}
          unit="°"
          digits={2}
          series={[
            series((x) => x.angle_of_attack_deg, tr('迎角', 'Angle of attack')),
            ...(p.kind === 'single_stage'
              ? [{ label: tr('上限', 'Limit'), points: l(p.max_angle_of_attack_deg), color: danger, dash: [5, 4] }]
              : []),
          ]}
        />
        <OptChart {...common} title={tr('仰角', 'Elevation')} unit="°" series={[series((x) => x.pitch_deg, tr('仰角', 'Elevation'))]} />
      </div>
    )
  }
  if (numerical) {
    const samples = numerical.samples
    const pts = (get: (x: (typeof samples)[number]) => number) => samples.map((x) => ({ x: x.time_s, y: get(x) }))
    return (
      <div className="grid gap-3 @min-[760px]:grid-cols-2">
        <OptChart
          title={tr('位置', 'Position')}
          unit="m"
          xLabel="t [s]"
          series={[{ label: 'x', points: pts((x) => x.position_m), color: signal }]}
        />
        <OptChart
          title={tr('速度', 'Velocity')}
          unit="m/s"
          xLabel="t [s]"
          series={[{ label: 'v', points: pts((x) => x.velocity_m_s), color: signal }]}
        />
      </div>
    )
  }
  return null
}
