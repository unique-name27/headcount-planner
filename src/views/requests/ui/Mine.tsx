/**
 * Requests > Mine (docs/PLAN.md 9.4, 10.1): the Acting as person's requests and the tracker after
 * approval, with "Export requests". Picking a row opens its card below: the chain and each step, the
 * changes an HRBP approved with and why, the send-back reason, the comments you may read, and what
 * you may do now (submit or submit again, withdraw, the freeze exception, a comment).
 */
import { useState } from 'react'
import { Figure } from '@/charts'
import { KpiStrip } from '@/components/KpiStrip'
import { Grid } from '@/components/Section'
import { useAnalytics } from '@/data/context'
import type { RequestRecord } from '@/drill/types'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import { ID } from '../metrics'
import { defsOf, useRequests } from './model'
import { RequestCardView } from './RequestCardView'
import { ExportRequestsButton } from './RequestFiles'

export function Mine() {
  const ctx = useAnalytics()
  const { mine } = useRequests()
  const [picked, setPicked] = useState<string | null>(null)
  const card = mine.cards.find((c) => c.requestId === picked) ?? mine.cards[0] ?? null
  return (
    <Grid>
      <div className="col-span-full flex flex-wrap items-center justify-end gap-2">
        <ExportRequestsButton button={mine.exportRequests} />
      </div>
      <KpiStrip id="requests-mine-kpis" kpis={mine.kpis} />
      <Figure
        id="requests-mine"
        metric={ID.trackerDaysInStep}
        uses={mine.rows.uses}
        title={mine.rows.title}
        subtitle={mine.rows.subtitle}
        data={mine.rows.rows}
        columns={mine.rows.columns}
        definitions={defsOf(
          ctx,
          ID.trackerDaysInStep,
          ID.queueSentBack,
          ID.queueExpired,
          PLAN_ID.costBandEstimate,
        )}
        note={mine.rows.note ?? (mine.rows.rows.length ? 'Pick a request to open it below.' : undefined)}
        empty={mine.rows.empty}
        table={{ onRowClick: (r: RequestRecord) => setPicked(r.requestId) }}
        tableOnly
      />
      {card && (
        <RequestCardView
          key={card.requestId}
          card={card}
          money={ctx.guard.mode === 'rounded' ? 'moneyM' : 'moneyFull'}
        />
      )}
    </Grid>
  )
}
