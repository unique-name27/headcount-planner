/**
 * Variance (docs/PLAN.md 6.8 and 9.2): actual (closed months) or forecast (open months) minus the
 * comparison version, in heads, average FTE and cost, by month, QTD, YTD and full year. Positive cost
 * variance is over. With a target comparison (a fiscal year with no locked version, or the target
 * picked), monthly, QTD and YTD "vs" figures, Variance and Bridge compute nothing and show an empty
 * state. Built by engines B in M1. Pure.
 *
 * Windows: a month cell is that month; QTD is the fiscal quarter of the as-of date (clamped into the
 * fiscal year: a past year's QTD is its Q4) through `toDateThrough` or the as-of month; YTD is the
 * fiscal year's first month through the same month; FY is the twelve months. A to-date window with no
 * month in it (rounded modes before the quarter's first close) has `months` [] and zero measures.
 * Heads are at the window's last month-end, average FTE is weighted by each month's days, cost is
 * summed in month order. A month missing from a side's figures reads as zero. Nothing is rounded.
 */

import { daysInMonth, fyRange, monthKey, monthsOf, quarterOf } from '@/data/fiscal'
import type { FiscalYear, ISODate, Month } from '@/data/schema'
import { formatMonth } from '@/lib/dates'

/** The empty-state text when the comparison is a target (docs/PLAN.md 9.2). */
export const TARGET_HAS_NO_MONTHS = 'A target has no monthly plan. Pick a version to compare.'

/**
 * Why a "vs" figure computes nothing against a target: the year has a locked version but the target
 * was picked, or it has none yet ("FY28 has no locked version yet."). Copy from docs/PLAN.md 9.2.
 */
export const emptyComparisonReason = (fiscalYear: FiscalYear, yearHasLockedVersion: boolean): string =>
  yearHasLockedVersion ? TARGET_HAS_NO_MONTHS : `${fiscalYear} has no locked version yet.`

/** One month's figures on one side. */
export interface MonthFigures {
  month: Month
  /** Heads at the month's end. */
  heads: number
  /** Average FTE over the month (daily). */
  fte: number
  /** Loaded cost in USD. */
  cost: number
}

export type VarianceWindow = 'month' | 'qtd' | 'ytd' | 'fy'

/** The three measures. */
export interface Measures {
  heads: number
  fte: number
  cost: number
}

/** One window: heads at its last month's end, average FTE over its months (month-weighted by days), cost summed. */
export interface VarianceCell {
  window: VarianceWindow
  /** "Sep 2026", "FY27 Q2 to date", "FY27 year to date", "FY27". */
  label: string
  months: readonly Month[]
  current: Measures
  comparison: Measures
  /** current − comparison; positive cost is over. */
  delta: Measures
}

export interface VarianceInput {
  fiscalYear: FiscalYear
  /** Actual for closed months, forecast for open months, every month of the fiscal year. */
  current: readonly MonthFigures[]
  /** The comparison version's months; null for a target comparison (empty state). */
  comparison: { label: string; months: readonly MonthFigures[] } | null
  yearHasLockedVersion: boolean
  asOf: ISODate
  /** QTD and YTD end at the as-of month, or at this month when given (rounded modes end them at the last close). */
  toDateThrough?: Month | null
}

export type VarianceResult =
  | { kind: 'ok'; comparisonLabel: string; cells: readonly VarianceCell[] }
  | { kind: 'empty'; reason: string }

/** Zero heads, FTE and cost. */
const ZERO: Measures = Object.freeze({ heads: 0, fte: 0, cost: 0 })

/** One side's measures over a window (see the module comment). */
export function measuresOver(figures: ReadonlyMap<Month, MonthFigures>, months: readonly Month[]): Measures {
  if (months.length === 0) return { ...ZERO }
  let fteDays = 0
  let days = 0
  let cost = 0
  for (const m of months) {
    const f = figures.get(m)
    const d = daysInMonth(m)
    fteDays += (f?.fte ?? 0) * d
    days += d
    cost += f?.cost ?? 0
  }
  return {
    heads: figures.get(months[months.length - 1])?.heads ?? 0,
    fte: days > 0 ? fteDays / days : 0,
    cost,
  }
}

const byMonth = (rows: readonly MonthFigures[]): Map<Month, MonthFigures> => {
  const out = new Map<Month, MonthFigures>()
  for (const r of rows) out.set(r.month, r)
  return out
}

const minus = (a: Measures, b: Measures): Measures => ({
  heads: a.heads - b.heads,
  fte: a.fte - b.fte,
  cost: a.cost - b.cost,
})

/**
 * The months of each to-date window: QTD (the as-of date's fiscal quarter, the date clamped into the
 * fiscal year) and YTD, both through `through` (inclusive).
 */
export function toDateMonths(
  fiscalYear: FiscalYear,
  asOf: ISODate,
  through: Month,
): { qtd: Month[]; ytd: Month[]; quarterLabel: string } {
  const months = monthsOf(fiscalYear)
  const fy = fyRange(fiscalYear)
  const anchor = asOf < fy.start ? fy.start : asOf > fy.end ? fy.end : asOf
  const q = quarterOf(anchor)
  const qFrom = monthKey(q.start)
  const qTo = monthKey(q.end)
  return {
    qtd: months.filter((m) => m >= qFrom && m <= qTo && m <= through),
    ytd: months.filter((m) => m <= through),
    quarterLabel: q.label,
  }
}

/**
 * Cells for every month of the fiscal year, then QTD, YTD and FY, in that order; an empty state (not
 * an error) when `comparison` is null, with `emptyComparisonReason`.
 *
 * Fixture: bridge.test.ts EV1 (a target comparison is an empty state in both variance and bridge).
 */
export function variance(input: VarianceInput): VarianceResult {
  if (!input.comparison) {
    return { kind: 'empty', reason: emptyComparisonReason(input.fiscalYear, input.yearHasLockedVersion) }
  }
  const current = byMonth(input.current)
  const comparison = byMonth(input.comparison.months)
  const cell = (window: VarianceWindow, label: string, months: readonly Month[]): VarianceCell => {
    const cur = measuresOver(current, months)
    const cmp = measuresOver(comparison, months)
    return { window, label, months, current: cur, comparison: cmp, delta: minus(cur, cmp) }
  }
  const fyMonths = monthsOf(input.fiscalYear)
  const through = input.toDateThrough ?? monthKey(input.asOf)
  const toDate = toDateMonths(input.fiscalYear, input.asOf, through)
  const cells: VarianceCell[] = fyMonths.map((m) => cell('month', formatMonth(m), [m]))
  cells.push(
    cell('qtd', `${toDate.quarterLabel} to date`, toDate.qtd),
    cell('ytd', `${input.fiscalYear} year to date`, toDate.ytd),
    cell('fy', input.fiscalYear, fyMonths),
  )
  return { kind: 'ok', comparisonLabel: input.comparison.label, cells }
}
