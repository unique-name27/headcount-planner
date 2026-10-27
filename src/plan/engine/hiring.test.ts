/**
 * Hiring progress (docs/PLAN.md 9.7, changes C36 and C37; docs/CONTRACTS-HIRING.md readings H1 to H24
 * and F1 to F8): fixture HG1 exactly, one case per function with a negative control, and the edge
 * cases: negative open to hire ("Over by n"), no closed month, a quarter with no seat, future starts
 * on the as-of day and after FY end, eliminated and On hold seats, a seat an approved internal move
 * holds (SC-6), known and modeled exits from the forecast engine (reused, never re-modeled), FY28
 * shown, and C37's future starts (signed offers only, never a modeled start or an Open seat without an
 * offer) and moves in (HG8, M(q)).
 */
import { describe, expect, it } from 'vitest'
import { monthKey, shiftMonth } from '@/data/fiscal'
import type { ISODate, Month } from '@/data/schema'
import { F1 } from './fixtures/forecast'
import { forecast } from './forecast'
import {
  acceptedBy,
  approvedBy,
  attritionRate,
  closedMonths,
  currentHeads,
  expectedExits,
  firstHeadDay,
  futureStartsIn,
  type HiringInput,
  type HiringMonth,
  type HiringOffer,
  type HiringPerson,
  type HiringQuarter,
  type HiringSeat,
  type HiringTable,
  hiringMonths,
  hiringOf,
  hiringPaces,
  hiringQuarters,
  hiringTable,
  hiringVelocity,
  monthsLeft,
  monthsToClose,
  movesBy,
  neededPace,
  openSeatsBy,
  PACE_EPSILON,
  paceStatus,
  perMonth,
} from './hiring'
import {
  event,
  filledSeat,
  forecastMonth,
  HG1,
  HG2,
  HG3,
  HG4,
  HG5,
  HG6,
  HG8,
  headsAt,
  hiringInput,
  moveIn,
  offer,
  person,
  seat,
} from './hiring.fixtures'

const q = (t: HiringTable, n: 1 | 2 | 3 | 4): HiringQuarter => t.quarters[n - 1]
const actualMonth = (month: Month, hires: number, exits: number): HiringMonth => ({
  month,
  kind: 'actual',
  hires,
  exits,
  net: hires - exits,
  hireIds: [],
  exitIds: [],
})

/* ───────────── HG1 ───────────── */

describe('HG1, the plan’s fixture (9.7), exactly', () => {
  const r = hiringOf(HG1.input)
  const t = r.table

  it('A(Q3) = 8, H = 7, S(Q3) = 1, O(Q3) = 0', () => {
    expect(q(t, 3).approved).toBe(8)
    expect(t.heads.total).toBe(7)
    expect(q(t, 3).accepted).toBe(1)
    expect(q(t, 3).acceptedIds).toEqual(HG1.q3.acceptedIds)
    expect(q(t, 3).open).toBe(0)
  })

  it('A(Q4) = 10, S(Q4) = 1, O(Q4) = 2; seat view 3 open seats − 1 not in plan = 2; headline 2', () => {
    const q4 = q(t, 4)
    expect([q4.approved, q4.accepted, q4.open]).toEqual([10, 1, 2])
    expect(q4.openSeatIds).toEqual(HG1.q4.openSeatIds)
    expect(q4.openSeats).toBe(3)
    expect((q4.openSeats ?? 0) - t.heads.notInPlan).toBe(q4.open)
    expect(q4.seatView).toEqual({
      openSeats: 3,
      notInPlan: 1,
      elsewhere: 0,
      inEndedSeats: 0,
      inEndedSeatIds: [],
      otherStarts: 0,
      otherStartIds: [],
      rest: 0,
    })
    expect(t.openFyEnd).toBe(HG1.openFyEnd)
    expect(t.acceptedToCome).toBe(HG1.acceptedToCome)
    // No move in (C37): M(q) is 0 in every quarter ahead, so O(q) = A(q) − H − S(q).
    for (const n of [2, 3, 4] as const) {
      expect(q(t, n).movesIn, `Q${n}`).toBe(HG1.movesIn)
      expect(q(t, n).open, `Q${n}`).toBe(
        (q(t, n).approved ?? 0) - t.heads.total - (q(t, n).accepted ?? 0) - (q(t, n).movesIn ?? 0),
      )
    }
    expect(t.movesToCome).toBe(0)
  })

  it('O(Q2) = 6 − 7 − 0 = −1: over by 1, the person not in plan, never clamped', () => {
    const q2 = q(t, 2)
    expect([q2.approved, t.heads.total, q2.accepted, q2.open]).toEqual([6, 7, 0, -1])
    expect(q2.openSeats).toBe(0)
    expect(q2.seatView?.notInPlan).toBe(1)
    expect(q2.toReachPlan).toBe(HG1.q2.toReachPlan)
    expect(q2.paceStatus).toBe('nothing-to-hire')
    expect(q2.behindBy).toBeNull()
  })

  it('H = 7: 6 in approved seats and 1 not in plan', () => {
    expect(t.heads).toMatchObject(HG1.heads)
    expect(t.heads.personIds).toHaveLength(7)
  })

  it('Q1 is history: actual heads at 30 Jun, its hires and exits; its ahead fields are empty', () => {
    const q1 = q(t, 1)
    expect(q1).toMatchObject(HG1.q1)
    expect(q1.exitIds).toEqual([])
    for (const k of ['approved', 'accepted', 'open', 'openSeats', 'newToHire', 'toReachPlan'] as const)
      expect(q1[k], k).toBeNull()
    expect(q1.approvedIds).toEqual([])
    expect(q1.seatView).toBeNull()
    // Ahead columns leave the history fields empty.
    expect([q(t, 3).actualHeads, q(t, 3).hires, q(t, 3).exits]).toEqual([null, null, null])
  })

  it('new to hire 0, 1 and 2: the first quarter ahead against open now (−1)', () => {
    expect(t.openNow).toBe(HG1.openNow)
    expect([q(t, 2).newToHire, q(t, 3).newToHire, q(t, 4).newToHire]).toEqual([0, 1, 2])
  })

  it('expected exits, to reach plan, months left, needed pace and status, exact', () => {
    for (const [n, want] of [
      [2, HG1.q2],
      [3, HG1.q3],
      [4, HG1.q4],
    ] as const) {
      const c = q(t, n)
      expect(c.expectedExits, `Q${n}`).toMatchObject(want.expectedExits)
      expect(c.toReachPlan, `Q${n}`).toBe(want.toReachPlan)
      expect(c.monthsLeft, `Q${n}`).toBe(want.monthsLeft)
      expect(c.paceStatus, `Q${n}`).toBe(want.paceStatus)
    }
    expect(q(t, 3).neededPace).toBe(HG1.q3.neededPace)
    expect(q(t, 4).neededPace).toBe(HG1.q4.neededPace)
    expect(q(t, 2).neededPace).toBe(-0.9375)
  })

  it('velocity: hires 3, 1, 0 and exits 0, 1, 1 in the last 3 closed months; pace 1.33, exit pace 0.67, net 0.67', () => {
    const p = r.velocity.paces
    expect(p.hires3).toBeCloseTo(4 / 3, 12)
    expect(p.exits3).toBeCloseTo(2 / 3, 12)
    expect(p.net3).toBeCloseTo(2 / 3, 12)
    expect(p.hires3?.toFixed(2)).toBe('1.33')
    expect(p.exits3?.toFixed(2)).toBe('0.67')
    expect(p.net3?.toFixed(2)).toBe('0.67')
    expect(p.net3).toBe((p.hires3 ?? 0) - (p.exits3 ?? 0))
    expect(p.hires6).toBeCloseTo(HG1.paces.hires6, 12)
    expect(p.exits6).toBeCloseTo(HG1.paces.exits6, 12)
    expect(p.net6).toBeCloseTo(HG1.paces.net6, 12)
  })

  it('attrition in heads: 3 exits over the 12 closed months ÷ 65/12 average heads = 36/65', () => {
    const p = r.velocity.paces
    expect(p.exits12).toBe(3)
    expect(p.averageHeads12).toBeCloseTo(HG1.paces.averageHeads12, 12)
    expect(p.attrition).toBeCloseTo(HG1.paces.attrition, 12)
    expect(((p.attrition ?? 0) * 100).toFixed(1)).toBe('55.4')
  })

  it('months to close 3.0: O(FY end) 2 ÷ net pace 2/3', () => {
    expect(r.monthsToClose.closing).toBe(true)
    expect(r.monthsToClose.months).toBeCloseTo(HG1.monthsToClose, 12)
    expect(r.monthsToClose.months?.toFixed(1)).toBe('3.0')
  })

  it('velocity months: Sep 2025 to Aug 2026 actual, then the forecast to Mar 2027', () => {
    const months = r.velocity.months
    const actual = months.filter((m) => m.kind === 'actual')
    expect(actual.map((m) => m.month)).toEqual(Array.from({ length: 12 }, (_, i) => shiftMonth('2025-09', i)))
    expect(actual.map((m) => m.hires)).toEqual(HG1.hiresByMonth)
    expect(actual.map((m) => m.exits)).toEqual(HG1.exitsByMonth)
    expect(actual.every((m) => m.net === m.hires - m.exits)).toBe(true)
    expect(actual[9].hireIds).toEqual(['E-HG-04', 'E-HG-05', 'E-HG-06'])
    // The hire in May 2024 is before the window.
    expect(months.flatMap((m) => m.hireIds)).not.toContain('E-HG-13')
    const ahead = months.filter((m) => m.kind === 'forecast')
    expect(ahead.map((m) => m.month)).toEqual(HG1.input.forecast.map((f) => f.month))
    expect(ahead.map((m) => m.month)).toEqual([...HG1.ahead.months])
    // C37: the months ahead show future starts (the signed offer in October), whole people, and the
    // expected exits (E-HG-05's known exit in November plus the modeled exits).
    expect(ahead.map((m) => m.hires)).toEqual([...HG1.ahead.hires])
    expect(ahead.map((m) => m.startIds)).toEqual(HG1.ahead.startIds.map((x) => [...x]))
    expect(ahead.map((m) => m.exits)).toEqual([...HG1.ahead.exits])
    const nov = ahead.find((m) => m.month === '2026-11')
    expect(nov).toMatchObject({ hires: 0, exits: 1.0625, exitIds: ['E-HG-05'], hireIds: [] })
    expect(nov?.net).toBe(-1.0625)
    // Every future start of the year is in a month ahead: they add up to S(FY end).
    expect(ahead.reduce((a, m) => a + m.hires, 0)).toBe(t.acceptedToCome)
    // Closed months carry no future start.
    expect(actual.every((m) => (m.startIds ?? []).length === 0)).toBe(true)
  })
})

/* ───────────── the functions ───────────── */

describe('hiringQuarters (H1)', () => {
  it('frames FY27 April to March, labelled Q1 to Q4', () => {
    expect(hiringQuarters('FY27', '2026-09-30', '2026-09').map((f) => [f.label, f.start, f.end])).toEqual([
      ['Q1', '2026-04-01', '2026-06-30'],
      ['Q2', '2026-07-01', '2026-09-30'],
      ['Q3', '2026-10-01', '2026-12-31'],
      ['Q4', '2027-01-01', '2027-03-31'],
    ])
  })

  it('a quarter ending on the last close’s month-end is history: 30 Sep 2026, September closed', () => {
    const kinds = hiringQuarters('FY27', '2026-09-30', '2026-09').map((f) => f.kind)
    expect(kinds).toEqual(['history', 'history', 'ahead', 'ahead'])
  })

  it('negative control: with August the last close, Q2 holds the as-of date and is ahead', () => {
    const kinds = hiringQuarters('FY27', '2026-09-30', '2026-08').map((f) => f.kind)
    expect(kinds).toEqual(['history', 'ahead', 'ahead', 'ahead'])
  })

  it('a quarter that ended before the as-of date is history while its last month is open', () => {
    expect(hiringQuarters('FY27', '2026-10-05', '2026-08').map((f) => f.kind)).toEqual([
      'history',
      'history',
      'ahead',
      'ahead',
    ])
    // Before the first close: Q1 is over, Q2 ends on the as-of date (ahead, no month left).
    expect(hiringQuarters('FY27', '2026-09-30', null).map((f) => f.kind)).toEqual([
      'history',
      'ahead',
      'ahead',
      'ahead',
    ])
  })

  it('FY28 at 30 Sep 2026: every quarter ahead', () => {
    const frames = hiringQuarters('FY28', '2026-09-30', '2026-09')
    expect(frames.map((f) => f.kind)).toEqual(['ahead', 'ahead', 'ahead', 'ahead'])
    expect(frames.map(({ label, start, end }) => ({ label, start, end }))).toEqual(HG3.frames)
  })

  it('marks a history quarter closed only when a close covers its end (review HN-8, HU-3)', () => {
    // September closed: Q1 and Q2 closed; the quarters ahead are not.
    expect(hiringQuarters('FY27', '2026-09-30', '2026-09').map((f) => f.closed)).toEqual([
      true,
      true,
      false,
      false,
    ])
    // Before the first close, Q1 is over but not closed.
    const none = hiringQuarters('FY27', '2026-09-30', null)
    expect([none[0].kind, none[0].closed]).toEqual(['history', false])
    // As-of 15 Apr 2027 with September the last close: Q3 and Q4 are over, not closed.
    const late = hiringQuarters('FY27', '2027-04-15', '2026-09')
    expect(late.map((f) => [f.kind, f.closed])).toEqual([
      ['history', true],
      ['history', true],
      ['history', false],
      ['history', false],
    ])
  })
})

describe('firstHeadDay (H2)', () => {
  const asOf = '2026-09-30'
  it('Filled is now, before any date the seat carries', () => {
    expect(
      firstHeadDay(filledSeat('P', { acceptedStart: '2026-11-02', plannedStart: '2027-01-04' }), asOf),
    ).toBe(asOf)
  })
  it('else the accepted start, before the planned or target start', () => {
    expect(firstHeadDay(seat('P', { acceptedStart: '2026-11-02', plannedStart: '2026-10-01' }), asOf)).toBe(
      '2026-11-02',
    )
  })
  it('else the planned or target start, even one already past', () => {
    expect(firstHeadDay(seat('P', { plannedStart: '2027-01-04' }), asOf)).toBe('2027-01-04')
    expect(firstHeadDay(seat('P', { plannedStart: '2026-07-01' }), asOf)).toBe('2026-07-01')
  })
  it('a seat with no date counts from now', () => {
    expect(firstHeadDay(seat('P'), asOf)).toBe(asOf)
    // Negative control: a date given is never replaced by now.
    expect(firstHeadDay(seat('P', { plannedStart: '2027-02-01' }), asOf)).not.toBe(asOf)
  })
})

describe('approvedBy', () => {
  const asOf = '2026-09-30'
  const seats = [
    filledSeat('F'),
    seat('A', { acceptedStart: '2026-12-31' }),
    seat('B', { plannedStart: '2027-01-01' }),
    seat('N'),
  ]
  it('counts a seat whose first head day is on or before the quarter end, not after', () => {
    expect(approvedBy(seats, asOf, '2026-12-31')).toEqual(['F', 'A', 'N'])
    expect(approvedBy(seats, asOf, '2027-03-31')).toEqual(['F', 'A', 'B', 'N'])
    expect(approvedBy(seats, asOf, asOf)).toEqual(['F', 'N'])
  })
  it('lastApprovedDay takes a seat out of later quarters; its last day counts', () => {
    const ending = [
      filledSeat('E1', { lastApprovedDay: '2026-12-31' }),
      filledSeat('E2', { lastApprovedDay: '2026-12-30' }),
    ]
    expect(approvedBy(ending, asOf, '2026-12-31')).toEqual(['E1'])
    expect(approvedBy(ending, asOf, '2027-03-31')).toEqual([])
    expect(approvedBy(ending, asOf, asOf)).toEqual(['E1', 'E2'])
  })
})

describe('currentHeads', () => {
  const seats = [filledSeat('P-1'), filledSeat('P-2'), seat('P-3')]
  it('splits H into people in approved seats and people not in plan; elsewhere is in neither part', () => {
    const h = currentHeads(
      [person('E-1', 'P-1'), person('E-2', 'P-2'), person('E-N', null), person('E-X', 'P-HELD')],
      seats,
    )
    expect(h).toEqual({
      total: 4,
      inApprovedSeats: 2,
      notInPlan: 1,
      elsewhere: 1,
      personIds: ['E-1', 'E-2', 'E-N', 'E-X'],
      notInPlanIds: ['E-N'],
    })
    expect(h.inApprovedSeats + h.notInPlan).toBe(h.total - h.elsewhere)
  })
  it('counts a person once however many records name them, in an approved seat when any record is', () => {
    const h = currentHeads([person('E-1', 'P-HELD'), person('E-1', 'P-1'), person('E-1', null)], seats)
    expect([h.total, h.inApprovedSeats, h.notInPlan, h.elsewhere]).toEqual([1, 1, 0, 0])
    // Negative control: two people are two heads.
    expect(currentHeads([person('E-1', 'P-1'), person('E-2', 'P-1')], seats).total).toBe(2)
  })
})

describe('acceptedBy', () => {
  const asOf = '2026-09-30'
  const offers = [
    offer('R-ASOF', 'P', '2026-09-30'),
    offer('R-NEXT', 'P', '2026-10-01'),
    offer('R-END', 'P', '2026-12-31'),
    offer('R-JAN', 'P', '2027-01-01'),
    offer('R-FY28', 'P', '2027-04-05'),
  ]
  it('counts a start after the as-of date and on or before the quarter end', () => {
    expect(acceptedBy(offers, asOf, '2026-12-31')).toEqual(['R-NEXT', 'R-END'])
  })
  it('an accepted start on the as-of day has started: in no S(q)', () => {
    for (const end of ['2026-09-30', '2026-12-31', '2027-03-31'])
      expect(acceptedBy(offers, asOf, end)).not.toContain('R-ASOF')
  })
  it('an accepted start after FY end is in no quarter of the year', () => {
    expect(acceptedBy(offers, asOf, '2027-03-31')).toEqual(['R-NEXT', 'R-END', 'R-JAN'])
    // Negative control: FY28's Q1 has it.
    expect(acceptedBy(offers, asOf, '2027-06-30')).toContain('R-FY28')
  })
  it('counts each req once', () => {
    expect(
      acceptedBy([offer('R-1', 'P', '2026-10-01'), offer('R-1', 'P', '2026-10-01')], asOf, '2026-12-31'),
    ).toEqual(['R-1'])
  })
})

describe('futureStartsIn (C37)', () => {
  const asOf = '2026-09-30'
  const offers = [
    offer('R-ASOF', 'P', '2026-09-30'),
    offer('R-OCT', 'P', '2026-10-01'),
    offer('R-OCT', 'P', '2026-10-01'),
    offer('R-NOV', 'Q', '2026-11-30'),
    offer('R-FY28', 'P', '2027-04-05'),
  ]
  it('counts the signed offers starting in the month, after the as-of date, one per req', () => {
    expect(futureStartsIn(offers, asOf, '2026-10')).toEqual(['R-OCT'])
    expect(futureStartsIn(offers, asOf, '2026-11')).toEqual(['R-NOV'])
    expect(futureStartsIn(offers, asOf, '2027-03')).toEqual([])
  })
  it('a start on the as-of day has started: in no month ahead', () => {
    expect(futureStartsIn(offers, asOf, '2026-09')).toEqual([])
    // Negative control: the day after is a future start.
    expect(futureStartsIn([offer('R-1', 'P', '2026-10-01')], asOf, '2026-10')).toEqual(['R-1'])
  })
  it('a mid-month as-of date counts only the rest of its month', () => {
    const mid = '2026-10-15'
    expect(
      futureStartsIn([offer('A', 'P', '2026-10-15'), offer('B', 'P', '2026-10-16')], mid, '2026-10'),
    ).toEqual(['B'])
  })
})

describe('movesBy (C37)', () => {
  const asOf = '2026-09-30'
  const moves = [
    moveIn('M-ASOF', 'P', '2026-09-30'),
    moveIn('M-OCT', 'P', '2026-10-01'),
    moveIn('M-OCT', 'P', '2026-10-01'),
    moveIn('M-JAN', 'P', '2027-01-04'),
  ]
  it('counts the moves dated after the as-of date and on or before the end, one per move', () => {
    expect(movesBy(moves, asOf, '2026-12-31')).toEqual(['M-OCT'])
    expect(movesBy(moves, asOf, '2027-03-31')).toEqual(['M-OCT', 'M-JAN'])
  })
  it('a move on the as-of day is in effect, never ahead', () => {
    expect(movesBy(moves, asOf, '2027-03-31')).not.toContain('M-ASOF')
  })
})

describe('openSeatsBy', () => {
  const asOf = '2026-09-30'
  const seats = [
    filledSeat('F'),
    seat('O', { plannedStart: '2026-11-02' }),
    seat('S', { acceptedStart: '2026-10-05' }),
    seat('L', { acceptedStart: '2027-01-04' }),
    seat('P', { plannedStart: '2027-02-01' }),
  ]
  const offers = [offer('R-S', 'S', '2026-10-05'), offer('R-L', 'L', '2027-01-04')]
  it('lists seats in A(q), not Filled, with no accepted start counted in S(q)', () => {
    expect(openSeatsBy(seats, offers, asOf, '2026-12-31')).toEqual(['O'])
    expect(openSeatsBy(seats, offers, asOf, '2027-03-31')).toEqual(['O', 'P'])
  })
  it('negative control: without its offer, an accepted-start seat is open', () => {
    expect(openSeatsBy(seats, [], asOf, '2026-12-31')).toEqual(['O', 'S'])
  })
})

describe('expectedExits (H5)', () => {
  const asOf = '2026-09-30'
  const exits = [
    event('E-ASOF', 'P', '2026-09-30'),
    event('E-OCT', 'P', '2026-10-01'),
    event('E-END', 'P', '2026-12-31'),
    event('E-JAN', 'P', '2027-01-01'),
  ]
  const months = [
    forecastMonth('2026-12', 1.0484),
    forecastMonth('2026-09', 9),
    forecastMonth('2026-10', 0.0596),
    forecastMonth('2027-01', 0.5),
  ]
  it('known: last days after the as-of date and on or before the quarter end', () => {
    const e = expectedExits(exits, [], asOf, '2026-12-31')
    expect(e.knownIds).toEqual(['E-OCT', 'E-END'])
    expect(e.known).toBe(2)
  })
  it('modeled: the months whose month-end falls in that span, exact and unrounded', () => {
    const e = expectedExits(exits, months, asOf, '2026-12-31')
    expect(e.modeled).toBe(0.0596 + 1.0484)
    expect(e.modeled).not.toBe(1.1)
    expect(e.total).toBe(2 + e.modeled)
  })
  it('a mid-month as-of date takes its own month’s modeled exits', () => {
    expect(expectedExits([], months, '2026-10-15', '2026-12-31').modeled).toBe(0.0596 + 1.0484)
    expect(expectedExits([], months, '2026-10-31', '2026-12-31').modeled).toBe(1.0484)
  })
  it('nothing at a quarter end on the as-of date', () => {
    expect(expectedExits(exits, months, asOf, asOf)).toEqual({ known: 0, knownIds: [], modeled: 0, total: 0 })
  })
})

describe('expected exits from the forecast engine (reused, never re-modeled)', () => {
  const f = forecast(F1.input)
  const asOf = F1.input.asOf
  const open = f.months.filter((m) => m.month > monthKey(asOf))
  const months = open.map((m) => forecastMonth(m.month, m.modeledExits))
  const exits = F1.input.workers
    .filter((w) => w.terminationDate != null)
    .map((w) => event(w.employeeId, w.positionId ?? null, w.terminationDate as ISODate))
  const q3 = open.filter((m) => m.month <= '2026-12')

  it('known: Dana on 15 Oct; modeled: the forecast’s own October to December, summed in order', () => {
    const e = expectedExits(exits, months, asOf, '2026-12-31')
    expect(e.knownIds).toEqual(['E-DANA'])
    let modeled = 0
    for (const m of q3) modeled += m.modeledExits
    expect(e.modeled).toBe(modeled)
    expect(q3[0].modeledExits).toBeCloseTo(F1.october.modeledExits, 6)
    expect(q3[1].modeledExits).toBeCloseTo(F1.november.modeledExits, 6)
  })

  it('known + modeled equal the forecast’s known and modeled exits over the same months', () => {
    for (const end of ['2026-12-31', '2027-03-31']) {
      const e = expectedExits(exits, months, asOf, end)
      let own = 0
      for (const m of open) if (m.month <= monthKey(end)) own += m.knownExits + m.modeledExits
      expect(e.total, end).toBeCloseTo(own, 12)
    }
  })

  it('negative control: Dana is never modeled as well (October is 0.0596, not 1.0596)', () => {
    const oct = expectedExits(exits, months, asOf, '2026-10-31')
    expect(oct.total).toBeCloseTo(1 + F1.october.modeledExits, 6)
    expect(oct.total).not.toBeCloseTo(1 + F1.negativeControlOctober, 2)
  })

  it('the table: to hire to reach plan by Q3 is Dana’s backfill plus the modeled exits', () => {
    const input = hiringInput({
      lastClose: null,
      seats: F1.input.positions.map((p) => filledSeat(p.positionId)),
      people: F1.input.workers.map((w) => person(w.employeeId, w.positionId ?? null)),
      exits,
      forecast: months,
    })
    const t = hiringTable(input, null)
    const c = q(t, 3)
    expect([c.approved, t.heads.total, c.accepted, c.open]).toEqual([100, 100, 0, 0])
    expect(c.toReachPlan).toBe(c.expectedExits?.total)
    expect(c.expectedExits?.known).toBe(1)
  })
})

describe('monthsLeft (H6)', () => {
  it('counts month-ends after the as-of date up to the quarter end: at a month-end and mid-month', () => {
    expect(monthsLeft('2026-09-30', '2026-12-31')).toBe(3)
    expect(monthsLeft('2026-10-15', '2026-12-31')).toBe(3)
    expect(monthsLeft('2026-10-01', '2026-12-31')).toBe(3)
    expect(monthsLeft('2026-10-31', '2026-12-31')).toBe(2)
    expect(monthsLeft('2026-09-30', '2027-03-31')).toBe(6)
    expect(monthsLeft('2026-09-30', '2028-03-31')).toBe(18)
  })
  it('is 0 when the quarter ends on or before the as-of date', () => {
    expect(monthsLeft('2026-09-30', '2026-09-30')).toBe(0)
    expect(monthsLeft('2026-12-31', '2026-12-31')).toBe(0)
    expect(monthsLeft('2026-10-05', '2026-09-30')).toBe(0)
  })
  it('counts only whole month-ends before an end that is not one', () => {
    expect(monthsLeft('2026-09-30', '2026-12-15')).toBe(2)
  })
})

describe('neededPace', () => {
  it('divides to reach plan by the months left', () => {
    expect(neededPace(3.625, 7)).toBe(3.625 / 7)
    expect(neededPace(-1, 2)).toBe(-0.5)
  })
  it('is null at 0 months (shown "—")', () => {
    expect(neededPace(2, 0)).toBeNull()
    // Negative control: 1 month is a pace.
    expect(neededPace(2, 1)).toBe(2)
  })
})

describe('paceStatus (H7)', () => {
  it('nothing to hire at a to reach plan of 0 or below', () => {
    expect(paceStatus(0, 0, 1)).toEqual({ status: 'nothing-to-hire', behindBy: null })
    expect(paceStatus(-0.5, -0.1, null)).toEqual({ status: 'nothing-to-hire', behindBy: null })
  })
  it('on pace when the 3-month pace meets or beats the needed pace', () => {
    expect(paceStatus(3, 1, 1)).toEqual({ status: 'on-pace', behindBy: null })
    expect(paceStatus(3, 1, 4 / 3)).toEqual({ status: 'on-pace', behindBy: null })
  })
  it('behind by the difference, unrounded', () => {
    expect(paceStatus(3, 1.5, 0.8)).toEqual({ status: 'behind', behindBy: 1.5 - 0.8 })
  })
  it('no status with no month left or no closed month to pace by', () => {
    expect(paceStatus(2, null, 1)).toEqual({ status: null, behindBy: null })
    expect(paceStatus(2, 0.5, null)).toEqual({ status: null, behindBy: null })
  })
  it('float residue in summed exits is no hire and no gap', () => {
    const residue = 0.1 + 0.2 - 0.3
    expect(residue).toBeGreaterThan(0)
    expect(residue).toBeLessThan(PACE_EPSILON)
    expect(paceStatus(residue, residue, 0).status).toBe('nothing-to-hire')
    expect(paceStatus(0.9, 0.1 + 0.2, 0.3).status).toBe('on-pace')
    // Negative control: a real gap is behind.
    expect(paceStatus(0.9, 0.31, 0.3).status).toBe('behind')
  })
})

describe('closedMonths', () => {
  it('is the last n months to the last close, oldest first, across years', () => {
    expect(closedMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02'])
    expect(closedMonths('2026-09', 12)).toHaveLength(12)
    expect(closedMonths('2026-09', 12)[0]).toBe('2025-10')
  })
  it('is empty before the first close', () => {
    expect(closedMonths(null, 12)).toEqual([])
    expect(closedMonths('2026-09', 0)).toEqual([])
  })
})

describe('perMonth, attritionRate and hiringPaces (H8)', () => {
  it('perMonth averages the last n values, null under n', () => {
    expect(perMonth([9, 3, 1, 0], 3)).toBe(4 / 3)
    expect(perMonth([3, 1], 3)).toBeNull()
    expect(perMonth([], 3)).toBeNull()
  })
  it('attritionRate divides by the average heads; null with no heads or an average of 0', () => {
    expect(attritionRate(3, [headsAt('2026-01', 4), headsAt('2026-02', 6)])).toBe(0.6)
    expect(attritionRate(3, [])).toBeNull()
    expect(attritionRate(0, [headsAt('2026-01', 0)])).toBeNull()
  })
  it('a pace needs its 3 or 6 closed months', () => {
    const two = [actualMonth('2026-08', 1, 0), actualMonth('2026-09', 2, 1)]
    expect(hiringPaces(two, [])).toMatchObject({ hires3: null, exits3: null, net3: null, hires6: null })
    const four = [actualMonth('2026-06', 0, 0), ...two, actualMonth('2026-10', 3, 0)]
    expect(hiringPaces(four, [])).toMatchObject({ hires3: 2, exits3: 1 / 3, hires6: null, net6: null })
  })
  it('forecast months never pace', () => {
    const months: HiringMonth[] = [
      actualMonth('2026-07', 1, 0),
      actualMonth('2026-08', 1, 0),
      actualMonth('2026-09', 1, 0),
      { ...actualMonth('2026-10', 9, 9), kind: 'forecast' },
    ]
    expect(hiringPaces(months, []).hires3).toBe(1)
  })
  it('attrition needs the 12 closed months with heads at each month-end', () => {
    const twelve = Array.from({ length: 12 }, (_, i) =>
      actualMonth(shiftMonth('2025-10', i), 0, i === 0 ? 2 : 0),
    )
    const heads = twelve.map((m) => headsAt(m.month, 10))
    expect(hiringPaces(twelve, heads)).toMatchObject({ exits12: 2, averageHeads12: 10, attrition: 0.2 })
    // Eleven closed months: no attrition.
    expect(hiringPaces(twelve.slice(1), heads).attrition).toBeNull()
    expect(hiringPaces(twelve.slice(1), heads).exits12).toBeNull()
    // A month-end without heads: no average, no attrition.
    const gap = hiringPaces(twelve, heads.slice(1))
    expect([gap.exits12, gap.averageHeads12, gap.attrition]).toEqual([2, null, null])
  })
})

describe('monthsToClose (H9)', () => {
  it('closing: O(FY end) ÷ the net pace', () => {
    expect(monthsToClose(2, 0.5)).toEqual({ closing: true, months: 4 })
  })
  it('not closing when the net pace is 0, below 0 or missing', () => {
    for (const net of [0, -0.5, null]) expect(monthsToClose(2, net)).toEqual({ closing: false, months: null })
  })
  it('0 when nothing is open to hire, whatever the pace', () => {
    for (const net of [0.5, 0, -1, null]) {
      expect(monthsToClose(0, net)).toEqual({ closing: true, months: 0 })
      expect(monthsToClose(-3, net)).toEqual({ closing: true, months: 0 })
    }
  })
})

/* ───────────── edge cases ───────────── */

describe('HG2: eliminated and On hold seats, and a seat an approved internal move holds', () => {
  const r = hiringOf(HG2.input)
  const t = r.table

  it('the seats R1 leaves out appear in no count, and the mover counts in H elsewhere, in neither part', () => {
    expect(t.heads).toMatchObject(HG2.heads)
    const listed = t.quarters.flatMap((c) => [...c.approvedIds, ...c.openSeatIds])
    for (const id of HG2.leftOut) expect(listed, id).not.toContain(id)
    expect(t.openNow).toBe(HG2.openNow)
  })

  it('Q2 is history with the eliminated seat’s last holder as its exit', () => {
    expect(q(t, 2)).toMatchObject(HG2.q2)
  })

  it('Q3: the Elimination effective in Q3 is out, the one whose last day is the Q3 end is in; behind by 0.03 a month', () => {
    const c = q(t, 3)
    expect(c.approvedIds).toEqual(HG2.q3.approvedIds)
    expect([c.open, c.newToHire, c.monthsLeft]).toEqual([HG2.q3.open, HG2.q3.newToHire, HG2.q3.monthsLeft])
    expect(c.openSeatIds).toEqual(HG2.q3.openSeatIds)
    expect(c.seatView).toMatchObject(HG2.q3.seatView)
    expect(c.seatView?.inEndedSeatIds).toEqual(HG2.q3.inEndedSeatIds)
    expect(c.expectedExits).toMatchObject(HG2.q3.expectedExits)
    expect(c.toReachPlan).toBe(HG2.q3.toReachPlan)
    expect(r.velocity.paces.hires3).toBe(HG2.pace3)
    expect(c.paceStatus).toBe('behind')
    expect(c.behindBy).toBeCloseTo(HG2.q3.behindBy, 12)
  })

  it('Q4: over by 1, the eliminated seat’s holder counting in H until their last day', () => {
    const c = q(t, 4)
    expect(c.approvedIds).toEqual(HG2.q4.approvedIds)
    expect([c.open, c.newToHire]).toEqual([HG2.q4.open, HG2.q4.newToHire])
    expect(c.seatView).toMatchObject(HG2.q4.seatView)
    expect(c.expectedExits).toMatchObject(HG2.q4.expectedExits)
    expect(c.toReachPlan).toBe(HG2.q4.toReachPlan)
    expect(c.paceStatus).toBe('on-pace')
    expect(t.openFyEnd).toBe(-1)
    expect(r.monthsToClose).toEqual({ closing: true, months: 0 })
  })

  it('an Elimination of a Filled seat whose holder leaves on its last approved day moves O(q) by −1 and to reach plan by 0', () => {
    const without = hiringTable(
      {
        ...HG2.input,
        seats: HG2.input.seats.filter((s) => s.positionId !== 'P-EL-1'),
        people: HG2.input.people.filter((p) => p.personId !== 'E-EL-1'),
        exits: HG2.input.exits.filter((e) => e.personId !== 'E-EL-1'),
      },
      HG2.pace3,
    )
    for (const n of [3, 4] as const) {
      expect(q(t, n).open, `Q${n}`).toBe((q(without, n).open ?? 0) - 1)
      expect(q(t, n).toReachPlan, `Q${n}`).toBe(q(without, n).toReachPlan)
    }
  })

  it('the move moves no O(q): its receiving seat counts in A(q) and its person in H', () => {
    const noMove = hiringTable(
      {
        ...HG2.input,
        seats: HG2.input.seats.filter((s) => s.positionId !== 'P-EL-4'),
        people: HG2.input.people.filter((p) => p.personId !== 'E-EL-5'),
      },
      HG2.pace3,
    )
    for (const n of [3, 4] as const) expect(q(t, n).open, `Q${n}`).toBe(q(noMove, n).open)
  })
})

describe('HG3: FY28 shown, every quarter ahead', () => {
  const r = hiringOf(HG3.input)
  const t = r.table

  it('approved, accepted and open by each FY28 quarter end; months left 9, 12, 15 and 18', () => {
    expect(t.quarters.map((c) => c.kind)).toEqual(['ahead', 'ahead', 'ahead', 'ahead'])
    expect(t.quarters.map((c) => c.approved)).toEqual(HG3.approved)
    expect(t.quarters.map((c) => c.accepted)).toEqual(HG3.accepted)
    expect(t.quarters.map((c) => c.open)).toEqual(HG3.open)
    expect(t.quarters.map((c) => c.monthsLeft)).toEqual(HG3.monthsLeft)
    expect(t.quarters.map((c) => c.expectedExits?.modeled)).toEqual(HG3.modeled)
  })

  it('new to hire: the first FY28 quarter against open to hire on 31 Mar 2027, the day before it starts (HN-4)', () => {
    expect(t.openNow).toBe(HG3.openNow)
    // By 31 Mar 2027: 3 Filled and the FY27 Q3 accepted start, less 3 heads and that start.
    expect(t.openBefore).toEqual({ on: '2027-03-31', open: 0 })
    expect(t.quarters.map((c) => c.newToHire)).toEqual(HG3.newToHire)
  })

  it('an FY27 accepted start counts by every FY28 quarter end; one after FY28’s end in none', () => {
    for (const c of t.quarters) expect(c.acceptedIds).toEqual(['R-F28-4'])
    expect(q(t, 4).approvedIds).not.toContain('P-F28-7')
    expect(t.openFyEnd).toBe(HG3.openFyEnd)
    expect(t.acceptedToCome).toBe(HG3.acceptedToCome)
  })

  it('velocity: the 12 closed months, then the forecast from October 2026 to March 2028', () => {
    const months = r.velocity.months
    const actual = months.filter((m) => m.kind === 'actual')
    const ahead = months.filter((m) => m.kind === 'forecast')
    expect(actual).toHaveLength(HG3.velocityMonths.actual)
    expect(ahead).toHaveLength(HG3.velocityMonths.forecast)
    expect(months[0].month).toBe(HG3.velocityMonths.first)
    expect(months[months.length - 1].month).toBe(HG3.velocityMonths.last)
    // The closed month and the month after FY28's end are left out; the rest is in month order.
    expect(ahead.map((m) => m.month)).not.toContain('2026-09')
    expect(ahead.map((m) => m.month)).not.toContain('2028-04')
    expect(ahead.map((m) => m.month)).toEqual([...ahead.map((m) => m.month)].sort())
    expect(r.monthsToClose).toEqual({ closing: true, months: HG3.monthsToClose })
  })
})

describe('HG7: new to hire in a later fiscal year counts only what comes due in its quarter (HN-4)', () => {
  // FY28 shown at 30 Sep 2026: 2 Filled; P-L-3 planned 1 Feb 2027 and P-L-5 starting 15 Mar 2027 on an
  // accepted offer (both due in FY27 Q4); P-L-4 planned 3 May 2027 (FY28 Q1).
  const seats: HiringSeat[] = [
    filledSeat('P-L-1'),
    filledSeat('P-L-2'),
    seat('P-L-3', { plannedStart: '2027-02-01' }),
    seat('P-L-4', { plannedStart: '2027-05-03' }),
    seat('P-L-5', { acceptedStart: '2027-03-15', plannedStart: '2027-03-01' }),
  ]
  const base = hiringInput({
    fiscalYear: 'FY28',
    seats,
    people: [person('E-L-1', 'P-L-1'), person('E-L-2', 'P-L-2')],
    offers: [offer('R-L-5', 'P-L-5', '2027-03-15')],
  })
  const fy28 = hiringTable(base, null)
  const fy27 = hiringTable({ ...base, fiscalYear: 'FY27' }, null)

  it('FY28 Q1 counts against O on 31 Mar 2027 (4 − 2 − 1 = 1): only P-L-4 is new in it', () => {
    expect(fy28.openNow).toBe(0)
    expect(fy28.openBefore).toEqual({ on: '2027-03-31', open: 1 })
    expect(fy28.quarters.map((c) => c.open)).toEqual([2, 2, 2, 2])
    expect(fy28.quarters.map((c) => c.newToHire)).toEqual([1, 0, 0, 0])
  })

  it('FY27’s new to hire and FY28’s add up to O(FY28 end) − open now, each seat counted once', () => {
    const sum = (t: HiringTable) => t.quarters.reduce((a, c) => a + (c.newToHire ?? 0), 0)
    expect(sum(fy27) + sum(fy28)).toBe(fy28.openFyEnd - fy28.openNow)
    expect(sum(fy27)).toBe(1)
  })

  it('negative control: the quarter holding the as-of date counts against open now', () => {
    // FY27 at 30 Sep 2026: the first quarter ahead (Q3) starts the day after the as-of date.
    expect(fy27.openBefore).toEqual({ on: '2026-09-30', open: fy27.openNow })
    const mid = hiringTable({ ...base, fiscalYear: 'FY27', asOf: '2026-10-15' }, null)
    expect(mid.openBefore).toEqual({ on: '2026-10-15', open: mid.openNow })
    // Read the old way (against open now), FY28 Q1 would hold FY27 Q4's two seats as well.
    expect((fy28.quarters[0].open ?? 0) - fy28.openNow).toBe(2)
  })
})

describe('HG4: no closed month yet', () => {
  const r = hiringOf(HG4.input)
  const t = r.table

  it('no pace, no attrition, and not closing while something is open', () => {
    const p = r.velocity.paces
    expect(Object.values(p).every((v) => v === null)).toBe(true)
    expect(r.velocity.months.every((m) => m.kind === 'forecast')).toBe(true)
    expect(r.velocity.months).toHaveLength(HG4.forecastMonths)
    expect(t.openFyEnd).toBe(HG4.openFyEnd)
    expect(r.monthsToClose).toEqual({ closing: false, months: null })
  })

  it('Q1 has ended: history, its heads unknown with no close, its hires and exits counted', () => {
    expect(q(t, 1)).toMatchObject(HG4.q1)
  })

  it('Q2 ends on the as-of date: open now, no month left, no needed pace and no status', () => {
    const c = q(t, 2)
    expect([c.kind, c.approved, c.open, c.monthsLeft, c.neededPace, c.toReachPlan, c.paceStatus]).toEqual([
      HG4.q2.kind,
      HG4.q2.approved,
      HG4.q2.open,
      HG4.q2.monthsLeft,
      HG4.q2.neededPace,
      HG4.q2.toReachPlan,
      HG4.q2.status,
    ])
    expect(t.openNow).toBe(HG4.openNow)
    expect(c.newToHire).toBe(0)
  })

  it('later quarters have a needed pace but nothing to pace it by', () => {
    for (const [n, want] of [
      [3, HG4.q3],
      [4, HG4.q4],
    ] as const) {
      const c = q(t, n)
      expect([c.approved, c.open, c.monthsLeft, c.toReachPlan]).toEqual([
        want.approved,
        want.open,
        want.monthsLeft,
        want.toReachPlan,
      ])
      expect(c.neededPace).toBe(want.toReachPlan / want.monthsLeft)
      expect(c.paceStatus).toBeNull()
    }
  })

  it('with nothing open, months to close is 0 even with no pace', () => {
    const none = hiringOf({ ...HG4.input, seats: HG4.input.seats.slice(0, 2) })
    expect(none.table.openFyEnd).toBe(0)
    expect(none.monthsToClose).toEqual({ closing: true, months: 0 })
  })
})

describe('HG5: a quarter with no seat', () => {
  const r = hiringOf(HG5.input)
  const t = r.table

  it('Q3 has no approved seat: every count 0, nothing to hire', () => {
    const c = q(t, 3)
    expect(c).toMatchObject(HG5.q3)
    expect(c.approvedIds).toEqual([])
    expect(c.seatView?.rest).toBe(0)
  })

  it('Q4 has the team: 3 approved, 1 accepted start, 2 open seats', () => {
    expect(q(t, 4)).toMatchObject(HG5.q4)
    expect(t.openFyEnd).toBe(HG5.openFyEnd)
  })

  it('attrition is null at 0 average heads; a pace of 0 is not closing', () => {
    expect(r.velocity.paces).toMatchObject({ exits12: 0, averageHeads12: 0, attrition: null, net3: 0 })
    expect(r.monthsToClose).toEqual({ closing: false, months: null })
  })

  it('an empty scope is all zeros and closes at 0', () => {
    const e = hiringOf(hiringInput())
    for (const c of e.table.quarters.filter((x) => x.kind === 'ahead'))
      expect([c.approved, c.accepted, c.open, c.openSeats, c.newToHire, c.toReachPlan]).toEqual([
        0, 0, 0, 0, 0, 0,
      ])
    expect(e.table.heads.total).toBe(0)
    expect(e.monthsToClose).toEqual({ closing: true, months: 0 })
  })
})

describe('HG6: accepted starts on the as-of day, on FY end and after it', () => {
  const t = hiringTable(HG6.input, null)

  it('a start on the as-of day is in H, not in S(q): never counted twice', () => {
    expect(q(t, 3)).toMatchObject({ approvedIds: HG6.q3.approved, acceptedIds: HG6.q3.accepted, open: 0 })
    expect(t.heads.personIds).toContain('E-AS-4')
    // Negative control: a rule counting starts from the as-of day would count E-AS-4 twice (over by 1).
    const c = q(t, 3)
    expect((c.approved ?? 0) - t.heads.total - acceptedBy(HG6.input.offers, '2026-09-29', c.end).length).toBe(
      -1,
    )
  })

  it('a start on the fiscal year end counts in Q4; one after it in no quarter, seat and req alike', () => {
    const c = q(t, 4)
    expect(c).toMatchObject({
      approvedIds: HG6.q4.approved,
      acceptedIds: HG6.q4.accepted,
      open: HG6.q4.open,
      openSeatIds: HG6.q4.openSeatIds,
    })
    for (const x of t.quarters) {
      expect(x.approvedIds).not.toContain('P-AS-2')
      expect(x.acceptedIds).not.toContain('R-AS-2')
    }
    // A(Q4) is R1's approved heads less the seat whose start falls after FY end.
    expect(c.approved).toBe(HG6.r1Heads - 1)
    expect(t.openFyEnd).toBe(HG6.openFyEnd)
    expect(t.acceptedToCome).toBe(HG6.acceptedToCome)
  })
})

describe('a past fiscal year shown', () => {
  it('is all history, with nothing left to hire in it', () => {
    const t = hiringTable({ ...HG1.input, fiscalYear: 'FY26', asOf: '2026-08-31' }, null)
    expect(t.quarters.map((c) => c.kind)).toEqual(['history', 'history', 'history', 'history'])
    expect([t.openFyEnd, t.acceptedToCome]).toEqual([0, 0])
    // Jan 2026's hire and exit are in FY26 Q4.
    expect([q(t, 4).hires, q(t, 4).exits, q(t, 4).actualHeads]).toEqual([1, 1, 5])
  })
})

/* ───────────── the seat view identity ───────────── */

/** A small seeded generator (mulberry32), so every run sweeps the same cases. */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const DAYS: readonly ISODate[] = [
  '2026-05-15',
  '2026-09-30',
  '2026-10-01',
  '2026-10-15',
  '2026-11-30',
  '2026-12-31',
  '2027-01-01',
  '2027-02-14',
  '2027-03-31',
]
const AS_OFS: readonly [ISODate, Month][] = [
  ['2026-09-30', '2026-09'],
  ['2026-10-15', '2026-09'],
  ['2026-08-31', '2026-08'],
]

interface Case {
  input: HiringInput
  elsewhere: number
  /** Filled seats with one holder each that stop being approved heads, by the day they last are. */
  ending: ISODate[]
  /** Accepted starts on Filled seats (counted in S(q), on no open seat). */
  stray: ISODate[]
}

/** Seats and people at random; messy adds people on held seats, ending Filled seats and stray starts. */
function generated(seed: number, messy: boolean): Case {
  const next = rng(seed)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]
  const [asOf, lastClose] = pick(AS_OFS)
  const seats: HiringSeat[] = []
  const people: HiringPerson[] = []
  const offers: HiringOffer[] = []
  const ending: ISODate[] = []
  const stray: ISODate[] = []
  const filled = Math.floor(next() * 8)
  for (let i = 0; i < filled; i++) {
    const id = `P-F${i}`
    const last = messy && next() < 0.3 ? pick(DAYS.filter((d) => d >= asOf)) : null
    if (last) ending.push(last)
    seats.push(filledSeat(id, { lastApprovedDay: last }))
    people.push(person(`E-F${i}`, id))
    if (messy && next() < 0.2) {
      const start = pick(DAYS.filter((d) => d > asOf))
      offers.push(offer(`R-X${i}`, id, start))
      stray.push(start)
    }
  }
  const unfilled = Math.floor(next() * 7)
  for (let i = 0; i < unfilled; i++) {
    const id = `P-U${i}`
    const roll = next()
    if (roll < 0.35) {
      const start = pick(DAYS)
      seats.push(seat(id, { acceptedStart: start, plannedStart: pick([null, ...DAYS]) }))
      offers.push(offer(`R-U${i}`, id, start))
    } else {
      const last = next() < 0.3 ? pick(DAYS) : null
      seats.push(seat(id, { plannedStart: roll < 0.85 ? pick(DAYS) : null, lastApprovedDay: last }))
    }
  }
  const notInPlan = Math.floor(next() * 4)
  for (let i = 0; i < notInPlan; i++) people.push(person(`E-N${i}`, null))
  const elsewhere = messy ? Math.floor(next() * 3) : 0
  for (let i = 0; i < elsewhere; i++) people.push(person(`E-H${i}`, `P-HELD-${i}`))
  return { input: hiringInput({ asOf, lastClose, seats, people, offers }), elsewhere, ending, stray }
}

describe('the seat view identity (a sweep over generated seats)', () => {
  it('O(q) = open seats − not in plan when elsewhere is 0 and every Filled seat has one holder', () => {
    let checked = 0
    for (let seed = 1; seed <= 300; seed++) {
      const { input } = generated(seed, false)
      const t = hiringTable(input, null)
      expect(t.heads.elsewhere).toBe(0)
      for (const c of t.quarters) {
        if (c.kind !== 'ahead') continue
        expect(c.open, `seed ${seed} ${c.label}`).toBe((c.openSeats ?? 0) - t.heads.notInPlan)
        expect(c.seatView, `seed ${seed} ${c.label}`).toMatchObject({
          elsewhere: 0,
          inEndedSeats: 0,
          otherStarts: 0,
          rest: 0,
        })
        checked++
      }
    }
    expect(checked).toBeGreaterThan(600)
  })

  it('each term that breaks it is named: elsewhere, Filled seats ending before the quarter end, stray starts', () => {
    let moved = 0
    for (let seed = 1; seed <= 300; seed++) {
      const { input, elsewhere, ending, stray } = generated(seed, true)
      const t = hiringTable(input, null)
      for (const c of t.quarters) {
        if (c.kind !== 'ahead') continue
        const out = ending.filter((d) => d < c.end).length
        const starts = stray.filter((d) => d > input.asOf && d <= c.end).length
        const where = `seed ${seed} ${c.label}`
        expect(c.seatView, where).toMatchObject({
          elsewhere,
          inEndedSeats: out,
          otherStarts: starts,
          rest: 0,
        })
        expect(c.open, where).toBe((c.openSeats ?? 0) - t.heads.notInPlan - elsewhere - out - starts)
        if (elsewhere + out + starts > 0) moved++
      }
    }
    expect(moved).toBeGreaterThan(100)
  })

  it('what is left (rest) is a Filled seat with no holder counted or a second holder on one seat', () => {
    const base = hiringInput({
      seats: [filledSeat('P-1'), filledSeat('P-2')],
      people: [person('E-1', 'P-1')],
    })
    expect(q(hiringTable(base, null), 4).seatView?.rest).toBe(1)
    const twice = { ...base, people: [person('E-1', 'P-1'), person('E-2', 'P-2'), person('E-3', 'P-2')] }
    const c = q(hiringTable(twice, null), 4)
    expect(c.seatView?.rest).toBe(-1)
    const v = c.seatView
    expect(c.open).toBe(
      (v?.openSeats ?? 0) -
        (v?.notInPlan ?? 0) -
        (v?.elsewhere ?? 0) -
        (v?.inEndedSeats ?? 0) -
        (v?.otherStarts ?? 0) +
        (v?.rest ?? 0),
    )
  })
})

/* ───────────── purity and heads only ───────────── */

function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    Object.freeze(x)
    for (const v of Object.values(x)) deepFreeze(v)
  }
  return x
}

/** Every key in a value, nested. */
function keysOf(x: unknown, out: Set<string> = new Set()): Set<string> {
  if (x && typeof x === 'object')
    for (const [k, v] of Object.entries(x)) {
      if (!Array.isArray(x)) out.add(k)
      keysOf(v, out)
    }
  return out
}

/* ───────────── C37: future starts are signed offers only; moves in are M(q) ───────────── */

describe('future starts count signed offers only (C37)', () => {
  it('never count an Open seat without an offer, a Planned seat, or a move in', () => {
    const r = hiringOf(HG1.input)
    // P-HG-08 (Open, no offer) and the Planned P-HG-09 and P-HG-10 are open to hire, never future starts.
    for (const n of [3, 4] as const) expect(q(r.table, n).acceptedIds).toEqual(['R-HG-07'])
    expect(q(r.table, 4).openSeatIds).toEqual(['P-HG-08', 'P-HG-09', 'P-HG-10'])
    // A seat's planned or target start in a month ahead adds no hire to it.
    const nov = r.velocity.months.find((m) => m.month === '2026-11')
    expect(nov?.hires).toBe(0)
    // A move in is no future start, in the table or the months ahead.
    const m = hiringOf(HG8.input)
    expect(m.table.acceptedToCome).toBe(HG8.acceptedToCome)
    for (const n of [3, 4] as const)
      for (const id of q(m.table, n).acceptedIds) expect(id.startsWith('move:'), id).toBe(false)
    expect(m.velocity.months.filter((x) => x.kind === 'forecast').map((x) => x.hires)).toEqual([
      ...HG8.aheadHires,
    ])
  })

  it('never read a modeled start: the forecast months carry modeled exits only', () => {
    expect(Object.keys(forecastMonth('2026-10', 0.5)).sort()).toEqual(['modeledExits', 'month'])
    // Control: an offer in a month ahead is a future start there.
    const withOffer = hiringOf({
      ...HG1.input,
      offers: [...HG1.input.offers, offer('R-HG-08', 'P-HG-08', '2026-11-02')],
    })
    expect(withOffer.velocity.months.find((m) => m.month === '2026-11')?.hires).toBe(1)
  })
})

describe('HG8: moves in, M(q) (C37)', () => {
  const r = hiringOf(HG8.input)
  const t = r.table

  it('O(Q3) = 4 − 2 − 1 − 1 = 0: the move in is its own term, not a future start', () => {
    const c = q(t, 3)
    expect([c.approved, t.heads.total, c.accepted, c.movesIn, c.open]).toEqual([
      HG8.q3.approved,
      2,
      HG8.q3.accepted,
      HG8.q3.movesIn,
      HG8.q3.open,
    ])
    expect(c.acceptedIds).toEqual(HG8.q3.acceptedIds)
    expect(c.moveInIds).toEqual(HG8.q3.moveInIds)
    expect(c.openSeatIds).toEqual(HG8.q3.openSeatIds)
    expect(c.seatView).toMatchObject(HG8.q3.seatView)
    expect(c.newToHire).toBe(HG8.q3.newToHire)
  })

  it('O(Q4) = 6 − 2 − 1 − 3 = 0; the seat view names the move onto a Filled seat', () => {
    const c = q(t, 4)
    expect([c.approved, c.accepted, c.movesIn, c.open]).toEqual([
      HG8.q4.approved,
      HG8.q4.accepted,
      HG8.q4.movesIn,
      HG8.q4.open,
    ])
    expect(c.moveInIds).toEqual(HG8.q4.moveInIds)
    expect(c.openSeatIds).toEqual(HG8.q4.openSeatIds)
    expect(c.seatView).toMatchObject(HG8.q4.seatView)
    expect(c.seatView?.otherStartIds).toEqual(HG8.q4.otherStartIds)
    // The seat view works out to open to hire.
    const sv = c.seatView
    expect(
      (sv?.openSeats ?? 0) -
        (sv?.notInPlan ?? 0) -
        (sv?.elsewhere ?? 0) -
        (sv?.inEndedSeats ?? 0) -
        (sv?.otherStarts ?? 0) +
        (sv?.rest ?? 0),
    ).toBe(c.open)
    expect(c.toReachPlan).toBe(HG8.q4.toReachPlan)
    expect([t.openNow, t.openFyEnd, t.acceptedToCome, t.movesToCome]).toEqual([
      HG8.openNow,
      HG8.openFyEnd,
      HG8.acceptedToCome,
      HG8.movesToCome,
    ])
  })

  it('negative control: without the moves the seats they take are open to hire', () => {
    const bare = hiringTable({ ...HG8.input, moves: [] }, null)
    expect(q(bare, 3).open).toBe(HG8.withoutMoves.q3Open)
    expect(q(bare, 4).open).toBe(HG8.withoutMoves.q4Open)
    expect(q(bare, 4).openSeatIds).toEqual([...HG8.withoutMoves.q4OpenSeatIds])
    expect(q(bare, 4).movesIn).toBe(0)
  })

  it('counts the moves on the day before a later year starts (new to hire, HN-4)', () => {
    const fy28 = hiringTable({ ...HG8.input, fiscalYear: 'FY28' as HiringInput['fiscalYear'] }, null)
    // On 31 Mar 2027: 6 approved − 2 heads − 1 future start − 3 moves in = 0.
    expect(fy28.openBefore).toEqual({ on: '2027-03-31', open: 0 })
  })

  it('history quarters and a past year carry no move', () => {
    expect([q(t, 1).movesIn, q(t, 2).movesIn]).toEqual([null, null])
    expect(q(t, 1).moveInIds).toEqual([])
  })
})

describe('pure and heads only', () => {
  const inputs = [HG1.input, HG2.input, HG3.input, HG4.input, HG5.input, HG6.input, HG8.input]

  it('never mutates its input (frozen), and the same input gives the same output', () => {
    for (const input of inputs) {
      const frozen = deepFreeze(structuredClone(input))
      const before = JSON.stringify(frozen)
      const a = hiringOf(frozen)
      expect(JSON.stringify(frozen)).toBe(before)
      expect(hiringOf(frozen)).toEqual(a)
      expect(hiringOf(structuredClone(input))).toEqual(a)
      expect(hiringVelocity(frozen)).toEqual(a.velocity)
      expect(hiringMonths(frozen)).toEqual(a.velocity.months)
    }
  })

  it('sums in month order whatever order the forecast, heads and events come in', () => {
    const reversed: HiringInput = {
      ...HG1.input,
      forecast: [...HG1.input.forecast].reverse(),
      headsAt: [...HG1.input.headsAt].reverse(),
      hires: [...HG1.input.hires].reverse(),
    }
    const a = hiringOf(HG1.input)
    const b = hiringOf(reversed)
    expect(b.table.quarters.map((c) => c.expectedExits)).toEqual(a.table.quarters.map((c) => c.expectedExits))
    expect(b.velocity.paces).toEqual(a.velocity.paces)
    expect(b.velocity.months.map((m) => [m.month, m.hires, m.exits])).toEqual(
      a.velocity.months.map((m) => [m.month, m.hires, m.exits]),
    )
  })

  it('carries heads, dates and IDs only: no key names an amount, a rate, a band, pay or leave', () => {
    const AMOUNT_KEY =
      /amount|usd|local|cost|pay|salary|band|bonus|fee|relocation|offerbase|currency|rate|leave|loaded/i
    for (const input of inputs) {
      const keys = [...keysOf(hiringOf(input))]
      expect(keys.length).toBeGreaterThan(40)
      for (const k of keys) expect(k).not.toMatch(AMOUNT_KEY)
      expect(JSON.stringify(hiringOf(input))).not.toMatch(/[$€£₹₪¥]|\d{1,3}(,\d{3})+/)
    }
  })
})
