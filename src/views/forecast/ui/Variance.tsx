/**
 * Forecast > Variance (docs/PLAN.md 9.4): org × measure (heads, average FTE, cost) × window (month,
 * QTD, YTD, FY) against the comparison; positive cost is over, and rounded modes show QTD, YTD and FY
 * cost only. An empty state with a target comparison (9.2). Renders the model; computes nothing.
 */
import { Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { useAnalytics } from '@/data/context'
import { definitionsOf } from '@/views/plan/engine/wording'
import type { ForecastModel } from '../engine'
import { ID } from '../metrics'

export function Variance({ m }: { m: ForecastModel }) {
  const ctx = useAnalytics()
  const v = m.variance.rows
  return (
    <Grid>
      <KpiStrip id="forecast-variance-kpis" kpis={m.variance.kpis} />
      <Figure
        id="forecast-variance"
        metric={v.metric}
        uses={v.uses}
        title={v.title}
        subtitle={v.subtitle}
        data={v.rows}
        columns={v.columns}
        definitions={definitionsOf(ctx.metrics, ID.varianceHeads, ID.varianceFte, ID.varianceCost)}
        note={v.note ?? undefined}
        empty={v.empty}
        tableOnly
        tableToggle={false}
        image={false}
        table={{ maxRows: 60, search: 'Find an org, measure or window' }}
      />
    </Grid>
  )
}
