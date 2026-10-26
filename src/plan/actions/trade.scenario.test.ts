/**
 * Story 9's trade with credit (docs/PLAN.md 11, 13.4 story 9, 17 M3), walked through the write path:
 * the pending trade R-1040 (1 Planned P5 San Jose for 6 P3 Bengaluru, 420 bp of credit) is approved
 * at its last step by its leader acting as themselves, re-quoted at the plan of record's locked rates
 * (the stored weights hold), the give seat ends Traded from the approval date, six Planned P3
 * Bengaluru seats are created under the receiving manager, and the credit is held by the giving org
 * (the manager position P-1629), derived from the requests and never stored. A second trade by the
 * same giving org spends the credit (11.7 T1 then T3): while it is pending the balance reads 0 and a
 * third trade that asks for credit is refused with `credit-over-balance`.
 */
import { describe, expect, it } from 'vitest'
import { approveAll, chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import { requestsOf } from '@/drill/seats'
import { creditBalance } from '@/plan/engine/trade'
import type { HcRequest } from '@/plan/types'
import { approvedNotice, FILLED_NOT_TRADED_TEXT, tradeDraftNotice } from './copy'
import { requestIdInText } from './requestIds'

const idOf = (text: string): string => requestIdInText(text) ?? ''

describe('story 9’s trade, approved with its credit held by the giving org', () => {
  it('approves R-1040, ends the give seat Traded, creates six seats and keeps 420 bp of credit at P-1629', async () => {
    const sc = scenario()
    const s = sc.sample
    const id = s.story.tradeRequestId
    let req = (await sc.request(id)) as HcRequest
    expect(req.state).toBe('In review')
    expect(req.trade).toMatchObject({
      giveOrgPositionId: 'P-1629',
      giveBp: 17_010,
      getBp: 16_590,
      creditBp: 420,
      count: 6,
    })
    const leaderStep = req.steps.find((x) => x.enteredAt != null && x.decision == null)
    expect(leaderStep?.role).toBe('leader')
    const leader: Who = { mode: 'leader', personId: leaderStep?.approverId as string }

    const out = await sc.run(leader, 'approveRequest', { requestId: id })
    expect(out.outcome).toEqual({ ok: true, notice: approvedNotice(id, true) })
    for (const e of out.entries) expect(e.by).toBe(leader.personId)
    expect(chainOk(await sc.log())).toBe(true)

    req = (await sc.request(id)) as HcRequest
    expect(req.state).toBe('Approved')
    // Re-quoted at the plan of record's locked rates: the stored weights and credit hold.
    expect(req.trade).toMatchObject({
      giveBp: 17_010,
      getBp: 16_590,
      creditBp: 420,
      count: 6,
      rateVersion: 'fy27-q1-reforecast',
    })
    expect(req.outcome?.createdPositionIds).toHaveLength(6)
    expect(req.outcome?.changedPositionIds).toEqual(['P-2589'])

    const plan = await sc.plan()
    const ended = plan.overlay.positions.find((r) => r.positionId === 'P-2589')
    expect(ended).toMatchObject({
      status: 'Eliminated',
      endReason: 'Traded',
      endDate: '2026-09-29',
      sourceRequestId: id,
    })
    const created = plan.overlay.positions.filter((r) =>
      req.outcome?.createdPositionIds.includes(r.positionId),
    )
    expect(created).toHaveLength(6)
    for (const r of created)
      expect(r).toMatchObject({
        status: 'Planned',
        level: 'P3',
        location: 'Bengaluru',
        managerPositionId: 'P-1715',
        startDate: '2027-02-01',
        sourceRequestId: id,
      })
    // The credit ledger moves with the request (audited), and the balance is derived for the giving org.
    expect(out.entries.find((e) => e.object === 'request' && e.field === 'creditBp')?.new).toBe(420)
    const ctx = await sc.ctx({
      mode: 'hr-admin',
      personId: s.personas.find((p) => p.mode === 'hr-admin')?.employeeId ?? '',
    })
    expect(creditBalance(requestsOf(ctx), 'P-1629', 'FY27')).toBe(420)
    expect(creditBalance(requestsOf(ctx), 'P-1715', 'FY27')).toBe(0)
  }, 120_000)

  it('spends the credit in a second trade by the same giving org (T1 then T3): 0 left while it is pending', async () => {
    const sc = scenario()
    const s = sc.sample
    const id = s.story.tradeRequestId
    const leader = (await sc.request(id))?.steps.find((x) => x.enteredAt != null && x.decision == null)
    await sc.run({ mode: 'leader', personId: leader?.approverId as string }, 'approveRequest', {
      requestId: id,
    })
    const hr: Who = { mode: 'hrbp', personId: 'E10342', unit: 'Systems & Software' }
    // The other tradable seat under P-1629 (an Open P5 San Jose) and the 420 bp of credit.
    const ask = {
      give: ['P-2486'],
      creditUsedBp: 420,
      giveOrgPositionId: null,
      get: {
        level: 'P3' as const,
        location: 'Bengaluru',
        fte: 1,
        orgPositionId: 'P-1715',
        businessUnit: 'Systems & Software',
        jobFamily: 'Software',
        start: '2027-02-01',
        count: 'max' as const,
        partTimeRest: false,
      },
    }
    const t3 = await sc.run(hr, 'createTrade', { ask, reasonCode: 'Location strategy' })
    const t3Id = idOf(t3.outcome.ok ? t3.outcome.notice : '')
    expect(t3.outcome).toEqual({ ok: true, notice: tradeDraftNotice(t3Id) })
    let r3 = (await sc.request(t3Id)) as HcRequest
    expect(r3.trade).toMatchObject({ giveOrgPositionId: 'P-1629', creditUsedBp: 420 })
    expect(r3.trade?.giveBp).toBe((r3.trade?.getBp ?? 0) + (r3.trade?.creditBp ?? 0))
    expect((await sc.run(hr, 'submitRequest', { requestId: t3Id })).outcome.ok).toBe(true)
    r3 = (await sc.request(t3Id)) as HcRequest
    expect(r3.state).toBe('Submitted')
    const ctx = await sc.ctx(hr)
    expect(creditBalance(requestsOf(ctx), 'P-1629', 'FY27')).toBe(0)

    // A third trade asking for credit now meets the balance it has: 0.
    const t4 = await sc.run(hr, 'createTrade', {
      ask: { ...ask, give: [], creditUsedBp: 100, giveOrgPositionId: 'P-1629' },
      reasonCode: 'Location strategy',
    })
    expect(t4.outcome.ok).toBe(false)
    expect(t4.outcome.ok ? '' : t4.outcome.refused).toMatch(
      /^The giving org holds 0\.00 standard heads of trade credit/,
    )

    // A Filled seat is never traded.
    const filled = await sc.run(hr, 'createTrade', {
      ask: { ...ask, give: ['P-1630'], creditUsedBp: 0 },
      reasonCode: 'Level mix',
    })
    expect(filled.outcome).toEqual({ ok: false, refused: FILLED_NOT_TRADED_TEXT })

    // Approving T3 at each step re-quotes it without its own credit counting against it.
    for (const step of await approveAll(sc, t3Id))
      expect(step.outcome.ok, step.outcome.ok ? '' : step.outcome.refused).toBe(true)
    r3 = (await sc.request(t3Id)) as HcRequest
    expect(r3.state).toBe('Approved')
    const after = await sc.ctx(hr)
    expect(creditBalance(requestsOf(after), 'P-1629', 'FY27')).toBe(r3.trade?.creditBp)
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})
