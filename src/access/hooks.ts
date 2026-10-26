/**
 * React hooks over `ctx.access` (docs/PLAN.md 8). They read the analytics context, never the mode
 * store, so an off-screen render with its own mode gets its own answers.
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). `useAccess`, `useScope` and `useActingAs` read the
 * context; `useAt` reads the UX layer's current view (src/components/currentView), and `useDecision`
 * and `useCan` place a surface with it (the template app's hooks).
 */
import { useCurrentView } from '@/components/currentView'
import { useAnalytics } from '@/data/context'
import type { AccessContext } from './context'
import type { ActingAs } from './modes'
import type { At, DecideInfo, Decision } from './policy'
import type { ScopeLock } from './scopes/types'
import type { SurfaceId } from './surfaces'

export function useAccess(): AccessContext {
  return useAnalytics().access
}

/** The scope the mode holds (a tree or a unit), or null. */
export function useScope(): ScopeLock | null {
  return useAnalytics().access.scope
}

/** Who the mode acts as, or null while its pick is to be made. */
export function useActingAs(): ActingAs | null {
  return useAnalytics().access.actingAs
}

/** Where the component sits: the view and tab on screen, when it is inside one. */
export function useAt(): At | undefined {
  const view = useCurrentView()
  return view ? { view: view.key, tab: view.tab } : undefined
}

/** The decision for a surface, at the view and tab on screen unless `at` is given. */
export function useDecision(surface: SurfaceId | string, at?: At, info?: DecideInfo): Decision {
  const access = useAccess()
  const here = useAt()
  return access.decide(surface, at ?? here, info)
}

/** Anything but hidden, at the view and tab on screen unless `at` is given. */
export function useCan(surface: SurfaceId | string, at?: At, info?: DecideInfo): boolean {
  return useDecision(surface, at, info).access !== 'hidden'
}
