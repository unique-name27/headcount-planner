/**
 * The assembled metric dictionary (docs/PLAN.md 12): every view's entries (from
 * `src/views/<key>/metrics.ts`), in folder-tab order, then the pages' (the Audit page's, the Action
 * center's and the Data room's, `src/views/data/roomMetrics.ts`), then the privacy rules, the cost
 * guard's rules and the data quality rules.
 */
import { metrics as actions } from '@/views/actions/metrics'
import { metrics as audit } from '@/views/audit/metrics'
import { metrics as data } from '@/views/data/roomMetrics'
import { metrics as finance } from '@/views/finance/metrics'
import { metrics as forecast } from '@/views/forecast/metrics'
import { metrics as plan } from '@/views/plan/metrics'
import { metrics as requests } from '@/views/requests/metrics'
import { metrics as targets } from '@/views/targets/metrics'
import { metrics as team } from '@/views/team/metrics'
import { metrics as whatif } from '@/views/whatif/metrics'
import { COST_GUARD_METRICS } from './costGuard'
import { PRIVACY_METRICS } from './privacy'
import { QUALITY_METRICS } from './quality'
import { catalogOf, type MetricCatalog } from './registry'
import type { MetricDef, MetricView } from './types'

/** Each view's and page's own entries, as registered. */
export const VIEW_METRICS: Readonly<Partial<Record<MetricView, readonly MetricDef[]>>> = {
  team,
  plan,
  requests,
  forecast,
  targets,
  whatif,
  finance,
  audit,
  actions,
  data,
}

/** Every metric Headcount Planner shows, plus the privacy, cost guard and data quality rules. */
export const METRICS: readonly MetricDef[] = [
  ...team,
  ...plan,
  ...requests,
  ...forecast,
  ...targets,
  ...whatif,
  ...finance,
  ...audit,
  ...actions,
  ...data,
  ...PRIVACY_METRICS,
  ...COST_GUARD_METRICS,
  ...QUALITY_METRICS,
]

export const CATALOG: MetricCatalog = catalogOf(METRICS)

/** The metrics that appear in a view (home view or not), in catalog order. */
export const metricsOfView = (view: MetricView, catalog: MetricCatalog = CATALOG): MetricDef[] =>
  catalog.list.filter((d) => d.views.includes(view))
