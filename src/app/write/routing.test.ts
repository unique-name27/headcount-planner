/**
 * Routing over the analytics context (docs/PLAN.md 7.2 rule 8, 8.4 rule 8, 10.2, 11.4; M3): the
 * write path's guarded asks agree with the sample's own routing (src/data/sample/routing.ts, the
 * generator's) on story 9: Systems & Software's FY27 target of 389 heads and $59,984,668.88 against
 * guarded asks of 381 heads and $57,100,000 before the trade, the trade's effect +5 heads and
 * −$74,386.23, and the stored chain manager, HRBP, leader ('band-estimate-over-threshold'). Routing is
 * the same in every mode, and leaves out what 8.4 rule 3 hides from the requester.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { Sample } from '@/data/sample'
import { requestsOf } from '@/drill/seats'
import { chainFor } from '@/plan/engine/chain'
import type { HcRequest } from '@/plan/types'
import { leakSample, personaOf, sampleCtx } from '@/testkit/sample'
import { chainContextOf, guardedAsksOf, hiddenFromRequester } from './routing'

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const cents = (x: number): number => Math.round(x * 100)

describe('story 9’s routing through the write path', () => {
  it('agrees with the sample’s routing: target, guarded asks, effect and chain', () => {
    const ctx = sampleCtx('hr-admin')
    const req = requestsOf(ctx).find((r) => r.requestId === s.story.tradeRequestId) as HcRequest
    const chain = chainContextOf(ctx, req)
    expect(chain.facts.checks).toHaveLength(1)
    const c = chain.facts.checks[0]
    expect(c.target).toEqual({ heads: 389, cost: 59_984_668.88 })
    expect(c.asks).toEqual({ heads: 381, cost: 57_100_000 })
    expect(c.effect.heads).toBe(5)
    expect(cents(c.effect.cost)).toBe(cents(-74_386.23))
    const steps = chainFor(req, chain)
    expect(steps.map((x) => [x.role, x.approverId])).toEqual(req.steps.map((x) => [x.role, x.approverId]))
    expect(steps[2].reasons).toEqual(['band-estimate-over-threshold'])
  })

  it('is the same in every mode (routing is mode-independent)', () => {
    const facts = (['manager', 'hrbp', 'leader', 'finance', 'hr-admin'] as const).map((mode) => {
      const ctx = sampleCtx(mode)
      const req = requestsOf(ctx).find((r) => r.requestId === s.story.tradeRequestId)
      if (!req) {
        const admin = sampleCtx('hr-admin')
        return chainContextOf(
          ctx,
          requestsOf(admin).find((r) => r.requestId === s.story.tradeRequestId) as HcRequest,
        ).facts
      }
      return chainContextOf(ctx, req).facts
    })
    for (const f of facts) expect(f).toEqual(facts[0])
  })

  it('agrees with guardedAsksOf on the unit org, with the trade left out', () => {
    const ctx = sampleCtx('hr-admin')
    const g = guardedAsksOf(ctx, {
      org: (place) => place.businessUnit === 'Systems & Software',
      fiscalYear: 'FY27',
      targetDate: '2027-03-31',
      without: new Set([s.story.tradeRequestId]),
    })
    expect(g).toEqual({ heads: 381, cost: 57_100_000 })
  })
})

describe('what routing leaves out (8.4 rule 8)', () => {
  it('hides the Elimination of Manager C’s seat from C and from the manager below C, and from no one else', () => {
    const ctx = sampleCtx('hr-admin')
    const c = personaOf(s, 'manager-c')
    const elim = s.planted.managerCElimination
    const base = requestsOf(ctx).find((r) => r.requestId === s.story.tradeRequestId) as HcRequest
    expect(hiddenFromRequester(ctx, { ...base, requesterId: c.employeeId }).has(elim)).toBe(true)
    const below = s.datasets.workers.find((w) => {
      const seat = s.datasets.positions.find((p) => p.positionId === w.positionId)
      return seat?.managerPositionId === c.positionId && !w.assignmentEnd && w.workerType === 'Employee'
    })?.employeeId as string
    expect(hiddenFromRequester(ctx, { ...base, requesterId: below }).has(elim)).toBe(true)
    expect(
      hiddenFromRequester(ctx, { ...base, requesterId: personaOf(s, 'manager-a').employeeId }).has(elim),
    ).toBe(false)
  })
})
