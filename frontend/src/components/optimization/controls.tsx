import { useContext, useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { tr } from '../../lib/i18n'
import { numericDraftValue } from '../../lib/optimization-input'
import type { Bounds } from '../../lib/optimization-input'
import { OptimizationEditorContext } from './editor-context'
import { optInput } from './styles'

export function OptNumber({
  path,
  label,
  value,
  unit,
  scale = 1,
  integer = false,
  hint,
  onValue,
}: {
  path: string
  label: string
  value: number
  unit?: string
  scale?: number
  integer?: boolean
  hint?: string
  onValue?: (value: number) => void
}) {
  const ctx = useContext(OptimizationEditorContext),
    id = useId()
  const draft = ctx.fields[path]
  const invalid = draft && numericDraftValue(draft) === null
  const error = invalid
    ? tr(integer ? '整数を入力してください。' : '数値を入力してください。', integer ? 'Enter an integer.' : 'Enter a number.')
    : ctx.issues.find((i) => i.path === path)?.message
  return (
    <div className="min-w-0" data-opt-field={path}>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium text-ink-2">
        {label}
        {unit ? <span className="sr-only"> ({unit})</span> : null}
      </label>
      <div className="relative">
        <input
          id={id}
          className={cn(optInput, 'num pr-14', error && 'border-danger')}
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          autoComplete="off"
          spellCheck={false}
          disabled={ctx.disabled}
          value={draft?.text ?? String(value / scale)}
          aria-invalid={!!error}
          aria-describedby={error || hint ? `${id}-help` : undefined}
          onChange={(event) => {
            const next = { text: event.target.value, scale, integer }
            ctx.setField(path, next)
            const number = numericDraftValue(next)
            if (number !== null) {
              if (onValue) onValue(number)
              else ctx.edit(path, number)
            }
          }}
          onBlur={() => {
            if (draft && numericDraftValue(draft) !== null) ctx.setField(path, null)
          }}
        />
        {unit ? (
          <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-ink-3" aria-hidden="true">
            {unit}
          </span>
        ) : null}
      </div>
      {error || hint ? (
        <p id={`${id}-help`} className={cn('mt-1 text-[11px] leading-relaxed', error ? 'text-danger' : 'text-ink-2')}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}
export function OptText({
  path,
  label,
  value,
  multiline = false,
  hint,
}: {
  path: string
  label: string
  value: string
  multiline?: boolean
  hint?: string
}) {
  const ctx = useContext(OptimizationEditorContext),
    id = useId(),
    error = ctx.issues.find((i) => i.path === path)?.message
  const props = {
    id,
    value,
    disabled: ctx.disabled,
    'aria-invalid': !!error,
    'aria-describedby': error || hint ? `${id}-help` : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => ctx.edit(path, event.target.value),
    className: cn(optInput, error && 'border-danger'),
  }
  return (
    <div className="min-w-0" data-opt-field={path}>
      <label htmlFor={id} className="mb-1.5 block text-[12px] font-medium text-ink-2">
        {label}
      </label>
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} type="text" />}
      {error || hint ? (
        <p id={`${id}-help`} className={cn('mt-1 text-[11px] leading-relaxed', error ? 'text-danger' : 'text-ink-2')}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}
export function OptBounds({
  path,
  label,
  value,
  unit,
  fixedOnly = false,
}: {
  path: string
  label: string
  value: Bounds
  unit: string
  fixedOnly?: boolean
}) {
  const ctx = useContext(OptimizationEditorContext),
    fixed = value.lower === value.upper
  return (
    <fieldset className="rounded-[8px] border border-line p-3" data-opt-field={path}>
      <legend className="px-1 text-[12px] font-medium">
        {label} <span className="ml-2 font-normal text-ink-3">{fixed ? tr('固定', 'Fixed') : tr('最適化', 'Optimized')}</span>
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <OptNumber
          path={`${path}.initial`}
          label={fixed ? tr('値', 'Value') : tr('初期値', 'Initial value')}
          value={value.initial}
          unit={unit}
          onValue={(v) => ctx.edit(fixed ? path : `${path}.initial`, fixed ? { initial: v, lower: v, upper: v } : v)}
        />
        {!fixedOnly ? (
          <>
            <OptNumber path={`${path}.lower`} label={tr('下限', 'Lower bound')} value={value.lower} unit={unit} />
            <OptNumber path={`${path}.upper`} label={tr('上限', 'Upper bound')} value={value.upper} unit={unit} />
          </>
        ) : null}
      </div>
      {!fixedOnly ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-3">
          <p>
            {tr('上下限が同じなら固定、異なれば範囲内で最適化します。', 'Equal bounds fix the value; different bounds allow optimization.')}
          </p>
          <button
            type="button"
            className="rounded px-1 py-1 text-ink-2 underline underline-offset-2 disabled:opacity-40"
            disabled={ctx.disabled}
            onClick={() => {
              ctx.setField(`${path}.lower`, null)
              ctx.setField(`${path}.upper`, null)
              ctx.edit(path, { initial: value.initial, lower: value.initial, upper: value.initial })
            }}
          >
            {tr('初期値で固定', 'Fix at initial value')}
          </button>
        </div>
      ) : null}
    </fieldset>
  )
}
export function OptGroup({ title, note, children, id }: { title: ReactNode; note?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-[9px] border border-line bg-surface p-4 sm:p-5">
      <h3 className="text-[14px] font-semibold">{title}</h3>
      {note ? <p className="mt-1.5 text-[12px] leading-relaxed text-ink-2">{note}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  )
}
export function OptTabs<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: { value: T; label: string; disabled?: boolean }[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex gap-1 overflow-x-auto"
      onKeyDown={(event) => {
        const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role=tab]:not(:disabled)'))
        const index = tabs.indexOf(document.activeElement as HTMLButtonElement)
        let next: number | null = null
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
        if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
        if (event.key === 'Home') next = 0
        if (event.key === 'End') next = tabs.length - 1
        if (next !== null) {
          event.preventDefault()
          tabs[next]?.focus()
          tabs[next]?.click()
        }
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          disabled={option.disabled}
          className={cn(
            'whitespace-nowrap rounded-[6px] px-3 py-2 text-[12px] font-medium transition-colors disabled:opacity-40',
            value === option.value ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-ink-3 hover:bg-surface-2 hover:text-ink',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
