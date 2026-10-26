/**
 * What the Plan and Forecast views read from the loaded data, built once per data and plan state and
 * shared by both views' models (and by any view that needs the same lines): the scope's positions
 * and people, where each position sits (joined at read time, docs/PLAN.md 15.1 R26), the last close,
 * each version's lines, the closes' actual lines, and the lines a version shows month by month.
 * Pure; every cache is keyed by the objects it reads, so a filter change reuses the company-wide
 * work and only re-scopes.
 *
 * Readings taken here (views-1 builder, M2):
 *  - The scope's positions are the positions `ctx.data` keeps (the mode's scope and the filters);
 *    its people are the Employee assignments `ctx.data.workers` keeps, people not in the plan
 *    included (placed by their own HRIS fields, src/data/scope.ts).
 *  - A position sits where its row on the as-of date puts it, else (a seat that starts later) its
 *    first row (`placementRows`), for every version: lines store positionId, and the org is joined at
 *    read time (R26).
 *  - A Working version's lines are computed live (`versionLines` over every position, at its plan
 *    rates, with its vacancy allowance, docs/PLAN.md 15.2 C31); a locked version's are its stored
 *    lines; a retired Working has no lines.
 *  - What a version shows month by month (`shownLines`): a locked version's stored lines; for a
 *    Working version, the months through the last close are the closes' actuals ("Actual (HRIS
 *    estimate)", one-time items included, C32) and the later months its plan lines. So a Working
 *    version's year to date is what was spent (story 1's figures), and the rest of its year is the
 *    plan.
 */
import type { CostSeat } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { monthEnd, monthRange } from '@/data/fiscal'
import {
  type AssumptionRow,
  type Datasets,
  type ISODate,
  type Month,
  type PositionRow,
  siteByLocation,
  type WorkerRow,
} from '@/data/schema'
import { placementRows } from '@/data/scope'
import { requestsOf, seatIndex } from '@/drill/seats'
import { versionLines as computeVersionLines, lineContext } from '@/plan/engine/cost'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { isActiveOn, toAssignments } from '@/plan/engine/heads'
import { planLineRows } from '@/plan/engine/lineTable'
import {
  isLocked,
  rowOn,
  type SeatDetail,
  type SeatHistory,
  seatDetailOn,
  toPosition,
  workingOf,
} from '@/plan/engine/versions'
import { type CloseLine, closeLines, withClosedMonths } from '@/plan/lineSource'
import type {
  AnyVersion,
  Assignment,
  FxTable,
  LockedVersion,
  PlanLine,
  PlanState,
  Position,
} from '@/plan/types'

/* ───────────── small memo helpers ───────────── */

const NO_PLAN: object = {}

/** A cache keyed by two objects and a string. */
export class Memo<V> {
  private readonly store = new WeakMap<object, WeakMap<object, Map<string, V>>>()
  get(a: object, b: object | null | undefined, key: string, make: () => V): V {
    let inner = this.store.get(a)
    if (!inner) {
      inner = new WeakMap()
      this.store.set(a, inner)
    }
    const bk = b ?? NO_PLAN
    let byKey = inner.get(bk)
    if (!byKey) {
      byKey = new Map()
      inner.set(bk, byKey)
    }
    if (byKey.has(key)) return byKey.get(key) as V
    const v = make()
    if (byKey.size > 32) byKey.clear()
    byKey.set(key, v)
    return v
  }
}

/** A cache per analytics context. */
export function perContext<V>(make: (ctx: AnalyticsContext) => V): (ctx: AnalyticsContext) => V {
  const cache = new WeakMap<AnalyticsContext, V>()
  return (ctx) => {
    let hit = cache.get(ctx)
    if (hit === undefined) {
      hit = make(ctx)
      cache.set(ctx, hit)
    }
    return hit
  }
}

/* ───────────── the scope ───────────── */

/** The positions and people the context's scope and filters keep. */
export interface PlanScope {
  /** Position IDs in scope (`ctx.data.positions`). */
  ids: ReadonlySet<string>
  /** Employee IDs with an Employee assignment in scope (`ctx.data.workers`), people not in the plan included. */
  employees: ReadonlySet<string>
  /** The scope's own Employee assignments (one per worker row), from `ctx.data.workers`. */
  assignments: readonly Assignment[]
  /** The worker row behind each assignment, in the same order. */
  workers: readonly WorkerRow[]
  /** No org filter and no scope: the whole company. */
  company: boolean
}

export const scopeOf = perContext((ctx): PlanScope => {
  const ids = new Set<string>()
  for (const r of ctx.data.positions) ids.add(r.positionId)
  const every = toAssignments(ctx.data.workers)
  const assignments: Assignment[] = []
  const workers: WorkerRow[] = []
  every.forEach((a, i) => {
    if (a.workerType !== 'Employee') return
    assignments.push(a)
    workers.push(ctx.data.workers[i])
  })
  const employees = new Set(assignments.map((a) => a.employeeId))
  return { ids, employees, assignments, workers, company: ctx.isCompany }
})

/* ───────────── where positions sit ───────────── */

const placements = new Memo<ReadonlyMap<string, PositionRow>>()

/** Each position's row on the as-of date, else its first row (company-wide). */
export function placementOf(ctx: AnalyticsContext): ReadonlyMap<string, PositionRow> {
  return placements.get(ctx.all.positions, ctx.positionIndex, ctx.asOf, () =>
    placementRows(ctx.all.positions, ctx.positionIndex),
  )
}

/** A position as the drill layer lists it (`Position`), from its placement row. */
export function positionOf(ctx: AnalyticsContext, positionId: string): Position | null {
  const r = placementOf(ctx).get(positionId)
  return r ? toPosition(r) : null
}

const seatsMemo = new WeakMap<ReadonlyMap<string, PositionRow>, Map<string, CostSeat>>()

/** Where a position sits for the cost guard (its placement row, R26), or null when the data has no such position. */
export function costSeatOf(ctx: AnalyticsContext): (positionId: string) => CostSeat | null {
  const rows = placementOf(ctx)
  let cache = seatsMemo.get(rows)
  if (!cache) {
    cache = new Map()
    seatsMemo.set(rows, cache)
  }
  const out = cache
  return (id) => {
    const hit = out.get(id)
    if (hit) return hit
    const r = rows.get(id)
    if (!r) return null
    const site = siteByLocation.get(r.location)
    const seat: CostSeat = {
      businessUnit: r.businessUnit,
      department: r.department ?? null,
      costCenter: r.costCenter,
      location: r.location,
      legalEntity: r.legalEntity || site?.legalEntity || '',
      country: site?.country ?? '',
      level: r.level,
      managerPositionId: r.managerPositionId ?? null,
    }
    out.set(id, seat)
    return seat
  }
}

/** A position's manager position (its placement row's), for atoms of positions created since the last close. */
export function managerOfIn(ctx: AnalyticsContext): (positionId: string) => string | null {
  const rows = placementOf(ctx)
  return (id) => rows.get(id)?.managerPositionId ?? null
}

/* ───────────── seats ───────────── */

/** Every seat's history (src/drill/seats.ts, memoized per data and plan state). */
export const seatsOf = (ctx: AnalyticsContext): ReadonlyMap<string, SeatHistory> => seatIndex(ctx)

const detailMemo = new WeakMap<SeatHistory, Map<ISODate, SeatDetail | null>>()

/** A seat on a day, with where its planned start came from (memoized per seat and day). */
export function seatOn(ctx: AnalyticsContext, positionId: string, on: ISODate): SeatDetail | null {
  const seat = seatsOf(ctx).get(positionId)
  if (!seat) return null
  let byDay = detailMemo.get(seat)
  if (!byDay) {
    byDay = new Map()
    detailMemo.set(seat, byDay)
  }
  if (byDay.has(on)) return byDay.get(on) ?? null
  const s = seatDetailOn(seat, on)
  byDay.set(on, s)
  return s
}

/* ───────────── closes ───────────── */

/** The last closed month and its month-end, or null before the first close. */
export interface LastClose {
  month: Month
  date: ISODate
}

export function lastCloseOf(plan: PlanState | null): LastClose | null {
  let last: Month | null = null
  for (const c of plan?.closes ?? []) if (last === null || c.month > last) last = c.month
  return last ? { month: last, date: monthEnd(last) } : null
}

/**
 * The last close whose month-end is on or before a date, or null when there is none: where cost
 * windows to date end in rounded modes (7.3b: never a mid-month as-of date, and never a close after
 * the as-of date).
 */
export function lastCloseOnOrBefore(plan: PlanState | null, on: ISODate): LastClose | null {
  let last: Month | null = null
  for (const c of plan?.closes ?? [])
    if (monthEnd(c.month) <= on && (last === null || c.month > last)) last = c.month
  return last ? { month: last, date: monthEnd(last) } : null
}

/** Every closed month, in order. */
export function closedMonthsOf(plan: PlanState | null): Month[] {
  return [...new Set((plan?.closes ?? []).map((c) => c.month))].sort()
}

/** One close line read as a plan line (basis 'hris'); `employeeId` and `positionId` kept. */
export type { CloseLine }

/**
 * Every close's lines as plan lines, in close order (docs/PLAN.md 6.6: closed months are read from
 * closes, not recomputed). People not in the plan keep `positionId` '' and `closePositionId` null:
 * they count in actual heads, never in a position's cost. The one helper Targets and the sample's
 * routing read too (src/plan/lineSource.ts `closeLines`).
 */
export const closeLinesOf = (plan: PlanState | null): readonly CloseLine[] =>
  plan ? closeLines(plan.closes) : []

/* ───────────── versions and their lines ───────────── */

/** A version's assumption rows: a locked version's stored rows, else the dataset's rows naming it (by ID or name). */
export function assumptionRowsOf(all: Datasets, v: AnyVersion): readonly AssumptionRow[] {
  if (isLocked(v)) return v.assumptions
  const id = v.versionId.trim()
  const name = v.name.trim()
  return all.assumptions.filter((r) => {
    const x = (r.version ?? '').trim()
    return x === id || x === name
  })
}

/** A version's rates: a locked version's stored rates, else its assumption rows' fx table. */
export function ratesOf(all: Datasets, v: AnyVersion): FxTable {
  return isLocked(v) ? v.rates : fxRatesFromAssumptions(assumptionRowsOf(all, v))
}

const linesMemo = new Memo<readonly PlanLine[]>()
const lockedMemo = new WeakMap<LockedVersion, readonly PlanLine[]>()

/** A version's own lines over its grid, every position (see the module comment). */
export function versionLinesOf(ctx: AnalyticsContext, v: AnyVersion): readonly PlanLine[] {
  if (isLocked(v)) {
    let hit = lockedMemo.get(v)
    if (!hit) {
      hit = [...planLineRows(v.lines)]
      lockedMemo.set(v, hit)
    }
    return hit
  }
  if (v.state !== 'working') return []
  return linesMemo.get(ctx.all, ctx.plan, `${v.versionId}|${ctx.asOf}`, () => {
    const rows = assumptionRowsOf(ctx.all, v)
    const lc = lineContext({
      version: v,
      asOf: ctx.asOf,
      positions: ctx.all.positions,
      workers: ctx.all.workers,
      comp: ctx.all.comp,
      reqs: ctx.all.reqs,
      requests: requestsOf(ctx),
      assumptions: rows,
      rates: { table: fxRatesFromAssumptions(rows), use: 'plan', closedThrough: null },
      closes: ctx.plan?.closes ?? [],
    })
    return computeVersionLines(v, lc)
  })
}

/**
 * What a version shows month by month (see the module comment): a Working version's months through
 * the last close are the closes' actual lines (positions only), the later months its own lines. Built
 * by the one line rule Targets reads (src/plan/lineSource.ts `withClosedMonths`, C33 and review RF-4),
 * so the two price every closed month from the same lines by construction.
 */
export function shownLines(ctx: AnalyticsContext, v: AnyVersion): readonly PlanLine[] {
  const own = versionLinesOf(ctx, v)
  if (isLocked(v) || v.state !== 'working') return own
  // Back-dated adjustments post in the month the close that found them closed (6.6, SA-2).
  return withClosedMonths(own, ctx.plan?.closes ?? [], null, ctx.plan?.adjustments)
}

/** The fiscal year's Working version (the forecast's), or null. */
export const workingFor = (ctx: AnalyticsContext, v: AnyVersion | null): AnyVersion | null =>
  v ? (v.state === 'working' ? v : workingOf(ctx.versions, v.fiscalYear)) : null

/** The comparison version (a locked version of the shown year), or null for a target comparison. */
export function comparisonOf(ctx: AnalyticsContext): LockedVersion | null {
  const c = ctx.compare
  if (c.kind !== 'version') return null
  const v = ctx.versions.find((x) => x.versionId === c.versionId)
  return v && isLocked(v) ? v : null
}

/** A version's grid months, in order. */
export const gridMonths = (v: Pick<AnyVersion, 'grid'>): Month[] => monthRange(v.grid.from, v.grid.to)

/* ───────────── people ───────────── */

/** An employee active on a day: the assignment they hold that day and its worker row. */
export interface ActiveEmployee {
  assignment: Assignment
  worker: WorkerRow
}

/**
 * The scope's employees active on a day (Employee assignments, the last day counted, docs/PLAN.md 6.1),
 * one entry per person: the assignment they hold that day (the latest to start when two overlap).
 */
export function activeOn(scope: PlanScope, d: ISODate): Map<string, ActiveEmployee> {
  const out = new Map<string, ActiveEmployee>()
  scope.assignments.forEach((a, i) => {
    if (!isActiveOn(a, d)) return
    const cur = out.get(a.employeeId)
    if (!cur || a.start >= cur.assignment.start)
      out.set(a.employeeId, { assignment: a, worker: scope.workers[i] })
  })
  return out
}

/** A seat's row on a day, else its placement row. */
export function rowOf(ctx: AnalyticsContext, positionId: string, on: ISODate): PositionRow | null {
  const seat = seatsOf(ctx).get(positionId)
  return (seat ? rowOn(seat.rows, on) : null) ?? placementOf(ctx).get(positionId) ?? null
}

/**
 * Whether a position sits in the tree under a root position on a date (strictly below it), walking
 * up the manager positions of the rows in effect then. The forecast's freezes keyed by leader read it.
 */
export function inTreeOf(
  ctx: AnalyticsContext,
): (positionId: string, rootPositionId: string, on: ISODate) => boolean {
  const seats = seatsOf(ctx)
  const cache = new Map<ISODate, Map<string, string | null>>()
  const managers = (on: ISODate) => {
    let m = cache.get(on)
    if (!m) {
      m = new Map()
      for (const [id, s] of seats) {
        const r = rowOn(s.rows, on)
        if (r) m.set(id, r.managerPositionId ?? null)
      }
      if (cache.size > 64) cache.clear()
      cache.set(on, m)
    }
    return m
  }
  return (positionId, rootPositionId, on) => {
    const up = managers(on)
    const seen = new Set<string>()
    let cur = up.get(positionId) ?? null
    while (cur != null && !seen.has(cur)) {
      if (cur === rootPositionId) return true
      seen.add(cur)
      cur = up.get(cur) ?? null
    }
    return false
  }
}
