/**
 * The Targets model for the context on screen (docs/PLAN.md 9.1: `useMemo(() => targetsModel(ctx),
 * [ctx])`), and the dictionary definitions a figure's datasheet shows. Components render the model
 * and compute nothing.
 */
import { useMemo } from 'react'
import type { Definition } from '@/charts/types'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { definitionOf } from '@/metrics/api'
import { type TargetsModel, targetsModel } from '../engine'

export function useTargets(): { ctx: AnalyticsContext; m: TargetsModel } {
  const ctx = useAnalytics()
  const m = useMemo(() => targetsModel(ctx), [ctx])
  return { ctx, m }
}

/** The dictionary's definitions of the metrics a figure shows, in order. */
export function defsOf(ctx: AnalyticsContext, ...ids: string[]): Definition[] {
  return ids.map((id) => definitionOf(ctx.metrics, id)).filter((d): d is NonNullable<typeof d> => d != null)
}
