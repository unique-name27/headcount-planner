/**
 * Columnar line tables (docs/PLAN.md 5.3): a round trip returns equal rows, sorted; strings are
 * dictionary-coded; a null holder or position is stored as '' and reads back null; two versions
 * never share a table; the table is plain data (it clones and hashes as it is).
 */
import { describe, expect, it } from 'vitest'
import { canonicalJson } from '../canonical'
import type { ActualLine, PlanLine } from '../types'
import { X_LINES } from './fixtures/fx'
import {
  ACTUAL_LINE_NUMBERS,
  actualLineRows,
  PLAN_LINE_NUMBERS,
  planLineRows,
  toActualLineTable,
  toPlanLineTable,
} from './lineTable'

const line = (
  positionId: string,
  month: PlanLine['month'],
  holderId: string | null,
  base: number,
): PlanLine => ({
  ...X_LINES[0],
  positionId,
  month,
  holderId,
  basis: holderId ? 'hris' : 'band',
  local: { base, bonus: base / 10, burden: 0.21, benefits: 0, oneTime: 0, vacancy: 0 },
  usd: {
    base: base * 1.15,
    bonus: base / 8.7,
    burden: 0.2415,
    benefits: 0,
    oneTime: 0,
    vacancy: 0,
    equity: 3.5,
    loaded: base * 1.3,
  },
})

const LINES: PlanLine[] = [
  line('P-2', '2026-10', 'E-9', 100.125),
  line('P-1', '2026-11', null, 5_834.416666666667),
  line('P-1', '2026-10', 'E-7', 1 / 3),
  line('P-1', '2026-10', null, 0),
  line('P-2', '2026-09', 'E-9', -12.5),
]

describe('PlanLineTable', () => {
  const table = toPlanLineTable('fy27-working', LINES)

  it('round-trips every line exactly, sorted by positionId, month, then holderId (null first)', () => {
    const rows = [...planLineRows(table)]
    expect(rows.map((r) => [r.positionId, r.month, r.holderId])).toEqual([
      ['P-1', '2026-10', null],
      ['P-1', '2026-10', 'E-7'],
      ['P-1', '2026-11', null],
      ['P-2', '2026-09', 'E-9'],
      ['P-2', '2026-10', 'E-9'],
    ])
    const sorted = [LINES[3], LINES[2], LINES[1], LINES[4], LINES[0]]
    expect(rows).toEqual(sorted)
  })

  it('stores one Float64Array per number column and dictionary-coded strings', () => {
    expect(table.length).toBe(5)
    expect(table.versionId).toBe('fy27-working')
    expect(Object.keys(table.numbers).sort()).toEqual([...PLAN_LINE_NUMBERS].sort())
    for (const k of PLAN_LINE_NUMBERS) expect(table.numbers[k]).toBeInstanceOf(Float64Array)
    expect(table.positionId.dict).toEqual(['P-1', 'P-2'])
    expect([...table.positionId.codes]).toEqual([0, 0, 0, 1, 1])
    expect(table.holderId.dict).toEqual(['', 'E-7', 'E-9'])
    expect(table.basis.dict).toEqual(['band', 'hris'])
  })

  it('refuses lines of another version', () => {
    expect(() => toPlanLineTable('fy27-budget', LINES)).toThrow(/fy27-working/)
  })

  it('is plain data: canonical JSON reads it, and two builds of the same lines read the same', () => {
    const again = toPlanLineTable('fy27-working', [...LINES].reverse())
    expect(canonicalJson(again)).toBe(canonicalJson(table))
    expect(structuredClone(table).numbers.localBase).toEqual(table.numbers.localBase)
  })

  it('an empty table round-trips', () => {
    const empty = toPlanLineTable('fy27-working', [])
    expect(empty.length).toBe(0)
    expect([...planLineRows(empty)]).toEqual([])
  })
})

describe('ActualLineTable', () => {
  const actual = (employeeId: string, positionId: string | null, month: ActualLine['month']): ActualLine => ({
    employeeId,
    positionId,
    month,
    heads: 1,
    fte: 0.8,
    active: 15 / 31,
    currency: 'EUR',
    rate: 1.14,
    local: { base: 7_000.5, bonus: 700.05, burden: 1_470.105, benefits: 0, oneTime: 0, vacancy: 0 },
    usd: {
      base: 7_980.57,
      bonus: 798.057,
      burden: 1_675.92,
      benefits: 0,
      oneTime: 0,
      vacancy: 0,
      equity: 0,
      loaded: 10_454.547,
    },
    leave: positionId ? 'none' : 'unpaid',
  })
  const LINES_A = [
    actual('E-2', 'P-1', '2026-09'),
    actual('E-1', null, '2026-09'),
    actual('E-1', 'P-3', '2026-08'),
    actual('E-1', 'P-2', '2026-09'),
  ]

  it('round-trips, sorted by month, employeeId, then positionId (null first)', () => {
    const rows = [...actualLineRows(toActualLineTable(LINES_A))]
    expect(rows.map((r) => [r.month, r.employeeId, r.positionId])).toEqual([
      ['2026-08', 'E-1', 'P-3'],
      ['2026-09', 'E-1', null],
      ['2026-09', 'E-1', 'P-2'],
      ['2026-09', 'E-2', 'P-1'],
    ])
    expect(rows).toEqual([LINES_A[2], LINES_A[1], LINES_A[3], LINES_A[0]])
    expect(ACTUAL_LINE_NUMBERS).toEqual(PLAN_LINE_NUMBERS)
  })
})
