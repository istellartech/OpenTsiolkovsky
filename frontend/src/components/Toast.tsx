import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { cn } from '../lib/cn'
import { tr } from '../lib/i18n'

export type ToastKind = 'ok' | 'error'

interface ToastState {
  text: string
  kind: ToastKind
  id: number
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const show = useCallback((text: string, kind: ToastKind = 'ok') => setToast({ text, kind, id: Date.now() }), [])
  const dismiss = useCallback(() => setToast(null), [])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(dismiss, toast.kind === 'error' ? 7000 : 3500)
    return () => window.clearTimeout(timer)
  }, [toast, dismiss])
  return { toast, show, dismiss }
}

export function Toast({ toast, onDismiss }: { toast: ToastState | null; onDismiss: () => void }) {
  if (!toast) return null
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-3">
      <div
        className={cn(
          'pointer-events-auto flex max-w-[34rem] items-start gap-2 rounded-[8px] bg-surface px-3 py-2 text-[12px] leading-relaxed shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] ring-1',
          toast.kind === 'ok' ? 'text-ink ring-line-strong' : 'text-danger ring-danger/40',
        )}
      >
        <span className="flex-1">{toast.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={tr('閉じる', 'Close')}
          className="-mr-1 shrink-0 rounded p-0.5 text-ink-3 hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
