/**
 * Targets > Gap (docs/PLAN.md 9.4): the KPI strip (Target heads, Asks, Gap, Target cost, Gap (cost),
 * Unallocated), then each target org's asks against its target as a bullet, with the table behind it
 * (heads from trades, cost under the mode's rules); from M3 "Set a target" (Finance, HR admin) and
 * the target changes the audit log holds (10.5). Renders the model; computes nothing.
 */
import { BulletList, Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { drill } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import { ID } from '../metrics'
import { defsOf, useTargets } from './model'
import { TargetSetBar } from './TargetChanges'

export function Gap() {
  const { ctx, m } = useTargets()
  const g = m.gap
  const fig = g.rows
  const pendingOf = (r: (typeof fig.rows)[number]) =>
    fig.columns.find((c) => c.key === 'pendingHeads')?.drill?.(r) ?? null
  return (
    <Grid>
      <KpiStrip id="targets-gap-kpis" title="Key figures" kpis={g.kpis} />
      <TargetSetBar writes={g.writes} />
      <Figure
        id="targets-gap"
        metric={ID.gapHeads}
        definitions={defsOf(ctx, ID.targetHeads, ID.asksHeads, ID.gapHeads, ID.tradesHeads, ID.gapCost)}
        uses={fig.uses}
        title={fig.title}
        subtitle={fig.subtitle}
        data={fig.rows}
        columns={fig.columns}
        note={fig.note ?? undefined}
        empty={fig.empty}
      >
        <BulletList
          data={fig.rows}
          label="org"
          value="asksHeads"
          target="targetHeads"
          scale="shared"
          format={(_r, v) => fmt(v, 'int')}
          status={(r) => ({ tone: r.gapHeads < 0 ? 'warning' : 'good', label: r.gapText })}
          onSelect={(r) => drill(pendingOf(r))}
          ariaLabel="Asks against target by org"
        />
      </Figure>
      <Figure
        id="targets-changes"
        metric={ID.targetHeads}
        definitions={defsOf(ctx, ID.targetHeads)}
        uses={g.changes.uses}
        title={g.changes.title}
        subtitle={g.changes.subtitle}
        data={g.changes.rows}
        columns={g.changes.columns}
        note={g.changes.note ?? undefined}
        empty={g.changes.empty}
        tableOnly
        tableToggle={false}
        image={false}
      />
    </Grid>
  )
}
