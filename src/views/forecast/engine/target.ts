/**
 * The target a scope's year-end figures compare with (docs/PLAN.md 9.2, 9.4 Forecast > Overview:
 * "Year-end heads forecast (vs target)", the Leader home's "Cost vs target"). Targets are inputs
 * (Finance's heads and cost per org); in HRBP and Leader mode the target cost is floored to the
 * rounding step (PLAN 12 `targets.target.cost`). Pure.
 *
 * Readings taken here (views-1 builder, M2):
 *  - A scope compares with the targets of exactly its own org, never a wider one: the whole company
 *    reads the sum of the unit targets; a unit (an HRBP's, or a unit filter) its unit target; a
 *    leader's org the target keyed to the leader's seat, else, when the leader's seat heads its unit
 *    (its manager sits outside the unit), the unit's target; a department filter its department
 *    targets. Any other cut (a level, a location, a sub-org with no target) has no target, and the
 *    figure says so.
 *  - A scope's target cost is the sum of its rows' when every row has one, else none.
 *  - A leader's target (its own leader-keyed row, or the unit its seat heads) is an org that holds
 *    the leader's own seat, while the tree scope holds the positions strictly below it (8.2). So the
 *    year-end heads compared with it count the root seats too (`rootSeatsCounted`, review RC-3), as
 *    rounded cost does (src/views/plan/engine/guarded.ts `costIdsOf`).
 */

import type { TargetRow } from '@/data/schema'
import { roundCostTo } from '@/lib/costRounding'
import { targetKindOf } from '@/plan/engine/targets'
import type { Prep } from '@/views/plan/engine/base'
import { placementOf } from '@/views/plan/engine/core'

export interface ScopeTarget {
  rows: readonly TargetRow[]
  /**
   * The rows as the mode's drill lists them: each row's target cost floored to the rounding step in
   * HRBP and Leader mode (PLAN 12 "input, floored for HRBP and Leader"), none in Manager mode, the
   * input itself elsewhere. Every deltaDrill opens these, never `rows`.
   */
  drillRows: readonly TargetRow[]
  heads: number
  /** The fiscal year's target cost (floored in rounded modes); null when a row has none. */
  cost: number | null
  /** "FY27 target". */
  label: string
}

/** A target row's cost as the mode shows it (see `ScopeTarget.drillRows`). */
export function shownTargetRow(row: TargetRow, mode: Prep['env']['mode'], step: number): TargetRow {
  if (row.targetCost == null || mode === 'exact' || mode === 'open') return row
  return { ...row, targetCost: mode === 'rounded' ? roundCostTo(row.targetCost, step) : null }
}

const memo = new WeakMap<Prep, ScopeTarget | null>()

const NO_ROOTS: ReadonlySet<string> = new Set()

/**
 * The root seats a tree scope's year-end heads count beside its own positions (RC-3): the leader's
 * own seats when the scope compares with a target (every target of a tree scope is an org that holds
 * the root seat, `compute` below), else none.
 */
export function rootSeatsCounted(p: Prep): ReadonlySet<string> {
  const scope = p.ctx.access.scope
  if (scope?.kind !== 'tree' || !scopeTargetOf(p)) return NO_ROOTS
  return scope.rootPositionIds
}

export function scopeTargetOf(p: Prep): ScopeTarget | null {
  if (memo.has(p)) return memo.get(p) ?? null
  const out = compute(p)
  memo.set(p, out)
  return out
}

function compute(p: Prep): ScopeTarget | null {
  const ctx = p.ctx
  const fy = p.fiscalYear
  const all = ctx.all.targets.filter((t) => t.fiscalYear === fy)
  const units = (names: readonly string[]) => {
    const rows = names.map((u) => all.find((t) => t.businessUnit === u && targetKindOf(t) === 'unit'))
    return rows.every((r) => r != null) ? (rows as TargetRow[]) : null
  }
  const leaderRows = (seat: string): TargetRow[] | null => {
    const own = all.find((t) => targetKindOf(t) === 'leader' && t.leaderPositionId === seat)
    if (own) return [own]
    const place = placementOf(ctx)
    const r = place.get(seat)
    if (!r) return null
    const up = r.managerPositionId ? place.get(r.managerPositionId) : null
    return up && up.businessUnit === r.businessUnit ? null : units([r.businessUnit])
  }
  const f = ctx.filters
  const scope = ctx.access.scope
  const others =
    f.department.length +
    f.costCenter.length +
    f.location.length +
    f.level.length +
    f.legalEntity.length +
    f.country.length +
    f.currency.length
  const excluded = Object.values(f.modes ?? {}).some((m) => m === 'exclude')
  let rows: TargetRow[] | null = null
  if (excluded) rows = null
  else if (scope?.kind === 'unit') rows = others || f.leaderId ? null : units([scope.unit])
  else if (scope?.kind === 'tree') {
    const root = [...scope.rootPositionIds][0]
    rows = others || (f.leaderId && f.leaderId !== root) ? null : root ? leaderRows(root) : null
  } else if (f.leaderId) rows = others || f.businessUnit.length ? null : leaderRows(f.leaderId)
  else if (f.department.length && others === f.department.length && !f.businessUnit.length) {
    const d = f.department.map((x) => all.find((t) => targetKindOf(t) === 'department' && t.department === x))
    rows = d.every((r) => r != null) ? (d as TargetRow[]) : null
  } else if (!others) {
    const names = f.businessUnit.length ? f.businessUnit : [...new Set(all.map((t) => t.businessUnit))].sort()
    rows = names.length ? units(names) : null
  }
  if (!rows?.length) return null
  const heads = rows.reduce((a, r) => a + r.targetHeads, 0)
  const costs = rows.map((r) => r.targetCost)
  let cost = costs.every((c) => c != null) ? costs.reduce<number>((a, c) => a + (c as number), 0) : null
  if (cost != null && p.env.mode === 'rounded') cost = roundCostTo(cost, p.env.rules.floorUsd)
  if (p.env.mode === 'none') cost = null
  const drillRows = rows.map((r) => shownTargetRow(r, p.env.mode, p.env.rules.floorUsd))
  return { rows, drillRows, heads, cost, label: `${fy} target` }
}
