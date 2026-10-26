/**
 * What the drill layer reads about seats and people, once per loaded data (memoized): each seat's
 * history (rows, Employee assignments, reqs, approved Backfills; src/plan/engine/versions.ts), its
 * state on the as-of date (the derived status of docs/PLAN.md 6.5: a seat with an active Employee
 * assignment is Filled, a row saying Filled reads Open after the last day), and the names the
 * records show: the person in each seat (`holderNames`) and each employee by ID.
 *
 * Display only: no number is counted here, so a list's status column and the position card read the
 * same derived status the engines count. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Datasets, ISODate } from '@/data/schema'
import { holderNames } from '@/data/scope'
import type { MetricsApi } from '@/metrics/types'
import { toAssignments } from '@/plan/engine/heads'
import { fromRow, withEffectiveStates } from '@/plan/engine/requests'
import { type SeatHistory, type SeatState, seatHistories, seatOn } from '@/plan/engine/versions'
import type { Cycle, HcRequest } from '@/plan/types'
import { PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'

/** What the seat helpers read from the analytics context. */
export type SeatContext = Pick<AnalyticsContext, 'all' | 'asOf'> & Partial<Pick<AnalyticsContext, 'plan'>>

const histories = new WeakMap<Datasets, WeakMap<object, ReadonlyMap<string, SeatHistory>>>()
const NO_PLAN = {}

const rowsCache = new WeakMap<Datasets['requests'], readonly HcRequest[]>()
function requestRows(all: Datasets): readonly HcRequest[] {
  let hit = rowsCache.get(all.requests)
  if (!hit) {
    hit = all.requests.map((r) => fromRow(r))
    rowsCache.set(all.requests, hit)
  }
  return hit
}

const NO_REQUESTS: readonly HcRequest[] = []
const merged = new WeakMap<readonly HcRequest[], WeakMap<readonly HcRequest[], readonly HcRequest[]>>()

/**
 * The requests of the loaded data: the imported `requests` rows, with the plan state's own
 * requests (raised or changed in the app) in place of a row with the same ID, and after them.
 */
export function requestsOf(ctx: SeatContext): readonly HcRequest[] {
  const rows = requestRows(ctx.all)
  const own = ctx.plan?.requests ?? NO_REQUESTS
  if (!own.length) return rows
  let byOwn = merged.get(rows)
  if (!byOwn) {
    byOwn = new WeakMap()
    merged.set(rows, byOwn)
  }
  let hit = byOwn.get(own)
  if (!hit) {
    const ids = new Set(own.map((r) => r.requestId))
    hit = [...rows.filter((r) => !ids.has(r.requestId)), ...own]
    byOwn.set(own, hit)
  }
  return hit
}

/* ───────────── the effective state (D-EXPIRY) ───────────── */

/** What the effective requests read from the analytics context. */
export type EffectiveContext = SeatContext & { metrics: Pick<MetricsApi, 'num'> }

const NO_CYCLES: readonly Cycle[] = []

/**
 * The requests in force (`requestsOf`) in their effective state on the as-of date (lead decision
 * D-EXPIRY, docs/PLAN.md 10.1, R6): plan/engine/requests.ts `withEffectiveStates`, the one helper,
 * over the context's as-of date, the idle-days setting and the plan's cycles, so an idle Draft or
 * Sent back request outside an open cycle reads Expired in every list, count, card and pending test
 * a reader makes: it never counts as in progress, in asks, in routing, or as a seat's or a credit's
 * pending request. The write path keeps the stored states and reads expiry when it acts. The same
 * array when nothing has expired.
 */
export function effectiveRequestsOf(ctx: EffectiveContext): readonly HcRequest[] {
  return withEffectiveStates(requestsOf(ctx), {
    asOf: ctx.asOf,
    idleDays: ctx.metrics.num(REQUESTS_PARAM.idleDays.metricId, REQUESTS_PARAM.idleDays.key),
    cycles: ctx.plan?.cycles ?? NO_CYCLES,
  })
}

/** Every seat's history, by position ID (memoized per data and plan state). */
export function seatIndex(ctx: SeatContext): ReadonlyMap<string, SeatHistory> {
  let byPlan = histories.get(ctx.all)
  if (!byPlan) {
    byPlan = new WeakMap()
    histories.set(ctx.all, byPlan)
  }
  const key = ctx.plan ?? NO_PLAN
  let hit = byPlan.get(key)
  if (!hit) {
    hit = seatHistories({
      positions: ctx.all.positions,
      assignments: toAssignments(ctx.all.workers),
      reqs: ctx.all.reqs,
      requests: requestsOf(ctx),
    })
    byPlan.set(key, hit)
  }
  return hit
}

/** A seat on a day (the as-of date when not given), or null when the data has no such seat or row yet. */
export function seatStateOf(ctx: SeatContext, positionId: string, on: ISODate = ctx.asOf): SeatState | null {
  const seat = seatIndex(ctx).get(positionId)
  return seat ? seatOn(seat, on) : null
}

const holders = new WeakMap<Datasets['workers'], Map<ISODate, ReadonlyMap<string, string>>>()

/** The name of the person in each seat on the as-of date (memoized). */
export function holderNamesOf(ctx: Pick<AnalyticsContext, 'all' | 'asOf'>): ReadonlyMap<string, string> {
  let byDate = holders.get(ctx.all.workers)
  if (!byDate) {
    byDate = new Map()
    holders.set(ctx.all.workers, byDate)
  }
  let hit = byDate.get(ctx.asOf)
  if (!hit) {
    hit = holderNames(ctx.all.workers, ctx.asOf)
    byDate.set(ctx.asOf, hit)
  }
  return hit
}

/**
 * Names a position for filter labels and toasts: the person in the seat ("Dana Ito"), the way the
 * leader filter is named everywhere (src/data/scope.ts `scopeLabel`). Undefined for a vacant seat.
 */
export function positionNamer(
  ctx: Pick<AnalyticsContext, 'all' | 'asOf'>,
): (positionId: string) => string | undefined {
  const names = holderNamesOf(ctx)
  return (id) => names.get(id)
}

const people = new WeakMap<Datasets['workers'], ReadonlyMap<string, string>>()

/** Each employee's name by employee ID (the latest row that names them). */
export function workerNames(ctx: Pick<AnalyticsContext, 'all'>): ReadonlyMap<string, string> {
  let hit = people.get(ctx.all.workers)
  if (!hit) {
    const m = new Map<string, string>()
    for (const w of ctx.all.workers) if (w.employeeId && w.name) m.set(w.employeeId, w.name)
    hit = m
    people.set(ctx.all.workers, hit)
  }
  return hit
}
