/**
 * The request cards and the trade quote after the M3 review (docs/PLAN.md 10.1, 11.2, 11.4, C23,
 * R32, 7.6; CONTRACTS-M3 7.4.3): a trade an HRBP lowered reads its credit before and after; a seat
 * with an accepted offer is offered no approval of a change to it; the requester changes their own
 * trade draft from Mine; a quote priced from an unlocked Working says rates can change; a give seat
 * whose req is interviewing is named; Manager mode's status after approval of a Level change on a
 * Filled seat reprices the staffed months.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { deciderOf, said, scenario, type Who } from '@/app/write/scenario.testkit'
import { REASON_CODES_OF } from '@/data/schema'
import { seatStateOf } from '@/drill/seats'
import { ACCEPTED_OFFER_TEXT } from '@/plan/actions'
import { requestIdInText } from '@/plan/actions/requestIds'
import { budgetStatus } from '@/plan/engine/budgetStatus'
import type { HcRequest } from '@/plan/types'
import { leakSample, personaOf } from '@/testkit/sample'
import { teamFacts } from '@/views/team/engine/facts'
import { PARAM as TEAM_PARAM } from '@/views/team/metrics'
import { creditChangeOf, editPatchOf, staffedAfterApproval } from './cards'
import { requestsModel } from './index'
import { emptyForm, formAction, type NewRequestForm, newRequestPreview, requestsNewOf } from './new'

beforeAll(() => {
  leakSample()
}, 120_000)

const idOf = (text: string): string => requestIdInText(text) ?? ''

/** Manager A's trade of a Planned seat for P3 Bengaluru seats, saved through Requests > New's own form. */
async function managerATrade(start = '2027-01-01') {
  const sc = scenario()
  const a = personaOf(sc.sample, 'manager-a')
  const mgr: Who = { mode: 'manager', personId: a.employeeId }
  const ctx = await sc.ctx(mgr)
  const give = requestsNewOf(ctx)?.seats.rows.find((r) => r.status === 'Planned' && r.types.includes('Trade'))
  const form: NewRequestForm = {
    ...emptyForm('Trade'),
    managerPositionId: a.positionId,
    level: 'P3',
    location: 'Bengaluru',
    fte: 1,
    startDate: start,
    reasonCode: 'Cost-neutral mix' as never,
    trade: {
      ...(emptyForm('Trade').trade as NonNullable<NewRequestForm['trade']>),
      give: [give?.positionId as string],
    },
  }
  const { action } = formAction(ctx, form)
  const saved = await sc.run(mgr, action?.name as 'createTrade', action?.input as never)
  return { sc, mgr, id: idOf(said(saved.outcome)), form }
}

describe('a trade approved with a lower count (SC-10, SP-17, UI-6)', () => {
  it('the manager reads the seats and the credit before and after', async () => {
    const { sc, mgr, id } = await managerATrade()
    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const before = (await sc.request(id)) as HcRequest
    const hr = deciderOf(sc.sample, before)
    const card = requestsModel(await sc.ctx(hr)).approvals.cards.find((c) => c.requestId === id)
    const count = card?.changeable.find((f) => f.field === 'count')
    const changes = [
      { field: 'count' as const, old: count?.value ?? null, new: Number(count?.value ?? 0) - 1 },
    ]
    const out = await sc.run(hr, 'approveWithChanges', {
      requestId: id,
      changes,
      reason: 'One seat fewer this year.',
    })
    expect(out.outcome.ok, out.outcome.ok ? '' : out.outcome.refused).toBe(true)
    const after = (await sc.request(id)) as HcRequest
    const credit = creditChangeOf(after)
    expect(credit).toEqual({ old: before.trade?.creditBp, new: after.trade?.creditBp })
    const mine = requestsModel(await sc.ctx(mgr)).mine.cards.find((c) => c.requestId === id)
    const sh = (bp: number | null | undefined) => ((bp ?? 0) / 10_000).toFixed(2)
    expect(mine?.changes?.text).toBe(
      `Changed by your HRBP: ${count?.value} seats to ${Number(count?.value) - 1}, credit ${sh(before.trade?.creditBp)} to ${sh(after.trade?.creditBp)} standard heads`,
    )
    expect(mine?.changes?.reason).toBe('One seat fewer this year.')
  }, 300_000)

  it('creditChangeOf: the seats before the change at the stored weight each; none without a count change', () => {
    const base = {
      trade: { count: 2, getBp: 5530, giveBp: 8691, creditBp: 3161, restFte: null },
      changes: { changes: [{ field: 'count', old: 3, new: 2 }] },
    } as unknown as HcRequest
    expect(creditChangeOf(base)).toEqual({ old: 396, new: 3161 })
    expect(
      creditChangeOf({
        ...base,
        changes: { changes: [{ field: 'startDate', old: 'a', new: 'b' }] },
      } as never),
    ).toBeNull()
  })

  it('creditChangeOf reads the pair the change stored, a start change that moved the credit included (SC-16)', () => {
    const base = {
      trade: { count: 2, getBp: 5530, giveBp: 8691, creditBp: 3161, restFte: null },
      changes: { changes: [{ field: 'count', old: 3, new: 2 }], credit: { old: 400, new: 3161 } },
    } as unknown as HcRequest
    // Rates moved between submit and the change, so the stored pair differs from the derived 396.
    expect(creditChangeOf(base)).toEqual({ old: 400, new: 3161 })
    expect(
      creditChangeOf({
        ...base,
        changes: { changes: [{ field: 'startDate', old: 'a', new: 'b' }], credit: { old: 3000, new: 3161 } },
      } as never),
    ).toEqual({ old: 3000, new: 3161 })
    expect(
      creditChangeOf({
        ...base,
        changes: { changes: [{ field: 'count', old: 3, new: 2 }], credit: { old: 3161, new: 3161 } },
      } as never),
    ).toBeNull()
  })
})

describe('the requester changes a trade draft from Mine', () => {
  it('Mine offers the get seats’ fields, and the Change dialog’s patch re-quotes the ask', async () => {
    const { sc, mgr, id } = await managerATrade()
    const card = requestsModel(await sc.ctx(mgr)).mine.cards.find((c) => c.requestId === id)
    expect(card?.editable.map((f) => f.field)).toEqual(['level', 'location', 'fte', 'startDate', 'count'])
    expect(card?.editAsk?.get.location).toBe('Bengaluru')
    const count = Number(card?.editable.find((f) => f.field === 'count')?.value)
    expect(count).toBeGreaterThan(1)
    const patch = editPatchOf(card as NonNullable<typeof card>, [{ field: 'count', new: count - 1 }])
    expect(patch.ask?.get.count).toBe(count - 1)
    const out = await sc.run(mgr, 'editRequest', { requestId: id, patch })
    expect(out.outcome.ok, out.outcome.ok ? '' : out.outcome.refused).toBe(true)
    expect((await sc.request(id))?.trade?.count).toBe(count - 1)
    // Submitted, it is no longer the requester's to change.
    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const sent = requestsModel(await sc.ctx(mgr)).mine.cards.find((c) => c.requestId === id)
    expect(sent?.editable).toEqual([])
    expect(sent?.editAsk).toBeNull()
  }, 300_000)
})

describe('the trade quote card', () => {
  it('a quote priced from FY28 Working says its rates can change; an FY27 quote does not (SC-11)', async () => {
    const fy28 = await managerATrade('2027-06-07')
    const c28 = requestsModel(await fy28.sc.ctx(fy28.mgr)).mine.cards.find((c) => c.requestId === fy28.id)
    expect(c28?.trade?.lines).toContain('Rates can change until FY28 locks.')
    const fy27 = await managerATrade('2027-01-01')
    const c27 = requestsModel(await fy27.sc.ctx(fy27.mgr)).mine.cards.find((c) => c.requestId === fy27.id)
    expect(c27?.trade?.lines.some((l) => l.startsWith('Rates can change'))).toBe(false)
  }, 300_000)

  it('a give seat whose open req is at Interviewing is named, with no amount (SC-12, SP-12)', async () => {
    const sc = scenario()
    const adm: Who = { mode: 'hr-admin', personId: personaOf(sc.sample, 'hr-admin').employeeId }
    const ctx = await sc.ctx(adm)
    const req = ctx.all.reqs.find((r) => r.reqId === 'REQ-4185')
    expect(req).toMatchObject({ positionId: 'P-2554', status: 'Open', stage: 'Interviewing' })
    const seat = seatStateOf(ctx, 'P-2554')
    const form = {
      ...emptyForm('Trade'),
      reasonCode: 'Level mix' as never,
      managerPositionId: seat?.position.managerPositionId ?? null,
      level: 'P1' as never,
      location: seat?.position.location ?? null,
      fte: 1,
      startDate: '2027-01-04',
    }
    form.trade = { ...(form.trade as NonNullable<typeof form.trade>), give: ['P-2554'] }
    const pv = newRequestPreview(ctx, form)
    expect(pv.quote?.lines).toContain(
      'REQ-4185 on P-2554 is interviewing. Trading the seat leaves the req open as imported.',
    )
  }, 300_000)
})

describe('a seat with an accepted offer (SC-5, C23)', () => {
  it('a pending Start date on it is offered no approval, says why, and may still be sent back', async () => {
    const sc = scenario()
    const b = personaOf(sc.sample, 'manager-b')
    const B: Who = { mode: 'manager', personId: b.employeeId }
    const SEAT = 'P-2566'
    const d = await sc.run(B, 'proposeStart', {
      positionId: SEAT,
      startDate: '2027-03-01',
      reasonCode: REASON_CODES_OF['Start date'][0],
    } as never)
    const id = idOf(said(d.outcome))
    expect((await sc.run(B, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const who = deciderOf(sc.sample, (await sc.request(id)) as HcRequest)
    const open = requestsModel(await sc.ctx(who)).approvals.cards.find((c) => c.requestId === id)
    expect(open?.can.approve).toBe(true)
    // The ATS import arrives: the seat's req is at Offer accepted.
    const offer = {
      reqId: 'REQ-TEST-1',
      positionId: SEAT,
      reqType: 'New',
      status: 'Open',
      stage: 'Offer accepted',
      openedDate: '2026-08-01',
      targetStartDate: '2026-11-16',
      offerAcceptedDate: '2026-09-25',
      startDate: '2026-11-16',
      closedDate: null,
      hiringManagerId: b.employeeId,
      recruiter: 'Recruiter',
      offerBase: null,
      offerCurrency: null,
      signOnBonus: null,
      relocation: null,
      agencyFee: null,
    } as never
    sc.setDatasets({ reqs: [...sc.sample.datasets.reqs.filter((r) => r.positionId !== SEAT), offer] })
    const card = requestsModel(await sc.ctx(who)).approvals.cards.find((c) => c.requestId === id)
    expect(card?.can).toMatchObject({
      approve: false,
      approveWithChanges: false,
      sendBack: true,
      reject: true,
    })
    expect(card?.notes).toContainEqual({ label: 'Accepted offer', text: ACCEPTED_OFFER_TEXT })
  }, 300_000)
})

describe('Manager mode: the status after approval of a Level change on a Filled seat (CONTRACTS-M3 7.4.3)', () => {
  it('staffedAfterApproval: a Level or Location change on a Filled seat moves the staffed months from its month', () => {
    const months = [
      { month: '2026-10', monthEnd: '2026-10-31', heads: 5, bandCost: 900_000, drivers: [] },
      { month: '2026-11', monthEnd: '2026-11-30', heads: 5, bandCost: 900_000, drivers: [] },
      { month: '2026-12', monthEnd: '2026-12-31', heads: 5, bandCost: 900_000, drivers: [] },
    ] as never
    const e = { month: '2026-11' as const, bandCost: 40_000 }
    expect(staffedAfterApproval('Level change', e, months, true).map((m) => m.bandCost)).toEqual([
      900_000, 940_000, 940_000,
    ])
    expect(staffedAfterApproval('Location change', e, months, true).map((m) => m.bandCost)).toEqual([
      900_000, 940_000, 940_000,
    ])
    // An Open seat holds nobody staffed; a New role adds no one until they start.
    expect(staffedAfterApproval('Level change', e, months, false)).toBe(months)
    expect(staffedAfterApproval('New role', e, months, true)).toBe(months)
    expect(staffedAfterApproval('Level change', null, months, true)).toBe(months)
  })

  it('reprices the staffed months from the change’s month, the allocation unchanged', async () => {
    const sc = scenario()
    // A manager whose own manager approves in Manager mode: the requester of a request waiting on
    // E10157's manager step.
    const waiting = requestsModel(await sc.ctx({ mode: 'manager', personId: 'E10157' })).approvals.cards[0]
    const requester = (await sc.request(waiting?.requestId as string))?.requesterId as string
    const B: Who = { mode: 'manager', personId: requester }
    const filled = requestsNewOf(await sc.ctx(B))?.seats.rows.find(
      (r) => r.status === 'Filled' && r.types.includes('Level change') && r.level === 'P3',
    )
    expect(filled).toBeTruthy()
    const d = await sc.run(B, 'createRequest', {
      type: 'Level change',
      positionId: filled?.positionId as string,
      level: 'P4',
      startDate: '2026-11-01',
      reasonCode: REASON_CODES_OF['Level change'][0],
    } as never)
    const id = idOf(said(d.outcome))
    expect(id).not.toBe('')
    expect((await sc.run(B, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const who = deciderOf(sc.sample, (await sc.request(id)) as HcRequest)
    expect(who.mode).toBe('manager')
    const ctx = await sc.ctx(who)
    const card = requestsModel(ctx).approvals.cards.find((c) => c.requestId === id)
    const facts = teamFacts(ctx)
    const e = facts.effects.find((x) => x.requestId === id)
    expect(e && e.bandCost > 0).toBe(true)
    const status = (shift: boolean) => {
      const after = budgetStatus({
        allocation: facts.allocation,
        staffed: shift
          ? facts.months.map((m) =>
              e && m.month >= e.month ? { ...m, bandCost: m.bandCost + e.bandCost } : m,
            )
          : facts.months,
        pending: facts.effects.filter((x) => x.requestId !== id),
        atRiskShare: ctx.metrics.num(TEAM_PARAM.atRiskShare.metricId, TEAM_PARAM.atRiskShare.key),
      })
      return `Status after approval: ${after.status}${after.reason ? ` (${after.reason.charAt(0).toLowerCase()}${after.reason.slice(1)})` : ''}.`
    }
    expect(card?.managerAfter?.status).toBe(status(true))
    expect(card?.managerAfter?.allocation).toBe(
      `Allocation after approval: ${facts.allocation.heads} ${facts.allocation.heads === 1 ? 'head' : 'heads'}.`,
    )
  }, 300_000)
})

describe('a cross-unit trade’s last step offers "Move target too?" (SP-5, 11.4)', () => {
  it('on by default, offered only at the step that applies the trade, and sent with the approval', async () => {
    const sc = scenario()
    const adm: Who = { mode: 'hr-admin', personId: personaOf(sc.sample, 'hr-admin').employeeId }
    const made = await sc.run(adm, 'createTrade', {
      ask: {
        give: ['P-2460'],
        creditUsedBp: 0,
        giveOrgPositionId: null,
        get: {
          level: 'P3',
          location: 'San Jose',
          fte: 1,
          orgPositionId: 'P-1001',
          businessUnit: 'Executive Office',
          jobFamily: null,
          start: '2027-01-01',
          count: 'max',
          partTimeRest: false,
        },
      },
      reasonCode: 'Location strategy',
    } as never)
    const id = idOf(said(made.outcome))
    expect((await sc.run(adm, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    for (let guard = 0; guard < 10; guard++) {
      const req = (await sc.request(id)) as HcRequest
      const at = req.steps.findIndex((x) => x.enteredAt && !x.decision)
      if (at < 0) break
      const who = deciderOf(sc.sample, req)
      const card = requestsModel(await sc.ctx(who)).approvals.cards.find((c) => c.requestId === id)
      const last = at === req.steps.length - 1
      expect(card?.moveTarget, `step ${at + 1}`).toEqual(last ? { on: true } : null)
      const out = await sc.run(
        who,
        'approveRequest',
        last ? { requestId: id, moveTarget: false } : { requestId: id },
      )
      expect(out.outcome.ok, out.outcome.ok ? '' : out.outcome.refused).toBe(true)
    }
    const done = (await sc.request(id)) as HcRequest
    expect(done.state).toBe('Approved')
    expect((done.trade as { moveTarget?: boolean } | null)?.moveTarget).toBe(false)
  }, 300_000)
})
