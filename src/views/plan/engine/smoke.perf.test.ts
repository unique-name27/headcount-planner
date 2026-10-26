/**
 * The Plan view's time budget (the template app's smoke.perf test): the whole model for a fresh
 * context, every tab, under 600 ms, once the loaded data's own work (seat histories, a version's
 * lines, each unit's fold) is cached, as it is after the first view on a page. `bestCostMs` takes
 * the best of a few runs after a warm-up.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { planModel } from '.'
import { sample, sampleCtx } from './fixtures'

const BUDGET_MS = 600

beforeAll(() => {
  sample()
  planModel(sampleCtx('finance'))
}, 60_000)

describe('the Plan model', () => {
  for (const mode of ['finance', 'hrbp', 'hr-admin'] as const)
    it(`computes in ${mode} mode in under ${BUDGET_MS} ms for a fresh context`, () => {
      const ms = bestCostMs(() => planModel(sampleCtx(mode)))
      expect(ms).toBeLessThan(BUDGET_MS)
    })
})
