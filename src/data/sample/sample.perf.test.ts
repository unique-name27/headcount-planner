/**
 * The sample's time budgets (docs/PLAN.md 13.1, 16.2): `generateSample()` is synchronous and runs in
 * under 1,500 ms, the Budget and Q1 Reforecast lock hashes and the close hashes included; and on the
 * sample, the whole-company plan model (FY27 Working's lines over the grid, from a fresh line context)
 * under 400 ms, the forecast under 300 ms and the bridge against the Budget under 300 ms, ending at
 * the forecast's total to the cent. `bestCostMs` takes the best of a few runs after a warm-up.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import { MIN_COSTED } from '@/metrics/rules'
import { bridge, bridgeSeats } from '@/plan/engine/bridge'
import { lineContext, versionLines } from '@/plan/engine/cost'
import { forecast } from '@/plan/engine/forecast'
import { fxRatesFromAssumptions } from '@/plan/engine/fx'
import { fromRow } from '@/plan/engine/requests'
import { monthsOf } from '../fiscal'
import { FY27_BUDGET, FY27_WORKING } from './assumptions'
import { assumptionsOf } from './base'
import { generateSample, type Sample } from './generate'
import { inTreeOf } from './orgs'
import { versionFrame } from './versions'

const GENERATE_MS = 1_500
const PLAN_MODEL_MS = 400
const FORECAST_MS = 300
const BRIDGE_MS = 300

let sample: Sample

beforeAll(() => {
  sample = generateSample()
}, 120_000)

const working = versionFrame(FY27_WORKING)

const planModel = () => {
  const d = sample.datasets
  const rows = assumptionsOf(d, FY27_WORKING)
  return versionLines(
    working,
    lineContext({
      version: working,
      asOf: sample.asOf,
      positions: d.positions,
      workers: d.workers,
      comp: d.comp,
      reqs: d.reqs,
      requests: d.requests.map(fromRow),
      assumptions: rows,
      rates: { table: fxRatesFromAssumptions(rows), use: 'plan', closedThrough: null },
      closes: sample.plan.closes,
    }),
  )
}

const runForecast = () => {
  const d = sample.datasets
  const rows = assumptionsOf(d, FY27_WORKING)
  return forecast({
    version: working,
    asOf: sample.asOf,
    closes: sample.plan.closes,
    positions: d.positions,
    workers: d.workers,
    comp: d.comp,
    reqs: d.reqs,
    requests: d.requests.map(fromRow),
    freezes: d.freezes,
    assumptions: rows,
    rates: fxRatesFromAssumptions(rows),
    inTree: inTreeOf(d.positions),
    minCosted: Number(MIN_COSTED.default),
  })
}

describe('sample budgets', () => {
  it(`generates the whole sample, hashing included, in under ${GENERATE_MS} ms`, () => {
    let hashes = ''
    const ms = bestCostMs(() => {
      const s = generateSample()
      hashes = `${s.locks.budget.hash} ${s.locks.q1.hash} ${s.plan.closes.map((c) => c.hash).join(' ')}`
    }, 2)
    expect(hashes.split(' ').every((h) => /^sha256-[0-9a-f]{64}$/.test(h))).toBe(true)
    expect(ms).toBeLessThan(GENERATE_MS)
  }, 60_000)

  it(`computes the plan model in under ${PLAN_MODEL_MS} ms and the forecast in under ${FORECAST_MS} ms`, () => {
    expect(planModel().length).toBeGreaterThan(25_000)
    expect(bestCostMs(planModel)).toBeLessThan(PLAN_MODEL_MS)
    expect(bestCostMs(runForecast)).toBeLessThan(FORECAST_MS)
  }, 60_000)

  it(`bridges the company against the Budget in under ${BRIDGE_MS} ms, ending at the forecast`, () => {
    const f = runForecast()
    const months = monthsOf('FY27')
    const run = () =>
      bridge({
        fiscalYear: 'FY27',
        comparison: { versionId: FY27_BUDGET, label: 'FY27 Budget', fiscalYear: 'FY27' },
        yearHasLockedVersion: true,
        months,
        seats: bridgeSeats({
          comparison: sample.locks.budget,
          forecast: f,
          positions: sample.datasets.positions,
          scope: () => true,
          months,
        }),
      })
    const b = run()
    if (b.kind !== 'ok') throw new Error('The bridge has an empty state against a locked Budget.')
    let total = 0
    for (const l of f.lines) if (months.includes(l.month)) total += l.usd.loaded
    expect(Math.round(b.end * 100)).toBe(Math.round(total * 100))
    expect(bestCostMs(run)).toBeLessThan(BRIDGE_MS)
  }, 60_000)
})
