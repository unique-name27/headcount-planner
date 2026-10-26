/**
 * Why a My team figure lists a field whose blank, on its own, moves nothing on the sample (browser
 * finding B4; the kinds are src/views/plan/engine/lineageNotes.ts's). `lineage.slow.test.ts` blanks
 * every field each figure lists, for Managers A, B and C, and every field that moves nothing must be
 * named here for that figure. Plain data; no amount.
 */
import type { LineageNote } from '@/views/plan/engine/lineageNotes'
import {
  CHANGES,
  ELIMINATED_END,
  END,
  KIND,
  NEVER_HELD,
  PLANNED_START_IN_YEAR,
  REQ_AS_OF,
  START,
} from '@/views/plan/engine/lineageNotes'

const note = (kind: LineageNote['kind'], fields: LineageNote['fields'], why: string): LineageNote => ({
  kind,
  fields,
  why,
})

const ADDS_SINCE_LOCK = note(
  'absent',
  ['positions.sourceRequestId', 'positions.endReason', 'positions.endDate', 'positions.startDate'],
  'The allocation reads the changes approved since the plan of record locked from the rows the approvals wrote (R2b): an add is a seat whose first row names its request, left out when it starts after the year’s end; an elimination is an approval’s Eliminated row. The probed teams have none on the sample.',
)

const FULL_TIME = note(
  'default',
  ['positions.fte'],
  'A blank FTE reads 1, and every seat in the probed teams is full time, so no standard head moves.',
)

const FILLED_BY_HOLDER = note(
  'absent',
  ['positions.status'],
  'A seat someone holds reads Filled whatever its row’s status (R31); the row’s status tells only the seats nobody holds apart.',
)

const NO_REQS = note(
  'absent',
  ['reqs.openedDate', 'reqs.positionId', 'reqs.reqId', 'reqs.status', 'reqs.targetStartDate'],
  'A Planned seat is requested when an Open or On hold req opened by the as-of date names it; no Planned seat in the probed teams has a req on the sample.',
)

const REQUEST_VIEW = note(
  'mode',
  [
    'requests.requestId',
    'requests.type',
    'requests.state',
    'requests.positionId',
    'requests.managerPositionId',
    'requests.businessUnit',
    'requests.requesterId',
    'requests.submittedById',
    'requests.steps',
    'requests.startDate',
  ],
  'A request counts for the team when it sits in the tree (its seat or its manager position) and 8.4 lets the manager see it (its requester, submitter and steps; a transfer’s sides by its type; the unit it touches); a pending Start recruiting request makes a Planned seat requested. Every pending request of the probed teams is theirs to see with any one of these blank, and none is a Start recruiting request.',
)

const BUDGET_WORD = note(
  'absent',
  [
    'assumptions.org',
    'assumptions.table',
    'assumptions.value',
    'assumptions.version',
    'reqs.offerAcceptedDate',
    'workers.level',
    'workers.location',
    'requests.count',
    'requests.creditBp',
    'requests.creditUsedBp',
    'requests.effectiveDate',
    'requests.fromPositionId',
    'requests.fte',
    'requests.getBp',
    'requests.giveBp',
    'requests.giveOrgPositionId',
    'requests.givePositionIds',
    'requests.level',
    'requests.location',
    'requests.partTimeRest',
    'requests.personId',
    'requests.toManagerPositionId',
    'requests.toPositionId',
    'requests.transferKind',
  ],
  'Budget status is a word, Over, At risk or On track, from heads and band cost against the allocation (R32): bands and plan FX price the band cost, an accepted offer starts a staffed head, a not-in-plan report counts at their HRIS level and location, and pending requests add their head and band effects (a trade’s seats and credit, a transfer’s sides). The probed teams keep their word, and the heads in its card, with any one of these blank.',
)

const HEADS_ONLY = note(
  'absent',
  [
    'reqs.offerAcceptedDate',
    'workers.managerId',
    'workers.level',
    'workers.location',
    'requests.count',
    'requests.creditBp',
    'requests.creditUsedBp',
    'requests.effectiveDate',
    'requests.fromPositionId',
    'requests.getBp',
    'requests.giveBp',
    'requests.giveOrgPositionId',
    'requests.givePositionIds',
    'requests.partTimeRest',
    'requests.personId',
    'requests.toManagerPositionId',
    'requests.toPositionId',
    'requests.transferKind',
  ],
  'Staffed heads count the tree’s holders, accepted offers from their start and not-in-plan reports (by their manager, at their HRIS level and location), and pending trades and transfers move heads by their seats. The probed teams have no not-in-plan report and no pending trade or transfer on the sample.',
)

const TRACKER = note(
  'together',
  ['requests.updatedAt', 'requests.submittedAt'],
  'A request was last changed on its update time, else on its submit time (requests.ts fromRow): with one blank, the other gives the day.',
)

const TRACKER_SCOPE = note(
  'mode',
  ['requests.positionId'],
  'The tracker lists a team’s request by its seat or by its manager position, and every request of the probed teams names a manager position in the tree.',
)

const ALLOCATION_NOW = [ADDS_SINCE_LOCK, KIND, START, END]

/** By figure or tile id. */
export const TEAM_LINEAGE_NOTES: Readonly<Record<string, readonly LineageNote[]>> = {
  'team-left-to-fill': ALLOCATION_NOW,
  'team-allocation': [ADDS_SINCE_LOCK, KIND, FULL_TIME],
  'team-filled': [...ALLOCATION_NOW, FILLED_BY_HOLDER],
  'team-open': ALLOCATION_NOW,
  'team-planned': [ADDS_SINCE_LOCK, KIND, START, NEVER_HELD],
  'team-pending': [REQUEST_VIEW],
  'team-left-to-request': [ADDS_SINCE_LOCK, KIND, START, NEVER_HELD, NO_REQS, REQUEST_VIEW],
  'team-budget-status': [ADDS_SINCE_LOCK, KIND, START, END, REQUEST_VIEW, BUDGET_WORD],
  'team-tracker': [TRACKER, TRACKER_SCOPE],
  'team-heads-vs-allocation': [ADDS_SINCE_LOCK, KIND, START, END, REQUEST_VIEW, HEADS_ONLY],
  'team-hrbp-changes': [CHANGES],
  /*
   * Plan > Hiring's Open to hire beside the hero (9.7; its lineage is the tab's, src/views/plan/engine/
   * lineage.ts `hiringOpen`): approved seats with a first head day by the fiscal year end, less current
   * heads and the accepted starts due by then, for the probed teams.
   */
  'hiring-open': [START, END, KIND, ELIMINATED_END, PLANNED_START_IN_YEAR, REQ_AS_OF],
}
