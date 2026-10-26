/**
 * Options and validation for the filter row (the template app's filterOptions.ts, for positions).
 * Pure. Every count is Filled heads on the as-of date: Employee assignments active that day, placed
 * by the seat they hold (its row in the position tree), or by their own HRIS fields for people who
 * hold no position (docs/PLAN.md 9.2; the same placement `scopeDatasets` uses). The leader filter is
 * a position ID; its options are seats with 3 or more Filled heads in their tree.
 */
import type { AccessContext } from '@/access/context'
import { FILTER_DIMS_OF, type Mode } from '@/access/modes'
import { clampFilters } from '@/access/scopes/clamp'
import type { ScopeLock } from '@/access/scopes/types'
import { type FilterControl, S } from '@/access/surfaces'
import { type Datasets, type ISODate, LEVEL_LABELS, type Level, levelIndex } from '@/data/schema'
import {
  DEFAULT_FILTERS,
  type FilterDimension,
  type Filters,
  isActiveOn,
  isExcluded,
  LIST_DIMENSIONS,
  type ListDimension,
  type OrgValues,
  type PositionIndex,
  positionValues,
  scopeTests,
  workerValues,
} from '@/data/scope'
import { formatDate, formatMonthShort, isCalendarDate, isValidDate } from '@/lib/dates'

/** The list filters, in filter-bar order. */
export const DIMENSIONS: readonly ListDimension[] = LIST_DIMENSIONS

export interface DimensionOption {
  value: string
  label: string
  /** Filled heads with this value on the as-of date (within the rest of the row, when given). */
  count: number
  /** Can't be picked right now (excluding a group too small to leave out, `tooFewToLeaveOut`). */
  disabled?: boolean
}

export interface LeaderOption {
  /** The leader's position ID. */
  id: string
  /** The person in the seat, else the seat's title or ID. */
  name: string
  /** The seat's title and ID ("Director, Design Verification · P-1042"). */
  title: string
  /** Filled heads in the seat's tree, the seat included (the scope size once picked). */
  size: number
  disabled?: boolean
}

/**
 * Exclude mode: whether leaving out a choice that removes `count` Filled heads from the scope breaks
 * the anonymity rule for exclusions (docs/PLAN.md 9.2: an exclusion that removes 1 to 4 Filled heads
 * cannot be picked). An option's count in Exclude mode is exactly who it removes: the other filters
 * apply, and no head has two values of one dimension.
 */
export const tooFewToLeaveOut = (count: number, min: number): boolean => count > 0 && count < min

/** Display label for a dimension value (levels get their long label, "P4 Senior"). */
export function dimensionValueLabel(key: ListDimension, value: string): string {
  return key === 'level' ? (LEVEL_LABELS[value as Level] ?? value) : value
}

/* ───────────── the heads counted ───────────── */

/** One Filled head on the as-of date. */
export interface FilledHead {
  employeeId: string
  /** The seat they hold, or null for a person not in the plan. */
  positionId: string | null
  /** The values the filters read: the seat's, else the person's own. */
  values: OrgValues
}

const headsMemo = new WeakMap<Datasets['workers'], WeakMap<PositionIndex, FilledHead[]>>()

/** Every Filled head on the index's date (one per person: the latest assignment active that day). */
export function filledHeads(all: Pick<Datasets, 'workers'>, index: PositionIndex): FilledHead[] {
  let byIndex = headsMemo.get(all.workers)
  if (!byIndex) {
    byIndex = new WeakMap()
    headsMemo.set(all.workers, byIndex)
  }
  const hit = byIndex.get(index)
  if (hit) return hit
  const best = new Map<string, { row: Datasets['workers'][number]; start: ISODate }>()
  for (const w of all.workers) {
    if (!w?.employeeId || w.workerType !== 'Employee') continue
    const start = w.assignmentStart || w.hireDate || ''
    if (!start || !isActiveOn({ start, end: w.assignmentEnd || w.terminationDate || null }, index.asOf))
      continue
    const cur = best.get(w.employeeId)
    if (!cur || start >= cur.start) best.set(w.employeeId, { row: w, start })
  }
  const out: FilledHead[] = []
  for (const { row } of best.values()) {
    const seat = row.positionId ? index.byId.get(row.positionId) : undefined
    out.push({
      employeeId: row.employeeId,
      positionId: seat ? seat.positionId : null,
      values: seat ? positionValues(seat) : workerValues(row),
    })
  }
  byIndex.set(index, out)
  return out
}

/** Who a set of filters lets through: a head in a seat by the seat, a person not in the plan by their own fields. */
export function headMatcher(
  filters: Filters,
  all: Pick<Datasets, 'positions'>,
  index: PositionIndex,
): (h: FilledHead) => boolean {
  const t = scopeTests(all.positions, filters, index)
  return (h) => {
    if (h.positionId) {
      const ok = t.positionOk(h.positionId)
      if (ok !== undefined) return ok
    }
    return t.leaderOk(false) && t.valuesOk(h.values)
  }
}

/**
 * For each dimension, who the rest of the filter row lets through: every other dimension's choice,
 * leaving out the dimension's own (so its options can still widen it).
 */
export function otherFilters(filters: Filters, key: FilterDimension): Filters {
  return key === 'leaderId' ? { ...filters, leaderId: null } : { ...filters, [key]: [] }
}

/**
 * Distinct values of one dimension with Filled head counts. Values that are selected but no longer
 * present (after an upload) are kept with 0 so they can be cleared. Levels follow the ladder;
 * everything else is alphabetical. With `within` (the rest of the row), each count is who would be
 * in scope after picking the value; values with nobody left follow the others.
 */
export function dimensionOptions(
  heads: readonly FilledHead[],
  key: ListDimension,
  selected: readonly string[] = [],
  within?: (h: FilledHead) => boolean,
): DimensionOption[] {
  const counts = new Map<string, number>()
  for (const h of heads) {
    const v = h.values[key]
    if (!v) continue
    counts.set(v, (counts.get(v) ?? 0) + (!within || within(h) ? 1 : 0))
  }
  for (const v of selected) if (!counts.has(v)) counts.set(v, 0)
  const out = [...counts].map(([value, count]) => ({ value, label: dimensionValueLabel(key, value), count }))
  const empty = (o: DimensionOption) => (within && o.count === 0 ? 1 : 0)
  if (key === 'level') {
    const rank = (v: string) => {
      const i = levelIndex(v)
      return i < 0 ? Number.MAX_SAFE_INTEGER : i
    }
    return out.sort(
      (a, b) => empty(a) - empty(b) || rank(a.value) - rank(b.value) || a.label.localeCompare(b.label),
    )
  }
  return out.sort((a, b) => empty(a) - empty(b) || a.label.localeCompare(b.label))
}

/**
 * Filled heads in each seat's tree (the seat's own holder included), walking each head up its
 * seat's managers once; cycle-safe. Only heads `within` lets through count, when given.
 */
export function treeSizes(
  index: PositionIndex,
  heads: readonly FilledHead[],
  within?: (h: FilledHead) => boolean,
): Map<string, number> {
  const sizes = new Map<string, number>()
  const seen = new Set<string>()
  for (const h of heads) {
    if (!h.positionId || (within && !within(h))) continue
    seen.clear()
    let cur: string | null | undefined = h.positionId
    while (cur && !seen.has(cur)) {
      seen.add(cur)
      sizes.set(cur, (sizes.get(cur) ?? 0) + 1)
      const row = index.byId.get(cur)
      cur = row?.managerPositionId && row.managerPositionId !== cur ? row.managerPositionId : null
    }
  }
  return sizes
}

/**
 * Seats with `minHeads` or more Filled heads below them, largest tree first. `inScope` keeps the
 * seats a mode's scope holds (a tree's positions, a unit's); `within` (the rest of the row) sizes
 * each by who would be in scope after picking it.
 */
export function leaderOptions(args: {
  index: PositionIndex
  heads: readonly FilledHead[]
  names: ReadonlyMap<string, string>
  minHeads?: number
  inScope?: (positionId: string) => boolean
  within?: (h: FilledHead) => boolean
}): LeaderOption[] {
  const { index, heads, names, minHeads = 3, inScope, within } = args
  const all = treeSizes(index, heads)
  const sized = within ? treeSizes(index, heads, within) : all
  const holders = new Set(heads.map((h) => h.positionId).filter((x): x is string => !!x))
  const out: LeaderOption[] = []
  for (const [id, size] of all) {
    const below = size - (holders.has(id) ? 1 : 0)
    if (below < minHeads || (inScope && !inScope(id))) continue
    const row = index.byId.get(id)
    const name = names.get(id)
    const title = row?.title ?? ''
    out.push({
      id,
      name: name ?? (title || id),
      title: [name ? title : '', id].filter(Boolean).join(' · '),
      size: sized.get(id) ?? 0,
    })
  }
  return out.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name))
}

/** The seats from the top of the tree down to the leader's seat (inclusive); cycle-safe. */
export function leaderChain(index: PositionIndex, positionId: string): string[] {
  const chain: string[] = []
  const seen = new Set<string>()
  let cur: string | null | undefined = positionId
  while (cur && !seen.has(cur) && index.byId.has(cur)) {
    seen.add(cur)
    chain.push(cur)
    const m: string | null | undefined = index.byId.get(cur)?.managerPositionId
    cur = m && m !== cur ? m : null
  }
  return chain.reverse()
}

/**
 * The leader seats a scope's leader filter can name, as a test (a tree's positions; a unit's
 * positions and the leader seats above it whose tree holds part of it); none for a mode with no scope.
 */
export function scopeLeaders(scope: ScopeLock | null): ((positionId: string) => boolean) | undefined {
  if (!scope) return undefined
  const ids = scope.positionIds
  if (scope.kind === 'tree') return (id) => ids.has(id)
  const above = scope.leaderPositionIds
  return (id) => ids.has(id) || above.has(id)
}

/** The heads a scope holds (those in its positions), as a test; none for a mode with no scope. */
export function scopeHeads(scope: ScopeLock | null): ((h: FilledHead) => boolean) | undefined {
  if (!scope) return undefined
  const ids = scope.positionIds
  return (h) => !!h.positionId && ids.has(h.positionId)
}

/* ───────────── what the row offers in a mode ───────────── */

/**
 * Whether a list or the leader filter offers its Include / Exclude switch in a mode: where the
 * mode's clamp keeps an exclusion (`clampFilters`, docs/PLAN.md 8.2). Finance filters include
 * only; a tree mode pins the leader inside its tree (include only).
 */
export function offersExclude(mode: Mode, key: FilterDimension, scope: ScopeLock | null): boolean {
  if (!FILTER_DIMS_OF[mode].includes(key)) return false
  const probe: Filters =
    key === 'leaderId'
      ? { ...DEFAULT_FILTERS, leaderId: 'probe', modes: { leaderId: 'exclude' } }
      : { ...DEFAULT_FILTERS, [key]: ['probe'], modes: { [key]: 'exclude' } }
  return isExcluded(clampFilters(probe, scope, mode), key)
}

/** Which parts of the filter row a mode shows: its `filter:*` decisions, read in one place. */
export interface FilterRowParts {
  views: boolean
  period: boolean
  leader: boolean
  /** The leader chips' chain of the seats above (widening). */
  chain: boolean
  /** The list filters the row offers, in row order. */
  dims: readonly ListDimension[]
  /** Include / Exclude switches (a dimension's own also needs `offersExclude`). */
  exclude: boolean
  inScope: boolean
  chips: boolean
  reset: boolean
  /** The data standard: a control, the saved one read only, or nothing. */
  standard: 'shown' | 'read-only' | 'hidden'
}

/**
 * The filter row for a mode (docs/PLAN.md 8.1 `FILTER_DIMS_OF` and 8.3): each control follows its
 * `filter:*` decision and the list filters are the mode's dimensions. Pure.
 */
export function filterRowParts(access: Pick<AccessContext, 'mode' | 'decide'>): FilterRowParts {
  const can = (c: FilterControl) => access.decide(S.filter(c)).access !== 'hidden'
  const dims = FILTER_DIMS_OF[access.mode]
  const standard = access.decide(S.filter('standard')).access
  return {
    views: can('saved-views'),
    period: can('period'),
    leader: dims.includes('leaderId') && can('leaderId'),
    chain: can('chain'),
    dims: DIMENSIONS.filter((k) => dims.includes(k) && can(k)),
    exclude: can('exclude'),
    inScope: can('in-scope'),
    chips: can('chips'),
    reset: can('reset'),
    standard: standard === 'hidden' ? 'hidden' : standard === 'limited' ? 'read-only' : 'shown',
  }
}

/* ───────────── period ───────────── */

/** "Apr '26 – Mar '27", the compact hint next to each period preset. */
export const shortRange = (start: ISODate, end: ISODate): string =>
  `${formatMonthShort(start, true)} – ${formatMonthShort(end, true)}`

/**
 * Validation message for a custom range, or null when it can be applied. With `asOf`, the range may
 * not end after the reporting date: there is no actual data past it.
 */
export function customRangeError(start: string, end: string, asOf?: ISODate): string | null {
  if (!isCalendarDate(start) || !isCalendarDate(end)) return 'Enter both dates.'
  if (start > end) return 'The start date must be on or before the end date.'
  if (asOf && isValidDate(asOf) && end > asOf)
    return `The end date must be on or before the reporting date, ${formatDate(asOf)}.`
  return null
}
