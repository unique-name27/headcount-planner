/**
 * The request scenarios of docs/PLAN.md 17 M3 (core), walked through the write path as the app runs
 * them (src/app/write/harness.ts over a MemoryStore and the sample, each step acted by its own
 * person): a New role from Draft to Started (each approver acting as themselves, the Planned seat in
 * Working, the tracker after approval read from the reqs), sent back and resubmitted, approved with
 * changes (the manager reads each change with its reason; a reason with an amount refused), a freeze
 * exception (it adds the Finance step; a business reason with an amount refused), no self-approval,
 * one person on two steps keeping the higher step, submit on behalf recording both people, the
 * accepted-offer refusals and idle expiry. After every step the audit chain verifies and every new
 * entry is signed by the step's Acting as person.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { decide } from '@/access/policy'
import { auditView, viewerOf } from '@/access/visibility'
import { chainOk, type Scenario, scenario, type Who } from '@/app/write/scenario.testkit'
import { REASON_CODES } from '@/data/schema'
import { seatStateOf } from '@/drill/seats'
import type { AuditEntry, HcRequest } from '@/plan/types'
import { personaOf } from '@/testkit/sample'
import { prepOf } from '@/views/requests/engine/base'
import {
  ACCEPTED_OFFER_TEXT,
  AMOUNT_COMMENT_NOTE,
  approvedNotice,
  expiredText,
  NOT_YOUR_STEP_TEXT,
  REMOVE_AMOUNT_TEXT,
  sentBackNotice,
  submittedNotice,
} from './copy'
import { requestIdInText } from './requestIds'

const idOf = (text: string): string => requestIdInText(text) ?? ''

/** Every new entry is signed by the step's person, in the step's mode, and the chain verifies. */
async function signed(sc: Scenario, entries: readonly AuditEntry[], who: Who) {
  expect(entries.length).toBeGreaterThan(0)
  for (const e of entries) {
    expect(e.by, `${e.object} ${e.field}`).toBe(who.personId)
    expect(e.mode, `${e.object} ${e.field}`).toBe(who.mode)
  }
  expect(chainOk(await sc.log())).toBe(true)
}

/** The step of a request waiting on a decision. */
const waiting = (r: HcRequest | null) =>
  r?.steps.find((s) => s.enteredAt != null && s.decision == null) ?? null

/** Who decides a step: the mode its role approves in, acting as its approver. */
function deciderOf(r: HcRequest, unitOf: (id: string) => string | undefined): Who {
  const s = waiting(r)
  if (!s) throw new Error(`${r.requestId} waits on no step`)
  const mode =
    s.role === 'hrbp' ? 'hrbp' : s.role === 'leader' ? 'leader' : s.role === 'finance' ? 'finance' : 'manager'
  return {
    mode,
    personId: s.approverId,
    ...(mode === 'hrbp' ? { unit: unitOf(s.approverId) ?? r.businessUnit } : {}),
  }
}

let base: Scenario
beforeAll(() => {
  base = scenario()
}, 120_000)

describe('a New role from Draft to Started (PLAN 17 M3)', () => {
  it('walks every step, each approver acting as themselves', async () => {
    const sc = scenario()
    const s = sc.sample
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }

    // 1. Manager A drafts a New role in their team.
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
    expect(draft.outcome.ok).toBe(true)
    const id = idOf(draft.outcome.ok ? draft.outcome.notice : '')
    expect(draft.outcome).toEqual({ ok: true, notice: `Draft ${id} saved.` })
    expect(draft.entries.map((e) => [e.object, e.id, e.field, e.old, e.new])).toEqual([
      ['request', id, 'state', null, 'Draft'],
    ])
    await signed(sc, draft.entries, mgr)
    expect((await sc.request(id))?.state).toBe('Draft')

    // 2. Submitted: the chain is stored on the request, step 1 entered.
    const sub = await sc.run(mgr, 'submitRequest', { requestId: id })
    expect(sub.outcome).toEqual({ ok: true, notice: submittedNotice(id) })
    let req = await sc.request(id)
    expect(req?.state).toBe('Submitted')
    expect(req?.steps.map((x) => x.role)).toEqual(['hrbp', 'leader', 'finance'])
    const gtmHrbp = req?.steps[0].approverId as string
    const finance = personaOf(s, 'finance-fpa').employeeId
    expect(req?.steps[2].approverId).toBe(finance)
    expect(req?.steps[0].enteredAt).toBe(sub.entries[0].at)
    expect(sub.entries.map((e) => [e.field, e.old, e.new])).toEqual([
      ['steps', null, req?.steps.map((x) => `${x.role} ${x.approverId}`).join(', ')],
      ['state', 'Draft', 'Submitted'],
    ])
    await signed(sc, sub.entries, mgr)

    // 3. Only the step's approver decides it: the leader cannot take the HRBP's step.
    const leaderId = req?.steps[1].approverId as string
    const early = await sc.run({ mode: 'leader', personId: leaderId }, 'approveRequest', { requestId: id })
    expect(early.outcome).toEqual({ ok: false, refused: NOT_YOUR_STEP_TEXT })
    expect(early.entries).toEqual([])

    // 4. Each approver approves, acting as themselves; the last approval applies it.
    const unitOf = () => 'Go-to-Market'
    for (const n of [1, 2, 3]) {
      req = await sc.request(id)
      const who = deciderOf(req as HcRequest, unitOf)
      const step = await sc.run(who, 'approveRequest', { requestId: id })
      expect(step.outcome).toEqual({ ok: true, notice: approvedNotice(id, n === 3) })
      await signed(sc, step.entries, who)
      expect(step.entries[0]).toMatchObject({ object: 'request', id, field: `step ${n}`, new: 'Approved' })
      if (n === 1) expect(who.personId).toBe(gtmHrbp)
      if (n === 3) expect(who.personId).toBe(finance)
    }
    req = await sc.request(id)
    expect(req?.state).toBe('Approved')
    expect(req?.steps.map((x) => x.decision)).toEqual(['Approved', 'Approved', 'Approved'])
    const seat = req?.outcome?.createdPositionIds[0] as string
    expect(seat).toMatch(/^P-(?:[0-9A-Z]{4}-)?\d+-1$/)

    // 5. The Planned seat is in Working, under Manager A, with the request as its source.
    const plan = await sc.plan()
    const row = plan.overlay.positions.find((r) => r.positionId === seat)
    expect(row).toMatchObject({
      status: 'Planned',
      level: 'P3',
      location: 'San Jose',
      managerPositionId: a.positionId,
      startDate: '2027-01-04',
      sourceRequestId: id,
      businessUnit: 'Go-to-Market',
    })
    const admin = await sc.ctx({ mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId })
    expect(seatStateOf(admin, seat)?.status).toBe('Planned')

    // 6. The tracker after approval reads the seat's req from the ATS, one stage at a time.
    const req0 = { reqId: 'REQ-M3-1', positionId: seat, reqType: 'New' as const, openedDate: '2026-10-05' }
    const stages: [Partial<(typeof s.datasets.reqs)[number]>, string][] = [
      [{ status: 'Open', stage: null }, 'Req opened'],
      [{ status: 'Open', stage: 'Interviewing' }, 'Interviewing'],
      [
        { status: 'Open', stage: 'Offer accepted', offerAcceptedDate: '2026-11-20', startDate: '2027-01-04' },
        'Offer accepted',
      ],
      [{ status: 'Filled', stage: 'Started', startDate: '2027-01-04', closedDate: '2027-01-04' }, 'Started'],
    ]
    for (const [patch, stage] of stages) {
      sc.setDatasets({
        reqs: [...s.datasets.reqs, { ...req0, status: 'Open', ...patch } as (typeof s.datasets.reqs)[number]],
      })
      const ctx = await sc.ctx(mgr)
      const r = (await sc.request(id)) as HcRequest
      expect(prepOf(ctx).row(r)?.stage, stage).toBe(stage)
    }
    sc.setDatasets(null)
  }, 120_000)
})

describe('sent back and resubmitted', () => {
  it('goes back to the requester with the reason, then through the chain again', async () => {
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const d = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P4',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-02-01',
      reasonCode: 'New capability',
    })
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    await sc.run(mgr, 'submitRequest', { requestId: id })
    const hrbp: Who = {
      mode: 'hrbp',
      personId: waiting(await sc.request(id))?.approverId as string,
      unit: 'Go-to-Market',
    }

    // A reason with an amount is refused at entry (8.4 rule 5); a blank one too.
    for (const reason of ['The offer would be €140,000', 'Budget 95k', ''])
      expect((await sc.run(hrbp, 'sendBack', { requestId: id, reason })).outcome.ok).toBe(false)
    expect(
      (await sc.run(hrbp, 'sendBack', { requestId: id, reason: 'Above 1,000 a month' })).outcome,
    ).toEqual({
      ok: false,
      refused: REMOVE_AMOUNT_TEXT,
    })

    const back = await sc.run(hrbp, 'sendBack', {
      requestId: id,
      reason: 'Say which customers this seat covers',
    })
    expect(back.outcome).toEqual({ ok: true, notice: sentBackNotice(id) })
    await signed(sc, back.entries, hrbp)
    expect(back.entries.map((e) => [e.field, e.new, e.comment, e.commentAudience])).toEqual([
      ['step 1', 'Sent back', 'Say which customers this seat covers', 'everyone'],
      ['state', 'Sent back', null, null],
    ])
    let req = await sc.request(id)
    expect(req?.state).toBe('Sent back')
    expect(req?.steps[0]).toMatchObject({
      decision: 'Sent back',
      note: 'Say which customers this seat covers',
    })

    // The requester edits the request and submits it again: a new chain, step 1 entered.
    const edit = await sc.run(mgr, 'editRequest', {
      requestId: id,
      patch: { jobTitle: 'Solutions Engineer' },
    })
    expect(edit.outcome).toEqual({ ok: true, notice: `Draft ${id} updated.` })
    await signed(sc, edit.entries, mgr)
    const again = await sc.run(mgr, 'submitRequest', { requestId: id })
    expect(again.outcome).toEqual({ ok: true, notice: submittedNotice(id) })
    await signed(sc, again.entries, mgr)
    req = await sc.request(id)
    expect(req?.state).toBe('Submitted')
    expect(req?.steps.every((x) => x.decision == null)).toBe(true)
    expect(waiting(req)?.n).toBe(1)
    expect(req?.jobTitle).toBe('Solutions Engineer')
  }, 120_000)
})

describe('approved with changes', () => {
  it('the HRBP changes level and start with a reason; the manager reads each change with it', async () => {
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const d = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P4',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
    })
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    await sc.run(mgr, 'submitRequest', { requestId: id })
    const hrbp: Who = {
      mode: 'hrbp',
      personId: waiting(await sc.request(id))?.approverId as string,
      unit: 'Go-to-Market',
    }
    const changes = [
      { field: 'level' as const, old: null, new: 'P3' },
      { field: 'startDate' as const, old: null, new: '2027-03-01' },
    ]

    // A change reason with an amount is refused at entry; none is required to be blank.
    expect(
      (await sc.run(hrbp, 'approveWithChanges', { requestId: id, changes, reason: 'Saves $40,000' })).outcome,
    ).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    // Not the HRBP's step for anyone else (the leader step is later).
    const leader = (await sc.request(id))?.steps.find((x) => x.role === 'leader')?.approverId as string
    expect(
      (
        await sc.run({ mode: 'leader', personId: leader }, 'approveWithChanges', {
          requestId: id,
          changes,
          reason: 'x',
        })
      ).outcome.ok,
    ).toBe(false)

    const ok = await sc.run(hrbp, 'approveWithChanges', {
      requestId: id,
      changes,
      reason: 'Start after the Q4 hiring plan; P3 fits the team',
    })
    expect(ok.outcome).toEqual({
      ok: true,
      notice: `Request ${id} approved with changes. The requester sees each change with your reason.`,
    })
    await signed(sc, ok.entries, hrbp)
    expect(ok.entries.map((e) => [e.field, e.old, e.new, e.comment])).toEqual([
      ['level', 'P4', 'P3', 'Start after the Q4 hiring plan; P3 fits the team'],
      ['startDate', '2027-01-04', '2027-03-01', 'Start after the Q4 hiring plan; P3 fits the team'],
      ['step 1', null, 'Approved with changes', null],
      ['state', 'Submitted', 'In review', null],
    ])
    const req = (await sc.request(id)) as HcRequest
    expect(req.level).toBe('P3')
    expect(req.startDate).toBe('2027-03-01')
    expect(req.changes).toMatchObject({
      by: hrbp.personId,
      reason: 'Start after the Q4 hiring plan; P3 fits the team',
      changes: [
        { field: 'level', old: 'P4', new: 'P3' },
        { field: 'startDate', old: '2027-01-04', new: '2027-03-01' },
      ],
    })
    // The manager reads each change with its reason: the request's change set, and the audit entries
    // as Manager mode sees them (8.4 rule 7: the reason has no amount, so it reaches them).
    const mctx = await sc.ctx(mgr)
    expect(prepOf(mctx).row(req)?.view).toBe('full')
    const viewer = viewerOf(mctx)
    const seen = ok.entries.slice(0, 2).map((e) => auditView(e, viewer, (x) => (x.id === id ? req : null)))
    expect(seen.map((e) => [e?.field, e?.old, e?.new, e?.comment])).toEqual([
      ['level', 'P4', 'P3', 'Start after the Q4 hiring plan; P3 fits the team'],
      ['startDate', '2027-01-04', '2027-03-01', 'Start after the Q4 hiring plan; P3 fits the team'],
    ])
  }, 120_000)
})

describe('a freeze exception (10.4)', () => {
  it('is refused at submit without one, takes a business reason without an amount, and adds the Finance step', async () => {
    const sc = scenario()
    const s = sc.sample
    const freeze = s.datasets.freezes[0]
    expect(freeze).toMatchObject({ businessUnit: 'Corporate', allowBackfill: false })
    // The Corporate HRBP raises a Backfill on an Open Corporate seat (HRBP mode, request.draft shown).
    const hr: Who = { mode: 'hrbp', personId: 'E10317', unit: 'Corporate' }
    const seat = s.datasets.positions.find(
      (p) => p.businessUnit === 'Corporate' && p.status === 'Open' && p.managerPositionId,
    )?.positionId as string
    expect(seat).toBeTruthy()
    const d = await sc.run(hr, 'createRequest', {
      type: 'Backfill',
      positionId: seat,
      startDate: '2027-01-04',
      reasonCode: 'Attrition backfill',
    })
    expect(d.outcome.ok).toBe(true)
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    const blocked = await sc.run(hr, 'submitRequest', { requestId: id })
    expect(blocked.outcome).toEqual({
      ok: false,
      refused:
        'Hiring is frozen for Corporate from 1 Aug 2026. You can still submit an exception with a business reason.',
    })
    // A business reason with an amount is refused at entry; a blank one too.
    expect(
      (
        await sc.run(hr, 'setFreezeException', {
          requestId: id,
          freezeId: freeze.freezeId,
          reason: 'Need above €140,000',
        })
      ).outcome,
    ).toEqual({ ok: false, refused: REMOVE_AMOUNT_TEXT })
    expect(
      (await sc.run(hr, 'setFreezeException', { requestId: id, freezeId: freeze.freezeId, reason: ' ' }))
        .outcome.ok,
    ).toBe(false)
    const ex = await sc.run(hr, 'setFreezeException', {
      requestId: id,
      freezeId: freeze.freezeId,
      reason: 'The audit close needs this seat filled before year end',
    })
    expect(ex.outcome).toEqual({
      ok: true,
      notice: `Freeze exception added to ${id}. It adds a Finance step.`,
    })
    await signed(sc, ex.entries, hr)
    const sub = await sc.run(hr, 'submitRequest', { requestId: id })
    expect(sub.outcome.ok).toBe(true)
    const req = (await sc.request(id)) as HcRequest
    const fin = req.steps.find((x) => x.role === 'finance')
    expect(fin?.reasons).toContain('freeze-exception')
    expect(fin?.approverId).toBe(personaOf(s, 'finance-fpa').employeeId)
    expect(req.steps.at(-1)?.role).toBe('finance')
  }, 120_000)
})

describe('the chain’s person rules (10.2)', () => {
  it('no self-approval: the HRBP raising a request in their own unit never approves its HRBP step', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }
    const a = personaOf(sc.sample, 'manager-a')
    const d = await sc.run(hr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
    })
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    expect((await sc.run(hr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const req = (await sc.request(id)) as HcRequest
    expect(req.steps.some((x) => x.approverId === hr.personId)).toBe(false)
    expect(req.steps.length).toBeGreaterThan(0)
  }, 120_000)

  it('one person on two steps keeps the higher step only, with both reasons', async () => {
    // Manager A's manager is also the nearest leader: one step, the leader's, "always" and "out-of-plan".
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const d = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
    })
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    await sc.run(mgr, 'submitRequest', { requestId: id })
    const req = (await sc.request(id)) as HcRequest
    const ids = req.steps.map((x) => x.approverId)
    expect(new Set(ids).size).toBe(ids.length)
    const leader = req.steps.find((x) => x.role === 'leader')
    expect(leader?.reasons).toEqual(expect.arrayContaining(['always', 'out-of-plan']))
    expect(req.steps.some((x) => x.role === 'manager')).toBe(false)
  }, 120_000)

  it('submit on behalf records the requester and the submitter, and routes as the manager’s', async () => {
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const hr: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }
    const d = await sc.run(hr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
    })
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    const out = await sc.run(hr, 'submitOnBehalf', { requestId: id, requesterId: a.employeeId })
    expect(out.outcome).toEqual({ ok: true, notice: `Request ${id} submitted for ${a.name}.` })
    await signed(sc, out.entries, hr)
    expect(out.entries.map((e) => e.field)).toEqual(['requesterId', 'submittedById', 'steps', 'state'])
    const req = (await sc.request(id)) as HcRequest
    expect(req).toMatchObject({ requesterId: a.employeeId, submittedById: hr.personId, state: 'Submitted' })
    // The same chain as Manager A's own submit (the HRBP step stays the HRBP's: A raised it).
    expect(req.steps.map((x) => x.role)).toEqual(['hrbp', 'leader', 'finance'])
    // Manager mode has no submit on behalf.
    const again = await sc.run({ mode: 'manager', personId: a.employeeId }, 'submitOnBehalf', {
      requestId: id,
      requesterId: a.employeeId,
    })
    expect(again.outcome).toEqual({
      ok: false,
      refused: decide('manager', 'action:request.submit-on-behalf').how,
    })
  }, 120_000)
})

describe('accepted-offer refusals (10.1, C23)', () => {
  it('refuses a Start date, a Level change, a Location change and a seat edit on a seat with an accepted offer; an Elimination goes through', async () => {
    const sc = base
    const s = sc.sample
    const admin = await sc.ctx({ mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId })
    const offerSeat = s.datasets.reqs.find(
      (r) =>
        r.stage === 'Offer accepted' &&
        r.status !== 'Filled' &&
        r.positionId &&
        seatStateOf(admin, r.positionId)?.acceptedOffer,
    )?.positionId as string
    expect(offerSeat).toBeTruthy()
    const st = seatStateOf(admin, offerSeat)
    expect(st?.status).toBe('Open')
    const who: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const refusals = [
      await sc.run(who, 'proposeStart', {
        positionId: offerSeat,
        startDate: '2027-02-01',
        reasonCode: 'Other',
      }),
      await sc.run(who, 'createRequest', {
        type: 'Level change',
        positionId: offerSeat,
        level: 'P5',
        startDate: null,
        reasonCode: 'Other',
      }),
      await sc.run(who, 'createRequest', {
        type: 'Location change',
        positionId: offerSeat,
        location: 'Munich',
        startDate: null,
        reasonCode: 'Other',
      }),
      await sc.run(who, 'editSeat', {
        positionId: offerSeat,
        changes: { startDate: '2027-02-01' },
        reason: 'Later start',
      }),
    ]
    for (const r of refusals) expect(r.outcome).toEqual({ ok: false, refused: ACCEPTED_OFFER_TEXT })
    for (const r of refusals) expect(r.entries).toEqual([])
    const el = await sc.run(who, 'requestElimination', {
      positionId: offerSeat,
      lastDay: null,
      reasonCode: 'Restructure',
    })
    expect(el.outcome.ok).toBe(true)
  }, 120_000)
})

describe('idle expiry (10.1, R6)', () => {
  it('a Draft idle for the idle days reads Expired and is not submitted or edited', async () => {
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const d = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-06-01',
      reasonCode: 'Growth',
    })
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    expect((await sc.request(id))?.updatedAt.slice(0, 10)).toBe('2026-09-30')
    // 60 days on (against the as-of date) it has expired: it is not submitted or edited, nothing
    // written. (Its requester may still withdraw it, D-EXPIRY: core-flow.scenario.test.ts.)
    const at60: Who = { ...mgr, asOf: '2026-11-29' }
    for (const name of ['submitRequest'] as const) {
      const out = await sc.run(at60, name, { requestId: id })
      expect(out.outcome, name).toEqual({ ok: false, refused: expiredText(60) })
      expect(out.entries).toEqual([])
    }
    expect((await sc.run(at60, 'editRequest', { requestId: id, patch: { fte: 0.5 } })).outcome).toEqual({
      ok: false,
      refused: expiredText(60),
    })
    expect((await sc.request(id))?.state).toBe('Draft')
    // 59 days on it still submits.
    const at59: Who = { ...mgr, asOf: '2026-11-28' }
    expect((await sc.run(at59, 'submitRequest', { requestId: id })).outcome).toEqual({
      ok: true,
      notice: submittedNotice(id),
    })
  }, 120_000)
})

describe('comments (8.4 rule 5)', () => {
  it('a comment with an amount is Approvers only, and the notice says so', async () => {
    const sc = scenario()
    const a = personaOf(sc.sample, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const d = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: a.positionId,
      level: 'P3',
      location: 'San Jose',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: REASON_CODES[0],
    })
    const id = idOf(d.outcome.ok ? d.outcome.notice : '')
    const out = await sc.run(mgr, 'commentOnRequest', {
      requestId: id,
      text: 'The budget holds €140,000',
      audience: 'everyone',
    })
    expect(out.outcome).toEqual({ ok: true, notice: `Comment added. ${AMOUNT_COMMENT_NOTE}` })
    expect((await sc.request(id))?.comments.at(-1)?.audience).toBe('approvers')
    await signed(sc, out.entries, mgr)
    const plain = await sc.run(mgr, 'commentOnRequest', {
      requestId: id,
      text: 'Timing works for the team',
      audience: 'everyone',
    })
    expect(plain.outcome).toEqual({ ok: true, notice: 'Comment added.' })
    expect((await sc.request(id))?.comments.at(-1)?.audience).toBe('everyone')
  }, 120_000)
})
