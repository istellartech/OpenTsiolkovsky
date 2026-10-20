import type { Config } from './config'
import { tr } from './i18n'

export type Workspace = 'simulate' | 'optimize'
export interface CarriedMass {
  stage: number
  stageCount: number
  payloadKg: number
  adapterKg: number
  needsReview?: boolean
}
export interface ConversionRecord {
  from: Workspace
  to: Workspace
  at: number
  sourceId: string
  sourceRevision: number
  sourceName: string
  runId?: string
  notes: string[]
}
/** Application metadata. Never passed to either solver as configuration keys. */
export interface CaseContext {
  version: 1
  id: string
  rootId: string
  revision: number
  name: string
  history: ConversionRecord[]
  carriedMass?: CarriedMass
}
export function newCase(name: string): CaseContext {
  const id = crypto.randomUUID()
  return { version: 1, id, rootId: id, revision: 1, name, history: [] }
}
export function editCase(context: CaseContext, name = context.name): CaseContext {
  return { ...context, name, revision: context.revision + 1 }
}
export function convertedCase(source: CaseContext, to: Workspace, name: string, notes: string[], runId?: string): CaseContext {
  return {
    ...newCase(name),
    rootId: source.rootId,
    history: [
      ...source.history,
      {
        from: to === 'simulate' ? 'optimize' : 'simulate',
        to,
        at: Date.now(),
        sourceId: source.id,
        sourceRevision: source.revision,
        sourceName: source.name,
        notes: [...notes],
        ...(runId ? { runId } : {}),
      },
    ],
  }
}
export function editedSimulationCase(context: CaseContext, previous: Config, next: Config): CaseContext {
  const out = editCase(context, next.name)
  if (out.carriedMass && previous.stages.length !== next.stages.length) out.carriedMass = { ...out.carriedMass, needsReview: true }
  return out
}
/** Remove only the explicitly recorded payload/adapter, retaining edits to the underlying vehicle. */
export function withoutCarriedMass(config: Config, context?: CaseContext): Config {
  const mass = context?.carriedMass
  if (!mass) return structuredClone(config)
  const stage = config.stages[mass.stage]
  const total = mass.payloadKg + mass.adapterKg
  if (
    !Number.isFinite(mass.payloadKg) ||
    mass.payloadKg < 0 ||
    !Number.isFinite(mass.adapterKg) ||
    mass.adapterKg < 0 ||
    mass.needsReview ||
    mass.stageCount !== config.stages.length ||
    !stage ||
    stage.mass_dry_kg === undefined ||
    stage.mass_dry_kg < total ||
    stage.mass_initial_kg < total
  )
    throw new Error(
      tr(
        'ケース情報で衛星・PAFを含む計算区間と質量内訳を確認してください。',
        'Review the payload/adapter interval and mass breakdown in Case details.',
      ),
    )
  const out = structuredClone(config)
  out.stages[mass.stage].mass_initial_kg -= total
  out.stages[mass.stage].mass_dry_kg! -= total
  return out
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const positiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const workspace = (v: unknown) => v === 'simulate' || v === 'optimize'
export function readCaseContext(value: unknown): CaseContext {
  if (
    !object(value) ||
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !value.id ||
    typeof value.rootId !== 'string' ||
    !value.rootId ||
    !positiveInt(value.revision) ||
    typeof value.name !== 'string' ||
    !Array.isArray(value.history) ||
    !value.history.every(
      (h) =>
        object(h) &&
        workspace(h.from) &&
        workspace(h.to) &&
        h.from !== h.to &&
        nonnegative(h.at) &&
        typeof h.sourceId === 'string' &&
        positiveInt(h.sourceRevision) &&
        typeof h.sourceName === 'string' &&
        (h.runId === undefined || typeof h.runId === 'string') &&
        Array.isArray(h.notes) &&
        h.notes.every((s) => typeof s === 'string'),
    )
  )
    throw new Error(tr('ケース情報の形式が正しくありません。', 'Invalid case metadata.'))
  const m = value.carriedMass
  if (
    m !== undefined &&
    (!object(m) ||
      !nonnegative(m.stage) ||
      !Number.isSafeInteger(m.stage) ||
      !positiveInt(m.stageCount) ||
      m.stage >= m.stageCount ||
      !nonnegative(m.payloadKg) ||
      !nonnegative(m.adapterKg) ||
      (m.needsReview !== undefined && typeof m.needsReview !== 'boolean'))
  )
    throw new Error(tr('ケースの質量内訳が正しくありません。', 'Invalid case mass breakdown.'))
  return structuredClone(value) as unknown as CaseContext
}
export interface CaseFile {
  format: 'opentsiolkovsky-case'
  version: 1
  workspace: Workspace
  context: CaseContext
  data: unknown
}
export const caseFile = (workspace: Workspace, context: CaseContext, data: unknown): string =>
  JSON.stringify({ format: 'opentsiolkovsky-case', version: 1, workspace, context, data }, null, 2)
/** Returns null for legacy solver JSON; malformed case packages must never fall back to raw config. */
export function readCaseFile(value: unknown): CaseFile | null {
  if (!object(value) || value.format !== 'opentsiolkovsky-case') return null
  if (value.version !== 1 || !workspace(value.workspace) || !object(value.data))
    throw new Error(tr('ケースファイルの形式・版を確認してください。', 'Unsupported case file format or version.'))
  return { ...value, context: readCaseContext(value.context) } as unknown as CaseFile
}
