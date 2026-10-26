/**
 * An in-memory stand-in for src/data/idb.ts, with the same five functions, for tests:
 *
 *   vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
 *
 * The mock and a direct import of this file share one store, so a test reads and resets the same
 * store the code under test writes. That holds across `vi.resetModules()` too: Vitest keeps the
 * mocked `@/data/idb` it made first, while a later direct import of this file is a fresh module, so
 * the state lives on `globalThis` and every copy of the module sees it (as IndexedDB outlives a page
 * reload). Values are structured-cloned on the way in and out, as IndexedDB does, so changing a
 * value after writing it never changes what is stored. One store per test file (Vitest isolates
 * files); call `resetMemoryIdb()` in `beforeEach` between tests.
 */

interface MemoryIdbState {
  store: Map<string, unknown>
  failure: Error | null
  stalled: (() => void)[] | null
}

const STATE_KEY = Symbol.for('hcp.testkit.memoryIdb')
const holder = globalThis as unknown as Record<symbol, MemoryIdbState | undefined>
holder[STATE_KEY] ??= { store: new Map(), failure: null, stalled: null }
/** The one state every copy of this module shares. */
const state: MemoryIdbState = holder[STATE_KEY]
const store = state.store

/**
 * Rejects the call the way an unavailable IndexedDB does, while `failMemoryIdb` is on, and waits
 * (like a database another tab holds open) while `stallMemoryIdb` is on.
 */
function check(): Promise<void> | undefined {
  if (state.stalled) {
    const queue = state.stalled
    return new Promise<void>((resolve) => queue.push(resolve)).then(() => {
      if (state.failure) throw state.failure
    })
  }
  if (state.failure) throw state.failure
  return undefined
}

/** The value stored at `key`, or undefined when there is none. */
export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  const wait = check()
  if (wait) await wait
  return store.has(key) ? (structuredClone(store.get(key)) as T) : undefined
}

/** Store `value` at `key`, replacing what was there. */
export async function idbSet(key: string, value: unknown): Promise<void> {
  const wait = check()
  if (wait) await wait
  store.set(key, structuredClone(value))
}

/** Remove `key`; removing a key that is not there is not an error. */
export async function idbDel(key: string): Promise<void> {
  const wait = check()
  if (wait) await wait
  store.delete(key)
}

/** Every key in the store, in the order written. */
export async function idbKeys(): Promise<string[]> {
  const wait = check()
  if (wait) await wait
  return [...store.keys()]
}

/** Remove every key in the store. */
export async function idbClear(): Promise<void> {
  const wait = check()
  if (wait) await wait
  store.clear()
}

/* ───────────── test helpers (not in src/data/idb.ts) ───────────── */

/** Empty the store, stop failing and stop stalling (calls still waiting are let through). */
export function resetMemoryIdb(): void {
  stallMemoryIdb(false)
  store.clear()
  state.failure = null
}

/** A copy of everything stored, for assertions. */
export function memoryIdbEntries(): Map<string, unknown> {
  return new Map([...store].map(([k, v]) => [k, structuredClone(v)]))
}

/**
 * Make every call reject with `error` (storage blocked, quota full), or pass null to work again.
 * The store keeps its contents.
 */
export function failMemoryIdb(error: Error | null = new Error('IndexedDB is unavailable.')): void {
  state.failure = error
}

/**
 * Make every call wait (as when another tab holds the database open) until `stallMemoryIdb(false)`,
 * which lets the waiting calls through. A start-up read then loses its race with the timeout.
 */
export function stallMemoryIdb(on = true): void {
  if (on) {
    state.stalled ??= []
    return
  }
  const waiting = state.stalled ?? []
  state.stalled = null
  for (const resolve of waiting) resolve()
}
