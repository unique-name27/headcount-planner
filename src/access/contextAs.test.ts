/**
 * `contextAs` (docs/PLAN.md 5.5 "Export for a manager", C30; M3): the same data in another mode and
 * Acting as person, built exactly as that mode's own context (scope, label, picks, datasets in scope),
 * the reporting date and plan state carried over, memoized per context.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Sample } from '@/data/sample'
import { leakSample, personaOf, pickOf, picksWith, sampleCtx } from '@/testkit/sample'
import { contextAs } from './contextAs'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

describe('contextAs', () => {
  it('builds Manager mode acting as Manager C from an HRBP’s context, as Manager mode builds it', () => {
    const c = personaOf(s, 'manager-c')
    const picks = picksWith(s, 'manager', pickOf(c))
    const hrbp = sampleCtx('hrbp')
    const as = contextAs(hrbp, { mode: 'manager', picks })
    const own = sampleCtx('manager', { picks })
    expect(as.mode).toBe('manager')
    expect(as.access.actingAs).toEqual(own.access.actingAs)
    expect(as.scopeLabel).toBe(own.scopeLabel)
    expect(as.asOf).toBe(hrbp.asOf)
    expect(as.plan).toBe(hrbp.plan)
    expect(as.data.positions.map((r) => r.positionId)).toEqual(own.data.positions.map((r) => r.positionId))
    expect(as.data.requests.map((r) => r.requestId)).toEqual(own.data.requests.map((r) => r.requestId))
    expect(as.access.scope?.kind).toBe('tree')
    // The same inputs give the same context.
    expect(contextAs(hrbp, { mode: 'manager', picks })).toBe(as)
  })

  it('keeps an HR admin reporting date, and with no picks holds nobody (writes blocked)', () => {
    const admin = sampleCtx('hr-admin', { asOfOverride: '2026-08-31' })
    const as = contextAs(admin, { mode: 'manager' })
    expect(as.asOf).toBe('2026-08-31')
    expect(as.access.actingAs).toBeNull()
    expect(as.access.unset).toBe(true)
  })
})
