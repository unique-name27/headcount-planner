/**
 * What if > Levers (docs/PLAN.md 9.1, 9.4, 10.6, 11.5, C29): the result strip (heads, cost and gap
 * change, and one trade rate per trade lever) beside the lever list, the form that adds a lever,
 * "Turn into requests", and the seats a lever can change. No Readout. Renders the model; computes
 * nothing. The levers live in session memory (../engine/session.ts) and are never saved; "Turn into
 * requests" writes Draft requests through the write path (`usePlanWrite`), and is blocked in a reader
 * tab or with no Acting as pick, with the reason beside the button.
 */
import { useState } from 'react'
import { usePlanWrite } from '@/app/write/usePlanWrite'
import { WriteBlocked } from '@/app/write/WriteBlocked'
import { Figure } from '@/charts'
import { EmptyState } from '@/components/EmptyState'
import { IconClose, IconCopy } from '@/components/icons'
import { KpiStrip } from '@/components/KpiStrip'
import { Grid } from '@/components/Section'
import { toast } from '@/components/toast'
import { Button, IconButton } from '@/components/ui'
import { writeClipboard } from '@/lib/export/clipboard'
import { fmt, plural } from '@/lib/format'
import type { Lever, WhatIfLevers } from '../engine'
import { WHATIF_FIGURES } from '../engine/figures'
import { ID } from '../metrics'
import { LeverForm } from './LeverForm'
import { defsOf, useWhatIf } from './model'

/** The scenario as plain text for Copy: the levers and the heads and gap change, never an amount. */
export function scenarioText(m: WhatIfLevers): string {
  const kpi = (metric: string) => m.kpis.find((k) => k.metricId === metric)
  const heads = kpi(ID.deltaHeads)
  const gap = kpi(ID.deltaGap)
  const lines = [
    m.scope.sentence,
    ...m.levers.rows.map(
      (r) =>
        `${r.n}. ${r.label}${r.refused ? ` (${r.refused})` : ''}${r.tradeNote ? ` (${r.tradeNote})` : ''}`,
    ),
    `Heads change: ${heads?.value == null ? '—' : fmt(heads.value, 'int')}`,
    `Gap change: ${gap?.value == null ? '—' : fmt(gap.value, 'int')}`,
  ]
  return lines.join('\n')
}

function LeverList({
  m,
  onRemove,
  canEdit,
}: {
  m: WhatIfLevers
  onRemove: (index: number) => void
  canEdit: boolean
}) {
  return (
    <ol className="divide-y divide-rule">
      {m.levers.rows.map((r) => (
        <li key={r.index} className="flex items-start gap-3 py-2">
          <span className="w-5 shrink-0 text-meta text-muted tabular-nums">{r.n}</span>
          <div className="min-w-0 grow">
            <p className="text-small text-ink">{r.label}</p>
            <p className="text-meta text-ink-2">Turn into requests makes: {r.becomes}</p>
            {r.refused && <p className="text-meta text-warning">{r.refused}</p>}
            {r.tradeNote && <p className="text-meta text-ink-2">{r.tradeNote}</p>}
          </div>
          {canEdit && (
            <IconButton label={`Remove lever ${r.n}`} size="sm" onClick={() => onRemove(r.index)}>
              <IconClose className="size-3.5" />
            </IconButton>
          )}
        </li>
      ))}
    </ol>
  )
}

function TurnInto({ m, levers }: { m: WhatIfLevers; levers: readonly Lever[] }) {
  const write = usePlanWrite()
  const [busy, setBusy] = useState(false)
  const t = m.turnInto
  if (!t) return m.can.turnIntoWhy ? <p className="text-meta text-ink-2">{m.can.turnIntoWhy}</p> : null
  const disabled = busy || !write.can('turnLeversIntoRequests') || !levers.length || t.drafts === 0
  const run = async () => {
    setBusy(true)
    try {
      const out = await write.run('turnLeversIntoRequests', { levers })
      if (out.ok) toast(out.notice, { tone: 'good' })
      else toast(out.refused, { tone: 'critical' })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div data-tour="whatif-turn-into" className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" size="sm" disabled={disabled} onClick={() => void run()}>
          Turn into requests
        </Button>
        <WriteBlocked blocked={write.blocked} />
        {!write.blocked && levers.length > 0 && t.drafts > 0 && (
          <span className="text-meta text-ink-2">
            Makes {plural(t.drafts, 'draft request')} for review in Requests &gt; Mine.
          </span>
        )}
      </div>
      {t.refused && <p className="text-meta text-warning">{t.refused}</p>}
      {t.skipped.map((s) => (
        <p key={s} className="text-meta text-ink-2">
          {s}
        </p>
      ))}
    </div>
  )
}

export function Levers() {
  const { ctx, levers, m, set } = useWhatIf()
  const copy = async () => {
    try {
      await writeClipboard(scenarioText(m))
      toast('Scenario copied', { tone: 'good', description: 'The levers and the heads and gap change.' })
    } catch {
      toast('The browser blocked copying.', { tone: 'critical' })
    }
  }
  if (m.hidden)
    return (
      <Grid>
        <EmptyState title="What if is not shown here" body={m.hidden} />
      </Grid>
    )
  return (
    <Grid>
      <p className="col-span-full max-w-[80ch] text-small text-ink-2">
        {m.scope.sentence}. Results compare Working with the levers against Working without them. Levers are
        costed at band estimate from each change's date.
      </p>
      <KpiStrip id={WHATIF_FIGURES.results} title="Results" kpis={m.kpis} />
      <Figure
        id={WHATIF_FIGURES.levers}
        metric={ID.deltaHeads}
        definitions={defsOf(ctx, ID.deltaHeads, ID.deltaCost, ID.deltaGap)}
        uses={m.levers.uses}
        title={m.levers.title}
        subtitle={m.levers.subtitle}
        data={m.levers.rows}
        columns={m.levers.columns}
        note={m.levers.note ?? undefined}
        empty={m.levers.empty}
        image={false}
        tableToggle={false}
        span={6}
        actions={
          levers.length > 0 ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                icon={<IconCopy className="size-3.5" />}
                onClick={() => void copy()}
              >
                Copy scenario
              </Button>
              {m.can.use && (
                <Button size="sm" variant="ghost" onClick={() => set([])}>
                  Clear levers
                </Button>
              )}
            </>
          ) : undefined
        }
      >
        <LeverList m={m} canEdit={m.can.use} onRemove={(i) => set(levers.filter((_, k) => k !== i))} />
      </Figure>
      <div
        data-tour="whatif-add-lever"
        className="col-span-full flex flex-col gap-4 rounded-sheet bg-sheet px-5 py-4 lg:col-span-6"
      >
        <h2 className="cut-head text-title font-semibold">Add a lever</h2>
        {m.can.use ? (
          <LeverForm m={m} onAdd={(l) => set([...levers, l])} />
        ) : (
          <p className="text-meta text-ink-2">{m.can.useWhy}</p>
        )}
        <TurnInto m={m} levers={levers} />
      </div>
      <Figure
        id={WHATIF_FIGURES.seats}
        metric={ID.deltaHeads}
        uses={m.seats.uses}
        title={m.seats.title}
        subtitle={m.seats.subtitle}
        data={m.seats.rows}
        columns={m.seats.columns}
        note={m.seats.note ?? undefined}
        empty={m.seats.empty}
        tableOnly
      />
    </Grid>
  )
}
