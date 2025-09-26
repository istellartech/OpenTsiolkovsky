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
    { key: 'time', label: 'Time (s)', step: '0.1', min: 0 },
    { key: 'azimuth_deg', label: 'Azimuth (deg)', step: '1', min: 0 },
    { key: 'elevation_deg', label: 'Elevation (deg)', step: '1', min: 0 },
  ]

  const windColumns: Column<ClientWindSample>[] = [
    { key: 'altitude_m', label: 'Altitude (m)', step: '1', min: 0 },
    { key: 'speed_mps', label: 'Speed (m/s)', step: '0.1', min: 0 },
    { key: 'direction_deg', label: 'Direction (deg)', step: '1', min: 0 },
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
          <h3>Attitude Configuration</h3>
          <p className="text-sm text-slate-600">Configure rocket attitude and guidance parameters.</p>
        </div>

        <div className="field-grid">
          <NumberField
            id="azimuth"
            label="Azimuth (degrees)"
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
            label="Elevation (degrees)"
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
            <h4 className="text-sm font-semibold">Variation Parameters</h4>
            <div className="field-grid">
              <NumberField
                id="pitch-offset"
                label="Pitch Offset (degrees)"
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
                label="Yaw Offset (degrees)"
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
                label="Roll Offset (degrees)"
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
                label="Gyro Bias X (deg/h)"
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
                label="Gyro Bias Y (deg/h)"
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
                label="Gyro Bias Z (deg/h)"
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
            <h4 className="text-sm font-semibold">Attitude Profile</h4>
            <SwitchField
              id="use-attitude-profile"
              label="Use Time-Based Profile"
              checked={useAttitudeProfile}
              onCheckedChange={setUseAttitudeProfile}
            />
          </div>

          {useAttitudeProfile && (
            <EditableTable
              title="Attitude vs Time"
              columns={attitudeColumns}
              rows={config.attitude.profile}
              onChange={(profile) => updateAttitude({ profile })}
              addLabel="Add attitude point"
            />
          )}
        </div>
      </div>

      {/* Wind Section */}
      <div className="space-y-6">
        <div>
          <h3>Wind Configuration</h3>
          <p className="text-sm text-slate-600">Configure wind conditions and atmospheric parameters.</p>
        </div>

        <div className="field-grid">
          <NumberField
            id="wind-speed"
            label="Wind Speed (m/s)"
            value={config.wind.speed_mps}
            onChange={(value) => updateWind({ speed_mps: value })}
            hasError={issuesSet.has('wind.speed_mps')}
            registerRef={makeFieldRef('wind.speed_mps')}
            step="0.1"
            min={0}
          />

          <NumberField
            id="wind-direction"
            label="Wind Direction (degrees)"
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
            <h4 className="text-sm font-semibold">Wind Profile</h4>
            <SwitchField
              id="use-wind-profile"
              label="Use Altitude-Based Profile"
              checked={useWindProfile}
              onCheckedChange={setUseWindProfile}
            />
          </div>

          {useWindProfile && (
            <EditableTable
              title="Wind vs Altitude"
              columns={windColumns}
              rows={config.wind.profile}
              onChange={(profile) => updateWind({ profile })}
              addLabel="Add wind point"
            />
          )}
        </div>
      </div>
    </div>
  )
}