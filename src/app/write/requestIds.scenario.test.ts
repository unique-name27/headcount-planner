/**
 * Request IDs through the write path (M3 review D-ID): two browsers (two workspaces, two tags) never
 * mint the same ID, so Import requests merges both drafts (IN-1, where both read "Draft R-1128
 * saved." and one was dropped); and Manager C's next ID is the same with and without the HRBP's
 * confidential Elimination of C's seat made in the same workspace (SC-13, 8.4 rule 3). M3 recheck:
 * the ID of a request a limited view shows without its requester names nobody (the lane of a public
 * hash of the person ID named the HRBP): its number comes from the workspace's secret.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { requestView, viewerOf } from '@/access/visibility'
import type { Sample } from '@/data/sample'
import { requestRecord } from '@/drill/requestRecord'
import { requestsOf } from '@/drill/seats'
import { parseTaggedId, requestIdInText } from '@/plan/actions/requestIds'
import type { HcRequest } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf, pinClock, unpinClock } from '@/testkit/sample'
import { actionEnvOf } from './context'
import { chainOk, hrbpUnitOf, said, scenario, type Who } from './scenario.testkit'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

const newRole = (managerPositionId: string) => ({
  type: 'New role' as const,
  managerPositionId,
  level: 'P3' as const,
  location: 'San Jose',
  fte: 1,
  startDate: '2027-01-04',
  reasonCode: 'Growth' as const,
})

describe('request IDs across browsers (IN-1)', () => {
  it('gives each workspace its own tag, so a merge keeps both drafts', async () => {
    const a = personaOf(s, 'manager-a')
    const b = personaOf(s, 'manager-b')
    const aWho: Who = { mode: 'manager', personId: a.employeeId }
    const bWho: Who = { mode: 'manager', personId: b.employeeId }
    const one = scenario({ idTag: 'AAAA' })
    const two = scenario({ idTag: 'BBBB' })
    const da = await one.run(aWho, 'createRequest', newRole(a.positionId))
    const db = await two.run(bWho, 'createRequest', newRole(b.positionId))
    const ida = requestIdInText(said(da.outcome)) as string
    const idb = requestIdInText(said(db.outcome)) as string
    expect(parseTaggedId(ida)?.tag).toBe('AAAA')
    expect(parseTaggedId(idb)?.tag).toBe('BBBB')
    expect(ida).not.toBe(idb)
    // The same person on two devices: still two IDs.
    const db2 = await two.run(aWho, 'createRequest', newRole(a.positionId))
    expect(requestIdInText(said(db2.outcome))).not.toBe(ida)

    // HR admin, in a third browser, imports both workspaces' requests: both drafts are in force.
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const three = scenario({ idTag: 'CCCC' })
    const own = async (sc: typeof one) => (await sc.plan()).requests
    const out = await three.run(admin, 'importRequests', {
      files: [
        { name: 'a.hcplan.json', kind: 'requests', requests: await own(one), skipped: 0 },
        { name: 'b.hcplan.json', kind: 'requests', requests: await own(two), skipped: 0 },
      ],
    })
    expect(out.outcome.ok).toBe(true)
    const inForce = requestsOf(await three.ctx(admin)).map((r) => r.requestId)
    for (const id of [ida, idb, requestIdInText(said(db2.outcome)) as string]) expect(inForce).toContain(id)
    expect(chainOk(await three.log())).toBe(true)
  })
})

describe("Manager C's next request ID (SC-13)", () => {
  it('is the same with and without the confidential Elimination of C’s seat', async () => {
    const c = personaOf(s, 'manager-c')
    const cWho: Who = { mode: 'manager', personId: c.employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const planted = requestsOf(await scenario().ctx(admin)).find(
      (r) => r.requestId === s.planted.managerCElimination,
    )
    const hrbpId = planted?.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const hrbp: Who = { mode: 'hrbp', personId: hrbpId, unit: hrbpUnitOf(s)(hrbpId) }

    const plain = scenario()
    const withElim = scenario()
    const drafted = await withElim.run(hrbp, 'requestElimination', {
      positionId: c.positionId,
      lastDay: '2027-03-31',
      reasonCode: 'Restructure',
      confidential: true,
    })
    expect(said(drafted.outcome)).toMatch(/^Draft R-TEST-\d+ saved\.$/)

    const nextOf = async (sc: typeof plain) => actionEnvOf(await sc.ctx(cWho)).ids.request()
    expect(await nextOf(withElim)).toBe(await nextOf(plain))
    // C's own draft takes that ID in both.
    const team = s.datasets.positions.find((p) => p.managerPositionId === c.positionId)?.positionId as string
    const a = await plain.run(cWho, 'createRequest', newRole(team))
    const b = await withElim.run(cWho, 'createRequest', newRole(team))
    expect(said(b.outcome)).toBe(said(a.outcome))
    expect(said(a.outcome)).toMatch(/^Draft R-TEST-\d+ saved\.$/)
  })
})

describe('a request ID a limited view shows (M3 recheck)', () => {
  it('names nobody: its number comes from the workspace’s secret, not from the requester', async () => {
    const c = personaOf(s, 'manager-c')
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const planted = requestsOf(await scenario().ctx(admin)).find(
      (r) => r.requestId === s.planted.managerCElimination,
    )
    const hrbpId = planted?.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const hrbp: Who = { mode: 'hrbp', personId: hrbpId, unit: hrbpUnitOf(s)(hrbpId) }
    const elimination = {
      positionId: c.positionId,
      lastDay: '2027-03-31',
      reasonCode: 'Restructure' as const,
      confidential: true,
    }
    const idIn = async (sc: ReturnType<typeof scenario>) => {
      const out = await sc.run(hrbp, 'requestElimination', elimination)
      const id = requestIdInText(said(out.outcome)) as string
      expect((await sc.run(hrbp, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
      return id
    }
    const one = scenario({ idTag: 'K7QM' })
    const id = await idIn(one)
    // Finance and an off-chain Leader see the ID, never the requester.
    const req = (await one.request(id)) as HcRequest
    for (const who of [
      { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId },
      { mode: 'leader', personId: personaOf(s, 'leader-cfo').employeeId },
    ] as const) {
      const ctx = await one.ctx(who)
      const viewer = viewerOf(ctx)
      expect(requestView(req, viewer), who.mode).toBe('limited')
      const rec = requestRecord(req, { viewer, asOf: ctx.asOf, nameOf: () => 'name' })
      expect(rec?.requestId, who.mode).toBe(id)
      expect(rec?.requesterId ?? null, who.mode).toBeNull()
    }
    // The same person, the same steps, under the same tag in a workspace with another secret: another
    // number. So the ID is no function of the person ID that anyone without the secret can work out.
    const other = scenario({ idTag: 'K7QM', idSecret: 'fedcba9876543210fedcba9876543210' })
    const again = await idIn(other)
    expect(parseTaggedId(again)?.tag).toBe('K7QM')
    expect(again).not.toBe(id)
    // The HRBP's next ID in the first workspace shares no lane (number mod 1,000) with the first:
    // nothing ties two IDs to one requester.
    const next = actionEnvOf(await one.ctx(hrbp)).ids.request()
    expect(next).not.toBe(id)
    expect((parseTaggedId(next)?.n as number) % 1000).not.toBe((parseTaggedId(id)?.n as number) % 1000)
    // A fresh workspace with the same tag and secret mints the same ID: stable from run to run.
    expect(await idIn(scenario({ idTag: 'K7QM' }))).toBe(id)
  }, 300_000)
})
