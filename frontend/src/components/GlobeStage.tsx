import { Suspense, lazy } from 'react'
import type { RunStatus } from '../hooks/useSimulation'
import type { Track } from '../lib/trajectory'
import { fmt } from '../lib/format'
import { ErrorBoundary } from './ErrorBoundary'
import { Telemetry } from './Playback'

const Globe = lazy(() => import('./Globe'))

/** The 3D view with its overlays: telemetry, stale-result and divergence notices. */
export function GlobeStage({
  track,
  status,
  error,
  compactTelemetry,
}: {
  track: Track | null
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
            <p>3D表示でエラーが発生しました。グラフと数値は引き続き使えます。</p>
            <button type="button" onClick={reset} className="h-8 rounded-[6px] border border-line-strong bg-surface px-3 text-[12px] hover:bg-surface-2">
              もう一度表示する
            </button>
          </div>
        )}
      >
        <Suspense fallback={<div className="h-full w-full bg-bg" />}>
          <Globe track={track} />
        </Suspense>
      </ErrorBoundary>
      {track?.truncatedAt !== undefined && (
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center px-3 md:bottom-auto md:top-12">
          <p className="max-w-[34rem] rounded-[8px] bg-surface px-3 py-1.5 text-center text-[12px] text-danger shadow-[0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-danger/30">
            T+{fmt(track.truncatedAt, 0)} s 以降は計算が発散したため表示していません（姿勢を固定したまま大気圏に再突入すると起きる既知の問題）。
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
            {status === 'invalid' ? '入力エラーのため、前回の計算結果を表示しています' : '計算エラーのため、前回の計算結果を表示しています'}
          </p>
        </div>
      )}
      {!track && status !== 'running' && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-[13px] text-ink-2">
          {status === 'invalid' ? '入力値を確認してください' : error}
        </div>
      )}
    </div>
  )
}
