import type React from 'react'
import { cn } from '../../lib/utils'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Switch } from '../ui/switch'
import { numberFromInput } from '../../utils/validation'

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