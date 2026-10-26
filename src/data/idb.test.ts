/**
 * src/data/idb.ts opens the app's own store, `createStore('headcount-planner', 'kv')`, on first use
 * (never on import), passes it to every idb-keyval call, and turns a synchronous storage failure
 * into a rejected promise. idb-keyval is replaced by a recording fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => {
  const data = new Map<unknown, unknown>()
  const created: [string, string][] = []
  const stores: unknown[] = []
  const store = () => undefined
  let broken = false
  const use = (s: unknown) => {
    stores.push(s)
    // The real idb-keyval opens the database inside the call and throws where there is no IndexedDB.
    if (broken) throw new ReferenceError('indexedDB is not defined')
  }
  return {
    data,
    created,
    stores,
    store,
    use,
    break: (on: boolean) => {
      broken = on
    },
  }
})

// Not async: like the real idb-keyval, a broken store throws synchronously inside the call.
vi.mock('idb-keyval', () => ({
  createStore: (db: string, name: string) => {
    fake.created.push([db, name])
    return fake.store
  },
  get: (k: unknown, s: unknown) => {
    fake.use(s)
    return Promise.resolve(fake.data.get(k))
  },
  set: (k: unknown, v: unknown, s: unknown) => {
    fake.use(s)
    fake.data.set(k, v)
    return Promise.resolve()
  },
  del: (k: unknown, s: unknown) => {
    fake.use(s)
    fake.data.delete(k)
    return Promise.resolve()
  },
  keys: (s: unknown) => {
    fake.use(s)
    return Promise.resolve([...fake.data.keys()])
  },
  clear: (s: unknown) => {
    fake.use(s)
    fake.data.clear()
    return Promise.resolve()
  },
}))

beforeEach(() => {
  fake.data.clear()
  fake.stores.length = 0
  fake.break(false)
})

describe('the IndexedDB wrapper', () => {
  it('opens nothing on import, then the app’s own store once, on first use', async () => {
    const idb = await import('./idb')
    expect(fake.created).toEqual([])
    await idb.idbSet('hcp:plan', { a: 1 })
    await idb.idbGet('hcp:plan')
    expect(fake.created).toEqual([['headcount-planner', 'kv']])
  })

  it('passes that store to every call', async () => {
    const { idbClear, idbDel, idbGet, idbKeys, idbSet } = await import('./idb')
    await idbSet('hcp:plan', 1)
    expect(await idbGet('hcp:plan')).toBe(1)
    expect(await idbKeys()).toEqual(['hcp:plan'])
    await idbDel('hcp:plan')
    await idbClear()
    expect(fake.stores).toHaveLength(5)
    expect(fake.stores.every((s) => s === fake.store)).toBe(true)
  })

  it('lists string keys only', async () => {
    const { idbKeys } = await import('./idb')
    fake.data.set('hcp:views', 1)
    fake.data.set(42, 2)
    expect(await idbKeys()).toEqual(['hcp:views'])
  })

  it('rejects, never throws, when storage is unavailable', async () => {
    const idb = await import('./idb')
    fake.break(true)
    const calls = [idb.idbGet('k'), idb.idbSet('k', 1), idb.idbDel('k'), idb.idbKeys(), idb.idbClear()]
    for (const p of calls) await expect(p).rejects.toThrow('indexedDB is not defined')
  })
})
