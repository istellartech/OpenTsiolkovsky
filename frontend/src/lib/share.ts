// Shareable links. An unedited preset is linked by id (`#preset=h3_22s`); an
// edited config travels in the fragment as deflated, base64url-encoded JSON
// (`#c=...`). The fragment never reaches the server. The CLI (`share`) and
// the MCP server link CLI parameter files the same way, as
// `{ "legacy": param_*.json, "files": { "name.csv": text } }`.

import { baseName, isLegacyParamFile } from './legacy'

const toBase64Url = (bytes: Uint8Array) => {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodePayload(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value))
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decodePayload(s: string): Promise<unknown> {
  const json = await pipe(fromBase64Url(s), new DecompressionStream('deflate-raw'))
  return JSON.parse(new TextDecoder().decode(json))
}

export type ShareTarget = { kind: 'preset'; id: string } | { kind: 'config'; data: string }

/** What a URL fragment like `#preset=...` or `#c=...` points to, if anything. */
export function parseShareHash(hash: string): ShareTarget | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const id = params.get('preset')
  if (id) return { kind: 'preset', id }
  const data = params.get('c')
  if (data) return { kind: 'config', data }
  return null
}

export async function buildShareUrl(base: string, config: unknown, presetId: string): Promise<string> {
  const url = new URL(base)
  url.hash = presetId !== 'custom' ? `preset=${encodeURIComponent(presetId)}` : `c=${await encodePayload(config)}`
  return url.toString()
}

/** A CLI parameter file and the CSV tables it references, keyed by file name. */
export interface LegacyBundle {
  param: Record<string, unknown>
  files: Map<string, string>
}

/** The CLI parameter file a share payload carries (bare or with its tables), if any. */
export function asLegacyBundle(value: unknown): LegacyBundle | null {
  if (isLegacyParamFile(value)) return { param: value, files: new Map() }
  if (!value || typeof value !== 'object') return null
  const { legacy, files } = value as { legacy?: unknown; files?: unknown }
  if (!isLegacyParamFile(legacy)) return null
  const tables = new Map<string, string>()
  if (files && typeof files === 'object')
    for (const [name, text] of Object.entries(files)) if (typeof text === 'string') tables.set(baseName(name), text)
  return { param: legacy, files: tables }
}
