/**
 * The records guard for every scope (docs/PLAN.md 8.2 and 9.5): the records panel, the position card
 * and a finding's positions keep to the mode's scope. Pure.
 *
 * - `tree`: positions by `positionIds` (strictly below the roots, so a Manager's own seat and
 *   everything above it is never listed); plan lines, reqs, assignments, adjustments and exceptions
 *   by their position; workers by `personIds`; requests by the positions they touch (none of them a
 *   root seat), then 8.4's person-level rules (src/access/visibility.ts); targets and freezes by the
 *   leader seat they are keyed to, inside the tree or at its root, and a unit's own target row when a
 *   root seat is the unit's one top seat (the tree is the whole unit, as Targets and Forecast read it:
 *   src/views/targets/engine/base.ts `headsItsUnit`).
 * - `unit`: the same identities against the unit (`positionIds`, `personIds`), and requests, targets
 *   and freezes by their own business unit.
 * - `costGroups` rows are computed inside the scope by the guard and kept; `actionItems` and
 *   `actionOwners` are the items the mode lists, kept as listed; assumptions and versions are the
 *   company's and kept; audit rows about a position keep to the scope (the rest are shaped by
 *   `auditView`).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md); the access builder filled the bodies. `rowsInScope`
 * takes any spec with a `kind` and `rows` (the UX layer's `DrillSpec` fits), so this module does not
 * import src/drill.
 */
import type { AnalyticsContext } from '@/data/context'
import { splitIds } from '@/data/schema'
import type { PositionIndex } from '@/data/scope'
import type { AccessContext } from '../context'
import type { DrillKind } from '../ids'
import type { ScopeLock, TreeScope } from './types'

/** What the guard reads from an access context: its scope. */
export type ScopeHolder = Partial<Pick<AccessContext, 'scope'>> | null | undefined

/** What the records guard reads from the analytics context. */
export type ScopeCtx = Pick<AnalyticsContext, 'all' | 'positionIndex'> & { access?: ScopeHolder }

/** The scope a context holds, or null. */
export const scopeOfAccess = (access: ScopeHolder): ScopeLock | null => access?.scope ?? null

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : splitIds(str(v))

/**
 * The seats a request record touches and the org seats it sits under, whatever its shape: a
 * `requests` row, a plan-state request (with `trade` and `transfer`) or a viewer's record.
 */
export function requestSeats(r: Record<string, unknown>): { touched: string[]; orgs: string[] } {
  const trade = (r.trade ?? null) as Record<string, unknown> | null
  const transfer = (r.transfer ?? null) as Record<string, unknown> | null
  const touched = [
    str(r.positionId),
    ...ids(r.givePositionIds),
    ...ids(trade?.givePositionIds),
    str(r.fromPositionId),
    str(transfer?.fromPositionId),
    str(r.toPositionId),
    str(transfer?.toPositionId),
  ].filter((x): x is string => !!x)
  const orgs = [
    str(r.managerPositionId),
    str(r.giveOrgPositionId),
    str(trade?.giveOrgPositionId),
    str(r.toManagerPositionId),
    str(transfer?.toManagerPositionId),
  ].filter((x): x is string => !!x)
  return { touched: [...new Set(touched)], orgs: [...new Set(orgs)] }
}

/** A request is in a tree: it touches a seat inside it, or sits under the tree, and touches no root seat. */
function requestInTree(r: Record<string, unknown>, s: TreeScope): boolean {
  const { touched, orgs } = requestSeats(r)
  if (touched.some((id) => s.rootPositionIds.has(id))) return false
  return (
    touched.some((id) => s.positionIds.has(id)) ||
    orgs.some((id) => s.positionIds.has(id) || s.rootPositionIds.has(id))
  )
}

const topSeatsMemo = new WeakMap<PositionIndex, Map<string, string[]>>()

/** Each unit's top seats on the as-of date: live seats whose manager seat is in another unit, or none. */
function unitTopSeats(index: PositionIndex): Map<string, string[]> {
  let hit = topSeatsMemo.get(index)
  if (!hit) {
    hit = new Map()
    for (const [id, row] of index.byId) {
      if (row.status === 'Eliminated') continue
      const up = row.managerPositionId ? index.byId.get(row.managerPositionId) : undefined
      if (up && up.businessUnit === row.businessUnit) continue
      const list = hit.get(row.businessUnit)
      if (list) list.push(id)
      else hit.set(row.businessUnit, [id])
    }
    topSeatsMemo.set(index, hit)
  }
  return hit
}

/** A unit-keyed target row (no leader, cost center or department), kept when a root seat heads the unit. */
function unitTargetInTree(
  r: Record<string, unknown>,
  s: TreeScope,
  index: PositionIndex | undefined,
): boolean {
  if (!index || str(r.leaderPositionId) || str(r.costCenter) || str(r.department)) return false
  const unit = str(r.businessUnit)
  const tops = unit ? unitTopSeats(index).get(unit) : undefined
  return tops?.length === 1 && s.rootPositionIds.has(tops[0])
}

function inTree(kind: DrillKind, r: Record<string, unknown>, s: TreeScope, index?: PositionIndex): boolean {
  const seat = (v: unknown) => {
    const id = str(v)
    return !!id && s.positionIds.has(id)
  }
  switch (kind) {
    case 'positions':
    case 'planLines':
    case 'reqs':
    case 'adjustments':
      return seat(r.positionId)
    case 'assignments':
    case 'exceptions':
      return seat(r.positionId) || (!!str(r.employeeId) && s.personIds.has(r.employeeId as string))
    case 'workers':
      return (!!str(r.employeeId) && s.personIds.has(r.employeeId as string)) || seat(r.positionId)
    case 'requests':
      return requestInTree(r, s)
    case 'targets':
    case 'freezes': {
      const leader = str(r.leaderPositionId)
      if (leader) return s.positionIds.has(leader) || s.rootPositionIds.has(leader)
      return kind === 'targets' && unitTargetInTree(r, s, index)
    }
    case 'audit':
      return r.object !== 'position' || seat(r.id)
    default:
      // costGroups, assumptions, versions, actionItems, actionOwners
      return true
  }
}

function inUnit(kind: DrillKind, r: Record<string, unknown>, s: ScopeLock & { kind: 'unit' }): boolean {
  const seat = (v: unknown) => {
    const id = str(v)
    return !!id && s.positionIds.has(id)
  }
  switch (kind) {
    case 'positions':
    case 'planLines':
    case 'reqs':
    case 'adjustments':
      return seat(r.positionId)
    case 'assignments':
    case 'exceptions':
      return seat(r.positionId) || (!!str(r.employeeId) && s.personIds.has(r.employeeId as string))
    case 'workers':
      return (!!str(r.employeeId) && s.personIds.has(r.employeeId as string)) || seat(r.positionId)
    case 'requests': {
      if (r.businessUnit === s.unit) return true
      const { touched, orgs } = requestSeats(r)
      return [...touched, ...orgs].some((id) => s.positionIds.has(id))
    }
    case 'targets':
    case 'freezes':
      return r.businessUnit === s.unit
    case 'audit':
      return r.object !== 'position' || seat(r.id)
    default:
      return true
  }
}

/** Whether a raw drill row is inside the context's scope. Always true without a scope. */
export function inScope(kind: DrillKind, row: unknown, ctx: ScopeCtx): boolean {
  const s = scopeOfAccess(ctx.access)
  if (!s) return true
  const r = (row ?? {}) as Record<string, unknown>
  return s.kind === 'tree' ? inTree(kind, r, s, ctx.positionIndex) : inUnit(kind, r, s)
}

/** The rows of a drill inside the scope, and how many were left out (the same rows without a scope). */
export function rowsInScope<Spec extends { kind: DrillKind; rows: readonly unknown[] }>(
  spec: Spec,
  ctx: ScopeCtx,
): { rows: Spec['rows']; leftOut: number } {
  if (!scopeOfAccess(ctx.access)) return { rows: spec.rows, leftOut: 0 }
  const rows = spec.rows.filter((r) => inScope(spec.kind, r, ctx))
  if (rows.length === spec.rows.length) return { rows: spec.rows, leftOut: 0 }
  return { rows: rows as unknown as Spec['rows'], leftOut: spec.rows.length - rows.length }
}

/**
 * Whether a position may open (the full position card, Focus on): a position inside the scope;
 * always true without one. A Manager's own seat and the seats above it never open in Manager mode.
 */
export function positionInScope(positionId: string | null | undefined, access: ScopeHolder): boolean {
  const s = scopeOfAccess(access)
  if (!s) return true
  return !!positionId && s.positionIds.has(positionId)
}

/** Whether a person is inside the scope (`personIds`); always true without one. */
export function personInScope(personId: string | null | undefined, access: ScopeHolder): boolean {
  const s = scopeOfAccess(access)
  if (!s) return true
  return !!personId && s.personIds.has(personId)
}
