/**
 * Forecast accuracy (cost) on Finance > Versions (docs/PLAN.md 6.9, R14, section 12; review SA-1):
 * the sample's FY27 Q1 Reforecast against the actual for Jul, Aug and Sep 2026, the company's only,
 * shown in Finance and HR admin and hidden in the rounded modes and Manager mode. The arithmetic's
 * own fixture is src/plan/engine/accuracy.test.ts; Forecast > Variance reads this engine too
 * (src/views/forecast/engine/accuracy.test.ts).
 */
import { describe, expect, it } from 'vitest'
import { kpisInMode } from '@/access/numbers'
import type { Mode } from '@/data/schema'
import { calcProblems, resolveCalc } from '@/drill/calc'
import { sampleCtx } from '@/testkit/sample'
import { ID as FORECAST_ID } from '@/views/forecast/metrics'
import { ACCURACY_COMPANY_NOTE, forecastAccuracyOf } from './accuracy'
import { financeModel } from './index'

describe('Forecast accuracy (cost) on Finance > Versions', () => {
  const tileOf = (mode: Mode, opts: Parameters<typeof sampleCtx>[1] = {}) => {
    const ctx = sampleCtx(mode, opts)
    const kpis = financeModel(ctx).versions.kpis
    return {
      ctx,
      tile: kpis.find((k) => k.metricId === FORECAST_ID.accuracyCost),
      shown: kpisInMode(ctx.access, kpis).some((k) => k.metricId === FORECAST_ID.accuracyCost),
    }
  }

  it('reads FY27 Q1 Reforecast against the actual for Jul to Sep 2026, its card ending on the value', () => {
    for (const mode of ['finance', 'hr-admin'] as const) {
      const { ctx, tile, shown } = tileOf(mode)
      expect(shown, mode).toBe(true)
      const acc = forecastAccuracyOf(ctx, 'FY27')
      expect(acc?.versionId).toBe('fy27-q1-reforecast')
      expect(acc?.months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09'])
      expect(acc?.costed ?? 0).toBeGreaterThanOrEqual(ctx.guard.rules.minCosted)
      expect(tile?.value, mode).toBeCloseTo(acc?.cost as number, 12)
      expect(tile?.value as number).toBeGreaterThan(0.9)
      expect(tile?.value as number).toBeLessThan(1)
      expect(tile?.note).toBe('FY27 Q1 Reforecast against the actual for Jul to Sep 2026')
      expect(tile?.suppressed).toBeUndefined()
      const card = resolveCalc(tile?.calc)
      expect(card && calcProblems(card), mode).toEqual([])
      expect(card?.value).toBe(tile?.value)
    }
  })

  it('is the company’s only: under a unit filter it reads "—" with the reason', () => {
    const { tile } = tileOf('finance', { filters: { businessUnit: ['Operations'] } })
    expect(tile?.value).toBeNull()
    expect(tile?.suppressed).toBe(true)
    expect(tile?.suppressedNote).toBe(ACCURACY_COMPANY_NOTE)
  })

  it('is hidden in HRBP, Leader and Manager mode', () => {
    for (const mode of ['hrbp', 'leader', 'manager'] as const) {
      const { tile, shown } = tileOf(mode)
      expect(shown, mode).toBe(false)
      // Even the model holds no value where the mode hides it.
      if (tile) expect(tile.value, mode).toBeNull()
    }
  })
})
