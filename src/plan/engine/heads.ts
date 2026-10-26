/**
 * Heads and FTE (docs/PLAN.md 6.1). Pure.
 *
 * - The last day counts: `isActiveOn(a, d) = a.start <= d && (a.end == null || a.end >= d)` (15.1
 *   R19; the template app's `isActiveAt` does not, and fixture H2 pins the difference). Kept here as
 *   well as in src/data/scope.ts, because plan/ imports data/scope for types only (docs/PLAN.md 4).
 * - Employees count 1 head, on leave too. Interns and contractors count 0 heads and are not costed.
 * - Average FTE is always daily: Σ over the window's days of Σ active Employee assignment FTE ÷ days,
 *   whatever the version's proration.
 */
import type { ISODate, WorkerRow } from '@/data/schema'
import { ms } from '@/lib/dates'
import type { Assignment } from '../types'

const DAY = 86_400_000

/** Active on day `d`, the last day included. Fixture: H2. */
export function isActiveOn(a: { start: ISODate; end?: ISODate | null }, d: ISODate): boolean {
  return a.start <= d && (a.end == null || a.end >= d)
}

/** The earlier of two optional dates; null when both are blank. */
function earlier(a: ISODate | null | undefined, b: ISODate | null | undefined): ISODate | null {
  if (!a) return b || null
  if (!b) return a
  return a < b ? a : b
}

/**
 * The assignments in `workers` rows: `start` = assignmentStart, or hireDate when blank; `end` = the
 * earlier of assignmentEnd and terminationDate (null when both are blank); `fte` = fte, or 1 when
 * blank; `positionId` = positionId or null (not in plan). Rows keep their order.
 *
 * Fixtures: H1, H2, H3 (built from workers rows).
 */
export function toAssignments(workers: readonly WorkerRow[]): Assignment[] {
  return workers.map((w) => ({
    employeeId: w.employeeId,
    positionId: w.positionId || null,
    start: w.assignmentStart || w.hireDate,
    end: earlier(w.assignmentEnd, w.terminationDate),
    fte: w.fte ?? 1,
    workerType: w.workerType || 'Employee',
  }))
}

/**
 * Heads on day `d`: the number of distinct employees with an active Employee assignment on `d`
 * (on leave included; contractors and interns count 0).
 *
 * Fixtures: H1 (1 at 30 Sep 2026), H2 (1 at 30 Sep, 0 at 1 Oct 2026), H3 (0 actual heads at 31 Oct).
 */
export function headsOn(assignments: readonly Assignment[], d: ISODate): number {
  const ids = new Set<string>()
  for (const a of assignments) if (a.workerType === 'Employee' && isActiveOn(a, d)) ids.add(a.employeeId)
  return ids.size
}

/**
 * Average FTE over a window (both ends inclusive): Σ over its days of Σ active Employee assignment FTE
 * ÷ days in the window. Always daily, whatever the version's proration.
 *
 * Fixture: H1 (0.5 for September 2026: a 1.0 FTE hire on 16 Sep, 15 of 30 days).
 */
export function averageFte(
  assignments: readonly Assignment[],
  window: { start: ISODate; end: ISODate },
): number {
  const days = Math.round((ms(window.end) - ms(window.start)) / DAY) + 1
  if (days <= 0) return 0
  let fteDays = 0
  for (const a of assignments) {
    if (a.workerType !== 'Employee') continue
    const from = a.start > window.start ? a.start : window.start
    const to = a.end != null && a.end < window.end ? a.end : window.end
    if (to < from) continue
    fteDays += a.fte * (Math.round((ms(to) - ms(from)) / DAY) + 1)
  }
  return fteDays / days
}
