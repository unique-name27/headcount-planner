/**
 * Requests > Cycle after writes (docs/PLAN.md 10.3, 15.1 R7, R8; docs/CONTRACTS-M3.md 3, requests-ui):
 * the controls each mode gets (the HRBP ranks and cuts its unit, a leader within its org, Finance
 * moves the stage on, locks or returns, a manager ranks only its own asks and never sees the cut
 * line), then the FY28 cycle walked to lock through the write path, the model read after each step:
 * a new ranking, the cut line moved (heads and in-year band estimate above and below), HRBP review and
 * Leader review finished, the lock (above the line Approved with Planned seats, below Rejected "Below
 * the cut line", which the manager reads on Mine).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { deciderOf, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { BELOW_THE_CUT_LINE } from '@/plan/actions'
import type { HcRequest } from '@/plan/types'
import { leakSample, personaOf, sampleCtx } from '@/testkit/sample'
import { requestsModel } from './index'

const SE = 'Silicon Engineering'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

/** A Silicon Engineering manager with two or more asks in the cycle. */
function managerWithAsks(x: Sample): string {
  const by = new Map<string, number>()
  for (const id of x.story.cycleAskIds) {
    const r = x.plan.requests.find((q) => q.requestId === id) ?? null
    const row = r ?? x.datasets.requests.find((q) => q.requestId === id)
    const who = row?.requesterId
    if (who) by.set(who, (by.get(who) ?? 0) + 1)
  }
  return [...by].find(([, n]) => n >= 2)?.[0] as string
}

describe('the cycle’s controls in every mode', () => {
  it('HRBP and Leader rank and cut Silicon Engineering; Finance cuts and moves the stage on; a manager ranks only its own', () => {
    const hrbp = requestsModel(sampleCtx('hrbp')).cycle.controls
    expect(hrbp?.units.find((u) => u.businessUnit === SE)).toMatchObject({
      canRank: true,
      canCut: true,
      cutAfter: 40,
      cutSet: false,
    })
    expect(hrbp?.finish).toEqual([])
    expect(hrbp?.lock).toBe(false)
    const leader = requestsModel(sampleCtx('leader')).cycle.controls
    expect(leader?.units.find((u) => u.businessUnit === SE)).toMatchObject({ canRank: true, canCut: true })
    const fin = requestsModel(sampleCtx('finance')).cycle.controls
    expect(fin?.units.find((u) => u.businessUnit === SE)).toMatchObject({ canRank: false, canCut: true })
    expect(fin?.finish.map((f) => f.label)).toEqual(['Move the cycle to HRBP review'])
    expect(fin?.returnTo).toEqual(['Open for asks'].slice(0, 0))
    // The cut line's places: one per run of ranked heads, the default after 40 heads among them.
    const se = hrbp?.units.find((u) => u.businessUnit === SE)
    const at40 = se?.options.find((o) => o.afterHeads === 40)
    expect(at40).toMatchObject({ headsAbove: 40, headsBelow: 18 })
    expect(at40?.bandAbove).toBeGreaterThan(0)
    // Asks with no head effect (Level changes) sit above a line after 0 heads: the line keeps whole asks.
    expect(se?.options[0]).toMatchObject({ afterHeads: 0, headsAbove: 0, headsBelow: 58 })

    const m = requestsModel(sampleCtx('manager'))
    expect(m.cycle.controls?.units).toEqual([])
    expect(m.cycle.controls?.mine?.canRank).toBe(true)
    expect(JSON.stringify(m.cycle)).not.toMatch(/cutAfter|headsAbove|bandAbove|Cut line|after the \d+/)
  })
})

describe('the FY28 cycle walked to lock, read on the model after each step', () => {
  it('ranks, moves the cut line, finishes both reviews and locks', async () => {
    const sc = scenario()
    const hrbp = personaOf(s, 'hrbp-se')
    const hr: Who = { mode: 'hrbp', personId: hrbp.employeeId, unit: SE }
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const leader: Who = { mode: 'leader', personId: personaOf(s, 'leader-svp-se').employeeId }
    const unitAt = async (who: Who) =>
      requestsModel(await sc.ctx(who)).cycle.controls?.units.find((u) => u.businessUnit === SE)

    // 1. The HRBP swaps the first two asks; the model reads the new order.
    const before = await unitAt(hr)
    const order = [...(before?.order ?? [])]
    ;[order[0], order[1]] = [order[1] as string, order[0] as string]
    const ranked = await sc.run(hr, 'rankCycleAsks', {
      cycleId: 'cycle-fy28',
      businessUnit: SE,
      requestIds: order,
    })
    expect(ranked.outcome).toEqual({ ok: true, notice: 'Ranking saved.' })
    expect((await unitAt(hr))?.order.slice(0, 2)).toEqual(order.slice(0, 2))

    // 2. The HRBP moves the cut line to 30 heads: set, with the heads above and below.
    const opt = (await unitAt(hr))?.options.find((o) => o.afterHeads === 30)
    expect(opt).toBeTruthy()
    const cut = await sc.run(hr, 'moveCutLine', { cycleId: 'cycle-fy28', businessUnit: SE, afterHeads: 30 })
    expect(cut.outcome.ok).toBe(true)
    const afterCut = await unitAt(hr)
    expect(afterCut).toMatchObject({ cutAfter: 30, cutSet: true })
    const line = requestsModel(await sc.ctx(hr)).cycle.units.find((u) => u.businessUnit === SE)
    expect(line).toMatchObject({ headsAbove: opt?.headsAbove, headsBelow: opt?.headsBelow, source: 'set' })
    expect(line?.sentence).toMatch(/after the 30th ranked head, where it was set/)

    // 3. Finance moves the cycle to HRBP review; the HRBP finishes it for the unit.
    const toReview = (await sc.ctx(fin)).plan?.cycles.find((c) => c.cycleId === 'cycle-fy28')
    expect(toReview?.stage).toBe('Open for asks')
    const move = requestsModel(await sc.ctx(fin)).cycle.controls?.finish[0]
    expect((await sc.run(fin, 'finishStage', move?.input as never)).outcome.ok).toBe(true)
    const hrFinish = requestsModel(await sc.ctx(hr)).cycle.controls?.finish
    expect(hrFinish?.map((f) => f.label)).toEqual([`Finish HRBP review for ${SE}`])
    const done = await sc.run(hr, 'finishStage', hrFinish?.[0]?.input as never)
    expect(done.outcome.ok, done.outcome.ok ? '' : done.outcome.refused).toBe(true)
    expect(requestsModel(await sc.ctx(hr)).cycle.cycle?.stage).toBe('Leader review')

    // 4. The SVP finishes Leader review for the org; Finance can then lock or return it.
    const lf = requestsModel(await sc.ctx(leader)).cycle.controls?.finish
    expect(lf?.map((f) => f.label)).toEqual(['Finish Leader review for your org'])
    expect((await sc.run(leader, 'finishStage', lf?.[0]?.input as never)).outcome.ok).toBe(true)
    const fc = requestsModel(await sc.ctx(fin)).cycle.controls
    expect(fc?.stage).toBe('Finance review')
    expect(fc?.lock).toBe(true)
    expect(fc?.returnTo).toEqual(['Open for asks', 'HRBP review', 'Leader review'])

    // 5. The lock waits while asks wait on their manager (D-CYCLE): the reason shows beside the
    // button; each manager decides their step, and then it may go.
    expect(fc?.lockWaiting).toMatch(
      /^Lock the FY28 cycle once these asks have their manager's decision: \d+ asks? with \d+ managers?\.$/,
    )
    for (const id of s.story.cycleAskIds) {
      const r = (await sc.request(id)) as HcRequest
      if (!r.steps.some((x) => x.enteredAt && !x.decision)) continue
      const out = await sc.run(deciderOf(s, r), 'approveRequest', { requestId: id })
      expect(out.outcome.ok, out.outcome.ok ? '' : out.outcome.refused).toBe(true)
    }
    expect(requestsModel(await sc.ctx(fin)).cycle.controls?.lockWaiting).toBeNull()

    // 6. Lock: above the line Approved, below Rejected "Below the cut line", read by the manager on Mine.
    const locked = await sc.run(fin, 'lockCycle', { cycleId: 'cycle-fy28' })
    expect(locked.outcome.ok, locked.outcome.ok ? '' : locked.outcome.refused).toBe(true)
    const states = new Map<string, number>()
    for (const id of s.story.cycleAskIds) {
      const r = (await sc.request(id)) as HcRequest
      states.set(r.state, (states.get(r.state) ?? 0) + 1)
      if (r.state === 'Rejected') expect(r.reasonCode).toBe(BELOW_THE_CUT_LINE)
    }
    expect((states.get('Approved') ?? 0) + (states.get('Approved with changes') ?? 0)).toBeGreaterThan(0)
    expect(states.get('Rejected') ?? 0).toBeGreaterThan(0)
    const who = managerWithAsks(s)
    const mine = requestsModel(await sc.ctx({ mode: 'manager', personId: who })).mine.cards
    const below = mine.filter((c) => c.state === 'Rejected')
    for (const c of below) expect(c.facts).toContainEqual({ label: 'Reason', value: BELOW_THE_CUT_LINE })
    expect(requestsModel(await sc.ctx(fin)).cycle.controls).toMatchObject({
      stage: 'Locked',
      lock: false,
      finish: [],
    })
  }, 300_000)

  it('a manager re-ranks only their own asks, by priority', async () => {
    const sc = scenario()
    const who: Who = { mode: 'manager', personId: managerWithAsks(s) }
    const c = requestsModel(await sc.ctx(who)).cycle.controls
    const ids = [...(c?.mine?.requestIds ?? [])]
    expect(ids.length).toBeGreaterThanOrEqual(2)
    const order = [...ids].reverse()
    const out = await sc.run(who, 'rankCycleAsks', { cycleId: 'cycle-fy28', requestIds: order })
    expect(out.outcome).toEqual({ ok: true, notice: 'Ranking saved.' })
    const after = requestsModel(await sc.ctx(who)).cycle.controls?.mine?.requestIds
    expect(after?.slice(0, order.length)).toEqual(order)
    // Another manager's ask is refused.
    const other = s.story.cycleAskIds.find((id) => !ids.includes(id)) as string
    expect(
      (await sc.run(who, 'rankCycleAsks', { cycleId: 'cycle-fy28', requestIds: [other] })).outcome.ok,
    ).toBe(false)
  }, 180_000)
})
