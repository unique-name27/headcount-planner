/**
 * Cost members of the Forecast view's line lists, built once per loaded data and window and then kept
 * to each figure's positions (docs/PLAN.md 16.2: the forecast and the bridge in under 300 ms).
 *
 * A member is one position's lines over a window in one part (src/cost/guard.ts `costMembersOf`), so
 * it reads that position's lines and seat only: the members of a set of positions are exactly the
 * company's members of those positions, in the same (positionId) order. So the company's members of
 * the forecast run's lines and of a version's lines are built once per line list, placement, atom
 * index and window, and every context, scope, org and side filters them; nothing is recomputed per
 * scope. The line lists are the loaded data's own (the run's lines, a version's lines), so a changed
 * dataset or plan state builds its own.
 *
 * The guarded sides of the view's differences (`guardedSideOf`, `guardedDeltaOf`) are kept the same
 * way, by everything their figure is made of, so contexts that differ only where a figure does not
 * read (the period, the tab, Finance and HR admin with the switch off) share them.
 * memo.slow.test.ts checks that contexts asked in turn get exactly the models fresh modules give.
 *
 * Callers read members and sides only (they are shared between contexts and never changed). Pure.
 */
import type { GuardedDifference } from '@/cost/differences'
import { isPartialCostFilter } from '@/cost/fit'
import type { CostMember, GuardedFigure } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import type { Month } from '@/data/schema'
import { isLocked } from '@/plan/engine/versions'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { placementOf } from '@/views/plan/engine/core'
import {
  costIdsOf,
  type DiffSide,
  fitOf,
  foldsOf,
  guardDelta,
  guardEnvOf,
  guardFigure,
  membersOf,
} from '@/views/plan/engine/guarded'

const NO_ATOMS: object = {}

const memo = new WeakMap<readonly PlanLine[], WeakMap<object, WeakMap<object, Map<string, CostMember[]>>>>()

/** Every position's members of `lines` over `months` (see the module comment). */
export function companyMembersOf(
  ctx: AnalyticsContext,
  lines: readonly PlanLine[],
  months: readonly Month[],
): readonly CostMember[] {
  return companyMembers(ctx, lines, months, true) as readonly CostMember[]
}

/** The company's members, built when `build` is set, else only read when already built (null when not). */
function companyMembers(
  ctx: AnalyticsContext,
  lines: readonly PlanLine[],
  months: readonly Month[],
  build: boolean,
): readonly CostMember[] | null {
  let byPlace = memo.get(lines)
  if (!byPlace) {
    byPlace = new WeakMap()
    memo.set(lines, byPlace)
  }
  const place = placementOf(ctx)
  let byAtoms = byPlace.get(place)
  if (!byAtoms) {
    byAtoms = new WeakMap()
    byPlace.set(place, byAtoms)
  }
  const atomsKey = (ctx.guard.atoms as object | null) ?? NO_ATOMS
  let byWindow = byAtoms.get(atomsKey)
  if (!byWindow) {
    byWindow = new Map()
    byAtoms.set(atomsKey, byWindow)
  }
  const key = months.join(',')
  let hit = byWindow.get(key)
  if (!hit) {
    if (!build) return null
    hit = membersOf(ctx, lines, months, null)
    if (byWindow.size > 64) byWindow.clear()
    byWindow.set(key, hit)
  }
  return hit
}

/**
 * `membersIn` when the company's members of `lines` over `months` are built already (by a guarded
 * side of the same lines and window), else the members built from the lines for this reader alone,
 * not kept: the same members either way. For a reader that should not be the first to build the
 * shared members (the bridge's seats, which tests read apart from the guard's figures).
 */
export function membersInIfBuilt(
  ctx: AnalyticsContext,
  lines: readonly PlanLine[],
  months: readonly Month[],
  ids: ReadonlySet<string>,
): CostMember[] {
  const built = companyMembers(ctx, lines, months, false)
  if (!built) return membersOf(ctx, lines, months, ids)
  const out: CostMember[] = []
  for (const m of built) if (ids.has(m.positionId)) out.push(m)
  return out
}

/**
 * The members of `lines` over `months` kept to a set of positions (the context's cost selection when
 * not given): equal, member for member and in order, to src/views/plan/engine/guarded.ts `membersOf`
 * over the same lines kept to the same positions.
 */
export function membersIn(
  ctx: AnalyticsContext,
  lines: readonly PlanLine[],
  months: readonly Month[],
  ids: ReadonlySet<string> = costIdsOf(ctx),
): CostMember[] {
  const out: CostMember[] = []
  for (const m of companyMembersOf(ctx, lines, months)) if (ids.has(m.positionId)) out.push(m)
  return out
}

/* ───────────── guarded sides, kept by what they are made of ───────────── */

/** A small number for an object (a fold, an atom index), stable while the object lives. */
const objectIds = new WeakMap<object, number>()
let nextObjectId = 1
const objectId = (o: object | null | undefined): number => {
  if (!o) return 0
  let id = objectIds.get(o)
  if (id === undefined) {
    id = nextObjectId++
    objectIds.set(o, id)
  }
  return id
}

/** Each set of positions a side was kept to, by its sorted IDs; numbers are never reused. */
const signatures = new Map<string, number>()
/** The characters the signatures' texts hold; past the bound they are let go (numbers are not reused). */
let signatureChars = 0
let nextSignature = 1

const signatureOfSet = new WeakMap<ReadonlySet<string>, number>()

/** A number that names a set of positions exactly (the same set, the same number; read once per set object). */
export function idsSignature(ids: ReadonlySet<string>): number {
  const known = signatureOfSet.get(ids)
  if (known !== undefined) return known
  const text = [...ids].sort().join('\u0001')
  let id = signatures.get(text)
  if (id === undefined) {
    if (signatures.size >= 4_096 || signatureChars + text.length > 8_000_000) {
      signatures.clear()
      signatureChars = 0
    }
    signatureChars += text.length
    id = nextSignature++
    signatures.set(text, id)
  }
  signatureOfSet.set(ids, id)
  return id
}

const sideMemo = new WeakMap<readonly CostMember[], Map<string, DiffSide>>()

/**
 * One guarded side of a displayed difference: the company's members of `lines` over `months`
 * (`companyMembersOf`) kept to `ids`, and their `guardFigure` for `version` (with `partial` when
 * given). Kept by everything the figure is made of: the members (the shared company members and the
 * exact set of positions, `idsSignature(ids)`), the guard's mode, rules, band switch and atom index,
 * the fit, the fold and the version. So a context with the same scope, mode and filters (a period
 * change, a tab, a home and its view) reads the figure again instead of rebuilding it; anything that
 * changes one of those builds its own. Callers only read what this returns.
 */
export function guardedSideOf(
  ctx: AnalyticsContext,
  lines: readonly PlanLine[],
  months: readonly Month[],
  ids: ReadonlySet<string>,
  signature: number,
  version: AnyVersion | null,
  partial?: boolean,
): DiffSide {
  const source = companyMembersOf(ctx, lines, months)
  const env = guardEnvOf(ctx)
  const key = [
    signature,
    env.mode,
    JSON.stringify(env.rules),
    env.bandShown,
    fitOf(ctx, version) ?? '',
    partial ?? isPartialCostFilter(ctx.filters),
    objectId(foldsOf(ctx, version)),
    objectId(env.atoms),
    version ? `${version.versionId}|${isLocked(version) ? version.hash : ''}` : '',
  ].join('\u0002')
  let byKey = sideMemo.get(source)
  if (!byKey) {
    byKey = new Map()
    sideMemo.set(source, byKey)
  }
  let side = byKey.get(key)
  if (!side) {
    const members: CostMember[] = []
    for (const m of source) if (ids.has(m.positionId)) members.push(m)
    side = { members, figure: guardFigure(ctx, { members, version, ...(partial ? { partial } : {}) }) }
    if (byKey.size > 512) byKey.clear()
    byKey.set(key, side)
  }
  return side
}

const deltaMemo = new WeakMap<GuardedFigure, WeakMap<GuardedFigure, GuardedDifference>>()

/**
 * `guardDelta` of two sides from `guardedSideOf`: a figure stands for its members and the guard's
 * settings (they are its key), so the difference of two figures is kept by the pair.
 */
export function guardedDeltaOf(ctx: AnalyticsContext, a: DiffSide, b: DiffSide): GuardedDifference {
  let byB = deltaMemo.get(a.figure)
  if (!byB) {
    byB = new WeakMap()
    deltaMemo.set(a.figure, byB)
  }
  let d = byB.get(b.figure)
  if (!d) {
    d = guardDelta(ctx, a, b)
    byB.set(b.figure, d)
  }
  return d
}
