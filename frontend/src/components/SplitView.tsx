import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Segmented } from './primitives'
import { tr } from '../lib/i18n'

const SPLIT_KEY = 'ot.split'

/** Share of the main area given to the map; the rest goes to charts. */
const LAYOUTS = [
  {
    value: 'map',
    ratio: 0.68,
    get label() {
      return tr('地図', 'Map')
    },
    get title() {
      return tr('地図を大きく', 'Larger map')
    },
  },
  {
    value: 'even',
    ratio: 0.5,
    get label() {
      return tr('半々', 'Even')
    },
    get title() {
      return tr('地図とグラフを半分ずつ', 'Split map and charts evenly')
    },
  },
  {
    value: 'charts',
    ratio: 0.22,
    get label() {
      return tr('グラフ', 'Charts')
    },
    get title() {
      return tr('グラフを大きく', 'Larger charts')
    },
  },
] as const
type LayoutValue = (typeof LAYOUTS)[number]['value'] | 'custom'

const clampRatio = (r: number) => Math.min(Math.max(r, 0.15), 0.85)

export function useSplitRatio() {
  const [ratio, setRatio] = useState(() => {
    try {
      const v = Number(localStorage.getItem(SPLIT_KEY))
      return v >= 0.15 && v <= 0.85 ? v : 0.58
    } catch {
      return 0.58
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(SPLIT_KEY, String(ratio))
    } catch {
      /* ignore */
    }
  }, [ratio])
  const layout: LayoutValue = LAYOUTS.find((l) => Math.abs(l.ratio - ratio) < 0.015)?.value ?? 'custom'
  return { ratio, setRatio, layout }
}

export function LayoutSwitch({ layout, onRatio }: { layout: LayoutValue; onRatio: (r: number) => void }) {
  return (
    <Segmented
      size="sm"
      value={layout}
      onChange={(v) => {
        const hit = LAYOUTS.find((l) => l.value === v)
        if (hit) onRatio(hit.ratio)
      }}
      options={LAYOUTS.map((l) => ({
        value: l.value as LayoutValue,
        title: l.title,
        label: (
          <span className="flex items-center gap-1">
            <LayoutGlyph ratio={l.ratio} />
            {l.label}
          </span>
        ),
      }))}
    />
  )
}

/** Tiny picture of the split: map on top (dark), charts below (light). */
function LayoutGlyph({ ratio }: { ratio: number }) {
  return (
    <span aria-hidden className="flex h-[11px] w-[9px] flex-col overflow-hidden rounded-[2px] ring-1 ring-current">
      <span className="bg-current opacity-60" style={{ height: `${ratio * 100}%` }} />
    </span>
  )
}

export function SplitView({
  top,
  bar,
  bottom,
  ratio,
  onRatio,
}: {
  top: ReactNode
  bar: ReactNode
  bottom: ReactNode
  ratio: number
  onRatio: (r: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const anim = dragging ? '' : 'transition-[flex-grow] duration-300 ease-out'

  return (
    <div ref={ref} className="flex min-h-0 flex-1 flex-col">
      <div className={cn('min-h-[140px]', anim)} style={{ flex: `${ratio} 1 0` }}>
        {top}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="horizontal"
        aria-label={tr('地図とグラフの境界（上下キーで調整）', 'Map/charts divider (adjust with arrow keys)')}
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={15}
        aria-valuemax={85}
        title={tr('ドラッグで地図とグラフの比率を調整', 'Drag to resize map and charts')}
        className="group relative z-10 flex h-2 shrink-0 cursor-row-resize touch-none items-center justify-center border-t border-line bg-surface hover:bg-surface-2"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId) || !ref.current) return
          const r = ref.current.getBoundingClientRect()
          onRatio(clampRatio((e.clientY - r.top) / r.height))
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onRatio(clampRatio(ratio - 0.05))
          else if (e.key === 'ArrowDown') onRatio(clampRatio(ratio + 0.05))
          else return
          e.preventDefault()
        }}
      >
        <span className="h-[3px] w-8 rounded-full bg-line-strong group-hover:bg-ink-3" />
      </div>
      {bar}
      <div className={cn('min-h-[120px] overflow-hidden', anim)} style={{ flex: `${1 - ratio} 1 0` }}>
        {bottom}
      </div>
    </div>
  )
}
