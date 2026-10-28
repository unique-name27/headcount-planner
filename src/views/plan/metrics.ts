/**
 * The Plan view's metric ids (docs/PLAN.md 12): every id whose home view is `plan`,
 * in the plan's order. Frozen in M1: names and ids never change. The metrics builder fills `metrics`
 * with one MetricDef per id (wording, formula, population, window, unit, uses and settings), and the
 * view's engine reads ids and settings from here, never as string literals.
 *
 * The catalog imports this file, so it stays plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or '@/metrics/testing'.
 */
import { defineMetrics } from '@/metrics/define'
import { BAND, F, LOADED_COST, PLAN_LINE, uses } from '@/metrics/fields'
import { RULE_ID } from '@/metrics/rules'
import type { MetricDef } from '@/metrics/types'
import { OWNER, POPULATION, SHOWN_IN_FINANCE, WINDOW } from '@/metrics/wording'

/** Every metric id the view registers, by role. */
export const ID = {
  headsPlan: 'plan.heads.plan',
  headsApproved: 'plan.heads.approved',
  headsActual: 'plan.heads.actual',
  headsNotInPlan: 'plan.heads.notInPlan',
  fteAverage: 'plan.fte.average',
  hiresYtd: 'plan.hires.ytd',
  hiresPlanned: 'plan.hires.planned',
  exitsYtd: 'plan.exits.ytd',
  positionsByStatus: 'plan.positions.byStatus',
  openingsCount: 'plan.openings.count',
  openingsAge: 'plan.openings.age',
  openingsPastStart: 'plan.openings.pastStart',
  openingsNoReq: 'plan.openings.noReq',
  openingsFrozen: 'plan.openings.frozen',
  offersAccepted: 'plan.offers.accepted',
  reqsNotInPlan: 'plan.reqs.notInPlan',
  transfersOpen: 'plan.transfers.open',
  leaveOnLeave: 'plan.leave.onLeave',
  costLoaded: 'plan.cost.loaded',
  costLoadedInclSbc: 'plan.cost.loadedInclSbc',
  costComponent: 'plan.cost.component',
  costPerHead: 'plan.cost.perHead',
  costOpenBand: 'plan.cost.openBand',
  costBandEstimate: 'plan.cost.bandEstimate',
  tradeWeight: 'plan.trade.weight',
  /* Plan > Hiring (docs/PLAN.md 9.7, change C36; the hiring freeze): heads only, every mode. */
  hiringApprovedByQuarter: 'plan.hiring.approvedByQuarter',
  hiringCurrentHeads: 'plan.hiring.currentHeads',
  hiringAcceptedStarts: 'plan.hiring.acceptedStarts',
  hiringOpen: 'plan.hiring.open',
  hiringOpenByQuarter: 'plan.hiring.openByQuarter',
  hiringNewByQuarter: 'plan.hiring.newByQuarter',
  hiringExpectedExits: 'plan.hiring.expectedExits',
  hiringToReachPlan: 'plan.hiring.toReachPlan',
  hiringHiresByMonth: 'plan.hiring.hiresByMonth',
  hiringExitsByMonth: 'plan.hiring.exitsByMonth',
  hiringPace: 'plan.hiring.pace',
  hiringExitPace: 'plan.hiring.exitPace',
  hiringNetPace: 'plan.hiring.netPace',
  hiringAttritionRate: 'plan.hiring.attritionRate',
  hiringNeededPace: 'plan.hiring.neededPace',
  hiringMonthsToClose: 'plan.hiring.monthsToClose',
  /* Change C37: moves into the scope (their own row) and the hires of the last 3 closed months by department and location. */
  hiringMovesIn: 'plan.hiring.movesIn',
  hiringRecentHires: 'plan.hiring.recentHires',
  /* Plan > Recruiting summary (docs/PLAN.md 9.8, change C38): the forecast's starts, and heads ahead. */
  recruitingProjectedStarts: 'plan.recruiting.projectedStarts',
  recruitingProjectedHeads: 'plan.recruiting.projectedHeads',
  recruitingGap: 'plan.recruiting.gapToApproved',
} as const

export type PlanMetricId = (typeof ID)[keyof typeof ID]

/**
 * Plan > Hiring's metric ids (docs/PLAN.md 9.7, "Metrics"), in the plan's order: every one is heads,
 * a pace or a share of heads, never an amount, a band estimate or a leave fact. C37 adds the last two.
 */
export const HIRING_METRIC_IDS: readonly PlanMetricId[] = [
  ID.hiringApprovedByQuarter,
  ID.hiringCurrentHeads,
  ID.hiringAcceptedStarts,
  ID.hiringOpen,
  ID.hiringOpenByQuarter,
  ID.hiringNewByQuarter,
  ID.hiringExpectedExits,
  ID.hiringToReachPlan,
  ID.hiringHiresByMonth,
  ID.hiringExitsByMonth,
  ID.hiringPace,
  ID.hiringExitPace,
  ID.hiringNetPace,
  ID.hiringAttritionRate,
  ID.hiringNeededPace,
  ID.hiringMonthsToClose,
  ID.hiringMovesIn,
  ID.hiringRecentHires,
]

/**
 * Plan > Recruiting summary's own metric ids (docs/PLAN.md 9.8): heads only. Its other numbers are
 * Plan > Hiring's (`HIRING_METRIC_IDS`), read from the same engine.
 */
export const RECRUITING_METRIC_IDS: readonly PlanMetricId[] = [
  ID.recruitingProjectedStarts,
  ID.recruitingProjectedHeads,
  ID.recruitingGap,
]

/** The settings the view's engine reads through `ctx.metrics` (docs/PLAN.md 12), by role. */
export const PARAM = {
  /** Planned seats starting within this many days with no req (45). */
  noReqDays: { metricId: ID.openingsNoReq, key: 'days' },
} as const

/** A cost amount under the full guard (5 or more costed people; rounded per atom in HRBP and Leader mode). */
const GUARDED = [RULE_ID.minCosted, RULE_ID.floorUsd]
/** A seat's opening date: its latest open req, its own opened date, or the day after its last holder left. */
const OPENING = uses(PLAN_LINE, F.opened, F.offer)
const OPENINGS_NOTE =
  'Open and Planned employee seats in scope that no one has started in. An accepted offer is still an opening until its start date.'

/* Plan > Hiring's shared wording (9.7). Heads only: no sentence names an amount or a leave fact. */
/** Approved seats and their signed offers, with the people who hold them. */
const HIRING_SEATS = uses(PLAN_LINE, F.offer)
/** What the forecast's modeled exits read (6.7): the seats it starts, the HRIS cohort and the attrition assumption. */
const HIRING_EXITS = uses(PLAN_LINE, F.opened, F.offer, F.freeze, F.tree, F.seatOrg, F.request, F.assumptions)
const HIRING_POPULATION =
  'Approved employee seats in scope in Working (Filled, Open and Planned, starting by the fiscal year end), their signed offers, approved moves into them, and the employees in scope.'
const HIRING_WINDOW = {
  quarters: 'Each quarter end of the fiscal year shown, from the as-of date.',
  fiscalYear: 'From the as-of date to the last day of the fiscal year shown.',
  months: 'Each of the last 12 closed months, and each closed quarter of the fiscal year shown.',
  pace: 'The last 3 closed months (the key figure) and the last 6.',
  attrition: 'The last 12 closed months.',
} as const
/** What the forecast's projected starts read (9.8, 6.7): its modeled exits' fields, and the seat's level (time to fill). */
const RECRUITING_STARTS = uses(HIRING_EXITS, ['positions.level'])
/** Plan > Recruiting summary's window (9.8): the chart's months ahead, its table's quarters and the key figure's year end. */
const RECRUITING_WINDOW = {
  /** Projected starts: also the key figure, which reads the fiscal year's last day. */
  starts:
    'Each month end and each quarter end after the as-of date, to the last day of the fiscal year shown (the key figure reads that day).',
  heads:
    'Each month end and each quarter end after the as-of date, to the last day of the fiscal year shown.',
} as const

/** The view's dictionary entries, one per id in `ID`, in the same order. */
export const metrics: MetricDef[] = defineMetrics('plan', [
  /* ───────── heads ───────── */
  {
    id: ID.headsPlan,
    name: 'Plan heads',
    views: ['home', 'forecast'],
    definition:
      'Positions whose plan line is Filled at a month-end in a version: Filled seats, plus Open and Planned seats whose planned start is on or before that month-end. A seat left open by an exit is not a plan head until it has a planned start from its replacement.',
    formula: 'count of positions whose plan line status is Filled at the month-end',
    population: POPULATION.positions,
    window: WINDOW.monthEnds,
    unit: 'int',
    goodDirection: null,
    uses: PLAN_LINE,
    owner: OWNER.hrbp,
  },
  {
    id: ID.headsApproved,
    name: 'Approved heads',
    views: ['home', 'targets'],
    definition:
      'Positions that are Filled, Open or Planned on the date and start on or before the end of that date’s fiscal year, so a seat approved now for next year is not a head this year. A seat with no planned start counts. On hold and Eliminated seats are not approved heads.',
    formula: 'Filled + Open + Planned positions on the date with start ≤ the fiscal year’s last day',
    population: POPULATION.positions,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: PLAN_LINE,
    owner: OWNER.hrbp,
  },
  {
    id: ID.headsActual,
    name: 'Actual heads',
    views: ['home', 'finance'],
    definition:
      'Active employees in the HRIS on the date, each counting 1 head on every day from their hire date to their last day. People with no position count too, on a "Not in plan" row.',
    formula: 'employees with hire date ≤ date ≤ last day (blank: still employed)',
    population: POPULATION.employees,
    window: 'The as-of date, compared with plan heads at the last closed month-end.',
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.headsNotInPlan,
    name: 'Not in plan',
    views: ['finance'],
    definition:
      'Active employees with no position: they count in actual heads but hold no seat in the plan. Reconciliation lists each one.',
    formula: 'active employees with no position on the date',
    population: POPULATION.employees,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.fteAverage,
    name: 'Average FTE',
    views: ['forecast'],
    definition:
      'The average FTE of active assignments over the window, measured day by day, whatever proration the version uses. A person who starts mid-month counts only for the days they are active.',
    formula: 'Σ over days of Σ active assignment FTE ÷ days in the window',
    population: POPULATION.employees,
    window: WINDOW.period,
    unit: 'num1',
    goodDirection: null,
    uses: uses(F.assignment, F.workerFte, F.seatType),
    owner: OWNER.hrbp,
  },
  /* ───────── hires and exits ───────── */
  {
    id: ID.hiresYtd,
    name: 'Hires year to date',
    views: ['home'],
    definition:
      'Employees whose hire date falls from the fiscal year’s start to the last closed month-end, in scope. Internal moves and transfers are not hires.',
    formula: 'employees with fiscal year start ≤ hire date ≤ last closed month-end',
    population: 'Employees (worker type Employee) in scope.',
    window: WINDOW.yearToClose,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiresPlanned,
    name: 'Planned hires year to date',
    views: ['home'],
    definition:
      'Positions in the comparison version whose plan line first counts a head in the same window as hires year to date, in scope. Seats Filled at the fiscal year’s start and positions that receive a transfer are left out.',
    formula: 'comparison-version positions whose plan heads go from 0 to 1 within the window',
    population:
      'Employee positions in the comparison version, excluding seats Filled at the fiscal year’s start and positions that receive a transfer.',
    window: `${WINDOW.yearToClose} The comparison is the version picked for "vs" figures.`,
    unit: 'int',
    goodDirection: null,
    uses: uses(PLAN_LINE, F.request, F.transfer),
    owner: OWNER.hrbp,
  },
  {
    id: ID.exitsYtd,
    name: 'Exits year to date',
    definition:
      'Employees whose last day falls from the fiscal year’s start to the last closed month-end, in scope. A move to another position is not an exit.',
    formula: 'employees with fiscal year start ≤ last day ≤ last closed month-end',
    population: POPULATION.employees,
    window: WINDOW.yearToClose,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  /* ───────── positions and openings ───────── */
  {
    id: ID.positionsByStatus,
    name: 'Positions by status',
    views: ['team'],
    definition:
      'Positions on the date by status: Filled, Open, Planned, On hold and Eliminated. Filled and Open come from who is in the seat; Planned, On hold and Eliminated come from the imported status. Eliminated seats are kept, and position IDs are never reused.',
    formula: 'count of positions per status on the date',
    population: 'Every position in scope in the shown version, contractor and intern seats included.',
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: PLAN_LINE,
    owner: OWNER.hrbp,
  },
  {
    id: ID.openingsCount,
    name: 'Openings',
    definition:
      'Open and Planned seats on the date that no one has started in: the approved seats still to fill.',
    formula: 'Open seats + Planned seats on the date',
    population: OPENINGS_NOTE,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: OPENING,
    owner: OWNER.hrbp,
  },
  {
    id: ID.openingsAge,
    name: 'Opening age',
    definition:
      'The median number of days since each Open seat opened. A seat opens on its latest open req’s opened date, else its own opened date, else the day after its last holder’s last day, else the first day of its current run as Open.',
    formula: 'median of (as-of date − opened on) over Open seats',
    population: 'Open employee seats in scope.',
    window: WINDOW.asOf,
    unit: 'days',
    goodDirection: 'down',
    uses: OPENING,
    owner: OWNER.hrbp,
  },
  {
    id: ID.openingsPastStart,
    name: 'Openings past target start',
    views: ['home'],
    definition:
      'Open and Planned seats whose target start is before the as-of date and that no one has started in. The target start is the open req’s target start date, else the seat’s planned start.',
    formula: 'openings with target start < as-of date',
    population: OPENINGS_NOTE,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: OPENING,
    owner: OWNER.hrbp,
  },
  {
    id: ID.openingsNoReq,
    name: 'Planned seats near start with no req',
    views: ['home'],
    definition:
      'Planned seats starting within the next 45 days (by default) that have no req in the recruiting system yet.',
    formula: 'Planned seats with as-of date ≤ planned start ≤ as-of date + days, and no req',
    population: 'Planned employee seats in scope.',
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: OPENING,
    owner: OWNER.hrbp,
    params: [
      {
        key: PARAM.noReqDays.key,
        label: 'Days before start',
        description:
          'A Planned seat with no req is flagged once its planned start is this many days away or fewer.',
        type: 'days',
        default: 45,
        min: 1,
        max: 365,
        step: 1,
      },
    ],
  },
  {
    id: ID.openingsFrozen,
    name: 'Openings under a freeze',
    views: ['home', 'finance'],
    definition:
      'Open and Planned seats, not started and with no accepted offer, in an org whose freeze covers the as-of date. Backfill seats are left out when the freeze allows backfills. These are the seats the forecast holds and freeze savings prices; they stay approved heads.',
    formula: 'Open and Planned seats with no accepted offer in an org frozen on the as-of date',
    population: OPENINGS_NOTE,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: uses(OPENING, F.tree, F.seatOrg, F.seatReqType, F.freeze),
    owner: OWNER.hrbp,
  },
  {
    id: ID.offersAccepted,
    name: 'Accepted offers not started',
    definition:
      'Seats whose req has an accepted offer with an agreed start date after the as-of date. Only the dates show; the start date and terms come from the recruiting system.',
    formula: 'reqs at stage Offer accepted with start date > as-of date',
    population: 'Reqs on employee seats in scope.',
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.req, F.offer),
    owner: OWNER.hrbp,
  },
  {
    id: ID.reqsNotInPlan,
    name: 'Reqs not in plan',
    views: ['home', 'finance'],
    definition:
      'Reqs that are Open or On hold in the recruiting system on the as-of date whose position is blank, unknown or not an approved head in the shown version, such as a seat that was eliminated or traded. The app never edits reqs: close them in the recruiting system.',
    formula: 'Open and On hold reqs with no approved position in the shown version',
    population: 'Reqs in scope, by the org of their position.',
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: uses(F.req, F.seat, F.ended),
    owner: OWNER.hrbp,
  },
  {
    id: ID.transfersOpen,
    name: 'Transfers in progress',
    definition:
      'Transfer requests, position moves and internal moves, that are Submitted, In review or Sent back, or approved with an effective date after the as-of date.',
    formula: 'pending transfers + approved transfers with effective date > as-of date',
    population: POPULATION.requests,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.request, F.requestFlow, F.transfer),
    owner: OWNER.hrbp,
  },
  {
    id: ID.leaveOnLeave,
    name: 'On leave',
    definition:
      'Employees on a leave of absence on the as-of date, as one count for the whole unit or the whole org, shown only when it is 5 or more. It takes no filter other than version and comparison and has no breakdown, series, change or list of people.',
    formula: 'active employees on leave on the as-of date, in the whole scope',
    population: 'Active employees in the whole unit (HRBP) or the whole org (Leader).',
    window: 'The as-of date, with the default period only.',
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment, F.leave),
    dependsOn: [RULE_ID.leaveCounts],
    owner: OWNER.hrbp,
  },
  /* ───────── cost ───────── */
  {
    id: ID.costLoaded,
    name: 'Loaded cost',
    views: ['forecast', 'targets', 'home'],
    definition:
      'Base, bonus, burden, benefits and one-time items, in USD. Filled seats cost at HRIS pay, accepted offers at the offer from their start date, and Open and Planned seats at band estimate. Equity (SBC) is not included.',
    formula:
      'Σ over positions and months of [(base + bonus + burden + benefits) ÷ 12 × active fraction + one-time] × rate',
    population: POPULATION.costed,
    window: WINDOW.costPeriod,
    unit: 'money',
    goodDirection: null,
    uses: LOADED_COST,
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  {
    id: ID.costLoadedInclSbc,
    name: 'Loaded cost incl. SBC',
    views: ['forecast'],
    definition: `Loaded cost plus equity (SBC): the level’s equity amount a year × FTE, in USD, for the months each seat is active. Shown only where it is labeled incl. SBC. ${SHOWN_IN_FINANCE}`,
    formula: 'loaded cost + Σ equity ÷ 12 × FTE × active fraction',
    population: POPULATION.costed,
    window: WINDOW.period,
    unit: 'money',
    goodDirection: null,
    uses: LOADED_COST,
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  {
    id: ID.costComponent,
    name: 'Cost by component',
    views: ['finance'],
    definition: `Loaded cost split into base, bonus, burden, benefits and one-time items. A component shows only where 5 or more positions have an amount in it in that cell; otherwise the cell shows loaded cost only, with no split. ${SHOWN_IN_FINANCE}`,
    formula:
      'Σ amount by component; bonus = base × target % × funding %, burden = Σ rate × min(base + bonus, cap)',
    population: `${POPULATION.costed} Each component also needs 5 or more positions with an amount in it.`,
    window: WINDOW.period,
    unit: 'money',
    goodDirection: null,
    uses: LOADED_COST,
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  {
    id: ID.costPerHead,
    name: 'Loaded cost per head',
    definition: 'Loaded cost over the window divided by the average heads over the same window.',
    formula: 'loaded cost ÷ average heads',
    population: POPULATION.costed,
    window: WINDOW.costPeriod,
    unit: 'money',
    goodDirection: null,
    uses: LOADED_COST,
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  {
    id: ID.costOpenBand,
    name: 'Open and Planned at band estimate',
    views: ['forecast'],
    definition:
      'Open and Planned seats with no accepted offer, costed at band estimate for the months they are active. This line is kept apart from the cost of Filled seats and is never added into a total over fewer than 5 costed people.',
    formula: 'Σ band estimate ÷ 12 × active fraction over Open and Planned seats',
    population: 'Open and Planned employee seats in scope with no accepted offer.',
    window: WINDOW.costPeriod,
    unit: 'money',
    goodDirection: null,
    uses: uses(PLAN_LINE, F.offer, BAND),
    // In HRBP and Leader mode it is each atom's band part rounded down on its own, atoms under 5
    // costed people left out (7.2 rule 3, 7.3a); in Finance it folds with the costed groups (7.4).
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  {
    id: ID.costBandEstimate,
    name: 'Band estimate',
    views: ['requests'],
    definition:
      'Band midpoint × FTE plus standard loads (bonus at target × funding, capped burden and benefits), a year, in USD at the version’s plan rates. It reads no person’s pay. Request estimates, the leader threshold, Open and Planned seats and trades use it; in an in-year total it counts only from the start or effective date to the fiscal year end.',
    formula:
      '(base + bonus + burden + benefits) × plan rate, with base = midpoint × FTE, bonus = base × target % × funding % and burden = Σ rate × min(base + bonus, cap)',
    population: POPULATION.seatType,
    window: 'A year, at the plan rates and bands of the version’s fiscal year.',
    unit: 'money',
    goodDirection: null,
    uses: BAND,
    owner: OWNER.finance,
  },
  {
    id: ID.tradeWeight,
    name: 'Standard heads',
    views: ['requests', 'team'],
    definition:
      'A seat’s weight: its band estimate at its own FTE divided by the standard head, so an average full-time seat weighs 1.00. Weights come only from bands, standard loads and plan rates, never from anyone’s pay or offer.',
    formula: 'band estimate at the seat’s FTE ÷ standard head, in whole basis points of a standard head',
    population: 'Employee seats; contractor and intern seats have no weight.',
    window: WINDOW.tradeYear,
    unit: 'num2',
    goodDirection: null,
    uses: BAND,
    owner: OWNER.finance,
  },
  /* ───────── hiring progress (Plan > Hiring, 9.7, C36) ───────── */
  {
    id: ID.hiringApprovedByQuarter,
    name: 'Approved heads by quarter end',
    definition:
      'Approved heads whose first head day is on or before the quarter’s end: a Filled seat counts now, a signed offer or a move in from its start date, and an Open or Planned seat from its planned or target start, or from now when it has neither. A seat counts only while it is still an approved head at the quarter’s end. For the last quarter this is the year’s approved heads.',
    formula: 'approved heads with first head day ≤ quarter end, still approved at the quarter end',
    population: HIRING_POPULATION,
    window: HIRING_WINDOW.quarters,
    unit: 'int',
    goodDirection: null,
    uses: HIRING_SEATS,
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringCurrentHeads,
    name: 'Current heads',
    definition:
      'Actual heads at the as-of date: active employees in the HRIS, in scope, counted as actual heads are, people with no position included. Shown with its split: people in approved seats, and people not in plan.',
    formula: 'employees with hire date ≤ as-of date ≤ last day (blank: still employed)',
    population: POPULATION.employees,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringAcceptedStarts,
    name: 'Future starts',
    definition:
      'A person with a signed offer who has not started yet, by start date: the req on an approved seat is at Offer accepted, and its start date is after the as-of date and on or before the quarter’s end. Only signed offers count: never a forecast or modeled start, and never an Open or Planned seat without one. Only the dates show. The key figure counts those due by the fiscal year end.',
    formula: 'reqs at stage Offer accepted with as-of date < start date ≤ quarter end',
    population: 'Reqs on approved employee seats in scope.',
    window: HIRING_WINDOW.quarters,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.req, F.offer),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringOpen,
    name: 'Open to hire',
    views: ['home', 'team'],
    definition:
      'What is left to hire this fiscal year: approved heads at the year end, less current heads, less the future starts due by then, less the approved moves into the scope due by then. It equals the open seats with no signed offer or move in, less the people not in plan, who count against approved heads. Below 0 it reads "Over by" and is never a hiring target.',
    formula: 'approved heads at year end − current heads − future starts by year end − moves in by year end',
    population: HIRING_POPULATION,
    window: HIRING_WINDOW.fiscalYear,
    unit: 'int',
    goodDirection: null,
    uses: HIRING_SEATS,
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringOpenByQuarter,
    name: 'Open to hire by quarter end',
    definition:
      'Open to hire at each quarter end ahead: approved heads by the quarter end, less current heads, less the future starts and moves in due by then. Below 0 it reads "Over by".',
    formula:
      'approved heads by quarter end − current heads − future starts by quarter end − moves in by quarter end',
    population: HIRING_POPULATION,
    window: HIRING_WINDOW.quarters,
    unit: 'int',
    goodDirection: null,
    uses: HIRING_SEATS,
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringNewByQuarter,
    name: 'New to hire in the quarter',
    definition:
      'How much open to hire grows in a quarter ahead: its open to hire less the quarter before’s. The first quarter ahead is counted against open to hire now, approved heads at the as-of date less current heads.',
    formula:
      'open to hire by this quarter end − open to hire by the quarter before’s end (now for the first)',
    population: HIRING_POPULATION,
    window: HIRING_WINDOW.quarters,
    unit: 'int',
    goodDirection: null,
    uses: HIRING_SEATS,
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringExpectedExits,
    name: 'Expected exits by quarter end',
    definition:
      'Exits expected from the as-of date to the quarter’s end: known exits, whose last day is already in the HRIS, plus modeled exits at the attrition rate, as the year-end heads projection counts them. Known and modeled show apart. Plan > Recruiting summary shows them as projected attrition.',
    formula: 'known exits + modeled exits, after the as-of date and on or before the quarter end',
    population: HIRING_POPULATION,
    window: HIRING_WINDOW.quarters,
    unit: 'num1',
    goodDirection: null,
    uses: HIRING_EXITS,
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringToReachPlan,
    name: 'To hire to reach plan',
    definition:
      'Hires needed by the quarter end to be at approved heads then: open to hire, plus the backfills the expected exits make.',
    formula: 'open to hire by quarter end + expected exits by quarter end',
    population: HIRING_POPULATION,
    window: HIRING_WINDOW.quarters,
    unit: 'num1',
    goodDirection: null,
    uses: uses(HIRING_SEATS, HIRING_EXITS),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringHiresByMonth,
    name: 'Hires by month',
    definition:
      'Employees whose hire date falls in the month, into a seat in scope, as hires year to date counts them. Internal moves and transfers are not hires.',
    formula: 'employees with a hire date in the month',
    population: 'Employees (worker type Employee) hired into seats in scope.',
    window: HIRING_WINDOW.months,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringExitsByMonth,
    name: 'Exits by month',
    definition:
      'Employees whose last day in the HRIS falls in the month, from a seat in scope. A move to another position is not an exit.',
    formula: 'employees with a last day in the month',
    population: POPULATION.employees,
    window: HIRING_WINDOW.months,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringPace,
    name: 'Hiring pace',
    definition: 'Hires per month, averaged over the last 3 closed months, and over the last 6 beside it.',
    formula: 'hires in the last 3 closed months ÷ 3 (the last 6 ÷ 6)',
    population: 'Employees (worker type Employee) hired into seats in scope.',
    window: HIRING_WINDOW.pace,
    unit: 'num1',
    goodDirection: 'up',
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringExitPace,
    name: 'Exit pace',
    definition: 'Exits per month, averaged over the last 3 closed months, and over the last 6 beside it.',
    formula: 'exits in the last 3 closed months ÷ 3 (the last 6 ÷ 6)',
    population: POPULATION.employees,
    window: HIRING_WINDOW.pace,
    unit: 'num1',
    goodDirection: 'down',
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringNetPace,
    name: 'Net hiring pace',
    definition:
      'Hires less exits per month over the last 3 closed months: how fast heads grow at this pace. At 0 or below, exits match or outrun hires.',
    formula: 'hiring pace − exit pace',
    population: POPULATION.employees,
    window: HIRING_WINDOW.pace,
    unit: 'num1',
    goodDirection: 'up',
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringAttritionRate,
    name: 'Attrition (heads)',
    definition:
      'Exits over the last 12 closed months as a share of the average heads at those month-ends, counted in heads.',
    formula: 'exits in the last 12 closed months ÷ average heads at their month-ends',
    population: POPULATION.employees,
    window: HIRING_WINDOW.attrition,
    unit: 'pct',
    goodDirection: 'down',
    uses: uses(F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringNeededPace,
    name: 'Hires needed per month',
    definition:
      'Hires a month needed to reach plan by each quarter end ahead: to hire to reach plan, divided by the month-ends from the as-of date to the quarter end. It is compared with the 3-month hiring pace: on pace, or behind by a number of hires a month.',
    formula: '(open to hire + expected exits) ÷ months from the as-of date to the quarter end',
    population: HIRING_POPULATION,
    window: HIRING_WINDOW.quarters,
    unit: 'num1',
    goodDirection: null,
    uses: uses(HIRING_SEATS, HIRING_EXITS),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringMonthsToClose,
    name: 'Months to close at this pace',
    definition:
      'How many months the net hiring pace takes to close this fiscal year’s open to hire. When exits match or outrun hires it reads "Not closing at this pace".',
    formula: 'open to hire this fiscal year ÷ net hiring pace, while the net pace is above 0',
    population: HIRING_POPULATION,
    window: HIRING_WINDOW.pace,
    unit: 'num1',
    goodDirection: 'down',
    uses: uses(HIRING_SEATS, F.assignment),
    owner: OWNER.hrbp,
  },
  /* ───────── change C37 ───────── */
  {
    id: ID.hiringMovesIn,
    name: 'Moves in by quarter end',
    definition:
      'Approved internal moves into the scope that have not started, by their move date: approved and not yet in the HRIS, or dated ahead in the HRIS, after the as-of date and on or before the quarter’s end. They are not future starts, and the row shows only when it is not 0.',
    formula: 'approved moves into the scope with as-of date < move date ≤ quarter end',
    population: 'Approved internal moves into approved employee seats in scope, from outside the scope.',
    window: HIRING_WINDOW.quarters,
    unit: 'int',
    goodDirection: null,
    uses: uses(PLAN_LINE, F.assignment),
    owner: OWNER.hrbp,
  },
  {
    id: ID.hiringRecentHires,
    name: 'Hires in the last 3 months',
    definition:
      'Employees hired in each of the last 3 closed months into a seat in scope, as hires year to date counts them, by the department and location of the seat they were hired into, with sub-totals by location and by department. Internal moves and transfers are not hires.',
    formula: 'employees with a hire date in the month, by the seat’s department and location',
    population: 'Employees (worker type Employee) hired into seats in scope.',
    window: 'The last 3 closed months.',
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment, ['positions.department', 'positions.location']),
    owner: OWNER.hrbp,
  },
  /* ───────── recruiting summary (Plan > Recruiting summary, 9.8, C38) ───────── */
  {
    id: ID.recruitingProjectedStarts,
    name: 'Projected starts',
    definition:
      'The forecast’s model of the starts to come after the as-of date, by a month or quarter end, on approved Open and Planned seats with no signed offer: each seat at its fill rate after its time to fill, plus the backfills that modeled exits reopen. Shown to one decimal and labelled a model. A signed offer is a future start, never a projected one, and projected starts never count toward open to hire.',
    formula:
      'Σ forecast starts on Open and Planned seats with no signed offer × fill rate + modeled backfills, as-of date < month-end ≤ month or quarter end',
    population: HIRING_POPULATION,
    window: RECRUITING_WINDOW.starts,
    unit: 'num1',
    goodDirection: null,
    uses: RECRUITING_STARTS,
    owner: OWNER.hrbp,
  },
  {
    id: ID.recruitingProjectedHeads,
    name: 'Projected heads',
    definition:
      'Heads expected at a month or quarter end: current heads, plus the future starts and moves in due by then, plus the projected starts, less the projected attrition (known and modeled exits). When there are any, it also takes off people whose last day is the as-of date, and adds signed offers past their start date that the HRIS has not recorded and pre-hires the HRIS holds, each its own line in the card. Projected starts and modeled exits are a model, so projected heads show to one decimal.',
    formula: 'current heads + future starts + moves in + projected starts − projected attrition',
    population: HIRING_POPULATION,
    window: RECRUITING_WINDOW.heads,
    unit: 'num1',
    goodDirection: null,
    uses: uses(HIRING_SEATS, RECRUITING_STARTS),
    owner: OWNER.hrbp,
  },
  {
    id: ID.recruitingGap,
    name: 'Gap to approved heads',
    definition:
      'Projected heads at a quarter end ahead less the approved heads by then, to one decimal. Below 0 it reads "Short by", above 0 "Over by". Projected heads are a model, so the gap is never a hiring target: open to hire is what is left to hire.',
    formula: 'projected heads at quarter end − approved heads by quarter end',
    population: HIRING_POPULATION,
    window: HIRING_WINDOW.quarters,
    unit: 'num1',
    goodDirection: null,
    uses: uses(HIRING_SEATS, RECRUITING_STARTS),
    owner: OWNER.hrbp,
  },
])
