/**
 * The Data room's figure ids (docs/PLAN.md 9.1), by tab. Ids start with `data-` (the policy decides
 * them by that prefix, and every one follows `page:data`). Data room figures describe the data
 * itself, so they are not gated on the data standard (`gate={false}`). Frozen in the M2 freeze: the
 * builder may add ids with the prefix, never rename these. The UI writes each id as a literal
 * (`<Figure id="data-manifest"`), so the source-scan test can check it draws exactly these.
 */
export const DATA_FIGURES = {
  manifest: 'data-manifest',
  byMonth: 'data-records-by-month',
  qualityDatasets: 'data-quality-datasets',
  qualityFields: 'data-quality-fields',
  /** Data quality's key figures: metrics at each tier (added by the views-4 builder). */
  qualityKpis: 'data-quality-kpis',
  metricsByView: 'data-quality-metrics-by-view',
  definitions: 'data-metric-definitions',
  lists: 'data-lists',
  workspace: 'data-workspace',
} as const
export type DataFigureId = (typeof DATA_FIGURES)[keyof typeof DATA_FIGURES]
