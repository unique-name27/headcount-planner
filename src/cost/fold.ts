/**
 * Folds (docs/PLAN.md 7.2 rule 2, 7.3 and 7.4): groups under the minimum fold into "Other (k)"; while
 * Other is under the minimum and the total is shown, the smallest shown group joins it (the template
 * app's `foldGroups`, verbatim, ties to the first in order). Invariant (`expectGuarded`, ./guard.ts):
 * shown rows plus Other equal the total (within the rounding steps where rounded), every shown row has
 * the minimum or more, at most one Other.
 *
 * - `wholeParts` (the template app's `wholeUnits`): the rows of parts with the minimum or more, and
 *   the rest, left out of every total (rounded modes: atoms under 5 costed people, with the note
 *   "n people in groups under 5 are left out").
 * - `foldByPart` (the template app's `foldByUnit`): a breakdown folded inside each part, never across.
 * - `financeFold`: Finance's ONE cost-center fold per unit (7.4), sized on every month of the
 *   version's grid and keeping each currency's share of the unit's Other at 0 or 5 or more. Every
 *   Finance figure, filter, breakdown and export in the unit reuses it; a filter never re-folds it.
 * - `financeOrgCost`: whether an org row below the unit may show cost (7.4 "Org rows below the unit").
 *
 * The minimum is always passed in (`cost.guard.minCosted` through `ctx.guard.rules`), never a
 * constant. `OTHER`, `NONE` and `otherLabel` are defined here once.
 *
 * Readings taken here (cost guard builder, M2):
 *  - `financeFold` sorts the cost centers by code first, so "ties to the first in order" never
 *    depends on how a caller collected them. A cost center's size is its fewest costed people in any
 *    month of the grid; the Other's size is the fewest of its summed months (not the sum of its
 *    centers' fewest), so a center whose people start late is not pulled in for nothing. Any folded
 *    center makes the Other non-empty, even one with nobody costed (it may still carry a severance),
 *    so such an Other is filled to the minimum like any other.
 *  - The currency rule reads each month: a currency's share of the Other is fine when it holds 0 or
 *    the minimum or more costed people in every month of the grid; otherwise the smallest shown center
 *    with people in that currency joins (ties to the first in order), until no share is short or the
 *    short ones have no shown center left (accepted risk 15.3.8). Currencies are checked in code
 *    order. A center's people count in the currency of the line that costs them (`costedByCurrency`,
 *    review RF-5), so a person paid in another currency than the center's site is in that currency's
 *    share, never missed.
 *  - `financeOrgCost` ignores a row's positions that no cost center of the fold holds (they carry no
 *    amount), and decides a row once all its children are decided (bottom up), counting a child as
 *    "shown with cost" when its own decision is null.
 *
 * Pure. Frozen in the M2 freeze (docs/CONTRACTS-M2.md); bodies filled by the cost guard builder.
 */

/** The key of an Other row. */
export const OTHER = '__other'
/** The key of the group of rows with no value. */
export const NONE = '__none'
/** "Other (3)": k is the number of distinct groups folded into it, not people. */
export const otherLabel = (k: number): string => `Other (${k})`

/** A group of rows under one key. */
export interface Group<T> {
  key: string
  label: string
  rows: T[]
}

/**
 * Fold a breakdown under the totals rules: groups under the minimum go to Other; while Other is still
 * under it and the total is shown, the smallest shown group joins (ties: the first in order).
 */
export function foldGroups<T>(
  groups: readonly T[],
  size: (g: T) => number,
  minGroup: number,
  totalShown: boolean,
): { shown: T[]; folded: T[] } {
  const shown = groups.filter((g) => size(g) >= minGroup)
  const folded = groups.filter((g) => size(g) < minGroup)
  if (!folded.length) return { shown, folded }
  let otherSize = folded.reduce((s, g) => s + size(g), 0)
  while (totalShown && otherSize < minGroup && shown.length) {
    let i = 0
    for (let j = 1; j < shown.length; j++) if (size(shown[j]) < size(shown[i])) i = j
    const [g] = shown.splice(i, 1)
    folded.push(g)
    otherSize += size(g)
  }
  return { shown, folded }
}

/**
 * The guarded breakdown: `foldGroups` by `size` (rows by default); with `top`, only that many of the
 * rest are named (largest by `rank` first) and the others join Other.
 */
export function guardGroups<T>(
  groups: readonly Group<T>[],
  min: number,
  totalShown: boolean,
  opts: { top?: number; rank?: (g: Group<T>) => number; size?: (g: Group<T>) => number } = {},
): { shown: Group<T>[]; folded: Group<T>[] } {
  const size = opts.size ?? ((g: Group<T>) => g.rows.length)
  const { shown, folded } = foldGroups(groups, size, min, totalShown)
  if (opts.top != null && shown.length > opts.top) {
    const rank = opts.rank ?? size
    const order = shown.slice().sort((a, b) => rank(b) - rank(a) || a.label.localeCompare(b.label))
    const keep = new Set(order.slice(0, opts.top))
    const named = shown.filter((g) => keep.has(g))
    const rest = shown.filter((g) => !keep.has(g))
    return { shown: named, folded: [...folded, ...rest] }
  }
  return { shown, folded }
}

/**
 * Rows grouped by a key, in first-seen order; a missing or empty key is `NONE` (labelled
 * `noneLabel`). The label of any other key is `label(key)`, else the key itself.
 */
export function groupBy<T>(
  rows: readonly T[],
  key: (r: T) => string | null | undefined,
  noneLabel: string,
  label?: (key: string) => string,
): Group<T>[] {
  const map = new Map<string, Group<T>>()
  for (const r of rows) {
    const k = key(r)
    const id = k == null || k === '' ? NONE : k
    let g = map.get(id)
    if (!g) {
      g = { key: id, label: id === NONE ? noneLabel : label ? label(id) : id, rows: [] }
      map.set(id, g)
    }
    g.rows.push(r)
  }
  return [...map.values()]
}

/** Rows split by part, in first-seen order of the parts. */
function byPart<T>(rows: readonly T[], part: (r: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of rows) {
    const p = part(r)
    const list = out.get(p)
    if (list) list.push(r)
    else out.set(p, [r])
  }
  return out
}

/**
 * The rows of parts whose size is the minimum or more (`kept`) and of the smaller ones (`left`, out
 * of every total). `size` counts a part's rows (costed people by default: the rows given).
 */
export function wholeParts<T>(
  rows: readonly T[],
  part: (r: T) => string,
  min: number,
  size: (rows: readonly T[]) => number = (rs) => rs.length,
): { kept: T[]; left: T[] } {
  const big = new Map<string, boolean>()
  for (const [p, list] of byPart(rows, part)) big.set(p, size(list) >= min)
  const kept: T[] = []
  const left: T[] = []
  for (const r of rows) (big.get(part(r)) ? kept : left).push(r)
  return { kept, left }
}

/**
 * A breakdown folded inside each part (an atom; a unit): in each part, groups under the minimum go to
 * that part's Other, and while that Other is under it the part's smallest shown group joins it. A row
 * holds its group's shown pieces in every part, and Other every part's Other.
 */
export function foldByPart<T>(
  rows: readonly T[],
  key: (r: T) => string | null | undefined,
  part: (r: T) => string,
  noneLabel: string,
  min: number,
  size: (rows: readonly T[]) => number = (rs) => rs.length,
): { groups: Group<T>[]; other: T[]; otherKeys: Set<string> } {
  const merged = new Map<string, Group<T>>()
  const other: T[] = []
  const otherKeys = new Set<string>()
  for (const members of byPart(rows, part).values()) {
    const { shown, folded } = foldGroups(groupBy(members, key, noneLabel), (g) => size(g.rows), min, true)
    for (const g of shown) {
      const m = merged.get(g.key)
      if (m) m.rows.push(...g.rows)
      else merged.set(g.key, { key: g.key, label: g.label, rows: g.rows.slice() })
    }
    for (const g of folded) {
      other.push(...g.rows)
      otherKeys.add(g.key)
    }
  }
  return { groups: [...merged.values()], other, otherKeys }
}

/** One cost center of a unit, as Finance's fold sizes it (docs/PLAN.md 7.4). */
export interface FoldCenter {
  costCenter: string
  /** A cost center (`<department>-<site>`) sits in one site, country, legal entity and currency. */
  department: string | null
  location: string
  country: string
  legalEntity: string
  currency: string
  /** Costed people in each month of the version's grid (7.2 rule 1, never reading leave); its size is the fewest. */
  costedByMonth: readonly number[]
  /**
   * Costed people in each month of the grid by the currency of the line that costs them (review
   * RF-5). Not given: every one of them is in `currency`.
   */
  costedByCurrency?: Readonly<Record<string, readonly number[]>>
  /** Every position of the cost center (costed or not), for `financeOrgCost`'s unions. */
  positionIds: readonly string[]
}

/** A unit's one cost-center fold (docs/PLAN.md 7.4). */
export interface FinanceFold {
  unit: string
  /** Cost centers shown on their own, 5 or more costed people in every month of the grid, in order. */
  shown: readonly string[]
  /** Cost centers in the unit's one Other. */
  other: readonly string[]
  /** The Other's size (its fewest costed people in any month); 0 when empty. */
  otherSize: number
  /** Each cost center's positions (shown and folded), for the org-row rule. */
  positionsOf: Readonly<Record<string, readonly string[]>>
}

/** The fewest of a month series (0 for none). */
const fewest = (months: readonly number[]): number => (months.length ? Math.min(...months) : 0)

/** The month-by-month sum of the centers' costed people. */
function summed(centers: readonly FoldCenter[]): number[] {
  const n = centers.reduce((a, c) => Math.max(a, c.costedByMonth.length), 0)
  const out = new Array<number>(n).fill(0)
  for (const c of centers) for (let i = 0; i < n; i++) out[i] += c.costedByMonth[i] ?? 0
  return out
}

/** A center's costed people per month in one currency (its lines' currencies, else its own). */
export function centerCurrencyMonths(c: FoldCenter, currency: string): readonly number[] {
  if (c.costedByCurrency) return c.costedByCurrency[currency] ?? []
  return c.currency === currency ? c.costedByMonth : []
}

/** The currencies a center costs people in (its lines' currencies, else its own). */
export function currenciesOf(c: FoldCenter): string[] {
  if (!c.costedByCurrency) return [c.currency]
  return Object.entries(c.costedByCurrency)
    .filter(([, months]) => months.some((x) => x > 0))
    .map(([cur]) => cur)
}

/** The month-by-month sum of the centers' costed people in one currency. */
function inCurrency(centers: readonly FoldCenter[], currency: string): number[] {
  const series = centers.map((c) => centerCurrencyMonths(c, currency))
  const n = series.reduce((a, x) => Math.max(a, x.length), 0)
  const out = new Array<number>(n).fill(0)
  for (const x of series) for (let i = 0; i < n; i++) out[i] += x[i] ?? 0
  return out
}

/** The index of the smallest center (by its fewest month), the first on ties; -1 for none. */
function smallestOf(centers: readonly FoldCenter[]): number {
  let i = -1
  for (let j = 0; j < centers.length; j++)
    if (i < 0 || fewest(centers[j].costedByMonth) < fewest(centers[i].costedByMonth)) i = j
  return i
}

/**
 * Finance's one cost-center fold for a unit (`foldByPart` with the smallest-joins rule, 7.4): a
 * group's size is its fewest costed people in any month of the version's grid; while a currency's
 * share of the unit's Other holds 1 to 4 costed people, the smallest shown cost center in that
 * currency joins Other (ties to the first in order); a unit with only 1 to 4 costed people in a
 * currency in all keeps them in its Other (accepted risk 15.3.8). Once per version and as-of date.
 */
export function financeFold(unit: string, centers: readonly FoldCenter[], min: number): FinanceFold {
  const sorted = centers
    .slice()
    .sort((a, b) => (a.costCenter < b.costCenter ? -1 : a.costCenter > b.costCenter ? 1 : 0))
  const shown = sorted.filter((c) => fewest(c.costedByMonth) >= min)
  const other = sorted.filter((c) => fewest(c.costedByMonth) < min)
  const join = (i: number) => {
    const [c] = shown.splice(i, 1)
    other.push(c)
  }
  // The smallest-joins rule: the Other reaches the minimum in every month of the grid, or holds nothing.
  while (other.length && fewest(summed(other)) < min && shown.length) join(smallestOf(shown))
  // Each currency's share of the Other: 0 or the minimum or more in every month, by line currency.
  const short = (cur: string) => inCurrency(other, cur).some((n) => n > 0 && n < min)
  for (;;) {
    const currencies = [...new Set(other.flatMap(currenciesOf))].sort()
    let moved = false
    for (const cur of currencies) {
      if (!short(cur)) continue
      const inCur = shown.filter((c) => currenciesOf(c).includes(cur))
      if (!inCur.length) continue
      join(shown.indexOf(inCur[smallestOf(inCur)]))
      moved = true
      break
    }
    if (!moved) break
  }
  const order = new Map(sorted.map((c, i) => [c.costCenter, i]))
  const inOrder = (cs: readonly FoldCenter[]) =>
    cs.map((c) => c.costCenter).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
  const positionsOf: Record<string, readonly string[]> = Object.create(null)
  for (const c of sorted) positionsOf[c.costCenter] = [...new Set(c.positionIds)].sort()
  return {
    unit,
    shown: inOrder(shown),
    other: inOrder(other),
    otherSize: other.length ? fewest(summed(other)) : 0,
    positionsOf,
  }
}

/** An org row below the unit (a leader-tree node, a sub-org, a target row keyed below the unit). */
export interface OrgCostRow {
  key: string
  /** The row it nests under (its parent org row), or null under the unit itself. */
  parent: string | null
  unit: string
  /** Every position in the row. */
  positionIds: ReadonlySet<string>
}

/** Why an org row below the unit shows heads and its target cost but no cost amount (7.4). */
export const ORG_COST_NOTE =
  'Cost shows for whole units, and for orgs made of whole cost centers with 5 or more people.'

/**
 * Whether a set of positions is a union of whole cost centers the unit's fold shows: every position
 * a center of the fold holds sits in a shown center, and every position of each center it touches is
 * in the set. Positions no center holds are passed over (they carry no amount).
 */
function isShownUnion(
  positions: Iterable<string>,
  fold: FinanceFold,
  centerOf: Map<string, string>,
): boolean {
  const set = positions instanceof Set ? (positions as ReadonlySet<string>) : new Set(positions)
  const shown = new Set(fold.shown)
  const touched = new Set<string>()
  for (const id of set) {
    const cc = centerOf.get(id)
    if (cc === undefined) continue
    if (!shown.has(cc)) return false
    touched.add(cc)
  }
  for (const cc of touched) for (const id of fold.positionsOf[cc] ?? []) if (!set.has(id)) return false
  return true
}

/**
 * Which org rows below the unit may show cost (docs/PLAN.md 7.4): a row shows cost only when (1) it
 * is a union of cost centers its unit's fold shows, never part of the unit's Other, and (2) the row
 * minus its child rows (counting children shown with cost on any Finance surface) is empty or also
 * such a union. By row key: null when cost shows, else the reason (`ORG_COST_NOTE`). Decided once
 * per version and as-of date; every surface reads the one result. Unit rows are unaffected.
 */
export function financeOrgCost(
  rows: readonly OrgCostRow[],
  unitBreakdown: ReadonlyMap<string, FinanceFold>,
): ReadonlyMap<string, string | null> {
  const centersOf = new Map<string, Map<string, string>>()
  const centerMap = (fold: FinanceFold): Map<string, string> => {
    let m = centersOf.get(fold.unit)
    if (!m) {
      m = new Map()
      for (const [cc, ids] of Object.entries(fold.positionsOf)) for (const id of ids) m.set(id, cc)
      centersOf.set(fold.unit, m)
    }
    return m
  }
  const byKey = new Map(rows.map((r) => [r.key, r]))
  const children = new Map<string, OrgCostRow[]>()
  for (const r of rows) {
    if (r.parent == null || !byKey.has(r.parent)) continue
    const list = children.get(r.parent)
    if (list) list.push(r)
    else children.set(r.parent, [r])
  }
  const out = new Map<string, string | null>()
  const deciding = new Set<string>()
  const decide = (r: OrgCostRow): string | null => {
    if (out.has(r.key)) return out.get(r.key) ?? null
    // A parent loop reads as heads only.
    if (deciding.has(r.key)) return ORG_COST_NOTE
    deciding.add(r.key)
    const kids = children.get(r.key) ?? []
    const shownKids = kids.filter((k) => decide(k) === null)
    const fold = unitBreakdown.get(r.unit)
    let verdict: string | null = ORG_COST_NOTE
    if (fold) {
      const centerOf = centerMap(fold)
      if (isShownUnion(r.positionIds, fold, centerOf)) {
        const rest = new Set(r.positionIds)
        for (const k of shownKids) for (const id of k.positionIds) rest.delete(id)
        if (rest.size === 0 || isShownUnion(rest, fold, centerOf)) verdict = null
      }
    }
    deciding.delete(r.key)
    out.set(r.key, verdict)
    return verdict
  }
  for (const r of rows) decide(r)
  return out
}
