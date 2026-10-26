/**
 * Finance > Assumptions (docs/PLAN.md 9.4, 11.5): every assumption value of the version shown with
 * the level it is set at, and the Trade rates part (`#finance.assumptions:trade-rates`) with the
 * standard head; from M3 the changes bar (a value in Working under 7.4's rule, FX rates, an HRBP's
 * unit settings). Renders the model; computes nothing.
 */
import { Figure } from '@/charts'
import { EmptyState, Grid, KpiStrip } from '@/components'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import { ID } from '../metrics'
import { AssumptionChanges } from './AssumptionChanges'
import { defsOf, useFinance } from './model'

export function Assumptions({ part }: { part: string | null }) {
  const { ctx, m } = useFinance()
  const a = m.assumptions
  const rates = a.tradeRates
  return (
    <Grid>
      <KpiStrip id="finance-assumptions-kpis" title="Key figures" kpis={a.kpis} />
      {part === 'trade-rates' ? null : <AssumptionChanges writes={a.writes} />}
      {part === 'trade-rates' ? null : (
        <Figure
          id="finance-assumptions"
          metric={PLAN_ID.costBandEstimate}
          definitions={defsOf(ctx, PLAN_ID.costBandEstimate)}
          uses={a.values.uses}
          title={a.values.title}
          subtitle={a.values.subtitle}
          data={a.values.rows}
          columns={a.values.columns}
          note={a.values.note ?? undefined}
          empty={a.values.empty}
          tableOnly
          tableToggle={false}
          image={false}
        />
      )}
      {rates ? (
        <Figure
          id="finance-trade-rates"
          metric={ID.tradeStandardHead}
          definitions={defsOf(ctx, ID.tradeStandardHead, PLAN_ID.tradeWeight)}
          uses={rates.uses}
          title={rates.title}
          subtitle={rates.subtitle}
          data={rates.rows}
          columns={rates.columns}
          note={rates.note ?? undefined}
          empty={rates.empty}
          tableOnly
          tableToggle={false}
          image={false}
        />
      ) : part === 'trade-rates' ? (
        <EmptyState title="No trade rates here" body={a.tradeRatesEmpty ?? ''} />
      ) : null}
    </Grid>
  )
}
