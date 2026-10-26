/**
 * Differences (docs/PLAN.md 7.2 rule 5, spec rule (c), change C6). A displayed difference (variance,
 * every bridge step, the FX effect, month over month, version against version, What if deltas, the
 * gap change after approval, a KPI delta on a cost tile) needs `rules.minContributors` (5)
 * contributors: costed positions whose amount differs between the two sides by more than half a
 * cent. Open and Planned seats at band estimate are public structure and do not count toward the 5;
 * for the FX effect only non-USD costed people count; leave transitions count.
 *
 * A difference in which only band-estimate amounts change (no Filled seat's HRIS amount, no accepted
 * offer's amount and no leave status differs) is a band figure: it shows wherever band estimates
 * show (`cost:band`: never in Manager mode) with no contributor count. As soon as any HRIS, offer or
 * leave-driven amount differs, the whole difference falls under the rule. A bridge step with fewer
 * contributors folds into "Other changes" with the same while-under-the-minimum rule. In rounded modes
 * a difference is built from rounded parts (`sumRounded` of one side's atoms minus the other's,
 * ./guard.ts). The rule applies in every mode except HR admin with the switch on ('open').
 *
 * How a model builder uses it: each side's filled amounts by position (`filledByPosition` over the
 * side's members: the costed positions, band seats left out; for the FX effect, only non-USD
 * members), then `contributors`, `bandOnly` over both parts (`loadedByPosition`, `basisOfSides`) and
 * `guardedDifference` with the mode; a bridge folds its steps with `foldSteps` first.
 *
 * Readings taken here (cost guard builder, M2):
 *  - `bandOnly` is false when nothing differs: a difference with no change is not a band figure, so
 *    it reads "—" like any difference under the minimum (0 contributors).
 *  - A position whose basis on a side is null does not exist on that side; a position that differs
 *    and is band-costed on one side and filled on the other is not band only.
 *  - `guardedDifference` takes the mode as an option: 'open' shows every difference, 'none' none
 *    (band figures included). Without a mode the rule applies as for Finance and the rounded modes,
 *    and a band figure shows only when `bandShown` is set (it defaults to false, so a caller that
 *    forgets it shows "—", never an amount).
 *  - `foldSteps`: a step marked `band` (a band figure) is never folded and does not count toward
 *    Other changes; a step with no contributors joins Other changes, and the shown steps are pulled
 *    in only while Other changes has 1 to `min` − 1 distinct contributors (an Other changes of nobody
 *    adds nothing a subtraction could read). A step another surface publishes on its own (`published`,
 *    the FX tile) is pulled in only when no other shown step can be (C33, RC-1). A folded step whose
 *    costed amount moved with no contributor counted (`moves`: an HRIS cohort's modeled exits, which
 *    are not positions) pulls a shown step in too, so Other changes never shows a move of nobody.
 *  - Since lead decision C34 the bridge folds its guarded modes (Finance, HR admin with the switch
 *    off, HRBP and Leader) once for every scope, from leave-neutral facts only
 *    (src/views/forecast/engine/bridge.ts `globalFold`); `foldSteps` is HR admin's with the switch
 *    on, which hides nothing. The bridge's `moves` is read on the leave-neutral seats, so a leave
 *    alone never sets it.
 *
 * The minimum is always passed in (from `ctx.guard.rules`), never a constant. Pure. Frozen in the M2
 * freeze (docs/CONTRACTS-M2.md); bodies filled by the cost guard builder.
 */
import type { CostBasis } from '@/plan/types'
import { NO_AMOUNTS_NOTE } from './fit'
import { OTHER } from './fold'
import type { CostField, CostMember, GuardMode } from './guard'

/** An amount differs when the sides are more than half a cent apart. */
export const DIFF_EPS = 0.005

/** The bridge's fold of steps under the minimum. */
export const OTHER_CHANGES = 'Other changes'

/** Why a difference reads "—". */
export const differenceNote = (min: number): string =>
  `Hidden to protect anonymity (fewer than ${min} positions changed)`

/**
 * The positions whose amount differs between side `a` and side `b` by more than `eps` (a position on
 * one side only counts with 0 on the other). The caller passes costed positions only (band seats are
 * left out, rule 5), keyed by positionId.
 */
export function contributors(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
  eps: number = DIFF_EPS,
): ReadonlySet<string> {
  const out = new Set<string>()
  for (const id of new Set([...a.keys(), ...b.keys()]))
    if (Math.abs((a.get(id) ?? 0) - (b.get(id) ?? 0)) > eps) out.add(id)
  return out
}

/**
 * True when every position whose amount differs between the sides is costed at band on both sides
 * where it exists (`basisOf`), so the difference is a band figure.
 */
export function bandOnly(
  a: ReadonlyMap<string, number>,
  b: ReadonlyMap<string, number>,
  basisOf: (positionId: string, side: 'a' | 'b') => CostBasis | null,
  eps: number = DIFF_EPS,
): boolean {
  const differing = contributors(a, b, eps)
  if (!differing.size) return false
  for (const id of differing)
    for (const side of ['a', 'b'] as const) {
      const basis = basisOf(id, side)
      if (basis !== null && basis !== 'band') return false
    }
  return true
}

/** A displayed difference under rule 5. */
export interface GuardedDifference {
  /** The difference, or null when it reads "—". */
  value: number | null
  /** Its contributors (0 for a band figure). */
  contributors: number
  /** It is a band figure (only band-estimate amounts differ). */
  band: boolean
  /** Why it reads "—" (`differenceNote`, or Manager mode's), else null. */
  reason: string | null
}

/**
 * The difference as shown: unsuppressed when `contributing` has the minimum or more; a band figure
 * (`bandOnly`) shows unsuppressed where `bandShown` (the mode shows `cost:band`) and reads "—" where
 * it does not; otherwise "—".
 */
export function guardedDifference(
  delta: number,
  contributing: ReadonlySet<string> | number,
  min: number,
  opts: { bandOnly?: boolean; bandShown?: boolean; mode?: GuardMode } = {},
): GuardedDifference {
  const n = typeof contributing === 'number' ? contributing : contributing.size
  const band = opts.bandOnly === true
  if (opts.mode === 'none') return { value: null, contributors: band ? 0 : n, band, reason: NO_AMOUNTS_NOTE }
  if (opts.mode === 'open') return { value: delta, contributors: band ? 0 : n, band, reason: null }
  if (band)
    return opts.bandShown
      ? { value: delta, contributors: 0, band: true, reason: null }
      : { value: null, contributors: 0, band: true, reason: NO_AMOUNTS_NOTE }
  return n >= min
    ? { value: delta, contributors: n, band: false, reason: null }
    : { value: null, contributors: n, band: false, reason: differenceNote(min) }
}

/** What `foldSteps` reads of a bridge step. */
export interface StepFacts {
  key: string
  delta: number
  /** Its contributors (positions), counted under rule 5. */
  contributors: ReadonlySet<string>
  /** A band figure (only band-estimate amounts move): shown where band estimates show, never folded. */
  band?: boolean
  /**
   * A costed amount moved in the step even when no contributor is counted (an HRIS cohort's modeled
   * exits, which are not positions). Folded, it makes Other changes take a shown step in, so Other
   * changes never shows a move of nobody. The bridge reads it on leave-neutral prices (C26, C34).
   */
  moves?: boolean
}

/** The steps after the fold: the ones shown, and "Other changes" with the rest. */
export interface FoldedSteps<S extends StepFacts> {
  shown: S[]
  other: {
    key: typeof OTHER
    label: typeof OTHER_CHANGES
    delta: number
    /** Distinct contributors across the folded steps. */
    contributors: number
    steps: S[]
  } | null
}

/** What `foldSteps` may be told besides the steps and the minimum. */
export interface FoldStepsOptions {
  /**
   * Step keys another surface publishes on its own (the FX effect tile): Other changes takes one in
   * only when no other shown step can go (C33, review RC-1: Other changes less the FX tile gave one
   * position's cost change).
   */
  published?: ReadonlySet<string>
}

/**
 * The bridge's steps under rule 5: a step with fewer than `min` contributors folds into "Other
 * changes"; while Other changes has fewer than `min` distinct contributors, the shown step with the
 * fewest joins it (ties to the first in order), a published step only when no other can. Steps keep
 * their order.
 */
export function foldSteps<S extends StepFacts>(
  steps: readonly S[],
  min: number,
  opts: FoldStepsOptions = {},
): FoldedSteps<S> {
  const at = new Map(steps.map((s, i) => [s, i]))
  const shown = steps.filter((s) => s.band === true || s.contributors.size >= min)
  const folded = steps.filter((s) => s.band !== true && s.contributors.size < min)
  if (!folded.length) return { shown, other: null }
  const people = new Set<string>()
  for (const s of folded) for (const id of s.contributors) people.add(id)
  const published = opts.published
  const candidates = () => {
    const all = shown.filter((s) => s.band !== true)
    const free = published ? all.filter((s) => !published.has(s.key)) : all
    return free.length ? free : all
  }
  for (;;) {
    if (people.size >= min) break
    // Nobody counted and no costed move: an Other changes of nobody adds nothing a subtraction could read.
    if (people.size === 0 && !folded.some((s) => s.moves === true)) break
    const pool = candidates()
    if (!pool.length) break
    let pick = pool[0]
    for (const s of pool) if (s.contributors.size < pick.contributors.size) pick = s
    shown.splice(shown.indexOf(pick), 1)
    folded.push(pick)
    for (const id of pick.contributors) people.add(id)
  }
  folded.sort((x, y) => (at.get(x) ?? 0) - (at.get(y) ?? 0))
  return {
    shown,
    other: {
      key: OTHER,
      label: OTHER_CHANGES,
      delta: folded.reduce((a, s) => a + s.delta, 0),
      contributors: people.size,
      steps: folded,
    },
  }
}

/* ───────────── each side's amounts from members ───────────── */

/**
 * A side's filled amounts by position (the costed positions rule 5 counts; band seats left out).
 * `field` is loaded cost by default; `keep` narrows the members (for the FX effect: non-USD ones).
 */
export function filledByPosition(
  members: readonly CostMember[],
  field: CostField = 'loaded',
  keep: (m: CostMember) => boolean = () => true,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of members)
    if (m.part === 'filled' && keep(m)) out.set(m.positionId, (out.get(m.positionId) ?? 0) + m.amounts[field])
  return out
}

/** A side's loaded cost by position, both parts (what `bandOnly` compares). */
export function loadedByPosition(members: readonly CostMember[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of members) out.set(m.positionId, (out.get(m.positionId) ?? 0) + m.amounts.loaded)
  return out
}

/**
 * `bandOnly`'s `basisOf` from the two sides' members: 'band' where a position has only band-part
 * members on that side, 'hris' where it has a filled-part member (HRIS pay, an offer, an allowance),
 * null where it has none.
 */
export function basisOfSides(
  a: readonly CostMember[],
  b: readonly CostMember[],
): (positionId: string, side: 'a' | 'b') => CostBasis | null {
  const of = (members: readonly CostMember[]) => {
    const out = new Map<string, CostBasis>()
    for (const m of members) {
      if (m.part === 'filled') out.set(m.positionId, 'hris')
      else if (!out.has(m.positionId)) out.set(m.positionId, 'band')
    }
    return out
  }
  const sides = { a: of(a), b: of(b) }
  return (id, side) => sides[side].get(id) ?? null
}
