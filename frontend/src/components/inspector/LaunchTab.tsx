import type { ClientConfig } from '../../lib/simulation'
import { LAUNCH_SITES, findSite } from '../../config/sites'
import { NumberField, TextInputField, VectorField } from '../primitives'
import { pad2, Group, type Patch } from './shared'
import { tr } from '../../lib/i18n'

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
      <Group
        title={tr('発射地点', 'Launch site')}
        note={tr('射場を選ぶと座標が入ります（座標は概略値）。', 'Picking a site fills in its coordinates (approximate).')}
      >
        <label className="flex min-h-8 items-center gap-3 py-[3px]">
          <span className="min-w-0 flex-1 text-ink-2">{tr('射場', 'Site')}</span>
          <select
            aria-label={tr('射場', 'Site')}
            value={site?.id ?? ''}
            onChange={(e) => {
              const s = LAUNCH_SITES.find((x) => x.id === e.target.value)
              if (s) setLaunch({ latitude_deg: s.lat, longitude_deg: s.lon, altitude_m: s.alt })
            }}
            className="h-8 w-[13rem] shrink-0 cursor-pointer rounded-[6px] border border-line bg-surface-2 px-2 text-[12px] text-ink outline-none hover:border-line-strong focus:border-signal"
          >
            <option value="">{tr('座標を直接入力', 'Enter coordinates')}</option>
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
        <NumberField
          label={tr('緯度', 'Latitude')}
          unit="°"
          path="launch.latitude_deg"
          value={launch.latitude_deg}
          onChange={(v) => setLaunch({ latitude_deg: v })}
        />
        <NumberField
          label={tr('経度', 'Longitude')}
          unit="°"
          path="launch.longitude_deg"
          value={launch.longitude_deg}
          onChange={(v) => setLaunch({ longitude_deg: v })}
        />
        <NumberField
          label={tr('標高', 'Altitude')}
          unit="m"
          path="launch.altitude_m"
          value={launch.altitude_m}
          onChange={(v) => setLaunch({ altitude_m: v })}
        />
      </Group>
      <Group title={tr('日時', 'Date & time')}>
        <TextInputField
          label={tr('日付 (UTC)', 'Date (UTC)')}
          type="date"
          path="launch.datetime_utc"
          value={`${dt.year}-${pad2(dt.month)}-${pad2(dt.day)}`}
          onChange={setDate}
        />
        <TextInputField
          label={tr('時刻 (UTC)', 'Time (UTC)')}
          type="time"
          value={`${pad2(dt.hour)}:${pad2(dt.minute)}:${pad2(dt.second)}`}
          onChange={setTime}
        />
      </Group>
      <Group
        title={tr('初期速度', 'Initial velocity')}
        note={tr('地上からの発射なら 0。空中発射などで使います。', 'Zero for a ground launch; used for air launch and similar cases.')}
      >
        <VectorField
          label={tr('速度', 'Velocity')}
          unit={tr('m/s · 北/東/下', 'm/s · N/E/D')}
          axes={['N', 'E', 'D']}
          path="launch.velocity_ned_mps"
          value={launch.velocity_ned_mps}
          onChange={(v) => setLaunch({ velocity_ned_mps: v })}
        />
      </Group>
    </>
  )
}
