/**
 * Import requests on the sample (docs/PLAN.md 5.5, 15.1 R17, 16.2 `workspace/mergeRequests.test.ts`):
 * the six managers' request files from src/data/sample/raw read as a person picks them, through the
 * Data room's preview (src/views/data/engine/workspace.ts `importRequestsPreview`) and the write
 * path's action (`importRequests`, as the app runs it):
 *
 *  - "Merged 14 requests from 6 files, 2 conflicts": every draft is new and merged, the later
 *    `updatedAt` wins (the managers' comments on requests the workspace has not changed since), a
 *    stale file copy changes nothing, and the two requests changed on both sides are listed as
 *    conflicts, the same in the preview and the stored result;
 *  - Leader mode with a tree scope: another org's request with a later `updatedAt` leaves the
 *    store's copy unchanged; a cross-org transfer the Leader approves merges; a request on the
 *    Leader's own seat changes no count or conflict; and a CEO pick merges everything;
 *  - Manager mode does not import requests (the policy's sentence), and a file of another kind is
 *    refused with "This file has no requests to merge."
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { decide } from '@/access/policy'
import { chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { MERGE_PREVIEW, MERGE_SUMMARY } from '@/data/sample/raw/requestFiles'
import { type NamedFile, sampleLockedRefs, sampleRequestFilesOf } from '@/data/sample/raw/sampleFiles'
import { fromRow } from '@/plan/engine/requests'
import type { HcRequest } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs, leakSample, personaOf, sampleCtx, withPlan, withPlanRequests } from '@/testkit/sample'
import { importRequestsPreview } from '@/views/data/engine/workspace'
import { buildWorkspaceFile, serializeWorkspace } from './file'
import { NO_REQUESTS_TEXT } from './validate'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
let files: NamedFile[]
let drafts: string[]

beforeAll(() => {
  s = leakSample()
  const made = sampleRequestFilesOf(s)
  files = made.named
  drafts = made.drafts.flat()
}, 120_000)

const rowOf = (sample: Sample, id: string): HcRequest => {
  const own = sample.plan.requests.find((r) => r.requestId === id)
  if (own) return own
  const row = sample.datasets.requests.find((r) => r.requestId === id)
  if (!row) throw new Error(`no request ${id}`)
  return fromRow(row)
}

/** A Requests file holding these requests, as "Export requests" writes it. */
function fileOf(sample: Sample, name: string, requests: readonly HcRequest[]): NamedFile {
  const text = serializeWorkspace(
    buildWorkspaceFile({
      kind: 'requests',
      savedAt: '2026-09-29T17:00',
      mode: 'manager',
      scopeLabel: name,
      actingAs: true,
      plan: { kind: 'requests', requests },
      lockedVersions: sampleLockedRefs(sample),
    }),
  )
  return { name, text, sizeBytes: text.length }
}

/** A later copy of a request: one more Everyone comment, `updatedAt` moved on. */
const commented = (r: HcRequest, at: string, by: string): HcRequest => ({
  ...r,
  comments: [
    ...r.comments,
    { id: `${r.requestId}-cx`, at, by, mode: 'manager', text: 'Ready when you are.', audience: 'everyone' },
  ],
  updatedAt: at,
})

describe('the six sample manager files', () => {
  it('preview as "Merges 14 requests from 6 files; 2 conflicts to choose", the two changed on both sides listed', () => {
    const p = importRequestsPreview(sampleCtx('hr-admin'), files)
    expect(p.refused).toEqual([])
    expect(p.files).toHaveLength(6)
    // Before the merge the dialogs never say "Merged" (UI-11); the notice after says it.
    expect(p.summary).toBe(MERGE_PREVIEW)
    expect(p.after).toBe(MERGE_SUMMARY)
    expect([p.merged, p.skipped, p.conflicts.length]).toEqual([14, 0, 2])
    expect(p.conflicts.map((c) => c.requestId).sort()).toEqual(
      [s.story.tradeRequestId, s.planted.crossUnitMove].sort(),
    )
    for (const c of p.conflicts) {
      // The workspace moved on (an approval step), and the manager commented: both later than the base.
      const base = s.plan.mergeBase.find((b) => b.requestId === c.requestId)?.updatedAt as string
      expect(c.current.updatedAt > base, c.requestId).toBe(true)
      expect(c.incoming.updatedAt > base, c.requestId).toBe(true)
      expect(c.incoming.comments.length).toBeGreaterThan(c.current.comments.length)
    }
  })

  it('merge as the preview said: the later updatedAt wins, a stale copy changes nothing, conflicts wait', async () => {
    const sc = scenario()
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const preview = importRequestsPreview(await sc.ctx(admin), files)
    const run = await sc.run(admin, 'importRequests', { files: preview.files })
    expect(run.outcome).toEqual({ ok: true, notice: MERGE_SUMMARY })
    expect(run.entries.map((e) => [e.object, e.field, e.by])).toEqual([
      ['workspace', 'requests merged', admin.personId],
    ])
    const after = new Map((await sc.plan()).requests.map((r) => [r.requestId, r]))
    // Every draft is new to the workspace.
    for (const id of drafts) expect(after.get(id)?.state, id).toBe('Draft')
    // The three commented requests nobody changed here since take the managers' later copies.
    const incoming = new Map(preview.files.flatMap((f) => f.requests).map((r) => [r.requestId, r]))
    const conflicts = new Set(preview.conflicts.map((c) => c.requestId))
    const taken = [...after.values()].filter((r) => !drafts.includes(r.requestId))
    expect(taken.map((r) => r.requestId).sort()).toEqual(
      [...incoming.values()]
        .filter((r) => !drafts.includes(r.requestId) && !conflicts.has(r.requestId))
        .filter((r) => r.updatedAt > rowOf(s, r.requestId).updatedAt)
        .map((r) => r.requestId)
        .sort(),
    )
    expect(taken).toHaveLength(3)
    for (const r of taken) {
      expect(r.updatedAt > rowOf(s, r.requestId).updatedAt).toBe(true)
      expect(r).toEqual(incoming.get(r.requestId))
    }
    // Every other request in the files stays the workspace's copy (the same or later): the stale
    // copies changed nothing, and the conflicts keep the workspace's copy until chosen.
    for (const [id, copy] of incoming) {
      if (drafts.includes(id) || taken.some((r) => r.requestId === id)) continue
      expect(after.has(id), id).toBe(false)
      expect(copy.updatedAt <= rowOf(s, id).updatedAt || conflicts.has(id), id).toBe(true)
    }
    // Again: nothing more merges; the conflicts are still listed.
    const again = importRequestsPreview(await sc.ctx(admin), files)
    expect([again.merged, again.conflicts.length]).toEqual([0, 2])
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)

  it('is not imported in Manager mode, and a file of another kind is refused', () => {
    const a = personaOf(s, 'manager-a')
    const asA = ctxAs('manager', a.employeeId)
    const how = decide('manager', 'action:request.import').how as string
    const p = importRequestsPreview(asA, files)
    expect(p.files).toEqual([])
    expect(p.refused.map((r) => r.reason)).toEqual(files.map(() => how))
    expect(p.summary).toBe(how)
    const shareableText = serializeWorkspace(
      buildWorkspaceFile({
        kind: 'full',
        savedAt: '2026-09-29T17:00',
        mode: 'hr-admin',
        scopeLabel: 'Northgate',
        actingAs: true,
        plan: { kind: 'full', state: s.plan, audit: [] },
        lockedVersions: sampleLockedRefs(s),
      }),
    )
    const mixed = importRequestsPreview(sampleCtx('hr-admin'), [
      ...files,
      { name: 'full.hcplan.json', text: shareableText, sizeBytes: shareableText.length },
    ])
    expect(mixed.refused).toEqual([{ name: 'full.hcplan.json', reason: NO_REQUESTS_TEXT }])
    expect(mixed.summary).toBe(MERGE_PREVIEW)
  })
})

describe('Leader mode (R17: requests that touch the org or wait on the Leader)', () => {
  it('leaves the store’s copy of another org’s request unchanged, however late the file’s copy', async () => {
    const lead = personaOf(s, 'leader-svp-se')
    const ctx = ctxAs('leader', lead.employeeId)
    expect(ctx.access.scope?.kind).toBe('tree')
    // A pending Operations request: outside the SVP's org, and nobody asks the SVP to approve it.
    const other = rowOf(
      s,
      s.datasets.requests.find((r) => r.businessUnit === 'Operations' && r.state === 'Submitted')
        ?.requestId as string,
    )
    expect(other.steps.some((x) => x.approverId === lead.employeeId)).toBe(false)
    const later = commented(other, '2026-09-29T15:00', other.requesterId)
    const file = fileOf(s, 'ops.hcplan.json', [later])
    const p = importRequestsPreview(ctx, [file])
    expect([p.summary, p.merged, p.conflicts.length]).toEqual([
      'Merges no requests from 1 file; no conflicts',
      0,
      0,
    ])
    // Through the write path the store's copy stays as it was; HR admin's control merges it.
    const sc = scenario()
    const run = await sc.run({ mode: 'leader', personId: lead.employeeId }, 'importRequests', {
      files: p.files,
    })
    expect(run.outcome.ok).toBe(true)
    expect(await sc.request(other.requestId)).toEqual(other)
    const admin = importRequestsPreview(sampleCtx('hr-admin'), [file])
    expect(admin.merged).toBe(1)
  }, 120_000)

  it('merges a cross-org transfer the Leader approves', async () => {
    const moveId = s.planted.crossUnitMove
    const move = rowOf(s, moveId)
    const leaders = move.steps.filter((x) => x.role === 'leader').map((x) => x.approverId)
    expect(leaders.length).toBe(2)
    // Nothing changed here since the last import, so a later file copy is the only change.
    const base = withPlan(s, {
      mergeBase: s.plan.mergeBase.map((b) =>
        b.requestId === moveId ? { ...b, updatedAt: move.updatedAt } : b,
      ),
    })
    const later = commented(move, '2026-09-29T15:30', move.requesterId)
    const file = fileOf(base, 'move.hcplan.json', [later])
    for (const leader of leaders) {
      const ctx = ctxAs('leader', leader, { sample: base })
      expect(ctx.access.scope?.kind, leader).toBe('tree')
      const p = importRequestsPreview(ctx, [file])
      expect([p.merged, p.conflicts.length], leader).toEqual([1, 0])
    }
    const sc = scenario({ sample: base })
    const run = await sc.run({ mode: 'leader', personId: leaders[0] }, 'importRequests', {
      files: importRequestsPreview(ctxAs('leader', leaders[0], { sample: base }), [file]).files,
    })
    expect(run.outcome).toEqual({ ok: true, notice: 'Merged 1 request from 1 file, no conflicts' })
    expect(await sc.request(moveId)).toEqual(later)
    expect(chainOk(await sc.log())).toBe(true)
  }, 120_000)

  it('counts nothing of a request on the Leader’s own seat, merged or in conflict', () => {
    const lead = personaOf(s, 'leader-svp-se')
    const ceo = 'E10001'
    // A Level change on the SVP's own seat, raised by the CEO and changed here since the last import.
    const own: HcRequest = {
      ...fromRow(s.datasets.requests.find((r) => r.type === 'Level change') as never),
      requestId: 'R-9801',
      positionId: lead.positionId,
      managerPositionId: 'P-1001',
      businessUnit: 'Silicon Engineering',
      requesterId: ceo,
      state: 'Submitted',
      steps: [],
      comments: [],
      updatedAt: '2026-09-25T10:00',
    }
    const withOwn = withPlan(withPlanRequests(s, [own]), {
      mergeBase: [...s.plan.mergeBase, { requestId: own.requestId, updatedAt: '2026-09-15T10:00' }],
    })
    const ctx = ctxAs('leader', lead.employeeId, { sample: withOwn })
    const conflicting = commented(own, '2026-09-26T10:00', ceo)
    const newOne: HcRequest = { ...own, requestId: 'R-9802', updatedAt: '2026-09-27T10:00' }
    const plain = importRequestsPreview(ctx, files)
    const withIt = importRequestsPreview(ctx, [
      ...files,
      fileOf(withOwn, 'own.hcplan.json', [conflicting, newOne]),
    ])
    expect([withIt.merged, withIt.skipped, withIt.conflicts.length]).toEqual([
      plain.merged,
      plain.skipped,
      plain.conflicts.length,
    ])
    expect(withIt.conflicts.map((c) => c.requestId)).not.toContain(own.requestId)
    // Control: HR admin counts the new one and lists the conflict.
    const admin = importRequestsPreview(sampleCtx('hr-admin', { sample: withOwn }), [
      fileOf(withOwn, 'own.hcplan.json', [conflicting, newOne]),
    ])
    expect([admin.merged, admin.conflicts.map((c) => c.requestId)]).toEqual([1, [own.requestId]])
  })

  it('never changes or adds a request on the Leader’s own seat through the write path (review PV-7)', async () => {
    const lead = personaOf(s, 'leader-svp-se')
    const ceo = 'E10001'
    const own: HcRequest = {
      ...fromRow(s.datasets.requests.find((r) => r.type === 'Level change') as never),
      requestId: 'R-9811',
      positionId: lead.positionId,
      managerPositionId: 'P-1001',
      businessUnit: 'Silicon Engineering',
      requesterId: ceo,
      state: 'Submitted',
      steps: [],
      comments: [],
      updatedAt: '2026-09-25T10:00',
    }
    const withOwn = withPlan(withPlanRequests(s, [own]), {
      mergeBase: [...s.plan.mergeBase, { requestId: own.requestId, updatedAt: own.updatedAt }],
    })
    // A later Withdrawn copy of it, and a new request on the same seat.
    const withdrawn: HcRequest = { ...own, state: 'Withdrawn', level: 'P1', updatedAt: '2026-09-26T10:00' }
    const added: HcRequest = { ...own, requestId: 'R-9812', updatedAt: '2026-09-26T11:00' }
    const file = fileOf(withOwn, 'own-seat.hcplan.json', [withdrawn, added])
    const sc = scenario({ sample: withOwn })
    const run = await sc.run({ mode: 'leader', personId: lead.employeeId }, 'importRequests', {
      files: importRequestsPreview(ctxAs('leader', lead.employeeId, { sample: withOwn }), [file]).files,
    })
    expect(run.outcome).toEqual({ ok: true, notice: 'Merged no requests from 1 file, no conflicts' })
    expect(await sc.request(own.requestId)).toEqual(own)
    expect(await sc.request(added.requestId)).toBeNull()
    // Control: HR admin merges both.
    const admin = scenario({ sample: withOwn })
    const adminWho: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    await admin.run(adminWho, 'importRequests', {
      files: importRequestsPreview(sampleCtx('hr-admin', { sample: withOwn }), [file]).files,
    })
    expect((await admin.request(own.requestId))?.state).toBe('Withdrawn')
    expect((await admin.request(added.requestId))?.requestId).toBe(added.requestId)
  }, 120_000)

  it('merges everything for a CEO pick, as HR admin does', () => {
    const ctx = ctxAs('leader', 'E10001')
    expect(ctx.access.scope).toBeNull()
    const p = importRequestsPreview(ctx, files)
    expect(p.summary).toBe(MERGE_PREVIEW)
    expect(p.conflicts.map((c) => c.requestId).sort()).toEqual(
      importRequestsPreview(sampleCtx('hr-admin'), files)
        .conflicts.map((c) => c.requestId)
        .sort(),
    )
  })
})
