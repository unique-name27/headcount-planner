/**
 * Average FTE is always daily (the spec's "Heads and FTE", docs/PLAN.md 2 "whatever the version's
 * proration"; M4 review SA-5): switching FY27 Working's proration among daily, half-month and
 * full-month moves its cost but leaves every forecast FTE figure where it was, month by month and on
 * Forecast > Variance's FTE tile.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Sample } from '@/data/sample'
import type { Proration } from '@/data/schema'
import { MemoryStorage } from '@/testkit/memoryStorage'
import { leakSample, sampleCtx, withPlan } from '@/testkit/sample'
import { prepare } from './base'
import { forecastHeads } from './heads'
import { forecastModel } from './index'

vi.mock('@/data/idb', () => import('@/testkit/memoryIdb'))
vi.stubGlobal('localStorage', new MemoryStorage())

let s: Sample
beforeAll(() => {
  s = leakSample()
}, 120_000)

const withProration = (proration: Proration): Sample =>
  withPlan(s, {
    versions: s.plan.versions.map((v) => (v.versionId === 'fy27-working' ? { ...v, proration } : v)),
  })

const readings = (sample: Sample) => {
  const ctx = sampleCtx('finance', { sample })
  const p = prepare(ctx)
  const h = forecastHeads(p)
  const cost = p.lines.reduce((n, l) => n + l.usd.loaded, 0)
  const tile = forecastModel(ctx).variance.kpis.find((k) => k.id === 'variance-fte')?.value ?? null
  return { fte: h.fte, cost, tile }
}

describe('forecast average FTE under every proration (review SA-5)', () => {
  it('reads the same FTE by day, while cost follows the proration', () => {
    const daily = readings(s)
    expect(daily.fte.size).toBeGreaterThan(6)
    for (const proration of ['half-month', 'full-month'] as const) {
      const other = readings(withProration(proration))
      expect(other.cost, proration).not.toBeCloseTo(daily.cost, 0)
      for (const [month, fte] of daily.fte)
        expect(other.fte.get(month) ?? 0, `${proration} ${month}`).toBeCloseTo(fte, 6)
      expect(other.tile ?? 0, proration).toBeCloseTo(daily.tile ?? 0, 6)
    }
  }, 300_000)
})
