import { describe, expect, it } from 'vite-plus/test'
import { PRESET_OPTIONS } from '../config/presets'
import { asLegacyBundle, buildShareUrl, decodePayload, encodePayload, parseShareHash } from './share'

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

  it('reads CLI parameter files linked with their CSV tables', () => {
    const param = { 'name(str)': 'cli' }
    const bundle = asLegacyBundle({ legacy: param, files: { 'data/thrust.csv': 't,f\n0,1\n', bad: 3 } })
    expect(bundle?.param).toEqual(param)
    expect([...(bundle?.files ?? [])]).toEqual([['thrust.csv', 't,f\n0,1\n']])
    expect(asLegacyBundle(param)?.files.size).toBe(0)
    expect(asLegacyBundle({ name: 'web config' })).toBeNull()
    expect(asLegacyBundle(null)).toBeNull()
  })

  it('decodes a payload deflated by the CLI', async () => {
    // `agent::encode_share_payload` (Rust, miniz_oxide) of this bundle
    const cli = '3c9BCoAgEAXQu_xVwRC19SxtBpkiMBeNSCJzd_Uabt7-VVxPEIWr4M1rhkOifMadjimAEYLc7MsoRn5l0fStvfnDrAE'
    const csv = 't,v\n' + '0,1\n'.repeat(40)
    expect(await decodePayload(cli)).toEqual({ legacy: { 'name(str)': 'x' }, files: { 'a.csv': csv } })
  })
})
