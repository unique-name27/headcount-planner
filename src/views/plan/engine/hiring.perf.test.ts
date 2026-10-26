/**
 * Plan > Hiring's time budget (docs/PLAN.md 9.7 and 16.2; docs/CONTRACTS-HIRING.md H10): its own
 * model, not a `PlanModel` field, so the plan model's 400 ms keeps no forecast run. For a fresh
 * context the whole tab model (the input, the engine, the tiles, the table, velocity and the
 * readout) computes in under 300 ms once the loaded data's own work is cached (seat histories and
 * the Working forecast, as after the first view on a page). `bestCostMs` takes the best of a few
 * runs after a warm-up.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { sample, sampleCtx } from './fixtures'
import { planHiringModel } from './hiringTab'

const BUDGET_MS = 300

beforeAll(() => {
  sample()
  planHiringModel(sampleCtx('finance'))
}, 60_000)

describe('the Plan > Hiring model', () => {
  for (const mode of ['finance', 'hrbp', 'manager', 'hr-admin'] as const)
    it(`computes in ${mode} mode in under ${BUDGET_MS} ms for a fresh context`, () => {
      const ms = bestCostMs(() => planHiringModel(sampleCtx(mode)))
      expect(ms).toBeLessThan(BUDGET_MS)
    })
})
