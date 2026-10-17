import { useCallback, useMemo, useRef, useState } from 'react'
import { FolderOpen, Globe as GlobeIcon, LineChart, SlidersHorizontal, X } from 'lucide-react'
import { useSimulation } from './hooks/useSimulation'
import { useMediaQuery } from './hooks/useMediaQuery'
import { useFileDrop } from './hooks/useFileDrop'
import { usePlayerKeys, usePlayerTrack } from './hooks/usePlayer'
import { Inspector, navForField, type InspectorNav } from './components/Inspector'
import { FieldContext, IconButton } from './components/primitives'
import { PlaybackBar } from './components/Playback'
import { Header } from './components/Header'
import type { FileActions } from './components/FileMenu'
import { LayoutSwitch, SplitView, useSplitRatio } from './components/SplitView'
import { BottomPanel, MobileResults, type PanelTab } from './components/BottomPanel'
import { GlobeStage } from './components/GlobeStage'
import { Toast, useToast } from './components/Toast'
import { trackToCsv } from './lib/trajectory'
import { computeSpecs } from './lib/specs'
import { generateKML } from './lib/kml'
import { fileBase, saveFile } from './lib/download'
import { cn } from './lib/cn'
import type { ValidationIssue } from './lib/validation'

type MobileView = 'params' | 'globe' | 'charts'

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
  const { toast, show: showToast, dismiss: dismissToast } = useToast()

  usePlayerTrack(track)
  usePlayerKeys()

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
  const openFiles = (fs: File[]) => sim.importFiles(fs).then((r) => showToast(r.message, r.ok ? 'ok' : 'error'))
  const files: FileActions = {
    base,
    open: openFiles,
    saveJson: () => saveFile(`${base}.json`, JSON.stringify(config, null, 2), 'application/json'),
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

  const globe = <GlobeStage track={track} status={sim.status} error={sim.error} compactTelemetry={isMobile || split.ratio < 0.35} />

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
              {mobileView === 'charts' && track && <MobileResults track={track} />}
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

      <Toast toast={toast} onDismiss={dismissToast} />
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-6">
          <div className="rounded-[12px] border-2 border-dashed border-ink-3 bg-surface px-8 py-6 text-center">
            <FolderOpen className="mx-auto mb-2 h-6 w-6 text-ink-2" />
            <p className="text-[14px] font-semibold">ドロップして設定ファイルを開く</p>
            <p className="mt-1 text-[12px] text-ink-3">このアプリの設定 .json、または CLI 用 param_*.json と CSV をまとめて</p>
          </div>
        </div>
      )}

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
