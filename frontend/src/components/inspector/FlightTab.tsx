import type { Config } from '../../lib/config'
import { DEFAULTS, curveValue } from '../../lib/config'
import { CurveField, NumberField, RowsTable, Toggle, VectorField } from '../primitives'
import { Group, type Patch } from './shared'
import { PitchProgramBuilder } from './PitchProgramBuilder'
import { tr } from '../../lib/i18n'

type Attitude = NonNullable<Config['attitude']>
type Wind = NonNullable<Config['wind']>

export function FlightTab({ config, patch }: { config: Config; patch: Patch }) {
  const at = config.attitude ?? {}
  const w = config.wind ?? {}
  const setAt = (v: Partial<Attitude>) => patch((c) => ({ ...c, attitude: { ...c.attitude, ...v } }))
  const setW = (v: Partial<Wind>) => patch((c) => ({ ...c, wind: { ...c.wind, ...v } }))
  const profile = Array.isArray(w.profile) ? w.profile : null
  return (
    <>
      <Group
        title={tr('姿勢', 'Attitude')}
        note={tr(
          '方位角は北から時計回り、仰角は水平から上向き。テーブルの時刻は打上げからの秒です。',
          'Azimuth is clockwise from north; elevation is up from horizontal. Table times are seconds after launch.',
        )}
      >
        <CurveField
          label={tr('方位角', 'Azimuth')}
          tableLabel={tr('方位角を時刻テーブルで入力', 'Azimuth as time table')}
          title={tr('方位角プログラム', 'Azimuth program')}
          unit="°"
          xLabel={tr('時刻 s', 'Time s')}
          yLabel={tr('方位 °', 'Azimuth °')}
          span={[0, 60]}
          path="attitude.azimuth_deg"
          value={at.azimuth_deg ?? 0}
          onChange={(v) => setAt({ azimuth_deg: v })}
        />
        <CurveField
          label={tr('仰角', 'Elevation')}
          tableLabel={tr('仰角を時刻テーブルで入力（ピッチプログラム）', 'Elevation as time table (pitch program)')}
          title={tr('仰角プログラム', 'Elevation program')}
          unit="°"
          xLabel={tr('時刻 s', 'Time s')}
          yLabel={tr('仰角 °', 'Elevation °')}
          span={[0, 60]}
          path="attitude.elevation_deg"
          value={at.elevation_deg ?? DEFAULTS.elevation}
          onChange={(v) => setAt({ elevation_deg: v })}
        />
        <CurveField
          label={tr('ロール角', 'Roll angle')}
          tableLabel={tr('ロール角を時刻テーブルで入力', 'Roll as time table')}
          title={tr('ロールプログラム', 'Roll program')}
          unit="°"
          xLabel={tr('時刻 s', 'Time s')}
          yLabel={tr('ロール °', 'Roll °')}
          span={[0, 60]}
          path="attitude.roll_deg"
          value={at.roll_deg ?? 0}
          onChange={(v) => setAt({ roll_deg: v })}
        />
      </Group>
      <Group
        title={tr('ピッチプログラムをかんたん作成', 'Pitch program builder')}
        note={tr(
          '垂直に上昇してから徐々に傾ける、典型的な仰角テーブルを作ります。作成後は上の表で細かく調整できます。',
          'Builds a typical elevation table: vertical rise, then a gradual pitch-over. Fine-tune it in the table above afterwards.',
        )}
      >
        <PitchProgramBuilder
          latitude={config.launch.latitude_deg}
          azimuth={curveValue(at.azimuth_deg)}
          onApply={(azimuth, elevation) => setAt({ azimuth_deg: azimuth, elevation_deg: elevation })}
        />
      </Group>
      <Group title={tr('姿勢の誤差', 'Attitude errors')}>
        <NumberField
          label={tr('ピッチ', 'Pitch')}
          unit="°"
          path="attitude.pitch_offset_deg"
          value={at.pitch_offset_deg ?? 0}
          onChange={(v) => setAt({ pitch_offset_deg: v })}
        />
        <NumberField
          label={tr('ヨー', 'Yaw')}
          unit="°"
          path="attitude.yaw_offset_deg"
          value={at.yaw_offset_deg ?? 0}
          onChange={(v) => setAt({ yaw_offset_deg: v })}
        />
        <NumberField
          label={tr('ロール', 'Roll')}
          unit="°"
          path="attitude.roll_offset_deg"
          value={at.roll_offset_deg ?? 0}
          onChange={(v) => setAt({ roll_offset_deg: v })}
        />
        <VectorField
          label={tr('ジャイロバイアス', 'Gyro bias')}
          unit="°/h"
          axes={['X', 'Y', 'Z']}
          path="attitude.gyro_bias_deg_h"
          value={at.gyro_bias_deg_h ?? [0, 0, 0]}
          onChange={(v) => setAt({ gyro_bias_deg_h: v })}
        />
      </Group>
      <Group
        title={tr('風', 'Wind')}
        note={tr('風向は風が吹いてくる方位（北=0°、時計回り）。', 'Wind direction is where the wind blows from (north = 0°, clockwise).')}
      >
        <Toggle
          label={tr('高度別に入力（テーブル）', 'Enter by altitude (table)')}
          checked={!!profile}
          onChange={(on) =>
            setW(
              on
                ? {
                    profile: [
                      [0, w.speed_mps ?? 0, w.direction_deg ?? 0],
                      [10000, w.speed_mps ?? 0, w.direction_deg ?? 0],
                    ],
                  }
                : { profile: undefined, speed_mps: profile?.[0]?.[1] ?? 0, direction_deg: profile?.[0]?.[2] ?? 0 },
            )
          }
        />
        {profile ? (
          <RowsTable
            path="wind.profile"
            title={tr('高度別の風', 'Wind by altitude')}
            columns={[tr('高度 m', 'Altitude m'), tr('風速 m/s', 'Speed m/s'), tr('風向 °', 'Direction °')]}
            rows={profile}
            onChange={(rows) => setW({ profile: rows })}
          />
        ) : (
          <>
            <NumberField
              label={tr('風速', 'Wind speed')}
              unit="m/s"
              path="wind.speed_mps"
              value={w.speed_mps ?? 0}
              onChange={(v) => setW({ speed_mps: v })}
            />
            <NumberField
              label={tr('風向', 'Wind direction')}
              unit="°"
              path="wind.direction_deg"
              value={w.direction_deg ?? 0}
              onChange={(v) => setW({ direction_deg: v })}
            />
          </>
        )}
      </Group>
    </>
  )
}
