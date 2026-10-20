import { Download, Maximize2 } from 'lucide-react'
import { tr } from '../lib/i18n'

export function ChartTools({ title, onDownload, onExpand }: { title: string; onDownload: () => void; onExpand?: () => void }) {
  const style =
    'flex h-7 w-7 pointer-coarse:h-10 pointer-coarse:w-10 shrink-0 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink'
  return (
    <>
      <button
        type="button"
        className={style}
        onClick={onDownload}
        aria-label={tr(`${title}をPNGで保存`, `Save ${title} as PNG`)}
        title={tr('PNGで保存', 'Save as PNG')}
      >
        <Download className="h-3.5 w-3.5" />
      </button>
      {onExpand ? (
        <button
          type="button"
          className={style}
          onClick={onExpand}
          aria-label={tr(`${title}を拡大`, `Enlarge ${title}`)}
          title={tr('拡大', 'Enlarge')}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </>
  )
}
