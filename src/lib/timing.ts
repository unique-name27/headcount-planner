/**
 * User Timing for engine and view costs. `timed(name, fn)` wraps a call in a `performance.measure`
 * named `hcp:…`; it records only while the module flag is on, so every other run pays one boolean
 * check. Phase 1 has no Developer mode (docs/PLAN.md 15.1 R12): only dev-only helpers behind
 * `import.meta.env.DEV`, and tests, turn the flag on.
 *
 *   const model = timed(`hcp:headline:${view.key}`, () => view.headline(ctx))
 *   const t = timingClock(); …; recordSince(`hcp:drill:${kind}`, t)
 *
 * Names: `hcp:context`, `hcp:quality`, `hcp:headline:<view>`, `hcp:home:<home>`,
 * `hcp:actions:<view>`, `hcp:drill:<kind>`, `hcp:export:<view>`. Each is also listed as "not a
 * storage key" in src/app/storageKeys.ts. Every access to the User Timing API is in try/catch:
 * without it nothing is recorded and nothing breaks. Pure (no React).
 */

/** Every measure the app records starts with this. */
export const TIMING_PREFIX = 'hcp:'

let on = false

/** Record from now on, or stop. */
export function setTimingOn(value: boolean): void {
  on = value
}

/** Whether `timed` records right now. */
export const timingOn = (): boolean => on

/** Milliseconds on the performance clock (Date.now() where there is none). */
export function timingClock(): number {
  try {
    return typeof performance !== 'undefined' ? performance.now() : Date.now()
  } catch {
    return Date.now()
  }
}

/** Record a measure from `start` (a `timingClock()` reading) to now; nothing while recording is off. */
export function recordSince(name: string, start: number): void {
  if (!on) return
  try {
    performance.measure(name, { start, end: timingClock() })
  } catch {
    /* no User Timing API: nothing to record */
  }
}

/** Run `fn`, recording how long it took under `name` while recording is on. Returns what `fn` returns. */
export function timed<T>(name: string, fn: () => T): T {
  if (!on) return fn()
  const start = timingClock()
  try {
    return fn()
  } finally {
    recordSince(name, start)
  }
}

/** One recorded measure. */
export interface TimingEntry {
  name: string
  /** When it started, ms on the performance clock. */
  start: number
  ms: number
}

/** Every `hcp:` measure recorded so far, oldest first. */
export function timingEntries(): TimingEntry[] {
  try {
    if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return []
    return performance
      .getEntriesByType('measure')
      .filter((e) => e.name.startsWith(TIMING_PREFIX))
      .map((e) => ({ name: e.name, start: e.startTime, ms: e.duration }))
  } catch {
    return []
  }
}

/** Forget every `hcp:` measure; marks are left alone. */
export function clearTimings(): void {
  try {
    const names = new Set(timingEntries().map((e) => e.name))
    for (const n of names) performance.clearMeasures(n)
  } catch {
    /* no User Timing API: nothing was recorded */
  }
}

/** A measure name's group: "hcp:headline:plan" → "headline". */
export const timingGroup = (name: string): string => name.slice(TIMING_PREFIX.length).split(':')[0] ?? ''
