/**
 * Headcount trades (docs/PLAN.md 11.7, exact): F-S and F-S2 are in band.test.ts; here T1, T1′, T1h,
 * T2 to T6, T7a, T7b, their chains, CR1, the block order and the 11.7 properties.
 */
import { describe, expect, it } from 'vitest'
import type { AssumptionRow, PositionRow } from '@/data/schema'
import type { HcRequest, OrgMatch, WorkingPlan } from '../types'
import type { SeatType } from './band'
import { chainFor, outOfPlan } from './chain'
import { lineContext, versionLines } from './cost'
import { fixtureBandUsd, STANDARD_HEAD_USD, TRADE_RATES_11_7 } from './fixtures/band'
import { CHAIN_ORG } from './fixtures/chain'
import { assumption, fy27Working } from './fixtures/common'
import { EUR_PLAN_108, MUNICH_ROWS } from './fixtures/cost'
import { IN_GTM, IN_SE } from './fixtures/targets'
import {
  ASKS_RISE,
  CR1,
  giveSeatRows,
  OK_QUOTES,
  type QuoteCase,
  T1,
  T1_APPLIED,
  T1_POSITIONS,
  T1_PRIME,
  T1_REQUEST,
  T1_WORKING,
  T1H,
  T2,
  T3,
  T4,
  T5,
  T6,
  T6_REQUEST,
  T7A,
  T7B,
  TRADE_REQUESTS,
  TRADE_SEATS,
  tradeContext,
  tradeWorking,
} from './fixtures/trade'
import { asksContext, headEffect } from './targets'
import type { TradeAsk, TradeQuote, TradeSeat } from './trade'
import { applyTrade, creditBalance, TRADE_BLOCK_ORDER, tradeQuote } from './trade'
import { approvedHeadsOn, lockedFrom, seatHistories, verifyLock } from './versions'

const quote = (c: QuoteCase): TradeQuote =>
  tradeQuote(c.ask, TRADE_SEATS, TRADE_RATES_11_7, tradeContext(c.creditBalanceBp))

function expectQuote(c: QuoteCase): void {
  const q = quote(c)
  expect(q.ok).toBe(c.ok)
  if (c.getSeats !== null) expect(q.get).toHaveLength(c.getSeats)
  if (c.getFtes) expect(q.get.map((l) => l.fte)).toEqual([...c.getFtes])
  if (c.giveBp !== null) expect(q.giveBp).toBe(c.giveBp)
  if (c.getBp !== null) expect(q.getBp).toBe(c.getBp)
  if (c.creditBp !== null) expect(q.creditBp).toBe(c.creditBp)
  if (c.ratio !== null) expect(q.ratio).toBeCloseTo(c.ratio, 4)
  if (c.headsDelta !== null) expect(q.headsDelta).toBe(c.headsDelta)
  if (c.inYearBp !== undefined) expect(q.inYearBp).toBeCloseTo(c.inYearBp, 2)
  if (c.getBandUsd !== undefined) expect(q.getBandUsd).toBeCloseTo(c.getBandUsd, 2)
  if (c.giveOrgPositionId !== undefined) expect(q.giveOrgPositionId).toBe(c.giveOrgPositionId)
  if (c.blocks) {
    const seatBlocks = c.blocks.some((b) => b.positionId)
    const got = seatBlocks ? q.blocks.filter((b) => b.positionId) : q.blocks
    expect(got.map((b) => b.code)).toEqual(c.blocks.map((b) => b.code))
    c.blocks.forEach((b, i) => {
      if (b.positionId) expect(got[i].positionId).toBe(b.positionId)
      if (b.text) expect(got[i].text).toBe(b.text)
    })
  } else {
    expect(q.blocks).toEqual([])
  }
  expect(q.rates).toEqual({
    version: TRADE_RATES_11_7.version,
    lockHash: TRADE_RATES_11_7.lockHash,
    standardHeadUsd: STANDARD_HEAD_USD,
  })
}

describe('quotes', () => {
  for (const c of [T1, T1H, T2, T3, T4, T5, T6, T7A, ...T7B]) {
    it(c.id, () => expectQuote(c))
  }

  it('T1: credit 1,104 bp shows as 0.11 standard heads', () => {
    expect((quote(T1).creditBp / 10_000).toFixed(2)).toBe('0.11')
  })

  it('T4: the part-time rest seat is one 0.8 FTE P4 Munich seat of 8,339 bp', () => {
    const q = quote(T4)
    expect(q.get.map((l) => l.weightBp)).toEqual([10_082, 8_339])
  })

  it('T1: in FY27 this saves 0.35 standard heads (inYearBp −3,469.33; −$52,040.00 at S)', () => {
    const q = quote(T1)
    expect((Math.abs(q.inYearBp) / 10_000).toFixed(2)).toBe('0.35')
    expect((q.inYearBp * STANDARD_HEAD_USD) / 10_000).toBeCloseTo(-52_040, 0)
  })
})

describe('properties (11.7)', () => {
  it('giveBp === getBp + creditBp, in integers, creditBp >= 0, for every quote', () => {
    for (const c of OK_QUOTES) {
      const q = quote(c)
      expect(q.giveBp, c.id).toBe(q.getBp + q.creditBp)
      expect(
        Number.isInteger(q.giveBp) && Number.isInteger(q.getBp) && Number.isInteger(q.creditBp),
        c.id,
      ).toBe(true)
      expect(q.creditBp, c.id).toBeGreaterThanOrEqual(0)
    }
  })

  it('band USD drifts at most half a basis point a rounded seat (T1: $33.60 of $67.50)', () => {
    const bp = STANDARD_HEAD_USD / 10_000
    for (const c of OK_QUOTES) {
      const q = quote(c)
      const give = q.give.reduce((n, l) => n + (l.bandUsd ?? 0), 0)
      const get = q.get.reduce((n, l) => n + (l.bandUsd ?? 0), 0)
      const drift = Math.abs(give + (c.ask.creditUsedBp - q.creditBp) * bp - get)
      expect(drift, c.id).toBeLessThanOrEqual(0.5 * bp * (q.give.length + q.get.length) + 1e-6)
    }
    const t1 = quote(T1)
    const give = t1.give.reduce((n, l) => n + (l.bandUsd ?? 0), 0)
    const get = t1.get.reduce((n, l) => n + (l.bandUsd ?? 0), 0)
    expect(Math.abs(give - 1_104 * bp - get)).toBeCloseTo(33.6, 2)
    // The bound from the seat count: 0.5 × $15 × (1 + 8) = $67.50; 8 × $4.20 = $33.60 is inside it.
    expect(0.5 * bp * (t1.give.length + t1.get.length)).toBeCloseTo(67.5, 6)
    expect(33_859.2 - 2_257 * bp).toBeCloseTo(4.2, 6)
  })

  it('T1 then T3 restores the seats with credit 0', () => {
    expect(quote(T1).creditBp).toBe(1_104)
    const t3 = quote(T3)
    expect(t3.creditBp).toBe(0)
    expect(t3.get.map((l) => [l.level, l.location, l.fte])).toEqual([['P5', 'San Jose', 1]])
  })

  it('the rise in asks heads while T1 is pending equals the rise in approved heads after applyTrade', () => {
    const ctx = asksContext({
      positions: T1_POSITIONS,
      assignments: T1_WORKING.assignments,
      reqs: [],
      requests: [],
      proration: 'full-month',
      firstOpenMonth: '2026-10',
      bandUsd: (s) => fixtureBandUsd(s),
    })
    expect(headEffect(T1_REQUEST, IN_GTM, T1_APPLIED.targetDate, ctx)).toBe(T1_APPLIED.headEffect)
    const before = [
      ...seatHistories({
        positions: T1_POSITIONS,
        assignments: T1_WORKING.assignments,
        reqs: [],
        requests: [],
      }).values(),
    ]
    expect(approvedHeadsOn(before, T1_APPLIED.targetDate)).toBe(T1_APPLIED.approvedBefore)
    const applied = applyTrade(T1_WORKING, { ...T1_REQUEST, state: 'Approved' }, T1_APPLIED.at)
    expect(applied.positions.filter((c) => c.kind === 'created')).toHaveLength(T1_APPLIED.created)
    const ended = applied.positions.find((c) => c.row.positionId === T1_APPLIED.giveEnd.positionId)
    expect(ended?.row).toMatchObject(T1_APPLIED.giveEnd)
    const after = [
      ...seatHistories({
        positions: [...T1_POSITIONS, ...applied.positions.map((c) => c.row)],
        assignments: T1_WORKING.assignments,
        reqs: [],
        requests: [],
      }).values(),
    ]
    const rise = approvedHeadsOn(after, T1_APPLIED.targetDate) - T1_APPLIED.approvedBefore
    expect(rise).toBe(T1_APPLIED.headEffect)
    expect(approvedHeadsOn(after, T1_APPLIED.targetDate)).toBe(T1_APPLIED.approvedAfter)
    expect(applied.audit.length).toBeGreaterThan(0)
  })
})

describe('chains (11.7 chain context)', () => {
  for (const c of [T1, T1_PRIME, T1H, T2, T3, T4, T6]) {
    it(`${c.id}: ${c.chain?.expected.map((e) => e[0]).join(', ')}`, () => {
      if (!c.chain) throw new Error(`${c.id} has no chain`)
      const steps = chainFor(TRADE_REQUESTS[c.id], { org: CHAIN_ORG, facts: c.chain.facts })
      expect(steps.map((s) => [s.role, s.approverId])).toEqual(c.chain.expected.map((e) => [...e]))
    })
  }

  it('T1′: the leader step reads over threshold and out of plan; Finance reads out of plan', () => {
    const facts = T1_PRIME.chain?.facts
    if (!facts) throw new Error('no facts')
    const steps = chainFor(T1_REQUEST, { org: CHAIN_ORG, facts })
    const leader = steps.find((s) => s.role === 'leader')
    expect(leader?.reasons).toEqual(expect.arrayContaining(['band-estimate-over-threshold', 'out-of-plan']))
    expect(steps.find((s) => s.role === 'finance')?.reasons).toContain('out-of-plan')
  })
})

describe('CR1: trade credit is keyed to the giving org and its fiscal year', () => {
  const pick = (ids: readonly string[]) => CR1.requests.filter((r) => ids.includes(r.requestId))

  it('T1 approved holds 1,104', () => {
    expect(creditBalance(pick(CR1.afterT1.ids), CR1.afterT1.org, CR1.afterT1.year)).toBe(CR1.afterT1.expected)
  })

  it('a pending T3 using it leaves 0', () => {
    expect(creditBalance(pick(CR1.afterT3.ids), CR1.afterT3.org, CR1.afterT3.year)).toBe(CR1.afterT3.expected)
  })

  it('other orgs, other years and rejected trades change nothing', () => {
    expect(creditBalance(CR1.requests, CR1.all.org, CR1.all.year)).toBe(CR1.all.expected)
    expect(creditBalance(CR1.requests, CR1.se.org, CR1.se.year)).toBe(CR1.se.expected)
    expect(creditBalance(CR1.requests, CR1.fy28.org, CR1.fy28.year)).toBe(CR1.fy28.expected)
  })
})

describe('the asks property for every trade (11.7)', () => {
  const FY_END = '2027-03-31'
  const AT = '2026-10-05'
  const COMPANY: OrgMatch = () => true
  const orgs: [keyof (typeof ASKS_RISE)[string], OrgMatch][] = [
    ['company', COMPANY],
    ['gtm', IN_GTM],
    ['se', IN_SE],
  ]
  /** The org's seats: each seat sits where its latest row puts it. */
  const seatsIn = (positions: readonly PositionRow[], plan: WorkingPlan, org: OrgMatch) =>
    [...seatHistories({ positions, assignments: plan.assignments, reqs: [], requests: [] }).values()].filter(
      (h) => {
        const r = h.rows[h.rows.length - 1]
        return org(
          {
            positionId: h.positionId,
            managerPositionId: r.managerPositionId ?? null,
            businessUnit: r.businessUnit,
            department: r.department ?? null,
            costCenter: r.costCenter,
          },
          FY_END,
        )
      },
    )

  for (const [id, rise] of Object.entries(ASKS_RISE)) {
    it(`${id}: the rise in asks heads while pending equals the rise in approved heads after applyTrade`, () => {
      const req = TRADE_REQUESTS[id]
      const plan = tradeWorking(req)
      const ctx = asksContext({
        positions: plan.positions,
        assignments: plan.assignments,
        reqs: [],
        requests: [],
        proration: 'full-month',
        firstOpenMonth: '2026-10',
        bandUsd: (s) => fixtureBandUsd(s),
      })
      const applied = applyTrade(plan, { ...req, state: 'Approved' }, AT)
      const after = [...plan.positions, ...applied.positions.map((c) => c.row)]
      for (const [name, org] of orgs) {
        const pending = headEffect(req, org, FY_END, ctx)
        expect(pending, `${id} ${name} pending`).toBe(rise[name])
        const before = approvedHeadsOn(seatsIn(plan.positions, plan, org), FY_END)
        const now = approvedHeadsOn(seatsIn(after, plan, org), FY_END)
        expect(now - before, `${id} ${name} approved`).toBe(pending)
      }
    })
  }

  it('T1h: an On hold seat given counts 0, so asks and approved heads rise by 8', () => {
    expect(quote(T1H).headsDelta).toBe(8)
    expect(giveSeatRows(['P-T1H'])[0].status).toBe('On hold')
  })
})

describe('T1′ and T6 (11.7 chain context)', () => {
  it('T1′: asks 35 + 7 = 42 > target 40 is out of plan; T1 at 30 + 7 = 37 is not', () => {
    const prime = T1_PRIME.chain?.facts
    const plain = T1.chain?.facts
    if (!prime || !plain) throw new Error('no facts')
    const c = prime.checks[0]
    expect(c.asks.heads + c.effect.heads).toBe(42)
    expect(c.target?.heads).toBe(40)
    expect(outOfPlan(T1_REQUEST, { org: CHAIN_ORG, facts: prime })).toBe(true)
    expect(outOfPlan(T1_REQUEST, { org: CHAIN_ORG, facts: plain })).toBe(false)
  })

  it('T6: the 5,041 bp credit is held by the giving Go-to-Market manager position', () => {
    const q = quote(T6)
    expect(q.giveOrgPositionId).toBe('P-GTM-MGR')
    const fields = T6_REQUEST.trade
    if (!fields) throw new Error('T6 has no trade fields')
    const approved: HcRequest = {
      ...T6_REQUEST,
      state: 'Approved',
      trade: { ...fields, giveOrgPositionId: q.giveOrgPositionId },
    }
    expect(creditBalance([approved], 'P-GTM-MGR', 'FY27')).toBe(5_041)
    expect(creditBalance([approved], 'P-SE-MGR', 'FY27')).toBe(0)
  })
})

describe('stored weights (11.7): editing Working bands after T2 is approved', () => {
  it("leaves T2's stored weights and the Budget hash unchanged", () => {
    const q = quote(T2)
    const t2 = TRADE_REQUESTS.T2
    const fields = t2.trade
    if (!fields) throw new Error('T2 has no trade fields')
    const approved: HcRequest = {
      ...t2,
      state: 'Approved',
      trade: { ...fields, giveBp: q.giveBp, getBp: q.getBp, creditBp: q.creditBp },
    }
    const stored = structuredClone(approved.trade)
    const plan = tradeWorking(approved)
    const working = fy27Working('full-month')
    const linesAt = (rows: readonly AssumptionRow[]) =>
      versionLines(
        working,
        lineContext({
          version: working,
          asOf: '2026-07-01',
          positions: plan.positions.filter((r) => r.positionId === 'P-T2'),
          workers: [],
          comp: [],
          reqs: [],
          requests: [],
          assumptions: rows,
          rates: { table: EUR_PLAN_108, use: 'plan', closedThrough: null },
        }),
      )
    const budget = lockedFrom(
      {
        working,
        versionId: 'fy27-budget',
        as: { kind: 'budget', name: 'FY27 Budget' },
        at: '2026-07-01T09:00',
        by: { personId: 'E8001', name: 'Finance', mode: 'finance' },
        lines: linesAt(MUNICH_ROWS),
        assumptions: MUNICH_ROWS,
        rates: EUR_PLAN_108,
        forecast: null,
      },
      [],
    )
    const hash = budget.hash
    applyTrade(plan, approved, '2026-10-05')
    // Working's Munich P4 band moves from €110,000 to €120,000.
    const edited = [
      ...MUNICH_ROWS.filter((r) => r.key !== 'P4|Munich|FY27'),
      assumption('band', 'P4|Munich|FY27', 120_000),
    ]
    const before = linesAt(MUNICH_ROWS).reduce((n, l) => n + l.usd.loaded, 0)
    const after = linesAt(edited).reduce((n, l) => n + l.usd.loaded, 0)
    expect(after).not.toBeCloseTo(before, 2)
    expect(approved.trade).toEqual(stored)
    expect(budget.hash).toBe(hash)
    expect(verifyLock(budget)).toBe(true)
    // A re-quote at the edited band differs, so the stored weights are never re-derived.
    const editedRates = {
      ...TRADE_RATES_11_7,
      bandUsd: (s: SeatType) =>
        s.level === 'P4' && s.location === 'Munich'
          ? (fixtureBandUsd(s) ?? 0) * (120 / 110)
          : fixtureBandUsd(s),
    }
    expect(tradeQuote(T2.ask, TRADE_SEATS, editedRates, tradeContext()).giveBp).not.toBe(stored?.giveBp)
  })
})

describe('block order (11.3)', () => {
  const seat = (positionId: string, over: Partial<TradeSeat>): [string, TradeSeat] => [
    positionId,
    {
      positionId,
      status: 'Planned',
      level: 'P5',
      location: 'San Jose',
      fte: 1,
      workerType: 'Employee',
      orgPositionId: 'P-GTM-MGR',
      businessUnit: 'Go-to-Market',
      start: '2026-11-01',
      acceptedOffer: false,
      pendingRequestId: null,
      inScope: true,
      ...over,
    },
  ]
  const seats = new Map<string, TradeSeat>([
    // A Filled seat in a pending request the viewer cannot see reads `filled` only.
    seat('P-BO-F', { status: 'Filled', start: null, pendingRequestId: 'R-HIDDEN', inScope: false }),
    seat('P-BO-P', { pendingRequestId: 'R-OTHER' }),
    seat('P-BO-X', { level: 'E3' }),
  ])
  const ask: TradeAsk = {
    give: ['P-BO-F', 'P-BO-P', 'P-BO-X'],
    creditUsedBp: 500,
    giveOrgPositionId: null,
    get: {
      level: 'P3',
      location: 'Bengaluru',
      fte: 0.55,
      orgPositionId: 'P-GTM-MGR',
      businessUnit: 'Go-to-Market',
      jobFamily: 'Sales',
      start: '2026-09-01',
      count: 'max',
      partTimeRest: false,
    },
  }

  it('lists every block in TRADE_BLOCK_ORDER, a give seat showing only its first', () => {
    const q = tradeQuote(ask, seats, TRADE_RATES_11_7, {
      ...tradeContext(),
      freezeOn: () => ({ freezeId: 'FZ-1' }),
    })
    expect(q.ok).toBe(false)
    const codes = q.blocks.map((b) => b.code)
    expect(codes.slice(0, 8)).toEqual([
      'filled',
      'no-band',
      'closed-month',
      'frozen',
      'pending-request',
      'part-time-not-allowed',
      'fte-step',
      'credit-over-balance',
    ])
    const index = codes.map((c) => TRADE_BLOCK_ORDER.indexOf(c))
    expect([...index].sort((a, b) => a - b)).toEqual(index)
    expect(q.blocks.filter((b) => b.positionId === 'P-BO-F').map((b) => b.code)).toEqual(['filled'])
    expect(q.blocks.find((b) => b.positionId === 'P-BO-X')?.code).toBe('no-band')
    expect(q.blocks.find((b) => b.positionId === 'P-BO-P')?.code).toBe('pending-request')
  })
})

describe('a give seat with no planned start saves nothing in-year (15.1 R33, lead decision D-NOSTART)', () => {
  const noStart: TradeSeat = {
    ...(TRADE_SEATS.get('P-T1') as TradeSeat),
    positionId: 'P-NS',
    status: 'Open',
    start: null,
  }
  const seats = new Map<string, TradeSeat>([...TRADE_SEATS, ['P-NS', noStart]])
  const askFor = (give: string): TradeAsk => ({
    give: [give],
    creditUsedBp: 0,
    giveOrgPositionId: null,
    get: {
      level: 'P3',
      location: 'Bengaluru',
      fte: 1,
      orgPositionId: 'P-GTM-MGR',
      businessUnit: 'Go-to-Market',
      jobFamily: 'Sales',
      start: '2027-01-01',
      count: 1,
      partTimeRest: false,
    },
  })
  const q = tradeQuote(askFor('P-NS'), seats, TRADE_RATES_11_7, tradeContext())

  it('is still a head given (an approved head), but its weight takes nothing off inYearBp', () => {
    expect(q.give[0]).toMatchObject({ positionId: 'P-NS', approvedHead: true, start: null })
    expect(q.headsDelta).toBe(0)
    // Full-month proration: the get seat from 1 Jan 2027 is 3 of 12 months.
    expect(q.inYearBp).toBeCloseTo(((q.get[0].weightBp as number) * 3) / 12, 6)
  })

  it('control: the same seat planned from 1 Nov 2026 saves its weight × 5/12', () => {
    const planned = tradeQuote(askFor('P-T1'), seats, TRADE_RATES_11_7, tradeContext())
    const give = planned.give[0].weightBp as number
    expect(planned.inYearBp).toBeCloseTo(((planned.get[0].weightBp as number) * 3) / 12 - (give * 5) / 12, 6)
  })
})
