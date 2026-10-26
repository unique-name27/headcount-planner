/**
 * The write path (docs/PLAN.md 5.4, 16.2 "PlanStore (write refused in a reader tab)"; M3): `runAction`
 * saves `storedFor(next, sample)` (the overlay against the sample's baseline) and appends the audit
 * drafts in order, so a reload of the store keeps the change; a reader tab refuses before anything is
 * written, over a MemoryStore and over the BrowserStore with an injected write lock; a store write
 * that rejects comes back as a refusal; and the PlanStore's own `computeLock` (src/app/boot.ts) is
 * the write path's lock computation over the registered context.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { verifyChain } from '@/plan/audit/chain'
import { BrowserStore } from '@/plan/store/browserStore'
import { MemoryStore } from '@/plan/store/memoryStore'
import { type PlanStore, type PlanStoreDeps, READ_ONLY_NOTE } from '@/plan/store/types'
import type { WorkingVersion } from '@/plan/types'
import { resetMemoryIdb } from '@/testkit/memoryIdb'
import { leakSample, personaOf, pickOf, picksWith, sampleCtx } from '@/testkit/sample'
import { appPlanStore } from '../boot'
import { planInForce, storedFor } from '../planState'
import { computeLockNow, lockContentOf, setLockContext } from './lock'
import { runAction, saveResult, type WriteDeps } from './run'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

/** Called after each store write tells the other tabs (the IN-5 case demotes the writer there). */
const afterPost = vi.hoisted(() => ({ hook: null as (() => void) | null }))
vi.mock('@/data/tabSync', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/tabSync')>()
  return {
    ...real,
    postToTabs: (m: Parameters<typeof real.postToTabs>[0]) => {
      real.postToTabs(m)
      afterPost.hook?.()
    },
  }
})

let s: Sample
let mgrCtx: AnalyticsContext
beforeAll(() => {
  s = leakSample()
  const a = personaOf(s, 'manager-a')
  mgrCtx = sampleCtx('manager', { picks: picksWith(s, 'manager', pickOf(a)) })
}, 120_000)
afterEach(() => {
  resetMemoryIdb()
  setLockContext(null)
  afterPost.hook = null
})

const AT = '2026-09-30T10:00:00.000Z'
const draftInput = () => {
  const a = personaOf(s, 'manager-a')
  return {
    type: 'New role' as const,
    managerPositionId: a.positionId,
    level: 'P3' as const,
    location: 'San Jose',
    fte: 1,
    startDate: '2027-01-04',
    reasonCode: 'Growth' as const,
  }
}

describe('runAction', () => {
  it('saves only what differs from the sample’s plan, appends the drafts in order, and a reload keeps it', async () => {
    const store = new MemoryStore({ initial: storedFor(s.plan, s.plan), deps: { now: () => AT } })
    let reloaded = 0
    const deps: WriteDeps = {
      store,
      ctx: mgrCtx,
      sample: s.plan,
      now: () => AT,
      reload: async () => void reloaded++,
    }
    const out = await runAction(deps, 'createRequest', draftInput())
    expect(out.ok).toBe(true)
    expect(reloaded).toBe(1)
    const stored = await store.load()
    // The overlay against the sample's baseline: the new draft and nothing of the sample's own.
    expect(stored.baselineId).toBe(s.plan.baselineId)
    expect(stored.versions).toEqual([])
    expect(stored.closes).toEqual([])
    expect(stored.requests.map((r) => r.state)).toEqual(['Draft'])
    const log = await store.listAudit()
    expect(log.map((e) => [e.seq, e.object, e.field, e.by])).toEqual([
      [1, 'request', 'state', personaOf(s, 'manager-a').employeeId],
    ])
    expect(verifyChain(log).ok).toBe(true)
    expect(stored.auditHead).toEqual({ seq: 1, hash: log[0].hash })
    // A reload lays the stored state over the sample's plan again: the draft is in force.
    const plan = planInForce(stored, s.plan)
    expect(plan.requests.map((r) => r.requestId)).toEqual(stored.requests.map((r) => r.requestId))
    expect(plan.versions).toBe(s.plan.versions)
  })

  it('refuses in a reader tab before the action runs, and writes nothing', async () => {
    const store = new MemoryStore({ initial: s.plan, readOnly: true })
    const out = await runAction(
      { store, ctx: mgrCtx, sample: null, now: () => AT },
      'createRequest',
      draftInput(),
    )
    expect(out).toEqual({ ok: false, refused: READ_ONLY_NOTE })
    expect(await store.listAudit()).toEqual([])
  })

  it('refuses in a reader tab over the BrowserStore with an injected write lock', async () => {
    const deps: PlanStoreDeps = {
      now: () => AT,
      computeLock: () => ({ lines: [], assumptions: [], rates: [], forecast: null }),
      newVersionId: () => 'x',
    }
    const reader = new BrowserStore({ deps, writer: async () => 'reader' })
    await reader.start()
    expect(reader.readOnly).toBe(true)
    const refused = await runAction(
      { store: reader, ctx: mgrCtx, sample: s.plan, now: () => AT },
      'createRequest',
      draftInput(),
    )
    expect(refused).toEqual({ ok: false, refused: READ_ONLY_NOTE })
    expect(await reader.listAudit()).toEqual([])

    const writer = new BrowserStore({ deps, writer: async () => 'writer' })
    await writer.start()
    const ok = await runAction(
      { store: writer, ctx: mgrCtx, sample: s.plan, now: () => AT },
      'createRequest',
      draftInput(),
    )
    expect(ok.ok).toBe(true)
    expect((await writer.listAudit()).length).toBe(1)
    expect((await writer.load()).requests.length).toBe(1)
  })

  it('comes back as a refusal when the store rejects mid-write (the tab became a reader)', async () => {
    const store = new MemoryStore({ initial: s.plan })
    const rejecting: PlanStore = {
      readOnly: false,
      load: () => store.load(),
      save: async () => {
        throw new Error(READ_ONLY_NOTE)
      },
      commit: async () => {
        throw new Error(READ_ONLY_NOTE)
      },
      replaceAudit: (e) => store.replaceAudit(e),
      lockVersion: (...a) => store.lockVersion(...a),
      appendAudit: (e) => store.appendAudit(e),
      listAudit: (f) => store.listAudit(f),
    }
    const out = await runAction(
      { store: rejecting, ctx: mgrCtx, sample: null, now: () => AT },
      'createRequest',
      draftInput(),
    )
    expect(out).toEqual({ ok: false, refused: READ_ONLY_NOTE })
    expect(await store.listAudit()).toEqual([])
  })

  it('saves the state and its entries as one write: a writer demoted between them stores nothing (IN-5)', async () => {
    // M3 review IN-5: the old path saved, then appended; a writer that stepped aside in between kept
    // the change with no entry. The BrowserStore's role turns to reader after its first write.
    const deps: PlanStoreDeps = {
      now: () => AT,
      computeLock: () => ({ lines: [], assumptions: [], rates: [], forecast: null }),
      newVersionId: () => 'x',
    }
    let follow: ((role: 'writer' | 'reader') => void) | null = null
    const store = new BrowserStore({
      deps,
      writer: async () => 'writer',
      onRoleChange: (l) => {
        follow = l
        return () => undefined
      },
    })
    await store.start()
    // The page steps aside right after the store's first write: a second write would meet a reader.
    afterPost.hook = () => follow?.('reader')
    const out = await runAction(
      { store, ctx: mgrCtx, sample: s.plan, now: () => AT },
      'createRequest',
      draftInput(),
    )
    expect(out.ok).toBe(true)
    expect(store.readOnly).toBe(true)
    const log = await store.listAudit()
    expect(log.map((e) => [e.object, e.field])).toEqual([['request', 'state']])
    expect((await store.load()).requests).toHaveLength(1)
    expect((await store.load()).auditHead).toEqual({ seq: 1, hash: log[0].hash })
  })

  it('stores nothing when an entry cannot be written, in either store (IN-5)', async () => {
    const small = { ...s.plan, versions: [], closes: [], adjustments: [] }
    const memory = new MemoryStore({ initial: small })
    const before = await memory.load()
    const bad = { ...(await memory.load()), requests: [] }
    const draft = {
      at: AT,
      by: 'E1',
      byName: 'A',
      mode: 'hr-admin' as const,
      object: 'assumption' as const,
      id: 'x',
      field: 'value',
      old: 1,
      new: Number.NaN,
      effectiveDate: null,
      comment: null,
      commentAudience: null,
    }
    const out = await saveResult(
      { store: memory, ctx: mgrCtx, sample: null, now: () => AT },
      { ok: true, next: bad, audit: [draft], notice: 'Saved.' },
    )
    expect(out.ok).toBe(false)
    expect(await memory.load()).toEqual(before)
    expect(await memory.listAudit()).toEqual([])

    const deps: PlanStoreDeps = {
      now: () => AT,
      computeLock: () => ({ lines: [], assumptions: [], rates: [], forecast: null }),
      newVersionId: () => 'x',
    }
    const browser = new BrowserStore({ deps, writer: async () => 'writer', mintTag: () => 'K7QM' })
    await browser.start()
    await browser.save({ ...small, requests: [] })
    const kept = await browser.load()
    await expect(browser.commit({ ...kept, requests: small.requests }, [draft])).rejects.toThrow(
      /finite number/,
    )
    expect(await browser.load()).toEqual(kept)
    expect(await browser.listAudit()).toEqual([])
  })

  it('passes a refusal through saveResult untouched and writes nothing', async () => {
    const store = new MemoryStore({ initial: s.plan })
    expect(
      await saveResult({ store, ctx: mgrCtx, sample: null, now: () => AT }, { ok: false, refused: 'No.' }),
    ).toEqual({
      ok: false,
      refused: 'No.',
    })
    expect(await store.listAudit()).toEqual([])
  })
})

describe('the PlanStore’s computeLock (src/app/boot.ts)', () => {
  it('is the write path’s lock content over the registered context, and says so while nothing is registered', () => {
    const working = s.plan.versions.find((v) => v.versionId === 'fy27-working') as WorkingVersion
    expect(() => computeLockNow(working, AT)).toThrow(/still loading/)
    const ctx = sampleCtx('finance')
    setLockContext(() => ctx)
    const content = computeLockNow(working, AT)
    const direct = lockContentOf(ctx, working, AT)
    expect(content.lines.length).toBe(direct.lines.length)
    expect(content.assumptions).toEqual(direct.assumptions)
    // The year has a Budget, so the next lock is a reforecast and stores its forecast.
    expect(content.forecast?.closedThrough).toBe('2026-09')
    // boot's store reads the same computation.
    const store = appPlanStore() as BrowserStore
    const viaBoot = store.options.deps.computeLock(working, AT)
    expect(viaBoot.lines.length).toBe(direct.lines.length)
  })
})
