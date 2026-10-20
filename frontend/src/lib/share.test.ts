import { newCase, readCaseContext } from './case'
import { describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS } from '../config/presets'
import { buildShareUrl, decodePayload, encodePayload, parseShareHash } from './share'

describe('share links', () => {
  it('round-trips a config through the URL fragment', async () => {
    const config = { ...PRESET_OPTIONS[0].create(), name: '共有テスト / test' }
    const url = await buildShareUrl('https://example.org/app/?x=1#old', config, 'custom')
    expect(url.startsWith('https://example.org/app/?x=1#c=')).toBe(true)
    const target = parseShareHash(new URL(url).hash)
    expect(target?.kind).toBe('config')
    if (target?.kind !== 'config') return
    expect(target.data).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(await decodePayload(target.data)).toEqual(config)
  })

  it('links an unedited preset by id', async () => {
    const url = await buildShareUrl('https://example.org/', {}, 'h3-22s')
    expect(url).toBe('https://example.org/#preset=h3-22s')
    expect(parseShareHash('#preset=h3-22s')).toEqual({ kind: 'preset', id: 'h3-22s' })
  })

  it('ignores unrelated fragments', () => {
    expect(parseShareHash('')).toBeNull()
    expect(parseShareHash('#section-2')).toBeNull()
  })

  it('rejects a truncated payload', async () => {
    const data = await encodePayload({ a: 'x'.repeat(500) })
    await expect(decodePayload(data.slice(0, 10))).rejects.toThrow()
  })

  it('decodes a link written by the CLI', async () => {
    // `openTsiolkovsky-cli share` of a minimal configuration (Rust, miniz_oxide)
    const cli =
      'TZBBbsMgEEXvMms3miTKIpyjq1YVmuKxPSrgyAxVVct3L2CrisTqi__-gxUiBQYDP9BBkpA9qcwRzAoce6sS2CYwZzxhB3PWR1ablB8tPOHWgacc3VQLtaq5Z9vzCOZ6qxU_x_EpPF_vNSV_3AxgGrntZHVF5IKIL3gu5xXRtPMGZYd079Ql-i2mOu3MBmDP3818z-7Y3JLSyMX0fYVAKVmJokLeflUVbEXiZa7IXso_KC-70q0DRwf6k7yXpOKsm3kYxAlHLQgbLgelLA0Lsx28jJOWN_xXYPvY_gA'
    const config = (await decodePayload(cli)) as { name: string; stages: { mass_initial_kg: number }[]; launch: { time_utc: string } }
    expect(config.name).toBe('x')
    expect(config.stages[0].mass_initial_kg).toBe(100)
    expect(config.launch.time_utc).toBe('2000-01-01T00:00:00Z')
  })
})

it('retains payload accounting and history in a separate, backward-compatible share fragment', async () => {
  const context = newCase('Payload case')
  context.carriedMass = { stage: 0, stageCount: 1, payloadKg: 10, adapterKg: 2 }
  const config = PRESET_OPTIONS[0].create()
  const target = parseShareHash(new URL(await buildShareUrl('https://example.org/', config, 'custom', context)).hash)!
  expect(target.kind).toBe('config')
  if (target.kind !== 'config') throw new Error('config')
  expect(await decodePayload(target.data)).toEqual(config)
  expect(readCaseContext(await decodePayload(target.context!))).toEqual(context)
})
