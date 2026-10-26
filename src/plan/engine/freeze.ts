/**
 * Hiring freezes (docs/PLAN.md 10.4, 6.9 freeze savings, 15.1 R10). Built by engines C in M1. Pure.
 *
 * A freeze (org, from, to, allowBackfill) blocks new requests in the org, holds unstarted openings
 * (the forecast does not start them while frozen; status is unchanged, and they stay approved heads
 * and in the gap) and honors accepted offers. Backfills need `allowBackfill`. An exception adds a
 * Finance step after the normal chain; its business reason is refused at entry when it holds an
 * amount (8.4 rule 5).
 *
 * Freeze savings (a band figure, guard B; Finance and HR admin only): the sum over openings held by a
 * freeze of the opening's band estimate (plan rates) ÷ 12 × the active fraction for each month held
 * (from the later of the freeze start and the opening's unfrozen forecast start, to the earlier of the
 * freeze end and the grid end), plus suppressed modeled backfills at midpoint. It never reads the
 * comparison line's cost, HRIS pay or an offer.
 *
 * Readings kept here:
 *  - A freeze's org is every field it sets: its business unit always, and its department, cost center
 *    and leader's tree when filled. A seat that does not exist yet (a New role, a trade's get seat)
 *    is in the leader's tree when its manager position is the leader's seat or under it.
 *  - Freezes that overlap on one opening never count a month twice: the freezes are taken by
 *    freezeId, and each holds only the days the ones before it did not.
 *  - An approved freeze exception lets its seats through (10.4, review SC-4): a seat with a row whose
 *    `sourceRequestId` is an approved request with an exception is not held by the freeze that
 *    exception names (`freezeExemptions`, `FreezeOpening.exemptFrom`), in frozen openings, freeze
 *    savings and the forecast alike. An imported exception names no freeze (the requests dataset has
 *    only a yes or no column, 5.2), so it names the first freeze that covers the request's place on
 *    its start date (`exceptionFreezeOf`, review SC-7).
 */
import { monthKey, monthRange } from '@/data/fiscal'
import {
  APPROVED_REQUEST_STATES,
  type FreezeRow,
  type ISODate,
  type PositionRow,
  type Proration,
} from '@/data/schema'
import { addDays, formatDate } from '@/lib/dates'
import type { HcRequest, SeatPlace } from '../types'
import type { SeatType } from './band'
import { inYearFraction } from './proration'

/** Whether a position is in the tree under a root position on a date. */
export type InTree = (positionId: string, rootPositionId: string, on: ISODate) => boolean

const filled = (v: string | null | undefined): v is string => v != null && v.trim() !== ''

const byFreezeId = (a: FreezeRow, b: FreezeRow): number =>
  a.freezeId < b.freezeId ? -1 : a.freezeId > b.freezeId ? 1 : 0

/** Whether the freeze's org (unit, and department, cost center and leader's tree when set) holds the place. */
function inFreezeOrg(freeze: FreezeRow, place: SeatPlace, on: ISODate, inTree: InTree): boolean {
  if (freeze.businessUnit !== place.businessUnit) return false
  if (filled(freeze.department) && freeze.department !== place.department) return false
  if (filled(freeze.costCenter) && freeze.costCenter !== place.costCenter) return false
  if (filled(freeze.leaderPositionId)) {
    const root = freeze.leaderPositionId
    if (place.positionId != null) return inTree(place.positionId, root, on)
    const m = place.managerPositionId
    return m != null && (m === root || inTree(m, root, on))
  }
  return true
}

/**
 * The freeze covers the seat's place on the date: from startDate to endDate (both inclusive; blank end
 * is open-ended), and every org field the freeze sets matches (business unit, department, cost center,
 * and the leader's tree for leaderPositionId).
 */
export function freezeCovers(freeze: FreezeRow, place: SeatPlace, on: ISODate, inTree: InTree): boolean {
  if (on < freeze.startDate) return false
  if (filled(freeze.endDate) && on > freeze.endDate) return false
  return inFreezeOrg(freeze, place, on, inTree)
}

/** The first freeze (by freezeId) that covers the place on the date, or null. */
export function freezeOn(
  freezes: readonly FreezeRow[],
  place: SeatPlace,
  on: ISODate,
  inTree: InTree,
): FreezeRow | null {
  return [...freezes].sort(byFreezeId).find((f) => freezeCovers(f, place, on, inTree)) ?? null
}

/**
 * The notice on Requests > New: "Hiring is frozen for <org> from 1 Aug 2026. You can still submit an
 * exception with a business reason." (never "restricted"). A freeze with an end date says it: "from
 * 1 Aug 2026 to 31 Dec 2026".
 */
export function freezeNotice(orgLabel: string, freeze: FreezeRow): string {
  const until = filled(freeze.endDate) ? ` to ${formatDate(freeze.endDate)}` : ''
  return `Hiring is frozen for ${orgLabel} from ${formatDate(freeze.startDate)}${until}. You can still submit an exception with a business reason.`
}

/** An opening as freezes read it. */
export interface FreezeOpening {
  positionId: string
  status: 'Open' | 'Planned'
  place: SeatPlace
  seat: SeatType
  /** The forecast start with no freeze (forecast.ts `forecastStart`). */
  unfrozenStart: ISODate
  acceptedOffer: boolean
  /** A backfill seat (a seat reopened by an exit or an approved Backfill). */
  backfill: boolean
  /**
   * The freezes an approved exception lets this seat through (`freezeExemptions`); none when absent.
   * An addition to the contract (review SC-4).
   */
  exemptFrom?: readonly string[]
}

/** Whether the freeze holds this opening at all: no accepted offer, not a backfill it allows, no exception for it. */
const holds = (freeze: FreezeRow, o: FreezeOpening): boolean =>
  !o.acceptedOffer &&
  !(o.backfill && freeze.allowBackfill === true) &&
  !(o.exemptFrom?.includes(freeze.freezeId) ?? false)

/** Where a request's seat sits: a new seat (New role, a trade's get seats) by its manager position. */
const placeOfRequest = (req: HcRequest): SeatPlace => ({
  positionId: req.type === 'New role' || req.type === 'Trade' ? null : req.positionId,
  managerPositionId: req.managerPositionId || null,
  businessUnit: req.businessUnit,
  department: req.department,
  costCenter: req.costCenter,
})

/**
 * The freeze a request's exception names: its `freezeId`, else (an imported exception, whose freeze
 * the dataset does not carry, 5.2) the first freeze by freezeId that covers the request's place on its
 * start date, else on `asOf`. Null with no exception, or when no freeze covers it. Review SC-7.
 */
export function exceptionFreezeOf(
  req: HcRequest,
  freezes: readonly FreezeRow[],
  inTree: InTree,
  asOf: ISODate,
): string | null {
  if (!req.exception) return null
  if (req.exception.freezeId) return req.exception.freezeId
  return freezeOn(freezes, placeOfRequest(req), req.startDate ?? asOf, inTree)?.freezeId ?? null
}

/**
 * The seats approved freeze exceptions let through, each with the freezes it is let through (10.4,
 * review SC-4): every seat with a row whose `sourceRequestId` is an approved request with an
 * exception (a New role's seat, a Backfill's reopened seat, a trade's get seats), exempt from the
 * freeze that exception names (`exceptionFreezeOf`). Frozen openings, freeze savings and the forecast
 * read it, so a seat Finance approved past a freeze counts as no frozen opening, saves nothing and
 * starts in the forecast.
 */
export function freezeExemptions(
  requests: readonly HcRequest[],
  positions: readonly PositionRow[],
  freezes: readonly FreezeRow[],
  inTree: InTree,
  asOf: ISODate,
): ReadonlyMap<string, readonly string[]> {
  const byRequest = new Map<string, string>()
  for (const r of requests) {
    if (!r.exception || !APPROVED_REQUEST_STATES.includes(r.state)) continue
    const f = exceptionFreezeOf(r, freezes, inTree, asOf)
    if (f) byRequest.set(r.requestId, f)
  }
  const out = new Map<string, string[]>()
  if (!byRequest.size) return out
  for (const row of positions) {
    const f = row.sourceRequestId ? byRequest.get(row.sourceRequestId) : undefined
    if (!f) continue
    const list = out.get(row.positionId) ?? []
    if (!list.includes(f)) list.push(f)
    out.set(row.positionId, list)
  }
  return out
}

/**
 * Openings under a freeze on a date (`plan.openings.frozen`): Open and Planned seats, not started and
 * with no accepted offer, in an org whose freeze covers the date; backfill seats are left out when the
 * freeze has allowBackfill. Each opening names the first freeze (by freezeId) that holds it; the
 * openings keep their order.
 */
export function frozenOpenings(
  openings: readonly FreezeOpening[],
  freezes: readonly FreezeRow[],
  on: ISODate,
  inTree: InTree,
): { positionId: string; freezeId: string }[] {
  const sorted = [...freezes].sort(byFreezeId)
  const out: { positionId: string; freezeId: string }[] = []
  for (const o of openings) {
    if (o.status !== 'Open' && o.status !== 'Planned') continue
    const f = sorted.find((x) => holds(x, o) && freezeCovers(x, o.place, on, inTree))
    if (f) out.push({ positionId: o.positionId, freezeId: f.freezeId })
  }
  return out
}

export interface FreezeSavingsInput {
  openings: readonly FreezeOpening[]
  freezes: readonly FreezeRow[]
  /** The grid's last day. */
  gridEnd: ISODate
  proration: Proration
  inTree: InTree
  /** A seat's annual band estimate, USD at plan rates, no equity. */
  bandUsd(seat: SeatType, place: SeatPlace): number | null
  /** Modeled backfills the freezes suppressed, at midpoint (from the forecast). */
  suppressedBackfills: readonly { freezeId: string; usd: number }[]
}

export interface FreezeSavings {
  total: number
  byFreeze: readonly { freezeId: string; amount: number }[]
  byOpening: readonly { positionId: string; freezeId: string; from: ISODate; to: ISODate; amount: number }[]
}

/** The parts of [from, to] not already taken, in order. */
function untaken(from: ISODate, to: ISODate, taken: readonly [ISODate, ISODate][]): [ISODate, ISODate][] {
  let parts: [ISODate, ISODate][] = [[from, to]]
  for (const [a, b] of taken) {
    const next: [ISODate, ISODate][] = []
    for (const [x, y] of parts) {
      if (b < x || a > y) {
        next.push([x, y])
        continue
      }
      if (a > x) next.push([x, addDays(a, -1)])
      if (b < y) next.push([addDays(b, 1), y])
    }
    parts = next
  }
  return parts
}

/**
 * Freeze savings (see the module comment).
 *
 * Fixture (6.9 test, freeze.test.ts in the build): a seat Filled at Budget lock whose holder's last
 * day is 15 Jul 2026, reopened and held by a freeze from 1 Aug 2026, saves its band estimate ÷ 12 per
 * month held, never its Budget line.
 */
export function freezeSavings(input: FreezeSavingsInput): FreezeSavings {
  const freezes = [...input.freezes].sort(byFreezeId)
  const amounts = new Map(freezes.map((f) => [f.freezeId, 0]))
  const byOpening: { positionId: string; freezeId: string; from: ISODate; to: ISODate; amount: number }[] = []

  for (const o of input.openings) {
    if (o.status !== 'Open' && o.status !== 'Planned') continue
    const taken: [ISODate, ISODate][] = []
    for (const f of freezes) {
      if (!holds(f, o)) continue
      const from = f.startDate > o.unfrozenStart ? f.startDate : o.unfrozenStart
      const end = filled(f.endDate) && f.endDate < input.gridEnd ? f.endDate : input.gridEnd
      if (from > end || !inFreezeOrg(f, o.place, from, input.inTree)) continue
      const band = input.bandUsd(o.seat, o.place)
      for (const [a, b] of untaken(from, end, taken)) {
        taken.push([a, b])
        // band ÷ 12 × Σ active fraction over the months held = band × inYearFraction.
        const amount =
          band == null
            ? 0
            : band * inYearFraction(input.proration, monthRange(monthKey(a), monthKey(b)), a, b)
        byOpening.push({ positionId: o.positionId, freezeId: f.freezeId, from: a, to: b, amount })
        amounts.set(f.freezeId, (amounts.get(f.freezeId) ?? 0) + amount)
      }
    }
  }
  for (const s of input.suppressedBackfills) amounts.set(s.freezeId, (amounts.get(s.freezeId) ?? 0) + s.usd)

  const byFreeze = [...amounts].map(([freezeId, amount]) => ({ freezeId, amount }))
  byFreeze.sort((a, b) => (a.freezeId < b.freezeId ? -1 : a.freezeId > b.freezeId ? 1 : 0))
  let total = 0
  for (const f of byFreeze) total += f.amount
  return { total, byFreeze, byOpening }
}
