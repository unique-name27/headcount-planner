/**
 * Shared preparation for the Forecast view's model: the Plan view's preparation (scope, version,
 * comparison, windows, wording, src/views/plan/engine/base.ts), the forecast of the shown fiscal
 * year (./run.ts), and the forecast's lines kept to the scope. Built once per analytics context.
 */
import type { AnalyticsContext } from '@/data/context'
import type { Month } from '@/data/schema'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { type Prep, prepare as preparePlan } from '@/views/plan/engine/base'
import { perContext } from '@/views/plan/engine/core'
import { costIdsOf } from '@/views/plan/engine/guarded'
import { type ForecastRun, forecastRunOf, projectedMonths } from './run'

export interface FPrep extends Prep {
  /** The forecast of the shown fiscal year; null with no Working version. */
  run: ForecastRun | null
  /** The Working version the forecast is of (its fold prices every forecast figure). */
  working: AnyVersion | null
  /** The run's lines of the scope's positions (heads). */
  lines: readonly PlanLine[]
  /** The run's lines of the cost selection (the scope, plus a tree's own seats in rounded modes). */
  costLines: readonly PlanLine[]
  /** The fiscal year's months that are projected (after the last actual month). */
  projected: readonly Month[]
  /** The last month read as actual. */
  actualThrough: Month | null
}

export const prepare = perContext((ctx: AnalyticsContext): FPrep => {
  const p = preparePlan(ctx)
  const run = forecastRunOf(ctx, p.version)
  const ids = p.scope.ids
  const cost = costIdsOf(ctx)
  const lines: PlanLine[] = []
  const costLines: PlanLine[] = []
  for (const l of run?.lines ?? []) {
    if (ids.has(l.positionId)) lines.push(l)
    if (cost.has(l.positionId)) costLines.push(l)
  }
  const fy = new Set(p.fyMonths)
  return {
    ...p,
    run,
    working: run?.version ?? null,
    lines,
    costLines,
    projected: run ? projectedMonths(run).filter((m) => fy.has(m)) : [],
    actualThrough: run?.actualThrough ?? null,
  }
})
