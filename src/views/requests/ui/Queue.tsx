/**
 * Requests > Queue (docs/PLAN.md 9.4, 5.5): the requests in progress in scope, by state and step, with
 * the days each has waited. Rows follow 8.4: a limited row shows only its IDs, type, state, title,
 * level and org. The header holds "Import requests" (HRBP, Leader within its org, Finance, HR admin)
 * and "Export requests" (./RequestFiles.tsx).
 */

import { BarList, Figure } from '@/charts'
import { KpiStrip } from '@/components/KpiStrip'
import { Grid } from '@/components/Section'
import { useAnalytics } from '@/data/context'
import { drill } from '@/drill'
import type { RequestRecord } from '@/drill/types'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import type { RequestListRow, RequestStateRow } from '../engine'
import { ID } from '../metrics'
import { defsOf, useRequests } from './model'
import { ExportRequestsButton, ImportRequestsButton } from './RequestFiles'

/** A request waiting the setting's days or more in its step carries a warning mark (the model's flag). */
const waitTone = (r: RequestRecord) => ((r as RequestListRow).waiting ? 'warning' : null)

export function Queue() {
  const ctx = useAnalytics()
  const { queue } = useRequests()
  const byState = queue.byState
  const count = byState.columns.find((c) => c.key === 'count')
  return (
    <Grid>
      <div className="col-span-full flex flex-wrap items-center justify-end gap-2">
        <ImportRequestsButton button={queue.importRequests} />
        <ExportRequestsButton button={queue.exportRequests} />
      </div>
      <KpiStrip id="requests-queue-kpis" kpis={queue.kpis} />
      <Figure
        id="requests-queue-by-state"
        metric={ID.queueOpen}
        uses={byState.uses}
        title={byState.title}
        subtitle={byState.subtitle}
        data={byState.rows}
        columns={byState.columns}
        definitions={defsOf(ctx, ID.queueOpen, ID.queueWaiting)}
        note={byState.note ?? undefined}
        empty={byState.empty}
        span={4}
      >
        <BarList<RequestStateRow>
          data={byState.rows}
          label="label"
          value="count"
          format="int"
          sort="none"
          ariaLabel="Requests by state and step"
          onSelect={(d) => drill(count?.drill?.(d))}
        />
      </Figure>
      <Figure
        id="requests-queue"
        metric={ID.queueOpen}
        uses={queue.rows.uses}
        title={queue.rows.title}
        subtitle={queue.rows.subtitle}
        data={queue.rows.rows}
        columns={queue.rows.columns}
        definitions={defsOf(
          ctx,
          ID.queueOpen,
          ID.queueWaiting,
          ID.trackerDaysInStep,
          PLAN_ID.costBandEstimate,
        )}
        note={queue.rows.note ?? undefined}
        empty={queue.rows.empty}
        table={{ rowTone: waitTone }}
        tableOnly
        span={8}
      />
    </Grid>
  )
}
