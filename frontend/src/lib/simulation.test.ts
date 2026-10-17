/// <reference types="node" />
// End-to-end: every sample vehicle through the real WASM solver. Needs the
// wasm-pack bundle in src/wasm (scripts/wasm_build.sh); skipped without it.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS } from '../config/presets'
import { initWasm, runSimulation } from './simulation'
import { DEFAULT_DISPERSION, type CaseResult, type ImpactStatistics } from './montecarlo'
import { trackFromOutput } from './trajectory'

const wasmPath = fileURLToPath(new URL('../wasm/openTsiolkovsky_bg.wasm', import.meta.url))

/** Published apogees the sounding-rocket presets are tuned to [km]. */
const APOGEE_KM: Record<string, number> = { momo: 113.4, s310: 180, s520: 304 }

describe.skipIf(!existsSync(wasmPath))('WASM solver', () => {
  beforeAll(async () => {
    // In Node the bundle cannot fetch its .wasm; hand it the bytes once.
    const mod = await import('../wasm/openTsiolkovsky.js')
    await mod.default({ module_or_path: readFileSync(wasmPath) })
  })

  it('shares the default dispersion and runs Monte Carlo cases', async () => {
    const mod = await initWasm()
    expect(JSON.parse(mod.default_dispersion())).toEqual(DEFAULT_DISPERSION)
    const config = JSON.stringify(PRESET_OPTIONS.find((p) => p.id === 'ss520-5')!.create())
    const disp = JSON.stringify(DEFAULT_DISPERSION)
    const cases = [0, 1, 2].map((i) => JSON.parse(mod.monte_carlo_case(config, disp, 7, i)) as CaseResult)
    expect(cases.map((c) => c.impacts.map((i) => i.body))[0]).toEqual(['vehicle', 'stage1', 'stage2'])
    // Reproducible from (seed, index)
    expect(JSON.parse(mod.monte_carlo_case(config, disp, 7, 1))).toEqual(cases[1])
    const stats = JSON.parse(mod.monte_carlo_statistics(JSON.stringify(cases))) as ImpactStatistics[]
    expect(stats.map((s) => s.body)).toEqual(['vehicle', 'stage1', 'stage2'])
    expect(stats[1].impacts).toBe(3)
    expect(stats[1].ellipse_major_m).toBeGreaterThan(0)
  })

  it.each(PRESET_OPTIONS.map((p) => [p.id, p] as const))('flies %s', async (id, preset) => {
    const config = preset.create()
    const track = trackFromOutput(await runSimulation(config))
    expect(track).not.toBeNull()
    if (!track) return
    expect(track.truncatedAt).toBeUndefined()
    // Every spent stage is propagated from its separation
    expect(track.fallBodies.filter((b) => b.kind === 'stage')).toHaveLength(config.stages.length - 1)
    for (const body of track.fallBodies) expect(body.samples[0]?.t ?? body.releaseTime).toBeCloseTo(body.releaseTime, 6)
    // Powered at liftoff, with an impact point under the vehicle
    expect(track.samples[1].mode).toBe('power_3DoF')
    expect(track.samples[1].iipLat).not.toBeNull()
    const apogeeKm = track.summary.apogee / 1000
    if (id in APOGEE_KM) {
      expect(apogeeKm).toBeGreaterThan(APOGEE_KM[id] * 0.97)
      expect(apogeeKm).toBeLessThan(APOGEE_KM[id] * 1.03)
      expect(track.summary.landed).toBe(true)
      expect(track.impact).not.toBeNull()
      // Sounding rockets: every spent stage comes down
      for (const body of track.fallBodies) expect(body.impact).not.toBeNull()
    } else {
      expect(apogeeKm).toBeGreaterThan(150)
      expect(track.summary.maxSpeed).toBeGreaterThan(7000)
    }
  })
})
