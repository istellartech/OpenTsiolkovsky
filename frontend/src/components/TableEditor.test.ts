import { describe, expect, it } from 'vite-plus/test'
import { formatTable, parseTable } from './TableEditor'

describe('parseTable', () => {
  it('accepts tabs, commas and spaces and skips a header and comments', () => {
    const { rows, issues } = parseTable('time\tthrust\n0\t1,000\n# note\n1, 2\n2 3', 2)
    expect(rows).toEqual([
      [0, 1000],
      [1, 2],
      [2, 3],
    ])
    expect(issues).toEqual([])
  })

  it('reports short and non-numeric lines and descending keys', () => {
    const { issues } = parseTable('0 1\n5\n3 x\n-1 2', 2)
    expect(issues.map((i) => i.line)).toEqual([2, 3, -1])
  })

  it('formats rows back to text', () => {
    const text = formatTable(
      [
        { key: 'a', label: 'A' },
        { key: 'b', label: 'B' },
      ],
      [[0, 1.23456789]],
    )
    expect(parseTable(text, 2).rows).toEqual([[0, 1.234568]])
  })
})
