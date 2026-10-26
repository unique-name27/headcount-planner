/**
 * The Data room's model (docs/PLAN.md 9.1, 5.2; the template app's Data room): HR admin's home, the
 * page where the eight datasets are imported, mapped, checked and certified. Its tabs are Datasets,
 * Data quality, Metric definitions, Lists and Workspace (`DATA_ROOM_TABS`, equal to src/access/ids.ts
 * `DATA_TABS`); every tab follows `page:data` (HR admin only). Workspace's file actions (Shareable,
 * Full, Requests, Export for a manager, Open a shared file, Import and Import requests) are
 * ./workspace.ts and ./menu.ts (M3). One model per analytics context (`dataModel`, cached in a
 * WeakMap).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). The views-4 builder ports the template's Data room
 * engines behind it and may add fields, never rename or retype these. Added: the Datasets tab's
 * records by month and summary, the Data quality tab's figures (`qualityFigures`: datasets by tier,
 * the field matrix, metrics by view and tier), the Lists tab's lists and the Workspace tab's words.
 * Every figure counts rows; none shows a value of a row, so no pay or leave amount reaches the page.
 */
import type { TabDef } from '@/access/ids'
import { requestView, viewerOf } from '@/access/visibility'
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { Tier } from '@/data/quality/tier'
import { TIER_LABEL } from '@/data/quality/tier'
import type {
  DatasetKey,
  FreezeRow,
  ISODateTime,
  ReqRow,
  RequestRow,
  RouteView,
  WorkerRow,
} from '@/data/schema'
import type { CalcSpec } from '@/drill/calc'
import { requestRecord } from '@/drill/requestRecord'
import { workerNames } from '@/drill/seats'
import { type DrillSpec, drillSpec } from '@/drill/types'
import type { Format } from '@/lib/format'
import { fmt, plural } from '@/lib/format'
import { fromRow } from '@/plan/engine/requests'
import { toPosition } from '@/plan/engine/versions'
import type { FigureData, TabModel } from '../../types'
import { ID } from '../roomMetrics'
import { BY_MONTH_COLUMNS, cellTitle, type MonthCell, rowsByMonth, SNAPSHOT_DATASETS } from './byMonth'
import { DEFINITION_COLUMNS, type DefinitionRow, definitionRows } from './definitions'
import { DATA_FIGURES } from './figures'
import { LIST_COLUMNS, type ListRow, listRows } from './lists'
import {
  MANIFEST_COLUMNS,
  type ManifestRow,
  type ManifestSummary,
  manifestRows,
  manifestSummary,
} from './manifest'
import {
  DATASET_TIER_COLUMNS,
  type DatasetTierRow,
  datasetTierRows,
  FIELD_COLUMNS,
  type FieldRow,
  fieldRows,
  METRIC_TIER_COLUMNS,
  metricTierRows,
  metricTiersByView,
  TIER_SERIES,
  type ViewTierCell,
} from './quality'

/** The Data room's tabs (`#data.<tab>`), in order; the first is the default. */
export const DATA_ROOM_TABS: readonly TabDef[] = [
  { key: 'datasets', label: 'Datasets' },
  { key: 'quality', label: 'Data quality' },
  { key: 'metrics', label: 'Metric definitions' },
  { key: 'lists', label: 'Lists' },
  { key: 'workspace', label: 'Workspace' },
]

/** One dataset in the manifest. */
export interface DatasetManifestRow {
  key: DatasetKey
  label: string
  source: 'sample' | 'upload' | 'none'
  rows: number
  /** Rows that imported with a warning. */
  warnings: number
  /** "Version 2 of 3", or null for the sample. */
  version: string | null
  importedAt: ISODateTime | null
  tier: Tier
  certified: boolean
}

/** One metric in Metric definitions. */
export interface MetricDefinitionRow {
  metricId: string
  name: string
  /** Its home view. */
  view: RouteView
  unit: Format
  /** Differs from its defaults (wording, target or settings). */
  changed: boolean
  /** A locked rule (privacy, cost guard). */
  locked: boolean
}

export interface DataRoomDatasets extends TabModel {
  manifest: FigureData<DatasetManifestRow>
  /** Rows of each dated dataset by month, the 24 months to the as-of date (an addition). */
  byMonth: FigureData<MonthCell>
  /** Datasets with no event date, listed apart (an addition). */
  snapshots: readonly DatasetKey[]
  /** "18,402 rows across 8 datasets · …" (an addition). */
  summary: ManifestSummary
}

export interface DataRoomMetrics {
  definitions: FigureData<MetricDefinitionRow>
}

/** The Data quality tab's figures (an addition). */
export interface DataRoomQualityFigures {
  datasets: FigureData<DatasetTierRow>
  fields: FigureData<FieldRow>
  metricsByView: FigureData<ViewTierCell>
}

export interface DataRoomModel {
  datasets: DataRoomDatasets
  /** Data quality: the tiers and gaps (the template's Quality tab); its KPIs per dataset. */
  quality: TabModel
  metrics: DataRoomMetrics
  /** The Data quality tab's figures (an addition). */
  qualityFigures: DataRoomQualityFigures
  /** The Lists tab's lists (an addition). */
  lists: FigureData<ListRow>
  /** What the Workspace tab says about its files (an addition); its items are ./menu.ts `workspaceMenuOf`. */
  workspace: { note: string }
}

/* ───────────── drills ───────────── */

/** The records behind a records-by-month cell: the dataset's rows dated in the month (comp has none). */
export function byMonthDrill(ctx: AnalyticsContext, c: MonthCell): DrillSpec | null {
  if (!c.rows) return null
  const title = cellTitle(c)
  const at = (i: number) => (ctx.all[c.key] as readonly unknown[])[i]
  switch (c.key) {
    case 'positions':
      return drillSpec({ kind: 'positions', title, rows: c.indexes.map((i) => toPosition(at(i) as never)) })
    case 'workers':
      return drillSpec({ kind: 'workers', title, rows: c.indexes.map((i) => at(i) as WorkerRow) })
    case 'reqs':
      return drillSpec({ kind: 'reqs', title, rows: c.indexes.map((i) => at(i) as ReqRow) })
    case 'freezes':
      return drillSpec({ kind: 'freezes', title, rows: c.indexes.map((i) => at(i) as FreezeRow) })
    case 'requests': {
      const viewer = viewerOf(ctx)
      const names = workerNames(ctx)
      const rows = c.indexes
        .map((i) => fromRow(at(i) as RequestRow))
        .filter((r) => requestView(r, viewer) !== 'none')
        .map((r) => requestRecord(r, { viewer, asOf: ctx.asOf, nameOf: (id) => names.get(id) ?? null }))
        .filter((r): r is NonNullable<typeof r> => r != null)
      return drillSpec({ kind: 'requests', title, rows })
    }
    default:
      // Comp rows carry pay: the month shows their count only.
      return null
  }
}

/* ───────────── the model ───────────── */

/** The four tiles of Data quality: how many metrics stand at each tier, each with its card. */
function qualityKpis(ctx: AnalyticsContext, cells: readonly ViewTierCell[]): Kpi[] {
  const uses = ctx.metrics.usesOf(ID.qualityMetricTiers)
  return TIER_SERIES.map((tier) => {
    const inTier = cells.filter((c) => c.tier === tier)
    const n = inTier.reduce((a, c) => a + c.metrics, 0)
    const card: CalcSpec = {
      title: `Metrics at ${TIER_LABEL[tier].toLowerCase()}`,
      metricId: ID.qualityMetricTiers,
      value: n,
      format: 'int',
      inputs: inTier.map((c) => ({
        label: c.viewLabel,
        value: c.metrics,
        format: 'int',
        source: 'Metric definitions',
      })),
      steps: [
        {
          label: `Metrics at ${TIER_LABEL[tier].toLowerCase()}, over every view`,
          expression: inTier.length ? inTier.map((c) => fmt(c.metrics, 'int')).join(' + ') : '0',
          result: n,
          format: 'int',
        },
      ],
      note: 'A metric takes the lowest tier of the fields it reads.',
      uses,
    }
    return {
      id: `data-metrics-${tier}`,
      metricId: ID.qualityMetricTiers,
      label: tier === 'none' ? 'Metrics with no data' : `Metrics at ${TIER_LABEL[tier].toLowerCase()}`,
      value: n,
      format: 'int',
      note: plural(inTier.length, 'view'),
      definition: ctx.metrics.def(ID.qualityMetricTiers)?.definition,
      calc: card,
      uses,
    }
  })
}

function computeData(ctx: AnalyticsContext): DataRoomModel {
  const manifest = manifestRows(ctx)
  const months = rowsByMonth(ctx.all, ctx.asOf)
  const tierRows = metricTierRows(ctx)
  const cells = metricTiersByView(tierRows)
  const definitions = definitionRows(ctx)
  const lists = listRows(ctx)
  const fields = fieldRows(ctx)
  const byMonthUses = ctx.metrics.usesOf(ID.coverageByMonth)
  const tierUses = ctx.metrics.usesOf(ID.qualityMetricTiers)
  return {
    datasets: {
      kpis: [],
      manifest: {
        id: DATA_FIGURES.manifest,
        metric: ID.coverageByMonth,
        title: 'Datasets',
        subtitle:
          'Eight datasets feed the plan: positions, workers, comp and assumptions are required; reqs, requests, targets and freezes are optional. Open a row for its raw sheet, mapping, quality and certification.',
        rows: manifest satisfies ManifestRow[],
        columns: MANIFEST_COLUMNS as FigureData<DatasetManifestRow>['columns'],
        note: manifestSummary(manifest).text,
        empty: null,
        uses: byMonthUses,
      },
      byMonth: {
        id: DATA_FIGURES.byMonth,
        metric: ID.coverageByMonth,
        title: 'Records by month',
        subtitle:
          'Rows of each dataset dated in each of the 24 months to the as-of date, by its own event date',
        rows: months.cells,
        columns: BY_MONTH_COLUMNS,
        note: SNAPSHOT_DATASETS.length
          ? `Targets and assumptions hold what is planned and carry no event date, so they are not shown.`
          : null,
        empty: months.datasets.length ? null : 'No dated rows are loaded.',
        uses: byMonthUses,
      },
      snapshots: SNAPSHOT_DATASETS,
      summary: manifestSummary(manifest),
    },
    quality: { kpis: qualityKpis(ctx, cells) },
    metrics: {
      definitions: {
        id: DATA_FIGURES.definitions,
        metric: ID.qualityMetricTiers,
        title: 'Metric definitions',
        subtitle:
          'Every number in Headcount Planner: what it means, how it is worked out and the data it reads',
        rows: definitions satisfies DefinitionRow[],
        columns: DEFINITION_COLUMNS as FigureData<MetricDefinitionRow>['columns'],
        note: `${plural(definitions.length, 'entry', 'entries')} · ${plural(
          definitions.filter((d) => d.changed).length,
          'changed from its defaults',
          'changed from their defaults',
        )}`,
        empty: null,
        uses: tierUses,
      },
    },
    qualityFigures: {
      datasets: {
        id: DATA_FIGURES.qualityDatasets,
        metric: ID.qualityMetricTiers,
        title: 'Datasets by tier',
        subtitle: 'Each dataset’s tier and what keeps it from the next one',
        rows: datasetTierRows(ctx),
        columns: DATASET_TIER_COLUMNS,
        empty: null,
        uses: tierUses,
      },
      fields: {
        id: DATA_FIGURES.qualityFields,
        metric: ID.qualityMetricTiers,
        title: 'Fields',
        subtitle:
          'How well each field is filled, how many values were not recognized or set by default, and its tier',
        rows: fields,
        columns: FIELD_COLUMNS,
        note: 'Counts only: no value of any row is shown.',
        empty: null,
        uses: tierUses,
      },
      metricsByView: {
        id: DATA_FIGURES.metricsByView,
        metric: ID.qualityMetricTiers,
        title: 'Metrics by view and tier',
        subtitle: 'How many of each view’s metrics stand at each tier under the data loaded now',
        rows: cells,
        columns: METRIC_TIER_COLUMNS,
        note: `${plural(tierRows.length, 'metric')} that read data`,
        empty: cells.length ? null : 'No metric reads the data loaded.',
        uses: tierUses,
      },
    },
    lists: {
      id: DATA_FIGURES.lists,
      metric: ID.qualityMetricTiers,
      title: 'Official lists',
      subtitle: 'The approved values Headcount Planner checks the data against, one list per category',
      rows: lists,
      columns: LIST_COLUMNS,
      note: `${plural(lists.filter((l) => l.status === 'Official').length, 'list')} official`,
      empty: null,
      uses: tierUses,
    },
    workspace: {
      note: 'Save and open them here or from the Workspace menu at the top of every page. Every file but Full holds only what the mode that made it shows.',
    },
  }
}

const cache = new WeakMap<AnalyticsContext, DataRoomModel>()

/** The Data room's model for a context (cached per context). */
export function dataModel(ctx: AnalyticsContext): DataRoomModel {
  const hit = cache.get(ctx)
  if (hit) return hit
  const model = computeData(ctx)
  cache.set(ctx, model)
  return model
}
