import { tr } from '../lib/i18n'
import type { MultiStageValidation, PhysicalCheck } from '../lib/optimization'

const number = (value: number | undefined) => (value === undefined ? '—' : value.toPrecision(8))

export function TrajectoryChart<T extends { time_s: number }>({
  samples,
  read,
  label,
}: {
  samples: T[]
  read: (sample: T) => number
  label: string
}) {
  const values = samples.map(read)
  const low = Math.min(...values)
  const high = Math.max(...values)
  const span = Math.max(high - low, 1e-12)
  const duration = samples[samples.length - 1].time_s
  const points = samples.map((p) => `${55 + (400 * p.time_s) / duration},${135 - (105 * (read(p) - low)) / span}`).join(' ')
  return (
    <figure className="rounded-[8px] border border-line bg-surface p-3">
      <figcaption className="text-[12px] text-ink-2">
        {label} · {tr('再積分', 'Reintegrated')}
      </figcaption>
      <svg viewBox="0 0 480 165" role="img" aria-label={label}>
        <path d="M55 20V135H455" stroke="var(--line-strong)" fill="none" />
        <polyline points={points} stroke="var(--signal)" fill="none" strokeWidth="2" />
        <g fontSize="10" fill="var(--ink-3)">
          <text x="0" y="30">
            {high.toPrecision(3)}
          </text>
          <text x="0" y="135">
            {low.toPrecision(3)}
          </text>
          <text x="55" y="157">
            0 s
          </text>
          <text x="405" y="157">
            {duration.toPrecision(4)} s
          </text>
        </g>
      </svg>
    </figure>
  )
}

export function PhysicalChecks({ checks }: { checks: PhysicalCheck[] }) {
  return (
    <section className="overflow-x-auto rounded-[8px] border border-line bg-surface p-3">
      <h3 className="mb-2 text-[13px] font-semibold">
        {tr('再積分による物理制約の検証', 'Physical constraints from independent integration')}
      </h3>
      <table className="w-full text-left text-[11px]">
        <thead>
          <tr>
            <th className="p-1.5">{tr('制約・単位', 'Constraint / unit')}</th>
            <th className="p-1.5">{tr('再評価値', 'Reevaluated value')}</th>
            <th className="p-1.5">{tr('下限 / 上限', 'Lower / upper')}</th>
            <th className="p-1.5">{tr('違反 / 許容差', 'Violation / tolerance')}</th>
            <th className="p-1.5">{tr('判定', 'Result')}</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.id} className="border-t border-line">
              <th className="p-1.5 font-normal">
                {c.id} [{c.unit}]
              </th>
              <td className="num p-1.5">{number(c.value)}</td>
              <td className="num p-1.5">
                {number(c.lower ?? undefined)} / {number(c.upper ?? undefined)}
              </td>
              <td className="num p-1.5">
                {number(c.violation)} / {number(c.tolerance)}
              </td>
              <td className={`p-1.5 ${c.passed ? 'text-ink-2' : 'text-danger'}`}>
                {c.passed ? tr('合格', 'Passed') : tr('不合格', 'Failed')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export function MultiStageReport({ flight }: { flight: MultiStageValidation }) {
  const massSamples = [...flight.samples, { ...flight.samples[flight.samples.length - 1], state_eci: flight.deployed_state_eci }]
  const unevaluatedLabels: Record<string, string> = {
    FAIRING: tr('フェアリング投棄後の熱流束・積算熱量', 'Thermal flux and integrated heating after fairing jettison'),
    RANGE: tr('飛行回廊・分離物の落下域', 'Geographic corridor and discarded-body landing regions'),
    STAGING: tr('分離時の相対運動・プルーム・再接触', 'Relative separation motion, plume and recontact'),
    'GNC/ENV': tr('姿勢運動・TVC応答・構造/音響荷重', 'Rigid-body rotation, TVC dynamics and structural/acoustic loads'),
    ENGINE: tr('推進剤沈降・再着火時の熱/電力資源', 'Propellant settling and restart thermal/power resources'),
  }
  const eventLabels = {
    separate_stage: tr('段分離', 'Stage separation'),
    jettison_fairing: tr('フェアリング投棄', 'Fairing jettison'),
    deploy_payload: tr('衛星分離', 'Payload deployment'),
  }
  const ledgerHeadings = [
    tr('段', 'Stage'),
    tr('乾燥 [kg]', 'Dry [kg]'),
    tr('搭載推進剤 [kg]', 'Loaded propellant [kg]'),
    tr('消費 [kg]', 'Consumed [kg]'),
    tr('残量 / 予備量 [kg]', 'Residual / reserve [kg]'),
    tr('燃焼 [s] / 着火回数', 'Burn [s] / ignitions'),
  ]
  return (
    <>
      <section className="space-y-2 rounded-[8px] border border-line bg-surface p-3 text-[12px]">
        <h3 className="font-semibold">
          {tr('仮定した機体の数値実証・未評価の条件', 'Assumed vehicle demonstration · unevaluated conditions')}
        </h3>
        <p>
          {tr(
            '次の条件は数値検証の合否に含まれていません。実機ミッションの成立を示す結果ではありません。',
            'The conditions below are outside the numerical pass/fail assessment. This result does not establish operational mission feasibility.',
          )}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-ink-2">
          {flight.unevaluated_constraints.map((text) => (
            <li key={text}>{unevaluatedLabels[text.split(' ')[0]] ?? text}</li>
          ))}
        </ul>
      </section>
      <section className="overflow-x-auto rounded-[8px] border border-line bg-surface p-3">
        <h3 className="mb-2 text-[13px] font-semibold">{tr('質量収支（独立再積分）', 'Mass ledger (independent integration)')}</h3>
        <p className="mb-2 text-[11px] text-ink-2">
          {tr('初期全質量 / 正味衛星 / PAF / フェアリング [kg]', 'Initial total / net satellite / PAF / fairing [kg]')}:{' '}
          {number(flight.initial_total_mass_kg)} / {number(flight.net_payload_kg)} / {number(flight.payload_adapter_kg)} /{' '}
          {number(flight.fairing_kg)}
        </p>
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr>
              {ledgerHeadings.map((label) => (
                <th className="p-1.5" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flight.stage_ledgers.map((s) => (
              <tr className="border-t border-line" key={s.stage}>
                <th className="p-1.5 font-normal">{s.stage + 1}</th>
                <td className="num p-1.5">{number(s.dry_kg)}</td>
                <td className="num p-1.5">{number(s.propellant_loaded_kg)}</td>
                <td className="num p-1.5">{number(s.propellant_consumed_kg)}</td>
                <td className="num p-1.5">
                  {number(s.residual_kg)} / {number(s.required_reserve_kg)}
                </td>
                <td className="num p-1.5">
                  {number(s.total_burn_s)} / {s.ignition_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="overflow-x-auto rounded-[8px] border border-line bg-surface p-3">
        <h3 className="mb-2 text-[13px] font-semibold">{tr('分離・投棄イベント', 'Separation and jettison events')}</h3>
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr>
              {[
                tr('イベント / 段', 'Event / stage'),
                tr('時刻 [s]', 'Time [s]'),
                tr('前 / 後 [kg]', 'Before / after [kg]'),
                tr('乾燥 / 残推進剤 / フェアリング / PAF [kg]', 'Dry / propellant / fairing / PAF [kg]'),
                tr('位置 / 速度ジャンプ [m / m/s]', 'Position / velocity jump [m / m/s]'),
              ].map((label) => (
                <th className="p-1.5" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {flight.events.map((e) => (
              <tr className="border-t border-line" key={e.phase}>
                <th className="p-1.5 font-normal">
                  {eventLabels[e.kind]} / {e.stage + 1}
                </th>
                <td className="num p-1.5">{number(e.time_s)}</td>
                <td className="num p-1.5">
                  {number(e.before_eci[0])} / {number(e.after_eci[0])}
                </td>
                <td className="num p-1.5">
                  {number(e.dry_removed_kg)} / {number(e.propellant_removed_kg)} / {number(e.fairing_removed_kg)} /{' '}
                  {number(e.adapter_removed_kg)}
                </td>
                <td className="num p-1.5">
                  {number(e.position_jump_m)} / {number(e.velocity_jump_m_s)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <TrajectoryChart samples={flight.samples} read={(s) => s.altitude_m} label={tr('測地高度 [m]', 'Geodetic altitude [m]')} />
        <TrajectoryChart samples={massSamples} read={(s) => s.state_eci[0]} label={tr('機体質量 [kg]', 'Stack mass [kg]')} />
        <TrajectoryChart samples={flight.samples} read={(s) => s.dynamic_pressure_pa} label={tr('動圧 [Pa]', 'Dynamic pressure [Pa]')} />
        <TrajectoryChart samples={flight.samples} read={(s) => s.specific_force_m_s2} label={tr('比力 [m/s²]', 'Specific force [m/s²]')} />
        <TrajectoryChart samples={flight.samples} read={(s) => s.elevation_deg} label={tr('仰角 [deg]', 'Elevation [deg]')} />
        <TrajectoryChart samples={flight.samples} read={(s) => s.azimuth_deg} label={tr('方位角 [deg]', 'Azimuth [deg]')} />
        <TrajectoryChart samples={flight.samples} read={(s) => s.angle_of_attack_deg} label={tr('迎角 [deg]', 'Angle of attack [deg]')} />
        <TrajectoryChart
          samples={flight.samples}
          read={(s) => s.inertial_direction_rate_deg_s}
          label={tr('ECI機体軸の変化率 [deg/s]', 'ECI body-axis rate [deg/s]')}
        />
      </div>
      <PhysicalChecks checks={flight.checks} />
    </>
  )
}
