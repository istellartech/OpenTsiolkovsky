import { useMemo, useState } from 'react'
import type React from 'react'
import { runSimulation } from '../lib/simulation'
import type {
  ClientAttitudeSample,
  ClientConfig,
  ClientMachSample,
  ClientTimeSample,
  ClientWindSample,
  SimulationState,
} from '../lib/types'

type Props = {
  onResult: (trajectory: SimulationState[]) => void
}

type Mode = 'api' | 'wasm'

type Column<T extends Record<string, number>> = {
  key: keyof T
  label: string
  step?: string
  min?: number
}

type TableProps<T extends Record<string, number>> = {
  title: string
  columns: Column<T>[]
  rows: T[]
  onChange: (rows: T[]) => void
  addLabel?: string
}

function numberFromInput(value: string): number {
  if (value.trim() === '') return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function EditableTable<T extends Record<string, number>>({ title, columns, rows, onChange, addLabel }: TableProps<T>) {
  const handleCellChange = (rowIdx: number, column: Column<T>, value: string) => {
    const parsed = numberFromInput(value)
    const next = rows.map((row, idx) => {
      if (idx !== rowIdx) return row
      return { ...row, [column.key]: parsed } as T
    })
    onChange(next)
  }

  const handleRemove = (rowIdx: number) => {
    const next = rows.filter((_, idx) => idx !== rowIdx)
    onChange(next)
  }

  const handleAdd = () => {
    const blank = columns.reduce((acc, col) => {
      return { ...acc, [col.key]: 0 }
    }, {} as T)
    onChange([...rows, blank])
  }

  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0 }}>{title}</h4>
        <button type="button" onClick={handleAdd}>{addLabel ?? 'Add row'}</button>
      </div>
      {rows.length === 0 ? (
        <div style={{ color: '#6b7280' }}>No rows yet. Add one to begin.</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={String(col.key)} style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 6 }}>
                  {col.label}
                </th>
              ))}
              <th style={{ width: 48 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => (
              <tr key={rowIdx}>
                {columns.map((col) => (
                  <td key={String(col.key)} style={{ padding: '4px 8px 4px 0' }}>
                    <input
                      type="number"
                      step={col.step ?? 'any'}
                      min={col.min}
                      value={Number(row[col.key])}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleCellChange(rowIdx, col, e.target.value)}
                      style={{ width: '100%' }}
                    />
                  </td>
                ))}
                <td style={{ textAlign: 'right' }}>
                  <button type="button" onClick={() => handleRemove(rowIdx)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function createDefaultConfig(): ClientConfig {
  return {
    name: 'Sample Vehicle',
    simulation: {
      duration_s: 120,
      output_step_s: 1,
      air_density_percent: 0,
    },
    launch: {
      latitude_deg: 35,
      longitude_deg: 139,
      altitude_m: 0,
      velocity_ned_mps: [0, 0, 0],
      datetime_utc: {
        year: 2023,
        month: 1,
        day: 1,
        hour: 12,
        minute: 0,
        second: 0,
      },
    },
    stage: {
      power_mode: 0,
      free_mode: 2,
      mass_initial_kg: 1000,
      burn_start_s: 0,
      burn_end_s: 30,
      forced_cutoff_s: 30,
      throat_diameter_m: 0.1,
      nozzle_expansion_ratio: 5,
      nozzle_exit_pressure_pa: 101300,
      thrust_constant: 50000,
      thrust_multiplier: 1,
      thrust_profile: [],
      isp_constant: 200,
      isp_multiplier: 1,
      isp_profile: [],
    },
    aerodynamics: {
      body_diameter_m: 0.5,
      cn_constant: 0.2,
      cn_multiplier: 1,
      cn_profile: [],
      ca_constant: 0.2,
      ca_multiplier: 1,
      ca_profile: [],
      ballistic_coefficient: 100,
    },
    attitude: {
      elevation_deg: 83,
      azimuth_deg: 113,
      pitch_offset_deg: 0,
      yaw_offset_deg: 0,
      roll_offset_deg: 0,
      gyro_bias_deg_h: [0, 0, 0],
      profile: [],
    },
    wind: {
      speed_mps: 0,
      direction_deg: 270,
      profile: [],
    },
  }
}

export function SimulationPanel({ onResult }: Props) {
  const [config, setConfig] = useState<ClientConfig>(() => createDefaultConfig())
  const [useThrustProfile, setUseThrustProfile] = useState(() => config.stage.thrust_profile.length > 0)
  const [useIspProfile, setUseIspProfile] = useState(() => config.stage.isp_profile.length > 0)
  const [useCnProfile, setUseCnProfile] = useState(() => config.aerodynamics.cn_profile.length > 0)
  const [useCaProfile, setUseCaProfile] = useState(() => config.aerodynamics.ca_profile.length > 0)
  const [useAttitudeProfile, setUseAttitudeProfile] = useState(() => config.attitude.profile.length > 0)
  const [useWindProfile, setUseWindProfile] = useState(() => config.wind.profile.length > 0)
  const [mode, setMode] = useState<Mode>('api')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const jsonPreview = useMemo(() => JSON.stringify(config, null, 2), [config])

  function updateSimulation<K extends keyof ClientConfig['simulation']>(key: K, value: number) {
    setConfig((prev) => ({
      ...prev,
      simulation: {
        ...prev.simulation,
        [key]: value,
      },
    }))
  }

  function updateLaunch<K extends keyof ClientConfig['launch']>(key: K, value: any) {
    setConfig((prev) => ({
      ...prev,
      launch: {
        ...prev.launch,
        [key]: value,
      },
    }))
  }

  function updateStage<K extends keyof ClientConfig['stage']>(key: K, value: any) {
    setConfig((prev) => ({
      ...prev,
      stage: {
        ...prev.stage,
        [key]: value,
      },
    }))
  }

  function updateAerodynamics<K extends keyof ClientConfig['aerodynamics']>(key: K, value: any) {
    setConfig((prev) => ({
      ...prev,
      aerodynamics: {
        ...prev.aerodynamics,
        [key]: value,
      },
    }))
  }

  function updateAttitude<K extends keyof ClientConfig['attitude']>(key: K, value: any) {
    setConfig((prev) => ({
      ...prev,
      attitude: {
        ...prev.attitude,
        [key]: value,
      },
    }))
  }

  function updateWind<K extends keyof ClientConfig['wind']>(key: K, value: any) {
    setConfig((prev) => ({
      ...prev,
      wind: {
        ...prev.wind,
        [key]: value,
      },
    }))
  }

  function toggleThrustProfile(checked: boolean) {
    setUseThrustProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.stage.thrust_profile.length > 0
          ? prev.stage.thrust_profile
          : [
              { time: prev.stage.burn_start_s, value: prev.stage.thrust_constant },
              { time: prev.stage.burn_end_s, value: prev.stage.thrust_constant },
            ]
        : []
      return {
        ...prev,
        stage: {
          ...prev.stage,
          thrust_profile: nextProfile,
        },
      }
    })
  }

  function toggleIspProfile(checked: boolean) {
    setUseIspProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.stage.isp_profile.length > 0
          ? prev.stage.isp_profile
          : [
              { time: prev.stage.burn_start_s, value: prev.stage.isp_constant },
              { time: prev.stage.burn_end_s, value: prev.stage.isp_constant },
            ]
        : []
      return {
        ...prev,
        stage: {
          ...prev.stage,
          isp_profile: nextProfile,
        },
      }
    })
  }

  function toggleCnProfile(checked: boolean) {
    setUseCnProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.aerodynamics.cn_profile.length > 0
          ? prev.aerodynamics.cn_profile
          : [
              { mach: 0, value: prev.aerodynamics.cn_constant },
              { mach: 1, value: prev.aerodynamics.cn_constant },
            ]
        : []
      return {
        ...prev,
        aerodynamics: {
          ...prev.aerodynamics,
          cn_profile: nextProfile,
        },
      }
    })
  }

  function toggleCaProfile(checked: boolean) {
    setUseCaProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.aerodynamics.ca_profile.length > 0
          ? prev.aerodynamics.ca_profile
          : [
              { mach: 0, value: prev.aerodynamics.ca_constant },
              { mach: 1, value: prev.aerodynamics.ca_constant },
            ]
        : []
      return {
        ...prev,
        aerodynamics: {
          ...prev.aerodynamics,
          ca_profile: nextProfile,
        },
      }
    })
  }

  function toggleAttitudeProfile(checked: boolean) {
    setUseAttitudeProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.attitude.profile.length > 0
          ? prev.attitude.profile
          : [
              {
                time: 0,
                azimuth_deg: prev.attitude.azimuth_deg,
                elevation_deg: prev.attitude.elevation_deg,
              },
            ]
        : []
      return {
        ...prev,
        attitude: {
          ...prev.attitude,
          profile: nextProfile,
        },
      }
    })
  }

  function toggleWindProfile(checked: boolean) {
    setUseWindProfile(checked)
    setConfig((prev) => {
      const nextProfile = checked
        ? prev.wind.profile.length > 0
          ? prev.wind.profile
          : [
              { altitude_m: 0, speed_mps: prev.wind.speed_mps, direction_deg: prev.wind.direction_deg },
              {
                altitude_m: Math.max(1, prev.simulation.duration_s * 10),
                speed_mps: prev.wind.speed_mps,
                direction_deg: prev.wind.direction_deg,
              },
            ]
        : []
      return {
        ...prev,
        wind: {
          ...prev.wind,
          profile: nextProfile,
        },
      }
    })
  }

  const handleRun = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      let trajectory: SimulationState[]
      if (mode === 'wasm') {
        const { runSimulationWasm } = await import('../lib/wasm')
        trajectory = await runSimulationWasm(config)
      } else {
        trajectory = await runSimulation(config)
      }
      onResult(trajectory)
    } catch (err: any) {
      setError(err?.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }

  const resetToDefault = () => {
    setConfig(createDefaultConfig())
    setUseThrustProfile(false)
    setUseIspProfile(false)
    setUseCnProfile(false)
    setUseCaProfile(false)
    setUseAttitudeProfile(false)
    setUseWindProfile(false)
  }

  const setVelocityComponent = (index: number, value: number) => {
    const next: [number, number, number] = [...config.launch.velocity_ned_mps] as [number, number, number]
    next[index] = value
    updateLaunch('velocity_ned_mps', next)
  }

  const updateDateField = (key: keyof ClientConfig['launch']['datetime_utc'], value: number) => {
    setConfig((prev) => ({
      ...prev,
      launch: {
        ...prev.launch,
        datetime_utc: {
          ...prev.launch.datetime_utc,
          [key]: value,
        },
      },
    }))
  }

  return (
    <form onSubmit={handleRun} style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 600 }}>Vehicle name</label>
          <input
            value={config.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfig((prev) => ({ ...prev, name: e.target.value }))}
            style={{ width: 240 }}
          />
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Execution mode</div>
          <label>
            <input type="radio" value="api" checked={mode === 'api'} onChange={() => setMode('api')} />
            <span style={{ marginLeft: 6 }}>Server API</span>
          </label>
          <label style={{ marginLeft: 16 }}>
            <input type="radio" value="wasm" checked={mode === 'wasm'} onChange={() => setMode('wasm')} />
            <span style={{ marginLeft: 6 }}>Browser (WASM)</span>
          </label>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button type="submit" disabled={loading} style={{ padding: '8px 16px' }}>
            {loading ? 'Running…' : `Run (${mode.toUpperCase()})`}
          </button>
          <button type="button" disabled={loading} onClick={resetToDefault} style={{ marginLeft: 8 }}>
            Reset form
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Simulation</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <label>
              <div>Duration [s]</div>
              <input
                type="number"
                min={1}
                step="1"
                value={config.simulation.duration_s}
                onChange={(e) => updateSimulation('duration_s', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Output step [s]</div>
              <input
                type="number"
                min={0.01}
                step="0.1"
                value={config.simulation.output_step_s}
                onChange={(e) => updateSimulation('output_step_s', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Air density variation [%]</div>
              <input
                type="number"
                step="1"
                value={config.simulation.air_density_percent}
                onChange={(e) => updateSimulation('air_density_percent', numberFromInput(e.target.value))}
              />
            </label>
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Launch</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <label>
              <div>Latitude [deg]</div>
              <input
                type="number"
                step="0.0001"
                value={config.launch.latitude_deg}
                onChange={(e) => updateLaunch('latitude_deg', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Longitude [deg]</div>
              <input
                type="number"
                step="0.0001"
                value={config.launch.longitude_deg}
                onChange={(e) => updateLaunch('longitude_deg', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Altitude [m]</div>
              <input
                type="number"
                step="1"
                value={config.launch.altitude_m}
                onChange={(e) => updateLaunch('altitude_m', numberFromInput(e.target.value))}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
            <label>
              <div>Velocity North [m/s]</div>
              <input
                type="number"
                step="0.1"
                value={config.launch.velocity_ned_mps[0]}
                onChange={(e) => setVelocityComponent(0, numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Velocity East [m/s]</div>
              <input
                type="number"
                step="0.1"
                value={config.launch.velocity_ned_mps[1]}
                onChange={(e) => setVelocityComponent(1, numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Velocity Down [m/s]</div>
              <input
                type="number"
                step="0.1"
                value={config.launch.velocity_ned_mps[2]}
                onChange={(e) => setVelocityComponent(2, numberFromInput(e.target.value))}
              />
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Launch time (UTC)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['year', 'month', 'day', 'hour', 'minute', 'second'] as const).map((field) => (
                <label key={field} style={{ display: 'flex', flexDirection: 'column', minWidth: 90 }}>
                  <span style={{ textTransform: 'capitalize' }}>{field}</span>
                  <input
                    type="number"
                    step="1"
                    value={config.launch.datetime_utc[field]}
                    onChange={(e) => updateDateField(field, numberFromInput(e.target.value))}
                  />
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Stage & Motor</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label>
              <div>Mass initial [kg]</div>
              <input
                type="number"
                step="1"
                value={config.stage.mass_initial_kg}
                onChange={(e) => updateStage('mass_initial_kg', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Power flight mode</div>
              <input
                type="number"
                step="1"
                value={config.stage.power_mode}
                onChange={(e) => updateStage('power_mode', Math.trunc(numberFromInput(e.target.value)))}
              />
            </label>
            <label>
              <div>Free flight mode</div>
              <input
                type="number"
                step="1"
                value={config.stage.free_mode}
                onChange={(e) => updateStage('free_mode', Math.trunc(numberFromInput(e.target.value)))}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
            <label>
              <div>Burn start [s]</div>
              <input
                type="number"
                step="0.1"
                value={config.stage.burn_start_s}
                onChange={(e) => updateStage('burn_start_s', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Burn end [s]</div>
              <input
                type="number"
                step="0.1"
                value={config.stage.burn_end_s}
                onChange={(e) => updateStage('burn_end_s', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Forced cutoff [s]</div>
              <input
                type="number"
                step="0.1"
                value={config.stage.forced_cutoff_s}
                onChange={(e) => updateStage('forced_cutoff_s', numberFromInput(e.target.value))}
              />
            </label>
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
            <label>
              <div>Throat diameter [m]</div>
              <input
                type="number"
                step="0.001"
                value={config.stage.throat_diameter_m}
                onChange={(e) => updateStage('throat_diameter_m', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Nozzle expansion ratio</div>
              <input
                type="number"
                step="0.1"
                value={config.stage.nozzle_expansion_ratio}
                onChange={(e) => updateStage('nozzle_expansion_ratio', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Nozzle exit pressure [Pa]</div>
              <input
                type="number"
                step="10"
                value={config.stage.nozzle_exit_pressure_pa}
                onChange={(e) => updateStage('nozzle_exit_pressure_pa', numberFromInput(e.target.value))}
              />
            </label>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 12 }}>
            <div style={{ fontWeight: 600 }}>Thrust curve</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={useThrustProfile}
                onChange={(e) => toggleThrustProfile(e.target.checked)}
              />
              <span>Use thrust profile (CSV / time-series)</span>
            </label>
            {!useThrustProfile && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>
                  <div>Const thrust vac [N]</div>
                  <input
                    type="number"
                    step="10"
                    value={config.stage.thrust_constant}
                    onChange={(e) => updateStage('thrust_constant', numberFromInput(e.target.value))}
                  />
                </label>
              </div>
            )}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
              <label>
                <div>Thrust multiplier</div>
                <input
                  type="number"
                  step="0.01"
                  value={config.stage.thrust_multiplier}
                  onChange={(e) => updateStage('thrust_multiplier', numberFromInput(e.target.value))}
                />
              </label>
            </div>
            {useThrustProfile && (
              <EditableTable<ClientTimeSample>
                title="Thrust profile (time-series)"
                columns={[
                  { key: 'time', label: 'Time [s]', step: '0.1', min: 0 },
                  { key: 'value', label: 'Thrust [N]', step: '10' },
                ]}
                rows={config.stage.thrust_profile}
                onChange={(rows) => updateStage('thrust_profile', rows)}
                addLabel="Add thrust sample"
              />
            )}
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 12 }}>
            <div style={{ fontWeight: 600 }}>Specific impulse</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={useIspProfile}
                onChange={(e) => toggleIspProfile(e.target.checked)}
              />
              <span>Use Isp profile (CSV / time-series)</span>
            </label>
            {!useIspProfile && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>
                  <div>Const Isp vac [s]</div>
                  <input
                    type="number"
                    step="0.1"
                    value={config.stage.isp_constant}
                    onChange={(e) => updateStage('isp_constant', numberFromInput(e.target.value))}
                  />
                </label>
              </div>
            )}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
              <label>
                <div>Isp multiplier</div>
                <input
                  type="number"
                  step="0.01"
                  value={config.stage.isp_multiplier}
                  onChange={(e) => updateStage('isp_multiplier', numberFromInput(e.target.value))}
                />
              </label>
            </div>
            {useIspProfile && (
              <EditableTable<ClientTimeSample>
                title="Isp profile (time-series)"
                columns={[
                  { key: 'time', label: 'Time [s]', step: '0.1', min: 0 },
                  { key: 'value', label: 'Isp [s]', step: '0.1' },
                ]}
                rows={config.stage.isp_profile}
                onChange={(rows) => updateStage('isp_profile', rows)}
                addLabel="Add Isp sample"
              />
            )}
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Aerodynamics</h3>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label>
              <div>Body diameter [m]</div>
              <input
                type="number"
                step="0.01"
                value={config.aerodynamics.body_diameter_m}
                onChange={(e) => updateAerodynamics('body_diameter_m', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Ballistic coefficient [kg/m²]</div>
              <input
                type="number"
                step="1"
                value={config.aerodynamics.ballistic_coefficient}
                onChange={(e) => updateAerodynamics('ballistic_coefficient', numberFromInput(e.target.value))}
              />
            </label>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 12 }}>
            <div style={{ fontWeight: 600 }}>Normal force coefficient (CN)</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={useCnProfile}
                onChange={(e) => toggleCnProfile(e.target.checked)}
              />
              <span>Use CN profile (CSV / Mach table)</span>
            </label>
            {!useCnProfile && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>
                  <div>CN constant</div>
                  <input
                    type="number"
                    step="0.01"
                    value={config.aerodynamics.cn_constant}
                    onChange={(e) => updateAerodynamics('cn_constant', numberFromInput(e.target.value))}
                  />
                </label>
              </div>
            )}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
              <label>
                <div>CN multiplier</div>
                <input
                  type="number"
                  step="0.01"
                  value={config.aerodynamics.cn_multiplier}
                  onChange={(e) => updateAerodynamics('cn_multiplier', numberFromInput(e.target.value))}
                />
              </label>
            </div>
            {useCnProfile && (
              <EditableTable<ClientMachSample>
                title="CN vs Mach"
                columns={[
                  { key: 'mach', label: 'Mach [-]', step: '0.01', min: 0 },
                  { key: 'value', label: 'CN [-]', step: '0.01' },
                ]}
                rows={config.aerodynamics.cn_profile}
                onChange={(rows) => updateAerodynamics('cn_profile', rows)}
                addLabel="Add CN sample"
              />
            )}
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 16, paddingTop: 12 }}>
            <div style={{ fontWeight: 600 }}>Axial force coefficient (CA)</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={useCaProfile}
                onChange={(e) => toggleCaProfile(e.target.checked)}
              />
              <span>Use CA profile (CSV / Mach table)</span>
            </label>
            {!useCaProfile && (
              <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
                <label>
                  <div>CA constant</div>
                  <input
                    type="number"
                    step="0.01"
                    value={config.aerodynamics.ca_constant}
                    onChange={(e) => updateAerodynamics('ca_constant', numberFromInput(e.target.value))}
                  />
                </label>
              </div>
            )}
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
              <label>
                <div>CA multiplier</div>
                <input
                  type="number"
                  step="0.01"
                  value={config.aerodynamics.ca_multiplier}
                  onChange={(e) => updateAerodynamics('ca_multiplier', numberFromInput(e.target.value))}
                />
              </label>
            </div>
            {useCaProfile && (
              <EditableTable<ClientMachSample>
                title="CA vs Mach"
                columns={[
                  { key: 'mach', label: 'Mach [-]', step: '0.01', min: 0 },
                  { key: 'value', label: 'CA [-]', step: '0.01' },
                ]}
                rows={config.aerodynamics.ca_profile}
                onChange={(rows) => updateAerodynamics('ca_profile', rows)}
                addLabel="Add CA sample"
              />
            )}
          </div>
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Attitude guidance</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={useAttitudeProfile}
              onChange={(e) => toggleAttitudeProfile(e.target.checked)}
            />
            <span>Use attitude profile (CSV / time-series)</span>
          </label>
          {!useAttitudeProfile && (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
              <label>
                <div>Azimuth [deg]</div>
                <input
                  type="number"
                  step="0.1"
                  value={config.attitude.azimuth_deg}
                  onChange={(e) => updateAttitude('azimuth_deg', numberFromInput(e.target.value))}
                />
              </label>
              <label>
                <div>Elevation [deg]</div>
                <input
                  type="number"
                  step="0.1"
                  value={config.attitude.elevation_deg}
                  onChange={(e) => updateAttitude('elevation_deg', numberFromInput(e.target.value))}
                />
              </label>
            </div>
          )}
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
            <label>
              <div>Pitch offset [deg]</div>
              <input
                type="number"
                step="0.1"
                value={config.attitude.pitch_offset_deg}
                onChange={(e) => updateAttitude('pitch_offset_deg', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Yaw offset [deg]</div>
              <input
                type="number"
                step="0.1"
                value={config.attitude.yaw_offset_deg}
                onChange={(e) => updateAttitude('yaw_offset_deg', numberFromInput(e.target.value))}
              />
            </label>
            <label>
              <div>Roll offset [deg]</div>
              <input
                type="number"
                step="0.1"
                value={config.attitude.roll_offset_deg}
                onChange={(e) => updateAttitude('roll_offset_deg', numberFromInput(e.target.value))}
              />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
            {(['x', 'y', 'z'] as const).map((axis, idx) => (
              <label key={axis} style={{ display: 'flex', flexDirection: 'column', minWidth: 140 }}>
                <span>Gyro bias {axis.toUpperCase()} [deg/h]</span>
                <input
                  type="number"
                  step="0.01"
                  value={config.attitude.gyro_bias_deg_h[idx]}
                  onChange={(e) => {
                    const next: [number, number, number] = [...config.attitude.gyro_bias_deg_h] as [number, number, number]
                    next[idx] = numberFromInput(e.target.value)
                    updateAttitude('gyro_bias_deg_h', next)
                  }}
                />
              </label>
            ))}
          </div>
          {useAttitudeProfile && (
            <EditableTable<ClientAttitudeSample>
              title="Attitude profile"
              columns={[
                { key: 'time', label: 'Time [s]', step: '0.1', min: 0 },
                { key: 'azimuth_deg', label: 'Azimuth [deg]', step: '0.1' },
                { key: 'elevation_deg', label: 'Elevation [deg]', step: '0.1' },
              ]}
              rows={config.attitude.profile}
              onChange={(rows) => updateAttitude('profile', rows)}
              addLabel="Add attitude waypoint"
            />
          )}
        </div>

        <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
          <h3>Wind</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={useWindProfile}
              onChange={(e) => toggleWindProfile(e.target.checked)}
            />
            <span>Use wind profile (CSV / altitude table)</span>
          </label>
          {!useWindProfile && (
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginTop: 12 }}>
              <label>
                <div>Constant wind speed [m/s]</div>
                <input
                  type="number"
                  step="0.1"
                  value={config.wind.speed_mps}
                  onChange={(e) => updateWind('speed_mps', numberFromInput(e.target.value))}
                />
              </label>
              <label>
                <div>Direction (from) [deg]</div>
                <input
                  type="number"
                  step="1"
                  value={config.wind.direction_deg}
                  onChange={(e) => updateWind('direction_deg', numberFromInput(e.target.value))}
                />
              </label>
            </div>
          )}
          {useWindProfile && (
            <EditableTable<ClientWindSample>
              title="Wind profile"
              columns={[
                { key: 'altitude_m', label: 'Altitude [m]', step: '1', min: 0 },
                { key: 'speed_mps', label: 'Speed [m/s]', step: '0.1' },
                { key: 'direction_deg', label: 'Direction [deg]', step: '1' },
              ]}
              rows={config.wind.profile}
              onChange={(rows) => updateWind('profile', rows)}
              addLabel="Add wind datum"
            />
          )}
        </div>
      </div>

      {error && <div style={{ color: 'crimson' }}>{error}</div>}

      <details style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Generated JSON preview</summary>
        <pre style={{ maxHeight: 240, overflow: 'auto', background: '#f9fafb', padding: 12, borderRadius: 6 }}>
          {jsonPreview}
        </pre>
      </details>
    </form>
  )
}
