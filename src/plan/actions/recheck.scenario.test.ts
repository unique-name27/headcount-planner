/**
 * The M3 recheck's flow findings, through the write path:
 *  - R47 and merges: business times are the as-of date with the wall clock's time of day, so on one
 *    as-of date a change made on a later wall-clock day can carry an earlier `updatedAt`. Import
 *    requests compares the wall-clock revision (`revisedAt`), so Finance's next-morning approval and a
 *    manager's next-day withdrawal come back (R47-MERGE-ORDER).
 *  - One Import requests of two diverged copies is a conflict, in either order, as one file at a time
 *    is (MERGE-BATCH-DIVERGED).
 *  - Remove override survives HR admin's Merge of another workspace's Full file and the workspace's
 *    own Full file (MERGE-DROPS-REMOVED-OVERRIDES).
 *  - Freezes made in two browsers have two IDs, so a Merge keeps both (FREEZE-ID-COLLISION).
 *  - Replace refuses a Full file whose log ends before its own head (REPLACE-LAUNDERS-LOST-TAIL) or
 *    whose locked lines no longer match their lock hash (FORGED-LOCK-ACCEPTED).
 *  - After a Replace from the workspace's own older Full file, the next request ID is not one it
 *    sent out since (RESTORE-REUSES-REQUEST-IDS).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { planInForce } from '@/app/planState'
import { deciderOf, type Scenario, said, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { seatStateOf } from '@/drill/seats'
import { verifyChain } from '@/plan/audit/chain'
import { assumptionLookup } from '@/plan/engine/assumptions'
import { workingOf } from '@/plan/engine/versions'
import type { AssumptionRow, HcRequest, WorkspaceFile } from '@/plan/types'
import { workspaceChecksum } from '@/plan/workspace/file'
import { lockBrokenText } from '@/plan/workspace/validate'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf, sampleCtx } from '@/testkit/sample'
import { fullFile, importPreview, readFile } from '@/views/data/engine/workspace'
import { requestIdInText } from './requestIds'
import type { RequestFile } from './workspace'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 300_000)

const newRole = (managerPositionId: string, over: Record<string, unknown> = {}) => ({
  type: 'New role' as const,
  managerPositionId,
  level: 'P3' as const,
  location: 'San Jose',
  fte: 1,
  startDate: '2027-01-04',
  reasonCode: 'Growth' as const,
  ...over,
})
const fileOf = (name: string, requests: readonly HcRequest[]): RequestFile => ({
  name,
  kind: 'requests',
  requests,
  skipped: 0,
})
const only = (reqs: readonly HcRequest[], id: string) => reqs.filter((r) => r.requestId === id)
const waiting = (r: HcRequest | null) =>
  r?.steps.find((x) => x.enteredAt != null && x.decision == null) ?? null
const bytes = (t: string) => new TextEncoder().encode(t).length

/** Approves until the step for `role` waits. */
async function upTo(sc: Scenario, id: string, role: string) {
  for (let g = 0; g < 10; g++) {
    const r = await sc.request(id)
    const w = waiting(r)
    if (!w || w.role === role) return
    expect((await sc.run(deciderOf(s, r as HcRequest), 'approveRequest', { requestId: id })).outcome.ok).toBe(
      true,
    )
  }
}

/** HR admin with Show pay amounts on, over the scenario's store (what a Full file is written from). */
async function payCtx(sc: Scenario) {
  const stored = await sc.harness.store.load()
  return sampleCtx('hr-admin', {
    sample: { ...s, plan: planInForce(stored, s.plan) },
    audit: await sc.log(),
    showPay: true,
  })
}

describe('merges compare wall-clock revisions, not business times (R47)', () => {
  it("brings back Finance's approval made the next morning in another browser", async () => {
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    // The HRBP's browser, 24 Oct at 15:00 (the as-of date is the sample's, 30 Sep).
    const w = scenario({ idTag: 'WWWW', start: '2026-10-24T15:00:00.000Z' })
    const id = requestIdInText(
      said((await w.run(mgr, 'createRequest', newRole(a.positionId))).outcome),
    ) as string
    expect((await w.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    await upTo(w, id, 'finance')
    const inW = (await w.request(id)) as HcRequest
    expect(inW.revisedAt?.startsWith('2026-10-24')).toBe(true)
    const fin: Who = { mode: 'finance', personId: waiting(inW)?.approverId as string }
    // Finance's browser, 25 Oct at 09:00: an earlier time of day on the same as-of date.
    const f = scenario({ idTag: 'FFFF', start: '2026-10-25T09:00:00.000Z' })
    expect(
      (await f.run(fin, 'importRequests', { files: [fileOf('from-hrbp', (await w.plan()).requests)] }))
        .outcome.ok,
    ).toBe(true)
    expect(said((await f.run(fin, 'approveRequest', { requestId: id })).outcome)).toBe(
      `Request ${id} approved.`,
    )
    const inF = (await f.request(id)) as HcRequest
    expect(inF.updatedAt < inW.updatedAt).toBe(true)
    // Back in the HRBP's browser: Finance's approval is the later copy, and its seat is planned here.
    const hrbp: Who = {
      mode: 'hrbp',
      personId: inW.steps.find((x) => x.role === 'hrbp')?.approverId as string,
      unit: inW.businessUnit,
    }
    const back = await w.run(hrbp, 'importRequests', {
      files: [fileOf('from-finance', (await f.plan()).requests)],
    })
    expect(said(back.outcome)).toBe('Merged 1 request from 1 file, no conflicts')
    expect((await w.request(id))?.state).toBe('Approved')
    const seat = inF.outcome?.createdPositionIds?.[0] as string
    expect(seatStateOf(await w.ctx(hrbp), seat)?.status).toBe('Planned')
    expect(verifyChain(await w.log()).ok).toBe(true)
  }, 300_000)

  it("brings a manager's next-day withdrawal to an HRBP who imported the first file", async () => {
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const mon = scenario({ idTag: 'MMMM', start: '2026-10-26T15:00:00.000Z' })
    const id = requestIdInText(
      said((await mon.run(mgr, 'createRequest', newRole(a.positionId))).outcome),
    ) as string
    expect((await mon.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const f1 = only((await mon.plan()).requests, id)
    const hr = scenario({ idTag: 'HHHH', start: '2026-10-26T16:00:00.000Z' })
    expect(said((await hr.run(admin, 'importRequests', { files: [fileOf('monday', f1)] })).outcome)).toBe(
      'Merged 1 request from 1 file, no conflicts',
    )
    // Tuesday 09:00 in the manager's browser (the same store's state read on another day).
    const tue = scenario({ idTag: 'MMMM', start: '2026-10-27T09:00:00.000Z' })
    expect((await tue.run(admin, 'importRequests', { files: [fileOf('monday', f1)] })).outcome.ok).toBe(true)
    expect((await tue.run(mgr, 'withdrawRequest', { requestId: id })).outcome.ok).toBe(true)
    const f2 = only((await tue.plan()).requests, id)
    expect(f2[0].updatedAt < f1[0].updatedAt).toBe(true)
    expect(said((await hr.run(admin, 'importRequests', { files: [fileOf('tuesday', f2)] })).outcome)).toBe(
      'Merged 1 request from 1 file, no conflicts',
    )
    expect((await hr.request(id))?.state).toBe('Withdrawn')
  }, 300_000)
})

describe('two diverged copies in one Import requests (M3 recheck)', () => {
  it('are a conflict in either file order, as one file at a time is', async () => {
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const w = scenario({ idTag: 'WWWW', start: '2026-10-24T09:00:00.000Z' })
    const id = requestIdInText(
      said((await w.run(mgr, 'createRequest', newRole(a.positionId))).outcome),
    ) as string
    await w.run(mgr, 'submitRequest', { requestId: id })
    await upTo(w, id, 'finance')
    const exported = only((await w.plan()).requests, id)
    const req = (await w.request(id)) as HcRequest
    const hrbp: Who = {
      mode: 'hrbp',
      personId: req.steps.find((x) => x.role === 'hrbp')?.approverId as string,
      unit: req.businessUnit,
    }
    const fin: Who = { mode: 'finance', personId: waiting(req)?.approverId as string }
    // The HRBP comments after exporting; Finance approves the exported copy in its own browser.
    expect(
      (
        await w.run(hrbp, 'commentOnRequest', {
          requestId: id,
          text: 'Please plan the start for January.',
          audience: 'everyone',
        })
      ).outcome.ok,
    ).toBe(true)
    const hrbpCopy = only((await w.plan()).requests, id)
    const f = scenario({ idTag: 'FFFF', start: '2026-10-24T13:00:00.000Z' })
    await f.run(fin, 'importRequests', { files: [fileOf('to-finance', exported)] })
    expect((await f.run(fin, 'approveRequest', { requestId: id })).outcome.ok).toBe(true)
    const finCopy = only((await f.plan()).requests, id)
    for (const [tag, files] of [
      ['ZZZZ', [fileOf('hrbp', hrbpCopy), fileOf('finance', finCopy)]],
      ['YYYY', [fileOf('finance', finCopy), fileOf('hrbp', hrbpCopy)]],
    ] as const) {
      const together = scenario({ idTag: tag, start: '2026-10-24T15:00:00.000Z' })
      expect(said((await together.run(admin, 'importRequests', { files })).outcome), tag).toBe(
        'Merged no requests from 2 files, 1 conflict',
      )
    }
    const oneByOne = scenario({ idTag: 'XXXX', start: '2026-10-24T15:00:00.000Z' })
    await oneByOne.run(admin, 'importRequests', { files: [fileOf('hrbp', hrbpCopy)] })
    expect(
      said((await oneByOne.run(admin, 'importRequests', { files: [fileOf('finance', finCopy)] })).outcome),
    ).toBe('Merged no requests from 1 file, 1 conflict')
  }, 300_000)
})

describe("Remove override and HR admin's Merge (M3 recheck)", () => {
  it('stays removed through the workspace’s own Full file and a Merge of another workspace’s', async () => {
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const override = s.datasets.assumptions.find(
      (x) => x.version === 'fy27-working' && x.table === 'attrition' && (x.org ?? '').trim(),
    ) as AssumptionRow
    const company = s.datasets.assumptions.find(
      (x) => x.version === 'fy27-working' && x.table === 'attrition' && !(x.org ?? '').trim(),
    ) as AssumptionRow
    const org = override.org as string
    expect(override.value).not.toBe(company.value)
    const w = scenario({ idTag: 'WWWW' })
    const valueIn = async (sc: Scenario) => {
      const ctx = await sc.ctx(admin)
      const wk = workingOf(ctx.versions, 'FY27')
      return assumptionLookup(ctx.all.assumptions, wk as never).get('attrition', [], {
        businessUnit: org,
        department: null,
      })?.value
    }
    expect(
      (await w.run(admin, 'removeOverride', { versionId: 'fy27-working', table: 'attrition', org, key: '*' }))
        .outcome.ok,
    ).toBe(true)
    expect(await valueIn(w)).toBe(company.value)
    // The workspace's own Full file reads the removal back.
    const own = fullFile(await payCtx(w), '2026-09-30T15:00:00.000Z')
    if (!own.ok) throw new Error(own.refused)
    const read = readFile(await payCtx(w), own.out.text, bytes(own.out.text))
    if (!read.ok || read.file.body.plan.kind !== 'full') throw new Error('not read')
    expect(read.file.body.plan.state.overlay.removedAssumptions?.map((r) => r.org)).toEqual([org])
    // Another workspace's Full file merged in: the value stays the parent's.
    const other = scenario({ idTag: 'QQQQ' })
    const of = fullFile(await payCtx(other), '2026-09-30T15:00:00.000Z')
    if (!of.ok) throw new Error(of.refused)
    const oread = readFile(await payCtx(w), of.out.text, bytes(of.out.text))
    if (!oread.ok) throw new Error(oread.reason)
    expect((await w.run(admin, 'mergeWorkspace', { file: oread.file })).outcome.ok).toBe(true)
    expect((await w.harness.store.load()).overlay.removedAssumptions?.map((r) => r.org)).toEqual([org])
    expect(await valueIn(w)).toBe(company.value)
  }, 300_000)
})

describe('freezes made in two browsers (M3 recheck)', () => {
  it('take each workspace’s tag, so a Merge keeps both', async () => {
    const fin: Who = { mode: 'finance', personId: personaOf(s, 'finance-fpa').employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const one = scenario({ idTag: 'AAAA' })
    const two = scenario({ idTag: 'BBBB' })
    const base = {
      department: null,
      costCenter: null,
      leaderPositionId: null,
      startDate: '2026-10-01',
      endDate: null,
      allowBackfill: true,
    }
    expect(
      said(
        (
          await one.run(fin, 'createFreeze', {
            ...base,
            businessUnit: 'Silicon Engineering',
            reason: 'Hold while the FY28 plan is set',
          })
        ).outcome,
      ),
    ).toBe('Hiring freeze FRZ-AAAA-001 saved.')
    expect(
      said(
        (
          await two.run(fin, 'createFreeze', {
            ...base,
            businessUnit: 'Go-to-Market',
            reason: 'Hold for the reorg',
          })
        ).outcome,
      ),
    ).toBe('Hiring freeze FRZ-BBBB-001 saved.')
    const f2 = fullFile(await payCtx(two), '2026-10-24T12:00:00.000Z')
    if (!f2.ok) throw new Error(f2.refused)
    const rd = readFile(await payCtx(one), f2.out.text, bytes(f2.out.text))
    if (!rd.ok) throw new Error(rd.reason)
    expect((await one.run(admin, 'mergeWorkspace', { file: rd.file })).outcome.ok).toBe(true)
    expect((await one.plan()).overlay.freezes.map((x) => `${x.freezeId} ${x.businessUnit}`)).toEqual([
      'FRZ-AAAA-001 Silicon Engineering',
      'FRZ-BBBB-001 Go-to-Market',
    ])
  }, 300_000)
})

describe('Replace from a Full file that does not check out (M3 recheck)', () => {
  type Raw = {
    checksum: string
    body: { plan: { state: { versions: Record<string, unknown>[] }; audit: unknown[] } }
  }
  const resign = (raw: Raw): string => {
    raw.checksum = workspaceChecksum(raw.body as never)
    return JSON.stringify(raw)
  }

  it('refuses a log that ends before the file’s own head, and locked lines that no longer match their hash', async () => {
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const w = scenario({ idTag: 'WWWW' })
    for (let i = 0; i < 3; i++) await w.run(mgr, 'createRequest', newRole(a.positionId))
    const ctx = await payCtx(w)
    const f = fullFile(ctx, '2026-09-30T15:00:00.000Z')
    if (!f.ok) throw new Error(f.refused)
    // The last entry dropped and the file signed again: the state's head is seq 3, the log ends at 2.
    const tail = JSON.parse(f.out.text) as Raw
    tail.body.plan.audit.pop()
    const t = resign(tail)
    const tailText = "This file's audit log breaks at entry 3. Nothing was imported."
    const pv = importPreview(ctx, t, bytes(t))
    expect(pv.ok && pv.replaceRefused).toBe(tailText)
    const rd = readFile(ctx, t, bytes(t))
    if (!rd.ok) throw new Error(rd.reason)
    const x = scenario({ idTag: 'XXXX' })
    expect((await x.run(admin, 'replaceWorkspace', { file: rd.file as WorkspaceFile })).outcome).toEqual({
      ok: false,
      refused: tailText,
    })
    // One locked amount raised by a dollar and the file signed again: read nowhere.
    const forged = JSON.parse(f.out.text) as Raw
    const at = forged.body.plan.state.versions.findIndex((v) => v.state === 'locked')
    const lines = forged.body.plan.state.versions[at].lines as { cents: Record<string, number[]> }
    lines.cents.usdBase[0] += 100
    const ft = resign(forged)
    const name = forged.body.plan.state.versions[at].name as string
    expect(readFile(ctx, ft, bytes(ft))).toEqual({ ok: false, reason: lockBrokenText(name) })
    expect(importPreview(ctx, ft, bytes(ft))).toEqual({ ok: false, reason: lockBrokenText(name) })
  }, 300_000)
})

describe('request IDs after a restore (M3 recheck)', () => {
  it('never mints again an ID the workspace sent out after the file it restored was saved', async () => {
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const w = scenario({ idTag: 'WWWW', start: '2026-10-24T09:00:00.000Z' })
    await w.run(mgr, 'createRequest', newRole(a.positionId, { jobTitle: 'Analyst' }))
    const backup = fullFile(await payCtx(w), '2026-10-24T10:00:00.000Z')
    if (!backup.ok) throw new Error(backup.refused)
    const sent = requestIdInText(
      said(
        (
          await w.run(
            mgr,
            'createRequest',
            newRole(a.positionId, { level: 'P4', jobTitle: 'Staff engineer' }),
          )
        ).outcome,
      ),
    ) as string
    await w.run(mgr, 'submitRequest', { requestId: sent })
    const z = scenario({ idTag: 'ZZZZ', start: '2026-10-24T11:00:00.000Z' })
    await z.run(admin, 'importRequests', { files: [fileOf('first', only((await w.plan()).requests, sent))] })
    // HR admin restores the backup (its datasets left out, so the harness keeps the sample's).
    const rd = readFile(await payCtx(w), backup.out.text, bytes(backup.out.text))
    if (!rd.ok) throw new Error(rd.reason)
    const { datasets: _d, ...body } = rd.file.body
    expect((await w.run(admin, 'replaceWorkspace', { file: { ...rd.file, body } })).outcome.ok).toBe(true)
    expect((await w.plan()).requests.some((r) => r.requestId === sent)).toBe(false)
    const next = requestIdInText(
      said(
        (await w.run(mgr, 'createRequest', newRole(a.positionId, { level: 'P2', jobTitle: 'Coordinator' })))
          .outcome,
      ),
    ) as string
    expect(next).not.toBe(sent)
    await w.run(mgr, 'submitRequest', { requestId: next })
    expect(
      said(
        (
          await z.run(admin, 'importRequests', {
            files: [fileOf('second', only((await w.plan()).requests, next))],
          })
        ).outcome,
      ),
    ).toBe('Merged 1 request from 1 file, no conflicts')
    // Both requests stand in the other workspace.
    const inZ = (await z.plan()).requests.filter((r) => r.requestId === sent || r.requestId === next)
    expect(inZ.map((r) => r.jobTitle).sort()).toEqual(['Coordinator', 'Staff engineer'])
  }, 300_000)
})
