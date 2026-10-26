import { describe, expect, it } from 'vitest'
import { cellAction, safeHref } from './cells'
import type { Column } from './types'

describe('safeHref', () => {
  it('allows web, mail and same-site links', () => {
    expect(safeHref('https://ats.example.com/req/R-1042')).toBe('https://ats.example.com/req/R-1042')
    expect(safeHref(' http://intranet/case/42 ')).toBe('http://intranet/case/42')
    expect(safeHref('mailto:hrbp@example.com')).toBe('mailto:hrbp@example.com')
    expect(safeHref('/people/E10001')).toBe('/people/E10001')
    expect(safeHref('#talent')).toBe('#talent')
  })

  it('drops script and data URLs and blanks', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull()
    expect(safeHref(' JavaScript:alert(1)')).toBeNull()
    expect(safeHref('data:text/html,<b>x</b>')).toBeNull()
    expect(safeHref('')).toBeNull()
    expect(safeHref(null)).toBeNull()
    expect(safeHref(undefined)).toBeNull()
  })
})

describe('cellAction', () => {
  type Row = { id: string; url: string | null; n: number }
  const drill = (r: Row) => (r.n > 0 ? { kind: 'positions' as const, title: r.id, rows: [] } : null)
  const row: Row = { id: 'R-1', url: 'https://ats.example.com/R-1', n: 3 }

  it('links when href gives a URL, and href wins over drill', () => {
    const col: Column<Row> = { key: 'id', label: 'Req', href: (r) => r.url, drill: drill as never }
    expect(cellAction(col, row, 'R-1')).toEqual({ kind: 'link', href: 'https://ats.example.com/R-1' })
  })

  it('falls back to the drill when href gives no (safe) link for the row', () => {
    const col: Column<Row> = { key: 'n', label: 'People', href: (r) => r.url, drill: drill as never }
    expect(cellAction(col, { ...row, url: null }, '3')?.kind).toBe('drill')
    expect(cellAction(col, { ...row, url: 'javascript:void(0)' }, '3')?.kind).toBe('drill')
  })

  it('does nothing for blank cells or rows with nothing behind them', () => {
    const col: Column<Row> = { key: 'n', label: 'People', href: (r) => r.url, drill: drill as never }
    expect(cellAction(col, row, '—')).toBeNull()
    expect(cellAction({ key: 'n', label: 'People', drill: drill as never }, { ...row, n: 0 }, '0')).toBeNull()
    expect(cellAction({ key: 'n', label: 'People' }, row, '3')).toBeNull()
  })
})

describe('cellAction for modeled cells', () => {
  type Row = { id: string; amount: number | null; n: number }
  const card = (r: Row) => ({
    title: `Cost of ${r.id}`,
    metricId: 'plan.cost.loaded',
    value: r.amount,
    format: 'money' as const,
    inputs: [],
    steps: [{ label: 'Loaded cost', expression: '—', result: r.amount, format: 'money' as const }],
    uses: [],
  })
  const row: Row = { id: 'Silicon Engineering', amount: 93_800_000, n: 556 }

  it('opens the calculation card behind a modeled cell', () => {
    const col: Column<Row> = { key: 'amount', label: 'Loaded cost', calc: card as never }
    const a = cellAction(col, row, '$93.8M')
    expect(a?.kind).toBe('calc')
  })

  it('keeps the records of a counted cell that also has a card', () => {
    const drill = (r: Row) => ({ kind: 'positions' as const, title: r.id, rows: [] })
    const col: Column<Row> = { key: 'n', label: 'Heads', drill: drill as never, calc: card as never }
    expect(cellAction(col, row, '556')?.kind).toBe('drill')
  })

  it('opens nothing for a hidden amount or a cell with no card', () => {
    const col: Column<Row> = { key: 'amount', label: 'Loaded cost', calc: (() => null) as never }
    expect(cellAction(col, row, '$93.8M')).toBeNull()
    expect(cellAction({ key: 'amount', label: 'Loaded cost', calc: card as never }, row, '—')).toBeNull()
  })
})
