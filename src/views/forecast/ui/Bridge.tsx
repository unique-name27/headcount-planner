/**
 * Forecast > Bridge (docs/PLAN.md 9.4): the FX effect for the period, then the waterfall from the
 * comparison's total through the steps (each step's band part where its costed part folds, the
 * Transfers row at 0 under R39, and Other changes, always a row since C34) to the forecast total.
 * Each step opens its calculation card. Renders the model.
 */
import { Figure, Waterfall } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { useAnalytics } from '@/data/context'
import { calc } from '@/drill/Drill'
import { RULE_ID } from '@/metrics/rules'
import { definitionsOf } from '@/views/plan/engine/wording'
import type { ForecastModel } from '../engine'
import { positionsMovedText } from '../engine/wording'
import { ID } from '../metrics'

export function Bridge({ m }: { m: ForecastModel }) {
  const ctx = useAnalytics()
  const b = m.bridge.steps
  return (
    <Grid>
      <KpiStrip id="forecast-bridge-kpis" kpis={m.bridge.kpis} />
      <Figure
        id="forecast-bridge"
        metric={b.metric}
        uses={b.uses}
        title={b.title}
        subtitle={b.subtitle}
        data={b.rows}
        columns={b.columns}
        definitions={definitionsOf(ctx.metrics, ID.bridgeStep, ID.fxEffect, RULE_ID.minContributors)}
        note={b.note ?? undefined}
        empty={b.empty}
      >
        <Waterfall
          data={b.rows}
          format={ctx.guard.mode === 'rounded' ? 'moneyM' : 'money'}
          secondary={(d) => (d.contributors != null ? positionsMovedText(d.contributors) : null)}
          onSelect={(d) => calc(d.calc)}
          selectable={(d) => d.calc != null}
        />
      </Figure>
    </Grid>
  )
}
