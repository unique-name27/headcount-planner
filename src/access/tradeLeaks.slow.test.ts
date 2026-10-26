/**
 * Trade leak tests (docs/PLAN.md 11.6 to 11.8): Manager trade surfaces hold no currency sign, ISO
 * code or grouped number; in Manager B's team (3 Filled seats and 2 Open, one of them tradable), a
 * `baseSalary`, an `offerBase` and a `leavePaid` change leave every Manager surface, quote and weight
 * byte-identical; the standard head reads no HRIS pay, offer or leave and moves when a band midpoint
 * moves; Manager C's tradable list, credit and quotes are the same with and without the confidential
 * Elimination of C's seat (the chain and stored steps of C's Trade are in leaks.manager); Filled and
 * accepted-offer seats are blocked for every sample position, by the one quote engine Requests > New
 * and the What if trade lever share (both M3 screens); a trade comment with an amount is Approvers
 * only and never reaches Manager mode, one imported with audience Everyone included. Each has an HR
 * admin control or a non-vacuity count. The clock is pinned.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sample } from '@/data/sample'
import { FY27_BUDGET } from '@/data/sample'
import { standardHeadFrom } from '@/data/sample/base'
import { tradeSeatsOn } from '@/data/sample/trades'
import { fromRow, type TransitionContext, transition } from '@/plan/engine/requests'
import { creditBalance } from '@/plan/engine/trade'
import type { HcRequest, WorkingPlan } from '@/plan/types'
import { crawl } from '@/testkit/crawl'
import { amountHits, holding } from '@/testkit/leaks'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { allRequests, askFor, quote, routingCase, tradable } from '@/testkit/routing'
import {
  comment,
  ctxAs,
  leakSample,
  personaOf,
  pinClock,
  sampleCtx,
  unpinClock,
  withDatasets,
  withoutRequest,
  withPlanRequests,
  withReq,
  withSalaryDelta,
  withWorker,
} from '@/testkit/sample'
import { commentVisible, hasAmount, viewerOf } from './visibility'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  pinClock()
  s = leakSample()
}, 120_000)
afterAll(() => unpinClock())

const trade = () => fromRow(s.datasets.requests.find((r) => r.requestId === s.story.tradeRequestId) as never)

describe('Manager trade surfaces show weights, never amounts (11.6)', () => {
  it('hold no currency sign, ISO code or grouped number for the trade requester and approver', () => {
    const t = trade()
    const who = [t.requesterId, t.steps.find((x) => x.role === 'manager')?.approverId as string]
    for (const id of who) {
      const c = crawl(ctxAs('manager', id), { recordExports: 'text' })
      expect(c.errors, id).toEqual([])
      expect(
        amountHits(c.seen)
          .slice(0, 5)
          .map((h) => `${h.what} at ${h.where}`),
        id,
      ).toEqual([])
      // Non-vacuity: the trade and its standard heads are on the Manager's surfaces.
      expect(holding(c.seen, t.requestId).length, id).toBeGreaterThan(0)
    }
  }, 300_000)

  it('control: HR admin reads the trade card band estimates in USD', () => {
    const t = trade()
    const c = crawl(sampleCtx('hr-admin'), { views: ['requests'], cards: false, pages: false, help: false })
    const onTrade = amountHits(c.seen).filter((h) => h.where.includes(t.requestId))
    expect(onTrade.length).toBeGreaterThan(0)
  }, 300_000)
})

describe("one person's pay, offer or leave never moves a quote or a weight (11.2, 11.8)", () => {
  function team() {
    const b = personaOf(s, 'manager-b')
    const seats = [
      ...new Set(
        s.datasets.positions.filter((p) => p.managerPositionId === b.positionId).map((p) => p.positionId),
      ),
    ]
    const offer = s.datasets.reqs.find(
      (r) => r.stage === 'Offer accepted' && seats.includes(r.positionId ?? ''),
    )
    const holders = s.datasets.workers.filter(
      (w) =>
        w.workerType === 'Employee' &&
        seats.includes(w.positionId ?? '') &&
        (w.assignmentStart || w.hireDate) <= s.asOf &&
        !w.assignmentEnd &&
        !w.terminationDate,
    )
    return { b, seats, offer, holders }
  }

  it('quotes the same trade, and Manager B reads the same surfaces, before and after each change', () => {
    const { b, seats, offer, holders } = team()
    const get = { level: 'P2' as const, location: 'San Jose', org: b.positionId, unit: b.businessUnit }
    const give = tradable(s, seats, get)
    // Non-vacuity: one Open seat with no offer is tradable; the Filled seats and the accepted offer are not.
    expect(give.length).toBe(1)
    const onLeave = holders.find((w) => w.onLeave === true)
    expect(onLeave).toBeTruthy()
    const changed: [string, Sample][] = [
      ['baseSalary', withSalaryDelta(s, holders.find((w) => w !== onLeave)?.employeeId as string, 8_311)],
      ['offerBase', withReq(s, offer?.reqId as string, { offerBase: (offer?.offerBase ?? 0) + 8_311 })],
      ['leavePaid', withWorker(s, onLeave?.employeeId as string, { leavePaid: false })],
    ]
    const before = JSON.stringify(quote(s, askFor(give, get)))
    expect(JSON.parse(before).ok).toBe(true)
    // Manager B's own pending trade of that seat, on every surface they read.
    const q = quote(s, askFor(give, get))
    const pending: HcRequest = {
      ...trade(),
      requestId: 'R-9701',
      requesterId: b.employeeId,
      submittedById: b.employeeId,
      managerPositionId: b.positionId,
      businessUnit: b.businessUnit,
      department: b.department,
      level: 'P2',
      location: 'San Jose',
      trade: {
        ...(trade().trade as NonNullable<HcRequest['trade']>),
        givePositionIds: give,
        giveOrgPositionId: b.positionId,
        count: q.get.length,
        giveBp: q.giveBp,
        getBp: q.getBp,
        creditBp: q.creditBp,
      },
      steps: trade()
        .steps.slice(0, 1)
        .map((x) => ({ ...x, approverId: x.approverId })),
      comments: [],
    }
    const crawlB = (x: Sample) =>
      JSON.stringify(
        crawl(ctxAs('manager', b.employeeId, { sample: withPlanRequests(x, [pending]) })).snapshot(),
      )
    const base = crawlB(s)
    expect(base).toContain('R-9701')
    for (const [what, x] of changed) {
      expect(JSON.stringify(quote(x, askFor(give, get))), what).toBe(before)
      expect(crawlB(x), what).toBe(base)
    }
  }, 300_000)

  it('keeps the standard head off HRIS pay, offers and leave, and moves it with a band midpoint', () => {
    const at = '2027-03-31'
    const S = standardHeadFrom(s.datasets, FY27_BUDGET, at)
    expect(S).toBe(s.standardHead.FY27)
    const w = s.datasets.workers.find(
      (x) => x.workerType === 'Employee' && x.positionId && !x.terminationDate,
    )
    const o = s.datasets.reqs.find((r) => r.stage === 'Offer accepted')
    const leave = s.datasets.workers.find((x) => x.onLeave === true)
    for (const [what, x] of [
      ['baseSalary', withSalaryDelta(s, w?.employeeId as string, 250_000)],
      ['offerBase', withReq(s, o?.reqId as string, { offerBase: (o?.offerBase ?? 0) * 3 })],
      ['leavePaid', withWorker(s, leave?.employeeId as string, { leavePaid: false })],
    ] as const)
      expect(standardHeadFrom(x.datasets, FY27_BUDGET, at), what).toBe(S)
    // Control: raising the FY27 band midpoints by a tenth moves it.
    const bands = withDatasets(s, {
      assumptions: s.datasets.assumptions.map((r) =>
        r.table === 'band' ? { ...r, value: r.value * 1.1 } : r,
      ),
    })
    expect(standardHeadFrom(bands.datasets, FY27_BUDGET, at)).not.toBe(S)
  })
})

describe('Manager C: the same tradable seats, credit and quotes with and without the Elimination (8.4 rule 3)', () => {
  it('lists the same seats, credit and quotes', () => {
    const elim = s.planted.managerCElimination
    const k = routingCase(s, s, withoutRequest(s, elim).sample)
    const c = k.c
    const get = { level: 'P3' as const, location: 'San Jose', org: c.positionId, unit: c.businessUnit }
    const tree = (x: Sample) => {
      const out = new Set<string>()
      const queue = [c.positionId]
      while (queue.length) {
        const id = queue.pop() as string
        for (const p of x.datasets.positions)
          if (p.managerPositionId === id && !out.has(p.positionId)) {
            out.add(p.positionId)
            queue.push(p.positionId)
          }
      }
      return [...out].sort()
    }
    const view = (x: Sample) => {
      const seats = tree(x)
      const list = tradable(x, seats, get)
      return JSON.stringify({
        list,
        credit: creditBalance(allRequests(x), c.positionId, 'FY27'),
        quotes: list.map((id) => quote(x, askFor([id], get))),
        blocks: seats.map((id) => quote(x, askFor([id], get)).blocks.map((b) => b.code)),
      })
    }
    const a = view(k.withIt)
    expect(a).toBe(view(k.without))
    // Non-vacuity: C's team has the added On hold seat to trade.
    expect(JSON.parse(a).list).toContain(k.giveSeats[0])
  }, 300_000)
})

describe('Filled and accepted-offer seats are never traded (11.2, C23)', () => {
  it('blocks every Filled seat as filled and every accepted offer as accepted-offer', () => {
    const requests = allRequests(s)
    const ids = [...new Set(s.datasets.positions.map((p) => p.positionId))]
    const seats = tradeSeatsOn(s.datasets, s.asOf, ids, requests)
    let filled = 0
    let offers = 0
    let free = 0
    for (const [id, seat] of seats) {
      if (seat.workerType !== 'Employee' || seat.status === 'Eliminated') continue
      const get = {
        level: seat.level,
        location: seat.location,
        org: seat.orgPositionId,
        unit: seat.businessUnit,
      }
      const first = quote(s, askFor([id], get), requests).blocks[0]?.code ?? null
      if (seat.status === 'Filled') {
        expect(first, id).toBe('filled')
        filled++
      } else if (seat.acceptedOffer) {
        expect(first, id).toBe('accepted-offer')
        offers++
      } else if (first !== 'filled' && first !== 'accepted-offer') free++
    }
    expect(filled).toBeGreaterThan(1400)
    expect(offers).toBeGreaterThan(15)
    // Control: Open, Planned and On hold seats with no offer are not blocked for those reasons.
    expect(free).toBeGreaterThan(100)
  }, 600_000)
})

describe('a trade comment with an amount (8.4 rule 5)', () => {
  it('is Approvers only at entry, and never reaches Manager mode, imported as Everyone included', () => {
    const t = trade()
    const hrbp = t.steps.find((x) => x.role === 'hrbp')?.approverId as string
    const tctx = {
      asOf: s.asOf,
      seat: null,
      cycleOpen: false,
      idleDays: 60,
      working: {} as WorkingPlan,
      hasAmount,
      newCommentId: (id: string, n: number) => `${id}-c${n}`,
      chain: {} as TransitionContext['chain'],
    } satisfies TransitionContext
    const done = transition(
      t,
      { kind: 'comment', text: 'The get seats cost about $288k a year', audience: 'everyone' },
      { personId: hrbp, name: 'The HRBP', mode: 'hrbp' },
      `${s.asOf}T11:00:00.000Z`,
      tctx,
    )
    if ('refused' in done) throw new Error(done.refused)
    const added = done.request.comments.at(-1)
    expect(added?.audience).toBe('approvers')
    // One imported with audience Everyone, as Import requests would merge it.
    const imported = comment({
      id: 'fx-t1',
      by: hrbp,
      text: 'Imported: saves 95k on the year',
      audience: 'everyone',
    })
    const plain = comment({ id: 'fx-t2', by: hrbp, text: 'Swap agreed with the team', audience: 'everyone' })
    const withComments = withPlanRequests(s, [
      { ...done.request, comments: [...done.request.comments, imported, plain] },
    ])
    for (const id of [t.requesterId, t.steps.find((x) => x.role === 'manager')?.approverId as string]) {
      const ctx = ctxAs('manager', id, { sample: withComments })
      const c = crawl(ctx, { recordExports: 'text' })
      expect(holding(c.seen, '288k'), id).toEqual([])
      expect(holding(c.seen, '95k'), id).toEqual([])
      // Non-vacuity: the plain comment reaches the requester.
      if (id === t.requesterId) expect(holding(c.seen, 'Swap agreed').length).toBeGreaterThan(0)
      const v = viewerOf(ctx)
      expect(commentVisible(imported, done.request, v)).toBe(false)
    }
    // Control: HR admin reads both.
    const hr = crawl(sampleCtx('hr-admin', { sample: withComments }), { views: ['requests'], cards: false })
    expect(holding(hr.seen, '288k').length).toBeGreaterThan(0)
    expect(holding(hr.seen, '95k').length).toBeGreaterThan(0)
  }, 300_000)
})
