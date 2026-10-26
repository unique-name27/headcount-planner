/**
 * Needs attention on a role home and on My team (docs/PLAN.md 9.3 and 9.6), as data: the mode's
 * Needs attention items from the Action center's split (`actionsModel(ctx, ITEM_SOURCES).needs`,
 * src/views/actions/engine), so every count here is the Action center's; the rows of the most urgent
 * list (severity, what, what it is about, who it waits on, where it comes from, when it is due) and
 * "Where your items wait" (the items by kind of work and due state, the six largest kinds on their
 * own row and the rest as Other). No amount: items carry none (7.2 rule 6). Pure.
 *
 * Readings taken here: an item's kind of work is its `kind` label, else its id's kind
 * ("requests:waiting" reads "Waiting"); "due soon" is the Action center's `actions.items.dueSoon`
 * setting `days` when the dictionary registers it, else 7 days (the template app's default).
 */
import type { Column } from '@/charts/types'
import type { Severity } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { ISODate } from '@/data/schema'
import { daysBetween } from '@/lib/dates'
import type { MetricsApi } from '@/metrics/types'
import type { OpenAction } from '@/views/actions/engine'
import { ID as ACTIONS } from '@/views/actions/metrics'

/** Items a home lists before "Show all" (the template's 8). */
export const HOME_SHOWN = 8
/** Kinds "Where your items wait" keeps on their own row; the rest fold into Other. */
export const WAIT_TOP = 6
export const OTHER_KIND = 'Other'

export type DueBucket = 'overdue' | 'soon' | 'later' | 'none'
export const DUE_BUCKETS: readonly DueBucket[] = ['overdue', 'soon', 'later', 'none']

export const SEVERITY_WORD: Readonly<Record<Severity, string>> = {
  critical: 'Critical',
  warning: 'Watch',
  info: 'Note',
  good: 'Good',
}

/** The due-soon window in days: the Action center's setting when registered, else 7. */
export function dueSoonDays(metrics: Pick<MetricsApi, 'paramDef' | 'num'>): number {
  return metrics.paramDef(ACTIONS.itemsDueSoon, 'days') ? metrics.num(ACTIONS.itemsDueSoon, 'days') : 7
}

/** Days from the as-of date to the due date (negative: overdue); null with no due date. */
export const daysToDue = (due: ISODate | null | undefined, asOf: ISODate): number | null =>
  due ? daysBetween(asOf, due) : null

export function dueBucket(due: ISODate | null | undefined, asOf: ISODate, soon: number): DueBucket {
  const d = daysToDue(due, asOf)
  if (d == null) return 'none'
  if (d < 0) return 'overdue'
  return d <= soon ? 'soon' : 'later'
}

export function dueBucketLabel(b: DueBucket, soon: number): string {
  switch (b) {
    case 'overdue':
      return 'Overdue'
    case 'soon':
      return `Due within ${soon} d`
    case 'later':
      return 'Due later'
    default:
      return 'No due date'
  }
}

/** "4 d overdue", "Due today", "Due in 3 d", "No due date". */
export function dueText(due: ISODate | null | undefined, asOf: ISODate): string {
  const d = daysToDue(due, asOf)
  if (d == null) return 'No due date'
  if (d < 0) return `${-d} d overdue`
  if (d === 0) return 'Due today'
  return `Due in ${d} d`
}

/** An item's kind of work: its own label, else its id's kind in words ("Planned no req"). */
export function kindOf(a: Pick<OpenAction, 'item'>): string {
  if (a.item.kind) return a.item.kind
  const kind = a.item.id.split(':')[1] ?? 'other'
  const words = kind.replace(/-/g, ' ')
  return `${words[0]?.toUpperCase() ?? ''}${words.slice(1)}`
}

/** The fields the items are computed from, each once (the figures' lineage). */
export function itemUses(items: readonly Pick<OpenAction, 'item'>[]): FieldRef[] {
  return [...new Set(items.flatMap((a) => a.item.uses ?? []))]
}

/** One row of the most urgent list, as the table and its export carry it. */
export interface AttentionRow {
  [key: string]: unknown
  id: string
  severity: string
  what: string
  about: string
  waitingOn: string
  from: string
  due: ISODate | null
  dueText: string
}

/** The list's rows, in the order given (most pressing first). */
export function attentionRows(items: readonly OpenAction[], asOf: ISODate): AttentionRow[] {
  return items.map((a) => ({
    id: a.id,
    severity: SEVERITY_WORD[a.item.severity],
    what: a.item.what,
    about: a.item.subject.label,
    waitingOn: a.ownerName,
    from: a.from,
    due: a.item.due ?? null,
    dueText: dueText(a.item.due, asOf),
  }))
}

export const ATTENTION_COLUMNS: readonly Column<AttentionRow>[] = [
  { key: 'severity', label: 'Severity' },
  { key: 'what', label: 'What' },
  { key: 'about', label: 'About' },
  { key: 'waitingOn', label: 'Waiting on' },
  { key: 'from', label: 'From' },
  { key: 'due', label: 'Due', format: 'date' },
  { key: 'dueText', label: 'Due in' },
]

/** One kind of work in "Where your items wait": its items by due state. */
export interface WaitRow {
  [key: string]: unknown
  kind: string
  items: number
  overdue: number
  soon: number
  later: number
  none: number
  /** The kind's items (for the drill panel; not exported). */
  list: readonly OpenAction[]
  /** For Other: how many kinds it holds. */
  folded?: number
}

/** Items by kind and due state: the six largest kinds on their own row (ties by name), the rest as Other. */
export function waitRows(
  items: readonly OpenAction[],
  ctx: Pick<AnalyticsContext, 'asOf' | 'metrics'>,
  top = WAIT_TOP,
): WaitRow[] {
  const soon = dueSoonDays(ctx.metrics)
  const groups = new Map<string, OpenAction[]>()
  for (const a of items) {
    const k = kindOf(a)
    const list = groups.get(k)
    if (list) list.push(a)
    else groups.set(k, [a])
  }
  const ranked = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const fold = ranked.length > top + 1
  const kept = fold ? ranked.slice(0, top) : ranked
  const rest = fold ? ranked.slice(top) : []
  const row = (kind: string, list: readonly OpenAction[], folded?: number): WaitRow => {
    const n = (b: DueBucket) => list.filter((a) => dueBucket(a.item.due, ctx.asOf, soon) === b).length
    return {
      kind,
      items: list.length,
      overdue: n('overdue'),
      soon: n('soon'),
      later: n('later'),
      none: n('none'),
      list,
      ...(folded ? { folded } : {}),
    }
  }
  const rows = kept.map(([k, l]) => row(k, l))
  if (rest.length)
    rows.push(
      row(
        OTHER_KIND,
        rest.flatMap(([, l]) => l),
        rest.length,
      ),
    )
  return rows
}

/** "Where your items wait"'s columns: counts by due state (the drill opens the items behind each). */
export function waitColumns(soon: number): Column<WaitRow>[] {
  return [
    { key: 'kind', label: 'Kind' },
    { key: 'items', label: 'Items', format: 'int' },
    { key: 'overdue', label: dueBucketLabel('overdue', soon), format: 'int' },
    { key: 'soon', label: dueBucketLabel('soon', soon), format: 'int' },
    { key: 'later', label: dueBucketLabel('later', soon), format: 'int' },
    { key: 'none', label: dueBucketLabel('none', soon), format: 'int' },
  ]
}
