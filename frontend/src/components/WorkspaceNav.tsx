import { Globe, LineChart, SlidersHorizontal } from 'lucide-react'
import { tr } from '../lib/i18n'
import { cn } from '../lib/cn'

export type MobileWorkspaceView = 'params' | 'globe' | 'charts'
export function WorkspaceNav({ value, onChange }: { value: MobileWorkspaceView | null; onChange: (value: MobileWorkspaceView) => void }) {
  const items = [
    ['params', tr('設定', 'Settings'), SlidersHorizontal],
    ['globe', '3D', Globe],
    ['charts', tr('グラフ', 'Charts'), LineChart],
  ] as const
  return (
    <nav
      aria-label={tr('ワークスペースの表示', 'Workspace views')}
      className="grid shrink-0 grid-cols-3 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {items.map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          aria-current={value === id ? 'page' : undefined}
          onClick={() => onChange(id)}
          className={cn(
            'flex min-h-12 flex-col items-center justify-center gap-1 text-[11px]',
            value === id ? 'text-signal' : 'text-ink-3',
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </nav>
  )
}
