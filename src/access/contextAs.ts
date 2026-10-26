/**
 * The same data seen in another mode or as another person (docs/PLAN.md 5.5 "Export for a manager",
 * C30; M3 freeze): a new analytics context over `ctx`'s datasets, sources, plan state, audit log,
 * metric dictionary, quality and lists, with the mode and picks given, the filters at their defaults
 * (the new mode's scope clamps them) and the version and comparison pickers at the mode's defaults.
 * An HRBP's "Export for a manager" builds its file from `contextAs(ctx, { mode: 'manager', picks })`,
 * exactly as a Shareable made in Manager mode acting as that manager. Pure; the same inputs give the
 * same context object (memoized per `ctx`).
 *
 * Readings taken here (core, M3): the as-of date is `ctx`'s (an HR admin override carries over, so
 * the other mode reads the same day); the lists in force are `ctx`'s, so the scope and the HRBP
 * column read what `ctx` read; with no picks given every mode's pick is unset (writes are blocked and
 * scoped modes hold nobody), so a caller names the person it acts as.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the body.
 */
import { type AnalyticsContext, buildContext } from '@/data/context'
import { DEFAULT_FILTERS } from '@/data/scope'
import { type AccessInput, accessClamp } from './context'
import { contextLists, setContextLists } from './lists'
import { NO_PICKS } from './modes'

const memo = new WeakMap<AnalyticsContext, Map<string, AnalyticsContext>>()

/** `ctx`'s data in another mode and Acting as (see the module comment). */
export function contextAs(ctx: AnalyticsContext, input: AccessInput): AnalyticsContext {
  const picks = input.picks ?? NO_PICKS
  const key = JSON.stringify([input.mode, picks, !!input.switchOn])
  let byKey = memo.get(ctx)
  if (!byKey) {
    byKey = new Map()
    memo.set(ctx, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const lists = contextLists(ctx)
  const out = buildContext({
    // `all` holds Working's overlay already; laying it again changes no row (rows are keyed).
    data: ctx.all,
    sources: ctx.sources,
    filters: DEFAULT_FILTERS,
    asOfOverride: ctx.asOf,
    today: ctx.asOf,
    mode: input.mode,
    actingAs: picks,
    plan: ctx.plan,
    versions: ctx.versions,
    audit: ctx.audit,
    clamp: accessClamp(picks, lists),
    showPay: !!input.switchOn,
    standard: ctx.standard,
    quality: ctx.quality,
    metrics: ctx.metrics,
  })
  if (lists) setContextLists(out, lists)
  byKey.set(key, out)
  return out
}
