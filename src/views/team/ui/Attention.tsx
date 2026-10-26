/**
 * Needs attention on My team (docs/PLAN.md 9.3 and 9.6): the Manager mode items of the Action
 * center's split (approvals waiting on you, sent-back requests, Planned seats near start with no req,
 * trade credit about to lapse), most pressing first, read only. Mark handled and Snooze stay in the
 * Action center, one link away. The rows are the Action center's, so the counts agree with it.
 */
import { useState } from 'react'
import { Figure } from '@/charts'
import { goTo, RouteLink, Section } from '@/components'
import { Button, StatusPill } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { Drill } from '@/drill/Drill'
import { plural } from '@/lib/format'
import type { OpenAction } from '@/views/actions/engine'
import { ID as ACTIONS } from '@/views/actions/metrics'
import {
  ATTENTION_COLUMNS,
  attentionRows,
  daysToDue,
  dueText,
  HOME_SHOWN,
  itemUses,
  SEVERITY_WORD,
} from '@/views/home/engine/attention'

const LINK = 'text-meta font-medium text-link underline-offset-2 hover:underline'

function ItemLine({ a }: { a: OpenAction }) {
  const { asOf } = useAnalytics()
  const days = daysToDue(a.item.due, asOf)
  const label = a.item.subject.label
  return (
    <li className="grid grid-cols-1 gap-x-3 gap-y-1 border-t border-rule py-2.5 sm:grid-cols-[76px_minmax(0,1fr)_auto]">
      <div className="pt-px">
        <StatusPill severity={a.item.severity} quiet label={SEVERITY_WORD[a.item.severity]} />
      </div>
      <div className="min-w-0">
        <p className="text-small leading-snug text-ink">{a.item.what}</p>
        <p className="mt-0.5 text-meta leading-snug text-ink-2">
          {a.item.drill ? (
            <Drill spec={a.item.drill} label={`Show the records behind ${label}`}>
              {label}
            </Drill>
          ) : (
            <span>{label}</span>
          )}
          <span aria-hidden="true" className="px-1.5 text-muted">
            ·
          </span>
          <span>{a.ownerName}</span>
          <span aria-hidden="true" className="px-1.5 text-muted">
            ·
          </span>
          <RouteLink
            view={a.item.view}
            tab={a.item.tab ?? undefined}
            className="rounded-mark text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-ink"
          >
            {a.from}
          </RouteLink>
        </p>
      </div>
      <span
        className={`text-meta whitespace-nowrap sm:text-right ${days != null && days < 0 ? 'font-medium text-bad-text' : 'text-ink-2'}`}
      >
        {dueText(a.item.due, asOf)}
      </span>
    </li>
  )
}

export function TeamAttention({ items }: { items: readonly OpenAction[] | null }) {
  const ctx = useAnalytics()
  const [all, setAll] = useState(false)
  const list = items ? (all ? items : items.slice(0, HOME_SHOWN)) : []
  const more = items ? items.length - list.length : 0
  const actions = ctx.access.can('page:actions') ? (
    <button type="button" className={LINK} onClick={() => goTo('actions')}>
      Open the Action center
    </button>
  ) : undefined
  return (
    <Section
      title="Needs attention"
      dek="Approvals waiting on you, requests sent back to you, Planned seats starting soon with no req, and trade credit about to lapse."
      actions={actions}
    >
      <Figure
        id="team-attention"
        metric={ACTIONS.itemsOpen}
        uses={items ? itemUses(items) : []}
        title="Most urgent"
        subtitle="Your open items, most pressing first"
        data={items ? attentionRows(items, ctx.asOf) : []}
        columns={ATTENTION_COLUMNS}
        note={items ? plural(items.length, 'item') : undefined}
        image={false}
        tableToggle={false}
        empty={
          items == null
            ? 'Open items are not available right now.'
            : items.length
              ? null
              : 'Nothing is waiting on you.'
        }
        emptyHeight={120}
      >
        <ul aria-label="Needs attention">
          {list.map((a) => (
            <ItemLine key={a.id} a={a} />
          ))}
        </ul>
        {more > 0 && (
          <div className="border-t border-rule pt-1.5">
            <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
              Show all {items?.length}
            </Button>
          </div>
        )}
      </Figure>
    </Section>
  )
}
