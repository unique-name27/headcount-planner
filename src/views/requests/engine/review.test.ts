/**
 * The M3 review's fixes in the Requests lists and cards (docs/PLAN.md 15.1 R47, 10.1, R6, 8.4,
 * 9.4; lead decisions D-EXPIRY and D-ID): the as-of date is the lists' "today" (a step stored with a
 * later date waits from the as-of date, 0 days, never negative); an idle Draft or Sent back request
 * reads Expired once, everywhere, and frees its credit; every approver on the chain sees what waits
 * on them whatever the mode's scope; Manager mode reads no amount in a title and no next request ID;
 * a block names a pending request only to a viewer who sees it; an imported freeze exception with no
 * reason says so; a target outside the viewer's Targets says so.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { hasAmount } from '@/access/visibility'
import { actionEnvOf } from '@/app/write/context'
import { approveAll, deciderOf, said, scenario, type Who } from '@/app/write/scenario.testkit'
import { SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { effectiveRequestsOf, requestsOf } from '@/drill/seats'
import { resolveDrill } from '@/drill/types'
import { requestIdInText } from '@/plan/actions/requestIds'
import type { HcRequest } from '@/plan/types'
import { ctxAs, leakSample, personaOf, requestOf, sampleCtx, withPlanRequests } from '@/testkit/sample'
import { requestsActions } from './actions'
import { prepOf } from './base'
import { requestCard } from './cards'
import { requestsModel } from './index'
import { requestsNewOf } from './new'
import { OTHER_PENDING_TEXT } from './quoteCard'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const idOf = (text: string): string => requestIdInText(text) ?? ''

/** A pending request of a persona's own (Submitted or In review), as the sample holds it. */
function pendingOf(x: Sample, personId: string): HcRequest {
  const own = requestsOf(sampleCtx('hr-admin', { sample: x })).filter(
    (r) => r.requesterId === personId && (r.state === 'Submitted' || r.state === 'In review'),
  )
  if (!own.length) throw new Error(`${personId} has no pending request`)
  return own[0] as HcRequest
}

describe('R47: the as-of date is the lists’ today', () => {
  it('a step stored with a date after the as-of date waits from the as-of date: 0 days, on the approver’s list', () => {
    const a = personaOf(s, 'manager-a')
    const base = pendingOf(s, a.employeeId)
    const at = base.steps.findIndex((x) => x.enteredAt && !x.decision)
    // A row written before R47 with the wall clock's date, 24 days after the as-of date.
    const later = '2026-10-24T09:00:00.000Z'
    const req: HcRequest = {
      ...base,
      steps: base.steps.map((x, i) => (i === at ? { ...x, enteredAt: later } : x)),
      updatedAt: later,
    }
    const x = withPlanRequests(s, [req])
    const step = req.steps[at]
    const mine = requestsModel(ctxAs('manager', a.employeeId, { sample: x })).mine.rows.rows.find(
      (r) => r.requestId === req.requestId,
    ) as unknown as { stepLabel: string | null; daysShown: number | null; daysInStep: number | null }
    expect(mine.stepLabel).toMatch(/review$/)
    expect(mine.daysShown).toBe(0)
    expect(mine.daysInStep).toBe(0)
    const who = deciderOf(x, req)
    const ctx = ctxAs(who.mode, who.personId, { sample: x, unit: who.unit })
    const m = requestsModel(ctx)
    expect(m.approvals.rows.rows.map((r) => r.requestId)).toContain(req.requestId)
    expect(m.approvals.cards.find((c) => c.requestId === req.requestId)?.can.approve).toBe(true)
    // The card reads the step on the as-of date, and the Action center item is due from it.
    const card = m.approvals.cards.find((c) => c.requestId === req.requestId)
    expect(card?.steps.find((l) => l.n === step?.n)?.at).toBe(SAMPLE_AS_OF)
    const item = requestsActions(ctx).find((i) => i.id === `requests:approve:${req.requestId}`)
    expect(item?.due).toBe('2026-10-05')
  })

  it('submit, approve, send back and resubmit with the wall clock weeks after the as-of date: each step waits on its approver from day 0', async () => {
    const sc = scenario({ start: '2026-11-20T09:00:00.000Z' })
    const a = personaOf(sc.sample, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const d = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P2',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-02-01',
      reasonCode: 'Growth',
    })
    const id = idOf(said(d.outcome))
    expect(id).not.toBe('')
    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const check = async () => {
      const req = (await sc.request(id)) as HcRequest
      const who = deciderOf(sc.sample, req)
      const row = requestsModel(await sc.ctx(mgr)).mine.rows.rows.find(
        (r) => r.requestId === id,
      ) as unknown as {
        stepLabel: string | null
        daysShown: number | null
      }
      expect(row.stepLabel, id).not.toBeNull()
      expect(row.daysShown).toBe(0)
      const theirs = requestsModel(await sc.ctx(who)).approvals.rows.rows.find((r) => r.requestId === id)
      expect(theirs, `${who.mode} ${who.personId}`).toBeTruthy()
      return who
    }
    const first = await check()
    const back = await sc.run(first, 'sendBack', {
      requestId: id,
      reason: 'Say which product line this covers',
    })
    expect(back.outcome.ok).toBe(true)
    expect((await sc.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const again = await check()
    expect((await sc.run(again, 'approveRequest', { requestId: id })).outcome.ok).toBe(true)
    if ((await sc.request(id))?.steps.some((x) => x.enteredAt && !x.decision)) await check()
  }, 180_000)
})

describe('D-EXPIRY: an idle Draft or Sent back request reads Expired once, everywhere', () => {
  const sentBack = async () => {
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const req = pendingOf(sc.sample, a.employeeId)
    const who = deciderOf(sc.sample, req)
    const back = await sc.run(who, 'sendBack', {
      requestId: req.requestId,
      reason: 'Say which product line this covers',
    })
    expect(back.outcome.ok).toBe(true)
    return { sc, a, id: req.requestId, who }
  }

  it('the sample on its own as-of date has nothing expired: the same requests, the same objects', () => {
    const ctx = sampleCtx('hr-admin')
    expect(effectiveRequestsOf(ctx)).toBe(requestsOf(ctx))
  })

  it('Mine counts it once (Expired), its card reads Expired and may be withdrawn, and it raises no sent-back item', async () => {
    const { sc, a, id } = await sentBack()
    const later: Who = { mode: 'manager', personId: a.employeeId, asOf: '2026-12-15' }
    const ctx = await sc.ctx(later)
    const m = requestsModel(ctx)
    const kpi = (k: string) => m.mine.kpis.find((x) => x.id === k)
    const ids = (k: string) =>
      ((resolveDrill(kpi(k)?.drill)?.rows ?? []) as readonly { requestId: string }[]).map((r) => r.requestId)
    expect(ids('mine-expired')).toContain(id)
    expect(ids('mine-open')).not.toContain(id)
    expect(ids('mine-sent-back')).not.toContain(id)
    const card = m.mine.cards.find((c) => c.requestId === id)
    expect(card?.state).toBe('Expired')
    expect(card?.facts).toContainEqual({ label: 'State', value: 'Expired' })
    expect(card?.can).toMatchObject({ submit: false, withdraw: true })
    expect(card?.editable).toEqual([])
    expect(requestsActions(ctx).some((i) => i.id === `requests:sent-back:${id}`)).toBe(false)
    // The same day 59: still Sent back, counted in progress and sent back, with its item.
    const before = await sc.ctx({ ...later, asOf: '2026-11-28' })
    expect(requestsModel(before).mine.cards.find((c) => c.requestId === id)?.state).toBe('Sent back')
    expect(requestsActions(before).some((i) => i.id === `requests:sent-back:${id}`)).toBe(true)
    // The requester closes the expired request with the card's Withdraw.
    const out = await sc.run(later, 'withdrawRequest', { requestId: id })
    expect(out.outcome.ok, out.outcome.ok ? '' : out.outcome.refused).toBe(true)
    expect(requestsModel(await sc.ctx(later)).mine.cards.find((c) => c.requestId === id)?.state).toBe(
      'Withdrawn',
    )
  }, 180_000)

  it('the HRBP’s queue leaves it out of the requests in progress', async () => {
    const { sc, id, who } = await sentBack()
    const q = requestsModel(await sc.ctx({ ...who, asOf: '2026-12-15' })).queue
    expect(q.rows.rows.map((r) => r.requestId)).not.toContain(id)
    expect(q.byState.rows.find((r) => r.state === 'Expired')?.count).toBeGreaterThanOrEqual(1)
  }, 180_000)

  it('an expired Sent back trade holds no credit: Requests > New lists the giving org’s credit again', async () => {
    const sc = scenario()
    await sc.run({ mode: 'leader', personId: 'E10505' }, 'approveRequest', { requestId: 'R-1040' })
    const holder: Who = { mode: 'manager', personId: 'E11205' }
    const credit = async (asOf: string) =>
      requestsModel(await sc.ctx({ ...holder, asOf })).new?.credit.find((c) => c.orgPositionId === 'P-1629')
        ?.bp ?? 0
    expect(await credit(SAMPLE_AS_OF)).toBe(420)
    const t = await sc.run(holder, 'createTrade', {
      ask: {
        give: ['P-2486'],
        creditUsedBp: 420,
        giveOrgPositionId: null,
        get: {
          level: 'P3',
          location: 'Bengaluru',
          fte: 1,
          orgPositionId: 'P-1629',
          businessUnit: 'Systems & Software',
          jobFamily: null,
          start: '2027-01-04',
          count: 'max',
          partTimeRest: false,
        },
      },
      reasonCode: 'Location strategy',
    } as never)
    const id = idOf(said(t.outcome))
    expect((await sc.run(holder, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const first = deciderOf(sc.sample, (await sc.request(id)) as HcRequest)
    expect(
      (await sc.run(first, 'sendBack', { requestId: id, reason: 'Pick a later start for the seats' })).outcome
        .ok,
    ).toBe(true)
    // Pending (sent back), it holds the credit; expired, it holds none.
    expect(await credit(SAMPLE_AS_OF)).toBe(0)
    expect(await credit('2026-11-29')).toBe(420)
  }, 180_000)
})

describe('SC-8: an approver outside the mode’s scope still sees what waits on them', () => {
  it('a step moved up the chain (no self-approval) reaches its approver’s Approvals and Action center', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: 'E10342', unit: 'Systems & Software' }
    const d = await sc.run(hr, 'createRequest', {
      type: 'New role',
      managerPositionId: 'P-1645',
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
    })
    const id = idOf(said(d.outcome))
    expect((await sc.run(hr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const step = (await sc.request(id))?.steps.find((x) => x.enteredAt && !x.decision)
    expect(step?.approverId).toBe('E10964')
    for (const who of [
      { mode: 'hrbp', personId: 'E10964', unit: 'Executive Office' },
      { mode: 'manager', personId: 'E10964' },
      { mode: 'leader', personId: 'E10964' },
    ] as Who[]) {
      const ctx = await sc.ctx(who)
      const m = requestsModel(ctx)
      expect(
        m.approvals.rows.rows.map((r) => r.requestId),
        who.mode,
      ).toContain(id)
      expect(m.approvals.cards.find((c) => c.requestId === id)?.can.approve, who.mode).toBe(true)
      expect(
        requestsActions(ctx).some((i) => i.id === `requests:approve:${id}`),
        who.mode,
      ).toBe(true)
    }
  }, 180_000)
})

describe('Manager mode: no amount in a title, no next request ID (PV-6, SC-13)', () => {
  const TITLE = 'Field Sales Engineer (budget €140,000)'

  it('an imported title with an amount reads "an amount" on every list, card and item of Manager mode', () => {
    const a = personaOf(s, 'manager-a')
    const req = { ...pendingOf(s, a.employeeId), jobTitle: TITLE }
    const x = withPlanRequests(s, [req])
    const ctx = ctxAs('manager', a.employeeId, { sample: x })
    const m = requestsModel(ctx)
    const row = m.mine.rows.rows.find((r) => r.requestId === req.requestId)
    expect(row?.jobTitle).toBe('Field Sales Engineer (budget an amount)')
    const card = m.mine.cards.find((c) => c.requestId === req.requestId)
    expect(hasAmount(card?.heading ?? '')).toBe(false)
    for (const f of card?.facts ?? []) expect(hasAmount(f.value), f.label).toBe(false)
    for (const i of requestsActions(ctx)) expect(hasAmount(JSON.stringify(i.subject)), i.id).toBe(false)
    // Outside Manager mode the title reads as stored (it is refused at entry, 8.4 rule 5).
    const who = deciderOf(x, req)
    const theirs = requestsModel(ctxAs(who.mode, who.personId, { sample: x, unit: who.unit }))
    expect(theirs.approvals.rows.rows.find((r) => r.requestId === req.requestId)?.jobTitle).toBe(TITLE)
  })

  it('Requests > New carries no next request ID in Manager mode, and does elsewhere', () => {
    const mgr = requestsModel(sampleCtx('manager')).new
    expect(mgr && 'nextRequestId' in mgr).toBe(false)
    expect(requestsModel(sampleCtx('hrbp')).new?.nextRequestId).toMatch(/^R-/)
  })
})

describe('PV-9: a seat in a pending request names it only to a viewer who sees it', () => {
  it('Manager E10001 reads "another pending request" for seats in requests hidden from them', () => {
    const ctx = ctxAs('manager', 'E10001')
    const p = prepOf(ctx)
    const rows = requestsModel(ctx).new?.seats.rows ?? []
    const blocked = rows.filter((r) => r.tradeBlock?.includes('pending request'))
    expect(blocked.length).toBeGreaterThan(0)
    for (const r of blocked) {
      const named = requestIdInText(r.tradeBlock ?? '')
      if (named) {
        const req = p.all.find((q) => q.requestId === named)
        expect(req && p.view(req), r.positionId).toBe('full')
      } else expect(r.tradeBlock).toBe(OTHER_PENDING_TEXT)
    }
    expect(rows.find((r) => r.positionId === 'P-2589')?.tradeBlock).toBe(OTHER_PENDING_TEXT)
  })
})

describe('the cards', () => {
  it('SC-7: an imported freeze exception with no business reason says the reason is missing', () => {
    const ctx = sampleCtx('finance')
    const req = requestOf(s, 'R-1029')
    expect(req.exception?.reason ?? '').toBe('')
    const card = requestCard(prepOf(ctx), req)
    expect(card?.notes).toContainEqual({ label: 'Freeze exception', text: 'No business reason was given.' })
  })

  it('SC-21: a target outside the viewer’s Targets says so, not "when FY27 is the version shown"', () => {
    const ctx = ctxAs('leader', 'E10505')
    const card = requestsModel(ctx).approvals.cards.find((c) => c.requestId === 'R-1040')
    expect(card?.gapAfter?.note ?? '').not.toMatch(/when FY27 is the version shown/)
    expect(card?.gapAfter?.note).toMatch(/outside the targets this mode shows/)
  })
})

describe('a receiving seat an approved internal move holds (SC-6, M3 verify)', () => {
  it('New offers it to no request and says why in the trade note', async () => {
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const admin: Who = { mode: 'hr-admin', personId: personaOf(sc.sample, 'hr-admin').employeeId }
    const adminCtx = await sc.ctx(admin)
    const env = actionEnvOf(adminCtx)
    const rows = [...adminCtx.positionIndex.byId.values()]
    const from = rows.find(
      (r) => r.managerPositionId === a.positionId && env.seat(r.positionId)?.status === 'Filled',
    )
    const to = rows.find(
      (r) =>
        r.businessUnit === 'Silicon Engineering' &&
        env.seat(r.positionId)?.status === 'Open' &&
        !env.seat(r.positionId)?.acceptedOffer &&
        !env.seat(r.positionId)?.pendingRequestId,
    )
    if (!from || !to) throw new Error('no seats')
    const rowOf = async () =>
      requestsNewOf(await sc.ctx(admin))?.seats.rows.find((r) => r.positionId === to.positionId)
    // Control: before the move the Open seat takes requests.
    expect((await rowOf())?.types.length).toBeGreaterThan(0)
    const person = adminCtx.all.workers.find((w) => w.positionId === from.positionId)?.employeeId as string
    const gtmHrbp: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }
    const draft = await sc.run(gtmHrbp, 'processTransfer', {
      kind: 'internal',
      personId: person,
      fromPositionId: from.positionId,
      toPositionId: to.positionId,
      effectiveDate: '2026-11-02',
      moveBudget: false,
      reasonCode: 'Restructure',
    })
    const id = idOf(said(draft.outcome))
    expect((await sc.run(gtmHrbp, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    expect((await approveAll(sc, id)).every((x) => x.outcome.ok)).toBe(true)
    const row = await rowOf()
    expect(row?.status).not.toBe('Filled')
    expect(row?.types).toEqual([])
    expect(row?.tradeBlock).toBe(
      `This seat is held for ${id}, an approved transfer, until HRIS shows the move.`,
    )
  }, 300_000)
})
