import type { ClientConfig } from '../../lib/simulation'
import { NumberField, ProfileTable, Toggle, VectorField } from '../primitives'
import { Group, type Patch } from './shared'
import { PitchProgramBuilder } from './PitchProgramBuilder'
import { tr } from '../../lib/i18n'

export function FlightTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const at = config.attitude
  const w = config.wind
  const setAt = (v: Partial<ClientConfig['attitude']>) => patch((c) => ({ ...c, attitude: { ...c.attitude, ...v } }))
  const setW = (v: Partial<ClientConfig['wind']>) => patch((c) => ({ ...c, wind: { ...c.wind, ...v } }))
  return (
    <>
      <Group
        title={tr('姿勢', 'Attitude')}
        note={tr('方位角は北から時計回り、仰角は水平から上向き。時刻は打上げからの秒です。', 'Azimuth is clockwise from north; elevation is up from horizontal. Times are seconds after launch.')}
      >
        <Toggle
          label={tr('姿勢プログラム（時刻テーブル）', 'Attitude program (time table)')}
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
            title={tr('姿勢プログラム', 'Attitude program')}
            columns={[
              { key: 'time', label: tr('時刻 s', 'Time s') },
              { key: 'azimuth_deg', label: tr('方位 °', 'Azimuth °') },
              { key: 'elevation_deg', label: tr('仰角 °', 'Elevation °') },
            ]}
            rows={at.profile}
            onChange={(rows) => setAt({ profile: rows })}
          />
        ) : (
          <>
            <NumberField label={tr('方位角', 'Azimuth')} unit="°" path="attitude.azimuth_deg" value={at.azimuth_deg} onChange={(v) => setAt({ azimuth_deg: v })} />
            <NumberField label={tr('仰角', 'Elevation')} unit="°" path="attitude.elevation_deg" value={at.elevation_deg} onChange={(v) => setAt({ elevation_deg: v })} />
          </>
        )}
      </Group>
      <Group
        title={tr('姿勢プログラムをかんたん作成', 'Pitch program builder')}
        note={tr(
          '垂直に上昇してから徐々に傾ける、典型的な形のテーブルを作ります。作成後は上の表で細かく調整できます。',
          'Builds a typical table: vertical rise, then a gradual pitch-over. Fine-tune it in the table above afterwards.',
        )}
      >
        <PitchProgramBuilder
          latitude={config.launch.latitude_deg}
          azimuth={at.profile[0]?.azimuth_deg ?? at.azimuth_deg}
          onApply={(profile) => setAt({ profile, azimuth_deg: profile[0].azimuth_deg })}
        />
      </Group>
      <Group title={tr('姿勢の誤差', 'Attitude errors')}>
        <NumberField label={tr('ピッチ', 'Pitch')} unit="°" path="attitude.pitch_offset_deg" value={at.pitch_offset_deg} onChange={(v) => setAt({ pitch_offset_deg: v })} />
        <NumberField label={tr('ヨー', 'Yaw')} unit="°" path="attitude.yaw_offset_deg" value={at.yaw_offset_deg} onChange={(v) => setAt({ yaw_offset_deg: v })} />
        <NumberField label={tr('ロール', 'Roll')} unit="°" path="attitude.roll_offset_deg" value={at.roll_offset_deg} onChange={(v) => setAt({ roll_offset_deg: v })} />
        <VectorField label={tr('ジャイロバイアス', 'Gyro bias')} unit="°/h" axes={['X', 'Y', 'Z']} value={at.gyro_bias_deg_h} onChange={(v) => setAt({ gyro_bias_deg_h: v })} />
      </Group>
      <Group title={tr('風', 'Wind')} note={tr('風向は風が吹いてくる方位（北=0°、時計回り）。', 'Wind direction is where the wind blows from (north = 0°, clockwise).')}>
        <Toggle
          label={tr('高度別に入力（テーブル）', 'Enter by altitude (table)')}
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
            title={tr('高度別の風', 'Wind by altitude')}
            columns={[
              { key: 'altitude_m', label: tr('高度 m', 'Altitude m') },
              { key: 'speed_mps', label: tr('風速 m/s', 'Speed m/s') },
              { key: 'direction_deg', label: tr('風向 °', 'Direction °') },
            ]}
            rows={w.profile}
            onChange={(rows) => setW({ profile: rows })}
          />
        ) : (
          <>
            <NumberField label={tr('風速', 'Wind speed')} unit="m/s" path="wind.speed_mps" value={w.speed_mps} onChange={(v) => setW({ speed_mps: v })} />
            <NumberField label={tr('風向', 'Wind direction')} unit="°" path="wind.direction_deg" value={w.direction_deg} onChange={(v) => setW({ direction_deg: v })} />
          </>
        )}
      </Group>
    </>
  )
}
