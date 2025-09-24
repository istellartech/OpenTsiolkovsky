import type React from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { numberFromInput } from '../../utils/validation'

export interface Column<T extends Record<string, number>> {
  key: keyof T
  label: string
  step?: string
  min?: number
}

interface EditableTableProps<T extends Record<string, number>> {
  title: string
  columns: Column<T>[]
  rows: T[]
  onChange: (rows: T[]) => void
  addLabel?: string
}

export function EditableTable<T extends Record<string, number>>({
  title,
  columns,
  rows,
  onChange,
  addLabel
}: EditableTableProps<T>) {
  const handleCellChange = (rowIdx: number, column: Column<T>, value: string) => {
    const parsed = numberFromInput(value)
    const next = rows.map((row, idx) => {
      if (idx !== rowIdx) return row
      return { ...row, [column.key]: parsed } as T
    })
    onChange(next)
  }

  const handleRemove = (rowIdx: number) => {
    const next = rows.filter((_, idx) => idx !== rowIdx)
    onChange(next)
  }

  const handleAdd = () => {
    const blank = columns.reduce((acc, col) => ({ ...acc, [col.key]: 0 }), {} as T)
    onChange([...rows, blank])
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
          {addLabel ?? 'Add row'}
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-sm text-slate-500">No rows yet. Add one to begin.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {col.label}
                  </th>
                ))}
                <th className="w-16 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-slate-50/80">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-4 py-2">
                      <Input
                        type="number"
                        step={col.step ?? 'any'}
                        min={col.min}
                        value={Number(row[col.key])}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleCellChange(rowIdx, col, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(rowIdx)}
                      aria-label="Remove row"
                    >
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}