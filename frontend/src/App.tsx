import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Download, Globe as GlobeIcon, LineChart, SlidersHorizontal, Upload, X } from 'lucide-react'
import { useSimulation, type RunStatus } from './hooks/useSimulation'
import { PRESET_OPTIONS } from './config/defaults'
import { Inspector, navForField, type InspectorNav } from './components/Inspector'
import { FieldContext, IconButton, Segmented } from './components/primitives'
import { PlaybackBar, Telemetry } from './components/Playback'
import { playback, suggestedSpeed } from './lib/playback'
import { trackToCsv, type Track } from './lib/trajectory'
import { computeSpecs, fmtForce, fmtMass } from './lib/specs'
import { downloadKML, cn } from './lib/utils'
import type { ValidationIssue } from './utils/validation'

const Globe = lazy(() => import('./components/Globe'))
const ChartGrid = lazy(() => import('./components/Charts').then((m) => ({ default: m.ChartGrid })))
const EventList = lazy(() => import('./components/Charts').then((m) => ({ default: m.EventList })))

function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

const fmt = (v: number, d = 1) => v.toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d })

function saveFile(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

const slug = (s: string) => s.trim().replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'rocket'

type MobileView = 'params' | 'globe' | 'charts'
type PanelTab = 'charts' | 'events'

export default function App() {
  const sim = useSimulation()
  const { config, result } = sim
  const track = result?.track ?? null

  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('globe')
  const [panelTab, setPanelTab] = useState<PanelTab>('charts')
  const split = useSplitRatio()

  // Field refs for "jump to issue".
  const fieldRefs = useRef(new Map<string, HTMLElement>())
  const register = useCallback(
    (path: string) => (el: HTMLElement | null) => {
      if (el) fieldRefs.current.set(path, el)
      else fieldRefs.current.delete(path)
    },
    [],
  )
  const fieldCtx = useMemo(() => ({ issues: sim.issueMap, register }), [sim.issueMap, register])

  const [nav, setNav] = useState<InspectorNav>({ tab: 'overview', stage: 0 })
  const specs = useMemo(() => computeSpecs(config), [config])

  const focusIssue = (issue: ValidationIssue) => {
    setNav(navForField(issue.field))
    if (isMobile) setMobileView('params')
    else if (!isDesktop) setDrawerOpen(true)
    requestAnimationFrame(() => {
      const el = fieldRefs.current.get(issue.field)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus?.()
    })
  }

  // Load each new result into the player. The first one plays immediately.
  const loadedOnce = useRef(false)
  const lastDuration = useRef(0)
  useEffect(() => {
    if (!track) return
    const duration = track.t1 - track.t0
    const changedScale = Math.abs(Math.log((duration || 1) / (lastDuration.current || 1))) > Math.log(2)
    if (!loadedOnce.current) {
      loadedOnce.current = true
      playback.load(track.t0, track.t1, { speed: suggestedSpeed(duration) })
      playback.play()
    } else {
      playback.load(track.t0, track.t1, { keepTime: true, speed: changedScale ? suggestedSpeed(duration) : undefined })
    }
    lastDuration.current = duration
  }, [track])

  // Keyboard: Space = play/pause, ←/→ = ±1 s (Shift: ±10 s)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, select, textarea, [contenteditable="true"], [role="slider"]')) return
      if (e.key === ' ' && !el.closest('button')) {
        e.preventDefault()
        playback.toggle()
      } else if (e.key === 'ArrowRight') playback.step(e.shiftKey ? 10 : 1)
      else if (e.key === 'ArrowLeft') playback.step(e.shiftKey ? -10 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const exports = {
    json: () => saveFile(`${slug(config.name)}.json`, JSON.stringify(config, null, 2), 'application/json'),
    csv: () => track && saveFile(`${slug(config.name)}_trajectory.csv`, trackToCsv(track), 'text/csv'),
    kml: () => result && downloadKML({ trajectory: result.states, config: result.config }),
  }

  const inspector = (
    <FieldContext.Provider value={fieldCtx}>
      <Inspector
        config={config}
        patch={sim.patch}
        presetId={sim.presetId}
        specs={specs}
        nav={nav}
        onNav={setNav}
        issueFields={sim.issues.map((i) => i.field)}
      />
    </FieldContext.Provider>
  )

  const globe = (
    <div className="relative h-full w-full">
      <Suspense fallback={<div className="h-full w-full bg-bg" />}>
        <Globe track={track} />
      </Suspense>
      {track && (
        <div className="absolute left-3 top-3">
          <Telemetry track={track} compact={isMobile || split.ratio < 0.35} />
        </div>
      )}
      {!track && sim.status !== 'running' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-ink-2">
          {sim.status === 'invalid' ? '入力値を確認してください' : sim.error}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      <Header
        name={config.name}
        presetId={sim.presetId}
        onPreset={(id) => {
          sim.applyPreset(id)
          setNav({ tab: 'overview', stage: 0 })
        }}
        onImport={sim.importConfig}
        exports={exports}
        hasResult={!!track}
        status={sim.status}
        error={sim.error}
        issues={sim.issues}
        onIssue={focusIssue}
        showDrawerToggle={!isDesktop && !isMobile}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        compact={isMobile}
      />

      <div className="relative flex min-h-0 flex-1">
        {/* Parameters */}
        {isDesktop && (
          <aside className="scroll-quiet w-[372px] shrink-0 overflow-y-auto border-r border-line bg-surface">{inspector}</aside>
        )}
        {!isDesktop && !isMobile && drawerOpen && (
          <>
            <div className="absolute inset-0 z-20 bg-black/25" onClick={() => setDrawerOpen(false)} />
            <aside className="scroll-quiet absolute inset-y-0 left-0 z-30 w-[380px] max-w-[92vw] overflow-y-auto border-r border-line bg-surface shadow-[8px_0_24px_-12px_rgba(0,0,0,0.25)]">
              <div className="flex h-10 items-center justify-between border-b border-line px-4">
                <span className="text-[13px] font-semibold">パラメータ</span>
                <IconButton label="閉じる" onClick={() => setDrawerOpen(false)}>
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
              {inspector}
            </aside>
          </>
        )}
        {isMobile && mobileView === 'params' && (
          <div className="scroll-quiet absolute inset-0 z-10 overflow-y-auto bg-surface">{inspector}</div>
        )}

        {/* Main stage */}
        <main className="flex min-w-0 flex-1 flex-col">
          {isMobile ? (
            <>
              <div className={cn('min-h-0 flex-1', mobileView !== 'globe' && 'hidden')}>{globe}</div>
              {mobileView === 'charts' && track && (
                <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-2">
                  <Summary track={track} />
                  <Suspense fallback={null}>
                    <ChartGrid track={track} />
                    <div className="mt-3 rounded-[8px] border border-line bg-surface px-3 py-1">
                      <EventList track={track} />
                    </div>
                  </Suspense>
                </div>
              )}
              {track && mobileView !== 'params' && <PlaybackBar track={track} />}
            </>
          ) : (
            <SplitView
              ratio={split.ratio}
              onRatio={split.setRatio}
              top={globe}
              bar={track ? <PlaybackBar track={track} /> : null}
              bottom={
                track ? (
                  <BottomPanel
                    tab={panelTab}
                    onTab={setPanelTab}
                    track={track}
                    layoutSwitch={<LayoutSwitch layout={split.layout} onRatio={split.setRatio} />}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-3">{sim.status === 'running' ? '計算中…' : ''}</div>
                )
              }
            />
          )}
        </main>
      </div>

      {isMobile && (
        <nav className="grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
          {(
            [
              ['params', 'パラメータ', SlidersHorizontal],
              ["globe", "3D", GlobeIcon],
              ["charts", "グラフ", LineChart],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobileView(id)}
              className={cn(
                'flex h-12 flex-col items-center justify-center gap-0.5 text-[11px]',
                mobileView === id ? 'text-ink' : 'text-ink-3',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {id === 'params' && sim.issues.length > 0 && <span className="sr-only">（入力エラーあり）</span>}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ Header */

function Header(props: {
  name: string
  presetId: string
  onPreset: (id: string) => void
  onImport: (f: File) => void
  exports: { json: () => void; csv: () => void; kml: () => void }
  hasResult: boolean
  status: RunStatus
  error: string | null
  issues: ValidationIssue[]
  onIssue: (i: ValidationIssue) => void
  showDrawerToggle: boolean
  onToggleDrawer: () => void
  compact: boolean
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface px-2 sm:px-3">
      {props.showDrawerToggle && (
        <IconButton label="パラメータ" onClick={props.onToggleDrawer}>
          <SlidersHorizontal className="h-4 w-4" />
        </IconButton>
      )}
      <div className="hidden shrink-0 items-baseline gap-2 pl-1 sm:flex">
        <span className="text-[14px] font-semibold tracking-tight">OpenTsiolkovsky</span>
      </div>
      <div className="mx-1 hidden h-5 w-px shrink-0 bg-line sm:block" />
      <VehiclePicker name={props.name} presetId={props.presetId} onPreset={props.onPreset} />

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <StatusIndicator {...props} />
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) props.onImport(f)
            e.target.value = ''
          }}
        />
        <IconButton label="設定JSONを読み込む" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4" />
        </IconButton>
        <Menu
          trigger={(toggle) => (
            <IconButton label="書き出し" onClick={toggle}>
              <Download className="h-4 w-4" />
            </IconButton>
          )}
          items={[
            { label: '設定 (JSON)', onSelect: props.exports.json },
            { label: '軌道データ (CSV)', onSelect: props.exports.csv, disabled: !props.hasResult },
            { label: 'Google Earth (KML)', onSelect: props.exports.kml, disabled: !props.hasResult },
          ]}
        />
      </div>
    </header>
  )
}

function StatusIndicator({
  status,
  error,
  issues,
  onIssue,
  compact,
}: {
  status: RunStatus
  error: string | null
  issues: ValidationIssue[]
  onIssue: (i: ValidationIssue) => void
  compact: boolean
}) {
  const dot = {
    ok: 'bg-ok',
    running: 'bg-ink-3 animate-pulse',
    invalid: 'bg-danger',
    error: 'bg-danger',
  }[status]

  const text =
    status === 'ok'
      ? compact
        ? ''
        : '計算済み'
      : status === 'running'
        ? '計算中'
        : status === 'invalid'
          ? `入力エラー ${issues.length}件`
          : '計算エラー'

  const body = (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {text && <span className="num whitespace-nowrap">{text}</span>}
    </span>
  )

  if (status === 'invalid' || status === 'error') {
    return (
      <Menu
        align="right"
        trigger={(toggle) => (
          <button type="button" onClick={toggle} className="flex h-8 items-center rounded-[6px] px-2 hover:bg-surface-2">
            {body}
          </button>
        )}
        items={
          status === 'invalid'
            ? issues.map((i) => ({ label: i.message, onSelect: () => onIssue(i) }))
            : [{ label: error ?? '不明なエラー', onSelect: () => {} }]
        }
        wide
      />
    )
  }
  return <div className="flex h-8 items-center px-2">{body}</div>
}

function Menu({
  trigger,
  items,
  align = 'right',
  wide = false,
}: {
  trigger: (toggle: () => void) => ReactNode
  items: { label: string; onSelect: () => void; disabled?: boolean }[]
  align?: 'left' | 'right'
  wide?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {trigger(() => setOpen((v) => !v))}
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-full z-50 mt-1 overflow-hidden rounded-[8px] border border-line bg-surface py-1 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.25)]',
            align === 'right' ? 'right-0' : 'left-0',
            wide ? 'w-[min(22rem,90vw)]' : 'w-52',
          )}
        >
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false)
                it.onSelect()
              }}
              className="block w-full px-3 py-1.5 text-left text-[12px] leading-snug text-ink hover:bg-surface-2 disabled:text-ink-3 disabled:hover:bg-transparent"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- Split view */

const SPLIT_KEY = 'ot.split'

/** Share of the main area given to the map; the rest goes to charts. */
const LAYOUTS = [
  { value: 'map', label: '地図', ratio: 0.68, title: '地図を大きく' },
  { value: 'even', label: '半々', ratio: 0.5, title: '地図とグラフを半分ずつ' },
  { value: 'charts', label: 'グラフ', ratio: 0.22, title: 'グラフを大きく' },
] as const
type LayoutValue = (typeof LAYOUTS)[number]['value'] | 'custom'

const clampRatio = (r: number) => Math.min(Math.max(r, 0.15), 0.85)

function useSplitRatio() {
  const [ratio, setRatio] = useState(() => {
    try {
      const v = Number(localStorage.getItem(SPLIT_KEY))
      return v >= 0.15 && v <= 0.85 ? v : 0.58
    } catch {
      return 0.58
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(SPLIT_KEY, String(ratio))
    } catch {
      /* ignore */
    }
  }, [ratio])
  const layout: LayoutValue = LAYOUTS.find((l) => Math.abs(l.ratio - ratio) < 0.015)?.value ?? 'custom'
  return { ratio, setRatio, layout }
}

function LayoutSwitch({ layout, onRatio }: { layout: LayoutValue; onRatio: (r: number) => void }) {
  return (
    <Segmented
      size="sm"
      value={layout}
      onChange={(v) => {
        const hit = LAYOUTS.find((l) => l.value === v)
        if (hit) onRatio(hit.ratio)
      }}
      options={LAYOUTS.map((l) => ({
        value: l.value as LayoutValue,
        title: l.title,
        label: (
          <span className="flex items-center gap-1">
            <LayoutGlyph ratio={l.ratio} />
            {l.label}
          </span>
        ),
      }))}
    />
  )
}

/** Tiny picture of the split: map on top (dark), charts below (light). */
function LayoutGlyph({ ratio }: { ratio: number }) {
  return (
    <span aria-hidden className="flex h-[11px] w-[9px] flex-col overflow-hidden rounded-[2px] ring-1 ring-current">
      <span className="bg-current opacity-60" style={{ height: `${ratio * 100}%` }} />
    </span>
  )
}

function SplitView({
  top,
  bar,
  bottom,
  ratio,
  onRatio,
}: {
  top: ReactNode
  bar: ReactNode
  bottom: ReactNode
  ratio: number
  onRatio: (r: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const anim = dragging ? '' : 'transition-[flex-grow] duration-300 ease-out'

  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col">
      <div className={cn('min-h-[140px]', anim)} style={{ flex: `${ratio} 1 0` }}>
        {top}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label="地図とグラフの境界（上下キーで調整）"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={15}
        aria-valuemax={85}
        title="ドラッグで地図とグラフの比率を調整"
        className="group relative z-10 flex h-2 shrink-0 cursor-row-resize touch-none items-center justify-center border-t border-line bg-surface hover:bg-surface-2"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId) || !ref.current) return
          const r = ref.current.getBoundingClientRect()
          onRatio(clampRatio((e.clientY - r.top) / r.height))
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onRatio(clampRatio(ratio - 0.05))
          else if (e.key === 'ArrowDown') onRatio(clampRatio(ratio + 0.05))
          else return
          e.preventDefault()
        }}
      >
        <span className="h-[3px] w-8 rounded-full bg-line-strong group-hover:bg-ink-3" />
      </div>
      {bar}
      <div className={cn('min-h-[120px] overflow-hidden', anim)} style={{ flex: `${1 - ratio} 1 0` }}>
        {bottom}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Bottom panel */

function BottomPanel({
  tab,
  onTab,
  track,
  layoutSwitch,
}: {
  tab: PanelTab
  onTab: (t: PanelTab) => void
  track: Track
  layoutSwitch: ReactNode
}) {
  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-1.5">
        <Segmented
          size="sm"
          value={tab}
          onChange={onTab}
          options={[
            { value: 'charts', label: 'グラフ' },
            { value: 'events', label: 'イベント' },
          ]}
        />
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Summary track={track} inline />
        </div>
        <div className="shrink-0">{layoutSwitch}</div>
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto p-2">
        <Suspense fallback={null}>
          {tab === 'charts' ? (
            <ChartGrid track={track} />
          ) : (
            <div className="rounded-[8px] border border-line bg-surface px-3 py-1">
              <EventList track={track} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}

function Summary({ track, inline = false }: { track: Track; inline?: boolean }) {
  const s = track.summary
  const items: [string, string, string, string?][] = [
    ['最高高度', fmt(s.apogee / 1000, 1), 'km', `T+${fmt(s.apogeeTime, 0)} s`],
    ['最大速度', fmt(s.maxSpeed, 0), 'm/s', `M ${fmt(s.maxMach, 1)}`],
    ['最大動圧', fmt(s.maxQ / 1000, 1), 'kPa', `T+${fmt(s.maxQTime, 0)} s`],
    ['最大加速度', fmt(s.maxAccel, 1), 'G'],
    [s.landed ? '落下距離' : '到達距離', fmt(s.range, 1), 'km'],
    ['飛行時間', fmt(s.duration, 0), 's'],
  ]
  return (
    <dl
      className={cn(
        inline
          ? 'flex items-baseline gap-5 whitespace-nowrap'
          : 'mb-2 grid grid-cols-2 gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-3',
      )}
    >
      {items.map(([k, v, u, sub]) => (
        <div key={k} className={cn(inline ? 'flex items-baseline gap-1.5' : 'bg-surface px-3 py-2')}>
          <dt className="text-[11px] text-ink-3">{k}</dt>
          <dd className={cn('num', inline ? 'text-[12px]' : 'text-[15px]')}>
            {v}
            <span className="text-[11px] text-ink-3"> {u}</span>
            {sub && !inline && <span className="ml-1.5 text-[11px] text-ink-3">{sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/* ---------------------------------------------------------- Vehicle picker */

const PRESET_SPECS = PRESET_OPTIONS.map((p) => ({ preset: p, specs: computeSpecs(p.create()) }))

function VehiclePicker({ name, presetId, onPreset }: { name: string; presetId: string; onPreset: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = PRESET_OPTIONS.find((p) => p.id === presetId)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  return (
    <div ref={ref} className="relative min-w-0 flex-1 sm:flex-none">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left hover:bg-surface-2 sm:w-auto"
      >
        <span className="min-w-0 truncate text-[13px] font-medium">{current ? current.label : name || 'カスタム'}</span>
        <span className="hidden truncate text-[12px] text-ink-3 md:inline">{current ? current.kind : '編集中の設定'}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="機体を選ぶ"
          className="fixed inset-x-2 top-12 z-50 rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)] sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:w-[26rem]"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-[11px] text-ink-3">
            サンプル機体{presetId === 'custom' ? ' — 選ぶと現在の編集内容は置き換わります' : ''}
          </p>
          {PRESET_SPECS.map(({ preset, specs }) => {
            const active = preset.id === presetId
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setOpen(false)
                  onPreset(preset.id)
                }}
                className={cn('block w-full rounded-[7px] px-2.5 py-2 text-left hover:bg-surface-2', active && 'bg-surface-2')}
              >
                <span className="flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold">{preset.label}</span>
                  <span className="text-[12px] text-ink-2">{preset.kind}</span>
                  {active && <Check className="ml-auto h-3.5 w-3.5 self-center text-ink" />}
                </span>
                <span className="num mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-2">
                  <span>{specs.stages.length}段</span>
                  <span>{fmtMass(specs.liftoffMass)}</span>
                  <span>推力 {fmtForce(specs.liftoffThrust)}</span>
                  <span>Δv {(specs.dvTotal / 1000).toFixed(1)} km/s</span>
                  <span className="text-ink-3">{preset.site}</span>
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-ink-3">{preset.description}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
