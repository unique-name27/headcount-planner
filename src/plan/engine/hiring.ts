/**
 * Hiring progress (docs/PLAN.md 9.7, change C36): how much is left to hire by each quarter end of the
 * fiscal year shown, and how fast hires and exits move. Pure, heads only.
 *
 * The user's formula, per quarter end q of the fiscal year shown (FY27: Q1 Apr to Jun, Q2 Jul to Sep,
 * Q3 Oct to Dec, Q4 Jan to Mar), all heads, in scope, at the as-of date unless a quarter end is named:
 *
 *  - `A(q)` approved heads by the quarter end: approved seats (R1) whose first head day is on or
 *    before the quarter's end and that are still approved heads on it (`firstHeadDay`). For Q4 this is
 *    R1's approved heads less the seats an approved change (an Elimination, a Trade or a move out)
 *    ends before the fiscal year end (H2) and the seats whose accepted start falls after it (H22).
 *  - `H` current heads: active employees at the as-of date (on leave included, "Not in plan"
 *    included), split into people in approved seats and people not in plan.
 *  - `S(q)` accepted starts by the quarter end: accepted offers on approved seats, not started, whose
 *    start date is after the as-of date and on or before the quarter's end. Dates only.
 *  - `O(q) = A(q) − H − S(q)`, open to hire; negative is over plan. The seat view reconciles it:
 *    `O(q)` = open seats by the quarter end (not Filled, no accepted start counted in `S(q)`) − not
 *    in plan (when every Filled approved seat has one holder; `HiringHeads.elsewhere` says when not).
 *  - New to hire in the quarter `O(q) − O(q−1)` for the quarters ahead. The first one counts against
 *    open to hire on the day before it starts, which is `openNow` (approved heads at the as-of date
 *    less current heads) whenever that day is not after the as-of date; for a later fiscal year
 *    shown it is O on the prior year's last day, so a later year's Q1 holds only what comes due in it
 *    (`HiringTable.openBefore`).
 *  - `E(q)` expected exits by the quarter end: known exits (a last day after the as-of date, on or
 *    before the quarter's end) plus the forecast's modeled exits for the months ending in that span.
 *  - To hire to reach plan `O(q) + E(q)`; hires needed per month = that ÷ the months left to the
 *    quarter end (month-ends after the as-of date, up to and including the quarter's), against the
 *    3-month hiring pace.
 *
 * Velocity: hires (hire date in the month, into a seat in scope; internal moves are not hires) and
 * exits (last day in the month, from a seat in scope) for the trailing 12 closed months; paces over
 * the last 3 and 6 closed months; attrition = exits over the last 12 closed months ÷ the average of
 * the heads at those month-ends; months to close = `O(FY end)` ÷ the 3-month net pace when it is
 * above 0.
 *
 * Quarters ending on or before the last close's month-end are history (actual heads at the quarter
 * end, hires and exits); every other quarter is ahead (the formula above). Engines round nothing:
 * `E(q)` and the paces are exact here, and display rounds them to one decimal.
 *
 * **No amount reaches this engine.** Every input is a date, an ID or a head count: no pay, offer
 * amount, band estimate, cost or leave fact (`HIRING_INPUT_KEYS` lists every key, the type checker
 * holds the lists equal to the types, and src/views/hiring.contracts.test.ts scans them). The tab
 * model (src/views/plan/engine/hiringTab.ts `hiringInputOf`) builds the input from the context.
 *
 * Frozen in the hiring freeze (docs/CONTRACTS-HIRING.md): types and signatures. Built by the engine
 * owner (fixtures HG1 to HG6 in `hiring.fixtures.ts`, tests in `hiring.test.ts`), with these readings
 * where the plan left a choice (each is a convention, not a rounding):
 *
 *  - A quarter is history when it ends on or before the last close's month-end (H1), and also when it
 *    ends before the as-of date with a month still open (a quarter that is over: before the first
 *    close, or when the as-of date runs ahead of the closes). Its actual heads are the heads at its
 *    end when `headsAt` has that month, else null. Every other quarter is ahead.
 *  - A closed month is a month on or before the last close; the velocity's trailing months are the 12
 *    calendar months to it. Attrition needs heads at each of those 12 month-ends in `headsAt`.
 *  - A person is one head however many records name them (the first record in an approved seat sets
 *    the split; else not in plan; else elsewhere). An accepted offer is one start per req ID.
 *  - An accepted start after the fiscal year end keeps its seat out of every `A(q)` and its req out of
 *    every `S(q)`: the seat is spoken for, so it moves no `O(q)` (`A(Q4)` is then R1's approved heads
 *    less those seats).
 *  - Pace comparisons allow `PACE_EPSILON` for float residue in summed modeled exits.
 *  - O(FY end) and S(FY end) are 0 when the year's last quarter is history (the year is over).
 *  - A history quarter is `closed` only when it ends on or before the last close's month-end; one that
 *    is over with a month still open is history but not closed (labelled "ended", not "closed").
 *  - New to hire's first quarter ahead counts against O on the day before that quarter starts, or
 *    against open now when that day is on or before the as-of date (review HN-4).
 */
import { fyRange, monthEnd, monthKey, monthRange, monthStart, monthsOf, shiftMonth } from '@/data/fiscal'
import type { FiscalYear, ISODate, Month } from '@/data/schema'
import { addDays } from '@/lib/dates'

/* ───────────── inputs (heads, dates and IDs only) ───────────── */

/**
 * One approved seat in scope, from Working (R1: Filled, Open or Planned at the as-of date with a start
 * on or before the fiscal year end; On hold, Eliminated and seats an approved internal move holds,
 * SC-6, are left out before the engine sees them). Employee seats only.
 */
export interface HiringSeat {
  positionId: string
  /** An employee holds the seat at the as-of date. */
  filled: boolean
  /** The accepted offer's start date (req at Offer accepted, not started), else null. A date only. */
  acceptedStart: ISODate | null
  /** The seat's planned start, else its open req's target start; null when it has neither. */
  plannedStart: ISODate | null
  /**
   * The last day the seat is an approved head in Working (the day before an approved Elimination,
   * Trade or move out takes effect), or null when it stays one to the fiscal year end.
   */
  lastApprovedDay: ISODate | null
}

/** One employee active at the as-of date, in scope (current heads). */
export interface HiringPerson {
  personId: string
  /** The seat they hold at the as-of date; null for a person not in plan. */
  positionId: string | null
}

/** One accepted offer not started, on an approved seat in scope: its req, its seat and its start date only. */
export interface HiringOffer {
  reqId: string
  positionId: string
  startDate: ISODate
}

/**
 * A hire (on = the hire date, the seat the person was hired into) or an exit (on = the last day, the
 * seat they held on it), in scope. Internal moves and transfers are neither. Exits after the as-of
 * date are the known exits ahead.
 */
export interface HiringEvent {
  personId: string
  positionId: string | null
  on: ISODate
}

/** Heads in scope at a closed month-end (for attrition and the closed quarters' actual heads). */
export interface HiringHeadsAt {
  month: Month
  heads: number
}

/** One open month of the forecast to the fiscal year end, in heads only (no cost part). */
export interface HiringForecastMonth {
  month: Month
  /** Probability-weighted starts in the month (accepted offers count 1). */
  starts: number
  /** Every modeled exit in the month (both cohorts, 6.7). Known exits come from `HiringInput.exits`. */
  modeledExits: number
}

export interface HiringInput {
  asOf: ISODate
  /** The fiscal year shown: its four quarters are the table's columns. */
  fiscalYear: FiscalYear
  /** The last closed month, or null before the first close. */
  lastClose: Month | null
  seats: readonly HiringSeat[]
  people: readonly HiringPerson[]
  offers: readonly HiringOffer[]
  hires: readonly HiringEvent[]
  exits: readonly HiringEvent[]
  headsAt: readonly HiringHeadsAt[]
  forecast: readonly HiringForecastMonth[]
}

/**
 * Every key of every input record, so a test can see that none names an amount, a rate or a leave
 * fact. `HIRING_INPUT_KEYS_EXACT` makes the type checker hold each list equal to its type's keys.
 */
export const HIRING_INPUT_KEYS = {
  input: [
    'asOf',
    'fiscalYear',
    'lastClose',
    'seats',
    'people',
    'offers',
    'hires',
    'exits',
    'headsAt',
    'forecast',
  ],
  seat: ['positionId', 'filled', 'acceptedStart', 'plannedStart', 'lastApprovedDay'],
  person: ['personId', 'positionId'],
  offer: ['reqId', 'positionId', 'startDate'],
  event: ['personId', 'positionId', 'on'],
  headsAt: ['month', 'heads'],
  forecast: ['month', 'starts', 'modeledExits'],
} as const

type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Keys<K extends keyof typeof HIRING_INPUT_KEYS> = (typeof HIRING_INPUT_KEYS)[K][number]

/** Compile-time check: each key list is exactly its input type's keys. */
export const HIRING_INPUT_KEYS_EXACT: {
  input: Exactly<keyof HiringInput, Keys<'input'>>
  seat: Exactly<keyof HiringSeat, Keys<'seat'>>
  person: Exactly<keyof HiringPerson, Keys<'person'>>
  offer: Exactly<keyof HiringOffer, Keys<'offer'>>
  event: Exactly<keyof HiringEvent, Keys<'event'>>
  headsAt: Exactly<keyof HiringHeadsAt, Keys<'headsAt'>>
  forecast: Exactly<keyof HiringForecastMonth, Keys<'forecast'>>
} = { input: true, seat: true, person: true, offer: true, event: true, headsAt: true, forecast: true }

/* ───────────── constants ───────────── */

/** The two pace windows, in closed months (9.7: "the last 3 closed months and the last 6"). */
export const PACE_MONTHS = [3, 6] as const
/** The trailing window of the velocity chart and of attrition, in closed months. */
export const TRAILING_MONTHS = 12
/**
 * The tolerance of the pace comparisons: a to reach plan at or under it is nothing to hire, and a
 * 3-month pace within it of the needed pace is on pace. Summed modeled exits carry float residue
 * (0.1 + 0.2 is not 0.3); nothing is rounded. An addition to the contract.
 */
export const PACE_EPSILON = 1e-9

/* ───────────── outputs ───────────── */

export type QuarterNo = 1 | 2 | 3 | 4

/** A quarter of the fiscal year shown, and whether it is history or ahead. */
export interface HiringQuarterFrame {
  quarter: QuarterNo
  /** "Q1". */
  label: string
  start: ISODate
  end: ISODate
  /** History: it ends on or before the last close's month-end, or before the as-of date. Ahead: every other quarter. */
  kind: 'history' | 'ahead'
  /**
   * History closed by a close (it ends on or before the last close's month-end); false for a history
   * quarter that is over with a month not closed yet, and for every quarter ahead. An addition to the
   * contract (review HN-8, HU-3).
   */
  closed?: boolean
}

/** Current heads at the as-of date, with their split. */
export interface HiringHeads {
  total: number
  /** People holding an approved seat. */
  inApprovedSeats: number
  /** People with no seat. */
  notInPlan: number
  /** People in a seat that is not an approved head (counted in `total`, in neither part). */
  elsewhere: number
  /** Every person counted, for the drill (`total` = its length). */
  personIds: readonly string[]
  notInPlanIds: readonly string[]
}

/** Expected exits from the as-of date to a quarter end. */
export interface ExpectedExits {
  /** Last days already in the HRIS. */
  known: number
  knownIds: readonly string[]
  /** The forecast's modeled exits (exact; display rounds to one decimal). */
  modeled: number
  /** known + modeled. */
  total: number
}

/** Hires needed a month against the 3-month hiring pace. */
export type PaceStatus = 'on-pace' | 'behind' | 'nothing-to-hire'

/**
 * The seat view's reconciliation of a quarter ahead (9.7: "O(q) = open seats − not in plan"), with
 * every term that can move it, so a card's last step always equals `open`:
 * `open = openSeats − notInPlan − elsewhere − inEndedSeats − otherStarts + rest`. On clean data
 * (every Filled seat one holder, no person on a seat that is not an approved head, every accepted
 * start on an open seat of the quarter) only the first two are non-zero. An addition to the contract.
 */
export interface HiringSeatView {
  /** `HiringQuarter.openSeats`. */
  openSeats: number
  /** People with no seat, who count against approved heads. */
  notInPlan: number
  /** People in a seat that is not an approved head (`HiringHeads.elsewhere`; an internal move's held seat, SC-6). */
  elsewhere: number
  /** People in an approved seat that is out of `A(q)`: it stops being an approved head before the quarter end (an approved Elimination, Trade or move out). */
  inEndedSeats: number
  inEndedSeatIds: readonly string[]
  /** Accepted starts in `S(q)` on a seat that is not one of the quarter's unfilled seats in `A(q)`. */
  otherStarts: number
  otherStartIds: readonly string[]
  /** What is left: a Filled seat in `A(q)` with no holder counted, or a second holder or offer on one seat. */
  rest: number
}

/** One quarter's column of the table. History fields are null ahead, and ahead fields null in history. */
export interface HiringQuarter extends HiringQuarterFrame {
  /* history */
  /** Actual heads at the quarter end. */
  actualHeads: number | null
  hires: number | null
  hireIds: readonly string[]
  exits: number | null
  exitIds: readonly string[]
  /* ahead */
  /** A(q). */
  approved: number | null
  approvedIds: readonly string[]
  /** S(q), by req ID. */
  accepted: number | null
  acceptedIds: readonly string[]
  /** O(q) = A(q) − H − S(q); negative is over plan. */
  open: number | null
  /** The seat view: approved seats by the quarter end, not Filled and with no accepted start in S(q). */
  openSeats: number | null
  openSeatIds: readonly string[]
  /** O(q) − O(q−1), the first quarter ahead against `HiringTable.openNow`. */
  newToHire: number | null
  expectedExits: ExpectedExits | null
  /** O(q) + E(q). */
  toReachPlan: number | null
  /** Month-ends after the as-of date, up to and including the quarter end. */
  monthsLeft: number | null
  /** toReachPlan ÷ monthsLeft; null when no month is left. */
  neededPace: number | null
  paceStatus: PaceStatus | null
  /** neededPace − the 3-month hiring pace, when behind. */
  behindBy: number | null
  /** The seat view's reconciliation (quarters ahead; null in history). An addition to the contract. */
  seatView?: HiringSeatView | null
}

export interface HiringTable {
  fiscalYear: FiscalYear
  asOf: ISODate
  /** H, the same in every quarter ahead. */
  heads: HiringHeads
  /** Approved heads at the as-of date less current heads. */
  openNow: number
  /**
   * What new to hire counts the first quarter ahead against: open to hire on the day before that
   * quarter starts (`on`), or `openNow` on the as-of date when that day is not after it. Null with no
   * quarter ahead. An addition to the contract (review HN-4).
   */
  openBefore?: { on: ISODate; open: number } | null
  /** Q1 to Q4. */
  quarters: readonly HiringQuarter[]
  /** O(FY end): the headline `plan.hiring.open`. */
  openFyEnd: number
  /** S(FY end): `plan.hiring.acceptedStarts`'s key figure. */
  acceptedToCome: number
}

/** One month of the velocity chart: a closed month's actual hires and exits, or a forecast month's starts and expected exits. */
export interface HiringMonth {
  month: Month
  kind: 'actual' | 'forecast'
  /** Actual hires, or the forecast's expected starts. */
  hires: number
  /** Actual exits, or known + modeled exits expected in the month. */
  exits: number
  /** hires − exits. */
  net: number
  /** The people counted (actual months; known exits in forecast months). */
  hireIds: readonly string[]
  exitIds: readonly string[]
}

/** Paces per month, and attrition in heads. Null where fewer closed months exist than the window needs. */
export interface HiringPaces {
  hires3: number | null
  hires6: number | null
  exits3: number | null
  exits6: number | null
  /** hires3 − exits3: the key figure `plan.hiring.netPace`. */
  net3: number | null
  net6: number | null
  /** Exits over the last 12 closed months. */
  exits12: number | null
  /** The average of the heads at those 12 month-ends. */
  averageHeads12: number | null
  /** exits12 ÷ averageHeads12, a fraction; null when either is missing or the average is 0. */
  attrition: number | null
}

export interface HiringVelocity {
  /** The trailing 12 closed months (oldest first), then the forecast months to the fiscal year end. */
  months: readonly HiringMonth[]
  paces: HiringPaces
}

/** Months to close at this pace: a number while the net pace is above 0, else not closing. */
export type MonthsToClose = { closing: true; months: number } | { closing: false; months: null }

export interface HiringResult {
  table: HiringTable
  velocity: HiringVelocity
  monthsToClose: MonthsToClose
}

/* ───────────── the engine ───────────── */

/** Month order, for sorting copies (never the input). */
const byMonth = <T extends { month: Month }>(a: T, b: T): number =>
  a.month < b.month ? -1 : a.month > b.month ? 1 : 0

/** Event IDs by the month of their date, in input order. */
function eventsByMonth(events: readonly HiringEvent[]): Map<Month, string[]> {
  const out = new Map<Month, string[]>()
  for (const e of events) {
    const m = monthKey(e.on)
    const list = out.get(m)
    if (list) list.push(e.personId)
    else out.set(m, [e.personId])
  }
  return out
}

/** The people of the events dated from `from` to `to`, both included, in input order. */
function eventsIn(events: readonly HiringEvent[], from: ISODate, to: ISODate): string[] {
  const out: string[] = []
  for (const e of events) if (e.on >= from && e.on <= to) out.push(e.personId)
  return out
}

/**
 * The four quarters of a fiscal year, each history or ahead: history when it ends on or before the
 * last close's month-end (H1), or when it ends before the as-of date (a quarter that is over, with a
 * month not closed yet); ahead otherwise. At 30 Sep 2026 with September closed, FY27's Q1 and Q2 are
 * history; with August the last close, Q2 holds the as-of date and is ahead.
 */
export function hiringQuarters(
  fiscalYear: FiscalYear,
  asOf: ISODate,
  lastClose: Month | null,
): HiringQuarterFrame[] {
  const months = monthsOf(fiscalYear)
  const closedTo = lastClose == null ? null : monthEnd(lastClose)
  const out: HiringQuarterFrame[] = []
  for (let i = 0; i < 4; i++) {
    const quarter = (i + 1) as QuarterNo
    const start = monthStart(months[i * 3])
    const end = monthEnd(months[i * 3 + 2])
    const closed = closedTo != null && end <= closedTo
    out.push({
      quarter,
      label: `Q${quarter}`,
      start,
      end,
      kind: closed || end < asOf ? 'history' : 'ahead',
      closed,
    })
  }
  return out
}

/**
 * A seat's first head day: the as-of date when Filled, else the accepted offer's start, else its
 * planned or target start, else the as-of date (an approved seat with no date is open to hire now).
 */
export function firstHeadDay(seat: HiringSeat, asOf: ISODate): ISODate {
  if (seat.filled) return asOf
  return seat.acceptedStart ?? seat.plannedStart ?? asOf
}

/** Whether a seat counts in A(q) at `end`: its first head day is on or before it, and it is still an approved head on it (the last day counts). */
const approvedOn = (seat: HiringSeat, asOf: ISODate, end: ISODate): boolean =>
  firstHeadDay(seat, asOf) <= end && (seat.lastApprovedDay == null || seat.lastApprovedDay >= end)

/** A(q)'s seats: first head day on or before `end` and still an approved head on it. */
export function approvedBy(seats: readonly HiringSeat[], asOf: ISODate, end: ISODate): string[] {
  const out: string[] = []
  for (const s of seats) if (approvedOn(s, asOf, end)) out.push(s.positionId)
  return out
}

/** Where a person counts: 0 in an approved seat, 1 not in plan, 2 elsewhere (a seat that is not an approved head). */
type Place = 0 | 1 | 2

/** A person's place, and the approved seat that puts them there (place 0). */
interface Placed {
  place: Place
  seat: string | null
}

/** Each person once, in first-seen order, at the best place any of their records gives (the first record wins a tie). */
function placesOf(people: readonly HiringPerson[], seatIds: ReadonlySet<string>): Map<string, Placed> {
  const out = new Map<string, Placed>()
  for (const p of people) {
    const place: Place = p.positionId == null ? 1 : seatIds.has(p.positionId) ? 0 : 2
    const seen = out.get(p.personId)
    if (seen === undefined || place < seen.place)
      out.set(p.personId, { place, seat: place === 0 ? p.positionId : null })
  }
  return out
}

/** H with its split, against the approved seats. A person counts once, whatever records name them. */
export function currentHeads(people: readonly HiringPerson[], seats: readonly HiringSeat[]): HiringHeads {
  return headsOf(placesOf(people, new Set(seats.map((s) => s.positionId))))
}

/** H from the people's places. */
function headsOf(places: ReadonlyMap<string, Placed>): HiringHeads {
  const personIds: string[] = []
  const notInPlanIds: string[] = []
  let inApprovedSeats = 0
  let elsewhere = 0
  for (const [id, { place }] of places) {
    personIds.push(id)
    if (place === 0) inApprovedSeats++
    else if (place === 1) notInPlanIds.push(id)
    else elsewhere++
  }
  return {
    total: personIds.length,
    inApprovedSeats,
    notInPlan: notInPlanIds.length,
    elsewhere,
    personIds,
    notInPlanIds,
  }
}

/** Whether an accepted start counts in S(q): after the as-of date (one on it has started) and on or before `end`. */
const startsIn = (o: HiringOffer, asOf: ISODate, end: ISODate): boolean =>
  o.startDate > asOf && o.startDate <= end

/** S(q)'s req IDs: start date after `asOf` and on or before `end`, one per req. */
export function acceptedBy(offers: readonly HiringOffer[], asOf: ISODate, end: ISODate): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const o of offers)
    if (startsIn(o, asOf, end) && !seen.has(o.reqId)) {
      seen.add(o.reqId)
      out.push(o.reqId)
    }
  return out
}

/** The seat view's seats by `end`: in A(q), not Filled, with no accepted start counted in S(q). */
export function openSeatsBy(
  seats: readonly HiringSeat[],
  offers: readonly HiringOffer[],
  asOf: ISODate,
  end: ISODate,
): string[] {
  const starting = new Set<string>()
  for (const o of offers) if (startsIn(o, asOf, end)) starting.add(o.positionId)
  const out: string[] = []
  for (const s of seats)
    if (!s.filled && approvedOn(s, asOf, end) && !starting.has(s.positionId)) out.push(s.positionId)
  return out
}

/**
 * E(q): known exits in (asOf, end] plus the forecast's modeled exits of the months whose month-end
 * falls in (asOf, end] (H5). Exact: summed in month order, never rounded.
 */
export function expectedExits(
  exits: readonly HiringEvent[],
  forecast: readonly HiringForecastMonth[],
  asOf: ISODate,
  end: ISODate,
): ExpectedExits {
  const knownIds: string[] = []
  for (const e of exits) if (e.on > asOf && e.on <= end) knownIds.push(e.personId)
  let modeled = 0
  for (const f of [...forecast].sort(byMonth)) {
    const me = monthEnd(f.month)
    if (me > asOf && me <= end) modeled += f.modeledExits
  }
  return { known: knownIds.length, knownIds, modeled, total: knownIds.length + modeled }
}

/** Month-ends after `asOf`, up to and including `end` (0 when `end` is not after `asOf`). */
export function monthsLeft(asOf: ISODate, end: ISODate): number {
  if (end <= asOf) return 0
  let m = monthKey(asOf)
  if (monthEnd(m) <= asOf) m = shiftMonth(m, 1)
  let n = 0
  for (; monthEnd(m) <= end; m = shiftMonth(m, 1)) n++
  return n
}

/** toReachPlan ÷ months; null when no month is left. */
export function neededPace(toReachPlan: number, months: number): number | null {
  return months > 0 ? toReachPlan / months : null
}

/**
 * H7: to reach plan of 0 or less is nothing to hire; else on pace when the 3-month hiring pace is at
 * least the needed pace, else behind by the difference. With no month left or no closed month to
 * pace by, there is no status.
 */
export function paceStatus(
  toReachPlan: number,
  needed: number | null,
  pace3: number | null,
): { status: PaceStatus | null; behindBy: number | null } {
  if (!(toReachPlan > PACE_EPSILON)) return { status: 'nothing-to-hire', behindBy: null }
  if (needed == null || pace3 == null) return { status: null, behindBy: null }
  if (pace3 >= needed - PACE_EPSILON) return { status: 'on-pace', behindBy: null }
  return { status: 'behind', behindBy: needed - pace3 }
}

/** A column with every field of the other kind empty. */
function blankQuarter(frame: HiringQuarterFrame): HiringQuarter {
  return {
    ...frame,
    actualHeads: null,
    hires: null,
    hireIds: [],
    exits: null,
    exitIds: [],
    approved: null,
    approvedIds: [],
    accepted: null,
    acceptedIds: [],
    open: null,
    openSeats: null,
    openSeatIds: [],
    newToHire: null,
    expectedExits: null,
    toReachPlan: null,
    monthsLeft: null,
    neededPace: null,
    paceStatus: null,
    behindBy: null,
    seatView: null,
  }
}

/** The seat view's terms for a quarter ahead (`HiringSeatView`). */
function seatViewOf(
  input: HiringInput,
  places: ReadonlyMap<string, Placed>,
  heads: HiringHeads,
  approvedIds: readonly string[],
  acceptedReqs: readonly string[],
  openSeatIds: readonly string[],
  open: number,
): HiringSeatView {
  const inA = new Set(approvedIds)
  const inEndedSeatIds: string[] = []
  for (const [id, { place, seat }] of places)
    if (place === 0 && seat != null && !inA.has(seat)) inEndedSeatIds.push(id)
  const unfilledInA = new Set<string>()
  for (const s of input.seats) if (!s.filled && inA.has(s.positionId)) unfilledInA.add(s.positionId)
  // Each req of S(q) once, read from its first offer (`delete` is true only the first time).
  const reqs = new Set(acceptedReqs)
  const otherStartIds: string[] = []
  for (const o of input.offers)
    if (reqs.delete(o.reqId) && !unfilledInA.has(o.positionId)) otherStartIds.push(o.reqId)
  const openSeats = openSeatIds.length
  const explained =
    openSeats - heads.notInPlan - heads.elsewhere - inEndedSeatIds.length - otherStartIds.length
  return {
    openSeats,
    notInPlan: heads.notInPlan,
    elsewhere: heads.elsewhere,
    inEndedSeats: inEndedSeatIds.length,
    inEndedSeatIds,
    otherStarts: otherStartIds.length,
    otherStartIds,
    rest: open - explained,
  }
}

/**
 * The quarter table: H, open now, each quarter's column, O(FY end) and S(FY end). History columns
 * carry the heads at the quarter end (when `headsAt` has that month) and the quarter's hires and
 * exits; columns ahead carry 9.7's rows, new to hire counting the first one against `openNow` (H4),
 * and the needed pace against `pace3`.
 */
export function hiringTable(input: HiringInput, pace3: number | null): HiringTable {
  const { asOf, seats, offers } = input
  const frames = hiringQuarters(input.fiscalYear, asOf, input.lastClose)
  const places = placesOf(input.people, new Set(seats.map((s) => s.positionId)))
  const heads = headsOf(places)
  const openNow = approvedBy(seats, asOf, asOf).length - heads.total
  const headsAt = new Map<Month, number>()
  for (const h of input.headsAt) if (!headsAt.has(h.month)) headsAt.set(h.month, h.heads)

  // The first quarter ahead counts against O on the day before it starts (open now while that day
  // is not after the as-of date): a later year's Q1 holds only what comes due in it (HN-4).
  const firstAhead = frames.find((f) => f.kind === 'ahead') ?? null
  let openBefore: { on: ISODate; open: number } | null = null
  if (firstAhead) {
    const dayBefore = addDays(firstAhead.start, -1)
    openBefore =
      dayBefore > asOf
        ? {
            on: dayBefore,
            open:
              approvedBy(seats, asOf, dayBefore).length -
              heads.total -
              acceptedBy(offers, asOf, dayBefore).length,
          }
        : { on: asOf, open: openNow }
  }
  let before = openBefore?.open ?? openNow
  const quarters = frames.map((frame): HiringQuarter => {
    const q = blankQuarter(frame)
    if (frame.kind === 'history') {
      const hireIds = eventsIn(input.hires, frame.start, frame.end)
      const exitIds = eventsIn(input.exits, frame.start, frame.end)
      return {
        ...q,
        actualHeads: headsAt.get(monthKey(frame.end)) ?? null,
        hires: hireIds.length,
        hireIds,
        exits: exitIds.length,
        exitIds,
      }
    }
    const approvedIds = approvedBy(seats, asOf, frame.end)
    const acceptedIds = acceptedBy(offers, asOf, frame.end)
    const open = approvedIds.length - heads.total - acceptedIds.length
    const openSeatIds = openSeatsBy(seats, offers, asOf, frame.end)
    const exits = expectedExits(input.exits, input.forecast, asOf, frame.end)
    const toReachPlan = open + exits.total
    const months = monthsLeft(asOf, frame.end)
    const needed = neededPace(toReachPlan, months)
    const pace = paceStatus(toReachPlan, needed, pace3)
    const newToHire = open - before
    before = open
    return {
      ...q,
      approved: approvedIds.length,
      approvedIds,
      accepted: acceptedIds.length,
      acceptedIds,
      open,
      openSeats: openSeatIds.length,
      openSeatIds,
      newToHire,
      expectedExits: exits,
      toReachPlan,
      monthsLeft: months,
      neededPace: needed,
      paceStatus: pace.status,
      behindBy: pace.behindBy,
      seatView: seatViewOf(input, places, heads, approvedIds, acceptedIds, openSeatIds, open),
    }
  })
  const last = quarters[quarters.length - 1]
  return {
    fiscalYear: input.fiscalYear,
    asOf,
    heads,
    openNow,
    openBefore,
    quarters,
    openFyEnd: last.kind === 'ahead' ? (last.open ?? 0) : 0,
    acceptedToCome: last.kind === 'ahead' ? (last.accepted ?? 0) : 0,
  }
}

/** The last `n` closed months, oldest first (empty before the first close). */
export function closedMonths(lastClose: Month | null, n: number): Month[] {
  if (lastClose == null || !(n >= 1)) return []
  return monthRange(shiftMonth(lastClose, -(Math.floor(n) - 1)), lastClose)
}

/**
 * The velocity months: the trailing 12 closed months (actual hires and exits, by the month of the
 * hire date and the last day), then the forecast's open months after the last close to the fiscal
 * year end (H15: its expected starts as hires; the known exits in the month plus its modeled exits as
 * exits).
 */
export function hiringMonths(input: HiringInput): HiringMonth[] {
  const hires = eventsByMonth(input.hires)
  const exits = eventsByMonth(input.exits)
  const out: HiringMonth[] = []
  for (const month of closedMonths(input.lastClose, TRAILING_MONTHS)) {
    const hireIds = hires.get(month) ?? []
    const exitIds = exits.get(month) ?? []
    out.push({
      month,
      kind: 'actual',
      hires: hireIds.length,
      exits: exitIds.length,
      net: hireIds.length - exitIds.length,
      hireIds,
      exitIds,
    })
  }
  const lastMonth = monthKey(fyRange(input.fiscalYear).end)
  const seen = new Set<Month>()
  for (const f of [...input.forecast].sort(byMonth)) {
    if ((input.lastClose != null && f.month <= input.lastClose) || f.month > lastMonth) continue
    if (seen.has(f.month)) continue
    seen.add(f.month)
    const exitIds = exits.get(f.month) ?? []
    const expected = exitIds.length + f.modeledExits
    out.push({
      month: f.month,
      kind: 'forecast',
      hires: f.starts,
      exits: expected,
      net: f.starts - expected,
      hireIds: [],
      exitIds,
    })
  }
  return out
}

/** The average of the last `n` values, or null when fewer than `n` exist. */
export function perMonth(counts: readonly number[], n: number): number | null {
  if (!(n >= 1) || counts.length < n) return null
  let sum = 0
  for (let i = counts.length - n; i < counts.length; i++) sum += counts[i]
  return sum / n
}

/** Exits over the window ÷ the average heads at its month-ends; null when the average is 0 or missing. */
export function attritionRate(exits: number, headsAt: readonly HiringHeadsAt[]): number | null {
  if (headsAt.length === 0) return null
  let sum = 0
  for (const h of headsAt) sum += h.heads
  const average = sum / headsAt.length
  return average > 0 ? exits / average : null
}

/**
 * The paces and attrition from the closed (actual) months (H8): each pace needs its 3 or 6 closed
 * months, attrition the 12 with heads at each of their month-ends.
 */
export function hiringPaces(months: readonly HiringMonth[], headsAt: readonly HiringHeadsAt[]): HiringPaces {
  const actual = months.filter((m) => m.kind === 'actual')
  const hires = actual.map((m) => m.hires)
  const exits = actual.map((m) => m.exits)
  const [short, long] = PACE_MONTHS
  const hires3 = perMonth(hires, short)
  const hires6 = perMonth(hires, long)
  const exits3 = perMonth(exits, short)
  const exits6 = perMonth(exits, long)
  let exits12: number | null = null
  let window: HiringHeadsAt[] | null = null
  if (actual.length >= TRAILING_MONTHS) {
    const last = actual.slice(-TRAILING_MONTHS)
    exits12 = 0
    for (const m of last) exits12 += m.exits
    const at = new Map<Month, number>()
    for (const h of headsAt) if (!at.has(h.month)) at.set(h.month, h.heads)
    window = []
    for (const m of last) {
      const heads = at.get(m.month)
      if (heads === undefined) {
        window = null
        break
      }
      window.push({ month: m.month, heads })
    }
  }
  let averageHeads12: number | null = null
  if (window) {
    let sum = 0
    for (const h of window) sum += h.heads
    averageHeads12 = sum / window.length
  }
  return {
    hires3,
    hires6,
    exits3,
    exits6,
    net3: hires3 != null && exits3 != null ? hires3 - exits3 : null,
    net6: hires6 != null && exits6 != null ? hires6 - exits6 : null,
    exits12,
    averageHeads12,
    attrition: exits12 != null && window ? attritionRate(exits12, window) : null,
  }
}

/** The velocity series and its paces. */
export function hiringVelocity(input: HiringInput): HiringVelocity {
  const months = hiringMonths(input)
  return { months, paces: hiringPaces(months, input.headsAt) }
}

/** O(FY end) ÷ the net pace while it is above 0 (0 when nothing is open to hire); else not closing (H9). */
export function monthsToClose(openFyEnd: number, netPace: number | null): MonthsToClose {
  if (openFyEnd <= 0) return { closing: true, months: 0 }
  if (netPace == null || !(netPace > 0)) return { closing: false, months: null }
  return { closing: true, months: openFyEnd / netPace }
}

/** Everything Plan > Hiring shows: the table, the velocity and the months to close. */
export function hiringOf(input: HiringInput): HiringResult {
  const velocity = hiringVelocity(input)
  const table = hiringTable(input, velocity.paces.hires3)
  return { table, velocity, monthsToClose: monthsToClose(table.openFyEnd, velocity.paces.net3) }
}
