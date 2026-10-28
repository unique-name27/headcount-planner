/**
 * The Plan view's model for the page: one model per analytics context (`planModel`, cached), shared
 * by every tab, the header and the Action center; Plan > Hiring reads its own (`planHiringModel`,
 * docs/PLAN.md 9.7).
 */
import { useMemo } from 'react'
import { useAnalytics } from '@/data/context'
import { type PlanModel, planModel } from '../engine'
import { type PlanHiring, planHiringModel } from '../engine/hiringTab'
import { type PlanRecruiting, planRecruitingModel } from '../engine/recruitingTab'

export function usePlan(): PlanModel {
  const ctx = useAnalytics()
  return useMemo(() => planModel(ctx), [ctx])
}

/** Plan > Hiring's model (cached per context). */
export function usePlanHiring(): PlanHiring {
  const ctx = useAnalytics()
  return useMemo(() => planHiringModel(ctx), [ctx])
}

/** Plan > Recruiting summary's model (cached per context, docs/PLAN.md 9.8). */
export function usePlanRecruiting(): PlanRecruiting {
  const ctx = useAnalytics()
  return useMemo(() => planRecruitingModel(ctx), [ctx])
}
