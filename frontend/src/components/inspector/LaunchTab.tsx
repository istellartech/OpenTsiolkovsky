import type { ClientConfig } from '../../lib/simulation'
import { LAUNCH_SITES, findSite } from '../../config/sites'
import { NumberField, TextInputField, VectorField } from '../primitives'
import { pad2, Group, type Patch } from './shared'

export function LaunchTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const { launch } = config
  const dt = launch.datetime_utc
  const site = findSite(launch.latitude_deg, launch.longitude_deg)
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
      <Group title="発射地点" note="射場を選ぶと座標が入ります（座標は概略値）。">
        <label className="flex min-h-8 items-center gap-3 py-[3px]">
          <span className="min-w-0 flex-1 text-ink-2">射場</span>
          <select
            aria-label="射場"
            value={site?.id ?? ''}
            onChange={(e) => {
              const s = LAUNCH_SITES.find((x) => x.id === e.target.value)
              if (s) setLaunch({ latitude_deg: s.lat, longitude_deg: s.lon, altitude_m: s.alt })
            }}
            className="h-8 w-[13rem] shrink-0 cursor-pointer rounded-[6px] border border-line bg-surface-2 px-2 text-[12px] text-ink outline-none hover:border-line-strong focus:border-signal"
          >
            <option value="">座標を直接入力</option>
            {[...new Set(LAUNCH_SITES.map((x) => x.region))].map((region) => (
              <optgroup key={region} label={region}>
                {LAUNCH_SITES.filter((x) => x.region === region).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
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
