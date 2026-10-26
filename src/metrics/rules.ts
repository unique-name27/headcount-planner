/**
 * The rule entries of the metric dictionary (docs/PLAN.md 7.2 and 12): the privacy rules and the
 * cost-guard rules. Their wording and targets are locked; their minimums can be raised, never lowered.
 * Frozen in M1 as ids and setting references; the M1 metrics builder writes their MetricDefs
 * (`kind: 'rule'`, `locked: true`, shared prefixes `privacy` and `cost`).
 *
 * Engines and the guard read every value through `ctx.metrics.num(ref.metricId, ref.key)`, never a
 * constant: "The minimum is read from `cost.guard.minCosted` (locked, raise-only)" (7.2 rule 1).
 * Plain data; no imports, so anything may import it.
 */

/** Every rule id, by role. */
export const RULE_ID = {
  /** Anonymity minimum (5, raise only). */
  anonymity: 'privacy.anonymity',
  /** Pay amounts are opt-in (HR admin's "Show pay amounts", session only). */
  payAmounts: 'privacy.payAmounts',
  /** Leave shows as one count of 5 or more, for the whole scope at the as-of date. */
  leaveCounts: 'privacy.leaveCounts',
  /** Minimum costed people behind a cost amount (5, raise only). */
  minCosted: 'cost.guard.minCosted',
  /** Rounding step for HRBP and Leader ($100,000, raise only). */
  floorUsd: 'cost.guard.floorUsd',
  /** Minimum contributors to a displayed difference (5, raise only). */
  minContributors: 'cost.guard.minContributors',
} as const

export type RuleId = (typeof RULE_ID)[keyof typeof RULE_ID]

export const PRIVACY_RULE_IDS = [RULE_ID.anonymity, RULE_ID.payAmounts, RULE_ID.leaveCounts] as const
export const COST_GUARD_RULE_IDS = [RULE_ID.minCosted, RULE_ID.floorUsd, RULE_ID.minContributors] as const

/** A rule's setting: the metric that holds it and its key. */
export interface RuleSetting {
  readonly metricId: RuleId
  readonly key: string
  /** The registered default; the setting may be raised from it, never lowered ('raiseOnly'), or never changed (true). */
  readonly default: number | boolean
  readonly locked: 'raiseOnly' | true
}

/** Smallest group shown (people). */
export const ANONYMITY: RuleSetting = {
  metricId: RULE_ID.anonymity,
  key: 'minGroup',
  default: 5,
  locked: 'raiseOnly',
}
/** Pay amounts stay opt-in. */
export const PAY_AMOUNTS: RuleSetting = {
  metricId: RULE_ID.payAmounts,
  key: 'optIn',
  default: true,
  locked: true,
}
/** Smallest leave count shown. */
export const LEAVE_COUNTS: RuleSetting = {
  metricId: RULE_ID.leaveCounts,
  key: 'minCount',
  default: 5,
  locked: 'raiseOnly',
}
/** Smallest number of costed people behind a cost amount (7.2 rule 1). */
export const MIN_COSTED: RuleSetting = {
  metricId: RULE_ID.minCosted,
  key: 'min',
  default: 5,
  locked: 'raiseOnly',
}
/** The $0.1M step rounded modes floor to (7.3a). */
export const FLOOR_USD: RuleSetting = {
  metricId: RULE_ID.floorUsd,
  key: 'stepUsd',
  default: 100_000,
  locked: 'raiseOnly',
}
/** Smallest number of contributors behind a displayed difference (7.2 rule 5). */
export const MIN_CONTRIBUTORS: RuleSetting = {
  metricId: RULE_ID.minContributors,
  key: 'min',
  default: 5,
  locked: 'raiseOnly',
}

/** Every rule setting, in RULE_ID order. */
export const RULE_SETTINGS: readonly RuleSetting[] = [
  ANONYMITY,
  PAY_AMOUNTS,
  LEAVE_COUNTS,
  MIN_COSTED,
  FLOOR_USD,
  MIN_CONTRIBUTORS,
]
