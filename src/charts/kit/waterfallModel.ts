/**
 * Pure layout for the Waterfall (docs/PLAN.md 6.8 and 9.5): the bridge from the comparison's total
 * to the forecast's, and the FX effect. No DOM, unit-tested (`waterfallModel.test.ts`); the
 * component draws what this returns.
 *
 * The bars, in order: 'start' (a total, from zero), then the steps in their fixed order ('step';
 * 'other' is "Other changes", the steps with too few contributors folded, 7.2 rule 5), then, in
 * rounded modes, 'rounding' (what `sumRounded` adds, so the rounded steps close on the rounded end),
 * and 'end' (a total, from zero). Steps float from the running total.
 *
 * The rules (tested):
 *  - The steps between the start and the end add up to the end minus the start: `closes` is true
 *    when they do to the cent, summed in integer cents so nothing drifts (fixture B1).
 *  - A null value reads "—" and draws no bar; it never counts as 0 (the running total stays, and
 *    the waterfall does not close).
 *  - `roundingStep` makes the Rounding bar: the end minus the start minus every step shown, so a
 *    rounded waterfall closes by construction, and only a rounded one carries it.
 */
import type { WaterfallStep } from '../types'

export type WaterfallTone = 'total' | 'up' | 'down' | 'flat' | 'other' | 'rounding' | 'hidden'

export interface WaterfallBar<S extends WaterfallStep = WaterfallStep> {
  step: S
  key: string
  label: string
  kind: WaterfallStep['kind']
  value: number | null
  /** The bar's two ends in USD: from zero for a total, from the running total for a step; null for a hidden step. */
  from: number | null
  to: number | null
  /** The running total after this bar (a hidden step leaves it where it was). */
  running: number
  tone: WaterfallTone
}

export interface WaterfallModel<S extends WaterfallStep = WaterfallStep> {
  bars: WaterfallBar<S>[]
  start: number | null
  end: number | null
  /** Σ of the shown steps between the start and the end (rounding included), summed in cents. */
  stepSum: number
  /** The shown steps add up to the end minus the start, to the cent, and none is hidden. */
  closes: boolean
  /** Steps that read "—". */
  hidden: number
  /** The lowest and highest bar ends (zero included), for the value scale. */
  min: number
  max: number
}

const cents = (v: number): number => Math.round(v * 100)

/**
 * The bars of a waterfall from its rows in order. The first 'start' row and the last 'end' row are
 * the totals; everything between floats. A row list without a start begins at zero.
 */
export function waterfallModel<S extends WaterfallStep>(steps: readonly S[]): WaterfallModel<S> {
  const bars: WaterfallBar<S>[] = []
  let running = 0
  let runningCents = 0
  let stepCents = 0
  let start: number | null = null
  let end: number | null = null
  let hidden = 0
  let min = 0
  let max = 0
  const see = (...vs: (number | null)[]) => {
    for (const v of vs)
      if (v != null) {
        if (v < min) min = v
        if (v > max) max = v
      }
  }
  for (const s of steps) {
    const v = s.value
    const usable = v != null && Number.isFinite(v)
    if (s.kind === 'start' || s.kind === 'end') {
      if (s.kind === 'start') {
        start = usable ? v : null
        running = usable ? v : 0
        runningCents = usable ? cents(v) : 0
      } else end = usable ? v : null
      bars.push({
        step: s,
        key: s.key,
        label: s.label,
        kind: s.kind,
        value: usable ? v : null,
        from: usable ? 0 : null,
        to: usable ? v : null,
        running: s.kind === 'end' && usable ? v : running,
        tone: usable ? 'total' : 'hidden',
      })
      if (usable) see(0, v)
      continue
    }
    if (!usable) {
      hidden++
      bars.push({
        step: s,
        key: s.key,
        label: s.label,
        kind: s.kind,
        value: null,
        from: null,
        to: null,
        running,
        tone: 'hidden',
      })
      continue
    }
    const from = running
    runningCents += cents(v)
    stepCents += cents(v)
    running = runningCents / 100
    see(from, running)
    bars.push({
      step: s,
      key: s.key,
      label: s.label,
      kind: s.kind,
      value: v,
      from,
      to: running,
      running,
      tone:
        s.kind === 'other'
          ? 'other'
          : s.kind === 'rounding'
            ? 'rounding'
            : v > 0
              ? 'up'
              : v < 0
                ? 'down'
                : 'flat',
    })
  }
  const stepSum = stepCents / 100
  const closes = hidden === 0 && end != null && cents(end) - (start == null ? 0 : cents(start)) === stepCents
  return { bars, start, end, stepSum, closes, hidden, min, max }
}

/** The Rounding bar's label (docs/PLAN.md 6.8: "A Rounding bar closes rounded waterfalls"). */
export const ROUNDING_LABEL = 'Rounding'

/**
 * The Rounding bar for a rounded waterfall: the end minus the start minus every step shown, so the
 * rounded steps close on the rounded end. Null (no bar) when a total or a step reads "—", since
 * then nothing can close it honestly, or when the steps already close.
 */
export function roundingStep(
  start: number | null,
  steps: readonly Pick<WaterfallStep, 'value'>[],
  end: number | null,
): WaterfallStep | null {
  if (start == null || end == null || steps.some((s) => s.value == null)) return null
  const gap = cents(end) - cents(start) - steps.reduce((s, x) => s + cents(x.value as number), 0)
  if (gap === 0) return null
  return { key: 'rounding', label: ROUNDING_LABEL, kind: 'rounding', value: gap / 100 }
}

/**
 * A whole waterfall from its totals and steps, with the Rounding bar before the end when `rounded`
 * (HRBP and Leader) and the steps leave a gap: start, steps, Rounding, end.
 */
export function waterfallSteps<S extends WaterfallStep>(
  start: S,
  steps: readonly S[],
  end: S,
  opts: { rounded?: boolean } = {},
): (S | WaterfallStep)[] {
  const rounding = opts.rounded ? roundingStep(start.value, steps, end.value) : null
  return [start, ...steps, ...(rounding ? [rounding] : []), end]
}
