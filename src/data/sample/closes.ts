/**
 * The sample's month closes (docs/PLAN.md 6.6 and 7.3a, change C20): April to September 2026, each
 * closed by the FP&A lead on the month's last day at 18:00, from the HRIS as it stood that day
 * (`asKnownOn`: the people, pay, leave, seats and reqs known by then) and FY27 Working's assumptions
 * with the month's actual rates (each set at the month's end). close.ts `closeMonth` computes the
 * actual lines (HRIS pay, plus the one-time items booked in the month: change C32, lead decision
 * D-CLOSE), stores the cost-atom index at the month's end and hashes the close with `sha256()`.
 *
 * The 31 Aug and 30 Sep indexes differ by exactly one partition change: the Open Silicon Engineering
 * manager seat raised to M2 on 10 Sep 2026 heads a new atom from the September close (7.3, the LP
 * test's two closes). No back-dated change reaches a closed month, so the sample posts no adjustment
 * (sample.test.ts recomputes every closed month from the final data with the leave of its month-end
 * and finds the same lines).
 */
import { type ActualsInput, closeMonth } from '@/plan/engine/close'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import type { MonthClose } from '@/plan/types'
import { monthEnd } from '../fiscal'
import type { ISODate, Month } from '../schema'
import { FY27_WORKING, versionSpec } from './assumptions'
import { asKnownOn, assumptionsOf, type SampleBase } from './base'

/** The closed months (FY27 Working, April to September closed). */
export const CLOSE_MONTHS: readonly Month[] = [
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
]

/** The day a month is closed: its last day. */
export const closeDayOf = (month: Month): ISODate => monthEnd(month)

/** When a month was closed: its last day at 18:00. */
export const closedAtOf = (month: Month): string => `${closeDayOf(month)}T18:00`

/**
 * What closing a month reads: the datasets as known on its last day and Working's rows then. The reqs
 * give the one-time items the month books (sign-on and relocation in the start month, the agency fee
 * in the offer-accepted month; lead decision D-CLOSE), so the closes carry them.
 */
export function closeInput(base: Pick<SampleBase, 'datasets' | 'known'>, month: Month): ActualsInput {
  const view = asKnownOn(base, closeDayOf(month))
  const rows = assumptionsOf(view, FY27_WORKING)
  return {
    month,
    positions: view.positions,
    workers: view.workers,
    comp: view.comp,
    reqs: view.reqs,
    assumptions: rows,
    versionId: FY27_WORKING,
    versionName: versionSpec(FY27_WORKING).name,
    rates: fxRatesFromAssumptions(rows),
  }
}

/** The six closes, oldest first, each closed by `by` (the FP&A lead's employee ID). */
export function sampleCloses(base: Pick<SampleBase, 'datasets' | 'known'>, by: string): MonthClose[] {
  return CLOSE_MONTHS.map((m) => closeMonth(closeInput(base, m), closedAtOf(m), by))
}
