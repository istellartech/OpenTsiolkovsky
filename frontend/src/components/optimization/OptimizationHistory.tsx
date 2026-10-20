import { useState } from 'react'
import { Archive, ArrowDownToLine, Copy, RefreshCw, RotateCcw, SplitSquareHorizontal } from 'lucide-react'
import type { SavedRunInfo } from '../../lib/optimization-storage'
import { tr } from '../../lib/i18n'
import { optButton, optInput } from './styles'

export function OptimizationHistory({
  runs,
  loading,
  active,
  hasResult,
  running,
  onOpen,
  onCompare,
  onEdit,
  onArchive,
  onExport,
  onRefresh,
}: {
  runs: SavedRunInfo[]
  loading: boolean
  active?: string
  hasResult: boolean
  running: boolean
  onOpen: (id: string) => Promise<void>
  onCompare: (id: string) => Promise<void>
  onEdit: (id: string) => Promise<void>
  onArchive: (id: string, value: boolean) => Promise<void>
  onExport: (id: string) => Promise<void>
  onRefresh: () => Promise<void>
}) {
  const [search, setSearch] = useState(''),
    [archived, setArchived] = useState(false),
    [busy, setBusy] = useState<string | null>(null)
  const visible = runs.filter(
    (run) => run.archived === archived && `${run.label} ${run.runId}`.toLowerCase().includes(search.toLowerCase()),
  )
  const act = async (id: string, action: () => Promise<void>) => {
    setBusy(id)
    try {
      await action()
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold">{tr('保存した実行', 'Saved runs')}</h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-ink-2">
            {tr(
              '入力・全解・検証記録をこのブラウザのIndexedDBへ自動保存します。ページを再読込しても残ります。共有やバックアップにはケース保存を使うと変換履歴も残ります。',
              'Inputs, full solutions and validation records are saved to this browser’s IndexedDB and survive reloads. Export a case file to retain conversion history when sharing or backing up.',
            )}
          </p>
        </div>
        <button type="button" className={optButton} onClick={() => void act('refresh', onRefresh)} disabled={loading || busy !== null}>
          <RefreshCw className="h-3.5 w-3.5" />
          {tr('一覧を再読込', 'Refresh list')}
        </button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <label className="block text-[11px] text-ink-2">
          {tr('ケース名・実行IDで検索', 'Search case name or run ID')}
          <input className={`${optInput} mt-1`} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <label className="flex min-h-9 items-center gap-2 self-end text-[12px] text-ink-2">
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="accent-[var(--signal)]" />
          {tr('アーカイブを表示', 'Show archived')}
        </label>
      </div>
      {loading ? (
        <p role="status" className="py-8 text-center text-[12px] text-ink-3">
          {tr('保存した実行を読み込み中…', 'Loading saved runs…')}
        </p>
      ) : !visible.length ? (
        <div className="rounded-[9px] border border-dashed border-line-strong bg-surface p-8 text-center text-[12px] leading-relaxed text-ink-3">
          {search
            ? tr('検索条件に一致する実行はありません。', 'No runs match your search.')
            : archived
              ? tr('アーカイブした実行はありません。', 'No archived runs.')
              : tr(
                  'まだ保存された実行はありません。最適化を実行するか、結果JSONを読み込んでください。',
                  'No saved runs yet. Solve a problem or import a result JSON.',
                )}
        </div>
      ) : (
        <ol className="space-y-3">
          {visible.map((run) => (
            <li key={run.id} className={`rounded-[9px] border bg-surface p-4 ${active === run.id ? 'border-signal/50' : 'border-line'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="break-words text-[13px] font-semibold">{run.label}</h4>
                  {run.context ? (
                    <p className="num mt-1 text-[10px] text-ink-3">
                      {run.context.id.slice(0, 6)} · r{run.context.revision}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-ink-3">
                    {new Date(run.createdAt).toLocaleString()} · {run.problemKind} ·{' '}
                    {run.origin === 'import' ? tr('JSONから読込', 'Imported JSON') : tr('ブラウザで実行', 'Browser solve')}
                  </p>
                  <p className="mt-2 text-[11px] text-ink-2">
                    {tr('求解', 'Solve')}: {run.converged ? tr('収束', 'Converged') : tr('未収束', 'Not converged')} ·{' '}
                    {tr('数値検証', 'Validation')}:{' '}
                    {run.validation === 'passed'
                      ? tr('許容差内', 'Within tolerance')
                      : run.validation === 'failed'
                        ? tr('不合格', 'Failed')
                        : tr('未評価', 'Not evaluated')}
                  </p>
                </div>
                <span className="num text-[16px]">
                  {run.payloadKg === null ? '—' : run.payloadKg.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
                  {run.payloadKg === null ? '' : <span className="text-[11px] text-ink-3">kg</span>}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={optButton} disabled={busy !== null} onClick={() => void act(run.id, () => onOpen(run.id))}>
                  {busy === run.id ? tr('処理中…', 'Working…') : tr('結果を表示', 'Open result')}
                </button>
                <button
                  type="button"
                  className={optButton}
                  disabled={!hasResult || active === run.id || busy !== null}
                  onClick={() => void act(run.id, () => onCompare(run.id))}
                >
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                  {tr('比較対象にする', 'Use as reference')}
                </button>
                <button
                  type="button"
                  className={optButton}
                  disabled={running || busy !== null}
                  onClick={() => void act(run.id, () => onEdit(run.id))}
                >
                  <Copy className="h-3.5 w-3.5" />
                  {tr('入力を編集', 'Edit inputs')}
                </button>
                <button
                  type="button"
                  className={optButton}
                  disabled={busy !== null}
                  onClick={() => void act(run.id, () => onExport(run.id))}
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" />
                  {tr('ケース保存', 'Save case')}
                </button>
                <button
                  type="button"
                  className={`${optButton} ml-auto`}
                  disabled={busy !== null}
                  onClick={() => void act(run.id, () => onArchive(run.id, !archived))}
                  aria-label={
                    archived
                      ? tr(`${run.label}をアーカイブから戻す`, `Restore ${run.label} from archive`)
                      : tr(`${run.label}をアーカイブ`, `Archive ${run.label}`)
                  }
                >
                  {archived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  {archived ? tr('戻す', 'Restore') : tr('アーカイブ', 'Archive')}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="text-[11px] leading-relaxed text-ink-3">
        {tr(
          'アーカイブは一覧から隠すだけで、あとで戻せます。ブラウザのサイトデータ削除や保存領域の消去で履歴は失われます。',
          'Archiving only hides a run and can be undone. Clearing browser site data or storage removes this history.',
        )}
      </p>
    </div>
  )
}
