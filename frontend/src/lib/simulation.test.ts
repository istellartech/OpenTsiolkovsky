// End-to-end: every sample vehicle through the real WASM solver. Needs the
// wasm-pack bundle in src/wasm (scripts/wasm_build.sh); skipped without it.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS } from '../config/presets'
import { runSimulation } from './simulation'
import { buildTrack } from './trajectory'

const wasmPath = fileURLToPath(new URL('../wasm/openTsiolkovsky_bg.wasm', import.meta.url))

/** Published apogees the sounding-rocket presets are tuned to [km]. */
const APOGEE_KM: Record<string, number> = { momo: 113.4, s310: 180, s520: 304 }

describe.skipIf(!existsSync(wasmPath))('WASM solver', () => {
  beforeAll(async () => {
    // In Node the bundle cannot fetch its .wasm; hand it the bytes once.
    const mod = await import('../wasm/openTsiolkovsky.js')
    await mod.default({ module_or_path: readFileSync(wasmPath) })
  })

  it.each(PRESET_OPTIONS.map((p) => [p.id, p] as const))('flies %s', async (id, preset) => {
    const track = buildTrack(await runSimulation(preset.create()))
    expect(track).not.toBeNull()
    if (!track) return
    expect(track.truncatedAt).toBeUndefined()
    const apogeeKm = track.summary.apogee / 1000
    if (id in APOGEE_KM) {
      expect(apogeeKm).toBeGreaterThan(APOGEE_KM[id] * 0.97)
      expect(apogeeKm).toBeLessThan(APOGEE_KM[id] * 1.03)
      expect(track.summary.landed).toBe(true)
    } else {
      expect(apogeeKm).toBeGreaterThan(150)
      expect(track.summary.maxSpeed).toBeGreaterThan(7000)
    }
  })
})
