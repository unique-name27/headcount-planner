/**
 * The FY28 planning cycle from open to lock (docs/PLAN.md 10.3, 15.1 R6 to R8, 17 M3), walked
 * through the write path on the sample's cycle (Open for asks, Silicon Engineering's ranked asks):
 * Finance moves it to HRBP review; the unit's HRBP orders the asks and moves the cut line, then
 * finishes HRBP review (the stage moves on when every unit with asks has finished); the unit's
 * leader finishes Leader review; Finance locks. At the lock the asks above the cut line are Approved
 * and add Planned seats to FY28's Working; those below are Rejected with the reason code "Below the
 * cut line", which managers see. Every step is audited by its person and the chain verifies.
 */
import { describe, expect, it } from 'vitest'
import { actionEnvOf } from '@/app/write/context'
import { chainOk, type Scenario, scenario, type Who } from '@/app/write/scenario.testkit'
import { requestsOf } from '@/drill/seats'
import { cutLine } from '@/plan/engine/cycle'
import type { Cycle, HcRequest } from '@/plan/types'
import { personaOf } from '@/testkit/sample'
import { prepOf } from '@/views/requests/engine/base'
import {
  BELOW_THE_CUT_LINE,
  CUT_LINE_NOTICE,
  cycleLockedNotice,
  hrbpReviewDoneNotice,
  LEADER_REVIEW_DONE_NOTICE,
  OUTSIDE_UNIT_TEXT,
  RANKING_SAVED_NOTICE,
  stageMovedNotice,
} from './copy'

const SE = 'Silicon Engineering'

/** Every cycle ask still waiting on its manager step is approved by that manager, acting as themselves. */
async function approveManagerSteps(sc: Scenario, cycleId: string): Promise<number> {
  const ctx = await sc.ctx({ mode: 'hr-admin', personId: personaOf(sc.sample, 'hr-admin').employeeId })
  const waiting = requestsOf(ctx).filter(
    (r) => r.cycleId === cycleId && r.state === 'Submitted' && r.steps.some((s) => s.decision == null),
  )
  for (const r of waiting) {
    const step = r.steps.find((s) => s.decision == null)
    const out = await sc.run({ mode: 'manager', personId: step?.approverId ?? '' }, 'approveRequest', {
      requestId: r.requestId,
    })
    if (!out.outcome.ok) throw new Error(`${r.requestId}: ${out.outcome.refused}`)
  }
  return waiting.length
}

describe('the FY28 cycle from open to lock', () => {
  it('ranks, cuts, finishes each review and locks: above the line Approved with Planned seats, below Rejected', async () => {
    const sc = scenario()
    const s = sc.sample
    const cycleId = s.story.cycleId
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const hrbp: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const leader: Who = { mode: 'leader', personId: personaOf(s, 'leader-svp-se').employeeId }
    const cycleNow = async (): Promise<Cycle> =>
      (await sc.plan()).cycles.find((c) => c.cycleId === cycleId) as Cycle

    expect((await cycleNow()).stage).toBe('Open for asks')
    // Finance moves the cycle on; an HRBP cannot.
    expect((await sc.run(hrbp, 'finishStage', { cycleId })).outcome.ok).toBe(false)
    const open = await sc.run(fin, 'finishStage', { cycleId })
    expect(open.outcome).toEqual({ ok: true, notice: stageMovedNotice('HRBP review') })
    expect(open.entries.map((e) => [e.object, e.field, e.old, e.new, e.by])).toEqual([
      ['cycle', 'stage', 'Open for asks', 'HRBP review', fin.personId],
    ])

    // The HRBP orders the unit's asks (the first two swapped) and sets the cut line after 40 heads.
    const ctx0 = await sc.ctx(hrbp)
    const ranked = actionEnvOf(ctx0).rankedAsks(cycleId).get(SE) ?? []
    expect(ranked.length).toBeGreaterThan(40)
    const order = [ranked[1].requestId, ranked[0].requestId, ...ranked.slice(2).map((a) => a.requestId)]
    const rank = await sc.run(hrbp, 'rankCycleAsks', { cycleId, businessUnit: SE, requestIds: order })
    expect(rank.outcome).toEqual({ ok: true, notice: RANKING_SAVED_NOTICE })
    expect(rank.entries.map((e) => [e.field, e.by])).toEqual([[`order ${SE}`, hrbp.personId]])
    expect((await cycleNow()).order).toEqual([{ businessUnit: SE, requestIds: order }])
    // An HRBP orders only their own unit's asks.
    expect(
      (
        await sc.run({ ...hrbp, personId: 'E11076', unit: 'Go-to-Market' }, 'moveCutLine', {
          cycleId,
          businessUnit: SE,
          afterHeads: 10,
        })
      ).outcome,
    ).toEqual({ ok: false, refused: OUTSIDE_UNIT_TEXT })
    const cut = await sc.run(hrbp, 'moveCutLine', { cycleId, businessUnit: SE, afterHeads: 40 })
    expect(cut.outcome).toEqual({ ok: true, notice: CUT_LINE_NOTICE })
    expect(cut.entries.map((e) => [e.field, e.old, e.new])).toEqual([[`cutLine ${SE}`, null, 40]])

    // Finishing HRBP review for the only unit with asks moves the stage on in the same action.
    const done = await sc.run(hrbp, 'finishStage', { cycleId, businessUnit: SE })
    expect(done.outcome).toEqual({
      ok: true,
      notice: `${hrbpReviewDoneNotice(SE)} ${stageMovedNotice('Leader review')}`,
    })
    expect((await cycleNow()).stage).toBe('Leader review')

    // The unit's leader finishes Leader review for their org: the stage moves to Finance review.
    const lead = await sc.run(leader, 'finishStage', {
      cycleId,
      leaderPositionId: personaOf(s, 'leader-svp-se').positionId,
    })
    expect(lead.outcome).toEqual({
      ok: true,
      notice: `${LEADER_REVIEW_DONE_NOTICE} ${stageMovedNotice('Finance review')}`,
    })
    expect((await cycleNow()).stage).toBe('Finance review')

    // The lock waits for every ask's manager decision (D-CYCLE): each manager approves their step.
    const waiting = (await sc.run(fin, 'lockCycle', { cycleId })).outcome
    expect(waiting.ok).toBe(false)
    expect(waiting.ok ? '' : waiting.refused).toMatch(
      /^Lock the FY28 cycle once these asks have their manager's decision: \d+ asks with \d+ managers\.$/,
    )
    await approveManagerSteps(sc, cycleId)

    // Finance locks: each ask is decided by the cut line.
    const ctx1 = await sc.ctx(fin)
    const asks = actionEnvOf(ctx1).rankedAsks(cycleId).get(SE) ?? []
    expect(asks.map((a) => a.requestId)).toEqual(order)
    const line = cutLine(asks, 40)
    expect(line.headsAbove).toBeLessThanOrEqual(40)
    const lock = await sc.run(fin, 'lockCycle', { cycleId })
    expect(lock.outcome).toEqual({
      ok: true,
      notice: cycleLockedNotice('FY28', line.above.length, line.below.length),
    })
    for (const e of lock.entries) expect(e.by).toBe(fin.personId)
    expect(chainOk(await sc.log())).toBe(true)
    const cycle = await cycleNow()
    expect(cycle).toMatchObject({ stage: 'Locked', lockedBy: fin.personId })

    const after = await sc.ctx(fin)
    const all = new Map(requestsOf(after).map((r) => [r.requestId, r]))
    const plan = await sc.plan()
    for (const id of line.above) {
      const r = all.get(id) as HcRequest
      expect(r.state, id).toBe('Approved')
      // A New role above the line adds its Planned seat to FY28's Working.
      if (r.type === 'New role') {
        const seat = r.outcome?.createdPositionIds[0] as string
        expect(
          plan.overlay.positions.find((p) => p.positionId === seat),
          id,
        ).toMatchObject({
          status: 'Planned',
          sourceRequestId: id,
        })
      }
    }
    for (const id of line.below) {
      const r = all.get(id) as HcRequest
      expect(r, id).toMatchObject({ state: 'Rejected', reasonCode: BELOW_THE_CUT_LINE })
    }
    // The manager whose ask fell below the line reads the reason code.
    const below = all.get(line.below[0]) as HcRequest
    const mctx = await sc.ctx({ mode: 'manager', personId: below.requesterId })
    expect(prepOf(mctx).row(below)?.reasonCode).toBe(BELOW_THE_CUT_LINE)
    // Nothing changes a Locked cycle.
    expect(
      (await sc.run(hrbp, 'moveCutLine', { cycleId, businessUnit: SE, afterHeads: 50 })).outcome.ok,
    ).toBe(false)
  }, 180_000)

  it('a manager ranks only their own asks, by each one’s priority', async () => {
    const sc = scenario()
    const s = sc.sample
    const cycleId = s.story.cycleId
    const ctx = await sc.ctx({ mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId })
    const mine = new Map<string, HcRequest[]>()
    for (const r of requestsOf(ctx))
      if (r.cycleId === cycleId) mine.set(r.requesterId, [...(mine.get(r.requesterId) ?? []), r])
    const [requester, asks] = [...mine].find(([, list]) => list.length >= 2) ?? ['', []]
    expect(asks.length).toBeGreaterThanOrEqual(2)
    const mgr: Who = { mode: 'manager', personId: requester }
    const reversed = asks.map((r) => r.requestId).reverse()
    const out = await sc.run(mgr, 'rankCycleAsks', { cycleId, requestIds: reversed })
    expect(out.outcome).toEqual({ ok: true, notice: RANKING_SAVED_NOTICE })
    for (const [i, id] of reversed.entries()) expect((await sc.request(id))?.priority).toBe(i + 1)
    // Someone else's ask is not theirs to rank.
    const other = [...mine].find(([who]) => who !== requester)?.[1][0]
    const refused = await sc.run(mgr, 'rankCycleAsks', { cycleId, requestIds: [other?.requestId as string] })
    expect(refused.outcome.ok).toBe(false)
  }, 120_000)
})
