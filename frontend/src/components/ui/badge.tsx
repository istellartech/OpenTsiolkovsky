import * as React from 'react'
import { cn } from '../../lib/utils'

type BadgeVariant = 'default' | 'secondary' | 'destructive'

const variantStyles: Record<BadgeVariant, string> = {
  default: 'border-brand/20 bg-brand/10 text-brand-700',
  secondary: 'border-slate-200/70 bg-slate-100 text-slate-700',
  destructive: 'border-rose-200 bg-rose-50 text-rose-700',
}

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const Badge = ({ className, variant = 'default', ...props }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide',
      variantStyles[variant],
      className,
    )}
    {...props}
  />
)

export { Badge }
