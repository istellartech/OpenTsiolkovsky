import type { ClientConfig } from '../../lib/simulation'
import { NumberField, ProfileTable, SelectField, Toggle } from '../primitives'
import { Group, type Patch } from './shared'
import { tr } from '../../lib/i18n'

/** Rust `default_rk45_tol` */
const RK45_TOL = 1e-9

export function SolverTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const s = config.simulation
  const integrator = s.integrator ?? { method: 'rk45' as const, rk4_step_s: null }
  const model = s.atmosphere_model ?? 'legacy'
  const densityTable = (s.air_density_profile?.length ?? 0) > 0
  const set = (v: Partial<ClientConfig['simulation']>) => patch((c) => ({ ...c, simulation: { ...c.simulation, ...v } }))
  return (
    <>
      <Group
        title={tr('計算時間', 'Run length')}
        note={tr('着地するか計算時間に達すると終了します。', 'The run ends at impact or when the duration is reached.')}
      >
        <NumberField
          label={tr('計算時間', 'Duration')}
          unit="s"
          path="simulation.duration_s"
          value={s.duration_s}
          onChange={(v) => set({ duration_s: v })}
        />
        <NumberField
          label={tr('出力間隔', 'Output interval')}
          unit="s"
          path="simulation.output_step_s"
          value={s.output_step_s}
          onChange={(v) => set({ output_step_s: v })}
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
          onChange={(method) =>
            set({
              integrator: {
                ...integrator,
                method,
                rk4_step_s: method === 'rk4' ? (integrator.rk4_step_s ?? Math.max(s.output_step_s / 2, 0.001)) : integrator.rk4_step_s,
              },
            })
          }
        />
        {integrator.method === 'rk4' && (
          <NumberField
            label={tr('RK4 刻み', 'RK4 step size')}
            unit="s"
            path="simulation.integrator.rk4_step_s"
            value={integrator.rk4_step_s ?? Math.max(s.output_step_s / 2, 0.001)}
            onChange={(v) => set({ integrator: { ...integrator, rk4_step_s: v } })}
          />
        )}
        {integrator.method === 'rk45' && (
          <>
            <NumberField
              label={tr('絶対許容誤差', 'Absolute tolerance')}
              unit="—"
              hint={tr('全成分共通（kg・m・m/s）。既定 1e-9', 'All components (kg, m, m/s). Default 1e-9')}
              path="simulation.integrator.rk45_abs_tol"
              value={integrator.rk45_abs_tol ?? RK45_TOL}
              onChange={(v) => set({ integrator: { ...integrator, rk45_abs_tol: v } })}
            />
            <NumberField
              label={tr('相対許容誤差', 'Relative tolerance')}
              unit="—"
              hint={tr('既定 1e-9', 'Default 1e-9')}
              path="simulation.integrator.rk45_rel_tol"
              value={integrator.rk45_rel_tol ?? RK45_TOL}
              onChange={(v) => set({ integrator: { ...integrator, rk45_rel_tol: v } })}
            />
          </>
        )}
      </Group>
      <Group
        collapsible
        defaultOpen={s.air_density_percent !== 0 || densityTable || model !== 'legacy'}
        badge={[
          model === 'ussa1976' ? 'USSA1976' : tr('旧C++版', 'Legacy'),
          densityTable
            ? tr('密度テーブル', 'density table')
            : tr(
                `密度 ${s.air_density_percent > 0 ? '+' : ''}${s.air_density_percent}%`,
                `density ${s.air_density_percent > 0 ? '+' : ''}${s.air_density_percent}%`,
              ),
        ].join(' · ')}
        title={tr('大気', 'Atmosphere')}
        note={tr(
          '「旧C++版」は1976年標準大気の各層を幾何高度で評価し、84.852 km 以上を等温で外挿します（C++版と同じ）。「USSA1976」は 86 km までジオポテンシャル高度で計算し、86〜1000 km は表値を使います。',
          '"Legacy" evaluates the 1976 standard atmosphere layers at geometric altitude and extends it isothermally above 84.852 km, as the C++ simulator does. "USSA1976" uses geopotential altitude up to 86 km and the tabulated values from 86 to 1000 km.',
        )}
      >
        <SelectField
          label={tr('標準大気', 'Standard atmosphere')}
          path="simulation.atmosphere_model"
          value={model}
          options={[
            { value: 'legacy', label: tr('旧C++版', 'Legacy (C++)') },
            { value: 'ussa1976', label: 'USSA1976' },
          ]}
          onChange={(m) => set({ atmosphere_model: m === 'legacy' ? undefined : m })}
        />
        <Toggle
          label={tr('高度別に密度の変動を入力（テーブル）', 'Density variation by altitude (table)')}
          checked={densityTable}
          onChange={(on) =>
            set({
              air_density_profile: on
                ? [
                    { altitude_m: 0, percent: s.air_density_percent },
                    { altitude_m: 100000, percent: s.air_density_percent },
                  ]
                : undefined,
            })
          }
        />
        {densityTable ? (
          <ProfileTable
            path="simulation.air_density_profile"
            title={tr('高度別の密度変動', 'Density variation by altitude')}
            columns={[
              { key: 'altitude_m', label: tr('高度 m', 'Altitude m') },
              { key: 'percent', label: tr('変動 %', 'Variation %') },
            ]}
            rows={s.air_density_profile ?? []}
            onChange={(rows) => set({ air_density_profile: rows })}
          />
        ) : (
          <NumberField
            label={tr('密度の変動', 'Density variation')}
            unit="%"
            hint={tr(
              '標準大気の季節変動の高度分布に沿って密度を変えます',
              'Scales density along the seasonal-variation profile of the standard atmosphere',
            )}
            path="simulation.air_density_percent"
            value={s.air_density_percent}
            onChange={(v) => set({ air_density_percent: v })}
          />
        )}
      </Group>
    </>
  )
}
