/**
 * What an import would change (docs/PLAN.md 5.5, 16.2 "workspace ... diff"): dataset row counts,
 * requests new, changed and not in the file, versions, closes and cycles, in plain sentences.
 */
import { describe, expect, it } from 'vitest'
import { emptyDatasets } from '@/data/schema'
import { appendEntry } from '../audit/chain'
import { hcRequest, positionRow } from '../engine/fixtures/common'
import type { AuditEntry, MonthClose, PlanState, WorkingVersion } from '../types'
import { workspaceDiff } from './diff'
import { buildWorkspaceFile } from './file'

const working = (id: string, name: string): WorkingVersion => ({
  versionId: id,
  name,
  kind: 'working',
  fiscalYear: 'FY27',
  grid: { from: '2026-04', to: '2027-03' },
  proration: 'daily',
  state: 'working',
  createdAt: '2026-03-20T09:00',
  lockedAt: null,
  lockedBy: null,
  engineVersion: 'hcp-engine-1',
  parentId: null,
  hash: null,
})

const close = (month: '2026-04' | '2026-05' | '2026-06'): MonthClose =>
  ({ month, closedAt: '2026-07-01T09:00', by: 'E1', hash: `sha256-${month}` }) as unknown as MonthClose

const state = (over: Partial<PlanState>): PlanState => ({
  v: 1,
  baselineId: null,
  versions: [],
  closes: [],
  adjustments: [],
  overlay: { positions: [], targets: [], freezes: [], assumptions: [] },
  requests: [],
  cycles: [],
  reviewed: [],
  mergeBase: [],
  auditHead: null,
  ...over,
})

const current = {
  datasets: { ...emptyDatasets(), positions: [positionRow('P-1'), positionRow('P-2')] },
  plan: state({
    versions: [working('fy27-working', 'FY27 Working')],
    closes: [close('2026-04'), close('2026-05')],
    requests: [hcRequest('R-1'), hcRequest('R-2'), hcRequest('R-3')],
  }),
}

describe('workspaceDiff', () => {
  it('counts what a Full file would change', () => {
    const file = buildWorkspaceFile({
      kind: 'full',
      savedAt: '2026-10-13T10:00',
      mode: 'hr-admin',
      scopeLabel: 'Company',
      actingAs: false,
      lockedVersions: [],
      datasets: { positions: [positionRow('P-1'), positionRow('P-2'), positionRow('P-3')], freezes: [] },
      plan: {
        kind: 'full',
        audit: [],
        state: state({
          versions: [working('fy27-working', 'FY27 Working'), working('fy28-working', 'FY28 Plan Working')],
          closes: [close('2026-04'), close('2026-05'), close('2026-06')],
          requests: [hcRequest('R-2', { state: 'Approved' }), hcRequest('R-3'), hcRequest('R-4')],
          cycles: [
            {
              cycleId: 'FY28',
              fiscalYear: 'FY28',
              stage: 'Open for asks',
              openedAt: '2026-09-15T09:00',
              openedBy: 'E1',
              dates: {
                asksDue: '2026-10-16',
                hrbpReviewDue: null,
                leaderReviewDue: null,
                financeReviewDue: null,
              },
              hrbpDone: [],
              leaderDone: [],
              cutLines: [],
              lockedAt: null,
              lockedBy: null,
            },
          ],
        }),
      },
    })
    const d = workspaceDiff(current, file)
    expect(d.datasets).toEqual([
      { key: 'positions', current: 2, incoming: 3 },
      { key: 'freezes', current: 0, incoming: 0 },
    ])
    expect(d.plan.requests).toEqual({ added: 1, changed: 1, removed: 1 })
    expect(d.plan.versions.added.map((v) => v.versionId)).toEqual(['fy28-working'])
    expect(d.plan.versions.same).toBe(1)
    expect(d.plan.closes).toEqual({ added: 1, same: 2 })
    expect(d.plan.cycles).toEqual({ added: 1, changed: 0 })
    expect(d.lines).toEqual([
      'Positions: 2 rows now, 3 rows in the file.',
      'Hiring freezes: 0 rows now, 0 rows in the file.',
      'Requests: 1 new request, 1 changed request, 1 request not in the file.',
      'Versions: 1 new version (FY28 Plan Working), 1 already here.',
      'Month closes: 1 new close, 2 already here.',
      'Planning cycles: 1 new cycle, 0 changed cycles.',
      "Audit log: 0 entries now, 0 entries in the file, and the file's chain checks out. Replace puts the file's log in place of this one and adds one entry; Merge keeps this one.",
    ])
    expect(d.audit).toEqual({ here: 0, inFile: 0, check: { ok: true, count: 0 } })
  })

  it("checks a Full file's audit log: Replace takes it only when its chain verifies (C35)", () => {
    const log: AuditEntry[] = []
    for (let i = 1; i <= 3; i++)
      log.push(
        appendEntry(log.at(-1) ?? null, {
          at: `2026-09-0${i}T09:00`,
          by: 'E1',
          byName: 'Priya',
          mode: 'hrbp',
          object: 'request',
          id: `R-${i}`,
          field: 'state',
          old: 'Submitted',
          new: 'In review',
          effectiveDate: null,
          comment: null,
          commentAudience: null,
        }),
      )
    const fileWith = (audit: AuditEntry[]) =>
      buildWorkspaceFile({
        kind: 'full',
        savedAt: '2026-10-13T10:00',
        mode: 'hr-admin',
        scopeLabel: 'Company',
        actingAs: false,
        lockedVersions: [],
        plan: { kind: 'full', audit, state: state({}) },
      })
    const here = workspaceDiff({ ...current, audit: log.slice(0, 1) }, fileWith(log))
    expect(here.audit).toEqual({ here: 1, inFile: 3, check: { ok: true, count: 3 } })
    expect(here.lines.at(-1)).toBe(
      "Audit log: 1 entry now, 3 entries in the file, and the file's chain checks out. Replace puts the file's log in place of this one and adds one entry; Merge keeps this one.",
    )
    const damaged = [log[0], { ...log[1], byName: 'Someone else' }, log[2]]
    const broken = workspaceDiff(current, fileWith(damaged))
    expect(broken.audit?.check).toEqual({ ok: false, count: 3, brokenAt: 2 })
    expect(broken.lines.at(-1)).toBe(
      "Audit log: the file's chain breaks at entry 2, so Replace is refused. Merge keeps this workspace's log.",
    )
  })

  it('only adds or changes for a Requests file, which carries no datasets', () => {
    const file = buildWorkspaceFile({
      kind: 'requests',
      savedAt: '2026-10-13T10:00',
      mode: 'manager',
      scopeLabel: 'Team',
      actingAs: true,
      lockedVersions: [],
      plan: { kind: 'requests', requests: [hcRequest('R-1'), hcRequest('R-9')] },
    })
    const d = workspaceDiff(current, file)
    expect(d.datasets).toEqual([])
    expect(d.plan.requests).toEqual({ added: 1, changed: 0, removed: 0 })
    expect(d.audit).toBeNull()
    expect(d.lines).toEqual([
      'Requests: 1 new request, 0 changed requests.',
      'Versions: no new versions, 0 already here.',
      'Month closes: 0 new closes, 0 already here.',
    ])
  })

  it('writes no amount into its lines', () => {
    const file = buildWorkspaceFile({
      kind: 'requests',
      savedAt: '2026-10-13T10:00',
      mode: 'hrbp',
      scopeLabel: 'Team',
      actingAs: false,
      lockedVersions: [],
      plan: { kind: 'requests', requests: [hcRequest('R-1', { fte: 0.5 })] },
    })
    for (const line of workspaceDiff(current, file).lines) expect(line).not.toMatch(/[$€£₹₪]|\d,\d{3}/)
  })
})
