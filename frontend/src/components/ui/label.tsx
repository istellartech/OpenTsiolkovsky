import * as React from 'react'
import { cn } from '../../lib/utils'

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(({ className, ...props }, ref) => (
  <label ref={ref} className={cn('text-sm font-medium text-slate-700', className)} {...props} />
))
Label.displayName = 'Label'

export { Label }
