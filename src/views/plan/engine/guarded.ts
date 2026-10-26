/**
 * The cost guard as the Plan and Forecast models call it (docs/PLAN.md 7; src/cost/): every amount a
 * figure, tile, calculation card or export of these views reads is built here, from lines, before
 * any reader sees a number. The UI never decides privacy; it renders what these return.
 *
 * How it runs, per figure: the lines over the figure's window and scope become `costMembers`; in
 * Finance and in HR admin with the switch off, each unit's one cost-center fold is built once per
 * version and as-of date over the version's whole grid, unfiltered, and reused under every filter
 * (7.4); `costFit` gives the reason cost cannot show under the filters and period (7.3b, 7.4, 7.5);
 * `guardModel` builds the one `GuardedFigure` the reader takes. A displayed difference counts its
 * contributors (7.2 rule 5) over the positions behind both totals, band seats left out.
 *
 * Readings taken here (views-1 builder, M2):
 *  - Rounded cost in a tree scope (a Leader's org) covers the tree's atoms whole: the root seat (the
 *    leader's own seat) is in its own atom (7.3a: a director's org, a VP's own direct staff), so the
 *    cost members and the union check take the root seats beside the tree. Heads stay strictly
 *    below the root (8.2). The rounded value of that atom is the one HRBP mode shows for the unit's
 *    union, so nothing new is observed.
 *  - The period check of `costFit` reads the period picker for every cost figure, also for a tile
 *    with its own fixed window (year to date, the full year): under `month` or `custom` every cost
 *    figure shows heads in rounded modes, as 7.3(b) says.
 *  - Finance's fold for a version is sized on the lines the version shows (src/views/plan/engine/
 *    core.ts `shownLines`) over its grid; the forecast of the same fiscal year reuses its Working's
 *    fold, so one fold holds for every figure of a version.
 *
 * Readings taken here (finance-guard fix, lead decision D-FIN, PLAN change C33):
 *  - The component split (`componentGate`, C33 (b)): every member `membersOf` builds remembers the
 *    lines and window it came from (`originOf`), and an exact figure whose filled members all come
 *    from one origin is guarded with that origin's gate, built once over every position's lines in
 *    the window with each costed line's cap sides (src/views/lineSource.ts `capSidesOf`). So a
 *    figure shows its split only when it is whole units that pass; members of mixed or unknown
 *    origin show loaded cost only.
 *  - Rounded modes: a `qtd` or `ytd` window of fewer than two closed months is one month's cost per
 *    atom (review RR-3), so `fitOf` gives `ROUNDED_SHORT_WINDOW_NOTE` for it, and a figure built over
 *    a window of one month (Loaded cost YTD after April's close) gives the same reason.
 */

import type { ScopeLock } from '@/access/scopes/types'
import { type AtomIndex, isUnionOfAtoms } from '@/cost/atoms'
import {
  bandOnly,
  basisOfSides,
  contributors,
  filledByPosition,
  type GuardedDifference,
  guardedDifference,
  loadedByPosition,
} from '@/cost/differences'
import { costFit, isPartialCostFilter, ROUNDED_SHORT_WINDOW_NOTE, WHOLE_TEAMS_NOTE } from '@/cost/fit'
import type { FinanceFold } from '@/cost/fold'
import {
  type BreakdownOptions,
  type ComponentGate,
  type CostMember,
  type CostRowOptions,
  componentGate,
  costMembersOf,
  financeFolds,
  type GuardedFigure,
  type GuardMode,
  guardModel,
  hiddenNote,
} from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { fiscalYearOf, fyRange, monthEnd, monthKey, monthRange, periodWindow } from '@/data/fiscal'
import type { Month } from '@/data/schema'
import type { Filters } from '@/data/scope'
import { addDays } from '@/lib/dates'
import type { CostGuardSettings } from '@/metrics/costGuard'
import { isLocked } from '@/plan/engine/versions'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { capSidesOf, paidLineOf } from '@/views/lineSource'
import {
  costSeatOf,
  gridMonths,
  Memo,
  managerOfIn,
  perContext,
  placementOf,
  scopeOf,
  shownLines,
} from './core'

/** What every guarded figure of a context reads. */
export interface GuardEnv {
  mode: GuardMode
  rules: CostGuardSettings
  atoms: AtomIndex
  /** Band estimates show (`cost:band`: every mode but Manager). */
  bandShown: boolean
  /** Monthly cost shows (`cost:monthly`: Finance and HR admin). */
  monthlyShown: boolean
  /** Components, cost incl. SBC, the exit run rate and freeze savings amounts show (`cost:component`). */
  componentsShown: boolean
}

export const guardEnvOf = perContext(
  (ctx): GuardEnv => ({
    mode: ctx.guard.mode,
    rules: ctx.guard.rules,
    atoms: ctx.guard.atoms,
    bandShown: ctx.guard.mode !== 'none' && ctx.access.can('cost:band'),
    monthlyShown: ctx.guard.mode !== 'none' && ctx.access.can('cost:monthly'),
    componentsShown: ctx.guard.mode !== 'none' && ctx.access.can('cost:component'),
  }),
)

/** A tree scope's root seats (the leader's or manager's own seats), else none. */
const rootsOf = (scope: ScopeLock | null): ReadonlySet<string> =>
  scope?.kind === 'tree' ? scope.rootPositionIds : new Set<string>()

/**
 * The positions a cost figure covers: the scope's positions, and in rounded modes a tree scope's
 * root seats while the leader filter is the scope's own pin (see the module comment).
 */
export const costIdsOf = perContext((ctx): ReadonlySet<string> => {
  const ids = scopeOf(ctx).ids
  if (ctx.guard.mode !== 'rounded') return ids
  const roots = rootsOf(ctx.access.scope)
  if (!roots.size) return ids
  const f = ctx.filters
  const pinned = f.leaderId != null && roots.has(f.leaderId) && f.modes?.leaderId !== 'exclude'
  const otherOrg =
    f.businessUnit.length + f.department.length + f.costCenter.length + f.location.length + f.level.length > 0
  if (!pinned || otherOrg) return ids
  const out = new Set(ids)
  for (const r of roots) out.add(r)
  return out
})

/** The lines of a window, kept to a set of positions (none: every position). */
export function linesIn(
  lines: readonly PlanLine[],
  months: readonly Month[],
  ids: ReadonlySet<string> | null,
): PlanLine[] {
  const inWindow = new Set(months)
  const out: PlanLine[] = []
  for (const l of lines) if (inWindow.has(l.month) && (!ids || ids.has(l.positionId))) out.push(l)
  return out
}

/** The lines and window a member was built from (the component gate is built over them, C33). */
export interface MemberOrigin {
  /** Every position's lines (unfiltered). */
  lines: readonly PlanLine[]
  months: readonly Month[]
}

const originMemo = new WeakMap<readonly PlanLine[], Map<string, MemberOrigin>>()
const originOfMember = new WeakMap<CostMember, MemberOrigin>()

/** The one origin object of a line list and window. */
function originFor(lines: readonly PlanLine[], months: readonly Month[]): MemberOrigin {
  let byMonths = originMemo.get(lines)
  if (!byMonths) {
    byMonths = new Map()
    originMemo.set(lines, byMonths)
  }
  const key = months.join(',')
  let hit = byMonths.get(key)
  if (!hit) {
    hit = { lines, months }
    if (byMonths.size > 64) byMonths.clear()
    byMonths.set(key, hit)
  }
  return hit
}

/**
 * Records that members were built from `lines` (every position's, unfiltered) over `months`, so an
 * exact figure of them can be given that window's component gate (`gateFor`). Callers that build
 * members themselves (src/views/targets/engine/working.ts) call it too.
 */
export function rememberOrigin(
  members: readonly CostMember[],
  lines: readonly PlanLine[],
  months: readonly Month[],
): void {
  const origin = originFor(lines, months)
  for (const m of members) originOfMember.set(m, origin)
}

/** The one origin of the members' filled part, or null when there is none or more than one. */
export function originOf(members: readonly CostMember[]): MemberOrigin | null {
  let out: MemberOrigin | null = null
  for (const m of members) {
    if (m.part !== 'filled') continue
    const o = originOfMember.get(m)
    if (!o || (out && o !== out)) return null
    out = o
  }
  return out
}

/** The cost members of lines over a window, kept to a set of positions (none: every position). */
export function membersOf(
  ctx: AnalyticsContext,
  lines: readonly PlanLine[],
  months: readonly Month[],
  ids: ReadonlySet<string> | null = costIdsOf(ctx),
): CostMember[] {
  const members = costMembersOf({
    lines: linesIn(lines, months, ids),
    months,
    seatOf: costSeatOf(ctx),
    atoms: ctx.guard.atoms,
  }).members
  rememberOrigin(members, lines, months)
  return members
}

const gateMemo = new WeakMap<MemberOrigin, WeakMap<object, Map<string, ComponentGate>>>()

/**
 * The component gate of the members' origin (C33 (b)): every position's lines in the window, each
 * unit's component and cap classes, by month and over the window. Null outside the exact modes, or
 * for members of no single origin (their figure shows loaded cost only).
 */
export function gateFor(ctx: AnalyticsContext, members: readonly CostMember[]): ComponentGate | null {
  if (ctx.guard.mode !== 'exact') return null
  const origin = originOf(members)
  if (!origin) return null
  let byData = gateMemo.get(origin)
  if (!byData) {
    byData = new WeakMap()
    gateMemo.set(origin, byData)
  }
  // Keyed by the placement rows (stable per loaded data); the seat function is made per call.
  const placement = placementOf(ctx)
  let byKey = byData.get(placement)
  if (!byKey) {
    byKey = new Map()
    byData.set(placement, byKey)
  }
  const key = `${ctx.guard.rules.minCosted}|${ctx.asOf}`
  let hit = byKey.get(key)
  if (!hit) {
    hit = componentGate(
      {
        lines: linesIn(origin.lines, origin.months, null),
        months: origin.months,
        seatOf: costSeatOf(ctx),
        capSides: capSidesOf(ctx),
        // Leave-neutral contributors (C26, R44): an unpaid month counts its paid twin's components.
        paidLineOf: (l) => paidLineOf(ctx, l),
      },
      ctx.guard.rules.minCosted,
    )
    if (byKey.size > 16) byKey.clear()
    byKey.set(key, hit)
  }
  return hit
}

/**
 * Rounded modes: the months the period picker's window covers, ending at the last close on or before
 * the as-of date (as the Plan view's `windowMonths` read them, 7.3b); null in other modes.
 */
function roundedWindowMonths(ctx: AnalyticsContext, filters: Filters): Month[] | null {
  if (ctx.guard.mode !== 'rounded') return null
  if (filters.period !== 'qtd' && filters.period !== 'ytd') return null
  let close: Month | null = null
  for (const c of ctx.plan?.closes ?? [])
    if (monthEnd(c.month) <= ctx.asOf && (close === null || c.month > close)) close = c.month
  const w = periodWindow(filters.period, ctx.asOf, {
    customStart: filters.customStart,
    customEnd: filters.customEnd,
    closedThrough: close ? monthEnd(close) : addDays(fyRange(fiscalYearOf(ctx.asOf)).start, -1),
  })
  return w.empty ? [] : monthRange(monthKey(w.start), monthKey(w.end))
}

const foldMemo = new Memo<ReadonlyMap<string, FinanceFold>>()

/**
 * Finance's one cost-center fold per unit for a version (7.4), over the version's grid and every
 * position; null outside the exact modes. A Working version's forecast reads its version's fold.
 */
export function foldsOf(
  ctx: AnalyticsContext,
  v: AnyVersion | null,
): ReadonlyMap<string, FinanceFold> | null {
  if (ctx.guard.mode !== 'exact' || !v) return null
  const key = `${v.versionId}|${isLocked(v) ? v.hash : ctx.asOf}|${ctx.guard.rules.minCosted}`
  return foldMemo.get(ctx.all, ctx.plan, key, () => {
    const months = gridMonths(v)
    const members = membersOf(ctx, shownLines(ctx, v), months, null)
    return financeFolds(members, ctx.guard.rules.minCosted)
  })
}

const fitMemo = new WeakMap<AnalyticsContext, Map<string, string | null>>()

/**
 * Why cost cannot show under the context's filters and period (`costFit`), or null. Finance's
 * cost-center filter is checked against the version's fold; rounded modes check the selection is a
 * union of atoms.
 */
export function fitOf(
  ctx: AnalyticsContext,
  v: AnyVersion | null,
  filters: Filters = ctx.filters,
): string | null {
  let byKey = fitMemo.get(ctx)
  if (!byKey) {
    byKey = new Map()
    fitMemo.set(ctx, byKey)
  }
  const key = `${v?.versionId ?? ''}|${filters === ctx.filters ? '' : JSON.stringify(filters)}`
  if (byKey.has(key)) return byKey.get(key) ?? null
  let shownCostCenters: Set<string> | null = null
  if (filters.costCenter.length) {
    const folds = foldsOf(ctx, v)
    if (folds) {
      shownCostCenters = new Set()
      for (const f of folds.values()) for (const cc of f.shown) shownCostCenters.add(cc)
    }
  }
  let out = costFit(filters, ctx.access.scope, ctx.mode, ctx.access.switchOn, {
    shownCostCenters,
    atoms: ctx.guard.atoms,
    selected: costIdsOf(ctx),
    managerOf: managerOfIn(ctx),
    windowMonths: roundedWindowMonths(ctx, filters),
  })
  // Rounded modes: whatever selects the positions (a unit scope too), a cost figure covers whole
  // atoms only, or it shows heads (7.3a); `costFit` checks unions for department and leader picks.
  if (
    out == null &&
    ctx.guard.mode === 'rounded' &&
    !isUnionOfAtoms(costIdsOf(ctx), ctx.guard.atoms, managerOfIn(ctx))
  )
    out = WHOLE_TEAMS_NOTE
  byKey.set(key, out)
  return out
}

/** One guarded figure from members (see the module comment). */
export function guardFigure(
  ctx: AnalyticsContext,
  input: {
    members: readonly CostMember[]
    /** The version whose fold the figure reuses (exact modes). */
    version: AnyVersion | null
    by?: Omit<BreakdownOptions, keyof CostRowOptions>
    label?: string
    /** The reason cost cannot show, when not the context's own (`fitOf`). */
    fit?: string | null
    /** The members are a share of their units (exact modes: only shown cost centers count); the filters' when not given. */
    partial?: boolean
  },
): GuardedFigure {
  const env = guardEnvOf(ctx)
  const folds = foldsOf(ctx, input.version)
  let fit = input.fit !== undefined ? input.fit : fitOf(ctx, input.version)
  // Rounded modes never show a one-month window (RR-3, C21): Loaded cost YTD after April's close.
  // Under `month` and `custom` the period note of `costFit` already says so (and is the one rule the
  // rounded-mode tests' controls lift to prove the crawl would see month amounts).
  const period = ctx.filters.period
  if (fit == null && env.mode === 'rounded' && period !== 'month' && period !== 'custom') {
    const origin = originOf(input.members)
    if (origin && origin.months.length < 2) fit = ROUNDED_SHORT_WINDOW_NOTE
  }
  return guardModel({
    members: input.members,
    mode: env.mode,
    rules: env.rules,
    atoms: env.atoms,
    folds,
    fit,
    bandShown: env.bandShown,
    ...(input.by ? { by: input.by } : {}),
    partial: input.partial ?? isPartialCostFilter(ctx.filters),
    ...(input.label ? { label: input.label } : {}),
    components: gateFor(ctx, input.members),
  })
}

/** One side of a displayed difference: its members and its guarded total. */
export interface DiffSide {
  members: readonly CostMember[]
  figure: GuardedFigure
}

/**
 * A displayed difference of two guarded totals (7.2 rule 5): the shown totals' difference when both
 * show and 5 or more costed positions behind them differ by more than half a cent; a band figure when
 * only band-estimate amounts differ; "—" otherwise.
 */
export function guardDelta(ctx: AnalyticsContext, a: DiffSide, b: DiffSide): GuardedDifference {
  const env = guardEnvOf(ctx)
  const min = env.rules.minContributors
  if (env.mode === 'none') return guardedDifference(0, 0, min, { mode: 'none' })
  const behind = new Set([...a.figure.total.positionIds, ...b.figure.total.positionIds])
  const keepFilled = (m: CostMember) => m.part === 'band' || behind.has(m.positionId)
  const am = a.members.filter(keepFilled)
  const bm = b.members.filter(keepFilled)
  const contributing = contributors(filledByPosition(am), filledByPosition(bm))
  const band = bandOnly(loadedByPosition(am), loadedByPosition(bm), basisOfSides(am, bm))
  const av = a.figure.total.totalUsd
  const bv = b.figure.total.totalUsd
  if (av == null || bv == null)
    return {
      value: null,
      contributors: contributing.size,
      band,
      reason: a.figure.reason ?? b.figure.reason ?? hiddenNote(env.rules.minCosted),
    }
  return guardedDifference(av - bv, contributing, min, {
    bandOnly: band,
    bandShown: env.bandShown,
    mode: env.mode,
  })
}

/**
 * Rounded modes: whether an org's positions (inside the cost selection) are a whole union of the last
 * close's atoms; a row that is not shows heads only (7.3a, `WHOLE_TEAMS_NOTE`).
 */
export function isWholeUnion(ctx: AnalyticsContext, ids: Iterable<string>): boolean {
  const set = new Set<string>()
  const cost = costIdsOf(ctx)
  for (const id of ids) if (cost.has(id)) set.add(id)
  return isUnionOfAtoms(set, ctx.guard.atoms, managerOfIn(ctx))
}

/**
 * Exact modes with folds: the members a total keeps (`guardModel`'s pool): a unit whose Other would
 * hold fewer than the minimum is left out, and under a filter's share of a unit only its shown cost
 * centers count. Every member in other modes.
 */
export function pooledMembers(
  ctx: AnalyticsContext,
  members: readonly CostMember[],
  version: AnyVersion | null,
  partial: boolean = isPartialCostFilter(ctx.filters),
): CostMember[] {
  const folds = foldsOf(ctx, version)
  if (!folds) return [...members]
  const min = ctx.guard.rules.minCosted
  const people = new Map<string, Set<string>>()
  for (const m of members) {
    if (m.part !== 'filled') continue
    let s = people.get(m.seat.businessUnit)
    if (!s) {
      s = new Set()
      people.set(m.seat.businessUnit, s)
    }
    for (const x of m.people) s.add(x)
  }
  const small = (unit: string): boolean => {
    const f = folds.get(unit)
    return f ? f.other.length > 0 && f.otherSize < min : (people.get(unit)?.size ?? 0) < min
  }
  const shownCenter = (m: CostMember) =>
    folds.get(m.seat.businessUnit)?.shown.includes(m.seat.costCenter) === true
  return members.filter((m) => !small(m.seat.businessUnit) && (!partial || shownCenter(m)))
}
