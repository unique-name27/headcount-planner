/**
 * The Action center page (docs/PLAN.md 9.4 and 9.6; the template app's ActionCenter.tsx): open items
 * from every view's `actions(ctx)`, for the weekly review with each leader.
 *
 * HR admin lists every item, grouped by who it waits on. Every other mode shows its two lists:
 * "Needs attention" (the role's own items, most pressing first) and "Waiting on others" (its area,
 * owned by someone else, grouped by owner with a note to copy for each), and the key figures and
 * charts follow the list picked. On a phone the list comes first and the overview follows.
 *
 * Items from data below the on-screen standard are listed with their tier and counted. Handled and
 * snoozed items are kept in this browser (with the name typed here, if any) and can be reopened; a
 * roll-up that changes after it was marked is open again. Approval items offer Snooze only.
 * Components render the engine's lists; every number comes from `actionsModel` and its helpers.
 */
import { type ReactNode, useState } from 'react'
import { roleItems } from '@/access/items'
import { BarList, Figure, HBars, useChartTheme, useExportMeta } from '@/charts'
import type { Column } from '@/charts/types'
import { EmptyState } from '@/components/EmptyState'
import { IconDownload, IconSearch } from '@/components/icons'
import { KpiStrip } from '@/components/KpiStrip'
import { MultiSelect } from '@/components/MultiSelect'
import { Section } from '@/components/Section'
import { toast } from '@/components/toast'
import type { Severity } from '@/components/types'
import { Button, Segmented, SeverityIcon } from '@/components/ui'
import { useMinWidth } from '@/components/useNarrow'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { TIER_LABEL } from '@/data/quality/tier'
import type { ViewKey } from '@/data/schema'
import { drill } from '@/drill'
import type { DrillSpec } from '@/drill/types'
import { ABOUT_THIS_PAGE } from '@/help/copy'
import { AboutViewLink } from '@/help/ui/AboutViewLink'
import { formatDate } from '@/lib/dates'
import { moneyOpts } from '@/lib/export/columns'
import { downloadXlsx } from '@/lib/export/xlsx'
import { fmt, plural } from '@/lib/format'
import { ACTION_OWNER_LABEL, ACTION_OWNER_ROLES, type ActionOwnerRole } from '@/views/types'
import {
  type ActionsModel,
  actionKpis,
  countActions,
  DUE_BUCKETS,
  type DueBucket,
  dueBucket,
  dueBucketLabel,
  EXPORT_COLUMNS,
  exportRows,
  filterActions,
  groupByOwner,
  type ItemStatus,
  isFiltering,
  itemsDrill,
  lensFor,
  listHeader,
  listsLine,
  NEEDS_SHOWN,
  nothingWaiting,
  type OpenAction,
  type OwnerDueRow,
  type OwnerTableRow,
  ownerDueRows,
  ownerTableRows,
  SEVERITY_ORDER,
  SEVERITY_WORD,
  settingsOf,
  statusOf,
  usesOf,
  type ViewCountRow,
  viewRows,
} from '../engine'
import { actionListFileName, actionListMeta } from '../engine/exportList'
import { listSwitchOptions } from '../engine/listSwitch'
import { ID } from '../metrics'
import { ByKind, DueTimeline, TopOwners } from './Charts'
import { MarksName } from './MarksName'
import { drillItems, ItemRow, OwnerSheet, type StatusFn } from './Sheets'
import { type ListMode, listIn, useActionFilters, useActionMarks, useNow } from './store'
import { useActions } from './useActions'

const SEVERITIES: readonly Severity[] = SEVERITY_ORDER.filter((s) => s !== 'good')

/** The page's lists for one render: what each list holds and which one is shown. */
interface Lists {
  /** The mode shows Needs attention and Waiting on others. */
  roles: boolean
  list: ListMode
  needs: OpenAction[]
  waiting: OpenAction[]
  /** Every open item the mode lists (HR admin: all of them). */
  open: OpenAction[]
  parked: OpenAction[]
  /** The items of the list shown, before the page's own filters. */
  base: OpenAction[]
  /** What the key figures and charts count: the list shown, or every open item for the parked list. */
  counted: OpenAction[]
  left: number
}

function useLists(m: ActionsModel, status: StatusFn): Lists {
  const ctx = useAnalytics()
  const picked = useActionFilters((s) => s.list)
  const roles = m.lists
  const list = listIn(picked, roles)
  const needs = [...m.needs]
  const waiting = [...m.waiting]
  const open = [...m.items]
  const marked = m.collected.items.filter((a) => status(a).state !== 'open')
  // The parked list keeps to what the mode lists: its two lists, or its full list.
  const r = roleItems(marked, lensFor(ctx))
  // Roll-ups marked handled or snoozed park whole (their items stay open underneath).
  const parked = roles ? [...r.needs, ...r.waiting, ...m.parked] : r.listed
  const shownOpen = roles ? [...needs, ...waiting] : open
  const base = list === 'needs' ? needs : list === 'waiting' ? waiting : list === 'parked' ? parked : open
  return {
    roles,
    list,
    needs,
    waiting,
    open: shownOpen,
    parked,
    base,
    counted: list === 'parked' ? shownOpen : base,
    left: m.left,
  }
}

/* ───────── header ───────── */

function SeverityCounts({ open, ctx }: { open: readonly OpenAction[]; ctx: AnalyticsContext }) {
  const c = countActions(open, ctx)
  const shown = SEVERITIES.filter((s) => c.bySeverity[s] > 0)
  if (!shown.length) return null
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {shown.map((s) => {
        const items = open.filter((a) => a.item.severity === s)
        return (
          <span key={s} className="inline-flex items-center gap-1">
            <SeverityIcon severity={s} />
            <span>{SEVERITY_WORD[s]}</span>
            <button
              type="button"
              onClick={() => drillItems(ctx, `${SEVERITY_WORD[s]} items`, items)}
              aria-label={`Show the ${plural(items.length, `${SEVERITY_WORD[s].toLowerCase()} item`)}`}
              className="tnum cursor-pointer rounded-mark font-semibold text-ink underline decoration-rule-strong decoration-dotted underline-offset-[3px] hover:decoration-ink hover:decoration-solid"
            >
              {fmt(items.length, 'int')}
            </button>
          </span>
        )
      })}
    </span>
  )
}

const LIST_TITLE: Record<ListMode, string> = {
  open: 'Action center: items',
  needs: 'Action center: needs attention',
  waiting: 'Action center: waiting on others',
  parked: 'Action center: handled and snoozed',
}

function ExportListButton({
  items,
  status,
  list,
}: {
  items: readonly OpenAction[]
  status: StatusFn
  list: ListMode
}) {
  const ctx = useAnalytics()
  // The mode and scope lines ride in the meta, as on every export; the view is the Action center's
  // whatever view the page was opened over (EX-7).
  const meta = actionListMeta(useExportMeta())
  const run = async () => {
    try {
      const groups = groupByOwner(items, ctx.asOf)
      const owners = groups.flatMap((g) =>
        g.owners.map((b) => ({
          ownerGroup: g.label,
          owner: b.name,
          items: b.items.length,
          overdue: b.overdue,
          critical: b.critical,
        })),
      )
      const ownerColumns: Column[] = [
        { key: 'ownerGroup', label: 'Owner group' },
        { key: 'owner', label: 'Waiting on' },
        { key: 'items', label: 'Items', format: 'int' },
        { key: 'overdue', label: 'Overdue', format: 'int' },
        { key: 'critical', label: 'Critical', format: 'int' },
      ]
      await downloadXlsx(
        [
          {
            name: 'Items',
            title: LIST_TITLE[list],
            subtitle: 'Items from every view, by who they wait on, most pressing first',
            columns: EXPORT_COLUMNS,
            rows: exportRows(items, ctx.asOf, status),
          },
          { name: 'By owner', title: 'Action center: items by owner', columns: ownerColumns, rows: owners },
        ],
        meta,
        { ...moneyOpts(ctx), fileName: actionListFileName(meta, list) },
      )
      toast('Action center list downloaded', {
        tone: 'good',
        description: `${plural(items.length, 'item')}.`,
      })
    } catch (err) {
      console.error('Action center export failed', err)
      toast('Export failed. Try again.', { tone: 'critical' })
    }
  }
  return (
    <Button icon={<IconDownload />} disabled={!items.length} onClick={() => void run()}>
      Export list
    </Button>
  )
}

/* ───────── notices ───────── */

function Notices({ m, left, roles }: { m: ActionsModel; left: number; roles: boolean }) {
  const { below, errors } = m.collected
  const lines: ReactNode[] = []
  if (below.count > 0) {
    const reasons = below.reasons
      .slice(0, 3)
      .map((r) => `${r.subject} is ${TIER_LABEL[r.tier]} (${fmt(r.count, 'int')})`)
      .join(', ')
    lines.push(
      <span key="below">
        {below.count === 1
          ? '1 item comes from data below your standard'
          : `${fmt(below.count, 'int')} items come from data below your standard`}
        : {reasons}
        {below.reasons.length > 3 ? ' and more' : ''}. They are listed with their tier, because the work is
        real whatever the data's tier.
      </span>,
    )
  }
  if (roles && left > 0)
    lines.push(
      <span key="left">
        {left === 1
          ? '1 more item in your area is someone else’s and waits on neither list here, so it is not listed.'
          : `${fmt(left, 'int')} more items in your area are someone else’s and wait on neither list here, so they are not listed.`}
      </span>,
    )
  for (const e of errors)
    lines.push(
      <span key={`err-${e.view}`} className="text-bad-text">
        Items from {e.label} could not be computed. The rest are listed.
      </span>,
    )
  if (!lines.length) return null
  return (
    <div className="col-span-full flex flex-col gap-1 text-meta leading-snug text-ink-2" aria-live="polite">
      {lines}
    </div>
  )
}

/* ───────── overview figures ───────── */

type Bucket = DueBucket | 'all' | 'critical'

const ownerTableColumns = (
  soonDays: number,
  spec: (row: OwnerTableRow, bucket: Bucket) => DrillSpec | null,
): Column<OwnerTableRow>[] => {
  const d = (b: Bucket) => (r: OwnerTableRow) => () => spec(r, b)
  return [
    { key: 'group', label: 'Owner group' },
    { key: 'open', label: 'Items', format: 'int', drill: d('all') },
    { key: 'overdue', label: 'Overdue', format: 'int', drill: d('overdue') },
    { key: 'soon', label: dueBucketLabel('soon', soonDays), format: 'int', drill: d('soon') },
    { key: 'later', label: 'Due later', format: 'int', drill: d('later') },
    { key: 'none', label: 'No due date', format: 'int', drill: d('none') },
    { key: 'critical', label: 'Critical', format: 'int', drill: d('critical') },
  ]
}

function WhereItemsWait({ open, status }: { open: readonly OpenAction[]; status: StatusFn }) {
  const ctx = useAnalytics()
  const theme = useChartTheme()
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const groups = groupByOwner(open, ctx.asOf)
  const byLabel = new Map(groups.map((g) => [g.label, g]))
  const stacked = ownerDueRows(open, ctx)
  const table = ownerTableRows(open, ctx)
  const views = viewRows(open, ctx)
  const uses = usesOf(open)
  const labels = DUE_BUCKETS.map((b) => dueBucketLabel(b, dueSoonDays))
  const colors: Record<string, string> = {
    [labels[0]]: theme.status.critical,
    [labels[1]]: theme.status.warning,
    [labels[2]]: theme.series[0],
    [labels[3]]: theme.deemph,
  }
  const specOf = (title: string, items: readonly OpenAction[]): DrillSpec | null =>
    items.length ? itemsDrill(ctx, title, items, { status }) : null
  const matches = (a: OpenAction, bucket: Bucket) =>
    bucket === 'all'
      ? true
      : bucket === 'critical'
        ? a.item.severity === 'critical'
        : dueBucket(a.item.due, ctx.asOf, dueSoonDays) === bucket
  const bucketWords = (bucket: Bucket) =>
    bucket === 'all'
      ? 'items'
      : bucket === 'critical'
        ? 'critical items'
        : bucket === 'none'
          ? 'items with no due date'
          : `items ${dueBucketLabel(bucket, dueSoonDays).toLowerCase()}`
  const groupSpec = (label: string, bucket: Bucket) =>
    specOf(
      `${label}: ${bucketWords(bucket)}`,
      (byLabel.get(label)?.items ?? []).filter((a) => matches(a, bucket)),
    )
  const viewSpec = (r: Pick<ViewCountRow, 'view' | 'viewKey'>, bucket: Bucket) =>
    specOf(
      `${r.view}: ${bucketWords(bucket)}`,
      open.filter((a) => a.item.view === r.viewKey && matches(a, bucket)),
    )
  const viewColumns: Column<ViewCountRow>[] = [
    { key: 'view', label: 'From' },
    { key: 'open', label: 'Items', format: 'int', drill: (r) => () => viewSpec(r, 'all') },
    { key: 'overdue', label: 'Overdue', format: 'int', drill: (r) => () => viewSpec(r, 'overdue') },
    { key: 'critical', label: 'Critical', format: 'int', drill: (r) => () => viewSpec(r, 'critical') },
  ]
  return (
    <>
      <DueTimeline open={open} status={status} />
      <TopOwners open={open} status={status} />
      <ByKind open={open} status={status} />
      <Figure
        id="actions-by-view"
        title="Where items come from"
        subtitle="Open items by the view that raises them"
        data={views}
        columns={viewColumns}
        metric={ID.itemsOpen}
        uses={uses}
        span={5}
        note="Each item opens the tab that explains it."
        empty={open.length ? null : 'Nothing is open in this scope.'}
      >
        <BarList<ViewCountRow>
          data={views}
          label="view"
          value="open"
          secondary="secondary"
          format="int"
          sort="none"
          ariaLabel="Open items by source view"
          onSelect={(d) => drill(() => viewSpec(d, 'all'))}
        />
      </Figure>
      <Figure
        id="actions-owners"
        title="Where items wait"
        subtitle={`Open items by owner group and due date, as of ${formatDate(ctx.asOf)}`}
        data={table}
        columns={ownerTableColumns(dueSoonDays, (r, b) => groupSpec(r.group, b))}
        metric={ID.itemsOpen}
        uses={uses}
        span={12}
        note={`Due within ${dueSoonDays} d counts from the as-of date.`}
        empty={open.length ? null : 'Nothing is open in this scope.'}
      >
        <HBars<OwnerDueRow>
          data={stacked}
          y="group"
          x="items"
          series="due"
          stack
          seriesOrder={labels}
          yOrder={groups.map((g) => g.label)}
          colors={colors}
          format="int"
          ariaLabel="Open items by owner group, stacked by due date"
          onSelect={(d) => drill(() => groupSpec(d.group, 'all'))}
          onSelectSegment={(d) => drill(() => groupSpec(d.group, d.bucket))}
        />
      </Figure>
    </>
  )
}

/* ───────── filters ───────── */

function ListControls({ items }: { items: readonly OpenAction[] }) {
  const ctx = useAnalytics()
  const filters = useActionFilters((s) => s.filters)
  const setFilters = useActionFilters((s) => s.setFilters)
  const resetFilters = useActionFilters((s) => s.resetFilters)
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const count = <K extends string>(key: (a: OpenAction) => K) => {
    const m = new Map<K, number>()
    for (const a of items) m.set(key(a), (m.get(key(a)) ?? 0) + 1)
    return m
  }
  const roles = count((a) => a.role)
  const sev = count((a) => a.item.severity)
  const due = count((a) => dueBucket(a.item.due, ctx.asOf, dueSoonDays))
  const views = count((a) => a.item.view)
  const viewLabel = new Map(items.map((a) => [a.item.view, a.viewLabel]))
  const roleOptions = ACTION_OWNER_ROLES.filter((r) => roles.has(r) || filters.roles.includes(r)).map(
    (r) => ({
      value: r,
      label: ACTION_OWNER_LABEL[r],
      count: roles.get(r) ?? 0,
    }),
  )
  return (
    <div data-tour="actions-list-controls" className="col-span-full flex flex-wrap items-center gap-2">
      <MultiSelect
        label="Owner group"
        options={roleOptions}
        value={[...filters.roles]}
        onChange={(v) => setFilters({ roles: v as ActionOwnerRole[] })}
      />
      <MultiSelect
        label="Severity"
        width={220}
        options={SEVERITIES.map((s) => ({ value: s, label: SEVERITY_WORD[s], count: sev.get(s) ?? 0 }))}
        value={[...filters.severities]}
        onChange={(v) => setFilters({ severities: v as Severity[] })}
      />
      <MultiSelect
        label="Due"
        width={240}
        options={DUE_BUCKETS.map((b) => ({
          value: b,
          label: dueBucketLabel(b, dueSoonDays),
          count: due.get(b) ?? 0,
        }))}
        value={[...filters.due]}
        onChange={(v) => setFilters({ due: v as DueBucket[] })}
      />
      <MultiSelect
        label="From"
        width={260}
        options={[...views.entries()].map(([k, n]) => ({ value: k, label: viewLabel.get(k) ?? k, count: n }))}
        value={[...filters.views]}
        onChange={(v) => setFilters({ views: v as ViewKey[] })}
      />
      <label className="relative flex h-8 min-w-0 flex-1 basis-48 items-center sm:max-w-[280px]">
        <span className="sr-only">Search items</span>
        <IconSearch className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
        <input
          type="search"
          value={filters.query}
          onChange={(e) => setFilters({ query: e.currentTarget.value })}
          placeholder="Search owner, request or position"
          className="h-8 w-full rounded-control bg-sheet pr-2 pl-8 text-small text-ink shadow-[inset_0_0_0_1px_var(--rule-strong)] outline-none placeholder:text-muted"
        />
      </label>
      {isFiltering(filters) && (
        <Button size="sm" variant="ghost" onClick={resetFilters}>
          Clear filters
        </Button>
      )}
    </div>
  )
}

/* ───────── Needs attention: one ranked list ───────── */

/** A role's Needs attention, most pressing first, the first 15 before "Show all". One Figure, so the list exports. */
function NeedsList({ items, status }: { items: readonly OpenAction[]; status: StatusFn }) {
  const ctx = useAnalytics()
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, NEEDS_SHOWN)
  const more = items.length - shown.length
  // Say who each item waits on only when the list holds more than one owner.
  const owners = new Set(items.map((a) => a.ownerKey)).size > 1
  return (
    <Figure
      id="actions-items"
      title="Most pressing first"
      subtitle={`${plural(items.length, 'item')}, by severity, then days overdue`}
      data={exportRows(items, ctx.asOf, status)}
      columns={EXPORT_COLUMNS}
      image={false}
      tableToggle={false}
      metric={ID.itemsOpen}
      uses={usesOf(items)}
    >
      <div className="-mx-4 -mt-1 -mb-5 lg:-mx-5">
        <ul aria-label="Needs attention" className="border-t border-rule">
          {shown.map((a) => (
            <ItemRow key={a.id} a={a} parked={false} status={status(a)} showOwner={owners} />
          ))}
        </ul>
        {more > 0 && (
          <div className="border-t border-rule px-4 py-1.5 sm:pl-10">
            <Button size="sm" variant="ghost" onClick={() => setAll(true)}>
              Show all {fmt(items.length, 'int')}
            </Button>
          </div>
        )}
      </div>
    </Figure>
  )
}

/* ───────── page ───────── */

const SECTION_TITLE: Record<ListMode, string> = {
  open: 'Waiting on',
  needs: 'Needs attention',
  waiting: 'Waiting on others',
  parked: 'Handled and snoozed',
}

function ListSwitch({ lists }: { lists: Lists }) {
  const setList = useActionFilters((s) => s.setList)
  // The three-part switch is wider than a phone's column; under 640px it uses the short words.
  const wide = useMinWidth(640)
  const options = listSwitchOptions(
    {
      roles: lists.roles,
      needs: lists.needs.length,
      waiting: lists.waiting.length,
      open: lists.open.length,
      parked: lists.parked.length,
    },
    wide,
  )
  return (
    <span data-tour="actions-list-switch" className="block max-w-full overflow-x-auto">
      <Segmented<ListMode> label="Show" value={lists.list} onChange={setList} options={options} />
    </span>
  )
}

function Body({ m, status }: { m: ActionsModel; status: StatusFn }) {
  const ctx = useAnalytics()
  const filters = useActionFilters((s) => s.filters)
  const resetFilters = useActionFilters((s) => s.resetFilters)
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const lists = useLists(m, status)
  const { list, base } = lists
  const listed = filterActions(base, filters, ctx.asOf, dueSoonDays)
  const groups = groupByOwner(listed, ctx.asOf)
  const kpis = actionKpis(lists.counted, ctx)
  const parked = list === 'parked'
  const dek =
    list === 'needs'
      ? 'What is yours to act on, most pressing first. Snooze an approval until you can decide it; mark other items handled once they are in hand.'
      : list === 'waiting'
        ? 'Items in your area that someone else owns. Copy a note to send each owner their list.'
        : parked
          ? 'Items marked handled or snoozed in this browser. A snooze ends on its own, and an item that changes opens again; reopen an item to list it now.'
          : 'One sheet per owner group, the most pressing owner first. Copy a note to send each owner their list; mark an item handled or snooze it once it is in hand.'
  const empty = !listed.length ? (
    base.length ? (
      <EmptyState
        title="No items match these filters"
        body="Clear a filter, or search for another name."
        action={
          <Button size="sm" onClick={resetFilters}>
            Clear filters
          </Button>
        }
      />
    ) : parked ? (
      <EmptyState
        title="Nothing is handled or snoozed"
        body="Items you mark handled or snooze in this browser show here, so you can reopen them."
      />
    ) : list === 'needs' ? (
      <EmptyState title="Nothing needs attention" body={nothingWaiting(ctx)} />
    ) : list === 'waiting' ? (
      <EmptyState
        title="Nothing is waiting on others"
        body="No item in your area is owned by someone else."
      />
    ) : (
      <EmptyState
        title="Nothing is open"
        body="No view has an item waiting on someone in this scope. Items show here when an approval, a request sent back, ranked asks or a seat wait on a person."
      />
    )
  ) : null
  return (
    // On a phone the list leads and the overview follows.
    <div className="mt-5 flex flex-col">
      <Section
        title="Overview"
        dek={
          lists.roles && !parked
            ? `The key figures and charts count ${list === 'needs' ? 'Needs attention' : 'Waiting on others'}.`
            : undefined
        }
        align="start"
        className="max-md:order-2 max-md:mt-10"
      >
        <Notices m={m} left={lists.left} roles={lists.roles} />
        <KpiStrip id="actions-kpis" kpis={kpis} />
        <WhereItemsWait open={lists.counted} status={status} />
      </Section>
      <Section
        className="mt-10 max-md:order-1 max-md:mt-0"
        title={SECTION_TITLE[list]}
        dek={dek}
        actions={<ListSwitch lists={lists} />}
      >
        <ListControls items={base} />
        {empty ??
          (list === 'needs' ? (
            <NeedsList items={listed} status={status} />
          ) : (
            groups.map((g) => (
              <OwnerSheet key={`${list}-${g.role}`} group={g} parked={parked} statusOf={status} />
            ))
          ))}
        {parked && <MarksName />}
      </Section>
    </div>
  )
}

/** The Action center page (`#actions`): the shell mounts it with the filter row above. */
export function ActionCenter() {
  const ctx = useAnalytics()
  const m = useActions()
  const marks = useActionMarks((s) => s.marks)
  const now = useNow()
  const status = (a: OpenAction): ItemStatus => statusOf(a, marks, now)
  const filters = useActionFilters((s) => s.filters)
  const { dueSoonDays } = settingsOf(ctx.metrics)
  const lists = useLists(m, status)
  const exportable = filterActions(lists.base, filters, ctx.asOf, dueSoonDays)
  const counted = lists.list === 'parked' ? lists.open : lists.base
  return (
    <div>
      <div className="pt-5">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div data-tour="actions-header" className="min-w-0 flex-1 basis-[420px]">
            <h1
              data-actions-heading=""
              tabIndex={-1}
              className="cut-head text-page-title leading-[1.1] font-[650] tracking-[-0.01em] outline-none"
            >
              Action center
            </h1>
            <p className="mt-1.5 max-w-[72ch] text-small text-ink-2">
              {lists.roles
                ? `${listHeader(ctx)}. ${listsLine()}`
                : 'Open items from every view, grouped by who they wait on: approvals, requests sent back, ranked asks, seats and exceptions to raise in each review.'}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-ink-2">
              <span>{ctx.scopeLabel}</span>
              <span aria-hidden="true" className="text-muted">
                ·
              </span>
              <span>as of {formatDate(ctx.asOf)}</span>
              {counted.length > 0 && (
                <>
                  <span aria-hidden="true" className="text-muted">
                    ·
                  </span>
                  <SeverityCounts open={counted} ctx={ctx} />
                </>
              )}
            </div>
            <p className="mt-1.5">
              <AboutViewLink view="actions" label={ABOUT_THIS_PAGE} />
            </p>
          </div>
          <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
            {ctx.access.can('export:action-list') && (
              <ExportListButton items={exportable} status={status} list={lists.list} />
            )}
          </div>
        </div>
        <div className="mt-4 border-b border-rule" />
      </div>
      <Body m={m} status={status} />
    </div>
  )
}
