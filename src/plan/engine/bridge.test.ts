/**
 * Bridge and variance (docs/PLAN.md 6.8 and 9.2): fixtures B1 (integer cents), BX2 (with X2), X2 end to
 * end through a locked Budget, the forecast and `bridgeSeats` (the end is the forecast's total, the FX
 * step is `fxEffect` against the Budget's stored rates, an adjustment lands in timing), a comparison
 * with a vacancy factor (lead decision D-VAC: the start is the comparison's total including its
 * vacancy allowance, to the cent, and the attrition step takes the allowance out), and EV1.
 */
import { describe, expect, it } from 'vitest'
import {
  BRIDGE_STEP_LABEL,
  BRIDGE_STEPS,
  bridge,
  bridgeFromTotals,
  bridgeSeats,
  priceSeat,
  vacancyAllowance,
} from './bridge'
import { isAllowanceLine, lineContext, versionLines } from './cost'
import { B1, B1_CENTS, BX2, BX2_SEAT, EV1 } from './fixtures/bridge'
import { AS_OF, FY27_MONTHS, fy27Working } from './fixtures/common'
import { WORKING_RATES_EDITED, X2, X2_ASSUMPTIONS, X2_POSITIONS } from './fixtures/fx'
import { syntheticWorkspace } from './fixtures/synthetic'
import { forecast, isCohortLine, withAdjustments } from './forecast'
import { fxEffect, rateOf } from './fx'
import { planLineRows } from './lineTable'
import { TARGET_HAS_NO_MONTHS, variance } from './variance'
import { lockedFrom } from './versions'

describe('the step order (data, part of the contract)', () => {
  it('is fixed: timing, positions, attrition, mix, pay rate, assumption rates, transfers, FX', () => {
    expect([...BRIDGE_STEPS]).toEqual([...B1.keys])
    expect(BRIDGE_STEPS.map((k) => BRIDGE_STEP_LABEL[k])).toEqual([...B1.labels])
  })
})

describe('B1: the spec example', () => {
  it('plan $10.0M to forecast $10.6M in eight steps that sum to +$0.6M', () => {
    const steps = bridgeFromTotals(B1.start, B1.totals)
    expect(steps.map((s) => s.key)).toEqual([...B1.keys])
    expect(steps.map((s) => s.amount)).toEqual([...B1.amounts])
    expect(steps.reduce((n, s) => n + s.amount, 0)).toBe(B1.sum)
    expect(steps[0].before).toBe(B1.start)
    expect(steps[7].after).toBe(B1.totals[7])
  })

  it('works in integer cents, with no float drift', () => {
    const steps = bridgeFromTotals(B1_CENTS.start, B1_CENTS.totals)
    const stepCents = steps.map((s) => Math.round(s.amount * 100))
    expect(stepCents).toEqual([...B1_CENTS.amountCents])
    expect(stepCents.reduce((n, c) => n + c, 0)).toBe(B1_CENTS.sumCents)
    for (const s of steps) expect(Number.isInteger(Math.round(s.amount * 100))).toBe(true)
  })
})

describe('BX2: the FX step is fxEffect on the same lines (X2)', () => {
  it('prices the seat at the comparison and at the forecast', () => {
    expect(priceSeat(BX2_SEAT, new Set(), BX2.input.months)).toBeCloseTo(BX2.start, 2)
    expect(priceSeat(BX2_SEAT, new Set(BRIDGE_STEPS), BX2.input.months)).toBeCloseTo(BX2.end, 2)
  })

  it('every step is $0 but FX, which is $8,400 against the Budget', () => {
    const r = bridge(BX2.input)
    if (r.kind !== 'ok') throw new Error(`expected a bridge, got ${r.reason}`)
    expect(r.start).toBeCloseTo(BX2.start, 2)
    expect(r.end).toBeCloseTo(BX2.end, 2)
    r.steps.forEach((s, i) => {
      expect(s.amount, s.key).toBeCloseTo(BX2.amounts[i], 2)
    })
    const fx = r.steps[7]
    expect(fx.key).toBe('fx')
    expect(fx.amount).toBeCloseTo(fxEffect(X2.lines, X2.budgetRates), 2)
    expect(r.steps.reduce((n, s) => n + Math.round(s.amount * 100), 0)).toBe(
      Math.round(r.end * 100) - Math.round(r.start * 100),
    )
  })
})

describe('X2 end to end: a locked Budget, the forecast, bridgeSeats and the bridge', () => {
  const working = fy27Working('daily')
  const budgetLines = versionLines(
    working,
    lineContext({
      version: working,
      asOf: '2026-06-30',
      positions: X2_POSITIONS,
      workers: [],
      comp: [],
      reqs: [],
      requests: [],
      assumptions: X2_ASSUMPTIONS,
      rates: { table: X2.budgetRates, use: 'plan', closedThrough: null },
    }),
  )
  const budget = lockedFrom(
    {
      working,
      versionId: 'fy27-budget',
      as: { kind: 'budget', name: 'FY27 Budget' },
      at: '2026-06-30T12:00',
      by: { personId: 'E8001', name: 'Finance', mode: 'finance' },
      lines: budgetLines,
      assumptions: X2_ASSUMPTIONS,
      rates: X2.budgetRates,
      forecast: null,
    },
    [],
  )
  const run = (rates: typeof X2.workingRates) =>
    forecast({
      version: working,
      asOf: AS_OF,
      closes: [],
      positions: X2_POSITIONS,
      workers: [],
      comp: [],
      reqs: [],
      requests: [],
      freezes: [],
      assumptions: X2_ASSUMPTIONS,
      rates,
      inTree: () => false,
    })
  const f = run(X2.workingRates)
  const result = bridge({
    fiscalYear: 'FY27',
    comparison: { versionId: budget.versionId, label: budget.name, fiscalYear: 'FY27' },
    yearHasLockedVersion: true,
    months: FY27_MONTHS,
    seats: bridgeSeats({
      comparison: budget,
      forecast: f,
      positions: X2_POSITIONS,
      scope: () => true,
      months: FY27_MONTHS,
    }),
  })
  if (result.kind !== 'ok') throw new Error(result.reason)

  it('starts at the Budget’s $129,600 and ends at the forecast engine’s total, $138,000', () => {
    expect(result.start).toBeCloseTo(X2.lines.length * 20_000 * 1.08, 2)
    expect(result.end).toBeCloseTo(f.yearEnd.cost.loaded, 2)
    expect(result.end).toBeCloseTo(138_000, 2)
  })

  it("the FX step is fxEffect on the same lines against the Budget's stored rates: $8,400, not $6,000", () => {
    const fx = result.steps[7]
    expect(fx.key).toBe('fx')
    expect(fx.amount).toBeCloseTo(fxEffect(f.lines, budget.rates), 2)
    expect(fx.amount).toBeCloseTo(X2.fxEffect, 2)
    expect(fxEffect(f.lines, X2.workingRates)).toBeCloseTo(X2.negativeControl, 2)
    expect(fx.amount).not.toBeCloseTo(X2.negativeControl, 2)
    for (const s of result.steps.slice(0, 7)) expect(s.amount, s.key).toBe(0)
  })

  it('the steps sum to end − start in integer cents', () => {
    const sum = result.steps.reduce((n, s) => n + Math.round(s.amount * 100), 0)
    expect(sum).toBe(Math.round(result.end * 100) - Math.round(result.start * 100))
  })

  it('a back-dated adjustment posted in October lands in the timing step (6.6), and the end is still the forecast’s', () => {
    // A back-dated August change on the seat: €10,000 at August's actual rate 1.10 ($11,000), posted in 2026-10.
    const adjusted = withAdjustments(f, [
      {
        id: 'adj-2026-08-E-ADJ-hire',
        postedIn: '2026-10',
        forMonth: '2026-08',
        positionId: 'P-X2',
        kind: 'hire',
        reason: 'Back-dated hire',
        delta: {
          employeeId: 'E-ADJ',
          positionId: 'P-X2',
          month: '2026-08',
          heads: 1,
          fte: 1,
          active: 0.5,
          currency: 'EUR',
          rate: 1.1,
          local: { base: 10_000, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 },
          usd: {
            base: 11_000,
            bonus: 0,
            burden: 0,
            benefits: 0,
            oneTime: 0,
            vacancy: 0,
            equity: 0,
            loaded: 11_000,
          },
          leave: 'none',
        },
      },
    ])
    expect(adjusted.yearEnd.cost.loaded).toBeCloseTo(f.yearEnd.cost.loaded + 11_000, 2)
    expect(adjusted.months.find((m) => m.month === '2026-10')?.cost.filled.loaded).toBeCloseTo(11_000, 2)
    const r = bridge({
      fiscalYear: 'FY27',
      comparison: { versionId: budget.versionId, label: budget.name, fiscalYear: 'FY27' },
      yearHasLockedVersion: true,
      months: FY27_MONTHS,
      seats: bridgeSeats({
        comparison: budget,
        forecast: adjusted,
        positions: X2_POSITIONS,
        scope: () => true,
        months: FY27_MONTHS,
      }),
    })
    if (r.kind !== 'ok') throw new Error(r.reason)
    expect(r.end).toBeCloseTo(adjusted.yearEnd.cost.loaded, 2)
    // Timing: €10,000 at the Budget's 1.08; FX: €120,000 × 0.07 + €10,000 × 0.02.
    expect(r.steps[0].amount).toBeCloseTo(10_800, 2)
    expect(r.steps[7].amount).toBeCloseTo(fxEffect(adjusted.lines, budget.rates), 2)
    expect(r.steps[7].amount).toBeCloseTo(8_600, 2)
    for (const s of r.steps.slice(1, 7)) expect(s.amount, s.key).toBe(0)
  })

  it("editing Working's plan FX moves neither the forecast nor the FX effect against Budget (6.4)", () => {
    const edited = run(WORKING_RATES_EDITED)
    expect(edited.lines).toEqual(f.lines)
    expect(fxEffect(edited.lines, budget.rates)).toBeCloseTo(X2.fxEffect, 2)
  })
})

describe('a comparison with a vacancy factor (synthetic workspace, factor 0.02)', () => {
  const cents = (x: number) => Math.round(x * 100)
  const ws = syntheticWorkspace()
  const working = fy27Working('daily')
  // The Budget's own assumption rows (the lookup reads a version's rows only), vacancy factor 0.02 included.
  const budgetRows = ws.assumptions.map((r) => ({ ...r, version: 'fy27-budget' }))
  const budget = lockedFrom(
    {
      working,
      versionId: 'fy27-budget',
      as: { kind: 'budget', name: 'FY27 Budget' },
      at: '2026-03-31T12:00',
      by: { personId: 'E8001', name: 'Finance', mode: 'finance' },
      lines: versionLines(
        working,
        lineContext({
          version: working,
          asOf: '2026-03-31',
          positions: ws.positions,
          workers: ws.workers,
          comp: ws.comp,
          reqs: ws.reqs,
          requests: ws.requests,
          assumptions: ws.assumptions,
          rates: { table: ws.rates, use: 'plan', closedThrough: null },
        }),
      ),
      assumptions: budgetRows,
      rates: ws.rates,
      forecast: null,
    },
    [],
  )
  const f = forecast({
    version: working,
    asOf: AS_OF,
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
  const unitOf = new Map(ws.positions.map((r) => [r.positionId, r.businessUnit]))
  const run = (unit: string | null) => {
    const scope = (p: { businessUnit: string }) => unit === null || p.businessUnit === unit
    const r = bridge({
      fiscalYear: 'FY27',
      comparison: { versionId: budget.versionId, label: budget.name, fiscalYear: 'FY27' },
      yearHasLockedVersion: true,
      months: FY27_MONTHS,
      seats: bridgeSeats({
        comparison: budget,
        forecast: f,
        positions: ws.positions,
        scope,
        months: FY27_MONTHS,
      }),
    })
    if (r.kind !== 'ok') throw new Error(r.reason)
    const allowance = vacancyAllowance({
      comparison: budget,
      positions: ws.positions,
      scope,
      months: FY27_MONTHS,
    })
    return { r, allowance }
  }
  const budgetTotal = (unit: string | null) => {
    let usd = 0
    for (const l of planLineRows(budget.lines))
      if (FY27_MONTHS.includes(l.month) && (unit === null || unitOf.get(l.positionId) === unit))
        usd += l.usd.loaded
    return usd
  }
  const forecastTotal = (unit: string | null) => {
    let usd = 0
    for (const l of f.lines) {
      if (!FY27_MONTHS.includes(l.month)) continue
      const u = isCohortLine(l) ? l.cohort.businessUnit : unitOf.get(l.positionId)
      if (unit === null || u === unit) usd += l.usd.loaded
    }
    return usd
  }

  /** The forecast's modeled exits and backfills (its cohort lines) priced at the Budget's plan rates. */
  const cohortsAtPlan = (unit: string | null) => {
    let usd = 0
    for (const l of f.lines) {
      if (!FY27_MONTHS.includes(l.month) || !isCohortLine(l)) continue
      if (unit !== null && l.cohort.businessUnit !== unit) continue
      const local = l.local.base + l.local.bonus + l.local.burden + l.local.benefits
      usd += local * (rateOf(budget.rates, l.currency, 'plan', l.month) ?? 0)
    }
    return usd
  }

  it('the Budget carries its allowance as lines of their own, in its total; the forecast carries none', () => {
    let seatLines = 0
    let allowanceLines = 0
    for (const l of planLineRows(budget.lines)) {
      if (!FY27_MONTHS.includes(l.month)) continue
      if (isAllowanceLine(l)) {
        allowanceLines += l.usd.loaded
        expect(l.usd.loaded).toBe(l.usd.vacancy)
        expect([l.heads, l.fte, l.active, l.local.base, l.local.oneTime]).toEqual([0, 0, 0, 0, 0])
      } else {
        expect(l.usd.vacancy).toBe(0)
        seatLines += l.usd.loaded
      }
    }
    expect(allowanceLines).toBeLessThan(0)
    expect(cents(budgetTotal(null))).toBe(cents(seatLines + allowanceLines))
    for (const l of f.lines) expect(l.usd.vacancy).toBe(0)
  })

  it("starts at the comparison's total including its allowance, to the cent, and the steps sum to forecast − comparison", () => {
    const { r, allowance } = run(null)
    // −0.02 × the Budget's filled recurring cost (15.2 C31).
    expect(allowance.allowanceUsd).toBeLessThan(0)
    expect(allowance.allowanceUsd).toBeCloseTo(-0.02 * allowance.filledUsd, 4)
    expect(cents(r.start)).toBe(cents(budgetTotal(null)))
    expect(cents(r.end)).toBe(cents(f.yearEnd.cost.loaded))
    // Steps sum to forecast − comparison exactly: the variance the same two totals give.
    const sum = r.steps.reduce((n, s) => n + Math.round(s.amount * 100), 0)
    expect(sum).toBe(cents(r.end) - cents(r.start))
    expect(sum).toBe(cents(f.yearEnd.cost.loaded) - cents(budgetTotal(null)))
  })

  it("prices the attrition step as the forecast's exits and backfills minus the comparison's allowance", () => {
    const { r, allowance } = run(null)
    const cohorts = cohortsAtPlan(null)
    expect(cohorts).toBeLessThan(0)
    const attrition = r.steps.find((s) => s.key === 'attrition')!
    // A step is whole cents (after − before, each rounded), so it sits within a cent of the exact sum.
    expect(Math.abs(attrition.amount - (cohorts - allowance.allowanceUsd))).toBeLessThanOrEqual(0.01)
    // Control: the allowance is in the start, so leaving it out of this step breaks the sum.
    expect(attrition.amount).not.toBeCloseTo(cohorts, 2)
  })

  it('reads the filled cost the allowance is a share of from the Budget’s HRIS and offer lines', () => {
    const { allowance } = run(null)
    let filled = 0
    for (const l of planLineRows(budget.lines))
      if (FY27_MONTHS.includes(l.month) && l.basis !== 'band' && !isAllowanceLine(l))
        filled += l.usd.base + l.usd.bonus + l.usd.burden + l.usd.benefits
    expect(allowance.filledUsd).toBeCloseTo(filled, 4)
  })

  it('holds per unit in scope too', () => {
    for (const unit of [...new Set(unitOf.values())].sort()) {
      const { r, allowance } = run(unit)
      expect(cents(r.start), unit).toBe(cents(budgetTotal(unit)))
      expect(cents(r.end), unit).toBe(cents(forecastTotal(unit)))
      expect(allowance.allowanceUsd, unit).toBeLessThan(0)
      const attrition = r.steps.find((s) => s.key === 'attrition')!
      expect(
        Math.abs(attrition.amount - (cohortsAtPlan(unit) - allowance.allowanceUsd)),
        unit,
      ).toBeLessThanOrEqual(0.01)
    }
  })
})

describe('EV1: a target comparison is an empty state, not an error', () => {
  it('variance, when the year has no locked version', () => {
    expect(variance(EV1.variance)).toEqual({ kind: 'empty', reason: EV1.noLockedVersion })
  })

  it('variance, when the target is picked in a year that has one', () => {
    expect(variance(EV1.varianceTargetPicked)).toEqual({ kind: 'empty', reason: TARGET_HAS_NO_MONTHS })
    expect(TARGET_HAS_NO_MONTHS).toBe(EV1.targetPicked)
  })

  it('bridge', () => {
    expect(bridge(EV1.bridge)).toEqual({ kind: 'empty', reason: EV1.noLockedVersion })
  })
})
