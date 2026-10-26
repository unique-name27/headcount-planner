/**
 * The plan state the app shows (docs/PLAN.md 5.4): the sample's plan as the baseline, a stored
 * overlay for the same baseline laid over it, anything else set aside; and the start-up read with
 * its 1,500 ms race.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { generateSample, type Sample } from '@/data/sample'
import { emptyPlanState, MemoryStore } from '@/plan/store/memoryStore'
import type { AuditEntry, PlanState } from '@/plan/types'
import { auditInForce, isEmptyState, overlaySample, planInForce, startPlan, usePlan } from './planState'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))

let sample: Sample
let base: PlanState

beforeAll(() => {
  sample = generateSample()
  base = sample.plan
}, 60_000)

const AUDIT = [{ seq: 1 }] as unknown as AuditEntry[]

describe('the plan in force', () => {
  it('is the sample plan on the sample when nothing is stored', () => {
    expect(isEmptyState(emptyPlanState())).toBe(true)
    expect(planInForce(null, base)).toBe(base)
    expect(planInForce(emptyPlanState(), base)).toBe(base)
    expect(base.versions.map((v) => v.name)).toEqual(
      expect.arrayContaining(['FY27 Budget', 'FY27 Q1 Reforecast', 'FY27 Working', 'FY28 Working']),
    )
  })

  it('sets aside a stored state made for another baseline', () => {
    const other: PlanState = {
      ...emptyPlanState('northgate-older'),
      reviewed: [{ exceptionId: 'x', at: '2026-10-01T00:00:00Z', by: 'E1' }],
    }
    expect(planInForce(other, base)).toBe(base)
    expect(auditInForce(other, AUDIT, base)).toEqual([])
  })

  it('lays a stored overlay for this baseline over the sample: stored copies win, new ones join', () => {
    const cycle = base.cycles[0]
    const stored: PlanState = {
      ...emptyPlanState(base.baselineId),
      cycles: [{ ...cycle, stage: 'HRBP review' }],
      reviewed: [{ exceptionId: 'not-in-plan:E1', at: '2026-10-02T00:00:00Z', by: 'E1' }],
      auditHead: { seq: 1, hash: 'sha256-x' },
    }
    const plan = planInForce(stored, base)
    expect(plan).not.toBe(base)
    expect(plan.baselineId).toBe(base.baselineId)
    expect(plan.versions).toBe(base.versions)
    expect(plan.closes).toBe(base.closes)
    expect(plan.cycles).toHaveLength(base.cycles.length)
    expect(plan.cycles[0].stage).toBe('HRBP review')
    expect(plan.reviewed.map((r) => r.exceptionId)).toEqual(['not-in-plan:E1'])
    expect(plan.auditHead).toEqual({ seq: 1, hash: 'sha256-x' })
    expect(plan.mergeBase).toBe(base.mergeBase)
    // The same inputs give the same object, so the context is not rebuilt for nothing.
    expect(planInForce(stored, base)).toBe(plan)
    expect(overlaySample(base, stored)).toEqual(plan)
    expect(auditInForce(stored, AUDIT, base)).toBe(AUDIT)
  })

  it('with your own data, is the stored state, never a sample overlay', () => {
    const own: PlanState = { ...emptyPlanState(null), reviewed: [{ exceptionId: 'a', at: 'x', by: 'y' }] }
    expect(planInForce(own, null)).toBe(own)
    const overlay = { ...emptyPlanState(base.baselineId), reviewed: own.reviewed }
    expect(isEmptyState(planInForce(overlay, null))).toBe(true)
    expect(auditInForce(overlay, AUDIT, null)).toEqual([])
    expect(isEmptyState(planInForce(null, null))).toBe(true)
  })
})

describe('reading the PlanStore', () => {
  it('reads plan state and the audit log once, then is ready', async () => {
    const stored = { ...emptyPlanState(base.baselineId), auditHead: null }
    const store = new MemoryStore({ initial: stored })
    await startPlan(store)
    const s = usePlan.getState()
    expect(s.ready).toBe(true)
    expect(s.storageUnavailable).toBe(false)
    expect(s.stored).toEqual(stored)
    expect(s.audit).toEqual([])
  })

  it('runs on the sample plan when storage does not answer in time', async () => {
    const stalled = {
      load: () => new Promise<PlanState>(() => undefined),
      listAudit: () => new Promise<readonly AuditEntry[]>(() => undefined),
    }
    await startPlan(stalled, { timeoutMs: 20 })
    const s = usePlan.getState()
    expect(s).toMatchObject({ ready: true, stored: null, storageUnavailable: true })
    expect(planInForce(s.stored, base)).toBe(base)
  })

  it('treats a store that refuses like one that stalls', async () => {
    const refusing = {
      load: () => Promise.reject(new Error('The plan saved in this browser comes from a newer version.')),
      listAudit: () => Promise.resolve([] as AuditEntry[]),
    }
    await startPlan(refusing, { timeoutMs: 50 })
    expect(usePlan.getState()).toMatchObject({ ready: true, stored: null, storageUnavailable: true })
  })
})
