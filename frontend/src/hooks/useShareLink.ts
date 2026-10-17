import { useEffect } from 'react'
import { PRESET_OPTIONS } from '../config/presets'
import type { ClientConfig } from '../lib/simulation'
import { decodePayload, parseShareHash } from '../lib/share'
import { isValidClientConfig } from '../lib/validation'
import { useLatest } from './useLatest'

/**
 * On startup, open the config a shared link points to, then drop the
 * fragment so later edits are not confused with the shared state.
 */
export function useOpenSharedLink(
  load: (config: ClientConfig, presetId?: string) => void,
  notify: (text: string, kind: 'ok' | 'error') => void,
) {
  const latest = useLatest({ load, notify })
  useEffect(() => {
    const target = parseShareHash(window.location.hash)
    if (!target) return
    // Cleared synchronously so a second mount (React StrictMode) does not load it again.
    history.replaceState(null, '', window.location.pathname + window.location.search)
    const { load, notify } = latest.current
    if (target.kind === 'preset') {
      const preset = PRESET_OPTIONS.find((p) => p.id === target.id)
      if (preset) load(preset.create(), preset.id)
      else notify(`リンク先のサンプル機体「${target.id}」が見つかりません。`, 'error')
      return
    }
    decodePayload(target.data)
      .then((parsed) => {
        if (!isValidClientConfig(parsed)) throw new Error('invalid')
        load(parsed)
        notify('共有リンクの設定を開きました。⌘Z / Ctrl+Z で元の設定に戻せます。', 'ok')
      })
      .catch(() => notify('共有リンクの設定を読み込めませんでした（リンクが途中で切れている可能性があります）。', 'error'))
  }, [latest])
}
