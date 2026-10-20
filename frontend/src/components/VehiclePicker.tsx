import { structureLabel } from '../lib/presentation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react'
import { PRESET_CATEGORIES, PRESET_COUNTRIES, PRESET_OPTIONS, type PresetCountry, type PresetOption } from '../config/presets'
import { useDismiss } from '../hooks/useDismiss'
import { computeSpecs, type VehicleSpec } from '../lib/specs'
import { filterPresets, type PresetFilter } from '../lib/presetSearch'
import { fmtForce, fmtMass } from '../lib/format'
import { cn } from '../lib/cn'
import { tr } from '../lib/i18n'
import { Segmented } from './primitives'

const PRESET_SPECS = new Map(PRESET_OPTIONS.map((p) => [p.id, computeSpecs(p.create())]))
const countryLabel = (c: PresetCountry) => PRESET_COUNTRIES.find((x) => x.id === c)?.label ?? c

export function VehiclePicker({
  name,
  presetId,
  onPreset,
  onBlank,
}: {
  name: string
  presetId: string
  onPreset: (id: string) => void
  onBlank: () => void
}) {
  const [open, setOpen] = useState(false)
  // Category and country are kept across openings; the search text is
  // cleared once a vehicle is loaded.
  const [filter, setFilterState] = useState<PresetFilter>({ query: '', category: 'all', country: null })
  const setFilter = useCallback((f: Partial<PresetFilter>) => setFilterState((prev) => ({ ...prev, ...f })), [])
  const ref = useRef<HTMLDivElement>(null)
  const current = PRESET_OPTIONS.find((p) => p.id === presetId)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left hover:bg-surface-2 max-w-full"
      >
        <span className="min-w-0 truncate text-[13px] font-medium">{current ? current.label : name || tr('カスタム', 'Custom')}</span>
        <span className="hidden truncate text-[12px] text-ink-3 2xl:inline">
          {current ? current.kind : tr('編集中の設定', 'Edited settings')}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
      </button>
      {open && (
        <PickerPanel
          presetId={presetId}
          filter={filter}
          setFilter={setFilter}
          onPreset={(id) => {
            setOpen(false)
            setFilter({ query: '' })
            onPreset(id)
          }}
          onBlank={() => {
            setOpen(false)
            onBlank()
          }}
        />
      )}
    </div>
  )
}

function PickerPanel({
  presetId,
  filter,
  setFilter,
  onPreset,
  onBlank,
}: {
  presetId: string
  filter: PresetFilter
  setFilter: (f: Partial<PresetFilter>) => void
  onPreset: (id: string) => void
  onBlank: () => void
}) {
  const results = useMemo(() => filterPresets(PRESET_OPTIONS, filter, countryLabel), [filter])
  // In category order, so arrow keys follow what is on screen
  const groups = PRESET_CATEGORIES.map((cat) => ({ cat, items: results.filter((p) => p.category === cat.id) })).filter(
    (g) => g.items.length > 0,
  )
  const ordered = groups.flatMap((g) => g.items)
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = ordered.find((p) => p.id === activeId) ?? ordered.find((p) => p.id === presetId) ?? ordered[0]
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the search box on desktop only: on phones it would pop the keyboard over the list.
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus()
  }, [])
  // Keyboard moves bring the row into view; hovering does not (it would chase the pointer).
  const scrollToId = (id: string) =>
    requestAnimationFrame(() => listRef.current?.querySelector(`[data-preset="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }))

  const countryCounts = useMemo(() => {
    const base = filterPresets(PRESET_OPTIONS, { ...filter, country: null }, countryLabel)
    return new Map(PRESET_COUNTRIES.map((c) => [c.id, base.filter((p) => p.country === c.id).length]))
  }, [filter])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (ordered.length === 0) return
      const i = active ? ordered.indexOf(active) : -1
      const next = e.key === 'ArrowDown' ? Math.min(i + 1, ordered.length - 1) : Math.max(i - 1, 0)
      setActiveId(ordered[next].id)
      scrollToId(ordered[next].id)
    } else if (e.key === 'Enter' && active && (e.target === inputRef.current || (e.target as HTMLElement).dataset.preset)) {
      e.preventDefault()
      onPreset(active.id)
    }
  }

  const filtered = filter.query !== '' || filter.category !== 'all' || filter.country !== null

  return (
    <div
      role="dialog"
      aria-label={tr('機体を選ぶ', 'Choose a vehicle')}
      onKeyDown={onKeyDown}
      className="fixed inset-x-2 top-12 z-50 flex max-h-[calc(100dvh-4rem)] flex-col rounded-[10px] border border-line bg-surface shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)] sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:max-h-[min(78vh,640px)] sm:w-[26rem] md:w-[46rem]"
    >
      <div className="space-y-2 border-b border-line p-2">
        <label className="flex h-8 items-center gap-2 rounded-[7px] bg-surface-2 px-2.5 ring-1 ring-line focus-within:ring-signal">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            type="search"
            value={filter.query}
            onChange={(e) => {
              setFilter({ query: e.target.value })
              setActiveId(null)
            }}
            placeholder={tr('機体名・射場で検索（例: H3, Falcon, 長征）', 'Search name or site (e.g. H3, Falcon, Soyuz)')}
            aria-label={tr('機体を検索', 'Search vehicles')}
            aria-controls="vehicle-picker-list"
            className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {filter.query && (
            <button
              type="button"
              aria-label={tr('検索語を消す', 'Clear search')}
              onClick={() => {
                setFilter({ query: '' })
                inputRef.current?.focus()
              }}
              className="rounded p-0.5 text-ink-3 hover:text-ink"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Segmented
            size="sm"
            value={filter.category}
            onChange={(category) => setFilter({ category })}
            options={[
              { value: 'all', label: tr('すべて', 'All') },
              { value: 'sounding', label: tr('観測ロケット', 'Sounding') },
              { value: 'orbital', label: tr('衛星打上げ', 'Orbital') },
            ]}
          />
          <div role="group" aria-label={tr('国・地域', 'Country / region')} className="flex flex-wrap gap-1">
            {PRESET_COUNTRIES.map((c) => {
              const n = countryCounts.get(c.id) ?? 0
              const on = filter.country === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  disabled={n === 0 && !on}
                  onClick={() => setFilter({ country: on ? null : c.id })}
                  className={cn(
                    'h-6 rounded-full px-2 text-[11px] font-medium ring-1 transition-colors disabled:opacity-35',
                    on ? 'bg-ink text-surface ring-ink' : 'text-ink-2 ring-line hover:text-ink hover:ring-line-strong',
                  )}
                >
                  {c.label}
                  <span className={cn('num ml-1', on ? 'opacity-70' : 'text-ink-3')}>{n}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          id="vehicle-picker-list"
          ref={listRef}
          role="listbox"
          aria-label={tr('機体', 'Vehicles')}
          className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-1.5 md:max-w-[19rem] md:border-r md:border-line"
        >
          {presetId === 'custom' && (
            <p className="px-2.5 pb-1 pt-1 text-[11px] text-ink-3">
              {tr(
                '選ぶと現在の編集内容は置き換わります（元に戻すで復元できます）',
                'Choosing one replaces your edits (Undo brings them back)',
              )}
            </p>
          )}
          {groups.map(({ cat, items }) => (
            <div key={cat.id} className="mb-1">
              <p className="sticky top-0 z-[1] bg-surface px-2.5 pb-1 pt-2 text-[11px] font-semibold text-ink-2">
                {cat.label}
                <span className="num ml-1.5 font-normal text-ink-3">{items.length}</span>
              </p>
              {items.map((p) => (
                <PresetRow
                  key={p.id}
                  preset={p}
                  specs={PRESET_SPECS.get(p.id)!}
                  selected={p.id === presetId}
                  highlighted={p.id === active?.id}
                  onHover={() => setActiveId(p.id)}
                  onPick={() => onPreset(p.id)}
                />
              ))}
            </div>
          ))}
          {ordered.length === 0 && (
            <div className="px-2.5 py-6 text-center text-[12px] text-ink-3">
              <p>{tr('該当する機体がありません', 'No vehicles match')}</p>
              <button
                type="button"
                onClick={() => setFilter({ query: '', category: 'all', country: null })}
                className="mt-2 rounded-[6px] px-2 py-1 text-[12px] font-medium text-ink-2 ring-1 ring-line hover:text-ink"
              >
                {tr('絞り込みを解除', 'Clear filters')}
              </button>
            </div>
          )}
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              onClick={onBlank}
              className="flex w-full items-start gap-2.5 rounded-[7px] px-2.5 py-2 text-left hover:bg-surface-2"
            >
              <Plus className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
              <span>
                <span className="block text-[13px] font-semibold">{tr('白紙から作る', 'Start from scratch')}</span>
                <span className="block text-[11px] leading-relaxed text-ink-3">
                  {tr(
                    '1段・1 t・推力 20 kN の最小構成から始めます。発射地点と日時はいまの設定を引き継ぎます。',
                    'A minimal one-stage, 1 t, 20 kN vehicle. Keeps the current launch site and time.',
                  )}
                </span>
              </span>
            </button>
          </div>
        </div>
        {/* Details of the highlighted vehicle (wide screens) */}
        <div className="scroll-quiet hidden min-h-0 flex-1 overflow-y-auto p-4 md:block" aria-live="polite">
          {active ? (
            <PresetDetail
              preset={active}
              specs={PRESET_SPECS.get(active.id)!}
              selected={active.id === presetId}
              onPick={() => onPreset(active.id)}
            />
          ) : (
            <p className="text-[12px] text-ink-3">{filtered ? tr('該当する機体がありません', 'No vehicles match') : null}</p>
          )}
        </div>
      </div>
      <p className="hidden border-t border-line px-3 py-1.5 text-[11px] text-ink-3 md:block">
        {tr('↑↓ で移動 · Enter で読み込み · Esc で閉じる', '↑↓ to move · Enter to load · Esc to close')}
      </p>
    </div>
  )
}

function PresetRow({
  preset,
  specs,
  selected,
  highlighted,
  onHover,
  onPick,
}: {
  preset: PresetOption
  specs: VehicleSpec
  selected: boolean
  highlighted: boolean
  onHover: () => void
  onPick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-preset={preset.id}
      onClick={onPick}
      onPointerMove={onHover}
      onFocus={onHover}
      className={cn('block w-full rounded-[7px] px-2.5 py-1.5 text-left', highlighted ? 'bg-surface-2' : 'hover:bg-surface-2')}
    >
      <span className="flex items-baseline gap-2">
        <span className="truncate text-[13px] font-semibold">{preset.label}</span>
        <span className="shrink-0 text-[11px] text-ink-3">{countryLabel(preset.country)}</span>
        {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 self-center text-ink" />}
      </span>
      <span className="mt-0.5 block truncate text-[11px] text-ink-2">{preset.kind}</span>
      {/* Phones and tablets have no detail pane: show the key figures inline */}
      <span className="num mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-3 md:hidden">
        <SpecFigures specs={specs} />
      </span>
    </button>
  )
}

function SpecFigures({ specs }: { specs: VehicleSpec }) {
  return (
    <>
      <span>{structureLabel(specs.presentation?.vehicle, specs.stages.length)}</span>
      <span>{fmtMass(specs.liftoffMass)}</span>
      <span>
        {tr('推力', 'Thrust')} {fmtForce(specs.liftoffThrust)}
      </span>
      <span>Δv {(specs.dvTotal / 1000).toFixed(1)} km/s</span>
    </>
  )
}

function PresetDetail({
  preset,
  specs,
  selected,
  onPick,
}: {
  preset: PresetOption
  specs: VehicleSpec
  selected: boolean
  onPick: () => void
}) {
  const figures: [string, string][] = [
    [tr('段構成', 'Structure'), structureLabel(specs.presentation?.vehicle, specs.stages.length)],
    [tr('全備質量', 'Liftoff mass'), fmtMass(specs.liftoffMass)],
    [tr('離昇推力（真空）', 'Liftoff thrust (vac)'), fmtForce(specs.liftoffThrust)],
    [tr('理想 Δv', 'Ideal Δv'), `${(specs.dvTotal / 1000).toFixed(2)} km/s`],
  ]
  return (
    <div>
      <p className="text-[11px] text-ink-3">
        {countryLabel(preset.country)} · {preset.site}
      </p>
      <h3 className="mt-0.5 text-[17px] font-semibold tracking-tight">{preset.label}</h3>
      <p className="text-[12px] text-ink-2">{preset.kind}</p>
      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line">
        {figures.map(([k, v]) => (
          <div key={k} className="bg-surface px-2.5 py-1.5">
            <dt className="text-[10px] text-ink-3">{k}</dt>
            <dd className="num text-[13px]">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] leading-relaxed text-ink-2">{preset.description}</p>
      <p className="mt-2 text-[11px] text-ink-3">
        {tr(
          `出典 ${preset.sources.length} 件・モデル化の注記は概要タブに表示されます`,
          `${preset.sources.length} source${preset.sources.length === 1 ? '' : 's'}; modelling notes are in the Overview tab`,
        )}
      </p>
      <button
        type="button"
        onClick={onPick}
        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-ink px-3 text-[12px] font-medium text-surface hover:opacity-90"
      >
        {selected ? <Check className="h-3.5 w-3.5" /> : null}
        {selected ? tr('読み込み直す', 'Reload this vehicle') : tr('この機体を読み込む', 'Load this vehicle')}
      </button>
    </div>
  )
}
