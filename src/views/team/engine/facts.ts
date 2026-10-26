/**
 * My team's facts (docs/PLAN.md 6.9, 11.2, 11.4 and 15.1 R2, R32): one manager's tree in heads only.
 * The allocation (plan-of-record seats at fiscal year end, each priced at its plan-of-record row on
 * the lock date, plus approved adds since the lock, minus approved eliminations since then), who the
 * team is staffed with at each month-end to fiscal year end, the pending requests' effects for the
 * crossing test, budget status, the allocation in standard heads and the trade credit of every
 * giving org in the tree. The engines are src/plan/engine's (`allocation`, `budgetStatus`,
 * `headEffect`, `creditBalance`); this module only gathers their inputs from the context. Pure; one
 * result per analytics context.
 *
 * Band cost (midpoint × FTE, USD at plan rates, no loads) is read here and never leaves this
 * module: budget status turns it into a word and a reason in heads (7.6). Nothing here reads pay,
 * an offer's amounts or leave.
 *
 * Readings taken here:
 *  - The fiscal year is the shown version's (the as-of date's when none is shown). A year with no
 *    locked version has no plan of record, so it has no allocation and no budget status.
 *  - A plan-of-record seat is one whose locked lines in the fiscal year's last month read Filled,
 *    Open or Planned (an Open or Planned seat costed nowhere still has its zero line, cost.ts).
 *  - "Approved since the lock" is read from the position rows the approvals wrote, never from the
 *    requests (allocation.ts, M2 known gap 6): a seat an approval created that the plan of record
 *    has no line for is an add, and an approval's Eliminated row ending an allocation seat by fiscal
 *    year end removes it. So the allocation's figures read positions and workers only.
 *  - A seat "has a req" when a req on it is Open or On hold and was opened by the as-of date.
 *  - Counts and the crossing test read only the requests the viewer may see (8.4 rules 3 and 6):
 *    pending requests, pending Start recruiting requests and trade credit. Approved requests change
 *    the allocation whoever raised them, because their effect is the seats' own rows and status.
 *  - Band cost reads the Working version's bands for the current band year (the fiscal year of the
 *    latest merit date on or before the as-of date) at the Working version's plan rates, through the
 *    tree root's org fallback; a seat type with no band costs 0.
 *  - Staffed: holders of the tree's seats on the as-of date (until their last day), accepted offers
 *    from their start date, and not-in-plan employees whose manager holds a seat in the tree or is
 *    the acting manager; each at the seat's row on the as-of date (a not-in-plan person at their HRIS
 *    level, location and FTE).
 *  - A pending request's month is the month it takes effect (an Elimination the day after its last
 *    day), never before the as-of month; its heads are its head effect on the tree at fiscal year
 *    end; its band cost is midpoint × FTE of the seats it adds or removes, or the difference for a
 *    Level or Location change.
 */
import { inScope } from '@/access/records'
import type { TreeScope } from '@/access/scopes/types'
import { requestView, viewerOf } from '@/access/visibility'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, fyRange, monthEnd, monthKey, monthRange } from '@/data/fiscal'
import {
  type AssumptionRow,
  type Datasets,
  type FiscalYear,
  type ISODate,
  type Month,
  PENDING_REQUEST_STATES,
  type PositionRow,
  type PositionStatus,
  siteByLocation,
} from '@/data/schema'
import { effectiveRequestsOf, requestsOf, seatIndex, seatStateOf } from '@/drill/seats'
import { addDays } from '@/lib/dates'
import { type Allocation, allocation, allocationSeats } from '@/plan/engine/allocation'
import { type AssumptionLookup, assumptionLookup, meritRules, type OrgPath } from '@/plan/engine/assumptions'
import { type SeatType, SH_BP, tradeRatesOf, weightBp } from '@/plan/engine/band'
import {
  type BudgetStatus,
  budgetStatus,
  type PendingEffect,
  type StaffedMonth,
  type StaffedPerson,
  staffed,
} from '@/plan/engine/budgetStatus'
import { fxRatesFromAssumptions, rateOf } from '@/plan/engine/fx'
import { isActiveOn, toAssignments } from '@/plan/engine/heads'
import { type AsksContext, asksContext, effectiveDateOf, headEffect } from '@/plan/engine/targets'
import { creditBalance } from '@/plan/engine/trade'
import { planOfRecord, workingOf } from '@/plan/engine/versions'
import type { HcRequest, LockedVersion, OrgMatch, PlanLineTable, Position } from '@/plan/types'
import { PARAM } from '../metrics'

/** A giving org's trade credit in basis points of a standard head (11.2). */
export interface CreditHolding {
  orgPositionId: string
  creditBp: number
}

/** Everything My team shows, before it is worded. */
export interface TeamFacts {
  /** The manager's tree, or null outside a tree scope (no Acting as pick, or another mode). */
  scope: TreeScope | null
  /** The scope's pick is still to be made: it holds nobody. */
  unset: boolean
  fiscalYear: FiscalYear
  asOf: ISODate
  /** The plan of record the allocation comes from; null for a year with no locked version. */
  planOfRecord: LockedVersion | null
  /** Why there is no allocation, or null. */
  empty: string | null
  allocation: Allocation
  /** The allocation's seats on the as-of date, as positions, by status ('Filled', 'Open', 'Planned'). */
  seats: { all: Position[]; filled: Position[]; open: Position[]; planned: Position[] }
  /** Planned seats in the allocation with a req or a pending Start recruiting request. */
  requested: Position[]
  /** Planned seats in the allocation with neither. */
  leftToRequest: Position[]
  /** Pending requests for the tree that the viewer may see. */
  pending: HcRequest[]
  /** Every request for the tree that the viewer may see, pending or not. */
  requests: HcRequest[]
  /** Staffed heads at each month-end from the as-of month to fiscal year end. */
  months: StaffedMonth[]
  /** The pending requests' effects on the tree (the crossing test). */
  effects: PendingEffect[]
  /** Budget status, or null without an allocation. */
  status: BudgetStatus | null
  /** The allocation in standard heads (Σ weight ÷ 10,000), or null when the year has no standard head. */
  standardHeads: number | null
  /** The trade credit of every giving org in the tree with a balance. */
  credit: CreditHolding[]
}

/**
 * Every position row: from M3 the analytics context's datasets hold plan state's Working overlay
 * (src/plan/store/overlay.ts `withOverlay`, applied once in src/data/context.tsx `buildContext`), so
 * the approvals' and HRBP edits' rows are in `ctx.all` already and are never appended again here.
 */
const workingPositions = (ctx: Pick<AnalyticsContext, 'all'>): readonly PositionRow[] => ctx.all.positions

/** Every assumption row, Working's edits included (the overlay, as above). */
const workingAssumptions = (ctx: Pick<AnalyticsContext, 'all'>): readonly AssumptionRow[] =>
  ctx.all.assumptions

/** The tree as an org: its seats, and a new seat placed under one of them or under the manager's own seat. */
export function treeOrg(scope: TreeScope): OrgMatch {
  return (place) => {
    if (place.positionId) return scope.positionIds.has(place.positionId)
    const mgr = place.managerPositionId
    return !!mgr && (scope.positionIds.has(mgr) || scope.rootPositionIds.has(mgr))
  }
}

/** The positions whose locked lines in `month` read one of `statuses` (read from the columns, not the rows). */
export function seatsInMonth(
  table: PlanLineTable,
  month: Month,
  statuses: ReadonlySet<PositionStatus>,
): string[] {
  const mi = table.month.dict.indexOf(month)
  if (mi < 0) return []
  const out = new Set<string>()
  const months = table.month.codes
  const status = table.status.codes
  const ids = table.positionId.codes
  for (let i = 0; i < table.length; i++) {
    if (months[i] !== mi) continue
    if (!statuses.has(table.status.dict[status[i]])) continue
    out.add(table.positionId.dict[ids[i]])
  }
  return [...out]
}

const linedMemo = new WeakMap<PlanLineTable, ReadonlySet<string>>()

/** Every position with a line in the table, in any month (memoized per table): the seats a lock saw. */
export function linedPositions(table: PlanLineTable): ReadonlySet<string> {
  let hit = linedMemo.get(table)
  if (!hit) {
    const out = new Set<string>()
    const ids = table.positionId
    for (let i = 0; i < table.length; i++) out.add(ids.dict[ids.codes[i]])
    hit = out
    linedMemo.set(table, hit)
  }
  return hit
}

const IN_ALLOCATION: ReadonlySet<PositionStatus> = new Set<PositionStatus>(['Filled', 'Open', 'Planned'])

/** When a request was approved: its last decision, else its last update. */
export function decidedAt(req: HcRequest): string {
  let at: string | null = null
  for (const s of req.steps) if (s.decision && s.at && (at === null || s.at > at)) at = s.at
  return at ?? req.updatedAt
}

/** Midpoint × FTE in USD at plan rates for the current band year: the band cost budget status reads. */
export type BandCost = (seat: SeatType) => number

/** The band year: the fiscal year of the latest merit date on or before the as-of date. */
function bandYearOf(lookup: AssumptionLookup, asOf: ISODate): FiscalYear {
  let year: FiscalYear | null = null
  for (const r of meritRules(lookup, null)) if (r.date <= asOf) year = r.fiscalYear
  return year ?? fiscalYearOf(asOf)
}

/**
 * Band cost from the Working version's assumptions: band[level|zone|band year] through the org's
 * fallback, × FTE, × the plan rate of the location's currency (the as-of month's, else the band
 * year's first month's). A seat type with no band, site or rate costs 0.
 */
export function bandCostOf(
  rows: readonly AssumptionRow[],
  version: { versionId: string; name: string },
  asOf: ISODate,
  org: OrgPath | null,
): BandCost {
  const lookup = assumptionLookup(rows, version)
  const year = bandYearOf(lookup, asOf)
  const rates = fxRatesFromAssumptions(lookup.rows('fx'))
  const asOfMonth = monthKey(asOf)
  const firstMonth = monthKey(fyRange(year).start)
  const cache = new Map<string, number>()
  return (seat) => {
    const key = `${seat.level}|${seat.location}`
    let unit = cache.get(key)
    if (unit === undefined) {
      unit = 0
      const site = siteByLocation.get(seat.location)
      const mid = site ? lookup.num('band', [seat.level, site.zone, year], org) : null
      if (site && mid != null) {
        const rate =
          rateOf(rates, site.currency, 'plan', asOfMonth) ?? rateOf(rates, site.currency, 'plan', firstMonth)
        unit = rate == null ? 0 : mid * rate
      }
      cache.set(key, unit)
    }
    return unit * seat.fte
  }
}

/** The Working asks context (head effects), once per data and plan state. */
const asksMemo = new WeakMap<Datasets, WeakMap<object, AsksContext>>()
const NO_PLAN = {}
function asksOf(ctx: Pick<AnalyticsContext, 'all' | 'plan' | 'asOf'>): AsksContext {
  let byPlan = asksMemo.get(ctx.all)
  if (!byPlan) {
    byPlan = new WeakMap()
    asksMemo.set(ctx.all, byPlan)
  }
  const key = ctx.plan ?? NO_PLAN
  let hit = byPlan.get(key)
  if (!hit) {
    hit = asksContext({
      positions: workingPositions(ctx),
      assignments: toAssignments(ctx.all.workers),
      reqs: ctx.all.reqs,
      requests: requestsOf(ctx),
      proration: 'daily',
      firstOpenMonth: monthKey(ctx.asOf),
      // Head effects read no band estimate.
      bandUsd: () => null,
    })
    byPlan.set(key, hit)
  }
  return hit
}

const EMPTY_ALLOCATION = allocation({
  fiscalYear: 'FY00' as FiscalYear,
  seats: [],
  eliminated: new Set(),
  bandCost: () => 0,
})

/** The month a pending request takes effect, never before the as-of month. */
function effectMonth(req: HcRequest, asOf: ISODate): Month {
  const d = effectiveDateOf(req)
  const on = req.type === 'Elimination' && d ? addDays(d, 1) : (d ?? asOf)
  const m = monthKey(on)
  const now = monthKey(asOf)
  return m < now ? now : m
}

/** The seats a trade receives, as seat types. */
function getSeats(req: HcRequest): SeatType[] {
  const t = req.trade
  if (!t || !req.level || !req.location) return []
  const out: SeatType[] = []
  for (let i = 0; i < t.count; i++) out.push({ level: req.level, location: req.location, fte: req.fte ?? 1 })
  if (t.restFte != null && t.restFte > 0)
    out.push({ level: req.level, location: req.location, fte: t.restFte })
  return out
}

/** A pending request's effect on the tree, or null when it has none. */
function pendingEffect(
  req: HcRequest,
  ctx: Pick<AnalyticsContext, 'all' | 'plan' | 'asOf'>,
  org: OrgMatch,
  fyEnd: ISODate,
  band: BandCost,
): PendingEffect | null {
  const month = effectMonth(req, ctx.asOf)
  if (month > monthKey(fyEnd)) return null
  const asks = asksOf(ctx)
  const heads = headEffect(req, org, fyEnd, asks)
  const seatType = (id: string | null): SeatType | null => {
    if (!id) return null
    const s = asks.seatOn(id, ctx.asOf)
    return s && org(s.place, ctx.asOf) ? s.seat : null
  }
  let cost = 0
  switch (req.type) {
    case 'New role':
      if (heads > 0 && req.level && req.location)
        cost = band({ level: req.level, location: req.location, fte: req.fte ?? 1 })
      break
    case 'Level change':
    case 'Location change': {
      const cur = seatType(req.positionId)
      if (cur)
        cost =
          band({
            level: req.level ?? cur.level,
            location: req.location ?? cur.location,
            fte: req.fte ?? cur.fte,
          }) - band(cur)
      break
    }
    case 'Trade': {
      if (
        org(
          {
            positionId: null,
            managerPositionId: req.managerPositionId,
            businessUnit: req.businessUnit,
            department: req.department,
            costCenter: req.costCenter,
          },
          fyEnd,
        )
      )
        for (const s of getSeats(req)) cost += band(s)
      for (const id of req.trade?.givePositionIds ?? []) {
        const s = asks.seatOn(id, ctx.asOf)
        if (s && (s.status === 'Open' || s.status === 'Planned') && org(s.place, ctx.asOf))
          cost -= band(s.seat)
      }
      break
    }
    case 'Transfer': {
      const t = req.transfer
      const s = t ? asks.seatOn(t.fromPositionId, ctx.asOf) : null
      if (s && heads !== 0) cost = heads * band(s.seat)
      break
    }
    case 'Elimination':
    case 'Backfill':
    case 'Start date': {
      const s = req.positionId ? asks.seatOn(req.positionId, ctx.asOf) : null
      if (s && heads !== 0) cost = heads * band(s.seat)
      break
    }
    case 'Start recruiting':
      break
  }
  if (heads === 0 && Math.abs(cost) < 0.005) return null
  return { requestId: req.requestId, type: req.type, month, heads, bandCost: cost }
}

const cache = new WeakMap<AnalyticsContext, TeamFacts>()

/** My team's facts for a context (cached per context). */
export function teamFacts(ctx: AnalyticsContext): TeamFacts {
  const hit = cache.get(ctx)
  if (hit) return hit
  const facts = computeFacts(ctx)
  cache.set(ctx, facts)
  return facts
}

function computeFacts(ctx: AnalyticsContext): TeamFacts {
  const asOf = ctx.asOf
  const fiscalYear = ctx.version?.fiscalYear ?? fiscalYearOf(asOf)
  const fyEnd = fyRange(fiscalYear).end
  const scope = ctx.access.scope?.kind === 'tree' ? ctx.access.scope : null
  const none: TeamFacts = {
    scope,
    unset: ctx.access.unset,
    fiscalYear,
    asOf,
    planOfRecord: null,
    empty: null,
    allocation: EMPTY_ALLOCATION,
    seats: { all: [], filled: [], open: [], planned: [] },
    requested: [],
    leftToRequest: [],
    pending: [],
    requests: [],
    months: [],
    effects: [],
    status: null,
    standardHeads: null,
    credit: [],
  }
  if (!scope) return { ...none, empty: 'My team shows a manager’s tree. Pick a manager with Acting as.' }

  const org = treeOrg(scope)
  const viewer = viewerOf(ctx)
  // Every request in its effective state (D-EXPIRY): an expired one shows Expired and is no pending request.
  const requests = effectiveRequestsOf(ctx).filter(
    (r) => inScope('requests', r, ctx) && requestView(r, viewer) !== 'none',
  )
  const pending = requests.filter((r) => PENDING_REQUEST_STATES.includes(r.state))
  const pendingRecruit = new Set(
    pending.filter((r) => r.type === 'Start recruiting' && r.positionId).map((r) => r.positionId as string),
  )

  const por = planOfRecord(ctx.versions, fiscalYear)
  const working = workingOf(ctx.versions, fiscalYear) ?? workingOf(ctx.versions, fiscalYearOf(asOf))
  const positions = workingPositions(ctx)
  const rootRow = (() => {
    for (const id of scope.rootPositionIds) {
      const s = seatStateOf(ctx, id)
      if (s) return s.position
    }
    return null
  })()
  const orgPath: OrgPath | null = rootRow
    ? { businessUnit: rootRow.businessUnit, department: rootRow.department }
    : null
  const band: BandCost = working ? bandCostOf(workingAssumptions(ctx), working, asOf, orgPath) : () => 0

  // Trade credit of every giving org in the tree (11.2), over the trades the viewer may see.
  const credit: CreditHolding[] = []
  const orgs = new Set<string>()
  for (const r of requests)
    if (r.type === 'Trade' && r.trade?.giveOrgPositionId) orgs.add(r.trade.giveOrgPositionId)
  for (const id of [...orgs].sort()) {
    if (!scope.positionIds.has(id) && !scope.rootPositionIds.has(id)) continue
    const bp = creditBalance(requests, id, fiscalYear)
    if (bp > 0) credit.push({ orgPositionId: id, creditBp: bp })
  }

  if (!por) return { ...none, pending, requests, credit, empty: `${fiscalYear} has no locked version yet.` }

  const lockDate = por.lockedAt.slice(0, 10) as ISODate
  const histories = seatIndex(ctx)
  const hasReq = (id: string): boolean =>
    (histories.get(id)?.reqs ?? []).some(
      (q) => (q.status === 'Open' || q.status === 'On hold') && q.openedDate <= asOf,
    )
  const { seats, eliminated } = allocationSeats({
    fiscalYear,
    lockDate,
    planOfRecordSeats: seatsInMonth(por.lines, monthKey(fyEnd), IN_ALLOCATION),
    lockedPositions: linedPositions(por.lines),
    // The rows approvals wrote change seats whoever raised the request; the tree test runs on the seats.
    positions,
    tree: org,
    seatNow: (id) => {
      const s = seatStateOf(ctx, id)
      return s
        ? { status: s.status, hasReq: hasReq(id), pendingStartRecruiting: pendingRecruit.has(id) }
        : null
    },
  })

  // The standard head of the plan of record's year prices the Allocation note (11.4).
  const rates = tradeRatesOf({
    version: por,
    lockHash: por.hash,
    lookup: assumptionLookup(por.assumptions, por),
    planRate: (c) => rateOf(por.rates, c, 'plan', por.grid.from),
    orgPathOf: () => orgPath,
  })
  const S = rates.standardHeadUsd
  const rootId = rootRow?.positionId ?? ''
  const alloc = allocation({
    fiscalYear,
    seats,
    eliminated,
    bandCost: band,
    ...(S > 0 ? { weightBp: (seat: SeatType) => weightBp(rates.bandUsd(seat, rootId) ?? 0, S) } : {}),
  })

  const positionOf = (id: string): Position | null => seatStateOf(ctx, id)?.position ?? null
  const asPositions = (list: readonly { positionId: string }[]): Position[] =>
    list.map((s) => positionOf(s.positionId)).filter((p): p is Position => p != null)
  const byStatus = (st: 'Filled' | 'Open' | 'Planned') => alloc.seats.filter((s) => s.status === st)
  const plannedSeats = byStatus('Planned')

  // Staffed: people in the tree's seats, accepted offers, and not-in-plan reports (R32).
  const allocated = new Map(alloc.seats.map((s) => [s.positionId, s.seat]))
  const people: StaffedPerson[] = []
  const holders = new Set<string>()
  for (const id of scope.positionIds) {
    const h = histories.get(id)
    const now = seatStateOf(ctx, id)
    if (!h || !now) continue
    const seat: SeatType = {
      level: now.position.level,
      location: now.position.location,
      fte: now.position.fte,
    }
    for (const a of h.assignments) {
      if (a.workerType !== 'Employee' || !isActiveOn(a, asOf)) continue
      holders.add(a.employeeId)
      people.push({
        id: a.employeeId,
        positionId: id,
        start: a.start,
        lastDay: a.end ?? null,
        seat,
        allocated: allocated.get(id) ?? null,
      })
    }
    const offer = now.acceptedOffer
    if (offer?.startDate && offer.startDate > asOf)
      people.push({
        id: offer.reqId,
        positionId: id,
        start: offer.startDate,
        lastDay: null,
        seat,
        allocated: allocated.get(id) ?? null,
      })
  }
  for (const w of ctx.all.workers) {
    if (w.positionId || (w.workerType ?? 'Employee') !== 'Employee' || !w.managerId) continue
    if (!holders.has(w.managerId) && w.managerId !== scope.rootPersonId) continue
    const start = w.assignmentStart || w.hireDate
    const end = [w.assignmentEnd, w.terminationDate].filter(Boolean).sort()[0] ?? null
    if (!start || !isActiveOn({ start, end }, asOf) || !w.level || !w.location) continue
    people.push({
      id: w.employeeId,
      positionId: null,
      start,
      lastDay: end,
      seat: { level: w.level, location: w.location, fte: w.fte ?? 1 },
      allocated: null,
    })
  }

  // The as-of month to fiscal year end (from the year's first month for a later year).
  const fyStart = monthKey(fyRange(fiscalYear).start)
  const firstMonth = monthKey(asOf) > fyStart ? monthKey(asOf) : fyStart
  const months = monthKey(fyEnd) >= firstMonth ? monthRange(firstMonth, monthKey(fyEnd)) : []
  const staffedMonths = staffed(people, months, band)
  const effects = pending
    .map((r) => pendingEffect(r, ctx, org, fyEnd, band))
    .filter((e): e is PendingEffect => e != null)
  const status = budgetStatus({
    allocation: { heads: alloc.heads, bandCost: alloc.bandCost },
    staffed: staffedMonths,
    pending: effects,
    atRiskShare: ctx.metrics.num(PARAM.atRiskShare.metricId, PARAM.atRiskShare.key),
  })

  return {
    scope,
    unset: ctx.access.unset,
    fiscalYear,
    asOf,
    planOfRecord: por,
    empty: null,
    allocation: alloc,
    seats: {
      all: asPositions(alloc.seats),
      filled: asPositions(byStatus('Filled')),
      open: asPositions(byStatus('Open')),
      planned: asPositions(plannedSeats),
    },
    requested: asPositions(plannedSeats.filter((s) => s.hasReq || s.pendingStartRecruiting)),
    leftToRequest: asPositions(plannedSeats.filter((s) => !s.hasReq && !s.pendingStartRecruiting)),
    pending,
    requests,
    months: staffedMonths,
    effects,
    status,
    standardHeads: alloc.standardHeads,
    credit,
  }
}

/** Staffed band cost as a share of the allocation's at the as-of month-end (a rate: no amount), or null. */
export function bandShare(facts: Pick<TeamFacts, 'months' | 'allocation'>): number | null {
  const first = facts.months[0]
  if (!first || facts.allocation.bandCost <= 0) return null
  return first.bandCost / facts.allocation.bandCost
}

/** Standard heads from basis points, for the notes ("27.40 standard heads"). */
export const standardHeadsOf = (bp: number): number => bp / SH_BP

/** Month-end of a month (re-exported for the model's rows). */
export const monthEndOf = monthEnd
