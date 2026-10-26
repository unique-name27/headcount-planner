/**
 * Story 9 (docs/PLAN.md 11, 13.4): a pending Systems & Software trade. The San Jose Software manager
 * who holds the planted Planned P5 San Jose seat (a Budget seat, never eliminated) gives it up for
 * P3 Bengaluru seats on a Bengaluru Software team under another director, starting 1 Feb 2027. It
 * was submitted on 14 Sep 2026, approved by the manager's director on 16 Sep and by the S&S HRBP on
 * 21 Sep, and waits on the leader: the Bengaluru director, the nearest leader at or above the get
 * seats' org, because the get seats' band estimate tops $250,000. Draws no random numbers.
 *
 * - Priced by trade.ts `tradeQuote` at the plan of record's locked rates (FY27 Q1 Reforecast: its
 *   bands, loads, plan FX and standard head S, with its lock hash), first open month 2026-09 at
 *   submit. One P5 San Jose ($295,976.60) buys floor(giveBp ÷ one P3 Bengaluru's weight) = 6 seats
 *   (₹4,009,600 = $48,115.20 each), heads +5; what is left is the giving org's trade credit.
 * - The chain is chain.ts `chainFor` on the org at 30 Sep 2026: manager (the giving manager's
 *   director), HRBP, leader. Out of plan is tested against Systems & Software's FY27 target with the
 *   guarded asks cost (routing.ts) and the trade's head and in-year band effect; the generator's
 *   headroom keeps the unit 8 heads under its target, so the trade stays in plan and has no Finance
 *   step. The giving and receiving orgs both decide at the unit (no sub-org targets), so there is
 *   one check.
 */
import type { AtomIndex } from '@/cost/atoms'
import { type ChainContext, chainFor, type PlanCheck } from '@/plan/engine/chain'
import { lineContext, positionLines } from '@/plan/engine/cost'
import { freezeOn } from '@/plan/engine/freeze'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { toAssignments } from '@/plan/engine/heads'
import { fromRow } from '@/plan/engine/requests'
import { asks, bandEffect, headEffect } from '@/plan/engine/targets'
import {
  creditBalance,
  type TradeAsk,
  type TradeQuote,
  type TradeSeat,
  tradeQuote,
} from '@/plan/engine/trade'
import { seatDetailOn, seatHistories, toPosition } from '@/plan/engine/versions'
import { withClosedMonths } from '@/plan/lineSource'
import type { HcRequest, LockedVersion, MonthClose, PlanLine, Step } from '@/plan/types'
import { shiftMonth } from '../fiscal'
import {
  type Datasets,
  type ISODate,
  type Month,
  PENDING_REQUEST_STATES,
  type RequestRow,
  type StepRole,
  type TargetRow,
} from '../schema'
import { FY27_WORKING } from './assumptions'
import { assumptionsOf } from './base'
import { AS_OF, iso } from './calendar'
import { costCenter, SS } from './departments'
import { holderOn, type World } from './org'
import { inTreeOf, latestRows } from './orgs'
import { chainOrgOf, guardedAsksCost, ratesOf, unitOrg, unitPeople, workingAsksContext } from './routing'
import { versionFrame } from './versions'

export const TRADE_SUBMITTED_AT = '2026-09-14T10:12'
const MANAGER_APPROVED: ISODate = '2026-09-16'
const HRBP_APPROVED: ISODate = '2026-09-21'
export const TRADE_UPDATED_AT = `${HRBP_APPROVED}T15:40`
/** The get seats start on the first Monday of February 2027 (1 Feb). */
export const TRADE_GET_START: ISODate = '2027-02-01'
const SUBMIT_DAY: ISODate = TRADE_SUBMITTED_AT.slice(0, 10)
/** The first open month at submit: August 2026 was the last close. */
const SUBMIT_OPEN_MONTH: Month = '2026-09'

const ROLE: Record<Step['role'], StepRole> = {
  manager: 'Manager',
  hrbp: 'HRBP',
  leader: 'Leader',
  finance: 'Finance',
}

/** The people and seats of the trade, found in the generated org. */
export interface TradeParties {
  givePositionId: string
  /** The giving manager's seat (the giving org) and its holder, the requester. */
  giveManagerPositionId: string
  requesterId: string
  /** The Bengaluru Software manager seat the get seats report to. */
  getManagerPositionId: string
}

/** The give seat's manager, and the first Bengaluru Software manager seat under another director. */
export function tradeParties(w: World): TradeParties {
  const give = w.seats.find((s) => s.tags.has('trade-give'))!
  const mgr = w.seats[give.mgr!]
  const requester = holderOn(w, mgr.idx, AS_OF)
  if (requester == null) throw new Error('The trade give seat has no manager in place.')
  const get = w.seats
    .filter(
      (s) =>
        s.role === 'manager' &&
        s.dept === give.dept &&
        s.site === 'Bengaluru' &&
        s.mgr !== mgr.mgr &&
        holderOn(w, s.idx, AS_OF) != null,
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1))[0]
  if (!get) throw new Error('No Bengaluru Software manager for the trade get seats.')
  return {
    givePositionId: give.id,
    giveManagerPositionId: mgr.id,
    requesterId: w.people[requester].id,
    getManagerPositionId: get.id,
  }
}

/** A seat as a trade reads it on a date (the Working plan as given). */
export function tradeSeatsOn(
  data: Datasets,
  on: ISODate,
  ids: readonly string[],
  requests: readonly HcRequest[],
): Map<string, TradeSeat> {
  const seats = seatHistories({
    positions: data.positions,
    assignments: toAssignments(data.workers),
    reqs: data.reqs,
    requests,
  })
  const out = new Map<string, TradeSeat>()
  for (const id of ids) {
    const h = seats.get(id)
    const s = h ? seatDetailOn(h, on) : null
    if (!s) continue
    const pending = requests.find(
      (q) =>
        PENDING_REQUEST_STATES.includes(q.state) &&
        (q.positionId === id || q.trade?.givePositionIds.includes(id)),
    )
    out.set(id, {
      positionId: id,
      status: s.status,
      level: s.position.level,
      location: s.position.location,
      fte: s.position.fte,
      workerType: s.position.workerType,
      orgPositionId: s.position.managerPositionId ?? id,
      businessUnit: s.position.businessUnit,
      start: s.plannedStart,
      acceptedOffer: s.acceptedOffer != null,
      pendingRequestId: pending?.requestId ?? null,
      inScope: true,
    })
  }
  return out
}

/** The trade as asked: 1 Planned P5 San Jose for as many P3 Bengaluru seats as it buys. */
export function tradeAsk(p: TradeParties): TradeAsk {
  return {
    give: [p.givePositionId],
    creditUsedBp: 0,
    giveOrgPositionId: null,
    get: {
      level: 'P3',
      location: 'Bengaluru',
      fte: 1,
      orgPositionId: p.getManagerPositionId,
      businessUnit: SS,
      jobFamily: 'Software',
      start: TRADE_GET_START,
      count: 'max',
      partTimeRest: false,
    },
  }
}

/** The quote at the plan of record's locked rates, as of `on` with `firstOpenMonth`. */
export function quoteTrade(input: {
  data: Datasets
  q1: LockedVersion
  parties: TradeParties
  on: ISODate
  firstOpenMonth: Month
  requests: readonly HcRequest[]
}): TradeQuote {
  const { data, q1, parties } = input
  const rates = ratesOf(q1.assumptions, q1.rates, q1, q1.hash, data.positions)
  const latest = latestRows(data.positions)
  const inTree = inTreeOf(data.positions)
  const ask = tradeAsk(parties)
  return tradeQuote(ask, tradeSeatsOn(data, input.on, ask.give, input.requests), rates, {
    asOf: input.on,
    firstOpenMonth: input.firstOpenMonth,
    proration: q1.proration,
    creditBalanceBp: (org) => creditBalance(input.requests, org, q1.fiscalYear),
    giveOrgOf: (ids) => (ids.length ? (latest.get(ids[0])?.managerPositionId ?? null) : null),
    freezeOn: (org, on) => {
      const m = latest.get(org)
      if (!m) return null
      const f = freezeOn(
        data.freezes,
        {
          positionId: null,
          managerPositionId: org,
          businessUnit: m.businessUnit,
          department: m.department ?? null,
          costCenter: m.costCenter,
        },
        on,
        inTree,
      )
      return f ? { freezeId: f.freezeId } : null
    },
  })
}

/** The trade's `requests` row (steps filled in by `withSteps`). */
export function tradeRow(
  requestId: string,
  p: TradeParties,
  quote: TradeQuote,
  q1: LockedVersion,
): RequestRow {
  return {
    requestId,
    type: 'Trade',
    state: 'In review',
    reasonCode: 'Location strategy',
    requesterId: p.requesterId,
    submittedById: p.requesterId,
    submittedAt: TRADE_SUBMITTED_AT,
    updatedAt: TRADE_UPDATED_AT,
    positionId: null,
    businessUnit: SS,
    department: 'Software',
    costCenter: costCenter('Software', 'Bengaluru'),
    managerPositionId: p.getManagerPositionId,
    level: 'P3',
    location: 'Bengaluru',
    jobTitle: 'Software Engineer II',
    fte: 1,
    startDate: TRADE_GET_START,
    priority: null,
    cycleId: null,
    steps: null,
    confidential: null,
    exception: null,
    givePositionIds: p.givePositionId,
    giveOrgPositionId: quote.giveOrgPositionId,
    creditUsedBp: 0,
    count: quote.get.length,
    jobFamily: 'Software',
    partTimeRest: false,
    restFte: null,
    rateVersion: q1.versionId,
    rateHash: q1.hash,
    giveBp: quote.giveBp,
    getBp: quote.getBp,
    creditBp: quote.creditBp,
    transferKind: null,
    personId: null,
    fromPositionId: null,
    toManagerPositionId: null,
    toPositionId: null,
    effectiveDate: null,
    moveBudget: null,
  }
}

/** What routing reads for the trade on the as-of date. */
export interface TradeRouting {
  context: ChainContext
  check: PlanCheck
  steps: Step[]
  /** Systems & Software's asks without the trade: heads, exact cost and the guarded cost. */
  asksHeads: number
  asksCostExact: number
  guardedCost: number
  target: TargetRow
}

/**
 * The trade's chain on the as-of date (`chainFor`), with the check it reads. `requests` are every
 * request but the trade (pending ones count in asks). `targetOverride` sets the target heads (the
 * negative control).
 */
export function routeTrade(input: {
  w: World
  data: Datasets
  trade: RequestRow
  requests: readonly HcRequest[]
  closes: readonly MonthClose[]
  financeApproverId: string
  /** The quote's get band estimate (annual, USD at plan rates): the leader threshold reads it. */
  getBandUsd: number
  targetHeadsOverride?: number
}): TradeRouting {
  const { data } = input
  const rows = assumptionsOf(data, FY27_WORKING)
  const rates = ratesOf(rows, fxRatesFromAssumptions(rows), versionFrame(FY27_WORKING), null, data.positions)
  const lastClose = input.closes.reduce((m, c) => (c.month > m.month ? c : m))
  const firstOpenMonth = shiftMonth(lastClose.month, 1)
  const req = fromRow(input.trade)
  // 8.4 rule 3: leave out confidential requests the requester did not raise.
  const counted = input.requests.filter(
    (q) => q.requestId !== req.requestId && (!q.confidential || q.requesterId === req.requesterId),
  )
  const ctx = workingAsksContext(data, rates, firstOpenMonth, input.requests)
  const org = unitOrg(SS)
  const target = data.targets.find((t) => t.fiscalYear === 'FY27' && t.businessUnit === SS && !t.department)!
  const targetDate = target.targetDate || '2027-03-31'
  const heads = asks(org, targetDate, counted, ctx).heads
  const lines = unitWorkingLines(data, SS, input.closes)
  const index: AtomIndex = lastClose.atoms
  const latest = latestRows(data.positions)
  const g = guardedAsksCost({
    lines,
    requests: counted.filter((q) => PENDING_REQUEST_STATES.includes(q.state)),
    fiscalYear: 'FY27',
    org,
    ctx,
    index,
    managerOf: (id) => latest.get(id)?.managerPositionId ?? null,
  })
  let exact = 0
  for (const l of lines) if (l.month >= '2026-04' && l.month <= '2027-03') exact += l.usd.loaded
  for (const q of counted)
    if (PENDING_REQUEST_STATES.includes(q.state)) exact += bandEffect(q, org, 'FY27', ctx)
  const check: PlanCheck = {
    org: SS,
    target: { heads: input.targetHeadsOverride ?? target.targetHeads, cost: target.targetCost ?? null },
    asks: { heads, cost: g.cost },
    effect: { heads: headEffect(req, org, targetDate, ctx), cost: bandEffect(req, org, 'FY27', ctx) },
  }
  const context: ChainContext = {
    org: chainOrgOf(data, AS_OF_ISO, unitPeople(input.w, AS_OF), input.financeApproverId),
    facts: {
      bandEstimateUsd: input.getBandUsd,
      checks: [check],
      cycleLocked: false,
      likeForLikeBackfill: false,
      envelopeException: false,
    },
  }
  return {
    context,
    check,
    steps: chainFor(req, context),
    asksHeads: heads,
    asksCostExact: exact,
    guardedCost: g.cost,
    target,
  }
}

const AS_OF_ISO: ISODate = iso(AS_OF)

/**
 * A unit's FY27 Working lines as its figures read them (as of 30 Sep 2026; the org joined at read
 * time): the closed months from the closes and the later months from Working's own lines at plan
 * rates, through the one line-source rule Plan, Forecast and Targets read (src/plan/lineSource.ts
 * `withClosedMonths`, change C33 and review RF-4), so routing's guarded asks cost is the app's.
 */
export function unitWorkingLines(data: Datasets, bu: string, closes: readonly MonthClose[]): PlanLine[] {
  const version = versionFrame(FY27_WORKING)
  const rows = assumptionsOf(data, FY27_WORKING)
  const ctx = lineContext({
    version,
    asOf: AS_OF_ISO,
    positions: data.positions,
    workers: data.workers,
    comp: data.comp,
    reqs: data.reqs,
    requests: data.requests.map(fromRow),
    assumptions: rows,
    rates: { table: fxRatesFromAssumptions(rows), use: 'plan', closedThrough: null },
    closes,
  })
  const own: PlanLine[] = []
  const ids = new Set<string>()
  for (const r of latestRows(data.positions).values())
    if (r.businessUnit === bu) {
      ids.add(r.positionId)
      own.push(...positionLines(toPosition(r), version, ctx))
    }
  return [...withClosedMonths(own, closes, (id) => ids.has(id))]
}

/** The steps as `requests` rows: manager and HRBP approved, the leader's pending. */
export function withSteps(row: RequestRow, steps: readonly Step[]): RequestRow {
  const at = [MANAGER_APPROVED, HRBP_APPROVED]
  return {
    ...row,
    steps: steps.map((s, i) => ({
      role: ROLE[s.role],
      approverId: s.approverId,
      decision: i < at.length ? 'Approved' : 'Pending',
      at: i < at.length ? at[i] : null,
    })),
  }
}

export const TRADE_SUBMIT = { day: SUBMIT_DAY, firstOpenMonth: SUBMIT_OPEN_MONTH }
