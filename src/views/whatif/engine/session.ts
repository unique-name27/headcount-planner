/**
 * What if's levers in session memory (docs/PLAN.md 10.6: "Unsaved levers held in session memory";
 * M3 freeze). Never stored (no `hcp:` key, nothing in sessionStorage or IndexedDB): a reload starts an
 * empty What if. The levers belong to one view of the plan: the mode and the Acting as person's scope
 * (src/views/data/engine/sharedFile.ts `viewScopeKey`), so changing either starts an empty What if
 * (`leversFor` returns none for another key). "Turn into requests" writes drafts through the write
 * path (`turnLeversIntoRequests`) and leaves the levers as they are. Plain module state, no React:
 * the UI subscribes with `subscribeLevers`.
 *
 * Readings taken here (whatif builder, M3):
 *  - A view with no scope key (no Acting as pick yet) has no levers: `leversFor(null)` is always
 *    empty, and levers set for null are kept only until a view with a key sets its own.
 *  - The session holds one view's levers at a time. Setting levers for another key replaces them,
 *    so switching Acting as and back starts empty: levers made for one person never reach another.
 *  - Every change hands subscribers a new session object and a new levers array, so a model cached
 *    by its levers array (`whatifModel`) is rebuilt only when the levers change.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the whatif builder filled the bodies.
 */
import type { Lever } from '@/plan/engine/whatif'

/** The levers of the current session, in order, and the view they were made for. */
export interface WhatIfSession {
  /** `viewScopeKey` of the context the levers were made in; null before the first lever. */
  scopeKey: string | null
  levers: readonly Lever[]
}

/** No levers: one shared empty array, so a model cached by its levers is built once for none. */
export const NO_LEVERS: readonly Lever[] = Object.freeze([]) as readonly Lever[]

let session: WhatIfSession = { scopeKey: null, levers: NO_LEVERS }
const listeners = new Set<(session: WhatIfSession) => void>()

function publish(next: WhatIfSession): void {
  session = next
  for (const fn of [...listeners]) fn(session)
}

/** The session's levers for a view (none when they were made for another mode or Acting as). */
export function leversFor(scopeKey: string | null): readonly Lever[] {
  if (scopeKey == null || session.scopeKey !== scopeKey) return NO_LEVERS
  return session.levers
}

/** The session's levers as they stand, whoever they were made for (the headline's default). */
export function leversNow(): readonly Lever[] {
  return session.levers
}

/** Replace the session's levers for a view. */
export function setLevers(scopeKey: string | null, levers: readonly Lever[]): void {
  publish({ scopeKey, levers: levers.length ? Object.freeze([...levers]) : NO_LEVERS })
}

/** Empty the session. */
export function clearLevers(): void {
  publish({ scopeKey: null, levers: NO_LEVERS })
}

/** Follow changes; returns the unsubscribe function. */
export function subscribeLevers(fn: (session: WhatIfSession) => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** The session as it stands (for `useSyncExternalStore`). */
export const sessionNow = (): WhatIfSession => session
