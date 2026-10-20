import { useCallback, useRef, useState } from 'react'
import { ChevronDown, FileText, FolderOpen, Link2, Map as MapIcon, Save, Table2 } from 'lucide-react'
import { useDismiss } from '../hooks/useDismiss'
import { tr } from '../lib/i18n'

export interface FileActions {
  base: string
  open: (files: File[]) => void
  saveJson: () => void
  copyLink: () => void
  saveCsv: () => void
  saveKml: () => void
}

interface ItemProps {
  icon: typeof FolderOpen
  title: string
  detail: string
  onSelect: () => void
  onClose: () => void
  disabled?: boolean
}

function MenuItem({ icon: Icon, title, detail, onSelect, onClose, disabled }: ItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onClose()
        onSelect()
      }}
      className="flex w-full items-start gap-2.5 rounded-[6px] px-2.5 py-2 text-left hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-transparent"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="block text-[11px] leading-snug text-ink-3">{detail}</span>
      </span>
    </button>
  )
}

export function FileMenu({ files, hasResult }: { files: FileActions; hasResult: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  return (
    <div ref={ref} className="relative">
      <input
        ref={input}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) files.open(picked)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[6px] border border-line px-2 text-[13px] text-ink hover:bg-surface-2 sm:px-2.5"
      >
        <FileText className="h-4 w-4 text-ink-2" />
        <span className="max-sm:sr-only">{tr('ファイル', 'File')}</span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-3" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-[min(20rem,92vw)] rounded-[10px] border border-line bg-surface p-1.5 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.3)]"
        >
          <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold text-ink-2">{tr('設定', 'Settings')}</p>
          <MenuItem
            onClose={close}
            icon={FolderOpen}
            title={tr('設定ファイルを開く…', 'Open settings file…')}
            detail={tr(
              '設定の .json（CLI と同じ形式）。CSV の表を使う設定は CSV も一緒に選びます。画面へのドロップでも開けます。',
              'A configuration .json (the format the CLI reads). If it uses CSV tables, select the CSV files too. You can also drop files on the window.',
            )}
            onSelect={() => input.current?.click()}
          />
          <MenuItem
            onClose={close}
            icon={Save}
            title={tr('設定を保存', 'Save settings')}
            detail={tr(`いまの入力を ${files.base}.json として保存します。`, `Saves the current inputs as ${files.base}.json.`)}
            onSelect={files.saveJson}
          />
          <MenuItem
            onClose={close}
            icon={Link2}
            title={tr('共有リンクをコピー', 'Copy share link')}
            detail={tr(
              'いまの設定を URL に埋め込みます。開くと同じ機体・条件で計算されます。',
              'Embeds the current settings in a URL; opening it runs the same vehicle and conditions.',
            )}
            onSelect={files.copyLink}
          />
          <div className="my-1 h-px bg-line" />
          <p className="px-2.5 pb-0.5 pt-1 text-[11px] font-semibold text-ink-2">{tr('計算結果を書き出す', 'Export results')}</p>
          <MenuItem
            onClose={close}
            icon={Table2}
            title={tr('軌道データ（CSV）', 'Trajectory data (CSV)')}
            detail={tr(
              '時刻ごとの位置・速度・推力・姿勢など（CLI の trajectory.csv と同じ列）。表計算ソフトで開けます。',
              'Position, velocity, thrust, attitude and more per time step (the columns of the CLI’s trajectory.csv). Opens in any spreadsheet.',
            )}
            onSelect={files.saveCsv}
            disabled={!hasResult}
          />
          <MenuItem
            onClose={close}
            icon={MapIcon}
            title={tr('Google Earth 用（KML）', 'Google Earth (KML)')}
            detail={tr('飛行経路を Google Earth で 3D 表示できます。', 'View the flight path in 3D in Google Earth.')}
            onSelect={files.saveKml}
            disabled={!hasResult}
          />
        </div>
      )}
    </div>
  )
}
