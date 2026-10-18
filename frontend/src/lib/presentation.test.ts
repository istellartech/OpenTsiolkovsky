import { afterEach, describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS } from '../config/presets'
import { displayEvents, displayName, phaseLabel, presentationFromConfig, structureLabel } from './presentation'
import { eventLabel, eventShort, fallBodyLabel, mcBodyLabel } from './events'
import { getLang, setLang } from './i18n'
import { validateConfig } from './validation'
import { decodePayload, encodePayload } from './share'
import { generateKML } from './kml'
import type { FlightEvent, Track } from './trajectory'
import type { Config } from './config'

const preset = (id: string) => PRESET_OPTIONS.find((p) => p.id === id)!.create()

describe('vehicle terminology', () => {
  const initial = getLang()
  afterEach(() => setLang(initial))

  it('keeps published stage counts separate from intervals and uses each vehicle’s convention', () => {
    setLang('ja')
    for (const [id, count, intervals] of [
      ['h2a202', 2, 3],
      ['h3-22s', 2, 3],
      ['ariane5', 2, 3],
      ['long-march-3b', 3, 4],
      ['soyuz-2.1a', 3, 3],
    ] as const) {
      const c = preset(id)
      expect(c.presentation?.stage_count).toBe(count)
      expect(c.stages).toHaveLength(intervals)
      expect(structureLabel(c.presentation, c.stages.length)).toContain(`${count}段式`)
      expect(validateConfig(c)).toEqual([])
    }
    expect(phaseLabel(presentationFromConfig(preset('soyuz-2.1a')), 1)).toBe('第1・2段同時燃焼')
    expect(structureLabel(undefined, 3)).toBe('3計算区間')
    expect(phaseLabel(undefined, 3)).toBe('区間3')
  })

  it('shares names across events, released bodies, Monte Carlo and KML, with live translation', () => {
    const p = presentationFromConfig(preset('h3-22s'))
    const separation: FlightEvent = { kind: 'separation', t: 116, stage: 1, nextStage: 2 }
    const body = { id: 'stage1', stage: 1, kind: 'stage' as const }
    setLang('ja')
    expect(eventLabel(separation, p)).toBe('SRB-3 ×2 分離')
    expect(fallBodyLabel(body, p)).toBe('SRB-3 ×2')
    expect(mcBodyLabel(body.id, p)).toBe('SRB-3 ×2')
    expect(mcBodyLabel('stage2_fairing', p)).toBe('フェアリング')
    expect(phaseLabel(p, 3)).toBe('第2段')
    expect(eventShort({ kind: 'ignition', t: 315, stage: 3 }, p)).toBe('点火')
    setLang('en')
    expect(phaseLabel(p, 3)).toBe('Stage 2')
    expect(mcBodyLabel('stage2_fairing', p)).toBe('Fairing')
    p.phases[0] = { ...p.phases[0], separation_name: 'Custom & <boosters>' }
    const kml = generateKML(
      {
        presentation: p,
        samples: [{ t: 0, lon: 0, lat: 0, alt: 0 }],
        events: [separation],
        fallBodies: [],
      } as unknown as Track,
      'Custom',
    )
    expect(kml).toContain('Custom &amp; &lt;boosters&gt; separation')
    expect(displayName({ ja: '', en: '' })).toBe('')
  })

  it('hides only boundary stop/start markers, preserving separate cutoff and delayed ignition', () => {
    const config = preset('h3-22s')
    const events: FlightEvent[] = [
      { kind: 'burnout', t: 110, stage: 1 },
      { kind: 'burnout', t: 115.994, stage: 1 },
      { kind: 'separation', t: 116, stage: 1, nextStage: 2 },
      { kind: 'ignition', t: 116, stage: 2 },
      { kind: 'burnout', t: 296, stage: 2 },
      { kind: 'separation', t: 303, stage: 2, nextStage: 3 },
      { kind: 'ignition', t: 315, stage: 3 },
    ]
    expect(displayEvents(events, config)).toEqual([events[0], events[2], events[4], events[5], events[6]])
    // Depletion before the boundary is real; it must not hide a later ignition.
    expect(displayEvents([events[0], events[3]], config)).toEqual([events[0], events[3]])
    config.stages[0].presentation!.engine_continues = false
    expect(displayEvents(events, config)).toEqual(events)
    expect(displayEvents(events)).toBe(events)
    expect(displayEvents([{ kind: 'ignition', t: 117, stage: 2 }, events[1]], preset('h3-22s'))).toEqual([
      { kind: 'ignition', t: 117, stage: 2 },
    ])
  })

  it('retains custom terminology in saved JSON and share links, without changing IDs', async () => {
    const config = preset('h3-22s')
    config.presentation = { stage_count: 2, booster_count: 6 }
    config.stages[0].presentation = { name: 'My core + boosters', separation_name: 'My boosters', engine_continues: true }
    config.stages[1].jettisons![0].display_name = 'My payload cover'
    const json = JSON.parse(JSON.stringify(config)) as Config
    expect(await decodePayload(await encodePayload(config))).toEqual(json)
    expect(json.stages[1].jettisons![0].name).toBe('fairing')
    const p = presentationFromConfig(json)
    expect(mcBodyLabel('stage1', p)).toBe('My boosters')
    expect(mcBodyLabel('stage2_fairing', p)).toBe('My payload cover')
  })

  it('accepts explicit null for optional metadata just like the CLI', () => {
    setLang('ja')
    const config = preset('h3-22s')
    config.presentation = { stage_count: null, booster_count: null }
    config.stages[0].presentation = { name: null, separation_name: null }
    config.stages[1].presentation = null
    config.stages[1].jettisons![0].display_name = null
    expect(validateConfig(config)).toEqual([])
    const p = presentationFromConfig(config)
    expect(structureLabel(p.vehicle, 3)).toBe('3計算区間')
    expect(phaseLabel(p, 1)).toBe('区間1')
    expect(phaseLabel(p, 2)).toBe('区間2')
    expect(mcBodyLabel('stage2_fairing', p)).toBe('fairing')
    config.presentation = null
    expect(validateConfig(config)).toEqual([])
    expect(structureLabel(config.presentation, 3)).toBe('3計算区間')
    config.stages[0].presentation!.engine_continues = null as never
    expect(validateConfig(config).map((i) => i.field)).toEqual(['stages[0].presentation.engine_continues'])
  })

  it('validates metadata and reports editable field paths', () => {
    const config = preset('momo')
    config.presentation = { stage_count: 0, booster_count: 1.5 }
    config.stages[0].presentation = { name: { ja: '名前' } as never, engine_continues: 'yes' as never }
    expect(validateConfig(config).map((i) => i.field)).toEqual([
      'presentation.stage_count',
      'presentation.booster_count',
      'stages[0].presentation.name',
      'stages[0].presentation.engine_continues',
    ])
  })
})
