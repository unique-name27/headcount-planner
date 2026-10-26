/**
 * The Data room's metric ids (docs/PLAN.md 12, `data.*`: the template app's Data room quality
 * metrics): records by month (coverage) and the tier of every metric. Named roomMetrics.ts, not
 * metrics.ts, because `src/views/data/metrics/` is the Metric definitions tab's folder. Plain data:
 * the catalog imports this file.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md): the ids. The views-4 builder filled `metrics`;
 * src/metrics/catalog.ts holds it, and src/access/ids.ts `METRIC_IDS` the ids.
 */
import { defineMetrics } from '@/metrics/define'
import { F, uses } from '@/metrics/fields'
import type { MetricDef } from '@/metrics/types'
import { OWNER } from '@/metrics/wording'

export const ID = {
  coverageByMonth: 'data.coverage.byMonth',
  qualityMetricTiers: 'data.quality.metricTiers',
} as const
export type DataMetricId = (typeof ID)[keyof typeof ID]

/** The Data room's dictionary entries: the numbers its figures show about the data itself. */
export const metrics: MetricDef[] = defineMetrics('data', [
  {
    id: ID.coverageByMonth,
    name: 'Records by month',
    definition:
      'How many rows of each dataset are dated in each month, by the dataset’s own event date: a position row’s effective date, a hire or leaving date, a pay row’s effective date, the date a req opened or a request was submitted, and the start of a freeze. A month with far fewer rows than the rest is a gap to check.',
    formula: 'rows with an event date in the month · share = rows ÷ rows in the dataset’s busiest month',
    population:
      'Every loaded row of the datasets that carry an event date, whatever the filters. Targets and assumptions hold what is planned, carry no event date and are not shown. Counts only: no value of any row.',
    window: 'The 24 months to the as-of date.',
    unit: 'int',
    goodDirection: null,
    uses: uses(
      ['positions.effectiveDate', 'workers.hireDate', 'workers.terminationDate', 'comp.effectiveDate'],
      ['reqs.openedDate', 'requests.submittedAt', 'freezes.startDate'],
    ),
    owner: OWNER.analytics,
  },
  {
    id: ID.qualityMetricTiers,
    name: 'Metrics by view and tier',
    definition:
      'How many of each view’s metrics stand at each tier. A metric takes the lowest tier of the fields it reads; one that names no fields takes the lowest tier of its view’s datasets.',
    formula: 'count of registered metrics per home view and tier',
    population:
      'Every registered metric that reads data. Privacy, cost guard and data quality rules and calculation settings read none and are not counted.',
    window: 'The data loaded now, judged against the data quality rules in force.',
    unit: 'int',
    goodDirection: null,
    uses: uses(F.seat, F.assignment),
    owner: OWNER.analytics,
  },
])
