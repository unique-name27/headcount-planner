/**
 * The What if model for the context on screen and the session's levers (docs/PLAN.md 9.1, 10.6):
 * `useMemo(() => whatifModel(ctx, levers), [ctx, levers])`, with the levers read from session memory
 * for this view's scope (`leversFor(viewScopeKey(ctx))`) and followed with `subscribeLevers`, so a
 * change of mode or Acting as starts an empty What if. Components render the model and compute
 * nothing; `set` replaces the levers for this view.
 */
import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { Definition } from '@/charts/types'
import { type AnalyticsContext, useAnalytics } from '@/data/context'
import { definitionOf } from '@/metrics/api'
import { type Lever, scopeKeyOfView, type WhatIfLevers, whatifModel } from '../engine'
import { NO_LEVERS, sessionNow, setLevers, subscribeLevers } from '../engine/session'

export interface WhatIfView {
  ctx: AnalyticsContext
  /** The session's levers for this view. */
  levers: readonly Lever[]
  m: WhatIfLevers
  /** Replace this view's levers. */
  set: (levers: readonly Lever[]) => void
}

const subscribe = (onChange: () => void) => subscribeLevers(() => onChange())

export function useWhatIf(): WhatIfView {
  const ctx = useAnalytics()
  const session = useSyncExternalStore(subscribe, sessionNow, sessionNow)
  const key = useMemo(() => scopeKeyOfView(ctx), [ctx])
  const levers = key != null && session.scopeKey === key ? session.levers : NO_LEVERS
  const model = useMemo(() => whatifModel(ctx, levers), [ctx, levers])
  const set = useCallback((next: readonly Lever[]) => setLevers(key, next), [key])
  return { ctx, levers, m: model.levers, set }
}

/** The dictionary's definitions of the metrics a figure shows, leaving out a metric the mode hides. */
export function defsOf(ctx: AnalyticsContext, ...ids: string[]): Definition[] {
  const out: Definition[] = []
  for (const id of ids) {
    if (!ctx.access.can(`metric:${id}`)) continue
    const d = definitionOf(ctx.metrics, id)
    if (d) out.push(d)
  }
  return out
}
