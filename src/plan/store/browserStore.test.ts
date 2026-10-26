/**
 * BrowserStore (docs/PLAN.md 5.4, 16.2 "PlanStore (write refused in a reader tab)"), over the
 * in-memory IndexedDB and a stubbed write lock: the keys it writes, refused writes in a reader tab,
 * promotion when the writer tab closes, the tab message after each write, and the audit log in chunks
 * of 500 that a new tab continues. A writer the lock demotes (the heartbeat page lock stepping aside
 * or losing a tie, on the fakes in src/testkit/tabs.ts) refuses every write until it is promoted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type AcquireOptions,
  acquireWriter,
  ELECTION_MS,
  releaseWriter,
  TAKEOVER_MS,
  WriterLock,
  type WriterRole,
  writerRole,
} from '@/data/tabSync'
import { failMemoryIdb, memoryIdbEntries, resetMemoryIdb } from '@/testkit/memoryIdb'
import { type FakeTabs, fakeTabs } from '@/testkit/tabs'
import { verifyChain } from '../audit/chain'
import { fy27Working } from '../engine/fixtures/common'
import type { AuditDraft, AuditEntry, PlanState } from '../types'
import { AUDIT_CHUNK, auditKey, BrowserStore, chunkOf, PLAN_KEY } from './browserStore'
import { emptyPlanState } from './memoryStore'
import { type PlanStoreDeps, READ_ONLY_NOTE } from './types'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

const lock = vi.hoisted(() => ({
  options: [] as { onPromote?: () => void }[],
  role: 'writer' as 'writer' | 'reader',
  posts: [] as unknown[],
  /** Hand acquireWriter to the real page lock (the demotion tests). */
  real: false,
}))

vi.mock('@/data/tabSync', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/tabSync')>()
  return {
    ...real,
    acquireWriter: async (options: AcquireOptions = {}) => {
      lock.options.push(options)
      return lock.real ? real.acquireWriter(options) : lock.role
    },
    postToTabs: (m: unknown) => {
      lock.posts.push(m)
    },
  }
})

/** The tag every store here mints for a state with none (D-ID), and the secret it mints with it. */
const TAG = 'K7QM'
const SECRET = '0123456789abcdef0123456789abcdef'
const tagged = (s: PlanState): PlanState => ({ ...s, idTag: TAG, idSecret: SECRET })

const deps: PlanStoreDeps = {
  now: () => '2026-10-13T10:00',
  computeLock: () => ({ lines: [], assumptions: [], rates: [], forecast: null }),
  newVersionId: () => 'fy27-budget',
}

const draft = (n: number): AuditDraft => ({
  at: '2026-10-13T10:00',
  by: 'E10077',
  byName: 'Priya',
  mode: 'hrbp',
  object: 'request',
  id: `R-${n}`,
  field: 'state',
  old: null,
  new: 'Submitted',
  effectiveDate: null,
  comment: null,
  commentAudience: null,
})

const state = (): PlanState => ({ ...emptyPlanState('sample'), versions: [fy27Working('daily')] })

const finance = { personId: 'E1', name: 'A', mode: 'finance' } as const

/** Every write refuses with the read-only note, and nothing in IndexedDB changes. */
async function expectReadOnly(store: BrowserStore): Promise<void> {
  const before = JSON.stringify([...memoryIdbEntries()])
  const posts = lock.posts.length
  expect(store.readOnly).toBe(true)
  await expect(store.save(state())).rejects.toThrow(READ_ONLY_NOTE)
  await expect(store.appendAudit(draft(99))).rejects.toThrow(READ_ONLY_NOTE)
  await expect(
    store.lockVersion('fy27-working', { kind: 'budget', name: 'FY27 Budget' }, finance),
  ).rejects.toThrow(READ_ONLY_NOTE)
  expect(JSON.stringify([...memoryIdbEntries()])).toBe(before)
  expect(lock.posts).toHaveLength(posts)
}

beforeEach(() => {
  resetMemoryIdb()
  lock.options.length = 0
  lock.posts.length = 0
  lock.role = 'writer'
})

describe('BrowserStore: a writer tab', () => {
  it('reads an empty state from an empty browser, with the request ID tag it minted (D-ID)', async () => {
    const store = new BrowserStore({ deps, mintTag: () => TAG, mintSecret: () => SECRET })
    expect(await store.load()).toEqual(tagged(emptyPlanState()))
    expect(store.readOnly).toBe(false)
    // The real mint: four Crockford base32 characters, the same for the page until it is stored.
    const minted = new BrowserStore({ deps })
    const tag = (await minted.load()).idTag
    expect(tag).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}$/)
    expect((await minted.load()).idTag).toBe(tag)
    // And a secret of 32 hex characters, the same for the page (M3 recheck).
    const secret = (await minted.load()).idSecret
    expect(secret).toMatch(/^[0-9a-f]{32}$/)
    expect((await minted.load()).idSecret).toBe(secret)
  })

  it('saves plan state at hcp:plan and reads it back, telling the other tabs', async () => {
    const store = new BrowserStore({ deps, mintTag: () => TAG, mintSecret: () => SECRET })
    await store.save(state())
    expect([...memoryIdbEntries().keys()]).toEqual([PLAN_KEY])
    expect(await store.load()).toEqual(tagged(state()))
    expect(lock.posts).toEqual([{ kind: 'plan' }])
    // The tag and the secret are stored with the first write, so a new tab reads the same ones.
    const other = await new BrowserStore({
      deps,
      mintTag: () => 'ZZZZ',
      mintSecret: () => 'f'.repeat(32),
    }).load()
    expect(other.idTag).toBe(TAG)
    expect(other.idSecret).toBe(SECRET)
  })

  it('takes the write lock once, through acquireWriter', async () => {
    const store = new BrowserStore({ deps })
    await store.load()
    await store.save(state())
    await store.listAudit()
    expect(lock.options).toHaveLength(1)
  })

  it('fills lists a state saved before they existed, and refuses a newer state', async () => {
    const { idbSet } = await import('@/data/idb')
    await idbSet(PLAN_KEY, { v: 1, baselineId: null, versions: [] })
    expect(await new BrowserStore({ deps, mintTag: () => TAG, mintSecret: () => SECRET }).load()).toEqual(
      tagged(emptyPlanState()),
    )
    await idbSet(PLAN_KEY, { v: 2 })
    await expect(new BrowserStore({ deps }).load()).rejects.toThrow(/newer version/)
  })

  it('rejects when IndexedDB is unavailable, so start-up can fall back to the sample', async () => {
    failMemoryIdb()
    await expect(new BrowserStore({ deps }).load()).rejects.toThrow('IndexedDB is unavailable.')
  })
})

describe('BrowserStore: a reader tab', () => {
  it('refuses every write with the read-only note and writes nothing', async () => {
    const store = new BrowserStore({
      deps,
      writer: async () => 'reader',
      mintTag: () => TAG,
      mintSecret: () => SECRET,
    })
    expect(await store.load()).toEqual(tagged(emptyPlanState()))
    expect(store.readOnly).toBe(true)
    await expect(store.save(state())).rejects.toThrow(READ_ONLY_NOTE)
    await expect(store.appendAudit(draft(1))).rejects.toThrow(READ_ONLY_NOTE)
    await expect(
      store.lockVersion(
        'fy27-working',
        { kind: 'budget', name: 'FY27 Budget' },
        {
          personId: 'E1',
          name: 'A',
          mode: 'finance',
        },
      ),
    ).rejects.toThrow(READ_ONLY_NOTE)
    expect(memoryIdbEntries().size).toBe(0)
    expect(lock.posts).toEqual([])
  })

  it("reads the writer tab's saves", async () => {
    const writer = new BrowserStore({ deps, writer: async () => 'writer' })
    const reader = new BrowserStore({ deps, writer: async () => 'reader' })
    await writer.save(state())
    await writer.appendAudit(draft(1))
    expect((await reader.load()).versions).toHaveLength(1)
    expect(await reader.listAudit()).toHaveLength(1)
  })

  it('becomes the writer when the writer tab closes', async () => {
    lock.role = 'reader'
    const onPromote = vi.fn()
    const store = new BrowserStore({ deps, onPromote })
    await store.load()
    expect(store.readOnly).toBe(true)
    await expect(store.save(state())).rejects.toThrow(READ_ONLY_NOTE)
    lock.options[0].onPromote?.()
    expect(onPromote).toHaveBeenCalledTimes(1)
    expect(store.readOnly).toBe(false)
    await store.save(state())
    expect((await store.load()).versions).toHaveLength(1)
  })

  it('can be promoted by hand when the lock is injected', async () => {
    const store = new BrowserStore({ deps, writer: async () => 'reader' })
    await store.start()
    store.promote()
    await store.appendAudit(draft(1))
    expect(await store.listAudit()).toHaveLength(1)
  })
})

describe('BrowserStore: a writer the lock demotes', () => {
  // The page lock on the heartbeat (no Web Locks), so it can step aside or lose a tie.
  const page = { handlers: {} as Record<string, (e: unknown) => void> }
  let tabs: FakeTabs

  beforeEach(() => {
    lock.real = true
    tabs = fakeTabs()
    vi.stubGlobal('BroadcastChannel', undefined)
    vi.stubGlobal('window', {
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        page.handlers[type] = fn
      },
    })
  })
  afterEach(() => {
    releaseWriter()
    lock.real = false
    vi.unstubAllGlobals()
  })

  /** This page's lock, on tab 'z', the writer; and a store on it with one audit entry written. */
  async function writerPage(): Promise<BrowserStore> {
    const me = tabs.open('z')
    const role = acquireWriter({ deps: { locks: null, channel: me.channel, timers: me.timers } })
    await tabs.advance(ELECTION_MS)
    expect(await role).toBe('writer')
    const store = new BrowserStore({ deps })
    expect(await store.start()).toBe('writer')
    expect((await store.appendAudit(draft(1))).seq).toBe(1)
    return store
  }

  /** Another tab, writing the shared log while this page reads. */
  const otherTabAppends = async (n: number) =>
    new BrowserStore({ deps, writer: async () => 'writer' }).appendAudit(draft(n))

  /** Promoted again: writes go through, and the next append reads the chain head fresh. */
  async function expectWritesAgain(store: BrowserStore): Promise<void> {
    expect(writerRole()).toBe('writer')
    expect(store.readOnly).toBe(false)
    expect((await store.appendAudit(draft(3))).seq).toBe(3)
    expect(verifyChain(await store.listAudit())).toEqual({ ok: true, count: 3 })
    await store.save(state())
    expect((await store.load()).versions).toHaveLength(1)
  }

  it('refuses every write once the page steps aside into the back-forward cache', async () => {
    const store = await writerPage()
    const other = tabs.open('a')
    const otherLock = new WriterLock(
      { locks: null, channel: other.channel, timers: other.timers },
      { tabId: 'a' },
    )
    const otherRole = otherLock.acquire()
    await tabs.advance(ELECTION_MS)
    expect(await otherRole).toBe('reader')
    page.handlers.pagehide({ persisted: true })
    await tabs.advance(ELECTION_MS)
    expect(writerRole()).toBe('reader')
    expect(otherLock.role).toBe('writer')
    await expectReadOnly(store)
    await otherTabAppends(2)
    // The other tab goes (saying bye): this page takes the lock back.
    otherLock.release()
    await tabs.advance(ELECTION_MS)
    await expectWritesAgain(store)
  })

  it("refuses every write once a lower tab id's beat wins the tie between two writers", async () => {
    const store = await writerPage()
    const other = tabs.open('a')
    // The page lock's id is random (base 36 digits and a counter); '0' sorts below any of them.
    other.channel.postMessage({ writerLock: 'beat', tab: '0' })
    await tabs.settle()
    expect(writerRole()).toBe('reader')
    await expectReadOnly(store)
    await otherTabAppends(2)
    // That tab falls silent: after the takeover wait this page claims and writes again.
    await tabs.advance(TAKEOVER_MS + ELECTION_MS)
    await expectWritesAgain(store)
  })

  it("follows an injected lock's changes of role both ways", async () => {
    const injected = { tell: (_role: WriterRole): void => undefined, subscribed: 0 }
    const store = new BrowserStore({
      deps,
      writer: async () => 'writer',
      onRoleChange: (fn) => {
        injected.tell = fn
        injected.subscribed++
        return () => undefined
      },
    })
    expect((await store.appendAudit(draft(1))).seq).toBe(1)
    injected.tell('reader')
    await expectReadOnly(store)
    await otherTabAppends(2)
    injected.tell('writer')
    expect(store.readOnly).toBe(false)
    expect((await store.appendAudit(draft(3))).seq).toBe(3)
    expect(verifyChain(await store.listAudit())).toEqual({ ok: true, count: 3 })
    expect(injected.subscribed).toBe(1)
  })
})

describe('BrowserStore: the audit log', () => {
  it('chunks 500 entries a key and chains across chunks', async () => {
    const store = new BrowserStore({ deps })
    for (let i = 1; i <= AUDIT_CHUNK + 1; i++) await store.appendAudit(draft(i))
    const entries = memoryIdbEntries()
    expect((entries.get(auditKey(0)) as AuditEntry[]).length).toBe(500)
    expect((entries.get(auditKey(1)) as AuditEntry[]).map((e) => e.seq)).toEqual([501])
    expect([chunkOf(1), chunkOf(500), chunkOf(501)]).toEqual([0, 0, 1])
    const log = await store.listAudit()
    expect(verifyChain(log)).toEqual({ ok: true, count: 501 })
    expect((await store.load()).auditHead).toEqual({ seq: 501, hash: log[500].hash })
  })

  it('lets a new tab continue the chain from the stored chunks', async () => {
    const first = new BrowserStore({ deps })
    await first.appendAudit(draft(1))
    await first.appendAudit(draft(2))
    const next = new BrowserStore({ deps })
    const third = await next.appendAudit(draft(3))
    expect(third.seq).toBe(3)
    expect(verifyChain(await next.listAudit())).toEqual({ ok: true, count: 3 })
  })

  it('keeps its audit head when a state read before an append is saved', async () => {
    const store = new BrowserStore({ deps })
    const before = await store.load()
    const e = await store.appendAudit(draft(1))
    await store.save(before)
    expect((await store.load()).auditHead).toEqual({ seq: 1, hash: e.hash })
  })

  it('keeps the chain whole when appends race', async () => {
    const store = new BrowserStore({ deps })
    await Promise.all(Array.from({ length: 12 }, (_, i) => store.appendAudit(draft(i + 1))))
    expect(verifyChain(await store.listAudit())).toEqual({ ok: true, count: 12 })
  })

  it('filters like MemoryStore', async () => {
    const store = new BrowserStore({ deps })
    for (let i = 1; i <= 4; i++) await store.appendAudit(draft(i))
    expect((await store.listAudit({ limit: 2 })).map((e) => e.seq)).toEqual([3, 4])
    expect((await store.listAudit({ id: 'R-2' })).map((e) => e.seq)).toEqual([2])
  })

  it('refuses a lock that cannot be made, writing nothing', async () => {
    const store = new BrowserStore({ deps })
    await store.save(state())
    await expect(
      store.lockVersion(
        'fy27-working',
        { kind: 'reforecast', name: 'FY27 Q1 Reforecast' },
        {
          personId: 'E1',
          name: 'A',
          mode: 'finance',
        },
      ),
    ).rejects.toThrow('Lock the FY27 Budget before a reforecast.')
    expect(await store.listAudit()).toEqual([])
    expect((await store.load()).versions).toHaveLength(1)
  })
})

describe('BrowserStore: one write, all or nothing (M3 review IN-5)', () => {
  it('commits a state and its entries in one write, and settles the journal into the chunks', async () => {
    const store = new BrowserStore({
      deps,
      writer: async () => 'writer',
      mintTag: () => TAG,
      mintSecret: () => SECRET,
    })
    const added = await store.commit(state(), [draft(1), draft(2)])
    expect(added.map((e) => e.seq)).toEqual([1, 2])
    const blob = memoryIdbEntries().get(PLAN_KEY) as PlanState & { journal?: unknown }
    expect(blob.journal).toBeUndefined()
    expect(blob.auditHead).toEqual({ seq: 2, hash: added[1].hash })
    expect(blob.idTag).toBe(TAG)
    expect((memoryIdbEntries().get(auditKey(0)) as AuditEntry[]).map((e) => e.seq)).toEqual([1, 2])
    expect(lock.posts).toEqual([{ kind: 'plan' }])
  })

  it('writes nothing when an entry cannot be built (a NaN value)', async () => {
    const store = new BrowserStore({
      deps,
      writer: async () => 'writer',
      mintTag: () => TAG,
      mintSecret: () => SECRET,
    })
    await store.commit(state(), [draft(1)])
    const before = JSON.stringify([...memoryIdbEntries()])
    const nan = { ...draft(2), new: Number.NaN }
    await expect(store.commit({ ...state(), requests: [] }, [nan])).rejects.toThrow(/finite number/)
    expect(JSON.stringify([...memoryIdbEntries()])).toBe(before)
  })

  it('writes nothing when the commit point is refused (storage fails)', async () => {
    const store = new BrowserStore({
      deps,
      writer: async () => 'writer',
      mintTag: () => TAG,
      mintSecret: () => SECRET,
    })
    await store.commit(state(), [draft(1)])
    const before = JSON.stringify([...memoryIdbEntries()])
    failMemoryIdb()
    await expect(store.commit(state(), [draft(2)])).rejects.toThrow('IndexedDB is unavailable.')
    failMemoryIdb(null)
    expect(JSON.stringify([...memoryIdbEntries()])).toBe(before)
  })

  it('reads a journal a failure left after the commit point as part of the log, and the next write settles it', async () => {
    const store = new BrowserStore({
      deps,
      writer: async () => 'writer',
      mintTag: () => TAG,
      mintSecret: () => SECRET,
    })
    const [first] = await store.commit(state(), [draft(1)])
    // As a commit whose settle step did not run: the state and the entry are in hcp:plan only.
    const { appendEntry } = await import('../audit/chain')
    const second = appendEntry(first, draft(2))
    const { idbSet } = await import('@/data/idb')
    await idbSet(PLAN_KEY, {
      ...tagged(state()),
      auditHead: { seq: 2, hash: second.hash },
      journal: { replace: false, entries: [second] },
    })
    const reader = new BrowserStore({ deps, writer: async () => 'reader' })
    expect((await reader.listAudit()).map((e) => e.seq)).toEqual([1, 2])
    const next = new BrowserStore({ deps, writer: async () => 'writer' })
    const [third] = await next.commit(state(), [draft(3)])
    expect(third.seq).toBe(3)
    expect(third.prevHash).toBe(second.hash)
    expect((memoryIdbEntries().get(auditKey(0)) as AuditEntry[]).map((e) => e.seq)).toEqual([1, 2, 3])
    expect(verifyChain(await next.listAudit())).toEqual({ ok: true, count: 3 })
  })

  it('refuses a commit in a reader tab and writes nothing', async () => {
    const store = new BrowserStore({ deps, writer: async () => 'reader' })
    await expect(store.commit(state(), [draft(1)])).rejects.toThrow(READ_ONLY_NOTE)
    await expect(store.replaceAudit([])).rejects.toThrow(READ_ONLY_NOTE)
    expect(memoryIdbEntries().size).toBe(0)
  })
})

describe('BrowserStore: replacing the log (C35)', () => {
  const chain = async (n: number): Promise<AuditEntry[]> => {
    const { appendEntry } = await import('../audit/chain')
    const out: AuditEntry[] = []
    for (let i = 1; i <= n; i++)
      out.push(appendEntry(out.at(-1) ?? null, { ...draft(100 + i), byName: 'File' }))
    return out
  }

  it('takes a verified chain in place of the log, the drafts after it, the head following', async () => {
    const store = new BrowserStore({
      deps,
      writer: async () => 'writer',
      mintTag: () => TAG,
      mintSecret: () => SECRET,
    })
    for (let i = 1; i <= 3; i++) await store.appendAudit(draft(i))
    const file = await chain(AUDIT_CHUNK + 2)
    const added = await store.commit(state(), [draft(9)], { replaceAudit: file })
    expect(added[0].seq).toBe(AUDIT_CHUNK + 3)
    expect(added[0].prevHash).toBe(file.at(-1)?.hash)
    const log = await store.listAudit()
    expect(log).toHaveLength(AUDIT_CHUNK + 3)
    expect(log[0].byName).toBe('File')
    expect(verifyChain(log, (await store.load()).auditHead)).toEqual({ ok: true, count: AUDIT_CHUNK + 3 })
    expect((memoryIdbEntries().get(auditKey(1)) as AuditEntry[]).map((e) => e.seq)).toEqual([501, 502, 503])
  })

  it('refuses a chain that does not verify, naming the first broken link, and changes nothing', async () => {
    const store = new BrowserStore({
      deps,
      writer: async () => 'writer',
      mintTag: () => TAG,
      mintSecret: () => SECRET,
    })
    await store.appendAudit(draft(1))
    const before = JSON.stringify([...memoryIdbEntries()])
    const file = await chain(4)
    const broken = file.map((e, i) => (i === 2 ? { ...e, new: 'Approved' } : e))
    await expect(store.replaceAudit(broken)).rejects.toThrow(
      "This file's audit log breaks at entry 3. Nothing was imported.",
    )
    expect(JSON.stringify([...memoryIdbEntries()])).toBe(before)
    await store.replaceAudit(file)
    expect((await store.listAudit()).map((e) => e.byName)).toEqual(['File', 'File', 'File', 'File'])
    expect((await store.load()).auditHead).toEqual({ seq: 4, hash: file[3].hash })
  })
})

describe('BrowserStore: a lost tail of the log (IN-10)', () => {
  it('shows the gap against the stored head and chains on from the head, never reusing a seq', async () => {
    const store = new BrowserStore({
      deps,
      writer: async () => 'writer',
      mintTag: () => TAG,
      mintSecret: () => SECRET,
    })
    for (let i = 1; i <= 5; i++) await store.appendAudit(draft(i))
    const { idbSet } = await import('@/data/idb')
    const chunk = memoryIdbEntries().get(auditKey(0)) as AuditEntry[]
    await idbSet(auditKey(0), chunk.slice(0, 3))
    const next = new BrowserStore({ deps, writer: async () => 'writer' })
    const head = (await next.load()).auditHead
    expect(head?.seq).toBe(5)
    const lost = await next.listAudit()
    expect(verifyChain(lost)).toEqual({ ok: true, count: 3 })
    // The head names entry 5: the log ends at 3, so the chain breaks at entry 4.
    expect(verifyChain(lost, head)).toEqual({ ok: false, count: 3, brokenAt: 4 })
    const e = await next.appendAudit(draft(6))
    expect(e.seq).toBe(6)
    expect(e.prevHash).toBe(head?.hash)
    expect((await next.load()).auditHead).toEqual({ seq: 6, hash: e.hash })
    expect(verifyChain(await next.listAudit())).toEqual({ ok: false, count: 4, brokenAt: 4 })
  })
})
