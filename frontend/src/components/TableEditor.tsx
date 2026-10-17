// Table input that scales to real data: tables are edited as text (paste
// straight from a spreadsheet or CSV) with a live plot, instead of one
// number box per cell.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownUp, Copy, FileUp, X } from 'lucide-react'
import { cn } from '../lib/utils'

export interface TableColumn {
  key: string
  label: string
}

export interface ParseIssue {
  line: number
  message: string
}

/**
 * Rows of `n` numbers from text. Separators: tab, comma, semicolon or
 * whitespace. Lines starting with "#" and a leading header line are ignored;
 * other lines that do not hold `n` numbers are reported.
 */
export function parseTable(text: string, n: number): { rows: number[][]; issues: ParseIssue[] } {
  const rows: number[][] = []
  const issues: ParseIssue[] = []
  const lines = text.split(/\r?\n/)
  lines.forEach((raw, i) => {
    const line = raw.trim()
    if (!line || line.startsWith('#')) return
    const cells = line.includes('\t')
      ? line.split('\t').map((c) => c.replace(/,/g, ''))
      : line.split(/[,;]|\s+/)
    const tokens = cells.map((c) => c.trim()).filter((c) => c !== '')
    const nums = tokens.map(Number)
    if (tokens.length >= n && nums.slice(0, n).every(Number.isFinite)) {
      rows.push(nums.slice(0, n))
    } else if (rows.length === 0 && nums.some((v) => !Number.isFinite(v))) {
      // header line before any data
    } else {
      issues.push({ line: i + 1, message: tokens.length < n ? `数値が${n}つ必要です` : '数値として読めない値があります' })
    }
  })
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] < rows[i - 1][0]) {
      issues.push({ line: -1, message: `1列目が小さくなっている行があります（${rows[i - 1][0]} → ${rows[i][0]}）。「並べ替え」で直せます` })
      break
    }
  }
  return { rows, issues }
}

const fmtNum = (v: number) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e6) / 1e6))

export function formatTable(columns: TableColumn[], rows: number[][]): string {
  return [`# ${columns.map((c) => c.label).join('\t')}`, ...rows.map((r) => r.map(fmtNum).join('\t'))].join('\n')
}

const compact = (v: number) =>
  Math.abs(v) >= 1e5 ? `${(v / 1000).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}k` : v.toLocaleString('ja-JP', { maximumFractionDigits: 3 })

/* ------------------------------------------------------------------- Plot */

function Plot({ xs, ys, label, height, xLabel, showAxes }: { xs: number[]; ys: number[]; label: string; height: number; xLabel?: string; showAxes?: boolean }) {
  const W = 600
  const H = height
  const pad = showAxes ? { l: 52, r: 8, t: 14, b: 18 } : { l: 2, r: 2, t: 3, b: 3 }
  const x0 = Math.min(...xs)
  const x1 = Math.max(...xs)
  let y0 = Math.min(...ys)
  let y1 = Math.max(...ys)
  if (y0 === y1) {
    y0 -= Math.abs(y0) * 0.1 || 1
    y1 += Math.abs(y1) * 0.1 || 1
  }
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r)
  const sy = (y: number) => H - pad.b - ((y - y0) / (y1 - y0)) * (H - pad.t - pad.b)
  const pts = xs.map((x, i) => `${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: showAxes ? undefined : H }} preserveAspectRatio="none" role="img" aria-label={label}>
      {showAxes && (
        <>
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line-strong)" />
          <text x={pad.l - 6} y={sy(y1) + 4} textAnchor="end" fontSize="10" fill="var(--ink-3)" fontFamily="IBM Plex Mono">
            {compact(y1)}
          </text>
          <text x={pad.l - 6} y={sy(y0) + 4} textAnchor="end" fontSize="10" fill="var(--ink-3)" fontFamily="IBM Plex Mono">
            {compact(y0)}
          </text>
          <text x={pad.l} y={H - 4} fontSize="10" fill="var(--ink-3)" fontFamily="IBM Plex Mono">
            {compact(x0)}
          </text>
          <text x={W - pad.r} y={H - 4} textAnchor="end" fontSize="10" fill="var(--ink-3)" fontFamily="IBM Plex Mono">
            {compact(x1)} {xLabel}
          </text>
          <text x={pad.l + 4} y={10} fontSize="11" fill="var(--ink-2)">
            {label}
          </text>
        </>
      )}
      <polyline points={pts} fill="none" stroke="var(--signal)" strokeWidth={showAxes ? 1.75 : 1.5} vectorEffect="non-scaling-stroke" />
      {showAxes && xs.length <= 80 && xs.map((x, i) => <circle key={i} cx={sx(x)} cy={sy(ys[i])} r="2.5" fill="var(--signal)" />)}
    </svg>
  )
}

/* ----------------------------------------------------------- Compact view */

export function TableSummary({
  title,
  columns,
  rows,
  onChange,
  error,
  registerRef,
}: {
  title: string
  columns: TableColumn[]
  rows: number[][]
  onChange: (rows: number[][]) => void
  error?: string
  registerRef?: (el: HTMLElement | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 4000)
    return () => window.clearTimeout(t)
  }, [notice])

  const replace = (text: string, source: string) => {
    const { rows: parsed } = parseTable(text, columns.length)
    if (!parsed.length) {
      setNotice(`${source}から数値の行が見つかりませんでした（${columns.length}列の数値が必要です）。`)
      return
    }
    onChange(parsed)
    setNotice(`${source}から ${parsed.length} 行を読み込みました。`)
  }
  const copy = () =>
    navigator.clipboard?.writeText(formatTable(columns, rows).replace(/^# /, '')).then(
      () => setNotice('表をコピーしました（表計算ソフトに貼り付けられます）。'),
      () => setNotice('コピーできませんでした。'),
    )

  const xs = rows.map((r) => r[0])
  const btn = 'flex h-7 items-center gap-1 rounded-[5px] px-1.5 text-[12px] text-ink-2 hover:bg-surface-2 hover:text-ink'
  return (
    <div className="mt-1 mb-2">
      <div
        ref={registerRef as (el: HTMLDivElement | null) => void}
        tabIndex={0}
        role="group"
        aria-label={`${title}（${rows.length}行）`}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text')
          if (!/[\n\t,]/.test(text.trim())) return
          e.preventDefault()
          replace(text, '貼り付けた表')
        }}
        onDoubleClick={() => setOpen(true)}
        className={cn(
          'cursor-pointer rounded-[6px] border bg-surface-2 px-2.5 py-2 outline-none hover:border-line-strong focus:border-signal',
          error ? 'border-danger' : 'border-line',
        )}
        title="ダブルクリックで編集。表計算ソフトからの貼り付けもできます"
      >
        {rows.length >= 2 ? (
          <div className="space-y-1">
            {columns.slice(1).map((c, j) => (
              <div key={c.key} className="flex items-center gap-2">
                <span className="w-16 shrink-0 truncate text-[10px] text-ink-3">{c.label}</span>
                <div className="min-w-0 flex-1">
                  <Plot xs={xs} ys={rows.map((r) => r[j + 1])} label={c.label} height={26} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-1 text-[11px] text-ink-3">2行以上入力するとグラフが表示されます</p>
        )}
        <p className="num mt-1.5 text-[11px] text-ink-2">
          {rows.length} 行
          {rows.length > 0 && (
            <>
              {' · '}
              {columns[0].label} {compact(Math.min(...xs))}〜{compact(Math.max(...xs))}
              {columns.slice(1).map((c, j) => {
                const v = rows.map((r) => r[j + 1])
                return ` · ${c.label} ${compact(Math.min(...v))}〜${compact(Math.max(...v))}`
              })}
            </>
          )}
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1">
        <button type="button" onClick={() => setOpen(true)} className="flex h-7 items-center gap-1 rounded-[5px] border border-line-strong bg-surface px-2 text-[12px] font-medium text-ink hover:bg-surface-2">
          表を編集
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className={btn}>
          <FileUp className="h-3.5 w-3.5" /> CSVを読み込む
        </button>
        <button type="button" onClick={copy} className={btn}>
          <Copy className="h-3.5 w-3.5" /> コピー
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) replace(await f.text(), `「${f.name}」`)
          }}
        />
      </div>
      <p className="text-[10px] leading-snug text-ink-3">{notice ?? '表計算ソフトでコピーした表を、上の枠を選んで貼り付けても置き換えられます。'}</p>
      {error && <p className="text-[11px] text-danger">{error}</p>}
      {open && <TableEditorDialog title={title} columns={columns} rows={rows} onApply={onChange} onClose={() => setOpen(false)} />}
    </div>
  )
}

/* ----------------------------------------------------------------- Dialog */

function TableEditorDialog({
  title,
  columns,
  rows,
  onApply,
  onClose,
}: {
  title: string
  columns: TableColumn[]
  rows: number[][]
  onApply: (rows: number[][]) => void
  onClose: () => void
}) {
  const [text, setText] = useState(() => formatTable(columns, rows))
  const [shift, setShift] = useState('0')
  const [scaleCol, setScaleCol] = useState(1)
  const [scale, setScale] = useState('1')
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parseTable(text, columns.length), [text, columns.length])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const transform = (fn: (r: number[]) => number[]) => setText(formatTable(columns, parsed.rows.map(fn)))
  const xs = parsed.rows.map((r) => r[0])
  const tool = 'flex h-8 items-center gap-1 rounded-[6px] border border-line bg-surface px-2 text-[12px] text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-40'
  const smallInput = 'num h-8 w-20 rounded-[6px] border border-line bg-surface-2 px-2 text-right text-[12px] outline-none focus:border-signal'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-2 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${title}を編集`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[min(780px,94vh)] w-[min(1100px,100%)] flex-col rounded-[10px] border border-line bg-surface shadow-[0_20px_50px_-20px_rgba(0,0,0,0.4)]"
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 className="text-[14px] font-semibold">{title}</h2>
          <span className="text-[12px] text-ink-3">{columns.map((c) => c.label).join(' · ')}</span>
          <button type="button" onClick={onClose} aria-label="閉じる (Esc)" className="ml-auto flex h-8 w-8 items-center justify-center rounded-[6px] text-ink-2 hover:bg-surface-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2 text-[12px] text-ink-2">
          <span className="flex items-center gap-1">
            {columns[0].label}を
            <input aria-label="ずらす量" className={smallInput} value={shift} onChange={(e) => setShift(e.target.value)} inputMode="decimal" />
            ずらす
            <button type="button" className={tool} disabled={!Number.isFinite(Number(shift)) || !parsed.rows.length} onClick={() => transform((r) => [r[0] + Number(shift), ...r.slice(1)])}>
              実行
            </button>
          </span>
          <span className="mx-1 h-5 w-px bg-line" />
          <span className="flex items-center gap-1">
            <select aria-label="倍率をかける列" value={scaleCol} onChange={(e) => setScaleCol(Number(e.target.value))} className="h-8 rounded-[6px] border border-line bg-surface-2 px-1.5 text-[12px]">
              {columns.map((c, i) => (
                <option key={c.key} value={i}>
                  {c.label}
                </option>
              ))}
            </select>
            に
            <input aria-label="倍率" className={smallInput} value={scale} onChange={(e) => setScale(e.target.value)} inputMode="decimal" />
            倍
            <button type="button" className={tool} disabled={!Number.isFinite(Number(scale)) || !parsed.rows.length} onClick={() => transform((r) => r.map((v, i) => (i === scaleCol ? v * Number(scale) : v)))}>
              実行
            </button>
          </span>
          <span className="mx-1 h-5 w-px bg-line" />
          <button type="button" className={tool} disabled={!parsed.rows.length} onClick={() => setText(formatTable(columns, [...parsed.rows].sort((a, b) => a[0] - b[0])))}>
            <ArrowDownUp className="h-3.5 w-3.5" /> 並べ替え
          </button>
          <button type="button" className={tool} onClick={() => fileRef.current?.click()}>
            <FileUp className="h-3.5 w-3.5" /> CSVを読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) setText(await f.text())
            }}
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 p-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:grid-rows-1">
          <div className="flex min-h-0 flex-col">
            <label htmlFor="table-text" className="mb-1 text-[11px] text-ink-3">
              1行に1点。タブ・カンマ・空白区切り。表計算ソフトからそのまま貼り付けられます（# で始まる行は無視）。
            </label>
            <textarea
              id="table-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              style={{ tabSize: 14 }}
              className="num min-h-[160px] flex-1 resize-none rounded-[6px] border border-line bg-surface-2 p-2.5 text-[12px] leading-[1.6] outline-none focus:border-signal"
            />
          </div>
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
            {parsed.rows.length >= 2 ? (
              columns.slice(1).map((c, j) => (
                <div key={c.key} className="rounded-[6px] border border-line p-1.5">
                  <Plot xs={xs} ys={parsed.rows.map((r) => r[j + 1])} label={c.label} xLabel={columns[0].label} height={columns.length > 2 ? 170 : 300} showAxes />
                </div>
              ))
            ) : (
              <p className="rounded-[6px] border border-dashed border-line p-6 text-center text-[12px] text-ink-3">2行以上あるとグラフが表示されます</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5">
          <span className="num text-[12px] text-ink-2">{parsed.rows.length} 行</span>
          {parsed.issues.length > 0 && (
            <span className="min-w-0 flex-1 truncate text-[12px] text-danger" title={parsed.issues.map((i) => (i.line > 0 ? `${i.line}行目: ` : '') + i.message).join('\n')}>
              {parsed.issues.slice(0, 2).map((i) => (i.line > 0 ? `${i.line}行目: ${i.message}` : i.message)).join(' / ')}
              {parsed.issues.length > 2 && ` ほか${parsed.issues.length - 2}件`}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="h-8 rounded-[6px] border border-line-strong px-3 text-[12px] text-ink hover:bg-surface-2">
              キャンセル
            </button>
            <button
              type="button"
              disabled={parsed.rows.length === 0}
              onClick={() => {
                onApply(parsed.rows)
                onClose()
              }}
              className="h-8 rounded-[6px] bg-ink px-4 text-[12px] font-medium text-surface hover:opacity-90 disabled:opacity-40"
            >
              適用（{parsed.rows.length} 行）
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
