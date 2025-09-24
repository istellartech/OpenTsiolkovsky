import { NumberField } from '../shared/FormFields'
import type { ClientConfig } from '../../lib/types'

const pad2 = (value: number) => value.toString().padStart(2, '0')

function formatDateInput(datetime: ClientConfig['launch']['datetime_utc']): string {
  return `${datetime.year}-${pad2(datetime.month)}-${pad2(datetime.day)}`
}

function formatTimeInput(datetime: ClientConfig['launch']['datetime_utc']): string {
  return `${pad2(datetime.hour)}:${pad2(datetime.minute)}:${pad2(datetime.second)}`
}

function parseDateTimeInputs(
  dateValue: string,
  timeValue: string,
  fallback: ClientConfig['launch']['datetime_utc'],
): ClientConfig['launch']['datetime_utc'] {
  if (!dateValue) {
    return fallback
  }

  const [yearStr, monthStr, dayStr] = dateValue.split('-')
  const [hourStr = '0', minuteStr = '0', secondStr = '0'] = timeValue.split(':')

  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  const second = Number(secondStr)

  if (
    [year, month, day, hour, minute, second].some((value) => !Number.isFinite(value)) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return fallback
  }

  return { year, month, day, hour, minute, second }
}

interface LaunchFormProps {
  config: ClientConfig
  setConfig: (config: ClientConfig) => void
  showVariations: boolean
  issuesSet: Set<string>
  makeFieldRef: (field?: string) => (el: HTMLElement | null) => void
}

export function LaunchForm({ config, setConfig, showVariations, issuesSet, makeFieldRef }: LaunchFormProps) {
  const dateValue = formatDateInput(config.launch.datetime_utc)
  const timeValue = formatTimeInput(config.launch.datetime_utc)

  const handleDateTimeChange = (dateVal: string, timeVal: string) => {
    const newDateTime = parseDateTimeInputs(dateVal, timeVal, config.launch.datetime_utc)
    setConfig({
      ...config,
      launch: {
        ...config.launch,
        datetime_utc: newDateTime,
      },
    })
  }

  return (
    <div className="section-shell space-y-6">
      <div>
        <h3>Launch Parameters</h3>
        <p className="text-sm text-slate-600">Configure the initial launch conditions for your rocket.</p>
      </div>

      <div className="field-grid">
        <NumberField
          id="launch-latitude"
          label="Latitude (degrees)"
          value={config.launch.latitude_deg}
          onChange={(value) => setConfig({
            ...config,
            launch: { ...config.launch, latitude_deg: value }
          })}
          hasError={issuesSet.has('launch.latitude_deg')}
          registerRef={makeFieldRef('launch.latitude_deg')}
          step="0.001"
          min={-90}
          max={90}
        />

        <NumberField
          id="launch-longitude"
          label="Longitude (degrees)"
          value={config.launch.longitude_deg}
          onChange={(value) => setConfig({
            ...config,
            launch: { ...config.launch, longitude_deg: value }
          })}
          hasError={issuesSet.has('launch.longitude_deg')}
          registerRef={makeFieldRef('launch.longitude_deg')}
          step="0.001"
          min={-180}
          max={180}
        />

        <NumberField
          id="launch-altitude"
          label="Altitude (m)"
          value={config.launch.altitude_m}
          onChange={(value) => setConfig({
            ...config,
            launch: { ...config.launch, altitude_m: value }
          })}
          hasError={issuesSet.has('launch.altitude_m')}
          registerRef={makeFieldRef('launch.altitude_m')}
          step="1"
        />
      </div>

      <div className="field-grid">
        <NumberField
          id="velocity-north"
          label="Initial Velocity North (m/s)"
          value={config.launch.velocity_ned_mps[0]}
          onChange={(value) => setConfig({
            ...config,
            launch: {
              ...config.launch,
              velocity_ned_mps: [value, config.launch.velocity_ned_mps[1], config.launch.velocity_ned_mps[2]]
            }
          })}
          hasError={issuesSet.has('launch.velocity_ned_mps')}
          registerRef={makeFieldRef('launch.velocity_ned_mps')}
          step="0.1"
        />

        <NumberField
          id="velocity-east"
          label="Initial Velocity East (m/s)"
          value={config.launch.velocity_ned_mps[1]}
          onChange={(value) => setConfig({
            ...config,
            launch: {
              ...config.launch,
              velocity_ned_mps: [config.launch.velocity_ned_mps[0], value, config.launch.velocity_ned_mps[2]]
            }
          })}
          hasError={issuesSet.has('launch.velocity_ned_mps')}
          step="0.1"
        />

        <NumberField
          id="velocity-down"
          label="Initial Velocity Down (m/s)"
          value={config.launch.velocity_ned_mps[2]}
          onChange={(value) => setConfig({
            ...config,
            launch: {
              ...config.launch,
              velocity_ned_mps: [config.launch.velocity_ned_mps[0], config.launch.velocity_ned_mps[1], value]
            }
          })}
          hasError={issuesSet.has('launch.velocity_ned_mps')}
          step="0.1"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="launch-date" className="text-sm font-medium text-slate-900">
            Launch Date
          </label>
          <input
            id="launch-date"
            type="date"
            value={dateValue}
            onChange={(e) => handleDateTimeChange(e.target.value, timeValue)}
            ref={makeFieldRef('launch.datetime_utc')}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-inner focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="launch-time" className="text-sm font-medium text-slate-900">
            Launch Time (UTC)
          </label>
          <input
            id="launch-time"
            type="time"
            step="1"
            value={timeValue}
            onChange={(e) => handleDateTimeChange(dateValue, e.target.value)}
            className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-inner focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1"
          />
        </div>
      </div>

      <div className="field-grid">
        <NumberField
          id="simulation-duration"
          label="Simulation Duration (s)"
          value={config.simulation.duration_s}
          onChange={(value) => setConfig({
            ...config,
            simulation: { ...config.simulation, duration_s: value }
          })}
          hasError={issuesSet.has('simulation.duration_s')}
          registerRef={makeFieldRef('simulation.duration_s')}
          step="1"
          min={1}
        />

        <NumberField
          id="simulation-output-step"
          label="Output Step (s)"
          value={config.simulation.output_step_s}
          onChange={(value) => setConfig({
            ...config,
            simulation: { ...config.simulation, output_step_s: value }
          })}
          hasError={issuesSet.has('simulation.output_step_s')}
          registerRef={makeFieldRef('simulation.output_step_s')}
          step="0.1"
          min={0.1}
        />

        {showVariations && (
          <NumberField
            id="air-density-percent"
            label="Air Density Variation (%)"
            value={config.simulation.air_density_percent}
            onChange={(value) => setConfig({
              ...config,
              simulation: { ...config.simulation, air_density_percent: value }
            })}
            hasError={issuesSet.has('simulation.air_density_percent')}
            registerRef={makeFieldRef('simulation.air_density_percent')}
            step="1"
            min={-100}
            max={100}
          />
        )}
      </div>
    </div>
  )
}