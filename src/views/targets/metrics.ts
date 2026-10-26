/**
 * The Targets view's metric ids (docs/PLAN.md 12): every id whose home view is `targets`,
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
import { OWNER, POPULATION, WINDOW } from '@/metrics/wording'

/** Every metric id the view registers, by role. */
export const ID = {
  targetHeads: 'targets.target.heads',
  targetCost: 'targets.target.cost',
  asksHeads: 'targets.asks.heads',
  asksCost: 'targets.asks.cost',
  gapHeads: 'targets.gap.heads',
  gapCost: 'targets.gap.cost',
  subOrgUnallocated: 'targets.subOrg.unallocated',
  treeCostCenter: 'targets.tree.costCenter',
  tradesHeads: 'targets.trades.heads',
} as const

export type TargetsMetricId = (typeof ID)[keyof typeof ID]

/** A cost amount under the full guard. */
const GUARDED = [RULE_ID.minCosted, RULE_ID.floorUsd]
const TARGET = uses(F.target)
/** Asks: Working approved heads at the target date plus the head effect of each pending request. */
const ASKS = uses(PLAN_LINE, F.tree, F.seatOrg, F.request, F.requestFlow, F.requestSeat, F.trade, F.transfer)
const TARGET_ORG =
  'The org the target is set for (a unit, department, cost center or leader’s tree), with every position below it.'

/** The view's dictionary entries, one per id in `ID`, in the same order. */
export const metrics: MetricDef[] = defineMetrics('targets', [
  {
    id: ID.targetHeads,
    name: 'Target heads',
    views: ['home'],
    definition:
      'Finance’s heads for an org at the target date, or at the fiscal year end when the date is blank. Trades never move a target.',
    formula: 'target heads for the org and fiscal year',
    population: TARGET_ORG,
    window: WINDOW.targetDate,
    unit: 'int',
    goodDirection: null,
    uses: TARGET,
    owner: OWNER.finance,
  },
  {
    id: ID.targetCost,
    name: 'Target cost',
    views: ['home'],
    definition:
      'Finance’s loaded cost for an org for the fiscal year: the sum of its months under the version’s proration, not a year-end run rate. HRBP and Leader see it rounded down to the cost step.',
    formula: 'target cost for the org and fiscal year',
    population: TARGET_ORG,
    window: WINDOW.fiscalYear,
    unit: 'money',
    goodDirection: null,
    uses: uses(TARGET, F.targetCost),
    dependsOn: [RULE_ID.floorUsd],
    owner: OWNER.finance,
  },
  {
    id: ID.asksHeads,
    name: 'Asks',
    views: ['home'],
    definition:
      'Working positions that are Filled, Open or Planned on the target date with a start on or before it, plus the head effect of each pending request that takes effect by then. Trades count net (seats received − Open or Planned seats given), and a pending elimination counts −1.',
    formula:
      'Working approved heads at the target date + Σ head effect of pending requests effective by then',
    population: `${TARGET_ORG} Pending means Submitted, In review or Sent back.`,
    window: WINDOW.targetDate,
    unit: 'int',
    goodDirection: null,
    uses: ASKS,
    owner: OWNER.finance,
  },
  {
    id: ID.asksCost,
    name: 'Asks cost',
    definition:
      'The fiscal year’s loaded cost of Working lines, plus each pending request’s band estimate effect for the months from its start or effective date to the year end. A pending request never reads HRIS pay, an offer or severance; those move Working only once it is approved.',
    formula: 'Σ Working loaded cost + Σ band effect ÷ 12 × active fraction from the start to the year end',
    population: `${POPULATION.costed} The band effect of pending requests is a separate band part.`,
    window: WINDOW.fiscalYear,
    unit: 'money',
    goodDirection: null,
    uses: uses(ASKS, LOADED_COST, BAND),
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  {
    id: ID.gapHeads,
    name: 'Gap',
    views: ['home', 'requests'],
    definition: 'Target heads minus asks. Negative means asks exceed the target.',
    formula: 'target heads − asks',
    population: TARGET_ORG,
    window: WINDOW.targetDate,
    unit: 'int',
    goodDirection: null,
    uses: uses(TARGET, ASKS),
    owner: OWNER.finance,
  },
  {
    id: ID.gapCost,
    name: 'Cost gap',
    views: ['home'],
    definition:
      'Target cost minus asks cost. Negative means asks cost more than the target. HRBP and Leader see it from rounded parts; an org that is not made of whole cost atoms shows heads only.',
    formula: 'target cost − asks cost',
    population: `${POPULATION.costed} The difference also needs 5 or more contributors.`,
    window: WINDOW.fiscalYear,
    unit: 'money',
    goodDirection: null,
    uses: uses(TARGET, F.targetCost, ASKS, LOADED_COST, BAND),
    dependsOn: [...GUARDED, RULE_ID.minContributors],
    owner: OWNER.finance,
  },
  {
    id: ID.subOrgUnallocated,
    name: 'Unallocated',
    views: ['home'],
    definition:
      'The part of a parent org’s target not yet split into sub-org targets, in heads and, where the sub-orgs carry a cost target, in target cost. Sub-org targets add up to at most the parent’s. HRBP and Leader see the cost part rounded down to the cost step.',
    formula: 'parent target − Σ sub-org targets, in heads and in target cost',
    population: 'A parent org’s target and the targets of its sub-orgs.',
    window: WINDOW.targetDate,
    unit: 'int',
    goodDirection: null,
    uses: uses(TARGET, F.targetCost, F.tree),
    // Its cost part is an input, floored for HRBP and Leader like the target cost (section 12).
    dependsOn: [RULE_ID.floorUsd],
    owner: OWNER.finance,
  },
  {
    id: ID.treeCostCenter,
    name: 'Tree by cost center',
    definition:
      'Approved heads for each node of a leader’s tree by Finance’s cost center. Cost shows per unit and cost center, and on a node only where the node is made of whole cost centers with 5 or more costed people.',
    formula: 'approved heads per tree node × cost center',
    population: 'Positions in the leader’s tree.',
    window: WINDOW.asOf,
    unit: 'int',
    goodDirection: null,
    uses: uses(PLAN_LINE, F.tree, F.seatOrg),
    dependsOn: GUARDED,
    owner: OWNER.finance,
  },
  {
    id: ID.tradesHeads,
    name: 'Heads from trades',
    definition:
      'The heads trades add to an org’s asks: seats received minus Open or Planned seats given. An On hold seat given counts 0, because it was never an approved head.',
    formula: 'Σ over trades (seats received − Open or Planned seats given)',
    population: 'Pending and approved trades into or out of the org in the fiscal year.',
    window: WINDOW.targetDate,
    unit: 'int',
    goodDirection: null,
    uses: uses(F.request, F.trade, F.seat, F.tree),
    owner: OWNER.finance,
  },
])
