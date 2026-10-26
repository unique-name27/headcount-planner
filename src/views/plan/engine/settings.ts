/**
 * The Plan view's calculation settings, read from the metric dictionary (`ctx.metrics`) instead of
 * constants (the template app's settings pattern). Each value is a getter that reads its setting
 * when the engine uses it, so a dictionary that records reads (`recordParamReads` in tests) sees
 * exactly which settings a calculation used, and a changed setting changes every number built on it.
 * The cost guard's rules are not settings of this view: models read them from `ctx.guard.rules`.
 */
import { defaultMetrics } from '@/metrics/api'
import type { MetricsApi } from '@/metrics/types'
import { PARAM } from '../metrics'

export interface PlanSettings {
  /** A Planned seat with no req is flagged once its planned start is this many days away or fewer (45). */
  readonly noReqDays: number
}

const cache = new WeakMap<MetricsApi, PlanSettings>()

export function settingsOf(m: MetricsApi): PlanSettings {
  const hit = cache.get(m)
  if (hit) return hit
  const s: PlanSettings = {
    get noReqDays() {
      return m.num(PARAM.noReqDays.metricId, PARAM.noReqDays.key)
    },
  }
  cache.set(m, s)
  return s
}

/** The registry's defaults, for helpers tests call without a context. */
export const defaultSettings = (): PlanSettings => settingsOf(defaultMetrics())
