/**
 * The My team view's metric ids (docs/PLAN.md 12): every id whose home view is `team`,
 * in the plan's order. Frozen in M1: names and ids never change. The metrics builder fills `metrics`
 * with one MetricDef per id (wording, formula, population, window, unit, uses and settings), and the
 * view's engine reads ids and settings from here, never as string literals.
 *
 * The catalog imports this file, so it stays plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or '@/metrics/testing'.
 */

import type { FieldRef } from '@/data/quality/fieldRef'
import { defineMetrics } from '@/metrics/define'
import { F, uses } from '@/metrics/fields'
import type { MetricDef } from '@/metrics/types'
import { OWNER, POPULATION, WINDOW } from '@/metrics/wording'

/** Every metric id the view registers, by role. */
export const ID = {
  allocationHeads: 'team.allocation.heads',
  allocationFilled: 'team.allocation.filled',
  allocationOpen: 'team.allocation.open',
  allocationPlanned: 'team.allocation.planned',
  allocationLeftToFill: 'team.allocation.leftToFill',
  allocationLeftToRequest: 'team.allocation.leftToRequest',
  requestsPending: 'team.requests.pending',
  budgetStatus: 'team.budget.status',
  tradeStandardHeads: 'team.trade.standardHeads',
} as const

export type TeamMetricId = (typeof ID)[keyof typeof ID]

/** The settings the view's engine reads through `ctx.metrics` (docs/PLAN.md 12), by role. */
export const PARAM = {
  /** Budget status: At risk within this share of the allocation’s band cost (0.02). */
  atRiskShare: { metricId: ID.budgetStatus, key: 'atRiskShare' },
} as const

/*
 * My team is read in Manager mode, so its wording names no amount, currency or grouped number, and
 * band cost stays inside budget status (docs/PLAN.md 7.6).
 */

/**
 * What the allocation reads of the changes approved since the plan of record locked (R2): the rows the
 * approvals wrote on the seats, never the requests (M2 known gap 6, browser finding B3). A seat an
 * approval created names its request on its first row; an approval's Eliminated row names it too,
 * with why and the seat's last day (`positions.endDate`, in `F.seat`). So the allocation's figures
 * read positions and workers only, and take their tier. The requests are read only by the
 * request-driven figures: Pending, Left to request (and the hero's requested part) and Budget status.
 */
const APPROVED_CHANGE = uses(['positions.sourceRequestId'], F.ended, ['positions.endDate'])
/**
 * The allocation's seats (allocation.ts `allocationSeats`): plan-of-record seats at fiscal year end
 * (the locked lines, plan state), plus approved adds (a seat whose first row names a request, left out
 * when it starts after the year's end), minus approved eliminations, each in the tree and Filled, Open
 * or Planned on the as-of date. The seats' level, location and FTE price the band cost and the
 * standard heads, never the count (browser finding B4).
 */
const ALLOCATION_SEATS = uses(F.seat, F.tree, APPROVED_CHANGE)
/** The allocation: its seats, each weighed in standard heads at its level, location and FTE (the tile's note). */
const ALLOCATION = uses(ALLOCATION_SEATS, F.seatType)
/** The allocation's seats on the as-of date, with who is in them. */
const ALLOCATION_NOW = uses(ALLOCATION_SEATS, F.assignment)

/** The position fields the approvals wrote that the allocation reads, for the lineage test (B3). */
export const ALLOCATION_CHANGE_FIELDS: readonly FieldRef[] = APPROVED_CHANGE

/**
 * Who may see a request (8.4 rules 1 and 3): its requester, its submitter and its approval steps.
 * Left to request and Budget status count only the pending requests the viewer may see.
 */
const REQUEST_VIEWER = [
  'requests.requesterId',
  'requests.submittedById',
  'requests.steps',
] as const satisfies readonly FieldRef[]
/**
 * A pending request for the tree that the viewer may see (Pending, the crossing test): its state, the
 * seat or manager position that puts it in the tree, and who may see it (its type for a transfer's
 * rule 2a, the unit it touches for its HRBP).
 */
const PENDING = uses(
  ['requests.requestId', 'requests.type', 'requests.state', 'requests.positionId'],
  ['requests.managerPositionId', 'requests.businessUnit'],
  REQUEST_VIEWER,
  F.tree,
)

/** My list, the request tracker: each request's type, state, step and days in it, owner, then the req's dates. */
export const TRACKER_USES: readonly FieldRef[] = uses(F.request, F.requestFlow, F.tree)

/**
 * Heads by month against the allocation (`team-heads-vs-allocation`): staffed heads at each month-end
 * (the tree's holders, accepted offers from their start, not-in-plan reports at their HRIS level and
 * location), the allocation in heads, and pending requests' head effects (their type, seat, start and
 * the trade's or transfer's seats). It shows heads only: band cost stays inside budget status.
 */
export const HEADS_VS_ALLOCATION_USES: readonly FieldRef[] = uses(
  ALLOCATION_NOW,
  ['workers.managerId', 'workers.level', 'workers.location'],
  F.offer,
  ['reqs.positionId'],
  PENDING,
  ['requests.startDate'],
  F.trade,
  F.transfer,
)

const IN_ALLOCATION =
  'The allocation’s positions, strictly below the manager’s own seat. Contractor and intern seats count 0 heads.'

/** The view's dictionary entries, one per id in `ID`, in the same order. */
export const metrics: MetricDef[] = defineMetrics('team', [
  {
    id: ID.allocationHeads,
    name: 'Allocation',
    definition:
      'The seats your team has for the fiscal year: the tree’s Filled, Open and Planned positions at fiscal year end in the plan of record, plus seats approved since it locked, minus seats eliminated since then. An approved trade counts its new seats as adds and the seats it gave as eliminations.',
    formula:
      'plan-of-record Filled + Open + Planned seats at fiscal year end + approved adds since the lock − approved eliminations since the lock',
    population: `${POPULATION.tree} On hold and Eliminated seats are not in it.`,
    window:
      'The shown fiscal year, each seat at its plan-of-record level, location and FTE. It stays the same through the year: approved level, location and FTE changes and HRBP edits do not change it.',
    unit: 'int',
    goodDirection: null,
    uses: ALLOCATION,
    owner: OWNER.hrbp,
  },
  {
    id: ID.allocationFilled,
    name: 'Filled seats',
    definition: 'Seats in the allocation with an employee in them on the as-of date.',
    formula: 'allocation seats with an active employee assignment on the as-of date',
    population: IN_ALLOCATION,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: ALLOCATION_NOW,
    owner: OWNER.hrbp,
  },
  {
    id: ID.allocationOpen,
    name: 'Open seats',
    definition:
      'Seats in the allocation that are Open on the as-of date: approved and waiting for someone to start, because recruiting has begun or the last holder left.',
    formula: 'allocation seats that are Open on the as-of date',
    population: IN_ALLOCATION,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: ALLOCATION_NOW,
    owner: OWNER.hrbp,
  },
  {
    id: ID.allocationPlanned,
    name: 'Planned seats',
    definition:
      'Seats in the allocation that are Planned on the as-of date: approved for a later start, with recruiting not started.',
    formula: 'allocation seats that are Planned on the as-of date',
    population: IN_ALLOCATION,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: ALLOCATION_NOW,
    owner: OWNER.hrbp,
  },
  {
    id: ID.allocationLeftToFill,
    name: 'Left to fill',
    definition:
      'Open and Planned seats in the allocation: the seats your team still has to fill this fiscal year. Pending requests are not in it until they are approved.',
    formula: 'Open seats + Planned seats in the allocation',
    population: IN_ALLOCATION,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: ALLOCATION_NOW,
    owner: OWNER.hrbp,
  },
  {
    id: ID.allocationLeftToRequest,
    name: 'Left to request',
    definition:
      'Planned seats in the allocation with no req and no pending Start recruiting request: the seats nobody has asked to recruit for yet.',
    formula: 'Planned seats in the allocation − those with a req or a pending Start recruiting request',
    population: IN_ALLOCATION,
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: uses(ALLOCATION_NOW, F.req, F.request, REQUEST_VIEWER),
    owner: OWNER.hrbp,
  },
  {
    id: ID.requestsPending,
    name: 'Pending requests',
    definition:
      'Requests for your tree that are Submitted, In review or Sent back. They count in the allocation only once approved.',
    formula: 'requests in state Submitted, In review or Sent back',
    population: 'Requests on positions in the tree, or raised for it, that you can see.',
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: PENDING,
    owner: OWNER.hrbp,
  },
  {
    id: ID.budgetStatus,
    name: 'Budget status',
    definition:
      'Your team’s heads and band cost against its allocation, as a word with its reason in heads or plain drivers: Over, At risk or On track. Band cost is the band midpoint × FTE of each seat. It never reads anyone’s pay or offer and is never shown.',
    formula:
      'Over: staffed heads or band cost above the allocation at the as-of month-end. At risk: staffed, or staffed + pending requests, above it at any month-end to fiscal year end, or staffed band cost within the at-risk share of the allocation’s. Otherwise On track.',
    population:
      'Staffed: employees in the tree’s Filled seats (a known exit counts through its last day), accepted offers from their start date and not-in-plan employees who report into the tree, at their seats’ current Working level, location and FTE. Pending requests add their head effect and band cost from their start, for the crossing test only.',
    window: 'Each month-end from the as-of month to fiscal year end.',
    unit: 'text',
    goodDirection: null,
    uses: uses(
      ALLOCATION_NOW,
      F.workerType,
      F.offer,
      F.request,
      REQUEST_VIEWER,
      F.requestSeat,
      F.trade,
      F.transfer,
      F.assumptions,
    ),
    owner: OWNER.hrbp,
    params: [
      {
        key: PARAM.atRiskShare.key,
        label: 'At risk within',
        description:
          'Budget status reads At risk when staffed band cost is within this share of the allocation’s band cost at the as-of month-end.',
        type: 'percent',
        default: 0.02,
        min: 0,
        max: 0.2,
        step: 0.005,
        format: 'pct',
      },
    ],
  },
  {
    id: ID.tradeStandardHeads,
    name: 'Allocation in standard heads',
    definition:
      'The allocation’s positions weighed in standard heads, each at its own level, location and FTE, so an average full-time seat counts 1.00. It shows as a note on Allocation and never sets budget status.',
    formula: 'Σ weight of the allocation’s positions, in standard heads',
    population: 'The allocation’s employee positions.',
    window: WINDOW.tradeYear,
    unit: 'num2',
    goodDirection: null,
    uses: uses(ALLOCATION, F.assumptions),
    owner: OWNER.hrbp,
  },
])
