import { NumberField, SwitchField } from '../shared/FormFields'
import { EditableTable, type Column } from '../shared/EditableTable'
import type { ClientConfig, ClientMachSample } from '../../lib/types'

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
    { key: 'mach', label: 'Mach Number', step: '0.1', min: 0 },
    { key: 'value', label: 'CN', step: '0.01' },
  ]

  const caColumns: Column<ClientMachSample>[] = [
    { key: 'mach', label: 'Mach Number', step: '0.1', min: 0 },
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
        <h3>Aerodynamics</h3>
        <p className="text-sm text-slate-600">Configure aerodynamic properties and coefficients.</p>
      </div>

      <div className="field-grid">
        <NumberField
          id="body-diameter"
          label="Body Diameter (m)"
          value={config.aerodynamics.body_diameter_m}
          onChange={(value) => updateAerodynamics({ body_diameter_m: value })}
          hasError={issuesSet.has('aerodynamics.body_diameter_m')}
          registerRef={makeFieldRef('aerodynamics.body_diameter_m')}
          step="0.01"
          min={0.01}
        />

        <NumberField
          id="ballistic-coefficient"
          label="Ballistic Coefficient"
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
          <h4 className="text-sm font-semibold">Normal Force Coefficient (CN)</h4>
          <SwitchField
            id="use-cn-profile"
            label="Use Mach Profile"
            checked={useCnProfile}
            onCheckedChange={setUseCnProfile}
          />
        </div>

        {!useCnProfile ? (
          <div className="space-y-4">
            <div className="field-grid">
              <NumberField
                id="cn-constant"
                label="CN Constant"
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
                  label="CN Multiplier"
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
            title="CN vs Mach Number"
            columns={cnColumns}
            rows={config.aerodynamics.cn_profile}
            onChange={(profile) => updateAerodynamics({ cn_profile: profile })}
            addLabel="Add CN point"
          />
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Axial Force Coefficient (CA)</h4>
          <SwitchField
            id="use-ca-profile"
            label="Use Mach Profile"
            checked={useCaProfile}
            onCheckedChange={setUseCaProfile}
          />
        </div>

        {!useCaProfile ? (
          <div className="space-y-4">
            <div className="field-grid">
              <NumberField
                id="ca-constant"
                label="CA Constant"
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
                  label="CA Multiplier"
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
            title="CA vs Mach Number"
            columns={caColumns}
            rows={config.aerodynamics.ca_profile}
            onChange={(profile) => updateAerodynamics({ ca_profile: profile })}
            addLabel="Add CA point"
          />
        )}
      </div>
    </div>
  )
}