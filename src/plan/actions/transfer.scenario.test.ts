/**
 * A cross-unit transfer with "Move budget too?" (docs/PLAN.md 10.5, 8.4 rule 2a, 17 M3), walked
 * through the write path: the from-unit's HRBP processes an internal move of a Go-to-Market person
 * into an Open Silicon Engineering seat, the chain is CH4's shape (the requester's manager, the
 * from-unit HRBP, the to-unit HRBP, the from-unit leader, the to-unit leader; no band threshold, no
 * Finance), each approver decides acting as themselves, and on approval the from seat is held, the
 * receiving seat is filled by the transfer, and both units' FY27 targets move by one head and the
 * seat's in-year band estimate, with 'target' audit entries Finance reads (the cost read "changed").
 */
import { describe, expect, it } from 'vitest'
import { auditView, viewerOf } from '@/access/visibility'
import { chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import { seatStateOf } from '@/drill/seats'
import { targetKey } from '@/plan/engine/transfer'
import type { HcRequest } from '@/plan/types'
import { personaOf } from '@/testkit/sample'
import { approvedNotice, submittedNotice, transferDraftNotice } from './copy'
import { requestIdInText } from './requestIds'

const idOf = (text: string): string => requestIdInText(text) ?? ''

describe('a cross-unit internal move with Move budget too?', () => {
  it('takes CH4’s chain, holds the from seat, fills the receiving seat and moves both targets', async () => {
    const sc = scenario()
    const s = sc.sample
    const admin = await sc.ctx({ mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId })
    const a = personaOf(s, 'manager-a')
    // A Filled seat in Manager A's team (Go-to-Market) and an Open Silicon Engineering seat.
    const from = [...admin.positionIndex.byId.values()].find(
      (r) => r.managerPositionId === a.positionId && seatStateOf(admin, r.positionId)?.status === 'Filled',
    )
    const to = [...admin.positionIndex.byId.values()].find((r) => {
      const st = seatStateOf(admin, r.positionId)
      return (
        r.businessUnit === 'Silicon Engineering' &&
        st?.status === 'Open' &&
        !st.acceptedOffer &&
        r.level === 'P3'
      )
    })
    expect(from && to).toBeTruthy()
    const person = seatStateOf(admin, from?.positionId as string)?.holderIds[0] as string
    const gtmHrbp: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }

    const before = new Map(
      admin.all.targets.filter((t) => t.fiscalYear === 'FY27').map((t) => [targetKey(t), t]),
    )
    const draft = await sc.run(gtmHrbp, 'processTransfer', {
      kind: 'internal',
      personId: person,
      fromPositionId: from?.positionId as string,
      toPositionId: to?.positionId as string,
      effectiveDate: '2026-11-02',
      moveBudget: true,
      reasonCode: 'Restructure',
    })
    const id = idOf(draft.outcome.ok ? draft.outcome.notice : '')
    expect(draft.outcome).toEqual({ ok: true, notice: transferDraftNotice(id) })
    let req = (await sc.request(id)) as HcRequest
    // The moving person's manager is the requester; the HRBP who processed it is the submitter.
    expect(req).toMatchObject({
      type: 'Transfer',
      state: 'Draft',
      requesterId: a.employeeId,
      submittedById: 'E11076',
    })
    expect(draft.entries.every((e) => e.by === 'E11076')).toBe(true)

    const sub = await sc.run(gtmHrbp, 'submitRequest', { requestId: id })
    expect(sub.outcome).toEqual({ ok: true, notice: submittedNotice(id) })
    req = (await sc.request(id)) as HcRequest
    expect(req.steps.map((x) => x.role)).toEqual(['manager', 'hrbp', 'hrbp', 'leader', 'leader'])
    expect(req.steps.map((x) => x.approverId).slice(1, 3)).toEqual(['E11076', 'E10013'])
    expect(req.steps.some((x) => x.role === 'finance')).toBe(false)

    // Each approver decides acting as themselves (a manager in Manager mode, HRBPs in theirs, leaders in theirs).
    const modeOf = { manager: 'manager', hrbp: 'hrbp', leader: 'leader', finance: 'finance' } as const
    for (const [i, step] of req.steps.entries()) {
      const who: Who = {
        mode: modeOf[step.role],
        personId: step.approverId,
        ...(step.role === 'hrbp' ? { unit: i === 1 ? 'Go-to-Market' : 'Silicon Engineering' } : {}),
      }
      const out = await sc.run(who, 'approveRequest', { requestId: id })
      expect(out.outcome, `${step.role} ${step.approverId}`).toEqual({
        ok: true,
        notice: approvedNotice(id, i === req.steps.length - 1),
      })
      for (const e of out.entries) expect(e.by).toBe(step.approverId)
      expect(chainOk(await sc.log())).toBe(true)
    }
    const done = (await sc.request(id)) as HcRequest
    expect(done.state).toBe('Approved')

    // The from seat is held from the effective date; the receiving seat says Filled with the transfer.
    const plan = await sc.plan()
    expect(
      plan.overlay.positions.find(
        (r) => r.positionId === from?.positionId && r.effectiveDate === '2026-11-02',
      ),
    ).toMatchObject({ status: 'On hold', sourceRequestId: id })
    expect(
      plan.overlay.positions.find((r) => r.positionId === to?.positionId && r.effectiveDate === '2026-11-02'),
    ).toMatchObject({ status: 'Filled', sourceRequestId: id })

    // Both units' targets move by one head and the seat's in-year band estimate (never its HRIS cost).
    const moved = plan.overlay.targets.filter((t) => t.fiscalYear === 'FY27')
    expect(moved.map((t) => t.businessUnit).sort()).toEqual(['Go-to-Market', 'Silicon Engineering'])
    const gtm = moved.find((t) => t.businessUnit === 'Go-to-Market')
    const se = moved.find((t) => t.businessUnit === 'Silicon Engineering')
    const gtm0 = before.get(targetKey(gtm as never))
    const se0 = before.get(targetKey(se as never))
    expect(gtm?.targetHeads).toBe((gtm0?.targetHeads ?? 0) - 1)
    expect(se?.targetHeads).toBe((se0?.targetHeads ?? 0) + 1)
    const dropped = (gtm0?.targetCost ?? 0) - (gtm?.targetCost ?? 0)
    const gained = (se?.targetCost ?? 0) - (se0?.targetCost ?? 0)
    expect(dropped).toBeGreaterThan(0)
    expect(gained).toBeCloseTo(dropped, 6)

    // The target changes are audited (object 'target'); Finance reads them with the cost "changed".
    const log = await sc.log()
    const targetEntries = log.filter((e) => e.object === 'target')
    expect(targetEntries.map((e) => [e.id, e.field]).sort()).toEqual(
      [
        [targetKey(gtm as never), 'targetCost'],
        [targetKey(gtm as never), 'targetHeads'],
        [targetKey(se as never), 'targetCost'],
        [targetKey(se as never), 'targetHeads'],
      ].sort(),
    )
    const fin = await sc.ctx({ mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId })
    const seen = targetEntries.map((e) => auditView(e, viewerOf(fin)))
    for (const e of seen) {
      expect(e).not.toBeNull()
      if (e?.field === 'targetCost') expect([e.old, e.new]).toEqual(['changed', 'changed'])
      if (e?.field === 'targetHeads') expect(typeof e.new).toBe('number')
    }
    // Every entry of the walk is signed by its step's person; the chain verifies.
    expect(chainOk(log)).toBe(true)
  }, 120_000)

  it('refuses "Move budget too?" in Finance (hidden) and a person who does not hold the from seat', async () => {
    const sc = scenario()
    const s = sc.sample
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const out = await sc.run(fin, 'processTransfer', {
      kind: 'position',
      personId: 'E00000',
      fromPositionId: 'P-2053',
      toManagerPositionId: 'P-2052',
      effectiveDate: '2026-11-02',
      moveBudget: true,
      reasonCode: 'Restructure',
    })
    expect(out.outcome).toEqual({ ok: false, refused: 'Transfers are processed by HRBPs.' })
    const hr: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }
    const wrong = await sc.run(hr, 'processTransfer', {
      kind: 'position',
      personId: 'E00000',
      fromPositionId: 'P-2053',
      toManagerPositionId: 'P-2052',
      effectiveDate: '2026-11-02',
      moveBudget: false,
      reasonCode: 'Restructure',
    })
    expect(wrong.outcome).toEqual({
      ok: false,
      refused: 'The person who moves must hold the seat they move from.',
    })
  }, 120_000)
})
