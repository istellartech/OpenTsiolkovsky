import type { AtmosphereModel, Config } from '../../lib/config'
import { DEFAULTS, integratorOf, isRows } from '../../lib/config'
import { NumberField, RowsTable, SelectField, Toggle } from '../primitives'
import { Group, type Patch } from './shared'
import { tr } from '../../lib/i18n'

type Atmosphere = NonNullable<Config['atmosphere']>

export function SolverTab({ config, patch }: { config: Config; patch: Patch }) {
  const s = config.simulation
  const step = s.output_step_s ?? DEFAULTS.outputStep
  const integrator = integratorOf(config)
  const atm = config.atmosphere ?? {}
  const model = atm.model ?? 'ussa1976'
  const seasonal = atm.seasonal_variation_percent ?? 0
  const table = isRows(atm.density_deviation) ? atm.density_deviation : null
  const setSim = (v: Partial<Config['simulation']>) => patch((c) => ({ ...c, simulation: { ...c.simulation, ...v } }))
  const setAtm = (v: Partial<Atmosphere>) => patch((c) => ({ ...c, atmosphere: { ...c.atmosphere, ...v } }))
  return (
    <>
      <Group
        title={tr('計算時間', 'Run length')}
        note={tr('着地するか計算時間に達すると終了します。', 'The run ends at impact or when the end time is reached.')}
      >
        <NumberField
          label={tr('計算時間', 'End time')}
          unit="s"
          path="simulation.end_time_s"
          value={s.end_time_s}
          onChange={(v) => setSim({ end_time_s: v })}
        />
        <NumberField
          label={tr('出力間隔', 'Output interval')}
          unit="s"
          path="simulation.output_step_s"
          value={step}
          onChange={(v) => setSim({ output_step_s: v })}
        />
      </Group>
      <Group
        collapsible
        defaultOpen={integrator.method !== 'rk45'}
        badge={integrator.method === 'rk4' ? 'RK4' : 'RK45'}
        title={tr('数値積分', 'Integration')}
      >
        <SelectField
          label={tr('積分法', 'Integrator')}
          path="simulation.integrator.method"
          value={integrator.method}
          options={[
            { value: 'rk45', label: tr('RK45（可変刻み）', 'RK45 (adaptive step)') },
            { value: 'rk4', label: tr('RK4（固定刻み）', 'RK4 (fixed step)') },
          ]}
          onChange={(method) => setSim({ integrator: method === 'rk4' ? { method, step_s: Math.max(step / 2, 0.001) } : { method } })}
        />
        {integrator.method === 'rk4' && (
          <NumberField
            label={tr('RK4 刻み', 'RK4 step size')}
            unit="s"
            path="simulation.integrator.step_s"
            value={integrator.step_s}
            onChange={(v) => setSim({ integrator: { method: 'rk4', step_s: v } })}
          />
        )}
        {integrator.method === 'rk45' && (
          <>
            <NumberField
              label={tr('絶対許容誤差', 'Absolute tolerance')}
              unit="—"
              hint={tr('全成分共通（kg・m・m/s）。既定 1e-9', 'All components (kg, m, m/s). Default 1e-9')}
              path="simulation.integrator.abs_tol"
              value={integrator.abs_tol}
              onChange={(v) => setSim({ integrator: { ...integrator, abs_tol: v } })}
            />
            <NumberField
              label={tr('相対許容誤差', 'Relative tolerance')}
              unit="—"
              hint={tr('既定 1e-9', 'Default 1e-9')}
              path="simulation.integrator.rel_tol"
              value={integrator.rel_tol}
              onChange={(v) => setSim({ integrator: { ...integrator, rel_tol: v } })}
            />
          </>
        )}
      </Group>
      <Group
        collapsible
        defaultOpen={seasonal !== 0 || !!table || model !== 'ussa1976'}
        badge={[
          model === 'ussa1976' ? 'USSA1976' : tr('旧C++版', 'Legacy'),
          table
            ? tr('密度テーブル', 'density table')
            : tr(`密度 ${seasonal > 0 ? '+' : ''}${seasonal}%`, `density ${seasonal > 0 ? '+' : ''}${seasonal}%`),
        ].join(' · ')}
        title={tr('大気', 'Atmosphere')}
        note={tr(
          '「USSA1976」は 86 km までジオポテンシャル高度で計算し、86〜1000 km は表値を使います。「旧C++版」は1976年標準大気の各層を幾何高度で評価し、84.852 km 以上を等温で外挿します（C++版と同じ）。',
          '"USSA1976" uses geopotential altitude up to 86 km and the tabulated values from 86 to 1000 km. "Legacy" evaluates the 1976 layers at geometric altitude and extends them isothermally above 84.852 km, as the C++ simulator does.',
        )}
      >
        <SelectField<AtmosphereModel>
          label={tr('標準大気', 'Standard atmosphere')}
          path="atmosphere.model"
          value={model}
          options={[
            { value: 'ussa1976', label: 'USSA1976' },
            { value: 'legacy', label: tr('旧C++版', 'Legacy (C++)') },
          ]}
          onChange={(m) => setAtm({ model: m === 'ussa1976' ? undefined : m })}
        />
        <Toggle
          label={tr('高度別に密度の偏差を入力（テーブル）', 'Density deviation by altitude (table)')}
          checked={!!table}
          onChange={(on) =>
            setAtm({
              density_deviation: on
                ? [
                    [0, seasonal],
                    [100000, seasonal],
                  ]
                : undefined,
            })
          }
        />
        {table ? (
          <RowsTable
            path="atmosphere.density_deviation"
            title={tr('高度別の密度偏差', 'Density deviation by altitude')}
            columns={[tr('高度 m', 'Altitude m'), tr('偏差 %', 'Deviation %')]}
            rows={table}
            onChange={(rows) => setAtm({ density_deviation: rows })}
          />
        ) : (
          <NumberField
            label={tr('季節変動', 'Seasonal variation')}
            unit="%"
            hint={tr(
              '標準大気の季節変動の高度分布に沿って密度を変えます（低高度と高高度で符号が逆）',
              'Scales density along the seasonal-variation profile of the standard atmosphere (opposite signs at low and high altitude)',
            )}
            path="atmosphere.seasonal_variation_percent"
            value={seasonal}
            onChange={(v) => setAtm({ seasonal_variation_percent: v })}
          />
        )}
      </Group>
    </>
  )
}
