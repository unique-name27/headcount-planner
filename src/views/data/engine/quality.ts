/**
 * The Data quality tab (`data.quality.metricTiers`; the template app's Quality tab, for HCP's eight
 * datasets): each dataset's tier with what keeps it from the next one, every field's coverage and
 * tier (the field matrix), and how many of each view's metrics stand at each tier. A metric takes the
 * lowest tier of the fields it reads; one that names none takes the lowest tier of its view's
 * datasets. Privacy, cost guard and data quality rules and calculation settings read no data and are
 * not counted. Pure.
 */
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { TIER_LABEL, type Tier } from '@/data/quality/tier'
import { DATASET_KEYS, DATASETS, type DatasetKey, isViewKey } from '@/data/schema'
import { METRIC_VIEW_LABEL, readsNoData } from '@/metrics/registry'
import type { MetricDef, MetricView } from '@/metrics/types'

/** Tiers in the order the bars stack them: best first. */
export const TIER_SERIES: readonly Tier[] = ['gold', 'silver', 'bronze', 'none']

/** The datasets a view reads (its `usedBy`); a page reads every dataset. */
export function datasetsOfView(view: MetricView): DatasetKey[] {
  if (!isViewKey(view)) return [...DATASET_KEYS]
  return DATASETS.filter((d) => d.usedBy.includes(view)).map((d) => d.key)
}

/** One metric that reads data, with its home view and tier. */
export interface MetricTierRow {
  id: string
  name: string
  view: MetricView
  tier: Tier
}

/** Every metric that reads data, with its tier under the data loaded now. */
export function metricTierRows(ctx: Pick<AnalyticsContext, 'metrics' | 'quality'>): MetricTierRow[] {
  return ctx.metrics.list
    .filter((d: MetricDef) => !readsNoData(d))
    .map((d) => {
      const view = d.views[0]
      return { id: d.id, name: d.name, view, tier: ctx.quality.tierOf(d.uses, datasetsOfView(view)) }
    })
}

export interface ViewTierCell {
  [key: string]: unknown
  view: MetricView
  viewLabel: string
  tier: Tier
  tierLabel: string
  metrics: number
  ids: readonly string[]
}

/** One cell per view and tier present, views in folder-tab order (then the pages), tiers best first. */
export function metricTiersByView(rows: readonly MetricTierRow[]): ViewTierCell[] {
  const order = Object.keys(METRIC_VIEW_LABEL) as MetricView[]
  return order
    .filter((v) => rows.some((r) => r.view === v))
    .flatMap((view) =>
      TIER_SERIES.flatMap((tier) => {
        const ids = rows.filter((r) => r.view === view && r.tier === tier).map((r) => r.id)
        return ids.length
          ? [
              {
                view,
                viewLabel: METRIC_VIEW_LABEL[view],
                tier,
                tierLabel: TIER_LABEL[tier],
                metrics: ids.length,
                ids,
              },
            ]
          : []
      }),
    )
}

export const METRIC_TIER_COLUMNS: readonly Column<ViewTierCell>[] = [
  { key: 'viewLabel', label: 'View' },
  { key: 'tierLabel', label: 'Tier' },
  { key: 'metrics', label: 'Metrics', format: 'int' },
]

/** One field of one dataset: how well it is filled and its tier. Counts only, never a value. */
export interface FieldRow {
  [key: string]: unknown
  dataset: DatasetKey
  datasetLabel: string
  field: string
  label: string
  requirement: 'Required' | 'Recommended' | 'Optional'
  /** One person's amount or leave (`pay: true`): its name shows, never a value. */
  pay: boolean
  rows: number
  applicable: number
  filled: number
  coverage: number | null
  invalid: number
  defaulted: number
  tier: Tier
  tierLabel: string
  /** Why it sits below its dataset's tier. */
  capReason: string | null
}

/** Every field of every dataset, in schema order. */
export function fieldRows(ctx: Pick<AnalyticsContext, 'quality'>): FieldRow[] {
  return DATASETS.flatMap((def) => {
    const stats = new Map(ctx.quality.fields(def.key).map((s) => [s.ref, s]))
    return def.fields.map((f): FieldRow => {
      const s = stats.get(`${def.key}.${f.key}` as never)
      return {
        dataset: def.key,
        datasetLabel: def.label,
        field: f.key,
        label: f.label,
        requirement: f.required ? 'Required' : f.recommended ? 'Recommended' : 'Optional',
        pay: !!f.pay,
        rows: s?.rows ?? 0,
        applicable: s?.applicableRows ?? 0,
        filled: s?.filled ?? 0,
        coverage: s?.coverage ?? null,
        invalid: s?.invalid ?? 0,
        defaulted: s?.defaulted ?? 0,
        tier: s?.tier ?? 'none',
        tierLabel: TIER_LABEL[s?.tier ?? 'none'],
        capReason: s?.capReason ?? null,
      }
    })
  })
}

export const FIELD_COLUMNS: readonly Column<FieldRow>[] = [
  { key: 'datasetLabel', label: 'Dataset' },
  { key: 'label', label: 'Field' },
  { key: 'requirement', label: 'Requirement' },
  { key: 'applicable', label: 'Rows it applies to', format: 'int' },
  { key: 'filled', label: 'Rows filled', format: 'int' },
  { key: 'coverage', label: 'Filled', format: 'pct' },
  { key: 'invalid', label: 'Not recognized', format: 'int' },
  { key: 'defaulted', label: 'Set by default', format: 'int' },
  { key: 'tierLabel', label: 'Tier' },
  { key: 'capReason', label: 'Why it is lower' },
]

/** One dataset's tier and what keeps it from the next one. */
export interface DatasetTierRow {
  [key: string]: unknown
  key: DatasetKey
  label: string
  tier: Tier
  tierLabel: string
  rows: number
  /** "Silver: mapping confirmed …", the quality index's own words. */
  explain: string
  missing: string
}

export function datasetTierRows(ctx: Pick<AnalyticsContext, 'quality'>): DatasetTierRow[] {
  return DATASETS.map((d) => {
    const q = ctx.quality.dataset(d.key)
    return {
      key: d.key,
      label: d.label,
      tier: q.tier,
      tierLabel: TIER_LABEL[q.tier],
      rows: q.rows,
      explain: ctx.quality.explain(d.key),
      missing: q.missing.join('; '),
    }
  })
}

export const DATASET_TIER_COLUMNS: readonly Column<DatasetTierRow>[] = [
  { key: 'label', label: 'Dataset' },
  { key: 'tierLabel', label: 'Tier' },
  { key: 'rows', label: 'Rows', format: 'int' },
  { key: 'missing', label: 'To reach the next tier' },
]
