/**
 * Load budget for the Action center's collection on the sample (the template app's
 * collect.perf.test.ts): a cold run of any one view's items stays under 400 ms of work, and a cold
 * collection of every view (the masthead's count on a new context) under 1,000 ms. Perf files run
 * one at a time, after the unit tests.
 */
import { describe, expect, it } from 'vitest'
import { MODES } from '@/access/modes'
import { bestCostMs } from '@/lib/testBudget'
import { VIEWS } from '@/views/registry'
import { actionsModel } from '.'
import { collectUncached, runView } from './collect'
import { sampleCtx, sampleOnce } from './roleKit'

describe('collecting the Action center', () => {
  it('runs every view cold within 400 ms of work', () => {
    sampleOnce()
    for (const view of VIEWS.filter((v) => v.actions)) {
      // A fresh context each run, so the view computes its model from scratch.
      const ms = bestCostMs(() => runView(sampleCtx('hr-admin'), view), 2)
      expect(ms, view.key).toBeLessThan(400)
    }
  }, 120_000)

  it('collects every view cold within 1,000 ms in every mode, and the model is cached per context', () => {
    for (const mode of MODES) {
      const ms = bestCostMs(() => collectUncached(sampleCtx(mode), VIEWS), 2)
      expect(ms, mode).toBeLessThan(1000)
    }
    const ctx = sampleCtx('hrbp')
    expect(actionsModel(ctx, VIEWS)).toBe(actionsModel(ctx, VIEWS))
  }, 120_000)
})
