/**
 * The Guard column of docs/PLAN.md 12, as data: which metrics show money, and under which rule.
 *
 * - **G**: a cost amount under the full guard (5 or more costed people; rounded per cost atom in
 *   HRBP and Leader mode).
 * - **B**: a band estimate. It reads no pay, so it shows to HRBP, Leader, Finance and HR admin,
 *   never in Manager mode, and is never added to a filled total under 5 costed people.
 * - **D**: a displayed difference under 7.2 rule 5 (5 or more contributors).
 * - **input**: an amount Finance enters (a target's cost), floored for HRBP and Leader.
 * - **leave**: the leave count rule (7.7).
 *
 * `part` says when only part of a metric carries the class ("cost part", "band part"). Every
 * metric not listed here shows no amount. The access layer hides every metric with G, B, D or
 * input in Manager mode (section 12's prefix list); the policy tests read this map.
 *
 * Section 12's hiding notes are here too, as data for the access layer's `decide(mode, 'metric:<id>')`
 * and its policy tests: the prefixes Manager mode hides, leave hidden in Manager and Finance mode,
 * and what HRBP and Leader mode hide through `cost:component` and `cost:monthly`. Hiding changes only
 * what is drawn; engines still read every setting through `ctx.metrics` in every mode. Plain data
 * with type-only imports.
 */
import type { PeriodPreset } from '@/data/fiscal'
import type { Mode } from '@/data/schema'

export type GuardClass = 'G' | 'B' | 'D' | 'input' | 'leave'

export interface MetricGuard {
  readonly classes: readonly GuardClass[]
  /** Only part of the metric carries the classes (its cost part, its band part, its amounts). */
  readonly part?: string
}

const g = (classes: readonly GuardClass[], part?: string): MetricGuard =>
  part ? { classes, part } : { classes }

/** By metric id, in catalog order. */
export const METRIC_GUARD: Readonly<Record<string, MetricGuard>> = {
  'plan.leave.onLeave': g(['leave']),
  'plan.cost.loaded': g(['G']),
  'plan.cost.loadedInclSbc': g(['G']),
  'plan.cost.component': g(['G']),
  'plan.cost.perHead': g(['G']),
  'plan.cost.openBand': g(['B']),
  'plan.cost.bandEstimate': g(['B']),
  'requests.chain.leaderThreshold': g(['B']),
  'requests.cycle.asks': g(['B'], 'band part'),
  'forecast.cost.fullYear': g(['G']),
  'forecast.cost.exitRunRate': g(['G']),
  'forecast.accuracy.cost': g(['G']),
  'forecast.variance.cost': g(['G', 'D']),
  'forecast.bridge.step': g(['G', 'D']),
  'forecast.fx.effect': g(['G', 'D']),
  'targets.target.cost': g(['input']),
  'targets.asks.cost': g(['G', 'B']),
  'targets.gap.cost': g(['G', 'D']),
  'targets.subOrg.unallocated': g(['input'], 'cost part'),
  'targets.tree.costCenter': g(['G'], 'cost part'),
  'whatif.delta.cost': g(['B', 'D']),
  'finance.close.adjustments': g(['G', 'D'], 'amounts'),
  'finance.freeze.savings': g(['B']),
  'finance.trade.standardHead': g(['B']),
}

/** The metric shows money (G, B, D or an input amount) in whole or in part. */
export const showsMoney = (id: string): boolean =>
  (METRIC_GUARD[id]?.classes ?? []).some((c) => c !== 'leave')

/* ───────────── section 12's hiding notes ───────────── */

/** Section 12: Manager mode hides every G, B and D metric by these id prefixes. */
export const MANAGER_HIDDEN_PREFIXES: readonly string[] = [
  'plan.cost.',
  'forecast.cost.',
  'forecast.variance.cost',
  'forecast.bridge.',
  'forecast.fx.',
  'forecast.accuracy.cost',
  'targets.target.cost',
  'targets.asks.cost',
  'targets.gap.cost',
  'whatif.',
  'finance.',
  'requests.chain.',
]

/**
 * The one rule whose setting is an amount, the rounding step (`cost.guard.floorUsd`): Manager mode
 * hides it too, so no amount reaches the glossary or Settings > Formulas there (7.6).
 */
export const MANAGER_HIDDEN_RULES: readonly string[] = ['cost.guard.floorUsd']

/** Section 12 and 7.7: the leave count, hidden in Manager and Finance mode. */
export const LEAVE_PREFIX = 'plan.leave.'
export const LEAVE_HIDDEN_IN: readonly Mode[] = ['manager', 'finance']

/**
 * Section 12, 7.3 and 8.3 `cost:component`: the amounts HRBP and Leader mode never show (cost by
 * component, cost incl. SBC, the exit run rate and freeze savings). They read "—" with "Shows in
 * Finance mode."; the openings a freeze holds (`plan.openings.frozen`) still show.
 */
export const COMPONENT_METRICS: readonly string[] = [
  'plan.cost.component',
  'plan.cost.loadedInclSbc',
  'forecast.cost.exitRunRate',
  'finance.freeze.savings',
]

/** The rounded modes (pay view 'rounded', 7.1). */
export const ROUNDED_MODES: readonly Mode[] = ['hrbp', 'leader']

/** 7.3(b) and `cost:monthly`: the only periods HRBP and Leader mode show cost for. */
export const ROUNDED_COST_PERIODS: readonly PeriodPreset[] = ['fy', 'ytd', 'qtd']

/** Section 12: Manager mode hides the metric (a G, B or D metric, the leave count or the rounding step). */
export const managerHides = (id: string): boolean =>
  MANAGER_HIDDEN_PREFIXES.some((p) => id.startsWith(p)) ||
  id.startsWith(LEAVE_PREFIX) ||
  MANAGER_HIDDEN_RULES.includes(id)

/** Section 12: HRBP and Leader mode hide the metric through `cost:component`. */
export const roundedHides = (id: string): boolean => COMPONENT_METRICS.includes(id)
