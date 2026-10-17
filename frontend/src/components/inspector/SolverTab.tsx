import type { ClientConfig } from '../../lib/simulation'
import { NumberField, SelectField } from '../primitives'
import { Group, type Patch } from './shared'

export function SolverTab({ config, patch }: { config: ClientConfig; patch: Patch }) {
  const s = config.simulation
  const integrator = s.integrator ?? { method: 'rk45' as const, rk4_step_s: null }
  const set = (v: Partial<ClientConfig['simulation']>) => patch((c) => ({ ...c, simulation: { ...c.simulation, ...v } }))
  return (
    <>
      <Group title="時間" note="着地するか計算時間に達すると終了します。">
        <NumberField label="計算時間" unit="s" path="simulation.duration_s" value={s.duration_s} onChange={(v) => set({ duration_s: v })} />
        <NumberField label="出力間隔" unit="s" path="simulation.output_step_s" value={s.output_step_s} onChange={(v) => set({ output_step_s: v })} />
      </Group>
      <Group title="数値積分">
        <SelectField
          label="積分法"
          path="simulation.integrator.method"
          value={integrator.method}
          options={[
            { value: 'rk45', label: 'RK45（可変刻み）' },
            { value: 'rk4', label: 'RK4（固定刻み）' },
          ]}
          onChange={(method) =>
            set({
              integrator: {
                method,
                rk4_step_s: method === 'rk4' ? integrator.rk4_step_s ?? Math.max(s.output_step_s / 2, 0.001) : integrator.rk4_step_s,
              },
            })
          }
        />
        {integrator.method === 'rk4' && (
          <NumberField
            label="RK4 刻み"
            unit="s"
            path="simulation.integrator.rk4_step_s"
            value={integrator.rk4_step_s ?? Math.max(s.output_step_s / 2, 0.001)}
            onChange={(v) => set({ integrator: { ...integrator, rk4_step_s: v } })}
          />
        )}
      </Group>
      <Group title="大気">
        <NumberField label="密度の変動" unit="%" path="simulation.air_density_percent" value={s.air_density_percent} onChange={(v) => set({ air_density_percent: v })} />
      </Group>
    </>
  )
}
