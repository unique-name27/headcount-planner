/**
 * What each Plan figure and tile reads (its lineage, the template app's lineage.ts): typed field
 * references, so a figure's tier is the lowest of its fields' tiers, and the dictionary's `uses` and
 * the tiles' `uses` come from one place. The scope adds the fields the active filters read
 * (`scopeUses`).
 */
import type { FieldRef } from '@/data/quality/fieldRef'
import type { DatasetKey } from '@/data/schema'
import type { Filters } from '@/data/scope'
import { BAND, F, LOADED_COST, PLAN_LINE, uses } from '@/metrics/fields'

/** The datasets the Plan view reads (docs/PLAN.md 9.1). */
export const PLAN_DATASETS: readonly DatasetKey[] = [
  'positions',
  'workers',
  'comp',
  'reqs',
  'assumptions',
  'freezes',
]

/*
 * What each part of the view's engines reads (browser finding B4: a figure lists only the fields its
 * model reads, so its tier is the tier of what it stands on, not of every field near it). Each group
 * names the code path it stands for; `lineage.slow.test.ts` blanks every field a figure lists and
 * checks that the figure moves, or that `LINEAGE_NOTES` says why it reads the field all the same.
 */

/** A seat's row in effect on a day: its ID, dates and imported status, and an Eliminated row's last day (R34). */
const SEAT_ROWS = [
  'positions.positionId',
  'positions.effectiveDate',
  'positions.status',
  'positions.endDate',
] as const satisfies readonly FieldRef[]

/** Who holds a seat on a day: Employee assignments, from start to last day (the HRIS dates where an assignment has none). */
const HOLDING = [
  'workers.positionId',
  'workers.assignmentStart',
  'workers.assignmentEnd',
  'workers.hireDate',
  'workers.terminationDate',
  'workers.workerType',
] as const satisfies readonly FieldRef[]

/** Each employee once (actual heads count people, people not in the plan included). */
const PEOPLE = uses(['workers.employeeId'], HOLDING)

/** A seat's derived status on a day (6.5, R31): its row and who holds it. */
const STATUS = uses(SEAT_ROWS, HOLDING)

/** An Employee seat: contractor and intern seats are no heads and no openings. */
const SEAT_KIND = ['positions.workerType'] as const satisfies readonly FieldRef[]

/** A req as known on a day (cost.ts `reqAsOf`): opened, its offer, its close. */
const REQ_ON = [
  'reqs.positionId',
  'reqs.status',
  'reqs.stage',
  'reqs.openedDate',
  'reqs.offerAcceptedDate',
  'reqs.startDate',
  'reqs.closedDate',
] as const satisfies readonly FieldRef[]

/**
 * A seat's planned start (versions.ts `seatDetailOn`): an accepted offer's first day, its row's start,
 * or its replacement's (an open req's target start).
 */
const PLANNED_START = uses(['positions.startDate'], REQ_ON, ['reqs.targetStartDate'])

/** What a seat's plan line status and head read (6.5, R1): its status, kind and planned start. */
const LINE_STATUS = uses(STATUS, SEAT_KIND, PLANNED_START)

/** Openings: Open and Planned Employee seats nobody has started in, on the as-of date. */
const OPENINGS = uses(STATUS, SEAT_KIND)

/** An opening's target start: its accepted offer's first day, its open req's target start, else its planned start. */
const TARGET_START = uses(OPENINGS, PLANNED_START)

/** Employees hired into seats in scope: the worker row whose assignment starts on its hire date. */
const HIRES = uses(
  ['workers.employeeId', 'workers.positionId', 'workers.hireDate', 'workers.assignmentStart'],
  ['workers.workerType', 'positions.positionId'],
)

/** Plan > Hiring's approved seats: R1's test, the accepted offer's start, and later rows that end a seat. */
const HIRING_SEATS = uses(LINE_STATUS, REQ_ON)

/**
 * Plan > Hiring's future starts: the signed offers (Offer accepted, not started) on approved seats,
 * one per req (C37). Whether a seat with an offer is an approved head reads its rows, kind and
 * planned start, not who holds it (Filled and Open seats are both approved heads).
 */
const HIRING_ACCEPTED = uses(SEAT_ROWS, SEAT_KIND, PLANNED_START, ['reqs.reqId'])

/**
 * Plan > Hiring's open to hire: its seats, current heads, future starts and moves in. (The starts
 * count one per req ID; the ID is Future starts' own lineage, `HIRING_ACCEPTED`, as My team's probe
 * reads the tile.)
 */
const HIRING_OPEN = uses(HIRING_SEATS, PEOPLE)

/** Exits: the worker row in a seat in scope whose assignment holds the last day (a move is not one). */
const LEAVERS = [
  'workers.employeeId',
  'workers.positionId',
  'workers.hireDate',
  'workers.assignmentStart',
  'workers.assignmentEnd',
  'workers.terminationDate',
  'workers.workerType',
  'positions.positionId',
] as const satisfies readonly FieldRef[]

/** Hires and exits, in seats in scope. */
const HIRING_FLOWS = uses(HIRES, LEAVERS)

/**
 * The forecast's modeled exits, in heads (6.7): the seats and their holders, the reqs that time a
 * start and the offers that fix one (the band cohort's exits run from its starts), freezes by org
 * and dates, the approved requests that reopen or end a seat, and the fill and attrition
 * assumptions. Plan > Hiring never reads the forecast's starts (C37).
 */
const HIRING_FORECAST = uses(
  F.seat,
  F.assignment,
  ['reqs.positionId', 'reqs.status', 'reqs.openedDate', 'reqs.targetStartDate'],
  F.opened,
  F.offer,
  F.freeze.filter((r) => r !== 'freezes.freezeId'),
  F.tree,
  F.seatOrg,
  ['requests.type', 'requests.state', 'requests.positionId', 'requests.startDate'],
  F.assumptions,
)

/** Expected exits: known last days ahead in seats in scope, and the forecast's modeled exits. */
const HIRING_EXITS = uses(LEAVERS, HIRING_FORECAST)

/**
 * Plan > Recruiting summary's projected starts (docs/PLAN.md 9.8, change C38): the same forecast's
 * starts on Open and Planned seats with no signed offer, each at its fill rate after its time to
 * fill, which the forecast keys by the seat's level (forecast.ts `timeToFill[level]`), and its
 * modeled backfills. Signed offers are future starts (`HIRING_ACCEPTED`), never these.
 */
const RECRUITING_STARTS = uses(HIRING_FORECAST, ['positions.level'])

export const FIGURE = {
  /** Approved heads (R1): Filled, Open and Planned Employee seats with a start by the fiscal year's end. */
  approved: LINE_STATUS,
  actual: PEOPLE,
  /** Plan heads: positions whose line in the version is Filled at a month-end (a Working version's live lines). */
  plan: LINE_STATUS,
  /** Heads by month: actual heads at each closed month-end (people in scope) against the versions' plan heads. */
  headsVsPlan: uses(PEOPLE, LINE_STATUS),
  /**
   * Actual heads against the comparison's plan heads: HRIS people, and the comparison's seats in
   * scope. The comparison is a locked version, so its plan heads read its stored lines by position,
   * never a live seat row, req or request (B3, B4).
   */
  actualVsPlan: uses(PEOPLE, ['positions.positionId']),
  /**
   * Hires to date against the comparison's planned hires: HRIS hires into seats in scope, and the
   * comparison's seats, less those someone held on the year's first day (who holds a seat, and
   * whether an Eliminated row had ended it). The transfers that keep a seat out of planned hires are
   * the planned hires' own records' lineage (`hiresPlanned`), not the tile's.
   */
  hiresVsPlanned: uses(HIRES, ['positions.effectiveDate', 'positions.endDate'], HOLDING),
  fte: uses(PEOPLE, F.workerFte),
  hires: HIRES,
  hiresPlanned: uses(PLAN_LINE, F.request, F.transfer),
  /** Positions by derived status on the as-of date. */
  status: STATUS,
  /** How many openings: Open and Planned Employee seats nobody has started in. */
  openings: OPENINGS,
  /** The openings table: each opening's stage, req, target start, flags and dates. */
  openingsTable: uses(TARGET_START, F.opened, ['reqs.reqId'], F.tree, F.seatOrg, F.seatReqType, F.freeze),
  pastStart: TARGET_START,
  /** Planned seats starting within the setting's days with no req (any req not cancelled counts). */
  noReq: uses(OPENINGS, PLANNED_START),
  /** Openings a freeze holds: the freeze's org and dates, the seat's org and tree, backfill or not. */
  frozen: uses(TARGET_START, F.tree, F.seatOrg, F.seatReqType, F.freeze),
  /** Accepted offers not started yet. */
  offers: uses(OPENINGS, REQ_ON),
  /** Open and On hold reqs as known on the as-of date whose seat is no approved head. */
  reqsNotInPlan: uses(REQ_ON, LINE_STATUS),
  /** Days since each Open opening opened: its open req, its own opened date, or the day after its last holder left. */
  age: uses(OPENINGS, F.opened, REQ_ON),
  /** Openings by tracker stage: the stage of each opening's open req or offer. */
  stage: uses(OPENINGS, REQ_ON),
  /** Heads by unit: approved, actual and plan heads of each unit's seats. */
  byUnit: uses(PEOPLE, LINE_STATUS, ['positions.businessUnit']),
  cost: uses(LOADED_COST, F.seatOrg),
  band: uses(LINE_STATUS, F.seatType, F.offer, BAND),
  weight: BAND,
  /** The positions grid: each seat's line status by month, its type and org, band estimate and weight. */
  grid: uses(LINE_STATUS, F.seatType, ['positions.businessUnit', 'positions.department'], BAND),
  /** How many positions the grid lists: seats with a row in some month of it that are not Eliminated for all of it. */
  gridCount: STATUS,
  transfers: uses(F.request, F.requestFlow, F.transfer),
  /** The one leave count (7.7): people on leave on the as-of date in the mode's whole scope. */
  leave: uses(PEOPLE, F.leave),
  /**
   * The "Changed by your HRBP" notes (M3): audit entries, which are plan state and carry no dataset
   * tier, about the scope's seats (their IDs) with their titles.
   */
  changes: ['positions.positionId', 'positions.title'],
  /*
   * Plan > Hiring (docs/PLAN.md 9.7, change C36): heads, dates and IDs only, so no pay, offer amount,
   * band or leave field is ever listed (src/views/plan/engine/hiringTab.test.ts).
   */
  /** Approved seats by a quarter end: each seat's status, kind and planned start (R1), its accepted offer's start, and later rows that end it. */
  hiringSeats: HIRING_SEATS,
  /** Current heads, and heads at closed month-ends: each employee once, people not in plan included. */
  hiringHeads: PEOPLE,
  /** Future starts: the signed offers on approved seats, by their start dates (C37). */
  hiringAccepted: HIRING_ACCEPTED,
  /** Open to hire: approved seats by the quarter end, less current heads, future starts and moves in. */
  hiringOpen: HIRING_OPEN,
  /** Hires by month: the worker row that starts on its hire date, into a seat in scope. */
  hiringHires: HIRES,
  /** Exits by month: the worker row holding the last day, in a seat in scope. */
  hiringLeavers: LEAVERS,
  /** Hires and exits by month, and the net pace. */
  hiringFlows: HIRING_FLOWS,
  /** Expected exits: known last days ahead in seats in scope, and the forecast's modeled exits in heads. */
  hiringExits: HIRING_EXITS,
  /** The quarter table: every row of it. */
  hiringQuarters: uses(HIRING_OPEN, HIRING_ACCEPTED, HIRING_FLOWS, HIRING_EXITS),
  /**
   * Hiring velocity: the closed months' hires and exits, then the months ahead's future starts (the
   * signed offers by start month, C37) and expected exits.
   */
  hiringVelocity: uses(HIRING_FLOWS, HIRING_ACCEPTED, HIRING_EXITS),
  /**
   * Hires in the last 3 months by department and location (C37): the hires, and the department and
   * location of the seat each was hired into.
   */
  hiringRecent: uses(HIRES, ['positions.department', 'positions.location']),
  /** Attrition in heads: exits over the trailing closed months against the heads at their month-ends. */
  hiringAttrition: uses(LEAVERS, PEOPLE),
  /** Months to close: open to hire against the net hiring pace. */
  hiringMonthsToClose: uses(HIRING_OPEN, HIRING_FLOWS),
  /*
   * Plan > Recruiting summary (docs/PLAN.md 9.8, change C38): Plan > Hiring's numbers, plus the
   * forecast's starts on Open and Planned seats. Heads only.
   */
  /** Projected starts: the forecast's starts on Open and Planned seats at their fill rate, and its modeled backfills. */
  recruitingProjected: RECRUITING_STARTS,
  /** Projected heads: current heads, future starts and moves in, projected starts, less projected attrition. */
  recruitingHeads: uses(HIRING_OPEN, HIRING_ACCEPTED, RECRUITING_STARTS, HIRING_EXITS),
  /** Heads and hiring by month: the closed months' hires, exits and heads, then the months ahead. */
  recruitingMonths: uses(HIRING_FLOWS, HIRING_ACCEPTED, RECRUITING_STARTS, HIRING_EXITS, PEOPLE),
  /** By quarter ahead: approved heads by each quarter end against projected heads then. */
  recruitingQuarters: uses(HIRING_OPEN, HIRING_ACCEPTED, RECRUITING_STARTS, HIRING_EXITS),
} as const satisfies Record<string, readonly FieldRef[]>

/** The fields the filters read: a unit filter reads the positions' unit, a leader filter the tree. */
export function scopeUses(filters: Filters): FieldRef[] {
  const out: FieldRef[] = []
  if (filters.leaderId) out.push('positions.managerPositionId')
  if (filters.businessUnit.length) out.push('positions.businessUnit')
  if (filters.department.length) out.push('positions.department')
  if (filters.costCenter.length) out.push('positions.costCenter')
  if (
    filters.location.length ||
    filters.legalEntity.length ||
    filters.country.length ||
    filters.currency.length
  )
    out.push('positions.location')
  if (filters.level.length) out.push('positions.level')
  return out
}

/** Every field a figure group names, once. */
export const allRefs = (): FieldRef[] => uses(...Object.values(FIGURE))
