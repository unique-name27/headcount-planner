/**
 * The six managers' request files (docs/PLAN.md 5.5, 13.5, 16.2): kind 'requests' workspace files
 * made in Manager mode that read back with their checksums, hold only the managers' own requests and
 * no amounts, hold exactly what the access layer's `requestView` shows each manager in full (the
 * Export requests rule, PLAN 5.5), and merge over the sample (with the merge base its plan state
 * carries) as "Merged 14 requests from 6 files, 2 conflicts". workspace/mergeRequests.test.ts (the workspace builder's)
 * covers the Leader-mode rules on the same files.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { requestView, viewerOf } from '@/access/visibility'
import { fromRow } from '@/plan/engine/requests'
import type { HcRequest, LockedVersionRef } from '@/plan/types'
import { mergeBaseMap, mergeRequests } from '@/plan/workspace/merge'
import { readWorkspace, requestsOf } from '@/plan/workspace/validate'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { ctxAs } from '@/testkit/sample'
import { generateSample, type Sample } from '../generate'
import { type ExportRule, MERGE_SUMMARY, type RequestFiles, sampleMergeBase, sampleRequestFiles } from '.'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let sample: Sample
let files: RequestFiles
let refs: LockedVersionRef[]

beforeAll(() => {
  sample = generateSample()
  refs = [sample.locks.budget, sample.locks.q1].map((v) => ({
    versionId: v.versionId,
    name: v.name,
    kind: v.kind,
    fiscalYear: v.fiscalYear,
    state: v.state,
    hash: v.hash,
  }))
  files = sampleRequestFiles(
    {
      datasets: sample.datasets,
      personas: sample.personas,
      planted: sample.planted,
      tradeRequestId: sample.story.tradeRequestId,
    },
    refs,
  )
}, 120_000)

const incoming = (): HcRequest[][] =>
  files.texts.map((text) => {
    const read = readWorkspace(text, text.length, refs)
    if (!read.ok) throw new Error(read.reason)
    const r = requestsOf(read.file)
    if (!r.ok) throw new Error(r.reason)
    return r.requests
  })

describe('the managers request files', () => {
  it('are six Requests files made in Manager mode by six managers, each holding only their own requests', () => {
    expect(files.files).toHaveLength(6)
    const owners = new Set<string>()
    for (const [i, f] of files.files.entries()) {
      expect([f.kind, f.mode, f.app, f.body.plan.kind]).toEqual([
        'requests',
        'manager',
        'Headcount Planner',
        'requests',
      ])
      expect(f.scopeLabel.endsWith("'s team")).toBe(true)
      const reqs = (f.body.plan as { requests: readonly HcRequest[] }).requests
      const requesters = new Set(reqs.map((q) => q.requesterId))
      expect(requesters.size, `file ${i}`).toBe(1)
      owners.add([...requesters][0])
      expect(files.drafts[i].length).toBeGreaterThan(0)
    }
    expect(owners.size).toBe(6)
    const manager = sample.personas.filter((p) => p.key === 'manager-a' || p.key === 'manager-b')
    for (const p of manager) expect(owners).toContain(p.employeeId)
  })

  it('hold exactly the requests requestView shows each manager in full, in Manager mode', () => {
    const input = {
      datasets: sample.datasets,
      personas: sample.personas,
      planted: sample.planted,
      tradeRequestId: sample.story.tradeRequestId,
    }
    const viewers = new Map<string, ReturnType<typeof viewerOf>>()
    const full: ExportRule = (req, managerId) => {
      let v = viewers.get(managerId)
      if (!v) {
        v = viewerOf(ctxAs('manager', managerId, { sample }))
        viewers.set(managerId, v)
      }
      return requestView(req, v) === 'full'
    }
    const viaAccess = sampleRequestFiles(input, refs, full)
    expect(viewers.size).toBe(6)
    expect(viaAccess.texts).toEqual(files.texts)
  })

  it('read back with their checksums and hold no amounts', () => {
    for (const text of files.texts) {
      const read = readWorkspace(text, text.length, refs)
      expect(read.ok).toBe(true)
      expect(text).not.toMatch(/[$€₹₪₫]|NT\$|\bUSD\b|\bEUR\b|\bINR\b/)
      expect(text).not.toMatch(/"(baseSalary|offerBase|onLeave|leavePaid|usd|local)"/)
    }
  })

  it('merge over the sample as "Merged 14 requests from 6 files, 2 conflicts"', () => {
    const current = sample.datasets.requests.map(fromRow)
    const base = mergeBaseMap(sample.plan.mergeBase)
    const result = mergeRequests(current, incoming(), { base })
    expect(result.summary).toBe(MERGE_SUMMARY)
    expect([result.merged, result.files, result.conflicts.length]).toEqual([14, 6, 2])
    expect(result.conflicts.map((c) => c.requestId).sort()).toEqual(
      [sample.story.tradeRequestId, sample.planted.crossUnitMove].sort(),
    )
    // Both copies changed since the last import: the workspace's has a later step, the manager's a comment.
    for (const c of result.conflicts) {
      const was = base.get(c.requestId)!
      expect(c.current.updatedAt).not.toBe(was)
      expect(c.incoming.updatedAt).not.toBe(was)
      expect(c.incoming.comments).toHaveLength(1)
      expect(c.current.comments).toHaveLength(0)
    }
    // Every draft is new to the workspace and merged; the commented requests take the later copy.
    const after = new Map(result.requests.map((q) => [q.requestId, q]))
    for (const id of files.drafts.flat()) expect(after.get(id)?.state).toBe('Draft')
    expect(files.drafts.flat()).toHaveLength(11)
    const commented = result.requests.filter((q) => q.comments.length > 0)
    expect(commented).toHaveLength(3)
    for (const q of commented) {
      const mine = current.find((x) => x.requestId === q.requestId)!
      expect(q.updatedAt > mine.updatedAt).toBe(true)
    }
    // Merging the same files again changes nothing more but the two conflicts.
    const again = mergeRequests(result.requests, incoming(), { base: mergeBaseMap(result.base) })
    expect([again.merged, again.conflicts.length]).toEqual([0, 2])
  })

  it('carries the merge base of the last import (15 Sep 2026) in the sample plan state', () => {
    const input = {
      datasets: sample.datasets,
      personas: sample.personas,
      planted: sample.planted,
      tradeRequestId: sample.story.tradeRequestId,
    }
    expect(sample.plan.mergeBase).toEqual(sampleMergeBase(input))
    for (const b of sample.plan.mergeBase) expect(b.updatedAt <= '2026-09-15T23:59').toBe(true)
  })
})
