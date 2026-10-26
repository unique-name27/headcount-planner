/**
 * The Requests view's settings, read through the metric dictionary (`ctx.metrics`, never as
 * constants; docs/PLAN.md 12): days in a step before a request counts as waiting, idle days before a
 * Draft or Sent back request expires, and the days around a known exit that flag a Backfill on a new
 * position. The getters are lazy, so `recordParamReads` sees exactly which settings a computation
 * read, and the object is cached per dictionary. The leader threshold is read by the chain engine
 * when a request is routed (src/plan/engine/chain.ts, the write path); the lists here show the steps
 * stored on each request, so they never re-route it.
 */
import type { MetricsApi } from '@/metrics/types'
import { PARAM } from '../metrics'

export interface RequestsSettings {
  /** Days in a step before a request counts as waiting (`requests.queue.waiting`, 5). */
  readonly waitingDays: number
  /** Idle days before a Draft or Sent back request expires (`requests.queue.expired`, 60). */
  readonly idleDays: number
  /** Days around a known exit that flag a Backfill on a new position (30). */
  readonly backfillWindowDays: number
}

const cache = new WeakMap<Pick<MetricsApi, 'num'>, RequestsSettings>()

/** The settings in force, cached per dictionary; each value is read on first use. */
export function settingsOf(m: Pick<MetricsApi, 'num'>): RequestsSettings {
  const hit = cache.get(m)
  if (hit) return hit
  const lazy = (ref: { metricId: string; key: string }) => {
    let v: number | null = null
    return () => {
      v ??= m.num(ref.metricId, ref.key)
      return v
    }
  }
  const waiting = lazy(PARAM.waitingDays)
  const idle = lazy(PARAM.idleDays)
  const backfill = lazy(PARAM.backfillWindowDays)
  const s: RequestsSettings = {
    get waitingDays() {
      return waiting()
    },
    get idleDays() {
      return idle()
    },
    get backfillWindowDays() {
      return backfill()
    },
  }
  cache.set(m, s)
  return s
}
