/**
 * Merging requests and plan state (docs/PLAN.md 5.5, 15.1 R17, 16.2 "workspace ... merge conflicts"):
 * the later updatedAt wins, rows changed on both sides are conflicts, the Leader tree rule never
 * overwrites the workspace's copy, hidden requests change no number, and the summary reads
 * "Merged 14 requests from 6 files, 2 conflicts". (The six sample manager files are asserted again in
 * wave 2's workspace/mergeRequests.test.ts.)
 */
import { describe, expect, it } from 'vitest'
import { hcRequest, positionRow } from '../engine/fixtures/common'
import type { HcRequest, LockedVersion, PlanState, WorkingVersion } from '../types'
import {
  chooseConflict,
  freezeClashes,
  ID_CLASH_TEXT,
  isChoosable,
  mergeBaseMap,
  mergePlanState,
  mergePreviewText,
  mergeRequests,
  mergeSummary,
  revisionOf,
  stampMs,
} from './merge'
import { hashMismatchText } from './validate'

const T0 = '2026-09-01T09:00'
const req = (id: string, updatedAt = T0, over: Partial<HcRequest> = {}): HcRequest =>
  hcRequest(id, { updatedAt, ...over })

describe('mergeSummary', () => {
  it('reads in plain counts', () => {
    expect(mergeSummary(14, 6, 2)).toBe('Merged 14 requests from 6 files, 2 conflicts')
    expect(mergeSummary(1, 1, 1)).toBe('Merged 1 request from 1 file, 1 conflict')
    expect(mergeSummary(3, 2, 0)).toBe('Merged 3 requests from 2 files, no conflicts')
    expect(mergeSummary(0, 1, 0)).toBe('Merged no requests from 1 file, no conflicts')
    expect(mergeSummary(1200, 6, 0)).toBe('Merged 1,200 requests from 6 files, no conflicts')
  })
})

describe('mergeRequests: six manager files', () => {
  // The workspace: R-01 to R-06, all last merged at T0; R-05 and R-06 changed here since.
  const current = [
    req('R-01'),
    req('R-02'),
    req('R-03'),
    req('R-04'),
    req('R-05', '2026-09-10T09:00', { state: 'In review' }),
    req('R-06', '2026-09-11T09:00', { state: 'Sent back' }),
  ]
  const base = mergeBaseMap(
    ['R-01', 'R-02', 'R-03', 'R-04', 'R-05', 'R-06'].map((requestId) => ({ requestId, updatedAt: T0 })),
  )
  const files: HcRequest[][] = [
    [
      req('R-01', '2026-09-05T09:00', { state: 'In review' }),
      req('R-10', '2026-09-02T09:00'),
      req('R-11', '2026-09-02T09:00'),
    ],
    [req('R-02', '2026-09-06T09:00', { priority: 2 }), req('R-12'), req('R-13')],
    [req('R-03'), req('R-14'), req('R-15'), req('R-05', '2026-09-07T09:00', { state: 'Withdrawn' })],
    [req('R-04', '2026-08-20T09:00', { state: 'Draft' }), req('R-16')],
    [req('R-06', '2026-09-08T09:00', { state: 'Approved' }), req('R-17'), req('R-18')],
    [
      req('R-10', '2026-09-03T09:00', { state: 'Approved' }),
      req('R-19'),
      req('R-20'),
      req('R-21'),
      req('R-SELF', T0, { type: 'Elimination' }),
    ],
  ]
  const visible = (r: HcRequest) => r.requestId !== 'R-SELF'
  const result = mergeRequests(current, files, { base, visible })

  it('says "Merged 14 requests from 6 files, 2 conflicts"', () => {
    expect(result.summary).toBe('Merged 14 requests from 6 files, 2 conflicts')
    expect(result.merged).toBe(14)
    expect(result.files).toBe(6)
    expect(result.conflicts.map((c) => c.requestId)).toEqual(['R-05', 'R-06'])
    expect(result.skipped).toBe(0)
  })

  it('lets the later updatedAt win', () => {
    const byId = new Map(result.requests.map((r) => [r.requestId, r]))
    expect(byId.get('R-01')?.state).toBe('In review')
    expect(byId.get('R-02')?.priority).toBe(2)
    // R-04's incoming copy is older than the workspace's: kept.
    expect(byId.get('R-04')).toEqual(req('R-04'))
    // R-10 came in two files; the later copy wins and counts once.
    expect(byId.get('R-10')?.state).toBe('Approved')
  })

  it("keeps the workspace's copy of a conflict, listing both copies", () => {
    const byId = new Map(result.requests.map((r) => [r.requestId, r]))
    expect(byId.get('R-05')?.state).toBe('In review')
    expect(byId.get('R-06')?.state).toBe('Sent back')
    expect(result.conflicts[0]).toMatchObject({
      current: { state: 'In review' },
      incoming: { state: 'Withdrawn' },
    })
  })

  it('keeps the order: the workspace first, then new requests as the files bring them', () => {
    expect(result.requests.map((r) => r.requestId)).toEqual([
      'R-01',
      'R-02',
      'R-03',
      'R-04',
      'R-05',
      'R-06',
      'R-10',
      'R-11',
      'R-12',
      'R-13',
      'R-14',
      'R-15',
      'R-16',
      'R-17',
      'R-18',
      'R-19',
      'R-20',
      'R-21',
      'R-SELF',
    ])
  })

  it('merges a request hidden from the importer without counting it', () => {
    expect(result.requests.some((r) => r.requestId === 'R-SELF')).toBe(true)
    const without = mergeRequests(
      current,
      files.map((f) => f.filter((r) => r.requestId !== 'R-SELF')),
      { base, visible },
    )
    expect(without.summary).toBe(result.summary)
    expect(without.conflicts).toEqual(result.conflicts)
  })

  it('moves the merge base, except for conflicts, which wait for a choice', () => {
    const b = mergeBaseMap(result.base)
    expect(b.get('R-01')).toBe('2026-09-05T09:00')
    expect(b.get('R-04')).toBe(T0)
    expect(b.get('R-10')).toBe('2026-09-03T09:00')
    expect(b.get('R-05')).toBe(T0)
    expect(b.get('R-06')).toBe(T0)
    expect(result.base.map((x) => x.requestId)).toEqual([...result.base.map((x) => x.requestId)].sort())
  })

  it('finds the same conflicts again on a second import of the same files, and nothing else', () => {
    const again = mergeRequests(result.requests, files, { base: mergeBaseMap(result.base), visible })
    expect(again.summary).toBe('Merged no requests from 6 files, 2 conflicts')
  })
})

describe('mergeRequests: the rules one by one', () => {
  it('treats a request with no merge base as unchanged in the workspace', () => {
    const r = mergeRequests([req('R-1')], [[req('R-1', '2026-09-02T09:00', { state: 'Approved' })]], {
      base: new Map(),
    })
    expect(r.requests[0].state).toBe('Approved')
    expect(r.conflicts).toEqual([])
    const older = mergeRequests(
      [req('R-1', '2026-09-05T09:00')],
      [[req('R-1', '2026-09-02T09:00', { state: 'Approved' })]],
      {
        base: new Map(),
      },
    )
    expect(older.requests[0].state).toBe('Submitted')
    expect(older.merged).toBe(0)
  })

  it('calls the same updatedAt with different content a conflict', () => {
    const r = mergeRequests([req('R-1')], [[req('R-1', T0, { state: 'Rejected' })]], { base: new Map() })
    expect(r.conflicts).toHaveLength(1)
    expect(r.requests[0].state).toBe('Submitted')
  })

  it('does nothing for an identical copy, whatever its key order', () => {
    const copy = JSON.parse(JSON.stringify(req('R-1'))) as HcRequest
    const r = mergeRequests([req('R-1')], [[copy]], { base: new Map() })
    expect(r).toMatchObject({
      merged: 0,
      conflicts: [],
      summary: 'Merged no requests from 1 file, no conflicts',
    })
  })

  it("never overwrites the workspace's copy of a request the Leader may not merge", () => {
    const inTree = (r: HcRequest) => r.managerPositionId === 'P-LEAD-TREE'
    const outside = req('R-OUT', T0, { managerPositionId: 'P-OTHER' })
    const later = req('R-OUT', '2026-09-20T09:00', { managerPositionId: 'P-OTHER', state: 'Rejected' })
    const sneaky = req('R-OUT', '2026-09-21T09:00', { managerPositionId: 'P-LEAD-TREE', state: 'Withdrawn' })
    const mine = req('R-IN', T0, { managerPositionId: 'P-LEAD-TREE' })
    const r = mergeRequests(
      [outside, mine],
      [
        [later],
        [sneaky, req('R-IN', '2026-09-20T09:00', { managerPositionId: 'P-LEAD-TREE', state: 'Approved' })],
      ],
      {
        base: new Map(),
        accept: inTree,
      },
    )
    expect(r.requests.find((x) => x.requestId === 'R-OUT')).toEqual(outside)
    expect(r.requests.find((x) => x.requestId === 'R-IN')?.state).toBe('Approved')
    expect(r.merged).toBe(1)
    expect(r.skipped).toBe(1)
    // A new request outside the tree is skipped, not added.
    const added = mergeRequests([], [[req('R-NEW', T0, { managerPositionId: 'P-OTHER' })]], {
      base: new Map(),
      accept: inTree,
    })
    expect(added).toMatchObject({ requests: [], merged: 0, skipped: 1 })
  })

  it('ignores an untouched file copy older than the merge base, however often it comes back', () => {
    const T1 = '2026-09-01T09:00'
    const T2 = '2026-09-05T09:00'
    const T3 = '2026-09-08T09:00'
    const file = [req('R-1', T1)]
    // Merged at T1; the workspace edits to T2 and the file still has T1.
    const first = mergeRequests([req('R-1', T2, { state: 'In review' })], [file], {
      base: mergeBaseMap([{ requestId: 'R-1', updatedAt: T1 }]),
    })
    expect(first).toMatchObject({ merged: 0, conflicts: [] })
    // The workspace's copy won: the base stays where the files left it (M3 review IN-3).
    expect(mergeBaseMap(first.base).get('R-1')).toBe(T1)
    // The workspace edits again to T3; the same stale file comes in again.
    const second = mergeRequests([{ ...first.requests[0], updatedAt: T3, state: 'Approved' }], [file], {
      base: mergeBaseMap(first.base),
    })
    expect(second.conflicts).toEqual([])
    expect(second.summary).toBe('Merged no requests from 1 file, no conflicts')
    expect(second.requests[0]).toMatchObject({ updatedAt: T3, state: 'Approved' })
  })

  it('never lists an old file imported again after a newer merge as a conflict', () => {
    // File A (09-01), then file B (09-05) moves the base; an edit here (09-08); then A again.
    const a = [req('R-1', '2026-09-01T09:00')]
    const b = [req('R-1', '2026-09-05T09:00', { state: 'In review' })]
    const afterA = mergeRequests([], [a], { base: new Map() })
    const afterB = mergeRequests(afterA.requests, [b], { base: mergeBaseMap(afterA.base) })
    expect(afterB.requests[0].updatedAt).toBe('2026-09-05T09:00')
    const edited = [{ ...afterB.requests[0], updatedAt: '2026-09-08T09:00', state: 'Approved' as const }]
    const again = mergeRequests(edited, [a], { base: mergeBaseMap(afterB.base) })
    expect(again.summary).toBe('Merged no requests from 1 file, no conflicts')
    expect(again.requests[0]).toMatchObject({ updatedAt: '2026-09-08T09:00', state: 'Approved' })
  })

  it('counts no hidden request in skipped or conflicts', () => {
    const hidden = (r: HcRequest) => r.requestId !== 'R-H'
    const r = mergeRequests(
      [req('R-H', '2026-09-05T09:00')],
      [
        [req('R-H', '2026-09-06T09:00', { state: 'Rejected' })],
        [req('R-X', T0, { managerPositionId: 'P-OTHER' })],
      ],
      {
        base: mergeBaseMap([{ requestId: 'R-H', updatedAt: T0 }]),
        visible: hidden,
        accept: (x) => x.requestId !== 'R-X',
      },
    )
    expect(r.conflicts).toEqual([])
    expect(r.skipped).toBe(1)
    expect(r.requests[0].updatedAt).toBe('2026-09-05T09:00')
  })
})

describe('mergeRequests: M3 review rules', () => {
  const step = (
    n: number,
    role: 'hrbp' | 'leader' | 'finance',
    over: Partial<HcRequest['steps'][number]> = {},
  ): HcRequest['steps'][number] => ({
    n,
    role,
    approverId: `E-${role}`,
    reasons: [],
    enteredAt: null,
    decision: null,
    at: null,
    note: null,
    ...over,
  })
  const comment = (id: string, at: string) => ({
    id,
    at,
    by: 'E1110',
    mode: 'manager' as const,
    text: 'Interview panel is set',
    audience: 'everyone' as const,
  })
  const F1 = '2026-09-30T09:01:00.000Z'
  const sent = () => req('R-2000', F1, { steps: [step(1, 'hrbp', { enteredAt: F1 }), step(2, 'leader')] })

  it('keeps the base when a stale file comes back, so a later file of that lineage is a conflict (IN-3)', () => {
    const f1 = sent()
    const approvedHere = req('R-2000', '2026-09-30T09:02:05.000Z', {
      state: 'In review',
      steps: [
        step(1, 'hrbp', { enteredAt: F1, decision: 'Approved', at: '2026-09-30T09:02:05.000Z' }),
        step(2, 'leader', { enteredAt: '2026-09-30T09:02:05.000Z' }),
      ],
    })
    const base = mergeBaseMap([{ requestId: 'R-2000', updatedAt: F1 }])
    const again = mergeRequests([approvedHere], [[f1]], { base })
    expect(again).toMatchObject({ merged: 0, conflicts: [] })
    expect(mergeBaseMap(again.base).get('R-2000')).toBe(F1)
    // The manager never saw the approval; they comment and send the file again.
    const f2 = {
      ...f1,
      updatedAt: '2026-09-30T09:05:00.000Z',
      comments: [comment('C-1', '2026-09-30T09:05:00.000Z')],
    }
    const r = mergeRequests(again.requests, [[f2]], { base: mergeBaseMap(again.base) })
    expect(r.merged).toBe(0)
    expect(r.conflicts.map((c) => [c.requestId, c.kind])).toEqual([['R-2000', 'changed']])
    expect(r.requests[0].steps[0].decision).toBe('Approved')
  })

  it('lists copies that each hold work the other lacks, with no merge base (IN-4)', () => {
    const exported = req('R-2000', '2026-09-30T11:59:00.000Z', {
      steps: [step(1, 'hrbp', { decision: 'Approved', at: '2026-09-30T11:00:00.000Z' }), step(2, 'finance')],
    })
    const commentedHere = {
      ...exported,
      updatedAt: '2026-09-30T12:00:00.000Z',
      comments: [comment('C-9', '2026-09-30T12:00:00.000Z')],
    }
    const approvedThere: HcRequest = {
      ...exported,
      state: 'Approved',
      updatedAt: '2026-09-30T14:01:00.000Z',
      steps: [
        exported.steps[0],
        { ...exported.steps[1], decision: 'Approved', at: '2026-09-30T14:01:00.000Z' },
      ],
    }
    const r = mergeRequests([commentedHere], [[approvedThere]], { base: new Map() })
    expect(r.conflicts.map((c) => c.requestId)).toEqual(['R-2000'])
    expect(r.requests[0].comments.map((c) => c.id)).toEqual(['C-9'])
    expect(r.decided).toEqual([])
    // With nothing added here since the export, Finance's decision comes back and is listed as decided.
    const clean = mergeRequests([exported], [[approvedThere]], { base: new Map() })
    expect(clean).toMatchObject({ merged: 1, conflicts: [] })
    expect(clean.decided).toEqual([{ requestId: 'R-2000', before: exported, after: approvedThere }])
  })

  it('never takes a decision back with a later copy that is still pending', () => {
    const approved = req('R-1', '2026-09-05T09:00', { state: 'Approved' })
    const pending = req('R-1', '2026-09-06T09:00', { state: 'Submitted', priority: 1 })
    const r = mergeRequests([approved], [[pending]], { base: new Map() })
    expect(r.conflicts.map((c) => c.requestId)).toEqual(['R-1'])
    expect(r.requests[0]).toEqual(approved)
  })

  it('lists two requests under one ID as a clash: neither merged, neither dropped, no choice (IN-1)', () => {
    const a = req('R-1128', '2026-09-30T09:00:00.000Z', {
      requesterId: 'E10626',
      state: 'Draft',
      jobTitle: 'A',
    })
    const b = req('R-1128', '2026-09-30T11:00:00.000Z', {
      requesterId: 'E11050',
      state: 'Draft',
      jobTitle: 'B',
    })
    // Two files from two browsers, into a workspace that has neither.
    const both = mergeRequests([], [[a], [b]], { base: new Map() })
    expect(both.merged).toBe(0)
    expect(both.requests).toEqual([])
    expect(both.conflicts).toEqual([
      { requestId: 'R-1128', current: a, incoming: b, kind: 'clash', reason: ID_CLASH_TEXT },
    ])
    expect(both.preview).toBe('Merges no requests from 2 files; 1 request cannot merge')
    // A file whose R-1128 is another request than the workspace's own.
    const local = mergeRequests([b], [[a]], { base: new Map() })
    expect(local.requests).toEqual([b])
    expect(local.conflicts.map((c) => [c.kind, c.current.requesterId, c.incoming.requesterId])).toEqual([
      ['clash', 'E11050', 'E10626'],
    ])
    // The file's copy of the workspace's own request still merges beside the clash.
    const b2 = { ...b, updatedAt: '2026-09-30T12:00:00.000Z', jobTitle: 'B, edited' }
    const mixed = mergeRequests([b], [[a], [b2]], { base: new Map() })
    expect(mixed.requests).toEqual([b2])
    expect(mixed.merged).toBe(1)
    expect(mixed.conflicts.map((c) => c.kind)).toEqual(['clash'])
    // A clash has no choice: choosing either copy changes nothing.
    const chosen = chooseConflict(
      { requests: local.requests, base: local.base },
      local.conflicts[0],
      'incoming',
      T0,
    )
    expect(chosen).toEqual({ requests: [b], base: local.base, decided: null })
    expect(isChoosable(local.conflicts[0])).toBe(false)
  })

  it('compares updatedAt as a time: an offset at its instant, a stamp with no zone as UTC (IN-12)', () => {
    expect(stampMs('2026-10-02T11:00:00+02:00')).toBe(Date.UTC(2026, 9, 2, 9))
    expect(stampMs('2026-09-23T14:05')).toBe(Date.UTC(2026, 8, 23, 14, 5))
    expect(stampMs('2026-09-23')).toBe(Date.UTC(2026, 8, 23))
    expect(stampMs('')).toBe(Number.NEGATIVE_INFINITY)
    expect(stampMs('zzz')).toBe(Number.NEGATIVE_INFINITY)
    const mine = req('R-1', '2026-10-02T10:00:00.000Z', { state: 'In review' })
    const theirs = req('R-1', '2026-10-02T11:00:00+02:00', { state: 'Withdrawn' })
    const r = mergeRequests([mine], [[theirs]], { base: new Map() })
    expect(r.merged).toBe(0)
    expect(r.requests[0]).toEqual(mine)
    // The same instant in two spellings with different content is a conflict, never a win.
    const same = mergeRequests(
      [req('R-1', '2026-09-23T14:05')],
      [[req('R-1', '2026-09-23T14:05:00.000Z', { priority: 3 })]],
      { base: new Map() },
    )
    expect(same.conflicts).toHaveLength(1)
  })

  it('lists a decision that cannot take effect here, naming why, and changes nothing (D-MERGE)', () => {
    const pending = req('R-1', '2026-09-05T09:00', { state: 'In review' })
    const approved = req('R-1', '2026-09-06T09:00', { state: 'Approved' })
    const refusal = (r: HcRequest) => (r.requestId === 'R-1' ? 'Seat P-9 is already filled here.' : null)
    const r = mergeRequests([pending], [[approved, req('R-2', T0, { state: 'Approved' })]], {
      base: new Map(),
      effectRefusal: refusal,
    })
    expect(r.requests[0]).toEqual(pending)
    expect(r.conflicts).toEqual([
      {
        requestId: 'R-1',
        current: pending,
        incoming: approved,
        kind: 'effect',
        reason: 'Seat P-9 is already filled here.',
      },
    ])
    expect(r.merged).toBe(1)
    expect(r.decided.map((d) => [d.requestId, d.before])).toEqual([['R-2', null]])
    expect(r.preview).toBe('Merges 1 request from 1 file; 1 request cannot merge')
    expect(r.summary).toBe('Merged 1 request from 1 file, no conflicts')
  })

  it('previews in the future tense and says "Merged" only after (UI-11)', () => {
    expect(mergePreviewText(14, 6, 2)).toBe('Merges 14 requests from 6 files; 2 conflicts to choose')
    expect(mergePreviewText(1, 1, 1)).toBe('Merges 1 request from 1 file; 1 conflict to choose')
    expect(mergePreviewText(0, 1, 0)).toBe('Merges no requests from 1 file; no conflicts')
    expect(mergePreviewText(2, 2, 1, 1)).toBe(
      'Merges 2 requests from 2 files; 1 conflict to choose; 1 request cannot merge',
    )
  })
})

describe('chooseConflict', () => {
  const current = [req('R-1', '2026-09-10T09:00', { state: 'In review' })]
  const base = mergeBaseMap([{ requestId: 'R-1', updatedAt: T0 }])
  const file = [req('R-1', '2026-09-07T09:00', { state: 'Withdrawn' })]
  const first = mergeRequests(current, [file], { base })

  it("keeps the workspace's copy, stamped now, so the same file does not undo the choice", () => {
    const chosen = chooseConflict(first, first.conflicts[0], 'current', '2026-10-13T10:00')
    // Its revision is stamped (M3 recheck); its business time, which idle expiry reads, stays.
    expect(chosen.requests[0]).toMatchObject({
      state: 'In review',
      revisedAt: '2026-10-13T10:00',
      updatedAt: first.conflicts[0].current.updatedAt,
    })
    const again = mergeRequests(chosen.requests, [file], { base: mergeBaseMap(chosen.base) })
    expect(again.conflicts).toEqual([])
    expect(again.requests[0].state).toBe('In review')
  })

  it("keeps the workspace's copy, then an edit here and the same file again give no conflict", () => {
    const chosen = chooseConflict(first, first.conflicts[0], 'current', '2026-10-13T10:00')
    const edited = [{ ...chosen.requests[0], updatedAt: '2026-10-14T10:00', state: 'Approved' as const }]
    const again = mergeRequests(edited, [file], { base: mergeBaseMap(chosen.base) })
    expect(again).toMatchObject({ merged: 0, conflicts: [] })
    expect(again.requests[0]).toMatchObject({ state: 'Approved', updatedAt: '2026-10-14T10:00' })
  })

  it("takes the file's copy, and the same file then changes nothing", () => {
    const chosen = chooseConflict(first, first.conflicts[0], 'incoming', '2026-10-13T10:00')
    expect(chosen.requests[0]).toEqual(file[0])
    const again = mergeRequests(chosen.requests, [file], { base: mergeBaseMap(chosen.base) })
    expect(again).toMatchObject({ merged: 0, conflicts: [] })
  })
})

describe('mergePlanState', () => {
  const working = (fy: 'FY27' | 'FY28', id: string): WorkingVersion => ({
    versionId: id,
    name: `${fy} Working`,
    kind: 'working',
    fiscalYear: fy,
    grid: { from: fy === 'FY27' ? '2026-04' : '2027-04', to: fy === 'FY27' ? '2027-03' : '2028-03' },
    proration: 'daily',
    state: 'working',
    createdAt: T0,
    lockedAt: null,
    lockedBy: null,
    engineVersion: 'hcp-engine-1',
    parentId: null,
    hash: null,
  })
  const locked = (id: string, kind: 'budget' | 'reforecast', hash: string): LockedVersion =>
    ({
      ...working('FY27', id),
      name: kind === 'budget' ? 'FY27 Budget' : 'FY27 Q2 Reforecast',
      kind,
      state: 'locked',
      lockedAt: T0,
      lockedBy: 'E1',
      hash,
      lines: {} as LockedVersion['lines'],
      assumptions: [],
      rates: [],
      forecast: null,
    }) as LockedVersion
  const state = (over: Partial<PlanState> = {}): PlanState => ({
    v: 1,
    baselineId: 'sample',
    versions: [working('FY27', 'fy27-working'), locked('fy27-budget', 'budget', 'sha256-a')],
    closes: [],
    adjustments: [],
    overlay: { positions: [], targets: [], freezes: [], assumptions: [] },
    requests: [],
    cycles: [],
    reviewed: [],
    mergeBase: [],
    auditHead: { seq: 4, hash: 'sha256-head' },
    ...over,
  })

  it('adds new versions, keeps one Working a year, and refuses a locked version that differs', () => {
    const incoming = state({
      versions: [
        working('FY27', 'fy27-working-2'),
        working('FY28', 'fy28-working'),
        locked('fy27-budget', 'budget', 'sha256-a'),
        locked('fy27-q2', 'reforecast', 'sha256-q2'),
      ],
    })
    const merged = mergePlanState(state(), incoming, { base: new Map() })
    expect(merged.versions.map((v) => v.versionId)).toEqual([
      'fy27-working',
      'fy27-budget',
      'fy28-working',
      'fy27-q2',
    ])
    expect(() =>
      mergePlanState(state(), state({ versions: [locked('fy27-budget-x', 'budget', 'sha256-b')] }), {
        base: new Map(),
      }),
    ).toThrow(hashMismatchText('FY27 Budget'))
  })

  it('takes overlay rows by row key, the incoming row winning, and adds closes and cycles when new', () => {
    const p1 = positionRow('P-1', { effectiveDate: '2026-10-01', status: 'Planned' })
    const p1b = positionRow('P-1', { effectiveDate: '2026-10-01', status: 'On hold' })
    const p2 = positionRow('P-2', { effectiveDate: '2026-10-01' })
    const close = (month: '2026-04' | '2026-05', hash: string) =>
      ({ month, closedAt: T0, by: 'E1', hash }) as unknown as PlanState['closes'][number]
    const merged = mergePlanState(
      state({
        overlay: { positions: [p1], targets: [], freezes: [], assumptions: [] },
        closes: [close('2026-04', 'a')],
      }),
      state({
        overlay: {
          positions: [p1b, p2],
          targets: [{ fiscalYear: 'FY27', businessUnit: 'Operations', targetHeads: 10 }],
          freezes: [],
          assumptions: [],
        },
        closes: [close('2026-04', 'other'), close('2026-05', 'b')],
        requests: [req('R-1')],
        auditHead: { seq: 99, hash: 'sha256-theirs' },
      }),
      { base: new Map() },
    )
    expect(merged.overlay.positions).toEqual([p1b, p2])
    expect(merged.overlay.targets).toHaveLength(1)
    expect(merged.closes.map((c) => [c.month, c.hash])).toEqual([
      ['2026-04', 'a'],
      ['2026-05', 'b'],
    ])
    expect(merged.requests).toEqual([req('R-1')])
    expect(merged.mergeBase).toEqual([{ requestId: 'R-1', updatedAt: T0 }])
    expect(merged.auditHead).toEqual({ seq: 4, hash: 'sha256-head' })
    expect(merged.baselineId).toBe('sample')
  })

  it("carries Remove override's removals from both sides, the incoming side winning by row key (M3 recheck)", () => {
    const row = (org: string, value: number) =>
      ({ version: 'fy27-working', table: 'attrition', org, key: '*', value }) as const
    const empty = { positions: [], targets: [], freezes: [] }
    // This workspace took back Operations' override; the file knows nothing of it: it stays removed.
    const kept = mergePlanState(
      state({ overlay: { ...empty, assumptions: [], removedAssumptions: [row('Operations', 0.14)] } }),
      state(),
      { base: new Map() },
    )
    expect(kept.overlay.removedAssumptions).toEqual([row('Operations', 0.14)])
    // The file set Operations' value again: that takes the removal back, as setting it here does.
    const setAgain = mergePlanState(
      state({ overlay: { ...empty, assumptions: [], removedAssumptions: [row('Operations', 0.14)] } }),
      state({ overlay: { ...empty, assumptions: [row('Operations', 0.12)] } }),
      { base: new Map() },
    )
    expect(setAgain.overlay.removedAssumptions ?? []).toEqual([])
    expect(setAgain.overlay.assumptions).toEqual([row('Operations', 0.12)])
    // The file took back Corporate's override, which this workspace had set: the file's removal wins.
    const theirs = mergePlanState(
      state({ overlay: { ...empty, assumptions: [row('Corporate', 0.2)] } }),
      state({ overlay: { ...empty, assumptions: [], removedAssumptions: [row('Corporate', 0.2)] } }),
      { base: new Map() },
    )
    expect(theirs.overlay.assumptions).toEqual([])
    expect(theirs.overlay.removedAssumptions).toEqual([row('Corporate', 0.2)])
  })

  it('keeps another freeze that carries one of this workspace’s freeze IDs, under a new ID (M3 recheck)', () => {
    const freeze = (businessUnit: string, reason: string) => ({
      freezeId: 'FRZ-002',
      businessUnit,
      startDate: '2026-10-01',
      endDate: null,
      allowBackfill: true,
      reason,
    })
    const mine = freeze('Silicon Engineering', 'Hold while the FY28 plan is set')
    const other = freeze('Go-to-Market', 'Hold for the reorg')
    expect(freezeClashes([mine], [other])).toEqual([{ from: 'FRZ-002', to: 'FRZ-002-2' }])
    const withException = { ...req('R-9'), exception: { freezeId: 'FRZ-002', reason: 'The launch needs it' } }
    const merged = mergePlanState(
      state({ overlay: { positions: [], targets: [], freezes: [mine], assumptions: [] } }),
      state({
        overlay: { positions: [], targets: [], freezes: [other], assumptions: [] },
        requests: [withException],
      }),
      { base: new Map() },
    )
    expect(merged.overlay.freezes.map((f) => `${f.freezeId} ${f.businessUnit}`)).toEqual([
      'FRZ-002 Silicon Engineering',
      'FRZ-002-2 Go-to-Market',
    ])
    // The file's freeze exception follows its freeze.
    expect(merged.requests.find((r) => r.requestId === 'R-9')?.exception?.freezeId).toBe('FRZ-002-2')
    // The same org and start is the same freeze, edited: merged by its ID as before.
    const edited = { ...mine, endDate: '2027-03-31' }
    expect(freezeClashes([mine], [edited])).toEqual([])
    expect(
      mergePlanState(
        state({ overlay: { positions: [], targets: [], freezes: [mine], assumptions: [] } }),
        state({ overlay: { positions: [], targets: [], freezes: [edited], assumptions: [] } }),
        { base: new Map() },
      ).overlay.freezes,
    ).toEqual([edited])
  })
})

describe('mergeRequests: the M3 recheck', () => {
  it('compares wall-clock revisions, so a later change with an earlier business time comes back (R47)', () => {
    // The HRBP's browser on 24 Oct at 15:03 (business time the as-of date at 15:03); Finance approves
    // in its own browser on 25 Oct at 09:01 (the same as-of date, so 09:01).
    const here = req('R-1', '2026-09-30T15:03:00.000Z', {
      state: 'In review',
      revisedAt: '2026-10-24T15:03:00.000Z',
    })
    const fin = req('R-1', '2026-09-30T09:01:00.000Z', {
      state: 'Approved',
      revisedAt: '2026-10-25T09:01:00.000Z',
    })
    expect(revisionOf(fin)).toBe('2026-10-25T09:01:00.000Z')
    expect(revisionOf(req('R-2'))).toBe(T0)
    const out = mergeRequests([here], [[fin]], { base: new Map() })
    expect(out).toMatchObject({ merged: 1, conflicts: [] })
    expect(out.requests[0].state).toBe('Approved')
    expect(out.base).toEqual([{ requestId: 'R-1', updatedAt: '2026-10-25T09:01:00.000Z' }])
    // A manager's next-day withdrawal over the copy the HRBP imported the day before.
    const monday = req('R-3', '2026-09-30T15:01:00.000Z', {
      state: 'Submitted',
      revisedAt: '2026-10-26T15:01:00.000Z',
    })
    const tuesday = req('R-3', '2026-09-30T09:01:00.000Z', {
      state: 'Withdrawn',
      revisedAt: '2026-10-27T09:01:00.000Z',
    })
    const again = mergeRequests([monday], [[tuesday]], {
      base: mergeBaseMap([{ requestId: 'R-3', updatedAt: revisionOf(monday) }]),
    })
    expect(again).toMatchObject({ merged: 1, conflicts: [] })
    expect(again.requests[0].state).toBe('Withdrawn')
  })

  it('lists two diverged file copies as one conflict in one import, in either order (M3 recheck)', () => {
    const steps = (finance: 'Approved' | null) => [
      {
        n: 1,
        role: 'hrbp' as const,
        approverId: 'E1',
        reasons: [],
        enteredAt: T0,
        decision: 'Approved' as const,
        at: T0,
        note: null,
      },
      {
        n: 2,
        role: 'finance' as const,
        approverId: 'E2',
        reasons: [],
        enteredAt: T0,
        decision: finance,
        at: finance ? T0 : null,
        note: null,
      },
    ]
    const hrbp = req('R-1', '2026-09-30T09:04', {
      state: 'In review',
      revisedAt: '2026-10-24T09:04:00.000Z',
      steps: steps(null) as never,
      comments: [
        {
          id: 'R-1-c1',
          at: T0,
          by: 'E1',
          mode: 'hrbp',
          text: 'Please plan the start for January.',
          audience: 'everyone',
        },
      ],
    })
    const finance = req('R-1', '2026-09-30T13:01', {
      state: 'Approved',
      revisedAt: '2026-10-24T13:01:00.000Z',
      steps: steps('Approved') as never,
    })
    for (const files of [
      [[hrbp], [finance]],
      [[finance], [hrbp]],
    ]) {
      const out = mergeRequests([], files, { base: new Map() })
      expect(out.merged).toBe(0)
      expect(out.conflicts).toHaveLength(1)
      expect(out.conflicts[0]).toMatchObject({
        requestId: 'R-1',
        kind: 'changed',
        incoming: finance,
        current: hrbp,
      })
      expect(out.requests).toEqual([])
    }
    // One file at a time gives the same conflict.
    const first = mergeRequests([], [[hrbp]], { base: new Map() })
    const second = mergeRequests(first.requests, [[finance]], { base: mergeBaseMap(first.base) })
    expect(second.conflicts.map((c) => c.requestId)).toEqual(['R-1'])
  })

  it('reads two copies of one ID minted at different times as two requests (a restored workspace)', () => {
    const sent = req('R-WWWW-2577', T0, { createdAt: '2026-10-24T10:30:00.000Z', jobTitle: 'Staff engineer' })
    const again = req('R-WWWW-2577', '2026-09-02T09:00', {
      createdAt: '2026-10-24T12:00:00.000Z',
      jobTitle: 'Coordinator',
    })
    const out = mergeRequests([sent], [[again]], { base: new Map() })
    expect(out.merged).toBe(0)
    expect(out.conflicts).toEqual([
      { requestId: 'R-WWWW-2577', current: sent, incoming: again, kind: 'clash', reason: ID_CLASH_TEXT },
    ])
    expect(out.requests).toEqual([sent])
    // The same request, created once, merges by its revision as before.
    const later = { ...sent, updatedAt: '2026-09-03T09:00', state: 'Withdrawn' as const }
    expect(mergeRequests([sent], [[later]], { base: new Map() }).merged).toBe(1)
  })
})
