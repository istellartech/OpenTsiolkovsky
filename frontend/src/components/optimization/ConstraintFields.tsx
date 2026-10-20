import { useContext } from 'react'
import type { MultiStageInput, SingleStageInput } from '../../lib/optimization-input'
import { phaseLabel } from '../../lib/optimization-vehicle'
import { tr } from '../../lib/i18n'
import { OptGroup, OptNumber } from './controls'
import { OptimizationEditorContext } from './editor-context'

type Category = 'aero' | 'propulsion' | 'control' | 'altitude'
interface Field {
  path: string
  label: string
  value: number
  unit: string
  scale?: number
}
interface Section {
  category: Category
  title: string
  fields: Field[]
}
/** Sections grow vertically by category/phase, rather than adding columns for every new constraint. */
function sections(p: MultiStageInput | SingleStageInput): Section[] {
  const field = (key: string, label: string, value: number, unit: string, scale = 1): Field => ({
    path: `problem.${key}`,
    label,
    value,
    unit,
    scale,
  })
  const result: Section[] = [
    {
      category: 'aero',
      title: tr('全飛行', 'Entire flight'),
      fields: [field('max_dynamic_pressure_pa', tr('最大動圧', 'Max dynamic pressure'), p.max_dynamic_pressure_pa, 'kPa', 1000)],
    },
  ]
  if (p.kind === 'multi_stage') {
    p.phases.forEach((phase, i) => {
      const title = phaseLabel(p.phases, i, p.vehicle)
      result.push(
        {
          category: 'aero',
          title,
          fields: [field(`phases.${i}.max_angle_of_attack_deg`, tr('最大迎角', 'Max angle of attack'), phase.max_angle_of_attack_deg, '°')],
        },
        {
          category: 'propulsion',
          title,
          fields: [
            field(
              `phases.${i}.max_specific_force_m_s2`,
              tr('最大非重力加速度', 'Max non-gravitational acceleration'),
              phase.max_specific_force_m_s2,
              'G',
              9.80665,
            ),
          ],
        },
        {
          category: 'altitude',
          title,
          fields: [field(`phases.${i}.min_altitude_m`, tr('最低高度', 'Minimum altitude'), phase.min_altitude_m, 'km', 1000)],
        },
      )
    })
    result.push(
      {
        category: 'control',
        title: tr('姿勢変化の速さ', 'Attitude rates'),
        fields: [
          field('max_azimuth_rate_deg_s', tr('最大方位角変化率', 'Max azimuth rate'), p.max_azimuth_rate_deg_s, '°/s'),
          field('max_elevation_rate_deg_s', tr('最大仰角変化率', 'Max elevation rate'), p.max_elevation_rate_deg_s, '°/s'),
          field(
            'max_inertial_direction_rate_deg_s',
            tr('最大機体軸回転速度', 'Max body-axis rotation'),
            p.max_inertial_direction_rate_deg_s,
            '°/s',
          ),
        ],
      },
      {
        category: 'control',
        title: tr('姿勢角の範囲', 'Attitude bounds'),
        fields: [
          field('azimuth_bounds_deg.0', tr('方位角の下限', 'Min azimuth'), p.azimuth_bounds_deg[0], '°'),
          field('azimuth_bounds_deg.1', tr('方位角の上限', 'Max azimuth'), p.azimuth_bounds_deg[1], '°'),
          field('elevation_bounds_deg.0', tr('仰角の下限', 'Min elevation'), p.elevation_bounds_deg[0], '°'),
        ],
      },
      {
        category: 'altitude',
        title: tr('フェアリング投棄', 'Fairing release'),
        fields: [
          field(
            'fairing_release_min_altitude_m',
            tr('投棄できる最低高度', 'Minimum release altitude'),
            p.fairing_release_min_altitude_m,
            'km',
            1000,
          ),
        ],
      },
    )
  } else {
    result.push(
      {
        category: 'aero',
        title: tr('全飛行', 'Entire flight'),
        fields: [field('max_angle_of_attack_deg', tr('最大迎角', 'Max angle of attack'), p.max_angle_of_attack_deg, '°')],
      },
      {
        category: 'propulsion',
        title: tr('全飛行', 'Entire flight'),
        fields: [
          field(
            'max_specific_force_m_s2',
            tr('最大非重力加速度', 'Max non-gravitational acceleration'),
            p.max_specific_force_m_s2,
            'G',
            9.80665,
          ),
        ],
      },
      {
        category: 'control',
        title: tr('姿勢', 'Attitude'),
        fields: [
          field('max_pitch_rate_deg_s', tr('最大仰角変化率', 'Max elevation rate'), p.max_pitch_rate_deg_s, '°/s'),
          field('minimum_pitch_deg', tr('仰角の下限', 'Min elevation'), p.minimum_pitch_deg, '°'),
        ],
      },
      {
        category: 'altitude',
        title: tr('飛行距離', 'Downrange'),
        fields: [field('minimum_downrange_m', tr('射向への最小飛行距離', 'Minimum downrange'), p.minimum_downrange_m, 'km', 1000)],
      },
    )
  }
  return result
}

export function ConstraintFields({ p }: { p: MultiStageInput | SingleStageInput }) {
  const ctx = useContext(OptimizationEditorContext)
  const groups: { id: Category; title: string; help: string }[] = [
    {
      id: 'aero',
      title: tr('空力荷重', 'Aerodynamic loads'),
      help: tr(
        '動圧・迎角の上限。動圧は½ρV²、迎角は機体軸と気流のずれです。',
        'Dynamic pressure and angle-of-attack limits. Dynamic pressure is ½ρV²; angle of attack is the body/airflow angle.',
      ),
    },
    {
      id: 'propulsion',
      title: tr('推進・加速度', 'Propulsion and acceleration'),
      help: tr(
        '現在の加速度上限は推力・空気力による比力の大きさです（重力を除く、1 G = 9.80665 m/s²）。推力は機体設定の固定値です。',
        'Acceleration limits use the magnitude of non-gravitational specific force (1 G = 9.80665 m/s²). Thrust currently uses the fixed vehicle setting.',
      ),
    },
    {
      id: 'control',
      title: tr('姿勢・制御', 'Attitude and control'),
      help: tr(
        '方位角は北から時計回り、仰角は水平から測ります。角度と回転速度の上限を設定します。',
        'Azimuth is clockwise from north; elevation is above the horizon. Configure angle and rotation-rate bounds.',
      ),
    },
    {
      id: 'altitude',
      title: tr('高度・飛行領域', 'Altitude and flight region'),
      help: tr(
        '最低高度・投棄高度・飛行距離。熱流束や落下域は評価していません。',
        'Clearance, release altitude and downrange. Heat flux and debris regions are not evaluated.',
      ),
    },
  ]
  const items = sections(p)
  return (
    <OptGroup
      title={tr('拘束条件', 'Constraints')}
      note={tr(
        'カテゴリごとに設定します。求解の収束と、再積分による拘束条件の合否は別々に確認します。',
        'Configure limits by category. Solver convergence and constraint validation by reintegration are reported separately.',
      )}
    >
      {groups.map((group, index) => (
        <details key={group.id} open={index === 0} data-opt-details className="border-t border-line pt-2">
          <summary className="cursor-pointer text-[13px] font-medium">{group.title}</summary>
          <p className="my-2 text-[11px] leading-relaxed text-ink-3">{group.help}</p>
          <div className="space-y-3">
            {items
              .filter((item) => item.category === group.id)
              .map((item, i) => (
                <fieldset key={i} className="min-w-0 border-t border-line pt-2">
                  <legend className="pr-2 text-[11px] text-ink-2">{item.title}</legend>
                  <div className="grid gap-2 @min-[380px]:grid-cols-2">
                    {item.fields.map((field) => (
                      <OptNumber key={field.path} {...field} />
                    ))}
                  </div>
                </fieldset>
              ))}
          </div>
        </details>
      ))}
      <p className="text-[11px] text-ink-3">
        {tr(
          '推進剤予備量・着火回数は機体と詳細設定で指定します。',
          'Propellant reserves and ignition counts are configured under Vehicle and Advanced settings.',
        )}
      </p>
      {ctx.disabled ? (
        <p className="text-[11px] text-ink-3">{tr('実行中の拘束条件は固定されています。', 'Constraints are frozen during the run.')}</p>
      ) : null}
    </OptGroup>
  )
}
