/**
 * Requests > Approvals (docs/PLAN.md 9.4, 10.2, 7.6): the requests whose waiting step is the Acting as
 * person's, with the band estimate and the gap after approval outside Manager mode (heads, and cost
 * under the mode's own cost rules). Picking a row opens its card: approve, approve with changes (the
 * HRBP step), send back or reject with a reason the requester reads (refused with an amount), and the
 * comments with their audience. In Manager mode the card shows heads, the allocation after approval
 * and the status after approval, never a band estimate or a cost gap.
 */
import { useState } from 'react'
import { Figure } from '@/charts'
import { KpiStrip } from '@/components/KpiStrip'
import { Grid } from '@/components/Section'
import { useAnalytics } from '@/data/context'
import type { RequestRecord } from '@/drill/types'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import { ID as TARGETS_ID } from '@/views/targets/metrics'
import type { RequestListRow } from '../engine'
import { ID } from '../metrics'
import { defsOf, useRequests } from './model'
import { RequestCardView } from './RequestCardView'

/** The gaps figure's metric: the cost gap (decided per mode: never in Manager mode). */
const GAPS_METRIC = TARGETS_ID.gapCost

/** A step waiting the setting's days or more carries a warning mark (the model's flag). */
const waitTone = (r: RequestRecord) => ((r as RequestListRow).waiting ? 'warning' : null)

export function Approvals() {
  const ctx = useAnalytics()
  const { approvals } = useRequests()
  const [picked, setPicked] = useState<string | null>(null)
  const card = approvals.cards.find((c) => c.requestId === picked) ?? approvals.cards[0] ?? null
  const gaps = approvals.gaps
  const money = ctx.guard.mode === 'rounded' ? 'moneyM' : 'moneyFull'
  const gapCost = card?.gapAfter
    ? (gaps?.rows.find((g) => g.orgKey === card.gapAfter?.orgKey)?.gapCostUsd ?? null)
    : null
  return (
    <Grid>
      <KpiStrip id="requests-approvals-kpis" kpis={approvals.kpis} />
      <Figure
        id="requests-approvals"
        metric={ID.queueOpen}
        uses={approvals.rows.uses}
        title={approvals.rows.title}
        subtitle={approvals.rows.subtitle}
        data={approvals.rows.rows}
        columns={approvals.rows.columns}
        definitions={defsOf(
          ctx,
          ID.queueOpen,
          ID.queueWaiting,
          ID.trackerDaysInStep,
          PLAN_ID.costBandEstimate,
        )}
        note={approvals.rows.note ?? undefined}
        empty={approvals.rows.empty}
        table={{ rowTone: waitTone, onRowClick: (r: RequestRecord) => setPicked(r.requestId) }}
        tableOnly
      />
      {card && <RequestCardView key={card.requestId} card={card} money={money} gapCost={gapCost} />}
      {gaps && gaps.rows.length > 0 && (
        <Figure
          id="requests-approvals-gaps"
          metric={GAPS_METRIC}
          uses={gaps.uses}
          title={gaps.title}
          subtitle={gaps.subtitle}
          data={gaps.rows}
          columns={gaps.columns}
          definitions={defsOf(ctx, TARGETS_ID.gapHeads, TARGETS_ID.gapCost)}
          note={gaps.note ?? undefined}
          empty={gaps.empty}
          tableOnly
        />
      )}
    </Grid>
  )
}
