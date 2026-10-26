/**
 * PLAN 15.1 R46 (M2-REPORT close-out, known gap 1): a reporting date inside an unclosed month. Only
 * closed months are actual. With the sample's closes through September and HR admin's reporting date
 * set to 15 or 31 October 2026, the forecast reads April to September from the closes and projects
 * October on at forecast rates (never "No actual rate for INR in 2026-10"), and the Forecast view
 * builds in every mode.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { cachedSample, type Sample } from '@/data/sample'
import { FY27_WORKING } from '@/data/sample/assumptions'
import { assumptionsOf } from '@/data/sample/base'
import { inTreeOf } from '@/data/sample/orgs'
import { versionFrame } from '@/data/sample/versions'
import type { ISODate, Mode } from '@/data/schema'
import { forecastModel } from '@/views/forecast/engine'
import { sampleCtx } from '@/views/forecast/engine/fixtures'
import { closedThrough } from './close'
import { actualThroughOf, forecast } from './forecast'
import { fxRatesFromAssumptions, rateOf } from './fx'
import { fromRow } from './requests'

let s: Sample
beforeAll(() => {
  s = cachedSample()
})

const MODES: readonly Mode[] = ['manager', 'hrbp', 'leader', 'finance', 'hr-admin']

function run(asOf: ISODate) {
  const rows = assumptionsOf(s.datasets, FY27_WORKING)
  return forecast({
    version: versionFrame(FY27_WORKING),
    asOf,
    closes: s.plan.closes,
    positions: s.datasets.positions,
    workers: s.datasets.workers,
    comp: s.datasets.comp,
    reqs: s.datasets.reqs,
    requests: s.datasets.requests.map(fromRow),
    freezes: s.datasets.freezes,
    assumptions: rows,
    rates: fxRatesFromAssumptions(rows),
    inTree: inTreeOf(s.datasets.positions),
  })
}

describe('which months are actual (R46)', () => {
  it('is the last close’s month whatever the reporting date, with a close', () => {
    expect(closedThrough(s.plan.closes)).toBe('2026-09')
    for (const d of ['2026-08-31', '2026-09-30', '2026-10-15', '2026-10-31', '2027-01-20'])
      expect(actualThroughOf(s.plan.closes, d), d).toBe('2026-09')
  })

  it('is the reporting date’s month with no close at all (HRIS actuals, M1’s reading)', () => {
    expect(actualThroughOf([], '2026-09-30')).toBe('2026-09')
    expect(actualThroughOf([], '2026-09-15')).toBe('2026-09')
  })
})

describe('the forecast with the reporting date after the last close’s month', () => {
  for (const asOf of ['2026-10-15', '2026-10-31'] as const)
    it(`builds at ${asOf}: April to September closed, October projected at forecast rates`, () => {
      const f = run(asOf)
      expect(f.closedThrough).toBe('2026-09')
      const closed = f.months.filter((m) => m.closed).map((m) => m.month)
      expect(closed).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
      const oct = f.months.find((m) => m.month === '2026-10')
      expect(oct?.closed).toBe(false)
      expect(oct?.heads ?? 0).toBeGreaterThan(0)
      // October's INR lines carry the forecast rate, never an actual one (there is none).
      const rates = fxRatesFromAssumptions(assumptionsOf(s.datasets, FY27_WORKING))
      const forecastInr = rateOf(rates, 'INR', 'forecast', '2026-10')
      expect(forecastInr).toBeGreaterThan(0)
      const inr = f.lines.filter((l) => l.month === '2026-10' && l.currency === 'INR' && l.rate > 0)
      expect(inr.length).toBeGreaterThan(0)
      for (const l of inr) expect(l.rate).toBe(forecastInr)
    })

  it('reads the closed months the same at 30 Sep and at 15 Oct', () => {
    const sep = run('2026-09-30')
    const oct = run('2026-10-15')
    for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) {
      const a = sep.months.find((x) => x.month === m)
      const b = oct.months.find((x) => x.month === m)
      expect(b?.heads, m).toBe(a?.heads)
      expect(b?.cost.filled.loaded, m).toBeCloseTo(a?.cost.filled.loaded ?? 0, 6)
    }
  })
})

describe('the Forecast view at a reporting date after the last close’s month', () => {
  for (const asOf of ['2026-10-15', '2026-10-31'] as const)
    for (const mode of MODES)
      it(`builds in ${mode} mode at ${asOf}`, () => {
        const ctx = sampleCtx(mode, { asOf })
        expect(ctx.asOf).toBe(asOf)
        const model = forecastModel(ctx)
        expect(model).toBeTruthy()
        expect(JSON.stringify(model)).not.toMatch(/No actual rate/)
      })
})
