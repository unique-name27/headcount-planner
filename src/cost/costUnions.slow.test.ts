/**
 * Finance's exact cost amounts never single out 1 to 4 people (docs/PLAN.md 7.4, 7.5, 16.1; adapted
 * from the template app's costUnions test). Finance is exact, so any two shown sets whose difference
 * holds 1 to 4 costed people give those people's cost away. The classes are therefore computed
 * jointly over every set Finance can see at one as-of date (30 Sep 2026), for each amount field (a
 * line source and window, so a version and a period, and a component), across every family at once:
 * the unit, cost center, site, country, legal entity and currency rows, the org rows that show cost
 * (Targets, Requests), Tree × cost center cells and every total. A person's class is the set of shown
 * sets that hold them; a class of 1 to 4 fails. The people of a set are its costed people over the
 * field's own window (7.2 rule 1): the holders and accepted offers behind its positions.
 *
 * What is crawled, through the view models (every `guardModel` call they make, calculation cards
 * included): Finance with every set of the 6 units and no other filter; with each cost center the
 * folds show; with each country, legal entity and currency, for the whole company and for each unit;
 * the company and each unit with every version, comparison and period; and HR admin with the switch
 * off under each department (company-wide and inside its unit, 7.5's one more one-at-a-time
 * dimension). A filter on several units is the units' shares added, so every shown set must be a
 * union of whole parts of the units' one fold (a shown cost center, or the unit's Other): that is
 * asserted on every set, and it is what makes the classes of any other set of units unions of parts
 * too. The members of 1550-HSZ (story 8) share a class of 5 or more. Each unit's Other holds 0 or 5
 * or more costed people in each currency in every month (apart from a unit with only 1 to 4 in that
 * currency in all, accepted risk 15.3.8), and a cost center of 4 Filled seats and 1 accepted offer,
 * or of 5 Filled seats with one last day of 31 Oct, never shows an amount of its own.
 *
 * To stay inside the slow project's time budget: a context whose filters cover no position, or
 * whose cost figures depend on what a crawled one's do (`crawlKey`), is skipped; a set of 2 to 5
 * units is crawled with its default comparison for every view but the Forecast (and the home that
 * re-links it), whose sets are crawled against the target, so its bridge and variance (differences,
 * crawled for each unit and the company against every comparison) are not priced for every set;
 * the Forecast view's bridge and variance are computed once per set of inputs and handed to
 * contexts that differ only in the shown version and the period (`memo`, checked by recomputing
 * every so often); and a stored line table is read once.
 *
 * Controls: (1) folding the country rows on their own (`foldGroups` per dimension) finds a class
 * under 5 in the hand-built unit of 7.4 (Taiwan A = 6, B = 3; US C = 7, D = 6, E = 2); (2) with the
 * org-row rule off (`financeOrgCost` showing every row), Silicon Engineering's unit row less the
 * SVP's sub-orgs is a class of 1, the SVP's own seat.
 *
 * The long CSV (both sources: the version shown and the forecast) and the FP&A load file are
 * crawled with every context (M4, src/views/finance/engine/longCsv.ts and loadFile.ts): their rows
 * are the guard's own rows (each unit's breakdown by cost center, and the scope's total), so every
 * row of every period is a shown set in its field, taken together with the screen's. Each crawl also
 * checks that every long CSV and load file amount is one of the rows the guard answered in that
 * crawl, and every control total one of its totals (identity), so no row or total is a set this test
 * did not see.
 *
 * Under lead decision D-FIN (PLAN change C33) the crawl also holds the review's attacks, which fail
 * the classes before C33 and hold after it:
 *  - Component fields are classes of contributing positions month by month, not of costed people:
 *    a component's element is a (position, month) with an amount in the component, in one field per
 *    line source and component across every window, so a window less the shown months, or one
 *    selection less another, never isolates 1 to 4 positions (review RF-2, the split per month).
 *  - The burden split's cap classes: a shown burden adds, per capped burden component, the set of
 *    (person, month) below the cap and the set at or above it (review RF-1: 23 above and 1 below the
 *    US social security cap gave that person's base + bonus).
 *  - Multi-center selections, and countries over sets of units (RF-2, RF-5), are crawled; since C33
 *    they show heads only.
 *  - Bridge steps, Other changes and the FX effect of the company, each unit and every set of all
 *    units but one, against each comparison, are one field per window whose elements are (step,
 *    position) pairs: a step less its units' steps, or Other changes less the FX tile, never
 *    isolates 1 to 4 positions (reviews RC-1 and RF-5, D-FIN (c)). Since lead decision C34 the FX
 *    tiles of every window (each month included) are also one field of (position, month) pairs, so
 *    no window's tile less another's isolates 1 to 4 positions either.
 *  - Back-dated adjustments (review RF-3): with seven Other HRIS changes planted in one posted
 *    month (five in Corporate, two in Executive Office), the shown monthly amounts and counts of
 *    every unit set and filter define no class of 1 to 4 people (D-FIN (d): company level only).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { type ModePicks, NO_PICKS } from '@/access/modes'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { cachedSample, SAMPLE_AS_OF, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type Mode, siteByLocation } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveCalc } from '@/drill/calc'
import type { Adjustment, PlanLine } from '@/plan/types'
import { financeModel } from '@/views/finance/engine'
import { loadFileOf } from '@/views/finance/engine/loadFile'
import { type ComponentTotal, longCsvOf, SPLIT_COMPONENTS } from '@/views/finance/engine/longCsv'
import { forecastModel } from '@/views/forecast/engine'
import { type FPrep, prepare as prepareForecast } from '@/views/forecast/engine/base'
import { bridgeWindow, foldedOf, fxEffectOf } from '@/views/forecast/engine/bridge'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { homeModel } from '@/views/home/engine'
import { capSidesOf } from '@/views/lineSource'
import { planModel } from '@/views/plan/engine'
import { closeLinesOf, gridMonths, shownLines, versionLinesOf } from '@/views/plan/engine/core'
import { costIdsOf, fitOf, foldsOf, membersOf } from '@/views/plan/engine/guarded'
import { requestsModel } from '@/views/requests/engine'
import { targetsModel } from '@/views/targets/engine'
import { workingFrame, workingLines } from '@/views/targets/engine/working'
import { type FinanceFold, financeFold, foldGroups } from './fold'
import {
  COST_FIELDS,
  type CostMember,
  foldCentersOf,
  type GuardedFigure,
  type GuardInput,
  guardModel,
  peopleOf,
} from './guard'
import { FY27, filled, offer, RULES, seat, membersOf as testMembers } from './guard.testkit'

/* ───────────── what the guard is asked and answers ───────────── */

const rec = vi.hoisted(() => ({
  on: false,
  /** Each member the guard built, to the call that built it (its lines and months). */
  callOf: new WeakMap<object, { lines: readonly PlanLine[]; months: readonly string[] }>(),
  calls: [] as { input: GuardInput; out: GuardedFigure }[],
  /** The forecast windows drawn (unused here; the memo's mocks record them). */
  windows: [] as { prep: FPrep; months: readonly string[] }[],
  /** The control: the org-row rule off. */
  orgRuleOff: false,
}))

/**
 * The forecast view's bridge and variance, computed once per set of inputs (`memo.keyOf` below).
 * Built for each analytics context, they price every seat of the scope at every stage and month
 * (about a second for the company), and a scope's contexts differ there only in the shown version
 * of the same fiscal year and the period, which neither reads. So each is computed for the first
 * context with its inputs and handed to the others, and every so often computed again for the
 * context asking and compared (`memo.checked`), which fails the test if the key ever misses an input.
 */
const memo = vi.hoisted(() => ({
  keyOf: null as ((p: never) => string) | null,
  digest: null as ((x: unknown) => string) | null,
  reps: new Map<string, unknown>(),
  values: new Map<string, { value: unknown; from: unknown }>(),
  keys: new WeakMap<object, string>(),
  hits: 0,
  checked: 0,
  run<P extends object, T>(name: string, p: P, extra: string, compute: (q: P) => T): { value: T; from: P } {
    let base = this.keys.get(p)
    if (base === undefined) {
      base = (this.keyOf as (q: P) => string)(p)
      this.keys.set(p, base)
    }
    let rep = this.reps.get(base) as P | undefined
    if (!rep) {
      rep = p
      this.reps.set(base, p)
    }
    const key = `${name}§${extra}§${base}`
    let hit = this.values.get(key) as { value: T; from: P } | undefined
    if (!hit) {
      hit = { value: compute(rep), from: rep }
      this.values.set(key, hit)
    }
    if (hit.from === p) return hit
    this.hits++
    if (this.hits <= 2 || this.hits % 50 === 0) {
      this.checked++
      const digest = this.digest as (x: unknown) => string
      if (digest(compute(p)) !== digest(hit.value))
        throw new Error(
          `${name}: a context with the same inputs gives another result; the memo key misses an input`,
        )
    }
    return hit
  },
}))

vi.mock('./guard', async (orig) => {
  const m = await orig<typeof import('./guard')>()
  return {
    ...m,
    costMembersOf: (input: Parameters<typeof m.costMembersOf>[0]) => {
      const lines = Array.isArray(input.lines) ? (input.lines as readonly PlanLine[]) : [...input.lines]
      const out = m.costMembersOf({ ...input, lines })
      if (rec.on) {
        const call = { lines, months: input.months }
        for (const mem of out.members) rec.callOf.set(mem, call)
      }
      return out
    },
    guardModel: (input: GuardInput) => {
      const out = m.guardModel(input)
      if (rec.on) rec.calls.push({ input, out })
      return out
    },
  }
})

/**
 * A locked version's stored lines as line objects, read once per stored table: the engines read a
 * comparison's lines again for every scope, and the rows of a stored table never change (each
 * reader only reads them), so every reader gets the one list.
 */
vi.mock('@/plan/engine/lineTable', async (orig) => {
  const m = await orig<typeof import('@/plan/engine/lineTable')>()
  const read = new WeakMap<object, readonly PlanLine[]>()
  return {
    ...m,
    planLineRows: (table: Parameters<typeof m.planLineRows>[0]) => {
      let rows = read.get(table)
      if (!rows) {
        rows = [...m.planLineRows(table)]
        read.set(table, rows)
      }
      return rows.values()
    },
  }
})

vi.mock('./fold', async (orig) => {
  const m = await orig<typeof import('./fold')>()
  return {
    ...m,
    financeOrgCost: (...args: Parameters<typeof m.financeOrgCost>) => {
      const out = m.financeOrgCost(...args)
      return rec.orgRuleOff ? new Map([...out.keys()].map((k) => [k, null])) : out
    },
  }
})

vi.mock('@/views/forecast/engine/bridge', async (orig) => {
  const m = await orig<typeof import('@/views/forecast/engine/bridge')>()
  return {
    ...m,
    bridgeRows: (p: FPrep) => {
      const r = memo.run('bridgeRows', p, '', (q) => m.bridgeRows(q))
      if (rec.on) rec.windows.push({ prep: r.from, months: r.from.fyMonths })
      return r.value
    },
    fxEffectOf: (p: FPrep, months: readonly string[]) => {
      const r = memo.run('fxEffectOf', p, months.join(','), (q) => m.fxEffectOf(q, months as never))
      if (rec.on) rec.windows.push({ prep: r.from, months })
      return r.value
    },
  }
})

vi.mock('@/views/forecast/engine/variance', async (orig) => {
  const m = await orig<typeof import('@/views/forecast/engine/variance')>()
  return {
    ...m,
    varianceTable: (p: FPrep) => memo.run('varianceTable', p, '', (q) => m.varianceTable(q)).value,
    // A cell's card reads the table it came from, so it is built on the context that computed it.
    varianceCellCard: (p: FPrep, r: Parameters<typeof m.varianceCellCard>[1]) =>
      m.varianceCellCard(memo.run('varianceTable', p, '', (q) => m.varianceTable(q)).from, r),
  }
})

/* ───────────── the memo's key ───────────── */

const tokens = new WeakMap<object, number>()
let nextToken = 1
const tokenOf = (o: object | null | undefined): number => {
  if (!o) return 0
  const t = tokens.get(o) ?? nextToken++
  tokens.set(o, t)
  return t
}

const stringHash = new Map<string, number>()
/** FNV-1a of a string, kept per string. */
function hash32(x: string): number {
  let h = stringHash.get(x)
  if (h !== undefined) return h
  h = 0x811c9dc5
  for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 0x01000193)
  stringHash.set(x, h)
  return h
}

/** A set of ids as a short, order-free digest (its size and two 32-bit sums). */
function setDigest(xs: Iterable<string>): string {
  let a = 0
  let b = 0
  let n = 0
  for (const x of xs) {
    const h = hash32(x)
    a = (a + h) | 0
    b = (b + Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)) | 0
    n++
  }
  return `${n}:${a >>> 0}:${b >>> 0}`
}

/**
 * What the forecast view's bridge and variance read of a context: the data and plan state, the
 * mode and its guard, the filters but the period, the scope (its positions, its cost selection and
 * its sub-orgs), the fiscal year's months, the comparison, the Working version and its forecast,
 * and why cost cannot show (the period check of rounded modes included). Two contexts with one key
 * differ only in the shown version (of the same fiscal year) and the period.
 */
memo.keyOf = ((p: FPrep): string => {
  const c = p.ctx
  const { period: _period, customStart: _start, customEnd: _end, ...filters } = c.filters
  const sc = c.access.scope
  const scope =
    sc == null
      ? ''
      : sc.kind === 'unit'
        ? `unit:${sc.unit}:${setDigest(sc.positionIds)}`
        : `tree:${sc.rootPersonId}:${setDigest(sc.rootPositionIds)}:${setDigest(sc.positionIds)}:${sc.subOrgs
            .map((o) => `${o.positionId}=${o.label}=${setDigest(o.positionIds)}`)
            .join(',')}`
  const { atoms, ...env } = p.env
  return [
    tokenOf(c.all),
    tokenOf(c.plan),
    tokenOf(c.metrics),
    tokenOf(atoms),
    c.mode,
    c.showPay,
    c.showCost,
    c.asOf,
    JSON.stringify(env),
    JSON.stringify(filters),
    c.scopeLabel,
    `${c.compare.kind}:${c.compare.kind === 'version' ? c.compare.versionId : ''}:${c.compare.fiscalYear}`,
    scope,
    p.fiscalYear,
    p.fyMonths.join(','),
    p.ytdMonths.join(','),
    p.on,
    p.lastClose?.month ?? '',
    p.comparison?.versionId ?? '',
    p.working?.versionId ?? '',
    tokenOf(p.run),
    setDigest(p.scope.ids),
    setDigest(costIdsOf(c)),
    fitOf(c, p.working) ?? '',
    fitOf(c, p.comparison) ?? '',
  ].join('§')
}) as (p: never) => string

/** A result as data (sets sorted, maps as entries, functions and members left out), for the memo's checks. */
memo.digest = (x: unknown): string =>
  JSON.stringify(x, (k, v) => {
    if (typeof v === 'function' || k === 'ctx') return undefined
    if (k === 'members' && Array.isArray(v)) return v.length
    if (k === 'positionIds' && Array.isArray(v)) return setDigest(v as string[])
    if (v instanceof Set) return [...v].map(String).sort()
    if (v instanceof Map) return [...v.entries()]
    return v
  })

/* ───────────── contexts ───────────── */

const sourcesOf = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

interface CtxOpts {
  filters?: Partial<Filters>
  version?: string | null
  compare?: string | null
}

function ctxOf(s: Sample, mode: Mode, picks: ModePicks, opts: CtxOpts = {}): AnalyticsContext {
  return buildContext({
    data: s.datasets,
    sources: sourcesOf(s.datasets),
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: null,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: picks,
    plan: s.plan,
    showPay: false,
    picks: { version: opts.version ?? null, compare: opts.compare ?? null },
  })
}

/* ───────────── fields ───────────── */

const sourceOf = new WeakMap<object, string>()

function tagSources(ctx: AnalyticsContext): void {
  const tag = (lines: readonly PlanLine[], name: string) => {
    for (const l of lines) if (!sourceOf.has(l)) sourceOf.set(l, name)
  }
  tag(closeLinesOf(ctx.plan), 'actual')
  for (const v of ctx.versions) {
    tag(versionLinesOf(ctx, v), `own:${v.versionId}`)
    if (v.state === 'working') {
      const run = forecastRunOf(ctx, v)
      if (run) tag(run.lines, `fc:${v.versionId}`)
      tag(workingLines(ctx, workingFrame(ctx, v.fiscalYear)), `asks:${v.versionId}`)
    }
  }
}

/**
 * The window of the lines one `costMembers` call priced: the sources of its filled lines and the
 * months it was asked for (the figure's window), worked out once per call.
 */
const callWindows = new WeakMap<object, { srcs: ReadonlySet<string>; months: readonly string[] }>()

function callWindowOf(call: { lines: readonly PlanLine[]; months: readonly string[] }): {
  srcs: ReadonlySet<string>
  months: readonly string[]
} {
  const hit = callWindows.get(call)
  if (hit) return hit
  const months = new Set(call.months)
  const srcs = new Set<string>()
  for (const l of call.lines)
    if (months.has(l.month) && l.basis !== 'band') srcs.add(sourceOf.get(l) ?? `other:${l.versionId}`)
  const out = { srcs, months: call.months }
  callWindows.set(call, out)
  return out
}

/* ───────────── the shown sets ───────────── */

/** Each field's shown sets (sorted people, joined), and where one was first seen. */
const sets = new Map<string, Map<string, string>>()
/** Each field's shown sets by digest, so a set seen again is not sorted and joined again. */
const digests = new Map<string, Set<string>>()
/** Shown sets that are not unions of whole fold parts. */
const notUnions: string[] = []
let shownRows = 0
/** Sets first seen (a set of a field not shown before). */
let newSets = 0

/** A fold's shown cost centers as a set. */
const shownOf = new WeakMap<FinanceFold, ReadonlySet<string>>()
const shownSet = (f: FinanceFold): ReadonlySet<string> => {
  let s = shownOf.get(f)
  if (!s) {
    s = new Set(f.shown)
    shownOf.set(f, s)
  }
  return s
}

/**
 * Every exact-mode figure the guard answered: its shown rows and total as sets of costed people,
 * each in its field (the sources and months its members were priced over, and the component).
 */
function harvest(label: string, ctx: AnalyticsContext): void {
  const capSides = capSidesOf(ctx)
  for (const { input, out } of rec.calls) {
    if (input.mode !== 'exact') continue
    const filled = input.members.filter((m) => m.part === 'filled')
    const byPos = new Map<string, CostMember[]>()
    const calls = new Set<{ lines: readonly PlanLine[]; months: readonly string[] }>()
    for (const m of filled) {
      const list = byPos.get(m.positionId)
      if (list) list.push(m)
      else byPos.set(m.positionId, [m])
      const c = rec.callOf.get(m)
      if (c) calls.add(c)
    }
    const srcs = new Set<string>()
    const months = new Set<string>()
    for (const c of calls) {
      const w = callWindowOf(c)
      for (const x of w.srcs) srcs.add(x)
      for (const x of w.months) months.add(x)
    }
    const ms = [...months].sort()
    const srcKey = [...srcs].sort().join('+')
    const window = `${srcKey}|${ms[0] ?? ''}..${ms[ms.length - 1] ?? ''}`
    // The fold part of each member: a shown cost center, or its unit's Other.
    const folds = input.folds ?? input.by?.folds ?? null
    const partOf = (m: CostMember): string => {
      const f = folds?.get(m.seat.businessUnit)
      return f && shownSet(f).has(m.seat.costCenter)
        ? `${m.seat.businessUnit}|${m.seat.costCenter}`
        : `${m.seat.businessUnit}|Other`
    }
    const partMembers = new Map<string, Set<string>>()
    for (const m of filled) {
      const k = partOf(m)
      const set = partMembers.get(k) ?? new Set<string>()
      set.add(m.positionId)
      partMembers.set(k, set)
    }
    for (const row of [out.total, ...out.rows]) {
      const shownFields = COST_FIELDS.filter((f) => row.amounts[f] != null)
      if (!shownFields.length || !row.positionIds.length) continue
      shownRows++
      const ids = new Set(row.positionIds)
      const members = [...ids].flatMap((id) => byPos.get(id) ?? [])
      const people = peopleOf(members)
      if (!people.size) continue
      // A union of whole parts: every part the row touches is in it whole.
      if (folds) {
        const touched = new Set(members.map(partOf))
        for (const p of touched)
          if ([...(partMembers.get(p) ?? [])].some((id) => !ids.has(id))) {
            if (notUnions.length < 20) notUnions.push(`${label}: ${row.label} cuts ${p} (${window})`)
            break
          }
      }
      const digest = setDigest(people)
      let key: string | null = null
      for (const f of shownFields) {
        // A component: (position, month) elements across every window of the source (C33 (b)).
        if (f !== 'loaded') {
          componentSets(srcKey, f, members, capSides, `${label}: ${row.label}`)
          continue
        }
        const field = `${window}|${f}`
        let seen = digests.get(field)
        if (!seen) {
          seen = new Set()
          digests.set(field, seen)
        }
        if (seen.has(digest)) continue
        seen.add(digest)
        newSets++
        key ??= [...people].sort().join(',')
        let m = sets.get(field)
        if (!m) {
          m = new Map()
          sets.set(field, m)
        }
        if (!m.has(key)) m.set(key, `${label}: ${row.label}`)
      }
    }
  }
}

/* ───────────── component and cap elements (C33 (b), reviews RF-1 and RF-2) ───────────── */

/** Per position of a call: each component's months with an amount, and its people's cap sides by month. */
interface CallFacts {
  comp: Map<string, Map<string, Set<string>>>
  caps: Map<string, Map<string, Set<string>>>
}
const callFacts = new WeakMap<object, CallFacts>()

function factsOf(
  call: { lines: readonly PlanLine[]; months: readonly string[] },
  capSides: (l: PlanLine) => readonly { key: string; below: boolean }[] | null,
): CallFacts {
  let hit = callFacts.get(call)
  if (hit) return hit
  const months = new Set(call.months)
  const sums = new Map<string, Map<string, Map<string, number>>>()
  const caps = new Map<string, Map<string, Set<string>>>()
  for (const l of call.lines) {
    if (!months.has(l.month) || l.basis === 'band' || !l.positionId) continue
    let byField = sums.get(l.positionId)
    if (!byField) {
      byField = new Map()
      sums.set(l.positionId, byField)
    }
    for (const f of COST_FIELDS) {
      if (f === 'loaded') continue
      let byMonth = byField.get(f)
      if (!byMonth) {
        byMonth = new Map()
        byField.set(f, byMonth)
      }
      byMonth.set(l.month, (byMonth.get(l.month) ?? 0) + l.usd[f])
    }
    if (l.holderId && l.active > 0) {
      const sides = capSides(l)
      let byKey = caps.get(l.positionId)
      if (!byKey) {
        byKey = new Map()
        caps.set(l.positionId, byKey)
      }
      for (const side of sides ?? [{ key: 'unknown', below: true }]) {
        const k = `${side.key}|${side.below ? 'below' : 'at'}`
        const set = byKey.get(k) ?? new Set<string>()
        set.add(`${l.holderId}|${l.month}`)
        byKey.set(k, set)
      }
    }
  }
  const comp = new Map<string, Map<string, Set<string>>>()
  for (const [pos, byField] of sums) {
    const out = new Map<string, Set<string>>()
    for (const [f, byMonth] of byField) {
      const ms = new Set<string>()
      for (const [m, v] of byMonth) if (Math.abs(v) >= 0.005) ms.add(m)
      if (ms.size) out.set(f, ms)
    }
    comp.set(pos, out)
  }
  hit = { comp, caps }
  callFacts.set(call, hit)
  return hit
}

/** A shown set under a field, kept once per distinct set (by digest). */
function addSet(field: string, elements: ReadonlySet<string>, label: string): void {
  if (!elements.size) return
  const digest = setDigest(elements)
  let seen = digests.get(field)
  if (!seen) {
    seen = new Set()
    digests.set(field, seen)
  }
  if (seen.has(digest)) return
  seen.add(digest)
  newSets++
  let m = sets.get(field)
  if (!m) {
    m = new Map()
    sets.set(field, m)
  }
  const key = [...elements].sort().join(',')
  if (!m.has(key)) m.set(key, label)
}

let componentRows = 0

/** A shown component's (position, month) elements, and for burden its cap sides' (person, month) elements. */
function componentSets(
  srcKey: string,
  f: string,
  members: readonly CostMember[],
  capSides: (l: PlanLine) => readonly { key: string; below: boolean }[] | null,
  label: string,
): void {
  const elements = new Set<string>()
  const caps = new Map<string, Set<string>>()
  for (const m of members) {
    const call = rec.callOf.get(m)
    if (!call) continue
    const facts = factsOf(call, capSides)
    for (const mo of facts.comp.get(m.positionId)?.get(f) ?? []) elements.add(`${m.positionId}|${mo}`)
    if (f === 'burden')
      for (const [k, set] of facts.caps.get(m.positionId) ?? []) {
        const acc = caps.get(k) ?? new Set<string>()
        for (const x of set) acc.add(x)
        caps.set(k, acc)
      }
  }
  componentRows++
  addSet(`${srcKey}|el|${f}`, elements, label)
  for (const [k, set] of caps) addSet(`${srcKey}|el|cap|${k}`, set, label)
}

/** What a class counts: people, or the positions (or people) of its (position, month) or (step, position) elements. */
const unitOf = (field: string): ((x: string) => string) =>
  field.includes('|el|')
    ? (x) => x.slice(0, x.indexOf('|'))
    : field.startsWith('bridge|')
      ? (x) => x.slice(x.indexOf('|') + 1)
      : (x) => x

/** The classes of people each field's shown sets define, and the ones of 1 to 4. */
function classesOf(field: string, list: readonly string[]) {
  const sig = new Map<string, number[]>()
  list.forEach((key, i) => {
    for (const p of key.split(',')) {
      const s = sig.get(p)
      if (s) s.push(i)
      else sig.set(p, [i])
    }
  })
  const classes = new Map<string, string[]>()
  for (const [p, s] of sig) {
    const k = s.join(',')
    const list = classes.get(k)
    if (list) list.push(p)
    else classes.set(k, [p])
  }
  const small: { field: string; people: string[]; sig: string }[] = []
  const count = unitOf(field)
  for (const [k, people] of classes)
    if (new Set(people.map(count)).size < RULES.minCosted) small.push({ field, people, sig: k })
  return { classes, small, sig }
}

/* ───────────── bridge steps, Other changes and the FX effect (D-FIN (c), RC-1, RF-5) ───────────── */

let bridgeSetsSeen = 0
let fxMonthsSeen = 0

/**
 * A context's shown bridge rows (full year), Other changes and FX tiles (the full year, the year to
 * date and the quarter to date) as sets of (step, position) elements, one field per comparison and
 * window: Other changes holds the pairs of the steps folded into it (since C34 it is always a row).
 * Finance's FX tile also reads month and custom windows, so a window less another is a window too:
 * every tile shown, over the full year, the year and quarter to date and each month, is also a set
 * of (position, month) elements in one field per comparison across every window (`fxMonthsSeen`),
 * whose classes are a unit's non-USD positions that moved in one month (C34's periods).
 */
function harvestBridge(ctx: AnalyticsContext, label: string): void {
  if (ctx.guard.mode !== 'exact' || ctx.compare.kind !== 'version') return
  const p = prepareForecast(ctx)
  const min = ctx.guard.rules.minContributors
  const windows: [string, readonly string[]][] = [
    ['fy', p.fyMonths],
    ['ytd', p.ytdMonths],
    ['qtd', p.ytdMonths.slice(-3).filter((m) => m >= '2026-07')],
  ]
  for (const [name, months] of windows) {
    if (!months.length) continue
    const field = `bridge|${ctx.compare.versionId}|${name}`
    const w = bridgeWindow(p, months as never)
    if (w.reason) continue
    const folded = foldedOf(p, w, months as never)
    const pairs = (key: string, ids: Iterable<string>) => new Set([...ids].map((id) => `${key}|${id}`))
    if (name === 'fy') {
      for (const f of folded.shown)
        if (f.part === 'whole' && f.contributors.size >= min) {
          addSet(field, pairs(f.step.key, f.contributors), `${label}: ${f.step.key}`)
          bridgeSetsSeen++
        }
      if (folded.other && folded.other.contributors >= min) {
        const all = new Set<string>()
        for (const f of folded.other.steps) for (const x of pairs(f.step.key, f.contributors)) all.add(x)
        addSet(field, all, `${label}: Other changes`)
        bridgeSetsSeen++
      }
    }
    const fx = fxEffectOf(p, months as never)
    const step = w.steps.find((x) => x.key === 'fx')
    if (fx.value != null && step && !step.band) {
      addSet(field, pairs('fx', step.contributors), `${label}: FX effect ${name}`)
      bridgeSetsSeen++
    }
  }
  // Each month's non-USD positions that moved, as (position, month) elements: every FX tile shown
  // over any window is the union of its months'.
  const byMonth = new Map<string, Set<string>>()
  for (const m of p.fyMonths) {
    const w = bridgeWindow(p, [m] as never)
    const step = w.reason ? null : w.steps.find((x) => x.key === 'fx')
    byMonth.set(m, new Set([...(step?.contributors ?? [])].map((id) => `${id}|${m}`)))
  }
  const field = `bridge|${ctx.compare.versionId}|el|fx`
  for (const [name, months] of [
    ...windows,
    ...p.fyMonths.map((m): [string, readonly string[]] => [m, [m]]),
  ]) {
    if (!months.length || fxEffectOf(p, months as never).value == null) continue
    const all = new Set<string>()
    for (const m of months) for (const x of byMonth.get(m) ?? []) all.add(x)
    addSet(field, all, `${label}: FX effect ${name} by month`)
    fxMonthsSeen++
  }
}

/* ───────────── crawling ───────────── */

/** The long CSV of the version shown, and of the forecast (the Forecast view's whole-view menu). */
const longCsvModel = (ctx: AnalyticsContext) => longCsvOf(ctx)
const longCsvForecast = (ctx: AnalyticsContext) => longCsvOf(ctx, { source: 'forecast' })

const MODELS: ((ctx: AnalyticsContext) => unknown)[] = [
  planModel,
  forecastModel,
  targetsModel,
  homeModel,
  requestsModel,
  financeModel,
  longCsvModel,
  longCsvForecast,
]

/** The models that do not build the Forecast view's (the home re-links it, the forecast's long CSV reads it). */
const WITHOUT_FORECAST = MODELS.filter((m) => m !== forecastModel && m !== homeModel && m !== longCsvForecast)

/* ───────────── the long CSV and the load file, row by row (M4) ───────────── */

/** Long CSV and load-file amounts checked against the guard's rows, and those that matched none. */
const longCheck = { rows: 0, totals: 0, loadRows: 0, components: 0, misses: [] as string[] }

/**
 * Every amount of the context's long CSV (each source its crawl built) and, once, of the load file
 * is a row the guard answered in this crawl, and every control total one of its totals: the rows'
 * sets are the harvested ones (`harvest`), whatever file they are written to.
 */
function checkLongRows(
  ctx: AnalyticsContext,
  label: string,
  models: readonly ((ctx: AnalyticsContext) => unknown)[],
): void {
  if (ctx.guard.mode !== 'exact') return
  const rows = new Map<string, Set<number>>()
  const totals: number[] = []
  // Each total the guard split by component, as its shown amounts (review SB-1's control totals).
  const splits: {
    amounts: Readonly<Record<string, number | null>>
    bandUsd: number | null
    totalUsd: number
  }[] = []
  for (const { out } of rec.calls) {
    for (const r of out.rows)
      if (r.totalUsd != null) {
        const set = rows.get(r.isOther ? 'Other' : r.key) ?? new Set<number>()
        set.add(r.totalUsd)
        rows.set(r.isOther ? 'Other' : r.key, set)
      }
    if (out.total.totalUsd != null) totals.push(out.total.totalUsd)
    if (out.total.totalUsd != null && !out.total.componentsHidden && out.total.amounts.base != null)
      splits.push({ amounts: out.total.amounts, bandUsd: out.total.bandUsd, totalUsd: out.total.totalUsd })
  }
  const files: {
    what: string
    rows: readonly unknown[]
    totals: readonly { period: string; loadedUsd: number | null }[]
    componentTotals: readonly ComponentTotal[]
  }[] = []
  if (models.includes(longCsvModel)) files.push({ what: 'long CSV', ...longCsvOf(ctx) })
  if (models.includes(longCsvForecast))
    files.push({ what: 'forecast long CSV', ...longCsvOf(ctx, { source: 'forecast' }) })
  if (label === 'finance company') {
    const f = loadFileOf(ctx)
    if (f)
      files.push({ what: 'load file', rows: f.rows, totals: f.totals, componentTotals: f.componentTotals })
  }
  for (const f of files) {
    for (const x of f.rows as { period: string; costCenter: string; amountUsd?: number | null }[]) {
      if (x.amountUsd == null) continue
      const key = x.costCenter.startsWith('Other (') ? 'Other' : x.costCenter
      if (rows.get(key)?.has(x.amountUsd)) {
        if (f.what === 'load file') longCheck.loadRows++
        else longCheck.rows++
      } else if (longCheck.misses.length < 20)
        longCheck.misses.push(`${label}: ${f.what} ${x.period} ${x.costCenter} ${x.amountUsd}`)
    }
    for (const t of f.totals) {
      if (t.loadedUsd == null) continue
      if (totals.some((v) => Math.abs(v - (t.loadedUsd as number)) < 0.01)) longCheck.totals++
      else if (longCheck.misses.length < 20)
        longCheck.misses.push(`${label}: ${f.what} control total ${t.period} ${t.loadedUsd}`)
    }
    // A control total by component is a total the guard split on the screen, every amount its own.
    for (const t of f.componentTotals) {
      const same = (a: number | null | undefined, b: number | null | undefined) =>
        Math.abs((a ?? 0) - (b ?? 0)) < 0.01
      const hit = splits.some(
        (x) =>
          same(x.totalUsd, t.loadedUsd) &&
          same(x.bandUsd, t.bandUsd) &&
          SPLIT_COMPONENTS.every((c) => same(x.amounts[c], t.usdByComponent[c])),
      )
      if (hit) longCheck.components++
      else if (longCheck.misses.length < 20)
        longCheck.misses.push(`${label}: ${f.what} component control total ${t.period} ${t.label}`)
    }
  }
}

function touch(v: unknown, seen = new Set<unknown>(), depth = 0): void {
  if (v == null || typeof v !== 'object' || seen.has(v) || depth > 8) return
  seen.add(v)
  if (Array.isArray(v)) {
    for (const x of v) touch(x, seen, depth + 1)
    return
  }
  for (const [k, x] of Object.entries(v)) {
    if (k === 'ctx' || k === 'rows' || k === 'uses') continue
    if ((k === 'calc' || k === 'deltaCalc') && typeof x === 'function' && x.length === 0) {
      try {
        touch(resolveCalc(x as () => null), seen, depth + 1)
      } catch {
        // A card that cannot be built shows nothing.
      }
    } else touch(x, seen, depth + 1)
  }
}

let contexts = 0

/** Contexts crawled, by what they show (`crawlKey`). */
const crawled = new Set<string>()
const skipped = { empty: 0, same: 0 }

/** The filter dimensions Finance and HR admin take one at a time (7.4, 7.5): one class of cost filter. */
const ONE_AT_A_TIME = ['costCenter', 'legalEntity', 'country', 'currency', 'department'] as const

/**
 * What a context's cost figures depend on: the mode, the shown version, the comparison, the
 * period, whether a unit filter and a one-at-a-time filter are set, the positions its cost covers
 * and why cost cannot show. Two contexts with one key show the same sets (a country and a currency
 * that select the same positions select the same shown cost centers), so the second is not crawled.
 */
function crawlKey(ctx: AnalyticsContext): string {
  const f = ctx.filters
  const cmp = ctx.compare.kind === 'version' ? ctx.compare.versionId : ctx.compare.kind
  // Under a one-at-a-time filter a cost figure is the sum of the shown cost centers with that value
  // (7.4, 7.5), with or without a unit filter beside it: the positions say which.
  const kinds = ONE_AT_A_TIME.some((k) => f[k].length) ? 'O' : f.businessUnit.length ? 'U' : ''
  return [
    ctx.mode,
    ctx.showPay,
    ctx.version?.versionId ?? '',
    cmp,
    f.period,
    f.customStart ?? '',
    f.customEnd ?? '',
    kinds,
    setDigest(costIdsOf(ctx)),
    fitOf(ctx, ctx.version) ?? '',
  ].join('|')
}

/**
 * Builds every model of a context with the guard recorded and harvests what it showed. A context
 * whose filters cover no position, or that shows what a crawled one showed, is skipped (`always`
 * crawls it anyway).
 */
function crawl(
  ctx: AnalyticsContext,
  label: string,
  always = false,
  models: readonly ((ctx: AnalyticsContext) => unknown)[] = MODELS,
): void {
  if (!always) {
    if (!costIdsOf(ctx).size) {
      skipped.empty++
      return
    }
    const key = `${crawlKey(ctx)}|${models.map((m) => MODELS.indexOf(m)).join(',')}`
    if (crawled.has(key)) {
      skipped.same++
      return
    }
    crawled.add(key)
  }
  rec.calls.length = 0
  rec.on = true
  try {
    for (const model of models) touch(model(ctx))
  } finally {
    rec.on = false
  }
  contexts++
  harvest(label, ctx)
  checkLongRows(ctx, label, models)
  rec.calls.length = 0
}

/** The review's attack contexts, and whether any of them showed a cost amount (C33: none may). */
const attacks: { label: string; shown: number }[] = []

/** Crawls a context the review attacked, counting the exact rows with an amount it shows. */
function attack(ctx: AnalyticsContext, label: string): void {
  const before = shownRows
  crawl(ctx, label, true)
  attacks.push({ label, shown: shownRows - before })
}

function subsets<T>(xs: readonly T[]): T[][] {
  const out: T[][] = []
  for (let mask = 1; mask < 1 << xs.length; mask++) out.push(xs.filter((_, i) => mask & (1 << i)))
  return out
}

/* ───────────── the test ───────────── */

describe('Finance cost sets at one as-of date, taken together, single out nobody (7.4, 7.5)', () => {
  let sample: Sample
  let picks: ModePicks
  let units: string[] = []
  let folds: ReadonlyMap<string, FinanceFold> = new Map()
  let hsz: string[] = []
  /** The company's target-comparison crawls in a year with a locked version, and the sets they added. */
  let targetCrawls = 0
  let targetNewSets = 0

  beforeAll(() => {
    sample = cachedSample()
    picks = { ...NO_PICKS, ...samplePicks(sample.personas) }
    const company = ctxOf(sample, 'finance', picks)
    tagSources(company)
    units = [...new Set(company.all.positions.map((r) => r.businessUnit))].sort()
    const working =
      company.versions.find((v) => v.versionId === company.version?.versionId) ?? company.versions[0]
    folds = foldsOf(company, working) ?? new Map()
    // Story 8's people: costed in 1550-HSZ over the year.
    const grid = gridMonths(working)
    const members = membersOf(company, shownLines(company, working), grid, null)
    hsz = [...peopleOf(members.filter((m) => m.seat.costCenter === '1550-HSZ'))].sort()

    crawl(company, 'finance company', true)
    // Every set of units, no other filter. A unit and the company show their bridge and variance
    // against every comparison below; a set of 2 to 5 units is the units' shares added, so its
    // forecast (and the home that re-links it) is crawled against the target, where the bridge and
    // variance (differences, each a sum of the units' own) are not priced again for every set.
    for (const set of subsets(units)) {
      const label = `finance ${set.join(' + ')}`
      const filters = { businessUnit: set }
      if (set.length === 1 || set.length === units.length) {
        crawl(ctxOf(sample, 'finance', picks, { filters }), label)
        continue
      }
      crawl(ctxOf(sample, 'finance', picks, { filters }), label, false, WITHOUT_FORECAST)
      crawl(ctxOf(sample, 'finance', picks, { filters, compare: 'target' }), `${label} vs target`, false, [
        forecastModel,
        homeModel,
      ])
    }
    // Each cost center the folds show.
    for (const f of folds.values())
      for (const cc of f.shown)
        crawl(ctxOf(sample, 'finance', picks, { filters: { costCenter: [cc] } }), `finance ${cc}`)
    // Each country, legal entity and currency: the company and each unit.
    const values = (pick: (r: (typeof company.all.positions)[number]) => string) =>
      [...new Set(company.all.positions.map(pick).filter(Boolean))].sort()
    const dims: [keyof Filters, string[]][] = [
      ['country', values((r) => siteByLocation.get(r.location)?.country ?? '')],
      ['legalEntity', values((r) => r.legalEntity || siteByLocation.get(r.location)?.legalEntity || '')],
      ['currency', values((r) => siteByLocation.get(r.location)?.currency ?? '')],
    ]
    for (const [dim, list] of dims)
      for (const v of list)
        for (const unit of [null, ...units])
          crawl(
            ctxOf(sample, 'finance', picks, {
              filters: { [dim]: [v], ...(unit ? { businessUnit: [unit] } : {}) },
            }),
            `finance ${dim} ${v}${unit ? ` in ${unit}` : ''}`,
          )
    // The company and each unit with every version, comparison and period. A comparison with the
    // target adds no costed set (targets are inputs) to what the version shows against its year's
    // locked versions: in a year that has one, it is crawled for the company after them, and must
    // show no new set, and is not crawled again for each unit.
    const versionCrawl = (v: string, cmp: string, period: 'fy' | 'ytd' | 'qtd', unit: string | null) =>
      crawl(
        ctxOf(sample, 'finance', picks, {
          version: v,
          compare: cmp,
          filters: { period, ...(unit ? { businessUnit: [unit] } : {}) },
        }),
        `finance ${v} vs ${cmp} ${period}${unit ? ` ${unit}` : ''}`,
      )
    const periods = ['fy', 'ytd', 'qtd'] as const
    for (const v of company.versions) {
      if (v.state === 'retired') continue
      const locked = company.versions.filter((x) => x.state === 'locked' && x.fiscalYear === v.fiscalYear)
      for (const cmp of locked.length ? locked.map((x) => x.versionId) : ['target'])
        for (const period of periods)
          for (const unit of [null, ...units]) versionCrawl(v.versionId, cmp, period, unit)
    }
    const before = newSets
    for (const v of company.versions) {
      if (v.state === 'retired') continue
      if (!company.versions.some((x) => x.state === 'locked' && x.fiscalYear === v.fiscalYear)) continue
      for (const period of periods) versionCrawl(v.versionId, 'target', period, null)
      targetCrawls += periods.length
    }
    targetNewSets = newSets - before
    // The review's selections (C33): several shown cost centers at once (RF-2, RF-5), and a country
    // over a set of units (Taiwan without Operations, India without Corporate). They show heads only.
    const shownOfUnit = (u: string) => [...(folds.get(u)?.shown ?? [])]
    for (const u of units) {
      const all = shownOfUnit(u)
      if (all.length < 2) continue
      attack(ctxOf(sample, 'finance', picks, { filters: { costCenter: all } }), `finance ${u}'s centers`)
      attack(
        ctxOf(sample, 'finance', picks, { filters: { costCenter: all.slice(1) } }),
        `finance ${u}'s centers less one`,
      )
    }
    const everyShown = [...folds.values()].flatMap((f) => [...f.shown])
    for (const pair of [['1010-SJC', '1230-SGN'], ['1110-MUC', '1010-SJC'], everyShown.slice(0, 2)])
      if (pair.every((cc) => everyShown.includes(cc)))
        attack(
          ctxOf(sample, 'finance', picks, { filters: { costCenter: pair } }),
          `finance ${pair.join(' + ')}`,
        )
    for (const [country, without] of [
      ['Taiwan', 'Operations'],
      ['India', 'Corporate'],
    ] as const)
      attack(
        ctxOf(sample, 'finance', picks, {
          filters: { country: [country], businessUnit: units.filter((u) => u !== without) },
        }),
        `finance ${country} without ${without}`,
      )
    // Bridge steps, Other changes and FX tiles: the company, each unit and every set of all units
    // but one, against each comparison (Finance), and HR admin's company and units.
    const fy27 = company.versions.filter((x) => x.state === 'locked' && x.fiscalYear === 'FY27')
    for (const cmp of fy27) {
      harvestBridge(
        ctxOf(sample, 'finance', picks, { compare: cmp.versionId }),
        `finance vs ${cmp.versionId}`,
      )
      for (const u of units) {
        harvestBridge(
          ctxOf(sample, 'finance', picks, { compare: cmp.versionId, filters: { businessUnit: [u] } }),
          `finance ${u} vs ${cmp.versionId}`,
        )
        harvestBridge(
          ctxOf(sample, 'finance', picks, {
            compare: cmp.versionId,
            filters: { businessUnit: units.filter((x) => x !== u) },
          }),
          `finance all but ${u} vs ${cmp.versionId}`,
        )
      }
    }
    // HR admin with the switch off: each department, company-wide and inside its unit.
    const admin = ctxOf(sample, 'hr-admin', picks)
    crawl(admin, 'hr-admin company')
    const departments = new Map<string, string>()
    for (const r of admin.all.positions) if (r.department) departments.set(r.department, r.businessUnit)
    for (const [d, unit] of [...departments].sort()) {
      crawl(ctxOf(sample, 'hr-admin', picks, { filters: { department: [d] } }), `hr-admin ${d}`)
      crawl(
        ctxOf(sample, 'hr-admin', picks, { filters: { department: [d], businessUnit: [unit] } }),
        `hr-admin ${d} in ${unit}`,
      )
    }
  }, 1_800_000)

  it('crawls every set it names', () => {
    expect(units).toHaveLength(6)
    expect(contexts).toBeGreaterThan(200)
    // Contexts that showed nothing new were skipped, and the forecast view's bridge and variance
    // were handed between contexts with the same inputs, and checked.
    expect(skipped.empty + skipped.same).toBeGreaterThan(0)
    expect(targetCrawls).toBeGreaterThan(0)
    expect(targetNewSets).toBe(0)
    expect(memo.hits).toBeGreaterThan(0)
    expect(memo.checked).toBeGreaterThan(0)
    expect(shownRows).toBeGreaterThan(10_000)
    expect(sets.size).toBeGreaterThan(20)
    expect(hsz.length).toBeGreaterThan(0)
    expect(hsz.length).toBeLessThan(RULES.minCosted)
  })

  it('reads the long CSV and the load file as the guard’s own rows and totals (M4)', () => {
    expect(longCheck.misses).toEqual([])
    // Non-vacuity: thousands of long CSV rows and their control totals, and the whole load file.
    expect(longCheck.rows).toBeGreaterThan(10_000)
    expect(longCheck.totals).toBeGreaterThan(500)
    expect(longCheck.loadRows).toBeGreaterThan(1_000)
    // And every control total by component (review SB-1) is a split the guard showed.
    expect(longCheck.components).toBeGreaterThan(0)
  })

  it('crawls the review’s attacks, which show heads only (C33)', () => {
    expect(attacks.length).toBeGreaterThan(5)
    expect(attacks.filter((a) => a.shown > 0).map((a) => a.label)).toEqual([])
    // Bridge steps, Other changes and FX tiles were harvested, and component splits where they show.
    expect(bridgeSetsSeen).toBeGreaterThan(50)
    // Every FX tile shown, by month (the full year, the year and quarter to date and each month).
    expect(fxMonthsSeen).toBeGreaterThan(100)
    expect(componentRows).toBeGreaterThan(0)
  })

  it('every shown set is a union of whole parts of its units’ one fold', () => {
    expect(notUnions).toEqual([])
  })

  it('no class of costed people over all shown sets of a field holds 1 to 4 people', () => {
    const small: string[] = []
    let classes = 0
    for (const [field, m] of sets) {
      const r = classesOf(field, [...m.keys()])
      classes += r.classes.size
      for (const c of r.small.slice(0, 3)) {
        const holding = c.sig.split(',').map((i) => [...m.values()][Number(i)])
        small.push(
          `${field}: ${c.people.length} (${c.people.join(', ')}) in ${holding.slice(0, 3).join(' | ')}`,
        )
      }
    }
    expect(classes).toBeGreaterThan(sets.size)
    expect(small).toEqual([])
  })

  it('the members of 1550-HSZ (story 8) share a class of 5 or more wherever they are costed', () => {
    let seen = 0
    for (const [field, m] of sets) {
      const { classes, sig } = classesOf(field, [...m.keys()])
      for (const p of hsz) {
        const s = sig.get(p)
        if (!s) continue
        seen++
        expect(classes.get(s.join(','))?.length ?? 0, `${p} in ${field}`).toBeGreaterThanOrEqual(
          RULES.minCosted,
        )
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('back-dated adjustments: no unit set, filter or scope isolates 1 to 4 people’s changes (RF-3, C33 (d))', () => {
    // Seven Other HRIS changes posted in October 2026: five in Corporate, two in Executive Office.
    const latest = new Map<string, string>()
    const at = new Map<string, string>()
    for (const r of sample.datasets.positions)
      if (!at.has(r.positionId) || r.effectiveDate >= (at.get(r.positionId) as string)) {
        at.set(r.positionId, r.effectiveDate)
        latest.set(r.positionId, r.businessUnit)
      }
    const of = (unit: string, n: number) =>
      sample.datasets.workers
        .filter(
          (w) =>
            w.workerType === 'Employee' &&
            !!w.positionId &&
            latest.get(w.positionId) === unit &&
            !w.terminationDate &&
            !w.assignmentEnd,
        )
        .slice(0, n)
    const z = { base: 0, bonus: 0, burden: 0, benefits: 0, oneTime: 0, vacancy: 0 }
    const adjustments: Adjustment[] = [...of('Corporate', 5), ...of('Executive Office', 2)].map((w, i) => ({
      id: `adj-${w.employeeId}`,
      postedIn: '2026-10',
      forMonth: '2026-08',
      positionId: w.positionId ?? null,
      kind: 'other',
      delta: {
        employeeId: w.employeeId,
        positionId: w.positionId ?? null,
        month: '2026-08',
        heads: 0,
        fte: 0,
        active: 0,
        currency: 'USD',
        rate: 1,
        local: { ...z, base: 1_000 + i * 337.77 },
        usd: { ...z, base: 1_000 + i * 337.77, equity: 0, loaded: 1_000 + i * 337.77 },
        leave: 'none',
      },
      reason: 'Other HRIS change',
    }))
    const planted: Sample = { ...sample, plan: { ...sample.plan, adjustments } }
    const shown: { label: string; people: string[] }[] = []
    const read = (mode: Mode, filters: Partial<Filters>, label: string) => {
      const ctx = ctxOf(planted, mode, picks, { filters })
      const rows = financeModel(ctx).versions.adjustmentsByMonth.rows
      const people = new Set(
        adjustments.filter((a) => ctx.data.workers.some((w) => w.employeeId === a.delta.employeeId)),
      )
      for (const r of rows)
        if (r.amountUsd != null || r.other != null)
          shown.push({ label, people: [...people].map((a) => a.delta.employeeId).sort() })
    }
    read('finance', {}, 'finance company')
    for (const set of subsets(units)) read('finance', { businessUnit: set }, `finance ${set.join(' + ')}`)
    read('hr-admin', {}, 'hr-admin company')
    for (const level of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'M1', 'M2', 'M3'] as const)
      read('hr-admin', { level: [level], modes: { level: 'exclude' } }, `hr-admin without ${level}`)
    expect(shown.length).toBeGreaterThan(0)
    const { small } = classesOf('adjustments', [...new Set(shown.map((x) => x.people.join(',')))])
    // Before C33 every unit but Executive Office showed 5 of the 7, a class of 2 with the company's.
    expect(small.map((c) => c.people.join(','))).toEqual([])
  })

  it('each unit’s Other holds 0 or 5 or more costed people in each currency, in every month', () => {
    const company = ctxOf(sample, 'finance', picks)
    const problems: string[] = []
    for (const v of company.versions) {
      if (v.state === 'retired') continue
      const members = membersOf(company, shownLines(company, v), gridMonths(v), null)
      const byUnit = foldCentersOf(members)
      for (const [unit, centers] of byUnit) {
        const fold = financeFold(unit, centers, RULES.minCosted)
        // Each center's people by the currency of the lines that cost them (RF-5), not the center's.
        const curOf = (c: (typeof centers)[number]) => c.costedByCurrency ?? { [c.currency]: c.costedByMonth }
        for (const cur of new Set(centers.flatMap((c) => Object.keys(curOf(c))))) {
          const months = (list: typeof centers) => {
            const series = list.map((c) => curOf(c)[cur] ?? [])
            const n = Math.max(0, ...series.map((x) => x.length))
            const out = new Array<number>(n).fill(0)
            for (const x of series) for (let i = 0; i < x.length; i++) out[i] += x[i]
            return out
          }
          const inCur = centers
          const all = months(inCur)
          // Accepted risk 15.3.8: a unit with only 1 to 4 costed people in a currency in all.
          if (all.some((x) => x > 0 && x < RULES.minCosted)) continue
          const other = months(inCur.filter((c) => fold.other.includes(c.costCenter)))
          if (other.some((x) => x > 0 && x < RULES.minCosted))
            problems.push(`${v.versionId} ${unit} ${cur}: ${other.join(' ')}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('a cost center of 4 Filled seats and 1 accepted offer, or of 5 Filled seats with one last day of 31 Oct, shows no amount of its own', () => {
    const at = (cc: string) => seat({ costCenter: cc, businessUnit: 'U' })
    const seats: Record<string, ReturnType<typeof seat>> = {}
    const lines: PlanLine[] = []
    const addFilled = (id: string, cc: string, months: readonly string[]) => {
      seats[id] = at(cc)
      lines.push(...filled(id, months as never))
    }
    // 4 Filled and 1 accepted offer starting 1 Feb 2027.
    for (let i = 1; i <= 4; i++) addFilled(`X${i}`, '1000-SJC', FY27)
    seats.X5 = at('1000-SJC')
    lines.push(...offer('X5', FY27.slice(10)))
    // 5 Filled, one of them leaving on 31 Oct.
    for (let i = 1; i <= 4; i++) addFilled(`Y${i}`, '2000-SJC', FY27)
    addFilled('Y5', '2000-SJC', FY27.slice(0, 7))
    // A large center, so the unit's total shows.
    for (let i = 1; i <= 12; i++) addFilled(`Z${i}`, '3000-SJC', FY27)
    const members = testMembers(lines, FY27, seats)
    const fold = financeFold('U', foldCentersOf(members).get('U') ?? [], RULES.minCosted)
    expect(fold.shown).toEqual(['3000-SJC'])
    expect(fold.other).toEqual(['1000-SJC', '2000-SJC'])
    const fig = guardModel({
      members,
      mode: 'exact',
      rules: RULES,
      atoms: null,
      folds: new Map([['U', fold]]),
      fit: null,
      bandShown: true,
      by: { key: (m) => m.seat.costCenter, noneLabel: 'None', totalShown: true },
    })
    for (const r of fig.rows)
      if (r.key === '1000-SJC' || r.key === '2000-SJC') expect(r.amounts.loaded, r.key).toBeNull()
    expect(fig.rows.find((r) => r.isOther)?.amounts.loaded).not.toBeNull()
  })

  it('the control: country rows folded on their own find a class under 5 (the hand-built unit of 7.4)', () => {
    const sizes: Record<string, [string, number]> = {
      A: ['Taiwan', 6],
      B: ['Taiwan', 3],
      C: ['United States', 7],
      D: ['United States', 6],
      E: ['United States', 2],
    }
    const people = (cc: string) => Array.from({ length: sizes[cc][1] }, (_, i) => `${cc}${i + 1}`)
    const centers = Object.keys(sizes)
    const fold = financeFold(
      'U',
      centers.map((cc) => ({
        costCenter: cc,
        department: null,
        location: sizes[cc][0] === 'Taiwan' ? 'Hsinchu' : 'San Jose',
        country: sizes[cc][0],
        legalEntity: '',
        currency: sizes[cc][0] === 'Taiwan' ? 'TWD' : 'USD',
        costedByMonth: FY27.map(() => sizes[cc][1]),
        positionIds: people(cc),
      })),
      RULES.minCosted,
    )
    const union = (ccs: readonly string[]) => ccs.flatMap(people).sort().join(',')
    // The build: country rows are the unit's shown cost centers with that country (7.4).
    const build = [union(centers), union(fold.other), ...fold.shown.map((cc) => union([cc]))]
    for (const country of ['Taiwan', 'United States']) {
      const shown = fold.shown.filter((cc) => sizes[cc][0] === country)
      if (shown.length) build.push(union(shown))
    }
    expect(classesOf('build', build).small).toEqual([])
    // The control: each dimension folded on its own (`foldGroups` per dimension, smallest joins only),
    // the cost-center rows and the country rows apart: Taiwan (9) less A (6) is B's 3 people.
    const fold1 = (groups: { key: string; ccs: string[] }[]) => {
      const f = foldGroups(groups, (g) => g.ccs.reduce((a, cc) => a + sizes[cc][1], 0), RULES.minCosted, true)
      const out = f.shown.map((g) => union(g.ccs))
      if (f.folded.length) out.push(union(f.folded.flatMap((g) => g.ccs)))
      return out
    }
    const control = [
      union(centers),
      ...fold1(centers.map((cc) => ({ key: cc, ccs: [cc] }))),
      ...fold1(
        ['Taiwan', 'United States'].map((c) => ({ key: c, ccs: centers.filter((cc) => sizes[cc][0] === c) })),
      ),
    ]
    const small = classesOf('control', control).small
    expect(small.map((c) => c.people.join(','))).toContain(people('B').join(','))
  })

  it('the control: with the org-row rule off, Silicon Engineering less the SVP’s sub-orgs is a class of 1', () => {
    const svp = sample.personas.find((p) => p.key === 'leader-svp-se')
    expect(svp).toBeDefined()
    const before = new Map([...sets].map(([k, m]) => [k, new Map(m)]))
    const beforeDigests = new Map([...digests].map(([k, d]) => [k, new Set(d)]))
    sets.clear()
    digests.clear()
    rec.orgRuleOff = true
    try {
      // A copy of the datasets, so the views decide the org rows again (they memoize by data).
      const fresh: Sample = { ...sample, datasets: { ...sample.datasets } }
      crawl(
        ctxOf(fresh, 'finance', picks, { filters: { businessUnit: ['Silicon Engineering'] } }),
        'control SE',
        true,
      )
    } finally {
      rec.orgRuleOff = false
    }
    const found: string[] = []
    for (const [field, m] of sets)
      for (const c of classesOf(field, [...m.keys()]).small)
        if (svp && c.people.includes(svp.employeeId)) found.push(`${field}: ${c.people.length}`)
    sets.clear()
    digests.clear()
    for (const [k, m] of before) sets.set(k, m)
    for (const [k, d] of beforeDigests) digests.set(k, d)
    expect(found.length).toBeGreaterThan(0)
    // The SVP's own seat alone.
    expect(
      found.some((f) => f.endsWith(': 1')),
      found.join('; '),
    ).toBe(true)
  })
})
