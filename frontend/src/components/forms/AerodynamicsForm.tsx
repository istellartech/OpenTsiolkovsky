import { NumberField, SwitchField, EditableTable, type Column } from '../shared'
import type { ClientConfig, ClientMachSample } from '../../lib/simulation'

interface AerodynamicsFormProps {
  config: ClientConfig
  setConfig: (config: ClientConfig) => void
  useCnProfile: boolean
  setUseCnProfile: (use: boolean) => void
  useCaProfile: boolean
  setUseCaProfile: (use: boolean) => void
  showVariations: boolean
  issuesSet: Set<string>
  makeFieldRef: (field?: string) => (el: HTMLElement | null) => void
}

export function AerodynamicsForm({
  config,
  setConfig,
  useCnProfile,
  setUseCnProfile,
  useCaProfile,
  setUseCaProfile,
  showVariations,
  issuesSet,
  makeFieldRef
}: AerodynamicsFormProps) {
  const cnColumns: Column<ClientMachSample>[] = [
    { key: 'mach', label: 'マッハ数', step: '0.1', min: 0 },
    { key: 'value', label: 'CN', step: '0.01' },
  ]

  const caColumns: Column<ClientMachSample>[] = [
    { key: 'mach', label: 'マッハ数', step: '0.1', min: 0 },
    { key: 'value', label: 'CA', step: '0.01', min: 0 },
  ]

  const updateAerodynamics = (updates: Partial<ClientConfig['aerodynamics']>) => {
    setConfig({
      ...config,
      aerodynamics: { ...config.aerodynamics, ...updates }
    })
  }

  return (
    <div className="section-shell space-y-6">
      <div>
        <h3>空力特性</h3>
        <p className="text-sm text-slate-600">空力特性と係数を設定してください。</p>
      </div>

      <div className="field-grid">
        <NumberField
          id="body-diameter"
          label="機体直径 (m)"
          value={config.aerodynamics.body_diameter_m}
          onChange={(value) => updateAerodynamics({ body_diameter_m: value })}
          hasError={issuesSet.has('aerodynamics.body_diameter_m')}
          registerRef={makeFieldRef('aerodynamics.body_diameter_m')}
          step="0.01"
          min={0.01}
        />

        <NumberField
          id="ballistic-coefficient"
          label="弾道係数"
          value={config.aerodynamics.ballistic_coefficient}
          onChange={(value) => updateAerodynamics({ ballistic_coefficient: value })}
          hasError={issuesSet.has('aerodynamics.ballistic_coefficient')}
          registerRef={makeFieldRef('aerodynamics.ballistic_coefficient')}
          step="1"
          min={1}
        />
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">法線力係数 (CN)</h4>
          <SwitchField
            id="use-cn-profile"
            label="Machプロファイル使用"
            checked={useCnProfile}
            onCheckedChange={setUseCnProfile}
          />
        </div>

        {!useCnProfile ? (
          <div className="space-y-4">
            <div className="field-grid">
              <NumberField
                id="cn-constant"
                label="固定CN値"
                value={config.aerodynamics.cn_constant}
                onChange={(value) => updateAerodynamics({ cn_constant: value })}
                hasError={issuesSet.has('aerodynamics.cn_constant')}
                registerRef={makeFieldRef('aerodynamics.cn_constant')}
                step="0.01"
              />
            </div>
            {showVariations && (
              <div className="field-grid">
                <NumberField
                  id="cn-multiplier"
                  label="CN倍率"
                  value={config.aerodynamics.cn_multiplier}
                  onChange={(value) => updateAerodynamics({ cn_multiplier: value })}
                  hasError={issuesSet.has('aerodynamics.cn_multiplier')}
                  registerRef={makeFieldRef('aerodynamics.cn_multiplier')}
                  step="0.01"
                  min={0}
                />
              </div>
            )}
          </div>
        ) : (
          <EditableTable
            title="CN vs マッハ数"
            columns={cnColumns}
            rows={config.aerodynamics.cn_profile}
            onChange={(profile) => updateAerodynamics({ cn_profile: profile })}
            addLabel="CNポイントを追加"
          />
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">軸方向力係数 (CA)</h4>
          <SwitchField
            id="use-ca-profile"
            label="Machプロファイル使用"
            checked={useCaProfile}
            onCheckedChange={setUseCaProfile}
          />
        </div>

        {!useCaProfile ? (
          <div className="space-y-4">
            <div className="field-grid">
              <NumberField
                id="ca-constant"
                label="固定CA値"
                value={config.aerodynamics.ca_constant}
                onChange={(value) => updateAerodynamics({ ca_constant: value })}
                hasError={issuesSet.has('aerodynamics.ca_constant')}
                registerRef={makeFieldRef('aerodynamics.ca_constant')}
                step="0.01"
                min={0}
              />
            </div>
            {showVariations && (
              <div className="field-grid">
                <NumberField
                  id="ca-multiplier"
                  label="CA倍率"
                  value={config.aerodynamics.ca_multiplier}
                  onChange={(value) => updateAerodynamics({ ca_multiplier: value })}
                  hasError={issuesSet.has('aerodynamics.ca_multiplier')}
                  registerRef={makeFieldRef('aerodynamics.ca_multiplier')}
                  step="0.01"
                  min={0}
                />
              </div>
            )}
          </div>
        ) : (
          <EditableTable
            title="CA vs マッハ数"
            columns={caColumns}
            rows={config.aerodynamics.ca_profile}
            onChange={(profile) => updateAerodynamics({ ca_profile: profile })}
            addLabel="CAポイントを追加"
          />
        )}
      </div>
    </div>
  )
}