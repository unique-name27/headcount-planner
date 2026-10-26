/**
 * Workspace imports through the write path, M3 review fixes: an approval another browser made
 * arrives with its effect, applied once by the importer (D-MERGE, IN-2, SP-3); a conflict settled to
 * the file's copy counts as merged (IN-7); a title with an amount is refused at import (PV-6); a
 * Leader never merges a request about its own seat (PV-7); and Replace takes a Full file's audit
 * log when its chain verifies, refusing it with the first broken link otherwise, while the
 * workspace keeps its own request ID tag (C35, D-ID).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { actionContextOf, personRulesOf } from '@/app/write/context'
import { approveAll, chainOk, hrbpUnitOf, said, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { MERGE_SUMMARY, sampleRequestFiles } from '@/data/sample/raw/requestFiles'
import { seatStateOf } from '@/drill/seats'
import { verifyChain } from '@/plan/audit/chain'
import type { HcRequest, LockedVersionRef, WorkspaceFile } from '@/plan/types'
import { requestsOf as fileRequests, readWorkspace } from '@/plan/workspace/validate'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf } from '@/testkit/sample'
import { FILE_AMOUNT_TEXT, WORKSPACE_REPLACED_NOTICE } from './copy'
import { requestIdInText } from './requestIds'
import type { RequestFile } from './workspace'
import { replaceWorkspace } from './workspace'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const newRole = (managerPositionId: string) => ({
  type: 'New role' as const,
  managerPositionId,
  level: 'P3' as const,
  location: 'San Jose',
  fte: 1,
  startDate: '2027-01-04',
  reasonCode: 'Growth' as const,
})

const fileOf = (name: string, requests: readonly HcRequest[]): RequestFile => ({
  name,
  kind: 'requests',
  requests,
  skipped: 0,
})

describe('an approval a file brings (D-MERGE)', () => {
  it('applies its effect in the importing workspace, once, by the importer', async () => {
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const one = scenario({ idTag: 'AAAA' })
    const draft = await one.run(mgr, 'createRequest', newRole(a.positionId))
    const id = requestIdInText(said(draft.outcome)) as string
    expect((await one.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    const steps = await approveAll(one, id)
    expect(steps.every((x) => x.outcome.ok)).toBe(true)
    const approved = (await one.request(id)) as HcRequest
    expect(approved.state).toBe('Approved')
    const seat = approved.outcome?.createdPositionIds[0] as string
    expect(seat).toBeTruthy()

    // Another browser: the HRBP of the unit imports the approving workspace's requests.
    const hrbpId = approved.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const hrbp: Who = { mode: 'hrbp', personId: hrbpId, unit: hrbpUnitOf(s)(hrbpId) }
    const two = scenario({ idTag: 'BBBB' })
    const files = [fileOf('approvals.hcplan.json', (await one.plan()).requests)]
    const out = await two.run(hrbp, 'importRequests', { files })
    expect(said(out.outcome)).toBe('Merged 1 request from 1 file, no conflicts')
    const ctx = await two.ctx(hrbp)
    expect(seatStateOf(ctx, seat)?.status).toBe('Planned')
    const plan = await two.plan()
    expect(plan.overlay.positions.filter((r) => r.sourceRequestId === id).length).toBeGreaterThan(0)
    const entries = out.entries
    expect(entries[0]).toMatchObject({ object: 'workspace', field: 'requests merged', by: hrbpId })
    expect((entries[0].new as { applied?: string[] }).applied).toEqual([id])
    const effect = entries.filter((e) => e.object === 'position')
    expect(effect.length).toBeGreaterThan(0)
    for (const e of effect) {
      expect(e.by).toBe(hrbpId)
      expect(e.comment).toMatch(/^Approved in the file approvals\.hcplan\.json, by .+\.$/)
    }
    // The same file again applies nothing more.
    const again = await two.run(hrbp, 'importRequests', { files })
    expect(said(again.outcome)).toBe('Merged no requests from 1 file, no conflicts')
    expect(again.entries.filter((e) => e.object === 'position')).toEqual([])
    expect((await two.plan()).overlay.positions.filter((r) => r.sourceRequestId === id).length).toBe(
      plan.overlay.positions.filter((r) => r.sourceRequestId === id).length,
    )
    expect(chainOk(await two.log())).toBe(true)
  }, 180_000)
})

describe('Import requests counts and checks (IN-7, PV-6, PV-7)', () => {
  const sixFiles = () => {
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
    return made.texts.map((text, i) => {
      const read = readWorkspace(text, text.length, refs)
      if (!read.ok) throw new Error(read.reason)
      const r = fileRequests(read.file)
      if (!r.ok) throw new Error(r.reason)
      return { name: `file ${i + 1}`, kind: read.file.kind, requests: r.requests, skipped: r.skipped }
    })
  }

  it('counts a conflict settled to the file’s copy as merged, and lists each choice', async () => {
    const sc = scenario()
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const files = sixFiles()
    const first = await sc.run(admin, 'importRequests', { files })
    expect(said(first.outcome)).toBe(MERGE_SUMMARY)
    const conflicts = (first.entries[0].new as { conflicts: number }).conflicts
    expect(conflicts).toBe(2)
    const ids = [s.story.tradeRequestId]
    const other = (await sc.ctx(admin)).plan?.requests.length
    expect(other).toBeGreaterThan(0)
    const out = await sc.run(admin, 'importRequests', {
      files,
      choices: Object.fromEntries(
        [...new Set([...ids, 'R-1034', 'R-1040'])].map((id) => [id, 'incoming' as const]),
      ),
    })
    expect(said(out.outcome)).toBe('Merged 2 requests from 6 files, no conflicts')
    expect(out.entries[0].new).toMatchObject({ merged: 2, files: 6, conflicts: 0 })
    expect((out.entries[0].new as { chosen: unknown[] }).chosen).toHaveLength(2)
    expect(chainOk(await sc.log())).toBe(true)
  }, 180_000)

  it('refuses a request whose job title holds an amount, importing nothing', async () => {
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const one = scenario({ idTag: 'AAAA' })
    const draft = await one.run(mgr, 'createRequest', newRole(a.positionId))
    const id = requestIdInText(said(draft.outcome)) as string
    const req = (await one.request(id)) as HcRequest
    const tampered = {
      ...req,
      jobTitle: 'Field Sales Engineer (budget €140,000)',
      updatedAt: '2026-09-30T12:00:00.000Z',
    }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const two = scenario({ idTag: 'BBBB' })
    const out = await two.run(admin, 'importRequests', { files: [fileOf('f.hcplan.json', [tampered])] })
    expect(out.outcome).toEqual({ ok: false, refused: FILE_AMOUNT_TEXT })
    expect(await two.log()).toEqual([])
  }, 120_000)

  it('never merges a request about a Leader’s own seat in Leader mode (PV-7)', async () => {
    const sc = scenario()
    const svp = personaOf(s, 'leader-svp-se')
    const ctx = await sc.ctx({ mode: 'leader', personId: svp.employeeId })
    const rules = personRulesOf(ctx)
    const template = (ctx.plan?.requests ?? []).find((r) => r.type === 'Level change') ?? s.plan.requests[0]
    const own: HcRequest = {
      ...template,
      requestId: 'R-9801',
      type: 'Level change',
      positionId: svp.positionId,
      managerPositionId: '',
      steps: [],
      trade: null,
      transfer: null,
    }
    expect(rules.mayMerge(own)).toBe(false)
    const below = ctx.access.scope?.kind === 'tree' ? [...ctx.access.scope.positionIds][0] : null
    expect(below).toBeTruthy()
    expect(rules.mayMerge({ ...own, positionId: below as string })).toBe(true)
  }, 120_000)
})

describe('Replace from a Full file (C35)', () => {
  it('takes the file’s audit log when it verifies, keeps this workspace’s tag, and refuses a broken one', async () => {
    const a = personaOf(s, 'manager-a')
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const one = scenario({ idTag: 'AAAA' })
    await one.run(mgr, 'createRequest', newRole(a.positionId))
    await one.run(mgr, 'createRequest', newRole(a.positionId))
    const log = await one.log()
    expect(log).toHaveLength(2)
    const state = await one.harness.store.load()
    const file = (audit = log): WorkspaceFile => ({
      format: 'hcplan',
      version: 1,
      kind: 'full',
      notice: 'Contains individual pay',
      savedAt: '2026-09-30T12:00:00.000Z',
      app: 'Headcount Planner',
      mode: 'hr-admin',
      scopeLabel: 'Whole company',
      actingAs: false,
      checksum: 'sha256-x',
      body: { plan: { kind: 'full', state, audit }, lockedVersions: [] },
    })

    const two = scenario({ idTag: 'CCCC' })
    await two.run(mgr, 'createRequest', newRole(a.positionId))
    expect(await two.log()).toHaveLength(1)
    const broken = log.map((e, i) => (i === 1 ? { ...e, new: 'Approved' } : e))
    const refused = await two.run(admin, 'replaceWorkspace', { file: file(broken) })
    expect(refused.outcome).toEqual({
      ok: false,
      refused: "This file's audit log breaks at entry 2. Nothing was imported.",
    })
    expect(await two.log()).toHaveLength(1)

    const out = await two.run(admin, 'replaceWorkspace', { file: file() })
    expect(out.outcome).toEqual({ ok: true, notice: WORKSPACE_REPLACED_NOTICE })
    const after = await two.log()
    expect(after.slice(0, 2)).toEqual(log)
    expect(after.map((e) => [e.seq, e.object, e.field])).toEqual([
      [1, 'request', 'state'],
      [2, 'request', 'state'],
      [3, 'workspace', 'replaced'],
    ])
    expect(verifyChain(after, (await two.harness.store.load()).auditHead)).toEqual({ ok: true, count: 3 })
    expect((await two.harness.store.load()).idTag).toBe('CCCC')
    // The action alone: a broken chain is refused before anything else is read.
    const ctx = actionContextOf(await two.ctx(admin), { readOnly: false, at: '2026-09-30T13:00:00.000Z' })
    expect(replaceWorkspace(state, ctx, { file: file([log[1]]) })).toEqual({
      ok: false,
      refused: "This file's audit log breaks at entry 1. Nothing was imported.",
    })
  }, 180_000)
})
