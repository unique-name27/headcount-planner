/**
 * The small-exclusion rule (docs/PLAN.md 9.2): an exclusion that removes 1 to 4 Filled heads cannot
 * be picked, because a scope compared with the same scope without the exclusion would single that
 * group out. Heads are counted as the app scopes them (src/data/scope.ts `scopeDatasets`): every
 * Employee active on the as-of date, placed by the seat they hold, or by their own HRIS fields when
 * they hold none (not in plan). The records panel never offers a "Filter to" or "Leave out" that
 * would add such an exclusion, nor a "Leave out" that removes 1 to 4 heads. Pure.
 *
 * The minimum is the anonymity rule in force (`minGroupOf(ctx.metrics)`), never a constant.
 */
import { DATASET_KEYS, type Datasets, type ISODate, type WorkerRow } from '@/data/schema'
import {
  dimensionSet,
  FILTER_DIMENSIONS,
  type FilterDimension,
  type Filters,
  isActiveOn,
  isExcluded,
  type PositionIndex,
  scopeDatasets,
} from '@/data/scope'

const activeCache = new WeakMap<readonly WorkerRow[], Map<ISODate, ReadonlySet<WorkerRow>>>()

/** The worker rows of Employees active on the date (one row per active assignment). */
function activeRows(workers: readonly WorkerRow[], asOf: ISODate): ReadonlySet<WorkerRow> {
  let byDate = activeCache.get(workers)
  if (!byDate) {
    byDate = new Map()
    activeCache.set(workers, byDate)
  }
  let hit = byDate.get(asOf)
  if (!hit) {
    const out = new Set<WorkerRow>()
    for (const w of workers) {
      if (w.workerType !== 'Employee') continue
      const start = w.assignmentStart || w.hireDate
      const end = w.assignmentEnd || w.terminationDate || null
      if (start && isActiveOn({ start, end }, asOf)) out.add(w)
    }
    hit = out
    byDate.set(asOf, hit)
  }
  return hit
}

/** Distinct Employees active on the as-of date that a scope keeps: its Filled heads and not-in-plan people. */
export function headsIn(all: Datasets, filters: Filters, index: PositionIndex): number {
  const active = activeRows(all.workers, index.asOf)
  const people = new Set<string>()
  for (const w of scopeDatasets(all, filters, index).workers) if (active.has(w)) people.add(w.employeeId)
  return people.size
}

/** The scope without one excluded value (the leader, or one value of a list dimension). */
export const withoutValue = (f: Filters, d: FilterDimension, value: string): Filters =>
  d === 'leaderId' ? { ...f, leaderId: null } : { ...f, [d]: f[d].filter((v) => v !== value) }

/**
 * Each excluded value that removes between 1 and `min` − 1 of the heads the scope would have
 * without it, in filter-row order (empty when there are none). Checked value by value: leaving out
 * a large value together with a small one passes a check of the whole dimension, yet the scope then
 * differs by the small one from the scope that leaves out the large one alone.
 */
export function smallExcludedValues(
  all: Datasets,
  filters: Filters,
  index: PositionIndex,
  min: number,
): { dim: FilterDimension; value: string }[] {
  const out: { dim: FilterDimension; value: string }[] = []
  let scoped: number | null = null
  for (const d of FILTER_DIMENSIONS) {
    if (!isExcluded(filters, d) || !dimensionSet(filters, d)) continue
    const values = d === 'leaderId' ? [filters.leaderId as string] : filters[d]
    for (const value of values) {
      scoped ??= headsIn(all, filters, index)
      const removed = headsIn(all, withoutValue(filters, d, value), index) - scoped
      if (removed > 0 && removed < min) out.push({ dim: d, value })
    }
  }
  return out
}

/** Every dataset keeps exactly the records it keeps under `a` (the scopes narrow, so equal counts mean equal rows). */
export function sameRecords(all: Datasets, a: Filters, b: Filters, index: PositionIndex): boolean {
  const x = scopeDatasets(all, a, index)
  const y = scopeDatasets(all, b, index)
  return DATASET_KEYS.every((k) => x[k].length === y[k].length)
}
