/**
 * The requests in force in their effective state for the write path's readers (lead decision
 * D-EXPIRY; review SC-3, SP-4): routing's guarded asks, a trade quote's seats and credit, and the
 * seats' pending request read an expired Draft or Sent back request as Expired, so it is not pending
 * and its seats and credit are free. Expiry is derived through the engine's one helper
 * (src/plan/engine/requests.ts `withEffectiveStates`), never stored. Pure.
 */
import type { AnalyticsContext } from '@/data/context'
import { effectiveRequestsOf } from '@/drill/seats'
import type { ExpiryInput } from '@/plan/engine/requests'
import type { HcRequest } from '@/plan/types'
import { PARAM as REQUESTS_PARAM } from '@/views/requests/metrics'

const NO_CYCLES: ExpiryInput['cycles'] = []

/** What expiry reads from the context: the as-of date, `requests.queue.expired` idle days, the plan's cycles. */
export function expiryOfContext(ctx: AnalyticsContext): ExpiryInput {
  return {
    asOf: ctx.asOf,
    idleDays: ctx.metrics.num(REQUESTS_PARAM.idleDays.metricId, REQUESTS_PARAM.idleDays.key),
    cycles: ctx.plan?.cycles ?? NO_CYCLES,
  }
}

/**
 * Every request in force, an expired one reading 'Expired' (the same list when none has): the lists'
 * own wrapper (src/drill/seats.ts `effectiveRequestsOf`), so the write path and every list read one
 * memoized array (M3 verify).
 */
export function effectiveRequests(ctx: AnalyticsContext): readonly HcRequest[] {
  return effectiveRequestsOf(ctx)
}
