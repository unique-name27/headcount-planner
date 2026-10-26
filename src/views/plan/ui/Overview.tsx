/**
 * Plan > Overview (docs/PLAN.md 9.4): the key figures, then the Readout (span 4) beside the lead
 * figure (heads by month, span 8), then heads by unit, positions by status, cost by unit (guarded)
 * and openings by stage. Renders the model; computes nothing.
 */
import { BarList, Figure, Lines } from '@/charts'
import { Grid, KpiStrip, Readout } from '@/components'
import { useChartHeight } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import { RULE_ID } from '@/metrics/rules'
import type { PlanModel } from '../engine'
import { NOT_IN_PLAN_BAR_NOTE } from '../engine/overview'
import { definitionsOf } from '../engine/wording'
import { ID } from '../metrics'
import { longSeries, openCell } from './shared'

export function Overview({ m }: { m: PlanModel }) {
  const ctx = useAnalytics()
  const o = m.overview
  const leadHeight = useChartHeight('lead')
  const months = o.headsByMonth
  const series = [
    { key: 'actual', label: 'Actual heads' },
    { key: 'plan', label: 'Plan heads' },
    { key: 'comparison', label: 'Comparison' },
  ]
  const points = longSeries(months.rows, (r) => r.month, series)
  const money = ctx.guard.mode === 'rounded' ? 'moneyM' : 'money'
  return (
    <Grid>
      <KpiStrip id="plan-overview-kpis" kpis={o.kpis} />
      <div className="col-span-full min-w-0 max-md:order-1 lg:col-span-4">
        <Readout
          id="plan-readout"
          findings={o.findings}
          span={12}
          emptyText="Nothing unusual in this scope for this version."
        />
      </div>
      <div className="col-span-full flex min-w-0 flex-col gap-4 max-md:contents lg:col-span-8">
        <Figure
          id="plan-heads-by-month"
          metric={months.metric}
          uses={months.uses}
          title={months.title}
          subtitle={months.subtitle}
          data={months.rows}
          columns={months.columns}
          definitions={definitionsOf(ctx.metrics, ID.headsActual, ID.headsPlan)}
          note={months.note ?? undefined}
          empty={months.empty}
        >
          <Lines
            data={points}
            x="x"
            y="y"
            series="series"
            seriesOrder={series.map((s) => s.label)}
            emphasize="Actual heads"
            format="int"
            xTicks="month"
            height={leadHeight}
            onSelect={(d) => openCell(months.columns, d.key, d.row)}
          />
        </Figure>
        <Grid className="max-md:order-2">
          <Figure
            id="plan-heads-by-unit"
            metric={o.headsByUnit.metric}
            uses={o.headsByUnit.uses}
            title={o.headsByUnit.title}
            subtitle={o.headsByUnit.subtitle}
            data={o.headsByUnit.rows}
            columns={o.headsByUnit.columns}
            definitions={definitionsOf(ctx.metrics, ID.headsApproved, ID.headsActual, ID.headsPlan)}
            empty={o.headsByUnit.empty}
            span={6}
          >
            <BarList
              data={o.headsByUnit.rows}
              label="label"
              value="approved"
              format="int"
              secondary={(d) => `${d.actual.toLocaleString('en-US')} actual`}
              nullNote={NOT_IN_PLAN_BAR_NOTE}
              onSelect={(d) => openCell(o.headsByUnit.columns, 'approved', d)}
            />
          </Figure>
          <Figure
            id="plan-positions-by-status"
            metric={o.positionsByStatus.metric}
            uses={o.positionsByStatus.uses}
            title={o.positionsByStatus.title}
            subtitle={o.positionsByStatus.subtitle}
            data={o.positionsByStatus.rows}
            columns={o.positionsByStatus.columns}
            definitions={definitionsOf(ctx.metrics, ID.positionsByStatus)}
            empty={o.positionsByStatus.empty}
            span={6}
          >
            <BarList
              data={o.positionsByStatus.rows}
              label="status"
              value="count"
              format="int"
              sort="none"
              onSelect={(d) => openCell(o.positionsByStatus.columns, 'count', d)}
            />
          </Figure>
        </Grid>
      </div>
      <Figure
        id="plan-cost-by-unit"
        metric={o.costByUnit.metric}
        uses={o.costByUnit.uses}
        title={o.costByUnit.title}
        subtitle={o.costByUnit.subtitle}
        data={o.costByUnit.rows}
        columns={o.costByUnit.columns}
        definitions={definitionsOf(ctx.metrics, ID.costLoaded, ID.costOpenBand, RULE_ID.minCosted)}
        note={o.costByUnit.note ?? undefined}
        empty={o.costByUnit.empty}
        span={6}
      >
        <BarList
          data={o.costByUnit.rows}
          label="label"
          value="totalUsd"
          format={money}
          sort="none"
          nullNote={o.costByUnit.rows.find((r) => r.reason)?.reason ?? undefined}
          onSelect={(d) => openCell(o.costByUnit.columns, 'positions', d)}
        />
      </Figure>
      <Figure
        id="plan-openings-by-stage"
        metric={o.openingsByStage.metric}
        uses={o.openingsByStage.uses}
        title={o.openingsByStage.title}
        subtitle={o.openingsByStage.subtitle}
        data={o.openingsByStage.rows}
        columns={o.openingsByStage.columns}
        definitions={definitionsOf(ctx.metrics, ID.openingsCount, ID.offersAccepted)}
        empty={o.openingsByStage.empty}
        span={6}
      >
        <BarList
          data={o.openingsByStage.rows}
          label="label"
          value="count"
          format="int"
          sort="none"
          onSelect={(d) => openCell(o.openingsByStage.columns, 'count', d)}
        />
      </Figure>
    </Grid>
  )
}
