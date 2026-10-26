/**
 * Key figures on a role home (docs/PLAN.md 9.3; the template app's `tile()`): the producing views'
 * own tiles, picked by metric id (a strip has at most one tile per metric id), each re-linked to
 * open the tab that explains it unless it carries its own link. A home never computes a number. Pure.
 */
import { VIEW_TABS } from '@/access/ids'
import type { Kpi, ViewLink } from '@/components/types'
import { type RouteView, VIEW_LABEL, type ViewKey } from '@/data/schema'

/** "Plan, Openings": where a re-linked tile opens, for its accessible name. */
export function linkLabel(view: ViewKey, tab: string): string {
  const t = VIEW_TABS[view].find((x) => x.key === tab)
  return t ? `${VIEW_LABEL[view]}, ${t.label}` : VIEW_LABEL[view]
}

/**
 * The tile with this metric id from a producing tab's strip, linked to `to` (a view's tab) unless it
 * carries its own link; none when the strip has no such tile (`tile()` returns nothing for a missing
 * id, so a home's strip is short by one and its test fails).
 */
export function tile(
  list: readonly Kpi[] | null | undefined,
  metricId: string,
  to?: { view: RouteView; tab?: string; label: string },
): Kpi[] {
  const k = list?.find((x) => x.metricId === metricId)
  if (!k) return []
  if (k.link || !to) return [k]
  const { tab, ...rest } = k
  const link: ViewLink = { view: to.view, tab: to.tab ?? tab ?? '', label: to.label }
  return [{ ...rest, link }]
}

/** A tile waiting on something computed later: same place, a quiet note. */
export const pendingTile = (id: string, metricId: string, label: string, note: string): Kpi => ({
  id,
  metricId,
  label,
  value: null,
  format: 'int',
  note,
})
