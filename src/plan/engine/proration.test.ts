/**
 * Proration (docs/PLAN.md 6.2, 15.1 R20): fixtures PR1 to PR13, and the readings at a month's edges.
 */
import { describe, expect, it } from 'vitest'
import { FY27_MONTHS as FY27 } from './fixtures/common'
import { IN_YEAR_CASES, PRORATION_CASES } from './fixtures/proration'
import { activeFraction, inYearFraction } from './proration'

describe('activeFraction', () => {
  for (const c of PRORATION_CASES) {
    it(`${c.id}: ${c.note}`, () => {
      expect(activeFraction(c.method, c.month, c.start, c.lastDay)).toBeCloseTo(c.expected, 10)
    })
  }
})

describe('inYearFraction', () => {
  for (const c of IN_YEAR_CASES) {
    it(`${c.id}: ${c.note}`, () => {
      expect(inYearFraction(c.method, c.months, c.start, c.lastDay)).toBeCloseTo(c.expected, 10)
    })
  }
})

describe('readings (engines A): month edges', () => {
  it('a span from the 1st to the month’s last day covers it whole under every method', () => {
    for (const m of ['daily', 'half-month', 'full-month'] as const)
      expect(activeFraction(m, '2026-09', '2026-09-01', '2026-09-30'), m).toBe(1)
  })

  it('a start on the 1st is no edge: only the last day counts under half-month', () => {
    expect(activeFraction('half-month', '2026-09', '2026-09-01', '2026-09-20')).toBe(1)
    expect(activeFraction('half-month', '2026-09', '2026-09-01', '2026-09-10')).toBe(0.5)
  })

  it('a last day on the month’s last day is no edge: only the start counts under half-month', () => {
    expect(activeFraction('half-month', '2026-09', '2026-09-03', '2026-09-30')).toBe(1)
    expect(activeFraction('half-month', '2026-09', '2026-09-16', '2026-09-30')).toBe(0.5)
  })

  it('a seat changing hands at a month boundary counts 1 on each side', () => {
    for (const m of ['daily', 'half-month', 'full-month'] as const) {
      expect(activeFraction(m, '2026-09', null, '2026-09-30'), m).toBe(1)
      expect(activeFraction(m, '2026-10', '2026-10-01', null), m).toBe(1)
      expect(activeFraction(m, '2026-10', null, '2026-09-30'), m).toBe(0)
    }
  })

  it('an empty span (last day before start) is 0', () => {
    expect(activeFraction('daily', '2026-09', '2026-09-20', '2026-09-10')).toBe(0)
  })

  it('daily counts February and a leap year by their own days', () => {
    expect(activeFraction('daily', '2027-02', '2027-02-15', null)).toBeCloseTo(14 / 28, 12)
    expect(activeFraction('daily', '2028-02', '2028-02-15', null)).toBeCloseTo(15 / 29, 12)
  })

  it('a span covering the whole year is 12/12, and a span outside it is 0', () => {
    expect(inYearFraction('daily', FY27, null, null)).toBe(1)
    expect(inYearFraction('half-month', FY27, '2027-04-01', null)).toBe(0)
    expect(inYearFraction('daily', FY27, '2026-04-01', '2026-09-30')).toBe(0.5)
  })
})
