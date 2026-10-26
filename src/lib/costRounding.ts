/**
 * Rounded cost for HRBP and Leader mode (docs/PLAN.md 7.1 and 7.3, pay view 'rounded'). In those
 * modes every cost amount is built from cost atoms: each atom's filled part and band part are
 * rounded down to a whole $100,000 on their own, and a row over several atoms adds the rounded parts
 * with `sumRounded`, before any screen, export, workspace file, comment or help text reads it.
 * Finance and HR admin keep exact amounts (with their own guard); Manager mode shows no amounts. The
 * rounding code is the template's, unchanged, plus `...To` forms that take the step (`roundCostTo`,
 * `sumRoundedTo`, `addedStepsTo`, `costRangeTo`, `isRoundedCostTo`): the cost guard rounds to the step
 * in force (`cost.guard.floorUsd`, locked and raise-only), so a raised step reaches every amount. Pure.
 *
 * An amount is rounded down to the $100,000 at or below it, so every rounded amount stands for a
 * $100,000 step of one grid (`costRange`):
 *
 *   0, shown "under $0.1M"   0 to under $100,000
 *   $0.1M                    $100,000 to under $200,000
 *   $12.3M                   $12,300,000 to under $12,400,000
 *
 * Why down and not to the nearest: a sum or difference of steps on one grid is again bounded by
 * points of that grid, so however many amounts are added and subtracted (two breakdowns of the
 * same scope, two filters, two dates), and however many such differences are laid over each other,
 * what they say about one person's pay is never narrower than $100,000. Rounding to the nearest
 * $100,000 puts each step half a step off the grid; a difference of three amounts then lands half a
 * step off a difference of two, and laid over each other they pin some people's pay to $50,000.
 *
 * Why per atom: the grid argument holds for whole sums and differences only. A linear program over
 * many amounts can also take halves and thirds of them, so a total rounded in one step for every
 * set a filter can pick would pin small groups far below a step. Rounding each atom on its own and
 * adding with `sumRounded` means a set of atoms says nothing its atoms, each on its own, do not.
 * HRBP and Leader share one partition, fixed at each month close (change C3, C20), and
 * `src/cost/costLp.slow.test.ts` checks that nothing they observe pins anyone narrower than $100,000.
 *
 * Ratios built from cost are computed from the rounded amounts (`ratioOf`), so they say nothing the
 * rounded amounts do not. Shown with the 'moneyM' format: "$12.3M", "$0.4M", "under $0.1M".
 *
 *   const cost = rounded ? roundCost(exact) : exact
 *   fmt(cost, rounded ? 'moneyM' : 'money')
 */

/** The rounding step: $100,000. */
export const COST_STEP = 100_000

/** How a rounded amount under the step reads. */
export const UNDER_COST_STEP = 'under $0.1M'

/** A per-head amount from a rounded total is kept to the nearest $1,000. */
export const PER_HEAD_STEP = 1_000

/**
 * An amount rounded down to a whole $100,000 (toward zero for a negative one); anything under
 * $100,000 is 0, which reads "under $0.1M".
 */
export function roundCost(v: number): number {
  return roundCostTo(v, COST_STEP)
}

/**
 * `roundCost` to a step of its own: the step HRBP and Leader cost is rounded to in force (the locked,
 * raise-only `cost.guard.floorUsd`, read through `src/metrics/costGuard.ts`), so a raised step reaches
 * every rounded amount. The cost guard (src/cost/) rounds with these `...To` forms only. The step is
 * a parameter of its own name, not a second argument of `roundCost`, so `amounts.map(roundCost)`
 * (which passes the index second) keeps rounding to `COST_STEP`.
 */
export function roundCostTo(v: number, step: number): number {
  if (!Number.isFinite(v)) return v
  const r = Math.floor(Math.abs(v) / step) * step
  return v < 0 && r ? -r : r
}

/**
 * The total of amounts each rounded down on its own (`roundCost`, one a cost atom part): their sum
 * plus one step for every two of them at $100,000 or more, since rounding down takes half a step
 * off each on average (six atoms' plain sum would read $0.3M low, enough to turn a budget status).
 * It reads the rounded amounts alone, so it says nothing they do not, and it stays on the grid.
 * The exact total is at or above it less the steps added, and under that plus a step an amount.
 *
 *   sumRounded([7_300_000, 4_500_000, 200_000])   // 12,100,000: 12.0M and a step for two of three
 */
export function sumRounded(rounded: readonly number[]): number {
  return sumRoundedTo(rounded, COST_STEP)
}

/** `sumRounded` over amounts rounded to `step` (`roundCostTo`): a step for every two of a step or more. */
export function sumRoundedTo(rounded: readonly number[], step: number): number {
  let total = 0
  let whole = 0
  for (const v of rounded) {
    total += v
    if (v >= step) whole++
  }
  return total + addedStepsTo(whole, step)
}

/** What `sumRounded` adds over `whole` rounded amounts of $100,000 or more: a step for every two. */
export const addedSteps = (whole: number): number => addedStepsTo(whole, COST_STEP)

/** `addedSteps` for a step of its own. */
export const addedStepsTo = (whole: number, step: number): number => Math.floor(whole / 2) * step

/** `roundCost` that passes null through. */
export const roundCostOrNull = (v: number | null | undefined): number | null =>
  v == null ? null : roundCost(v)

/** `roundCost` when `round`, else the amount as it is. */
export const costIn = (v: number | null | undefined, round: boolean): number | null =>
  v == null ? null : round ? roundCost(v) : v

/**
 * A ratio of two amounts, from the rounded amounts when `round` (so it cannot undo the rounding);
 * null when the denominator is 0 or missing.
 */
export function ratioOf(num: number | null, den: number | null, round: boolean): number | null {
  if (num == null || den == null) return null
  const n = round ? roundCost(num) : num
  const d = round ? roundCost(den) : den
  return d === 0 ? null : n / d
}

/**
 * A per-head amount from a rounded total: the total over the people, to the nearest $1,000.
 * Null under $100,000 (the total reads "under $0.1M") or with nobody behind it.
 */
export function perHeadOfRounded(rounded: number | null, people: number): number | null {
  if (rounded == null || !people || rounded === 0) return null
  return Math.round(rounded / people / PER_HEAD_STEP) * PER_HEAD_STEP
}

/** The exact amounts, from `lo` up to but not including `hi`, that a rounded total stands for. */
export function costRange(rounded: number): readonly [lo: number, hi: number] {
  return costRangeTo(rounded, COST_STEP)
}

/** `costRange` for a step of its own. */
export function costRangeTo(rounded: number, step: number): readonly [lo: number, hi: number] {
  return [rounded, rounded + step]
}

/** True when an amount is on the rounding grid (a whole $100,000). */
export const isRoundedCost = (v: number): boolean => isRoundedCostTo(v, COST_STEP)

/** True when an amount is on the grid of a step of its own (a whole multiple of it). */
export const isRoundedCostTo = (v: number, step: number): boolean => Number.isFinite(v) && v % step === 0
