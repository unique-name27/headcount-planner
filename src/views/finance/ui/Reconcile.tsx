/**
 * Finance > Reconcile (docs/PLAN.md 9.4): the exceptions by kind and the tab's KPIs, and from M3
 * Mark reviewed (an HRBP its own unit's). Renders the model; computes nothing.
 */
import { Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { ID } from '../metrics'
import { defsOf, useFinance } from './model'
import { ReviewChanges } from './ReviewChanges'

export function Reconcile() {
  const { ctx, m } = useFinance()
  const r = m.reconcile
  return (
    <Grid>
      <KpiStrip id="finance-reconcile-kpis" title="Key figures" kpis={r.kpis} />
      <ReviewChanges writes={r.writes} rows={r.exceptions.rows} />
      <Figure
        id="finance-reconcile"
        metric={ID.reconExceptions}
        definitions={defsOf(ctx, ID.reconExceptions, ID.reconCostCenterMismatch)}
        uses={r.exceptions.uses}
        title={r.exceptions.title}
        subtitle={r.exceptions.subtitle}
        data={r.exceptions.rows}
        columns={r.exceptions.columns}
        empty={r.exceptions.empty}
        tableOnly
        tableToggle={false}
        image={false}
      />
    </Grid>
  )
}
