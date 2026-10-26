/**
 * What kind of work an item is ("Request to decide", "Opening past target start"), for "What is
 * waiting, by kind" (the template app's kind.ts with HCP's kinds, docs/PLAN.md 9.6). A view may set
 * `ActionItem.kind`; otherwise the kind comes from the item id ('<view>:<kind>:<record>'), and an id
 * this file does not know falls back to the view's label, so a new kind of item still shows (under its
 * view) until it is named here. Labels are category level and name no person. Pure.
 */
import type { ItemKind } from '@/access/ids'
import type { ActionItem } from '@/views/types'

/** Kind labels by the id's view and kind ('requests:approve'), one per Action center kind. */
export const KIND_LABEL: Readonly<Record<ItemKind, string>> = {
  'requests:approve': 'Request to decide',
  'requests:waiting': 'Request waiting on a step',
  'requests:sent-back': 'Request sent back',
  'requests:not-submitted': 'Ranked asks not sent',
  'requests:backfill-new-position': 'Backfill on a new position',
  'requests:backfill-no-exit': 'Backfill with no exit',
  'requests:trade-credit-lapse': 'Trade credit about to lapse',
  'plan:planned-no-req': 'Planned seat with no req',
  'plan:past-start': 'Opening past target start',
  'plan:frozen-opening': 'Opening under a freeze',
  'plan:req-on-eliminated': 'Req on an ended seat',
  'targets:suborg-over': 'Sub-org over target',
  'finance:reconcile': 'Reconciliation exception',
  'finance:envelope-exception': 'Envelope exception',
  'finance:cycle-due': 'Cycle stage due',
}

/** The id's view and kind ('requests:approve'), or null for an id without them. */
export function idKind(id: string): string | null {
  const [view, kind] = id.split(':')
  return view && kind ? `${view}:${kind}` : null
}

/** The label the id names, or null when this file does not know it. */
export function kindFromId(id: string): string | null {
  const k = idKind(id)
  if (!k) return null
  return (KIND_LABEL as Readonly<Record<string, string>>)[k] ?? null
}

/** What kind of work an item is: the view's own label, the one its id names, else the view label. */
export function kindOf(item: Pick<ActionItem, 'id' | 'kind'>, viewLabel: string): string {
  return item.kind?.trim() || kindFromId(item.id) || viewLabel
}
