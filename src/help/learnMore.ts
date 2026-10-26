/**
 * Which help article covers a metric, for "Learn more" in the KPI and figure info popovers (the
 * template app's help/learnMore.ts, with HCP's views). Pure and light (no article content), so the
 * shared components can import it.
 *
 * Frozen in the M4 freeze (docs/CONTRACTS-M4.md): the maps are data, written in full; the help-engine
 * builder may add entries for new metrics (tests check every metric is covered and every article
 * exists).
 */

/** A view's article, by the first part of a metric id (`plan.heads.approved` → Plan). */
const BY_PREFIX: Readonly<Record<string, string>> = {
  team: 'view-team',
  plan: 'view-plan',
  requests: 'view-requests',
  forecast: 'view-forecast',
  targets: 'view-targets',
  whatif: 'view-whatif',
  finance: 'view-finance',
  actions: 'view-actions',
  audit: 'view-audit',
  data: 'view-data',
  quality: 'data-tiers',
  privacy: 'privacy-small-groups',
  cost: 'privacy-small-groups',
}

/** Metrics with their own article: the rules, the trade weights, the Data room's own charts. */
const BY_ID: Readonly<Record<string, string>> = {
  'privacy.anonymity': 'privacy-small-groups',
  'privacy.payAmounts': 'privacy-pay',
  'privacy.leaveCounts': 'privacy-leave',
  'cost.guard.minCosted': 'privacy-small-groups',
  'cost.guard.floorUsd': 'privacy-small-groups',
  'cost.guard.minContributors': 'privacy-small-groups',
  'finance.trade.standardHead': 'trading-heads',
  'plan.trade.weight': 'trading-heads',
  'requests.trade.credit': 'trading-heads',
  'requests.trade.ratio': 'trading-heads',
  'targets.trades.heads': 'trading-heads',
  'team.trade.standardHeads': 'trading-heads',
  'data.coverage.byMonth': 'data-loading',
  'data.quality.metricTiers': 'data-quality',
}

/** Every article id this module can return (tests check each one exists). */
export const LEARN_MORE_ARTICLES: readonly string[] = [
  ...new Set([...Object.values(BY_PREFIX), ...Object.values(BY_ID)]),
]

/** The article that explains a metric, or null when none covers it. */
export function articleForMetric(metricId: string | null | undefined): string | null {
  if (!metricId) return null
  return BY_ID[metricId] ?? BY_PREFIX[metricId.split('.')[0]] ?? null
}
