/**
 * One severity rubric for every item (the template app's severity.ts), applied when the Action
 * center collects items, so a "Critical" means the same thing whichever view raised it:
 *
 *  - **Critical**: legal or regulatory exposure (`exposure`; HCP raises none in Phase 1), or a person
 *    blocked past the overdue limit: a requester waiting on an approval step that is more than
 *    `blockedDays` overdue.
 *  - **Watch**: overdue. A person-blocking item overdue by less than the limit reads Watch, and an
 *    overdue item is never only a Note.
 *  - **Note**: due soon, or for awareness. A person-blocking item that is not overdue yet is a Note,
 *    whatever its view's own rating.
 *
 * Items about a group or a record rather than a waiting person keep their view's rating (a sub-org
 * over target, a reconciliation exception). Pure.
 */
import { itemKindOf } from '@/access/items'
import type { Severity } from '@/components/types'
import type { ISODate } from '@/data/schema'
import type { ActionItem } from '@/views/types'
import { daysToDue } from './due'

/** Kinds where a person waits on the item: a requester waiting on an approval step's decision. */
export const BLOCKS_PERSON: readonly string[] = ['requests:approve', 'requests:waiting']

export const blocksPerson = (item: Pick<ActionItem, 'id'>): boolean => {
  const k = itemKindOf(item.id)
  return !!k && BLOCKS_PERSON.includes(k)
}

/** The rubric's severity for an item, against the as-of date and the overdue limit in days. */
export function severityOf(
  item: Pick<ActionItem, 'id' | 'severity' | 'due' | 'exposure'>,
  asOf: ISODate,
  blockedDays: number,
): Severity {
  if (item.exposure) return 'critical'
  const d = daysToDue(item.due, asOf)
  if (blocksPerson(item)) {
    if (d != null && d < -blockedDays) return 'critical'
    if (d != null && d < 0) return 'warning'
    // Not overdue yet (or no due date): due soon is a Note.
    return item.severity === 'good' ? 'good' : 'info'
  }
  if (d != null && d < 0 && (item.severity === 'info' || item.severity === 'good')) return 'warning'
  return item.severity
}
