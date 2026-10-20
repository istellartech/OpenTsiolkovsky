// A tiny external store for the playhead. The 3D view, the charts and the
// telemetry readout all subscribe to it, so scrubbing in one place moves
// everything else without re-rendering the whole React tree.
import { useSyncExternalStore } from 'react'

export interface PlaybackState {
  t: number
  t0: number
  t1: number
  playing: boolean
  /** Simulated seconds per real second */
  speed: number
}

type Listener = () => void

export const SPEEDS = [1, 2, 5, 10, 20, 50, 100, 200, 500]

/** A playback rate that plays the whole flight in roughly 20 seconds. */
export function suggestedSpeed(duration: number): number {
  const target = duration / 20
  return SPEEDS.find((s) => s >= target) ?? SPEEDS[SPEEDS.length - 1]
}

export function createPlayback() {
  let state: PlaybackState = { t: 0, t0: 0, t1: 1, playing: false, speed: 10 }
  const listeners = new Set<Listener>()
  let raf: number | null = null
  let lastFrame = 0

  function emit() {
    for (const l of listeners) l()
  }

  function set(patch: Partial<PlaybackState>) {
    state = { ...state, ...patch }
    emit()
  }

  function tick(now: number) {
    const dt = (now - lastFrame) / 1000
    lastFrame = now
    const next = state.t + dt * state.speed
    if (next >= state.t1) {
      set({ t: state.t1, playing: false })
      raf = null
      return
    }
    set({ t: next })
    raf = requestAnimationFrame(tick)
  }

  const player = {
    get: () => state,
    subscribe: (l: Listener) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
    load(t0: number, t1: number, opts: { keepTime?: boolean; speed?: number } = {}) {
      const t = opts.keepTime ? Math.min(Math.max(state.t, t0), t1) : t0
      set({ t0, t1, t, speed: opts.speed ?? state.speed })
    },
    seek(t: number) {
      set({ t: Math.min(Math.max(t, state.t0), state.t1) })
    },
    step(dt: number) {
      player.seek(state.t + dt)
    },
    play() {
      if (state.playing) return
      const t = state.t >= state.t1 ? state.t0 : state.t
      set({ playing: true, t })
      lastFrame = performance.now()
      raf = requestAnimationFrame(tick)
    },
    pause() {
      if (raf !== null) cancelAnimationFrame(raf)
      raf = null
      set({ playing: false })
    },
    toggle() {
      if (state.playing) player.pause()
      else player.play()
    },
    setSpeed(speed: number) {
      set({ speed })
    },
  }

  return player
}

export const playback = createPlayback()
export type PlaybackController = ReturnType<typeof createPlayback>

export function usePlayback<T>(selector: (s: PlaybackState) => T, player: PlaybackController = playback): T {
  return useSyncExternalStore(player.subscribe, () => selector(player.get()))
}
