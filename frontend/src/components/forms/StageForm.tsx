import { useState } from 'react'
import { Button, Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui'
import { NumberField, SelectField, SwitchField, EditableTable, type Column } from '../shared'
import { MAX_STAGE_COUNT, POWER_MODE_OPTIONS, FREE_MODE_OPTIONS, createDefaultStage, cloneStage } from '../../config/defaults'
import type { ClientConfig, ClientStageConfig, ClientTimeSample } from '../../lib/simulation'

function detectHasVariations(config: ClientConfig): boolean {
  return config.stages?.some(stage =>
    (stage.thrust_profile?.length || 0) > 0 || (stage.isp_profile?.length || 0) > 0
  ) || false
}

function snapshotStages(config: ClientConfig): ClientStageConfig[] {
  return config.stages?.map(stage => cloneStage(stage)) || []
}

interface StageFormProps {
  config: ClientConfig
  setConfig: (config: ClientConfig) => void
  issuesSet: Set<string>
  makeFieldRef: (field?: string) => (el: HTMLElement | null) => void
  openStageIds: string[]
  setOpenStageIds: (ids: string[]) => void
  showVariations: boolean
  setShowVariations: (show: boolean) => void
}

const stageAccentPalette = ['#1d4ed8', '#047857', '#ea580c', '#7c3aed']

export function StageForm({
  config,
  setConfig,
  issuesSet,
  makeFieldRef,
  openStageIds,
  setOpenStageIds,
  showVariations,
  setShowVariations
}: StageFormProps) {
  const hasVariations = detectHasVariations(config)

  const stages = config.stages || []

  // State to track which stages are using profiles
  const [useThrustProfile, setUseThrustProfile] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {}
    stages.forEach((stage, index) => {
      initial[index] = (stage.thrust_profile?.length || 0) > 0
    })
    return initial
  })

  const [useIspProfile, setUseIspProfile] = useState<Record<number, boolean>>(() => {
    const initial: Record<number, boolean> = {}
    stages.forEach((stage, index) => {
      initial[index] = (stage.isp_profile?.length || 0) > 0
    })
    return initial
  })

  const addStage = () => {
    if (stages.length >= MAX_STAGE_COUNT) return
    const newStage = createDefaultStage()
    const newStages = [...stages, newStage]
    setConfig({ ...config, stages: newStages })
    setOpenStageIds([...openStageIds, `stage-${stages.length}`])

    // Initialize profile state for new stage
    setUseThrustProfile(prev => ({ ...prev, [stages.length]: false }))
    setUseIspProfile(prev => ({ ...prev, [stages.length]: false }))
  }

  const removeStage = (index: number) => {
    if (stages.length <= 1) return
    const newStages = stages.filter((_, i) => i !== index)
    setConfig({ ...config, stages: newStages })
    setOpenStageIds(openStageIds.filter(id => id !== `stage-${index}`))

    // Clean up profile state for removed stage
    const newThrustProfile = { ...useThrustProfile }
    const newIspProfile = { ...useIspProfile }
    delete newThrustProfile[index]
    delete newIspProfile[index]

    // Reindex remaining stages
    for (let i = index + 1; i < stages.length; i++) {
      newThrustProfile[i - 1] = newThrustProfile[i]
      newIspProfile[i - 1] = newIspProfile[i]
      delete newThrustProfile[i]
      delete newIspProfile[i]
    }

    setUseThrustProfile(newThrustProfile)
    setUseIspProfile(newIspProfile)
  }

  const updateStage = (index: number, updates: Partial<ClientStageConfig>) => {
    const newStages = stages.map((stage, i) =>
      i === index ? { ...stage, ...updates } : stage
    )
    setConfig({ ...config, stages: newStages })
  }

  const thrustColumns: Column<ClientTimeSample>[] = [
    { key: 'time', label: '時間 (s)', step: '0.1', min: 0 },
    { key: 'value', label: '推力 (N)', step: '1', min: 0 },
  ]

  const ispColumns: Column<ClientTimeSample>[] = [
    { key: 'time', label: '時間 (s)', step: '0.1', min: 0 },
    { key: 'value', label: 'Isp (s)', step: '1', min: 1 },
  ]

  return (
    <div className="section-shell space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3>ステージ構成</h3>
          <p className="text-sm text-slate-600">ロケットステージと性能プロファイルを設定してください。</p>
        </div>
        <div className="flex gap-2">
          {hasVariations && (
            <SwitchField
              id="show-variations"
              label="プロファイル表示"
              checked={showVariations}
              onCheckedChange={setShowVariations}
            />
          )}
          {stages.length < MAX_STAGE_COUNT && (
            <Button type="button" variant="outline" onClick={addStage}>
              ステージを追加
            </Button>
          )}
        </div>
      </div>

      <Accordion
        type="multiple"
        value={openStageIds}
        onValueChange={setOpenStageIds}
      >
        {stages.map((stage, index) => {
          const stageId = `stage-${index}`
          const stageColor = stageAccentPalette[index % stageAccentPalette.length]

          return (
            <AccordionItem key={stageId} value={stageId}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: stageColor }}
                  />
                  <span>ステージ {index + 1}</span>
                  {stages.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeStage(index)
                      }}
                    >
                      削除
                    </Button>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-6">
                <div className="field-grid">
                  <NumberField
                    id={`stage-${index}-mass-initial`}
                    label="初期質量 (kg)"
                    value={stage.mass_initial_kg}
                    onChange={(value) => updateStage(index, { mass_initial_kg: value })}
                    hasError={issuesSet.has(`stage.mass_initial_kg`)}
                    registerRef={makeFieldRef(`stage.mass_initial_kg`)}
                    step="1"
                    min={1}
                  />

                  <NumberField
                    id={`stage-${index}-mass-dry`}
                    label="乾燥質量 (kg)"
                    value={stage.mass_dry_kg}
                    onChange={(value) => updateStage(index, { mass_dry_kg: value })}
                    step="1"
                    min={0}
                  />

                  <NumberField
                    id={`stage-${index}-burn-start`}
                    label="燃焼開始 (s)"
                    value={stage.burn_start_s}
                    onChange={(value) => updateStage(index, { burn_start_s: value })}
                    hasError={issuesSet.has(`stage.burn_start_s`)}
                    registerRef={makeFieldRef(`stage.burn_start_s`)}
                    step="0.1"
                    min={0}
                  />

                  <NumberField
                    id={`stage-${index}-burn-end`}
                    label="燃焼終了 (s)"
                    value={stage.burn_end_s}
                    onChange={(value) => updateStage(index, { burn_end_s: value })}
                    hasError={issuesSet.has(`stage.burn_end_s`)}
                    registerRef={makeFieldRef(`stage.burn_end_s`)}
                    step="0.1"
                    min={0}
                  />

                  <NumberField
                    id={`stage-${index}-forced-cutoff`}
                    label="強制停止 (s)"
                    value={stage.forced_cutoff_s}
                    onChange={(value) => updateStage(index, { forced_cutoff_s: value })}
                    hasError={issuesSet.has(`stage.forced_cutoff_s`)}
                    registerRef={makeFieldRef(`stage.forced_cutoff_s`)}
                    step="0.1"
                    min={0}
                  />

                  <NumberField
                    id={`stage-${index}-separation-time`}
                    label="分離時刻 (s)"
                    value={stage.separation_time_s}
                    onChange={(value) => updateStage(index, { separation_time_s: value })}
                    hasError={issuesSet.has(`stage.separation_time_s`)}
                    registerRef={makeFieldRef(`stage.separation_time_s`)}
                    step="0.1"
                    min={0}
                  />
                </div>

                <div className="field-grid">
                  <SelectField
                    id={`stage-${index}-power-mode`}
                    label="動力飛行モード"
                    value={stage.power_mode}
                    options={POWER_MODE_OPTIONS}
                    onChange={(value) => updateStage(index, { power_mode: value })}
                    hasError={issuesSet.has(`stage.power_mode`)}
                    registerRef={makeFieldRef(`stage.power_mode`)}
                  />

                  <SelectField
                    id={`stage-${index}-free-mode`}
                    label="自由飛行モード"
                    value={stage.free_mode}
                    options={FREE_MODE_OPTIONS}
                    onChange={(value) => updateStage(index, { free_mode: value })}
                    hasError={issuesSet.has(`stage.free_mode`)}
                    registerRef={makeFieldRef(`stage.free_mode`)}
                  />
                </div>

                <div className="field-grid">
                  <NumberField
                    id={`stage-${index}-throat-diameter`}
                    label="スロート直径 (m)"
                    value={stage.throat_diameter_m}
                    onChange={(value) => updateStage(index, { throat_diameter_m: value })}
                    hasError={issuesSet.has(`stage.throat_diameter_m`)}
                    registerRef={makeFieldRef(`stage.throat_diameter_m`)}
                    step="0.01"
                    min={0.01}
                  />
                </div>

                {/* Thrust Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">推力設定</h4>
                    <SwitchField
                      id={`use-thrust-profile-${index}`}
                      label="時間プロファイル使用"
                      checked={useThrustProfile[index] || false}
                      onCheckedChange={(checked) => {
                        setUseThrustProfile(prev => ({ ...prev, [index]: checked }))
                        if (!checked) {
                          updateStage(index, { thrust_profile: [] })
                        }
                      }}
                    />
                  </div>

                  {!useThrustProfile[index] ? (
                    <div className="space-y-4">
                      <div className="field-grid">
                        <NumberField
                          id={`stage-${index}-thrust-constant`}
                          label="定推力 (N)"
                          value={stage.thrust_constant}
                          onChange={(value) => updateStage(index, { thrust_constant: value })}
                          hasError={issuesSet.has(`stage.thrust_constant`)}
                          registerRef={makeFieldRef(`stage.thrust_constant`)}
                          step="1000"
                          min={0}
                        />
                      </div>
                      {showVariations && (
                        <div className="field-grid">
                          <NumberField
                            id={`stage-${index}-thrust-multiplier`}
                            label="推力倍率"
                            value={stage.thrust_multiplier}
                            onChange={(value) => updateStage(index, { thrust_multiplier: value })}
                            hasError={issuesSet.has(`stage.thrust_multiplier`)}
                            registerRef={makeFieldRef(`stage.thrust_multiplier`)}
                            step="0.01"
                            min={0}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <EditableTable
                      title="推力 vs 時間"
                      columns={thrustColumns}
                      rows={stage.thrust_profile || []}
                      onChange={(profile) => updateStage(index, { thrust_profile: profile })}
                      addLabel="推力ポイントを追加"
                    />
                  )}
                </div>

                {/* Isp Configuration */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold">Isp設定</h4>
                    <SwitchField
                      id={`use-isp-profile-${index}`}
                      label="時間プロファイル使用"
                      checked={useIspProfile[index] || false}
                      onCheckedChange={(checked) => {
                        setUseIspProfile(prev => ({ ...prev, [index]: checked }))
                        if (!checked) {
                          updateStage(index, { isp_profile: [] })
                        }
                      }}
                    />
                  </div>

                  {!useIspProfile[index] ? (
                    <div className="space-y-4">
                      <div className="field-grid">
                        <NumberField
                          id={`stage-${index}-isp-constant`}
                          label="定Isp (s)"
                          value={stage.isp_constant}
                          onChange={(value) => updateStage(index, { isp_constant: value })}
                          hasError={issuesSet.has(`stage.isp_constant`)}
                          registerRef={makeFieldRef(`stage.isp_constant`)}
                          step="1"
                          min={1}
                        />
                      </div>
                      {showVariations && (
                        <div className="field-grid">
                          <NumberField
                            id={`stage-${index}-isp-multiplier`}
                            label="Isp倍率"
                            value={stage.isp_multiplier}
                            onChange={(value) => updateStage(index, { isp_multiplier: value })}
                            hasError={issuesSet.has(`stage.isp_multiplier`)}
                            registerRef={makeFieldRef(`stage.isp_multiplier`)}
                            step="0.01"
                            min={0}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <EditableTable
                      title="Isp vs 時間"
                      columns={ispColumns}
                      rows={stage.isp_profile || []}
                      onChange={(profile) => updateStage(index, { isp_profile: profile })}
                      addLabel="Ispポイントを追加"
                    />
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          )
        })}
      </Accordion>
    </div>
  )
}