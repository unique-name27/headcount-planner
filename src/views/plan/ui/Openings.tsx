/**
 * Plan > Openings (docs/PLAN.md 9.4): the key figures, openings by stage and by age, and the table
 * with days in stage, target start, past start, frozen and no req. An accepted offer shows its date
 * only. Renders the model; computes nothing.
 */
import { BarList, Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { useAnalytics } from '@/data/context'
import { openPosition } from '@/drill/store'
import type { PlanModel } from '../engine'
import { definitionsOf } from '../engine/wording'
import { ID } from '../metrics'
import { openCell } from './shared'

export function Openings({ m }: { m: PlanModel }) {
  const ctx = useAnalytics()
  const o = m.openings
  return (
    <Grid>
      <KpiStrip id="plan-openings-kpis" kpis={o.kpis} />
      <Figure
        id="plan-openings-stage"
        metric={o.byStage.metric}
        uses={o.byStage.uses}
        title={o.byStage.title}
        subtitle={o.byStage.subtitle}
        data={o.byStage.rows}
        columns={o.byStage.columns}
        definitions={definitionsOf(ctx.metrics, ID.openingsCount, ID.offersAccepted)}
        empty={o.byStage.empty}
        span={6}
      >
        <BarList
          data={o.byStage.rows}
          label="label"
          value="count"
          format="int"
          sort="none"
          onSelect={(d) => openCell(o.byStage.columns, 'count', d)}
        />
      </Figure>
      <Figure
        id="plan-openings-age"
        metric={o.byAge.metric}
        uses={o.byAge.uses}
        title={o.byAge.title}
        subtitle={o.byAge.subtitle}
        data={o.byAge.rows}
        columns={o.byAge.columns}
        definitions={definitionsOf(ctx.metrics, ID.openingsAge)}
        empty={o.byAge.empty}
        span={6}
      >
        <BarList
          data={o.byAge.rows}
          label="label"
          value="count"
          format="int"
          sort="none"
          onSelect={(d) => openCell(o.byAge.columns, 'count', d)}
        />
      </Figure>
      <Figure
        id="plan-openings-table"
        metric={o.table.metric}
        uses={o.table.uses}
        title={o.table.title}
        subtitle={o.table.subtitle}
        data={o.table.rows}
        columns={o.table.columns}
        definitions={definitionsOf(
          ctx.metrics,
          ID.openingsCount,
          ID.openingsPastStart,
          ID.openingsFrozen,
          ID.openingsNoReq,
        )}
        empty={o.table.empty}
        tableOnly
        tableToggle={false}
        image={false}
        table={{
          maxRows: 25,
          search: 'Find a position or req',
          onRowClick: (r) => openPosition(r.positionId),
        }}
      />
    </Grid>
  )
}
