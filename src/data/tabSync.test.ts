/**
 * The write lock (docs/PLAN.md 5.4 and 16.2): one tab writes, the others read and take over when it
 * goes. Both paths run on injected fakes (src/testkit/tabs.ts): Web Locks through a shared lock
 * manager, and the BroadcastChannel heartbeat through a shared bus and a manual clock.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WRITER_LOCK } from '@/app/brand'
import { type FakeTabs, fakeTabs } from '@/testkit/tabs'
import {
  acquireWriter,
  ELECTION_MS,
  HEARTBEAT_MS,
  isLockSignal,
  isTabMessage,
  type LockApi,
  onWriterChange,
  releaseWriter,
  TAKEOVER_MS,
  WriterLock,
  type WriterLockDeps,
  type WriterRole,
  writerRole,
} from './tabSync'

let tabs: FakeTabs
beforeEach(() => {
  tabs = fakeTabs()
})
afterEach(() => releaseWriter())

/** A tab on Web Locks only. */
function lockTab(id: string) {
  const t = tabs.open(id)
  const promoted: string[] = []
  const changes: WriterRole[] = []
  const lock = new WriterLock({ locks: t.locks, channel: null, timers: t.timers }, { tabId: id })
  lock.onChange((r) => changes.push(r))
  const role = lock.acquire(() => promoted.push(id))
  return { t, lock, role, promoted, changes }
}

/** A tab with no Web Locks: the heartbeat on the channel. */
function beatTab(id: string) {
  const t = tabs.open(id)
  const promoted: string[] = []
  const lock = new WriterLock({ locks: null, channel: t.channel, timers: t.timers }, { tabId: id })
  const role = lock.acquire(() => promoted.push(id))
  return { t, lock, role, promoted }
}

describe('the write lock on Web Locks', () => {
  it('makes the first tab the writer and the second a reader that waits in line', async () => {
    const a = lockTab('a')
    await tabs.settle()
    const b = lockTab('b')
    await tabs.settle()
    expect(await a.role).toBe('writer')
    expect(await b.role).toBe('reader')
    expect([a.lock.path, b.lock.path]).toEqual(['web-locks', 'web-locks'])
    expect(tabs.locks.holder(WRITER_LOCK)).toBe('a')
    expect(tabs.locks.waiting(WRITER_LOCK)).toEqual(['b'])
    // Each asked politely first, and the reader then queued a blocking request.
    expect(tabs.locks.requests).toEqual([
      { tab: 'a', name: WRITER_LOCK, ifAvailable: true },
      { tab: 'b', name: WRITER_LOCK, ifAvailable: true },
      { tab: 'b', name: WRITER_LOCK, ifAvailable: false },
    ])
  })

  it('promotes the reader when the writer tab closes, in the order the readers came', async () => {
    const a = lockTab('a')
    await tabs.settle()
    const b = lockTab('b')
    await tabs.settle()
    const c = lockTab('c')
    await tabs.settle()
    expect(await c.role).toBe('reader')

    a.t.close()
    await tabs.settle()
    expect(b.lock.role).toBe('writer')
    expect(b.promoted).toEqual(['b'])
    expect(b.changes).toEqual(['writer'])
    expect(c.lock.role).toBe('reader')
    expect(c.promoted).toEqual([])
    expect(tabs.locks.holder(WRITER_LOCK)).toBe('b')
    // A later acquire in the promoted tab resolves at once with its role now.
    expect(await b.lock.acquire()).toBe('writer')

    b.t.close()
    await tabs.settle()
    expect(c.lock.role).toBe('writer')
    expect(c.promoted).toEqual(['c'])
  })

  it('hands the lock on when the writer releases it, and a released reader never takes over', async () => {
    const a = lockTab('a')
    await tabs.settle()
    const b = lockTab('b')
    await tabs.settle()
    const c = lockTab('c')
    await tabs.settle()
    b.lock.release()
    await tabs.settle()
    expect(tabs.locks.waiting(WRITER_LOCK)).toEqual(['c'])
    a.lock.release()
    await tabs.settle()
    expect(tabs.locks.holder(WRITER_LOCK)).toBe('c')
    expect(c.lock.role).toBe('writer')
    expect(b.promoted).toEqual([])
    expect(b.lock.role).toBe('reader')
    // Releasing twice is harmless.
    a.lock.release()
    c.lock.release()
    await tabs.settle()
    expect(tabs.locks.holder(WRITER_LOCK)).toBeNull()
  })

  it('resolves a reader, and holds nothing, when released before the browser answered', async () => {
    const a = lockTab('a')
    a.lock.release()
    expect(await a.role).toBe('reader')
    await tabs.settle()
    expect(tabs.locks.holder(WRITER_LOCK)).toBeNull()
    expect(tabs.locks.waiting(WRITER_LOCK)).toEqual([])
  })

  it('shares one acquisition between callers and runs every promote callback', async () => {
    const a = lockTab('a')
    await tabs.settle()
    const t = tabs.open('b')
    const lock = new WriterLock({ locks: t.locks, channel: null, timers: t.timers }, { tabId: 'b' })
    const calls: string[] = []
    const first = lock.acquire(() => calls.push('store'))
    const second = lock.acquire(() => calls.push('plan store'))
    expect(second).toBe(first)
    expect(await first).toBe('reader')
    await tabs.settle()
    // Only one blocking request was queued for the two callers.
    expect(tabs.locks.requests.filter((r) => r.tab === 'b')).toHaveLength(2)
    a.t.close()
    await tabs.settle()
    expect(calls).toEqual(['store', 'plan store'])
  })

  it('falls back to the heartbeat when the browser refuses the lock request', async () => {
    const t = tabs.open('a')
    const throwing: LockApi = {
      request: () => {
        throw new Error('SecurityError')
      },
    }
    const rejecting: LockApi = { request: () => Promise.reject(new Error('SecurityError')) }
    for (const locks of [throwing, rejecting]) {
      const lock = new WriterLock({ locks, channel: t.channel, timers: t.timers })
      const role = lock.acquire()
      await tabs.advance(ELECTION_MS)
      expect(await role).toBe('writer')
      expect(lock.path).toBe('heartbeat')
      lock.release()
    }
    // Neither locks nor a channel: nothing to coordinate with, so the tab writes.
    const alone = new WriterLock({ locks: throwing, channel: null, timers: t.timers })
    expect(await alone.acquire()).toBe('writer')
    expect(alone.path).toBe('alone')
  })
})

describe('the write lock without Web Locks (heartbeat on the channel)', () => {
  it('makes a lone tab the writer after the election, and it keeps beating', async () => {
    const a = beatTab('a')
    await tabs.advance(ELECTION_MS - 1)
    expect(a.lock.role).toBeNull()
    await tabs.advance(1)
    expect(await a.role).toBe('writer')
    expect(a.lock.path).toBe('heartbeat')
    const beats = () =>
      tabs.bus.log.filter((m) => isLockSignal(m.data) && m.data.writerLock === 'beat').length
    const before = beats()
    await tabs.advance(HEARTBEAT_MS * 5)
    expect(beats() - before).toBe(5)
  })

  it('answers a newcomer with a beat, so it reads, and keeps it reading while it beats', async () => {
    const a = beatTab('a')
    await tabs.advance(ELECTION_MS)
    const b = beatTab('b')
    await tabs.advance(ELECTION_MS)
    expect(await b.role).toBe('reader')
    await tabs.advance(TAKEOVER_MS * 5)
    expect(a.lock.role).toBe('writer')
    expect(b.lock.role).toBe('reader')
    expect(b.promoted).toEqual([])
  })

  it('takes over at once when the writer says bye, and after the timeout when it vanishes', async () => {
    const a = beatTab('a')
    await tabs.advance(ELECTION_MS)
    const b = beatTab('b')
    const c = beatTab('c')
    await tabs.advance(ELECTION_MS)
    expect([await b.role, await c.role]).toEqual(['reader', 'reader'])

    a.lock.release()
    await tabs.advance(ELECTION_MS)
    // b and c both claimed; exactly one writes (the lower id).
    expect([b.lock.role, c.lock.role]).toEqual(['writer', 'reader'])
    expect(b.promoted).toEqual(['b'])

    // b's tab crashes: no bye. c waits out the timeout, claims, and writes.
    b.t.close()
    await tabs.advance(TAKEOVER_MS - 1)
    expect(c.lock.role).toBe('reader')
    await tabs.advance(1 + ELECTION_MS)
    expect(c.lock.role).toBe('writer')
    expect(c.promoted).toEqual(['c'])
  })

  it('elects one writer when two tabs open at once', async () => {
    const b = beatTab('b')
    const a = beatTab('a')
    await tabs.advance(ELECTION_MS)
    expect([await a.role, await b.role]).toEqual(['writer', 'reader'])
    await tabs.advance(TAKEOVER_MS * 3)
    expect([a.lock.role, b.lock.role]).toEqual(['writer', 'reader'])
  })

  it('keeps the lock with a writer whose timers the browser slowed, because it answers claims', async () => {
    const a = beatTab('a')
    await tabs.advance(ELECTION_MS)
    const b = beatTab('b')
    await tabs.advance(ELECTION_MS)
    // A background tab's timers stop; its message handler still runs.
    tabs.clock.dropOwner('a')
    await tabs.advance(TAKEOVER_MS * 4)
    expect(a.lock.role).toBe('writer')
    expect(b.lock.role).toBe('reader')
  })

  it('steps aside for the back-forward cache: the reader writes and the hidden tab reads', async () => {
    const a = beatTab('a')
    await tabs.advance(ELECTION_MS)
    const b = beatTab('b')
    await tabs.advance(ELECTION_MS)
    const changes: WriterRole[] = []
    a.lock.onChange((r) => changes.push(r))
    a.lock.stepAside()
    await tabs.advance(ELECTION_MS)
    expect(a.lock.role).toBe('reader')
    expect(changes).toEqual(['reader'])
    expect(b.lock.role).toBe('writer')
  })

  it('posts signals that are never tab messages', () => {
    const signal = { writerLock: 'beat', tab: 'x' }
    expect(isLockSignal(signal)).toBe(true)
    expect(isTabMessage(signal)).toBe(false)
    expect(isLockSignal({ writerLock: 'beat' })).toBe(false)
    expect(isLockSignal({ kind: 'plan' })).toBe(false)
  })
})

describe("the page's lock", () => {
  const deps = (id: string): Partial<WriterLockDeps> => {
    const t = tabs.open(id)
    return { locks: t.locks, channel: null, timers: t.timers }
  }

  it('is taken once per page, shared by every caller, and reports changes of role', async () => {
    // Another tab writes already.
    const other = lockTab('other')
    await tabs.settle()
    const seen: WriterRole[] = []
    const off = onWriterChange((r) => seen.push(r))
    const promoted: string[] = []
    expect(writerRole()).toBeNull()
    const first = acquireWriter({ deps: deps('page'), onPromote: () => promoted.push('store') })
    const second = acquireWriter({ onPromote: () => promoted.push('plan store') })
    expect(await first).toBe('reader')
    expect(await second).toBe('reader')
    expect(writerRole()).toBe('reader')
    other.t.close()
    await tabs.settle()
    expect(writerRole()).toBe('writer')
    expect(promoted).toEqual(['store', 'plan store'])
    expect(seen).toEqual(['writer'])
    expect(await acquireWriter()).toBe('writer')
    off()
    releaseWriter()
    expect(writerRole()).toBeNull()
    await tabs.settle()
    expect(tabs.locks.holder(WRITER_LOCK)).toBeNull()
  })

  it('starts again after a release, with new dependencies', async () => {
    expect(await acquireWriter({ deps: deps('one') })).toBe('writer')
    releaseWriter()
    await tabs.settle()
    expect(await acquireWriter({ deps: deps('two') })).toBe('writer')
    expect(tabs.locks.holder(WRITER_LOCK)).toBe('two')
  })
})
