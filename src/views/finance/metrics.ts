/**
 * The Finance view's metric ids (docs/PLAN.md 12): every id whose home view is `finance`,
 * in the plan's order. Frozen in M1: names and ids never change. The metrics builder fills `metrics`
 * with one MetricDef per id (wording, formula, population, window, unit, uses and settings), and the
 * view's engine reads ids and settings from here, never as string literals.
 *
 * The catalog imports this file, so it stays plain data: never React, '@/data/context',
 * '@/data/store', the '@/metrics' barrel, '@/metrics/catalog', '@/metrics/api' or '@/metrics/testing'.
 */
import { defineMetrics } from '@/metrics/define'
import { BAND, F, PLAN_LINE, uses } from '@/metrics/fields'
import { RULE_ID } from '@/metrics/rules'
import type { MetricDef } from '@/metrics/types'
import { OWNER, SHOWN_IN_FINANCE, WINDOW } from '@/metrics/wording'

/** Every metric id the view registers, by role. */
export const ID = {
  versionsLocked: 'finance.versions.locked',
  closeAdjustments: 'finance.close.adjustments',
  freezeSavings: 'finance.freeze.savings',
  reconExceptions: 'finance.recon.exceptions',
  reconCostCenterMismatch: 'finance.recon.costCenterMismatch',
  tradeStandardHead: 'finance.trade.standardHead',
} as const

export type FinanceMetricId = (typeof ID)[keyof typeof ID]

/** Reconciliation: the imported status against who is in each seat on the as-of date. */
const RECONCILE = uses(F.seat, F.seatOrg, F.assignment, F.workerOrg)

/** The view's dictionary entries, one per id in `ID`, in the same order. */
export const metrics: MetricDef[] = defineMetrics('finance', [
  {
    id: ID.versionsLocked,
    name: 'Locked versions',
    definition:
      'Versions of the fiscal year locked so far: its Budget and each reforecast. A locked version stores its lines, assumptions, rates and a checksum, and is never recomputed.',
    formula: 'count of the fiscal year’s versions in state locked',
    population: 'Versions of the shown fiscal year; a retired Working is not counted.',
    window: WINDOW.fiscalYear,
    unit: 'int',
    goodDirection: null,
    uses: [],
    owner: OWNER.finance,
  },
  {
    id: ID.closeAdjustments,
    name: 'Back-dated adjustments',
    definition:
      'HRIS changes effective in a month already closed, posted in the first open month: back-dated hires, back-dated exits and other HRIS changes. Hires and exits list by position with no amount; other changes show only as a count per posted month when it is 5 or more. Amounts show only as sums by posted month, over 5 or more costed people and 5 or more contributors, and never in HRBP mode, which reads the counts.',
    formula: 'count of adjustments by posted month and kind; amount = Σ adjustment amounts by posted month',
    population: 'Adjustments on positions in scope.',
    window: 'Each month posted since the first close.',
    unit: 'int',
    goodDirection: null,
    uses: uses(F.assignment, F.workerFte, F.pay),
    // Its amounts are G and D (section 12): the full guard and the contributors rule.
    dependsOn: [RULE_ID.minCosted, RULE_ID.floorUsd, RULE_ID.minContributors],
    owner: OWNER.finance,
  },
  {
    id: ID.freezeSavings,
    name: 'Freeze savings',
    views: ['home'],
    definition: `The band estimate of each opening a freeze holds, for each month it is held, plus the modeled backfills the freeze stops, at band midpoint. It never reads the comparison’s cost, HRIS pay or an offer. ${SHOWN_IN_FINANCE} HRBP and Leader mode show the openings held, not the amount.`,
    formula:
      'Σ over held openings of band estimate ÷ 12 × active fraction for each month held + stopped backfills at midpoint',
    population: 'Open and Planned seats with no accepted offer in a frozen org.',
    window:
      'From the later of the freeze start and the opening’s forecast start, to the earlier of the freeze end and the grid end.',
    unit: 'money',
    goodDirection: null,
    uses: uses(PLAN_LINE, F.opened, F.offer, F.seatOrg, F.tree, F.seatReqType, F.freeze, BAND),
    owner: OWNER.finance,
  },
  {
    id: ID.reconExceptions,
    name: 'Reconciliation exceptions',
    views: ['home'],
    definition:
      'Where the imported position status and the HRIS disagree on the as-of date: an employee with no position, a worker’s cost center unlike the position’s, a Filled seat with no one in it, someone in an Open, On hold or Eliminated seat, and two people in one seat outside a handover of up to 30 days.',
    formula: 'count of exceptions, by kind',
    population: 'Positions and active employees in scope.',
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: RECONCILE,
    owner: OWNER.finance,
  },
  {
    id: ID.reconCostCenterMismatch,
    name: 'Cost-center mismatches',
    definition: 'Active assignments whose worker’s cost center differs from the position’s cost center.',
    formula: 'active assignments with worker cost center ≠ position cost center',
    population: 'Active employee assignments in scope.',
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: 'down',
    uses: RECONCILE,
    owner: OWNER.finance,
  },
  {
    id: ID.tradeStandardHead,
    name: 'Standard head',
    views: ['requests'],
    definition:
      'Finance’s unit for trading seats: the average band estimate per approved FTE in the fiscal year’s Budget, rounded to the nearest $1,000. It is set once a year when the Budget locks, so an average full-time seat weighs 1.00.',
    formula: 'Σ band estimate ÷ Σ FTE over approved employee positions at the Budget’s fiscal year end',
    population: 'Approved employee positions in the Budget, Filled seats counted at band, never at HRIS pay.',
    window: 'The fiscal year’s Budget; a year with no Budget uses its Working value until it locks.',
    unit: 'money',
    goodDirection: null,
    uses: uses(PLAN_LINE, BAND),
    owner: OWNER.finance,
  },
])
