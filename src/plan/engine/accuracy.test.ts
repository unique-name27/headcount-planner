/**
 * Forecast accuracy's arithmetic (docs/PLAN.md 6.9, R14; review SA-1): 1 − |forecast − actual| ÷
 * actual over the months closed since a reforecast locked, on a hand-computed fixture. The one engine
 * Forecast > Variance and Finance > Versions read (src/views/forecast/engine/accuracy.ts) hands its
 * reforecast and run to `accuracyOf` here.
 */
import { describe, expect, it } from 'vitest'
import type { Month } from '@/data/schema'
import type { ForecastMonth, ForecastTable } from '../types'
import { accuracyOf, accuracyRatio } from './accuracy'

/** A forecast month with only what the comparison reads (heads and the two cost parts). */
function month(m: Month, closed: boolean, heads: number, filled: number, band = 0): ForecastMonth {
  const usd = (loaded: number) => ({
    base: loaded,
    bonus: 0,
    burden: 0,
    benefits: 0,
    oneTime: 0,
    vacancy: 0,
    equity: 0,
    loaded,
  })
  return {
    month: m,
    closed,
    heads,
    fte: heads,
    starts: 0,
    knownExits: 0,
    modeledExits: 0,
    backfills: 0,
    cohorts: {} as ForecastMonth['cohorts'],
    cost: { filled: usd(filled), band: usd(band) },
  }
}

describe('accuracyOf: 1 − |forecast − actual| ÷ actual over the months closed since the lock', () => {
  // Stored at a lock with Jun closed: Jul 100 + 20 band, Aug 200 (heads 10, 12), Sep 300.
  const stored: ForecastTable = {
    asOf: '2026-06-30',
    closedThrough: '2026-06',
    months: [
      month('2026-06', true, 9, 90),
      month('2026-07', false, 10, 100, 20),
      month('2026-08', false, 12, 200),
      month('2026-09', false, 13, 300),
    ],
    unfilledAtHorizon: 0,
    yearEnd: { heads: 13, cost: month('2026-09', false, 13, 300).cost.filled },
  }
  // Now: Jun to Aug closed (Jul 130, Aug 220; heads 11, 12), Sep still open.
  const actual = [
    month('2026-06', true, 9, 95),
    month('2026-07', true, 11, 130),
    month('2026-08', true, 12, 220),
    month('2026-09', false, 13, 310),
  ]

  it('compares Jul and Aug only: Σ forecast 320 against Σ actual 350, heads 22 against 23', () => {
    const r = accuracyOf(stored, actual)
    if (!r) throw new Error('No comparison.')
    expect(r.months.map((m) => m.month)).toEqual(['2026-07', '2026-08'])
    expect(r.forecastUsd).toBe(320)
    expect(r.actualUsd).toBe(350)
    // 1 − |320 − 350| ÷ 350 = 1 − 30 ÷ 350 = 0.914285714…
    expect(r.cost).toBeCloseTo(1 - 30 / 350, 12)
    // 1 − |22 − 23| ÷ 23 = 0.956521739…
    expect(r.heads).toBeCloseTo(1 - 1 / 23, 12)
  })

  it('has nothing to say before a month closes after the lock, and never divides by 0', () => {
    expect(
      accuracyOf(
        stored,
        actual.map((m) => ({ ...m, closed: m.month <= '2026-06' })),
      ),
    ).toBeNull()
    const zero = accuracyOf(stored, [month('2026-07', true, 0, 0)])
    expect(zero?.cost).toBeNull()
    expect(zero?.heads).toBeNull()
  })
})

describe('accuracyRatio', () => {
  it('is 1 − |forecast − actual| ÷ actual, and null for an actual of 0', () => {
    expect(accuracyRatio(90, 100)).toBeCloseTo(0.9, 12)
    expect(accuracyRatio(110, 100)).toBeCloseTo(0.9, 12)
    expect(accuracyRatio(5, 0)).toBeNull()
    expect(accuracyRatio(5, 0.004)).toBeNull()
  })
})
