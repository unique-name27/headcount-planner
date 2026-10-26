/**
 * Plan > Positions (docs/PLAN.md 9.4): the key figures, then positions × months of the shown
 * version, with the Band estimate column (never in Manager mode) and Standard heads (every mode).
 * A row opens the position card. Where the mode makes Working edits (HRBP, HR admin), "Change a seat
 * in Working" opens the seat form (./SeatEdit.tsx); under the grid, the changes the HRBP made to the
 * scope's seats, which a manager reads as "Changed by your HRBP". Renders the models; computes nothing.
 */
import { useMemo } from 'react'
import { Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { useAnalytics } from '@/data/context'
import { openPosition } from '@/drill/store'
import type { PlanModel } from '../engine'
import { seatEditsOf } from '../engine/edits'
import { definitionsOf } from '../engine/wording'
import { ID } from '../metrics'
import { SeatEditBar } from './SeatEdit'

export function Positions({ m }: { m: PlanModel }) {
  const ctx = useAnalytics()
  const g = m.positions.grid
  const c = m.positions.changes
  const edits = useMemo(() => seatEditsOf(ctx), [ctx])
  return (
    <Grid>
      <KpiStrip id="plan-positions-kpis" kpis={m.positions.kpis} />
      <SeatEditBar edits={edits} />
      <Figure
        id="plan-positions-grid"
        metric={g.metric}
        uses={g.uses}
        title={g.title}
        subtitle={g.subtitle}
        data={g.rows}
        columns={g.columns}
        definitions={definitionsOf(ctx.metrics, ID.positionsByStatus, ID.tradeWeight, ID.costBandEstimate)}
        note={g.note ?? undefined}
        empty={g.empty}
        tableOnly
        tableToggle={false}
        image={false}
        table={{
          maxRows: 50,
          search: 'Find a position, title or org',
          onRowClick: (r) => openPosition(r.positionId),
        }}
      />
      <Figure
        id="plan-positions-changes"
        metric={c.metric}
        uses={c.uses}
        title={c.title}
        subtitle={c.subtitle}
        data={c.rows}
        columns={c.columns}
        definitions={definitionsOf(ctx.metrics, ID.positionsByStatus)}
        note={c.note ?? undefined}
        empty={c.empty}
        tableOnly
        tableToggle={false}
        image={false}
        table={{ maxRows: 25, onRowClick: (r) => openPosition(r.positionId) }}
      />
    </Grid>
  )
}
