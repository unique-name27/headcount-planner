/**
 * Targets, asks and gap (docs/PLAN.md 6.9, 10.2 and 11.4; changes C2 and C18). Built by engines C in
 * M1. Pure: the caller passes the org (an `OrgMatch`), the date and the Working seats.
 *
 * - Asks (heads) at the target date = Working Filled, Open and Planned positions on the target date
 *   whose start is on or before it (a seat with no planned start counts) + Σ head effect of each
 *   pending request (Submitted, In review or Sent back) that takes effect by then. With a blank target
 *   date (the FY end) the first term is Working approved heads at the FY end, so an FY28 seat is never
 *   an FY27 ask.
 * - Asks cost covers the target's fiscal year: the year's loaded cost of Working lines + the in-year
 *   band effect of each pending request effective in that year, at band estimate ÷ 12 × the version's
 *   active fraction for each month from the start or effective date to FY end (a trade's give seats
 *   from the later of their start and the first open month), at plan rates, no equity. A pending
 *   request never reads HRIS pay, an offer or severance. An annual band estimate is never added to an
 *   in-year total. The guarded asks cost (7.2 rule 8: rounded per atom) is the cost guard's (src/cost).
 * - Gap = target − asks, in heads and cost. Gap after approval = the gap with the request left out of
 *   asks − the request's head effect and band effect, so a pending request's gap does not move at
 *   approval; it is never a recompute of Working.
 *
 * Readings taken here (each keeps "the rise in asks while pending equals the rise in approved heads
 * after approval", 11.7):
 *  - An Elimination's `startDate` is the seat's last day (10.1): the seat still counts on that day and
 *    leaves asks from the next day.
 *  - A trade's give seats leave at approval, so they count against every date; its get seats count
 *    from their start. Each side counts only where it sits in the org.
 *  - A seat a request moves or creates is placed by its manager position (`SeatPlace.positionId`
 *    null), so the caller's OrgMatch reads where it will sit, not where it sits now.
 *  - No pending request can change a closed month: every in-year band amount runs from the later of
 *    its start or effective date and the first open month (the plan states this for a trade's give
 *    seats; for every other type the start or effective date is normally later anyway).
 *  - A seat removed or put On hold saves only while it would have been costed: from the later of its
 *    planned start and the effective date. An On hold seat given in a trade saves nothing.
 *  - An Open or Planned seat with no planned start is not costed anywhere (15.1 R33, lead decision
 *    D-NOSTART), the same as Working lines and What if: an Elimination, Level change, Location change,
 *    Transfer or trade give on it moves 0; a Start date costs it from the new start; a Backfill with a
 *    start costs it from that start. So a pending request's band effect is the change approval makes
 *    to Working's in-year lines (targets.test.ts).
 */

import { fyRange, monthStart, monthsOf } from '@/data/fiscal'
import {
  type FiscalYear,
  type ISODate,
  type Month,
  PENDING_REQUEST_STATES,
  type PositionRow,
  type Proration,
  type ReqRow,
  type TargetRow,
  type WorkerType,
} from '@/data/schema'
import { addDays } from '@/lib/dates'
import type { Assignment, HcRequest, OrgMatch, PlanLine, PositionStatus, SeatPlace } from '../types'
import type { SeatType } from './band'
import { inYearFraction } from './proration'
import { heldForMove, seatHistories, seatOn } from './versions'

/** A Working seat on a date, as asks read it. */
export interface AsksSeat {
  positionId: string
  /** Derived status on the date (versions.ts `seatOn`). */
  status: PositionStatus
  /** Planned start of an Open or Planned seat; null counts as started. */
  start: ISODate | null
  place: SeatPlace
  seat: SeatType
  acceptedOffer: boolean
  /**
   * Held by an approved internal move while HRIS still shows the person on it (versions.ts
   * `heldForMove`): Filled, but no ask, since the receiving seat counts the person (C18, review SC-6).
   * An addition to the contract; absent reads false.
   */
  heldForMove?: boolean
}

/** The Working plan as asks, head effects and band effects read it. */
export interface AsksContext {
  /** Every Working seat's ID. */
  readonly positionIds: readonly string[]
  /** A Working seat on a date; null when it does not exist then. */
  seatOn(positionId: string, on: ISODate): AsksSeat | null
  /** The Working version's proration (in-year band amounts). */
  readonly proration: Proration
  /** The first month not closed: a trade's give seats leave the plan from it. */
  readonly firstOpenMonth: Month
  /** A seat type's annual band estimate in USD at plan rates, no equity, where it sits; null with no band. */
  bandUsd(seat: SeatType, place: SeatPlace): number | null
}

export interface AsksContextInput {
  positions: readonly PositionRow[]
  assignments: readonly Assignment[]
  reqs: readonly ReqRow[]
  /** Approved Backfills give a reopened seat its replacement start. */
  requests: readonly HcRequest[]
  proration: Proration
  firstOpenMonth: Month
  bandUsd(seat: SeatType, place: SeatPlace): number | null
}

/** The statuses that count in asks (and approved heads): On hold and Eliminated never do. */
const COUNTED: ReadonlySet<PositionStatus> = new Set<PositionStatus>(['Filled', 'Open', 'Planned'])

/**
 * The worker type of each seat `asksContext` reads (AsksSeat does not carry it): an Open or Planned
 * contractor or intern seat is not an approved head (versions.ts), so it is not an ask either. A seat
 * built by hand reads as an Employee seat.
 */
const WORKER_TYPE = new WeakMap<AsksSeat, WorkerType>()

/** A seat's worker type as `asksContext` read it; a seat built by hand reads as an Employee seat. An addition to the contract (whatif.ts reads it). */
export const seatWorkerType = (s: AsksSeat): WorkerType => WORKER_TYPE.get(s) ?? 'Employee'

/** The context over the Working datasets (versions.ts `seatHistories` and `seatOn`). Fixtures: G1, G2, G3, A2. */
export function asksContext(input: AsksContextInput): AsksContext {
  const histories = seatHistories({
    positions: input.positions,
    assignments: input.assignments,
    reqs: input.reqs,
    requests: input.requests,
  })
  const cache = new Map<string, AsksSeat | null>()
  return {
    positionIds: [...histories.keys()],
    proration: input.proration,
    firstOpenMonth: input.firstOpenMonth,
    bandUsd: (seat, place) => input.bandUsd(seat, place),
    seatOn(positionId, on) {
      const key = `${positionId}\u0000${on}`
      const hit = cache.get(key)
      if (hit !== undefined) return hit
      const history = histories.get(positionId)
      const state = history ? seatOn(history, on) : null
      const seat: AsksSeat | null = state
        ? {
            positionId,
            status: state.status,
            start: state.status === 'Open' || state.status === 'Planned' ? state.plannedStart : null,
            place: {
              positionId,
              managerPositionId: state.position.managerPositionId,
              businessUnit: state.position.businessUnit,
              department: state.position.department,
              costCenter: state.position.costCenter,
            },
            seat: { level: state.position.level, location: state.position.location, fte: state.position.fte },
            acceptedOffer: state.acceptedOffer != null,
            ...(heldForMove(state.position, state.status) ? { heldForMove: true } : {}),
          }
        : null
      if (seat && state) WORKER_TYPE.set(seat, state.position.workerType)
      cache.set(key, seat)
      return seat
    },
  }
}

/** The date a request takes effect: a transfer's effectiveDate, else its startDate; null takes effect at once. */
export function effectiveDateOf(request: HcRequest): ISODate | null {
  if (request.type === 'Transfer' && request.transfer) return request.transfer.effectiveDate || null
  return request.startDate
}

/* ───────────── helpers ───────────── */

/**
 * A seat counts in asks on `d` exactly when it is an approved head there (versions.ts): Filled, or an
 * Employee seat Open or Planned with no planned start or one on or before `d`.
 */
const countsOn = (s: AsksSeat | null, d: ISODate): s is AsksSeat =>
  s != null &&
  COUNTED.has(s.status) &&
  !s.heldForMove &&
  (s.start == null || s.start <= d) &&
  (s.status === 'Filled' || (WORKER_TYPE.get(s) ?? 'Employee') === 'Employee')

/**
 * A seat Working costs: Filled, or an Employee seat Open or Planned with a planned start (contractor
 * and intern seats are not costed, and neither is a seat with no planned start, 15.1 R33).
 */
const costed = (s: AsksSeat | null): s is AsksSeat =>
  s != null &&
  COUNTED.has(s.status) &&
  (s.status === 'Filled' || ((WORKER_TYPE.get(s) ?? 'Employee') === 'Employee' && s.start != null))

/** An Employee seat Open or Planned with no planned start: an approved head with no cost (6.5, R33). */
const notStarted = (s: AsksSeat | null): s is AsksSeat =>
  s != null &&
  (s.status === 'Open' || s.status === 'Planned') &&
  s.start == null &&
  !s.acceptedOffer &&
  (WORKER_TYPE.get(s) ?? 'Employee') === 'Employee'

/** Where a new seat under a manager position sits (a New role's or a trade's get seats). */
const newSeatPlace = (request: HcRequest): SeatPlace => ({
  positionId: null,
  managerPositionId: request.managerPositionId,
  businessUnit: request.businessUnit,
  department: request.department,
  costCenter: request.costCenter,
})

/** Where a seat would sit under another manager position (a position move): that manager's org. */
function placeUnder(managerPositionId: string | null, on: ISODate, ctx: AsksContext): SeatPlace | null {
  if (!managerPositionId) return null
  const mgr = ctx.seatOn(managerPositionId, on)
  if (!mgr) return null
  return {
    positionId: null,
    managerPositionId,
    businessUnit: mgr.place.businessUnit,
    department: mgr.place.department,
    costCenter: mgr.place.costCenter,
  }
}

/** The get seats a trade receives: `count` whole seats plus the part-time rest seat when one is stored. */
function getSeatsOf(request: HcRequest): SeatType[] {
  const t = request.trade
  if (!t || !request.level || !request.location) return []
  const out: SeatType[] = []
  for (let i = 0; i < t.count; i++)
    out.push({ level: request.level, location: request.location, fte: request.fte ?? 1 })
  if (t.restFte != null && t.restFte > 0)
    out.push({ level: request.level, location: request.location, fte: t.restFte })
  return out
}

/** The later of two dates, either of which may be missing. */
const later = (a: ISODate | null, b: ISODate | null): ISODate | null =>
  a == null ? b : b == null || a > b ? a : b

/**
 * What approving the request would do to the org's asks at `date` (docs/PLAN.md 6.9):
 *  - New role: +1 (the new seat is in the org);
 *  - Trade: seats received (`count`, plus 1 when `restFte` is set) − Open or Planned seats given (an
 *    On hold seat given counts 0), per side in the org (the quote's `headsDelta` when both sides are
 *    in it);
 *  - Elimination: −1 if the seat counts in asks on the date, else 0;
 *  - Backfill: +1 if the named seat is On hold on the date (held by an internal move), else 0;
 *  - Transfer, position move: −1 for the org it leaves, +1 for the org it joins (0 within one org);
 *    internal move: −1 for the org whose seat goes On hold (the receiving Open seat is already counted);
 *  - Start date: +1 if it moves an Open or Planned seat's start from after the date to on or before
 *    it, −1 for the reverse, else 0;
 *  - Level change, Location change, Start recruiting: 0.
 * 0 when the request takes effect after `date`.
 *
 * Fixtures (targets.test.ts): A2 (a pending Backfill on an Open seat 0; on a seat held On hold by an
 * internal move +1), G1, G2; trade.test.ts T1 (+7), T1h (+8).
 */
export function headEffect(request: HcRequest, org: OrgMatch, date: ISODate, ctx: AsksContext): number {
  switch (request.type) {
    case 'New role': {
      if (request.startDate && request.startDate > date) return 0
      return org(newSeatPlace(request), date) ? 1 : 0
    }
    case 'Backfill': {
      if (!request.positionId || (request.startDate && request.startDate > date)) return 0
      const s = ctx.seatOn(request.positionId, date)
      return s && s.status === 'On hold' && org(s.place, date) ? 1 : 0
    }
    case 'Elimination': {
      // startDate is the seat's last day: it still counts on that day.
      if (!request.positionId || (request.startDate && request.startDate >= date)) return 0
      const s = ctx.seatOn(request.positionId, date)
      return countsOn(s, date) && org(s.place, date) ? -1 : 0
    }
    case 'Transfer': {
      const t = request.transfer
      if (!t || (t.effectiveDate && t.effectiveDate > date)) return 0
      const s = ctx.seatOn(t.fromPositionId, date)
      if (!countsOn(s, date)) return 0
      const leaves = org(s.place, date) ? -1 : 0
      if (t.kind === 'internal') return leaves
      const to = placeUnder(t.toManagerPositionId, date, ctx)
      return leaves + (to && org(to, date) ? 1 : 0)
    }
    case 'Start date': {
      if (!request.positionId) return 0
      const s = ctx.seatOn(request.positionId, date)
      if (!s || (s.status !== 'Open' && s.status !== 'Planned') || !org(s.place, date)) return 0
      const before = s.start == null || s.start <= date
      const after = request.startDate == null || request.startDate <= date
      return before === after ? 0 : after ? 1 : -1
    }
    case 'Trade': {
      const t = request.trade
      if (!t) return 0
      let heads = 0
      if (!(request.startDate && request.startDate > date) && org(newSeatPlace(request), date))
        heads += getSeatsOf(request).length
      for (const id of t.givePositionIds) {
        const s = ctx.seatOn(id, date)
        if (countsOn(s, date) && org(s.place, date)) heads -= 1
      }
      return heads
    }
    case 'Level change':
    case 'Location change':
    case 'Start recruiting':
      return 0
  }
}

/**
 * The in-year band-estimate change approving would make to the org's seats in the fiscal year, USD
 * (6.9): seats added +, seats removed or put On hold −, a Level or Location change the difference;
 * each at band estimate × `inYearFraction` from its start or effective date to FY end (a trade's give
 * seats from the later of their start and the first open month), plan rates, no equity. 0 when the
 * request takes effect after the fiscal year.
 *
 * Fixture: G3 (T1 pending: 8 × $33,859.20 × 3/12 − $287,400 × 5/12 = −$52,031.60; the annual band
 * estimate, +$151,123.60, is the negative control).
 */
export function bandEffect(
  request: HcRequest,
  org: OrgMatch,
  fiscalYear: FiscalYear,
  ctx: AsksContext,
): number {
  const fy = fyRange(fiscalYear)
  const months = monthsOf(fiscalYear)
  const firstOpen = monthStart(ctx.firstOpenMonth)
  const openStart = firstOpen > fy.start ? firstOpen : fy.start
  if (openStart > fy.end) return 0
  /** The in-year fraction from a date (never before the first open month) to FY end. */
  const inYear = (from: ISODate | null): number => {
    const start = later(from, openStart) ?? openStart
    return start > fy.end ? 0 : inYearFraction(ctx.proration, months, start, null)
  }
  /** The date a seat is read on: the effective date, kept inside the open part of the year. */
  const readOn = (d: ISODate | null): ISODate =>
    d == null || d < openStart ? openStart : d > fy.end ? fy.end : d
  const band = (seat: SeatType, place: SeatPlace): number => ctx.bandUsd(seat, place) ?? 0

  switch (request.type) {
    case 'New role': {
      if (!request.level || !request.location) return 0
      const place = newSeatPlace(request)
      if (!org(place, readOn(request.startDate))) return 0
      const seat = { level: request.level, location: request.location, fte: request.fte ?? 1 }
      return band(seat, place) * inYear(request.startDate)
    }
    case 'Backfill': {
      if (!request.positionId) return 0
      const on = readOn(request.startDate)
      const s = ctx.seatOn(request.positionId, on)
      if (!s || !org(s.place, on)) return 0
      if (s.status === 'On hold') return band(s.seat, s.place) * inYear(request.startDate)
      // A seat Open after an exit with no planned start is costed once the Backfill gives it one (R33).
      if (notStarted(s) && request.startDate) return band(s.seat, s.place) * inYear(request.startDate)
      return 0
    }
    case 'Elimination': {
      if (!request.positionId) return 0
      const on = readOn(request.startDate)
      const s = ctx.seatOn(request.positionId, on)
      if (!costed(s) || !org(s.place, on)) return 0
      const leaves = request.startDate ? addDays(request.startDate, 1) : null
      return -band(s.seat, s.place) * inYear(later(leaves, s.start))
    }
    case 'Level change':
    case 'Location change': {
      if (!request.positionId) return 0
      const on = readOn(request.startDate)
      const s = ctx.seatOn(request.positionId, on)
      if (!costed(s) || !org(s.place, on)) return 0
      const next: SeatType =
        request.type === 'Level change'
          ? { ...s.seat, level: request.level ?? s.seat.level, fte: request.fte ?? s.seat.fte }
          : { ...s.seat, location: request.location ?? s.seat.location, fte: request.fte ?? s.seat.fte }
      return (band(next, s.place) - band(s.seat, s.place)) * inYear(later(request.startDate, s.start))
    }
    case 'Transfer': {
      const t = request.transfer
      if (!t) return 0
      const on = readOn(t.effectiveDate || null)
      const s = ctx.seatOn(t.fromPositionId, on)
      if (!costed(s)) return 0
      const share = inYear(later(t.effectiveDate || null, s.start))
      let usd = org(s.place, on) ? -band(s.seat, s.place) * share : 0
      if (t.kind === 'position') {
        const to = placeUnder(t.toManagerPositionId, on, ctx)
        if (to && org(to, on)) usd += band(s.seat, to) * share
      }
      return usd
    }
    case 'Start date': {
      if (!request.positionId) return 0
      const s = ctx.seatOn(request.positionId, openStart)
      if (!s || (s.status !== 'Open' && s.status !== 'Planned') || !org(s.place, openStart)) return 0
      // No planned start costs nothing (R33): only the start the request sets moves cost.
      const share = (start: ISODate | null): number => (start == null ? 0 : inYear(start))
      return band(s.seat, s.place) * (share(request.startDate) - share(s.start))
    }
    case 'Trade': {
      const t = request.trade
      if (!t) return 0
      let usd = 0
      const place = newSeatPlace(request)
      if (org(place, readOn(request.startDate))) {
        const share = inYear(request.startDate)
        for (const seat of getSeatsOf(request)) usd += band(seat, place) * share
      }
      for (const id of t.givePositionIds) {
        const s = ctx.seatOn(id, openStart)
        // An On hold seat, or one with no planned start (R33), is not costed: giving it saves nothing.
        if (!s || (s.status !== 'Open' && s.status !== 'Planned') || !org(s.place, openStart)) continue
        if (s.start == null) continue
        usd -= band(s.seat, s.place) * inYear(s.start)
      }
      return usd
    }
    case 'Start recruiting':
      return 0
  }
}

/** Asks in heads at a target date. */
export interface Asks {
  heads: number
  /** Working seats counted on the date. */
  seatHeads: number
  /** Σ head effect of pending requests effective by the date. */
  pendingHeads: number
  byRequest: readonly { requestId: string; heads: number }[]
}

/** Submitted, In review or Sent back (requests.ts `isPending`, kept here to avoid a module cycle). */
const pending = (r: HcRequest): boolean => PENDING_REQUEST_STATES.includes(r.state)

/**
 * Asks at a target date (see the module comment). Pending = Submitted, In review or Sent back.
 * `byRequest` lists every pending request with its head effect (0 included), in the order given.
 *
 * Fixtures: G1 (B + 58), G2 (a Planned seat and a pending New role starting 1 Jan 2028 are out of asks
 * at 30 Sep 2027 and in at 31 Mar 2028).
 */
export function asks(
  org: OrgMatch,
  targetDate: ISODate,
  requests: readonly HcRequest[],
  ctx: AsksContext,
): Asks {
  let seatHeads = 0
  for (const id of ctx.positionIds) {
    const s = ctx.seatOn(id, targetDate)
    if (countsOn(s, targetDate) && org(s.place, targetDate)) seatHeads++
  }
  let pendingHeads = 0
  const byRequest: { requestId: string; heads: number }[] = []
  for (const r of requests) {
    if (!pending(r)) continue
    const heads = headEffect(r, org, targetDate, ctx)
    pendingHeads += heads
    byRequest.push({ requestId: r.requestId, heads })
  }
  return { heads: seatHeads + pendingHeads, seatHeads, pendingHeads, byRequest }
}

/** Asks cost for a fiscal year, USD, exact (the guard rounds it per atom for rule 8). */
export interface AsksCost {
  /** The year's loaded cost of the org's Working lines. */
  lines: number
  /** Σ band effect of pending requests effective in the year (always the band part). */
  pending: number
  total: number
}

/** Asks cost: `lines` = Σ usd.loaded of the given Working lines (already the org's, for the year); `pending` = Σ bandEffect. */
export function asksCost(
  org: OrgMatch,
  fiscalYear: FiscalYear,
  workingLines: readonly PlanLine[],
  requests: readonly HcRequest[],
  ctx: AsksContext,
): AsksCost {
  let lines = 0
  for (const l of workingLines) lines += l.usd.loaded
  let pendingUsd = 0
  for (const r of requests) if (pending(r)) pendingUsd += bandEffect(r, org, fiscalYear, ctx)
  return { lines, pending: pendingUsd, total: lines + pendingUsd }
}

/** Target − asks, in heads and cost; cost is null when either side has none. Negative: asks exceed the target. */
export interface Gap {
  heads: number
  cost: number | null
}

/** Fixture: G1 (target B + 40, asks B + 58: −18). */
export function gap(
  target: { heads: number; cost: number | null },
  asks: { heads: number; cost: number | null },
): Gap {
  return {
    heads: target.heads - asks.heads,
    cost: target.cost == null || asks.cost == null ? null : target.cost - asks.cost,
  }
}

/**
 * The gap after approval: `gapWithout` (the gap with this request left out of asks) − its head
 * effect, and − its band effect in cost. For a pending request it equals the current gap (11.7).
 *
 * Fixture: G3.
 */
export function gapAfterApproval(gapWithout: Gap, headEffect: number, bandEffect: number): Gap {
  return {
    heads: gapWithout.heads - headEffect,
    cost: gapWithout.cost == null ? null : gapWithout.cost - bandEffect,
  }
}

/** A target's date: its targetDate, or the fiscal year's last day when blank. */
export function targetDateOf(target: TargetRow): ISODate {
  return target.targetDate || fyRange(target.fiscalYear).end
}

/** Which org a target row is keyed by: a leader's tree, a cost center, a department or the unit. */
export type TargetKind = 'leader' | 'cost-center' | 'department' | 'unit'

export function targetKindOf(target: TargetRow): TargetKind {
  if (target.leaderPositionId) return 'leader'
  if (target.costCenter) return 'cost-center'
  if (target.department) return 'department'
  return 'unit'
}

/**
 * The target that decides for a seat (10.2): the nearest org at or above the seat's place that has a
 * target for the fiscal year, at worst its business unit; null when none up to and including the
 * unit. `ancestors` lists the manager positions above a position, nearest first (leader targets).
 *
 * "Nearest" walks the position tree first: the leader targets on the chain from the seat's org (its
 * manager position for a new seat, the positions above it for an existing one) up, nearest first;
 * then the seat's cost center, then its department, then its unit. Only targets of the seat's own
 * business unit are read, so nothing above the unit decides.
 */
export function targetFor(
  place: SeatPlace,
  targets: readonly TargetRow[],
  fiscalYear: FiscalYear,
  ancestors: (positionId: string) => readonly string[],
): TargetRow | null {
  const mine = targets.filter((t) => t.fiscalYear === fiscalYear && t.businessUnit === place.businessUnit)
  if (!mine.length) return null
  const chain: string[] =
    place.positionId != null
      ? [...ancestors(place.positionId)]
      : place.managerPositionId != null
        ? [place.managerPositionId, ...ancestors(place.managerPositionId)]
        : []
  for (const node of chain) {
    const t = mine.find((x) => targetKindOf(x) === 'leader' && x.leaderPositionId === node)
    if (t) return t
  }
  if (place.costCenter) {
    const t = mine.find((x) => targetKindOf(x) === 'cost-center' && x.costCenter === place.costCenter)
    if (t) return t
  }
  if (place.department) {
    const t = mine.find((x) => targetKindOf(x) === 'department' && x.department === place.department)
    if (t) return t
  }
  return mine.find((x) => targetKindOf(x) === 'unit') ?? null
}
