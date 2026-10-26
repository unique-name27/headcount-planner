/**
 * The app's trade quote (./quote.ts `tradeQuoteOf`) after M3 known gap 6 (CONTRACTS-M3 8.4, PLAN
 * 11.2, 11.4, 8.4 rule 6): it reads each give seat's open req, so a seat whose req is at Interviewing
 * carries the warning the request card has shown since M3 (the card's own reading, `interviewingOf`,
 * finds the same seats); a quote on a Working version's rates carries "Rates can change until FY28
 * locks."; and a pending-request block names the request only to a viewer who sees it in full,
 * "another pending request" to everyone else (PV-9).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { requestsOf, seatStateOf } from '@/drill/seats'
import { requestIdInText } from '@/plan/actions/requestIds'
import { interviewingText, ratesChangeText, type TradeAsk } from '@/plan/engine/trade'
import { ctxAs, leakSample, sampleCtx } from '@/testkit/sample'
import { interviewingOf, OTHER_PENDING_TEXT } from '@/views/requests/engine/quoteCard'
import { openReqsOf, tradeQuoteOf } from './quote'

beforeAll(() => {
  leakSample()
}, 120_000)

/** A trade of `give` for P1 seats under the seat's own manager, starting `start`. */
function askOf(ctx: AnalyticsContext, give: string, start: string): TradeAsk {
  const seat = seatStateOf(ctx, give)
  if (!seat) throw new Error(`The sample has no seat ${give}.`)
  return {
    give: [give],
    creditUsedBp: 0,
    giveOrgPositionId: null,
    get: {
      level: 'P1',
      location: seat.position.location,
      fte: 1,
      orgPositionId: seat.position.managerPositionId ?? '',
      businessUnit: seat.position.businessUnit,
      jobFamily: null,
      start,
      count: 'max',
      partTimeRest: false,
    },
  }
}

describe('a give seat’s open req (11.4, SC-12)', () => {
  it('an Interviewing req adds the card’s warning, on the seats the card names', () => {
    const ctx = sampleCtx('hr-admin')
    expect(ctx.all.reqs.find((r) => r.reqId === 'REQ-4185')).toMatchObject({
      positionId: 'P-2554',
      status: 'Open',
      stage: 'Interviewing',
    })
    const q = tradeQuoteOf(ctx, askOf(ctx, 'P-2554', '2027-01-04'))
    expect(q.warnings).toEqual([
      {
        code: 'req-interviewing',
        positionId: 'P-2554',
        reqId: 'REQ-4185',
        text: 'REQ-4185 on P-2554 is interviewing. Trading the seat leaves the req open as imported.',
      },
    ])
    // The card's own reading of the reqs finds exactly the seats the quote warns on, over every
    // seat with an open req.
    const open = [...openReqsOf(ctx.all.reqs).keys()]
    const warned = tradeQuoteOf(ctx, { ...askOf(ctx, 'P-2554', '2027-01-04'), give: open }).warnings ?? []
    expect(warned.length).toBeGreaterThan(0)
    expect(warned.map((w) => ({ positionId: w.positionId, reqId: w.reqId }))).toEqual(
      interviewingOf(ctx, open),
    )
    for (const w of warned) expect(w.text).toBe(interviewingText(w.reqId, w.positionId))
  })

  it('an Open req at another stage, or a Filled or Cancelled one, adds none', () => {
    const ctx = sampleCtx('hr-admin')
    const reqs = openReqsOf(ctx.all.reqs)
    for (const r of ctx.all.reqs)
      if (r.positionId && r.status !== 'Open')
        expect(reqs.get(r.positionId)?.reqId, r.reqId).not.toBe(r.reqId)
    const other = [...reqs].find(([, r]) => r.stage !== 'Interviewing')
    expect(other).toBeTruthy()
    const q = tradeQuoteOf(ctx, askOf(ctx, other?.[0] as string, '2027-01-04'))
    expect(q.warnings).toEqual([])
  })
})

describe('the rates note (11.2, SC-11)', () => {
  it('reads "Rates can change until FY28 locks." on FY28 Working rates, and nothing on FY27’s lock', () => {
    const ctx = sampleCtx('hr-admin')
    expect(tradeQuoteOf(ctx, askOf(ctx, 'P-2554', '2027-06-07')).ratesNote).toBe(ratesChangeText('FY28'))
    expect(tradeQuoteOf(ctx, askOf(ctx, 'P-2554', '2027-01-04')).ratesNote).toBeNull()
  })
})

describe('a seat in a pending request (8.4 rule 6, PV-9)', () => {
  it('names the request to a viewer who sees it in full, and to no one else', () => {
    // Manager E10001's scope holds P-2589, in a pending request hidden from them.
    const mgr = ctxAs('manager', 'E10001')
    const hidden = tradeQuoteOf(mgr, askOf(mgr, 'P-2589', '2027-01-04'))
    const block = hidden.blocks.find((b) => b.code === 'pending-request')
    expect(block?.text).toBe(OTHER_PENDING_TEXT)
    const admin = sampleCtx('hr-admin')
    const shown = tradeQuoteOf(admin, askOf(admin, 'P-2589', '2027-01-04'))
    const named = shown.blocks.find((b) => b.code === 'pending-request')?.text ?? ''
    const id = requestIdInText(named)
    expect(id).toBeTruthy()
    expect(named).toBe(`This seat is already in pending request ${id}.`)
    expect(requestsOf(admin).find((r) => r.requestId === id)?.state).not.toBe('Draft')
    // A caller's own rule wins.
    const told = tradeQuoteOf(admin, askOf(admin, 'P-2589', '2027-01-04'), { requestShown: () => false })
    expect(told.blocks.find((b) => b.code === 'pending-request')?.text).toBe(OTHER_PENDING_TEXT)
  })
})
