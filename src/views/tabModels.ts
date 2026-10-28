/**
 * Tabs with a model of their own instead of a part of their view's model (`<view>.<tab>`), read by
 * everything that walks a view's tabs off its model: the Shareable file's figures
 * (src/views/data/engine/snapshots.ts) and the leak crawl (src/testkit/crawl.ts, which re-exports
 * this map), so a file carries what the crawl reads and the screen draws.
 *
 * Plan > Hiring reads `planHiringModel`, cached per context. It is no `PlanModel` field because it
 * reads the forecast's exits, and the plan model's budget must not carry a forecast run (docs/PLAN.md
 * 9.7; reading H10 in docs/CONTRACTS-HIRING.md). Its UI reads the same model (`usePlanHiring`). Plan >
 * Recruiting summary reads `planRecruitingModel` (9.8, C38) for the same reason.
 */
import type { AnalyticsContext } from '@/data/context'
import { planHiringModel } from '@/views/plan/engine/hiringTab'
import { planRecruitingModel } from '@/views/plan/engine/recruitingTab'

export const TAB_MODELS: Readonly<Record<string, (ctx: AnalyticsContext) => unknown>> = {
  'plan.hiring': planHiringModel,
  'plan.recruiting': planRecruitingModel,
}

/** The model a tab reads on its own, or null when the tab is a part of its view's model. */
export const tabModelOf = (view: string, tab: string): ((ctx: AnalyticsContext) => unknown) | null =>
  TAB_MODELS[`${view}.${tab}`] ?? null
