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
})
