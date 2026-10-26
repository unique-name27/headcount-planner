/**
 * Targets > Tree × cost center (docs/PLAN.md 9.4): approved heads per tree node and cost center,
 * with cost per node only under the org-row rule, and cost per unit × cost center under the unit's
 * one fold. Renders the model; computes nothing.
 */
import { Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { ID } from '../metrics'
import { defsOf, useTargets } from './model'

export function Tree() {
  const { ctx, m } = useTargets()
  const t = m.tree
  return (
    <Grid>
      <KpiStrip id="targets-tree-kpis" title="Key figures" kpis={t.kpis} />
      <Figure
        id="targets-tree"
        metric={ID.treeCostCenter}
        definitions={defsOf(ctx, ID.treeCostCenter)}
        uses={t.cells.uses}
        title={t.cells.title}
        subtitle={t.cells.subtitle}
        data={t.cells.rows}
        columns={t.cells.columns}
        note={t.cells.note ?? undefined}
        empty={t.cells.empty}
        tableOnly
        tableToggle={false}
        image={false}
      />
      <Figure
        id="targets-tree-cost-centers"
        metric={ID.treeCostCenter}
        definitions={defsOf(ctx, ID.treeCostCenter)}
        uses={t.costCenters.uses}
        title={t.costCenters.title}
        subtitle={t.costCenters.subtitle}
        data={t.costCenters.rows}
        columns={t.costCenters.columns}
        empty={t.costCenters.empty}
        tableOnly
        tableToggle={false}
        image={false}
      />
    </Grid>
  )
}
