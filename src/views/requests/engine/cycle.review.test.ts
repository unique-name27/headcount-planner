/**
 * Requests > Cycle after the M3 review (docs/PLAN.md 10.3, 13.4 story 6, 15.1 R7; lead decision
 * D-CYCLE): the cut line is the unit's, the same for every viewer and the one the lock applies (the
 * stored mark, else the default from the target), and the tab says so ("It counts at lock."); a
 * Sent back ask is out of the ranking; the lock waits while any ask waits on its manager; the unit's
 * HRBP approves an ask with changes in HRBP review; after lock the tab shows the outcome.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { deciderOf, type Scenario, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { BELOW_THE_CUT_LINE } from '@/plan/actions'
import type { HcRequest } from '@/plan/types'
import { leakSample, personaCtx, personaOf, sampleCtx } from '@/testkit/sample'
import { requestsModel } from './index'

const SE = 'Silicon Engineering'

beforeAll(() => {
  leakSample()
}, 120_000)

/** The Silicon Engineering line as a context reads it. */
const seLine = (ctx: ReturnType<typeof sampleCtx>) =>
  requestsModel(ctx).cycle.units.find((u) => u.businessUnit === SE)

/** Every cycle ask's waiting manager step approved by its manager. */
async function managersDecide(sc: Scenario): Promise<void> {
  for (const id of sc.sample.story.cycleAskIds) {
    const r = (await sc.request(id)) as HcRequest
    if (!r.steps.some((x) => x.enteredAt && !x.decision)) continue
    const out = await sc.run(deciderOf(sc.sample, r), 'approveRequest', { requestId: id })
    expect(out.outcome.ok, out.outcome.ok ? '' : out.outcome.refused).toBe(true)
  }
}

/** The stages walked to Finance review: Finance moves it on, the HRBP and the SVP finish theirs. */
async function toFinanceReview(sc: Scenario, who: { hr: Who; fin: Who; leader: Who }): Promise<void> {
  const move = requestsModel(await sc.ctx(who.fin)).cycle.controls?.finish[0]
  expect((await sc.run(who.fin, 'finishStage', move?.input as never)).outcome.ok).toBe(true)
  const hr = requestsModel(await sc.ctx(who.hr)).cycle.controls?.finish[0]
  const h = await sc.run(who.hr, 'finishStage', hr?.input as never)
  expect(h.outcome.ok, h.outcome.ok ? '' : h.outcome.refused).toBe(true)
  const lf = requestsModel(await sc.ctx(who.leader)).cycle.controls?.finish[0]
  const l = await sc.run(who.leader, 'finishStage', lf?.input as never)
  expect(l.outcome.ok, l.outcome.ok ? '' : l.outcome.refused).toBe(true)
}

const people = (x: Sample) => ({
  hr: { mode: 'hrbp', personId: personaOf(x, 'hrbp-se').employeeId, unit: SE } as Who,
  fin: { mode: 'finance', personId: personaOf(x, 'finance-fpa').employeeId } as Who,
  leader: { mode: 'leader', personId: personaOf(x, 'leader-svp-se').employeeId } as Who,
})

describe('one cut line per unit, for every viewer and at lock', () => {
  it('story 6: every mode that shows the line reads it after the 40th ranked head, and that it counts at lock', () => {
    const ctxs = [
      sampleCtx('hrbp'),
      sampleCtx('finance'),
      sampleCtx('hr-admin'),
      personaCtx('leader-svp-se'),
      // A director inside the unit sees only their org's asks, yet reads the unit's one line.
      personaCtx('leader-dv-director'),
    ]
    for (const ctx of ctxs) {
      const u = seLine(ctx)
      expect(u, ctx.access.mode).toMatchObject({
        cutAfter: 40,
        source: 'default',
        headsAbove: 40,
        headsBelow: 18,
      })
      expect(u?.sentence, ctx.access.mode).toBe(
        'Silicon Engineering: the cut line falls after the 40th ranked head, from the FY28 target of 644 heads. 40 heads above, 18 heads below. It counts at lock.',
      )
    }
    // The director's controls name only the asks they see (no hidden request's ID).
    const dv = personaCtx('leader-dv-director')
    const m = requestsModel(dv)
    const shown = new Set(m.cycle.asks.rows.map((r) => r.requestId))
    for (const u of m.cycle.controls?.units ?? [])
      for (const id of u.order) expect(shown.has(id), id).toBe(true)
  })

  it('a Sent back ask is with its requester: out of the ranking until it is submitted again', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(sc.sample, 'finance-fpa').employeeId }
    const ctx0 = await sc.ctx(fin)
    const before = { line: seLine(ctx0), ids: requestsModel(ctx0).cycle.asks.rows.map((x) => x.requestId) }
    let r: HcRequest | null = null
    for (const x of sc.sample.story.cycleAskIds) {
      const q = await sc.request(x)
      if (q?.businessUnit === SE && q.steps.some((st) => st.enteredAt && !st.decision)) {
        r = q
        break
      }
    }
    if (!r) throw new Error('no ask waits on its manager')
    const id = r.requestId
    expect(before.ids).toContain(id)
    const back = await sc.run(deciderOf(sc.sample, r), 'sendBack', {
      requestId: id,
      reason: 'Rank this below your other ask',
    })
    expect(back.outcome.ok, back.outcome.ok ? '' : back.outcome.refused).toBe(true)
    const m = requestsModel(await sc.ctx(fin))
    expect(m.cycle.asks.rows.map((x) => x.requestId)).not.toContain(id)
    expect(m.cycle.controls?.units.find((u) => u.businessUnit === SE)?.order).not.toContain(id)
    expect(seLine(await sc.ctx(fin))?.rankedHeads).toBeLessThanOrEqual(before.line?.rankedHeads ?? 0)
  }, 180_000)

  it('story 6 walked to lock with no line set: the lock applies the line the tab showed, then the tab shows the outcome', async () => {
    const sc = scenario()
    const who = people(sc.sample)
    const shown = requestsModel(await sc.ctx(who.fin)).cycle
    const below = shown.asks.rows
      .filter((r) => r.businessUnit === SE && r.cut === 'Below')
      .map((r) => r.requestId)
    const above = shown.asks.rows
      .filter((r) => r.businessUnit === SE && r.cut === 'Above')
      .map((r) => r.requestId)
    expect(below.length).toBeGreaterThan(0)
    await toFinanceReview(sc, who)
    // The lock waits while asks wait on their manager, and says so beside the button.
    const waiting = requestsModel(await sc.ctx(who.fin)).cycle.controls
    expect(waiting?.lock).toBe(true)
    expect(waiting?.lockWaiting).toMatch(
      /^Lock the FY28 cycle once these asks have their manager's decision: /,
    )
    await managersDecide(sc)
    expect(requestsModel(await sc.ctx(who.fin)).cycle.controls?.lockWaiting).toBeNull()
    const locked = await sc.run(who.fin, 'lockCycle', { cycleId: 'cycle-fy28' })
    expect(locked.outcome.ok, locked.outcome.ok ? '' : locked.outcome.refused).toBe(true)
    for (const id of below) {
      const r = (await sc.request(id)) as HcRequest
      expect(r.state, id).toBe('Rejected')
      expect(r.reasonCode).toBe(BELOW_THE_CUT_LINE)
    }
    for (const id of above)
      expect(['Approved', 'Approved with changes'], id).toContain((await sc.request(id))?.state)
    // After lock: the outcome, never a line over no pending asks.
    const after = seLine(await sc.ctx(who.fin))
    expect(after?.sentence).toBe(
      `Silicon Engineering: at lock, ${above.length} asks approved (40 heads) and ${below.length} asks rejected below the cut line (18 heads).`,
    )
    expect(after?.sentence).not.toMatch(/0th|It counts at lock/)
    const kpis = requestsModel(await sc.ctx(who.fin)).cycle.kpis
    expect(kpis.find((k) => k.id === 'cycle-above-cut')?.value).toBeGreaterThan(0)
  }, 600_000)
})

describe('approve with changes in HRBP review (SC-9)', () => {
  it('the unit’s HRBP changes an ask its manager approved; it stays ranked and reads the change', async () => {
    const sc = scenario()
    const who = people(sc.sample)
    await managersDecide(sc)
    const move = requestsModel(await sc.ctx(who.fin)).cycle.controls?.finish[0]
    expect((await sc.run(who.fin, 'finishStage', move?.input as never)).outcome.ok).toBe(true)
    const m = requestsModel(await sc.ctx(who.hr))
    expect(m.cycle.cycle?.stage).toBe('HRBP review')
    const card = m.cycle.cards.find((c) => c.changeable.some((f) => f.field === 'startDate'))
    expect(card?.can.approveWithChanges).toBe(true)
    const id = card?.requestId as string
    const changes = [
      {
        field: 'startDate' as const,
        old: card?.changeable.find((f) => f.field === 'startDate')?.value ?? null,
        new: '2027-09-01',
      },
    ]
    const out = await sc.run(who.hr, 'approveWithChanges', {
      requestId: id,
      changes,
      reason: 'Later in the year fits the plan.',
    })
    expect(out.outcome.ok, out.outcome.ok ? '' : out.outcome.refused).toBe(true)
    const r = (await sc.request(id)) as HcRequest
    expect(r.changes?.reason).toBe('Later in the year fits the plan.')
    const after = requestsModel(await sc.ctx(who.hr))
    expect(after.cycle.asks.rows.map((x) => x.requestId)).toContain(id)
    // Finance (no HRBP step) and the manager are offered no change.
    expect(requestsModel(await sc.ctx(who.fin)).cycle.cards).toEqual([])
    expect(requestsModel(sampleCtx('manager')).cycle.cards).toEqual([])
  }, 600_000)
})
