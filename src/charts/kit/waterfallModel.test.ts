/**
 * The Waterfall's layout (docs/PLAN.md 6.8 and 9.5): the steps between the start and the end add up
 * to the end, to the cent (fixture B1, and its drifting B1-cents twin); a hidden step reads "—",
 * draws no bar and never counts as 0; a Rounding bar closes a rounded waterfall and only a rounded
 * one carries it.
 */
import { describe, expect, it } from 'vitest'
import { roundCost, sumRounded } from '@/lib/costRounding'
import { BRIDGE_STEP_LABEL, BRIDGE_STEPS } from '@/plan/engine/bridge'
import { B1, B1_CENTS } from '@/plan/engine/fixtures/bridge'
import type { WaterfallStep } from '../types'
import { ROUNDING_LABEL, roundingStep, waterfallModel, waterfallSteps } from './waterfallModel'

const start = (value: number | null): WaterfallStep => ({
  key: 'start',
  label: 'FY27 Budget',
  kind: 'start',
  value,
})
const end = (value: number | null): WaterfallStep => ({ key: 'end', label: 'Forecast', kind: 'end', value })
const step = (key: string, value: number | null, kind: WaterfallStep['kind'] = 'step'): WaterfallStep => ({
  key,
  label: key,
  kind,
  value,
})

/** Fixture B1 as a waterfall: the comparison, the eight steps in BRIDGE_STEPS order, the forecast. */
const b1 = (): WaterfallStep[] => [
  start(B1.start),
  ...BRIDGE_STEPS.map((k, i) => ({
    key: k,
    label: BRIDGE_STEP_LABEL[k],
    kind: 'step' as const,
    value: B1.amounts[i],
  })),
  end(B1.start + B1.sum),
]

describe('waterfallModel', () => {
  it('adds the steps to the end: fixture B1, $10.0M to $10.6M', () => {
    const m = waterfallModel(b1())
    expect(m.start).toBe(10_000_000)
    expect(m.end).toBe(10_600_000)
    expect(m.stepSum).toBe(600_000)
    expect(m.closes).toBe(true)
    expect(m.hidden).toBe(0)
    // Each step floats from the running total; the totals stand on zero.
    expect(m.bars.map((b) => b.running)).toEqual([10_000_000, ...B1.totals, 10_600_000])
    expect(m.bars[0]).toMatchObject({ from: 0, to: 10_000_000, tone: 'total' })
    expect(m.bars[1]).toMatchObject({ from: 10_000_000, to: 9_700_000, tone: 'down', label: 'Timing' })
    expect(m.bars[2]).toMatchObject({ from: 9_700_000, to: 10_200_000, tone: 'up' })
    expect(m.bars[6]).toMatchObject({ value: 0, tone: 'flat' })
    expect(m.bars.at(-1)).toMatchObject({ from: 0, to: 10_600_000, tone: 'total' })
    expect(m.min).toBe(0)
    expect(m.max).toBe(10_600_000)
  })

  it('sums in integer cents, so amounts that drift in floating point still close (B1-cents)', () => {
    const steps = B1_CENTS.amountCents.map((c, i) => step(BRIDGE_STEPS[i], c / 100))
    const total = B1_CENTS.start + B1_CENTS.sumCents / 100
    const m = waterfallModel([start(B1_CENTS.start), ...steps, end(total)])
    expect(m.closes).toBe(true)
    expect(Math.round(m.stepSum * 100)).toBe(B1_CENTS.sumCents)
    // The running totals land on the fixture's totals to the cent.
    expect(m.bars.slice(1, -1).map((b) => Math.round(b.running * 100))).toEqual(
      B1_CENTS.totals.map((t) => Math.round(t * 100)),
    )
  })

  it('does not close when a step is off by a cent, or when a total is hidden', () => {
    const off = b1()
    off[3] = { ...off[3], value: (off[3].value as number) + 0.01 }
    expect(waterfallModel(off).closes).toBe(false)
    const noEnd = b1()
    noEnd[noEnd.length - 1] = end(null)
    const m = waterfallModel(noEnd)
    expect(m.closes).toBe(false)
    expect(m.end).toBeNull()
    expect(m.bars.at(-1)).toMatchObject({ value: null, from: null, to: null, tone: 'hidden' })
  })

  it('draws no bar for a hidden step and never counts it as 0', () => {
    const rows = [start(1_000_000), step('timing', 200_000), step('fx', null), end(1_200_000)]
    const m = waterfallModel(rows)
    const fx = m.bars[2]
    expect(fx).toMatchObject({ value: null, from: null, to: null, tone: 'hidden', running: 1_200_000 })
    expect(m.hidden).toBe(1)
    // The shown steps would add up, but a hidden one means the waterfall cannot claim to close.
    expect(m.stepSum).toBe(200_000)
    expect(m.closes).toBe(false)
  })

  it('folds steps under the contributor minimum into Other changes, which still adds up', () => {
    const rows = [
      start(5_000_000),
      step('timing', -100_000),
      step('other', 250_000, 'other'),
      step('fx', 50_000),
      end(5_200_000),
    ]
    const m = waterfallModel(rows)
    expect(m.closes).toBe(true)
    expect(m.bars[2].tone).toBe('other')
  })

  it('keeps negative ends in the value range', () => {
    const m = waterfallModel([start(100_000), step('positions', -300_000), end(-200_000)])
    expect(m.min).toBe(-200_000)
    expect(m.max).toBe(100_000)
    expect(m.closes).toBe(true)
  })
})

describe('the Rounding bar', () => {
  // A rounded waterfall (HRBP and Leader): each atom's total rounded down to $0.1M on its own and
  // added with sumRounded, each step built from rounded parts (7.3c), so the rounded steps need not
  // add up to the rounded end without the steps sumRounded added.
  const atomsBefore = [1_234_567, 2_345_678, 876_543]
  const atomsAfter = [1_310_000, 2_420_000, 912_000]
  const rounded = (xs: readonly number[]) => sumRounded(xs.map((x) => roundCost(x)))
  const startValue = rounded(atomsBefore)
  const endValue = rounded(atomsAfter)
  const steps = [step('timing', 100_000), step('mix', 0)]

  it('closes a rounded waterfall: the end minus the start minus every step shown', () => {
    const r = roundingStep(startValue, steps, endValue)
    const gap = endValue - startValue - 100_000
    expect(r).toEqual(
      gap === 0 ? null : { key: 'rounding', label: ROUNDING_LABEL, kind: 'rounding', value: gap },
    )
    const rows = waterfallSteps(start(startValue), steps, end(endValue), { rounded: true })
    const m = waterfallModel(rows)
    expect(m.closes).toBe(true)
    if (r) expect(m.bars.at(-2)).toMatchObject({ kind: 'rounding', tone: 'rounding', label: 'Rounding' })
  })

  it('has a Rounding bar where the rounded steps leave a gap, and none where they close', () => {
    const r = roundingStep(5_000_000, [step('a', 100_000), step('b', 100_000)], 5_300_000)
    expect(r).toEqual({ key: 'rounding', label: 'Rounding', kind: 'rounding', value: 100_000 })
    expect(roundingStep(5_000_000, [step('a', 300_000)], 5_300_000)).toBeNull()
    const closed = waterfallSteps(start(5_000_000), [step('a', 300_000)], end(5_300_000), { rounded: true })
    expect(closed.map((s) => s.kind)).toEqual(['start', 'step', 'end'])
  })

  it('is never added to an exact waterfall, and cannot paper over a hidden amount', () => {
    const exact = waterfallSteps(start(5_000_000), [step('a', 100_000)], end(5_300_000))
    expect(exact.some((s) => s.kind === 'rounding')).toBe(false)
    expect(waterfallModel(exact).closes).toBe(false)
    expect(roundingStep(null, [step('a', 1)], 5)).toBeNull()
    expect(roundingStep(5, [step('a', null)], 9)).toBeNull()
    expect(roundingStep(5, [step('a', 1)], null)).toBeNull()
  })
})
