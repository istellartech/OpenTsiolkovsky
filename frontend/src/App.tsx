import { useCallback, useMemo, useRef, useState } from 'react'
import { FolderOpen, Globe as GlobeIcon, Keyboard, LineChart, SlidersHorizontal, X } from 'lucide-react'
import { useSimulation } from './hooks/useSimulation'
import { useMonteCarlo } from './hooks/useMonteCarlo'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useFileDrop } from './hooks/useFileDrop'
import { usePlayerKeys, usePlayerTrack } from './hooks/usePlayer'
import { useUndoKeys } from './hooks/useUndoKeys'
import { useOpenSharedLink } from './hooks/useShareLink'
import { Inspector, navForField, type InspectorNav } from './components/Inspector'
import { FieldContext, IconButton } from './components/primitives'
import { PlaybackBar } from './components/Playback'
import { Header } from './components/Header'
import type { FileActions } from './components/FileMenu'
import { LayoutSwitch, SplitView, useSplitRatio } from './components/SplitView'
import { BottomPanel, MobileResults, type CompareProps, type McProps, type PanelTab, type Reference } from './components/BottomPanel'
import type { DispersionOverlay } from './components/Globe'
import { GlobeStage } from './components/GlobeStage'
import { Toast, useToast } from './components/Toast'
import { ThemeToggle } from './components/ThemeToggle'
import { LangToggle } from './components/LangToggle'
import { ShortcutsDialog } from './components/ShortcutsDialog'
import { trackToCsv } from './lib/trajectory'
import { computeSpecs } from './lib/specs'
import { generateKML } from './lib/kml'
import { fileBase, saveFile } from './lib/download'
import { buildShareUrl } from './lib/share'
import { cn } from './lib/cn'
import type { ValidationIssue } from './lib/validation'
import { tr, useLang } from './lib/i18n'
import { withIll } from './lib/ill'

type MobileView = 'params' | 'globe' | 'charts'

export default function App() {
  // Every string is picked at render time, so re-render the tree on a language switch.
  const lang = useLang()
  const sim = useSimulation()
  const { config, result } = sim
  const track = useMemo(() => (result ? withIll(result.track, config.ill) : null), [result, config.ill])

  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isMobile = useMediaQuery('(max-width: 767px)')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [mobileView, setMobileView] = useState<MobileView>('globe')
  const [panelTab, setPanelTab] = useState<PanelTab>('charts')
  const split = useSplitRatio()
  const { toast, show: showToast, dismiss: dismissToast } = useToast()

  usePlayerTrack(track)
  const [helpOpen, setHelpOpen] = useState(false)
  usePlayerKeys(() => setHelpOpen((v) => !v))
  useUndoKeys(sim.undo, sim.redo)
  useOpenSharedLink(sim.load, showToast)

  const [reference, setReference] = useState<Reference | null>(null)
  const compare: CompareProps = {
    reference,
    onPin: () => track && setReference({ track, label: config.name || tr('カスタム', 'Custom') }),
    onUnpin: () => setReference(null),
  }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- warnings are worded in the UI language
  const specs = useMemo(() => computeSpecs(config), [config, lang])

  /** Bring the parameter panel into view on any layout. */
  const revealParams = () => {
    if (isMobile) setMobileView('params')
    else if (!isDesktop) setDrawerOpen(true)
  }

  const focusIssue = (issue: ValidationIssue) => {
    setNav(navForField(issue.field))
    revealParams()
    requestAnimationFrame(() => {
      const el = fieldRefs.current.get(issue.field)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.focus?.()
    })
  }

  const base = fileBase(config.name)

  // Monte Carlo dispersion runs; drawn on the globe while they match the inputs.
  const mc = useMonteCarlo(config)
  const montecarlo: McProps = { mc, fileBase: base }
  const mcResult = mc.result
  const dispersion = useMemo<DispersionOverlay | null>(
    () =>
      mcResult && !mc.stale && mcResult.cases.length > 0
        ? { cases: mcResult.cases, statistics: mcResult.statistics, lastStage: config.stages.length }
        : null,
    [mcResult, mc.stale, config.stages.length],
  )
  const openFiles = (fs: File[]) => sim.importFiles(fs).then((r) => showToast(r.message, r.ok ? 'ok' : 'error'))
  const files: FileActions = {
    base,
    open: openFiles,
    saveJson: () => saveFile(`${base}.json`, JSON.stringify(config, null, 2), 'application/json'),
    copyLink: async () => {
      try {
        const url = await buildShareUrl(window.location.href, config, sim.presetId)
        await navigator.clipboard.writeText(url)
        showToast(
          url.length > 8000
            ? tr(
                '共有リンクをコピーしました（長いため、使う場所によっては途中で切れることがあります）。',
                'Share link copied. It is long, so some apps may cut it off.',
              )
            : tr('共有リンクをコピーしました。', 'Share link copied.'),
          'ok',
        )
      } catch {
        showToast(tr('共有リンクをコピーできませんでした。', 'Could not copy the share link.'), 'error')
      }
    },
    saveCsv: () => track && saveFile(`${base}_trajectory.csv`, trackToCsv(track), 'text/csv'),
    saveKml: () => track && saveFile(`${base}_trajectory.kml`, generateKML(track, config.name), 'application/vnd.google-earth.kml+xml'),
  }
  const dragging = useFileDrop(openFiles)

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
    <GlobeStage
      track={track}
      reference={reference?.track ?? null}
      dispersion={dispersion}
      status={sim.status}
      error={sim.error}
      compactTelemetry={isMobile || split.ratio < 0.35}
    />
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
        onBlank={() => {
          sim.startBlank()
          setNav({ tab: 'vehicle', stage: 0 })
          revealParams()
        }}
        files={files}
        hasResult={!!track}
        status={sim.status}
        error={sim.error}
        issues={sim.issues}
        onIssue={focusIssue}
        showDrawerToggle={!isDesktop && !isMobile}
        onToggleDrawer={() => setDrawerOpen((v) => !v)}
        compact={isMobile}
        history={{ canUndo: sim.canUndo, canRedo: sim.canRedo, undo: sim.undo, redo: sim.redo }}
        actions={
          <>
            {!isMobile && (
              <IconButton label={tr('キーボードショートカット (?)', 'Keyboard shortcuts (?)')} onClick={() => setHelpOpen(true)}>
                <Keyboard className="h-4 w-4" />
              </IconButton>
            )}
            <LangToggle />
            <ThemeToggle />
          </>
        }
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
                <span className="text-[13px] font-semibold">{tr('パラメータ', 'Parameters')}</span>
                <IconButton label={tr('閉じる', 'Close')} onClick={() => setDrawerOpen(false)}>
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
              {mobileView === 'charts' && track && <MobileResults track={track} compare={compare} montecarlo={montecarlo} />}
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
                    compare={compare}
                    montecarlo={montecarlo}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-3">
                    {sim.status === 'running' ? tr('計算中…', 'Computing…') : ''}
                  </div>
                )
              }
            />
          )}
        </main>
      </div>

      <Toast toast={toast} onDismiss={dismissToast} />
      {helpOpen && <ShortcutsDialog onClose={() => setHelpOpen(false)} />}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-6">
          <div className="rounded-[12px] border-2 border-dashed border-ink-3 bg-surface px-8 py-6 text-center">
            <FolderOpen className="mx-auto mb-2 h-6 w-6 text-ink-2" />
            <p className="text-[14px] font-semibold">{tr('ドロップして設定ファイルを開く', 'Drop to open a settings file')}</p>
            <p className="mt-1 text-[12px] text-ink-3">
              {tr(
                'このアプリの設定 .json、または CLI 用 param_*.json と CSV をまとめて',
                'A .json saved from this app, or a CLI param_*.json together with its CSV files',
              )}
            </p>
          </div>
        </div>
      )}

      {isMobile && (
        <nav className="grid grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]">
          {(
            [
              ['params', tr('パラメータ', 'Parameters'), SlidersHorizontal],
              ['globe', '3D', GlobeIcon],
              ['charts', tr('グラフ', 'Charts'), LineChart],
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
              {id === 'params' && sim.issues.length > 0 && (
                <span className="sr-only">{tr('（入力エラーあり）', ' (has input errors)')}</span>
              )}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
