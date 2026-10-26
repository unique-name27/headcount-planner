/**
 * The other write actions through the write path (docs/PLAN.md 8.3, 10.1, 10.4, 10.6, 5.5, 6.9, 6.10,
 * 15.1 R5, R18; M3): an HRBP seat edit in Working (with its reason, never with an amount), Start
 * recruiting (one HRBP step, its approval the HRBP's Working edit), freezes (created, edited, then
 * blocking a New role at submit), targets (Finance sets; a leader splits inside its envelope and is
 * refused past it), operational assumptions (an HRBP's own unit only), Mark reviewed, What if's "Turn
 * into requests" (a freeze lever skipped, one cancel lever making exactly one Elimination draft), and
 * Import requests on the sample's six manager files ("Merged 14 requests from 6 files, 2 conflicts").
 * Every step is signed by its person and the chain verifies.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { decide } from '@/access/policy'
import { actionEnvOf } from '@/app/write/context'
import { approveAll, chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { MERGE_SUMMARY, sampleRequestFiles } from '@/data/sample/raw/requestFiles'
import type { TargetRow } from '@/data/schema'
import { seatStateOf } from '@/drill/seats'
import { FREEZE_LEVER_NOTE } from '@/plan/engine/whatif'
import type { HcRequest, LockedVersionRef } from '@/plan/types'
import { requestsOf as fileRequests, readWorkspace } from '@/plan/workspace/validate'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf } from '@/testkit/sample'
import {
  ACCEPTED_OFFER_TEXT,
  NOT_A_SUB_ORG_TEXT,
  OPERATIONAL_ONLY_TEXT,
  OUTSIDE_UNIT_TEXT,
  PAST_ENVELOPE_TEXT,
  REASON_REQUIRED_TEXT,
  REMOVE_AMOUNT_TEXT,
  SEAT_NOT_EDITABLE_TEXT,
  SPLIT_SAVED_NOTICE,
  seatChangedNotice,
  TARGET_SAVED_NOTICE,
  UNIT_HEAD_TARGET_TEXT,
} from './copy'
import { requestIdInText } from './requestIds'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const idOf = (text: string): string => requestIdInText(text) ?? ''
const SE = 'Silicon Engineering'

describe('an HRBP seat edit in Working (position.edit)', () => {
  it('moves a Planned seat’s start with a reason, and refuses an amount, a Filled seat and another unit', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const ctx = await sc.ctx(hr)
    const planned = [...ctx.positionIndex.byId.values()].find(
      (r) => r.businessUnit === SE && seatStateOf(ctx, r.positionId)?.status === 'Planned' && r.startDate,
    )
    const filled = [...ctx.positionIndex.byId.values()].find(
      (r) => r.businessUnit === SE && seatStateOf(ctx, r.positionId)?.status === 'Filled',
    )
    const other = [...ctx.positionIndex.byId.values()].find(
      (r) => r.businessUnit === 'Go-to-Market' && seatStateOf(ctx, r.positionId)?.status === 'Planned',
    )
    expect(planned && filled && other).toBeTruthy()
    const id = planned?.positionId as string
    const edit = { positionId: id, changes: { startDate: '2027-03-01' } }
    expect(
      (await sc.run(hr, 'editSeat', { ...edit, reason: 'Start moved to save €40,000' })).outcome,
    ).toEqual({
      ok: false,
      refused: REMOVE_AMOUNT_TEXT,
    })
    expect((await sc.run(hr, 'editSeat', { ...edit, reason: '' })).outcome).toEqual({
      ok: false,
      refused: REASON_REQUIRED_TEXT,
    })
    expect(
      (
        await sc.run(hr, 'editSeat', {
          positionId: filled?.positionId as string,
          changes: { level: 'P5' },
          reason: 'x',
        })
      ).outcome,
    ).toEqual({ ok: false, refused: SEAT_NOT_EDITABLE_TEXT })
    expect(
      (
        await sc.run(hr, 'editSeat', {
          positionId: other?.positionId as string,
          changes: { startDate: '2027-03-01' },
          reason: 'x',
        })
      ).outcome,
    ).toEqual({ ok: false, refused: OUTSIDE_UNIT_TEXT })

    const out = await sc.run(hr, 'editSeat', { ...edit, reason: 'Start after the tape-out' })
    expect(out.outcome).toEqual({ ok: true, notice: seatChangedNotice(id) })
    expect(
      out.entries.map((e) => [e.object, e.id, e.field, e.old, e.new, e.effectiveDate, e.comment, e.by]),
    ).toEqual([
      [
        'position',
        id,
        'startDate',
        planned?.startDate,
        '2027-03-01',
        s.asOf,
        'Start after the tape-out',
        hr.personId,
      ],
    ])
    const row = (await sc.plan()).overlay.positions.find(
      (r) => r.positionId === id && r.effectiveDate === s.asOf,
    )
    expect(row).toMatchObject({ status: 'Planned', startDate: '2027-03-01' })
    expect(seatStateOf(await sc.ctx(hr), id)?.plannedStart).toBe('2027-03-01')
    // Manager mode and Finance never edit a seat.
    expect(
      (
        await sc.run({ mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }, 'editSeat', {
          ...edit,
          reason: 'x',
        })
      ).outcome,
    ).toEqual({ ok: false, refused: decide('finance', 'action:position.edit').how })
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})

describe('Start recruiting (R5)', () => {
  it('goes to the unit HRBP alone; its approval writes the seat Open from the approval date', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const ctx = await sc.ctx(hr)
    const planned = [...ctx.positionIndex.byId.values()].find(
      (r) => r.businessUnit === SE && seatStateOf(ctx, r.positionId)?.status === 'Planned' && r.startDate,
    )
    const id = planned?.positionId as string
    // The HRBP drafts it for the seat's manager's team as HR admin would; a manager may draft it too.
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const d = await sc.run(admin, 'requestRecruiting', { positionId: id, reasonCode: 'Growth' })
    expect(d.outcome.ok).toBe(true)
    const rid = idOf(d.outcome.ok ? d.outcome.notice : '')
    expect((await sc.run(admin, 'submitRequest', { requestId: rid })).outcome.ok).toBe(true)
    const req = (await sc.request(rid)) as HcRequest
    expect(req.steps.map((x) => [x.role, x.approverId])).toEqual([['hrbp', hr.personId]])
    const steps = await approveAll(sc, rid)
    expect(steps.map((x) => x.outcome.ok)).toEqual([true])
    for (const e of steps[0].entries) expect(e.by).toBe(hr.personId)
    const row = (await sc.plan()).overlay.positions.find(
      (r) => r.positionId === id && r.sourceRequestId === rid,
    )
    expect(row).toMatchObject({ status: 'Open', openedDate: s.asOf, effectiveDate: s.asOf })
    // Not on an Open seat with an accepted offer, nor on a seat that is not Planned.
    const open = [...ctx.positionIndex.byId.values()].find(
      (r) => seatStateOf(ctx, r.positionId)?.status === 'Open',
    )
    expect(
      (
        await sc.run(admin, 'requestRecruiting', {
          positionId: open?.positionId as string,
          reasonCode: 'Growth',
        })
      ).outcome.ok,
    ).toBe(false)
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})

describe('freezes (10.4)', () => {
  it('Finance creates and edits a freeze; it then blocks a New role in that org at submit', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const input = {
      businessUnit: SE,
      department: null,
      costCenter: null,
      leaderPositionId: null,
      startDate: '2026-10-01',
      endDate: null,
      allowBackfill: true,
      reason: 'Hold while the FY28 plan is set',
    }
    expect((await sc.run(hr, 'createFreeze', input)).outcome).toEqual({
      ok: false,
      refused: decide('hrbp', 'action:freeze.create').how,
    })
    expect((await sc.run(fin, 'createFreeze', { ...input, reason: 'Saves $2M' })).outcome).toEqual({
      ok: false,
      refused: REMOVE_AMOUNT_TEXT,
    })
    expect((await sc.run(fin, 'createFreeze', { ...input, endDate: '2026-09-01' })).outcome.ok).toBe(false)
    // A new freeze numbers under the workspace's tag (M3 recheck): 'FRZ-TEST-001' in the harness.
    const made = await sc.run(fin, 'createFreeze', input)
    expect(made.outcome).toEqual({ ok: true, notice: 'Hiring freeze FRZ-TEST-001 saved.' })
    expect(
      made.entries.every((e) => e.object === 'freeze' && e.id === 'FRZ-TEST-001' && e.by === fin.personId),
    ).toBe(true)
    const edit = await sc.run(fin, 'editFreeze', {
      freezeId: 'FRZ-TEST-001',
      patch: { endDate: '2027-06-30' },
    })
    expect(edit.entries.map((e) => [e.field, e.old, e.new])).toEqual([['endDate', null, '2027-06-30']])
    // A New role in Silicon Engineering is now blocked at submit, with the freeze's notice.
    const mgr: Who = { mode: 'leader', personId: personaOf(s, 'leader-dv-director').employeeId }
    const d = await sc.run(mgr, 'createRequest', {
      type: 'New role',
      managerPositionId: personaOf(s, 'leader-dv-director').positionId,
      level: 'P3',
      location: 'Austin',
      fte: 1,
      startDate: '2027-01-04',
      reasonCode: 'Growth',
    })
    const rid = idOf(d.outcome.ok ? d.outcome.notice : d.outcome.refused)
    const sub = await sc.run(mgr, 'submitRequest', { requestId: rid })
    expect(sub.outcome).toEqual({
      ok: false,
      refused: `Hiring is frozen for ${SE} from 1 Oct 2026 to 30 Jun 2027. You can still submit an exception with a business reason.`,
    })
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})

describe('targets (6.9, 8.3)', () => {
  it('Finance sets a target; a leader splits it inside the envelope and is refused past it', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const svp = personaOf(s, 'leader-svp-se')
    const lead: Who = { mode: 'leader', personId: svp.employeeId }
    const unit = s.datasets.targets.find(
      (t) => t.fiscalYear === 'FY27' && t.businessUnit === SE && !t.leaderPositionId,
    ) as TargetRow
    expect((await sc.run(lead, 'setTarget', { row: { ...unit, targetHeads: 600 } })).outcome).toEqual({
      ok: false,
      refused: decide('leader', 'action:target.set').how,
    })
    const set = await sc.run(fin, 'setTarget', { row: { ...unit, targetHeads: 605 } })
    expect(set.outcome).toEqual({ ok: true, notice: TARGET_SAVED_NOTICE })
    expect(set.entries.map((e) => [e.object, e.field, e.old, e.new])).toEqual([
      ['target', 'targetHeads', 601, 605],
    ])

    const subs = actionEnvOf(await sc.ctx(lead)).subOrgsOf(svp.positionId)
    expect(subs.length).toBeGreaterThan(1)
    const inside = subs
      .slice(0, 2)
      .map((id) => ({ leaderPositionId: id, targetHeads: 100, targetCost: null }))
    const split = await sc.run(lead, 'splitTarget', {
      fiscalYear: 'FY27',
      parentLeaderPositionId: svp.positionId,
      children: inside,
    })
    expect(split.outcome).toEqual({ ok: true, notice: SPLIT_SAVED_NOTICE })
    expect(split.entries.filter((e) => e.object === 'target')).toHaveLength(2)
    const past = subs.slice(0, 2).map((id) => ({ leaderPositionId: id, targetHeads: 400, targetCost: null }))
    expect(
      (
        await sc.run(lead, 'splitTarget', {
          fiscalYear: 'FY27',
          parentLeaderPositionId: svp.positionId,
          children: past,
        })
      ).outcome,
    ).toEqual({ ok: false, refused: PAST_ENVELOPE_TEXT })
    // Finance may go past the envelope (target.exception).
    expect(
      (
        await sc.run(fin, 'splitTarget', {
          fiscalYear: 'FY27',
          parentLeaderPositionId: svp.positionId,
          children: past,
        })
      ).outcome.ok,
    ).toBe(true)
    // A move between two sub-orgs of one parent keeps the parent's total.
    const move = await sc.run(lead, 'moveTarget', {
      fiscalYear: 'FY27',
      fromLeaderPositionId: subs[0],
      toLeaderPositionId: subs[1],
      heads: 10,
      cost: null,
    })
    expect(move.outcome.ok).toBe(true)
    const rows = (await sc.plan()).overlay.targets.filter(
      (t) => t.leaderPositionId && subs.slice(0, 2).includes(t.leaderPositionId),
    )
    expect(rows.map((t) => t.targetHeads).sort((a, b) => a - b)).toEqual([390, 410])
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})

describe('operational assumptions (R18)', () => {
  it('an HRBP edits its own unit’s fill rate in Working; another unit and attrition are refused', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const row = { version: 'fy27-working', table: 'fillRate' as const, org: SE, key: '*', value: 0.9 }
    const ok = await sc.run(hr, 'editOperational', { versionId: 'fy27-working', rows: [row] })
    expect(ok.outcome).toEqual({ ok: true, notice: 'Assumptions saved in Working.' })
    expect(ok.entries[0]).toMatchObject({
      object: 'assumption',
      id: `fy27-working|fillRate|${SE}|*`,
      field: 'value',
      new: 0.9,
    })
    expect(
      (
        await sc.run(hr, 'editOperational', {
          versionId: 'fy27-working',
          rows: [{ ...row, org: 'Go-to-Market' }],
        })
      ).outcome,
    ).toEqual({ ok: false, refused: OUTSIDE_UNIT_TEXT })
    expect(
      (
        await sc.run(hr, 'editOperational', {
          versionId: 'fy27-working',
          rows: [{ ...row, table: 'attrition' }],
        })
      ).outcome,
    ).toEqual({ ok: false, refused: OPERATIONAL_ONLY_TEXT })
    expect(
      (await sc.run(hr, 'editOperational', { versionId: 'fy27-q1-reforecast', rows: [row] })).outcome.ok,
    ).toBe(false)
  }, 120_000)
})

describe('Mark reviewed (6.10)', () => {
  it('Finance marks exceptions reviewed once; an HRBP only in its unit', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const all = actionEnvOf(await sc.ctx(fin)).exceptions()
    expect(all.length).toBeGreaterThan(0)
    const first = all[0]
    const out = await sc.run(fin, 'markReviewed', { exceptionIds: [first.id] })
    expect(out.outcome).toEqual({ ok: true, notice: 'Marked reviewed.' })
    expect((await sc.plan()).reviewed.map((r) => [r.exceptionId, r.by])).toEqual([[first.id, fin.personId]])
    expect((await sc.run(fin, 'markReviewed', { exceptionIds: [first.id] })).outcome.ok).toBe(false)
    const hr: Who = { mode: 'hrbp', personId: 'E11076', unit: 'Go-to-Market' }
    const elsewhere = all.find((e) => e.positionId && !e.positionId.startsWith('P-20'))
    if (elsewhere) {
      const r = await sc.run(hr, 'markReviewed', { exceptionIds: [elsewhere.id] })
      if (!r.outcome.ok) expect(r.outcome.refused).toBe(OUTSIDE_UNIT_TEXT)
    }
  }, 120_000)
})

describe('What if: Turn into requests (10.6)', () => {
  it('skips the freeze lever and makes exactly one Elimination draft for one cancel lever', async () => {
    const sc = scenario()
    const hr: Who = { mode: 'hrbp', personId: personaOf(s, 'hrbp-se').employeeId, unit: SE }
    const ctx = await sc.ctx(hr)
    const planned = [...ctx.positionIndex.byId.values()].find(
      (r) => r.businessUnit === SE && seatStateOf(ctx, r.positionId)?.status === 'Planned' && r.startDate,
    )
    const out = await sc.run(hr, 'turnLeversIntoRequests', {
      levers: [
        { kind: 'freeze', orgPositionId: personaOf(s, 'leader-svp-se').positionId, from: '2026-11-01' },
        { kind: 'cancel', positionId: planned?.positionId as string },
      ],
    })
    expect(out.outcome).toEqual({
      ok: true,
      notice: `1 draft request made for review in Requests > Mine. ${FREEZE_LEVER_NOTE}`,
    })
    const drafts = (await sc.plan()).requests.filter((r) => r.state === 'Draft')
    expect(drafts.map((r) => [r.type, r.positionId, r.requesterId])).toEqual([
      ['Elimination', planned?.positionId, hr.personId],
    ])
    expect(out.entries.map((e) => [e.field, e.new])).toEqual([['state', 'Draft']])
    // Finance does not raise requests.
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    expect((await sc.run(fin, 'turnLeversIntoRequests', { levers: [] })).outcome).toEqual({
      ok: false,
      refused: decide('finance', 'action:whatif.turn-into-requests').how,
    })
  }, 120_000)

  it('refuses a level lever on a seat with an accepted offer', async () => {
    const sc = scenario()
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const ctx = await sc.ctx(admin)
    const offer = s.datasets.reqs.find(
      (r) => r.stage === 'Offer accepted' && r.positionId && seatStateOf(ctx, r.positionId)?.acceptedOffer,
    )?.positionId as string
    const out = await sc.run(admin, 'turnLeversIntoRequests', {
      levers: [{ kind: 'level', positionId: offer, level: 'P5' }],
    })
    expect(out.outcome.ok).toBe(false)
    expect(out.outcome.ok ? '' : out.outcome.refused).toMatch(
      new RegExp(`${ACCEPTED_OFFER_TEXT}|Levers act only`),
    )
  }, 120_000)
})

describe('Import requests (5.5, R17)', () => {
  it('merges the six manager files over the sample: "Merged 14 requests from 6 files, 2 conflicts"', async () => {
    const sc = scenario()
    const refs: LockedVersionRef[] = [s.locks.budget, s.locks.q1].map((v) => ({
      versionId: v.versionId,
      name: v.name,
      kind: v.kind,
      fiscalYear: v.fiscalYear,
      state: v.state,
      hash: v.hash,
    }))
    const made = sampleRequestFiles(
      {
        datasets: s.datasets,
        personas: s.personas,
        planted: s.planted,
        tradeRequestId: s.story.tradeRequestId,
      },
      refs,
    )
    const files = made.texts.map((text, i) => {
      const read = readWorkspace(text, text.length, refs)
      if (!read.ok) throw new Error(read.reason)
      const r = fileRequests(read.file)
      if (!r.ok) throw new Error(r.reason)
      return { name: `file ${i + 1}`, kind: read.file.kind, requests: r.requests, skipped: r.skipped }
    })
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    // Manager mode does not import requests.
    expect(
      (
        await sc.run({ mode: 'manager', personId: personaOf(s, 'manager-a').employeeId }, 'importRequests', {
          files,
        })
      ).outcome,
    ).toEqual({ ok: false, refused: decide('manager', 'action:request.import').how })
    const out = await sc.run(admin, 'importRequests', { files })
    expect(out.outcome).toEqual({ ok: true, notice: MERGE_SUMMARY })
    expect(out.entries.map((e) => [e.object, e.field, e.new])).toEqual([
      ['workspace', 'requests merged', { merged: 14, files: 6, conflicts: 2, skipped: 0 }],
    ])
    const plan = await sc.plan()
    for (const id of made.drafts.flat())
      expect(plan.requests.find((r) => r.requestId === id)?.state).toBe('Draft')
    expect(plan.requests.length).toBe(14)
    // Again: nothing more merges; the two conflicts stay until chosen. Choosing one settles it.
    const again = await sc.run(admin, 'importRequests', { files })
    expect(again.outcome).toEqual({ ok: true, notice: 'Merged no requests from 6 files, 2 conflicts' })
    const chosen = await sc.run(admin, 'importRequests', {
      files,
      choices: { [s.story.tradeRequestId]: 'current' },
    })
    expect(chosen.outcome).toEqual({ ok: true, notice: 'Merged no requests from 6 files, 1 conflict' })
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)
})

describe('sub-org targets, M3 review fixes (UI-2, UI-8)', () => {
  it('keeps a sub-org’s stored cost target when a split leaves its cost out, and removes it only on null', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const svp = personaOf(s, 'leader-svp-se')
    const lead: Who = { mode: 'leader', personId: svp.employeeId }
    const subs = actionEnvOf(await sc.ctx(lead))
      .subOrgsOf(svp.positionId)
      .slice(0, 3)
    expect(subs).toHaveLength(3)
    const costs = [5_123_456, 5_124_456, 5_125_456]
    const set = await sc.run(fin, 'splitTarget', {
      fiscalYear: 'FY27',
      parentLeaderPositionId: svp.positionId,
      children: subs.map((id, i) => ({ leaderPositionId: id, targetHeads: 50 + i, targetCost: costs[i] })),
    })
    expect(set.outcome.ok).toBe(true)
    // The leader changes only the first sub-org's heads; the costs are left out.
    const heads = await sc.run(lead, 'splitTarget', {
      fiscalYear: 'FY27',
      parentLeaderPositionId: svp.positionId,
      children: subs.map((id, i) => ({ leaderPositionId: id, targetHeads: i === 0 ? 49 : 50 + i })),
    })
    expect(heads.outcome.ok).toBe(true)
    expect(heads.entries.map((e) => [e.field, e.old, e.new])).toEqual([['targetHeads', 50, 49]])
    const stored = () =>
      sc
        .plan()
        .then((p) =>
          subs.map((id) => p.overlay.targets.find((t) => t.leaderPositionId === id)?.targetCost ?? null),
        )
    expect(await stored()).toEqual(costs)
    // An explicit null (an emptied box) removes that one.
    const cleared = await sc.run(fin, 'splitTarget', {
      fiscalYear: 'FY27',
      parentLeaderPositionId: svp.positionId,
      children: subs.map((id, i) => ({
        leaderPositionId: id,
        targetHeads: i === 0 ? 49 : 50 + i,
        ...(i === 1 ? { targetCost: null } : {}),
      })),
    })
    expect(cleared.entries.map((e) => [e.field, e.old, e.new])).toEqual([['targetCost', costs[1], null]])
    expect(await stored()).toEqual([costs[0], null, costs[2]])
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)

  it('never sets a leader-keyed target for a unit’s head seat: its target is the unit’s', async () => {
    const sc = scenario()
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const ceoSeat = 'P-1001'
    const ceoId = s.datasets.workers.find((w) => w.positionId === ceoSeat && !w.assignmentEnd)
      ?.employeeId as string
    const ceo: Who = { mode: 'leader', personId: ceoId }
    // The CEO seat's sub-orgs stay inside Executive Office (UI-8, M3 verify): the action reads the
    // split form's own `subOrgSeatsOf`, so another unit's head is never one of them.
    const heads = actionEnvOf(await sc.ctx(ceo)).subOrgsOf(ceoSeat)
    expect(heads).not.toContain('P-1002')
    expect(heads.length).toBeGreaterThan(0)
    for (const who of [ceo, fin]) {
      const out = await sc.run(who, 'splitTarget', {
        fiscalYear: 'FY27',
        parentLeaderPositionId: ceoSeat,
        children: [
          { leaderPositionId: 'P-1002', targetHeads: 3 },
          { leaderPositionId: heads[0] as string, targetHeads: 4 },
        ],
      })
      expect(out.outcome, who.mode).toEqual({ ok: false, refused: NOT_A_SUB_ORG_TEXT })
      const move = await sc.run(who, 'moveTarget', {
        fiscalYear: 'FY27',
        fromLeaderPositionId: 'P-1002',
        toLeaderPositionId: heads[0] as string,
        heads: 1,
        cost: null,
      })
      expect(move.outcome, who.mode).toEqual({ ok: false, refused: UNIT_HEAD_TARGET_TEXT })
    }
    expect((await sc.plan()).overlay.targets).toEqual([])
  }, 120_000)
})
