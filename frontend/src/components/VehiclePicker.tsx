import { useCallback, useRef, useState } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { PRESET_CATEGORIES, PRESET_OPTIONS } from '../config/presets'
import { useDismiss } from '../hooks/useDismiss'
import { computeSpecs } from '../lib/specs'
import { fmtForce, fmtMass } from '../lib/format'
import { cn } from '../lib/cn'
import { tr } from '../lib/i18n'

const PRESET_SPECS = PRESET_OPTIONS.map((p) => ({ preset: p, specs: computeSpecs(p.create()) }))

export function VehiclePicker({
  name,
  presetId,
  onPreset,
  onBlank,
}: {
  name: string
  presetId: string
  onPreset: (id: string) => void
  onBlank: () => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = PRESET_OPTIONS.find((p) => p.id === presetId)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  return (
    <div ref={ref} className="relative min-w-0 flex-1 sm:flex-none">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-[6px] px-2 text-left hover:bg-surface-2 sm:w-auto"
      >
        <span className="min-w-0 truncate text-[13px] font-medium">{current ? current.label : name || tr('カスタム', 'Custom')}</span>
        <span className="hidden truncate text-[12px] text-ink-3 md:inline">
          {current ? current.kind : tr('編集中の設定', 'Edited settings')}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={tr('機体を選ぶ', 'Choose a vehicle')}
          className="fixed inset-x-2 top-12 z-50 rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)] sm:absolute sm:inset-x-auto sm:left-0 sm:top-full sm:mt-1 sm:w-[26rem]"
        >
          {presetId === 'custom' && (
            <p className="px-2.5 pb-1 pt-1 text-[11px] text-ink-3">
              {tr(
                '選ぶと現在の編集内容は置き換わります（元に戻すで復元できます）',
                'Choosing one replaces your edits (Undo brings them back)',
              )}
            </p>
          )}
          <div className="scroll-quiet max-h-[min(70vh,600px)] overflow-y-auto">
            {PRESET_CATEGORIES.map((cat) => (
              <div key={cat.id} className="mb-1">
                <p className="sticky top-0 bg-surface px-2.5 pb-1 pt-2 text-[11px] font-semibold text-ink-2">{cat.label}</p>
                {PRESET_SPECS.filter(({ preset }) => preset.category === cat.id).map(({ preset, specs }) => {
                  const active = preset.id === presetId
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onPreset(preset.id)
                      }}
                      className={cn('block w-full rounded-[7px] px-2.5 py-2 text-left hover:bg-surface-2', active && 'bg-surface-2')}
                    >
                      <span className="flex items-baseline gap-2">
                        <span className="text-[13px] font-semibold">{preset.label}</span>
                        <span className="text-[12px] text-ink-2">{preset.kind}</span>
                        {active && <Check className="ml-auto h-3.5 w-3.5 self-center text-ink" />}
                      </span>
                      <span className="num mt-1 flex flex-wrap gap-x-3 text-[11px] text-ink-2">
                        <span>{tr(`${specs.stages.length}段`, `${specs.stages.length} stage${specs.stages.length === 1 ? '' : 's'}`)}</span>
                        <span>{fmtMass(specs.liftoffMass)}</span>
                        <span>
                          {tr('推力', 'Thrust')} {fmtForce(specs.liftoffThrust)}
                        </span>
                        <span>Δv {(specs.dvTotal / 1000).toFixed(1)} km/s</span>
                        <span className="text-ink-3">{preset.site}</span>
                      </span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-ink-3">{preset.description}</span>
                    </button>
                  )
                })}
              </div>
            ))}
            <div className="mt-1 border-t border-line pt-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onBlank()
                }}
                className="flex w-full items-start gap-2.5 rounded-[7px] px-2.5 py-2 text-left hover:bg-surface-2"
              >
                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
                <span>
                  <span className="block text-[13px] font-semibold">{tr('白紙から作る', 'Start from scratch')}</span>
                  <span className="block text-[11px] leading-relaxed text-ink-3">
                    {tr(
                      '1段・1 t・推力 20 kN の最小構成から始めます。発射地点と日時はいまの設定を引き継ぎます。',
                      'A minimal one-stage, 1 t, 20 kN vehicle. Keeps the current launch site and time.',
                    )}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
