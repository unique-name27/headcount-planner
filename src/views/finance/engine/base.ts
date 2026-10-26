/**
 * What every Finance tab reads, prepared once per analytics context (`prepareFinance`, cached in a
 * WeakMap): the fiscal year and its Working frame (src/views/targets/engine/working.ts, shared with
 * the Targets view), the version shown, the guard's mode and rules, the positions the scope and
 * filters select, the viewer (8.4) and the requests it may see, and the dictionary's wording.
 */
import { requestView, type Viewer, viewerOf } from '@/access/visibility'
import type { GuardMode } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { FiscalYear } from '@/data/schema'
import { effectiveRequestsOf } from '@/drill/seats'
import type { CostGuardSettings } from '@/metrics/costGuard'
import { uses as usesOf } from '@/metrics/fields'
import type { AnyVersion, HcRequest } from '@/plan/types'
import { scopeUses } from '@/views/plan/engine/lineage'
import { presentUses, targetYearOf, type WorkingFrame, workingFrame } from '@/views/targets/engine/working'

export interface FinancePrep {
  ctx: AnalyticsContext
  fiscalYear: FiscalYear
  /** The year's Working version and what its figures read. */
  frame: WorkingFrame
  /** The version shown (`ver`), else the year's Working. */
  version: AnyVersion | null
  mode: GuardMode
  rules: CostGuardSettings
  /** Positions the scope and filters select. */
  selected: ReadonlySet<string>
  viewer: Viewer
  /** Requests the viewer may see (8.4 rules 1 to 3). */
  visible: readonly HcRequest[]
  /** Band figures (freeze savings, band estimates) show: Finance and HR admin, `cost:band` and the metric. */
  definition: (metricId: string) => string | undefined
  uses: (metricId: string) => readonly FieldRef[]
}

const cache = new WeakMap<AnalyticsContext, FinancePrep>()

export function prepareFinance(ctx: AnalyticsContext): FinancePrep {
  const hit = cache.get(ctx)
  if (hit) return hit
  const fiscalYear = targetYearOf(ctx)
  const frame = workingFrame(ctx, fiscalYear)
  const viewer = viewerOf(ctx)
  const filterRefs = scopeUses(ctx.filters)
  const p: FinancePrep = {
    ctx,
    fiscalYear,
    frame,
    version: ctx.version ?? frame.version,
    mode: ctx.guard.mode,
    rules: ctx.guard.rules,
    selected: new Set(ctx.data.positions.map((r) => r.positionId)),
    viewer,
    // Every request in its effective state (D-EXPIRY): an expired one is waiting on no one.
    visible: effectiveRequestsOf(ctx).filter((r) => requestView(r, viewer) !== 'none'),
    definition: (id) => ctx.metrics.def(id)?.definition,
    uses: (id) => usesOf(presentUses(ctx, id), filterRefs),
  }
  cache.set(ctx, p)
  return p
}
