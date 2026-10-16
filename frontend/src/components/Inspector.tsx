import type { ReactNode } from 'react'
import { AlertTriangle, Plus, Trash2 } from 'lucide-react'
import type { ClientConfig, ClientStageConfig } from '../lib/simulation'
import { FREE_MODE_OPTIONS, MAX_STAGE_COUNT, POWER_MODE_OPTIONS, PRESET_OPTIONS, createDefaultStage } from '../config/defaults'
import { NumberField, ProfileTable, SelectField, TextInputField, Toggle, VectorField } from './primitives'
import { stageColorVar } from '../lib/trajectory'
import { fmtForce, fmtMass, type VehicleSpec } from '../lib/specs'
import { cn } from '../lib/utils'

type Patch = (fn: (c: ClientConfig) => ClientConfig) => void

export type InspectorTab = 'overview' | 'launch' | 'vehicle' | 'aero' | 'flight' | 'solver'

export interface InspectorNav {
  tab: InspectorTab
  stage: number
}

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'overview', label: '概要' },
  { id: 'launch', label: '発射' },
  { id: 'vehicle', label: '機体' },
  { id: 'aero', label: '空力' },
  { id: 'flight', label: '姿勢・風' },
  { id: 'solver', label: '計算' },
]

/** Which tab (and stage) holds a validation field. */
export function navForField(field: string): InspectorNav {
  const m = field.match(/^stage(?:\[(\d+)\])?\./)
  if (m) return { tab: 'vehicle', stage: m[1] ? Number(m[1]) - 1 : 0 }
  if (field.startsWith('launch.')) return { tab: 'launch', stage: 0 }
  if (field.startsWith('aerodynamics.')) return { tab: 'aero', stage: 0 }
  if (field.startsWith('attitude.') || field.startsWith('wind.')) return { tab: 'flight', stage: 0 }
  if (field.startsWith('simulation.')) return { tab: 'solver', stage: 0 }
  return { tab: 'overview', stage: 0 }
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const fmt = (v: number, d = 1) => v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d })

/** Validation keys: the first stage is `stage.*`, later ones `stage[n].*` (1-based). */
const stagePath = (i: number, key: keyof ClientStageConfig) => (i === 0 ? `stage.${key}` : `stage[${i + 1}].${key}`)

interface Props {
  config: ClientConfig
  patch: Patch
  presetId: string
  specs: VehicleSpec
  nav: InspectorNav
  onNav: (nav: InspectorNav) => void
  issueFields: string[]
}

export function Inspector({ config, patch, presetId, specs, nav, onNav, issueFields }: Props) {
  const tabsWithIssues = new Set(issueFields.map((f) => navForField(f).tab))
  return (
    <div className="flex min-h-full flex-col">
      <div role="tablist" className="sticky top-0 z-10 flex border-b border-line bg-surface px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={nav.tab === t.id}
            onClick={() => onNav({ ...nav, tab: t.id })}
            className={cn(
              'relative h-10 flex-1 whitespace-nowrap px-1 text-[12px] font-medium transition-colors',
              nav.tab === t.id ? 'text-ink' : 'text-ink-3 hover:text-ink',
            )}
          >
            {t.label}
            {tabsWithIssues.has(t.id) && <span className="absolute right-1 top-2 h-1.5 w-1.5 rounded-full bg-danger" aria-label="入力エラーあり" />}
            {nav.tab === t.id && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-ink" />}
          </button>
        ))}
      </div>
      <div className="flex-1 px-4 pb-10 pt-3">
        {nav.tab === 'overview' && <Overview config={config} patch={patch} presetId={presetId} specs={specs} onNav={onNav} />}
        {nav.tab === 'launch' && <LaunchTab config={config} patch={patch} />}
        {nav.tab === 'vehicle' && (
          <VehicleTab config={config} patch={patch} specs={specs} stage={nav.stage} onStage={(stage) => onNav({ tab: 'vehicle', stage })} />
        )}
        {nav.tab === 'aero' && <AeroTab config={config} patch={patch} />}
        {nav.tab === 'flight' && <FlightTab config={config} patch={patch} />}
        {nav.tab === 'solver' && <SolverTab config={config} patch={patch} />}
      </div>
    </div>
  )
}

function Group({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1 border-b border-line pb-1.5 text-[12px] font-semibold text-ink">{title}</h3>
      {note && <p className="mb-1.5 mt-1.5 text-[11px] leading-relaxed text-ink-3">{note}</p>}
      {children}
    </section>
  )
}

/* ---------------------------------------------------------------- Overview */

function Overview({
  config,
  patch,
  presetId,
  specs,
  onNav,
}: {
  config: ClientConfig
  patch: Patch
  presetId: string
  specs: VehicleSpec
  onNav: (n: InspectorNav) => void
}) {
  const preset = PRESET_OPTIONS.find((p) => p.id === presetId)
  const { launch } = config
  const dt = launch.datetime_utc
  const figures: [string, string, string?][] = [
    ['全備質量', fmtMass(specs.liftoffMass)],
    ['離昇推力', fmtForce(specs.liftoffThrust), '真空'],
    ['推力重量比', fmt(specs.thrustToWeight, 2)],
    ['理想 Δv', `${fmt(specs.dvTotal / 1000, 2)} km/s`, '損失なし'],
  ]

  return (
    <div>
      <input
        aria-label="名称"
        value={config.name}
        onChange={(e) => patch((c) => ({ ...c, name: e.target.value }))}
        className="-mx-1.5 w-[calc(100%+12px)] rounded-[6px] border border-transparent bg-transparent px-1.5 py-0.5 text-[17px] font-semibold tracking-tight outline-none hover:border-line focus:border-signal"
      />
      <p className="mt-0.5 text-[12px] text-ink-2">
        {preset ? `${preset.kind} · ${preset.site}` : `${specs.stages.length}段 · カスタム設定`}
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

      <h3 className="mb-1.5 mt-5 text-[12px] font-semibold">段構成</h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-[11px] text-ink-3">
              <th className="py-1 pr-2 text-left font-normal">段</th>
              <th className="py-1 pr-2 text-right font-normal">質量</th>
              <th className="py-1 pr-2 text-right font-normal">推進剤</th>
              <th className="py-1 pr-2 text-right font-normal">推力</th>
              <th className="py-1 pr-2 text-right font-normal">Isp</th>
              <th className="py-1 text-right font-normal">Δv</th>
            </tr>
          </thead>
          <tbody>
            {specs.stages.map((s) => (
              <tr
                key={s.index}
                onClick={() => onNav({ tab: 'vehicle', stage: s.index })}
                className="cursor-pointer border-t border-line hover:bg-surface-2"
                title={`${s.index + 1}段の設定を開く`}
              >
                <td className="py-1.5 pr-2">
                  <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: stageColorVar(s.index + 1) }} />
                  {s.index + 1}
                </td>
                <td className="num py-1.5 pr-2 text-right">{fmtMass(s.ownMass)}</td>
                <td className="num py-1.5 pr-2 text-right">{fmtMass(s.propellant)}</td>
                <td className="num py-1.5 pr-2 text-right">{fmtForce(s.thrustMax)}</td>
                <td className="num py-1.5 pr-2 text-right">{fmt(s.isp, 0)} s</td>
                <td className="num py-1.5 text-right">{fmt(s.dv / 1000, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1 text-[11px] text-ink-3">質量は各段単体（推進剤込み）。推進剤は燃焼時間と推力・Ispから計算。Δv は km/s。</p>

      <h3 className="mb-1.5 mt-5 text-[12px] font-semibold">シーケンス</h3>
      <SequenceChart specs={specs} />

      <h3 className="mb-1 mt-5 text-[12px] font-semibold">発射条件</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
        <dt className="text-ink-3">地点</dt>
        <dd className="num">
          {fmt(launch.latitude_deg, 3)}°, {fmt(launch.longitude_deg, 3)}° · 標高 {launch.altitude_m} m
        </dd>
        <dt className="text-ink-3">日時</dt>
        <dd className="num">
          {dt.year}-{pad2(dt.month)}-{pad2(dt.day)} {pad2(dt.hour)}:{pad2(dt.minute)} UTC
        </dd>
        <dt className="text-ink-3">打上げ方位</dt>
        <dd className="num">
          {config.attitude.profile.length > 0
            ? `${config.attitude.profile[0].azimuth_deg}°（姿勢プログラム ${config.attitude.profile.length}点）`
            : `${config.attitude.azimuth_deg}° · 仰角 ${config.attitude.elevation_deg}°`}
        </dd>
      </dl>
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
            <span className="text-[11px] text-ink-2">{s.index + 1}段</span>
            <div className="relative h-4">
              {/* Stage lifetime */}
              <div
                className="absolute top-1/2 h-px -translate-y-1/2 bg-line-strong"
                style={{ left: pct(s.start), right: s.separation === null ? 0 : `calc(100% - ${pct(s.separation)})` }}
              />
              {/* Burn */}
              <div
                className="absolute top-0.5 h-3 rounded-[3px]"
                title={`点火 T+${fmt(s.ignition)} s / 燃焼終了 T+${fmt(s.burnout)} s`}
                style={{
                  left: pct(s.ignition),
                  width: `max(3px, calc(${pct(s.burnout)} - ${pct(s.ignition)}))`,
                  background: stageColorVar(s.index + 1),
                }}
              />
              {s.separation !== null && s.separation <= end && (
                <div
                  className="absolute top-0 h-4 w-px bg-ink"
                  title={`分離 T+${fmt(s.separation)} s`}
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
          <span className="inline-block h-2 w-3 rounded-[2px] bg-ink-3" /> 燃焼
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-px bg-ink" /> 分離
        </span>
        <span>横軸: 打上げからの秒</span>
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

/* ------------------------------------------------------------------ Launch */

function LaunchTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const { launch } = config
  const dt = launch.datetime_utc
  const setLaunch = (l: Partial<ClientConfig['launch']>) => patch((c) => ({ ...c, launch: { ...c.launch, ...l } }))
  const setDate = (v: string) => {
    const [y, m, d] = v.split('-').map(Number)
    if ([y, m, d].every(Number.isFinite)) setLaunch({ datetime_utc: { ...dt, year: y, month: m, day: d } })
  }
  const setTime = (v: string) => {
    const [h, mi, s = 0] = v.split(':').map(Number)
    if ([h, mi, s].every(Number.isFinite)) setLaunch({ datetime_utc: { ...dt, hour: h, minute: mi, second: s } })
  }
  return (
    <>
      <Group title="発射地点">
        <NumberField label="緯度" unit="°" path="launch.latitude_deg" value={launch.latitude_deg} onChange={(v) => setLaunch({ latitude_deg: v })} />
        <NumberField label="経度" unit="°" path="launch.longitude_deg" value={launch.longitude_deg} onChange={(v) => setLaunch({ longitude_deg: v })} />
        <NumberField label="標高" unit="m" path="launch.altitude_m" value={launch.altitude_m} onChange={(v) => setLaunch({ altitude_m: v })} />
      </Group>
      <Group title="日時">
        <TextInputField label="日付 (UTC)" type="date" path="launch.datetime_utc" value={`${dt.year}-${pad2(dt.month)}-${pad2(dt.day)}`} onChange={setDate} />
        <TextInputField label="時刻 (UTC)" type="time" value={`${pad2(dt.hour)}:${pad2(dt.minute)}:${pad2(dt.second)}`} onChange={setTime} />
      </Group>
      <Group title="初期速度" note="地上からの発射なら 0。空中発射などで使います。">
        <VectorField
          label="速度"
          unit="m/s · 北/東/下"
          axes={['N', 'E', 'D']}
          path="launch.velocity_ned_mps"
          value={launch.velocity_ned_mps}
          onChange={(v) => setLaunch({ velocity_ned_mps: v })}
        />
      </Group>
    </>
  )
}

/* ----------------------------------------------------------------- Vehicle */

function VehicleTab({
  config,
  patch,
  specs,
  stage: active,
  onStage,
}: {
  config: ClientConfig
  patch: Patch
  specs: VehicleSpec
  stage: number
  onStage: (i: number) => void
}) {
  const stages = config.stages
  const idx = Math.min(active, stages.length - 1)
  const stage = stages[idx]
  const spec = specs.stages[idx]
  const isLast = idx === stages.length - 1

  const setStage = (s: Partial<ClientStageConfig>) =>
    patch((c) => ({ ...c, stages: c.stages.map((st, i) => (i === idx ? { ...st, ...s } : st)) }))

  const addStage = () => {
    if (stages.length >= MAX_STAGE_COUNT) return
    const prev = stages[stages.length - 1]
    const next = {
      ...createDefaultStage(),
      mass_initial_kg: Math.round(prev.mass_initial_kg * 0.25),
      burn_start_s: 2,
      burn_end_s: 60,
      forced_cutoff_s: 60,
      thrust_constant: Math.round(prev.thrust_constant * 0.25),
    }
    // The current top stage now needs a real separation time.
    patch((c) => ({
      ...c,
      stages: [
        ...c.stages.map((st, i) =>
          i === c.stages.length - 1 && st.separation_time_s > 1e5 ? { ...st, separation_time_s: st.burn_end_s + 3 } : st,
        ),
        next,
      ],
    }))
    onStage(stages.length)
  }
  const removeStage = () => {
    if (stages.length <= 1) return
    patch((c) => ({ ...c, stages: c.stages.filter((_, i) => i !== idx) }))
    onStage(Math.max(0, idx - 1))
  }

  const p = (k: keyof ClientStageConfig) => stagePath(idx, k)
  const abs = (t: number) => `T+${fmt(spec.start + t)} s`
  const thrustProfile = stage.thrust_profile ?? []
  const ispProfile = stage.isp_profile ?? []

  return (
    <>
      <div className="mb-3 flex items-center gap-1">
        {stages.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onStage(i)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[6px] border px-3 text-[12px] font-medium',
              i === idx ? 'border-ink bg-ink text-surface' : 'border-line text-ink-2 hover:border-line-strong',
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: stageColorVar(i + 1) }} />
            {i + 1}段
          </button>
        ))}
        {stages.length < MAX_STAGE_COUNT && (
          <button type="button" onClick={addStage} className="flex h-8 items-center gap-1 rounded-[6px] px-2 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink">
            <Plus className="h-3.5 w-3.5" /> 段を追加
          </button>
        )}
      </div>

      <Group title="質量">
        <NumberField
          label="段の質量"
          hint="この段単体の質量（推進剤込み）。上の段は含めません。"
          unit="kg"
          path={p('mass_initial_kg')}
          value={stage.mass_initial_kg}
          onChange={(v) => setStage({ mass_initial_kg: v })}
        />
        <p className="text-right text-[11px] text-ink-3">
          推進剤 {fmtMass(spec.propellant)} を消費 · 点火時の総質量 {fmtMass(spec.stackMass)}
        </p>
      </Group>

      <Group title="推力・比推力">
        <Toggle
          label="推力を時刻テーブルで入力"
          checked={thrustProfile.length > 0}
          onChange={(on) =>
            setStage({
              thrust_profile: on
                ? [
                    { time: stage.burn_start_s, value: stage.thrust_constant },
                    { time: stage.burn_end_s, value: stage.thrust_constant },
                  ]
                : [],
            })
          }
        />
        {thrustProfile.length > 0 ? (
          <ProfileTable columns={[{ key: 'time', label: '時刻 s' }, { key: 'value', label: '推力 N' }]} rows={thrustProfile} onChange={(rows) => setStage({ thrust_profile: rows })} />
        ) : (
          <NumberField label="推力（真空）" unit="N" path={p('thrust_constant')} value={stage.thrust_constant} onChange={(v) => setStage({ thrust_constant: v })} />
        )}
        <Toggle
          label="Isp を時刻テーブルで入力"
          checked={ispProfile.length > 0}
          onChange={(on) =>
            setStage({
              isp_profile: on
                ? [
                    { time: stage.burn_start_s, value: stage.isp_constant },
                    { time: stage.burn_end_s, value: stage.isp_constant },
                  ]
                : [],
            })
          }
        />
        {ispProfile.length > 0 ? (
          <ProfileTable columns={[{ key: 'time', label: '時刻 s' }, { key: 'value', label: 'Isp s' }]} rows={ispProfile} onChange={(rows) => setStage({ isp_profile: rows })} />
        ) : (
          <NumberField label="比推力 Isp（真空）" unit="s" path={p('isp_constant')} value={stage.isp_constant} onChange={(v) => setStage({ isp_constant: v })} />
        )}
      </Group>

      <Group
        title="シーケンス"
        note={
          idx === 0
            ? '時刻は打上げからの秒です。'
            : `この段は ${idx}段の分離（T+${fmt(spec.start)} s）から始まり、時刻はそこからの経過秒で入力します。テーブルの時刻も同じです。`
        }
      >
        <NumberField label="点火" note={abs(stage.burn_start_s)} unit="s" path={p('burn_start_s')} value={stage.burn_start_s} onChange={(v) => setStage({ burn_start_s: v })} />
        <NumberField label="燃焼終了" note={abs(stage.burn_end_s)} unit="s" path={p('burn_end_s')} value={stage.burn_end_s} onChange={(v) => setStage({ burn_end_s: v })} />
        <NumberField label="強制停止" note={abs(stage.forced_cutoff_s)} unit="s" path={p('forced_cutoff_s')} value={stage.forced_cutoff_s} onChange={(v) => setStage({ forced_cutoff_s: v })} />
        {!isLast && (
          <NumberField label="分離" note={abs(stage.separation_time_s)} unit="s" path={p('separation_time_s')} value={stage.separation_time_s} onChange={(v) => setStage({ separation_time_s: v })} />
        )}
      </Group>

      <Group title="飛行モード・補正">
        <SelectField label="動力飛行" path={p('power_mode')} value={stage.power_mode} options={POWER_MODE_OPTIONS.map((o) => ({ ...o, label: o.label.replace(/^\d+:\s*/, '') }))} onChange={(v) => setStage({ power_mode: v })} />
        <SelectField label="慣性飛行" path={p('free_mode')} value={stage.free_mode} options={FREE_MODE_OPTIONS.map((o) => ({ ...o, label: o.label.replace(/^\d+:\s*/, '') }))} onChange={(v) => setStage({ free_mode: v })} />
        <NumberField label="推力倍率" unit="×" path={p('thrust_multiplier')} value={stage.thrust_multiplier} onChange={(v) => setStage({ thrust_multiplier: v })} />
        <NumberField label="Isp倍率" unit="×" path={p('isp_multiplier')} value={stage.isp_multiplier} onChange={(v) => setStage({ isp_multiplier: v })} />
      </Group>

      <Group title="ノズル">
        <NumberField label="スロート径" unit="m" path={p('throat_diameter_m')} value={stage.throat_diameter_m} onChange={(v) => setStage({ throat_diameter_m: v })} />
        <NumberField label="膨張比" unit="—" path={p('nozzle_expansion_ratio')} value={stage.nozzle_expansion_ratio} onChange={(v) => setStage({ nozzle_expansion_ratio: v })} />
        <NumberField label="出口圧" unit="Pa" path={p('nozzle_exit_pressure_pa')} value={stage.nozzle_exit_pressure_pa} onChange={(v) => setStage({ nozzle_exit_pressure_pa: v })} />
      </Group>

      {stages.length > 1 && (
        <button type="button" onClick={removeStage} className="flex h-8 items-center gap-1.5 text-[12px] text-ink-3 hover:text-danger">
          <Trash2 className="h-3.5 w-3.5" /> {idx + 1}段を削除
        </button>
      )}
    </>
  )
}

/* -------------------------------------------------------------------- Aero */

function AeroTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const a = config.aerodynamics
  const set = (v: Partial<ClientConfig['aerodynamics']>) => patch((c) => ({ ...c, aerodynamics: { ...c.aerodynamics, ...v } }))
  return (
    <>
      <Group title="形状">
        <NumberField label="機体直径" unit="m" path="aerodynamics.body_diameter_m" value={a.body_diameter_m} onChange={(v) => set({ body_diameter_m: v })} />
      </Group>
      <Group title="軸力係数 CA" note="機軸方向の抵抗。マッハ数で変わる場合はテーブルで入力します。">
        <Toggle label="マッハ数テーブルで入力" checked={a.ca_profile.length > 0} onChange={(on) => set({ ca_profile: on ? [{ mach: 0, value: a.ca_constant }, { mach: 5, value: a.ca_constant }] : [] })} />
        {a.ca_profile.length > 0 ? (
          <ProfileTable columns={[{ key: 'mach', label: 'Mach' }, { key: 'value', label: 'CA' }]} rows={a.ca_profile} onChange={(rows) => set({ ca_profile: rows })} />
        ) : (
          <NumberField label="CA" unit="—" path="aerodynamics.ca_constant" value={a.ca_constant} onChange={(v) => set({ ca_constant: v })} />
        )}
        <NumberField label="CA倍率" unit="×" path="aerodynamics.ca_multiplier" value={a.ca_multiplier} onChange={(v) => set({ ca_multiplier: v })} />
      </Group>
      <Group title="法線力係数 CN">
        <Toggle label="マッハ数テーブルで入力" checked={a.cn_profile.length > 0} onChange={(on) => set({ cn_profile: on ? [{ mach: 0, value: a.cn_constant }, { mach: 5, value: a.cn_constant }] : [] })} />
        {a.cn_profile.length > 0 ? (
          <ProfileTable columns={[{ key: 'mach', label: 'Mach' }, { key: 'value', label: 'CN' }]} rows={a.cn_profile} onChange={(rows) => set({ cn_profile: rows })} />
        ) : (
          <NumberField label="CN" unit="—" path="aerodynamics.cn_constant" value={a.cn_constant} onChange={(v) => set({ cn_constant: v })} />
        )}
        <NumberField label="CN倍率" unit="×" path="aerodynamics.cn_multiplier" value={a.cn_multiplier} onChange={(v) => set({ cn_multiplier: v })} />
      </Group>
      <Group title="弾道飛行" note="慣性飛行モードが「弾道飛行」の段で使います。">
        <NumberField label="弾道係数" unit="kg/m²" path="aerodynamics.ballistic_coefficient" value={a.ballistic_coefficient} onChange={(v) => set({ ballistic_coefficient: v })} />
      </Group>
    </>
  )
}

/* ------------------------------------------------------- Attitude and wind */

function FlightTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const at = config.attitude
  const w = config.wind
  const setAt = (v: Partial<ClientConfig['attitude']>) => patch((c) => ({ ...c, attitude: { ...c.attitude, ...v } }))
  const setW = (v: Partial<ClientConfig['wind']>) => patch((c) => ({ ...c, wind: { ...c.wind, ...v } }))
  return (
    <>
      <Group title="姿勢" note="方位角は北から時計回り、仰角は水平から上向き。時刻は打上げからの秒です。">
        <Toggle
          label="姿勢プログラム（時刻テーブル）"
          checked={at.profile.length > 0}
          onChange={(on) =>
            setAt({
              profile: on
                ? [
                    { time: 0, azimuth_deg: at.azimuth_deg, elevation_deg: at.elevation_deg },
                    { time: 60, azimuth_deg: at.azimuth_deg, elevation_deg: at.elevation_deg },
                  ]
                : [],
            })
          }
        />
        {at.profile.length > 0 ? (
          <ProfileTable
            path="attitude.profile"
            columns={[{ key: 'time', label: '時刻 s' }, { key: 'azimuth_deg', label: '方位 °' }, { key: 'elevation_deg', label: '仰角 °' }]}
            rows={at.profile}
            onChange={(rows) => setAt({ profile: rows })}
          />
        ) : (
          <>
            <NumberField label="方位角" unit="°" path="attitude.azimuth_deg" value={at.azimuth_deg} onChange={(v) => setAt({ azimuth_deg: v })} />
            <NumberField label="仰角" unit="°" path="attitude.elevation_deg" value={at.elevation_deg} onChange={(v) => setAt({ elevation_deg: v })} />
          </>
        )}
      </Group>
      <Group title="姿勢の誤差">
        <NumberField label="ピッチ" unit="°" path="attitude.pitch_offset_deg" value={at.pitch_offset_deg} onChange={(v) => setAt({ pitch_offset_deg: v })} />
        <NumberField label="ヨー" unit="°" path="attitude.yaw_offset_deg" value={at.yaw_offset_deg} onChange={(v) => setAt({ yaw_offset_deg: v })} />
        <NumberField label="ロール" unit="°" path="attitude.roll_offset_deg" value={at.roll_offset_deg} onChange={(v) => setAt({ roll_offset_deg: v })} />
        <VectorField label="ジャイロバイアス" unit="°/h" axes={['X', 'Y', 'Z']} value={at.gyro_bias_deg_h} onChange={(v) => setAt({ gyro_bias_deg_h: v })} />
      </Group>
      <Group title="風" note="風向は風が吹いてくる方位（北=0°、時計回り）。">
        <Toggle
          label="高度別に入力（テーブル）"
          checked={w.profile.length > 0}
          onChange={(on) =>
            setW({
              profile: on
                ? [
                    { altitude_m: 0, speed_mps: w.speed_mps, direction_deg: w.direction_deg },
                    { altitude_m: 10000, speed_mps: w.speed_mps, direction_deg: w.direction_deg },
                  ]
                : [],
            })
          }
        />
        {w.profile.length > 0 ? (
          <ProfileTable
            path="wind.profile"
            columns={[{ key: 'altitude_m', label: '高度 m' }, { key: 'speed_mps', label: '風速 m/s' }, { key: 'direction_deg', label: '風向 °' }]}
            rows={w.profile}
            onChange={(rows) => setW({ profile: rows })}
          />
        ) : (
          <>
            <NumberField label="風速" unit="m/s" path="wind.speed_mps" value={w.speed_mps} onChange={(v) => setW({ speed_mps: v })} />
            <NumberField label="風向" unit="°" path="wind.direction_deg" value={w.direction_deg} onChange={(v) => setW({ direction_deg: v })} />
          </>
        )}
      </Group>
    </>
  )
}

/* ------------------------------------------------------------------ Solver */

function SolverTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const s = config.simulation
  const integrator = s.integrator ?? { method: 'rk45' as const, rk4_step_s: null }
  const set = (v: Partial<ClientConfig['simulation']>) => patch((c) => ({ ...c, simulation: { ...c.simulation, ...v } }))
  return (
    <>
      <Group title="時間" note="着地するか計算時間に達すると終了します。">
        <NumberField label="計算時間" unit="s" path="simulation.duration_s" value={s.duration_s} onChange={(v) => set({ duration_s: v })} />
        <NumberField label="出力間隔" unit="s" path="simulation.output_step_s" value={s.output_step_s} onChange={(v) => set({ output_step_s: v })} />
      </Group>
      <Group title="数値積分">
        <SelectField
          label="積分法"
          path="simulation.integrator.method"
          value={integrator.method}
          options={[
            { value: 'rk45', label: 'RK45（可変刻み）' },
            { value: 'rk4', label: 'RK4（固定刻み）' },
          ]}
          onChange={(method) =>
            set({
              integrator: {
                method,
                rk4_step_s: method === 'rk4' ? integrator.rk4_step_s ?? Math.max(s.output_step_s / 2, 0.001) : integrator.rk4_step_s,
              },
            })
          }
        />
        {integrator.method === 'rk4' && (
          <NumberField
            label="RK4 刻み"
            unit="s"
            path="simulation.integrator.rk4_step_s"
            value={integrator.rk4_step_s ?? Math.max(s.output_step_s / 2, 0.001)}
            onChange={(v) => set({ integrator: { ...integrator, rk4_step_s: v } })}
          />
        )}
      </Group>
      <Group title="大気">
        <NumberField label="密度の変動" unit="%" path="simulation.air_density_percent" value={s.air_density_percent} onChange={(v) => set({ air_density_percent: v })} />
      </Group>
    </>
  )
}
