/**
 * The one filter clamp (docs/PLAN.md 8.2), the template app's `clampFilters` over HCP's scopes:
 *
 * - `tree` (Manager, Leader): pins the leader filter inside the tree, include only (the root's
 *   whole tree when it is outside);
 * - `unit` (HRBP): pins the business unit and drops other units' departments and leaders;
 * - both: drop a list filter that no position of the scope passes (a unit, site or level another
 *   mode or a link left behind would otherwise empty the page);
 * - no scope, Finance: keeps unit, cost center, legal entity, country and currency in include mode
 *   and clears the rest (leader, department, location, level and every exclude);
 * - no scope, HR admin (and a Leader with company scope): untouched. With the switch off, cost
 *   under HR admin's filters follows src/cost/fit.ts (7.5), not the clamp.
 *
 * Version and comparison are pickers, not filters, and are never clamped (src/data/urlScope.ts
 * `checkPicks` resets unknown or cross-year values). The period is never touched.
 *
 * Invariants (`scopes/clamp.test.ts`, a 500-combination sweep): pure; idempotent; the SAME object
 * when nothing changes (the store's filter guard and the scope check rely on it to avoid loops).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the access builder filled the bodies.
 */
import type { Mode } from '@/data/schema'
import { type Filters, isExcluded, LIST_DIMENSIONS, type ListDimension, withMode } from '@/data/scope'
import { financeLeftOut, leaderLeftOut, outsideLeftOut, unitsLeftOut } from '../copy'
import { NOBODY } from './nobody'
import type { ScopeLock, ScopeValues, TreeScope, UnitScope } from './types'

export { FILTER_DIMS_OF } from '../modes'

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

/** The leader filter keeps to the tree: the root seat or a seat inside it, in include mode. */
export function leaderInTree(filters: Pick<Filters, 'leaderId' | 'modes'>, s: TreeScope): boolean {
  if (!filters.leaderId || filters.modes?.leaderId === 'exclude') return false
  return s.rootPositionIds.has(filters.leaderId) || s.positionIds.has(filters.leaderId)
}

/** The seat a tree pins the leader filter to: its first root seat (`NOBODY` for an empty tree). */
export const treePin = (s: TreeScope): string => s.rootPositionIds.values().next().value ?? NOBODY

/** Whether some position of the scope passes one list filter (include: has a value; exclude: has another, or none). */
function passesSome(f: Filters, d: ListDimension, values: ScopeValues): boolean {
  const picked = new Set(f[d])
  const out = isExcluded(f, d)
  for (const v of values[d]) if (out ? v == null || !picked.has(v) : v != null && picked.has(v)) return true
  return false
}

/**
 * The list filters that leave out every position of the scope, dropped (back to include): a filter
 * another mode, a link or a restored address left behind would otherwise show an empty page. A tree
 * or unit with no positions (nobody picked) keeps its filters.
 */
function dropEmptying(f: Filters, values: ScopeValues | undefined): Filters {
  if (!values) return f
  let out = f
  for (const d of LIST_DIMENSIONS) {
    if (!out[d].length || passesSome(out, d, values)) continue
    out = { ...out, [d]: [], modes: withMode(out.modes, d, 'include') }
  }
  return out
}

function clampTree(f: Filters, s: TreeScope): Filters {
  const pin = treePin(s)
  const inside = leaderInTree(f, s) || (f.leaderId === pin && !isExcluded(f, 'leaderId'))
  const pinned = inside ? f : { ...f, leaderId: pin, modes: withMode(f.modes, 'leaderId', 'include') }
  return dropEmptying(pinned, s.values)
}

function clampUnit(f: Filters, s: UnitScope): Filters {
  let out = f
  if (!(sameList(f.businessUnit, [s.unit]) && !isExcluded(f, 'businessUnit')))
    out = { ...out, businessUnit: [s.unit], modes: withMode(out.modes, 'businessUnit', 'include') }
  if (f.department.some((d) => s.otherDepartments.has(d))) {
    const department = f.department.filter((d) => !s.otherDepartments.has(d))
    out = {
      ...out,
      department,
      modes: department.length ? out.modes : withMode(out.modes, 'department', 'include'),
    }
  }
  if (f.leaderId && !s.leaderPositionIds.has(f.leaderId))
    out = { ...out, leaderId: null, modes: withMode(out.modes, 'leaderId', 'include') }
  return dropEmptying(out, s.values)
}

/** The dimensions Finance keeps, include only (8.1 `FILTER_DIMS_OF`). */
const FINANCE_KEEPS: readonly ListDimension[] = [
  'businessUnit',
  'costCenter',
  'legalEntity',
  'country',
  'currency',
]

function clampFinance(f: Filters): Filters {
  const untouched =
    !f.leaderId &&
    !f.department.length &&
    !f.location.length &&
    !f.level.length &&
    !Object.keys(f.modes ?? {}).length
  if (untouched) return f
  const out: Filters = { ...f, leaderId: null, department: [], location: [], level: [], modes: {} }
  // An excluded list reads as no filter: Finance's filters include only.
  for (const d of FINANCE_KEEPS) out[d] = isExcluded(f, d) ? [] : f[d]
  return out
}

/** The filters inside the mode's scope (see the module comment); the same object when unchanged. */
export function clampFilters(filters: Filters, scope: ScopeLock | null | undefined, mode: Mode): Filters {
  if (scope) return scope.kind === 'tree' ? clampTree(filters, scope) : clampUnit(filters, scope)
  if (mode === 'finance') return clampFinance(filters)
  return filters
}

/** The clamp can change filters in this mode and scope (a tree, a unit, or Finance). */
export function clamps(scope: ScopeLock | null | undefined, mode: Mode): boolean {
  return !!scope || mode === 'finance'
}

/** Some list filter was asked for and dropped by the clamp. */
const listsDropped = (asked: Filters, kept: Filters): boolean =>
  LIST_DIMENSIONS.some((d) => asked[d].length > 0 && !kept[d].length)

/**
 * The toast when a link, saved view or filter change was clamped, or null when nothing was left out:
 * "HRBP mode shows Silicon Engineering, so the link's other business units were left out.",
 * "Finance mode filters by unit, cost center, legal entity, country and currency, so the link's other
 * filters were left out."
 */
export function clampReason(
  mode: Mode,
  scope: ScopeLock | null | undefined,
  asked: Filters,
  kept: Filters,
  from: 'link' | 'view',
): string | null {
  if (asked === kept) return null
  if (scope?.kind === 'tree') {
    if (!scope.label) return null
    const leaderOut =
      !!asked.leaderId && !(asked.leaderId === kept.leaderId && !isExcluded(asked, 'leaderId'))
    if (leaderOut) return leaderLeftOut(mode, scope.label, from)
    return listsDropped(asked, kept) ? outsideLeftOut(mode, scope.label, from) : null
  }
  if (scope?.kind === 'unit') {
    if (!scope.label) return null
    const otherUnits = asked.businessUnit.some((u) => u !== scope.unit) || isExcluded(asked, 'businessUnit')
    if (otherUnits) return unitsLeftOut(mode, scope.label, from)
    if (
      !sameList(asked.department, kept.department) ||
      asked.leaderId !== kept.leaderId ||
      listsDropped(asked, kept)
    )
      return outsideLeftOut(mode, scope.label, from)
    return null
  }
  if (!scope && mode === 'finance') return financeLeftOut(from)
  return null
}
