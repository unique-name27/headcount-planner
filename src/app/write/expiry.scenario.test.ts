/**
 * Expiry in the write path's readers (lead decision D-EXPIRY; review SC-3, SP-4): a Sent back
 * request idle for 60 days at the as-of date is not pending, so it is no ask in routing's guarded
 * asks, holds no seat (`pendingRequestId`) and a trade's quote reads it as Expired (its give seats
 * and credit free). Expired is derived through the engine's one helper, never stored.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sample } from '@/data/sample'
import { effectiveRequestsOf } from '@/drill/seats'
import { requestIdInText } from '@/plan/actions/requestIds'
import { creditBalance } from '@/plan/engine/trade'
import type { HcRequest } from '@/plan/types'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, personaOf, pinClock, sampleCtx, unpinClock } from '@/testkit/sample'
import { requestsModel } from '@/views/requests/engine'
import { actionEnvOf } from './context'
import { effectiveRequests } from './expiry'
import { quoteRequests } from './quote'
import { guardedAsksOf } from './routing'
import { deciderOf, said, scenario, type Who } from './scenario.testkit'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

const LATER = '2026-12-15'

describe('one effective list (D-EXPIRY, M3 verify)', () => {
  it('the write path reads the very array the lists read, with or without a plan state', () => {
    const draft = s.datasets.requests.find((r) => r.state === 'Draft' || r.state === 'Sent back')
    const rows = draft
      ? s.datasets.requests
      : [...s.datasets.requests, { ...s.datasets.requests[0], requestId: 'R-9990', state: 'Draft' as const }]
    for (const plan of [s.plan, null]) {
      const ctx = sampleCtx('hr-admin', {
        sample: { ...s, datasets: { ...s.datasets, requests: rows }, plan: plan as never },
        asOfOverride: '2027-03-31',
      })
      const lists = effectiveRequestsOf(ctx)
      expect(lists.some((r) => r.state === 'Expired')).toBe(true)
      expect(effectiveRequests(ctx)).toBe(lists)
    }
  })
})

describe('an expired Sent back request in the write path (D-EXPIRY)', () => {
  it('is no ask in the guarded asks routing reads', async () => {
    const sc = scenario()
    const id = 'R-1038'
    const r = (await sc.request(id)) as HcRequest
    expect(
      (await sc.run(deciderOf(s, r), 'sendBack', { requestId: id, reason: 'Say which team.' })).outcome.ok,
    ).toBe(true)
    const admin = (asOf?: string): Who => ({
      mode: 'hr-admin',
      personId: personaOf(s, 'hr-admin').employeeId,
      ...(asOf ? { asOf } : {}),
    })
    const org = (p: { businessUnit: string }) => p.businessUnit === r.businessUnit
    const heads = async (asOf: string | undefined, without: Set<string>) =>
      guardedAsksOf(await sc.ctx(admin(asOf)), { org, fiscalYear: 'FY27', targetDate: '2027-03-31', without })
        .heads
    // Still pending on the day it was sent back: it counts.
    expect(await heads(undefined, new Set())).toBe((await heads(undefined, new Set([id]))) + 1)
    // 76 idle days later it is Expired: no ask.
    expect(await heads(LATER, new Set())).toBe(await heads(LATER, new Set([id])))
    // Nothing stored the Expired state.
    expect((await sc.request(id))?.state).toBe('Sent back')
  }, 180_000)

  it('frees an expired trade’s give seats and its credit', async () => {
    const sc = scenario()
    const id = s.story.tradeRequestId
    const r = (await sc.request(id)) as HcRequest
    expect(r.type).toBe('Trade')
    const give = r.trade?.givePositionIds[0] as string
    expect(
      (await sc.run(deciderOf(s, r), 'sendBack', { requestId: id, reason: 'Check the seats.' })).outcome.ok,
    ).toBe(true)
    const hr: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId }
    const now = await sc.ctx(hr)
    expect(actionEnvOf(now).seat(give)?.pendingRequestId).toBe(id)
    expect(quoteRequests(now).find((x) => x.requestId === id)?.state).toBe('Sent back')
    const later = await sc.ctx({ ...hr, asOf: LATER })
    expect(actionEnvOf(later).seat(give)?.pendingRequestId ?? null).toBeNull()
    expect(quoteRequests(later).find((x) => x.requestId === id)?.state).toBe('Expired')
    expect((await sc.request(id))?.state).toBe('Sent back')
  }, 180_000)

  it('stays expired when someone comments, so its seat and credit are spent once (review recheck)', async () => {
    const sc = scenario()
    const late = '2026-11-29'
    expect(
      (await sc.run({ mode: 'leader', personId: 'E10505' }, 'approveRequest', { requestId: 'R-1040' }))
        .outcome.ok,
    ).toBe(true)
    const holder: Who = { mode: 'manager', personId: 'E11205' }
    const ask = {
      give: ['P-2486'],
      creditUsedBp: 420,
      giveOrgPositionId: null,
      get: {
        level: 'P3',
        location: 'Bengaluru',
        fte: 1,
        orgPositionId: 'P-1629',
        businessUnit: 'Systems & Software',
        jobFamily: null,
        start: '2027-01-04',
        count: 'max',
        partTimeRest: false,
      },
    }
    const first = await sc.run(holder, 'createTrade', { ask, reasonCode: 'Location strategy' } as never)
    const id1 = requestIdInText(said(first.outcome)) as string
    expect((await sc.run(holder, 'submitRequest', { requestId: id1 })).outcome.ok).toBe(true)
    const decider = deciderOf(s, (await sc.request(id1)) as HcRequest)
    expect(
      (
        await sc.run(decider, 'sendBack', {
          requestId: id1,
          reason: 'Pick a later start for the Bengaluru seats',
        })
      ).outcome.ok,
    ).toBe(true)
    // 60 idle days on: Expired, its give seat and its credit free; a new trade spends them.
    const h29: Who = { ...holder, asOf: late }
    const second = await sc.run(h29, 'createTrade', { ask, reasonCode: 'Location strategy' } as never)
    const id2 = requestIdInText(said(second.outcome)) as string
    expect((await sc.run(h29, 'submitRequest', { requestId: id2 })).outcome.ok).toBe(true)
    const admin: Who = { mode: 'hr-admin', personId: personaOf(s, 'hr-admin').employeeId, asOf: late }
    const balance = async () => creditBalance(effectiveRequestsOf(await sc.ctx(admin)), 'P-1629', 'FY27')
    expect(await balance()).toBe(0)

    // A comment on the expired one is refused, and its card offers none: it stays expired.
    const card = requestsModel(await sc.ctx(h29)).mine.cards.find((c) => c.requestId === id1)
    expect(card?.state).toBe('Expired')
    expect(card?.can.comment).toBe(false)
    const comment = await sc.run({ ...decider, asOf: late }, 'commentOnRequest', {
      requestId: id1,
      text: 'Is this one still needed?',
      audience: 'everyone',
    } as never)
    expect(comment.outcome.ok).toBe(false)
    expect(comment.entries).toEqual([])
    const after = effectiveRequestsOf(await sc.ctx(admin)).find((r) => r.requestId === id1)
    expect(after?.state).toBe('Expired')
    expect(await balance()).toBe(0)
    // The trade that took the freed seat and credit goes through.
    const r2 = (await sc.request(id2)) as HcRequest
    const step = await sc.run({ ...deciderOf(s, r2), asOf: late }, 'approveRequest', { requestId: id2 })
    // Either wording of the block (M3 known gap 6: a full viewer reads the request's ID).
    expect(said(step.outcome)).not.toMatch(/already in (?:another )?pending request/)
    expect(step.outcome.ok).toBe(true)
    // Withdrawing it still works.
    expect((await sc.run(h29, 'withdrawRequest', { requestId: id1 })).outcome.ok).toBe(true)
  }, 300_000)
})
