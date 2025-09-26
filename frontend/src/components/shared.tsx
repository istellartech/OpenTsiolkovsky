import type React from 'react'
import { cn } from '../lib/utils'
import { Label, Input, Switch, Button } from './ui'
import { numberFromInput } from '../utils/validation'

// Form Field Components
interface NumberFieldProps {
  id: string
  label: string
  value: number
  onChange: (value: number) => void
  step?: string
  min?: number
  max?: number
  disabled?: boolean
  className?: string
  inputMode?: 'decimal' | 'numeric'
  hasError?: boolean
  registerRef?: (el: HTMLInputElement | null) => void
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  step = 'any',
  min,
  max,
  disabled,
  className,
  inputMode = 'decimal',
  hasError = false,
  registerRef,
}: NumberFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id} className={cn(hasError && 'text-rose-600')}>
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(numberFromInput(e.target.value))}
        step={step}
        min={min}
        max={max}
        disabled={disabled}
        inputMode={inputMode}
        aria-invalid={hasError || undefined}
        ref={registerRef}
        className={cn(
          hasError && 'border-rose-300 bg-rose-50 focus-visible:ring-rose-300 focus-visible:ring-offset-2',
        )}
      />
    </div>
  )
}

interface SelectFieldProps {
  id: string
  label: string
  value: number
  options: { value: number; label: string }[]
  onChange: (value: number) => void
  className?: string
  hasError?: boolean
  registerRef?: (el: HTMLSelectElement | null) => void
}

export function SelectField({ id, label, value, options, onChange, className, hasError = false, registerRef }: SelectFieldProps) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id} className={cn(hasError && 'text-rose-600')}>
        {label}
      </Label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        ref={registerRef}
        aria-invalid={hasError || undefined}
        className={cn(
          'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 shadow-inner focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1',
          hasError && 'border-rose-300 bg-rose-50 text-rose-700 focus-visible:ring-rose-300 focus-visible:ring-offset-2',
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

interface SwitchFieldProps {
  id: string
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export function SwitchField({ id, label, description, checked, onCheckedChange, disabled }: SwitchFieldProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white/90 px-3 py-2.5 shadow-inner">
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}

// Editable Table Component
export interface Column<T extends Record<string, number>> {
  key: keyof T
  label: string
  step?: string
  min?: number
}

interface EditableTableProps<T extends Record<string, number>> {
  title: string
  columns: Column<T>[]
  rows: T[]
  onChange: (rows: T[]) => void
  addLabel?: string
}

export function EditableTable<T extends Record<string, number>>({
  title,
  columns,
  rows,
  onChange,
  addLabel
}: EditableTableProps<T>) {
  const handleCellChange = (rowIdx: number, column: Column<T>, value: string) => {
    const parsed = numberFromInput(value)
    const next = rows.map((row, idx) => {
      if (idx !== rowIdx) return row
      return { ...row, [column.key]: parsed } as T
    })
    onChange(next)
  }

  const handleRemove = (rowIdx: number) => {
    const next = rows.filter((_, idx) => idx !== rowIdx)
    onChange(next)
  }

  const handleAdd = () => {
    const blank = columns.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {} as T)
    onChange([...rows, blank])
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
          {addLabel ?? 'Add row'}
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">No rows yet. Add one to begin.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-slate-50/80">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-4 py-2">
                      <Input
                        type="number"
                        step={col.step ?? 'any'}
                        min={col.min}
                        value={Number(row[col.key])}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleCellChange(rowIdx, col, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(rowIdx)}
                      aria-label="Remove row"
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}