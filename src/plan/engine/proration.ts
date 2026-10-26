/**
 * Proration (docs/PLAN.md 6.2, 15.1 R20): how much of a month a seat or person is active, under a
 * version's method. Proration is a property of each version and is stored in its lock. Average FTE
 * never uses it (it is always daily, heads.ts). Pure; dates are ISO strings, both ends inclusive.
 *
 * | Method       | Rule |
 * |--------------|------|
 * | `daily`      | active days ÷ days in the month |
 * | `half-month` | start on day 1 to 15 counts 1, later 0.5; last day on 1 to 15 counts 0.5, later 1; both in one month 0.5 |
 * | `full-month` | 1 if active on the month's last day, else 0 |
 *
 * A month the span does not touch is 0 under every method, and a month it covers whole is 1.
 *
 * Readings kept here (engines A, M1):
 *  - A start on the month's first day and a last day on the month's last day are no edges: the span
 *    covers that side of the month whole. So a span from the 1st to the month's last day counts 1,
 *    and a seat that changes hands at a month boundary counts 1 on each side under every method.
 *  - "Both in one month" is literal (R20) for real edges: under half-month, a span that starts after
 *    the 1st and ends before the month's last day counts 0.5, whatever the days (3 to 20 Sep, 3 to
 *    29 Sep and 16 to 20 Sep all count 0.5).
 */
import { daysInMonth, monthEnd, monthStart } from '@/data/fiscal'
import type { ISODate, Month, Proration } from '@/data/schema'
import { ms } from '@/lib/dates'

const DAY = 86_400_000

/** Day of the month (1 to 31) of an ISO date. */
const dayOf = (d: ISODate): number => +d.slice(8, 10)

/** A month's first day, last day and length, cached (lines ask for the same months many times). */
const BOUNDS = new Map<Month, { first: ISODate; last: ISODate; days: number }>()
function boundsOf(month: Month): { first: ISODate; last: ISODate; days: number } {
  let b = BOUNDS.get(month)
  if (!b) {
    b = { first: monthStart(month), last: monthEnd(month), days: daysInMonth(month) }
    if (BOUNDS.size > 5_000) BOUNDS.clear()
    BOUNDS.set(month, b)
  }
  return b
}

/**
 * The active fraction of `month` for a span from `start` to `lastDay` (both inclusive). A null start
 * means active since before the month; a null last day means still active after it.
 *
 * Fixtures (proration.test.ts): PR1 to PR12, and C1's September (0.5 daily, 0.5 half-month, 1
 * full-month); H1 uses daily.
 */
export function activeFraction(
  method: Proration,
  month: Month,
  start: ISODate | null,
  lastDay: ISODate | null,
): number {
  const { first, last, days: monthDays } = boundsOf(month)
  // Not touched: starts after the month, ended before it, or an empty span.
  if (start != null && start > last) return 0
  if (lastDay != null && lastDay < first) return 0
  if (start != null && lastDay != null && lastDay < start) return 0
  const startsInside = start != null && start > first
  const endsInside = lastDay != null && lastDay < last
  if (!startsInside && !endsInside) return 1
  switch (method) {
    case 'daily': {
      const from = startsInside ? (start as ISODate) : first
      const to = endsInside ? (lastDay as ISODate) : last
      const days = Math.round((ms(to) - ms(from)) / DAY) + 1
      return days / monthDays
    }
    case 'half-month':
      // Both edges in the month (R20, literal): 0.5.
      if (startsInside && endsInside) return 0.5
      if (startsInside) return dayOf(start as ISODate) <= 15 ? 1 : 0.5
      return dayOf(lastDay as ISODate) <= 15 ? 0.5 : 1
    case 'full-month':
      // Active on the month's last day: started by it (checked above) and not ended before it.
      return endsInside ? 0 : 1
  }
}

/**
 * The in-year fraction of a span: Σ over `months` of `activeFraction(method, m, start, lastDay)` ÷ 12.
 * Used for in-year band amounts (asks cost, a trade's `inYearBp`, freeze savings, "Move budget too?"):
 * an annual amount × this fraction is its in-year amount (docs/PLAN.md 6.9 and 11.3).
 *
 * Fixtures: PR13 (T1's give seat from 1 Nov 2026 over FY27 is 5/12 and its get seats from 1 Jan
 * 2027 are 3/12, under every method).
 */
export function inYearFraction(
  method: Proration,
  months: readonly Month[],
  start: ISODate | null,
  lastDay: ISODate | null,
): number {
  let total = 0
  for (const m of months) total += activeFraction(method, m, start, lastDay)
  return total / 12
}
