/**
 * What Plan > Hiring reads from the context (docs/PLAN.md 9.7, changes C36 and C37), once per analytics
 * context: the engine's input (src/plan/engine/hiring.ts `HiringInput`: dates, IDs and head counts
 * only) and, beside it, the records its drills open (worker rows, reqs, the forecast's seats). Pure.
 *
 * Readings taken here (the tab builder, hiring wave, and the review fixes of 25 Oct 2026):
 *  - The seats are the scope's positions on the as-of date that are approved heads for the fiscal
 *    year shown (R1 with that year's last day: Filled, not held for an approved internal move, or
 *    Open or Planned Employee seats with no planned start or one on or before the year end). For
 *    FY27 they are exactly Plan > Overview's approved heads (`seatsOnDay(p).approved`). Positions are
 *    shared plan state, so every version the picker shows reads the same seats (H3).
 *  - A seat's planned start is the one the approved-head test reads (versions.ts `seatDetailOn`: the
 *    row's start, or for a seat Open after an exit its replacement's start); its accepted start is
 *    the signed offer's start: the req at stage Offer accepted that nobody has started on. Only these
 *    are future starts (C37): no forecast or modeled start, no Open or Planned seat without one.
 *  - A seat's last approved day: the day before the first of its later rows (to the year end) from
 *    which it is no approved head (an approved Elimination, Trade, On hold or move out written ahead
 *    of time); an Eliminated row ends its seat the day after its last day (R34).
 *  - Current heads are actual heads on the as-of date (`actualOn`: Employee assignments in scope,
 *    people not in plan included, on leave included and never split out).
 *  - A hire is the worker row whose assignment starts on its hire date, into a seat in scope; an
 *    exit is the worker row in a seat in scope whose assignment holds the last day (`terminationDate`),
 *    so a move to another position is neither (H14). Each is keyed by the person and its day
 *    (`eventKey`), so every stint of a rehire is a hire and an exit of its own, as Plan > Openings'
 *    Hires YTD and the forecast count rows (review HN-3).
 *  - Known exits ahead (after the as-of date) are those last days, and also, as the forecast counts
 *    them (src/views/forecast/engine/heads.ts `exitDaysOf`, one reading for both): the last day of an
 *    assignment an approved Elimination or Trade ends (clipped at the seat's last day, R34, review
 *    HN-2), and the end of an assignment whose next assignment is outside the scope (a move out of
 *    it, dated ahead in the HRIS, review HN-5). Beyond the forecast, which is position based: the last
 *    days of people not in plan in the scope (they count in current heads, so their exit frees a head,
 *    review HN-11), and an approved internal move out of the scope that the HRIS has not recorded
 *    yet, dated the day before it takes effect.
 *  - An approved internal move (SC-6) the HRIS has not recorded yet puts the mover on the receiving
 *    seat from its effective date (review HN-5), so each scope reads what it will read once the HRIS
 *    records the move: in effect, the mover counts in current heads on the receiving seat (which
 *    counts as Filled) and not on the held seat; ahead, a move out of the scope is a known exit and a
 *    move into it a move in (`HiringMoveIn`: M(q), its own row since C37, never a future start). A
 *    move the HRIS dates ahead into a seat in scope from outside it is a move in too. A move inside
 *    the scope moves nothing. A request 8.4 rule 3 hides from the viewer is never read this way.
 *  - Heads at a closed month-end are the month's close where the plan has one (`closeHeadsIn`, as
 *    Plan > Overview's heads by month), else the scope's employees active on that month-end (the
 *    months before the first close in the trailing 12, and the end of a quarter that is over but not
 *    closed, review HN-8).
 *  - The last close is the plan's last close on or before the as-of date (`lastCloseOnOrBefore`):
 *    a close after the as-of date is a fact the as-of date does not know yet, so its months read as
 *    open months (review HN-10), each from the forecast's flows.
 *  - The forecast months are the Working forecast's months after that last close (projected, and any
 *    closed month after the as-of date) up to the shown fiscal year's last month
 *    (src/views/forecast/engine/run.ts `projectedMonths`), with the scope's modeled exits in heads
 *    (src/views/forecast/engine/heads.ts `forecastFlows`), never a cost part and never its expected
 *    starts (C37: the months ahead show signed offers only).
 *    For a later fiscal year (FY28 Working) they are the months its own Working forecast projects,
 *    and before its grid (FY28 Working's starts in April 2027) the as-of year's Working forecast's
 *    open months, so expected exits run from the as-of date (H5) and the velocity has no gap between
 *    the last close and the shown year (H24; integration, hiring wave). Each month is read from one
 *    forecast only.
 *  - In Manager mode the forecast nets the tree's modeled exits over the tree alone (its seats in a
 *    cohort of their own, `ForecastInput.ownCohort`, review HP-1): a known exit at or above the
 *    manager's seat, or of a peer outside the tree, never moves them. Other modes read the Forecast
 *    view's own run.
 *  - A request 8.4 rule 3 hides from the viewer (one on the viewer's own seat or a seat above it, such
 *    as Manager C's Elimination) never moves a count (9.7 Privacy), its effects included. Its plan rows
 *    sit on seats outside the scope (in Manager mode the tree strictly below the viewer's seat, R23),
 *    so no seat, head or offer here reads them; but the forecast's HRIS cohort nets each org's known
 *    exits against its modeled exits, so the holder of a seat such a row ends (clipped at an approved
 *    Elimination's last day, R34) would lower the scope's modeled exits in that month. The forecast
 *    Plan > Hiring reads is therefore the Working forecast without those rows (`hiringForecast`), the
 *    same run as the Forecast view's whenever there are none and the mode is not Manager (every
 *    other mode's own scope on the sample, and HR admin always).
 */
import { hiddenByRuleThree, viewerOf } from '@/access/visibility'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, fyRange, monthEnd, monthKey, monthRange, monthsOf, shiftMonth } from '@/data/fiscal'
import type { Datasets, ISODate, Month, PositionRow, PositionStatus, ReqRow, WorkerRow } from '@/data/schema'
import { requestsOf } from '@/drill/seats'
import { addDays } from '@/lib/dates'
import { reqAsOf } from '@/plan/engine/cost'
import { isActiveOn } from '@/plan/engine/heads'
import {
  HIRING_INPUT_KEYS,
  type HiringEvent,
  type HiringForecastMonth,
  type HiringHeadsAt,
  type HiringInput,
  type HiringMove,
  type HiringOffer,
  type HiringPerson,
  type HiringSeat,
  TRAILING_MONTHS,
} from '@/plan/engine/hiring'
import { heldForMove, type SeatDetail, seatDetailOn, workingOf } from '@/plan/engine/versions'
import type { AnyVersion, Position } from '@/plan/types'
import { type FPrep, prepare as forecastPrepare } from '@/views/forecast/engine/base'
import { exitDaysOf, forecastFlows, type MonthFlows } from '@/views/forecast/engine/heads'
import { forecastRunOf, projectedMonths } from '@/views/forecast/engine/run'
import { type Prep, prepare } from './base'
import { activeOn, closedMonthsOf, lastCloseOnOrBefore, perContext, seatsOf } from './core'
import { closeHeadsIn, seatsOnDay } from './heads'

/** Why a known exit is one: a last day in the HRIS, a seat an approved change ends, a move out of the scope, or a person not in plan. */
export type HiringExitKind = 'hris' | 'seat-ends' | 'move-out' | 'not-in-plan'

/** One person a count of people lists: who, the seat they hold in it (null: not in plan) and their worker row. */
export interface HiringPersonRow {
  personId: string
  positionId: string | null
  row: WorkerRow
  /** For an exit: why it is one (absent for heads and hires). */
  kind?: HiringExitKind
}

/**
 * A move into a seat in scope from outside it that has not started (review HN-5): an approved
 * internal move the HRIS has not recorded, or one the HRIS dates ahead. It counts in M(q), moves in
 * by the quarter end (C37), never in S(q)'s future starts, under its own ID (`move:<person>|<day>`).
 */
export interface HiringMoveIn {
  id: string
  personId: string
  positionId: string
  start: ISODate
}

/** Everything Plan > Hiring reads, built once per context. */
export interface HiringPrep {
  p: Prep
  input: HiringInput
  /** The shown fiscal year's last day. */
  fyEnd: ISODate
  /** The approved seats by position ID, as the engine reads them. */
  seats: ReadonlyMap<string, HiringSeat>
  /** Each seat's row on the as-of date (titles, org), for drills and findings. */
  positions: ReadonlyMap<string, Position>
  /** Current heads by person, with the row behind each. */
  current: ReadonlyMap<string, HiringPersonRow>
  /** Hires and exits by event (`eventKey`: the person and the day), every one in scope whatever the date. */
  hires: ReadonlyMap<string, HiringPersonRow>
  exits: ReadonlyMap<string, HiringPersonRow>
  /** The people behind each month-end's heads (`input.headsAt`). */
  headsAt: ReadonlyMap<Month, readonly HiringPersonRow[]>
  /** Signed offers (accepted, not started) by req ID, as known on the as-of date. */
  offers: ReadonlyMap<string, ReqRow>
  /** Moves into the scope that have not started, by their M(q) ID. */
  moves: ReadonlyMap<string, HiringMoveIn>
  /** The forecast's flows by month (heads), or null with no Working forecast. */
  flows: ReadonlyMap<Month, MonthFlows> | null
}

/** An event's key: the person and the day, so each stint of a rehire is its own hire and exit. */
export const eventKey = (personId: string, on: ISODate): string => `${personId}|${on}`

/** A move in's M(q) ID. */
export const moveInId = (personId: string, start: ISODate): string => `move:${personId}|${start}`

/** Whether an ID is a move in rather than a req (a req's ID can be blank in the data). */
export const isMoveIn = (id: string | null | undefined): boolean =>
  typeof id === 'string' && id.startsWith('move:')

const OPEN_OR_PLANNED: ReadonlySet<PositionStatus> = new Set<PositionStatus>(['Open', 'Planned'])

/** R1 for the fiscal year shown: an approved head for that year (the as-of year's own test when it is the same year). */
export function approvedFor(s: SeatDetail, fyEnd: ISODate): boolean {
  if (s.status === 'Filled') return !heldForMove(s.position, s.status)
  return (
    OPEN_OR_PLANNED.has(s.status) &&
    s.position.workerType === 'Employee' &&
    (s.plannedStart === null || s.plannedStart <= fyEnd)
  )
}

/** The day before the first later row (to the year end) from which the seat is no approved head; null when there is none. */
function lastApprovedDayOf(ctx: AnalyticsContext, positionId: string, asOf: ISODate, fyEnd: ISODate) {
  const seat = seatsOf(ctx).get(positionId)
  if (!seat) return null
  const days = new Set<ISODate>()
  for (const r of seat.rows) {
    if (r.effectiveDate > asOf && r.effectiveDate <= fyEnd) days.add(r.effectiveDate)
    // An Eliminated row ends its seat the day after its last day (R34).
    if (r.status === 'Eliminated' && r.endDate && r.endDate >= asOf && r.endDate < fyEnd)
      days.add(addDays(r.endDate, 1))
  }
  for (const d of [...days].sort()) {
    const s = seatDetailOn(seat, d)
    if (!s || !approvedFor(s, fyEnd)) return addDays(d, -1)
  }
  return null
}

const byPerson = (a: { personId: string }, b: { personId: string }) =>
  a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0
const byDay = (a: HiringEvent, b: HiringEvent) =>
  a.on < b.on ? -1 : a.on > b.on ? 1 : a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0

/**
 * The months whose heads the engine reads: the trailing 12 through the last close, the year's closed
 * months, and the end month of each of the year's quarters that is over but not closed (H19).
 */
function headsMonths(fyMonths: readonly Month[], last: Month | null, asOf: ISODate): Month[] {
  const out = new Set<Month>()
  if (last) {
    for (const m of monthRange(shiftMonth(last, 1 - TRAILING_MONTHS), last)) out.add(m)
    for (const m of fyMonths) if (m <= last) out.add(m)
  }
  for (let i = 2; i < fyMonths.length; i += 3) {
    const m = fyMonths[i]
    if (monthEnd(m) < asOf && (last == null || m > last)) out.add(m)
  }
  return [...out].sort()
}

const NO_ROWS: ReadonlySet<PositionRow> = new Set()
const NO_IDS: ReadonlySet<string> = new Set()

/** The requests 8.4 rule 3 hides from the viewer (none in HR admin, and none with no Acting as pick). */
function ruleThreeIds(ctx: AnalyticsContext): ReadonlySet<string> {
  const viewer = viewerOf(ctx)
  if (viewer.mode === 'hr-admin' || viewer.atOrAbove.size === 0) return NO_IDS
  const hidden = new Set<string>()
  for (const r of requestsOf(ctx)) if (hiddenByRuleThree(r, viewer)) hidden.add(r.requestId)
  return hidden.size ? hidden : NO_IDS
}

/**
 * The plan rows of requests 8.4 rule 3 hides from the viewer that sit on seats outside the scope:
 * the rows `hiringForecast` leaves out. None in HR admin, and none for a viewer with no Acting as pick.
 */
export function ruleThreeRows(
  ctx: AnalyticsContext,
  scopeIds: ReadonlySet<string>,
): ReadonlySet<PositionRow> {
  const hidden = ruleThreeIds(ctx)
  if (!hidden.size) return NO_ROWS
  const out = new Set<PositionRow>()
  for (const r of ctx.all.positions)
    if (r.sourceRequestId && hidden.has(r.sourceRequestId) && !scopeIds.has(r.positionId)) out.add(r)
  return out.size ? out : NO_ROWS
}

const withoutMemo = new WeakMap<Datasets, Map<string, Datasets>>()

/**
 * The datasets with some position rows left out, one object per datasets and row set, so the contexts
 * that leave out the same rows (Manager C and every manager below C) share one forecast run.
 */
function datasetsWithout(all: Datasets, rows: ReadonlySet<PositionRow>): Datasets {
  const key = [...rows]
    .map((r) => `${r.positionId}|${r.effectiveDate}|${r.sourceRequestId ?? ''}`)
    .sort()
    .join(' ')
  let byKey = withoutMemo.get(all)
  if (!byKey) {
    byKey = new Map()
    withoutMemo.set(all, byKey)
  }
  let hit = byKey.get(key)
  if (!hit) {
    hit = { ...all, positions: all.positions.filter((r) => !rows.has(r)) }
    byKey.set(key, hit)
  }
  return hit
}

/** The seats a Manager's forecast nets over alone (review HP-1); null in every other mode. */
const ownCohortOf = (ctx: AnalyticsContext, scopeIds: ReadonlySet<string>): ReadonlySet<string> | null =>
  ctx.access.mode === 'manager' && scopeIds.size > 0 ? scopeIds : null

/**
 * The forecast Plan > Hiring reads (see the module comment): the Forecast view's own preparation for
 * the shown version (or for `version`'s Working forecast when given), its run computed without the
 * plan rows rule 3 hides from the viewer when there are any, and in Manager mode with the tree's
 * seats in a cohort of their own. With none of these, it is the Forecast view's own preparation, the
 * same object. `forecastFlows` reads its run, scope and context.
 */
export function hiringForecast(
  ctx: AnalyticsContext,
  scopeIds: ReadonlySet<string>,
  version?: AnyVersion,
): FPrep {
  const rows = ruleThreeRows(ctx, scopeIds)
  const own = ownCohortOf(ctx, scopeIds)
  if (!rows.size && !own) {
    const fp = forecastPrepare(ctx)
    if (version === undefined || version === fp.working) return fp
  }
  // A run of its own: the Forecast view's run is not computed for it (Manager mode reads only this).
  const p = prepare(ctx)
  const run = forecastRunOf(
    rows.size ? { ...ctx, all: datasetsWithout(ctx.all, rows) } : ctx,
    version ?? p.version,
    own ? { ownCohort: own } : {},
  )
  if (!run)
    return { ...p, run: null, working: null, lines: [], costLines: [], projected: [], actualThrough: null }
  const fy = new Set(p.fyMonths)
  return {
    ...p,
    run,
    working: run.version,
    lines: run.lines.filter((l) => scopeIds.has(l.positionId)),
    // Heads only: no cost selection rides along.
    costLines: [],
    projected: projectedMonths(run).filter((m) => fy.has(m)),
    actualThrough: run.actualThrough,
  }
}

/** The open months Plan > Hiring reads and each one's flows in the scope (see the module comment). */
export interface HiringForecastFlows {
  /** From the month after the last close to the shown year's last month, each with a forecast. */
  months: readonly Month[]
  flows: ReadonlyMap<Month, MonthFlows>
}

/**
 * The forecast's months to the shown year's end after the last close the as-of date knows
 * (`lastClose`, the plan's last close when omitted): the shown year's Working forecast's, a closed
 * month after the as-of date included (its flows are its actuals), and before the shown forecast's
 * grid the as-of year's Working forecast's (a later year shown). Null with no Working forecast.
 */
export function hiringForecastFlows(
  ctx: AnalyticsContext,
  scopeIds: ReadonlySet<string>,
  fyEnd: ISODate,
  lastClose?: Month | null,
): HiringForecastFlows | null {
  const shown = hiringForecast(ctx, scopeIds)
  if (!shown.run) return null
  const last = monthKey(fyEnd)
  const own = forecastFlows(shown)
  const months: Month[] = []
  const flows = new Map<Month, MonthFlows>()
  const take = (m: Month, f: MonthFlows | undefined) => {
    if (!f || flows.has(m)) return
    months.push(m)
    flows.set(m, f)
  }
  const gridStart = shown.run.months[0]
  const asOfYear = fiscalYearOf(ctx.asOf)
  if (gridStart && shown.run.version.fiscalYear !== asOfYear) {
    const v = workingOf(ctx.versions, asOfYear)
    const before = v ? hiringForecast(ctx, scopeIds, v) : null
    if (before?.run) {
      const f = forecastFlows(before)
      const from =
        lastClose != null && lastClose < before.run.actualThrough ? lastClose : before.run.actualThrough
      for (const m of before.run.months) if (m > from && m < gridStart && m <= last) take(m, f.get(m))
    }
  }
  // Closed months after the as-of date (a close the as-of date does not know yet) read as open months.
  const from = lastClose != null && lastClose < shown.run.actualThrough ? lastClose : shown.run.actualThrough
  for (const m of shown.run.months) if (m > from && m <= last) take(m, own.get(m))
  months.sort()
  return { months, flows }
}

/** An approved internal move the HRIS has not recorded (SC-6): who moves, from and to which seat, from when. */
interface PlanMove {
  requestId: string
  personId: string
  row: WorkerRow
  from: string
  to: string
  on: ISODate
}

/**
 * The approved internal moves the HRIS has not recorded yet, read from the rows `applyTransfer`
 * writes (the held seat's On hold row and the receiving seat's Filled row, both with the request's
 * ID): the mover is the held seat's holder on the day before the move. A move the HRIS has recorded
 * (an assignment of the mover on the receiving seat) is the HRIS's, and a request rule 3 hides from
 * the viewer is never read.
 */
function planMovesOf(ctx: AnalyticsContext): PlanMove[] {
  const held = new Map<string, PositionRow>()
  const filled = new Map<string, PositionRow[]>()
  for (const r of ctx.all.positions) {
    if (!r.sourceRequestId) continue
    if (r.status === 'On hold') {
      const k = `${r.sourceRequestId}|${r.positionId}`
      const cur = held.get(k)
      if (!cur || r.effectiveDate < cur.effectiveDate) held.set(k, r)
    } else if (r.status === 'Filled') {
      const list = filled.get(r.sourceRequestId)
      if (list) list.push(r)
      else filled.set(r.sourceRequestId, [r])
    }
  }
  if (!held.size) return []
  const hidden = ruleThreeIds(ctx)
  const seats = seatsOf(ctx)
  const out: PlanMove[] = []
  for (const r of held.values()) {
    const requestId = r.sourceRequestId as string
    if (hidden.has(requestId)) continue
    const to = (filled.get(requestId) ?? []).find((x) => x.positionId !== r.positionId)
    if (!to) continue
    const before = addDays(r.effectiveDate, -1)
    const holder = seats.get(r.positionId)?.assignments.find((a) => isActiveOn(a, before))
    if (!holder) continue
    const rows = ctx.all.workers.filter((w) => w.employeeId === holder.employeeId)
    if (rows.some((w) => w.positionId === to.positionId)) continue
    const row = rows.find((w) => w.positionId === r.positionId) ?? rows[0]
    if (!row) continue
    out.push({
      requestId,
      personId: holder.employeeId,
      row,
      from: r.positionId,
      to: to.positionId,
      on: r.effectiveDate,
    })
  }
  return out.sort((a, b) => (a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0))
}

/** Plan > Hiring's reading of the context (cached per context). */
export const hiringPrepOf = perContext((ctx: AnalyticsContext): HiringPrep => {
  const p = prepare(ctx)
  const asOf = ctx.asOf
  const fyEnd = fyRange(p.fiscalYear).end
  const lastClose = lastCloseOnOrBefore(ctx.plan, asOf)?.month ?? null
  const ids = p.scope.ids

  /* seats and accepted offers */
  const seats = new Map<string, HiringSeat>()
  const positions = new Map<string, Position>()
  const offerList: HiringOffer[] = []
  const offers = new Map<string, ReqRow>()
  const day = seatsOnDay(p, p.on)
  for (const [id, s] of day.states) {
    if (!approvedFor(s, fyEnd)) continue
    const filled = s.status === 'Filled'
    const offer = s.acceptedOffer
    const start = offer?.startDate ?? null
    seats.set(id, {
      positionId: id,
      filled,
      acceptedStart: start,
      plannedStart: filled ? null : s.plannedStart,
      lastApprovedDay: lastApprovedDayOf(ctx, id, asOf, fyEnd),
    })
    positions.set(id, s.position)
    if (offer && start) {
      offerList.push({ reqId: offer.reqId, positionId: id, startDate: start })
      offers.set(offer.reqId, reqAsOf(offer, asOf) ?? offer)
    }
  }

  /* current heads */
  const current = new Map<string, HiringPersonRow>()
  for (const [personId, e] of activeOn(p.scope, asOf))
    current.set(personId, { personId, positionId: e.assignment.positionId ?? null, row: e.worker })

  /* hires and exits, one per person and day */
  const hires = new Map<string, HiringPersonRow>()
  const exits = new Map<string, HiringPersonRow>()
  const addExit = (x: HiringPersonRow, on: ISODate) => {
    const k = eventKey(x.personId, on)
    if (!exits.has(k)) exits.set(k, x)
  }
  const exitOn = new Map<string, ISODate>()
  // Each person's last day in the scope as the forecast reads it (clipped at an approved
  // Elimination's last day, R34): a later HRIS last day of the same stint is that one exit, not two.
  const seatRows = seatsOf(ctx)
  const rowsOfSeat = (id: string): readonly PositionRow[] => seatRows.get(id)?.rows ?? []
  const lastDays = exitDaysOf(p.scope.assignments, rowsOfSeat)
  const clippedBefore = (personId: string, last: ISODate): boolean => {
    const x = lastDays.get(personId)
    return x?.end != null && x.end > asOf && x.end < last
  }
  for (const w of p.scope.workers) {
    const seat = w.positionId
    const start = w.assignmentStart || w.hireDate
    const last = w.terminationDate
    if (!seat) {
      // A person not in plan counts in current heads, so a known last day of theirs frees a head (HN-11).
      if (last && last > asOf && start <= last) {
        addExit({ personId: w.employeeId, positionId: null, row: w, kind: 'not-in-plan' }, last)
        exitOn.set(eventKey(w.employeeId, last), last)
      }
      continue
    }
    if (!ids.has(seat)) continue
    const hk = eventKey(w.employeeId, w.hireDate)
    if (start === w.hireDate && !hires.has(hk))
      hires.set(hk, { personId: w.employeeId, positionId: seat, row: w })
    if (last && start <= last && (!w.assignmentEnd || w.assignmentEnd >= last)) {
      if (last > asOf && clippedBefore(w.employeeId, last)) continue
      addExit({ personId: w.employeeId, positionId: seat, row: w, kind: 'hris' }, last)
      exitOn.set(eventKey(w.employeeId, last), last)
    }
  }
  // The ends the forecast counts too (HN-2, HN-5): an assignment an approved Elimination or Trade
  // ends, and a move out of the scope dated ahead, read as the forecast reads them.
  for (const [personId, x] of lastDays) {
    if (x.end == null || x.end <= asOf || !x.positionId || !ids.has(x.positionId)) continue
    if (exits.has(eventKey(personId, x.end))) continue
    const row =
      p.scope.workers
        .filter((w) => w.employeeId === personId && w.positionId === x.positionId)
        .sort((a, b) =>
          (a.assignmentStart || a.hireDate) < (b.assignmentStart || b.hireDate) ? 1 : -1,
        )[0] ?? null
    if (!row) continue
    // Unclipped, the assignment ends on that day (a move out); clipped, an approved change ends its seat first.
    const kind: HiringExitKind = endOf(row) === x.end ? 'move-out' : 'seat-ends'
    addExit({ personId, positionId: x.positionId, row, kind }, x.end)
    exitOn.set(eventKey(personId, x.end), x.end)
  }

  /* moves the HRIS has not recorded, and moves in dated ahead (HN-5) */
  const moves = new Map<string, HiringMoveIn>()
  const addMove = (personId: string, positionId: string, start: ISODate) => {
    const seat = seats.get(positionId)
    if (!seat) return
    const id = moveInId(personId, start)
    if (moves.has(id)) return
    moves.set(id, { id, personId, positionId, start })
    // The move takes the seat from its start, as an accepted offer does (H2's first head day).
    if (!seat.filled && !(seat.acceptedStart && seat.acceptedStart < start))
      seats.set(positionId, { ...seat, acceptedStart: start })
  }
  for (const m of planMovesOf(ctx)) {
    const fromIn = ids.has(m.from)
    const toIn = ids.has(m.to)
    if (!fromIn && !toIn) continue
    if (m.on <= asOf) {
      // In effect: the mover is on the receiving seat, which counts as Filled.
      if (fromIn && current.get(m.personId)?.positionId === m.from) current.delete(m.personId)
      if (toIn) {
        current.set(m.personId, { personId: m.personId, positionId: m.to, row: m.row })
        const seat = seats.get(m.to)
        if (seat) seats.set(m.to, { ...seat, filled: true, acceptedStart: null, plannedStart: null })
      }
    } else if (fromIn && !toIn) {
      const last = addDays(m.on, -1)
      addExit({ personId: m.personId, positionId: m.from, row: m.row, kind: 'move-out' }, last)
      exitOn.set(eventKey(m.personId, last), last)
    } else if (toIn && !fromIn) addMove(m.personId, m.to, m.on)
  }
  for (const w of p.scope.workers) {
    const seat = w.positionId
    const start = w.assignmentStart || w.hireDate
    if (!seat || !ids.has(seat) || start <= asOf || start === w.hireDate || current.has(w.employeeId))
      continue
    const employed = ctx.all.workers.some(
      (x) =>
        x.employeeId === w.employeeId &&
        (x.workerType || 'Employee') === 'Employee' &&
        isActiveOn({ start: x.assignmentStart || x.hireDate, end: endOf(x) }, asOf),
    )
    if (employed) addMove(w.employeeId, seat, start)
  }
  // Moves in are M(q), never future starts (C37): S(q) holds signed offers only.
  const moveList: HiringMove[] = [...moves.values()]
    .map((m) => ({ moveId: m.id, positionId: m.positionId, startDate: m.start }))
    .sort((a, b) => (a.moveId < b.moveId ? -1 : a.moveId > b.moveId ? 1 : 0))
  offerList.sort((a, b) => (a.reqId < b.reqId ? -1 : a.reqId > b.reqId ? 1 : 0))

  const people: HiringPerson[] = [...current.values()]
    .map((x) => ({ personId: x.personId, positionId: x.positionId }))
    .sort(byPerson)
  const hireEvents: HiringEvent[] = [...hires.values()]
    .map((x) => ({ personId: x.personId, positionId: x.positionId, on: x.row.hireDate }))
    .sort(byDay)
  const exitEvents: HiringEvent[] = [...exits.entries()]
    .map(([k, x]) => ({ personId: x.personId, positionId: x.positionId, on: exitOn.get(k) as ISODate }))
    .sort(byDay)

  /* heads at closed month-ends */
  const closed = new Set(closedMonthsOf(ctx.plan))
  const headsAtPeople = new Map<Month, HiringPersonRow[]>()
  const headsAt: HiringHeadsAt[] = []
  const rowsByPerson = new Map<string, WorkerRow[]>()
  for (const w of p.scope.workers) {
    const list = rowsByPerson.get(w.employeeId)
    if (list) list.push(w)
    else rowsByPerson.set(w.employeeId, [w])
  }
  /** A person's worker row in scope on a day: the latest to start by then. */
  const rowOf = (employeeId: string, on: ISODate): WorkerRow | null => {
    let best: WorkerRow | null = null
    for (const w of rowsByPerson.get(employeeId) ?? []) {
      const start = w.assignmentStart || w.hireDate
      if (start <= on && (!best || start >= (best.assignmentStart || best.hireDate))) best = w
    }
    return best ?? rowsByPerson.get(employeeId)?.[0] ?? null
  }
  for (const m of headsMonths(monthsOf(p.fiscalYear), lastClose, asOf)) {
    const end = monthEnd(m)
    const list: HiringPersonRow[] = []
    if (closed.has(m) && lastClose != null && m <= lastClose) {
      for (const l of closeHeadsIn(p, m)) {
        const row = rowOf(l.employeeId, end)
        if (row) list.push({ personId: l.employeeId, positionId: l.closePositionId ?? null, row })
      }
    } else {
      for (const [personId, e] of activeOn(p.scope, end))
        list.push({ personId, positionId: e.assignment.positionId ?? null, row: e.worker })
    }
    list.sort(byPerson)
    headsAtPeople.set(m, list)
    headsAt.push({ month: m, heads: list.length })
  }

  /* the forecast's open months, in heads */
  const open = hiringForecastFlows(ctx, ids, fyEnd, lastClose)
  const flows = open?.flows ?? null
  const forecast: HiringForecastMonth[] = []
  for (const m of open?.months ?? []) {
    const f = open?.flows.get(m)
    // Modeled exits only: no forecast start reaches Plan > Hiring (C37).
    forecast.push({ month: m, modeledExits: f?.modeledExits ?? 0 })
  }

  const input: HiringInput = {
    asOf,
    fiscalYear: p.fiscalYear,
    lastClose,
    seats: [...seats.values()],
    people,
    offers: offerList,
    moves: moveList,
    hires: hireEvents,
    exits: exitEvents,
    headsAt,
    forecast,
  }
  return {
    p,
    input: onlyKeys(input),
    fyEnd,
    seats,
    positions,
    current,
    hires,
    exits,
    headsAt: headsAtPeople,
    offers,
    moves,
    flows,
  }
})

/** A worker row's last day on its assignment: the earlier of its end and the person's last day. */
function endOf(w: WorkerRow): ISODate | null {
  const a = w.assignmentEnd || null
  const t = w.terminationDate || null
  return a && t ? (a < t ? a : t) : (a ?? t)
}

/** The input with exactly the listed keys on every record (heads, dates and IDs only: `HIRING_INPUT_KEYS`). */
function onlyKeys(input: HiringInput): HiringInput {
  const pick = <T extends object>(o: T, keys: readonly string[]): T =>
    Object.fromEntries(keys.map((k) => [k, (o as Record<string, unknown>)[k]])) as T
  const K = HIRING_INPUT_KEYS
  return {
    ...pick(input, K.input),
    seats: input.seats.map((x) => pick(x, K.seat)),
    people: input.people.map((x) => pick(x, K.person)),
    offers: input.offers.map((x) => pick(x, K.offer)),
    moves: input.moves.map((x) => pick(x, K.move)),
    hires: input.hires.map((x) => pick(x, K.event)),
    exits: input.exits.map((x) => pick(x, K.event)),
    headsAt: input.headsAt.map((x) => pick(x, K.headsAt)),
    forecast: input.forecast.map((x) => pick(x, K.forecast)),
  }
}
