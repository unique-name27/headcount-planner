/**
 * Plan and Forecast read Working's closed months through the one line rule Targets and the sample's
 * routing read (src/plan/lineSource.ts, change C33, review RF-4): `shownLines` and `closeLinesOf` are
 * that helper's output itself, not a second builder that happens to agree, so Plan and Targets price
 * every closed month from the same lines by construction.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { closeLines, withClosedMonths } from '@/plan/lineSource'
import { closeLinesOf, shownLines, versionLinesOf } from './core'
import { sample, sampleCtx } from './fixtures'

beforeAll(() => {
  sample()
}, 60_000)

describe('one line source for Working (C33)', () => {
  it('is the shared helper’s own output for every mode', () => {
    for (const mode of ['hrbp', 'finance', 'hr-admin'] as const) {
      const ctx = sampleCtx(mode)
      const v = ctx.version
      expect(v?.state, mode).toBe('working')
      if (!v || !ctx.plan) continue
      expect(ctx.plan.closes.length, mode).toBeGreaterThan(0)
      expect(closeLinesOf(ctx.plan), mode).toBe(closeLines(ctx.plan.closes))
      // Back-dated adjustments post through the same helper (6.6, review SA-2).
      expect(shownLines(ctx, v), mode).toBe(
        withClosedMonths(versionLinesOf(ctx, v), ctx.plan.closes, null, ctx.plan.adjustments),
      )
    }
  })

  it('leaves a locked version’s own lines as they are', () => {
    const ctx = sampleCtx('finance')
    const budget = ctx.versions.find((x) => x.state === 'locked')
    expect(budget).toBeDefined()
    if (budget) expect(shownLines(ctx, budget)).toBe(versionLinesOf(ctx, budget))
  })
})
