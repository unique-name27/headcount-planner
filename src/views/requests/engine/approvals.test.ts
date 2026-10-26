/**
 * Requests > Approvals and Mine after writes (docs/PLAN.md 9.4, 10.1, 10.2, 7.3, 7.4, 7.6, 8.4;
 * docs/CONTRACTS-M3.md 3, requests-ui): each card's decisions follow the step and the policy; the gap
 * after approval shows in heads, and in cost only under the mode's rules, and agrees with Targets >
 * Gap; Manager mode's cards name no amount and show heads, the allocation after approval and the
 * status after approval instead. Through the write path: approve, approve with changes (Manager A's
 * Mine card reads each change with its reason), send back (the reason, then submit again), reject,
 * and comments with their audience (an amount makes a comment Approvers only, and it never reaches
 * Manager mode).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { hasAmount } from '@/access/visibility'
import { hrbpUnitOf, type Scenario, scenario, type Who } from '@/app/write/scenario.testkit'
import type { AnalyticsContext } from '@/data/context'
import { invalidRefs } from '@/data/quality/fieldRef'
import type { Sample } from '@/data/sample'
import { REMOVE_AMOUNT_TEXT } from '@/plan/actions'
import { requestIdInText } from '@/plan/actions/requestIds'
import type { HcRequest } from '@/plan/types'
import { isAmountKey } from '@/testkit/leaks'
import { ctxAs, leakSample, personaOf, sampleCtx } from '@/testkit/sample'
import { prepare } from '@/views/targets/engine/base'
import { gapRows } from '@/views/targets/engine/gap'
import { prepOf } from './base'
import { requestCard } from './cards'
import { requestsModel } from './index'

let s: Sample
let unitOf: (id: string) => string | undefined
beforeAll(() => {
  s = leakSample()
  unitOf = hrbpUnitOf(s)
}, 120_000)

const idOf = (text: string): string => requestIdInText(text) ?? ''

/** Every key of a value that carries one (undefined is no key). */
function keysOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) for (const x of v) keysOf(x, out)
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      if (x === undefined) continue
      out.push(k)
      keysOf(x, out)
    }
  return out
}

/** The waiting step's approver of a request. */
const approverOf = (r: HcRequest) => r.steps.find((x) => x.enteredAt && !x.decision)?.approverId as string

/** The Targets > Gap row a card's target org is. */
function targetRowFor(ctx: AnalyticsContext, org: string) {
  return gapRows(prepare(ctx)).find((r) => r.row.org === org)?.row ?? null
}

describe('the Approvals cards in every mode', () => {
  it('Manager mode: heads, the allocation and status after approval, and no amount anywhere', () => {
    const approver = 'E10157' // a manager's manager with a Backfill waiting at the manager step
    const ctx = ctxAs('manager', approver)
    const m = requestsModel(ctx)
    expect(m.approvals.cards.length).toBeGreaterThan(0)
    for (const c of m.approvals.cards) {
      expect(c.can.approve).toBe(true)
      expect(c.can.approveWithChanges).toBe(false)
      expect('bandEstimateUsd' in c || 'gapAfter' in c).toBe(false)
      expect(c.managerAfter?.headsText).toMatch(/head/)
      expect(keysOf(c).filter(isAmountKey)).toEqual([])
      for (const t of JSON.stringify(c).match(/"[^"]*"/g) ?? []) expect(hasAmount(t), t).toBe(false)
    }
    expect(m.approvals.gaps).toBeNull()
  })

  it('HRBP, Leader and Finance: the band estimate and a gap after approval that agrees with Targets > Gap', () => {
    const cases: [AnalyticsContext, string][] = [
      [ctxAs('hrbp', 'E10342', { unit: unitOf('E10342') }), 'hrbp'],
      [sampleCtx('leader'), 'leader'],
      [sampleCtx('finance'), 'finance'],
    ]
    let costShown = 0
    let compared = 0
    for (const [ctx, mode] of cases) {
      const m = requestsModel(ctx)
      expect(m.approvals.cards.length, mode).toBeGreaterThan(0)
      const gaps = m.approvals.gaps
      expect(gaps, mode).not.toBeNull()
      expect(invalidRefs(gaps?.uses ?? []), mode).toEqual([])
      // The cost is one figure per org, keyed as Targets > Gap keys its rows; no list or card holds it.
      expect(gaps?.columns.find((x) => x.key === 'gapCostUsd')?.cost, mode).toBe(true)
      for (const col of m.approvals.rows.columns) expect(col.cost, `${mode} ${col.key}`).toBeFalsy()
      for (const c of m.approvals.cards) {
        const g = c.gapAfter
        expect(g, `${mode} ${c.requestId}`).toBeTruthy()
        if (!g) continue
        expect('cost' in g).toBe(false)
        expect(g.heads, `${mode} ${c.requestId}`).not.toBeNull()
        const own = gaps?.rows.find((r) => r.orgKey === g.orgKey)
        expect(own?.gapHeads, `${mode} ${c.requestId}`).toBe(g.heads)
        if (c.type === 'Transfer') expect(own?.gapCostUsd).toBeNull()
        if (c.view === 'full' && c.type !== 'Transfer')
          expect(c.bandEstimateUsd, `${mode} ${c.requestId}`).not.toBeUndefined()
      }
      for (const r of gaps?.rows ?? []) {
        const row = gapRows(prepare(ctx)).find((x) => x.row.orgKey === r.orgKey)?.row
        if (row && !r.note?.startsWith('Cost shows on Targets when')) {
          compared++
          expect(r.gapHeads, `${mode} ${r.orgKey}`).toBe(row.gapHeads)
          expect(r.gapCostUsd, `${mode} ${r.orgKey}`).toBe(row.gapCostUsd)
        }
        if (r.gapCostUsd != null) costShown++
        else expect(r.note, `${mode} ${r.orgKey}`).toBeTruthy()
        if (mode !== 'finance' && r.gapCostUsd != null)
          expect(Math.abs(r.gapCostUsd) % 100_000, r.orgKey).toBeLessThan(1e-6)
      }
    }
    // Finance's Corporate New role shows its exact cost gap; rounded modes show whole $0.1M steps.
    expect(costShown).toBeGreaterThan(0)
    expect(compared).toBeGreaterThanOrEqual(2)
    const corp = requestsModel(sampleCtx('finance')).approvals.gaps?.rows.find(
      (r) => r.orgKey === 'unit:Corporate',
    )
    expect(corp?.gapCostUsd).toBe(targetRowFor(sampleCtx('finance'), 'Corporate')?.gapCostUsd)
    expect(corp?.gapCostUsd).not.toBeNull()
  })

  it('the SE leader decides two cycle asks at the manager step; FY28’s gap reads in heads with the reason', () => {
    const m = requestsModel(sampleCtx('leader')).approvals
    for (const c of m.cards) {
      expect(c.gapAfter?.heads).toBe(-18)
      expect(c.gapAfter?.note).toBe('Cost shows on Targets when FY28 is the version shown.')
      expect(c.chain).toBe('Goes to: the requester’s manager')
    }
    expect(m.gaps?.rows.map((r) => [r.orgKey, r.gapHeads, r.gapCostUsd])).toEqual([
      ['unit:Silicon Engineering', -18, null],
    ])
  })
})

describe('the four decisions through the write path, read back on the cards', () => {
  let sc: Scenario
  beforeAll(() => {
    sc = scenario()
  }, 120_000)

  const a = () => personaOf(s, 'manager-a')
  const mgr = (): Who => ({ mode: 'manager', personId: a().employeeId })

  async function submitted(start: string): Promise<{ id: string; hrbp: Who }> {
    const d = await sc.run(mgr(), 'createRequest', {
      type: 'New role',
      managerPositionId: a().positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: start,
      reasonCode: 'Growth',
      jobTitle: 'Account Executive',
    })
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    expect((await sc.run(mgr(), 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const req = (await sc.request(id)) as HcRequest
    const hrbp = approverOf(req)
    return { id, hrbp: { mode: 'hrbp', personId: hrbp, unit: unitOf(hrbp) ?? 'Go-to-Market' } }
  }

  const cardAs = async (who: Who, id: string) => {
    const ctx = await sc.ctx(who)
    const req = (await sc.request(id)) as HcRequest
    return requestCard(prepOf(ctx), req, { approvals: who.mode !== 'manager' || true })
  }

  it('approve with changes: the manager reads each change with its reason; a reason with an amount is refused', async () => {
    const { id, hrbp } = await submitted('2027-01-04')
    const card = await cardAs(hrbp, id)
    expect(card?.can).toMatchObject({ approve: true, approveWithChanges: true, sendBack: true, reject: true })
    expect(card?.changeable.map((f) => f.field)).toEqual(['level', 'location', 'fte', 'startDate'])
    const ctxH = await sc.ctx(hrbp)
    expect(requestsModel(ctxH).approvals.cards.map((c) => c.requestId)).toContain(id)
    // The leader's step is not yet theirs: their card offers no decision.
    const req = (await sc.request(id)) as HcRequest
    const leader = req.steps.find((x) => x.role === 'leader')?.approverId
    if (leader) expect((await cardAs({ mode: 'leader', personId: leader }, id))?.can.approve).toBe(false)
    const changes = [{ field: 'startDate' as const, old: '2027-01-04', new: '2027-03-01' }]
    expect(
      (await sc.run(hrbp, 'approveWithChanges', { requestId: id, changes, reason: 'Budget is 95k short' }))
        .outcome,
    ).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    const ok = await sc.run(hrbp, 'approveWithChanges', {
      requestId: id,
      changes,
      reason: 'The team starts in March',
    })
    expect(ok.outcome.ok).toBe(true)
    const mine = requestsModel(await sc.ctx(mgr())).mine.cards.find((c) => c.requestId === id)
    expect(mine?.changes).toEqual({
      text: 'Changed by your HRBP: start moved from Jan to Mar',
      reason: 'The team starts in March',
    })
    expect(mine?.steps[0]).toMatchObject({
      role: 'HRBP',
      status: 'Approved with changes',
      note: 'The team starts in March',
    })
  }, 180_000)

  it('send back: the reason shows on Mine and the request can be submitted again; reject says why', async () => {
    const first = await submitted('2027-02-01')
    expect(
      (await sc.run(first.hrbp, 'sendBack', { requestId: first.id, reason: 'Above €140,000 a year' }))
        .outcome,
    ).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    expect(
      (await sc.run(first.hrbp, 'sendBack', { requestId: first.id, reason: 'Pick a Bengaluru seat' })).outcome
        .ok,
    ).toBe(true)
    let mine = requestsModel(await sc.ctx(mgr())).mine.cards.find((c) => c.requestId === first.id)
    expect(mine?.state).toBe('Sent back')
    expect(mine?.notes).toContainEqual({ label: 'What to change', text: 'Pick a Bengaluru seat' })
    expect(mine?.can.submit).toBe(true)
    // The requester changes what was asked before submitting again (editRequest).
    expect(mine?.editable.map((f) => f.field)).toEqual(['level', 'location', 'fte', 'startDate'])
    const changed = await sc.run(mgr(), 'editRequest', {
      requestId: first.id,
      patch: { location: 'Bengaluru' },
    })
    expect(changed.outcome).toEqual({ ok: true, notice: `Draft ${first.id} updated.` })
    expect(((await sc.request(first.id)) as HcRequest).location).toBe('Bengaluru')
    expect((await sc.run(mgr(), 'submitRequest', { requestId: first.id })).outcome.ok).toBe(true)
    mine = requestsModel(await sc.ctx(mgr())).mine.cards.find((c) => c.requestId === first.id)
    expect(mine?.state).toBe('Submitted')

    const second = await submitted('2027-02-15')
    expect(
      (await sc.run(second.hrbp, 'rejectRequest', { requestId: second.id, reason: 'Not this year' })).outcome
        .ok,
    ).toBe(true)
    const rejected = requestsModel(await sc.ctx(mgr())).mine.cards.find((c) => c.requestId === second.id)
    expect(rejected?.notes).toContainEqual({ label: 'Why it was rejected', text: 'Not this year' })
    expect(rejected?.can).toMatchObject({ submit: false, withdraw: false })
  }, 180_000)

  it('approve, and comments with their audience: an amount is Approvers only and never reaches Manager mode', async () => {
    const { id, hrbp } = await submitted('2027-01-18')
    const plain = await sc.run(hrbp, 'commentOnRequest', {
      requestId: id,
      text: 'Timing works for the team',
      audience: 'everyone',
    })
    expect(plain.outcome.ok).toBe(true)
    const amount = await sc.run(hrbp, 'commentOnRequest', {
      requestId: id,
      text: 'Band is near €140,000',
      audience: 'everyone',
    })
    expect(amount.outcome).toEqual({
      ok: true,
      notice: 'Comment added. This comment mentions an amount, so only approvers see it.',
    })
    const asHrbp = await cardAs(hrbp, id)
    expect(asHrbp?.comments.map((c) => [c.text, c.audience])).toEqual([
      ['Timing works for the team', 'Everyone on the request'],
      ['Band is near €140,000', 'Approvers only'],
    ])
    const asMgr = requestsModel(await sc.ctx(mgr())).mine.cards.find((c) => c.requestId === id)
    expect(asMgr?.comments.map((c) => c.text)).toEqual(['Timing works for the team'])
    expect(JSON.stringify(asMgr)).not.toMatch(/140|€/)
    expect((await sc.run(hrbp, 'approveRequest', { requestId: id })).outcome.ok).toBe(true)
    const after = requestsModel(await sc.ctx(mgr())).mine.cards.find((c) => c.requestId === id)
    expect(after?.steps[0]?.status).toBe('Approved')
  }, 180_000)
})

describe('a card shows each viewer only what 8.4 lets through', () => {
  it('Manager C’s Elimination: no card for C, a limited one for Finance, a full one for its HRBP', () => {
    const elim = s.planted.managerCElimination
    const reqOf = (ctx: AnalyticsContext) => prepOf(ctx).all.find((r) => r.requestId === elim) as HcRequest
    const c = personaOf(s, 'manager-c')
    const cCtx = ctxAs('manager', c.employeeId)
    expect(requestCard(prepOf(cCtx), reqOf(cCtx))).toBeNull()
    const fin = sampleCtx('finance')
    const limited = requestCard(prepOf(fin), reqOf(fin))
    expect(limited?.view).toBe('limited')
    expect(limited?.facts.map((f) => f.label)).toEqual(
      expect.not.arrayContaining(['Requester', 'Reason', 'Location', 'Start or effective date', 'Last day']),
    )
    expect(limited?.chain).toBeNull()
    expect(limited?.comments).toEqual([])
    expect(limited?.notes).toEqual([])
    for (const st of limited?.steps ?? [])
      expect([st.approver, st.note, st.at, st.why]).toEqual([null, null, null, null])
    expect(limited?.can.comment).toBe(false)
    const hrbpId = approverOf(reqOf(fin))
    const hr = ctxAs('hrbp', hrbpId, { unit: unitOf(hrbpId) })
    const full = requestCard(prepOf(hr), reqOf(hr), { approvals: true })
    expect(full?.view).toBe('full')
    expect(full?.can.approve).toBe(true)
    expect(full?.facts.map((f) => f.label)).toContain('Requester')
  })
})
