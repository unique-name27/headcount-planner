/**
 * The Datasets tab: records by month (a gap shows before it moves a number), the manifest of the
 * eight datasets (each row opens the dataset's panels, its row count its rows), and the selected
 * dataset's Raw, Mapping, Quality and Certify panels. The sample is generated in this browser on every
 * load; your own files replace a dataset one at a time.
 */
import { type Column, Figure, Heatmap } from '@/charts'
import { Grid } from '@/components'
import { goTo } from '@/components/navigation'
import { useAnalytics } from '@/data/context'
import type { DatasetKey } from '@/data/schema'
import { drill } from '@/drill/Drill'
import { byMonthDrill, type DataRoomModel } from '../engine'
import { type DataRoute, DEFAULT_PANEL, datasetTab } from '../engine/links'
import type { ManifestRow } from '../engine/manifest'
import { DatasetDetail } from './DatasetDetail'
import { datasetRowsSpec } from './rows'

export function DatasetsTab({ model, route }: { model: DataRoomModel; route: DataRoute }) {
  const ctx = useAnalytics()
  const months = model.datasets.byMonth
  const manifest = model.datasets.manifest
  const rows = manifest.rows as readonly ManifestRow[]
  const open = (key: DatasetKey) =>
    goTo('data', datasetTab(key, route.dataset === key ? route.panel : DEFAULT_PANEL))
  const columns: Column<ManifestRow>[] = (manifest.columns as readonly Column<ManifestRow>[]).map((c) =>
    c.key === 'rows'
      ? { ...c, drill: (r: ManifestRow) => (r.rows ? () => datasetRowsSpec(ctx, r.key) : null) }
      : c,
  )
  return (
    <>
      <Grid>
        <Figure
          id="data-records-by-month"
          metric={months.metric}
          uses={months.uses}
          title={months.title}
          subtitle={months.subtitle}
          data={months.rows}
          columns={months.columns}
          note={months.note ?? undefined}
          gate={false}
          empty={months.empty}
        >
          <Heatmap
            data={months.rows}
            x="monthLabel"
            y="dataset"
            value="share"
            format="pct"
            xOrder={[...new Set(months.rows.map((c) => c.monthLabel))]}
            cellText={(c) => (c.rows ? String(c.rows) : '')}
            blankZero
            showValues={false}
            onSelect={(c) => drill(() => byMonthDrill(ctx, c))}
            ariaLabel="Rows of each dataset by month"
          />
        </Figure>
      </Grid>
      <Grid className="mt-4">
        <Figure
          id="data-manifest"
          metric={manifest.metric}
          uses={manifest.uses}
          title={manifest.title}
          subtitle={manifest.subtitle}
          data={rows}
          columns={columns}
          note={manifest.note ?? undefined}
          gate={false}
          tableOnly
          table={{ onRowClick: (r) => open(r.key) }}
          empty={manifest.empty}
        />
      </Grid>
      {route.dataset && (
        <DatasetDetail
          key={route.dataset}
          row={rows.find((r) => r.key === route.dataset) ?? rows[0]}
          panel={route.panel ?? DEFAULT_PANEL}
        />
      )}
    </>
  )
}
