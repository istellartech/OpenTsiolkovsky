import * as React from 'react'
import { cn } from '../../lib/utils'

const Badge = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full border border-brand/20 bg-brand/10 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-brand-700',
      className,
    )}
    {...props}
  />
)

export { Badge }
