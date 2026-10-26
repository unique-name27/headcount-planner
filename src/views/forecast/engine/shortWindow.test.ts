/**
 * Rounded modes never show a one-month window (review RR-3, PLAN 7.3 and C21): at a quarter's first
 * close the quarter to date is that month alone, and after April's close so is the year to date, so
 * HRBP and Leader cost for them reads "—" with the reason, as month and custom periods do. Two closed
 * months show; Finance reads any window.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { ROUNDED_SHORT_WINDOW_NOTE } from '@/cost/fit'
import { ctxAs, leakSample, personaOf } from '@/testkit/sample'
import { prepare as preparePlan } from '@/views/plan/engine/base'
import { planCost } from '@/views/plan/engine/cost'
import { prepare } from './base'
import { fxEffectOf } from './bridge'

beforeAll(() => {
  leakSample()
}, 60_000)

const hrbpAt = (asOf: string, period: 'qtd' | 'ytd') =>
  ctxAs('hrbp', personaOf(leakSample(), 'hrbp-se').employeeId, {
    unit: 'Silicon Engineering',
    asOfOverride: asOf,
    filters: { period },
  })

describe('a to-date window of one closed month in a rounded mode (RR-3)', () => {
  it('the quarter to date at 31 Jul 2026 reads "—" with the reason; at 31 Aug 2026 it shows', () => {
    const july = planCost(preparePlan(hrbpAt('2026-07-31', 'qtd')))
    // Before the fix the unit's July alone showed ($7.6M).
    expect(july.byUnit?.total.totalUsd ?? null).toBeNull()
    expect(july.byUnit?.reason).toBe(ROUNDED_SHORT_WINDOW_NOTE)
    const august = planCost(preparePlan(hrbpAt('2026-08-31', 'qtd')))
    expect(august.byUnit?.total.totalUsd).not.toBeNull()
  })

  it('the year to date after April’s close reads "—", the tile and the FX effect included', () => {
    const ctx = hrbpAt('2026-04-30', 'ytd')
    const c = planCost(preparePlan(ctx))
    expect(c.byUnit?.reason).toBe(ROUNDED_SHORT_WINDOW_NOTE)
    // Loaded cost YTD covers April alone.
    expect(c.ytd?.figure.total.totalUsd ?? null).toBeNull()
    expect(c.ytd?.figure.reason).toBe(ROUNDED_SHORT_WINDOW_NOTE)
    const p = prepare(ctx)
    expect(fxEffectOf(p, ['2026-04']).value).toBeNull()
  })

  it('Finance reads a one-month quarter to date', () => {
    const fin = ctxAs('finance', personaOf(leakSample(), 'finance-fpa').employeeId, {
      asOfOverride: '2026-07-31',
      filters: { period: 'qtd' },
    })
    expect(planCost(preparePlan(fin)).byUnit?.total.totalUsd).not.toBeNull()
  })
})
