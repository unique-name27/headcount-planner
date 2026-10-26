/**
 * The Requests view's model for the context on screen (`requestsModel`, cached per context), and the
 * dictionary definitions a figure's datasheet shows. Components render the model and compute nothing.
 */
import { useMemo } from 'react'
import type { Definition } from '@/charts/types'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { definitionOf } from '@/metrics/api'
import { type RequestsModel, requestsModel } from '../engine'

export function useRequests(): RequestsModel {
  const ctx = useAnalytics()
  return useMemo(() => requestsModel(ctx), [ctx])
}

/**
 * The dictionary's definitions of the metrics a figure shows, in order, leaving out a metric the mode
 * hides (the band estimate in Manager mode), so the datasheet never names what the mode does not show.
 */
export function defsOf(ctx: AnalyticsContext, ...ids: string[]): Definition[] {
  const out: Definition[] = []
  for (const id of ids) {
    if (!ctx.access.can(`metric:${id}`)) continue
    const d = definitionOf(ctx.metrics, id)
    if (d) out.push(d)
  }
  return out
}
