import { useContext, useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { tr } from '../../lib/i18n'
import { numericDraftValue } from '../../lib/optimization-input'
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
      <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-ink-2">
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
          value={draft?.text ?? (scale === 1 ? String(value) : String(Number((value / scale).toPrecision(6))))}
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
        <p id={`${id}-help`} className={cn('mt-0.5 text-[10px] leading-snug', error ? 'text-danger' : 'text-ink-2')}>
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
      <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-ink-2">
        {label}
      </label>
      {multiline ? <textarea {...props} rows={3} /> : <input {...props} type="text" />}
      {error || hint ? (
        <p id={`${id}-help`} className={cn('mt-0.5 text-[10px] leading-snug', error ? 'text-danger' : 'text-ink-2')}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  )
}
export function OptGroup({ title, note, children, id }: { title: ReactNode; note?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-[9px] border border-line bg-surface px-3 py-3 sm:px-4">
      <h3 className="text-[13px] font-semibold">{title}</h3>
      {note ? <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{note}</p> : null}
      <div className="mt-2.5 space-y-3">{children}</div>
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
            'whitespace-nowrap rounded-[6px] px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40',
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
