/**
 * The Action center's own filters (on top of the filter row; the template app's filters.ts): owner
 * group, severity, due, the view an item comes from, and a text search. Pure.
 */
import type { Severity } from '@/components/types'
import type { ISODate, ViewKey } from '@/data/schema'
import type { ActionOwnerRole } from '@/views/types'
import type { OpenAction } from './collect'
import { type DueBucket, dueBucket } from './due'

export interface ActionFilters {
  roles: readonly ActionOwnerRole[]
  severities: readonly Severity[]
  due: readonly DueBucket[]
  views: readonly ViewKey[]
  query: string
}

export const NO_FILTERS: ActionFilters = {
  roles: [],
  severities: [],
  due: [],
  views: [],
  query: '',
}

/** The words an item can be found by: owner, subject, what, the view it comes from. */
const haystack = (a: OpenAction): string =>
  `${a.ownerName} ${a.roleLabel} ${a.item.subject.label} ${a.item.what} ${a.from}`.toLowerCase()

export function matchesFilters(a: OpenAction, f: ActionFilters, asOf: ISODate, soonDays: number): boolean {
  if (f.roles.length && !f.roles.includes(a.role)) return false
  if (f.severities.length && !f.severities.includes(a.item.severity)) return false
  if (f.views.length && !f.views.includes(a.item.view)) return false
  if (f.due.length && !f.due.includes(dueBucket(a.item.due, asOf, soonDays))) return false
  const q = f.query.trim().toLowerCase()
  if (q) {
    const text = haystack(a)
    if (!q.split(/\s+/).every((w) => text.includes(w))) return false
  }
  return true
}

export function filterActions(
  items: readonly OpenAction[],
  f: ActionFilters,
  asOf: ISODate,
  soonDays: number,
): OpenAction[] {
  return items.filter((a) => matchesFilters(a, f, asOf, soonDays))
}

/** Any filter is set. */
export const isFiltering = (f: ActionFilters): boolean =>
  f.roles.length > 0 ||
  f.severities.length > 0 ||
  f.due.length > 0 ||
  f.views.length > 0 ||
  f.query.trim() !== ''
