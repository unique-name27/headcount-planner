/**
 * Plan lines, plan heads and versions (docs/PLAN.md 6.5, 15.1 R1, R25, R26 and R31, change C28).
 * Built by engines A in M1. Pure.
 *
 * - Status derives from assignments in every computed line. On a day, a seat with an active Employee
 *   assignment is Filled. A seat without one takes its effective row's status, except that a row
 *   saying Filled reads Open from the day after the last assignment's last day. The imported status is
 *   used only for Planned, On hold and Eliminated, and by reconcile.ts.
 * - A seat that turns Open after an exit takes its planned start from its replacement (an open req's
 *   targetStartDate or an approved Backfill's start), never from the leaver's; until it has one it is
 *   an approved head but not a plan head, and its line has no cost.
 * - Plan heads at a month-end: seats Filled at month-end, plus Open and Planned seats whose planned
 *   start is on or before it.
 * - Approved heads on a date: Filled, Open and Planned seats on the date whose start is on or before
 *   the end of the date's fiscal year (a seat with no planned start counts).
 * - Locking writes a NEW locked version (kind 'budget' for the year's first lock, else 'reforecast';
 *   parentId = the Working) and leaves Working editable. Locked lines are never recomputed. Lines
 *   store positionId, not the org, so a moved position's lines move with it and the hash verifies.
 * - Reopen as new (Finance) retires the year's Working and creates a new one from the reforecast's
 *   assumptions, plan FX rates and proration.
 *
 * Readings kept here (engines A, M1):
 *  - `seatOn` reads the seat's data as given: the plan as known now (Working). A lock computed "as
 *    of" an earlier date passes the data as it stood then (cost.ts `lineContext` reads assignments,
 *    reqs and approvals as known on its as-of date).
 *  - An accepted offer is a req at stage Offer accepted or Started, not Cancelled, with a start date.
 *    It is taken over by the first Employee assignment on the seat that starts on or after the day it
 *    was accepted (`offerAcceptedDate`, else `openedDate`). Before that assignment starts, the offer
 *    gives an Open or Planned seat its planned start (the offer's start, never the row's).
 *  - A seat is Open "after an exit" when its row says Filled and nobody holds it, or when its row took
 *    effect on or before the last holder's last day (the row's startDate is then the leaver's). Its
 *    replacement is the latest open req (Open or On hold, not at an offer stage) with a target start,
 *    else the latest approved Backfill with a start, each only while nobody has started on the seat
 *    since it was opened or submitted. A seat Open or Planned for another reason takes the row's
 *    startDate, else its replacement's.
 *  - A seat whose `workerType` is not Employee is never a plan head or an approved head unless an
 *    Employee holds it.
 *  - An Eliminated row (endReason Eliminated, Traded or Transferred) ends the seat from its endDate +
 *    1 (15.1 R34, lead decision D-ELIM): no holder, head or cost from then, even while HRIS still
 *    shows an assignment. Every assignment is read clipped at the seat's last day
 *    (`clipAtElimination`), and reconcile.ts reports the leftover as `assignment-on-open`.
 */
import { fiscalYearOf, fyRange } from '@/data/fiscal'
import {
  APPROVED_REQUEST_STATES,
  type AssumptionRow,
  type FiscalYear,
  type ISODate,
  type ISODateTime,
  type PositionRow,
  type Proration,
  type ReqRow,
  siteByLocation,
} from '@/data/schema'
import { addDays, dateOf, formatDate } from '@/lib/dates'
import { sha256 } from '@/lib/sha256'
import { canonicalJson } from '../canonical'
import type {
  Actor,
  AnyVersion,
  Assignment,
  AuditDraft,
  ForecastTable,
  FxRate,
  FxTable,
  HcRequest,
  LockedVersion,
  PlanLine,
  PlanLineTable,
  Position,
  PositionStatus,
  WorkingVersion,
} from '../types'
import { isActiveOn } from './heads'
import { planLineRows, toPlanLineTable } from './lineTable'

/** Stored in every version; a lock records the engine that computed its lines. */
export const ENGINE_VERSION = 'hcp-engine-1'

/* ───────────── rows and seats ───────────── */

/**
 * A row with every blank filled: fte 1, workerType 'Employee', legalEntity from the location's site
 * (`siteByLocation`), optional fields null.
 */
export function toPosition(row: PositionRow): Position {
  return {
    positionId: row.positionId,
    effectiveDate: row.effectiveDate,
    status: row.status,
    title: row.title ?? null,
    jobFamily: row.jobFamily ?? null,
    level: row.level,
    businessUnit: row.businessUnit,
    department: row.department ?? null,
    costCenter: row.costCenter,
    location: row.location,
    legalEntity: row.legalEntity || siteByLocation.get(row.location)?.legalEntity || '',
    managerPositionId: row.managerPositionId ?? null,
    workerType: row.workerType || 'Employee',
    fte: row.fte ?? 1,
    startDate: row.startDate ?? null,
    openedDate: row.openedDate ?? null,
    reqType: row.reqType ?? null,
    leaderLevel: row.leaderLevel ?? null,
    endDate: row.endDate ?? null,
    endReason: row.endReason ?? null,
    sourceRequestId: row.sourceRequestId ?? null,
  }
}

/** The seat's row in effect on `d`: the latest with effectiveDate on or before it; null before the first. */
export function rowOn(rows: readonly PositionRow[], d: ISODate): PositionRow | null {
  let best: PositionRow | null = null
  for (const r of rows) {
    // Ties go to the later row (an edit written after the import).
    if (r.effectiveDate <= d && (best === null || r.effectiveDate >= best.effectiveDate)) best = r
  }
  return best
}

/* ───────────── eliminations end the seat (15.1 R34, lead decision D-ELIM) ───────────── */

/**
 * Whether a seat's row in effect on `d` ends it: an Eliminated row (endReason Eliminated, Traded or
 * Transferred, or blank) from the day after its endDate (from its own effective date when it has no
 * endDate). From then the seat has no holder, no head and no cost, even while HRIS still shows an
 * assignment on it (reconcile.ts reports that leftover as `assignment-on-open`). An addition to the
 * contract.
 */
export const endsSeatOn = (row: PositionRow | null, d: ISODate): boolean =>
  row != null && row.status === 'Eliminated' && (!row.endDate || d > row.endDate)

/**
 * The days a seat's Eliminated rows end it (see `endsSeatOn`), as [from, to] with `to` null for
 * good: from the later of the row's effective date and its endDate + 1, to the day before the next
 * row that is not Eliminated. `rows` in any order.
 */
function endedSpans(rows: readonly PositionRow[]): [ISODate, ISODate | null][] {
  const sorted = [...rows].sort(byEffective)
  const out: [ISODate, ISODate | null][] = []
  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i]
    if (r.status !== 'Eliminated') continue
    const afterLastDay = r.endDate ? addDays(r.endDate, 1) : r.effectiveDate
    const from = afterLastDay > r.effectiveDate ? afterLastDay : r.effectiveDate
    let to: ISODate | null = null
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].effectiveDate > r.effectiveDate && sorted[j].status !== 'Eliminated') {
        to = addDays(sorted[j].effectiveDate, -1)
        break
      }
    }
    if (to === null || from <= to) out.push([from, to])
  }
  return out
}

/**
 * A seat's assignments with the days its Eliminated rows end it taken out (see `endsSeatOn`): an
 * assignment that runs past the seat's last day ends on it, one that starts while the seat is ended
 * starts again the day it reopens (or is dropped). Assignments of other seats pass unchanged. An
 * addition to the contract: cost.ts `lineContext`, `seatHistories` and the forecast read every
 * assignment through it, so an approved Elimination ends the holder's pay and head on the last day
 * before HRIS records the exit (fixture C4e in cost.test.ts).
 */
export function clipAtElimination(
  assignments: readonly Assignment[],
  rowsOf: (positionId: string) => readonly PositionRow[],
): Assignment[] {
  const spansOf = new Map<string, [ISODate, ISODate | null][]>()
  const out: Assignment[] = []
  for (const a of assignments) {
    if (!a.positionId) {
      out.push(a)
      continue
    }
    let spans = spansOf.get(a.positionId)
    if (!spans) {
      spans = endedSpans(rowsOf(a.positionId))
      spansOf.set(a.positionId, spans)
    }
    if (spans.length === 0) {
      out.push(a)
      continue
    }
    // Walk the assignment's days, cutting out each ended span.
    let start: ISODate | null = a.start
    let piece: Assignment | null = null
    for (const [from, to] of spans) {
      if (start === null) break
      if (to !== null && to < start) continue
      if (a.end != null && from > a.end) break
      if (from > start) {
        piece = { ...a, start, end: addDays(from, -1) }
        out.push(piece)
      }
      start = to === null ? null : addDays(to, 1)
      if (start !== null && a.end != null && start > a.end) start = null
    }
    if (start !== null) out.push(start === a.start && piece === null ? a : { ...a, start })
  }
  return out
}

/** One seat's history: what its derived status is read from. */
export interface SeatHistory {
  positionId: string
  /** Every row of the seat, oldest effectiveDate first. */
  rows: readonly PositionRow[]
  /** Employee assignments on the seat (contractor and intern assignments are left out). */
  assignments: readonly Assignment[]
  reqs: readonly ReqRow[]
  /** Approved Backfill requests naming the seat. */
  backfills: readonly HcRequest[]
}

/** A seat on one day. */
export interface SeatState {
  positionId: string
  on: ISODate
  /** The row in effect on the day, resolved. */
  position: Position
  /** The derived status (6.5): Filled with an active Employee assignment, else as described above. */
  status: PositionStatus
  /** Employees with an active Employee assignment on the day. */
  holderIds: readonly string[]
  /**
   * When an Open or Planned seat is planned to be filled: the row's startDate, or for a seat Open
   * after an exit its replacement's start (an open req's targetStartDate or an approved Backfill's
   * start), never the leaver's. Null when there is none, and for Filled, On hold and Eliminated seats.
   */
  plannedStart: ISODate | null
  /** The seat's req at stage 'Offer accepted' (not Started), if any: the seat cannot be edited or traded. */
  acceptedOffer: ReqRow | null
  /** Filled, Open or Planned with a start on or before the end of the day's fiscal year (no planned start counts). */
  approvedHead: boolean
  /** Filled, or Open or Planned with a planned start on or before the day. */
  planHead: boolean
}

const byStart = (a: Assignment, b: Assignment): number => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)
const byEffective = (a: PositionRow, b: PositionRow): number =>
  a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0

/**
 * Every seat's history from the datasets: rows grouped by positionId (oldest first), Employee
 * assignments (clipped at the seat's elimination, `clipAtElimination`), reqs and approved Backfill
 * requests by seat.
 */
export function seatHistories(input: {
  positions: readonly PositionRow[]
  assignments: readonly Assignment[]
  reqs: readonly ReqRow[]
  requests: readonly HcRequest[]
}): Map<string, SeatHistory> {
  const rows = new Map<string, PositionRow[]>()
  for (const r of input.positions) {
    const list = rows.get(r.positionId)
    if (list) list.push(r)
    else rows.set(r.positionId, [r])
  }
  const assignments = new Map<string, Assignment[]>()
  const employees = input.assignments.filter(
    (a) => a.workerType === 'Employee' && a.positionId != null && rows.has(a.positionId),
  )
  for (const a of clipAtElimination(employees, (id) => rows.get(id) ?? [])) {
    const id = a.positionId as string
    const list = assignments.get(id)
    if (list) list.push(a)
    else assignments.set(id, [a])
  }
  const reqs = new Map<string, ReqRow[]>()
  for (const r of input.reqs) {
    if (!r.positionId || !rows.has(r.positionId)) continue
    const list = reqs.get(r.positionId)
    if (list) list.push(r)
    else reqs.set(r.positionId, [r])
  }
  const backfills = new Map<string, HcRequest[]>()
  for (const q of input.requests) {
    if (q.type !== 'Backfill' || !APPROVED_REQUEST_STATES.includes(q.state) || !q.positionId) continue
    if (!rows.has(q.positionId)) continue
    const list = backfills.get(q.positionId)
    if (list) list.push(q)
    else backfills.set(q.positionId, [q])
  }
  const out = new Map<string, SeatHistory>()
  for (const [positionId, list] of rows) {
    out.set(positionId, {
      positionId,
      rows: [...list].sort(byEffective),
      assignments: [...(assignments.get(positionId) ?? [])].sort(byStart),
      reqs: reqs.get(positionId) ?? [],
      backfills: backfills.get(positionId) ?? [],
    })
  }
  return out
}

/* ───────────── offers and replacements (additions: cost.ts reads them too) ───────────── */

const OFFER_STAGES: ReadonlySet<string> = new Set(['Offer accepted', 'Started'])

/** An accepted offer on a seat and the assignment that takes it over. An addition to the contract. */
export interface SeatOffer {
  req: ReqRow
  /** The agreed first day (`reqs.startDate`): the offer is costed from it. */
  start: ISODate
  /** The day it was accepted (`offerAcceptedDate`, else `openedDate`). */
  acceptedOn: ISODate
  /** The start of the first Employee assignment on the seat on or after `acceptedOn`; null while none has started. */
  takerStart: ISODate | null
}

const offerCache = new WeakMap<SeatHistory, readonly SeatOffer[]>()

/**
 * The seat's accepted offers (reqs at stage Offer accepted or Started, not Cancelled, with a start
 * date), oldest accepted first, each with the assignment that takes it over. An addition to the
 * contract.
 */
export function seatOffers(seat: SeatHistory): readonly SeatOffer[] {
  let out = offerCache.get(seat)
  if (out) return out
  const list: SeatOffer[] = []
  for (const req of seat.reqs) {
    if (req.status === 'Cancelled' || !req.stage || !OFFER_STAGES.has(req.stage) || !req.startDate) continue
    const acceptedOn = req.offerAcceptedDate || req.openedDate
    let takerStart: ISODate | null = null
    for (const a of seat.assignments) {
      if (a.workerType !== 'Employee' || a.start < acceptedOn) continue
      if (takerStart === null || a.start < takerStart) takerStart = a.start
    }
    list.push({ req, start: req.startDate, acceptedOn, takerStart })
  }
  list.sort((a, b) => (a.acceptedOn < b.acceptedOn ? -1 : a.acceptedOn > b.acceptedOn ? 1 : 0))
  out = list
  offerCache.set(seat, out)
  return out
}

/** Whether an offer has not been taken over by day `d` (its taker, if any, starts after `d`). */
export const offerPendingOn = (o: SeatOffer, d: ISODate): boolean => o.takerStart === null || o.takerStart > d

/** Someone started on the seat from `from` to `to`, both included. */
function startedBetween(seat: SeatHistory, from: ISODate, to: ISODate): boolean {
  for (const a of seat.assignments)
    if (a.workerType === 'Employee' && a.start >= from && a.start <= to) return true
  return false
}

/**
 * The replacement start of a seat on day `d`: the latest-opened open req (Open or On hold, not at an
 * offer stage) with a target start, else the latest approved Backfill with a start; each only while
 * nobody has started on the seat since it was opened (or the Backfill submitted). Null when none.
 * An addition to the contract.
 */
export function replacementStart(seat: SeatHistory, d: ISODate): ISODate | null {
  let req: ReqRow | null = null
  for (const r of seat.reqs) {
    if (r.status !== 'Open' && r.status !== 'On hold') continue
    if (r.stage && OFFER_STAGES.has(r.stage)) continue
    if (!r.targetStartDate || startedBetween(seat, r.openedDate, d)) continue
    if (req === null || r.openedDate >= req.openedDate) req = r
  }
  if (req) return req.targetStartDate ?? null
  let backfill: { start: ISODate; anchor: ISODate } | null = null
  for (const b of seat.backfills) {
    if (!b.startDate) continue
    const anchor = dateOf(b.submittedAt || b.updatedAt)
    if (startedBetween(seat, anchor, d)) continue
    if (backfill === null || anchor >= backfill.anchor) backfill = { start: b.startDate, anchor }
  }
  return backfill?.start ?? null
}

/** Where an Open or Planned seat's planned start came from. An addition to the contract. */
export type StartSource = 'offer' | 'row' | 'replacement'

/** A seat on one day with what cost.ts needs besides: where its planned start came from and its pending offer. */
export interface SeatDetail extends SeatState {
  startFrom: StartSource | null
  /** The accepted offer (stage Offer accepted or Started) that gives the planned start; null when none. */
  offer: SeatOffer | null
}

/** The last day of a date's fiscal year, cached by month. */
const FY_END = new Map<string, ISODate>()
function fyEndOf(d: ISODate): ISODate {
  const key = d.slice(0, 7)
  let end = FY_END.get(key)
  if (!end) {
    end = fyRange(fiscalYearOf(d)).end
    if (FY_END.size > 5_000) FY_END.clear()
    FY_END.set(key, end)
  }
  return end
}

/**
 * A seat an approved internal move holds while HRIS still shows the moving person on it: its row in
 * effect is the app's On hold row (`sourceRequestId` set, transfer.ts `applyTransfer`), yet an
 * Employee assignment keeps it Filled (R31). Its status stays Filled and its holder stays costed on it
 * until HRIS moves them, but it is no approved head and no ask: the receiving seat (an Open seat with
 * the move's Filled row) already counts the person, so the gap does not move at approval (C18, review
 * SC-6). An addition to the contract.
 */
export const heldForMove = (
  position: Pick<Position, 'status' | 'sourceRequestId'>,
  status: PositionStatus,
): boolean => status === 'Filled' && position.status === 'On hold' && position.sourceRequestId != null

/** `seatOn` with the planned start's source and the offer behind it. An addition to the contract. */
export function seatDetailOn(seat: SeatHistory, d: ISODate): SeatDetail | null {
  const row = rowOn(seat.rows, d)
  if (!row) return null
  const position = toPosition(row)
  const holderIds: string[] = []
  let lastEnd: ISODate | null = null
  // An Eliminated row ends the seat from the day after its last day: nobody holds it then (R34).
  const ended = endsSeatOn(row, d)
  for (const a of seat.assignments) {
    if (a.workerType !== 'Employee' || ended) continue
    if (isActiveOn(a, d)) {
      if (!holderIds.includes(a.employeeId)) holderIds.push(a.employeeId)
    } else if (a.end != null && a.end < d && (lastEnd === null || a.end > lastEnd)) lastEnd = a.end
  }
  const status: PositionStatus = holderIds.length ? 'Filled' : row.status === 'Filled' ? 'Open' : row.status

  let acceptedOffer: SeatOffer | null = null
  let pending: SeatOffer | null = null
  for (const o of seatOffers(seat)) {
    if (!offerPendingOn(o, d)) continue
    pending = o
    if (o.req.stage === 'Offer accepted') acceptedOffer = o
  }

  let plannedStart: ISODate | null = null
  let startFrom: StartSource | null = null
  let offer: SeatOffer | null = null
  if (status === 'Open' || status === 'Planned') {
    if (pending) {
      plannedStart = pending.start
      startFrom = 'offer'
      offer = pending
    } else {
      const afterExit = row.status === 'Filled' || (lastEnd !== null && row.effectiveDate <= lastEnd)
      const fromRow = afterExit ? null : (row.startDate ?? null)
      if (fromRow) {
        plannedStart = fromRow
        startFrom = 'row'
      } else {
        plannedStart = replacementStart(seat, d)
        startFrom = plannedStart ? 'replacement' : null
      }
    }
  }

  const employeeSeat = position.workerType === 'Employee'
  const openOrPlanned = (status === 'Open' || status === 'Planned') && employeeSeat
  const fyEnd = fyEndOf(d)
  return {
    positionId: seat.positionId,
    on: d,
    position,
    status,
    holderIds,
    plannedStart,
    acceptedOffer: acceptedOffer?.req ?? null,
    // A seat held by an approved internal move (`heldForMove`) is no approved head while HRIS still
    // shows the person on it: the receiving seat already counts them (C18, review SC-6).
    approvedHead:
      (status === 'Filled' && !heldForMove(position, status)) ||
      (openOrPlanned && (plannedStart === null || plannedStart <= fyEnd)),
    planHead: status === 'Filled' || (openOrPlanned && plannedStart !== null && plannedStart <= d),
    startFrom,
    offer,
  }
}

/**
 * A seat on day `d`; null before its first row.
 *
 * Fixtures (versions.test.ts): H3 (imported Filled, holder's last day 15 Oct 2026, no req, no
 * Backfill: Filled with a plan head at 30 Sep; Open from 16 Oct; at 31 Oct no plan head but still an
 * approved head), H4 (imported Planned with an assignment from 1 Sep 2026: Filled with a plan head at
 * 30 Sep 2026).
 */
export function seatOn(seat: SeatHistory, d: ISODate): SeatState | null {
  const s = seatDetailOn(seat, d)
  if (!s) return null
  return {
    positionId: s.positionId,
    on: s.on,
    position: s.position,
    status: s.status,
    holderIds: s.holderIds,
    plannedStart: s.plannedStart,
    acceptedOffer: s.acceptedOffer,
    approvedHead: s.approvedHead,
    planHead: s.planHead,
  }
}

/** Plan heads at a month-end: seats whose `seatOn(...).planHead` is true. Fixtures: H3, H4. */
export function planHeadsAt(seats: Iterable<SeatHistory>, monthEnd: ISODate): number {
  let n = 0
  for (const seat of seats) if (seatDetailOn(seat, monthEnd)?.planHead) n++
  return n
}

/** Approved heads on a date (15.1 R1). Fixtures: H3 (1 at 31 Oct 2026), G1, G2 (through targets.ts). */
export function approvedHeadsOn(seats: Iterable<SeatHistory>, d: ISODate): number {
  let n = 0
  for (const seat of seats) if (seatDetailOn(seat, d)?.approvedHead) n++
  return n
}

/* ───────────── versions ───────────── */

/** A version with its lines stored (state 'locked'). */
export const isLocked = (v: AnyVersion): v is LockedVersion => v.state === 'locked'

/** The fiscal year's one Working version; null when it has none. */
export function workingOf(versions: readonly AnyVersion[], fy: FiscalYear): WorkingVersion | null {
  for (const v of versions) if (v.state === 'working' && v.fiscalYear === fy) return v
  return null
}

/** The fiscal year's locked Budget; null when it has none (FY28 today). */
export function budgetOf(versions: readonly AnyVersion[], fy: FiscalYear): LockedVersion | null {
  for (const v of versions) if (isLocked(v) && v.kind === 'budget' && v.fiscalYear === fy) return v
  return null
}

/** The plan of record: the fiscal year's latest locked version (by lockedAt); null when it has none. */
export function planOfRecord(versions: readonly AnyVersion[], fy: FiscalYear): LockedVersion | null {
  let best: LockedVersion | null = null
  for (const v of versions) {
    if (!isLocked(v) || v.fiscalYear !== fy) continue
    if (best === null || v.lockedAt >= best.lockedAt) best = v
  }
  return best
}

/** What a lock hash covers. */
export interface LockHashInput {
  lines: PlanLineTable | readonly PlanLine[]
  assumptions: readonly AssumptionRow[]
  rates: FxTable
  proration: Proration
  engineVersion: string
}

const cents = (x: number): number => Math.round(x * 100)
const cmp = (a: string | number, b: string | number): number => (a < b ? -1 : a > b ? 1 : 0)

/** Lexicographic order of two equal-length tuples of strings and numbers. */
function cmpTuple(a: readonly (string | number)[], b: readonly (string | number)[]): number {
  for (let i = 0; i < a.length; i++) {
    const d = cmp(a[i], b[i])
    if (d !== 0) return d
  }
  return 0
}

/**
 * One line as the lock hash reads it, a compact tuple: positionId, month, holderId ('' for none),
 * status, basis, currency, heads, fte, active, rate, then local base, bonus, burden, benefits,
 * oneTime and vacancy and USD base, bonus, burden, benefits, oneTime, vacancy, equity and loaded, each
 * in integer cents.
 */
function lineTuple(l: PlanLine): (string | number)[] {
  return [
    l.positionId,
    l.month,
    l.holderId ?? '',
    l.status,
    l.basis,
    l.currency,
    l.heads,
    l.fte,
    l.active,
    l.rate,
    cents(l.local.base),
    cents(l.local.bonus),
    cents(l.local.burden),
    cents(l.local.benefits),
    cents(l.local.oneTime),
    cents(l.local.vacancy),
    cents(l.usd.base),
    cents(l.usd.bonus),
    cents(l.usd.burden),
    cents(l.usd.benefits),
    cents(l.usd.oneTime),
    cents(l.usd.vacancy),
    cents(l.usd.equity),
    cents(l.usd.loaded),
  ]
}

const isTable = (x: PlanLineTable | readonly PlanLine[]): x is PlanLineTable => !Array.isArray(x)

/**
 * 'sha256-<hex>' (src/lib/sha256.ts) over canonical JSON (src/plan/canonical.ts): lines sorted by
 * positionId, month and holderId with every amount in integer cents (Math.round(x × 100)), then the
 * assumptions sorted by table, org and key, the rates sorted by currency, set and month, the proration
 * and the engine version. Synchronous: the sample generator hashes its locks while it runs.
 *
 * Each line is a compact tuple (`lineTuple`), and lines tie-break on every remaining field, so the
 * hash depends on the lines' content and never on their input order; a table and the rows it was
 * built from hash the same. Versions are identities, not content: a line's versionId and an
 * assumption row's version are left out.
 */
export function lockHash(input: LockHashInput): string {
  const rows = isTable(input.lines) ? [...planLineRows(input.lines)] : input.lines
  const lines = rows.map(lineTuple).sort(cmpTuple)
  const assumptions = input.assumptions
    .map((r) => [r.table, r.org ?? '', r.key, r.value] as (string | number)[])
    .sort(cmpTuple)
  const rates = input.rates
    .map((r) => [r.currency, r.set, r.month, r.usdPerLocal] as (string | number)[])
    .sort(cmpTuple)
  const payload = {
    lines,
    assumptions,
    rates,
    proration: input.proration,
    engineVersion: input.engineVersion,
  }
  return `sha256-${sha256(canonicalJson(payload))}`
}

/** True when a locked version's stored hash still matches its content ("the hash still verifies"). */
export function verifyLock(version: LockedVersion): boolean {
  return (
    version.hash ===
    lockHash({
      lines: version.lines,
      assumptions: version.assumptions,
      rates: version.rates,
      proration: version.proration,
      engineVersion: version.engineVersion,
    })
  )
}

export interface LockInput {
  working: WorkingVersion
  /** The new version's ID. */
  versionId: string
  as: { kind: 'budget' | 'reforecast'; name: string }
  at: ISODateTime
  by: Actor
  lines: readonly PlanLine[]
  assumptions: readonly AssumptionRow[]
  rates: FxTable
  /** Reforecasts store their forecast; a Budget passes null. */
  forecast: ForecastTable | null
}

/** An assumption row naming another version: known keys only, never a spread of the input. */
const rowFor = (r: AssumptionRow, version: string): AssumptionRow => ({
  version,
  table: r.table,
  org: r.org ?? null,
  key: r.key,
  value: r.value,
})

const rateCopy = (r: FxRate): FxRate => ({
  currency: r.currency,
  set: r.set,
  month: r.month,
  usdPerLocal: r.usdPerLocal,
})

/**
 * The locked version a lock writes: Working's fiscal year, grid and proration, `parentId` = the
 * Working's ID, lines as a PlanLineTable, `ENGINE_VERSION` and `lockHash`. Working itself is not
 * changed. Refuses (throws) a 'budget' when the year already has a locked Budget.
 *
 * The stored lines carry the new version's ID, and the stored assumption rows name it (only the rows
 * that named the Working, by ID or name, are kept), so `assumptionLookup(locked.assumptions, locked)`
 * reads them. Also refuses a Working that is not in state 'working' and an ID already in use.
 */
export function lockedFrom(input: LockInput, existing: readonly AnyVersion[]): LockedVersion {
  const { working, versionId, as } = input
  if (working.state !== 'working') throw new Error(`${working.name} is not a Working version.`)
  if (existing.some((v) => v.versionId === versionId))
    throw new Error(`A version with ID ${versionId} exists.`)
  if (as.kind === 'budget' && budgetOf(existing, working.fiscalYear))
    throw new Error(`${working.fiscalYear} already has a locked Budget. Lock a reforecast instead.`)
  const lines = input.lines.map((l) => (l.versionId === versionId ? l : { ...l, versionId }))
  const assumptions = input.assumptions
    .filter((r) => [working.versionId, working.name, versionId].includes((r.version ?? '').trim()))
    .map((r) => rowFor(r, versionId))
  const rates = input.rates.map(rateCopy)
  const hash = lockHash({
    lines,
    assumptions,
    rates,
    proration: working.proration,
    engineVersion: ENGINE_VERSION,
  })
  return {
    versionId,
    name: as.name,
    kind: as.kind,
    fiscalYear: working.fiscalYear,
    grid: { from: working.grid.from, to: working.grid.to },
    proration: working.proration,
    state: 'locked',
    createdAt: input.at,
    lockedAt: input.at,
    lockedBy: input.by.personId,
    engineVersion: ENGINE_VERSION,
    parentId: working.versionId,
    hash,
    lines: toPlanLineTable(versionId, lines),
    assumptions,
    rates,
    forecast: input.forecast,
  }
}

export interface ReopenInput {
  versions: readonly AnyVersion[]
  /** The locked reforecast to reopen from. */
  reforecastId: string
  at: ISODateTime
  by: Actor
  /** The new Working's ID. */
  newVersionId: string
  /** The current Working's assumption rows and plan rates (those that differ are listed before the confirm). */
  workingAssumptions: readonly AssumptionRow[]
  workingRates: FxTable
}

export interface ReopenResult {
  /** Every version after the reopen: exactly one 'working' for the year, the old one 'retired'. */
  versions: AnyVersion[]
  retired: WorkingVersion
  created: WorkingVersion
  /** The new Working's assumption rows: the reforecast's, naming the new version. */
  assumptions: AssumptionRow[]
  rates: FxRate[]
  /** Working's rows that differ from the reforecast's and will be replaced (the confirm lists them). */
  replaced: { assumptions: AssumptionRow[]; rates: FxRate[] }
  /** The retire and the create. */
  audit: AuditDraft[]
}

const assumptionId = (r: AssumptionRow): string =>
  `${r.table}\u0000${(r.org ?? '').trim()}\u0000${r.key.trim()}`
const rateId = (r: FxRate): string => `${r.currency}\u0000${r.month}`

/**
 * "Reopen as new": retires the year's Working (named "<name> (replaced <d MMM yyyy>)", read only, no
 * hash) and creates a new Working (`parentId` = the reforecast) with the reforecast's assumptions,
 * plan FX rates and proration. Positions, requests and closes are shared plan state and do not change.
 * Budget and reforecast hashes are unchanged.
 *
 * The new Working keeps the retired one's name and takes the reforecast's grid. Its rates are the
 * reforecast's plan rates plus the current Working's actual and forecast rates (facts, not plan).
 * Refuses (throws) anything but a locked reforecast (Budget never unlocks), a year with no Working,
 * and an ID already in use.
 */
export function reopenAsNew(input: ReopenInput): ReopenResult {
  const rf = input.versions.find((v) => v.versionId === input.reforecastId)
  if (!rf || !isLocked(rf) || rf.kind !== 'reforecast')
    throw new Error('Only a locked reforecast can be reopened.')
  const working = workingOf(input.versions, rf.fiscalYear)
  if (!working) throw new Error(`${rf.fiscalYear} has no Working version to replace.`)
  if (input.versions.some((v) => v.versionId === input.newVersionId))
    throw new Error(`A version with ID ${input.newVersionId} exists.`)

  const retired: WorkingVersion = {
    ...working,
    state: 'retired',
    name: `${working.name} (replaced ${formatDate(dateOf(input.at))})`,
    hash: null,
  }
  const created: WorkingVersion = {
    versionId: input.newVersionId,
    name: working.name,
    kind: 'working',
    fiscalYear: rf.fiscalYear,
    grid: { from: rf.grid.from, to: rf.grid.to },
    proration: rf.proration,
    state: 'working',
    createdAt: input.at,
    lockedAt: null,
    lockedBy: null,
    engineVersion: ENGINE_VERSION,
    parentId: rf.versionId,
    hash: null,
  }

  const assumptions = rf.assumptions.map((r) => rowFor(r, input.newVersionId))
  const planRates = rf.rates.filter((r) => r.set === 'plan').map(rateCopy)
  const rates = [...planRates, ...input.workingRates.filter((r) => r.set !== 'plan').map(rateCopy)]

  const rfValues = new Map(rf.assumptions.map((r) => [assumptionId(r), r.value]))
  const ownRows = input.workingAssumptions.filter((r) =>
    [working.versionId, working.name].includes((r.version ?? '').trim()),
  )
  const replacedAssumptions = ownRows.filter((r) => rfValues.get(assumptionId(r)) !== r.value)
  const rfRates = new Map(planRates.map((r) => [rateId(r), r.usdPerLocal]))
  const replacedRates = input.workingRates.filter(
    (r) => r.set === 'plan' && rfRates.get(rateId(r)) !== r.usdPerLocal,
  )

  const draft = (id: string, old: unknown, next: unknown): AuditDraft => ({
    at: input.at,
    by: input.by.personId,
    byName: input.by.name,
    mode: input.by.mode,
    object: 'version',
    id,
    field: 'state',
    old,
    new: next,
    effectiveDate: null,
    comment: null,
    commentAudience: null,
  })

  return {
    versions: [...input.versions.map((v) => (v.versionId === working.versionId ? retired : v)), created],
    retired,
    created,
    assumptions,
    rates,
    replaced: { assumptions: replacedAssumptions, rates: replacedRates },
    audit: [draft(working.versionId, 'working', 'retired'), draft(input.newVersionId, null, 'working')],
  }
}
