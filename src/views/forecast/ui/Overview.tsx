/**
 * Forecast > Overview (docs/PLAN.md 9.4): the key figures (five in HRBP and Leader mode, where the
 * exit run rate is Finance's), then the Readout (span 4) beside the lead figure (heads by month:
 * closed actuals, then the projection), then starts and exits by month. Renders the model.
 */
import { Columns, Figure, Lines } from '@/charts'
import { Grid, KpiStrip, Readout } from '@/components'
import { useChartHeight } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import { definitionsOf } from '@/views/plan/engine/wording'
import type { ForecastModel } from '../engine'
import { ID } from '../metrics'
import { longSeries, openCell } from './shared'

export function Overview({ m }: { m: ForecastModel }) {
  const ctx = useAnalytics()
  const o = m.overview
  const leadHeight = useChartHeight('lead')
  const series = [
    { key: 'actual', label: 'Actual heads' },
    { key: 'forecast', label: 'Forecast heads' },
    { key: 'comparison', label: 'Comparison' },
  ]
  const points = longSeries(o.headsByMonth.rows, (r) => r.month, series)
  const flows = longSeries(o.startsExits.rows, (r) => r.month, [
    { key: 'starts', label: 'Starts' },
    { key: 'knownExits', label: 'Known exits' },
    { key: 'modeledExits', label: 'Modeled exits' },
    { key: 'modeledBackfills', label: 'Modeled backfills' },
  ])
  return (
    <Grid>
      <KpiStrip id="forecast-overview-kpis" kpis={o.kpis} />
      <div className="col-span-full min-w-0 max-md:order-1 lg:col-span-4">
        <Readout
          id="forecast-readout"
          findings={o.findings}
          span={12}
          emptyText="Nothing unusual in the forecast for this scope."
        />
      </div>
      <div className="col-span-full flex min-w-0 flex-col gap-4 max-md:contents lg:col-span-8">
        <Figure
          id="forecast-heads-by-month"
          metric={o.headsByMonth.metric}
          uses={o.headsByMonth.uses}
          title={o.headsByMonth.title}
          subtitle={o.headsByMonth.subtitle}
          data={o.headsByMonth.rows}
          columns={o.headsByMonth.columns}
          definitions={definitionsOf(ctx.metrics, ID.headsMonthEnd, ID.headsYearEnd)}
          note={o.headsByMonth.note ?? undefined}
          empty={o.headsByMonth.empty}
        >
          <Lines
            data={points}
            x="x"
            y="y"
            series="series"
            seriesOrder={series.map((s) => s.label)}
            emphasize="Forecast heads"
            format="num1"
            xTicks="month"
            height={leadHeight}
            onSelect={(d) => openCell(o.headsByMonth.columns, d.key, d.row)}
          />
        </Figure>
        <Figure
          id="forecast-starts-exits"
          metric={o.startsExits.metric}
          uses={o.startsExits.uses}
          title={o.startsExits.title}
          subtitle={o.startsExits.subtitle}
          data={o.startsExits.rows}
          columns={o.startsExits.columns}
          definitions={definitionsOf(
            ctx.metrics,
            ID.startsExpected,
            ID.exitsKnown,
            ID.exitsModeled,
            ID.backfillsModeled,
          )}
          empty={o.startsExits.empty}
          className="max-md:order-2"
        >
          <Columns
            data={flows}
            x="x"
            y="y"
            series="series"
            seriesOrder={['Starts', 'Known exits', 'Modeled exits', 'Modeled backfills']}
            xType="month"
            format="num1"
            onSelect={(d) => openCell(o.startsExits.columns, d.key, d.row)}
          />
        </Figure>
      </div>
    </Grid>
  )
}
