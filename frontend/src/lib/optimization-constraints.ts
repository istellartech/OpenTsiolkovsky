// Readable grouping of the validator's physical checks (IDs such as `Q[3]`).
import type { PhysicalCheck } from './optimization'
import { tr } from './i18n'

export type ConstraintFamily = 'orbit' | 'aero' | 'accel' | 'attitude' | 'altitude' | 'propellant' | 'payload' | 'numerical'
export interface ConstraintView {
  check: PhysicalCheck
  family: ConstraintFamily
  label: string
  /** Phase index for per-phase checks. */
  phase: number | null
  /** Display value and bounds in the display unit. */
  value: number
  lower: number | null
  upper: number | null
  unit: string
  /** Fraction of the allowed range used: 1 means at the limit (one-sided limits only). */
  usage: number | null
  /** At a limit: the optimizer pushed against it, so it shapes the payload. */
  active: boolean
  /** Equality to hit (target orbit etc.) rather than a limit. */
  equality: boolean
}

export function familyLabel(f: ConstraintFamily): string {
  return {
    orbit: tr('投入軌道', 'Target orbit'),
    aero: tr('空力荷重（動圧・迎角）', 'Aerodynamic load (dynamic pressure, angle of attack)'),
    accel: tr('加速度', 'Acceleration'),
    attitude: tr('姿勢と姿勢変化', 'Attitude and attitude rates'),
    altitude: tr('高度', 'Altitude'),
    propellant: tr('推進剤・燃焼時間', 'Propellant and burn time'),
    payload: tr('質量収支・イベント', 'Mass balance and events'),
    numerical: tr('数値計算の整合性', 'Numerical consistency'),
  }[f]
}
export function familyHelp(f: ConstraintFamily): string {
  return {
    orbit: tr(
      '衛星分離直後の軌道が目標の円軌道・傾斜角になっているか。',
      'Whether the orbit right after deployment is the target circular orbit and inclination.',
    ),
    aero: tr(
      '大気中で機体が受ける空気力の大きさ。動圧（空気の密度×速度²/2）と迎角（機体軸と気流のずれ）が大きいほど構造の負担が増えます。',
      'How hard the air pushes on the vehicle. Larger dynamic pressure (½·density·speed²) and angle of attack (body axis vs. airflow) load the structure more.',
    ),
    accel: tr(
      '推力と空気力による加速度（重力を除く）。衛星・機体が耐えられる大きさに制限します。',
      'Acceleration from thrust and aerodynamics (gravity excluded), limited to what the satellite and vehicle can withstand.',
    ),
    attitude: tr(
      '姿勢角の範囲と、姿勢をどれだけ速く変えてよいか。急な姿勢変更は制御できない前提です。',
      'Allowed attitude angles and how quickly the attitude may change.',
    ),
    altitude: tr(
      '地表やタワーへの余裕、上段の最低高度、フェアリング投棄高度。',
      'Ground clearance, upper-stage minimum altitude and fairing release altitude.',
    ),
    propellant: tr(
      '各段の推進剤の残量・燃焼時間・着火回数。予備推進剤を残すことを要求します。',
      'Residual propellant, burn time and ignitions of each stage. Reserves must remain.',
    ),
    payload: tr(
      '段分離・投棄・衛星分離での質量の受け渡しと、全体の質量収支。',
      'Mass handover at separation, jettison and deployment, and the overall mass balance.',
    ),
    numerical: tr(
      '最適化した制御を独立に積分し直した軌道と最適化の軌道が一致しているか（数値誤差の確認）。',
      'Whether an independent reintegration of the optimized controls reproduces the optimized trajectory (numerical error check).',
    ),
  }[f]
}

const display = (c: PhysicalCheck): { scale: number; unit: string } => {
  if (c.unit === 'Pa') return { scale: 1e-3, unit: 'kPa' }
  if (c.unit === 'm/s^2') return { scale: 1 / 9.80665, unit: 'G' }
  if (
    c.id.startsWith('CLEARANCE') ||
    c.id.startsWith('FAIRING') ||
    c.id === 'ORBIT.perigee_radius' ||
    c.id === 'ORBIT.apogee_radius' ||
    c.id === 'ORBIT.radius'
  )
    return { scale: 1e-3, unit: 'km' }
  if (c.unit === 'deg') return { scale: 1, unit: '°' }
  if (c.unit === 'deg/s') return { scale: 1, unit: '°/s' }
  if (c.unit === 'count') return { scale: 1, unit: tr('回', '') }
  return { scale: 1, unit: c.unit }
}

/**
 * Classify one check. `phaseName` turns a phase index into a readable name;
 * `prescribed` marks phases whose attitude is fixed (vertical rise), whose
 * attitude bounds are therefore never "active".
 */
export function constraintView(
  c: PhysicalCheck,
  phaseName: (i: number) => string,
  prescribed: (i: number) => boolean = () => false,
): ConstraintView {
  const base = c.id.replace(/\[\d+\]$/, '')
  const index = /\[(\d+)\]$/.exec(c.id)
  const n = index ? Number(index[1]) : null
  const stage = (i: number | null) => (i === null ? '' : tr(`第${i + 1}段`, `stage ${i + 1}`))
  const phase = (i: number | null) => (i === null ? '' : phaseName(i))
  let family: ConstraintFamily = 'numerical',
    label = c.id,
    perPhase = false
  switch (base) {
    case 'ORBIT.radius':
      ;[family, label] = ['orbit', tr('投入点の地心距離', 'Insertion radius')]
      break
    case 'ORBIT.speed':
      ;[family, label] = ['orbit', tr('投入速度（円軌道速度）', 'Insertion speed (circular)')]
      break
    case 'ORBIT.radial_velocity':
      ;[family, label] = ['orbit', tr('投入時の上下方向速度', 'Radial velocity at insertion')]
      break
    case 'ORBIT.inclination':
      ;[family, label] = ['orbit', tr('軌道傾斜角', 'Inclination')]
      break
    case 'ORBIT.perigee_radius':
      ;[family, label] = ['orbit', tr('近地点', 'Perigee')]
      break
    case 'ORBIT.apogee_radius':
      ;[family, label] = ['orbit', tr('遠地点', 'Apogee')]
      break
    case 'Q':
      ;[family, label, perPhase] = ['aero', tr('最大動圧', 'Max dynamic pressure'), true]
      break
    case 'AEROLOAD':
      ;[family, label, perPhase] = ['aero', tr('最大迎角', 'Max angle of attack'), true]
      break
    case 'ACCEL':
      ;[family, label, perPhase] = ['accel', tr('最大加速度', 'Max acceleration'), true]
      break
    case 'CLEARANCE':
      ;[family, label, perPhase] = ['altitude', tr('最低高度', 'Minimum altitude'), true]
      break
    case 'FAIRING.release_altitude':
      ;[family, label] = ['altitude', tr('フェアリング投棄高度', 'Fairing release altitude')]
      break
    case 'CONTROL.azimuth':
      ;[family, label, perPhase] = ['attitude', tr('方位角の最小値', 'Minimum azimuth'), true]
      break
    case 'CONTROL.azimuth_max':
      ;[family, label, perPhase] = ['attitude', tr('方位角の最大値', 'Maximum azimuth'), true]
      break
    case 'CONTROL.elevation_min':
      ;[family, label, perPhase] = ['attitude', tr('仰角の最小値', 'Minimum elevation'), true]
      break
    case 'CONTROL.elevation_max':
      ;[family, label, perPhase] = ['attitude', tr('仰角の最大値', 'Maximum elevation'), true]
      break
    case 'CONTROL.azimuth_rate':
      ;[family, label, perPhase] = ['attitude', tr('方位角の変化率', 'Azimuth rate'), true]
      break
    case 'CONTROL.elevation_rate':
      ;[family, label, perPhase] = ['attitude', tr('仰角の変化率', 'Elevation rate'), true]
      break
    case 'CONTROL.inertial_direction_rate':
      ;[family, label, perPhase] = ['attitude', tr('機体軸の回転速度（慣性系）', 'Body-axis rotation rate (inertial)'), true]
      break
    case 'CONTROL.event_continuity':
      ;[family, label] = ['numerical', tr('イベント前後の姿勢の連続性', 'Attitude continuity across events')]
      break
    case 'MASS.reserve':
      ;[family, label] = ['propellant', tr(`${stage(n)}の残推進剤（予備量以上）`, `${stage(n)} residual propellant (≥ reserve)`)]
      break
    case 'ENGINE.on_time':
      ;[family, label] = ['propellant', tr(`${stage(n)}の累積燃焼時間`, `${stage(n)} total burn time`)]
      break
    case 'ENGINE.ignitions':
      ;[family, label] = ['propellant', tr(`${stage(n)}の着火回数`, `${stage(n)} ignitions`)]
      break
    case 'ENGINE.phase_duration':
      ;[family, label, perPhase] = ['propellant', tr('フェーズの継続時間', 'Phase duration'), true]
      break
    case 'MASS.floor':
      ;[family, label, perPhase] = ['payload', tr('機体質量の下限', 'Stack mass floor'), true]
      break
    case 'DEPLOY.net_payload':
      ;[family, label] = ['payload', tr('正味衛星質量の整合', 'Net satellite mass consistency')]
      break
    case 'MASS.global_balance':
    case 'MASS.balance':
      ;[family, label] = ['payload', tr('全体の質量収支', 'Overall mass balance')]
      break
    case 'EVENT.mass_map':
      ;[family, label] = ['payload', tr(`分離・投棄イベント${(n ?? 0) + 1}の質量`, `Mass at event ${(n ?? 0) + 1}`)]
      break
    case 'EVENT.position_continuity':
    case 'EVENT.velocity_continuity':
    case 'MASS.monotonic':
    case 'MASS.integrated_consumption':
      label = {
        'EVENT.position_continuity': tr(`イベント${(n ?? 0) + 1}前後の位置の連続性`, `Position continuity at event ${(n ?? 0) + 1}`),
        'EVENT.velocity_continuity': tr(`イベント${(n ?? 0) + 1}前後の速度の連続性`, `Velocity continuity at event ${(n ?? 0) + 1}`),
        'MASS.monotonic': tr(`${phase(n)}：質量が増えないこと`, `${phase(n)}: mass never increases`),
        'MASS.integrated_consumption': tr(`${stage(n)}の推進剤消費の積分整合`, `${stage(n)} integrated propellant consumption`),
      }[base]
      break
    case 'DYN.mass':
      label = tr('再積分との質量差', 'Reintegration mass difference')
      break
    case 'DYN.position':
      label = tr('再積分との位置差', 'Reintegration position difference')
      break
    case 'DYN.velocity':
      label = tr('再積分との速度差', 'Reintegration velocity difference')
      break
    case 'RK45.mass':
    case 'RK45.position':
    case 'RK45.velocity':
      label = tr(
        `より細かい積分との${base.endsWith('mass') ? '質量' : base.endsWith('position') ? '位置' : '速度'}差`,
        `Tighter-integration ${base.split('.')[1]} difference`,
      )
      break
  }
  if (perPhase && n !== null) label = `${label} · ${phase(n)}`
  const { scale, unit } = display(c)
  const value = c.value * scale,
    lower = c.lower === null ? null : c.lower * scale,
    upper = c.upper === null ? null : c.upper * scale
  const equality = c.lower !== null && c.upper !== null && c.lower === c.upper
  const slack =
    c.upper !== null && c.lower === null
      ? c.upper - c.value
      : c.lower !== null && c.upper === null
        ? c.value - c.lower
        : c.lower !== null && c.upper !== null
          ? Math.min(c.value - c.lower, c.upper - c.value)
          : Infinity
  // Share of the limit used: 1 at the nearest bound, 0 when the slack is as large as that bound.
  const nearest = c.lower !== null && c.upper !== null ? (c.value - c.lower <= c.upper - c.value ? c.lower : c.upper) : (c.upper ?? c.lower)
  const usage =
    equality || family === 'numerical' || family === 'payload' || nearest === null || !Number.isFinite(slack)
      ? null
      : 1 - Math.min(1, Math.max(0, slack / Math.max(Math.abs(nearest), 1e-12)))
  const scaleRef = Math.max(Math.abs(c.upper ?? 0), Math.abs(c.lower ?? 0), 1e-12)
  const active =
    !equality &&
    family !== 'numerical' &&
    family !== 'payload' &&
    base !== 'ENGINE.ignitions' &&
    !(family === 'attitude' && n !== null && prescribed(n)) &&
    // Elevation starts at 90° after the vertical rise, and the launch pad sits at the
    // altitude floor: being "at" these bounds says nothing about the payload.
    !(base === 'CONTROL.elevation_max' && c.upper === 90) &&
    !(base === 'CLEARANCE' && c.lower !== null && c.value - c.lower <= Math.max(c.tolerance, 1) && n === 0) &&
    slack <= Math.max(c.tolerance, 2e-3 * scaleRef)
  return { check: c, family, label, phase: perPhase ? n : null, value, lower, upper, unit, usage, active, equality }
}

export const FAMILY_ORDER: ConstraintFamily[] = ['orbit', 'aero', 'accel', 'attitude', 'altitude', 'propellant', 'payload', 'numerical']
