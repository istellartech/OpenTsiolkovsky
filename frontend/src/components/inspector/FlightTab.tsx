import type { ClientConfig } from '../../lib/simulation'
import { NumberField, ProfileTable, Toggle, VectorField } from '../primitives'
import { Group, type Patch } from './shared'
import { PitchProgramBuilder } from './PitchProgramBuilder'

export function FlightTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
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
            title="姿勢プログラム"
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
      <Group title="姿勢プログラムをかんたん作成" note="垂直に上昇してから徐々に傾ける、典型的な形のテーブルを作ります。作成後は上の表で細かく調整できます。">
        <PitchProgramBuilder
          latitude={config.launch.latitude_deg}
          azimuth={at.profile[0]?.azimuth_deg ?? at.azimuth_deg}
          onApply={(profile) => setAt({ profile, azimuth_deg: profile[0].azimuth_deg })}
        />
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
            title="高度別の風"
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
