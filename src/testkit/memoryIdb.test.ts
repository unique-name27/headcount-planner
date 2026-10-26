/**
 * The in-memory store stands in for src/data/idb.ts through `vi.mock`, as every store test uses it:
 * code that imports `@/data/idb` writes here, and the helpers see it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as real from '@/data/idb'
import * as memory from './memoryIdb'
import { failMemoryIdb, memoryIdbEntries, resetMemoryIdb, stallMemoryIdb } from './memoryIdb'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

beforeEach(() => resetMemoryIdb())

describe('memoryIdb as the mock of @/data/idb', () => {
  it('has every export of the real module, with the same types, and is what @/data/idb gives', () => {
    // tsc checks the memory module against the real module's types (types are never mocked).
    const asReal: typeof real = memory
    expect(real.idbGet).toBe(asReal.idbGet)
    expect(real.idbSet).toBe(asReal.idbSet)
    expect(real.idbDel).toBe(asReal.idbDel)
    expect(real.idbKeys).toBe(asReal.idbKeys)
    expect(real.idbClear).toBe(asReal.idbClear)
  })

  it('stores, lists, deletes and clears through the mocked module', async () => {
    expect(await real.idbGet('hcp:plan')).toBeUndefined()
    await real.idbSet('hcp:plan', { versions: 4 })
    await real.idbSet('hcp:dataset:positions', { rows: [1, 2] })
    expect(await real.idbGet('hcp:plan')).toEqual({ versions: 4 })
    expect(await real.idbKeys()).toEqual(['hcp:plan', 'hcp:dataset:positions'])
    // The helpers see what the code under test wrote.
    expect([...memoryIdbEntries().keys()]).toEqual(['hcp:plan', 'hcp:dataset:positions'])
    await real.idbDel('hcp:plan')
    await real.idbDel('hcp:nothing-here')
    expect(await real.idbKeys()).toEqual(['hcp:dataset:positions'])
    await real.idbClear()
    expect(await real.idbKeys()).toEqual([])
  })

  it('clones values on the way in and out, as IndexedDB does', async () => {
    const value = { rows: [{ positionId: 'P-1' }] }
    await real.idbSet('hcp:dataset:positions', value)
    value.rows[0].positionId = 'changed after writing'
    const read = await real.idbGet<typeof value>('hcp:dataset:positions')
    expect(read?.rows[0].positionId).toBe('P-1')
    read!.rows[0].positionId = 'changed after reading'
    expect((await real.idbGet<typeof value>('hcp:dataset:positions'))?.rows[0].positionId).toBe('P-1')
  })

  it('rejects every call while storage fails, and keeps what it holds', async () => {
    await real.idbSet('hcp:plan', 1)
    failMemoryIdb()
    await expect(real.idbGet('hcp:plan')).rejects.toThrow('IndexedDB is unavailable.')
    await expect(real.idbSet('hcp:plan', 2)).rejects.toThrow()
    await expect(real.idbKeys()).rejects.toThrow()
    failMemoryIdb(null)
    expect(await real.idbGet('hcp:plan')).toBe(1)
  })

  it('keeps one store across vi.resetModules, as IndexedDB outlives a page reload', async () => {
    // Vitest keeps the mocked @/data/idb it made first, while a later direct import of the memory
    // module is a fresh copy: both must see the same store, failures and stalls.
    await real.idbSet('hcp:plan', { versions: 1 })
    vi.resetModules()
    const fresh = await import('./memoryIdb')
    const mocked = await import('@/data/idb')
    expect(fresh).not.toBe(memory)
    expect(await fresh.idbGet('hcp:plan')).toEqual({ versions: 1 })
    await mocked.idbSet('hcp:dataset:reqs', { rows: [] })
    expect([...fresh.memoryIdbEntries().keys()]).toEqual(['hcp:plan', 'hcp:dataset:reqs'])
    fresh.failMemoryIdb()
    await expect(real.idbGet('hcp:plan')).rejects.toThrow('IndexedDB is unavailable.')
    memory.resetMemoryIdb()
    expect(fresh.memoryIdbEntries().size).toBe(0)
  })

  it('holds every call while stalled, then lets them through in order', async () => {
    stallMemoryIdb()
    let done = false
    const write = real.idbSet('hcp:plan', 1).then(() => {
      done = true
    })
    const read = real.idbGet('hcp:plan')
    await new Promise((r) => setTimeout(r, 5))
    expect(done).toBe(false)
    expect(memoryIdbEntries().size).toBe(0)
    stallMemoryIdb(false)
    await write
    expect(done).toBe(true)
    expect(await read).toBe(1)
    // Not stalled, a write lands before the call returns, as before.
    void real.idbSet('hcp:plan', 2)
    expect(memoryIdbEntries().get('hcp:plan')).toBe(2)
  })
})
