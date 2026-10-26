/**
 * The Forecast view's time budget: the whole model (Overview, Variance with every cost cell under the
 * guard, the Bridge with its FX windows) for a fresh context in under 1,500 ms, once the loaded
 * data's own work (the fiscal year's forecast, a version's lines, each unit's fold) is cached, as it
 * is after the first view on a page. The forecast engine's own budget is src/plan/engine's.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { forecastModel } from '.'
import { sample, sampleCtx } from './fixtures'

const BUDGET_MS = 1_500

beforeAll(() => {
  sample()
  forecastModel(sampleCtx('finance'))
}, 60_000)

describe('the Forecast model', () => {
  for (const mode of ['finance', 'hrbp', 'hr-admin'] as const)
    it(`computes in ${mode} mode in under ${BUDGET_MS} ms for a fresh context`, () => {
      const ms = bestCostMs(() => forecastModel(sampleCtx(mode)))
      expect(ms).toBeLessThan(BUDGET_MS)
    })
})
