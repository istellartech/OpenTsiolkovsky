import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useSimulation } from './hooks/useSimulation'
import { useMonteCarlo } from './hooks/useMonteCarlo'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useFileDrop } from './hooks/useFileDrop'
import { usePlayerKeys, usePlayerTrack } from './hooks/usePlayer'
import { useUndoKeys } from './hooks/useUndoKeys'
import { useOpenSharedLink } from './hooks/useShareLink'
import { Inspector, navForField, type InspectorNav } from './components/Inspector'
import { FieldContext } from './components/primitives'
import { PlaybackBar } from './components/Playback'
import { Header, type Workspace } from './components/Header'
import type { FileActions } from './components/FileMenu'
import { LayoutSwitch, SplitView, useSplitRatio } from './components/SplitView'
import { BottomPanel, MobileResults, type CompareProps, type McProps, type PanelTab, type Reference } from './components/BottomPanel'
import type { DispersionOverlay } from './components/Globe'
import { GlobeStage } from './components/GlobeStage'
import { Toast, useToast } from './components/Toast'
import { AppMenu } from './components/AppMenu'
import { HelpDialog } from './components/HelpDialog'
import { samplesToCsv } from './lib/trajectory'
import { computeSpecs } from './lib/specs'
import { generateKML } from './lib/kml'
import { fileBase, saveFile } from './lib/download'
import { buildShareUrl } from './lib/share'
import { DEFAULT_ELLIPSE } from './lib/montecarlo'
import { cn } from './lib/cn'
import type { ValidationIssue } from './lib/validation'
import type { Config } from './lib/config'
import { CaseDetails } from './components/CaseDetails'
import { WorkspaceNav } from './components/WorkspaceNav'
import { caseFile, type CaseContext } from './lib/case'
import type { OptimizationControls } from './lib/workspace'
import { tr, useLang } from './lib/i18n'

type MobileView = 'params' | 'globe' | 'charts'
const OptimizationWorkspace = lazy(() => import('./components/OptimizationWorkspace').then((m) => ({ default: m.OptimizationWorkspace })))
const WORKSPACE_KEY = 'ot-workspace'
function storedWorkspace(): Workspace {
  try {
    return localStorage.getItem(WORKSPACE_KEY) === 'optimize' ? 'optimize' : 'simulate'
  } catch {
    return 'simulate'
  }
}

export default function App() {
  // Every string is picked at render time, so re-render the tree on a language switch.
  const lang = useLang()
  const sim = useSimulation()
  const { config, result } = sim
  const track = result?.track ?? null

  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const isPhone = useMediaQuery('(max-width: 767px)')
  // Phones and tablets share one layout: a single view at a time, picked from the bottom bar.
  const isMobile = !isDesktop
  const [mobileView, setMobileView] = useState<MobileView>('globe')
  const [panelTab, setPanelTab] = useState<PanelTab>('charts')
  const split = useSplitRatio()
  const { toast, show: showToast, dismiss: dismissToast } = useToast()

  const [helpOpen, setHelpOpen] = useState(false)
  // Trajectory simulation and optimization are two workspaces on one vehicle
  // model. The optimizer stays mounted once opened, so a solve keeps running
  // while the simulation is shown.
  const [workspace, setWorkspaceState] = useState<Workspace>(storedWorkspace)
  const [optimizerMounted, setOptimizerMounted] = useState(workspace === 'optimize')
  const setWorkspace = (w: Workspace) => {
    setWorkspaceState(w)
    if (w === 'optimize') setOptimizerMounted(true)
    try {
      localStorage.setItem(WORKSPACE_KEY, w)
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }
  const [optControls, setOptControls] = useState<OptimizationControls | null>(null)
  const [caseDetails, setCaseDetails] = useState(false)
  const [pendingOptimization, setPendingOptimization] = useState(false)
  const optimizeSimulation = () => {
    setWorkspace('optimize')
    if (optControls?.running) optControls.showResults()
    else setPendingOptimization(true)
  }
  useEffect(() => {
    if (pendingOptimization && optControls) {
      setPendingOptimization(false)
      optControls.fromSimulation()
    }
  }, [pendingOptimization, optControls])
  const simulating = workspace === 'simulate'
  usePlayerTrack(track, result?.caseId, simulating)
  const optimizationWasRunning = useRef(false)
  useEffect(() => {
    if (optimizationWasRunning.current && optControls && !optControls.running && simulating)
      showToast(optControls.status, optControls.resultPassed ? 'ok' : 'error')
    optimizationWasRunning.current = optControls?.running ?? false
  }, [optControls, simulating, showToast])
  usePlayerKeys(() => setHelpOpen((v) => !v), simulating)
  useUndoKeys(sim.undo, sim.redo, simulating)
  useOpenSharedLink(sim.load, showToast)

  const [reference, setReference] = useState<Reference | null>(null)
  const compare: CompareProps = {
    reference,
    onPin: () => track && setReference({ track, label: result?.context.name || tr('カスタム', 'Custom') }),
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
  }

  const focusIssue = (issue: ValidationIssue) => {
    setNav(navForField(issue.field))
    revealParams()
    requestAnimationFrame(() => {
      const el = fieldRefs.current.get(issue.field)
      // A folded group hides its fields; open it first.
      const fold = el?.closest('details')
      if (fold && !fold.open) fold.open = true
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
        ? {
            presentation: mcResult.presentation,
            cases: mcResult.cases,
            statistics: mcResult.statistics,
            lastStage: config.stages.length,
            ellipse: mc.settings.ellipse ?? DEFAULT_ELLIPSE,
          }
        : null,
    [mcResult, mc.stale, config.stages.length, mc.settings.ellipse],
  )
  const openFiles = (fs: File[]) => sim.importFiles(fs).then((r) => showToast(r.message, r.ok ? 'ok' : 'error'))
  const files: FileActions = {
    base,
    open: openFiles,
    saveCase: () => saveFile(`${base}.otcase.json`, caseFile('simulate', sim.context, config), 'application/json'),
    saveJson: () => saveFile(`${base}.json`, JSON.stringify(config, null, 2), 'application/json'),
    copyLink: async () => {
      try {
        const url = await buildShareUrl(window.location.href, config, sim.presetId, sim.context)
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
    saveCsv: () => track && saveFile(`${base}_trajectory.csv`, samplesToCsv(track.raw), 'text/csv'),
    saveKml: () => track && saveFile(`${base}_trajectory.kml`, generateKML(track, config.name), 'application/vnd.google-earth.kml+xml'),
  }
  const dragging = useFileDrop(openFiles, simulating)
  const openOptimized = (optimized: Config, notes: string[], context?: CaseContext) => {
    sim.load(optimized, 'custom', context)
    setNav({ tab: 'overview', stage: 0 })
    setWorkspace('simulate')
    showToast(
      tr(
        '軌道計算のケースを作成しました。近似・質量内訳はケース情報で確認できます。',
        'Simulation case created. Case details retain approximations and the mass breakdown.',
      ),
      'ok',
    )
    void notes
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
        onOptimize={optControls?.running ? undefined : optimizeSimulation}
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
      compactTelemetry={isPhone || split.ratio < 0.35}
    />
  )

  return (
    <div className="fixed inset-0 flex flex-col">
      <Header
        workspace={workspace}
        context={sim.context}
        optimization={optControls}
        onCaseDetails={() => setCaseDetails(true)}
        onWorkspace={setWorkspace}
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
        hasResult={!!track && result?.config === config}
        status={sim.status}
        error={sim.error}
        issues={sim.issues}
        onIssue={focusIssue}
        compact={isPhone}
        history={{ canUndo: sim.canUndo, canRedo: sim.canRedo, undo: sim.undo, redo: sim.redo }}
        actions={<AppMenu onHelp={() => setHelpOpen(true)} />}
      />

      <div className={cn('relative flex min-h-0 flex-1', !simulating && 'hidden')}>
        {/* Parameters */}
        {isDesktop && (
          <aside className="scroll-quiet w-[372px] shrink-0 overflow-y-auto border-r border-line bg-surface">{inspector}</aside>
        )}
        {isMobile && mobileView === 'params' && (
          <div className="scroll-quiet absolute inset-0 z-10 overflow-y-auto bg-surface">
            <div className="mx-auto max-w-[36rem]">{inspector}</div>
          </div>
        )}

        {/* Main stage */}
        <main className="flex min-w-0 flex-1 flex-col">
          {result && result.config !== config ? (
            <p role="status" className="shrink-0 border-b border-line bg-surface-2 px-3 py-1 text-[11px] text-ink-2">
              {tr('前の入力の結果を表示中', 'Showing the previous input’s result')}: {result.context.name} · {result.context.id.slice(0, 6)}{' '}
              · r{result.context.revision}
            </p>
          ) : null}
          {isMobile ? (
            <>
              <div className={cn('min-h-0 flex-1', mobileView !== 'globe' && 'hidden')}>{globe}</div>
              {mobileView === 'charts' && track && (
                <MobileResults tab={panelTab} onTab={setPanelTab} track={track} compare={compare} montecarlo={montecarlo} />
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

      {optimizerMounted && (
        <div className={cn('min-h-0 flex-1', simulating && 'hidden')}>
          <Suspense fallback={<div className="flex h-full items-center justify-center text-ink-3">{tr('読み込み中…', 'Loading…')}</div>}>
            <OptimizationWorkspace
              simConfig={config}
              simContext={sim.context}
              simFlight={
                track && result?.config === config
                  ? { apogeeM: track.summary.apogee, apogeeTimeS: track.summary.apogeeTime, maxQPa: track.summary.maxQ }
                  : undefined
              }
              active={!simulating}
              onControls={setOptControls}
              onOpenInSimulation={openOptimized}
            />
          </Suspense>
        </div>
      )}

      {caseDetails && (simulating || optControls) ? (
        <CaseDetails
          context={simulating ? sim.context : optControls!.context}
          config={simulating ? config : undefined}
          onChange={simulating ? sim.updateContext : undefined}
          onClose={() => setCaseDetails(false)}
        />
      ) : null}
      <Toast toast={toast} onDismiss={dismissToast} />
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} showShortcuts={!isPhone} />}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-6">
          <div className="rounded-[12px] border-2 border-dashed border-ink-3 bg-surface px-8 py-6 text-center">
            <FolderOpen className="mx-auto mb-2 h-6 w-6 text-ink-2" />
            <p className="text-[14px] font-semibold">{tr('ドロップして設定ファイルを開く', 'Drop to open a settings file')}</p>
            <p className="mt-1 text-[12px] text-ink-3">
              {tr('設定の .json（表の CSV も一緒にドロップできます）', 'A configuration .json, with its CSV tables if it uses any')}
            </p>
          </div>
        </div>
      )}

      {isMobile && simulating ? <WorkspaceNav value={mobileView} onChange={setMobileView} /> : null}
    </div>
  )
}
