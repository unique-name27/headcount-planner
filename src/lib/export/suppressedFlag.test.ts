/**
 * Numeric amounts with a Suppressed flag (docs/PLAN.md 14.1 item 2): any table with a shown amount
 * column gets `Suppressed` (Yes or blank) and `Why`; a suppressed amount cell is empty, never 0 and
 * never words; a table with no shown amount column gets no flag; amounts are numbers, so negative
 * variances are not formula-guarded; and CSV, the clipboard, Excel and slide tables all write it.
 */
import { describe, expect, it } from 'vitest'
import type { Column } from '@/charts/types'
import type { Format } from '@/lib/format'
import { toTsv } from './clipboard'
import { toCsv } from './csv'
import {
  amountCell,
  hasAmountColumn,
  isAmountCell,
  isAmountColumn,
  reasonColumn,
  SUPPRESSED_COLUMNS,
  SUPPRESSED_KEY,
  SUPPRESSED_WHY_KEY,
  SUPPRESSED_YES,
  WHY_KEY,
  withSuppressedFlag,
  writtenTable,
} from './suppressedFlag'
import type { ExportTable } from './types'
import { slideTable } from './view'
import { buildWorkbook } from './xlsx'

const HIDDEN = 'Hidden to protect anonymity (n < 5)'
const columns: Column[] = [
  { key: 'unit', label: 'Business unit' },
  { key: 'heads', label: 'Heads', format: 'int' },
  { key: 'loaded', label: 'Loaded cost (USD)', format: 'money', cost: true },
  { key: 'band', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
]
const table: ExportTable = {
  name: 'Cost by unit',
  columns,
  rows: [
    { unit: 'Silicon Engineering', heads: 604, loaded: 93_100_000, band: 1_464_264.59 },
    { unit: 'Facilities', heads: 3, loaded: null, band: 0, [WHY_KEY]: HIDDEN },
    { unit: 'Rounded', heads: 12, loaded: 'under $0.1M', band: 0 },
    { unit: 'Zero', heads: 6, loaded: 0, band: 0 },
  ],
  suppressedWhy: 'Groups under 5 are left out.',
}
const FINANCE = { pay: false, cost: true }
const MANAGER = { pay: false, cost: false }

describe('amount columns and cells', () => {
  it('reads a money flag or a money format as an amount column', () => {
    expect(isAmountColumn({ cost: true })).toBe(true)
    expect(isAmountColumn({ pay: true })).toBe(true)
    expect(isAmountColumn({ band: true })).toBe(true)
    for (const format of ['money', 'moneyFull', 'moneyM'] as Format[])
      expect(isAmountColumn({ format })).toBe(true)
    for (const format of ['int', 'num1', 'pct', 'text'] as Format[])
      expect(isAmountColumn({ format })).toBe(false)
    expect(isAmountColumn({})).toBe(false)
    expect(hasAmountColumn(columns, FINANCE)).toBe(true)
    // Manager mode: the amount columns are not shown, so none counts.
    expect(hasAmountColumn(columns, MANAGER)).toBe(false)
  })

  it('writes an amount cell as a finite number or empty: never 0 for missing, never words', () => {
    expect(amountCell(93_100_000)).toBe(93_100_000)
    expect(amountCell(0)).toBe(0)
    expect(amountCell(-2_200_000)).toBe(-2_200_000)
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, '—', 'under $0.1M', '1200', true])
      expect(amountCell(v), String(v)).toBeNull()
  })

  it('reads a column formatted per row by each row: counts in a cost-flagged column are not amounts', () => {
    const c: Column = {
      key: 'actual',
      label: 'Actual and forecast',
      cost: true,
      format: (r: { measure: string }) => (r.measure === 'cost' ? 'moneyM' : 'num1'),
    }
    expect(isAmountCell(c, { measure: 'cost' })).toBe(true)
    expect(isAmountCell(c, { measure: 'heads' })).toBe(false)
    // A key figures value: no flag, money on the cost tile's row only.
    const v: Column = { key: 'value', label: 'Value', format: (r: { f: Format }) => r.f }
    expect(isAmountCell(v, { f: 'money' })).toBe(true)
    expect(isAmountCell(v, { f: 'pct' })).toBe(false)
  })
})

describe('withSuppressedFlag', () => {
  const flagged = withSuppressedFlag(table, FINANCE)
  const rows = flagged.rows

  it('adds Suppressed and Why after the table columns', () => {
    expect(flagged.columns.map((c) => c.label)).toEqual([
      'Business unit',
      'Heads',
      'Loaded cost (USD)',
      'Band estimate (USD)',
      'Suppressed',
      'Why',
    ])
    expect(flagged.columns.slice(-2)).toEqual(SUPPRESSED_COLUMNS)
  })

  it('leaves a suppressed amount cell empty, with Yes and the reason', () => {
    expect(rows[1].loaded).toBeNull()
    expect(rows[1][SUPPRESSED_KEY]).toBe(SUPPRESSED_YES)
    expect(rows[1][SUPPRESSED_WHY_KEY]).toBe(HIDDEN)
    // Words in an amount cell are a reason, not a value: the cell is empty, the table's reason given.
    expect(rows[2].loaded).toBeNull()
    expect(rows[2][SUPPRESSED_KEY]).toBe('Yes')
    expect(rows[2][SUPPRESSED_WHY_KEY]).toBe(table.suppressedWhy)
    // A shown amount, 0 included, is a number with the flag blank.
    expect(rows[0]).toMatchObject({ loaded: 93_100_000, [SUPPRESSED_KEY]: '', [SUPPRESSED_WHY_KEY]: '' })
    expect(rows[3]).toMatchObject({ loaded: 0, [SUPPRESSED_KEY]: '', [SUPPRESSED_WHY_KEY]: '' })
  })

  it("reads the reason under WHY_KEY first, then the model's reason column, then the table", () => {
    const why: Column = { key: 'reason', label: 'Why "—"', format: 'text' }
    const t = withSuppressedFlag(
      {
        name: 't',
        columns: [...columns, why],
        rows: [
          { loaded: null, [WHY_KEY]: 'Shows in Finance mode.', reason: 'other' },
          { loaded: null, reason: HIDDEN },
          { loaded: 5, band: 0, reason: '7 people in groups under 5 are left out' },
        ],
        suppressedWhy: 'The table.',
      },
      FINANCE,
    )
    expect(t.rows.map((r) => r[SUPPRESSED_WHY_KEY])).toEqual(['Shows in Finance mode.', HIDDEN, ''])
    expect(t.rows.map((r) => r[SUPPRESSED_KEY])).toEqual(['Yes', 'Yes', ''])
    // The guarded figures' reason columns ('Why "—"', 'Note'), or a column flagged `why`.
    expect(reasonColumn([why])?.key).toBe('reason')
    expect(reasonColumn([{ key: 'reason', label: 'Note' }])?.key).toBe('reason')
    expect(reasonColumn([{ key: 'guard', label: 'Because', why: true }])?.key).toBe('guard')
    // A request's "Reason" is its reason code or text, never the guard's.
    expect(reasonColumn([{ key: 'reason', label: 'Reason' }])).toBeNull()
  })

  it('writes an amount that is not there empty and unflagged: no reason, no suppression', () => {
    const grid: Column[] = [
      { key: 'positionId', label: 'Position ID' },
      { key: 'status', label: 'Status' },
      { key: 'bandEstimateUsd', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
      { key: 'reason', label: 'Reason' },
    ]
    const t = withSuppressedFlag(
      {
        name: 'grid',
        columns: grid,
        rows: [
          { positionId: 'P-1', status: 'Filled', bandEstimateUsd: null, reason: 'Backfill' },
          { positionId: 'P-2', status: 'Open', bandEstimateUsd: 210_000, reason: 'Growth' },
        ],
      },
      FINANCE,
    )
    expect(t.rows.map((r) => [r.bandEstimateUsd, r[SUPPRESSED_KEY], r[SUPPRESSED_WHY_KEY]])).toEqual([
      [null, '', ''],
      [210_000, '', ''],
    ])
  })

  it('adds no flag columns where no amount column shows (Manager mode, a heads table)', () => {
    expect(withSuppressedFlag(table, MANAGER)).toBe(table)
    const heads: ExportTable = { name: 'h', columns: columns.slice(0, 2), rows: [{ unit: 'x', heads: null }] }
    expect(withSuppressedFlag(heads, FINANCE)).toBe(heads)
  })

  it('flags a row by the cells that hold amounts, and lets a trend column hold no value unflagged', () => {
    const variance: Column[] = [
      { key: 'measure', label: 'Measure' },
      {
        key: 'actual',
        label: 'Actual',
        cost: true,
        format: (r: { measure: string }) => (r.measure === 'cost' ? 'money' : 'num1'),
      },
    ]
    const t = withSuppressedFlag(
      {
        name: 'v',
        columns: variance,
        rows: [
          { measure: 'heads', actual: null },
          { measure: 'cost', actual: null, [WHY_KEY]: 'Shows in Finance mode.' },
        ],
      },
      FINANCE,
    )
    expect(t.rows.map((r) => r[SUPPRESSED_KEY])).toEqual(['', 'Yes'])
    const trend: Column[] = [
      { key: 'value', label: 'Value', format: 'money' },
      { key: 'trend1', label: 'Trend', format: 'money', flagEmpty: false },
    ]
    const k = withSuppressedFlag({ name: 'k', columns: trend, rows: [{ value: 5, trend1: null }] }, FINANCE)
    expect(k.rows[0]).toMatchObject({ trend1: null, [SUPPRESSED_KEY]: '' })
  })

  it('changes nothing the second time', () => {
    const twice = withSuppressedFlag(flagged, FINANCE)
    expect(twice.columns.map((c) => c.key)).toEqual(flagged.columns.map((c) => c.key))
    expect(twice.rows).toEqual(flagged.rows)
  })
})

describe('every writer writes the flagged table', () => {
  const opts = { showPay: false, showCost: true }

  it('CSV: numbers as numbers, the hidden cell empty, negative amounts never formula-guarded', () => {
    const csv = toCsv(
      {
        columns,
        rows: [...table.rows, { unit: '-Rest', heads: 5, loaded: -2_200_000.5, band: 0 }],
        suppressedWhy: table.suppressedWhy,
      },
      { ...opts, bom: false },
    ).split('\r\n')
    expect(csv[0]).toBe('Business unit,Heads,Loaded cost (USD),Band estimate (USD),Suppressed,Why')
    expect(csv[1]).toBe('Silicon Engineering,604,93100000,1464264.59,,')
    expect(csv[2]).toBe(`Facilities,3,,0,Yes,${HIDDEN}`)
    expect(csv[3]).toBe('Rounded,12,,0,Yes,Groups under 5 are left out.')
    expect(csv[4]).toBe('Zero,6,0,0,,')
    // A text cell that starts like a formula is guarded; a negative amount is a number.
    expect(csv[5]).toBe(`'-Rest,5,-2200000.5,0,,`)
  })

  it('the clipboard, Excel and slide tables', async () => {
    const tsv = toTsv(table, opts).split('\n')
    expect(tsv[0]).toBe('Business unit\tHeads\tLoaded cost (USD)\tBand estimate (USD)\tSuppressed\tWhy')
    expect(tsv[2]).toBe(`Facilities\t3\t\t0\tYes\t${HIDDEN}`)

    const wb = await buildWorkbook(
      [table],
      { view: 'Plan', scope: '', window: '', asOf: '', isSample: false, company: '' },
      opts,
    )
    const ws = wb.getWorksheet('Cost by unit')!
    let header = 0
    ws.eachRow((row, n) => {
      if (row.getCell(1).value === 'Business unit') header = n
    })
    expect([1, 2, 3, 4, 5, 6].map((c) => ws.getRow(header).getCell(c).value)).toEqual([
      'Business unit',
      'Heads',
      'Loaded cost (USD)',
      'Band estimate (USD)',
      'Suppressed',
      'Why',
    ])
    const facilities = ws.getRow(header + 2)
    expect(facilities.getCell(3).value).toBeNull()
    expect(facilities.getCell(5).value).toBe('Yes')
    expect(facilities.getCell(6).value).toBe(HIDDEN)
    // The rounded words never reach a cell.
    expect(ws.getRow(header + 3).getCell(3).value).toBeNull()

    const slide = slideTable(table, { pay: false, cost: true, band: true })
    expect(slide.columns.map((c) => c.label)).toEqual([
      'Business unit',
      'Heads',
      'Loaded cost (USD)',
      'Band estimate (USD)',
      'Suppressed',
      'Why',
    ])
    expect(slide.text[1].slice(-2)).toEqual(['Yes', HIDDEN])
    // A hidden amount cell is empty on a slide too, never "—" (M4 review EX-4).
    expect(slide.text[1][2]).toBe('')
    // A row that is not suppressed has blank Suppressed and Why cells, not "—" (14.1 item 2).
    expect(slide.text[0].slice(-2)).toEqual(['', ''])
    expect(slide.text[3].slice(-2)).toEqual(['', ''])
  })

  it('slide tables: empty amount, Suppressed and Why cells blank; other empty cells "—"', () => {
    const cols: Column[] = [
      { key: 'org', label: 'Sub-org' },
      { key: 'date', label: 'Target date', format: 'date' },
      { key: 'cost', label: 'Asks cost (USD)', format: 'moneyM', cost: true },
      { key: 'band', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
      { key: 'note', label: 'Note', why: true },
    ]
    const slide = slideTable(
      {
        columns: cols,
        rows: [
          // A Filled seat: no band estimate and no reason (no value, not flagged).
          { org: 'Architecture', date: null, cost: 32_600_000, band: null, note: '' },
          { org: 'Physical Design', date: '2027-03-31', cost: null, band: 250_000, note: 'Fewer than 5.' },
        ],
      },
      FINANCE,
    )
    expect(slide.columns.map((c) => c.label)).toEqual([
      'Sub-org',
      'Target date',
      'Asks cost (USD)',
      'Band estimate (USD)',
      'Note',
      'Suppressed',
      'Why',
    ])
    // The date with no value keeps the screen's placeholder; the amount, Note, Suppressed and Why are blank.
    expect(slide.text[0]).toEqual(['Architecture', '—', '$32.6M', '', '', '', ''])
    expect(slide.text[1].slice(2)).toEqual(['', '$250,000', 'Fewer than 5.', 'Yes', 'Fewer than 5.'])
    for (const row of slide.text) for (const cell of row.slice(2)) expect(cell).not.toBe('—')
  })

  it('writtenTable keeps a table with no amount to show as it is', () => {
    const plain = { columns: columns.slice(0, 2), rows: [{ unit: 'x', heads: 3 }] }
    expect(writtenTable(plain, { money: FINANCE })).toBe(plain)
  })
})
