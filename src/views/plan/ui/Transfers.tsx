/**
 * Plan > Transfers (docs/PLAN.md 9.4, 10.5): transfers in progress and done, with names where 8.4
 * shows them, from and to, and approvals. No amounts. Where the mode processes transfers (HRBP, HR
 * admin), "Process a transfer" opens the form (./TransferForm.tsx), and your own drafts list below,
 * each opening to submit or withdraw it. Renders the models; computes nothing.
 */
import { useMemo, useState } from 'react'
import { Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { useAnalytics } from '@/data/context'
import type { PlanModel, TransferDraftRow } from '../engine'
import { transferOptions } from '../engine/edits'
import { definitionsOf } from '../engine/wording'
import { ID } from '../metrics'
import { DraftDialog, TransferBar } from './TransferForm'

export function Transfers({ m }: { m: PlanModel }) {
  const ctx = useAnalytics()
  const t = m.transfers.table
  const d = m.transfers.drafts
  const options = useMemo(() => transferOptions(ctx), [ctx])
  const [draft, setDraft] = useState<TransferDraftRow | null>(null)
  return (
    <Grid>
      <KpiStrip id="plan-transfers-kpis" kpis={m.transfers.kpis} />
      <TransferBar options={options} />
      <Figure
        id="plan-transfers-table"
        metric={t.metric}
        uses={t.uses}
        title={t.title}
        subtitle={t.subtitle}
        data={t.rows}
        columns={t.columns}
        definitions={definitionsOf(ctx.metrics, ID.transfersOpen)}
        empty={t.empty}
        tableOnly
        tableToggle={false}
        image={false}
        table={{ maxRows: 25 }}
      />
      {options.offered && (
        <Figure
          id="plan-transfers-drafts"
          metric={d.metric}
          uses={d.uses}
          title={d.title}
          subtitle={d.subtitle}
          data={d.rows}
          columns={d.columns}
          definitions={definitionsOf(ctx.metrics, ID.transfersOpen)}
          empty={d.empty}
          tableOnly
          tableToggle={false}
          image={false}
          table={{ maxRows: 25, onRowClick: (r) => setDraft(r) }}
        />
      )}
      {draft && <DraftDialog draft={draft} onClose={() => setDraft(null)} />}
    </Grid>
  )
}
