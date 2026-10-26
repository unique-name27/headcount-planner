/**
 * What moved between two crawls, and whether the guard lets it move (docs/PLAN.md 16.1: the
 * positions, leave and requests leak tests). Written apart from the engines and the cost guard, so
 * a mistake there is not repeated here: costed people are counted from the raw rows (an Employee
 * assignment active on a day of the window, an accepted offer from its start date, 7.2 rule 1), and
 * a value's org is read from where the crawl found it (its row's `orgKey`, `positionId`,
 * `nodePositionId`, `costCenter` and window, else the mode's whole scope).
 *
 * Test code only.
 */
import { atomOf } from '@/cost/atoms'
import type { AnalyticsContext } from '@/data/context'
import { fyRange, monthEnd, monthStart, monthsOf } from '@/data/fiscal'
import type { Datasets, FiscalYear, Month, PositionRow } from '@/data/schema'
import { isRoundedCostTo } from '@/lib/costRounding'
import type { Seen } from './crawl'

/* ───────────── changes ───────────── */

export interface Change {
  where: string
  before: Seen | null
  after: Seen | null
}

/** Values by where they were read, repeated wheres numbered in order ("where#2"). */
function keyed(seen: readonly Seen[]): Map<string, Seen> {
  const out = new Map<string, Seen>()
  const n = new Map<string, number>()
  for (const s of seen) {
    const k = (n.get(s.where) ?? 0) + 1
    n.set(s.where, k)
    out.set(k > 1 ? `${s.where}#${k}` : s.where, s)
  }
  return out
}

const same = (a: Seen['value'], b: Seen['value']): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Every value that differs, appeared or went away between two crawls, in the second crawl's order. */
export function changesOf(a: readonly Seen[], b: readonly Seen[]): Change[] {
  const ka = keyed(a)
  const kb = keyed(b)
  const out: Change[] = []
  for (const [w, s] of kb) {
    const o = ka.get(w) ?? null
    if (!o || !same(o.value, s.value)) out.push({ where: w, before: o, after: s })
  }
  for (const [w, o] of ka) if (!kb.has(w)) out.push({ where: w, before: o, after: null })
  return out
}

/** A change as one line, for failure messages. */
export const changeLine = (c: Change): string =>
  `${c.where.slice(0, 220)}: ${short(c.before?.value)} -> ${short(c.after?.value)}`

const short = (v: unknown): string =>
  v === undefined ? '(none)' : String(v).replace(/\s+/g, ' ').slice(0, 60)

/** A number change below what any display, export or file reader can see (floating-point noise). */
export function isNoise(c: Change): boolean {
  const a = c.before?.value
  const b = c.after?.value
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a))
}

/* ───────────── costed people, counted from the rows ───────────── */

export interface CostedIndex {
  fy: FiscalYear
  months: readonly Month[]
  /** People costed in each position by month (holders, and accepted offers by req ID). */
  byPosition: ReadonlyMap<string, ReadonlyMap<Month, ReadonlySet<string>>>
  /** Each position's latest row (the org a line is joined to at read time, R26). */
  latest: ReadonlyMap<string, PositionRow>
  /** Positions below each position (managerPositionId, latest rows). */
  children: ReadonlyMap<string, readonly string[]>
}

const memo = new WeakMap<Datasets, Map<FiscalYear, CostedIndex>>()

/** Who is costed in which position and month of a fiscal year (7.2 rule 1, counted from the rows). */
export function costedIndex(data: Datasets, fy: FiscalYear): CostedIndex {
  let byFy = memo.get(data)
  if (!byFy) {
    byFy = new Map()
    memo.set(data, byFy)
  }
  const hit = byFy.get(fy)
  if (hit) return hit
  const months = monthsOf(fy)
  const by = new Map<string, Map<Month, Set<string>>>()
  const add = (positionId: string, m: Month, who: string) => {
    let pm = by.get(positionId)
    if (!pm) {
      pm = new Map()
      by.set(positionId, pm)
    }
    let set = pm.get(m)
    if (!set) {
      set = new Set()
      pm.set(m, set)
    }
    set.add(who)
  }
  for (const w of data.workers) {
    if (w.workerType !== 'Employee' || !w.positionId) continue
    const start = w.assignmentStart || w.hireDate
    const ends = [w.assignmentEnd, w.terminationDate].filter((x): x is string => !!x).sort()
    const end = ends[0] ?? '9999-12-31'
    for (const m of months)
      if (start <= monthEnd(m) && end >= monthStart(m)) add(w.positionId, m, w.employeeId)
  }
  for (const r of data.reqs) {
    if (r.stage !== 'Offer accepted' || !r.positionId || !r.startDate) continue
    for (const m of months) if (r.startDate <= monthEnd(m)) add(r.positionId, m, r.reqId)
  }
  const latest = new Map<string, PositionRow>()
  for (const r of data.positions) {
    const cur = latest.get(r.positionId)
    if (!cur || r.effectiveDate >= cur.effectiveDate) latest.set(r.positionId, r)
  }
  const children = new Map<string, string[]>()
  for (const r of latest.values()) {
    if (!r.managerPositionId) continue
    const list = children.get(r.managerPositionId)
    if (list) list.push(r.positionId)
    else children.set(r.managerPositionId, [r.positionId])
  }
  const out: CostedIndex = { fy, months, byPosition: by, latest, children }
  byFy.set(fy, out)
  return out
}

/** Distinct people costed in some of the positions in some month of the window. */
export function costedIn(index: CostedIndex, positions: Iterable<string>, months: readonly Month[]): number {
  const people = new Set<string>()
  for (const p of positions) {
    const pm = index.byPosition.get(p)
    if (!pm) continue
    for (const m of months) for (const x of pm.get(m) ?? []) people.add(x)
  }
  return people.size
}

/** A position and every position below it. */
export function subtree(index: CostedIndex, root: string): Set<string> {
  const out = new Set<string>([root])
  const queue = [root]
  while (queue.length) {
    for (const k of index.children.get(queue.pop() as string) ?? [])
      if (!out.has(k)) {
        out.add(k)
        queue.push(k)
      }
  }
  return out
}

/** The positions of the mode's whole scope (a tree with its roots; the company with none). */
export function scopePositions(ctx: AnalyticsContext, index: CostedIndex): Set<string> {
  const s = ctx.access.scope
  if (!s) return new Set(index.latest.keys())
  const out = new Set(s.positionIds)
  if (s.kind === 'tree') for (const r of s.rootPositionIds) out.add(r)
  return out
}

/** Figures whose rows keyed by a position are a sub-org: the seat and everything below it. */
const SUB_ORG_FIGURES = /suborgs/

/** A row-key field from a crawl path ("orgKey=unit:Silicon Engineering,measure=cost"). */
const field = (where: string, name: string): string | null => {
  const m = new RegExp(`[ ,]${name}=([^,/]+?)(?=,[A-Za-z]+=|/|\\.[A-Za-z]|$)`).exec(where)
  return m ? m[1] : null
}

/** The months a value covers: its row's window, else the fiscal year. */
export function windowMonths(where: string, index: CostedIndex, lastClosed: Month | null): Month[] {
  const key = field(where, 'windowKey') ?? field(where, 'window')
  const all = index.months
  if (!key || key === 'fy') return [...all]
  if (/^\d{4}-\d{2}$/.test(key)) return [key as Month]
  if (key === 'ytd' && lastClosed) return all.filter((m) => m <= lastClosed)
  const q = /^q([1-4])$/i.exec(key)
  if (q) return all.slice((+q[1] - 1) * 3, +q[1] * 3)
  if (key === 'qtd' && lastClosed) {
    const i = all.indexOf(lastClosed)
    return i < 0 ? [...all] : all.slice(i - (i % 3), i + 1)
  }
  return [...all]
}

/**
 * The costed people behind a value, counted from the rows over its own window: the org its row names
 * (`orgKey` scope, unit or department; a `nodePositionId` atom with its `costCenter`; a
 * `positionId` and the tree below it; a `costCenter`), inside the mode's scope; a value in no row
 * (a tile, a hero, a card of the whole figure) covers the scope. Null when the row names an org this
 * reader does not know.
 */
export function costedBehind(
  s: Seen,
  ctx: AnalyticsContext,
  index: CostedIndex,
  lastClosed: Month | null,
  atomOf: (positionId: string) => string | null,
): number | null {
  const where = s.where
  const months = windowMonths(where, index, lastClosed)
  const scope = scopePositions(ctx, index)
  const pick = (test: (r: PositionRow) => boolean): string[] =>
    [...index.latest.values()].filter((r) => scope.has(r.positionId) && test(r)).map((r) => r.positionId)
  const orgKey = field(where, 'orgKey')
  if (orgKey) {
    if (orgKey === 'scope') return costedIn(index, scope, months)
    const [kind, ...rest] = orgKey.split(':')
    const name = rest.join(':')
    if (kind === 'unit')
      return costedIn(
        index,
        pick((r) => r.businessUnit === name),
        months,
      )
    if (kind === 'department' || kind === 'dept')
      return costedIn(
        index,
        pick((r) => r.department === name),
        months,
      )
    if (kind === 'position' || kind === 'leader' || kind === 'tree')
      return costedIn(
        index,
        [...subtree(index, name)].filter((p) => scope.has(p)),
        months,
      )
    return null
  }
  const node = field(where, 'nodePositionId')
  const cc = field(where, 'costCenter')
  if (node)
    return costedIn(
      index,
      pick((r) => atomOf(r.positionId) === node && (!cc || r.costCenter === cc)),
      months,
    )
  const pos = /\/r positionId=([^,/.]+)/.exec(where)?.[1]
  // A sub-org row is its head seat and the tree below it; any other row keyed by a position is that
  // one position (a grid line, a records row).
  if (pos)
    return costedIn(
      index,
      SUB_ORG_FIGURES.test(s.tag.in) ? [...subtree(index, pos)].filter((p) => scope.has(p)) : [pos],
      months,
    )
  if (cc)
    return costedIn(
      index,
      pick((r) => r.costCenter === cc),
      months,
    )
  // A bridge's bars and their cards are totals of the whole scope at each point of the bridge.
  if (/bridge/.test(s.tag.in) && /\/r key=/.test(where)) return costedIn(index, scope, months)
  // A waterfall's start, end and Rounding bars, and a figure's total row, are the whole scope.
  if (/\/r key=(start|end|total|rounding|scope)\b/.test(where)) return costedIn(index, scope, months)
  if (/\/r /.test(where)) return null
  return costedIn(index, scope, months)
}

/* ───────────── what the guard lets move ───────────── */

export interface MoveRules {
  /** The minimum costed people and contributors (`cost.guard.minCosted`, `minContributors`). */
  min: number
  /** HRBP and Leader: every amount that moves is a whole rounding step (band and per-head figures apart). */
  rounded: boolean
  /** The rounding step (`cost.guard.floorUsd`). */
  step: number
  /** A one-time item or a severance changed: no component cell may move. */
  oneTime: boolean
  /** The costed people behind a value with no costed or contributor tag (`costedBehind`). */
  sizer: (s: Seen) => number | null
  /**
   * Leave changes: the contributor count and list of a row shown before and after never move, even
   * with their difference (7.2 rule 1, "leave never changes who is costed"; 16.1's leave row). Bridge
   * lists are leave-neutral (review RR-1). Pay and offer changes keep the exemption (9.4: each step
   * opens its contributors).
   */
  strictContributors?: boolean
  /**
   * Leave changes: no row, tile or value appears or goes away, whatever its contributors (C26, lead
   * decision C34: the bridge's shape, which rows show, which steps fold and whether Other changes
   * shows, never reads leave; 16.1's leave row asks for equal row lists). Pay and offer changes keep
   * the exemption: a difference's row may show or fold away with 5 or more contributors.
   */
  strictRows?: boolean
}

const CONTRIBUTOR_KEY = /\.contributors$|positions that moved|contributors/i

/** A contributor count or list of a difference (7.2 rule 5: positions only, never why). */
function isContributorFact(c: Change): boolean {
  const s = c.after ?? c.before
  if (!s) return false
  if (CONTRIBUTOR_KEY.test(c.where.replace(/#\d+$/, '')) && typeof s.value === 'number') return true
  if (s.tag.label && CONTRIBUTOR_KEY.test(s.tag.label)) return true
  // The records a difference's row opens: the positions that moved.
  return (
    /\.drill\/records positions\.(cells|order|rows|title|subtitle|note)$/.test(c.where) &&
    /key=(timing|payRate|attrition|positions|assumptionRates|fx|other|transfers|exits|mix)/.test(c.where)
  )
}

/** Where a value's row starts ("…/figure x/r key=timing"), or null outside a row. */
const rowPrefix = (where: string): string | null => /^(.*?\/r [^.]*)/.exec(where)?.[1] ?? null

/** Where a value's figure or records list starts. */
const listPrefix = (where: string): string | null =>
  /^(.*?\/(?:figure|records) [^/.]+)/.exec(where)?.[1] ?? null

/** The crawls a change list came from, for the rows a value sits in. */
export interface MoveCrawls {
  before: readonly Seen[]
  after: readonly Seen[]
}

/**
 * Why a change breaks 16.1's rule, or null when the guard lets it move: an amount (a money column or
 * format, a card's money input or step, or a ratio of amounts the same tile or card shows, in exact
 * modes only) over the minimum costed people (its tag, else counted from
 * the rows) or a difference with the minimum contributors; in rounded modes a whole rounding step; no
 * component cell after a one-time change. Export texts and files move with the values they hold;
 * contributor counts and lists move with their difference while it has the minimum, and a
 * difference's row shows or folds away with its contributors (it shows only with the minimum),
 * except under `strictContributors` and `strictRows` (a leave change: neither ever moves). A
 * list's order moves only with an amount it holds. Nothing else moves: no status word, flag, chain
 * step, label, note, count or row list.
 */
export function moveProblem(
  c: Change,
  r: MoveRules,
  rows?: { contributorsOf(prefix: string): number | null },
): string | null {
  const s = c.after ?? c.before
  if (!s) return 'nothing to compare'
  if (isNoise(c)) return null
  if (s.tag.derived) return null
  if (!c.before || !c.after) {
    if (r.strictRows) return 'appeared or went away (rows compare strictly)'
    const prefix = rowPrefix(c.where)
    const n = prefix ? (rows?.contributorsOf(prefix) ?? null) : null
    if (n != null && n >= r.min) return null
    return 'appeared or went away'
  }
  if (isContributorFact(c)) {
    if (r.strictContributors) return 'a contributor count or list moved'
    for (const v of [c.before.value, c.after.value])
      if (typeof v === 'number' && v > 0 && v < r.min) return `contributors ${v} under ${r.min}`
    return null
  }
  if (!s.tag.money && !s.tag.ratio) {
    if (s.tag.order) return 'the order of a list moved'
    return 'a value that is not an amount moved'
  }
  // A ratio of amounts (forecast accuracy) moves only as they do: over 5 or more, never rounded.
  if (s.tag.ratio && r.rounded) return 'a ratio of amounts moved in a rounded mode'
  if (s.tag.input) return 'an input set by Finance moved'
  if (r.oneTime && s.tag.component) return 'a component cell moved after a one-time change'
  if (s.tag.band) return 'a band estimate moved'
  if (
    r.rounded &&
    typeof c.after.value === 'number' &&
    !s.tag.perHead &&
    !isRoundedCostTo(c.after.value, r.step)
  )
    return 'an amount that is not a whole rounding step moved'
  if (s.tag.contributors != null)
    return s.tag.contributors >= r.min ? null : `contributors ${s.tag.contributors}`
  if (s.tag.costed != null) return s.tag.costed >= r.min ? null : `costed people ${s.tag.costed}`
  const n = r.sizer(s)
  if (n == null) return 'an amount whose org this test cannot size moved'
  return n >= r.min ? null : `costed people ${n} (counted from the rows)`
}

/**
 * Every change that breaks the rule, as "problem: where: before -> after". With the two crawls, a row
 * that shows or folds away is read with its contributors, and a list's order may move with an amount
 * in it that the rule lets move.
 */
export function badMoves(changes: readonly Change[], r: MoveRules, crawls?: MoveCrawls): string[] {
  const contributors = new Map<string, number>()
  if (crawls)
    for (const x of [...crawls.before, ...crawls.after])
      if (/\/r [^.]*\.contributors$/.test(x.where) && typeof x.value === 'number') {
        const prefix = rowPrefix(x.where) as string
        contributors.set(prefix, Math.max(contributors.get(prefix) ?? 0, x.value))
      }
  const rows = { contributorsOf: (prefix: string) => contributors.get(prefix) ?? null }
  const problems = changes.map((c) => ({ c, p: moveProblem(c, r, rows) }))
  // A list whose amounts or rows moved under the rule may reorder.
  const moved = new Set<string>()
  for (const { c, p } of problems) {
    const s = c.after ?? c.before
    if (p || !s || s.tag.derived || isNoise(c)) continue
    const list = listPrefix(c.where)
    if (list) moved.add(list)
  }
  const out: string[] = []
  for (const { c, p } of problems) {
    if (!p) continue
    const list = listPrefix(c.where)
    if (p === 'the order of a list moved' && list && moved.has(list)) continue
    out.push(`${p}: ${changeLine(c)}`)
  }
  return out
}

/** The fiscal year's last closed month in a context (the closes in plan state). */
export function lastClosedMonth(ctx: AnalyticsContext): Month | null {
  const months = (ctx.plan?.closes ?? []).map((x) => x.month).sort()
  return months.at(-1) ?? null
}

/** FY27's days, for sweeps. */
export function daysOf(fy: FiscalYear): string[] {
  const { start, end } = fyRange(fy)
  const out: string[] = []
  for (
    let d = new Date(`${start}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= end;
    d.setUTCDate(d.getUTCDate() + 1)
  )
    out.push(d.toISOString().slice(0, 10))
  return out
}

/** The rules for a context: its guard's minimum, mode and step, sizing untagged amounts from the rows. */
export function moveRulesFor(ctx: AnalyticsContext, oneTime = false): MoveRules {
  const index = costedIndex(ctx.all, 'FY27')
  const closed = lastClosedMonth(ctx)
  const managerOf = (id: string) => index.latest.get(id)?.managerPositionId ?? null
  return {
    min: ctx.guard.rules.minCosted,
    rounded: ctx.guard.mode === 'rounded',
    step: ctx.guard.rules.floorUsd,
    oneTime,
    sizer: (x) => costedBehind(x, ctx, index, closed, (id) => atomOf(id, ctx.guard.atoms, managerOf)),
  }
}

/**
 * Problem lines ("what | viewer | problem: where: before -> after") grouped by surface: one line per
 * problem and place (the view, figure or card, with the row and value), how many times it came up,
 * and the first change and viewer that showed it, so a failure names every failing surface at once.
 */
export function bySurface(lines: readonly string[]): string[] {
  const groups = new Map<string, { n: number; first: string }>()
  for (const line of lines) {
    const parts = line.split(' | ')
    const rest = parts.slice(2).join(' | ')
    // One line per problem and row, tile or hero: the values under one row move together.
    const [problem, ...place] = rest
      .replace(/: [^:]*-> .*$/, '')
      .replace(/#\d+$/, '')
      .split(': ')
    const where = place.join(': ').replace(/(\/(?:r|tile|hero) [^./]*).*$/, '$1')
    const key = `${problem}: ${where}`
    const g = groups.get(key)
    if (g) g.n++
    else groups.set(key, { n: 1, first: `${parts[0]} | ${parts[1]}` })
  }
  return [...groups].map(([key, g]) => `${key} (x${g.n}; first: ${g.first})`)
}
