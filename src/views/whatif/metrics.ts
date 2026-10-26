/**
 * The What if view's metric ids (docs/PLAN.md 12): every id whose home view is `whatif`,
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
import { OWNER, WINDOW } from '@/metrics/wording'

/** Every metric id the view registers, by role. */
export const ID = {
  deltaHeads: 'whatif.delta.heads',
  deltaCost: 'whatif.delta.cost',
  deltaGap: 'whatif.delta.gap',
} as const

export type WhatIfMetricId = (typeof ID)[keyof typeof ID]

/** What the levers touch: Planned seats, Open seats with no accepted offer, requests and freezes. */
const LEVERS = uses(PLAN_LINE, F.offer, F.tree, F.request, F.trade, F.freeze, F.target)
const LEVER_SEATS =
  'Planned seats, Open seats with no accepted offer, requests and freezes the levers touch. An accepted offer is never a lever.'
const AGAINST = 'Working with the levers against Working without them, not against the comparison version.'

/** The view's dictionary entries, one per id in `ID`, in the same order. */
export const metrics: MetricDef[] = defineMetrics('whatif', [
  {
    id: ID.deltaHeads,
    name: 'Heads change',
    // At the scope's target date, as the engine counts it (R58, engine/index.ts dateOfTarget).
    definition: `The change the levers make to heads at the scope’s target date (the fiscal year end when its target has none): ${AGAINST}`,
    formula: 'heads with the levers − heads without them',
    population: LEVER_SEATS,
    window: WINDOW.targetDate,
    unit: 'num1',
    goodDirection: null,
    uses: LEVERS,
    owner: OWNER.finance,
  },
  {
    id: ID.deltaCost,
    name: 'Cost change',
    definition: `The change the levers make to the fiscal year’s loaded cost, at band estimate for the months from each change’s date to the year end: ${AGAINST} While only band estimates change it is a band figure; once an HRIS or offer amount differs it needs 5 or more contributors, and HRBP and Leader mode build it from the rounded totals of the two sides.`,
    formula: 'loaded cost with the levers − loaded cost without them',
    population: LEVER_SEATS,
    window: WINDOW.fiscalYear,
    unit: 'money',
    goodDirection: null,
    uses: uses(LEVERS, BAND),
    // B while band-only; once an HRIS or offer amount differs, a guarded difference (7.2 rule 5) of
    // two guarded totals, built from rounded parts in HRBP and Leader mode (7.3c).
    dependsOn: [RULE_ID.minCosted, RULE_ID.floorUsd, RULE_ID.minContributors],
    owner: OWNER.finance,
  },
  {
    id: ID.deltaGap,
    name: 'Gap change',
    definition: `The change the levers make to the gap in heads at the target date: ${AGAINST}`,
    formula: 'gap with the levers − gap without them',
    population: LEVER_SEATS,
    window: WINDOW.targetDate,
    unit: 'num1',
    goodDirection: null,
    uses: LEVERS,
    owner: OWNER.finance,
  },
])
