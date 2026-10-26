/**
 * FX (docs/PLAN.md 6.4): fixtures X1 and X2. The bridge's FX step against the same lines is in
 * bridge.test.ts (BX2, and X2 end to end).
 */
import { describe, expect, it } from 'vitest'
import { RATE_OF, X_USD_LINE, X1, X2 } from './fixtures/fx'
import { fxEffect, rateOf } from './fx'

describe('rateOf', () => {
  for (const c of RATE_OF) {
    it(`${c.currency} ${c.set} ${c.month} is ${c.expected}`, () => {
      expect(rateOf(c.table, c.currency, c.set, c.month)).toBe(c.expected)
    })
  }
})

describe('X1: €120,000 in open months, plan 1.08, forecast 1.15', () => {
  it('plan $129,600 and forecast $138,000 (the fixture adds up)', () => {
    const local = X1.lines.reduce((n, l) => n + l.local.base, 0)
    expect(local).toBe(X1.localTotal)
    expect(X1.lines.reduce((n, l) => n + l.usd.loaded, 0)).toBeCloseTo(X1.forecastUsd, 6)
    expect(local * 1.08).toBeCloseTo(X1.planUsd, 6)
  })

  it('FX effect = Σ forecast local × (forecast − plan) = $8,400', () => {
    expect(fxEffect(X1.lines, X1.comparisonRates)).toBeCloseTo(X1.fxEffect, 2)
  })

  it('a USD line adds nothing', () => {
    expect(fxEffect([...X1.lines, X_USD_LINE], X1.comparisonRates)).toBeCloseTo(X1.fxEffect, 2)
  })
})

describe("X2: against the Budget's stored rate, never Working's", () => {
  it("is $8,400 against the Budget's plan 1.08 while Working's plan rate is 1.10", () => {
    const effect = fxEffect(X2.lines, X2.budgetRates)
    expect(effect).toBeCloseTo(X2.fxEffect, 2)
    expect(effect).not.toBeCloseTo(X2.negativeControl, 2)
  })

  it("reading Working's plan rate would give $6,000 (the negative control's value)", () => {
    expect(fxEffect(X2.lines, X2.workingRates)).toBeCloseTo(X2.negativeControl, 2)
  })
})
