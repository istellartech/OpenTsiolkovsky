import { useState } from 'react'
import { Download, Play, RotateCcw, Square, X } from 'lucide-react'
import type { MonteCarloState } from '../hooks/useMonteCarlo'
import { MAX_CASES } from '../hooks/useMonteCarlo'
import {
  DEFAULT_DISPERSION,
  DEFAULT_ELLIPSE,
  ELLIPSE_LEVELS,
  casesToCsv,
  ellipseAxes,
  ellipseLabel,
  tidyDispersion,
  type Dispersion,
  type EllipseLevel,
  type ImpactStatistics,
  type NumericDispersionKey,
} from '../lib/montecarlo'
import { mcBodyLabel } from '../lib/events'
import { fmt } from '../lib/format'
import { saveFile } from '../lib/download'
import { bodyStage } from '../lib/montecarlo'
import { stageColorVar } from '../lib/theme'
import { tr } from '../lib/i18n'
import { cn } from '../lib/cn'
import { NumberField, Segmented, SelectField, Toggle } from './primitives'
import { Group } from './inspector/shared'

/** Dispersion inputs: [key, label, unit] (all 1-sigma) */
function dispersionFields(): [NumericDispersionKey, string, string][] {
  return [
    ['thrust_percent', tr('推力', 'Thrust'), '%'],
    ['isp_percent', tr('比推力', 'Isp'), '%'],
    ['mass_percent', tr('各段の質量', 'Stage masses'), '%'],
    ['drag_percent', tr('抗力（CA・弾道係数）', 'Drag (CA, ballistic coef.)'), '%'],
    ['elevation_deg', tr('姿勢 上下角', 'Attitude elevation'), '°'],
    ['azimuth_deg', tr('姿勢 方位角', 'Attitude azimuth'), '°'],
    ['wind_speed_mps', tr('風速', 'Wind speed'), 'm/s'],
    ['wind_direction_deg', tr('風向', 'Wind direction'), '°'],
    ['air_density_percent', tr('大気密度', 'Air density'), '%'],
    ['normal_percent', tr('法線力（CN）', 'Normal force (CN)'), '%'],
    ['separation_time_s', tr('分離時刻', 'Separation time'), 's'],
    ['wind_speed_percent', tr('風速の倍率', 'Wind speed scale'), '%'],
  ]
}

const km = (m: number) => fmt(m / 1000, m < 10_000 ? 2 : 1)

/** Semi-axes of the chosen ellipse */
function ellipseText(s: ImpactStatistics, level: EllipseLevel) {
  const { major, minor } = ellipseAxes(s, level)
  return `${km(major)} × ${km(minor)} km`
}

/** Monte Carlo dispersion analysis: settings, progress and impact statistics. */
export function MonteCarloPanel({ mc, lastStage, fileBase }: { mc: MonteCarloState; lastStage: number; fileBase: string }) {
  const { settings, setSettings, status, result } = mc
  const running = status === 'running'
  const done = result?.cases.length ?? 0
  const total = result?.total ?? settings.count
  // Settings fold away once there are results, giving the table the full width.
  const [settingsOpen, setSettingsOpen] = useState(!result)
  const setDispersion = (d: Partial<Dispersion>) =>
    setSettings({ ...settings, dispersion: tidyDispersion({ ...settings.dispersion, ...d }) })
  const level = settings.ellipse ?? DEFAULT_ELLIPSE

  const saveCsv = () => {
    if (!result) return
    const bodies = result.statistics.map((s) => s.body)
    saveFile(`${fileBase}_montecarlo.csv`, casesToCsv(result.cases, bodies), 'text/csv')
  }

  return (
    <div className={cn('grid items-start gap-2', settingsOpen && 'lg:grid-cols-[minmax(17rem,21rem)_1fr]')}>
      <section className="rounded-[8px] border border-line bg-surface px-3 py-2.5 text-[13px]">
        <Group
          collapsible
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          badge={tr(`${settings.count}ケース · シード ${settings.seed}`, `${settings.count} cases · seed ${settings.seed}`)}
          title={tr('分散解析の条件', 'Dispersion settings')}
          note={tr(
            '推力や風などをばらつかせて何度も飛ばし、機体・使用済みの段・投棄物の落下点のばらつきを調べます。値は 1σ（標準偏差）です。',
            'Flies the vehicle many times with thrust, wind and the rest drawn at random, and shows how the impact points of the vehicle, spent stages and jettisoned parts spread. Values are 1-sigma (standard deviation).',
          )}
        >
          <NumberField
            label={tr('ケース数', 'Cases')}
            value={settings.count}
            onChange={(v) => setSettings({ ...settings, count: Math.min(Math.max(Math.round(v), 1), MAX_CASES) })}
          />
          <NumberField
            label={tr('乱数シード', 'Random seed')}
            hint={tr('同じシードなら同じ結果になります', 'The same seed gives the same results')}
            value={settings.seed}
            onChange={(v) => setSettings({ ...settings, seed: Math.min(Math.max(Math.round(v), 0), 2 ** 32 - 1) })}
          />
          {dispersionFields().map(([k, label, unit]) => (
            <NumberField
              key={k}
              label={label}
              unit={unit}
              value={settings.dispersion[k] ?? 0}
              onChange={(v) => setDispersion({ [k]: Math.max(v, 0) })}
            />
          ))}
          <SelectField
            label={tr('分布', 'Distribution')}
            value={settings.dispersion.distribution ?? 'normal'}
            options={[
              { value: 'normal', label: tr('正規分布', 'Normal') },
              { value: 'uniform', label: tr('一様分布（±√3σ）', 'Uniform (±√3σ)') },
            ]}
            onChange={(distribution) => setDispersion({ distribution })}
          />
          <Toggle
            label={tr('段ごとに独立に引く', 'Draw each stage independently')}
            checked={!!settings.dispersion.independent_stages}
            onChange={(independent_stages) => setDispersion({ independent_stages })}
          />
          <p className="mb-1 text-[11px] leading-relaxed text-ink-3">
            {tr(
              'オンにすると推力・比推力・質量・抗力・CN・分離時刻を段ごとに別の値で引きます。オフでは同じ値を全段に使います。',
              'When on, thrust, Isp, mass, drag, CN and separation time get a separate draw for each stage; when off, one draw applies to every stage.',
            )}
          </p>
          <button
            type="button"
            onClick={() => setSettings({ ...settings, dispersion: DEFAULT_DISPERSION })}
            className="mt-1 flex h-7 items-center gap-1 rounded-[6px] px-1.5 text-[12px] text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {tr('標準の値に戻す', 'Reset to defaults')}
          </button>
        </Group>
        <div className="flex items-center gap-2">
          {running ? (
            <button
              type="button"
              onClick={mc.cancel}
              className="flex h-8 items-center gap-1.5 rounded-[6px] border border-line-strong px-3 text-[12px] font-medium hover:bg-surface-2"
            >
              <Square className="h-3 w-3" fill="currentColor" /> {tr('中止', 'Stop')}
            </button>
          ) : (
            <button
              type="button"
              onClick={mc.run}
              className="flex h-8 items-center gap-1.5 rounded-[6px] bg-ink px-3 text-[12px] font-medium text-surface hover:opacity-90"
            >
              <Play className="h-3 w-3" fill="currentColor" /> {tr(`${settings.count}ケースを計算`, `Run ${settings.count} cases`)}
            </button>
          )}
          {(running || done > 0) && (
            <div className="min-w-0 flex-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full bg-signal transition-[width]" style={{ width: `${(done / Math.max(total, 1)) * 100}%` }} />
              </div>
              <div className="num mt-0.5 text-[11px] text-ink-3">
                {done} / {total}
                {status === 'cancelled' && ` · ${tr('中止しました', 'stopped')}`}
              </div>
            </div>
          )}
        </div>
        {mc.error && <p className="mt-2 text-[12px] text-danger">{mc.error}</p>}
      </section>

      <section className="min-w-0 rounded-[8px] border border-line bg-surface px-3 py-2.5">
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-[12px] font-semibold">{tr('落下点のばらつき', 'Impact dispersion')}</h3>
          <span className="flex-1" />
          <Segmented
            size="sm"
            value={level}
            options={ELLIPSE_LEVELS.map((l) => ({
              value: l,
              label: ellipseLabel(l),
              title: tr(`${ellipseLabel(l)} 誤差楕円を表示`, `Show the ${ellipseLabel(l)} error ellipse`),
            }))}
            onChange={(ellipse) => setSettings({ ...settings, ellipse })}
          />
          {result && result.cases.length > 0 && !running && (
            <>
              <button
                type="button"
                onClick={saveCsv}
                className="flex h-7 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
              <button
                type="button"
                onClick={mc.clear}
                aria-label={tr('結果を消す', 'Clear results')}
                title={tr('結果を消す', 'Clear results')}
                className="flex h-7 items-center rounded-[6px] px-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
        {mc.stale && (
          <p className="mb-2 rounded-[6px] bg-surface-2 px-2 py-1.5 text-[12px] text-ink-2">
            {tr(
              'パラメータが変更されています。この結果は変更前の機体のものです。',
              'The parameters have changed since this run; these results are for the earlier vehicle.',
            )}
          </p>
        )}
        {!result || result.statistics.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-ink-3">
            {running
              ? tr('計算中…', 'Computing…')
              : tr(
                  '条件を決めて「計算」を押すと、落下点の分布と誤差楕円が地図とこの表に出ます。',
                  'Press Run to see the impact scatter and error ellipses on the map and in this table.',
                )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[12px]">
              <thead>
                <tr className="text-[11px] text-ink-3">
                  <th className="py-1.5 pr-3 font-normal">{tr('落下物', 'Body')}</th>
                  <th className="py-1.5 pr-3 text-right font-normal">{tr('落下', 'Impacts')}</th>
                  <th className="py-1.5 pr-3 text-right font-normal">{tr('平均落下点', 'Mean impact')}</th>
                  <th className="py-1.5 pr-3 text-right font-normal">
                    {tr(`${ellipseLabel(level)} 楕円（長半径×短半径）`, `${ellipseLabel(level)} ellipse (semi-major × minor)`)}
                  </th>
                  <th className="hidden py-1.5 pr-3 text-right font-normal sm:table-cell">{tr('長軸の方位', 'Major axis')}</th>
                  <th className="hidden py-1.5 text-right font-normal sm:table-cell">{tr('最大のずれ', 'Max offset')}</th>
                </tr>
              </thead>
              <tbody>
                {result.statistics.map((s) => (
                  <tr key={s.body} className="border-t border-line text-ink-2">
                    <td className="py-1.5 pr-3">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ background: stageColorVar(bodyStage(s.body) ?? lastStage) }}
                      />
                      {mcBodyLabel(s.body)}
                    </td>
                    <td className="num py-1.5 pr-3 text-right">
                      {s.impacts} / {s.cases}
                    </td>
                    <td className="num py-1.5 pr-3 text-right">
                      {s.mean_latitude_deg === null || s.mean_longitude_deg === null
                        ? '—'
                        : `${fmt(s.mean_latitude_deg, 4)}, ${fmt(s.mean_longitude_deg, 4)}`}
                    </td>
                    <td className="num py-1.5 pr-3 text-right">{s.impacts < 2 ? '—' : ellipseText(s, level)}</td>
                    <td className="num hidden py-1.5 pr-3 text-right sm:table-cell">
                      {s.impacts < 2 ? '—' : `${fmt(s.ellipse_azimuth_deg, 0)}°`}
                    </td>
                    <td className="num hidden py-1.5 text-right sm:table-cell">{s.impacts < 1 ? '—' : `${km(s.max_distance_m)} km`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
              {tr(
                '誤差楕円は落下点の共分散から求めた範囲です。95%・99% の楕円には、落下点が 2 次元正規分布に従うときにその割合が入ります（1σ 楕円は約 39%）。長軸の方位は北から時計回りです。',
                'Error ellipses come from the impact covariance; for a 2-D normal distribution the 95% and 99% ellipses hold that share of impacts (the 1-sigma ellipse about 39%). The major-axis bearing is clockwise from north.',
              )}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
