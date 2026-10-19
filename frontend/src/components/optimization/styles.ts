import { cn } from '../../lib/cn'

export const optButton =
  'inline-flex min-h-8 items-center justify-center gap-1.5 rounded-[6px] border border-line bg-surface px-3 py-1.5 text-[12px] pointer-coarse:min-h-10 font-medium text-ink transition-colors hover:border-line-strong hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40'
export const optPrimary = cn(optButton, 'border-transparent bg-signal text-signal-ink hover:border-transparent hover:bg-signal/90')
export const optInput =
  'min-h-8 w-full min-w-0 rounded-[6px] border border-line bg-surface-2 px-2.5 py-1 text-[13px] pointer-coarse:min-h-10 text-ink outline-none focus:border-signal focus:bg-surface pointer-coarse:text-[16px]'
