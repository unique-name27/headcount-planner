/**
 * What if (docs/PLAN.md 10.6, change C29; HRBP, Leader, Finance and HR admin). Built by engines C in
 * M1. Pure: levers are unsaved, held in session memory by the view.
 *
 * Levers: defer a start, cancel an Open or Planned seat, shift starts by n months, change level or
 * location, freeze a sub-org from a date, trade (11.5). They act only on Planned seats, Open seats with
 * no accepted offer (an accepted offer is never a lever target), requests and freezes. Results are the
 * change the levers make to heads, cost and gap: Working with the levers against Working without them,
 * never against the comparison. Levers are always costed at band estimate, in-year per 6.9 (so
 * shifting a start changes cost), as their own rounding part, and never reprice a Filled seat's HRIS
 * pay. Their cost deltas are band figures (7.2 rule 5), unless a lever's two sides differ in an HRIS or
 * offer amount.
 *
 * "Turn into requests" creates Draft requests, one per seat a lever touches: defer or shift → Start
 * date; cancel → Elimination; level → Level change; location → Location change; trade → Trade (one per
 * trade lever). The freeze lever is never turned into a request (freezes are Finance's); it is skipped
 * with FREEZE_LEVER_NOTE and still costed in the results.
 *
 * How the levers are read (engines C, M1):
 *  - The levers make a levered copy of the asks context (targets.ts `AsksContext`): a seat's start,
 *    level or location changes, or a cancelled seat reads Eliminated, on every date it is Open or
 *    Planned. Levers apply in order, so two levers on one seat compose (a shift moves the start an
 *    earlier defer set). Heads are asks at the target date (6.9) on each side, pending requests counted
 *    by their head effect on that side, so a lever on a seat a pending request already changes is not
 *    counted twice; a trade lever adds its head effect as a pending trade would.
 *  - Cost is the in-year band estimate (band ÷ 12 × the version's active fraction from the later of
 *    the seat's planned start and the first open month to FY end, plan rates, no equity) of every seat
 *    a lever touches, with the levers minus without; plus the change in the pending requests' band
 *    effects (targets.ts `bandEffect`); plus each trade lever's band effect as a pending trade. A seat
 *    with no planned start has no cost (6.5), so deferring it to a date adds that cost.
 *  - A freeze lever holds every Open and Planned employee seat with no accepted offer strictly below
 *    its org position (the sub-org) from its date to FY end: no band cost while frozen. Frozen
 *    openings stay approved heads and stay in the gap (R10), so a freeze changes no heads. The lever
 *    has no end date and allows no backfill. Pending requests in the sub-org are left as they are.
 *  - Seats are read on the first open day of the fiscal year (its first day for a later year), or on
 *    its last day for a seat that exists only later in the year. Only the org's seats count.
 *  - The gap change is in heads: −deltaHeads with a target, 0 without one.
 *  - A trade lever is quoted by `input.quote`; a quote that is not ok refuses the lever with its first
 *    block's text, and every trade lever's quote is listed in `trades`.
 *  - "Turn into requests" writes one draft per seat and request type, from the levers composed in
 *    order: a cancelled seat gets only its Elimination; a seat whose levers end where it started gets
 *    none ("This lever leaves the seat as it is."). Drafts carry no steps and no quote: an Elimination's
 *    last day and a Level or Location change's date are left blank (the approval date), and a trade
 *    lever asking for the most seats ('max') drafts count 0, which its quote at submit fills (11.3:
 *    the count defaults to the maximum).
 */
import { fyRange, monthStart, monthsOf } from '@/data/fiscal'
import {
  type FiscalYear,
  type ISODate,
  type ISODateTime,
  type Level,
  PENDING_REQUEST_STATES,
  type ReasonCode,
  type RequestType,
} from '@/data/schema'
import { addDays, addMonths, dateOf } from '@/lib/dates'
import type { HcRequest, OrgMatch } from '../types'
import { inYearFraction } from './proration'
import { ACCEPTED_OFFER_TEXT } from './requests'
import type { AsksContext, AsksSeat } from './targets'
import { asks, bandEffect, headEffect, seatWorkerType } from './targets'
import type { TradeAsk, TradeQuote } from './trade'

/** Said when "Turn into requests" skips a freeze lever. */
export const FREEZE_LEVER_NOTE =
  'Freezes are set by Finance. The freeze lever stays in this What if for you to share with Finance.'

/** Why a lever cannot act on a seat that is Filled, On hold, Eliminated or not an employee seat. */
export const NOT_A_LEVER_SEAT_TEXT =
  'Levers act only on Planned seats and on Open seats with no accepted offer.'

/** Why a lever cannot act on a seat outside the What if's org. */
export const OUT_OF_SCOPE_TEXT = 'This seat is outside the team or org this What if is for.'

/** Why a shift cannot move a seat that has no planned start. */
export const NO_START_TEXT = 'This seat has no planned start to move.'

/** Why "Turn into requests" makes nothing for levers that end where the seat started. */
export const NO_CHANGE_TEXT = 'This lever leaves the seat as it is.'

export type Lever =
  | { kind: 'defer'; positionId: string; to: ISODate }
  | { kind: 'cancel'; positionId: string }
  | { kind: 'shift'; positionIds: readonly string[]; months: number }
  | { kind: 'level'; positionId: string; level: Level }
  | { kind: 'location'; positionId: string; location: string }
  | { kind: 'freeze'; orgPositionId: string; from: ISODate }
  | { kind: 'trade'; ask: TradeAsk }

export interface WhatIfInput {
  levers: readonly Lever[]
  /** The scope the results are for. */
  org: OrgMatch
  fiscalYear: FiscalYear
  /** The target date of the org's target (heads are counted there). */
  targetDate: ISODate
  /** The target, for the gap change; null when the org has none (the gap change reads 0). */
  target: { heads: number; cost: number | null } | null
  requests: readonly HcRequest[]
  ctx: AsksContext
  /** Quotes a trade lever (trade.ts `tradeQuote` with the view's seats, rates and context). */
  quote(ask: TradeAsk): TradeQuote
}

export interface WhatIfResult {
  /** Asks heads with the levers − without (`whatif.delta.heads`). */
  deltaHeads: number
  /** In-year band cost with the levers − without, USD (`whatif.delta.cost`). */
  deltaCost: number
  /** Gap with the levers − without (`whatif.delta.gap`; the negative of deltaHeads when a target exists). */
  deltaGap: number
  /** True while only band-estimate amounts differ (a band figure, 7.2 rule 5). */
  bandOnly: boolean
  /** Positions whose amount differs between the two sides (the guard counts contributors from them). */
  contributors: readonly string[]
  /** Each trade lever's quote, by lever index (`requests.trade.ratio`). */
  trades: readonly { lever: number; quote: TradeQuote }[]
  /** Levers that cannot apply, with the reason (an accepted offer: ACCEPTED_OFFER_TEXT). */
  refused: readonly { lever: number; text: string }[]
}

/* ───────────── seats ───────────── */

/** What the levers do to one seat, composed in lever order. */
interface Edit {
  /** Set when a defer or shift moved the start. */
  start?: ISODate
  level?: Level
  location?: string
  cancelled: boolean
  /** The earliest freeze lever that holds the seat. */
  frozenFrom: ISODate | null
}

const isOpening = (s: AsksSeat | null): s is AsksSeat =>
  s != null && (s.status === 'Open' || s.status === 'Planned')

/** A seat a lever may act on: Planned, or Open with no accepted offer, and an employee seat. */
const isLeverSeat = (s: AsksSeat | null): s is AsksSeat =>
  isOpening(s) && !s.acceptedOffer && seatWorkerType(s) === 'Employee'

/** Why a lever cannot act on a seat; null when it can. `org` and `on` check the scope when given. */
function refusalOf(
  id: string,
  s: AsksSeat | null,
  scope: { org: OrgMatch; on: ISODate } | null,
): string | null {
  if (!s) return `There is no seat ${id} in this plan.`
  if (s.acceptedOffer) return ACCEPTED_OFFER_TEXT
  if (!isLeverSeat(s)) return NOT_A_LEVER_SEAT_TEXT
  if (scope && !scope.org(s.place, scope.on)) return OUT_OF_SCOPE_TEXT
  return null
}

/** A seat with a lever's edit applied (only while it is Open or Planned). */
function edited(s: AsksSeat, e: Edit): AsksSeat {
  if (e.cancelled) return { ...s, status: 'Eliminated', start: null }
  return {
    ...s,
    start: e.start !== undefined ? e.start : s.start,
    seat: { ...s.seat, level: e.level ?? s.seat.level, location: e.location ?? s.seat.location },
  }
}

/** The asks context with the levers' edits. */
function leveredContext(ctx: AsksContext, edits: ReadonlyMap<string, Edit>): AsksContext {
  return {
    positionIds: ctx.positionIds,
    proration: ctx.proration,
    firstOpenMonth: ctx.firstOpenMonth,
    bandUsd: (seat, place) => ctx.bandUsd(seat, place),
    seatOn(positionId, on) {
      const s = ctx.seatOn(positionId, on)
      const e = edits.get(positionId)
      return e && isOpening(s) ? edited(s, e) : s
    },
  }
}

/** The year's reading dates: the first open day (the year's first day for a later year) and the last day. */
function yearDates(fiscalYear: FiscalYear, ctx: AsksContext) {
  const fy = fyRange(fiscalYear)
  const firstOpen = monthStart(ctx.firstOpenMonth)
  const openStart = firstOpen > fy.start ? firstOpen : fy.start
  return { fy, openStart, ref: openStart > fy.end ? fy.end : openStart, months: monthsOf(fiscalYear) }
}

/** The shift of a start by whole months (the day clamps to a shorter month's end). */
const shifted = (start: ISODate, months: number): ISODate => addMonths(start, months)

/* ───────────── the levers' effect ───────────── */

/** A request with the defaults every What if request shares. */
function requestOf(
  requestId: string,
  type: RequestType,
  reasonCode: ReasonCode,
  state: HcRequest['state'],
  at: ISODateTime,
  over: Partial<HcRequest>,
): HcRequest {
  return {
    requestId,
    type,
    state,
    reasonCode,
    requesterId: '',
    submittedById: null,
    submittedAt: null,
    updatedAt: at,
    positionId: null,
    managerPositionId: '',
    businessUnit: '',
    department: null,
    costCenter: null,
    level: null,
    location: null,
    jobTitle: null,
    fte: null,
    startDate: null,
    priority: null,
    cycleId: null,
    confidential: false,
    exception: null,
    steps: [],
    comments: [],
    changes: null,
    trade: null,
    transfer: null,
    outcome: null,
    ...over,
  }
}

/** A trade lever as the request it would be: the quote's seats, start and weights. */
function tradeRequestOf(
  requestId: string,
  ask: TradeAsk,
  quote: TradeQuote | null,
  state: HcRequest['state'],
  at: ISODateTime,
  manager: AsksSeat | null,
): HcRequest {
  const g = ask.get
  const whole = quote
    ? quote.get.filter((l) => Math.abs(l.fte - g.fte) < 1e-9).length
    : typeof g.count === 'number'
      ? Math.max(0, Math.floor(g.count))
      : 0
  const rest = quote && quote.get.length > whole ? quote.get[quote.get.length - 1].fte : null
  return requestOf(requestId, 'Trade', 'Cost-neutral mix', state, at, {
    managerPositionId: g.orgPositionId,
    businessUnit: g.businessUnit,
    department: manager?.place.department ?? null,
    costCenter: manager?.place.costCenter ?? null,
    level: g.level,
    location: g.location,
    fte: g.fte,
    startDate: g.start,
    exception: ask.freezeException ? { freezeId: '', reason: ask.freezeException.reason } : null,
    trade: {
      givePositionIds: [...ask.give],
      giveOrgPositionId: quote?.giveOrgPositionId || ask.giveOrgPositionId || null,
      creditUsedBp: ask.creditUsedBp,
      count: whole,
      jobFamily: g.jobFamily,
      partTimeRest: g.partTimeRest,
      restFte: rest,
      rateVersion: quote?.rates.version ?? null,
      rateHash: quote?.rates.lockHash ?? null,
      giveBp: quote ? quote.giveBp : null,
      getBp: quote ? quote.getBp : null,
      creditBp: quote ? quote.creditBp : null,
    },
  })
}

/**
 * The levers' effect (see the module comment).
 *
 * Fixtures (whatif.test.ts, 11.7 rates, full-month proration, first open month 2026-10): deferring
 * the Planned P5 San Jose seat from 1 Nov 2026 to 1 Jan 2027 changes cost by −$287,400 × 2/12 =
 * −$47,900.00 and heads at 31 Dec 2026 by −1; cancelling it −$119,750.00 and −1 head; a trade lever
 * for T1 +7 heads and −$52,031.60 (G3); a freeze of its sub-org from 1 Jan 2027 holds it for
 * −$287,400 × 3/12 = −$71,850.00 (−$109,657.02 with the sub-org's Munich opening) and no heads; an
 * accepted-offer seat is refused with ACCEPTED_OFFER_TEXT.
 */
export function whatIf(input: WhatIfInput): WhatIfResult {
  const { ctx, org } = input
  const { fy, openStart, ref, months } = yearDates(input.fiscalYear, ctx)
  const seatAt = (c: AsksContext, id: string): AsksSeat | null => c.seatOn(id, ref) ?? c.seatOn(id, fy.end)

  const edits = new Map<string, Edit>()
  const editOf = (id: string): Edit => {
    let e = edits.get(id)
    if (!e) {
      e = { cancelled: false, frozenFrom: null }
      edits.set(id, e)
    }
    return e
  }
  const refused: { lever: number; text: string }[] = []
  const trades: { lever: number; quote: TradeQuote }[] = []
  const tradeRequests: HcRequest[] = []
  const contributors = new Set<string>()
  const scope = { org, on: ref }

  /** The levered start of a seat so far: an earlier lever's, else its own. */
  const startNow = (id: string, s: AsksSeat): ISODate | null => {
    const e = edits.get(id)
    return e?.start !== undefined ? e.start : s.start
  }

  input.levers.forEach((lever, i) => {
    switch (lever.kind) {
      case 'defer':
      case 'cancel':
      case 'level':
      case 'location': {
        const s = seatAt(ctx, lever.positionId)
        const why = refusalOf(lever.positionId, s, scope)
        if (why) {
          refused.push({ lever: i, text: why })
          return
        }
        const e = editOf(lever.positionId)
        if (lever.kind === 'defer') e.start = lever.to
        else if (lever.kind === 'cancel') e.cancelled = true
        else if (lever.kind === 'level') e.level = lever.level
        else e.location = lever.location
        return
      }
      case 'shift': {
        const several = lever.positionIds.length > 1
        for (const id of lever.positionIds) {
          const s = seatAt(ctx, id)
          const why = refusalOf(id, s, scope) ?? (s && startNow(id, s) == null ? NO_START_TEXT : null)
          if (why || !s) {
            refused.push({ lever: i, text: several ? `${id}: ${why}` : (why ?? '') })
            continue
          }
          const from = startNow(id, s) as ISODate
          editOf(id).start = shifted(from, lever.months)
        }
        return
      }
      case 'freeze': {
        const root = lever.orgPositionId
        /** Strictly below the root position, walking up manager positions (cycle-safe). */
        const below = (id: string): boolean => {
          const seen = new Set<string>([id])
          let cur = seatAt(ctx, id)?.place.managerPositionId ?? null
          while (cur != null && !seen.has(cur)) {
            if (cur === root) return true
            seen.add(cur)
            cur = seatAt(ctx, cur)?.place.managerPositionId ?? null
          }
          return false
        }
        for (const id of ctx.positionIds) {
          const s = seatAt(ctx, id)
          if (!isLeverSeat(s) || !org(s.place, ref) || !below(id)) continue
          const e = editOf(id)
          if (e.frozenFrom == null || lever.from < e.frozenFrom) e.frozenFrom = lever.from
        }
        return
      }
      case 'trade': {
        const quote = input.quote(lever.ask)
        trades.push({ lever: i, quote })
        if (!quote.ok) {
          refused.push({ lever: i, text: quote.blocks[0]?.text ?? 'This trade cannot be quoted.' })
          return
        }
        const manager = seatAt(ctx, lever.ask.get.orgPositionId)
        tradeRequests.push(
          tradeRequestOf(`whatif-trade-${i}`, lever.ask, quote, 'Submitted', `${ref}T00:00`, manager),
        )
        for (const id of lever.ask.give) contributors.add(id)
        return
      }
    }
  })

  const levered = leveredContext(ctx, edits)

  /** A seat's in-year band cost in the org on one side, held from `frozenFrom` on. */
  const seatCost = (c: AsksContext, id: string, frozenFrom: ISODate | null): number => {
    const s = seatAt(c, id)
    if (!isOpening(s) || s.start == null || !org(s.place, ref)) return 0
    const from = s.start > openStart ? s.start : openStart
    const last = frozenFrom ? addDays(frozenFrom, -1) : null
    if (from > fy.end || (last != null && last < from)) return 0
    const band = c.bandUsd(s.seat, s.place)
    return band == null ? 0 : band * inYearFraction(c.proration, months, from, last)
  }

  /* Heads: asks at the target date on each side, plus the trade levers as pending trades. */
  const before = asks(org, input.targetDate, input.requests, ctx).heads
  let after = asks(org, input.targetDate, input.requests, levered).heads
  for (const r of tradeRequests) after += headEffect(r, org, input.targetDate, levered)
  const deltaHeads = after - before

  /* Cost: the touched seats, the pending requests' band effects, the trade levers. */
  let deltaCost = 0
  for (const [id, e] of edits) {
    const d = seatCost(levered, id, e.frozenFrom) - seatCost(ctx, id, null)
    const a = ctx.seatOn(id, input.targetDate)
    const b = levered.seatOn(id, input.targetDate)
    const moved = a?.status !== b?.status || a?.start !== b?.start
    if (Math.abs(d) > 0.005 || moved) contributors.add(id)
    deltaCost += d
  }
  for (const r of input.requests) {
    if (!PENDING_REQUEST_STATES.includes(r.state)) continue
    const d = bandEffect(r, org, input.fiscalYear, levered) - bandEffect(r, org, input.fiscalYear, ctx)
    if (Math.abs(d) > 0.005) {
      if (r.positionId) contributors.add(r.positionId)
      for (const id of r.trade?.givePositionIds ?? []) contributors.add(id)
      if (r.transfer?.fromPositionId) contributors.add(r.transfer.fromPositionId)
    }
    deltaCost += d
  }
  for (const r of tradeRequests) deltaCost += bandEffect(r, org, input.fiscalYear, levered)

  // Levers touch only band seats (Planned, or Open with no accepted offer), so both sides differ in
  // band amounts alone; a Filled or accepted-offer seat would make the difference an HRIS one.
  const bandOnly = [...contributors].every((id) => {
    const s = seatAt(ctx, id)
    return s == null || (s.status !== 'Filled' && !s.acceptedOffer)
  })

  return {
    deltaHeads,
    deltaCost,
    // 0 − x, never −x: no −0 when the levers move no heads.
    deltaGap: input.target ? 0 - deltaHeads : 0,
    bandOnly,
    contributors: [...contributors].sort(),
    trades,
    refused,
  }
}

/**
 * The seats a lever may act on: Planned seats and Open seats with no accepted offer, in the scope,
 * on one date (`leverSeatsOfYear` reads a fiscal year as `whatIf` does).
 * Employee seats only (contractor and intern seats are not costed, 6.1); the order of
 * `positionIds` is kept.
 */
export function leverSeats(
  positionIds: readonly string[],
  ctx: AsksContext,
  on: ISODate,
  org: OrgMatch,
): string[] {
  return positionIds.filter((id) => {
    const s = ctx.seatOn(id, on)
    return isLeverSeat(s) && org(s.place, on)
  })
}

/**
 * The date `whatIf` reads a fiscal year's seats on: the first open day (the year's first day for a
 * later year), or the year's last day when the first open month is past the year. An addition to
 * the M3 freeze (whatif builder), so the view's pickers read seats as the results do.
 */
export const readingDateOf = (fiscalYear: FiscalYear, ctx: AsksContext): ISODate =>
  yearDates(fiscalYear, ctx).ref

/**
 * The seats a lever may act on in a fiscal year, read exactly as `whatIf` reads them: each seat on
 * the reading date, or on the year's last day for a seat that exists only later in the year;
 * Planned, or Open with no accepted offer; employee seats in the org on the reading date. The order
 * of `ctx.positionIds` is kept. An addition to the M3 freeze (whatif builder).
 */
export function leverSeatsOfYear(fiscalYear: FiscalYear, ctx: AsksContext, org: OrgMatch): AsksSeat[] {
  const { fy, ref } = yearDates(fiscalYear, ctx)
  const out: AsksSeat[] = []
  for (const id of ctx.positionIds) {
    const s = ctx.seatOn(id, ref) ?? ctx.seatOn(id, fy.end)
    if (isLeverSeat(s) && org(s.place, ref)) out.push(s)
  }
  return out
}

/** The first day a seat exists on or after `from`, looking a month at a time for up to three years. */
function firstSeat(ctx: AsksContext, id: string, from: ISODate): AsksSeat | null {
  let d = from
  for (let k = 0; k < 37; k++) {
    const s = ctx.seatOn(id, d)
    if (s) return s
    d = monthStart(addMonths(d, 1))
  }
  return null
}

/**
 * Draft requests for the levers (one per seat a lever touches; one Trade per trade lever), and the
 * levers skipped with why (a freeze lever: FREEZE_LEVER_NOTE). Every draft's type is in
 * REQUEST_TYPES.
 *
 * Reason codes: Start date "Other", Elimination "Cost reduction", Level change "Level mix", Location
 * change "Location strategy", Trade "Cost-neutral mix" (each in REASON_CODES_OF for its type).
 *
 * Fixture (whatif.test.ts, PLAN 16.2): a freeze lever plus one cancel lever turns into exactly one
 * Elimination draft, and the freeze lever is skipped with FREEZE_LEVER_NOTE.
 */
export function turnIntoRequests(
  levers: readonly Lever[],
  input: {
    requesterId: string
    at: ISODateTime
    newRequestId(n: number): string
    ctx: AsksContext
  },
): { drafts: HcRequest[]; skipped: { lever: number; text: string }[] } {
  const { ctx, at } = input
  const firstOpen = monthStart(ctx.firstOpenMonth)
  const today = dateOf(at)
  const from = today > firstOpen ? today : firstOpen
  const skipped: { lever: number; text: string }[] = []

  /** Each touched seat's composed edits, in first-touched order, with the levers that touched it. */
  const seats = new Map<string, { seat: AsksSeat; edit: Edit; levers: number[] }>()
  /** Trade levers, in order. */
  const tradeLevers: { lever: number; ask: TradeAsk }[] = []
  /** The order drafts are made in: a seat at its first lever, a trade at its lever. */
  const order: ({ seat: string } | { trade: number })[] = []

  const touch = (id: string, lever: number): { seat: AsksSeat; edit: Edit } | null => {
    const known = seats.get(id)
    if (known) {
      known.levers.push(lever)
      return known
    }
    const s = firstSeat(ctx, id, from)
    const why = refusalOf(id, s, null)
    if (why || !s) {
      skipped.push({ lever, text: why ?? '' })
      return null
    }
    const entry = { seat: s, edit: { cancelled: false, frozenFrom: null } as Edit, levers: [lever] }
    seats.set(id, entry)
    order.push({ seat: id })
    return entry
  }

  levers.forEach((lever, i) => {
    switch (lever.kind) {
      case 'freeze':
        skipped.push({ lever: i, text: FREEZE_LEVER_NOTE })
        return
      case 'trade':
        tradeLevers.push({ lever: i, ask: lever.ask })
        order.push({ trade: tradeLevers.length - 1 })
        return
      case 'shift':
        for (const id of lever.positionIds) {
          const known = seats.get(id)
          const s = known ? known.seat : firstSeat(ctx, id, from)
          const start = known && known.edit.start !== undefined ? known.edit.start : (s?.start ?? null)
          if (s && refusalOf(id, s, null) == null && start == null) {
            skipped.push({
              lever: i,
              text: lever.positionIds.length > 1 ? `${id}: ${NO_START_TEXT}` : NO_START_TEXT,
            })
            continue
          }
          const entry = touch(id, i)
          if (entry && start != null) entry.edit.start = shifted(start, lever.months)
        }
        return
      default: {
        const entry = touch(lever.positionId, i)
        if (!entry) return
        if (lever.kind === 'defer') entry.edit.start = lever.to
        else if (lever.kind === 'cancel') entry.edit.cancelled = true
        else if (lever.kind === 'level') entry.edit.level = lever.level
        else entry.edit.location = lever.location
      }
    }
  })

  const drafts: HcRequest[] = []
  const next = (): string => input.newRequestId(drafts.length + 1)
  for (const step of order) {
    if ('trade' in step) {
      const t = tradeLevers[step.trade]
      const manager = firstSeat(ctx, t.ask.get.orgPositionId, from)
      drafts.push({
        ...tradeRequestOf(next(), t.ask, null, 'Draft', at, manager),
        requesterId: input.requesterId,
      })
      continue
    }
    const entry = seats.get(step.seat)
    if (!entry) continue
    const { seat: s, edit: e } = entry
    const draft = (type: RequestType, reasonCode: ReasonCode, over: Partial<HcRequest>): HcRequest =>
      requestOf(next(), type, reasonCode, 'Draft', at, {
        requesterId: input.requesterId,
        positionId: s.positionId,
        managerPositionId: s.place.managerPositionId ?? '',
        businessUnit: s.place.businessUnit,
        department: s.place.department,
        costCenter: s.place.costCenter,
        level: s.seat.level,
        location: s.seat.location,
        fte: s.seat.fte,
        ...over,
      })
    const before = drafts.length
    if (e.cancelled) {
      drafts.push(draft('Elimination', 'Cost reduction', {}))
      continue
    }
    if (e.start !== undefined && e.start !== s.start)
      drafts.push(draft('Start date', 'Other', { startDate: e.start }))
    if (e.level !== undefined && e.level !== s.seat.level)
      drafts.push(draft('Level change', 'Level mix', { level: e.level }))
    if (e.location !== undefined && e.location !== s.seat.location)
      drafts.push(draft('Location change', 'Location strategy', { location: e.location }))
    if (drafts.length === before)
      for (const lever of entry.levers) skipped.push({ lever, text: NO_CHANGE_TEXT })
  }
  return { drafts, skipped }
}
