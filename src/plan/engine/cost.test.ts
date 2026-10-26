/**
 * Cost per position (docs/PLAN.md 6.3): fixtures C1, C2, C2b, C3 and C4, to the cent; the vacancy
 * allowance of plan versions (15.2 C31, lead decision D-VAC); and C4e, an approved Elimination of a
 * seat whose holder HRIS still shows (15.1 R34, D-ELIM).
 */
import { describe, expect, it } from 'vitest'
import type { PlanLine, WorkingPlan } from '../types'
import { annualLocal, hrisRate, isAllowanceLine, lineContext, positionLines, severanceOf } from './cost'
import {
  assumption,
  FY27_MONTHS,
  fxRates,
  fy27Working,
  hcRequest,
  positionRow,
  workerRow,
} from './fixtures/common'
import { C1, C2, C2B, C3, C4 } from './fixtures/cost'
import { toAssignments } from './heads'
import { reconcile } from './reconcile'
import { applyApproval } from './requests'
import { asksContext, headEffect } from './targets'
import { approvedHeadsOn, type SeatHistory, seatHistories, seatOn } from './versions'

const localLoaded = (l: PlanLine): number =>
  l.local.base + l.local.bonus + l.local.burden + l.local.benefits + l.local.oneTime
const sum = (lines: readonly PlanLine[], f: (l: PlanLine) => number): number =>
  lines.reduce((n, l) => n + f(l), 0)

describe("C1: the spec's Munich P4", () => {
  it('annual: bonus €11,000, burden 0.21 × min(121,000, 90,600) = €19,026, total €140,026', () => {
    const a = annualLocal(C1.input)
    expect(a).toEqual(C1.annual)
    expect(a.base + a.bonus + a.burden + a.benefits).toBeCloseTo(C1.annualTotal, 6)
  })

  for (const proration of ['daily', 'half-month', 'full-month'] as const) {
    it(`September under ${proration}`, () => {
      const want = C1.september[proration]
      const lines = positionLines(C1.seat, fy27Working(proration), lineContext(C1.context(proration)))
      const sep = lines.filter((l) => l.month === C1.september.month)
      expect(sep).toHaveLength(1)
      expect(sep[0].basis).toBe(C1.basis)
      expect(sep[0].holderId).toBeNull()
      expect(sep[0].currency).toBe(C1.currency)
      expect(sep[0].rate).toBe(C1.rate)
      expect(sep[0].active).toBeCloseTo(want.active, 10)
      expect(localLoaded(sep[0])).toBeCloseTo(want.local, 2)
      expect(sep[0].usd.loaded).toBeCloseTo(want.usd, 2)
      expect(sep[0].usd.equity).toBe(0)
    })
  }

  it('FY27 under daily proration: €75,847.42 = $81,915.21', () => {
    const lines = positionLines(C1.seat, fy27Working('daily'), lineContext(C1.context('daily')))
    expect(sum(lines, localLoaded)).toBeCloseTo(C1.fy27Daily.local, 2)
    expect(sum(lines, (l) => l.usd.loaded)).toBeCloseTo(C1.fy27Daily.usd, 2)
  })
})

describe('C2: a 0.6 FTE seat at €100,000 FTE rate', () => {
  it('costs €60,000 base, and the burden cap stays €90,600 (not scaled by FTE)', () => {
    const a = annualLocal(C2.input)
    expect(a.base).toBeCloseTo(C2.annual.base, 6)
    expect(a.bonus).toBeCloseTo(C2.annual.bonus, 6)
    expect(a.burden).toBeCloseTo(C2.annual.burden, 6)
    expect(a.burden).not.toBeCloseTo(C2.scaledCapBurden, 2)
  })

  it('a Filled holder at 0.6 FTE costs the same in a full month', () => {
    const lines = positionLines(C2.filledSeat, fy27Working('daily'), lineContext(C2.filledContext()))
    const oct = lines.filter((l) => l.month === C2.october.month)
    expect(oct).toHaveLength(1)
    expect(oct[0].basis).toBe(C2.october.basis)
    expect(oct[0].holderId).toBe(C2.october.holderId)
    expect(oct[0].local.base).toBeCloseTo(C2.october.base, 2)
    expect(oct[0].local.bonus).toBeCloseTo(C2.october.bonus, 2)
    expect(oct[0].local.burden).toBeCloseTo(C2.october.burden, 2)
  })
})

describe('C2b: an Open 0.6 FTE seat with an accepted offer at €100,000 (FTE rate)', () => {
  const lines = () => positionLines(C2B.seat, fy27Working('daily'), lineContext(C2B.context()))

  it("is costed from the offer's start, never from the position's startDate", () => {
    const oct = lines().filter((l) => l.month === C2B.october.month)
    expect(sum(oct, (l) => l.usd.loaded)).toBe(C2B.october.usdLoaded)
  })

  it("costs €60,000 a year of base, basis 'offer', burden cap unscaled", () => {
    const nov = lines().filter((l) => l.month === C2B.november.month)
    expect(nov).toHaveLength(1)
    expect(nov[0].basis).toBe(C2B.november.basis)
    expect(nov[0].holderId).toBe(C2B.november.holderId)
    expect(nov[0].local.base).toBeCloseTo(C2B.november.base, 2)
    expect(nov[0].local.bonus).toBeCloseTo(C2B.november.bonus, 2)
    expect(nov[0].local.burden).toBeCloseTo(C2B.november.burden, 2)
  })
})

describe('C3: merit', () => {
  for (const c of C3) {
    it(`${c.id}: ${c.note}`, () => {
      const r = hrisRate(c.input)
      expect(r?.rate).toBeCloseTo(c.rate, 6)
      expect(r?.merit).toBeCloseTo(c.merit, 10)
    })
  }
})

describe('C4: severance', () => {
  for (const c of C4.severance) {
    it(`${c.id}: ${c.expected ? `books in ${c.expected.month}` : 'books nothing'}`, () => {
      const item = severanceOf(c.input)
      if (c.expected === null) expect(item).toBeNull()
      else expect(item).toMatchObject(c.expected)
    })
  }

  for (const lastDay of ['2026-12-31', '2026-12-15'] as const) {
    it(`a last day of ${lastDay} books €30,000 one-time in ${C4.booked[lastDay].month} only`, () => {
      const lines = positionLines(C4.seat, fy27Working('daily'), lineContext(C4.context(lastDay)))
      const want = C4.booked[lastDay]
      const booked = lines.filter((l) => l.local.oneTime !== 0)
      expect(booked.map((l) => l.month)).toEqual([want.month])
      expect(booked[0].local.oneTime).toBeCloseTo(want.oneTimeLocal, 2)
    })
  }

  it('a pending elimination books nothing', () => {
    const lines = positionLines(C4.seat, fy27Working('daily'), lineContext(C4.context('pending')))
    expect(lines.filter((l) => l.local.oneTime !== 0)).toEqual([])
  })
})

describe('the vacancy allowance (15.2 C31, lead decision D-VAC)', () => {
  // C4's Filled Munich seat at €120,000 with a 3% vacancy factor, in a plan version (plan rates).
  const withFactor = (use: 'plan' | 'actual-forecast') => {
    const input = C4.context('pending')
    return lineContext({
      ...input,
      requests: [],
      assumptions: [...input.assumptions, assumption('vacancyFactor', '*', 0.03)],
      rates:
        use === 'plan'
          ? input.rates
          : { table: fxRates('EUR', 'actual', FY27_MONTHS, 1.08), use, closedThrough: '2027-03' },
    })
  }

  it('adds one allowance line a month: −3% of the seat line’s base + bonus + burden + benefits', () => {
    const lines = positionLines(C4.seat, fy27Working('daily'), withFactor('plan'))
    for (const month of FY27_MONTHS) {
      const inMonth = lines.filter((l) => l.month === month)
      const seat = inMonth.filter((l) => !isAllowanceLine(l))
      const allowance = inMonth.filter(isAllowanceLine)
      expect(seat, month).toHaveLength(1)
      expect(allowance, month).toHaveLength(1)
      const s = seat[0]
      const recurring = s.local.base + s.local.bonus + s.local.burden + s.local.benefits
      expect(allowance[0].local.vacancy).toBeCloseTo(-0.03 * recurring, 6)
      expect(allowance[0].usd.vacancy).toBeCloseTo(-0.03 * recurring * 1.08, 6)
      expect(allowance[0].usd.loaded).toBe(allowance[0].usd.vacancy)
      expect(allowance[0]).toMatchObject({ heads: 0, fte: 0, active: 0, holderId: null, basis: 'hris' })
      // The seat line's loaded cost stays base + bonus + burden + benefits + one-time.
      expect(s.usd.vacancy).toBe(0)
      expect(s.usd.loaded).toBeCloseTo(
        s.usd.base + s.usd.bonus + s.usd.burden + s.usd.benefits + s.usd.oneTime,
        8,
      )
    }
  })

  it('never on band seats, and never on forecast lines (actual and forecast rates)', () => {
    const c1 = C1.context('daily')
    const band = positionLines(
      C1.seat,
      fy27Working('daily'),
      lineContext({ ...c1, assumptions: [...c1.assumptions, assumption('vacancyFactor', '*', 0.03)] }),
    )
    expect(band.filter(isAllowanceLine)).toEqual([])
    expect(sum(band, (l) => l.usd.loaded)).toBeCloseTo(C1.fy27Daily.usd, 2)
    const forecastLines = positionLines(C4.seat, fy27Working('daily'), withFactor('actual-forecast'))
    expect(forecastLines.filter(isAllowanceLine)).toEqual([])
    expect(forecastLines.every((l) => l.usd.vacancy === 0)).toBe(true)
  })
})

describe('C4e: an approved Elimination ends the seat before HRIS records the exit (15.1 R34, D-ELIM)', () => {
  // C4's seat, its holder with no terminationDate, and the Elimination approved with last day 31 Dec 2026.
  const filled = positionRow('P-C4', { level: 'P5', location: 'Munich', costCenter: '4110-MUC' })
  const workers = [workerRow('E-C4', 'P-C4', { location: 'Munich', costCenter: '4110-MUC' })]
  const pending = hcRequest('R-C4', {
    type: 'Elimination',
    state: 'Submitted',
    positionId: 'P-C4',
    startDate: '2026-12-31',
  })
  const plan: WorkingPlan = {
    versionId: 'fy27-working',
    positions: [filled],
    assignments: toAssignments(workers),
    newPositionId: (r, n) => [r, n].join('-'),
    placeOf: () => null,
    actor: { personId: 'E9001', name: 'HRBP', mode: 'hrbp' },
  }
  const written = applyApproval({ ...pending, state: 'Approved' }, plan, '2026-10-05').flatMap((e) =>
    e.kind === 'position' ? [e.change.row] : [],
  )
  const rows = [filled, ...written]
  const lines = positionLines(
    C4.seat,
    fy27Working('daily'),
    lineContext({ ...C4.context('pending'), positions: rows, workers, requests: [] }),
  )

  it('writes the Eliminated row from 1 Jan 2027 with last day 31 Dec 2026', () => {
    expect(written.map((r) => [r.effectiveDate, r.status, r.endDate])).toEqual([
      ['2027-01-01', 'Eliminated', '2026-12-31'],
    ])
  })

  it('pays the holder through 31 Dec and nothing after, and books severance once, in 2027-01', () => {
    const dec = lines.filter((l) => l.month === '2026-12')
    expect(dec.map((l) => [l.basis, l.holderId, l.heads, l.active])).toEqual([['hris', 'E-C4', 1, 1]])
    for (const l of lines.filter((x) => x.month >= '2027-01')) {
      expect(l.local.base + l.local.bonus + l.local.burden + l.local.benefits, l.month).toBe(0)
      expect(l.heads, l.month).toBe(0)
      expect(l.status, l.month).toBe('Eliminated')
    }
    const booked = lines.filter((l) => l.local.oneTime !== 0)
    expect(booked.map((l) => [l.month, l.basis, l.holderId, l.active])).toEqual([
      ['2027-01', 'hris', 'E-C4', 0],
    ])
    expect(booked[0].local.oneTime).toBeCloseTo(30_000, 2)
  })

  it('has no holder, head or approved head from 1 Jan 2027, so approved heads fall by 1 at approval', () => {
    const before = seatHistories({
      positions: [filled],
      assignments: plan.assignments,
      reqs: [],
      requests: [],
    })
    const after = seatHistories({ positions: rows, assignments: plan.assignments, reqs: [], requests: [] })
    const seat = after.get('P-C4') as SeatHistory
    expect(seatOn(seat, '2026-12-31')).toMatchObject({ status: 'Filled', holderIds: ['E-C4'] })
    expect(seatOn(seat, '2027-02-28')).toMatchObject({
      status: 'Eliminated',
      holderIds: [],
      approvedHead: false,
    })
    expect(seat.assignments.map((a) => [a.start, a.end])).toEqual([['2024-01-01', '2026-12-31']])
    const approvedBefore = approvedHeadsOn(before.values(), '2027-03-31')
    const approvedAfter = approvedHeadsOn(after.values(), '2027-03-31')
    expect([approvedBefore, approvedAfter]).toEqual([1, 0])
    // The pending head effect is exactly the change approval makes (C2, C18).
    const ctx = asksContext({
      positions: [filled],
      assignments: plan.assignments,
      reqs: [],
      requests: [],
      proration: 'daily',
      firstOpenMonth: '2026-10',
      bandUsd: () => 100_000,
    })
    expect(headEffect(pending, () => true, '2027-03-31', ctx)).toBe(approvedAfter - approvedBefore)
  })

  it('reconcile reports the assignment HRIS still shows as assignment-on-open', () => {
    const found = reconcile({ positions: rows, workers }, '2027-01-15')
    expect(found.map((e) => [e.kind, e.positionId])).toEqual([['assignment-on-open', 'P-C4']])
  })
})
