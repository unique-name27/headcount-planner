/**
 * Why a role home's key figure lists a field whose blank, on its own, moves nothing on the sample
 * (browser finding B4 follow-up; the kinds are src/views/plan/engine/lineageNotes.ts's). The homes
 * re-link their producers' tiles (Plan, Forecast, Targets, Requests and Finance) with the producers'
 * lineage; `lineage.slow.test.ts` blanks every field each home tile lists, one at a time, on the
 * Unit plan (HRBP, Silicon Engineering), Rollup vs target (Leader, the Silicon Engineering SVP) and
 * Plan vs actual (Finance, the company) homes, and every field that moves nothing must be named here
 * for that tile. Plain data; no amount.
 */
import type { LineageNote } from '@/views/plan/engine/lineageNotes'
import {
  CLOSES,
  ELIMINATED_END,
  END,
  FULL_TIME,
  KIND,
  LINEAGE_NOTES,
  OPENED,
  PLANNED_START_IN_YEAR,
  REQ_AS_OF,
  START,
  TARGET_START,
} from '@/views/plan/engine/lineageNotes'

const note = (kind: LineageNote['kind'], fields: LineageNote['fields'], why: string): LineageNote => ({
  kind,
  fields,
  why,
})

/** The freeze fields: a freeze's org, dates and backfill flag. */
const FREEZE_FIELDS: LineageNote['fields'] = [
  'freezes.freezeId',
  'freezes.businessUnit',
  'freezes.department',
  'freezes.costCenter',
  'freezes.leaderPositionId',
  'freezes.startDate',
  'freezes.endDate',
  'freezes.allowBackfill',
]

const FREEZE_ELSEWHERE = note(
  'absent',
  [...FREEZE_FIELDS, 'positions.department', 'positions.costCenter'],
  'The forecast holds an opening while a freeze covers its org (unit, department, cost center or leader’s tree) between the freeze’s dates. The sample’s one freeze, FRZ-001, holds Corporate; the homes that show this tile show Silicon Engineering, where no freeze and no seat’s department or cost center decides a start.',
)

const ORG_RATES = note(
  'default',
  ['assumptions.org'],
  'Fill rate and attrition are the only tables the sample keys by org (Silicon Engineering’s fill rate, Go-to-Market’s and Silicon Engineering’s attrition). With the org blank those rows read as company rows and the later of two equal keys wins, which is Silicon Engineering’s: the Silicon Engineering homes read the same rates.',
)

const FORECAST_REQUESTS = note(
  'absent',
  [
    'requests.requestId',
    'requests.type',
    'requests.state',
    'requests.positionId',
    'requests.businessUnit',
    'requests.managerPositionId',
    'requests.startDate',
  ],
  'The forecast reads requests for an approved Backfill’s replacement start and for the seats an approved freeze exception lets through (freeze.ts `freezeExemptions`). Silicon Engineering has neither on the sample (its approved requests are New roles, whose seats stand on their own rows), so no request field moves its forecast.',
)

const OFFER_IDS = note(
  'absent',
  ['reqs.reqId'],
  'The forecast names each accepted offer it starts by its req’s ID and finds the offer’s currency by it, and two open reqs of one seat opened the same day tie on it, which gives the same opened date. Heads read the reqs’ stages and dates, never the ID: no heads path reads it, so the year-end heads keep their value with every ID blank, or with the reqs in another order, on the sample.',
)

const OWN_BONUS = note(
  'absent',
  ['comp.targetBonusPct'],
  'A comp row’s own target bonus wins over its level’s; no comp row in the sample has one, so every bonus is the level’s target (bonusTarget).',
)

const SITE_CURRENCY = note(
  'default',
  ['comp.currency', 'reqs.offerCurrency'],
  'A blank pay or offer currency reads the seat’s site currency (cost.ts), which is the currency every sample comp row and offer is in.',
)

const ROUNDED_COST = note(
  'mode',
  [
    'positions.fte',
    'reqs.agencyFee',
    'reqs.relocation',
    'reqs.signOnBonus',
    'reqs.reqId',
    'reqs.status',
    'reqs.targetStartDate',
  ],
  'HRBP and Leader homes show cost rounded down to $0.1M per cost atom (7.3, C21). One-time items book on an offer’s line in their month, an FTE scales a seat, and a req’s status and target start time an opening; with any one of these blank no Silicon Engineering atom crosses a step on the sample, so the rounded figure stays.',
)

const SE_ASKS_FY28 = note(
  'absent',
  [
    'requests.requestId',
    'requests.type',
    'requests.state',
    'requests.positionId',
    'requests.businessUnit',
    'requests.managerPositionId',
    'requests.requesterId',
    'requests.steps',
    'requests.submittedAt',
    'requests.updatedAt',
    'requests.level',
    'requests.location',
    'requests.fte',
    'requests.count',
    'requests.creditBp',
    'requests.creditUsedBp',
    'requests.getBp',
    'requests.giveBp',
    'requests.giveOrgPositionId',
    'requests.givePositionIds',
    'requests.partTimeRest',
    'requests.personId',
    'requests.effectiveDate',
    'requests.fromPositionId',
    'requests.toManagerPositionId',
    'requests.toPositionId',
    'requests.transferKind',
  ],
  'Asks add each pending request the viewer may see by its head effect at the target date (a New role’s or a trade’s seats, an Elimination’s seat, a transfer’s sides; 8.4 decides what the Leader sees). Silicon Engineering’s pending New roles are FY28 cycle asks (story 6) that start after FY27’s target date and its Level changes move no head, so no request adds a head to the FY27 gap on the sample.',
)

const SE_SEATS = note(
  'absent',
  [
    'positions.department',
    'positions.costCenter',
    'reqs.positionId',
    'reqs.reqId',
    'reqs.status',
    'reqs.openedDate',
    'reqs.targetStartDate',
  ],
  'Asks count the Working seats of the Leader’s tree at the target date; a seat’s department and cost center say where a target keyed by them sits, and an opening’s req gives its start. The Silicon Engineering SVP’s target is the unit’s, and the asks keep their seats with any one of these blank on the sample.',
)

const WAITING = note(
  'mode',
  [
    'requests.businessUnit',
    'requests.managerPositionId',
    'requests.positionId',
    'requests.requesterId',
    'requests.startDate',
    'requests.type',
    'requests.updatedAt',
  ],
  'Requests waiting on you lists the steps assigned to the Acting as person (Requests > Approvals); a request’s unit, seats, requester and type decide whether the viewer may see it (8.4) and its start and last change only order it. The two steps waiting on the Silicon Engineering SVP stay theirs with any one of these blank.',
)

const NOT_IN_PLAN = note(
  'absent',
  [
    'positions.endDate',
    'positions.endReason',
    'positions.startDate',
    'positions.workerType',
    'reqs.openedDate',
    'reqs.reqId',
    'reqs.status',
    'reqs.targetStartDate',
  ],
  'A req counts when it is Open or On hold on the as-of date and its seat is blank, unknown or no approved head (an Eliminated or Traded seat). No open req in the sample is off plan, and no seat’s end, start or kind turns one of their seats into one.',
)

const FROZEN_COMPANY = note(
  'absent',
  [
    'freezes.allowBackfill',
    'freezes.freezeId',
    'freezes.startDate',
    'positions.costCenter',
    'positions.department',
    'positions.managerPositionId',
    'positions.reqType',
    'positions.openedDate',
    'positions.endDate',
    'positions.startDate',
    'positions.workerType',
    'reqs.offerAcceptedDate',
    'reqs.openedDate',
    'reqs.reqId',
    'reqs.status',
    'reqs.targetStartDate',
    'workers.employeeId',
  ],
  'An opening is under a freeze while a freeze covers its org on the as-of date, unless it has an accepted offer or is a backfill the freeze allows; these fields place the opening, give its stage and start, and name the freeze. FRZ-001 is a whole unit (Corporate), open since 1 Aug 2026 with no end and no backfill allowed, and the three openings it holds stay held with any one of these blank on the sample.',
)

const SAVINGS = note(
  'absent',
  [
    'assumptions.org',
    'freezes.allowBackfill',
    'freezes.businessUnit',
    'freezes.startDate',
    'positions.businessUnit',
    'positions.costCenter',
    'positions.department',
    'positions.effectiveDate',
    'positions.endDate',
    'positions.fte',
    'positions.level',
    'positions.location',
    'positions.managerPositionId',
    'positions.openedDate',
    'positions.positionId',
    'positions.reqType',
    'positions.startDate',
    'positions.status',
    'positions.workerType',
    'reqs.offerAcceptedDate',
    'reqs.openedDate',
    'reqs.positionId',
    'reqs.reqId',
    'reqs.stage',
    'reqs.startDate',
    'reqs.status',
    'reqs.targetStartDate',
    'workers.employeeId',
    'workers.positionId',
    'workers.terminationDate',
  ],
  'Freeze savings price each opening a freeze holds at its band estimate for the months held, from its forecast start, and add the modeled backfills the freeze stops; these fields place, price and time those openings and the backfills. FRZ-001 holds Corporate’s openings from 1 Aug 2026 with no end, and the Finance home keeps its savings with any one of these blank on the sample.',
)

const FX_YEAR_TO_DATE = note(
  'snapshot',
  [
    ...FREEZE_FIELDS,
    'positions.businessUnit',
    'positions.managerPositionId',
    'positions.openedDate',
    'requests.requestId',
    'requests.type',
    'requests.state',
    'requests.positionId',
    'requests.businessUnit',
    'requests.managerPositionId',
    'requests.startDate',
  ],
  'The Finance home’s FX effect is year to date: the closed months only, read from the month closes (6.6, C33 (e)), against the Budget’s stored rates. Freezes, openings and requests reach the months not closed, and a seat’s unit and manager place it for the fold; the year-to-date FX step keeps its value with any one of these blank on the sample.',
)

const RECON = note(
  'absent',
  [
    'positions.businessUnit',
    'positions.department',
    'positions.effectiveDate',
    'positions.endDate',
    'positions.startDate',
    'positions.status',
    'positions.workerType',
    'workers.assignmentStart',
  ],
  'Reconciliation compares each seat’s imported rows with what the HRIS says on the as-of date (6.10); these fields give a seat’s unit, department, status and dates. Story 7’s 6 people not in the plan and 3 cost-center mismatches remain, the same 9 exceptions, with any one of these blank on the sample.',
)

const SEATS_NOT_HOLDERS = note(
  'absent',
  ['workers.assignmentEnd', 'workers.terminationDate'],
  'Asks count Working seats at the target date, Filled, Open and Planned alike: a holder’s last day turns a Filled seat Open, which counts the same.',
)

const NO_REOPENED = note(
  'absent',
  ['workers.assignmentEnd', 'workers.terminationDate'],
  'A holder’s last day reopens a seat, which a freeze then holds from the day after unless it allows backfills. On the sample no Corporate holder’s last day reopens a seat FRZ-001 holds, so the savings stay with these blank.',
)

/** By tile id (the producers' ids, which the homes keep). */
export const HOME_LINEAGE_NOTES: Readonly<Record<string, readonly LineageNote[]>> = {
  actual: LINEAGE_NOTES.actual,
  'hires-ytd': LINEAGE_NOTES['hires-ytd'],
  'past-start': LINEAGE_NOTES['past-start'],
  /*
   * Plan > Hiring's Open to hire (9.7; its lineage is the tab's, src/views/plan/engine/lineage.ts
   * `hiringOpen`) on Unit plan and Rollup vs target: approved seats with a first head day by the
   * fiscal year end, less current heads and the future starts due by then.
   */
  'hiring-open': [START, END, KIND, ELIMINATED_END, PLANNED_START_IN_YEAR, REQ_AS_OF],
  'year-end-heads': [
    START,
    END,
    KIND,
    ELIMINATED_END,
    OPENED,
    REQ_AS_OF,
    ORG_RATES,
    FREEZE_ELSEWHERE,
    FORECAST_REQUESTS,
    OFFER_IDS,
  ],
  'cost-full-year': [
    START,
    END,
    KIND,
    ELIMINATED_END,
    OPENED,
    REQ_AS_OF,
    TARGET_START,
    ORG_RATES,
    FREEZE_ELSEWHERE,
    FORECAST_REQUESTS,
    OWN_BONUS,
    SITE_CURRENCY,
    ROUNDED_COST,
    FULL_TIME,
  ],
  'cost-vs-target': [
    START,
    END,
    KIND,
    ELIMINATED_END,
    OPENED,
    REQ_AS_OF,
    TARGET_START,
    ORG_RATES,
    FREEZE_ELSEWHERE,
    FORECAST_REQUESTS,
    OWN_BONUS,
    SITE_CURRENCY,
    ROUNDED_COST,
    FULL_TIME,
  ],
  'targets-gap-heads': [
    START,
    SEATS_NOT_HOLDERS,
    KIND,
    ELIMINATED_END,
    PLANNED_START_IN_YEAR,
    SE_SEATS,
    SE_ASKS_FY28,
  ],
  'approvals-waiting': [WAITING],
  'finance-reqs-not-in-plan': [NOT_IN_PLAN],
  'finance-openings-frozen': [START, END, KIND, FROZEN_COMPANY],
  'finance-freeze-savings': [START, NO_REOPENED, KIND, SAVINGS],
  'fx-effect-ytd': [CLOSES, FX_YEAR_TO_DATE],
  'finance-recon-exceptions': [RECON],
}
