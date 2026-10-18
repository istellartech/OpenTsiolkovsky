import type { Config } from '../../lib/config'
import { isoUtc, launchDate } from '../../lib/config'
import { LAUNCH_SITES, findSite } from '../../config/sites'
import { NumberField, TextInputField, VectorField } from '../primitives'
import { pad2, Group, type Patch } from './shared'
import { tr } from '../../lib/i18n'

export function LaunchTab({ config, patch }: { config: Config; patch: Patch }) {
  const { launch } = config
  const dt = launchDate(config)
  const site = findSite(launch.latitude_deg, launch.longitude_deg)
  const setLaunch = (l: Partial<Config['launch']>) => patch((c) => ({ ...c, launch: { ...c.launch, ...l } }))
  const setUtc = (y: number, mo: number, d: number, h: number, mi: number, s: number) => {
    const t = new Date(Date.UTC(y, mo - 1, d, h, mi, s))
    if (!Number.isNaN(t.getTime())) setLaunch({ time_utc: isoUtc(t) })
  }
  const setDate = (v: string) => {
    const [y, m, d] = v.split('-').map(Number)
    if ([y, m, d].every(Number.isFinite)) setUtc(y, m, d, dt.getUTCHours(), dt.getUTCMinutes(), dt.getUTCSeconds())
  }
  const setTime = (v: string) => {
    const [h, mi, s = 0] = v.split(':').map(Number)
    if ([h, mi, s].every(Number.isFinite)) setUtc(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), h, mi, s)
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
          value={launch.altitude_m ?? 0}
          onChange={(v) => setLaunch({ altitude_m: v })}
        />
      </Group>
      <Group
        title={tr('ランチャ', 'Launcher')}
        note={tr(
          '推力が重力を上回るまで発射台で保持し、レール長の分だけ打ち上げ時の機軸の向きに沿って拘束します。0 なら保持のみ。初期速度が 0 でないときは使いません。',
          'The vehicle is held on the pad until thrust exceeds gravity, then constrained along the liftoff body axis for the rail length. 0 means hold only. Not used when the initial velocity is non-zero.',
        )}
      >
        <NumberField
          label={tr('レール長', 'Rail length')}
          unit="m"
          path="launch.rail_length_m"
          value={launch.rail_length_m ?? 0}
          onChange={(v) => setLaunch({ rail_length_m: v })}
        />
      </Group>
      <Group title={tr('日時', 'Date & time')}>
        <TextInputField
          label={tr('日付 (UTC)', 'Date (UTC)')}
          type="date"
          path="launch.time_utc"
          value={`${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`}
          onChange={setDate}
        />
        <TextInputField
          label={tr('時刻 (UTC)', 'Time (UTC)')}
          type="time"
          value={`${pad2(dt.getUTCHours())}:${pad2(dt.getUTCMinutes())}:${pad2(dt.getUTCSeconds())}`}
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
          value={launch.velocity_ned_mps ?? [0, 0, 0]}
          onChange={(v) => setLaunch({ velocity_ned_mps: v })}
        />
      </Group>
    </>
  )
}
