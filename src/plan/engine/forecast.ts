/**
 * Forecast (docs/PLAN.md 6.7, changes C13 and C22): closed actuals plus a month-by-month projection
 * to the end of the grid. Built by engines B in M1. Pure: every date, rate and driver is an input.
 *
 * 1. Starts, each with probability = fill rate (the rest is "Unfilled at horizon"): an Open seat at
 *    max(target start, as-of + max(0, time to fill − days since `openedOn`)); a Planned seat at
 *    max(planned start, as-of + time to fill); On hold never; accepted offers certain on
 *    `reqs.startDate`. An exit leaves the seat Open from the day after the last day (6.5); with no req
 *    it is flagged "no req" in Openings. A freeze holds an unstarted opening (no start while frozen)
 *    but honors accepted offers.
 * 2. Exits by cohort, monthly rate = 1 − (1 − annual)^(1/12). The HRIS cohort (people in Filled seats
 *    at the as-of date plus accepted offers from their start) exits max(0, heads at the month's start ×
 *    rate − known exits that month). The band cohort (probability-weighted starts and modeled
 *    backfills) faces attrition from the month after each start, with no known exits. A named exit is
 *    never predicted.
 * 3. Backfills: modeled exits × backfill % (0 under a freeze), after the lag in months, reopening the
 *    same position (never an Eliminated one).
 * 4. Cost, in two parts the guard keeps apart: the filled part (Filled at HRIS pay, accepted offers at
 *    offer, HRIS-cohort modeled exits at the unit's average HRIS cost per head, the company's when the
 *    unit has under 5 costed people; never a department's) and the band part (starts and backfills at
 *    midpoint, band-cohort modeled exits at each seat's band estimate). No input the HRBP or Leader
 *    can change reaches the filled part.
 *
 * Drivers (assumption tables, org fallback by the seat's unit and department): timeToFill[level],
 * fillRate, attrition, backfillRate, backfillLag. Rates: actual for closed months, forecast for open.
 *
 * How the engine reads the plan where it leaves a choice (each is a documented convention, not a
 * rounding; engines round nothing):
 *  - Actual months are the grid months up to the later of the as-of month and the last close: a
 *    month with a close is read from it, any other is HRIS actuals computed now (close.ts
 *    `actualLines`). The projection starts the month after. The forecast is position-based: employees
 *    not in the plan (a reconciliation exception) are left out of its months and lines.
 *  - One-time items in actual months come with the actuals (15.2 C32, lead decision D-CLOSE): each
 *    close snapshots the one-time items booked in its month (sign-on and relocation in the start
 *    month, the agency fee in the offer-accepted month, severance in the month of endDate + 1 day,
 *    6.3) at the month's actual rate, and an actual month with no close reads them from close.ts
 *    `actualLines` computed now, the same way. So each item lands once, in its 6.3 month, whether the
 *    month is closed or open, in the filled part, and the actual months compare with the
 *    comparison's lines on a like basis. The forecast carries no vacancy allowance (C31).
 *  - Cohorts are kept per org at the drivers' finest level (unit and department), because attrition,
 *    backfill % and lag are set there; `max(0, ·)` applies per org. Each org's modeled exits are
 *    shared among its present members by their expected presence, never to a member whose known exit
 *    falls in that month, and a known exit removes the member's expected presence. A start in a month
 *    (any day) joins its cohort's heads at the start of the next month.
 *  - Modeled exits and backfills happen mid-month: an exit keeps half its month's cost and FTE, a
 *    backfill pays half its first month. A backfill starts `lag` whole months after its exits (the lag
 *    is rounded to whole months) on the seat the exits came from, unless that seat is Eliminated or On
 *    hold then, or a freeze covers it then without allowing backfills (suppressed, and reported by
 *    freeze for freeze savings).
 *  - The unit's average HRIS cost per head is, for each month, Σ the unit's HRIS lines' recurring USD
 *    (base, bonus, burden, benefits and equity, no one-time) ÷ Σ their active fractions, from the
 *    seat lines cost.ts computes. A modeled exit lowers its member's month by that average × the
 *    member's active fraction, until the member's own last day. A unit with fewer costed people than
 *    the locked minimum (`minCosted`, from `cost.guard.minCosted`, lead decision D-MIN) uses the
 *    company's average.
 *  - An opening is a seat's first day from the as-of date that is Open or Planned (derived status,
 *    versions.ts `seatOn`): at the as-of date, from a later row, or the day after a holder's last day.
 *    A seat with a later Employee assignment (a pre-hire in HRIS) or an accepted offer fills from that
 *    instead, certain. One opening a seat is forecast within the grid. An opening whose start falls on
 *    or before the as-of date's month starts at the projection's first month.
 *  - Seat lines: HRIS and offer segments are cost.ts `positionLines` as they are, read with every
 *    known assignment, so a pre-hire in HRIS is costed at its HRIS pay from its start, in the filled
 *    part (lead decision D-PREHIRE). A seat costed at band with no opening line keeps its band line:
 *    a holder with no comp row, an accepted offer with no offerBase (their lines carry the holder or
 *    req ID). A band run of an Open or Planned seat is replaced by its opening: a band line from its
 *    forecast start (base = midpoint × FTE plus loads, at the month's fiscal year's band), scaled by
 *    its probability (`heads`, `active` and every amount are expected values).
 *  - An approved Elimination ends its seat's holder on the last day (15.1 R34): every assignment is
 *    read clipped there (versions.ts `clipAtElimination`), so the holder leaves the HRIS cohort as a
 *    known exit and the seat costs nothing after it.
 *  - Cohort lines (`CohortLine`, positionId ''), two a unit, currency and month: 'hris' (HRIS-cohort
 *    modeled exits, negative, basis 'hris') and 'band' (backfills less band-cohort exits, basis
 *    'band'). Their `heads` and `fte` are the expected change at month-end and over the month, and
 *    `active` is 1. `forecastDetail` also gives each seat's flows (`seatCohorts`) and each seat's own
 *    part of every cohort line, every field (`cohortParts`, an M2 integration addition), so a view
 *    can read the lines by seat without mixing one seat's loads into another's.
 */
import { fiscalYearOf, monthEnd, monthKey, monthRange, monthStart, monthsOf, shiftMonth } from '@/data/fiscal'
import type {
  AssumptionRow,
  CompRow,
  FiscalYear,
  FreezeRow,
  ISODate,
  Month,
  PositionRow,
  ReqRow,
  WorkerRow,
} from '@/data/schema'
import { siteByLocation } from '@/data/schema'
import { addDays, daysBetween } from '@/lib/dates'
import type {
  ActualLine,
  Adjustment,
  Assignment,
  ForecastMonth,
  ForecastTable,
  FxTable,
  HcRequest,
  LocalAmounts,
  MonthClose,
  PlanLine,
  SeatPlace,
  UsdAmounts,
  Version,
} from '../types'
import { assumptionLookup, type OrgPath } from './assumptions'
import { loadsOf } from './band'
import { actualLines, closedThrough } from './close'
import { annualLocal, type LineContext, lineContext, positionLines } from './cost'
import { freezeCovers, freezeExemptions } from './freeze'
import { toAssignments } from './heads'
import { actualLineRows } from './lineTable'
import { activeFraction } from './proration'
import {
  clipAtElimination,
  ENGINE_VERSION,
  rowOn,
  type SeatHistory,
  seatHistories,
  seatOn,
  toPosition,
} from './versions'

/**
 * The last month read as actual (docs/PLAN.md 15.1 R46): only closed months are actual. With a close,
 * the last close's month, whatever the reporting date: a date after it leaves the open months to the
 * projection, at forecast rates, and a date before it still reads the later closes, which are facts.
 * With no close at all, the reporting date's month, computed from HRIS actuals now (M1's reading,
 * kept). An addition to the contract (M3, core), read by the Forecast view's run too, so both agree on
 * where the projection starts.
 */
export function actualThroughOf(closes: readonly MonthClose[], asOf: ISODate): Month {
  const last = closes.length > 0 ? closedThrough(closes) : null
  return last ?? monthKey(asOf)
}

/** The monthly attrition rate for an annual one: 1 − (1 − annual)^(1/12). Fixture: F1 (12% gives 0.0105962). */
export function monthlyRate(annual: number): number {
  if (!(annual > 0)) return 0
  if (annual >= 1) return 1
  return 1 - (1 - annual) ** (1 / 12)
}

const isOpenReq = (r: ReqRow): boolean => r.status === 'Open' || r.status === 'On hold'

/** The latest end among the seat's assignments that ended before `d`; null when none did. */
function lastEndBefore(seat: SeatHistory, d: ISODate): ISODate | null {
  let last: ISODate | null = null
  for (const a of seat.assignments)
    if (a.end != null && a.end < d && (last == null || a.end > last)) last = a.end
  return last
}

/**
 * When an Open seat opened (also `plan.openings.age`), the first of these that exists: (a) the
 * openedDate of the seat's latest req with status Open or On hold; (b) the position's own openedDate,
 * if it is after any earlier holder's last day; (c) for a seat Open because of an exit with no req,
 * the last day + 1; (d) otherwise, the effectiveDate of the earliest row in the seat's current run of
 * Open rows. Null when the seat is not Open on `asOf` and no opening is known.
 *
 * Reqs opened after `asOf` are not known on it. The run of Open rows counts rows imported as Filled,
 * which read Open once their holder has gone (6.5); (c) applies when the run began on or before the
 * day after the last holder's last day, so a seat put On hold and opened again dates from the reopening.
 *
 * Fixtures: F3 (Start recruiting on 21 Aug 2026 gives 21 Aug), H3 (an exit on 15 Oct 2026 with no
 * req gives 16 Oct).
 */
export function openedOn(seat: SeatHistory, asOf: ISODate): ISODate | null {
  let latest: ReqRow | null = null
  for (const r of seat.reqs) {
    if (!isOpenReq(r) || !r.openedDate || r.openedDate > asOf) continue
    if (
      !latest ||
      r.openedDate > latest.openedDate ||
      (r.openedDate === latest.openedDate && r.reqId > latest.reqId)
    )
      latest = r
  }
  if (latest) return latest.openedDate
  const state = seatOn(seat, asOf)
  if (state?.status !== 'Open') return null
  const lastEnd = lastEndBefore(seat, asOf)
  const own = state.position.openedDate
  if (own && (lastEnd == null || own > lastEnd)) return own
  let runStart: ISODate | null = null
  for (let i = seat.rows.length - 1; i >= 0; i--) {
    const r = seat.rows[i]
    if (r.effectiveDate > asOf) continue
    if (r.status !== 'Open' && r.status !== 'Filled') break
    runStart = r.effectiveDate
  }
  const afterExit = lastEnd == null ? null : addDays(lastEnd, 1)
  if (afterExit && (runStart == null || afterExit >= runStart)) return afterExit
  return runStart
}

/** An opening as the start rule reads it. */
export interface OpeningForStart {
  status: 'Open' | 'Planned'
  /** The target start (Open) or planned start (Planned); null when none. */
  targetStart: ISODate | null
  /** `openedOn` for an Open seat; ignored for Planned. */
  openedOn: ISODate | null
}

const later = (a: ISODate, b: ISODate): ISODate => (a >= b ? a : b)

/**
 * The forecast start of an opening (step 1): Open = max(target start, asOf + max(0, timeToFillDays −
 * days from openedOn to asOf)); Planned = max(planned start, asOf + timeToFillDays). A missing target
 * reads as asOf. Freezes are applied by `forecast`, not here.
 *
 * Time to fill is in whole days (rounded). An Open seat with no `openedOn` counts 0 days since; an
 * opening that has not happened yet on `asOf` (an exit to come) counts negative days, so it starts no
 * earlier than its opening + time to fill.
 *
 * Fixtures: F3 (Open, target 1 Oct 2026, opened 21 Aug, as-of 30 Sep, 60 days: 20 Oct 2026); FS1
 * (the planted Munich P4: Planned 16 Sep 2026, as-of 30 Sep, 75 days: 14 Dec 2026).
 */
export function forecastStart(opening: OpeningForStart, asOf: ISODate, timeToFillDays: number): ISODate {
  const ttf = Math.max(0, Math.round(timeToFillDays))
  const target = opening.targetStart ?? asOf
  if (opening.status === 'Planned') return later(target, addDays(asOf, ttf))
  const since = opening.openedOn ? daysBetween(opening.openedOn, asOf) : 0
  return later(target, addDays(asOf, Math.max(0, ttf - since)))
}

export interface ForecastInput {
  version: Pick<Version, 'versionId' | 'name' | 'fiscalYear' | 'grid' | 'proration'>
  asOf: ISODate
  /** Closed months are read from these; a month on or before the as-of month with no close is HRIS actuals computed now. */
  closes: readonly MonthClose[]
  positions: readonly PositionRow[]
  workers: readonly WorkerRow[]
  comp: readonly CompRow[]
  reqs: readonly ReqRow[]
  /** Approved Backfills give a reopened seat its replacement start; pending requests are never forecast. */
  requests: readonly HcRequest[]
  freezes: readonly FreezeRow[]
  /** The version's assumptions: loads, bands and the drivers. */
  assumptions: readonly AssumptionRow[]
  /** Actual rates for closed months, forecast rates for open months. The forecast never reads a plan rate. */
  rates: FxTable
  /** Whether a position is in the tree under a root position on a date (freezes keyed by leader). */
  inTree(positionId: string, rootPositionId: string, on: ISODate): boolean
  /**
   * The locked minimum of costed people (`cost.guard.minCosted`, docs/PLAN.md 7.2 rule 1): a unit
   * with fewer prices its HRIS-cohort modeled exits at the company's average cost per head. Callers
   * pass the locked value (lead decision D-MIN); a caller that passes none reads the rule's default,
   * `DEFAULT_MIN_COSTED`. An addition to the contract.
   */
  minCosted?: number
  /**
   * Seats whose cohorts are kept apart from the rest of their org: each seat in the set joins an org
   * of its unit and department made of the set's seats alone, with the same drivers (attrition,
   * backfill %, lag and fill rate read from the same path). The set's modeled exits are then netted
   * over its own members only, so no known exit outside it lowers them. Plan > Hiring passes a
   * Manager's tree (docs/PLAN.md 9.7 Privacy, review HP-1): a last day at or above the manager's
   * seat, or of a peer outside the tree, never moves the tree's modeled exits. Absent: every seat
   * joins its org's one cohort (6.7). An addition to the contract.
   */
  ownCohort?: ReadonlySet<string>
}

/**
 * `cost.guard.minCosted`'s default (src/metrics/rules.ts MIN_COSTED, which plan/ cannot import), used
 * only when a caller passes no `minCosted`. An addition to the contract.
 */
export const DEFAULT_MIN_COSTED = 5

/** A forecast start of one seat. */
export interface ExpectedStart {
  positionId: string
  kind: 'offer' | 'open' | 'planned'
  start: ISODate
  /** 1 for an accepted offer, the fill rate otherwise. */
  probability: number
  /** The freeze that held it past its unfrozen start, if any. */
  heldBy: string | null
  /** An Open seat after an exit with no req ("no req" in Openings). */
  noReq: boolean
}

/** The forecast: what a reforecast stores, plus its starts and lines. */
export interface ForecastResult extends ForecastTable {
  expectedStarts: readonly ExpectedStart[]
  /**
   * The forecast's lines over the grid (closed months from closes, one-time items included; open
   * months at forecast rates),
   * expected values: seat lines by position, and cohort lines for modeled exits and backfills with
   * positionId '' (one per unit, currency and month; negative amounts for exits; basis 'hris' for
   * HRIS-cohort exits, 'band' otherwise), so `fxEffect` and the bridge see every local amount.
   */
  lines: readonly PlanLine[]
}

/* ───────────── cohort lines and detail (additions to the M1 contract) ───────────── */

/** Which cohort a cohort line carries. */
export interface CohortTag {
  /** 'cohort:<unit>|<currency>': the bridge's seat key for it. */
  key: string
  businessUnit: string
  currency: string
  /** 'hris': HRIS-cohort modeled exits (filled part); 'band': backfills less band-cohort exits (band part). */
  part: 'hris' | 'band'
}

/** A cohort line: positionId '', holderId null, `active` 1, `heads` and `fte` the expected change. */
export interface CohortLine extends PlanLine {
  cohort: CohortTag
}

/** The bridge's key for a unit's cohort in one currency. */
export const cohortKey = (businessUnit: string, currency: string): string =>
  `cohort:${businessUnit}|${currency}`

export const isCohortLine = (l: PlanLine): l is CohortLine =>
  (l as Partial<CohortLine>).cohort != null && l.positionId === ''

/** One seat's share of the cohort lines in a grid month (expected values). */
export interface SeatCohortMonth {
  positionId: string
  month: Month
  /** HRIS-cohort modeled exits of the seat's holder in the month. */
  hrisExits: number
  bandExits: number
  /** Modeled backfills starting on the seat in the month (after any freeze). */
  backfills: number
  /** The seat's part of the 'hris' cohort line, USD loaded (negative). */
  filledUsd: number
  /** The seat's part of the 'band' cohort line, USD loaded. */
  bandUsd: number
}

/**
 * One seat's own part of a cohort line: exactly what the seat's holder (the HRIS cohort's modeled
 * exits at the unit's average cost) or the seat itself (backfills less band-cohort exits at its own
 * band) added to the line, every field. A line's parts add up to the line, and each part is linear in
 * every rate the line is (FX, burden rates, benefits, equity), so a seat's share never mixes in
 * another seat's amounts.
 */
export interface CohortPart {
  /** The cohort line it is a part of: `<cohort key>|<part>|<month>`. */
  lineId: string
  positionId: string
  heads: number
  fte: number
  local: LocalAmounts
  usd: UsdAmounts
}

/** The id `CohortPart.lineId` names a cohort line by. */
export const cohortLineId = (l: CohortLine): string => `${l.cohort.key}|${l.cohort.part}|${l.month}`

/** `forecast` plus the per-seat cohort shares and the backfills freezes suppressed. */
export interface ForecastDetail extends ForecastResult {
  seatCohorts: readonly SeatCohortMonth[]
  /** Each seat's own part of each cohort line (`CohortPart`), by line, then position. */
  cohortParts: readonly CohortPart[]
  /** Modeled backfills a freeze stopped, priced at midpoint over the grid (freeze.ts `freezeSavings` input). */
  suppressedBackfills: readonly { freezeId: string; usd: number }[]
}

/** What a reforecast stores of a forecast (docs/PLAN.md 5.3): the ForecastTable fields only. */
export function forecastTable(f: ForecastTable): ForecastTable {
  return {
    asOf: f.asOf,
    closedThrough: f.closedThrough,
    months: f.months,
    unfilledAtHorizon: f.unfilledAtHorizon,
    yearEnd: f.yearEnd,
  }
}

/**
 * The forecast over the version's grid.
 *
 * Fixtures (forecast.test.ts): F1 (the double-count trap: October modeled exits 0.0596, November
 * 1.0484; P-1042 refills through R-88 on 1 Dec 2026, no extra seat), F2 (moving a Planned start from 1
 * Jan 2027 to 1 Nov 2026 changes the band part only; the filled part is equal to the cent).
 */
export function forecast(input: ForecastInput): ForecastResult {
  const d = forecastDetail(input)
  return {
    asOf: d.asOf,
    closedThrough: d.closedThrough,
    months: d.months,
    unfilledAtHorizon: d.unfilledAtHorizon,
    yearEnd: d.yearEnd,
    expectedStarts: d.expectedStarts,
    lines: d.lines,
  }
}

/**
 * The forecast with back-dated adjustments (close.ts `adjustmentsFor`) posted in their month (docs/PLAN.md
 * 6.6): each adjustment of a position in the plan becomes a line of its own in its `postedIn` month
 * (the delta's local and USD amounts at the delta's rate, basis 'hris', holder the employee, heads 0
 * and FTE 0 because it changes a closed month's cost, not the posting month's heads), added to that
 * month's filled part and to the year's cost. The bridge reads the posted amount as a change in the
 * seat's months, so it lands in the timing step (6.6: "counted in the bridge's timing step"). An
 * adjustment posted outside the grid, or for an employee not in the plan, is left out (the forecast is
 * position-based). An addition to the contract: `ForecastInput` is frozen, so adjustments come in here.
 */
export function withAdjustments<F extends ForecastResult>(f: F, adjustments: readonly Adjustment[]): F {
  const byMonth = new Map(f.months.map((m) => [m.month, m]))
  const versionId = f.lines[0]?.versionId ?? ''
  const added: PlanLine[] = []
  const cost = new Map<Month, UsdAmounts>()
  for (const a of adjustments) {
    const positionId = a.delta.positionId ?? a.positionId
    if (!positionId || !byMonth.has(a.postedIn)) continue
    const usd: UsdAmounts = { ...a.delta.usd }
    added.push({
      positionId,
      versionId,
      month: a.postedIn,
      holderId: a.delta.employeeId,
      status: 'Filled',
      heads: 0,
      fte: 0,
      active: a.delta.active,
      currency: a.delta.currency,
      rate: a.delta.rate,
      local: { ...a.delta.local },
      usd,
      basis: 'hris',
    })
    let c = cost.get(a.postedIn)
    if (!c) {
      c = zeroUsd()
      cost.set(a.postedIn, c)
    }
    addUsd(c, usd)
  }
  if (!added.length) return f
  const months = f.months.map((m) => {
    const c = cost.get(m.month)
    if (!c) return m
    const filled = { ...m.cost.filled }
    addUsd(filled, c)
    return { ...m, cost: { filled, band: m.cost.band } }
  })
  const fy = fiscalYearOf(f.months[0].month)
  const yearCost = { ...f.yearEnd.cost }
  for (const [month, c] of cost) if (fiscalYearOf(month) === fy) addUsd(yearCost, c)
  return {
    ...f,
    months,
    yearEnd: { heads: f.yearEnd.heads, cost: yearCost },
    lines: [...f.lines, ...added].sort(lineOrder),
  }
}

/* ───────────── amounts ───────────── */

type Amounts = { base: number; bonus: number; burden: number; benefits: number }

const zeroUsd = (): UsdAmounts => ({
  base: 0,
  bonus: 0,
  burden: 0,
  benefits: 0,
  oneTime: 0,
  vacancy: 0,
  equity: 0,
  loaded: 0,
})

function addUsd(into: UsdAmounts, a: UsdAmounts): void {
  into.base += a.base
  into.bonus += a.bonus
  into.burden += a.burden
  into.benefits += a.benefits
  into.oneTime += a.oneTime
  into.vacancy += a.vacancy
  into.equity += a.equity
  into.loaded += a.loaded
}

/** A seat type's band amounts for a month: annual local loads at midpoint, equity USD a year. */
interface BandYear {
  currency: string
  annual: Amounts
  equityUsd: number
}

const ZERO_AMOUNTS: Amounts = { base: 0, bonus: 0, burden: 0, benefits: 0 }

/* ───────────── the engine ───────────── */

/** A person in the HRIS cohort: an employee in a Filled seat at the as-of date, a pre-hire, or an accepted offer. */
interface Member {
  id: string
  seat: SeatInfo
  currency: string
  /** Sim-month index from which the member is in the cohort's heads at the month's start. */
  join: number
  /** Last day (inclusive) and its sim-month index; null: none known. */
  exit: ISODate | null
  exitIndex: number
  /** In-plan spans, for FTE. */
  spans: readonly { start: ISODate; end: ISODate | null; fte: number }[]
  /** Expected presence at the start of each sim month (0 before joining and after a known exit). */
  presence: Float64Array
  /** Modeled exits in each sim month. */
  exits: Float64Array
}

interface Org {
  key: string
  path: OrgPath
  rate: number
  backfillRate: number
  lag: number
  fillRate: number
  members: Member[]
}

interface SeatInfo {
  id: string
  history: SeatHistory
  /** The row on the as-of date (or the first row of a seat that starts later). */
  row: PositionRow
  place: SeatPlace
  org: Org
  /** Band presence at the start of each sim month, and band exits, backfills and suppressed backfills in it. */
  band: Float64Array
  bandExits: Float64Array
  backfills: Float64Array
  /** Exits (both cohorts) per sim month, waiting for their backfill. */
  exitsAll: Float64Array
  /** An opening's expected start, if forecast. */
  start: { date: ISODate; index: number; p: number; aliveUntil: ISODate | null } | null
  /** `aliveUntil(rows, asOf)`, read once (undefined until read). */
  aliveAsOf: ISODate | null | undefined
  /** Its `SeatCohortMonth` of each sim month, made when first added to. */
  cohort: (SeatCohortMonth | undefined)[]
  /** Its parts of cohort lines, by sim month. */
  parts: ({ line: CohortLine; part: CohortPart }[] | undefined)[]
}

/** The last day a seat is alive after `from`: the day before its first later row that is On hold or Eliminated. */
function aliveUntil(rows: readonly PositionRow[], from: ISODate): ISODate | null {
  for (const r of rows) {
    if (r.effectiveDate > from && (r.status === 'Eliminated' || r.status === 'On hold'))
      return addDays(r.effectiveDate, -1)
  }
  return null
}

const placeOf = (row: PositionRow): SeatPlace => ({
  positionId: row.positionId,
  managerPositionId: row.managerPositionId ?? null,
  businessUnit: row.businessUnit,
  department: row.department ?? null,
  costCenter: row.costCenter,
})

/**
 * The freezes that cover a place on a date and do not let this opening or backfill through: one
 * that allows backfills lets a backfill through, and an approved freeze exception lets its seat
 * through the freeze it names (`exempt`, freeze.ts `freezeExemptions`, review SC-4).
 */
function blockingFreezes(
  freezes: readonly FreezeRow[],
  place: SeatPlace,
  on: ISODate,
  backfill: boolean,
  inTree: ForecastInput['inTree'],
  exempt: readonly string[] = [],
): FreezeRow[] {
  if (freezes.length === 0) return []
  return freezes
    .filter(
      (f) =>
        !(backfill && f.allowBackfill) && !exempt.includes(f.freezeId) && freezeCovers(f, place, on, inTree),
    )
    .sort((a, b) => (a.freezeId < b.freezeId ? -1 : a.freezeId > b.freezeId ? 1 : 0))
}

/** An opening's start after freezes: pushed past each freeze that covers it; null when held past `limit`. */
function heldStart(
  start: ISODate,
  place: SeatPlace,
  backfill: boolean,
  freezes: readonly FreezeRow[],
  inTree: ForecastInput['inTree'],
  limit: ISODate,
  exempt: readonly string[] = [],
): { start: ISODate | null; heldBy: string | null } {
  let d = start
  let heldBy: string | null = null
  for (let guard = 0; guard < 100; guard++) {
    const blocking = blockingFreezes(freezes, place, d, backfill, inTree, exempt)
    if (blocking.length === 0) return { start: d, heldBy }
    heldBy ??= blocking[0].freezeId
    if (blocking.some((f) => !f.endDate)) return { start: null, heldBy }
    const end = blocking.reduce((e, f) => later(e, f.endDate as ISODate), blocking[0].endDate as ISODate)
    d = addDays(end, 1)
    if (d > limit) return { start: null, heldBy }
  }
  return { start: null, heldBy }
}

const actualToPlanLine = (l: ActualLine, versionId: string): PlanLine => ({
  positionId: l.positionId ?? '',
  versionId,
  month: l.month,
  holderId: l.employeeId,
  status: 'Filled',
  heads: l.heads,
  fte: l.fte,
  active: l.active,
  currency: l.currency,
  rate: l.rate,
  local: { ...l.local },
  usd: { ...l.usd },
  basis: 'hris',
})

const lineOrder = (a: PlanLine, b: PlanLine): number => {
  if (a.positionId !== b.positionId) return a.positionId < b.positionId ? -1 : 1
  if (a.month !== b.month) return a.month < b.month ? -1 : 1
  const ha = isCohortLine(a) ? `${a.cohort.key}|${a.cohort.part}` : (a.holderId ?? '')
  const hb = isCohortLine(b) ? `${b.cohort.key}|${b.cohort.part}` : (b.holderId ?? '')
  if (ha !== hb) return ha < hb ? -1 : 1
  return a.basis < b.basis ? -1 : a.basis > b.basis ? 1 : 0
}

/** The forecast with each seat's cohort shares and the backfills freezes suppressed. */
export function forecastDetail(input: ForecastInput): ForecastDetail {
  const { version, asOf } = input
  const versionId = version.versionId
  const fullVersion: Version = {
    ...version,
    kind: 'working',
    state: 'working',
    createdAt: asOf,
    lockedAt: null,
    lockedBy: null,
    engineVersion: ENGINE_VERSION,
    parentId: null,
    hash: null,
  }
  const gridMonths = monthRange(version.grid.from, version.grid.to)
  const gridEnd = monthEnd(version.grid.to)
  const closeOf = new Map(input.closes.map((c) => [c.month, c]))
  const lastClose = input.closes.length > 0 ? closedThrough(input.closes) : null
  // Only closed months are actual (R46): a reporting date inside an unclosed month projects it.
  const actualThrough: Month = actualThroughOf(input.closes, asOf)
  const firstProjected = shiftMonth(actualThrough, 1)
  const sim: Month[] = monthRange(firstProjected, version.grid.to)
  const simIndex = new Map(sim.map((m, i) => [m, i]))
  const n = sim.length
  /** The sim index of a date's month, clamped to the first projected month; n when after the grid. */
  const indexOf = (d: ISODate): number => {
    const m = monthKey(d)
    if (m < firstProjected) return 0
    return simIndex.get(m) ?? n
  }
  const projectedGrid = gridMonths.filter((m) => m > actualThrough)
  const actualGrid = gridMonths.filter((m) => m <= actualThrough)

  const lookup = assumptionLookup(input.assumptions, version)
  const rowsOfSeat = new Map<string, PositionRow[]>()
  for (const r of input.positions) {
    const list = rowsOfSeat.get(r.positionId)
    if (list) list.push(r)
    else rowsOfSeat.set(r.positionId, [r])
  }
  // An approved Elimination ends the holder on the seat's last day, whatever HRIS still shows (R34).
  const assignments = clipAtElimination(
    toAssignments(input.workers).filter((a) => a.workerType === 'Employee'),
    (id) => rowsOfSeat.get(id) ?? [],
  )
  const histories = seatHistories({
    positions: input.positions,
    assignments,
    reqs: input.reqs,
    requests: input.requests,
  })
  const ctx: LineContext = lineContext({
    version,
    asOf,
    positions: input.positions,
    workers: input.workers,
    comp: input.comp,
    reqs: input.reqs,
    requests: input.requests,
    assumptions: input.assumptions,
    rates: { table: input.rates, use: 'actual-forecast', closedThrough: actualThrough },
    closes: input.closes,
    // A pre-hire in HRIS is costed through its assignment and comp from its start (D-PREHIRE).
    futureAssignments: true,
    vacancyAllowance: false,
  })

  /* Orgs (unit and department) and their drivers. */
  const orgs = new Map<string, Org>()
  // A seat of `ownCohort` joins its org's own cohort: the same path and drivers, its own members.
  const orgOf = (row: PositionRow, own = false): Org => {
    const path: OrgPath = { businessUnit: row.businessUnit, department: row.department ?? null }
    const key = `${path.businessUnit}\u0001${path.department ?? ''}${own ? '\u0001own' : ''}`
    let org = orgs.get(key)
    if (!org) {
      const num = (table: 'attrition' | 'backfillRate' | 'backfillLag' | 'fillRate', fallback: number) =>
        lookup.num(table, ['*'], path, fallback) ?? fallback
      org = {
        key,
        path,
        rate: monthlyRate(num('attrition', 0)),
        backfillRate: Math.min(1, Math.max(0, num('backfillRate', 0))),
        lag: Math.max(0, Math.round(num('backfillLag', 0))),
        fillRate: Math.min(1, Math.max(0, num('fillRate', 1))),
        members: [],
      }
      orgs.set(key, org)
    }
    return org
  }

  /* Seats. */
  const seats = new Map<string, SeatInfo>()
  for (const [id, history] of [...histories].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (history.rows.length === 0) continue
    const row = rowOn(history.rows, asOf) ?? history.rows[0]
    seats.set(id, {
      id,
      history,
      row,
      place: placeOf(row),
      org: orgOf(row, input.ownCohort?.has(id) ?? false),
      band: new Float64Array(n + 1),
      bandExits: new Float64Array(n),
      backfills: new Float64Array(n),
      exitsAll: new Float64Array(n),
      start: null,
      aliveAsOf: undefined,
      cohort: [],
      parts: [],
    })
  }
  /** The last day a seat is alive after the as-of date (`aliveUntil`), read once a seat. */
  const aliveAfterAsOf = (seat: SeatInfo): ISODate | null => {
    if (seat.aliveAsOf === undefined) seat.aliveAsOf = aliveUntil(seat.history.rows, asOf)
    return seat.aliveAsOf
  }

  /*
   * Seat lines: HRIS and offer segments from cost.ts in projected grid months (actual months come
   * from closes and HRIS actuals, one-time items included). A band line with a holder or req (a
   * holder with no comp row, an offer with no offerBase) stays: no opening replaces it. A band run
   * (holderId null) is replaced by the seat's opening line.
   */
  const projectedSet = new Set(projectedGrid)
  const seatLines: PlanLine[] = []
  for (const seat of seats.values()) {
    // Only the projected months are priced; each is the line the whole grid's run gives it.
    for (const l of positionLines(toPosition(seat.row), fullVersion, ctx, projectedSet)) {
      if (l.basis === 'band' && l.holderId === null) continue
      if (projectedSet.has(l.month)) seatLines.push(l)
    }
  }
  /** A holder's lines' active fraction and currency by month. */
  const holderActive = new Map<string, Map<Month, number>>()
  const holderCurrency = new Map<string, string>()
  for (const l of seatLines) {
    if (!l.holderId) continue
    let byMonth = holderActive.get(l.holderId)
    if (!byMonth) {
      byMonth = new Map()
      holderActive.set(l.holderId, byMonth)
    }
    byMonth.set(l.month, Math.min(1, (byMonth.get(l.month) ?? 0) + l.active))
    if (!holderCurrency.has(l.holderId)) holderCurrency.set(l.holderId, l.currency)
  }
  const siteCurrency = (location: string): string => siteByLocation.get(location)?.currency ?? 'USD'

  /* HRIS cohort members. */
  const byEmployee = new Map<string, Assignment[]>()
  for (const a of assignments) {
    const list = byEmployee.get(a.employeeId)
    if (list) list.push(a)
    else byEmployee.set(a.employeeId, [a])
  }
  const members: Member[] = []
  const memberSeats = new Set<string>()
  const startsByIndex = new Float64Array(n + 1)
  const expectedStarts: ExpectedStart[] = []
  const newMember = (
    id: string,
    seat: SeatInfo,
    join: number,
    exit: ISODate | null,
    spans: Member['spans'],
  ) => {
    const m: Member = {
      id,
      seat,
      currency: holderCurrency.get(id) ?? siteCurrency(seat.row.location),
      join,
      exit,
      exitIndex:
        exit == null ? n + 1 : monthKey(exit) < firstProjected ? -1 : (simIndex.get(monthKey(exit)) ?? n + 1),
      spans,
      presence: new Float64Array(n + 1),
      exits: new Float64Array(n),
    }
    members.push(m)
    seat.org.members.push(m)
    memberSeats.add(seat.id)
  }
  for (const [employeeId, list] of [...byEmployee].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const inPlan = list.filter((a) => a.positionId != null && seats.has(a.positionId))
    if (inPlan.length === 0) continue
    const exit = list.some((a) => a.end == null)
      ? null
      : list.reduce<ISODate>((e, a) => later(e, a.end as ISODate), list[0].end as ISODate)
    const spans = inPlan.map((a) => ({ start: a.start, end: a.end, fte: a.fte }))
    const active = inPlan
      .filter((a) => a.start <= asOf && (a.end == null || a.end >= asOf))
      .sort((a, b) => (a.start < b.start ? 1 : -1))[0]
    if (active) {
      if (exit != null && exit <= asOf) continue
      newMember(employeeId, seats.get(active.positionId as string)!, 0, exit, spans)
      continue
    }
    if (list.some((a) => a.start <= asOf)) continue // left before the as-of date, or not in the plan then
    const first = inPlan.filter((a) => a.start > asOf).sort((a, b) => (a.start < b.start ? -1 : 1))[0]
    if (!first || first.start > gridEnd) continue
    const seat = seats.get(first.positionId as string)!
    const index = indexOf(first.start)
    newMember(employeeId, seat, index + 1, exit, spans)
    if (monthKey(first.start) >= firstProjected) startsByIndex[index] += 1
    expectedStarts.push({
      positionId: seat.id,
      kind: 'offer',
      start: first.start,
      probability: 1,
      heldBy: null,
      noReq: false,
    })
  }
  for (const r of [...input.reqs].sort((a, b) => (a.reqId < b.reqId ? -1 : 1))) {
    if (r.stage !== 'Offer accepted' || !isOpenReq(r) || !r.positionId || !r.startDate) continue
    const seat = seats.get(r.positionId)
    if (!seat || r.startDate > gridEnd) continue
    const preHired = seat.history.assignments.some(
      (a) => a.start > asOf || (a.start <= r.startDate! && (a.end == null || a.end >= r.startDate!)),
    )
    if (preHired) continue
    const index = indexOf(r.startDate)
    const spans = [{ start: r.startDate, end: null, fte: rowOn(seat.history.rows, r.startDate)?.fte ?? 1 }]
    newMember(r.reqId, seat, index + 1, null, spans)
    if (monthKey(r.startDate) >= firstProjected) startsByIndex[index] += 1
    expectedStarts.push({
      positionId: seat.id,
      kind: 'offer',
      start: r.startDate,
      probability: 1,
      heldBy: null,
      noReq: false,
    })
  }

  /* Openings. A seat an approved freeze exception lets through is not held by that freeze (SC-4). */
  const exemptions = freezeExemptions(input.requests, input.positions, input.freezes, input.inTree, asOf)
  let unfilledAtHorizon = 0
  for (const seat of seats.values()) {
    const h = seat.history
    const dates = new Set<ISODate>([asOf])
    for (const r of h.rows)
      if (r.effectiveDate > asOf && r.effectiveDate <= gridEnd) dates.add(r.effectiveDate)
    for (const a of h.assignments) {
      if (a.end != null && a.end >= asOf && addDays(a.end, 1) <= gridEnd) dates.add(addDays(a.end, 1))
    }
    let on: ISODate | null = null
    let state: ReturnType<typeof seatOn> = null
    for (const d of [...dates].sort()) {
      const s = seatOn(h, d)
      if (s && (s.status === 'Open' || s.status === 'Planned')) {
        on = d
        state = s
        break
      }
    }
    if (!on || !state) continue
    const openedAt = on
    if (h.assignments.some((a) => a.start > openedAt)) continue // a pre-hire fills it
    if (state.acceptedOffer) continue // an accepted offer fills it
    const status = state.status as 'Open' | 'Planned'
    const row = rowOn(h.rows, on) ?? seat.row
    const path: OrgPath = { businessUnit: row.businessUnit, department: row.department ?? null }
    const ttf = lookup.num('timeToFill', [row.level], path, 0) ?? 0
    const opened = status === 'Open' ? openedOn(h, on) : null
    let start = forecastStart({ status, targetStart: state.plannedStart, openedOn: opened }, asOf, ttf)
    if (start < on) start = on
    if (start > gridEnd) continue // not due within the grid
    const previousHolder = lastEndBefore(h, addDays(on, 1)) != null
    const hasReq = h.reqs.some((r) => isOpenReq(r) && r.openedDate && r.openedDate <= on)
    const backfill = previousHolder || h.backfills.length > 0 || row.reqType === 'Backfill'
    const held = heldStart(
      start,
      placeOf(row),
      backfill,
      input.freezes,
      input.inTree,
      gridEnd,
      exemptions.get(seat.id),
    )
    const until = aliveUntil(h.rows, on)
    const p = seat.org.fillRate
    if (held.start == null || (until != null && held.start > until)) {
      if (held.start == null) unfilledAtHorizon += 1
      continue
    }
    unfilledAtHorizon += 1 - p
    const index = indexOf(held.start)
    seat.start = { date: held.start, index, p, aliveUntil: until }
    startsByIndex[index] += p
    expectedStarts.push({
      positionId: seat.id,
      kind: status === 'Open' ? 'open' : 'planned',
      start: held.start,
      probability: p,
      heldBy: held.heldBy,
      noReq: status === 'Open' && previousHolder && !hasReq,
    })
  }

  /* The cohorts, month by month. */
  const seatList = [...seats.values()]
  const orgList = [...orgs.values()].sort((a, b) => (a.key < b.key ? -1 : 1))
  const suppressed = new Map<string, { seat: SeatInfo; index: number; amount: number }[]>()
  /** A seat's backfill blockers on a month's 15th, by its row (a freeze reads the row's place). */
  const blockersMemo = new Map<PositionRow, Map<Month, FreezeRow[]>>()
  const backfillBlockers = (row: PositionRow, month: Month, midMonth: ISODate): FreezeRow[] => {
    let byMonth = blockersMemo.get(row)
    if (!byMonth) {
      byMonth = new Map()
      blockersMemo.set(row, byMonth)
    }
    let out = byMonth.get(month)
    if (!out) {
      out = blockingFreezes(input.freezes, placeOf(row), midMonth, true, input.inTree)
      byMonth.set(month, out)
    }
    return out
  }
  for (let i = 0; i < n; i++) {
    const month = sim[i]
    const first = monthStart(month)
    // HRIS cohort: presence at the month's start.
    for (const m of members) {
      if (i < m.join || i > m.exitIndex) {
        m.presence[i] = i === 0 && m.join === 0 && m.exitIndex >= 0 ? 1 : (m.presence[i] ?? 0)
        if (i < m.join || i > m.exitIndex) m.presence[i] = 0
        continue
      }
      m.presence[i] = i === m.join ? 1 : m.presence[i]
    }
    for (const org of orgList) {
      let heads = 0
      let known = 0
      let shareBase = 0
      for (const m of org.members) {
        const p = m.presence[i]
        if (p <= 0) continue
        heads += p
        if (m.exitIndex === i) known += 1
        else shareBase += p
      }
      const modeled = Math.max(0, heads * org.rate - known)
      for (const m of org.members) {
        const p = m.presence[i]
        if (p <= 0) continue
        let next = p
        if (m.exitIndex !== i && shareBase > 0 && modeled > 0) {
          const e = (modeled * p) / shareBase
          m.exits[i] = e
          m.seat.exitsAll[i] += e
          next = p - e
        }
        if (m.exitIndex === i) next = 0
        m.presence[i + 1] = next
      }
    }
    // Band cohort: exits on band presence, joins from starts in the month before.
    for (const seat of seatList) {
      if (seat.start && seat.start.index + 1 === i) seat.band[i] += seat.start.p
      const until = seat.start?.aliveUntil ?? aliveAfterAsOf(seat)
      if (until != null && first > until) seat.band[i] = 0
      const b = seat.band[i]
      const x = b * seat.org.rate
      seat.bandExits[i] = x
      seat.exitsAll[i] += x
      seat.band[i + 1] += b - x
    }
    // Backfills of month i − lag's exits start in month i and join at the start of month i + 1.
    for (const seat of seatList) {
      const j = i - seat.org.lag
      if (j < 0) continue
      const due = seat.exitsAll[j] * seat.org.backfillRate
      if (due <= 0) continue
      const midMonth = `${month}-15`
      const row = rowOn(seat.history.rows, midMonth)
      if (!row || row.status === 'Eliminated' || row.status === 'On hold') continue
      const blocking = backfillBlockers(row, month, midMonth)
      if (blocking.length > 0) {
        const list = suppressed.get(blocking[0].freezeId) ?? []
        list.push({ seat, index: i, amount: due })
        suppressed.set(blocking[0].freezeId, list)
        continue
      }
      seat.backfills[i] += due
      seat.band[i + 1] += due
    }
  }

  /* Amounts. */
  const proration = version.proration
  const bandCache = new Map<string, BandYear>()
  const fyOfMonth = new Map<Month, FiscalYear>()
  const bandByRow = new Map<PositionRow, Map<FiscalYear, BandYear>>()
  const bandOf = (row: PositionRow, month: Month): BandYear => {
    let fy = fyOfMonth.get(month)
    if (fy === undefined) {
      fy = fiscalYearOf(month)
      fyOfMonth.set(month, fy)
    }
    // A row's band is read once a fiscal year (the key below is the row's level, location, FTE and org).
    let byFy = bandByRow.get(row)
    if (!byFy) {
      byFy = new Map()
      bandByRow.set(row, byFy)
    }
    const hit = byFy.get(fy)
    if (hit) return hit
    const path: OrgPath = { businessUnit: row.businessUnit, department: row.department ?? null }
    const fte = row.fte ?? 1
    const key = `${row.level}|${row.location}|${fte}|${path.businessUnit}|${path.department ?? ''}|${fy}`
    let out = bandCache.get(key)
    if (!out) {
      const loads =
        loadsOf({ level: row.level, location: row.location }, fy, path, lookup) ??
        loadsOf({ level: row.level, location: row.location }, version.fiscalYear, path, lookup)
      out = loads
        ? {
            currency: loads.currency,
            annual: annualLocal({
              rate: loads.midpoint,
              fte,
              bonusTarget: loads.bonusTarget,
              bonusFunding: loads.bonusFunding,
              burden: loads.burden,
              benefits: loads.benefits,
            }),
            equityUsd: loads.equityUsd * fte,
          }
        : { currency: siteCurrency(row.location), annual: ZERO_AMOUNTS, equityUsd: 0 }
      bandCache.set(key, out)
    }
    byFy.set(fy, out)
    return out
  }
  /** Local monthly amounts × factor, as a line's local and USD amounts at the month's rate. */
  const scaled = (annual: Amounts, equityUsd: number, factor: number, rate: number) => {
    const local = {
      base: (annual.base / 12) * factor,
      bonus: (annual.bonus / 12) * factor,
      burden: (annual.burden / 12) * factor,
      benefits: (annual.benefits / 12) * factor,
      oneTime: 0,
      vacancy: 0,
    }
    const usd: UsdAmounts = {
      base: local.base * rate,
      bonus: local.bonus * rate,
      burden: local.burden * rate,
      benefits: local.benefits * rate,
      oneTime: 0,
      vacancy: 0,
      equity: (equityUsd / 12) * factor,
      loaded: 0,
    }
    usd.loaded = usd.base + usd.bonus + usd.burden + usd.benefits
    return { local, usd }
  }

  // Opening lines: a band line from the forecast start, scaled by its probability.
  const openingLines: PlanLine[] = []
  for (const seat of seatList) {
    const s = seat.start
    if (!s) continue
    for (const month of projectedGrid) {
      if (month < monthKey(s.date) && month !== sim[0]) continue
      if (month < monthKey(s.date) && monthKey(s.date) >= firstProjected) continue
      const frac = activeFraction(proration, month, s.date, s.aliveUntil)
      // Average FTE is daily whatever the proration (SA-5): a start late in a half-month month
      // costs nothing but still holds FTE for its days.
      const fracDaily = proration === 'daily' ? frac : activeFraction('daily', month, s.date, s.aliveUntil)
      if (frac <= 0 && fracDaily <= 0) continue
      const row = rowOn(seat.history.rows, monthEnd(month)) ?? seat.row
      const band = bandOf(row, month)
      const rate = ctx.rateOf(band.currency, month)
      const { local, usd } = scaled(band.annual, band.equityUsd, frac * s.p, rate)
      const end = monthEnd(month)
      const atEnd = s.date <= end && (s.aliveUntil == null || s.aliveUntil >= end)
      openingLines.push({
        positionId: seat.id,
        versionId,
        month,
        holderId: null,
        status: atEnd ? 'Filled' : (row.status as PlanLine['status']),
        heads: atEnd ? s.p : 0,
        fte: row.fte ?? 1,
        active: frac * s.p,
        ...(proration === 'daily' ? {} : { activeDaily: fracDaily * s.p }),
        currency: band.currency,
        rate,
        local,
        usd,
        basis: 'band',
      })
    }
  }

  // The unit's average HRIS cost per head, by month (the company's under the locked minimum, D-MIN).
  const minCosted = input.minCosted ?? DEFAULT_MIN_COSTED
  type Avg = { base: number; bonus: number; burden: number; benefits: number; equity: number }
  const avgOf = new Map<Month, Map<string, Avg>>()
  const hrisLinesOf = new Map<Month, PlanLine[]>()
  for (const l of seatLines) {
    if (l.basis !== 'hris' || !(l.active > 0) || !l.holderId) continue
    const list = hrisLinesOf.get(l.month)
    if (list) list.push(l)
    else hrisLinesOf.set(l.month, [l])
  }
  for (const month of projectedGrid) {
    const byUnit = new Map<string, { sum: Avg; active: number; people: Set<string> }>()
    const company = { sum: { base: 0, bonus: 0, burden: 0, benefits: 0, equity: 0 }, active: 0 }
    for (const l of hrisLinesOf.get(month) ?? []) {
      const unit = seats.get(l.positionId)?.row.businessUnit ?? ''
      let u = byUnit.get(unit)
      if (!u) {
        u = { sum: { base: 0, bonus: 0, burden: 0, benefits: 0, equity: 0 }, active: 0, people: new Set() }
        byUnit.set(unit, u)
      }
      for (const s of [u.sum, company.sum]) {
        s.base += l.usd.base
        s.bonus += l.usd.bonus
        s.burden += l.usd.burden
        s.benefits += l.usd.benefits
        s.equity += l.usd.equity
      }
      u.active += l.active
      company.active += l.active
      u.people.add(l.holderId as string)
    }
    const per = (s: Avg, a: number): Avg =>
      a > 0
        ? {
            base: s.base / a,
            bonus: s.bonus / a,
            burden: s.burden / a,
            benefits: s.benefits / a,
            equity: s.equity / a,
          }
        : { base: 0, bonus: 0, burden: 0, benefits: 0, equity: 0 }
    const companyAvg = per(company.sum, company.active)
    const out = new Map<string, Avg>()
    for (const org of orgList) {
      const unit = org.path.businessUnit
      if (out.has(unit)) continue
      const u = byUnit.get(unit)
      out.set(unit, u && u.people.size >= minCosted ? per(u.sum, u.active) : companyAvg)
    }
    avgOf.set(month, out)
  }

  // Cohort lines, one per unit, currency, part and month, from each member's and seat's share.
  // Seat months and parts are kept on their seat by sim month, and lines by unit, currency, part and
  // sim month (no string key per lookup); each output list is sorted on a key that tells every entry
  // apart, so the order they are made in does not matter.
  const cohortLines = new Map<string, CohortLine>()
  const seatCohorts: SeatCohortMonth[] = []
  const seatCohort = (seat: SeatInfo, i: number, month: Month): SeatCohortMonth => {
    let c = seat.cohort[i]
    if (!c) {
      c = { positionId: seat.id, month, hrisExits: 0, bandExits: 0, backfills: 0, filledUsd: 0, bandUsd: 0 }
      seat.cohort[i] = c
      seatCohorts.push(c)
    }
    return c
  }
  const cohortParts: CohortPart[] = []
  const lineIds = new Map<CohortLine, string>()
  /** A seat's part of a cohort line of sim month i (a seat has one or two lines a month: a short list). */
  const partOf = (l: CohortLine, seat: SeatInfo, i: number): CohortPart => {
    let list = seat.parts[i]
    if (!list) {
      list = []
      seat.parts[i] = list
    }
    for (const e of list) if (e.line === l) return e.part
    let lineId = lineIds.get(l)
    if (lineId === undefined) {
      lineId = cohortLineId(l)
      lineIds.set(l, lineId)
    }
    const c: CohortPart = {
      lineId,
      positionId: seat.id,
      heads: 0,
      fte: 0,
      local: { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 },
      usd: zeroUsd(),
    }
    list.push({ line: l, part: c })
    cohortParts.push(c)
    return c
  }
  /** Each unit's and currency's cohort lines by part and sim month. */
  const linesByCohort = new Map<
    string,
    Map<string, { hris: (CohortLine | undefined)[]; band: (CohortLine | undefined)[] }>
  >()
  const cohortLine = (
    unit: string,
    currency: string,
    part: 'hris' | 'band',
    month: Month,
    i: number,
    rate: number,
  ) => {
    let byCurrency = linesByCohort.get(unit)
    if (!byCurrency) {
      byCurrency = new Map()
      linesByCohort.set(unit, byCurrency)
    }
    let byPart = byCurrency.get(currency)
    if (!byPart) {
      byPart = { hris: [], band: [] }
      byCurrency.set(currency, byPart)
    }
    const found = byPart[part][i]
    if (found) return found
    const key = cohortKey(unit, currency)
    const id = `${key}|${part}|${month}`
    let l = cohortLines.get(id)
    if (!l) {
      l = {
        positionId: '',
        versionId,
        month,
        holderId: null,
        status: 'Filled',
        heads: 0,
        fte: 0,
        active: 1,
        currency,
        rate,
        local: { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 },
        usd: zeroUsd(),
        basis: part === 'hris' ? 'hris' : 'band',
        cohort: { key, businessUnit: unit, currency, part },
      }
      cohortLines.set(id, l)
    }
    byPart[part][i] = l
    return l
  }
  const daily = (month: Month, spans: Member['spans']): number => {
    let f = 0
    for (const s of spans) f += s.fte * activeFraction('daily', month, s.start, s.end)
    return f
  }
  const fteByMonth = new Map<Month, number>()
  const headsByMonth = new Map<Month, number>()
  // Σ of a series' months before each month, in the order `sumTo` adds them (so the same sums).
  const prefix = (xs: Float64Array): Float64Array => {
    const out = new Float64Array(xs.length + 1)
    let s = 0
    for (let k = 0; k < xs.length; k++) {
      out[k] = s
      s += xs[k]
    }
    out[xs.length] = s
    return out
  }
  const memberStart = members.map((m) =>
    m.spans.reduce<ISODate>((s, x) => (x.start < s ? x.start : s), m.spans[0].start),
  )
  const memberCum = members.map((m) => prefix(m.exits))
  const memberActive = members.map((m) => holderActive.get(m.id))
  const seatBackfillsCum = seatList.map((seat) => prefix(seat.backfills))
  const seatBandExitsCum = seatList.map((seat) => prefix(seat.bandExits))
  for (const month of projectedGrid) {
    const i = simIndex.get(month) as number
    const end = monthEnd(month)
    let heads = 0
    let fte = 0
    const avgs = avgOf.get(month) as Map<string, Avg>
    for (let k = 0; k < members.length; k++) {
      const m = members[k]
      const startDay = memberStart[k]
      const cumBefore = memberCum[k][i]
      const pStart = m.presence[i]
      const presentAtEnd = (startDay <= end || m.join === 0) && (m.exit == null || m.exit >= end)
      const after = i < m.join ? 1 : m.presence[i + 1]
      if (presentAtEnd) heads += i < m.join ? 1 : after
      const presAvg = i < m.join ? 1 : pStart - 0.5 * m.exits[i]
      const fteOfMonth = daily(month, m.spans)
      fte += presAvg * fteOfMonth
      const reduction = cumBefore + 0.5 * m.exits[i]
      const act = memberActive[k]?.get(month) ?? 0
      // The FTE change is daily whatever the proration (SA-5): a month the proration prices at 0
      // still loses the exits' FTE for its days, with no amount.
      if (reduction > 0 && (act > 0 || fteOfMonth > 0)) {
        const avg = avgs.get(m.seat.org.path.businessUnit) as Avg
        const rate = ctx.rateOf(m.currency, month)
        const f = reduction * act
        const l = cohortLine(m.seat.org.path.businessUnit, m.currency, 'hris', month, i, rate)
        const own = partOf(l, m.seat, i)
        const base = -avg.base * f
        const bonus = -avg.bonus * f
        const burden = -avg.burden * f
        const benefits = -avg.benefits * f
        const equity = -avg.equity * f
        const loaded = base + bonus + burden + benefits
        const dFte = reduction * fteOfMonth
        const dHeads = presentAtEnd ? cumBefore + m.exits[i] : 0
        // The line, then the seat's own part of it, the same amounts.
        for (let x: CohortLine | CohortPart = l, n = 0; n < 2; n++, x = own) {
          x.usd.base += base
          x.usd.bonus += bonus
          x.usd.burden += burden
          x.usd.benefits += benefits
          x.usd.equity += equity
          x.usd.loaded += loaded
          x.local.base += base / rate
          x.local.bonus += bonus / rate
          x.local.burden += burden / rate
          x.local.benefits += benefits / rate
          x.fte -= dFte
          x.heads -= dHeads
        }
        seatCohort(m.seat, i, month).filledUsd += loaded
      }
      if (m.exits[i] > 0) seatCohort(m.seat, i, month).hrisExits += m.exits[i]
    }
    for (let k = 0; k < seatList.length; k++) {
      const seat = seatList[k]
      const s = seat.start
      const until = s?.aliveUntil ?? aliveAfterAsOf(seat)
      if (s) {
        if (s.date <= end && (until == null || until >= end)) heads += s.p
        fte += s.p * (seat.row.fte ?? 1) * activeFraction('daily', month, s.date, until)
      }
      const cumBf = seatBackfillsCum[k][i]
      const cumBx = seatBandExitsCum[k][i]
      const g = cumBf + 0.5 * seat.backfills[i] - cumBx - 0.5 * seat.bandExits[i]
      const aliveAtEnd = until == null || until >= end
      const net = cumBf + seat.backfills[i] - cumBx - seat.bandExits[i]
      if (aliveAtEnd) heads += net
      if (seat.backfills[i] > 0) seatCohort(seat, i, month).backfills += seat.backfills[i]
      if (seat.bandExits[i] > 0) seatCohort(seat, i, month).bandExits += seat.bandExits[i]
      if (Math.abs(g) < 1e-12 && Math.abs(net) < 1e-12) continue
      // A seat alive past the grid is active all month under every method (activeFraction gives 1).
      const frac = until == null ? 1 : activeFraction(proration, month, null, until)
      const fracDaily = until == null ? 1 : activeFraction('daily', month, null, until)
      const row = rowOn(seat.history.rows, end) ?? seat.row
      fte += g * (row.fte ?? 1) * fracDaily
      const band = bandOf(row, month)
      const rate = ctx.rateOf(band.currency, month)
      // `scaled(band.annual, band.equityUsd, g × frac, rate)`, written out.
      const factor = g * frac
      const a = band.annual
      const localBase = (a.base / 12) * factor
      const localBonus = (a.bonus / 12) * factor
      const localBurden = (a.burden / 12) * factor
      const localBenefits = (a.benefits / 12) * factor
      const usdBase = localBase * rate
      const usdBonus = localBonus * rate
      const usdBurden = localBurden * rate
      const usdBenefits = localBenefits * rate
      const usdEquity = (band.equityUsd / 12) * factor
      const usdLoaded = usdBase + usdBonus + usdBurden + usdBenefits
      const l = cohortLine(seat.org.path.businessUnit, band.currency, 'band', month, i, rate)
      const own = partOf(l, seat, i)
      // The line, then the seat's own part of it, the same amounts (addUsd's order).
      for (let x: CohortLine | CohortPart = l, n = 0; n < 2; n++, x = own) {
        x.local.base += localBase
        x.local.bonus += localBonus
        x.local.burden += localBurden
        x.local.benefits += localBenefits
        x.usd.base += usdBase
        x.usd.bonus += usdBonus
        x.usd.burden += usdBurden
        x.usd.benefits += usdBenefits
        x.usd.oneTime += 0
        x.usd.vacancy += 0
        x.usd.equity += usdEquity
        x.usd.loaded += usdLoaded
        x.fte += g * (row.fte ?? 1) * fracDaily
        if (aliveAtEnd) x.heads += net
      }
      seatCohort(seat, i, month).bandUsd += usdLoaded
    }
    headsByMonth.set(month, heads)
    fteByMonth.set(month, fte)
  }

  /* Suppressed backfills, priced at midpoint over the grid with the band cohort's attrition. */
  const suppressedBackfills: { freezeId: string; usd: number }[] = []
  for (const freezeId of [...suppressed.keys()].sort()) {
    let usd = 0
    for (const { seat, index, amount } of suppressed.get(freezeId) ?? []) {
      const r = seat.org.rate
      for (const month of projectedGrid) {
        const k = simIndex.get(month) as number
        if (k < index) continue
        const w = k === index ? 0.5 : (1 - r) ** (k - index - 1) * (1 - r / 2)
        const until = aliveAfterAsOf(seat)
        const frac = activeFraction(proration, month, null, until)
        if (frac <= 0) continue
        const row = rowOn(seat.history.rows, monthEnd(month)) ?? seat.row
        const band = bandOf(row, month)
        usd += scaled(band.annual, band.equityUsd, amount * w * frac, ctx.rateOf(band.currency, month)).usd
          .loaded
      }
    }
    suppressedBackfills.push({ freezeId, usd })
  }

  /* Actual months. */
  const actualLinesOut: PlanLine[] = []
  const actualHeads = new Map<Month, { heads: number; fte: number }>()
  for (const month of actualGrid) {
    const close = closeOf.get(month)
    const rows: Iterable<ActualLine> = close
      ? actualLineRows(close.lines)
      : actualLines({
          month,
          positions: input.positions,
          workers: input.workers,
          comp: input.comp,
          assumptions: input.assumptions,
          versionId,
          versionName: version.name,
          rates: input.rates,
          reqs: input.reqs,
          asOf: monthEnd(month) < asOf ? monthEnd(month) : asOf,
        })
    let heads = 0
    let fte = 0
    for (const a of rows) {
      if (a.month !== month || !a.positionId) continue
      actualLinesOut.push(actualToPlanLine(a, versionId))
      heads += a.heads
      fte += a.fte * a.active
    }
    actualHeads.set(month, { heads, fte })
  }

  /* Lines and months. */
  const lines: PlanLine[] = [...actualLinesOut, ...seatLines, ...openingLines, ...cohortLines.values()]
  lines.sort(lineOrder)
  const costOf = new Map<Month, { filled: UsdAmounts; band: UsdAmounts }>()
  for (const month of gridMonths) costOf.set(month, { filled: zeroUsd(), band: zeroUsd() })
  for (const l of lines) {
    const c = costOf.get(l.month)
    if (c) addUsd(l.basis === 'band' ? c.band : c.filled, l.usd)
  }

  const inPlanAssignments = assignments.filter((a) => a.positionId != null && seats.has(a.positionId))
  const exitOfEmployee = new Map<string, ISODate | null>()
  for (const [employeeId, list] of byEmployee) {
    exitOfEmployee.set(
      employeeId,
      list.some((a) => a.end == null)
        ? null
        : list.reduce<ISODate>((e, a) => later(e, a.end as ISODate), list[0].end as ISODate),
    )
  }
  const months: ForecastMonth[] = gridMonths.map((month) => {
    const cost = costOf.get(month) as { filled: UsdAmounts; band: UsdAmounts }
    const i = simIndex.get(month)
    if (i === undefined) {
      const a = actualHeads.get(month) ?? { heads: 0, fte: 0 }
      const first = monthStart(month)
      const atStart = new Set<string>()
      const hires = new Set<string>()
      const leavers = new Set<string>()
      for (const x of inPlanAssignments) {
        if (x.start <= first && (x.end == null || x.end >= first)) atStart.add(x.employeeId)
      }
      for (const w of input.workers) {
        if (w.workerType === 'Employee' && w.positionId && monthKey(w.hireDate) === month)
          hires.add(w.employeeId)
      }
      for (const [employeeId, exit] of exitOfEmployee) {
        if (exit && monthKey(exit) === month && inPlanAssignments.some((x) => x.employeeId === employeeId))
          leavers.add(employeeId)
      }
      return {
        month,
        closed: closeOf.has(month),
        heads: a.heads,
        fte: a.fte,
        starts: hires.size,
        knownExits: leavers.size,
        modeledExits: 0,
        backfills: 0,
        cohorts: {
          hris: { headsAtStart: atStart.size, modeledExits: 0 },
          band: { headsAtStart: 0, modeledExits: 0 },
        },
        cost,
      }
    }
    let hrisHeads = 0
    let hrisExits = 0
    let known = 0
    for (const m of members) {
      hrisHeads += m.presence[i]
      hrisExits += m.exits[i]
      if (m.exitIndex === i && m.presence[i] > 0) known += 1
    }
    let bandHeads = 0
    let bandExits = 0
    let backfills = 0
    for (const seat of seatList) {
      bandHeads += seat.band[i]
      bandExits += seat.bandExits[i]
      backfills += seat.backfills[i]
    }
    return {
      month,
      closed: false,
      heads: headsByMonth.get(month) ?? 0,
      fte: fteByMonth.get(month) ?? 0,
      starts: startsByIndex[i],
      knownExits: known,
      modeledExits: hrisExits + bandExits,
      backfills,
      cohorts: {
        hris: { headsAtStart: hrisHeads, modeledExits: hrisExits },
        band: { headsAtStart: bandHeads, modeledExits: bandExits },
      },
      cost,
    }
  })

  const fyMonths = new Set(monthsOf(version.fiscalYear))
  const yearCost = zeroUsd()
  let yearEndHeads = 0
  for (const m of months) {
    if (!fyMonths.has(m.month)) continue
    addUsd(yearCost, m.cost.filled)
    addUsd(yearCost, m.cost.band)
    yearEndHeads = m.heads
  }

  expectedStarts.sort((a, b) =>
    a.start !== b.start ? (a.start < b.start ? -1 : 1) : a.positionId < b.positionId ? -1 : 1,
  )
  return {
    asOf,
    closedThrough: lastClose,
    months,
    unfilledAtHorizon,
    yearEnd: { heads: yearEndHeads, cost: yearCost },
    expectedStarts,
    lines,
    seatCohorts: seatCohorts.sort((a, b) =>
      a.positionId !== b.positionId ? (a.positionId < b.positionId ? -1 : 1) : a.month < b.month ? -1 : 1,
    ),
    cohortParts: cohortParts.sort((a, b) =>
      a.lineId !== b.lineId
        ? a.lineId < b.lineId
          ? -1
          : 1
        : a.positionId < b.positionId
          ? -1
          : a.positionId > b.positionId
            ? 1
            : 0,
    ),
    suppressedBackfills,
  }
}
