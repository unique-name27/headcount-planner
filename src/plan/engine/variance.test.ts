/**
 * Variance (docs/PLAN.md 6.8 and 9.2): actual or forecast − the comparison version in heads, average
 * FTE and cost, by month, QTD, YTD and full year; positive cost is over. EV1 (a target comparison is
 * an empty state) is in bridge.test.ts; here the cells.
 */
import { describe, expect, it } from 'vitest'
import type { Month } from '@/data/schema'
import { FY27_MONTHS } from './fixtures/common'
import {
  emptyComparisonReason,
  type MonthFigures,
  measuresOver,
  TARGET_HAS_NO_MONTHS,
  toDateMonths,
  type VarianceInput,
  variance,
} from './variance'

/** Current: 10 heads in Apr rising by 1 a month, FTE heads − 0.5, cost $100,000 + $1,000 a month. */
const current: MonthFigures[] = FY27_MONTHS.map((month, i) => ({
  month,
  heads: 10 + i,
  fte: 9.5 + i,
  cost: 100_000 + 1_000 * i,
}))

/** Comparison: 10 heads, 10 FTE and $100,000 every month. */
const comparison: MonthFigures[] = FY27_MONTHS.map((month) => ({ month, heads: 10, fte: 10, cost: 100_000 }))

const input = (over: Partial<VarianceInput> = {}): VarianceInput => ({
  fiscalYear: 'FY27',
  current,
  comparison: { label: 'FY27 Budget', months: comparison },
  yearHasLockedVersion: true,
  asOf: '2026-09-30',
  ...over,
})

const DAYS: Record<string, number> = {
  '2026-04': 30,
  '2026-05': 31,
  '2026-06': 30,
  '2026-07': 31,
  '2026-08': 31,
  '2026-09': 30,
  '2026-10': 31,
  '2026-11': 30,
  '2026-12': 31,
  '2027-01': 31,
  '2027-02': 28,
  '2027-03': 31,
}

/** Day-weighted average FTE of `current` over months, written out. */
const avgFte = (months: readonly Month[]): number => {
  let num = 0
  let den = 0
  for (const m of months) {
    const i = FY27_MONTHS.indexOf(m)
    num += (9.5 + i) * DAYS[m]
    den += DAYS[m]
  }
  return num / den
}

const ok = (v: ReturnType<typeof variance>) => {
  if (v.kind !== 'ok') throw new Error(v.reason)
  return v
}

describe('cells', () => {
  const v = ok(variance(input()))

  it('one per FY month, then QTD, YTD and FY, with their labels', () => {
    expect(v.comparisonLabel).toBe('FY27 Budget')
    expect(v.cells.map((c) => c.window)).toEqual([...FY27_MONTHS.map(() => 'month'), 'qtd', 'ytd', 'fy'])
    expect(v.cells.slice(0, 3).map((c) => c.label)).toEqual(['Apr 2026', 'May 2026', 'Jun 2026'])
    expect(v.cells.slice(12).map((c) => c.label)).toEqual(['FY27 Q2 to date', 'FY27 year to date', 'FY27'])
  })

  it('a month: heads at its end, its FTE, its cost; delta = current − comparison, positive cost is over', () => {
    const sep = v.cells[5]
    expect(sep.months).toEqual(['2026-09'])
    expect(sep.current).toEqual({ heads: 15, fte: 14.5, cost: 105_000 })
    expect(sep.comparison).toEqual({ heads: 10, fte: 10, cost: 100_000 })
    expect(sep.delta).toEqual({ heads: 5, fte: 4.5, cost: 5_000 })
  })

  it('QTD at as-of 30 Sep 2026 is Jul to Sep: heads at 30 Sep, FTE by days, cost summed', () => {
    const qtd = v.cells[12]
    expect(qtd.months).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(qtd.current.heads).toBe(15)
    expect(qtd.current.fte).toBeCloseTo(avgFte(qtd.months), 12)
    expect(qtd.current.cost).toBe(103_000 + 104_000 + 105_000)
    expect(qtd.delta.cost).toBe(12_000)
  })

  it('YTD is Apr to Sep and FY is the twelve months', () => {
    const ytd = v.cells[13]
    expect(ytd.months).toEqual(FY27_MONTHS.slice(0, 6))
    expect(ytd.current.cost).toBe(615_000)
    expect(ytd.delta.cost).toBe(15_000)
    expect(ytd.current.fte).toBeCloseTo(avgFte(ytd.months), 12)
    const fy = v.cells[14]
    expect(fy.months).toEqual(FY27_MONTHS)
    expect(fy.current.heads).toBe(21)
    expect(fy.current.cost).toBe(1_266_000)
    expect(fy.delta).toEqual({ heads: 11, fte: expect.any(Number), cost: 66_000 })
    expect(fy.delta.fte).toBeCloseTo(avgFte(FY27_MONTHS) - 10, 12)
  })

  it('QTD and YTD end at toDateThrough when given (rounded modes end them at the last close)', () => {
    const w = ok(variance(input({ asOf: '2026-10-15', toDateThrough: '2026-09' })))
    expect(w.cells[12].months).toEqual([])
    expect(w.cells[12].current).toEqual({ heads: 0, fte: 0, cost: 0 })
    expect(w.cells[12].label).toBe('FY27 Q3 to date')
    expect(w.cells[13].months).toEqual(FY27_MONTHS.slice(0, 6))
    const plain = ok(variance(input({ asOf: '2026-10-15' })))
    expect(plain.cells[12].months).toEqual(['2026-10'])
  })

  it('a month missing from one side reads as zero', () => {
    const w = ok(variance(input({ current: current.filter((m) => m.month !== '2026-09') })))
    expect(w.cells[5].current).toEqual({ heads: 0, fte: 0, cost: 0 })
    expect(w.cells[5].delta).toEqual({ heads: -10, fte: -10, cost: -100_000 })
  })
})

describe('to-date windows', () => {
  it("a past year's QTD is its Q4", () => {
    const w = toDateMonths('FY26', '2026-09-30', '2026-03')
    expect(w.quarterLabel).toBe('FY26 Q4')
    expect(w.qtd).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(w.ytd).toHaveLength(12)
  })

  it("a later year's windows start empty", () => {
    const w = toDateMonths('FY28', '2026-09-30', '2026-09')
    expect(w.quarterLabel).toBe('FY28 Q1')
    expect(w.qtd).toEqual([])
    expect(w.ytd).toEqual([])
  })

  it('measuresOver an empty window is zero', () => {
    expect(measuresOver(new Map(), [])).toEqual({ heads: 0, fte: 0, cost: 0 })
  })
})

describe('a target comparison (9.2)', () => {
  it('is an empty state with the plan’s copy, never an error', () => {
    expect(variance(input({ comparison: null }))).toEqual({ kind: 'empty', reason: TARGET_HAS_NO_MONTHS })
    expect(variance(input({ comparison: null, yearHasLockedVersion: false, fiscalYear: 'FY28' }))).toEqual({
      kind: 'empty',
      reason: 'FY28 has no locked version yet.',
    })
    expect(emptyComparisonReason('FY28', false)).toBe('FY28 has no locked version yet.')
  })
})
