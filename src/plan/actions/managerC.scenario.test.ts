/**
 * The elimination of Manager C's seat (docs/PLAN.md 8.4 rules 3 and 8, 13.3, 16.1 (a), 17 M3), walked
 * through the write path: the confidential Elimination R-1035 is approved at each step by its
 * approvers acting as themselves (the HRBP, then the leader), and Manager C and the manager below C
 * see nothing of it (their crawls are equal before and after; HR admin's differ, the control), and
 * every action C could take on it is refused with words that say nothing about it. With and without
 * the Elimination (removed after generation), a New role and a Trade drafted and submitted by C and by
 * the manager below C through the write path store the same chain, the leader step included (the
 * unit's target is set to its asks without the Elimination, so counting it would flip out of plan).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { approveAll, chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import type { HcRequest } from '@/plan/types'
import { type Crawl, crawl } from '@/testkit/crawl'
import { holding } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { routingCase } from '@/testkit/routing'
import { leakSample, personaOf, pinClock, unpinClock, withoutRequest } from '@/testkit/sample'
import { NOT_FOUND_TEXT } from './copy'
import { requestIdInText } from './requestIds'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

const json = (c: Crawl): string => JSON.stringify(c.snapshot())
const idOf = (text: string): string => requestIdInText(text) ?? ''

/** The holder of a seat in C's team that others report to: the manager below C. */
function managerBelow(x: Sample, cSeat: string): { personId: string; seat: string } {
  const seat = x.datasets.positions.find(
    (q) =>
      q.managerPositionId === cSeat && x.datasets.positions.some((r) => r.managerPositionId === q.positionId),
  )?.positionId as string
  const personId = x.datasets.workers.find((w) => w.positionId === seat && !w.assignmentEnd)
    ?.employeeId as string
  return { personId, seat }
}

describe('the Elimination of Manager C’s seat, approved through the write path', () => {
  it('is approved by its approvers, and Manager C and the manager below see nothing of it', async () => {
    const c = personaOf(s, 'manager-c')
    const elim = s.planted.managerCElimination
    const below = managerBelow(s, c.positionId)
    const sc = scenario()
    const cWho: Who = { mode: 'manager', personId: c.employeeId }
    const belowWho: Who = { mode: 'manager', personId: below.personId }
    const crawlOf = async (who: Who) => crawl(await sc.ctx(who), { cards: false })
    const before = { c: await crawlOf(cWho), below: await crawlOf(belowWho) }
    const adminWho: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const adminBefore = crawl(await sc.ctx(adminWho), { views: ['requests'], cards: false })

    // C cannot act on it, and every refusal reads exactly as one for an ID that does not exist
    // (review SC-13): the answer never tells C that a request stands behind the ID.
    for (const [name, input] of [
      ['approveRequest', { requestId: elim }],
      ['withdrawRequest', { requestId: elim }],
      ['commentOnRequest', { requestId: elim, text: 'Why?', audience: 'everyone' as const }],
      ['sendBack', { requestId: elim, reason: 'Not now' }],
      ['submitRequest', { requestId: elim }],
    ] as const) {
      const out = await sc.run(cWho, name, input as never)
      expect(out.outcome, name).toEqual({ ok: false, refused: NOT_FOUND_TEXT })
      expect(out.entries).toEqual([])
      for (const unknown of ['R-9999', 'R-TEST-9001']) {
        const other = await sc.run(cWho, name, { ...input, requestId: unknown } as never)
        expect(other.outcome, `${name} ${unknown}`).toEqual(out.outcome)
      }
    }

    const steps = await approveAll(sc, elim)
    expect(steps.map((x) => x.outcome.ok)).toEqual(steps.map(() => true))
    expect(steps.length).toBe(2)
    const req = (await sc.request(elim)) as HcRequest
    expect(req.state).toBe('Approved')
    expect(chainOk(await sc.log())).toBe(true)
    const plan = await sc.plan()
    expect(plan.overlay.positions.find((r) => r.positionId === c.positionId)).toMatchObject({
      status: 'Eliminated',
      endDate: '2026-12-31',
      effectiveDate: '2027-01-01',
      sourceRequestId: elim,
    })

    // Manager C's and the manager below's crawls are unchanged; neither holds the request's ID.
    const after = { c: await crawlOf(cWho), below: await crawlOf(belowWho) }
    for (const k of ['c', 'below'] as const) {
      expect(after[k].errors, k).toEqual([])
      expect(json(after[k]), k).toBe(json(before[k]))
      expect(holding(after[k].seen, elim), k).toEqual([])
      expect(after[k].seen.length, k).toBeGreaterThan(200)
    }
    // Control: HR admin sees the approval.
    const adminAfter = crawl(await sc.ctx(adminWho), { views: ['requests'], cards: false })
    expect(holding(adminAfter.seen, elim).length).toBeGreaterThan(0)
    expect(json(adminAfter)).not.toBe(json(adminBefore))
  }, 300_000)

  it('routes C’s and the manager below’s New role and Trade the same with and without it (8.4 rule 8)', async () => {
    const c = personaOf(s, 'manager-c')
    const elim = s.planted.managerCElimination
    const k = routingCase(s, s, withoutRequest(s, elim).sample)
    const chains: Record<'with' | 'without', string[]> = { with: [], without: [] }
    for (const [key, x] of [
      ['with', k.withIt],
      ['without', k.without],
    ] as const) {
      const sc = scenario({ sample: x })
      for (const [who, seat, give] of [
        [c.employeeId, c.positionId, k.giveSeats[0]],
        [k.below.personId, k.below.seat, k.giveSeats[1]],
      ] as const) {
        const mgr: Who = { mode: 'manager', personId: who }
        const role = await sc.run(mgr, 'createRequest', {
          type: 'New role',
          managerPositionId: seat,
          level: 'P3',
          location: 'San Jose',
          fte: 1,
          startDate: '2026-12-01',
          reasonCode: 'Growth',
        })
        expect(role.outcome.ok, role.outcome.ok ? '' : role.outcome.refused).toBe(true)
        const roleId = idOf(role.outcome.ok ? role.outcome.notice : '')
        expect((await sc.run(mgr, 'submitRequest', { requestId: roleId })).outcome.ok).toBe(true)
        const trade = await sc.run(mgr, 'createTrade', {
          ask: {
            give: [give],
            creditUsedBp: 0,
            giveOrgPositionId: null,
            get: {
              level: 'P3',
              location: 'San Jose',
              fte: 1,
              orgPositionId: seat,
              businessUnit: k.unit,
              jobFamily: 'Supply Chain',
              start: '2027-01-04',
              count: 1,
              partTimeRest: false,
            },
          },
          reasonCode: 'Level mix',
        })
        expect(trade.outcome.ok, trade.outcome.ok ? '' : trade.outcome.refused).toBe(true)
        const tradeId = idOf(trade.outcome.ok ? trade.outcome.notice : '')
        expect((await sc.run(mgr, 'submitRequest', { requestId: tradeId })).outcome.ok).toBe(true)
        for (const id of [roleId, tradeId]) {
          const r = (await sc.request(id)) as HcRequest
          chains[key].push(
            `${r.type}: ${r.steps.map((x) => `${x.role} ${x.approverId} ${x.reasons.join('+')}`).join(', ')}`,
          )
        }
      }
    }
    expect(chains.with).toEqual(chains.without)
    // Both New roles go to the leader: out of plan against the target without the Elimination.
    for (const line of chains.with.filter((l) => l.startsWith('New role')))
      expect(line).toMatch(/leader \S+ [^,]*out-of-plan/)
  }, 300_000)
})
