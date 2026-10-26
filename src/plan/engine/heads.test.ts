/**
 * Heads and FTE (docs/PLAN.md 6.1): fixtures H1 and H2, contractors and interns, early assignment
 * ends, and daily average FTE.
 */
import { describe, expect, it } from 'vitest'
import { lineContext, positionLines } from './cost'
import { AS_OF, assignment, fy27Working, position, workerRow } from './fixtures/common'
import { H_EXTRA, H1, H2 } from './fixtures/heads'
import { averageFte, headsOn, isActiveOn, toAssignments } from './heads'
import { planHeadsAt, seatHistories } from './versions'

describe('H1: a 1.0 FTE hire on 16 Sep 2026', () => {
  it('reads its workers row as one assignment', () => {
    expect(toAssignments(H1.workers)).toEqual(H1.assignments)
  })

  it('is 1 head at 30 Sep', () => {
    expect(headsOn(H1.assignments, H1.headsAt.date)).toBe(H1.headsAt.expected)
  })

  it('is 0.5 average FTE for September (15 of 30 days), whatever the proration', () => {
    expect(averageFte(H1.assignments, H1.averageFte.window)).toBeCloseTo(H1.averageFte.expected, 10)
  })

  for (const proration of ['daily', 'half-month', 'full-month'] as const) {
    it(`is 1 plan head at 30 Sep under ${proration} proration, at HRIS pay from the hire date`, () => {
      const version = fy27Working(proration)
      const ctx = lineContext({
        version,
        asOf: AS_OF,
        positions: H1.seatRows,
        workers: H1.workers,
        comp: H1.comp,
        reqs: [],
        requests: [],
        assumptions: [],
        rates: { table: [], use: 'plan', closedThrough: null },
      })
      const sep = positionLines(position('P-H1'), version, ctx).filter((l) => l.month === H1.september.month)
      expect(sep.reduce((n, l) => n + l.heads, 0)).toBe(H1.september.heads)
      const hris = sep.filter((l) => l.basis === 'hris')
      expect(hris).toHaveLength(1)
      expect(hris[0].holderId).toBe('E-H1')
      expect(hris[0].active).toBeCloseTo(H1.september.active[proration], 12)
      expect(sep.filter((l) => l.basis === 'band').every((l) => l.usd.loaded === 0)).toBe(true)
      const seats = seatHistories({
        positions: H1.seatRows,
        assignments: H1.assignments,
        reqs: [],
        requests: [],
      })
      expect(planHeadsAt(seats.values(), '2026-09-30')).toBe(1)
      expect(averageFte(H1.assignments, H1.averageFte.window)).toBeCloseTo(H1.averageFte.expected, 10)
    })
  }
})

describe('H2: a last day of 30 Sep counts (15.1 R19)', () => {
  it('reads the termination date as the assignment end', () => {
    expect(toAssignments(H2.workers)).toEqual(H2.assignments)
  })

  for (const { date, expected } of H2.heads) {
    it(`is ${expected} head at ${date}`, () => {
      expect(headsOn(H2.assignments, date)).toBe(expected)
    })
  }

  it('isActiveOn counts the last day and not the day after', () => {
    expect(isActiveOn({ start: '2025-01-01', end: '2026-09-30' }, '2026-09-30')).toBe(true)
    expect(isActiveOn({ start: '2025-01-01', end: '2026-09-30' }, '2026-10-01')).toBe(false)
    expect(isActiveOn({ start: '2026-09-16', end: null }, '2026-09-15')).toBe(false)
    expect(isActiveOn({ start: '2026-09-16' }, '2026-09-16')).toBe(true)
  })
})

describe('contractors, interns and moves', () => {
  it('ends an assignment at the earlier of assignmentEnd and terminationDate', () => {
    expect(toAssignments(H_EXTRA.workers)).toContainEqual(H_EXTRA.moved)
  })

  it('counts contractors and interns as 0 heads', () => {
    expect(headsOn(toAssignments(H_EXTRA.workers), H_EXTRA.headsAt.date)).toBe(H_EXTRA.headsAt.expected)
  })
})

describe('heads and average FTE (engines A)', () => {
  it('counts a person once even with two active assignments, and on leave too', () => {
    const both = [
      assignment('E-1', 'P-1', '2026-01-01', null, 0.5),
      assignment('E-1', 'P-2', '2026-06-01', null, 0.5),
      assignment('E-2', 'P-3', '2026-01-01'),
    ]
    expect(headsOn(both, '2026-09-30')).toBe(2)
    const onLeave = toAssignments([workerRow('E-L', 'P-L', { onLeave: true, leavePaid: false })])
    expect(headsOn(onLeave, '2026-09-30')).toBe(1)
  })

  it('averages FTE by day over the window, part time and contractors included as they are', () => {
    const list = [
      assignment('E-1', 'P-1', '2026-09-01', null, 0.6),
      assignment('E-2', 'P-2', '2026-09-01', '2026-09-10'),
      { ...assignment('E-C', 'P-C', '2026-01-01'), workerType: 'Contractor' as const },
    ]
    // 0.6 for 30 days + 1.0 for 10 days, over 30 days.
    expect(averageFte(list, { start: '2026-09-01', end: '2026-09-30' })).toBeCloseTo((0.6 * 30 + 10) / 30, 12)
    // Sep to Nov (91 days): 0.6 every day, plus E-2's 10 days.
    expect(averageFte(list, { start: '2026-09-01', end: '2026-11-30' })).toBeCloseTo((0.6 * 91 + 10) / 91, 12)
    expect(averageFte(list, { start: '2026-08-01', end: '2026-08-31' })).toBe(0)
  })

  it('reads blanks: no position is not in plan, no FTE is 1, no assignment start is the hire date', () => {
    const [a] = toAssignments([
      workerRow('E-X', null, { hireDate: '2025-02-03', fte: null, assignmentEnd: '2026-01-31' }),
    ])
    expect(a).toEqual({
      employeeId: 'E-X',
      positionId: null,
      start: '2025-02-03',
      end: '2026-01-31',
      fte: 1,
      workerType: 'Employee',
    })
  })
})
