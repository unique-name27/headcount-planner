/**
 * MemoryStore (docs/PLAN.md 5.4, 16.2 "PlanStore (write refused in a reader tab)"): copies in and out,
 * the store-owned audit head, the chain, filters, refused writes and locks.
 *
 * The successful lock goes through versions.ts `lockedFrom` (engines A). Every refusal is checked
 * before `lockedFrom` runs.
 */
import { describe, expect, it } from 'vitest'
import { verifyChain } from '../audit/chain'
import { fy27Working } from '../engine/fixtures/common'
import type { Actor, AuditDraft, LockedVersion, PlanState } from '../types'
import {
  defaultVersionId,
  emptyPlanState,
  filterAudit,
  lockInto,
  MemoryStore,
  WriteQueue,
} from './memoryStore'
import { type LockContent, READ_ONLY_NOTE } from './types'

const ACTOR: Actor = { personId: 'E10500', name: 'Morgan Ellis', mode: 'finance' }

const draft = (n: number, over: Partial<AuditDraft> = {}): AuditDraft => ({
  at: `2026-09-${String(n).padStart(2, '0')}T09:00`,
  by: 'E10077',
  byName: 'Priya',
  mode: 'hrbp',
  object: 'request',
  id: `R-${n}`,
  field: 'state',
  old: 'Submitted',
  new: 'In review',
  effectiveDate: null,
  comment: null,
  commentAudience: null,
  ...over,
})

const content = (): LockContent => ({ lines: [], assumptions: [], rates: [], forecast: null })

const withWorking = (): PlanState => ({ ...emptyPlanState('sample'), versions: [fy27Working('daily')] })

describe('MemoryStore: state', () => {
  it('starts empty, or with the initial state', async () => {
    expect(await new MemoryStore().load()).toEqual(emptyPlanState())
    expect(await new MemoryStore({ initial: withWorking() }).load()).toEqual(withWorking())
  })

  it('keeps copies: changing what was saved or loaded changes nothing stored', async () => {
    const store = new MemoryStore()
    const mine = withWorking()
    await store.save(mine)
    ;(mine.versions as unknown[]).length = 0
    const loaded = await store.load()
    expect(loaded.versions).toHaveLength(1)
    ;(loaded.versions as unknown[]).length = 0
    expect((await store.load()).versions).toHaveLength(1)
  })

  it('owns the audit head: a state saved from an older read cannot roll it back', async () => {
    const store = new MemoryStore()
    const before = await store.load()
    const e = await store.appendAudit(draft(1))
    await store.save(before)
    expect((await store.load()).auditHead).toEqual({ seq: 1, hash: e.hash })
  })

  it('refuses a state it cannot save', async () => {
    const store = new MemoryStore()
    await expect(store.save({ ...emptyPlanState(), v: 2 } as unknown as PlanState)).rejects.toThrow(
      /can save/,
    )
  })
})

describe('MemoryStore: audit', () => {
  it('numbers, chains and lists entries', async () => {
    const store = new MemoryStore()
    const a = await store.appendAudit(draft(1))
    const b = await store.appendAudit(draft(2))
    expect([a.seq, b.seq]).toEqual([1, 2])
    expect(b.prevHash).toBe(a.hash)
    const log = await store.listAudit()
    expect(verifyChain(log)).toEqual({ ok: true, count: 2 })
    expect((await store.load()).auditHead).toEqual({ seq: 2, hash: b.hash })
  })

  it('keeps the chain whole when appends race', async () => {
    const store = new MemoryStore()
    const entries = await Promise.all(Array.from({ length: 20 }, (_, i) => store.appendAudit(draft(i + 1))))
    expect(entries.map((e) => e.seq).sort((x, y) => x - y)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    )
    expect(verifyChain(await store.listAudit())).toEqual({ ok: true, count: 20 })
  })

  it('continues a log it was given', async () => {
    const first = new MemoryStore()
    await first.appendAudit(draft(1))
    await first.appendAudit(draft(2))
    const store = new MemoryStore({ audit: await first.listAudit() })
    const third = await store.appendAudit(draft(3))
    expect(third.seq).toBe(3)
    expect(verifyChain(await store.listAudit())).toEqual({ ok: true, count: 3 })
  })

  it('filters by object, id, who and when, and keeps the newest n', async () => {
    const store = new MemoryStore()
    await store.appendAudit(draft(1, { object: 'position', id: 'P-1' }))
    await store.appendAudit(draft(2, { by: 'E1' }))
    await store.appendAudit(draft(3, { at: '2026-09-03T23:59' }))
    await store.appendAudit(draft(4))
    const ids = async (f: Parameters<MemoryStore['listAudit']>[0]) =>
      (await store.listAudit(f)).map((e) => e.seq)
    expect(await ids({ objects: ['position'] })).toEqual([1])
    expect(await ids({ id: 'R-2' })).toEqual([2])
    expect(await ids({ by: 'E1' })).toEqual([2])
    expect(await ids({ from: '2026-09-02', to: '2026-09-03' })).toEqual([2, 3])
    expect(await ids({ from: '2026-09-02T09:00', to: '2026-09-03T09:00' })).toEqual([2])
    expect(await ids({ limit: 2 })).toEqual([3, 4])
    expect(await ids({ objects: ['request'], limit: 1 })).toEqual([4])
    expect(await ids({ limit: 0 })).toEqual([])
    expect(filterAudit([], { limit: 5 })).toEqual([])
  })
})

describe('MemoryStore: a reader tab', () => {
  it('refuses every write with the read-only note, and still reads', async () => {
    const store = new MemoryStore({ readOnly: true, initial: withWorking() })
    expect(store.readOnly).toBe(true)
    await expect(store.save(emptyPlanState())).rejects.toThrow(READ_ONLY_NOTE)
    await expect(store.appendAudit(draft(1))).rejects.toThrow(READ_ONLY_NOTE)
    await expect(
      store.lockVersion('fy27-working', { kind: 'budget', name: 'FY27 Budget' }, ACTOR),
    ).rejects.toThrow(READ_ONLY_NOTE)
    expect(await store.load()).toEqual(withWorking())
    expect(await store.listAudit()).toEqual([])
    expect(READ_ONLY_NOTE).toBe('Read only: Headcount Planner is open in another tab.')
  })
})

describe('MemoryStore: locks', () => {
  it('refuses an unknown or retired Working, a used ID and a reforecast before the Budget', async () => {
    const deps = { computeLock: content, now: () => '2026-10-01T09:00' }
    const store = new MemoryStore({ initial: withWorking(), deps })
    await expect(
      store.lockVersion('fy26-working', { kind: 'budget', name: 'FY26 Budget' }, ACTOR),
    ).rejects.toThrow('There is no Working version fy26-working to lock.')
    await expect(
      store.lockVersion('fy27-working', { kind: 'reforecast', name: 'FY27 Q1 Reforecast' }, ACTOR),
    ).rejects.toThrow('Lock the FY27 Budget before a reforecast.')
    const taken = new MemoryStore({
      initial: withWorking(),
      deps: { ...deps, newVersionId: () => 'fy27-working' },
    })
    await expect(
      taken.lockVersion('fy27-working', { kind: 'budget', name: 'FY27 Budget' }, ACTOR),
    ).rejects.toThrow('The version ID fy27-working is already used.')
    const retired = new MemoryStore({
      initial: { ...emptyPlanState(), versions: [fy27Working('daily', { state: 'retired' })] },
      deps,
    })
    await expect(
      retired.lockVersion('fy27-working', { kind: 'budget', name: 'FY27 Budget' }, ACTOR),
    ).rejects.toThrow(/no Working version/)
    const noLock = new MemoryStore({ initial: withWorking() })
    await expect(
      noLock.lockVersion('fy27-working', { kind: 'budget', name: 'FY27 Budget' }, ACTOR),
    ).rejects.toThrow(/no way to compute a lock/)
    expect(await store.listAudit()).toEqual([])
  })

  it('names a new version from its name, never reusing an ID', () => {
    const w = fy27Working()
    expect(defaultVersionId(w, { kind: 'reforecast', name: 'FY27 Q2 Reforecast' }, new Set())).toBe(
      'fy27-q2-reforecast',
    )
    expect(
      defaultVersionId(
        w,
        { kind: 'reforecast', name: 'FY27 Q2 Reforecast' },
        new Set(['fy27-q2-reforecast']),
      ),
    ).toBe('fy27-q2-reforecast-2')
    expect(defaultVersionId(w, { kind: 'budget', name: '   ' }, new Set())).toBe('fy27-budget')
  })

  it('locks into a new version, leaves Working editable and writes the audit entry (needs versions.lockedFrom)', async () => {
    const at = '2026-03-31T18:00'
    const store = new MemoryStore({ initial: withWorking(), deps: { computeLock: content, now: () => at } })
    const locked: LockedVersion = await store.lockVersion(
      'fy27-working',
      { kind: 'budget', name: 'FY27 Budget' },
      ACTOR,
    )
    expect(locked).toMatchObject({
      versionId: 'fy27-budget',
      kind: 'budget',
      state: 'locked',
      parentId: 'fy27-working',
      lockedBy: ACTOR.personId,
    })
    expect(locked.hash).toMatch(/^sha256-[0-9a-f]{64}$/)
    const state = await store.load()
    expect(state.versions.map((v) => [v.versionId, v.state])).toEqual([
      ['fy27-working', 'working'],
      ['fy27-budget', 'locked'],
    ])
    const [entry] = await store.listAudit()
    expect(entry).toMatchObject({
      object: 'version',
      id: 'fy27-budget',
      field: 'locked',
      by: 'E10500',
      mode: 'finance',
    })
    expect(entry.new).toMatchObject({ kind: 'budget', parentId: 'fy27-working', hash: locked.hash })
    // A second Budget for the year is refused.
    await expect(
      store.lockVersion('fy27-working', { kind: 'budget', name: 'FY27 Budget again' }, ACTOR),
    ).rejects.toThrow()
  })

  it('lockInto changes nothing it was given', () => {
    const state = withWorking()
    const before = JSON.stringify(state)
    expect(() =>
      lockInto(state, 'nope', { kind: 'budget', name: 'x' }, ACTOR, '2026-03-31T18:00', {
        computeLock: content,
      }),
    ).toThrow()
    expect(JSON.stringify(state)).toBe(before)
  })
})

describe('WriteQueue', () => {
  it('runs writes one after another, and goes on after a failure', async () => {
    const q = new WriteQueue()
    const order: number[] = []
    const slow = q.run(async () => {
      await new Promise((r) => setTimeout(r, 5))
      order.push(1)
    })
    const failing = q.run(() => {
      order.push(2)
      throw new Error('no')
    })
    const fast = q.run(() => order.push(3))
    await slow
    await expect(failing).rejects.toThrow('no')
    await fast
    expect(order).toEqual([1, 2, 3])
  })
})
