/**
 * Every figure id on the What if view (docs/PLAN.md 9.1 and 9.4): the lever list beside the result
 * strip. Ids start with `whatif-`. Frozen in the M2 freeze; the view itself was built in M3.
 */
export const WHATIF_FIGURES = {
  results: 'whatif-results',
  levers: 'whatif-levers',
  /** The seats a lever may name (added in the M3 freeze). */
  seats: 'whatif-seats',
} as const
export type WhatIfFigureId = (typeof WHATIF_FIGURES)[keyof typeof WHATIF_FIGURES]
