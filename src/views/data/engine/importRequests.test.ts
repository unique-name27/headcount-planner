/**
 * Import requests' preview after the M3 review (docs/PLAN.md 5.5, 8.4 rules 5 and 6; findings PV-8,
 * UI-11, IN-1): the conflict list counts and hands the dialog only the comments the importer may
 * read, so two approvers-only comments a Finance user or an off-chain Leader may not read change no
 * word of it (control: the same comments to Everyone); the preview never says "Merged"; and an ID
 * that two different requests carry is listed with no choice, never merged and never dropped.
 * M3 recheck: a decision that cannot take effect here names why only to an importer who sees the
 * request in full, and the copies the preview hands a limited importer are cut as their own file
 * would carry them.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { commentVisible, requestView, viewerOf } from '@/access/visibility'
import { approveAll, scenario, type Who } from '@/app/write/scenario.testkit'
import type { AnalyticsContext } from '@/data/context'
import type { Sample } from '@/data/sample'
import { requestsOf } from '@/drill/seats'
import { requestIdInText } from '@/plan/actions/requestIds'
import type { Comment, HcRequest } from '@/plan/types'
import { buildWorkspaceFile, serializeWorkspace } from '@/plan/workspace/file'
import { ID_CLASH_TEXT } from '@/plan/workspace/merge'
import { importsCrawl } from '@/testkit/crawl'
import { MemoryStorage } from '@/testkit/memoryStorage'
import {
  leakSample,
  personaCtx,
  personaOf,
  sampleCtx,
  withDatasets,
  withPlan,
  withPlanRequests,
} from '@/testkit/sample'
import {
  conflictRows,
  EFFECT_NOT_HERE_TEXT,
  importRequestsPreview,
  lockedRefsOf,
  requestsFile,
} from './workspace'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s0: Sample
beforeAll(() => {
  s0 = leakSample()
}, 120_000)

const T0 = '2026-09-20T10:00:00.000Z'
const T1 = '2026-09-21T10:00:00.000Z'
const T2 = '2026-09-22T10:00:00.000Z'

/** A Requests file holding these requests, as the app writes one. */
function fileOf(ctx: AnalyticsContext, requests: HcRequest[]) {
  const file = buildWorkspaceFile({
    kind: 'requests',
    savedAt: T2,
    mode: 'hrbp',
    scopeLabel: 'Sent back',
    actingAs: true,
    plan: { kind: 'requests', requests },
    lockedVersions: lockedRefsOf(ctx),
  })
  const text = serializeWorkspace(file)
  return { name: 'from-the-hrbp.hcplan.json', text, sizeBytes: text.length }
}

describe('a conflict counts only the comments the importer may read (PV-8)', () => {
  for (const key of ['finance-fpa', 'leader-cfo'] as const)
    it(`${key}: two approvers-only comments change no word, and their text never reaches the preview`, () => {
      const c0 = personaCtx(key, { sample: s0 })
      const v0 = viewerOf(c0)
      // A pending New role the importer reads in full but approves no step of.
      const req = requestsOf(c0).find(
        (r) =>
          (r.state === 'Submitted' || r.state === 'In review') &&
          r.type === 'New role' &&
          requestView(r, v0) === 'full' &&
          !r.steps.some((x) => x.approverId === v0.personId),
      ) as HcRequest
      expect(req, key).toBeTruthy()
      // Since the last merge (T0), this workspace's copy moved (an Everyone comment at T1) and the
      // file's copy moved (two comments from the first approver at T2).
      const mine: HcRequest = {
        ...req,
        updatedAt: T1,
        comments: [
          ...req.comments,
          {
            id: `${req.requestId}-w1`,
            at: T1,
            by: req.requesterId,
            mode: 'manager',
            text: 'Start can move a week',
            audience: 'everyone',
          },
        ],
      }
      const sample = withPlan(withPlanRequests(s0, [mine]), {
        mergeBase: [
          ...s0.plan.mergeBase.filter((b) => b.requestId !== req.requestId),
          { requestId: req.requestId, updatedAt: T0 },
        ],
      })
      const ctx = personaCtx(key, { sample })
      const viewer = viewerOf(ctx)
      const approver = req.steps[0]?.approverId as string
      const read = (audience: Comment['audience']) => {
        const notes: Comment[] = [1, 2].map((n) => ({
          id: `${req.requestId}-f${n}`,
          at: T2,
          by: approver,
          mode: 'hrbp',
          text: `Approver note ${n} for the panel`,
          audience,
        }))
        const theirs: HcRequest = { ...req, updatedAt: T2, comments: [...req.comments, ...notes] }
        expect(notes.map((c) => commentVisible(c, theirs, viewer))).toEqual(
          audience === 'approvers' ? [false, false] : [true, true],
        )
        const files = [fileOf(ctx, [theirs])]
        const p = importRequestsPreview(ctx, files)
        return { p, rows: conflictRows(ctx, p.conflicts), crawl: importsCrawl(ctx, files) }
      }
      const hidden = read('approvers')
      const shown = read('everyone')
      expect(hidden.p.conflicts.map((c) => c.requestId)).toEqual([req.requestId])
      // The file's copy adds nothing the importer may read: no "more comments" sentence.
      expect(hidden.rows[0].what).not.toMatch(/more comment/)
      // Control: the two notes to Everyone count (less the one this workspace added).
      expect(shown.rows[0].what).toMatch(/1 more comment;/)
      // The copies the dialog is handed carry no comment the importer may not read.
      expect(hidden.p.conflicts[0].incoming.comments.some((c) => c.text.startsWith('Approver note'))).toBe(
        false,
      )
      expect(
        hidden.crawl.seen.some((x) => typeof x.value === 'string' && x.value.includes('Approver note')),
      ).toBe(false)
      // Control: addressed to Everyone, the same notes are read.
      expect(
        shown.crawl.seen.some((x) => typeof x.value === 'string' && x.value.includes('Approver note')),
      ).toBe(true)
      // Before anything merges, the preview never says "Merged" (UI-11).
      expect(hidden.p.summary).toBe('Merges no requests from 1 file; 1 conflict to choose')
      expect(hidden.p.after).toBe('Merged no requests from 1 file, 1 conflict')
    })
})

describe('an ID two different requests carry (IN-1)', () => {
  it('is listed with no choice, neither merged nor dropped', () => {
    const ctx = sampleCtx('hr-admin')
    const own = requestsOf(ctx).find((r) => r.state === 'Draft') as HcRequest
    // Another browser's request under the same ID: another requester, another title.
    const other: HcRequest = {
      ...own,
      requesterId: own.requesterId === 'E10626' ? 'E11050' : 'E10626',
      jobTitle: 'Another team’s role',
      updatedAt: T2,
    }
    const p = importRequestsPreview(ctx, [fileOf(ctx, [other])])
    expect([p.merged, p.conflicts.length]).toEqual([0, 1])
    expect(p.conflicts[0]).toMatchObject({ requestId: own.requestId, kind: 'clash', reason: ID_CLASH_TEXT })
    expect(conflictRows(ctx, p.conflicts)[0]).toMatchObject({ choosable: false, what: ID_CLASH_TEXT })
    expect(p.summary).toBe('Merges no requests from 1 file; 1 request cannot merge')
  })
})

describe('a decision that cannot take effect here, for a limited importer (M3 recheck)', () => {
  it('names no site, seat or person, and hands the dialog only the cut copy', async () => {
    const s = s0
    const a = personaOf(s, 'manager-a')
    const mRow = s.datasets.positions.find((p) => p.positionId === a.positionId)
    const team = s.datasets.positions.filter((p) => p.managerPositionId === a.positionId)
    const holders = new Set(
      s.datasets.workers.filter((w) => !w.terminationDate && !w.assignmentEnd).map((w) => w.positionId),
    )
    const seat = team.find((p) => holders.has(p.positionId)) ?? team[0]
    // A site where Manager A's department has no seat in the sample; workspace one adds one there.
    const site = ['Munich', 'Haifa', 'Bangalore', 'Hsinchu', 'Austin', 'Toronto'].find(
      (l) =>
        l !== seat.location &&
        !s.datasets.positions.some(
          (p) =>
            p.businessUnit === mRow?.businessUnit && p.department === mRow?.department && p.location === l,
        ),
    ) as string
    const extra = {
      ...seat,
      positionId: 'P-9990',
      location: site,
      costCenter: `${mRow?.department}-${site}`,
      managerPositionId: a.positionId,
    }
    const one = scenario({
      sample: withDatasets(s, { positions: [...s.datasets.positions, extra as never] }),
      idTag: 'AAAA',
    })
    const mgr: Who = { mode: 'manager', personId: a.employeeId }
    const d = await one.run(mgr, 'createRequest', {
      type: 'Location change',
      positionId: seat.positionId,
      location: site,
      startDate: '2027-01-04',
      reasonCode: 'Other',
    })
    const id = requestIdInText(d.outcome.ok ? d.outcome.notice : '') as string
    expect((await one.run(mgr, 'submitRequest', { requestId: id })).outcome.ok).toBe(true)
    expect((await approveAll(one, id)).every((x) => x.outcome.ok)).toBe(true)
    const req = (await one.request(id)) as HcRequest
    expect(req.state).toBe('Approved')
    const hrbpId = req.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const file = requestsFile(await one.ctx({ mode: 'hrbp', personId: hrbpId, unit: req.businessUnit }), T2)
    if (!file.ok) throw new Error(file.refused)
    const files = [{ name: 'one.hcplan.json', text: file.out.text, sizeBytes: file.out.text.length }]
    // The plain sample has no cost center of the department at the site: the approval cannot apply.
    for (const key of ['finance-fpa', 'leader-cfo'] as const) {
      const ctx = personaCtx(key, { sample: s })
      expect(requestView(req, viewerOf(ctx)), key).toBe('limited')
      const p = importRequestsPreview(ctx, files)
      expect(p.summary, key).toBe('Merges no requests from 1 file; 1 request cannot merge')
      const rows = conflictRows(ctx, p.conflicts)
      expect(
        rows.map((r) => r.what),
        key,
      ).toEqual([EFFECT_NOT_HERE_TEXT])
      expect(JSON.stringify(rows), key).not.toContain(site)
      // The copies are the limited view's: no site, requester, approvers or start.
      for (const c of p.conflicts) {
        expect(c.reason, key).toBe(EFFECT_NOT_HERE_TEXT)
        for (const copy of [c.current, c.incoming]) {
          expect(copy.location, key).toBeNull()
          expect(copy.requesterId, key).toBe('')
          expect(copy.steps, key).toEqual([])
          expect(copy.startDate, key).toBeNull()
        }
      }
      expect(JSON.stringify(p.conflicts), key).not.toContain(site)
    }
    // The control: HR admin reads the request in full, and the sentence that names why.
    const admin = sampleCtx('hr-admin', { sample: s })
    const rows = conflictRows(admin, importRequestsPreview(admin, files).conflicts)
    expect(rows).toHaveLength(1)
    expect(rows[0].what).toContain(site)
    // Viewers who do not see the request at all are told nothing of it.
    for (const key of ['leader-svp-se', 'leader-dv-director'] as const) {
      const ctx = personaCtx(key, { sample: s })
      if (requestView(req, viewerOf(ctx)) !== 'none') continue
      expect(importRequestsPreview(ctx, files).conflicts, key).toEqual([])
    }
  }, 300_000)
})
