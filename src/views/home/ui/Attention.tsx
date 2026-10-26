/**
 * Needs attention on a role home (docs/PLAN.md 9.3 and 9.6; the template app's AttentionSection):
 * "Where your items wait" (span 4: the mode's Needs attention items by kind of work, stacked by due
 * state) beside the most urgent items (span 8, the first eight before "Show all"). The items are the
 * mode's Needs attention from the Action center's split, so the counts here are the Action center's.
 * Rows are read only: Mark handled and Snooze stay in the Action center, one link away.
 */
import { useState } from 'react'
import { type Column, Figure, HBars, useChartTheme } from '@/charts'
import { goTo, Pending, RouteLink, Section } from '@/components'
import { Button, cx, StatusPill } from '@/components/ui'
import { useAnalytics } from '@/data/context'
import { Drill, drill } from '@/drill/Drill'
import { drillSpec } from '@/drill/types'
import { formatDate } from '@/lib/dates'
import { fmt, plural } from '@/lib/format'
import type { OpenAction } from '@/views/actions/engine'
import { ID as ACTIONS } from '@/views/actions/metrics'
import {
  ATTENTION_COLUMNS,
  attentionRows,
  DUE_BUCKETS,
  daysToDue,
  dueBucket,
  dueBucketLabel,
  dueSoonDays,
  dueText,
  HOME_SHOWN,
  itemUses,
  OTHER_KIND,
  SEVERITY_WORD,
  type WaitRow,
  waitColumns,
  waitRows,
} from '../engine/attention'
import type { HomeItems } from './model'

const LINK = 'text-meta font-medium text-link underline-offset-2 hover:underline'

interface Segment {
  [key: string]: unknown
  kind: string
  due: string
  items: number
  list: readonly OpenAction[]
}

/** The items behind a row or segment, as Action center records. */
function itemsSpec(title: string, list: readonly OpenAction[], asOf: string) {
  return drillSpec({
    kind: 'actionItems',
    title,
    rows: list.map((a) => ({
      id: a.id,
      severity: a.item.severity,
      severityLabel: SEVERITY_WORD[a.item.severity],
      what: a.item.what,
      subject: a.item.subject.label,
      positionId: a.item.place.positionId,
      subjectDrill: a.item.drill,
      ownerGroup: a.roleLabel,
      owner: a.ownerName,
      due: a.item.due ?? null,
      dueText: dueText(a.item.due, asOf),
      from: a.from,
      status: 'Open',
    })),
  })
}

function WaitFigure({ items }: { items: readonly OpenAction[] }) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const soon = dueSoonDays(ctx.metrics)
  const rows = waitRows(items, ctx)
  const labels = DUE_BUCKETS.map((b) => dueBucketLabel(b, soon))
  const colors: Record<string, string> = {
    [labels[0]]: theme.status.critical,
    [labels[1]]: theme.status.warning,
    [labels[2]]: theme.series[0],
    [labels[3]]: theme.deemph,
  }
  const name = (r: WaitRow) => (r.kind === OTHER_KIND && r.folded ? plural(r.folded, 'other kind') : r.kind)
  const segments: Segment[] = rows.flatMap((r) =>
    DUE_BUCKETS.map((b) => ({
      kind: name(r),
      due: dueBucketLabel(b, soon),
      list: r.list.filter((a) => dueBucket(a.item.due, ctx.asOf, soon) === b),
      items: 0,
    }))
      .map((s) => ({ ...s, items: s.list.length }))
      .filter((s) => s.items > 0),
  )
  const columns: Column<WaitRow>[] = waitColumns(soon).map((c) =>
    c.key === 'items' ? { ...c, drill: (r: WaitRow) => () => itemsSpec(name(r), r.list, ctx.asOf) } : c,
  )
  return (
    <Figure
      id="home-attention-wait"
      metric={ACTIONS.itemsOpen}
      uses={itemUses(items)}
      title="Where your items wait"
      subtitle={`Your open items by kind of work and when they fall due, as of ${formatDate(ctx.asOf)}`}
      data={rows}
      columns={columns}
      note={`${plural(items.length, 'item')} · ${plural(rows.length, 'kind')}`}
      span={4}
      empty={items.length ? null : 'Nothing is waiting on you.'}
      emptyHeight={200}
    >
      <HBars<Segment>
        data={segments}
        y="kind"
        x="items"
        series="due"
        stack
        seriesOrder={labels}
        yOrder={rows.map(name)}
        colors={colors}
        format="int"
        onSelect={(d) => drill(() => itemsSpec(d.kind, d.list, ctx.asOf))}
        ariaLabel="Your open items by kind, stacked by due date"
      />
    </Figure>
  )
}

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
        className={cx(
          'text-meta whitespace-nowrap sm:text-right',
          days != null && days < 0 ? 'font-medium text-bad-text' : 'text-ink-2',
        )}
      >
        {dueText(a.item.due, asOf)}
      </span>
    </li>
  )
}

function AttentionList({ items, empty }: { items: readonly OpenAction[]; empty: string }) {
  const ctx = useAnalytics()
  const [all, setAll] = useState(false)
  const list = all ? items : items.slice(0, HOME_SHOWN)
  const more = items.length - list.length
  const overdue = items.filter((a) => (daysToDue(a.item.due, ctx.asOf) ?? 0) < 0).length
  return (
    <Figure
      id="home-attention"
      metric={ACTIONS.itemsOpen}
      uses={itemUses(items)}
      title="Most urgent"
      subtitle="Your most urgent open items: by severity, then days overdue"
      data={attentionRows(items, ctx.asOf)}
      columns={ATTENTION_COLUMNS}
      note={[
        `${plural(items.length, 'item')}${overdue ? ` · ${fmt(overdue, 'int')} overdue` : ''}`,
        `as of ${formatDate(ctx.asOf)}`,
      ].join(' · ')}
      span={8}
      image={false}
      tableToggle={false}
      className="max-md:-order-1"
      empty={items.length ? null : empty}
      emptyHeight={200}
    >
      <div data-tour="home-attention">
        <ul aria-label="Needs attention">
          {list.map((a) => (
            <ItemLine key={a.id} a={a} />
          ))}
        </ul>
        {more > 0 && (
          <div className="border-t border-rule pt-1.5">
            <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
              Show all {fmt(items.length, 'int')}
            </Button>
          </div>
        )}
      </div>
    </Figure>
  )
}

export function AttentionSection({ items, dek }: { items: HomeItems | null; dek: string }) {
  const ctx = useAnalytics()
  const canOpen = ctx.access.can('page:actions')
  const waiting = items?.waiting.length ?? 0
  const actions = canOpen ? (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {items &&
        (waiting > 0 ? (
          <button type="button" className={LINK} onClick={() => goTo('actions')}>
            Waiting on others ({fmt(waiting, 'int')})
          </button>
        ) : (
          <span className="text-meta text-muted">Nothing waiting on others</span>
        ))}
      <button type="button" className={LINK} onClick={() => goTo('actions')}>
        Open the Action center
      </button>
    </span>
  ) : undefined
  return (
    <Section title="Needs attention" dek={dek} actions={actions}>
      {items ? (
        <>
          <WaitFigure items={items.needs} />
          <AttentionList
            items={items.needs}
            empty={`Nothing is waiting on you${ctx.isCompany ? ' across the company' : ` in ${ctx.scopeLabel}`}.`}
          />
        </>
      ) : (
        <Pending
          message="Open items are not available right now."
          frames={[
            { title: 'Where your items wait', span: 4, height: 200 },
            { title: 'Most urgent', span: 8, height: 200 },
          ]}
        />
      )}
    </Section>
  )
}
