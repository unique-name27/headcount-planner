/**
 * The Data quality tab (the template app's Quality tab, for HCP's datasets): how many metrics stand
 * at each tier (four tiles and the bars by view), each dataset's tier with what keeps it from the
 * next one, and every field's coverage and tier. Counts only: no value of a row is shown.
 */
import { Figure, HBars, useChartTheme } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { goTo } from '@/components/navigation'
import { TIER_LABEL } from '@/data/quality/tier'
import type { DataRoomModel } from '../engine'
import { datasetTab } from '../engine/links'
import { TIER_SERIES } from '../engine/quality'

export function QualityTab({ model }: { model: DataRoomModel }) {
  const theme = useChartTheme()
  const { datasets, fields, metricsByView } = model.qualityFigures
  const tiers = TIER_SERIES.map((t) => TIER_LABEL[t])
  const colors: Record<string, string> = {
    [TIER_LABEL.gold]: theme.tier.gold,
    [TIER_LABEL.silver]: theme.tier.silver,
    [TIER_LABEL.bronze]: theme.tier.bronze,
    [TIER_LABEL.none]: theme.deemph,
  }
  return (
    <>
      <Grid>
        <KpiStrip id="data-quality-kpis" title="Metrics by tier" kpis={model.quality.kpis} />
      </Grid>
      <Grid className="mt-4">
        <Figure
          id="data-quality-metrics-by-view"
          metric={metricsByView.metric}
          uses={metricsByView.uses}
          title={metricsByView.title}
          subtitle={metricsByView.subtitle}
          data={metricsByView.rows}
          columns={metricsByView.columns}
          note={metricsByView.note ?? undefined}
          gate={false}
          span={6}
          empty={metricsByView.empty}
        >
          <HBars
            data={metricsByView.rows}
            y="viewLabel"
            x="metrics"
            series="tierLabel"
            stack
            seriesOrder={tiers}
            colors={colors}
            format="int"
            ariaLabel="Metrics of each view by tier"
          />
        </Figure>
        <Figure
          id="data-quality-datasets"
          metric={datasets.metric}
          uses={datasets.uses}
          title={datasets.title}
          subtitle={datasets.subtitle}
          data={datasets.rows}
          columns={datasets.columns}
          gate={false}
          span={6}
          tableOnly
          table={{ onRowClick: (r) => goTo('data', datasetTab(r.key, 'quality')) }}
          empty={datasets.empty}
        />
      </Grid>
      <Grid className="mt-4">
        <Figure
          id="data-quality-fields"
          metric={fields.metric}
          uses={fields.uses}
          title={fields.title}
          subtitle={fields.subtitle}
          data={fields.rows}
          columns={fields.columns}
          note={fields.note ?? undefined}
          gate={false}
          tableOnly
          table={{
            search: 'Find a field',
            maxRows: 40,
            onRowClick: (r) => goTo('data', datasetTab(r.dataset, 'quality')),
          }}
          empty={fields.empty}
        />
      </Grid>
    </>
  )
}
