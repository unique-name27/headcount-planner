/**
 * The app's own IndexedDB store (docs/PLAN.md 3.1 and 5.4): `createStore('headcount-planner', 'kv')`,
 * never idb-keyval's shared default database. This is the only module that imports idb-keyval
 * (src/ship/imports.test.ts); everything else reads and writes through these five functions, and
 * tests swap the module for the in-memory one:
 *
 *   vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
 *
 * Keys are the `hcp:` IndexedDB keys listed in src/app/storageKeys.ts. Values are structured-cloned
 * by the browser. The database opens on first use, never on import. Every function returns a promise
 * that rejects (never throws synchronously) where storage is unavailable: a private window, blocked
 * site data, or no IndexedDB at all (Node). Callers catch, and start-up races the reads against a
 * timeout and falls back to the sample.
 */
import { clear, createStore, del, get, keys, set, type UseStore } from 'idb-keyval'
import { IDB_DB, IDB_STORE } from '@/app/brand'

let store: UseStore | null = null
/** The store, created on first use. */
const kv = (): UseStore => {
  store ??= createStore(IDB_DB, IDB_STORE)
  return store
}

/** The value stored at `key`, or undefined when there is none. */
export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  return get<T>(key, kv())
}

/** Store `value` at `key`, replacing what was there. */
export async function idbSet(key: string, value: unknown): Promise<void> {
  await set(key, value, kv())
}

/** Remove `key`; removing a key that is not there is not an error. */
export async function idbDel(key: string): Promise<void> {
  await del(key, kv())
}

/** Every key in the store (all of them `hcp:` keys). */
export async function idbKeys(): Promise<string[]> {
  return (await keys(kv())).filter((k): k is string => typeof k === 'string')
}

/** Remove every key in the store ("Clear this device"). The store is the app's own, so nothing else is touched. */
export async function idbClear(): Promise<void> {
  await clear(kv())
}
