/**
 * My team after writes (docs/PLAN.md 6.9, 15.1 R2 and R2b; M3): the analytics context's datasets hold
 * plan state's Working overlay (src/plan/store/overlay.ts, applied once in `buildContext`), so My
 * team reads an approval's rows once and never appends them again. Manager A drafts a New role for
 * their team, submits it, and each approver decides it acting as themselves: My team shows it pending
 * (Pending + 1, the allocation unchanged), then approved (Allocation, Planned and Left to fill + 1,
 * the new seat listed once, Pending back), and the HRBP's Working edit of the new seat reads "Changed
 * by your HRBP" in My team. Every entry is signed by its step's person; the chain verifies.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { approveAll, chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf } from '@/testkit/sample'
import { requestIdIn } from '@/views/plan/engine/edits'
import { ID } from '../metrics'
import { teamFacts } from './facts'
import { teamModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const value = (m: ReturnType<typeof teamModel>, id: string) => m.kpis.find((k) => k.metricId === id)?.value

describe('My team after an approved New role', () => {
  it('counts the new seat once, from the rows the approval wrote', async () => {
    const sc = scenario()
    const a = personaOf(s, 'manager-a')
    const me: Who = { mode: 'manager', personId: a.employeeId }
    const m0 = teamModel(await sc.ctx(me))
    const draft = await sc.run(me, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'Munich',
      fte: 1,
      startDate: '2026-12-01',
      reasonCode: 'Growth',
      jobTitle: 'Account Executive',
    })
    expect(draft.outcome.ok).toBe(true)
    // Request IDs carry the workspace's tag (D-ID): R-<tag>-<n>.
    const rid = requestIdIn(draft.outcome.ok ? draft.outcome.notice : '') as string
    expect((await sc.run(me, 'submitRequest', { requestId: rid })).outcome.ok).toBe(true)

    const m1 = teamModel(await sc.ctx(me))
    expect(value(m1, ID.requestsPending)).toBe((value(m0, ID.requestsPending) as number) + 1)
    expect(value(m1, ID.allocationHeads)).toBe(value(m0, ID.allocationHeads))

    const steps = await approveAll(sc, rid)
    expect(steps.every((x) => x.outcome.ok)).toBe(true)
    expect((await sc.request(rid))?.state).toBe('Approved')
    const ctx2 = await sc.ctx(me)
    const m2 = teamModel(ctx2)
    for (const id of [ID.allocationHeads, ID.allocationPlanned])
      expect(value(m2, id), id).toBe((value(m0, id) as number) + 1)
    expect(m2.hero.value).toBe((m0.hero.value as number) + 1)
    expect(value(m2, ID.requestsPending)).toBe(value(m0, ID.requestsPending))
    // The approval's row is in the context's datasets once, and the allocation lists its seat once.
    const added = ctx2.all.positions.filter((r) => r.sourceRequestId === rid)
    expect(added).toHaveLength(1)
    const id = added[0].positionId
    expect(teamFacts(ctx2).seats.planned.filter((p) => p.positionId === id)).toHaveLength(1)

    // The HRBP moves the new seat's start in Working; the manager reads it on My team.
    const hrbp: Who = { mode: 'hrbp', personId: 'E11076', unit: a.businessUnit }
    const edit = await sc.run(hrbp, 'editSeat', {
      positionId: id,
      changes: { startDate: '2027-02-01' },
      reason: 'Start after the January sales kickoff',
    })
    expect(edit.outcome.ok).toBe(true)
    const m3 = teamModel(await sc.ctx(me))
    expect(m3.hrbpChanges.rows[0]).toMatchObject({
      positionId: id,
      change: 'Changed by your HRBP: start moved from Dec 2026 to Feb 2027',
      reason: 'Start after the January sales kickoff',
    })
    // An HRBP edit changes no allocation (R2).
    expect(value(m3, ID.allocationHeads)).toBe(value(m2, ID.allocationHeads))
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)
})
