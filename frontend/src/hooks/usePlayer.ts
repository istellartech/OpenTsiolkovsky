import { useEffect, useRef } from 'react'
import { playback, suggestedSpeed, type PlaybackController } from '../lib/playback'
import { useLatest } from './useLatest'
import type { Track } from '../lib/trajectory'

/**
 * Load each new result into the shared player. The first one plays at once;
 * later ones keep the current time, and the speed only changes when the
 * flight duration changed by more than 2×.
 */
export function usePlayerTrack(track: Track | null, caseId?: string, active = true) {
  const loadedOnce = useRef(false)
  const lastDuration = useRef(0)
  const lastCase = useRef(caseId)
  useEffect(() => {
    if (!track) return
    const duration = track.t1 - track.t0
    const changedScale = Math.abs(Math.log((duration || 1) / (lastDuration.current || 1))) > Math.log(2)
    if (!loadedOnce.current) {
      loadedOnce.current = true
      playback.load(track.t0, track.t1, { speed: suggestedSpeed(duration) })
      if (active) playback.play()
    } else if (caseId && caseId !== lastCase.current) {
      playback.pause()
      playback.load(track.t0, track.t1, { speed: suggestedSpeed(duration) })
      playback.seek(track.t1)
    } else {
      playback.load(track.t0, track.t1, { keepTime: true, speed: changedScale ? suggestedSpeed(duration) : undefined })
    }
    if (!active) playback.pause()
    lastDuration.current = duration
    lastCase.current = caseId
  }, [track, caseId, active])
}

/** True when a key press is meant for a form control rather than the app. */
export const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest('input, select, textarea, [contenteditable="true"], [role="slider"], dialog, [role=dialog]')

/** Space = play/pause, ←/→ = ±1 s (Shift: ±10 s), ? = `onHelp`; only `?` without `withPlayback`. */
export function usePlayerKeys(onHelp?: () => void, withPlayback = true, controller: PlaybackController = playback) {
  const help = useLatest(onHelp)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement
      if (e.key === '?') help.current?.()
      else if (!withPlayback) return
      else if (e.key === ' ' && !el.closest('button')) {
        e.preventDefault()
        controller.toggle()
      } else if (e.key === 'ArrowRight') controller.step(e.shiftKey ? 10 : 1)
      else if (e.key === 'ArrowLeft') controller.step(e.shiftKey ? -10 : -1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [help, withPlayback, controller])
}
