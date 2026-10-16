import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Download, Globe as GlobeIcon, LineChart, SlidersHorizontal, Upload, X } from 'lucide-react'
import { useSimulation, type RunStatus } from './hooks/useSimulation'
import { PRESET_OPTIONS } from './config/defaults'
import { Inspector } from './components/Inspector'
import { FieldContext, IconButton, Segmented } from './components/primitives'
import { PlaybackBar, Telemetry } from './components/Playback'
import { playback, suggestedSpeed } from './lib/playback'
import { trackToCsv, type Track } from './lib/trajectory'
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

  const focusIssue = (issue: ValidationIssue) => {
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
      <Inspector config={config} patch={sim.patch} />
    </FieldContext.Provider>
  )

  const globe = (
    <div className="relative h-full w-full">
      <Suspense fallback={<div className="h-full w-full bg-black" />}>
        <Globe track={track} />
      </Suspense>
      {track && (
        <div className="absolute left-3 top-3">
          <Telemetry track={track} compact={isMobile} />
        </div>
      )}
      {!track && sim.status !== 'running' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-white/70">
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
        onPreset={sim.applyPreset}
        onImport={sim.importConfig}
        exports={exports}
        hasResult={!!track}
        status={sim.status}
        ms={result?.ms}
        points={result?.states.length}
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
          <aside className="scroll-quiet w-[340px] shrink-0 overflow-y-auto border-r border-line bg-surface">{inspector}</aside>
        )}
        {!isDesktop && !isMobile && drawerOpen && (
          <>
            <div className="absolute inset-0 z-20 bg-black/25" onClick={() => setDrawerOpen(false)} />
            <aside className="scroll-quiet absolute inset-y-0 left-0 z-30 w-[360px] max-w-[90vw] overflow-y-auto border-r border-line bg-surface shadow-[8px_0_24px_-12px_rgba(0,0,0,0.25)]">
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
              top={globe}
              bar={track ? <PlaybackBar track={track} /> : null}
              bottom={
                track ? (
                  <BottomPanel tab={panelTab} onTab={setPanelTab} track={track} />
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
  ms?: number
  points?: number
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
      <label className="min-w-0 flex-1 sm:flex-none">
        <span className="sr-only">プリセット</span>
        <select
          value={props.presetId}
          onChange={(e) => props.onPreset(e.target.value)}
          className="h-8 w-full cursor-pointer truncate rounded-[6px] border border-transparent bg-transparent pl-1.5 pr-1 text-[13px] text-ink-2 hover:border-line sm:w-auto sm:max-w-[16rem]"
        >
          {props.presetId === 'custom' && <option value="custom">{props.name || 'カスタム'}（編集中）</option>}
          {PRESET_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

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
  ms,
  points,
  error,
  issues,
  onIssue,
  compact,
}: {
  status: RunStatus
  ms?: number
  points?: number
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
        : `計算済み · ${ms} ms · ${points?.toLocaleString('ja-JP')} 点`
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

function SplitView({ top, bar, bottom }: { top: ReactNode; bar: ReactNode; bottom: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(() => {
    try {
      const v = Number(localStorage.getItem(SPLIT_KEY))
      return v > 0.15 && v < 0.9 ? v : 0.58
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

  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-[160px]" style={{ flex: `${ratio} 1 0` }}>
        {top}
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="表示領域の境界"
        className="relative z-10 h-0 cursor-row-resize"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId) || !ref.current) return
          const r = ref.current.getBoundingClientRect()
          setRatio(Math.min(Math.max((e.clientY - r.top) / r.height, 0.2), 0.85))
        }}
      >
        <div className="absolute inset-x-0 -top-1.5 h-3" />
      </div>
      {bar}
      <div className="min-h-[120px] overflow-hidden" style={{ flex: `${1 - ratio} 1 0` }}>
        {bottom}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ Bottom panel */

function BottomPanel({ tab, onTab, track }: { tab: PanelTab; onTab: (t: PanelTab) => void; track: Track }) {
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
