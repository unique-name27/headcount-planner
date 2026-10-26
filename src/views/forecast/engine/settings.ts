/**
 * The Forecast view's settings. It registers none of its own (docs/PLAN.md 12): the forecast's
 * drivers (attrition, fill rate, time to fill, backfill rate and lag) are assumptions data, locked
 * with each version, never metric settings; the cost guard's rules (the minimum of costed people,
 * the rounding step, the minimum of contributors) are read from the dictionary once per context
 * (`ctx.guard.rules`, src/metrics/costGuard.ts), never from constants.
 */
import type { AnalyticsContext } from '@/data/context'
import type { CostGuardSettings } from '@/metrics/costGuard'

/** The cost guard's rules in force for a context. */
export const guardRulesOf = (ctx: Pick<AnalyticsContext, 'guard'>): CostGuardSettings => ctx.guard.rules
