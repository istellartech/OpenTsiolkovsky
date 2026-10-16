import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { ClientConfig, ClientStageConfig } from '../lib/simulation'
import { FREE_MODE_OPTIONS, MAX_STAGE_COUNT, POWER_MODE_OPTIONS, createDefaultStage } from '../config/defaults'
import {
  More,
  NumberField,
  ProfileTable,
  Section,
  SelectField,
  TextInputField,
  Toggle,
  VectorField,
} from './primitives'
import { stageColorVar } from '../lib/trajectory'
import { cn } from '../lib/utils'

type Patch = (fn: (c: ClientConfig) => ClientConfig) => void

const pad2 = (n: number) => String(n).padStart(2, '0')
const fmtInt = (n: number) => Math.round(n).toLocaleString('ja-JP')

/** Validation keys: the first stage is `stage.*`, later ones `stage[n].*` (1-based). */
const stagePath = (i: number, key: keyof ClientStageConfig) => (i === 0 ? `stage.${key}` : `stage[${i + 1}].${key}`)

export function Inspector({ config, patch }: { config: ClientConfig; patch: Patch }) {
  return (
    <div className="pb-10">
      <div className="border-b border-line px-4 py-3">
        <TextInputField
          label="名称"
          value={config.name}
          onChange={(name) => patch((c) => ({ ...c, name }))}
          className="font-sans"
        />
      </div>
      <LaunchSection config={config} patch={patch} />
      <VehicleSection config={config} patch={patch} />
      <AeroSection config={config} patch={patch} />
      <AttitudeSection config={config} patch={patch} />
      <WindSection config={config} patch={patch} />
      <SolverSection config={config} patch={patch} />
    </div>
  )
}

/* ------------------------------------------------------------------ Launch */

function LaunchSection({ config, patch }: { config: ClientConfig; patch: Patch }) {
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
    <Section id="launch" title="発射" meta={`${launch.latitude_deg.toFixed(2)}°, ${launch.longitude_deg.toFixed(2)}°`}>
      <NumberField label="緯度" unit="°" path="launch.latitude_deg" value={launch.latitude_deg} onChange={(v) => setLaunch({ latitude_deg: v })} />
      <NumberField label="経度" unit="°" path="launch.longitude_deg" value={launch.longitude_deg} onChange={(v) => setLaunch({ longitude_deg: v })} />
      <NumberField label="標高" unit="m" path="launch.altitude_m" value={launch.altitude_m} onChange={(v) => setLaunch({ altitude_m: v })} />
      <TextInputField label="日付 (UTC)" type="date" path="launch.datetime_utc" value={`${dt.year}-${pad2(dt.month)}-${pad2(dt.day)}`} onChange={setDate} />
      <TextInputField label="時刻 (UTC)" type="time" value={`${pad2(dt.hour)}:${pad2(dt.minute)}:${pad2(dt.second)}`} onChange={setTime} />
      <More>
        <VectorField
          label="初期速度"
          unit="m/s · NED"
          axes={['N', 'E', 'D']}
          path="launch.velocity_ned_mps"
          value={launch.velocity_ned_mps}
          onChange={(v) => setLaunch({ velocity_ned_mps: v })}
        />
      </More>
    </Section>
  )
}

/* ----------------------------------------------------------------- Vehicle */

function VehicleSection({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const [active, setActive] = useState(0)
  const stages = config.stages
  const idx = Math.min(active, stages.length - 1)
  const stage = stages[idx]

  const setStage = (s: Partial<ClientStageConfig>) =>
    patch((c) => ({ ...c, stages: c.stages.map((st, i) => (i === idx ? { ...st, ...s } : st)) }))

  const addStage = () => {
    if (stages.length >= MAX_STAGE_COUNT) return
    const prev = stages[stages.length - 1]
    const next = {
      ...createDefaultStage(),
      mass_initial_kg: Math.round(prev.mass_initial_kg * 0.2),
      burn_start_s: 0,
      burn_end_s: 60,
      forced_cutoff_s: 60,
      thrust_constant: Math.round(prev.thrust_constant * 0.2),
    }
    patch((c) => ({ ...c, stages: [...c.stages, next] }))
    setActive(stages.length)
  }
  const removeStage = () => {
    if (stages.length <= 1) return
    patch((c) => ({ ...c, stages: c.stages.filter((_, i) => i !== idx) }))
    setActive(Math.max(0, idx - 1))
  }

  const p = (k: keyof ClientStageConfig) => stagePath(idx, k)
  const thrustProfile = stage.thrust_profile ?? []
  const ispProfile = stage.isp_profile ?? []

  return (
    <Section id="vehicle" title="機体" meta={`${stages.length}段 · ${fmtInt(stages[0].mass_initial_kg)} kg`}>
      <div className="mb-2 flex items-center gap-1">
        {stages.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setActive(i)}
            className={cn(
              'flex h-7 items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-medium',
              i === idx ? 'bg-ink text-surface' : 'text-ink-2 hover:bg-surface-2',
            )}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: stageColorVar(i + 1) }} />
            {i + 1}段
          </button>
        ))}
        {stages.length < MAX_STAGE_COUNT && (
          <button type="button" onClick={addStage} aria-label="段を追加" title="段を追加" className="flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-3 hover:bg-surface-2 hover:text-ink">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
        {stages.length > 1 && (
          <button type="button" onClick={removeStage} aria-label={`${idx + 1}段を削除`} title={`${idx + 1}段を削除`} className="ml-auto flex h-7 w-7 items-center justify-center rounded-[6px] text-ink-3 hover:bg-surface-2 hover:text-danger">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Group label="質量">
        <NumberField label="初期質量" hint="この段の点火時点での機体全体の質量（上段を含む）" unit="kg" path={p('mass_initial_kg')} value={stage.mass_initial_kg} onChange={(v) => setStage({ mass_initial_kg: v })} />
      </Group>

      <Group label="推進">
        <Toggle
          label="推力を時間テーブルで指定"
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
          <ProfileTable
            columns={[{ key: 'time', label: '時刻 s' }, { key: 'value', label: '推力 N' }]}
            rows={thrustProfile}
            onChange={(rows) => setStage({ thrust_profile: rows })}
          />
        ) : (
          <NumberField label="推力 (真空)" unit="N" path={p('thrust_constant')} value={stage.thrust_constant} onChange={(v) => setStage({ thrust_constant: v })} />
        )}
        <Toggle
          label="Ispを時間テーブルで指定"
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
          <ProfileTable
            columns={[{ key: 'time', label: '時刻 s' }, { key: 'value', label: 'Isp s' }]}
            rows={ispProfile}
            onChange={(rows) => setStage({ isp_profile: rows })}
          />
        ) : (
          <NumberField label="Isp (真空)" unit="s" path={p('isp_constant')} value={stage.isp_constant} onChange={(v) => setStage({ isp_constant: v })} />
        )}
      </Group>

      <Group label="シーケンス">
        <NumberField label="燃焼開始" unit="s" path={p('burn_start_s')} value={stage.burn_start_s} onChange={(v) => setStage({ burn_start_s: v })} />
        <NumberField label="燃焼終了" unit="s" path={p('burn_end_s')} value={stage.burn_end_s} onChange={(v) => setStage({ burn_end_s: v })} />
        <NumberField label="強制停止" unit="s" path={p('forced_cutoff_s')} value={stage.forced_cutoff_s} onChange={(v) => setStage({ forced_cutoff_s: v })} />
        {idx < stages.length - 1 && (
          <NumberField label="分離" unit="s" path={p('separation_time_s')} value={stage.separation_time_s} onChange={(v) => setStage({ separation_time_s: v })} />
        )}
      </Group>

      <More>
        <SelectField label="動力飛行" path={p('power_mode')} value={stage.power_mode} options={POWER_MODE_OPTIONS.map((o) => ({ ...o, label: o.label.replace(/^\d+:\s*/, '') }))} onChange={(v) => setStage({ power_mode: v })} />
        <SelectField label="慣性飛行" path={p('free_mode')} value={stage.free_mode} options={FREE_MODE_OPTIONS.map((o) => ({ ...o, label: o.label.replace(/^\d+:\s*/, '') }))} onChange={(v) => setStage({ free_mode: v })} />
        <NumberField label="推力倍率" unit="×" path={p('thrust_multiplier')} value={stage.thrust_multiplier} onChange={(v) => setStage({ thrust_multiplier: v })} />
        <NumberField label="Isp倍率" unit="×" path={p('isp_multiplier')} value={stage.isp_multiplier} onChange={(v) => setStage({ isp_multiplier: v })} />
        <NumberField label="スロート径" unit="m" path={p('throat_diameter_m')} value={stage.throat_diameter_m} onChange={(v) => setStage({ throat_diameter_m: v })} />
        <NumberField label="ノズル膨張比" unit="—" path={p('nozzle_expansion_ratio')} value={stage.nozzle_expansion_ratio} onChange={(v) => setStage({ nozzle_expansion_ratio: v })} />
        <NumberField label="ノズル出口圧" unit="Pa" path={p('nozzle_exit_pressure_pa')} value={stage.nozzle_exit_pressure_pa} onChange={(v) => setStage({ nozzle_exit_pressure_pa: v })} />
      </More>
    </Section>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-2 first:mt-0">
      <div className="mb-0.5 text-[11px] font-medium tracking-wide text-ink-3">{label}</div>
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------- Aero */

function AeroSection({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const a = config.aerodynamics
  const set = (v: Partial<ClientConfig['aerodynamics']>) => patch((c) => ({ ...c, aerodynamics: { ...c.aerodynamics, ...v } }))
  return (
    <Section id="aero" title="空力" defaultOpen={false} meta={`φ${a.body_diameter_m} m · CA ${a.ca_profile.length ? 'table' : a.ca_constant}`}>
      <NumberField label="機体直径" unit="m" path="aerodynamics.body_diameter_m" value={a.body_diameter_m} onChange={(v) => set({ body_diameter_m: v })} />
      <Toggle
        label="CA をマッハ数テーブルで指定"
        checked={a.ca_profile.length > 0}
        onChange={(on) => set({ ca_profile: on ? [{ mach: 0, value: a.ca_constant }, { mach: 5, value: a.ca_constant }] : [] })}
      />
      {a.ca_profile.length > 0 ? (
        <ProfileTable columns={[{ key: 'mach', label: 'Mach' }, { key: 'value', label: 'CA' }]} rows={a.ca_profile} onChange={(rows) => set({ ca_profile: rows })} />
      ) : (
        <NumberField label="軸力係数 CA" unit="—" path="aerodynamics.ca_constant" value={a.ca_constant} onChange={(v) => set({ ca_constant: v })} />
      )}
      <Toggle
        label="CN をマッハ数テーブルで指定"
        checked={a.cn_profile.length > 0}
        onChange={(on) => set({ cn_profile: on ? [{ mach: 0, value: a.cn_constant }, { mach: 5, value: a.cn_constant }] : [] })}
      />
      {a.cn_profile.length > 0 ? (
        <ProfileTable columns={[{ key: 'mach', label: 'Mach' }, { key: 'value', label: 'CN' }]} rows={a.cn_profile} onChange={(rows) => set({ cn_profile: rows })} />
      ) : (
        <NumberField label="法線力係数 CN" unit="—" path="aerodynamics.cn_constant" value={a.cn_constant} onChange={(v) => set({ cn_constant: v })} />
      )}
      <More>
        <NumberField label="CA倍率" unit="×" path="aerodynamics.ca_multiplier" value={a.ca_multiplier} onChange={(v) => set({ ca_multiplier: v })} />
        <NumberField label="CN倍率" unit="×" path="aerodynamics.cn_multiplier" value={a.cn_multiplier} onChange={(v) => set({ cn_multiplier: v })} />
        <NumberField label="弾道係数" unit="kg/m²" path="aerodynamics.ballistic_coefficient" value={a.ballistic_coefficient} onChange={(v) => set({ ballistic_coefficient: v })} />
      </More>
    </Section>
  )
}

/* ---------------------------------------------------------------- Attitude */

function AttitudeSection({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const at = config.attitude
  const set = (v: Partial<ClientConfig['attitude']>) => patch((c) => ({ ...c, attitude: { ...c.attitude, ...v } }))
  const useProfile = at.profile.length > 0
  return (
    <Section id="attitude" title="姿勢" meta={useProfile ? `プログラム ${at.profile.length}点` : `方位 ${at.azimuth_deg}° · 仰角 ${at.elevation_deg}°`}>
      <Toggle
        label="姿勢プログラム (時間テーブル)"
        checked={useProfile}
        onChange={(on) =>
          set({
            profile: on
              ? [
                  { time: 0, azimuth_deg: at.azimuth_deg, elevation_deg: at.elevation_deg },
                  { time: 60, azimuth_deg: at.azimuth_deg, elevation_deg: at.elevation_deg },
                ]
              : [],
          })
        }
      />
      {useProfile ? (
        <ProfileTable
          path="attitude.profile"
          columns={[{ key: 'time', label: '時刻 s' }, { key: 'azimuth_deg', label: '方位 °' }, { key: 'elevation_deg', label: '仰角 °' }]}
          rows={at.profile}
          onChange={(rows) => set({ profile: rows })}
        />
      ) : (
        <>
          <NumberField label="方位角" unit="°" path="attitude.azimuth_deg" value={at.azimuth_deg} onChange={(v) => set({ azimuth_deg: v })} />
          <NumberField label="仰角" unit="°" path="attitude.elevation_deg" value={at.elevation_deg} onChange={(v) => set({ elevation_deg: v })} />
        </>
      )}
      <More label="オフセット・ジャイロ">
        <NumberField label="ピッチオフセット" unit="°" path="attitude.pitch_offset_deg" value={at.pitch_offset_deg} onChange={(v) => set({ pitch_offset_deg: v })} />
        <NumberField label="ヨーオフセット" unit="°" path="attitude.yaw_offset_deg" value={at.yaw_offset_deg} onChange={(v) => set({ yaw_offset_deg: v })} />
        <NumberField label="ロールオフセット" unit="°" path="attitude.roll_offset_deg" value={at.roll_offset_deg} onChange={(v) => set({ roll_offset_deg: v })} />
        <VectorField label="ジャイロバイアス" unit="°/h" axes={['X', 'Y', 'Z']} value={at.gyro_bias_deg_h} onChange={(v) => set({ gyro_bias_deg_h: v })} />
      </More>
    </Section>
  )
}

/* -------------------------------------------------------------------- Wind */

function WindSection({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const w = config.wind
  const set = (v: Partial<ClientConfig['wind']>) => patch((c) => ({ ...c, wind: { ...c.wind, ...v } }))
  const useProfile = w.profile.length > 0
  return (
    <Section id="wind" title="風" defaultOpen={false} meta={useProfile ? `高度別 ${w.profile.length}点` : `${w.speed_mps} m/s · ${w.direction_deg}°`}>
      <Toggle
        label="高度別の風 (テーブル)"
        checked={useProfile}
        onChange={(on) =>
          set({
            profile: on
              ? [
                  { altitude_m: 0, speed_mps: w.speed_mps, direction_deg: w.direction_deg },
                  { altitude_m: 10000, speed_mps: w.speed_mps, direction_deg: w.direction_deg },
                ]
              : [],
          })
        }
      />
      {useProfile ? (
        <ProfileTable
          path="wind.profile"
          columns={[{ key: 'altitude_m', label: '高度 m' }, { key: 'speed_mps', label: '風速 m/s' }, { key: 'direction_deg', label: '風向 °' }]}
          rows={w.profile}
          onChange={(rows) => set({ profile: rows })}
        />
      ) : (
        <>
          <NumberField label="風速" unit="m/s" path="wind.speed_mps" value={w.speed_mps} onChange={(v) => set({ speed_mps: v })} />
          <NumberField label="風向 (吹いてくる方位)" unit="°" path="wind.direction_deg" value={w.direction_deg} onChange={(v) => set({ direction_deg: v })} />
        </>
      )}
    </Section>
  )
}

/* ------------------------------------------------------------------ Solver */

function SolverSection({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const s = config.simulation
  const integrator = s.integrator ?? { method: 'rk45' as const, rk4_step_s: null }
  const set = (v: Partial<ClientConfig['simulation']>) => patch((c) => ({ ...c, simulation: { ...c.simulation, ...v } }))
  return (
    <Section id="solver" title="計算条件" defaultOpen={false} meta={`${s.duration_s} s · ${integrator.method.toUpperCase()}`}>
      <NumberField label="計算時間" unit="s" path="simulation.duration_s" value={s.duration_s} onChange={(v) => set({ duration_s: v })} />
      <NumberField label="出力間隔" unit="s" path="simulation.output_step_s" value={s.output_step_s} onChange={(v) => set({ output_step_s: v })} />
      <SelectField
        label="積分法"
        path="simulation.integrator.method"
        value={integrator.method}
        options={[
          { value: 'rk45', label: 'RK45 (可変刻み)' },
          { value: 'rk4', label: 'RK4 (固定刻み)' },
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
      <NumberField label="大気密度の変動" unit="%" path="simulation.air_density_percent" value={s.air_density_percent} onChange={(v) => set({ air_density_percent: v })} />
    </Section>
  )
}
