/**
 * Requests > Queue's Import requests and Mine's Export requests (docs/PLAN.md 5.5, 8.3, 15.1 R17,
 * 16.2; docs/CONTRACTS-M3.md 3, requests-ui): each button follows its action's decision in every mode;
 * the six sample manager files read through the dialog's preview (the Data room's workspace engine)
 * say "Merged 14 requests from 6 files, 2 conflicts" and list the two conflicts before anything is
 * written; the merge through the write path gives the same notice, the later `updatedAt` wins, a
 * conflict keeps the workspace's copy until chosen, and the merged drafts reach their manager's Mine.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import { decide } from '@/access/policy'
import { chainOk, scenario, type Who } from '@/app/write/scenario.testkit'
import type { Sample } from '@/data/sample'
import { MERGE_SUMMARY, sampleRequestFiles } from '@/data/sample/raw/requestFiles'
import type { HcRequest, LockedVersionRef } from '@/plan/types'
import { leakSample, personaOf, sampleCtx } from '@/testkit/sample'
import { importRequestsPreview } from '@/views/data/engine/workspace'
import { requestsModel } from './index'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

function sampleFiles(x: Sample) {
  const refs: LockedVersionRef[] = [x.locks.budget, x.locks.q1].map((v) => ({
    versionId: v.versionId,
    name: v.name,
    kind: v.kind,
    fiscalYear: v.fiscalYear,
    state: v.state,
    hash: v.hash,
  }))
  return sampleRequestFiles(
    {
      datasets: x.datasets,
      personas: x.personas,
      planted: x.planted,
      tradeRequestId: x.story.tradeRequestId,
    },
    refs,
  )
}

describe('the file buttons follow their decisions', () => {
  it('Import requests in the Queue header for HRBPs and above; Export requests on the Queue and Mine in every mode', () => {
    for (const mode of MODES) {
      const m = requestsModel(sampleCtx(mode))
      const imp = decide(mode, 'action:request.import')
      expect(m.queue.importRequests, mode).toEqual(
        imp.access === 'hidden' ? { shown: false, why: imp.how } : { shown: true, why: null },
      )
      expect(m.queue.exportRequests, mode).toEqual({ shown: true, why: null })
      expect(m.mine.exportRequests, mode).toEqual({ shown: true, why: null })
    }
    expect(requestsModel(sampleCtx('manager')).queue.importRequests).toEqual({
      shown: false,
      why: 'Import requests is for HRBPs and above.',
    })
  })
})

describe('Import requests on the six sample files', () => {
  it('previews, then merges: the later updatedAt wins, conflicts are listed and kept until chosen', async () => {
    const sc = scenario()
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const made = sampleFiles(s)
    const files = made.texts.map((text, i) => ({
      name: `manager-${i + 1}.hcplan.json`,
      text,
      sizeBytes: text.length,
    }))

    // The dialog's preview: the summary and the two conflicts, before anything is written.
    const ctx = await sc.ctx(admin)
    const preview = importRequestsPreview(ctx, files)
    // Before anything merges the summary reads ahead (UI-11); the notice after the merge reads back.
    expect(preview.summary).toMatch(/^Merges 14 requests from 6 files/)
    expect(preview.summary).not.toMatch(/^Merged/)
    expect(preview.refused).toEqual([])
    expect(preview.files.length).toBe(6)
    expect(preview.conflicts.length).toBe(2)
    expect(preview.conflicts.map((c) => c.requestId)).toContain(s.story.tradeRequestId)
    expect((await sc.log()).length).toBe(0)

    // The merge through the write path, with the conflicts left as the workspace's.
    const out = await sc.run(admin, 'importRequests', { files: preview.files })
    expect(out.outcome).toEqual({ ok: true, notice: MERGE_SUMMARY })
    for (const e of out.entries) expect(e.by).toBe(admin.personId)
    expect(chainOk(await sc.log())).toBe(true)

    // The later updatedAt wins: a manager's comment on a request the workspace had not changed is in.
    const incoming = preview.files.flatMap((f) => f.requests)
    const conflictIds = new Set(preview.conflicts.map((c) => c.requestId))
    const commented = incoming.find(
      (r) =>
        !conflictIds.has(r.requestId) && r.state !== 'Draft' && r.comments.some((c) => c.mode === 'manager'),
    ) as HcRequest
    expect(commented).toBeTruthy()
    const now = (await sc.request(commented.requestId)) as HcRequest
    expect(now.updatedAt).toBe(commented.updatedAt)
    expect(now.comments.map((c) => c.id)).toEqual(commented.comments.map((c) => c.id))
    // A conflict keeps this workspace's copy.
    for (const c of preview.conflicts) {
      const kept = (await sc.request(c.requestId)) as HcRequest
      expect(kept.updatedAt, c.requestId).toBe(c.current.updatedAt)
    }

    // The merged drafts reach their manager's Mine.
    const a = personaOf(s, 'manager-a')
    const mine = requestsModel(await sc.ctx({ mode: 'manager', personId: a.employeeId })).mine.rows.rows
    const aDrafts = incoming
      .filter((r) => r.requesterId === a.employeeId && r.state === 'Draft')
      .map((r) => r.requestId)
    expect(aDrafts.length).toBeGreaterThan(0)
    for (const id of aDrafts) expect(mine.map((r) => r.requestId)).toContain(id)
  }, 180_000)
})
