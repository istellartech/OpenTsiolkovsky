import { NumberField, SwitchField, EditableTable, type Column } from '../shared'
import type { ClientConfig, ClientAttitudeSample, ClientWindSample } from '../../lib/simulation'

interface WindFormProps {
  config: ClientConfig
  setConfig: (config: ClientConfig) => void
  useAttitudeProfile: boolean
  setUseAttitudeProfile: (use: boolean) => void
  useWindProfile: boolean
  setUseWindProfile: (use: boolean) => void
  showVariations: boolean
  issuesSet: Set<string>
  makeFieldRef: (field?: string) => (el: HTMLElement | null) => void
}

export function WindForm({
  config,
  setConfig,
  useAttitudeProfile,
  setUseAttitudeProfile,
  useWindProfile,
  setUseWindProfile,
  showVariations,
  issuesSet,
  makeFieldRef
}: WindFormProps) {
  const attitudeColumns: Column<ClientAttitudeSample>[] = [
    { key: 'time', label: '時間 (s)', step: '0.1', min: 0 },
    { key: 'azimuth_deg', label: '方位角 (度)', step: '1', min: 0 },
    { key: 'elevation_deg', label: '仰角 (度)', step: '1', min: 0 },
  ]

  const windColumns: Column<ClientWindSample>[] = [
    { key: 'altitude_m', label: '高度 (m)', step: '1', min: 0 },
    { key: 'speed_mps', label: '速度 (m/s)', step: '0.1', min: 0 },
    { key: 'direction_deg', label: '方向 (度)', step: '1', min: 0 },
  ]

  const updateAttitude = (updates: Partial<ClientConfig['attitude']>) => {
    setConfig({
      ...config,
      attitude: { ...config.attitude, ...updates }
    })
  }

  const updateWind = (updates: Partial<ClientConfig['wind']>) => {
    setConfig({
      ...config,
      wind: { ...config.wind, ...updates }
    })
  }

  return (
    <div className="section-shell space-y-8">
      {/* Attitude Section */}
      <div className="space-y-6">
        <div>
          <h3>姿勢設定</h3>
          <p className="text-sm text-slate-600">ロケットの姿勢と誘導パラメータを設定してください。</p>
        </div>

        <div className="field-grid">
          <NumberField
            id="azimuth"
            label="方位角 (度)"
            value={config.attitude.azimuth_deg}
            onChange={(value) => updateAttitude({ azimuth_deg: value })}
            hasError={issuesSet.has('attitude.azimuth_deg')}
            registerRef={makeFieldRef('attitude.azimuth_deg')}
            step="1"
            min={0}
            max={359}
          />

          <NumberField
            id="elevation"
            label="仰角 (度)"
            value={config.attitude.elevation_deg}
            onChange={(value) => updateAttitude({ elevation_deg: value })}
            hasError={issuesSet.has('attitude.elevation_deg')}
            registerRef={makeFieldRef('attitude.elevation_deg')}
            step="1"
            min={0}
            max={90}
          />
        </div>

        {showVariations && (
          <div className="space-y-4">
            <h4 className="text-sm font-semibold">変動パラメータ</h4>
            <div className="field-grid">
              <NumberField
                id="pitch-offset"
                label="ピッチオフセット (度)"
                value={config.attitude.pitch_offset_deg}
                onChange={(value) => updateAttitude({ pitch_offset_deg: value })}
                hasError={issuesSet.has('attitude.pitch_offset_deg')}
                registerRef={makeFieldRef('attitude.pitch_offset_deg')}
                step="0.1"
                min={-45}
                max={45}
              />

              <NumberField
                id="yaw-offset"
                label="ヨーオフセット (度)"
                value={config.attitude.yaw_offset_deg}
                onChange={(value) => updateAttitude({ yaw_offset_deg: value })}
                hasError={issuesSet.has('attitude.yaw_offset_deg')}
                registerRef={makeFieldRef('attitude.yaw_offset_deg')}
                step="0.1"
                min={-45}
                max={45}
              />

              <NumberField
                id="roll-offset"
                label="ロールオフセット (度)"
                value={config.attitude.roll_offset_deg}
                onChange={(value) => updateAttitude({ roll_offset_deg: value })}
                hasError={issuesSet.has('attitude.roll_offset_deg')}
                registerRef={makeFieldRef('attitude.roll_offset_deg')}
                step="0.1"
                min={-180}
                max={180}
              />

              <NumberField
                id="gyro-bias-x"
                label="ジャイロバイアス X (度/h)"
                value={config.attitude.gyro_bias_deg_h[0]}
                onChange={(value) => updateAttitude({
                  gyro_bias_deg_h: [value, config.attitude.gyro_bias_deg_h[1], config.attitude.gyro_bias_deg_h[2]]
                })}
                hasError={issuesSet.has('attitude.gyro_bias_deg_h[0]')}
                registerRef={makeFieldRef('attitude.gyro_bias_deg_h[0]')}
                step="0.1"
                min={-100}
                max={100}
              />

              <NumberField
                id="gyro-bias-y"
                label="ジャイロバイアス Y (度/h)"
                value={config.attitude.gyro_bias_deg_h[1]}
                onChange={(value) => updateAttitude({
                  gyro_bias_deg_h: [config.attitude.gyro_bias_deg_h[0], value, config.attitude.gyro_bias_deg_h[2]]
                })}
                hasError={issuesSet.has('attitude.gyro_bias_deg_h[1]')}
                registerRef={makeFieldRef('attitude.gyro_bias_deg_h[1]')}
                step="0.1"
                min={-100}
                max={100}
              />

              <NumberField
                id="gyro-bias-z"
                label="ジャイロバイアス Z (度/h)"
                value={config.attitude.gyro_bias_deg_h[2]}
                onChange={(value) => updateAttitude({
                  gyro_bias_deg_h: [config.attitude.gyro_bias_deg_h[0], config.attitude.gyro_bias_deg_h[1], value]
                })}
                hasError={issuesSet.has('attitude.gyro_bias_deg_h[2]')}
                registerRef={makeFieldRef('attitude.gyro_bias_deg_h[2]')}
                step="0.1"
                min={-100}
                max={100}
              />
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">姿勢プロファイル</h4>
            <SwitchField
              id="use-attitude-profile"
              label="時間ベースプロファイル使用"
              checked={useAttitudeProfile}
              onCheckedChange={setUseAttitudeProfile}
            />
          </div>

          {useAttitudeProfile && (
            <EditableTable
              title="姿勢 vs 時間"
              columns={attitudeColumns}
              rows={config.attitude.profile}
              onChange={(profile) => updateAttitude({ profile })}
              addLabel="姿勢ポイントを追加"
            />
          )}
        </div>
      </div>

      {/* Wind Section */}
      <div className="space-y-6">
        <div>
          <h3>風設定</h3>
          <p className="text-sm text-slate-600">風条件と大気パラメータを設定してください。</p>
        </div>

        <div className="field-grid">
          <NumberField
            id="wind-speed"
            label="風速 (m/s)"
            value={config.wind.speed_mps}
            onChange={(value) => updateWind({ speed_mps: value })}
            hasError={issuesSet.has('wind.speed_mps')}
            registerRef={makeFieldRef('wind.speed_mps')}
            step="0.1"
            min={0}
          />

          <NumberField
            id="wind-direction"
            label="風向 (度)"
            value={config.wind.direction_deg}
            onChange={(value) => updateWind({ direction_deg: value })}
            hasError={issuesSet.has('wind.direction_deg')}
            registerRef={makeFieldRef('wind.direction_deg')}
            step="1"
            min={0}
            max={359}
          />
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">風プロファイル</h4>
            <SwitchField
              id="use-wind-profile"
              label="高度ベースプロファイル使用"
              checked={useWindProfile}
              onCheckedChange={setUseWindProfile}
            />
          </div>

          {useWindProfile && (
            <EditableTable
              title="風 vs 高度"
              columns={windColumns}
              rows={config.wind.profile}
              onChange={(profile) => updateWind({ profile })}
              addLabel="風ポイントを追加"
            />
          )}
        </div>
      </div>
    </div>
  )
}