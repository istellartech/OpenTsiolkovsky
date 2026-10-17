import type { ClientConfig } from '../../lib/simulation'
import { NumberField, SelectField } from '../primitives'
import { Group, type Patch } from './shared'
import { tr } from '../../lib/i18n'

export function SolverTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const s = config.simulation
  const integrator = s.integrator ?? { method: 'rk45' as const, rk4_step_s: null }
  const set = (v: Partial<ClientConfig['simulation']>) => patch((c) => ({ ...c, simulation: { ...c.simulation, ...v } }))
  return (
    <>
      <Group
        title={tr('時間', 'Time')}
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
      <Group title={tr('数値積分', 'Integration')}>
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
      </Group>
      <Group title={tr('大気', 'Atmosphere')}>
        <NumberField
          label={tr('密度の変動', 'Density variation')}
          unit="%"
          path="simulation.air_density_percent"
          value={s.air_density_percent}
          onChange={(v) => set({ air_density_percent: v })}
        />
      </Group>
    </>
  )
}
