/**
 * Finance > Freezes (docs/PLAN.md 9.4): openings under a freeze and freeze savings, each freeze with
 * what it holds, and the openings held; from M3 the changes bar (a new freeze, a freeze's dates,
 * backfills and reason). Savings amounts show in Finance and HR admin only. Renders the model;
 * computes nothing.
 */
import { Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import { ID } from '../metrics'
import { FreezeChanges } from './FreezeChanges'
import { defsOf, useFinance } from './model'

export function Freezes() {
  const { ctx, m } = useFinance()
  const f = m.freezes
  return (
    <Grid>
      <KpiStrip id="finance-freezes-kpis" title="Key figures" kpis={f.kpis} />
      <FreezeChanges writes={f.writes} rows={f.freezes.rows} />
      <Figure
        id="finance-freezes"
        metric={PLAN_ID.openingsFrozen}
        definitions={defsOf(ctx, PLAN_ID.openingsFrozen, ID.freezeSavings)}
        uses={f.freezes.uses}
        title={f.freezes.title}
        subtitle={f.freezes.subtitle}
        data={f.freezes.rows}
        columns={f.freezes.columns}
        empty={f.freezes.empty}
        tableOnly
        tableToggle={false}
        image={false}
      />
      <Figure
        id="finance-freeze-openings"
        metric={PLAN_ID.openingsFrozen}
        definitions={defsOf(ctx, PLAN_ID.openingsFrozen)}
        uses={f.openings.uses}
        title={f.openings.title}
        subtitle={f.openings.subtitle}
        data={f.openings.rows}
        columns={f.openings.columns}
        empty={f.openings.empty}
        tableOnly
        tableToggle={false}
        image={false}
      />
    </Grid>
  )
}
