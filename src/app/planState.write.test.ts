/**
 * What a write saves (docs/PLAN.md 5.4; M3): `storedFor(next, sample)` keeps only what differs from
 * the sample's own plan, as an overlay against its baseline, so laying it over the sample again
 * (`planInForce`) gives `next` back; with your own data it is `next` itself. `reloadPlan` reads the
 * store into `usePlan`.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Sample } from '@/data/sample'
import { MemoryStore } from '@/plan/store/memoryStore'
import type { Cycle, HcRequest, PlanState, WorkingVersion } from '@/plan/types'
import { leakSample, requestOf } from '@/testkit/sample'
import { isEmptyState, planInForce, reloadPlan, storedFor, usePlan } from './planState'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

describe('storedFor', () => {
  it('stores nothing of the sample when nothing changed, and planInForce gives the sample back', () => {
    const stored = storedFor(s.plan, s.plan)
    expect(isEmptyState(stored)).toBe(false)
    expect(stored).toMatchObject({ versions: [], closes: [], requests: [], cycles: [], reviewed: [] })
    expect(planInForce(stored, s.plan)).toEqual(s.plan)
  })

  it('stores the changed and new records only, and planInForce lays them over the sample as they were', () => {
    const req: HcRequest = { ...requestOf(s, 'R-1040'), state: 'Approved' }
    const cycle: Cycle = { ...s.plan.cycles[0], stage: 'HRBP review' }
    const working = s.plan.versions.find((v) => v.versionId === 'fy28-working') as WorkingVersion
    const retired: WorkingVersion = {
      ...working,
      name: 'FY28 Working (replaced 1 Oct 2026)',
      state: 'retired',
    }
    const next: PlanState = {
      ...s.plan,
      versions: s.plan.versions.map((v) => (v === working ? retired : v)),
      requests: [req],
      cycles: [cycle],
      overlay: {
        ...s.plan.overlay,
        positions: [{ ...s.datasets.positions[0], effectiveDate: '2026-10-01', status: 'On hold' }],
      },
      auditHead: { seq: 3, hash: 'sha256-x' },
    }
    const stored = storedFor(next, s.plan)
    expect(stored.baselineId).toBe(s.plan.baselineId)
    expect(stored.versions.map((v) => v.versionId)).toEqual(['fy28-working'])
    expect(stored.closes).toEqual([])
    expect(stored.requests).toEqual([req])
    expect(stored.cycles).toEqual([cycle])
    expect(planInForce(stored, s.plan)).toEqual(next)
  })

  it('is the next state itself with your own data', () => {
    const next = { ...s.plan, baselineId: null }
    expect(storedFor(next, null)).toBe(next)
  })
})

describe('reloadPlan', () => {
  it('reads the store into usePlan', async () => {
    const store = new MemoryStore({ initial: storedFor(s.plan, s.plan) })
    await store.appendAudit({
      at: '2026-09-30T10:00:00.000Z',
      by: 'E1',
      byName: 'A',
      mode: 'hr-admin',
      object: 'workspace',
      id: 'x',
      field: 'note',
      old: null,
      new: 1,
      effectiveDate: null,
      comment: null,
      commentAudience: null,
    })
    await reloadPlan(store)
    const st = usePlan.getState()
    expect(st.ready).toBe(true)
    expect(st.audit.map((e) => e.seq)).toEqual([1])
    expect(st.stored?.auditHead?.seq).toBe(1)
  })
})
