/**
 * Engine budgets (docs/PLAN.md 16.2): over a synthetic 1,650-position workspace, the whole-company plan
 * model (Working's lines over the grid, from a fresh line context) in under 400 ms, the forecast in
 * under 300 ms, and (PLAN 16.2's third budget) the bridge against a Budget locked from the same lines in
 * under 300 ms, ending at the forecast's total to the cent. `bestCostMs` takes the best of a few runs after a warm-up, each the smaller of wall
 * time and this thread's CPU time, so a busy machine does not fail the budget.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { bestCostMs } from '@/lib/testBudget'
import type { LockedVersion } from '../types'
import { bridge, bridgeSeats } from './bridge'
import { lineContext, versionLines } from './cost'
import { FY27_MONTHS, fy27Working } from './fixtures/common'
import { type SyntheticWorkspace, syntheticWorkspace } from './fixtures/synthetic'
import { type ForecastResult, forecast } from './forecast'
import { lockedFrom } from './versions'

const PLAN_MODEL_MS = 400
const FORECAST_MS = 300
/** PLAN 16.2 also budgets the bridge on the sample at 300 ms; the synthetic workspace holds it to the same. */
const BRIDGE_MS = 300

let ws: SyntheticWorkspace
const version = fy27Working('daily')
let budget: LockedVersion
let fc: ForecastResult

beforeAll(() => {
  ws = syntheticWorkspace()
  budget = lockedFrom(
    {
      working: version,
      versionId: 'fy27-budget',
      as: { kind: 'budget', name: 'FY27 Budget' },
      at: '2026-03-31T12:00',
      by: { personId: 'E8001', name: 'Finance', mode: 'finance' },
      lines: planModel(),
      assumptions: ws.assumptions,
      rates: ws.rates,
      forecast: null,
    },
    [],
  )
  fc = runForecast()
}, 120_000)

const planModel = () =>
  versionLines(
    version,
    lineContext({
      version,
      asOf: '2026-09-30',
      positions: ws.positions,
      workers: ws.workers,
      comp: ws.comp,
      reqs: ws.reqs,
      requests: ws.requests,
      assumptions: ws.assumptions,
      rates: { table: ws.rates, use: 'plan', closedThrough: null },
    }),
  )

const runForecast = () =>
  forecast({
    version,
    asOf: '2026-09-30',
    closes: [],
    positions: ws.positions,
    workers: ws.workers,
    comp: ws.comp,
    reqs: ws.reqs,
    requests: ws.requests,
    freezes: ws.freezes,
    assumptions: ws.assumptions,
    rates: ws.rates,
    inTree: () => false,
  })

describe('engine budgets on a 1,650-position workspace', () => {
  it('is the size it says, with costed lines in every month', () => {
    expect(ws.positionCount).toBe(1_650)
    const lines = planModel()
    expect(new Set(lines.map((l) => l.month)).size).toBe(12)
    expect(lines.reduce((n, l) => n + l.usd.loaded, 0)).toBeGreaterThan(0)
    const f = runForecast()
    expect(f.months).toHaveLength(12)
    expect(f.yearEnd.cost.loaded).toBeGreaterThan(0)
  })

  it(`computes the whole-company plan model in under ${PLAN_MODEL_MS} ms`, () => {
    const ms = bestCostMs(planModel)
    expect(ms).toBeLessThan(PLAN_MODEL_MS)
  })

  it(`computes the whole-company forecast in under ${FORECAST_MS} ms`, () => {
    const ms = bestCostMs(runForecast)
    expect(ms).toBeLessThan(FORECAST_MS)
  })

  it(`computes the whole-company bridge against the Budget in under ${BRIDGE_MS} ms, ending at the forecast`, () => {
    const run = () =>
      bridge({
        fiscalYear: 'FY27',
        comparison: { versionId: budget.versionId, label: budget.name, fiscalYear: 'FY27' },
        yearHasLockedVersion: true,
        months: FY27_MONTHS,
        seats: bridgeSeats({
          comparison: budget,
          forecast: fc,
          positions: ws.positions,
          scope: () => true,
          months: FY27_MONTHS,
        }),
      })
    const r = run()
    if (r.kind !== 'ok') throw new Error(r.reason)
    expect(r.end).toBeCloseTo(fc.yearEnd.cost.loaded, 2)
    expect(r.steps.reduce((n, s) => n + Math.round(s.amount * 100), 0)).toBe(
      Math.round(r.end * 100) - Math.round(r.start * 100),
    )
    expect(bestCostMs(run)).toBeLessThan(BRIDGE_MS)
  })
})
