import { createContext, useContext, useState, type ReactNode } from 'react'
import { TableSummary } from './TableEditor'
import { cn } from '../lib/cn'

/* ------------------------------------------------------------------ Buttons */

export function IconButton({
  label,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] transition-colors',
        'text-ink-2 hover:bg-surface-2 hover:text-ink',
        className,
      )}
      {...props}
    />
  )
}

/* -------------------------------------------------------------- Segmented */

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  tone = 'light',
  size = 'md',
  className,
}: {
  value: T
  options: { value: T; label: ReactNode; title?: string }[]
  onChange: (v: T) => void
  tone?: 'light' | 'map'
  size?: 'sm' | 'md'
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      className={cn(
        'inline-flex rounded-[7px] p-0.5',
        tone === 'light' ? 'bg-surface-2 ring-1 ring-line' : 'bg-surface ring-1 ring-line-strong shadow-[0_1px_2px_rgba(0,0,0,0.06)]',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-[5px] font-medium transition-colors',
              size === 'sm' ? 'h-6 px-2 text-[11px]' : 'h-7 px-2.5 text-[12px]',
              active
                ? tone === 'light'
                  ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--line-strong)]'
                  : 'bg-ink text-surface'
                : 'text-ink-3 hover:text-ink',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ----------------------------------------------------- Validation context */

interface FieldContextValue {
  issues: Map<string, string>
  register: (path: string) => (el: HTMLElement | null) => void
}

export const FieldContext = createContext<FieldContextValue>({
  issues: new Map(),
  register: () => () => {},
})

function useFieldState(path?: string) {
  const ctx = useContext(FieldContext)
  return {
    error: path ? ctx.issues.get(path) : undefined,
    ref: path ? ctx.register(path) : undefined,
  }
}

/* ----------------------------------------------------------------- Fields */

function FieldRow({
  label,
  hint,
  note,
  error,
  children,
}: {
  label: ReactNode
  hint?: string
  note?: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <div className="py-[3px]">
      <label className="flex min-h-8 items-center gap-3">
        <span className="min-w-0 flex-1 leading-tight text-ink-2">
          {label}
          {note && <span className="num block text-[10px] text-ink-3">{note}</span>}
          {hint && <span className="block text-[10px] leading-snug text-ink-3">{hint}</span>}
        </span>
        {children}
      </label>
      {error && <p className="mt-0.5 text-right text-[11px] leading-tight text-danger">{error}</p>}
    </div>
  )
}

const inputBase =
  'h-8 w-full rounded-[6px] border border-line bg-surface-2 text-ink outline-none transition-colors hover:border-line-strong focus:border-signal focus:bg-surface'

/** Numeric input that keeps the raw text while typing ("-", "1.", "") and commits valid numbers. */
export function NumberInput({
  value,
  onChange,
  unit,
  error,
  inputRef,
  className,
  ariaLabel,
}: {
  value: number
  onChange: (v: number) => void
  unit?: string
  error?: boolean
  inputRef?: (el: HTMLElement | null) => void
  className?: string
  ariaLabel?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (Number.isFinite(value) ? String(value) : '')
  return (
    <div className={cn('relative', className)}>
      <input
        ref={inputRef}
        type="number"
        inputMode="decimal"
        step="any"
        aria-label={ariaLabel}
        aria-invalid={error || undefined}
        value={shown}
        onFocus={() => setDraft(shown)}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = e.target.value.trim() === '' ? NaN : Number(e.target.value)
          if (Number.isFinite(n)) onChange(n)
        }}
        className={cn(inputBase, 'num pl-2 text-right text-[13px]', unit ? 'pr-10' : 'pr-2', error && 'border-danger')}
      />
      {unit && (
        <span className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-start pl-1 text-[11px] text-ink-3">
          {unit}
        </span>
      )}
    </div>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  unit,
  path,
  hint,
  note,
}: {
  label: ReactNode
  value: number
  onChange: (v: number) => void
  unit?: string
  path?: string
  hint?: string
  note?: ReactNode
}) {
  const { error, ref } = useFieldState(path)
  return (
    <FieldRow label={label} hint={hint} note={note} error={error}>
      <NumberInput
        ariaLabel={typeof label === 'string' ? label : undefined}
        value={value}
        onChange={onChange}
        unit={unit}
        error={!!error}
        inputRef={ref}
        className="w-[9.5rem] shrink-0"
      />
    </FieldRow>
  )
}

/** Three numbers sharing one label, e.g. a NED vector. */
export function VectorField({
  label,
  value,
  onChange,
  axes,
  unit,
  path,
}: {
  label: ReactNode
  value: [number, number, number]
  onChange: (v: [number, number, number]) => void
  axes: [string, string, string]
  unit: string
  path?: string
}) {
  const { error, ref } = useFieldState(path)
  return (
    <div className="py-[3px]">
      <div className="flex min-h-8 items-center justify-between text-ink-2">
        <span>{label}</span>
        <span className="text-[11px] text-ink-3">{unit}</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {axes.map((axis, i) => (
          <div key={axis} className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-[11px] text-ink-3">{axis}</span>
            <NumberInput
              ariaLabel={`${label} ${axis}`}
              value={value[i]}
              error={!!error}
              inputRef={i === 0 ? ref : undefined}
              onChange={(n) => {
                const next = [...value] as [number, number, number]
                next[i] = n
                onChange(next)
              }}
            />
          </div>
        ))}
      </div>
      {error && <p className="mt-0.5 text-right text-[11px] text-danger">{error}</p>}
    </div>
  )
}

export function SelectField<T extends string | number>({
  label,
  value,
  options,
  onChange,
  path,
}: {
  label: ReactNode
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  path?: string
}) {
  const { error, ref } = useFieldState(path)
  return (
    <FieldRow label={label} error={error}>
      <select
        ref={ref}
        aria-label={typeof label === 'string' ? label : undefined}
        value={String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value)
          if (hit) onChange(hit.value)
        }}
        className={cn(inputBase, 'w-[9.5rem] shrink-0 cursor-pointer px-2 text-[12px]', error && 'border-danger')}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  )
}

export function TextInputField({
  label,
  value,
  onChange,
  type = 'text',
  path,
  className,
}: {
  label: ReactNode
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'date' | 'time'
  path?: string
  className?: string
}) {
  const { error, ref } = useFieldState(path)
  return (
    <FieldRow label={label} error={error}>
      <input
        ref={ref}
        aria-label={typeof label === 'string' ? label : undefined}
        type={type}
        step={type === 'time' ? 1 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(inputBase, 'num w-[9.5rem] shrink-0 px-2 text-[12px]', className, error && 'border-danger')}
      />
    </FieldRow>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center justify-between gap-3 py-[3px] text-ink-2">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={typeof label === 'string' ? label : undefined}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors',
          checked ? 'bg-signal' : 'bg-line-strong',
        )}
      >
        <span
          className={cn(
            'absolute left-0 top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_1px_rgba(0,0,0,0.15)] transition-transform',
            checked ? 'translate-x-[14px]' : 'translate-x-[2px]',
          )}
        />
      </button>
    </label>
  )
}

/* ---------------------------------------------------------- Profile table */

export interface ProfileColumn<T> {
  key: keyof T & string
  label: string
}

export function ProfileTable<T extends Record<string, number>>({
  columns,
  rows,
  onChange,
  path,
  title,
}: {
  columns: ProfileColumn<T>[]
  rows: T[]
  onChange: (rows: T[]) => void
  path?: string
  title?: string
}) {
  const { error, ref } = useFieldState(path)
  return (
    <TableSummary
      title={title ?? columns.map((c) => c.label).join(' · ')}
      columns={columns}
      rows={rows.map((r) => columns.map((c) => r[c.key]))}
      onChange={(next) => onChange(next.map((vals) => Object.fromEntries(columns.map((c, i) => [c.key, vals[i]])) as T))}
      error={error}
      registerRef={ref}
    />
  )
}
