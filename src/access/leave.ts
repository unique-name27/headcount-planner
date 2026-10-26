/**
 * Leave views (docs/PLAN.md 7.7, change C25).
 *
 * - `counts` (HRBP, Leader): one figure, `plan.leave.onLeave`, for the mode's whole scope (the HRBP's
 *   unit; the leader's whole tree) at the as-of date, only when it is 5 or more. Under any filter
 *   other than version and comparison, or any period other than the default, it reads "—" with
 *   `LEAVE_FIT_NOTE`. No breakdown, series, delta, comparison or drill to people (its drill is a
 *   calculation card with the count only).
 * - `switch` (HR admin): leave data; per person only with "Show pay amounts" on.
 * - `none` (Manager, Finance): no leave column, filter, count or note anywhere.
 *
 * Acting as is free, so a scope's figure also shows only when the classes of people defined by
 * membership in every HRBP and Leader scope whose figure shows each hold 0 or 5 or more people on
 * leave: `leaveShown` drops the smallest offending scope until that holds, once per data load. Leave
 * never changes who is costed (7.2 rule 1).
 *
 * Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md); `LEAVE_OF` is data. `leaveFit` takes the
 * mode's scope as an optional third argument (an addition), so the scope's own pin (the HRBP's unit,
 * a tree's root seat) does not count as a filter.
 */
import type { PeriodPreset } from '@/data/fiscal'
import type { ISODate, Mode, WorkerRow } from '@/data/schema'
import { type Filters, isExcluded, LIST_DIMENSIONS } from '@/data/scope'
import { type Decision, hidden, limited, SHOWN } from './policy/types'
import type { ScopeLock } from './scopes/types'

export type LeaveView = 'switch' | 'counts' | 'none'

/** Each mode's leave view (docs/PLAN.md 8.1). */
export const LEAVE_OF: Readonly<Record<Mode, LeaveView>> = {
  manager: 'none',
  hrbp: 'counts',
  leader: 'counts',
  finance: 'none',
  'hr-admin': 'switch',
}

/** Why the leave count reads "—" under a filter or a non-default period (docs/PLAN.md 7.7). */
export const LEAVE_FIT_NOTE = 'Leave counts show for your whole unit or org at the as-of date.'

/** One HRBP or Leader scope whose leave figure could show: an HRBP pick's unit, or a leader seat's tree. */
export interface LeaveScope {
  /** Stable key: "unit:<unit>" or "tree:<leader positionId>". */
  key: string
  /** The people in the scope at the as-of date. */
  personIds: ReadonlySet<string>
}

/** What `leaveShown` reads besides the scopes. */
export interface LeaveEnv {
  /** Every worker row (the leave fields `onLeave` and `leavePaid` are read here and nowhere in the cost guard). */
  workers: readonly WorkerRow[]
  /** The smallest leave count shown (`privacy.leaveCounts` minCount, 5; never a constant). */
  min: number
}

/**
 * The scopes whose leave count shows (their keys): each holds 5 or more people on leave at `asOf`,
 * and every class of people defined by membership in the shown scopes holds 0 or 5 or more on leave.
 * While a class has 1 to 4, the smallest offending scope is dropped: offending are the scopes that
 * hold the class and the ones that cut it out of them (a reading: a unit of 9 on leave with an org
 * of 7 inside drops the org, so the wider count stays). Once per data load.
 */
export function leaveShown(scopes: readonly LeaveScope[], asOf: ISODate, env: LeaveEnv): ReadonlySet<string> {
  const onLeave = peopleOnLeave(env.workers, asOf)
  const counts = new Map<string, number>()
  for (const s of scopes) {
    let n = 0
    for (const id of onLeave) if (s.personIds.has(id)) n++
    counts.set(s.key, n)
  }
  // A scope under the minimum never shows; it defines no class either.
  let shown = scopes.filter((s) => (counts.get(s.key) ?? 0) >= env.min)
  for (;;) {
    // Each person on leave in a shown scope belongs to one class: the shown scopes that hold them.
    const classes = new Map<string, { n: number; keys: string[] }>()
    for (const id of onLeave) {
      const keys = shown.filter((s) => s.personIds.has(id)).map((s) => s.key)
      if (!keys.length) continue
      const sig = keys.join('|')
      const c = classes.get(sig)
      if (c) c.n++
      else classes.set(sig, { n: 1, keys })
    }
    const bad = [...classes.values()].filter((c) => c.n > 0 && c.n < env.min)
    if (!bad.length) break
    // The scopes that hold a class of 1 to 4, and the ones that cut it out of them (they share
    // someone on leave), offend; drop the smallest (fewest people, then its key), then look again.
    const holding = new Set(bad.flatMap((c) => c.keys))
    const offending = new Set(holding)
    for (const s of shown)
      for (const k of holding) {
        const h = shown.find((x) => x.key === k)
        if (h && h !== s && [...onLeave].some((id) => s.personIds.has(id) && h.personIds.has(id)))
          offending.add(s.key)
      }
    const drop = shown
      .filter((s) => offending.has(s.key))
      .sort((a, b) => a.personIds.size - b.personIds.size || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))[0]
    shown = shown.filter((s) => s !== drop)
  }
  return new Set(shown.map((s) => s.key))
}

/** The people on a leave of absence on `asOf`: an active assignment whose row says on leave. */
export function peopleOnLeave(workers: readonly WorkerRow[], asOf: ISODate): Set<string> {
  const out = new Set<string>()
  for (const w of workers) {
    if (!w?.employeeId || w.onLeave !== true) continue
    const start = w.assignmentStart || w.hireDate
    const end = w.assignmentEnd || w.terminationDate || null
    if (start && start <= asOf && (end == null || end >= asOf)) out.add(w.employeeId)
  }
  return out
}

/**
 * Why the leave count reads "—" (`LEAVE_FIT_NOTE`): any filter other than version and comparison
 * (leader, level, location, department, cost center, legal entity, country, currency, include or
 * exclude), or a period other than the default `fy`. Null when it may show.
 */
export function leaveFit(filters: Filters, period: PeriodPreset, scope?: ScopeLock | null): string | null {
  if (period !== 'fy') return LEAVE_FIT_NOTE
  // The scope's own pin is not a filter: the HRBP's unit, a tree's root seat (include).
  const pinnedLeader =
    scope?.kind === 'tree' &&
    !!filters.leaderId &&
    !isExcluded(filters, 'leaderId') &&
    scope.rootPositionIds.has(filters.leaderId)
  if (filters.leaderId && !pinnedLeader) return LEAVE_FIT_NOTE
  for (const d of LIST_DIMENSIONS) {
    if (!filters[d].length) continue
    const pinnedUnit =
      d === 'businessUnit' &&
      scope?.kind === 'unit' &&
      !isExcluded(filters, d) &&
      filters.businessUnit.length === 1 &&
      filters.businessUnit[0] === scope.unit
    if (!pinnedUnit) return LEAVE_FIT_NOTE
  }
  return null
}

/** The `leave:*` surfaces (docs/PLAN.md 8.3). */
export type LeaveSurface = 'leave:counts' | 'leave:people'

/**
 * The `leave:*` decisions of a mode, from its leave view, each L and H with 8.3's reason ("Leave is
 * not shown in this mode.", "One count for your whole unit at the as-of date, when 5 or more.").
 */
export function leaveDecisions(mode: Mode): Readonly<Record<LeaveSurface, Decision>> {
  switch (LEAVE_OF[mode]) {
    case 'switch':
      return { 'leave:counts': SHOWN, 'leave:people': limited('With Show pay amounts on.') }
    case 'counts':
      return {
        'leave:counts': limited(
          mode === 'hrbp'
            ? 'One count for your whole unit at the as-of date, when 5 or more.'
            : 'One count for your whole org at the as-of date, when 5 or more.',
        ),
        'leave:people': hidden(LEAVE_PEOPLE_HOW),
      }
    case 'none':
      return { 'leave:counts': hidden(NO_LEAVE), 'leave:people': hidden(NO_LEAVE) }
  }
}

/** Manager and Finance never see leave data (docs/PLAN.md 7.7). */
export const NO_LEAVE = 'Leave is not shown in this mode.'
/** Leave per person shows only in HR admin mode with the switch on. */
export const LEAVE_PEOPLE_HOW = 'Leave per person shows only in HR admin mode, with Show pay amounts on.'
