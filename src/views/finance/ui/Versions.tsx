/**
 * Finance > Versions (docs/PLAN.md 9.4): the versions with their state, lock date, hash and engine
 * version ("Hash still verifies"), the month closes, the back-dated hires and exits by position (no
 * amount), and the adjustments by posted month; from M3 the changes bar above them (lock, reopen,
 * close, a new Working). Renders the model; computes nothing.
 */
import { Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { ID } from '../metrics'
import { defsOf, useFinance } from './model'
import { VersionChanges } from './VersionChanges'

export function Versions() {
  const { ctx, m } = useFinance()
  const v = m.versions
  return (
    <Grid>
      <KpiStrip id="finance-versions-kpis" title="Key figures" kpis={v.kpis} />
      <VersionChanges writes={v.writes} />
      <Figure
        id="finance-versions"
        metric={ID.versionsLocked}
        definitions={defsOf(ctx, ID.versionsLocked)}
        uses={v.versions.uses}
        title={v.versions.title}
        subtitle={v.versions.subtitle}
        data={v.versions.rows}
        columns={v.versions.columns}
        empty={v.versions.empty}
        note="Each lock stores a checksum of its lines, assumptions and rates, so damage shows."
        tableOnly
        tableToggle={false}
        image={false}
      />
      <Figure
        id="finance-closes"
        metric={ID.closeAdjustments}
        definitions={defsOf(ctx, ID.closeAdjustments)}
        uses={v.closes.uses}
        title={v.closes.title}
        subtitle={v.closes.subtitle}
        data={v.closes.rows}
        columns={v.closes.columns}
        empty={v.closes.empty}
        tableOnly
        tableToggle={false}
        image={false}
      />
      <Figure
        id="finance-adjustments"
        metric={ID.closeAdjustments}
        definitions={defsOf(ctx, ID.closeAdjustments)}
        uses={v.adjustments.uses}
        title={v.adjustments.title}
        subtitle={v.adjustments.subtitle}
        data={v.adjustments.rows}
        columns={v.adjustments.columns}
        empty={v.adjustments.empty}
        span={6}
        tableOnly
        tableToggle={false}
        image={false}
      />
      <Figure
        id="finance-adjustments-by-month"
        metric={ID.closeAdjustments}
        definitions={defsOf(ctx, ID.closeAdjustments)}
        uses={v.adjustmentsByMonth.uses}
        title={v.adjustmentsByMonth.title}
        subtitle={v.adjustmentsByMonth.subtitle}
        data={v.adjustmentsByMonth.rows}
        columns={v.adjustmentsByMonth.columns}
        empty={v.adjustmentsByMonth.empty}
        span={6}
        tableOnly
        tableToggle={false}
        image={false}
      />
    </Grid>
  )
}
