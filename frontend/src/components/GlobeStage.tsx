import { Suspense, lazy } from 'react'
import type { RunStatus } from '../hooks/useSimulation'
import type { Track } from '../lib/trajectory'
import { fmt } from '../lib/format'
import { ErrorBoundary } from './ErrorBoundary'
import { Telemetry } from './Playback'
import { tr } from '../lib/i18n'

const Globe = lazy(() => import('./Globe'))

/** The 3D view with its overlays: telemetry, stale-result and divergence notices. */
export function GlobeStage({
  track,
  reference,
  status,
  error,
  compactTelemetry,
}: {
  track: Track | null
  reference: Track | null
  status: RunStatus
  error: string | null
  compactTelemetry: boolean
}) {
  return (
    <div className="relative h-full w-full">
      <ErrorBoundary
        resetKey={track}
        fallback={(reset) => (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-bg p-6 text-center text-[13px] text-ink-2">
            <p>
              {tr('3D表示でエラーが発生しました。グラフと数値は引き続き使えます。', 'The 3D view failed. Charts and figures still work.')}
            </p>
            <button
              type="button"
              onClick={reset}
              className="h-8 rounded-[6px] border border-line-strong bg-surface px-3 text-[12px] hover:bg-surface-2"
            >
              {tr('もう一度表示する', 'Try again')}
            </button>
          </div>
        )}
      >
        <Suspense fallback={<GlobeLoading />}>
          <Globe track={track} reference={reference} />
        </Suspense>
      </ErrorBoundary>
      {track?.truncatedAt !== undefined && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center px-3 md:bottom-auto md:top-12">
          <p className="max-w-[34rem] rounded-[8px] bg-surface px-3 py-1.5 text-center text-[12px] text-danger shadow-[0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-danger/30">
            {tr(
              `T+${fmt(track.truncatedAt, 0)} s 以降は計算が発散したため表示していません（姿勢を固定したまま大気圏に再突入すると起きる既知の問題）。`,
              `The run diverged after T+${fmt(track.truncatedAt, 0)} s and is not shown (a known issue when re-entering with a fixed attitude).`,
            )}
          </p>
        </div>
      )}
      {track && (
        <div className="absolute left-3 top-3">
          <Telemetry track={track} compact={compactTelemetry} />
        </div>
      )}
      {track && (status === 'invalid' || status === 'error') && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center px-3 md:bottom-auto md:top-3">
          <p className="rounded-full bg-surface px-3 py-1 text-[12px] text-danger shadow-[0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-danger/30">
            {status === 'invalid'
              ? tr('入力エラーのため、前回の計算結果を表示しています', 'Showing the previous result: the inputs have errors')
              : tr('計算エラーのため、前回の計算結果を表示しています', 'Showing the previous result: the solver failed')}
          </p>
        </div>
      )}
      {!track && status === 'running' && (
        <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
          <p className="flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-[12px] text-ink-2 ring-1 ring-line-strong">
            <Spinner /> {tr('計算中…', 'Computing…')}
          </p>
        </div>
      )}
      {!track && status !== 'running' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-ink-2">
          {status === 'invalid' ? tr('入力値を確認してください', 'Check the inputs') : error}
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line-strong border-t-ink-2" />
}

/** Shown while the 3D engine (a few MB) downloads on first visit. */
function GlobeLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-bg">
      <div className="flex flex-col items-center gap-3 text-[12px] text-ink-3">
        <div className="relative h-24 w-24 rounded-full bg-map ring-1 ring-line">
          <div className="absolute inset-0 animate-pulse rounded-full bg-surface-2/60" />
        </div>
        <span className="flex items-center gap-2">
          <Spinner /> {tr('3D 地図を読み込み中…', 'Loading 3D map…')}
        </span>
      </div>
    </div>
  )
}
