/**
 * What if (docs/PLAN.md 10.6, 6.9 and 16.2): each lever's change to heads, in-year band cost and gap,
 * refusals, the trade lever (G3's numbers), and "Turn into requests" (a freeze lever plus one cancel
 * lever turns into exactly one Elimination draft; no request type outside REQUEST_TYPES).
 */
import { describe, expect, it } from 'vitest'
import { REASON_CODES_OF, REQUEST_TYPES } from '@/data/schema'
import type { HcRequest } from '../types'
import { TRADE_RATES_11_7 } from './fixtures/band'
import { G3 } from './fixtures/targets'
import { T1, T5, TRADE_SEATS, tradeContext } from './fixtures/trade'
import { W, W_CONTEXT, W_IN_GTM, W_PENDING_ELIMINATION, W_POSITIONS } from './fixtures/whatif'
import { ACCEPTED_OFFER_TEXT } from './requests'
import { asksContext } from './targets'
import { type TradeAsk, tradeQuote } from './trade'
import {
  FREEZE_LEVER_NOTE,
  type Lever,
  leverSeats,
  leverSeatsOfYear,
  NO_CHANGE_TEXT,
  NO_START_TEXT,
  NOT_A_LEVER_SEAT_TEXT,
  OUT_OF_SCOPE_TEXT,
  readingDateOf,
  turnIntoRequests,
  type WhatIfInput,
  whatIf,
} from './whatif'

const quote = (ask: TradeAsk) => tradeQuote(ask, TRADE_SEATS, TRADE_RATES_11_7, tradeContext())

const input = (levers: readonly Lever[], over: Partial<WhatIfInput> = {}): WhatIfInput => ({
  levers,
  org: W_IN_GTM,
  fiscalYear: W.fiscalYear,
  targetDate: W.fyEnd,
  target: W.target,
  requests: [],
  ctx: asksContext(W_CONTEXT),
  quote,
  ...over,
})

describe('levers on one seat', () => {
  it('defer a start: −$287,400 × 2/12 = −$47,900.00; −1 head at 31 Dec 2026, none at FY end', () => {
    const lever: Lever = { kind: 'defer', positionId: 'P-W-1', to: '2027-01-01' }
    const r = whatIf(input([lever]))
    expect(r.deltaCost).toBeCloseTo(W.defer.cost, 2)
    expect(r.deltaHeads).toBe(W.defer.headsAtFyEnd)
    expect(whatIf(input([lever], { targetDate: W.december })).deltaHeads).toBe(W.defer.headsAtDecember)
    expect(r.contributors).toEqual(['P-W-1'])
    expect(r.refused).toEqual([])
  })

  it('cancel an Open or Planned seat: −$119,750.00 and −1 head', () => {
    const r = whatIf(input([{ kind: 'cancel', positionId: 'P-W-1' }]))
    expect(r.deltaCost).toBeCloseTo(W.cancel.cost, 2)
    expect(r.deltaHeads).toBe(W.cancel.heads)
    expect(r.deltaGap).toBe(1)
  })

  it('shift starts by a month: −$23,950.00 − $12,602.34 = −$36,552.34', () => {
    const r = whatIf(input([{ kind: 'shift', positionIds: ['P-W-1', 'P-W-2'], months: 1 }]))
    expect(r.deltaCost).toBeCloseTo(W.shift.cost, 2)
    expect(r.deltaHeads).toBe(0)
    expect(r.contributors).toEqual(['P-W-1', 'P-W-2'])
  })

  it('change level: ($236,000 − $287,400) × 5/12 = −$21,416.67, no heads', () => {
    const r = whatIf(input([{ kind: 'level', positionId: 'P-W-1', level: 'P4' }]))
    expect(r.deltaCost).toBeCloseTo(W.level.cost, 2)
    expect(r.deltaHeads).toBe(0)
  })

  it('change location: ($160,380.00 − $151,228.08) × 4/12 = +$3,050.64', () => {
    const r = whatIf(input([{ kind: 'location', positionId: 'P-W-2', location: 'Haifa' }]))
    expect(r.deltaCost).toBeCloseTo(W.location.cost, 2)
  })

  it('defer a seat with no planned start: it had no cost, so the change adds $49,550.00 and no heads', () => {
    const r = whatIf(input([{ kind: 'defer', positionId: 'P-W-NS', to: '2027-01-01' }]))
    expect(r.deltaCost).toBeCloseTo(W.noStart.cost, 2)
    expect(r.deltaHeads).toBe(W.noStart.heads)
  })

  it('levers compose in order: defer to 1 Jan, then shift a month, is −$71,850.00', () => {
    const r = whatIf(
      input([
        { kind: 'defer', positionId: 'P-W-1', to: '2027-01-01' },
        { kind: 'shift', positionIds: ['P-W-1'], months: 1 },
      ]),
    )
    expect(r.deltaCost).toBeCloseTo(W.composed.cost, 2)
  })
})

describe('the freeze lever', () => {
  it('holds the sub-org’s openings from its date: −$109,657.02 and no heads (R10)', () => {
    const r = whatIf(input([{ kind: 'freeze', orgPositionId: 'P-W-SUB', from: '2027-01-01' }]))
    expect(r.deltaCost).toBeCloseTo(W.freeze.cost, 2)
    expect(r.deltaHeads).toBe(W.freeze.heads)
    expect(r.deltaGap).toBe(0)
    expect(r.contributors).toEqual(['P-W-1', 'P-W-2'])
  })

  it('leaves seats outside the sub-org, Filled seats and accepted offers alone', () => {
    const r = whatIf(input([{ kind: 'freeze', orgPositionId: 'P-GTM-MGR', from: '2027-01-01' }]))
    // P-W-1, P-W-2 (under P-W-SUB, under P-GTM-MGR) and P-W-NS (no start, no cost); never P-W-OFFER or P-W-F.
    expect(r.contributors).toEqual(['P-W-1', 'P-W-2'])
    expect(r.deltaCost).toBeCloseTo(W.freeze.cost, 2)
  })
})

describe('refusals', () => {
  it('an accepted offer is never a lever target', () => {
    const r = whatIf(input([{ kind: 'defer', positionId: 'P-W-OFFER', to: '2027-01-01' }]))
    expect(r.refused).toEqual([{ lever: 0, text: ACCEPTED_OFFER_TEXT }])
    expect(r.deltaCost).toBe(0)
    expect(r.deltaHeads).toBe(0)
  })

  it('Filled and contractor seats, seats outside the org and unknown seats', () => {
    const r = whatIf(
      input([
        { kind: 'cancel', positionId: 'P-W-F' },
        { kind: 'cancel', positionId: 'P-W-C' },
        { kind: 'cancel', positionId: 'P-W-SE' },
        { kind: 'cancel', positionId: 'P-NONE' },
      ]),
    )
    expect(r.refused).toEqual([
      { lever: 0, text: NOT_A_LEVER_SEAT_TEXT },
      { lever: 1, text: NOT_A_LEVER_SEAT_TEXT },
      { lever: 2, text: OUT_OF_SCOPE_TEXT },
      { lever: 3, text: 'There is no seat P-NONE in this plan.' },
    ])
    expect(r.deltaCost).toBe(0)
    expect(r.deltaHeads).toBe(0)
    expect(r.contributors).toEqual([])
  })

  it('a shift of a seat with no planned start, named per seat when it shifts several', () => {
    expect(whatIf(input([{ kind: 'shift', positionIds: ['P-W-NS'], months: 1 }])).refused).toEqual([
      { lever: 0, text: NO_START_TEXT },
    ])
    const r = whatIf(input([{ kind: 'shift', positionIds: ['P-W-1', 'P-W-NS'], months: 1 }]))
    expect(r.refused).toEqual([{ lever: 0, text: `P-W-NS: ${NO_START_TEXT}` }])
    expect(r.deltaCost).toBeCloseTo(-287_400 / 12, 2)
  })
})

describe('levers and pending requests', () => {
  it('cancelling a seat a pending Elimination already removes changes nothing', () => {
    const r = whatIf(input([{ kind: 'cancel', positionId: 'P-W-1' }], { requests: [W_PENDING_ELIMINATION] }))
    expect(r.deltaHeads).toBe(0)
    expect(r.deltaCost).toBeCloseTo(0, 6)
  })
})

describe('the trade lever (11.5, fixture G3)', () => {
  it('T1 as a lever: +7 heads and −$52,031.60, never the annual band estimate', () => {
    const r = whatIf(
      input([{ kind: 'trade', ask: T1.ask }], {
        ctx: asksContext(G3.context),
        org: G3.org,
        target: G3.target,
      }),
    )
    expect(r.trades).toHaveLength(1)
    expect(r.trades[0].lever).toBe(0)
    expect(r.trades[0].quote.ratio).toBeCloseTo(8.4891, 4)
    expect(r.deltaHeads).toBe(G3.headEffect)
    expect(r.deltaGap).toBe(-G3.headEffect)
    expect(r.deltaCost).toBeCloseTo(G3.bandEffect, 2)
    expect(r.deltaCost).not.toBeCloseTo(G3.negativeControl, 2)
    expect(r.contributors).toEqual(['P-T1'])
    expect(r.bandOnly).toBe(true)
  })

  it('a trade that cannot be quoted is refused with its block and changes nothing', () => {
    const r = whatIf(input([{ kind: 'trade', ask: T5.ask }], { ctx: asksContext(G3.context), org: G3.org }))
    expect(r.trades).toHaveLength(1)
    expect(r.refused).toEqual([{ lever: 0, text: T5.blocks?.[0].text }])
    expect(r.deltaHeads).toBe(0)
    expect(r.deltaCost).toBe(0)
  })
})

describe('results', () => {
  it('are band figures, and the gap change is −deltaHeads with a target and 0 without one', () => {
    const levers: Lever[] = [
      { kind: 'cancel', positionId: 'P-W-1' },
      { kind: 'level', positionId: 'P-W-2', level: 'P5' },
    ]
    const r = whatIf(input(levers))
    expect(r.bandOnly).toBe(true)
    expect(r.deltaGap).toBe(-r.deltaHeads)
    expect(whatIf(input(levers, { target: null })).deltaGap).toBe(0)
  })

  it('are Working with the levers against Working without them: no lever, no change', () => {
    expect(whatIf(input([]))).toEqual({
      deltaHeads: 0,
      deltaCost: 0,
      deltaGap: 0,
      bandOnly: true,
      contributors: [],
      trades: [],
      refused: [],
    })
  })
})

describe('leverSeats', () => {
  it('lists Planned seats and Open seats with no accepted offer in the scope, employee seats only', () => {
    const ids = W_POSITIONS.map((p) => p.positionId)
    expect(leverSeats(ids, asksContext(W_CONTEXT), '2026-10-01', W_IN_GTM)).toEqual([...W.leverSeats])
  })

  it('reads a fiscal year as whatIf does: on the first open day, in the scope (leverSeatsOfYear)', () => {
    const ctx = asksContext(W_CONTEXT)
    expect(readingDateOf(W.fiscalYear, ctx)).toBe('2026-10-01')
    // A later year is read on its first day; a year already closed, on its last.
    expect(readingDateOf('FY28', ctx)).toBe('2027-04-01')
    expect(readingDateOf('FY26', ctx)).toBe('2026-03-31')
    const seats = leverSeatsOfYear(W.fiscalYear, ctx, W_IN_GTM)
    expect(seats.map((x) => x.positionId)).toEqual([...W.leverSeats])
    expect(seats.every((x) => !x.acceptedOffer && (x.status === 'Planned' || x.status === 'Open'))).toBe(true)
    // Every seat it lists is one a lever may act on: none is refused.
    const r = whatIf(
      input(seats.map((x): Lever => ({ kind: 'level', positionId: x.positionId, level: 'P6' }))),
    )
    expect(r.refused).toEqual([])
  })
})

describe('turnIntoRequests', () => {
  const at = '2026-10-05T09:00'
  const make = (levers: readonly Lever[], ctx = asksContext(W_CONTEXT)) =>
    turnIntoRequests(levers, { requesterId: 'E9001', at, newRequestId: (n) => `R-WI-${n}`, ctx })
  const valid = (d: HcRequest) => {
    expect(REQUEST_TYPES).toContain(d.type)
    expect(REASON_CODES_OF[d.type]).toContain(d.reasonCode)
    expect(d.state).toBe('Draft')
    expect(d.requesterId).toBe('E9001')
    expect(d.steps).toEqual([])
    expect(d.updatedAt).toBe(at)
  }

  it('a freeze lever plus one cancel lever turns into exactly one Elimination draft', () => {
    const r = make([
      { kind: 'freeze', orgPositionId: 'P-W-SUB', from: '2027-01-01' },
      { kind: 'cancel', positionId: 'P-W-1' },
    ])
    expect(r.drafts).toHaveLength(1)
    expect(r.drafts[0]).toMatchObject({
      requestId: 'R-WI-1',
      type: 'Elimination',
      positionId: 'P-W-1',
      managerPositionId: 'P-W-SUB',
      businessUnit: 'Go-to-Market',
      startDate: null,
    })
    valid(r.drafts[0])
    expect(r.skipped).toEqual([{ lever: 0, text: FREEZE_LEVER_NOTE }])
  })

  it('one draft per seat and request type: defer and shift give Start date, level and location their own', () => {
    const r = make([
      { kind: 'defer', positionId: 'P-W-1', to: '2027-01-01' },
      { kind: 'level', positionId: 'P-W-1', level: 'P4' },
      { kind: 'shift', positionIds: ['P-W-1', 'P-W-2'], months: 1 },
      { kind: 'location', positionId: 'P-W-2', location: 'Haifa' },
    ])
    expect(
      r.drafts.map((d) => [d.requestId, d.type, d.positionId, d.startDate, d.level, d.location]),
    ).toEqual([
      ['R-WI-1', 'Start date', 'P-W-1', '2027-02-01', 'P5', 'San Jose'],
      ['R-WI-2', 'Level change', 'P-W-1', null, 'P4', 'San Jose'],
      ['R-WI-3', 'Start date', 'P-W-2', '2027-01-01', 'P4', 'Munich'],
      ['R-WI-4', 'Location change', 'P-W-2', null, 'P4', 'Haifa'],
    ])
    for (const d of r.drafts) valid(d)
    expect(r.skipped).toEqual([])
  })

  it('a cancelled seat gets only its Elimination', () => {
    const r = make([
      { kind: 'defer', positionId: 'P-W-1', to: '2027-01-01' },
      { kind: 'cancel', positionId: 'P-W-1' },
    ])
    expect(r.drafts.map((d) => d.type)).toEqual(['Elimination'])
  })

  it('one Trade per trade lever, with the give seats and the asked seats', () => {
    const ctx = asksContext(G3.context)
    const r = make(
      [
        { kind: 'trade', ask: T1.ask },
        { kind: 'trade', ask: { ...T1.ask, get: { ...T1.ask.get, count: 6 } } },
      ],
      ctx,
    )
    expect(r.drafts.map((d) => d.type)).toEqual(['Trade', 'Trade'])
    for (const d of r.drafts) valid(d)
    expect(r.drafts[0]).toMatchObject({
      managerPositionId: 'P-GTM-MGR',
      level: 'P3',
      location: 'Bengaluru',
      fte: 1,
      startDate: '2027-01-01',
    })
    expect(r.drafts[0].trade).toMatchObject({ givePositionIds: ['P-T1'], count: 0, giveBp: null })
    expect(r.drafts[1].trade?.count).toBe(6)
  })

  it('skips accepted offers, Filled seats and levers that change nothing', () => {
    const r = make([
      { kind: 'defer', positionId: 'P-W-OFFER', to: '2027-01-01' },
      { kind: 'cancel', positionId: 'P-W-F' },
      { kind: 'level', positionId: 'P-W-1', level: 'P5' },
    ])
    expect(r.drafts).toEqual([])
    expect(r.skipped).toEqual([
      { lever: 0, text: ACCEPTED_OFFER_TEXT },
      { lever: 1, text: NOT_A_LEVER_SEAT_TEXT },
      { lever: 2, text: NO_CHANGE_TEXT },
    ])
  })

  it('never makes a request type outside REQUEST_TYPES', () => {
    const r = make([
      { kind: 'defer', positionId: 'P-W-1', to: '2027-01-01' },
      { kind: 'cancel', positionId: 'P-W-2' },
      { kind: 'level', positionId: 'P-W-NS', level: 'P4' },
      { kind: 'location', positionId: 'P-W-NS', location: 'Munich' },
      { kind: 'freeze', orgPositionId: 'P-GTM-MGR', from: '2026-11-01' },
      { kind: 'trade', ask: T1.ask },
    ])
    expect(r.drafts.length).toBe(5)
    for (const d of r.drafts) valid(d)
    expect(new Set(r.drafts.map((d) => d.requestId)).size).toBe(r.drafts.length)
  })
})
