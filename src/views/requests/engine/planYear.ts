/**
 * One fiscal year's Working plan as the Requests view reads it (docs/PLAN.md 6.9, 10.3, 11.3): the
 * year's Working version, its band estimates at plan rates (`tradeRatesOf` over the version's own
 * assumption rows and plan FX), and the asks context over the loaded seats (`asksContext`): what the
 * cycle's ranked asks, their head and band effects, the cut line and the gap after approval read.
 *
 * Built from the unscoped data (`ctx.all`): asks and cut lines are an org's, so a filter never moves
 * them; which rows a viewer sees is decided where the rows are listed (8.4). Memoized per data, plan
 * state and fiscal year, so a filter change reuses it. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, monthKey, shiftMonth } from '@/data/fiscal'
import type { FiscalYear, Month, PositionRow } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import { assumptionLookup } from '@/plan/engine/assumptions'
import { type SeatType, type TradeRates, tradeRatesOf } from '@/plan/engine/band'
import { fxRatesFromAssumptions, rateOf } from '@/plan/engine/fx'
import { toAssignments } from '@/plan/engine/heads'
import { type AsksContext, asksContext } from '@/plan/engine/targets'
import type { AnyVersion, Assignment, HcRequest } from '@/plan/types'

export interface PlanYear {
  fiscalYear: FiscalYear
  /** The year's Working version; null when the plan state has none. */
  version: AnyVersion | null
  /** Band estimates and weights at the version's plan rates; null without a Working version. */
  rates: TradeRates | null
  /** Working's seats as asks, head effects and band effects read them. */
  asks: AsksContext
}

type Ctx = Pick<AnalyticsContext, 'all' | 'asOf' | 'versions' | 'plan'>

const assignmentsMemo = new WeakMap<object, Assignment[]>()

function assignmentsOf(ctx: Ctx): Assignment[] {
  let hit = assignmentsMemo.get(ctx.all.workers)
  if (!hit) {
    hit = toAssignments(ctx.all.workers)
    assignmentsMemo.set(ctx.all.workers, hit)
  }
  return hit
}

/** The month after the last close, else the as-of date's month: the first month a pending request can move. */
function firstOpenMonthOf(ctx: Ctx): Month {
  let last: Month | null = null
  for (const c of ctx.plan?.closes ?? []) if (!last || c.month > last) last = c.month
  return last ? shiftMonth(last, 1) : monthKey(ctx.asOf)
}

/** The latest row of each position (where an org position sits, for the assumptions' org fallback). */
const latestMemo = new WeakMap<readonly PositionRow[], ReadonlyMap<string, PositionRow>>()
function latestRows(positions: readonly PositionRow[]): ReadonlyMap<string, PositionRow> {
  let hit = latestMemo.get(positions)
  if (!hit) {
    const m = new Map<string, PositionRow>()
    for (const r of positions) {
      const cur = m.get(r.positionId)
      if (!cur || r.effectiveDate >= cur.effectiveDate) m.set(r.positionId, r)
    }
    hit = m
    latestMemo.set(positions, hit)
  }
  return hit
}

/** The fiscal year's Working version (else a retired one, else none). */
export function workingOf(versions: readonly AnyVersion[], fy: FiscalYear): AnyVersion | null {
  return (
    versions.find((v) => v.fiscalYear === fy && v.state === 'working') ??
    versions.find((v) => v.fiscalYear === fy && v.state === 'retired') ??
    null
  )
}

function ratesFor(ctx: Ctx, version: AnyVersion): TradeRates {
  const rows = ctx.all.assumptions.filter(
    (r) => (r.version ?? '').trim() === version.versionId || (r.version ?? '').trim() === version.name,
  )
  const fx = fxRatesFromAssumptions(rows)
  const latest = latestRows(ctx.all.positions)
  return tradeRatesOf({
    version: { versionId: version.versionId, name: version.name, fiscalYear: version.fiscalYear },
    lockHash: version.hash,
    lookup: assumptionLookup(rows, version),
    planRate: (currency) => rateOf(fx, currency, 'plan', version.grid.from),
    orgPathOf: (id) => {
      const r = latest.get(id)
      return r ? { businessUnit: r.businessUnit, department: r.department ?? null } : null
    },
  })
}

const memo = new WeakMap<object, WeakMap<object, WeakMap<object, Map<string, PlanYear>>>>()
const NO_PLAN = {}

/** A fiscal year's Working plan (memoized per data, requests and versions). */
export function planYearOf(ctx: Ctx, fy: FiscalYear): PlanYear {
  const requests = requestsOf(ctx)
  let a = memo.get(ctx.all)
  if (!a) {
    a = new WeakMap()
    memo.set(ctx.all, a)
  }
  let b = a.get(requests)
  if (!b) {
    b = new WeakMap()
    a.set(requests, b)
  }
  const key = ctx.versions.length ? ctx.versions : NO_PLAN
  let c = b.get(key)
  if (!c) {
    c = new Map()
    b.set(key, c)
  }
  const cacheKey = `${fy}|${ctx.asOf}|${ctx.plan?.closes.length ?? 0}`
  const hit = c.get(cacheKey)
  if (hit) return hit
  const version = workingOf(ctx.versions, fy)
  const rates = version ? ratesFor(ctx, version) : null
  const asks = asksContext({
    positions: ctx.all.positions,
    assignments: assignmentsOf(ctx),
    reqs: ctx.all.reqs,
    requests,
    proration: version?.proration ?? 'daily',
    firstOpenMonth: firstOpenMonthOf(ctx),
    bandUsd: (seat, place) => rates?.bandUsd(seat, place.positionId ?? place.managerPositionId ?? '') ?? null,
  })
  const out: PlanYear = { fiscalYear: fy, version, rates, asks }
  c.set(cacheKey, out)
  return out
}

/** The fiscal year a request belongs to: its start or effective date's, else the as-of date's. */
export function fiscalYearOfRequest(req: HcRequest, asOf: string): FiscalYear {
  const d = req.transfer?.effectiveDate || req.startDate || asOf
  return fiscalYearOf(d)
}

/** A request's seat type: its own level, location and FTE, else the seat it names (as of the as-of date). */
export function seatTypeOf(req: HcRequest, ctx: Pick<AnalyticsContext, 'positionIndex'>): SeatType | null {
  const row = req.positionId ? ctx.positionIndex.byId.get(req.positionId) : undefined
  const level = req.level ?? row?.level ?? null
  const location = req.location ?? row?.location ?? null
  const fte = req.fte ?? row?.fte ?? 1
  return level && location ? { level, location, fte } : null
}

/**
 * A request's band estimate (annual, USD at the plan rates of its fiscal year, no equity; docs/PLAN.md
 * 2): the seat it adds or changes, at its level, location and FTE; a trade's seats received. A
 * transfer moves a person and shows no amount (10.5): none. Null when the seat has no band.
 */
export function bandEstimateOf(
  req: HcRequest,
  ctx: Pick<AnalyticsContext, 'all' | 'asOf' | 'versions' | 'plan' | 'positionIndex'>,
): number | null {
  if (req.type === 'Transfer') return null
  const rates = planYearOf(ctx, fiscalYearOfRequest(req, ctx.asOf)).rates
  if (!rates) return null
  const seat = seatTypeOf(req, ctx)
  if (!seat) return null
  const org = req.managerPositionId || req.positionId || ''
  if (req.type === 'Trade' && req.trade) {
    const t = req.trade
    const one = rates.bandUsd({ ...seat, fte: req.fte ?? 1 }, org)
    if (one == null) return null
    const rest = t.restFte ? rates.bandUsd({ ...seat, fte: t.restFte }, org) : 0
    return one * t.count + (rest ?? 0)
  }
  return rates.bandUsd(seat, org)
}
