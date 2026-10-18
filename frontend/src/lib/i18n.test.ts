import { afterEach, describe, expect, it } from 'vite-plus/test'
import { getLang, setLang, tr } from './i18n'
import { eventLabel } from './events'
import { fmt } from './format'

describe('i18n', () => {
  const initial = getLang()
  afterEach(() => setLang(initial))

  it('switches strings, event names and number format', () => {
    setLang('ja')
    expect(tr('高度', 'Altitude')).toBe('高度')
    expect(eventLabel({ kind: 'separation', t: 1, stage: 1, nextStage: 2 })).toBe('区間1の分離物 分離')
    setLang('en')
    expect(tr('高度', 'Altitude')).toBe('Altitude')
    expect(eventLabel({ kind: 'end', t: 1, landed: true })).toBe('Impact')
    expect(fmt(12345.678, 1)).toBe('12,345.7')
    expect(fmt(Number.NaN)).toBe('—')
  })
})
