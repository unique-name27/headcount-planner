/**
 * The Lists tab (the template app's official lists, for HCP's categories: business units,
 * departments, cost centers, locations, regions, legal entities, currencies, levels, job families,
 * reason codes, worker types and the Roles list): each list as the app uses it now (official or
 * proposed, where it came from), how many values it holds, and how many rows hold a value that is
 * not on it; then one list's values with the rows that use each. The lists in force are the ones the
 * context was built with (src/access/lists.ts), so the scopes, the Acting as picker and the quality
 * index read the same lists. Counts only. Pure.
 */
import { contextLists, listsInForce } from '@/access/lists'
import type { Column } from '@/charts/types'
import type { AnalyticsContext } from '@/data/context'
import { analyzeLists, type ListAnalysis } from '@/data/lists/analyze'
import { LIST_DEFS, listDef } from '@/data/lists/defs'
import type { EffectiveList, EffectiveLists, ListId } from '@/data/lists/types'

type Ctx = Pick<AnalyticsContext, 'all' | 'sources'>

const memo = new WeakMap<object, { lists: EffectiveLists; analysis: Record<ListId, ListAnalysis> }>()

/** The lists in force for a context, and each list against the data (memoized per context). */
export function listsOf(ctx: Ctx): { lists: EffectiveLists; analysis: Record<ListId, ListAnalysis> } {
  const hit = memo.get(ctx)
  if (hit) return hit
  const lists = contextLists(ctx) ?? listsInForce(null, ctx.all, ctx.sources)
  const out = { lists, analysis: analyzeLists(lists, ctx.all) }
  memo.set(ctx, out)
  return out
}

const SOURCE_TEXT: Readonly<Record<EffectiveList['source'], string>> = {
  saved: 'Saved by you',
  sample: 'The sample company’s',
  data: 'Proposed from your data',
  builtin: 'The app’s own',
}

/** One list in the Lists tab's overview. */
export interface ListRow {
  [key: string]: unknown
  id: ListId
  label: string
  /** "Official" or "Proposed". */
  status: string
  source: string
  /** Active values on the list. */
  values: number
  retired: number
  /** Rows across the list's fields that hold a value not on it. */
  notOnList: number
  /** The list one level up ("Business units"), or blank. */
  parent: string
  about: string
}

export function listRows(ctx: Ctx): ListRow[] {
  const { lists, analysis } = listsOf(ctx)
  return LIST_DEFS.map((def) => {
    const l = lists[def.id]
    return {
      id: def.id,
      label: def.label,
      status: l.status === 'official' ? 'Official' : 'Proposed',
      source: SOURCE_TEXT[l.source],
      values: l.values.filter((v) => !v.retired).length,
      retired: l.values.filter((v) => v.retired).length,
      notOnList: analysis[def.id]?.notOnListRows ?? 0,
      parent: def.parent ? listDef(def.parent).label : '',
      about: def.about,
    }
  })
}

export const LIST_COLUMNS: readonly Column<ListRow>[] = [
  { key: 'label', label: 'List' },
  { key: 'status', label: 'Status' },
  { key: 'source', label: 'Source' },
  { key: 'values', label: 'Values', format: 'int' },
  { key: 'retired', label: 'Retired', format: 'int' },
  { key: 'notOnList', label: 'Rows not on the list', format: 'int' },
  { key: 'parent', label: 'Parent list' },
]

/** One value of a list, with the rows that use it. */
export interface ListValueRow {
  [key: string]: unknown
  value: string
  parent: string
  rows: number
  status: string
  replacedBy: string
  /** The attributes the app reads (a unit's HR business partner, a level's leader marking), as text. */
  attrs: string
}

export function listValueRows(ctx: Ctx, id: ListId): ListValueRow[] {
  const { lists, analysis } = listsOf(ctx)
  const l = lists[id]
  const uses = analysis[id]?.uses
  return l.values.map((v) => ({
    value: v.value,
    parent: v.parent ?? '',
    rows: uses?.get(v.value)?.total ?? 0,
    status: v.retired ? 'Retired' : 'Active',
    replacedBy: v.replacedBy ?? '',
    attrs: Object.entries(v.attrs ?? {})
      .filter(([, x]) => x != null && x !== '')
      .map(([k, x]) => `${l.def.attrs.find((a) => a.key === k)?.label ?? k}: ${x}`)
      .join('; '),
  }))
}

export const LIST_VALUE_COLUMNS: readonly Column<ListValueRow>[] = [
  { key: 'value', label: 'Value' },
  { key: 'parent', label: 'Parent' },
  { key: 'rows', label: 'Rows', format: 'int' },
  { key: 'status', label: 'Status' },
  { key: 'replacedBy', label: 'Replaced by' },
  { key: 'attrs', label: 'Attributes' },
]

/** Values in the data that are not on a list, by field, most rows first. */
export interface NotOnListRow {
  [key: string]: unknown
  value: string
  field: string
  rows: number
}

export function notOnListRows(ctx: Ctx, id: ListId): NotOnListRow[] {
  const a = listsOf(ctx).analysis[id]
  return (a?.notOnList ?? []).map((n) => ({ value: n.value, field: n.ref, rows: n.rows.length }))
}
