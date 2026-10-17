import type { VehicleSpec } from '../lib/specs'
import type { ClientConfig } from '../lib/simulation'
import { cn } from '../lib/cn'
import { tr } from '../lib/i18n'
import type { Patch } from './inspector/shared'
import { Overview } from './inspector/OverviewTab'
import { LaunchTab } from './inspector/LaunchTab'
import { VehicleTab } from './inspector/VehicleTab'
import { AeroTab } from './inspector/AeroTab'
import { FlightTab } from './inspector/FlightTab'
import { SolverTab } from './inspector/SolverTab'

export type InspectorTab = 'overview' | 'launch' | 'vehicle' | 'aero' | 'flight' | 'solver'

export interface InspectorNav {
  tab: InspectorTab
  stage: number
}

const TABS: { id: InspectorTab; label: string }[] = [
  {
    id: 'overview',
    get label() {
      return tr('概要', 'Overview')
    },
  },
  {
    id: 'launch',
    get label() {
      return tr('発射', 'Launch')
    },
  },
  {
    id: 'vehicle',
    get label() {
      return tr('機体', 'Vehicle')
    },
  },
  {
    id: 'aero',
    get label() {
      return tr('空力', 'Aero')
    },
  },
  {
    id: 'flight',
    get label() {
      return tr('姿勢・風', 'Attitude & Wind')
    },
  },
  {
    id: 'solver',
    get label() {
      return tr('計算', 'Solver')
    },
  },
]

/** Which tab (and stage) holds a validation field. */
export function navForField(field: string): InspectorNav {
  const m = field.match(/^stage(?:\[(\d+)\])?\./)
  if (m) return { tab: 'vehicle', stage: m[1] ? Number(m[1]) - 1 : 0 }
  if (field.startsWith('launch.') || field === 'ill') return { tab: 'launch', stage: 0 }
  if (field.startsWith('aerodynamics.')) return { tab: 'aero', stage: 0 }
  if (field.startsWith('attitude.') || field.startsWith('wind.')) return { tab: 'flight', stage: 0 }
  if (field.startsWith('simulation.')) return { tab: 'solver', stage: 0 }
  return { tab: 'overview', stage: 0 }
}

interface Props {
  config: ClientConfig
  patch: Patch
  presetId: string
  specs: VehicleSpec
  nav: InspectorNav
  onNav: (nav: InspectorNav) => void
  issueFields: string[]
}

export function Inspector({ config, patch, presetId, specs, nav, onNav, issueFields }: Props) {
  const tabsWithIssues = new Set(issueFields.map((f) => navForField(f).tab))
  return (
    <div className="flex min-h-full flex-col">
      <div role="tablist" className="sticky top-0 z-10 flex border-b border-line bg-surface px-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={nav.tab === t.id}
            onClick={() => onNav({ ...nav, tab: t.id })}
            className={cn(
              'relative h-10 flex-1 whitespace-nowrap px-1 text-[12px] font-medium transition-colors',
              nav.tab === t.id ? 'text-ink' : 'text-ink-3 hover:text-ink',
            )}
          >
            {t.label}
            {tabsWithIssues.has(t.id) && (
              <span
                className="absolute right-1 top-2 h-1.5 w-1.5 rounded-full bg-danger"
                aria-label={tr('入力エラーあり', 'Has input errors')}
              />
            )}
            {nav.tab === t.id && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-ink" />}
          </button>
        ))}
      </div>
      <div className="flex-1 px-4 pb-10 pt-3">
        {nav.tab === 'overview' && <Overview config={config} patch={patch} presetId={presetId} specs={specs} onNav={onNav} />}
        {nav.tab === 'launch' && <LaunchTab config={config} patch={patch} />}
        {nav.tab === 'vehicle' && (
          <VehicleTab config={config} patch={patch} specs={specs} stage={nav.stage} onStage={(stage) => onNav({ tab: 'vehicle', stage })} />
        )}
        {nav.tab === 'aero' && <AeroTab config={config} patch={patch} />}
        {nav.tab === 'flight' && <FlightTab config={config} patch={patch} />}
        {nav.tab === 'solver' && <SolverTab config={config} patch={patch} />}
      </div>
    </div>
  )
}
