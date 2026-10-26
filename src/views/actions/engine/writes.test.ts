/**
 * The Action center after writes (docs/PLAN.md 9.6; M3): items are collected on the spot from the
 * analytics context the write path rebuilds (src/app/write/scenario.testkit.ts over the sample, each
 * step acted by its own person), so what a write adds or settles shows in every list at once:
 *
 *  - a submitted request puts an approval item in the step's approver's Needs attention, and only
 *    theirs; approving moves it to the next approver; approval items are Snooze only (they close by
 *    request state, never by "Mark handled");
 *  - a send-back puts a "sent back" item in the requester's Needs attention and takes the approval
 *    item away; submitting again settles it;
 *  - a freeze Finance creates holds openings, which show as frozen-opening items in the HRBP's and
 *    Finance's Needs attention;
 *  - the masthead's count follows each list.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { deciderOf, type Scenario, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf } from '@/testkit/sample'
import { VIEWS } from '@/views/registry'
import { actionsModel } from '.'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** A request ID in a notice: the sample's ("R-1035"), or a new one under the workspace's tag ("R-K7QM-1371", D-ID). */
const idOf = (text: string): string => /R-(?:[0-9A-HJKMNP-TV-Z]{4}-)?\d+/.exec(text)?.[0] ?? ''

/** The Action center as a person sees it now. */
async function center(sc: Scenario, who: Who) {
  return actionsModel(await sc.ctx(who), VIEWS)
}
const about = <T extends { id: string }>(items: readonly T[], record: string): T[] =>
  items.filter((a) => a.id.endsWith(`:${record}`))

describe('approval items follow the request', () => {
  it('reach each approver in turn, the requester on a send-back, and close by state', async () => {
    const sc = scenario()
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const draft = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
      jobTitle: 'Account Executive',
    })
    const id = idOf(draft.outcome.ok ? draft.outcome.notice : '')
    expect(id).toMatch(/^R-[0-9A-HJKMNP-TV-Z]{4}-\d+$/)
    // A draft waits on nobody.
    expect(about((await center(sc, mgr)).items, id)).toEqual([])

    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    let req = await sc.request(id)
    const first = deciderOf(s, req as never)
    const before = await center(sc, first)
    const item = about(before.needs, id)
    expect(item.map((x) => x.id)).toEqual([`requests:approve:${id}`])
    expect(item[0].item.snoozeOnly).toBe(true)
    expect(item[0].approverId).toBe(first.personId)
    // Nobody else is asked: the next approver has nothing about it yet.
    const second: Who = { mode: 'leader', personId: req?.steps[1]?.approverId as string }
    expect(about((await center(sc, second)).needs, id)).toEqual([])

    // Sent back: the requester's item opens, the approver's closes.
    const back = await sc.run(first, 'sendBack', {
      requestId: id,
      reason: 'Add the hiring plan for the team.',
    })
    expect(back.outcome.ok).toBe(true)
    const mine = await center(sc, mgr)
    expect(about(mine.needs, id).map((x) => x.id)).toEqual([`requests:sent-back:${id}`])
    expect(about((await center(sc, first)).needs, id)).toEqual([])
    expect(mine.count).toBe(mine.needs.length)

    // Submitted again: the sent-back item settles and the first step waits again.
    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    expect(about((await center(sc, mgr)).needs, id)).toEqual([])
    req = await sc.request(id)
    const again = deciderOf(s, req as never)
    expect(about((await center(sc, again)).needs, id).map((x) => x.id)).toEqual([`requests:approve:${id}`])

    // Approved at the first step: the item moves to the next approver.
    const countBefore = (await center(sc, again)).count
    expect((await sc.run(again, 'approveRequest', { requestId: id })).outcome.ok).toBe(true)
    const after = await center(sc, again)
    expect(about(after.needs, id)).toEqual([])
    expect(after.count).toBe(countBefore - 1)
    req = await sc.request(id)
    const next = deciderOf(s, req as never)
    expect(next.personId).not.toBe(again.personId)
    expect(about((await center(sc, next)).needs, id).map((x) => x.id)).toEqual([`requests:approve:${id}`])
  }, 300_000)
})

describe('a freeze Finance creates', () => {
  it('raises frozen-opening items for the HRBP and Finance', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const hr: Who = {
      mode: 'hrbp',
      personId: personaOf(s, 'hrbp-se').employeeId,
      unit: 'Silicon Engineering',
    }
    const frozen = <T extends { id: string }>(items: readonly T[]): T[] =>
      items.filter((x) => x.id.startsWith('plan:frozen-opening:'))
    const hrBefore = frozen((await center(sc, hr)).needs).length
    const made = await sc.run(fin, 'createFreeze', {
      businessUnit: 'Silicon Engineering',
      department: null,
      costCenter: null,
      leaderPositionId: null,
      startDate: '2026-09-01',
      endDate: null,
      allowBackfill: true,
      reason: 'Hold while the FY28 plan is set',
    })
    expect(made.outcome.ok).toBe(true)
    const hrAfter = frozen((await center(sc, hr)).items)
    expect(hrAfter.length).toBeGreaterThan(hrBefore)
    const finAfter = frozen((await center(sc, fin)).items)
    expect(finAfter.length).toBeGreaterThan(0)
    // Every new item is about a seat in the frozen unit.
    const ctx = await sc.ctx(hr)
    for (const x of hrAfter)
      expect(ctx.positionIndex.byId.get(x.positionId ?? '')?.businessUnit, x.id).toBe('Silicon Engineering')
  }, 300_000)
})
