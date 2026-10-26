/**
 * The Forecast view's cost (docs/PLAN.md 6.7, 9.4): the full-year cost forecast against the
 * comparison and against the target, and the exit run rate, every amount through the cost guard
 * (src/views/plan/engine/guarded.ts) and the forecast's Working version's one cost-center fold.
 *
 * Readings taken here (views-1 builder, M2):
 *  - The full-year forecast is the fiscal year's months of the forecast: closed months from the
 *    closes, open months projected (6.7), with modeled exits and backfills on the seats they come
 *    from (./run.ts). It carries no vacancy allowance; the comparison's total carries its own (C31).
 *  - The exit run rate is the fiscal year's last month's recurring cost (loaded less one-time items)
 *    × 12. It needs the month's components to show, since the run rate beside the month's loaded
 *    cost would give back its one-time items; else it reads "—" with the component rule's reason.
 *  - Against a target, the difference is the shown forecast less the target cost (an input), so it
 *    says nothing the shown forecast does not; in rounded modes the target is floored to the step.
 */
import type { GuardedDifference } from '@/cost/differences'
import { NO_AMOUNTS_NOTE } from '@/cost/fit'
import { componentsHiddenNote, type GuardedFigure, SHOWS_IN_FINANCE_NOTE } from '@/cost/guard'
import type { Month } from '@/data/schema'
import { emptyComparisonReason } from '@/plan/engine/variance'
import { versionLinesOf } from '@/views/plan/engine/core'
import { costIdsOf, type DiffSide } from '@/views/plan/engine/guarded'
import type { FPrep } from './base'
import { guardedDeltaOf, guardedSideOf, idsSignature } from './members'
import { scopeTargetOf } from './target'

/** One window of the forecast in the cost selection, guarded. */
export function forecastSide(p: FPrep, months: readonly Month[]): DiffSide | null {
  if (!p.run) return null
  // The run's members kept to the cost selection (the members of `p.costLines`) and their guarded
  // total, kept by what they are made of (./members.ts).
  const ids = costIdsOf(p.ctx)
  return guardedSideOf(p.ctx, p.run.lines, months, ids, idsSignature(ids), p.working)
}

/** The comparison's window, guarded with its own fold; null for a target comparison. */
export function comparisonSide(p: FPrep, months: readonly Month[]): DiffSide | null {
  const v = p.comparison
  if (!v) return null
  const ids = costIdsOf(p.ctx)
  return guardedSideOf(p.ctx, versionLinesOf(p.ctx, v), months, ids, idsSignature(ids), v)
}

export interface ForecastCost {
  fullYear: DiffSide | null
  comparison: DiffSide | null
  delta: GuardedDifference | null
  /** Why there is no difference with the comparison (a target comparison), else null. */
  noDelta: string | null
  /** The forecast less the target cost; null with no target or no shown forecast. */
  vsTarget: number | null
  /** The fiscal year's last month, guarded (the exit run rate's month). */
  lastMonth: GuardedFigure | null
  /** The exit run rate, or null with its reason. */
  runRate: { value: number | null; reason: string | null }
}

const memo = new WeakMap<FPrep, ForecastCost>()

export function forecastCost(p: FPrep): ForecastCost {
  const hit = memo.get(p)
  if (hit) return hit
  const fullYear = forecastSide(p, p.fyMonths)
  const comparison = comparisonSide(p, p.fyMonths)
  const yearHasLocked = p.ctx.versions.some((x) => x.state === 'locked' && x.fiscalYear === p.fiscalYear)
  const target = scopeTargetOf(p)
  const shown = fullYear?.figure.total.totalUsd ?? null
  const last = p.fyMonths[p.fyMonths.length - 1]
  // A month's cost and the run rate are Finance's (cost:monthly, cost:component): never built elsewhere.
  const lastSide = last && p.env.monthlyShown && p.env.componentsShown ? forecastSide(p, [last]) : null
  const lastMonth = lastSide?.figure ?? null
  const t = lastMonth?.total ?? null
  let runRate: ForecastCost['runRate']
  if (!lastSide)
    runRate = { value: null, reason: p.env.mode === 'none' ? NO_AMOUNTS_NOTE : SHOWS_IN_FINANCE_NOTE }
  else if (!t || t.totalUsd == null) runRate = { value: null, reason: lastMonth?.reason ?? t?.reason ?? null }
  else if (t.componentsHidden || t.amounts.oneTime == null || t.amounts.loaded == null)
    runRate = { value: null, reason: t.reason ?? componentsHiddenNote(p.env.rules.minCosted) }
  else runRate = { value: (t.amounts.loaded - t.amounts.oneTime + (t.bandUsd ?? 0)) * 12, reason: null }
  const out: ForecastCost = {
    fullYear,
    comparison,
    delta: fullYear && comparison ? guardedDeltaOf(p.ctx, fullYear, comparison) : null,
    noDelta: comparison ? null : emptyComparisonReason(p.fiscalYear, yearHasLocked),
    vsTarget: shown != null && target?.cost != null ? shown - target.cost : null,
    lastMonth,
    runRate,
  }
  memo.set(p, out)
  return out
}
