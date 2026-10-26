/**
 * The analytics context as the shell builds it (docs/PLAN.md 5.4, 8 and 9.2): the provider fed from
 * the shell's stores, so the page and an off-screen render (a whole-view export) read the same plan
 * state, audit log, metric dictionary and official lists. The provider itself reads the mode, the
 * Acting as picks and the data from their stores and builds the mode's scope clamp (`accessClamp`
 * over the lists in force); an off-screen render may name its own mode and picks (`access`).
 *
 * On the sample, the plan in force is the sample's own plan with any stored overlay for its
 * baseline laid over it (`planInForce`). The page's own provider registers its context for the
 * PlanStore's lock (M3, src/app/write/lock.ts).
 */
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import type { AccessInput } from '@/access/context'
import { type AnalyticsContext, AnalyticsProvider, useAnalytics } from '@/data/context'
import { onSample, useStore } from '@/data/store'
import { metricsApi } from '@/metrics/api'
import { samplePlan } from './boot'
import { useDictionary, useOfficialLists } from './dictionary'
import { auditInForce, planInForce, usePlan } from './planState'
import { setLockContext } from './write/lock'

/**
 * The page's own context as the PlanStore's lock reads it (src/app/write/lock.ts `computeLockNow`):
 * registered while the page's provider is mounted, never an off-screen render's.
 */
function LockContextBridge() {
  const ctx = useAnalytics()
  const ref = useRef<AnalyticsContext>(ctx)
  ref.current = ctx
  useEffect(() => {
    setLockContext(() => ref.current)
    return () => setLockContext(null)
  }, [])
  return null
}

export function ShellProviders({
  access,
  children,
  page = false,
}: {
  access?: AccessInput
  children: ReactNode
  /** The page's own provider (App.tsx): the one the PlanStore's lock computation reads. */
  page?: boolean
}) {
  const sample = useStore((s) => onSample(s.sources))
  const stored = usePlan((s) => s.stored)
  const storedAudit = usePlan((s) => s.audit)
  const dictionary = useDictionary((s) => s.state)
  const saved = useOfficialLists((s) => s.state)
  const plan = useMemo(() => planInForce(stored, sample ? samplePlan() : null), [stored, sample])
  const audit = useMemo(
    () => auditInForce(stored, storedAudit, sample ? samplePlan() : null),
    [stored, storedAudit, sample],
  )
  return (
    <AnalyticsProvider
      {...(access ? { mode: access.mode, ...(access.picks ? { actingAs: access.picks } : {}) } : {})}
      plan={plan}
      audit={audit}
      metrics={metricsApi(dictionary)}
      lists={saved}
    >
      {page && <LockContextBridge />}
      {children}
    </AnalyticsProvider>
  )
}
