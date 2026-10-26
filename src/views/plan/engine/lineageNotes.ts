/**
 * Why a figure lists a field whose blank, on its own, moves nothing on the sample (browser finding
 * B4). `lineage.slow.test.ts` blanks every field each Plan figure, tile and hero lists, one at a
 * time, in HR admin, HRBP and Manager mode; a field that moves nothing must be named here for that
 * figure, and a note must hold up:
 *
 *  - 'together': the fields are read as one value, each standing in when another is blank (an
 *    assignment's start date and the hire date; a req's fields and the seat's own start). The test
 *    blanks them all at once, and that must move the figure.
 *  - 'default': a blank reads as the value every sample row already has (a blank worker type reads
 *    Employee; an Eliminated row with no last day ends its seat on its own date, which is the day
 *    after the last day for every approval's row).
 *  - 'absent': the code path that reads the field has no case on the sample at the dates read.
 *  - 'snapshot': the figure reads plan state that holds these fields as they were (a month close, a
 *    locked version's lines), so today's rows move it only for the months still open.
 *  - 'mode': a person-level rule (8.4) reads the field to decide what a viewer sees, and every
 *    viewer probed sees the same.
 *
 * A note none of whose fields stays still is stale, and the test fails on it too. Plain data.
 */
import type { FieldRef } from '@/data/quality/fieldRef'

export interface LineageNote {
  fields: readonly FieldRef[]
  kind: 'together' | 'default' | 'absent' | 'snapshot' | 'mode'
  why: string
}

const note = (kind: LineageNote['kind'], fields: readonly FieldRef[], why: string): LineageNote => ({
  kind,
  fields,
  why,
})

/* ───────────── reusable notes ───────────── */

export const START = note(
  'together',
  ['workers.assignmentStart', 'workers.hireDate'],
  'An assignment starts on its own start date, else on the hire date (heads.ts toAssignments): with one blank, the other gives the start.',
)

export const END = note(
  'together',
  ['workers.assignmentEnd', 'workers.terminationDate'],
  'An assignment ends on the earlier of its end date and the termination date: with one blank, the other still ends it.',
)

export const KIND = note(
  'default',
  ['workers.workerType', 'positions.workerType'],
  'A blank worker type reads Employee (5.2). Every seat in the sample is an Employee seat, and contractors and interns hold no seat, so a blank changes no seat or holder.',
)

export const ELIMINATED_END = note(
  'default',
  ['positions.endDate'],
  'An Eliminated row ends its seat the day after its last day, or from its own date when the last day is blank (R34). An approval writes the row the day after the last day, so both read the same day.',
)

export const REQ_AS_OF = note(
  'absent',
  ['reqs.openedDate', 'reqs.offerAcceptedDate', 'reqs.closedDate'],
  'A req reads as it was known on the day read (cost.ts reqAsOf): opened, accepted or closed after that day, it reads as it was then. No req in the sample is opened, accepted or closed after the as-of date.',
)

/** The req fields a planned start reads (an accepted offer's first day, an open req's target start). */
const REQ_START: readonly FieldRef[] = [
  'reqs.positionId',
  'reqs.status',
  'reqs.stage',
  'reqs.startDate',
  'reqs.targetStartDate',
  'reqs.openedDate',
  'reqs.offerAcceptedDate',
]

export const PLANNED_START_IN_YEAR = note(
  'absent',
  ['positions.startDate', ...REQ_START, 'reqs.closedDate'],
  'A seat counts this year when its planned start (its row’s start, an accepted offer’s first day or its replacement’s req) is by the fiscal year’s end, or it has none (R1). No seat with a row on the date read starts after the year’s end on the sample.',
)

export const TARGET_START = note(
  'together',
  [...REQ_START, 'positions.startDate'],
  'An opening’s target start is its accepted offer’s first day, else its open req’s target start, else the seat’s own planned start: each covers for the others when one is blank.',
)

export const REQ_STAGE = note(
  'together',
  ['reqs.positionId', 'reqs.status', 'reqs.stage', 'reqs.startDate', 'reqs.openedDate'],
  'An opening’s stage is its accepted offer or its latest open req (stage, status, opened date): blank one, and the opening reads its stage from what is left.',
)

export const OPENED = note(
  'together',
  ['positions.openedDate', 'reqs.openedDate', 'reqs.positionId', 'reqs.status'],
  'An Open seat opened on its latest open req’s opened date, else its own opened date, else the day after its last holder left (forecast.ts openedOn): each covers for the others.',
)

export const BANDS_COMPANY_WIDE = note(
  'absent',
  ['assumptions.org'],
  'Bands, loads and trade rates fall back from the org to the unit to the company. The sample keys only fill rate and attrition by org, so a blank org changes no band or weight.',
)

export const FULL_TIME = note(
  'default',
  ['positions.fte'],
  'A blank FTE reads 1, and every Open and Planned seat in the sample is full time.',
)

export const FREEZES_WHOLE = note(
  'absent',
  [
    'freezes.department',
    'freezes.costCenter',
    'freezes.leaderPositionId',
    'freezes.startDate',
    'freezes.endDate',
    'freezes.allowBackfill',
    'positions.department',
    'positions.costCenter',
    'positions.managerPositionId',
    'positions.reqType',
  ],
  'A freeze holds openings in its org (unit, department, cost center or leader’s tree) between its dates, backfills only without allowBackfill. The sample’s freezes are whole units, open on the as-of date with no backfill allowed, so the narrower keys, the dates and a seat’s backfill flag decide nothing there.',
)

export const CLOSES = note(
  'snapshot',
  [
    'assumptions.org',
    'comp.baseSalary',
    'comp.currency',
    'comp.targetBonusPct',
    'positions.costCenter',
    'positions.department',
    'positions.effectiveDate',
    'positions.endDate',
    'positions.fte',
    'positions.level',
    'positions.location',
    'positions.startDate',
    'positions.status',
    'positions.workerType',
    'reqs.agencyFee',
    'reqs.offerAcceptedDate',
    'reqs.offerBase',
    'reqs.offerCurrency',
    'reqs.openedDate',
    'reqs.positionId',
    'reqs.relocation',
    'reqs.reqId',
    'reqs.signOnBonus',
    'reqs.stage',
    'reqs.startDate',
    'reqs.status',
    'reqs.targetStartDate',
    'workers.assignmentEnd',
    'workers.assignmentStart',
    'workers.fte',
    'workers.hireDate',
    'workers.terminationDate',
    'workers.workerType',
  ],
  'Cost to date reads its closed months from the month closes (6.6, C32, C33 (e)), which hold the lines these fields gave at each close; today’s rows price only the months not closed yet.',
)

export const CLOSE_HEADS = note(
  'snapshot',
  [
    'workers.assignmentEnd',
    'workers.assignmentStart',
    'workers.positionId',
    'workers.terminationDate',
    'workers.workerType',
    'workers.hireDate',
  ],
  'Actual heads at a closed month-end come from that month’s close (closeHeadsIn), which holds who was a head then; today’s rows only place the people in scope.',
)

export const LEAVE_SCOPE = note(
  'absent',
  [
    'workers.assignmentEnd',
    'workers.assignmentStart',
    'workers.positionId',
    'workers.terminationDate',
    'workers.workerType',
  ],
  'The leave count reads who is active on the as-of date in the whole scope (src/access/leaveScopes.ts); a person placed by their seat or by their own HRIS unit lands in the same unit on the sample, and nobody on leave changes seat or ends near it.',
)

export const TRANSFER_FIELDS = note(
  'together',
  ['requests.fromPositionId', 'requests.positionId', 'requests.effectiveDate', 'requests.startDate'],
  'A transfer moves from its from seat, else the request’s seat, and takes effect on its effective date, else the request’s start date (requests.ts fromRow).',
)

export const REQUEST_VIEW = note(
  'mode',
  [
    'requests.requesterId',
    'requests.submittedById',
    'requests.steps',
    'requests.businessUnit',
    'requests.managerPositionId',
    'requests.submittedAt',
    'requests.updatedAt',
    'requests.personId',
    'requests.toManagerPositionId',
    'requests.toPositionId',
    'requests.transferKind',
    'requests.requestId',
    'requests.type',
    'requests.state',
    'positions.businessUnit',
    'positions.managerPositionId',
  ],
  'Who sees a transfer in full (8.4 rules 1 and 2a: its requester, submitter, approvers, the HRBP of a unit it touches, managers above either side) and where it shows; HR admin, the HRBP of the sample’s transfers’ unit and Manager A see the same rows whichever of these is blank, and a draft lists only for the person who processed it.',
)

export const CHANGES = note(
  'snapshot',
  ['positions.positionId', 'positions.title', 'positions.businessUnit', 'positions.managerPositionId'],
  'The notes come from the audit log, which is plan state: the sample has none, so the list is empty whatever the rows say. The rows name each noted seat and its title, in the scope.',
)

export const NO_DRAFTS = note(
  'absent',
  [
    'requests.requestId',
    'requests.type',
    'requests.state',
    'requests.positionId',
    'requests.businessUnit',
    'requests.managerPositionId',
    'requests.startDate',
    'requests.requesterId',
    'requests.submittedAt',
    'requests.updatedAt',
    'requests.steps',
    'requests.transferKind',
    'requests.personId',
    'requests.fromPositionId',
    'requests.toManagerPositionId',
    'requests.toPositionId',
    'requests.effectiveDate',
    'positions.businessUnit',
    'positions.managerPositionId',
  ],
  'The list holds the Acting as person’s own transfer drafts; the sample has none, so it is empty whatever the rows say until someone processes a transfer (edits.scenario.test.ts walks one).',
)

export const TRANSFERS_DECIDED = note(
  'absent',
  ['requests.fromPositionId', 'requests.positionId', 'requests.effectiveDate', 'requests.startDate'],
  'A transfer is in progress while it waits on a step, or approved with an effective date after the as-of date. The sample’s one transfer in progress waits on a step and its two approved ones took effect before the as-of date, so where they move from and when decide no count.',
)

export const NEVER_HELD = note(
  'absent',
  ['workers.assignmentEnd', 'workers.terminationDate'],
  'The openings this figure counts have had no holder on the sample, so no last day decides anything for them.',
)

export const HOLDERS_ALIVE = note(
  'absent',
  [
    'workers.positionId',
    'workers.assignmentStart',
    'workers.assignmentEnd',
    'workers.hireDate',
    'workers.terminationDate',
  ],
  'The count asks only whether a seat is Eliminated for the whole grid. Who holds a seat turns it Filled or Open, never Eliminated, unless an Eliminated row has a holder before its last day, which no sample seat has.',
)

export const NONE_OFF_PLAN = note(
  'absent',
  [
    'positions.businessUnit',
    'positions.managerPositionId',
    'positions.startDate',
    'positions.endDate',
    'positions.workerType',
    'reqs.status',
    'reqs.stage',
    'reqs.openedDate',
    'reqs.offerAcceptedDate',
    'reqs.startDate',
    'reqs.closedDate',
    'reqs.targetStartDate',
    'workers.positionId',
    'workers.assignmentStart',
    'workers.assignmentEnd',
    'workers.hireDate',
    'workers.terminationDate',
    'workers.workerType',
  ],
  'A req counts when it is Open or On hold on the as-of date and its seat is blank, unknown or no approved head. No open req in the sample is off plan (story 7’s cases are people, not reqs), and a seat’s holder, kind or start turns none of their seats from an approved head into another.',
)

export const SEAT_HOLDERS = note(
  'absent',
  ['workers.positionId'],
  'Who holds a seat decides whether it is Open or Filled; on the sample the seats this figure reads (Open and Planned seats, or the reqs on them) have no holder whatever the column says.',
)

export const TREE = note(
  'absent',
  ['positions.managerPositionId', 'positions.businessUnit'],
  'The scope of a mode (a manager’s tree, an HRBP’s unit) reads these; the seats the figure counts sit in the same scope on the sample with them blank, because the scope is pinned from the as-of date’s position tree.',
)

export const SEATS_NOT_HOLDERS = note(
  'absent',
  ['workers.assignmentEnd'],
  'Approved heads count Filled, Open and Planned seats alike, and an Eliminated row ends its seat whoever still holds it (R34): a holder’s last day turns a Filled seat Open, which counts the same.',
)

/* ───────────── by figure or tile id ───────────── */

export const LINEAGE_NOTES: Readonly<Record<string, readonly LineageNote[]>> = {
  approved: [START, KIND, ELIMINATED_END, PLANNED_START_IN_YEAR, SEATS_NOT_HOLDERS],
  actual: [START, END],
  openings: [START, END, KIND, ELIMINATED_END],
  'past-start': [START, NEVER_HELD, KIND, ELIMINATED_END, TARGET_START, REQ_AS_OF],
  'cost-ytd': [CLOSES],
  positions: [HOLDERS_ALIVE, KIND, ELIMINATED_END],
  'plan-year-end': [START, KIND, ELIMINATED_END, PLANNED_START_IN_YEAR],
  'standard-heads': [BANDS_COMPANY_WIDE],
  'open-band': [START, END, KIND, ELIMINATED_END, BANDS_COMPANY_WIDE, FULL_TIME, REQ_AS_OF, SEAT_HOLDERS],
  frozen: [START, END, KIND, ELIMINATED_END, TARGET_START, REQ_AS_OF, FREEZES_WHOLE],
  'no-req': [START, NEVER_HELD, KIND, ELIMINATED_END, TARGET_START, REQ_AS_OF, SEAT_HOLDERS, TREE],
  'hires-ytd': [START, END, KIND, ELIMINATED_END],
  offers: [START, END, KIND, ELIMINATED_END, REQ_AS_OF, REQ_STAGE, SEAT_HOLDERS, TREE],
  'reqs-not-in-plan': [START, NONE_OFF_PLAN],
  age: [START, END, KIND, ELIMINATED_END, REQ_AS_OF, REQ_STAGE, OPENED],
  'transfers-open': [TRANSFERS_DECIDED, REQUEST_VIEW],
  'on-leave': [LEAVE_SCOPE],
  'home-unit-heads-vs-plan': [CLOSE_HEADS],
  'plan-heads-by-month': [KIND, ELIMINATED_END, REQ_AS_OF, CLOSE_HEADS],
  'plan-heads-by-unit': [START, KIND, ELIMINATED_END, PLANNED_START_IN_YEAR],
  'plan-positions-by-status': [START, KIND, ELIMINATED_END],
  'plan-cost-by-unit': [START, KIND, ELIMINATED_END, CLOSES],
  'plan-openings-by-stage': [START, END, KIND, ELIMINATED_END, REQ_AS_OF],
  'plan-openings-stage': [START, END, KIND, ELIMINATED_END, REQ_AS_OF],
  'plan-openings-age': [START, END, KIND, ELIMINATED_END, REQ_AS_OF, REQ_STAGE, OPENED],
  'plan-openings-table': [START, END, KIND, ELIMINATED_END, REQ_AS_OF, OPENED, FREEZES_WHOLE],
  'plan-positions-grid': [KIND, ELIMINATED_END, REQ_AS_OF, BANDS_COMPANY_WIDE],
  'plan-positions-changes': [CHANGES],
  'plan-transfers-table': [TRANSFER_FIELDS, REQUEST_VIEW],
  'plan-transfers-drafts': [NO_DRAFTS],
}

/**
 * Plan > Hiring's notes (docs/PLAN.md 9.7; `hiringLineage.slow.test.ts` probes the tab's six tiles
 * and three figures in HR admin, HRBP and Manager mode). Kept apart from `LINEAGE_NOTES`, whose
 * probe reads `planModel`, since Plan > Hiring has its own model.
 */
export const HIRING_LINEAGE_NOTES: Readonly<Record<string, readonly LineageNote[]>> = {
  'hiring-open': [START, END, KIND, ELIMINATED_END, PLANNED_START_IN_YEAR],
  'hiring-accepted': [KIND, ELIMINATED_END, PLANNED_START_IN_YEAR, TREE],
  'hiring-pace': [START, KIND, TREE],
  'hiring-exit-pace': [START, END, KIND, TREE],
  'hiring-net-pace': [START, END],
  'hiring-months-to-close': [START, END, KIND, ELIMINATED_END, PLANNED_START_IN_YEAR],
  'plan-hiring-quarters': [START, END, KIND, ELIMINATED_END, REQ_AS_OF, OPENED, FREEZES_WHOLE],
  'plan-hiring-open': [START, END, KIND, ELIMINATED_END, REQ_AS_OF],
  'plan-hiring-velocity': [START, END, KIND, ELIMINATED_END, REQ_AS_OF, OPENED, FREEZES_WHOLE],
}
