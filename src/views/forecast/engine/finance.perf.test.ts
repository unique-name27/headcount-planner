/**
 * The Forecast view's budget on a Finance company context (docs/PLAN.md 16.2: the forecast and the
 * bridge in under 300 ms): the whole model (Overview, Variance with every cost cell of every org and
 * window under the guard, the Bridge with its FX windows) against the locked FY27 Budget, for a
 * fresh context once the loaded data's own work is cached (the fiscal year's forecast, each
 * version's lines and their cost members by window, each unit's fold, the bridge's seats and their
 * prices), as it is after the first view on a page. The same budget holds for a Finance context
 * filtered to a business unit for the first time. `bestCostMs` takes the best of a few runs after a
 * warm-up.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { AnalyticsContext } from '@/data/context'
import { bestCostMs } from '@/lib/testBudget'
import { forecastModel } from '.'
import { sample, sampleCtx } from './fixtures'

const BUDGET_MS = 300

beforeAll(() => {
  sample()
  forecastModel(sampleCtx('finance'))
}, 60_000)

/** The model is the real one: against the Budget, with shown cost cells and a bridge. */
function expectWhole(ctx: AnalyticsContext): void {
  expect(ctx.mode).toBe('finance')
  expect(ctx.compare).toMatchObject({ kind: 'version', versionId: 'fy27-budget' })
  const m = forecastModel(ctx)
  expect(m.variance.rows.empty).toBeNull()
  const cost = m.variance.rows.rows.filter((r) => r.measure === 'cost')
  expect(cost.length).toBeGreaterThan(30)
  expect(cost.filter((r) => r.variance != null).length).toBeGreaterThan(10)
  expect(m.bridge.steps.rows.length).toBeGreaterThan(2)
  expect(m.bridge.fxEffectYtd).not.toBeNull()
}

describe('the Forecast model on a Finance context', () => {
  it(`computes for the company against the Budget in under ${BUDGET_MS} ms for a fresh context`, () => {
    const ctx = sampleCtx('finance')
    expect(ctx.isCompany).toBe(true)
    expectWhole(ctx)
    expect(forecastModel(ctx).bridge.fxEffectYtd?.value).not.toBeNull()
    const ms = bestCostMs(() => forecastModel(sampleCtx('finance')))
    expect(ms).toBeLessThan(BUDGET_MS)
  })

  it(`computes for a business unit filtered to for the first time in under ${BUDGET_MS} ms`, () => {
    const units = [...new Set(sample().datasets.positions.map((r) => r.businessUnit))].sort()
    expect(units.length).toBeGreaterThanOrEqual(5)
    expectWhole(sampleCtx('finance', { filters: { businessUnit: [units[0]] } }))
    // Each run filters to a unit no earlier run did (the sample has five).
    let next = 1
    const ms = bestCostMs(() => {
      const unit = units[next++ % units.length]
      forecastModel(sampleCtx('finance', { filters: { businessUnit: [unit] } }))
    })
    expect(ms).toBeLessThan(BUDGET_MS)
  })
})
