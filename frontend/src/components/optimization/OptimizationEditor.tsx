import { useContext } from 'react'
import { tr } from '../../lib/i18n'
import type { EditorSection, MultiStageInput, OptimizationInput, SingleStageInput } from '../../lib/optimization-input'
import { isRocketInput, phaseViews } from '../../lib/optimization-input'
import { cn } from '../../lib/cn'
import { OptBounds, OptGroup, OptNumber, OptText, OptimizationEditorContext } from './controls'
import { SequenceTimeline } from './SequenceTimeline'

export function editorSections(): { id: EditorSection; label: string; description: string }[] {
  return [
    { id: 'mission', label: tr('ミッション', 'Mission'), description: tr('目標・発射条件', 'Target and launch') },
    { id: 'vehicle', label: tr('機体・質量', 'Vehicle and mass'), description: tr('内訳・エンジン', 'Inventory and engines') },
    { id: 'sequence', label: tr('シーケンス', 'Sequence'), description: tr('フェーズ・時間', 'Phases and durations') },
    { id: 'constraints', label: tr('制約', 'Constraints'), description: tr('荷重・制御・予備量', 'Loads and guidance') },
    { id: 'numerics', label: tr('数値設定', 'Numerics'), description: tr('メッシュ・検証精度', 'Mesh and tolerances') },
    { id: 'json', label: tr('JSON・詳細', 'JSON and details'), description: tr('全設定を直接編集', 'Edit the full input') },
  ]
}
const grid = 'grid gap-4 sm:grid-cols-2'
type Rocket = MultiStageInput | SingleStageInput

export function OptimizationEditor({
  input,
  section,
  onSection,
}: {
  input: OptimizationInput
  section: EditorSection
  onSection: (section: EditorSection) => void
}) {
  const p = input.problem
  if (!isRocketInput(p)) {
    if (p.kind === 'double_integrator')
      return (
        <OptGroup
          title={tr('二重積分器の設定', 'Double-integrator settings')}
          note={tr(
            '重力・空力・推進剤を含まない数値ベンチマークです。',
            'A numerical benchmark without gravity, aerodynamics or propellant.',
          )}
        >
          <div className={grid}>
            <OptNumber path="problem.distance_m" label={tr('移動距離', 'Distance')} value={p.distance_m} unit="m" />
            <OptNumber path="problem.time_cost" label={tr('時間コスト', 'Time cost')} value={p.time_cost} />
          </div>
          <OptBounds path="problem.duration_s" label={tr('終端時刻', 'Final time')} value={p.duration_s} unit="s" />
          <div className={grid}>
            <OptNumber path="problem.intervals" label={tr('区間数', 'Intervals')} value={p.intervals} integer />
            <OptNumber path="problem.degree" label={tr('次数', 'Degree')} value={p.degree} integer />
          </div>
          <SolverFields input={input} />
        </OptGroup>
      )
    return (
      <OptGroup
        title={p.kind === 'zero' ? tr('ZEROのテンプレート', 'ZERO template') : tr('HS071の接続試験', 'HS071 connection benchmark')}
        note={
          p.kind === 'zero'
            ? tr(
                '機体・運用データと対応する転写の準備が必要です。現在は実行できません。仮定した2段機のプリセットで最適化を試せます。',
                'Vehicle/operations data and a matching transcription are required. Select the assumed two-stage preset to try optimization.',
              )
            : tr('既知解を持つ小さな制約付き問題でソルバーを確認します。', 'A small constrained problem with a known solution.')
        }
      >
        {p.kind === 'hs071' ? <SolverFields input={input} /> : null}
        <button type="button" className="text-[12px] underline" onClick={() => onSection('json')}>
          {tr('JSONを確認', 'Inspect JSON')}
        </button>
      </OptGroup>
    )
  }
  return (
    <div className="space-y-4">
      {section === 'mission' ? <MissionFields p={p} /> : null}
      {section === 'vehicle' ? <VehicleFields p={p} /> : null}
      {section === 'sequence' ? <SequenceFields p={p} /> : null}
      {section === 'constraints' ? <ConstraintFields p={p} /> : null}
      {section === 'numerics' ? <NumericalFields input={input} p={p} /> : null}
    </div>
  )
}
function MissionFields({ p }: { p: Rocket }) {
  return (
    <>
      <OptGroup
        title={tr('ミッション', 'Mission')}
        note={
          p.kind === 'multi_stage'
            ? tr(
                '正味衛星質量を最大化し、衛星分離後の接触軌道を目標にします。機体諸元は数値実証用の仮定です。',
                'Maximize net satellite mass at the osculating orbit after deployment. Vehicle data are demonstration assumptions.',
              )
            : tr(
                '基体乾燥質量とは別に運ぶ追加ペイロードを最大化します。',
                'Maximize additional payload carried separately from the base dry mass.',
              )
        }
      >
        <OptText path="problem.vehicle.name" label={tr('ケース名', 'Case name')} value={p.vehicle.name} />
        {p.kind === 'multi_stage' ? (
          <>
            <div className={grid}>
              <OptNumber
                path="problem.orbit.altitude_m"
                label={tr('円軌道の目標高度', 'Target circular-orbit altitude')}
                value={p.orbit.altitude_m}
                scale={1000}
                unit="km"
              />
              <OptNumber
                path="problem.orbit.inclination_deg"
                label={tr('軌道傾斜角', 'Inclination')}
                value={p.orbit.inclination_deg}
                unit="°"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-ink-3">
              {tr(
                `軌道高度の基準半径は ${p.orbit.reference_radius_m.toLocaleString()} m。RAAN・軌道上位相は自由です。大気と地表への余裕にはWGS84測地高度を使います。`,
                `Orbit altitude uses a ${p.orbit.reference_radius_m.toLocaleString()} m reference radius. RAAN and orbital phase are free; atmosphere and clearance use WGS84 geodetic altitude.`,
              )}
            </p>
            <OptBounds path="problem.net_payload_kg" label={tr('正味衛星質量', 'Net satellite mass')} value={p.net_payload_kg} unit="kg" />
          </>
        ) : (
          <>
            <div className={grid}>
              <OptNumber
                path="problem.target_apogee_altitude_m"
                label={tr('目標頂点高度（WGS84測地高度）', 'Target apogee (WGS84 geodetic altitude)')}
                value={p.target_apogee_altitude_m}
                scale={1000}
                unit="km"
              />
              <OptNumber
                path="problem.minimum_downrange_m"
                label={tr('射向への最小地表投影距離', 'Minimum ground projection along azimuth')}
                value={p.minimum_downrange_m}
                scale={1000}
                unit="km"
              />
            </div>
            <OptBounds
              path="problem.additional_payload_kg"
              label={tr('追加ペイロード', 'Additional payload')}
              value={p.additional_payload_kg}
              unit="kg"
            />
          </>
        )}
      </OptGroup>
      <OptGroup title={tr('発射条件', 'Launch conditions')}>
        <div className={grid}>
          <OptNumber
            path="problem.vehicle.launch.latitude_deg"
            label={tr('緯度', 'Latitude')}
            value={p.vehicle.launch.latitude_deg}
            unit="°"
          />
          <OptNumber
            path="problem.vehicle.launch.longitude_deg"
            label={tr('経度', 'Longitude')}
            value={p.vehicle.launch.longitude_deg}
            unit="°"
          />
        </div>
        <div className={grid}>
          <OptNumber
            path="problem.vehicle.launch.altitude_m"
            label={tr('発射地点の標高', 'Launch-site altitude')}
            value={p.vehicle.launch.altitude_m ?? 0}
            unit="m"
          />
          <OptText
            path="problem.vehicle.launch.time_utc"
            label={tr('打上げ日時（タイムゾーン付き）', 'Launch date/time (with timezone)')}
            value={p.vehicle.launch.time_utc ?? '2000-01-01T00:00:00Z'}
            hint={tr('例：2026-10-19T00:00:00Z（ZはUTC）', 'Example: 2026-10-19T00:00:00Z (Z means UTC)')}
          />
        </div>
        {p.kind === 'single_stage' ? (
          <OptNumber path="problem.azimuth_deg" label={tr('固定する発射方位角', 'Fixed launch azimuth')} value={p.azimuth_deg} unit="°" />
        ) : null}
      </OptGroup>
      <OptGroup
        title={tr('データの根拠', 'Data provenance')}
        note={tr(
          '公開仕様・仮定・未確定値を区別できるよう、入力と一緒に記録します。',
          'Record published specifications, assumptions and unresolved values with the input.',
        )}
      >
        <OptText path="problem.data_source" label={tr('出典・仮定', 'Sources and assumptions')} value={p.data_source} multiline />
      </OptGroup>
    </>
  )
}
function VehicleFields({ p }: { p: Rocket }) {
  return (
    <>
      <OptGroup
        title={tr('打上げ時の質量内訳', 'Launch mass inventory')}
        note={tr(
          '段の全備質量は乾燥質量と搭載推進剤から自動で同期します。予備量は搭載推進剤の内数です。',
          'Stage wet mass is synchronized from dry mass and loaded propellant. Reserve is part of loaded propellant.',
        )}
      >
        <MassInventory p={p} />
        {p.kind === 'multi_stage' ? (
          <div className={grid}>
            <OptNumber
              path="problem.payload_adapter_kg"
              label={tr('PAF・衛星分離機構', 'PAF and deployment hardware')}
              value={p.payload_adapter_kg}
              unit="kg"
            />
            <OptNumber path="problem.fairing_kg" label={tr('フェアリング', 'Fairing')} value={p.fairing_kg} unit="kg" />
          </div>
        ) : (
          <div className={grid}>
            <OptNumber
              path="problem.dry_mass_kg"
              label={tr('基体乾燥質量（既存搭載物を含む）', 'Base dry mass (including existing payload)')}
              value={p.dry_mass_kg}
              unit="kg"
            />
            <OptNumber
              path="problem.propellant_mass_kg"
              label={tr('搭載推進剤', 'Loaded propellant')}
              value={p.propellant_mass_kg}
              unit="kg"
            />
            <OptNumber
              path="problem.reserve_propellant_kg"
              label={tr('予備推進剤', 'Propellant reserve')}
              value={p.reserve_propellant_kg}
              unit="kg"
            />
          </div>
        )}
      </OptGroup>
      {p.vehicle.stages.map((stage, i) => (
        <OptGroup key={i} title={tr(`第${i + 1}段`, `Stage ${i + 1}`)}>
          {p.kind === 'multi_stage' && p.stages[i] ? (
            <>
              <div className={grid}>
                <OptNumber path={`problem.stages.${i}.dry_kg`} label={tr('乾燥質量', 'Dry mass')} value={p.stages[i].dry_kg} unit="kg" />
                <OptNumber
                  path={`problem.stages.${i}.propellant_kg`}
                  label={tr('搭載推進剤', 'Loaded propellant')}
                  value={p.stages[i].propellant_kg}
                  unit="kg"
                />
              </div>
              <div className={grid}>
                <OptNumber
                  path={`problem.stages.${i}.reserve_kg`}
                  label={tr('予備推進剤', 'Propellant reserve')}
                  value={p.stages[i].reserve_kg}
                  unit="kg"
                />
                <OptNumber
                  path={`problem.stages.${i}.max_ignitions`}
                  label={tr('最大着火回数', 'Maximum ignitions')}
                  value={p.stages[i].max_ignitions}
                  integer
                />
              </div>
              <OptNumber
                path={`problem.stages.${i}.max_total_burn_s`}
                label={tr('最大累積燃焼時間', 'Maximum cumulative burn time')}
                value={p.stages[i].max_total_burn_s}
                unit="s"
              />
            </>
          ) : null}
          {stage.engine ? (
            <div className={grid}>
              {typeof stage.engine.thrust_vac_n === 'number' ? (
                <OptNumber
                  path={`problem.vehicle.stages.${i}.engine.thrust_vac_n`}
                  label={tr('真空推力', 'Vacuum thrust')}
                  value={stage.engine.thrust_vac_n}
                  unit="kN"
                  scale={1000}
                />
              ) : null}
              {typeof stage.engine.isp_vac_s === 'number' ? (
                <OptNumber
                  path={`problem.vehicle.stages.${i}.engine.isp_vac_s`}
                  label={tr('真空比推力', 'Vacuum specific impulse')}
                  value={stage.engine.isp_vac_s}
                  unit="s"
                />
              ) : null}
              <OptNumber
                path={`problem.vehicle.stages.${i}.engine.nozzle_exit_area_m2`}
                label={tr('ノズル出口面積', 'Nozzle exit area')}
                value={stage.engine.nozzle_exit_area_m2 ?? 0}
                unit="m²"
              />
              {p.kind === 'single_stage' ? (
                <OptNumber
                  path="problem.vehicle.stages.0.engine.burn_end_s"
                  label={tr('固定燃焼時間', 'Fixed burn duration')}
                  value={stage.engine.burn_end_s}
                  unit="s"
                />
              ) : null}
              <OptNumber
                path={`problem.vehicle.stages.${i}.aero.diameter_m`}
                label={tr('空力参照直径', 'Aerodynamic reference diameter')}
                value={stage.aero?.diameter_m ?? 0.5}
                unit="m"
              />
            </div>
          ) : (
            <p className="text-[12px] text-danger">
              {tr(
                'エンジン設定が必要です。JSONで入力するかプリセットを読み込んでください。',
                'An engine is required. Edit JSON or load a preset.',
              )}
            </p>
          )}
          {p.kind === 'multi_stage' && p.stages[i] ? (
            <OptText
              path={`problem.stages.${i}.source`}
              label={tr('この段の出典・仮定', 'Stage source and assumptions')}
              value={p.stages[i].source}
              multiline
            />
          ) : null}
        </OptGroup>
      ))}
    </>
  )
}
function SequenceFields({ p }: { p: Rocket }) {
  const ctx = useContext(OptimizationEditorContext),
    phases = phaseViews(p)
  return (
    <>
      <OptGroup
        title={tr('飛行シーケンス', 'Flight sequence')}
        note={tr(
          'タイムラインは初期推定の時刻です。最適化する時間は下限・上限で指定します。段とイベントの順序はプリセットの構成を保持します。',
          'The timeline shows initial-guess times. Set bounds for optimized durations. Stage and event order retain the preset topology.',
        )}
      >
        <SequenceTimeline phases={phases} />
      </OptGroup>
      {p.kind === 'multi_stage' ? (
        p.phases.map((phase, i) => (
          <OptGroup
            key={i}
            title={
              <span className="flex flex-wrap items-center gap-2">
                <span className="num text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                {phase.name}
                <span className="text-[11px] font-normal text-ink-3">
                  {tr(`第${phase.stage + 1}段`, `Stage ${phase.stage + 1}`)} ·{' '}
                  {phase.mode === 'burn' ? tr('燃焼', 'Burn') : tr('惰行', 'Coast')}
                </span>
              </span>
            }
          >
            <OptText path={`problem.phases.${i}.name`} label={tr('フェーズ名', 'Phase name')} value={phase.name} />
            <OptBounds
              path={`problem.phases.${i}.duration_s`}
              label={tr('継続時間', 'Duration')}
              value={phase.duration_s}
              unit="s"
              fixedOnly={phase.vertical}
            />
            <p className="text-[11px] text-ink-3">
              {tr('終了イベント', 'End event')}: {endEventLabel(phase.end_event)}
              {phase.vertical ? ` · ${tr('垂直姿勢で固定', 'Fixed vertical attitude')}` : ''}
            </p>
          </OptGroup>
        ))
      ) : (
        <OptGroup title={tr('燃焼・惰行時間', 'Burn and coast durations')}>
          <OptNumber
            path="problem.vertical_ascent_s"
            label={tr('初期の垂直上昇時間', 'Initial vertical ascent')}
            value={p.vertical_ascent_s}
            unit="s"
          />
          <OptBounds
            path="problem.coast_duration_s"
            label={tr('頂点までの惰行時間', 'Coast to apogee')}
            value={p.coast_duration_s}
            unit="s"
          />
        </OptGroup>
      )}
      <p className="text-[11px] leading-relaxed text-ink-3">
        {tr(
          'フェーズ構成を直接変更する場合はJSON・詳細を使ってください。変更後も段の順序・着火回数・質量内訳を検査します。',
          'Use JSON and details to edit phase topology. Stage order, ignition counts and inventory are still checked.',
        )}
      </p>
      {ctx.disabled ? (
        <p className="text-[11px] text-ink-3">{tr('実行中の入力は固定されています。', 'Inputs are frozen during the run.')}</p>
      ) : null}
    </>
  )
}
function ConstraintFields({ p }: { p: Rocket }) {
  return (
    <>
      <OptGroup
        title={tr('荷重と制御の上限', 'Load and guidance limits')}
        note={tr(
          '物理上限と、数値誤差の許容値は別々に設定します。必須の制約をオフにする操作はありません。',
          'Physical limits are separate from numerical tolerances. Required constraints stay enabled.',
        )}
      >
        <OptNumber
          path="problem.max_dynamic_pressure_pa"
          label={tr('最大動圧', 'Maximum dynamic pressure')}
          value={p.max_dynamic_pressure_pa}
          scale={1000}
          unit="kPa"
        />
        {p.kind === 'multi_stage' ? (
          <>
            <div className={grid}>
              <OptNumber
                path="problem.max_azimuth_rate_deg_s"
                label={tr('最大方位角レート', 'Maximum azimuth rate')}
                value={p.max_azimuth_rate_deg_s}
                unit="°/s"
              />
              <OptNumber
                path="problem.max_elevation_rate_deg_s"
                label={tr('最大仰角レート', 'Maximum elevation rate')}
                value={p.max_elevation_rate_deg_s}
                unit="°/s"
              />
            </div>
            <OptNumber
              path="problem.max_inertial_direction_rate_deg_s"
              label={tr('ECI機体軸の最大変化率', 'Maximum inertial body-axis rate')}
              value={p.max_inertial_direction_rate_deg_s}
              unit="°/s"
            />
            <div className={grid}>
              {[0, 1].map((axis) => (
                <OptNumber
                  key={axis}
                  path={`problem.azimuth_bounds_deg.${axis}`}
                  label={axis === 0 ? tr('方位角の下限', 'Minimum azimuth') : tr('方位角の上限', 'Maximum azimuth')}
                  value={p.azimuth_bounds_deg[axis]}
                  unit="°"
                />
              ))}
            </div>
            <OptNumber
              path="problem.elevation_bounds_deg.0"
              label={tr('仰角の下限（上限は90°）', 'Minimum elevation (maximum 90°)')}
              value={p.elevation_bounds_deg[0]}
              unit="°"
            />
          </>
        ) : (
          <>
            <div className={grid}>
              <OptNumber
                path="problem.max_angle_of_attack_deg"
                label={tr('最大迎角', 'Maximum angle of attack')}
                value={p.max_angle_of_attack_deg}
                unit="°"
              />
              <OptNumber
                path="problem.max_specific_force_m_s2"
                label={tr('最大比力（非重力）', 'Maximum specific force (nongravitational)')}
                value={p.max_specific_force_m_s2}
                unit="m/s²"
              />
            </div>
            <div className={grid}>
              <OptNumber
                path="problem.max_pitch_rate_deg_s"
                label={tr('最大仰角レート', 'Maximum elevation rate')}
                value={p.max_pitch_rate_deg_s}
                unit="°/s"
              />
              <OptNumber
                path="problem.minimum_pitch_deg"
                label={tr('仰角の下限', 'Minimum elevation')}
                value={p.minimum_pitch_deg}
                unit="°"
              />
            </div>
          </>
        )}
      </OptGroup>
      {p.kind === 'multi_stage' ? (
        <>
          {p.phases.map((phase, i) => (
            <OptGroup
              key={i}
              title={phase.name}
              note={tr(
                `第${phase.stage + 1}段の${phase.mode === 'burn' ? '燃焼' : '惰行'}に適用`,
                `Applied to stage ${phase.stage + 1} ${phase.mode}`,
              )}
            >
              <div className={grid}>
                <OptNumber
                  path={`problem.phases.${i}.max_angle_of_attack_deg`}
                  label={tr('最大迎角', 'Maximum angle of attack')}
                  value={phase.max_angle_of_attack_deg}
                  unit="°"
                />
                <OptNumber
                  path={`problem.phases.${i}.max_specific_force_m_s2`}
                  label={tr('最大比力', 'Maximum specific force')}
                  value={phase.max_specific_force_m_s2}
                  unit="m/s²"
                />
                <OptNumber
                  path={`problem.phases.${i}.min_altitude_m`}
                  label={tr('最低測地高度', 'Minimum geodetic altitude')}
                  value={phase.min_altitude_m}
                  scale={1000}
                  unit="km"
                />
              </div>
            </OptGroup>
          ))}
          <OptGroup
            title={tr('フェアリング投棄', 'Fairing jettison')}
            note={tr(
              '高度条件と空力面積の切替だけを扱います。熱流束・積算熱量は未評価です。',
              'Only release altitude and the aerodynamic area change are modeled. Thermal flux and heating remain unevaluated.',
            )}
          >
            <div className={grid}>
              <OptNumber
                path="problem.fairing_release_min_altitude_m"
                label={tr('投棄できる最低測地高度', 'Minimum release geodetic altitude')}
                value={p.fairing_release_min_altitude_m}
                scale={1000}
                unit="km"
              />
              <OptNumber
                path="problem.fairing_off_area_scale"
                label={tr('投棄後の空力面積倍率', 'Aerodynamic area scale after release')}
                value={p.fairing_off_area_scale}
                unit="×"
              />
            </div>
          </OptGroup>
        </>
      ) : null}
      <OptGroup
        title={tr('未評価の条件', 'Unevaluated conditions')}
        note={tr(
          '熱・落下域・分離時の相対運動・6DoF・再着火資源は、この最適化の合否に含めていません。',
          'Thermal effects, landing regions, relative separation motion, 6DoF and restart resources are outside this assessment.',
        )}
      >
        <p className="text-[12px] text-ink-2">
          {tr(
            '入力値を追加するだけで評価済みに変えることはできません。対応するモデル・データが必要です。',
            'Adding input values does not make these evaluated. Matching models and data are required.',
          )}
        </p>
      </OptGroup>
    </>
  )
}
function NumericalFields({ input, p }: { input: OptimizationInput; p: Rocket }) {
  return (
    <>
      <OptGroup
        title={tr('メッシュ', 'Mesh')}
        note={tr(
          '区間数や次数を変更した結果は、同じ物理設定の別実行として比較できます。',
          'Compare different meshes as separate runs of the same physical problem.',
        )}
      >
        <OptNumber path="problem.degree" label={tr('各区間の次数（3〜8）', 'Degree per interval (3–8)')} value={p.degree} integer />
        <div className={grid}>
          {p.kind === 'multi_stage' ? (
            p.phases.map((phase, i) => (
              <OptNumber
                key={i}
                path={`problem.phases.${i}.intervals`}
                label={`${phase.name} · ${tr('区間数', 'intervals')}`}
                value={phase.intervals}
                integer
              />
            ))
          ) : (
            <>
              <OptNumber
                path="problem.burn_intervals"
                label={tr('燃焼の区間数（垂直区間を除く）', 'Burn intervals (excluding vertical ascent)')}
                value={p.burn_intervals}
                integer
              />
              <OptNumber path="problem.coast_intervals" label={tr('惰行の区間数', 'Coast intervals')} value={p.coast_intervals} integer />
            </>
          )}
        </div>
      </OptGroup>
      <OptGroup
        title={tr('初期推定', 'Initial guess')}
        note={tr(
          '最適解を入力する必要はありません。初期の質量・時間・姿勢から軌道を生成します。',
          'No known optimum is required. The initial mass, time and attitude generate a starting trajectory.',
        )}
      >
        {p.kind === 'multi_stage' ? (
          <>
            <OptNumber
              path="problem.initial_azimuth_deg"
              label={tr('初期の方位角', 'Initial azimuth')}
              value={p.initial_azimuth_deg}
              unit="°"
            />
            {p.phases
              .filter((phase) => !phase.vertical)
              .map((phase) => {
                const i = p.phases.indexOf(phase)
                return (
                  <div key={i} className="space-y-2 border-t border-line pt-3">
                    <p className="text-[12px] font-medium text-ink-2">{phase.name}</p>
                    <div className={grid}>
                      <OptNumber
                        path={`problem.phases.${i}.initial_attitude_end_deg.0`}
                        label={tr('終端方位角の初期値', 'Initial endpoint azimuth')}
                        value={phase.initial_attitude_end_deg[0]}
                        unit="°"
                      />
                      <OptNumber
                        path={`problem.phases.${i}.initial_attitude_end_deg.1`}
                        label={tr('終端仰角の初期値', 'Initial endpoint elevation')}
                        value={phase.initial_attitude_end_deg[1]}
                        unit="°"
                      />
                    </div>
                  </div>
                )
              })}
          </>
        ) : (
          <OptNumber
            path="problem.initial_pitch_end_deg"
            label={tr('燃焼終端の仰角初期値', 'Initial burn-end elevation')}
            value={p.initial_pitch_end_deg}
            unit="°"
          />
        )}
      </OptGroup>
      <OptGroup title={tr('ソルバー', 'Solver')}>
        <SolverFields input={input} />
        <OptNumber
          path="problem.vehicle.simulation.end_time_s"
          label={tr('計算時間の上限', 'Simulation time horizon')}
          value={p.vehicle.simulation.end_time_s}
          unit="s"
        />
      </OptGroup>
      <OptGroup
        title={tr('独立再積分の数値許容値', 'Independent integration tolerances')}
        note={tr(
          '物理上限を緩和する設定ではありません。求解の収束と、SI単位での再積分検証を分けて判定します。',
          'These are numerical tolerances, not physical limit changes. Solver convergence and SI validation are assessed separately.',
        )}
      >
        <div className={grid}>
          {(
            [
              ['position_m', tr('位置', 'Position'), 'm'],
              ['velocity_m_s', tr('速度', 'Velocity'), 'm/s'],
              ['mass_kg', tr('質量', 'Mass'), 'kg'],
              ['dynamic_pressure_pa', tr('動圧', 'Dynamic pressure'), 'Pa'],
              ['angle_of_attack_deg', tr('迎角', 'Angle of attack'), '°'],
              ['specific_force_m_s2', tr('比力', 'Specific force'), 'm/s²'],
              ['pitch_rate_deg_s', tr('制御レート', 'Guidance rate'), '°/s'],
            ] as const
          ).map(([key, label, unit]) => (
            <OptNumber key={key} path={`problem.validation.${key}`} label={label} unit={unit} value={p.validation[key]} />
          ))}
        </div>
        {p.kind === 'multi_stage' ? (
          <details>
            <summary className="cursor-pointer text-[12px] text-ink-2">{tr('投入条件の数値許容値', 'Orbit-insertion tolerances')}</summary>
            <div className={cn(grid, 'mt-3')}>
              {(
                [
                  ['radius_tolerance_m', tr('半径', 'Radius'), 'm'],
                  ['speed_tolerance_m_s', tr('速度', 'Speed'), 'm/s'],
                  ['radial_velocity_tolerance_m_s', tr('半径方向速度', 'Radial speed'), 'm/s'],
                  ['inclination_tolerance_deg', tr('傾斜角', 'Inclination'), '°'],
                  ['apsis_tolerance_m', tr('近地点・遠地点半径', 'Apsis radius'), 'm'],
                ] as const
              ).map(([key, label, unit]) => (
                <OptNumber key={key} path={`problem.orbit.${key}`} label={label} value={p.orbit[key]} unit={unit} />
              ))}
            </div>
          </details>
        ) : null}
      </OptGroup>
    </>
  )
}
function SolverFields({ input }: { input: OptimizationInput }) {
  const ctx = useContext(OptimizationEditorContext)
  return (
    <>
      <div className={grid}>
        <OptNumber
          path="solver.max_iterations"
          label={tr('最大反復数', 'Maximum iterations')}
          value={input.solver?.max_iterations ?? 300}
          integer
        />
        <OptNumber
          path="solver.tolerance"
          label={tr('NLPの収束許容値', 'NLP convergence tolerance')}
          value={input.solver?.tolerance ?? 1e-8}
        />
      </div>
      <label className="flex min-h-9 items-center gap-2 text-[12px] text-ink-2">
        <input
          type="checkbox"
          checked={input.solver?.derivative_test ?? false}
          disabled={ctx.disabled}
          onChange={(event) => ctx.edit('solver.derivative_test', event.target.checked)}
          className="accent-[var(--signal)]"
        />
        {tr('求解前に一次微分検査を実行', 'Run the first-order derivative checker')}
      </label>
    </>
  )
}
export function MassInventory({ p }: { p: Rocket }) {
  const dry = p.kind === 'multi_stage' ? p.stages.reduce((n, s) => n + s.dry_kg, 0) : p.dry_mass_kg
  const prop = p.kind === 'multi_stage' ? p.stages.reduce((n, s) => n + s.propellant_kg, 0) : p.propellant_mass_kg
  const payload = p.kind === 'multi_stage' ? p.net_payload_kg.initial : p.additional_payload_kg.initial
  const hardware = p.kind === 'multi_stage' ? p.payload_adapter_kg + p.fairing_kg : 0
  const parts = [
    { label: tr('乾燥', 'Dry'), value: dry, color: 'var(--ink-3)' },
    { label: tr('推進剤', 'Propellant'), value: prop, color: 'var(--stage-2)' },
    { label: tr('衛星・追加荷重', 'Satellite / extra payload'), value: payload, color: 'var(--signal)' },
    { label: tr('PAF・フェアリング', 'PAF / fairing'), value: hardware, color: 'var(--stage-3)' },
  ]
  const total = dry + prop + payload + hardware
  return (
    <div>
      <p className="mb-2 text-[12px] text-ink-2">
        {tr('初期推定の全備質量', 'Initial-guess launch mass')}{' '}
        <strong className="num ml-2 text-[16px] font-medium text-ink">
          {total.toLocaleString(undefined, { maximumFractionDigits: 3 })} <span className="text-[11px] font-normal">kg</span>
        </strong>
      </p>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        {parts.map((part) => (
          <span
            key={part.label}
            style={{ width: `${(Math.max(0, part.value) / Math.max(1, total)) * 100}%`, backgroundColor: part.color }}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
        {parts.map((part) => (
          <div key={part.label} className="flex flex-wrap justify-between gap-1">
            <dt className="text-ink-3">{part.label}</dt>
            <dd className="num text-ink-2">{part.value.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
export function endEventLabel(event: string): string {
  const labels: Record<string, string> = {
    none: tr('なし', 'None'),
    separate_stage: tr('段分離', 'Stage separation'),
    jettison_fairing: tr('フェアリング投棄', 'Fairing jettison'),
    deploy_payload: tr('衛星分離', 'Payload deployment'),
  }
  return labels[event] ?? event
}
