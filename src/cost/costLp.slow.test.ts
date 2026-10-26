/**
 * HRBP and Leader cost against an attacker who solves what the rounded modes show as linear programs
 * (docs/PLAN.md 7.3(d), 16.1; the template app's costLp test, adapted). The guard rounds each cost
 * atom's filled part and band part down to the step on its own and adds parts with `sumRounded`
 * (src/cost/guard.ts), so a figure over a set of atoms says nothing its atoms, each on its own, do not.
 * The test checks that claim on what the view models compute, then lays every atom's readings at two
 * consecutive closes (31 Aug and 30 Sep 2026) over each other.
 *
 * How it observes: the cost guard's own entry points are wrapped (`costMembersOf` and `guardModel`,
 * and `guardedDifference`; the bridge, which rounds its stages itself, is read through `bridgeWindow`
 * and the seats it prices), and every view model that can show cost in a rounded mode (Plan, Forecast,
 * Targets, Home, Requests, Finance and What if) is built for
 * each context, calculation cards included, and so is the long CSV of the version shown and of the
 * forecast (M4: its QTD, YTD and FY rows of whole unions of atoms and its control totals are guard
 * figures, observed like the views'). The Forecast view's bridge and variance tables, which
 * read neither the shown version (within its fiscal year) nor the period, are computed once per set
 * of inputs and handed to the company's other reference contexts with those inputs (`memo`, checked
 * by recomputing every so often), and a stored line table is read once, so the test stays inside
 * its time budget. Each amount a rounded mode reads becomes, per cost atom and part, an
 * observation: its cells (one per seat, line kind, part and month, keyed by value, so an
 * amount that did not change between the closes is the same unknown) and its reading
 * [floor, floor + step). Out-of-plan bits and over-target flags are read from the same rounded atom
 * parts (the routing comparison of 7.2 rule 8 is a guard call too), so they add no unknown. The
 * states reached by submitting and withdrawing requests (any effective date), seat edits and the
 * HRBP's drivers move band parts only (editInvariance.slow.test.ts), so the filled readings here
 * are every such state's.
 *
 *  1. Union identity. On every figure read here (every HRBP and leader pick's default scope at
 *     both closes; the company pick with every version, comparison and period), its shown amounts
 *     are `sumRounded` of its atoms' rounded parts, and every atom part a figure reads is the same
 *     atom part (the same cells) every other figure of that field reads: no scope reaches part of an
 *     atom. The bridge's stage totals are `sumRounded` of the company's per-atom stage parts. Under
 *     `month` and `custom` no amount of a new window is read; with the period check removed (the
 *     control) month amounts are. The rest of 7.3(d)'s bounded scope list (every single department
 *     and leader seat a pick can select, every set of Silicon Engineering's 6 departments, and 200
 *     seeded multi-selects mixing Include and Exclude) is costLpScopes.slow.test.ts, which also
 *     checks that no such scope reads an atom part the default scopes here do not: so the programs
 *     below hold every reachable scope's readings, and each file stays inside its time budget.
 *  2. Per-atom attack. One linear program per window: a group of atoms (the partition change and
 *     people moving between the closes connect atoms) and a field (a line source and window:
 *     `fy:<version>`, the forecast, year and quarter to date, Working's asks, each bridge's stages) in
 *     which 1 to 4 positions' amounts changed between the closes and nobody else's did. The program
 *     holds every filled-part reading of the group's atoms in every field at both closes at once
 *     (more than 7.3(d)'s one field at a time asks, so the per-field claim holds a fortiori); cells
 *     held by the same readings, of the same sign and the same changed position, are one unknown
 *     (the template's `attack`). Band parts are band estimates (public structure, 7.2 rule 5) and
 *     share no unknown with a filled part. Every changed position's new amount, its old amount, its
 *     change, and the same over all of the window's changed positions, stay at least a step wide.
 *  3. Controls. Rounding each set of Silicon Engineering's departments in one step and solving with
 *     department unknowns (the template's test 2) pins some change under half a step; exact readings
 *     ± half a cent pin a hire to under $1.
 *
 * The step, the minimum and the atom index come from the contexts (`ctx.guard`), never a constant.
 * Every program's size is asserted (at most 200 unknowns and 600 rows), so a later scope or field
 * cannot push it past the solver.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { listsInForce } from '@/access/lists'
import { type ModePicks, NO_PICKS } from '@/access/modes'
import { type ActingAsOption, actingAsOptions } from '@/access/scopes'
import { samplePicks } from '@/access/store'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { asKnownOn, cachedSample, SAMPLE_AS_OF, SAMPLE_VERSIONS, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type ISODate, type Mode } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveCalc } from '@/drill/calc'
import { roundCostTo, sumRoundedTo } from '@/lib/costRounding'
import { isAmountRow } from '@/lib/export/longCsv'
import { BRIDGE_STEPS, type BridgeSeat, type BridgeStepKey, priceSeat } from '@/plan/engine/bridge'
import type { AnyVersion, PlanLine, PlanState } from '@/plan/types'
import { financeModel } from '@/views/finance/engine'
import { longCsvOf } from '@/views/finance/engine/longCsv'
import { forecastModel } from '@/views/forecast/engine'
import { type FPrep, prepare as forecastPrep } from '@/views/forecast/engine/base'
import { bridgeSeatsOf, bridgeWindow } from '@/views/forecast/engine/bridge'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { homeModel } from '@/views/home/engine'
import { planModel } from '@/views/plan/engine'
import { closeLinesOf, managerOfIn, versionLinesOf } from '@/views/plan/engine/core'
import { costIdsOf, fitOf, membersOf } from '@/views/plan/engine/guarded'
import { requestsModel } from '@/views/requests/engine'
import { targetsModel } from '@/views/targets/engine'
import { workingFrame, workingLines } from '@/views/targets/engine/working'
import { whatifModel } from '@/views/whatif/engine'
import { type AtomIndex, atomOf, leaderSeats } from './atoms'
import {
  type CostMember,
  type CostPart,
  type GuardedFigure,
  type GuardInput,
  memberIdOf,
  partOfBasis,
} from './guard'
import { boundsFromSums, lpMax } from './lp.testkit'

/* ───────────── what the guard is asked and answers ───────────── */

const rec = vi.hoisted(() => ({
  on: false,
  /** Each member the guard built, to the call that built it (its lines are grouped when first read). */
  callOf: new WeakMap<
    object,
    { lines: readonly PlanLine[]; months: readonly string[]; by: Map<string, PlanLine[]> | null }
  >(),
  /** Each line's member and part ("<member>|<part>"), worked out once per line. */
  keyOfLine: new WeakMap<object, string>(),
  calls: [] as { input: GuardInput; out: GuardedFigure }[],
  diffs: [] as { value: number | null; band: boolean; mode: string | undefined }[],
  windows: [] as { prep: FPrep; months: readonly string[] }[],
  /** The control: `costFit` without its period check. */
  noPeriodCheck: false,
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
  /** Whether results are kept for other contexts (off where every context's inputs are its own). */
  keep: false,
  /** Lets go of the kept results (their contexts too). */
  clear(): void {
    this.values.clear()
    this.reps.clear()
  },
  run<P extends object, T>(name: string, p: P, extra: string, compute: (q: P) => T): { value: T; from: P } {
    if (!this.keep) return { value: compute(p), from: p }
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
        const call = { lines, months: input.months, by: null }
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

vi.mock('./differences', async (orig) => {
  const m = await orig<typeof import('./differences')>()
  return {
    ...m,
    guardedDifference: (...args: Parameters<typeof m.guardedDifference>) => {
      const out = m.guardedDifference(...args)
      if (rec.on) rec.diffs.push({ value: out.value, band: out.band, mode: args[3]?.mode })
      return out
    },
  }
})

vi.mock('./fit', async (orig) => {
  const m = await orig<typeof import('./fit')>()
  return {
    ...m,
    costFit: (...args: Parameters<typeof m.costFit>) => {
      const out = m.costFit(...args)
      return rec.noPeriodCheck && out === m.ROUNDED_PERIOD_NOTE ? null : out
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

/** The lines behind a member the guard built while recording (none for a member built otherwise). */
function linesOfMember(mem: CostMember): readonly PlanLine[] {
  const call = rec.callOf.get(mem)
  if (!call) return []
  if (!call.by) {
    const months = new Set(call.months)
    const by = new Map<string, PlanLine[]>()
    for (const l of call.lines) {
      if (!months.has(l.month)) continue
      let k = rec.keyOfLine.get(l)
      if (k === undefined) {
        k = `${memberIdOf(l)}|${partOfBasis(l.basis)}`
        rec.keyOfLine.set(l, k)
      }
      const list = by.get(k)
      if (list) list.push(l)
      else by.set(k, [l])
    }
    call.by = by
  }
  return call.by.get(`${mem.positionId}|${mem.part}`) ?? []
}

/* ───────────── the two closes ───────────── */

type CloseKey = 'A' | 'B'
const CLOSES: readonly CloseKey[] = ['A', 'B']

interface Close {
  key: CloseKey
  date: ISODate
  /** The last closed month. */
  lastMonth: string
  data: Datasets
  plan: PlanState
  asOfOverride: ISODate | null
  sources: Record<DatasetKey, SourceMeta>
}

const sourcesOf = (data: Datasets): Record<DatasetKey, SourceMeta> =>
  Object.fromEntries(DATASET_KEYS.map((k) => [k, { kind: 'sample', rowCount: data[k].length }])) as Record<
    DatasetKey,
    SourceMeta
  >

/**
 * The sample as it stood at a close: 30 Sep 2026 is the sample itself; 31 Aug 2026 is the datasets as
 * known that day (`asKnownOn`), the closes through August, and FY27 Working's forecast FX from
 * September (the sample's Working carries forecast rates from October, after its September close).
 */
function closeOf(s: Sample, key: CloseKey): Close {
  if (key === 'B')
    return {
      key,
      date: SAMPLE_AS_OF,
      lastMonth: '2026-09',
      data: s.datasets,
      plan: s.plan,
      asOfOverride: null,
      sources: sourcesOf(s.datasets),
    }
  const date: ISODate = '2026-08-31'
  const known = asKnownOn(s, date)
  const september = known.assumptions
    .filter((r) => r.table === 'fx' && r.key.endsWith('|forecast|2026-10'))
    .map((r) => ({ ...r, key: r.key.replace('|forecast|2026-10', '|forecast|2026-09') }))
  const data = { ...known, assumptions: [...known.assumptions, ...september] }
  // The plan state as it stood: the closes through August, the versions and cycles made by then.
  const madeBy = (id: string) => (SAMPLE_VERSIONS.find((v) => v.versionId === id)?.setOn ?? date) <= date
  const plan: PlanState = {
    ...s.plan,
    closes: s.plan.closes.filter((c) => c.month <= '2026-08'),
    versions: s.plan.versions.filter((v) => madeBy(v.versionId)),
    cycles: s.plan.cycles.filter((cy) => cy.openedAt.slice(0, 10) <= date),
  }
  return { key, date, lastMonth: '2026-08', data, plan, asOfOverride: date, sources: sourcesOf(data) }
}

interface CtxOpts {
  filters?: Partial<Filters>
  version?: string | null
  compare?: string | null
}

function ctxAt(c: Close, mode: Mode, picks: ModePicks, opts: CtxOpts = {}): AnalyticsContext {
  return buildContext({
    data: c.data,
    sources: c.sources,
    filters: { ...DEFAULT_FILTERS, ...opts.filters },
    asOfOverride: c.asOfOverride,
    today: SAMPLE_AS_OF,
    mode,
    actingAs: picks,
    plan: c.plan,
    picks: { version: opts.version ?? null, compare: opts.compare ?? null },
  })
}

/* ───────────── cells and observations ───────────── */

/** Every cell seen: an amount of one seat, line kind, part and month, keyed by its value in cents. */
const cellIndex = new Map<string, number>()
const cellValue: number[] = []
/** The seat (position, or a cohort key) each cell is an amount of. */
const cellSeat: string[] = []
const cellOf = (key: string, value: number): number => {
  let i = cellIndex.get(key)
  if (i === undefined) {
    i = cellValue.length
    cellIndex.set(key, i)
    cellValue.push(value)
    cellSeat.push(key.startsWith('whole:') ? key.slice(6).split('|')[0] : key.split('|')[0])
  }
  return i
}

/**
 * A line's cell kind. A seat's vacancy allowance (−factor × its filled cost, 15.2 C31) and its share of
 * the HRIS cohort's modeled exits (spread over seats) always come with the seat's own line of the same
 * source and month, so they share its cell: one net amount, as an attacker who knows the vacancy
 * factor and the attrition rate (both read in Finance > Assumptions) would read them.
 */
const lineKind = (_l: PlanLine): string => 'seat'
const seatOfLine = (l: PlanLine): string =>
  l.positionId || ((l as { cohort?: { key?: string } }).cohort?.key ?? '')
const cents = (v: number): number => Math.round(v * 100)
const cellKey = (seat: string, kind: string, part: string, month: string, v: number): string =>
  `${seat}|${kind}|${part}|${month}|${cents(v)}`

/** Lines of one part grouped into cells (seat, kind, month), with their values. */
function cellsOfLines(lines: Iterable<PlanLine>, part: CostPart): Map<string, number> {
  const sums = new Map<string, { seat: string; kind: string; month: string; v: number }>()
  for (const l of lines) {
    const seat = seatOfLine(l)
    const kind = lineKind(l)
    const k = `${seat}|${kind}|${l.month}`
    const s = sums.get(k)
    if (s) s.v += l.usd.loaded
    else sums.set(k, { seat, kind, month: l.month, v: l.usd.loaded })
  }
  const out = new Map<string, number>()
  for (const s of sums.values()) out.set(cellKey(s.seat, s.kind, part, s.month, s.v), s.v)
  return out
}

/** One reading of one atom part in one field at one close. */
interface Obs {
  close: CloseKey
  atom: string
  part: CostPart
  /** The line sources and months it reads ("own:FY27-W@2026-10,…"). */
  field: string
  /** The field across closes: its sources and window ("actual+own:FY27-W|fy", "bridge:…|ytd"). */
  family: string
  /** Cell indices (each once). */
  cells: readonly number[]
  exact: number
  lo: number
  hi: number
}

/** Observations by close, atom, part and field; every figure of that key must read the same cells. */
const observed = new Map<string, Obs>()
const mismatches: string[] = []
const identity: string[] = []
/** Each holder's atoms at each close (people moving between the closes connect atoms). */
const holderAtoms: Record<CloseKey, Map<string, Set<string>>> = { A: new Map(), B: new Map() }

/** Where each line came from (the company's line sources at each close). */
const sourceOf = new WeakMap<object, string>()
let untagged = 0

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

const fieldOf = (lines: readonly PlanLine[]): string => {
  const keys = new Set<string>()
  for (const l of lines) {
    let src = sourceOf.get(l)
    if (!src) {
      untagged++
      src = `other:${l.versionId}`
    }
    keys.add(`${src}@${l.month}`)
  }
  return [...keys].sort().join(',')
}

const QUARTER_STARTS = ['-04', '-07', '-10', '-01']

/** A window over months, as the same field at either close: fy, ytd or qtd to the last close, else its months. */
function windowOf(months: readonly string[], lastMonth: string): string {
  const ms = [...new Set(months)].sort()
  const first = ms[0] ?? ''
  const end = ms[ms.length - 1] ?? ''
  if (ms.length === 12 && first.endsWith('-04')) return `fy:${first}`
  if (first.endsWith('-04') && end === lastMonth) return 'ytd'
  if (ms.length <= 3 && QUARTER_STARTS.some((q) => first.endsWith(q)) && end === lastMonth) return 'qtd'
  return `${first}..${end}`
}

/** A field's family: its line sources and its window (the same at both closes). */
function familyOf(field: string, lastMonth: string): string {
  const srcs = new Set<string>()
  const months: string[] = []
  for (const e of field.split(',')) {
    const at = e.lastIndexOf('@')
    srcs.add(e.slice(0, at))
    months.push(e.slice(at + 1))
  }
  return `${[...srcs].sort().join('+')}|${windowOf(months, lastMonth)}`
}

/** An atom part of a guard call: its members, kept as the guard keeps them (the minimum costed people). */
function atomPartsOf(
  input: GuardInput,
): Map<string, { atom: string; part: CostPart; members: CostMember[] }> {
  const min = input.rules.minCosted
  const byAtom = new Map<string, CostMember[]>()
  for (const m of input.members) {
    if (m.atomId == null) continue
    const list = byAtom.get(m.atomId)
    if (list) list.push(m)
    else byAtom.set(m.atomId, [m])
  }
  const out = new Map<string, { atom: string; part: CostPart; members: CostMember[] }>()
  for (const [atom, list] of byAtom) {
    const people = new Set<string>()
    for (const m of list) if (m.part === 'filled') for (const p of m.people) people.add(p)
    if (people.size < min) continue
    for (const part of ['filled', 'band'] as const) {
      const members = list.filter((m) => m.part === part)
      if (members.length) out.set(`${atom}|${part}`, { atom, part, members })
    }
  }
  return out
}

/** Each line's token (lines are shared objects: every figure reading an atom part reads the same lines). */
const lineTokens = new WeakMap<object, number>()
let nextLine = 1

/** A 32-bit mix (the MurmurHash3 finalizer). */
function mix(x: number): number {
  let h = x
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return h ^ (h >>> 16)
}

/** What one atom part reads: its cells, its field and its field's family. */
interface PartReading {
  idx: number[]
  field: string
  family: string
}

/** Atom parts already read, by the lines they hold (most figures read the same parts again). */
const partReadings = new Map<string, PartReading>()

/** One atom part's cells and field (each set of lines worked out once). */
function partReading(
  close: Close,
  atom: string,
  part: CostPart,
  members: readonly CostMember[],
): PartReading {
  let a = 0
  let b = 0
  let n = 0
  let whole = ''
  for (const m of members) {
    const ls = linesOfMember(m)
    if (ls?.length)
      for (const l of ls) {
        let t = lineTokens.get(l)
        if (t === undefined) {
          t = nextLine++
          lineTokens.set(l, t)
        }
        a = (a + mix(t)) | 0
        b = (b + mix(t ^ 0x9e3779b9)) | 0
        n++
      }
    else whole += `${m.positionId}:${cents(m.amounts.loaded)};`
  }
  const sig = `${close.key}|${atom}|${part}|${n}:${a >>> 0}:${b >>> 0}|${whole}`
  const hit = partReadings.get(sig)
  if (hit) return hit
  const lines: PlanLine[] = []
  const cells = new Map<string, number>()
  for (const m of members) {
    const ls = linesOfMember(m)
    if (ls?.length) lines.push(...ls)
    else cells.set(`whole:${m.positionId}|${part}|${cents(m.amounts.loaded)}`, m.amounts.loaded)
  }
  for (const [ck, v] of cellsOfLines(lines, part)) cells.set(ck, (cells.get(ck) ?? 0) + v)
  for (const l of lines)
    if (l.holderId) {
      const set = holderAtoms[close.key].get(l.holderId) ?? new Set<string>()
      set.add(atom)
      holderAtoms[close.key].set(l.holderId, set)
    }
  const field = fieldOf(lines)
  const out: PartReading = {
    idx: [...cells].map(([ck, v]) => cellOf(ck, v)).sort((x, y) => x - y),
    field,
    family: familyOf(field, close.lastMonth),
  }
  partReadings.set(sig, out)
  return out
}

/** Every call the guard answered in a rounded context: union identity, then observations. */
function harvest(close: Close, label: string): { shown: number; added: number } {
  let shown = 0
  let added = 0
  for (const { input, out } of rec.calls) {
    if (input.mode !== 'rounded' || out.total.totalUsd == null) continue
    shown++
    const step = input.rules.floorUsd
    const parts = atomPartsOf(input)
    const rounded = new Map<string, number>()
    for (const [k, { atom, part, members }] of parts) {
      if (part === 'band' && !input.bandShown) continue
      let exact = 0
      for (const m of members) exact += m.amounts.loaded
      rounded.set(k, roundCostTo(exact, step))
      if (part === 'band') continue
      const { idx, field, family } = partReading(close, atom, part, members)
      const key = `${close.key}|${atom}|${part}|${field}`
      const seen = observed.get(key)
      if (!seen) {
        const lo = roundCostTo(exact, step)
        observed.set(key, {
          close: close.key,
          atom,
          part,
          field,
          family,
          cells: idx,
          exact,
          lo,
          hi: lo + step,
        })
        added++
      } else if (seen.cells.length !== idx.length || seen.cells.some((c, i) => c !== idx[i])) {
        if (mismatches.length < 20)
          mismatches.push(
            `${label}: atom ${atom} reads ${idx.length} cells, another figure ${seen.cells.length} (${field.slice(0, 80)})`,
          )
        else mismatches.push('…')
      }
    }
    // The figure is the sum of its atoms' rounded parts.
    const filled = [...rounded].filter(([k]) => k.endsWith('|filled')).map(([, v]) => v)
    const all = [...rounded.values()]
    const t = out.total
    if (t.amounts.loaded !== sumRoundedTo(filled, step) || t.totalUsd !== sumRoundedTo(all, step))
      identity.push(`${label}: total ${t.totalUsd} is not the sum of its atoms' parts`)
    for (const [k, v] of Object.entries(out.parts ?? {}))
      if (rounded.get(k) !== v) identity.push(`${label}: part ${k} reads ${v}, its atom ${rounded.get(k)}`)
  }
  return { shown, added }
}

/* ───────────── the bridge's stage parts ───────────── */

const ATOM_OF_COHORT = /^cohort:[^|]*\|[^|]*\|([^|]*)\|(.*)$/

/** A seat's part at a stage (the view's rule: the payRate step swaps the side read). */
function partAt(seat: BridgeSeat, stage: number): CostPart {
  const m = ATOM_OF_COHORT.exec(seat.positionId)
  if (m) return m[1] === 'band' ? 'band' : 'filled'
  const payRateAt = BRIDGE_STEPS.indexOf('payRate') + 1
  const side = stage >= payRateAt ? (seat.forecast ?? seat.comparison) : (seat.comparison ?? seat.forecast)
  return side?.basis === 'band' ? 'band' : 'filled'
}

/** The bridge's stages: nothing from the forecast, then each driver in order added to the last. */
const STAGES: ReadonlySet<BridgeStepKey>[] = [new Set()]
for (const step of BRIDGE_STEPS) STAGES.push(new Set([...(STAGES.at(-1) ?? []), step]))

/** One bridge's per-atom stage parts at a close (the company's seats priced month by month). */
interface BridgeRef {
  /** Atoms with the minimum or more costed people on both sides. */
  kept: ReadonlySet<string>
  /** Per seat: its key (position or cohort key), its atom, its part and its price per stage and month. */
  seats: { seat: string; atom: string | null; part: CostPart[]; price: Map<string, number>[] }[]
}

const bridgeRefs = new Map<string, BridgeRef>()

function bridgeRefOf(close: CloseKey, cmp: string, p: FPrep): BridgeRef {
  const key = `${close}|${cmp}`
  const hit = bridgeRefs.get(key)
  if (hit) return hit
  const ctx = p.ctx
  const atoms = ctx.guard.atoms
  const managerOf = managerOfIn(ctx)
  const min = ctx.guard.rules.minCosted
  const counted = (members: readonly CostMember[]) => {
    const by = new Map<string, Set<string>>()
    for (const m of members) {
      if (!m.atomId || m.part !== 'filled') continue
      const set = by.get(m.atomId) ?? new Set<string>()
      for (const x of m.people) set.add(x)
      by.set(m.atomId, set)
    }
    return by
  }
  const v = p.comparison as AnyVersion
  const a = counted(membersOf(ctx, versionLinesOf(ctx, v), p.fyMonths, costIdsOf(ctx)))
  const b = counted(membersOf(ctx, p.costLines, p.fyMonths, costIdsOf(ctx)))
  const kept = new Set(
    [...a.keys()].filter((x) => (a.get(x)?.size ?? 0) >= min && (b.get(x)?.size ?? 0) >= min),
  )
  const seats = bridgeSeatsOf(p).map((s) => {
    const c = ATOM_OF_COHORT.exec(s.positionId)
    const atom = c ? (c[2] === 'none' ? null : c[2]) : atomOf(s.positionId, atoms, managerOf)
    return {
      seat: s.positionId,
      atom,
      part: STAGES.map((_, k) => partAt(s, k)),
      price: STAGES.map((from) => new Map(p.fyMonths.map((m) => [m, priceSeat(s, from, [m])]))),
    }
  })
  const ref = { kept, seats }
  bridgeRefs.set(key, ref)
  return ref
}

/** A bridge window's stage totals from the company's per-atom parts, over the given atoms. */
function stageTotals(ref: BridgeRef, atoms: ReadonlySet<string>, months: readonly string[], step: number) {
  return STAGES.map((_, k) => {
    const parts = new Map<string, number>()
    for (const s of ref.seats) {
      if (!s.atom || !atoms.has(s.atom) || !ref.kept.has(s.atom)) continue
      const pk = `${s.atom}|${s.part[k]}`
      let v = parts.get(pk) ?? 0
      for (const m of months) v += s.price[k].get(m) ?? 0
      parts.set(pk, v)
    }
    return sumRoundedTo(
      [...parts.values()].map((v) => roundCostTo(v, step)),
      step,
    )
  })
}

const bridgeShown = new Map<string, { close: CloseKey; cmp: string; months: readonly string[] }>()
const bridgeIssues: string[] = []

/** Every bridge window a rounded context drew: its totals are the company's per-atom stage parts. */
/** The windows already checked, by the context that computed them (a memo hit reads the same window). */
const windowsChecked = new WeakMap<FPrep, Set<string>>()

function checkWindows(close: CloseKey, label: string): void {
  for (const { prep, months } of rec.windows) {
    if (prep.ctx.guard.mode !== 'rounded' || !prep.comparison) continue
    const done = windowsChecked.get(prep) ?? new Set<string>()
    windowsChecked.set(prep, done)
    if (done.has(months.join(','))) continue
    done.add(months.join(','))
    const w = bridgeWindow(prep, months as never)
    if (w.start == null || w.end == null) continue
    const cmp = prep.comparison.versionId
    const ref = bridgeRefs.get(`${close}|${cmp}`)
    if (!ref) {
      bridgeIssues.push(`${label}: no company bridge against ${cmp}`)
      continue
    }
    const atoms = new Set<string>()
    for (const s of bridgeSeatsOf(prep)) {
      const c = ATOM_OF_COHORT.exec(s.positionId)
      const a = c
        ? c[2] === 'none'
          ? null
          : c[2]
        : atomOf(s.positionId, prep.ctx.guard.atoms, managerOfIn(prep.ctx))
      if (a) atoms.add(a)
    }
    const t = stageTotals(ref, atoms, months, prep.ctx.guard.rules.floorUsd)
    const got = [w.start]
    for (const s of w.steps) got.push((got.at(-1) as number) + s.value)
    if (got.some((v, i) => Math.abs(v - t[i]) > 0.005) || Math.abs(w.end - t[t.length - 1]) > 0.005)
      bridgeIssues.push(
        `${label} ${cmp} ${months[0]}..${months.at(-1)}: ${got.join(', ')} vs ${t.join(', ')}`,
      )
    bridgeShown.set(`${close}|${cmp}|${months.join(',')}`, { close, cmp, months })
  }
}

/** The per-atom filled stage parts of every bridge window shown, as observations. */
function bridgeObservations(closes: Record<CloseKey, Close>, step: number): Obs[] {
  const out: Obs[] = []
  for (const { close, cmp, months } of bridgeShown.values()) {
    const ref = bridgeRefs.get(`${close}|${cmp}`) as BridgeRef
    const window = windowOf(months, closes[close].lastMonth)
    STAGES.forEach((_, k) => {
      const byAtom = new Map<string, Map<string, number>>()
      for (const s of ref.seats) {
        if (!s.atom || !ref.kept.has(s.atom) || s.part[k] !== 'filled') continue
        let cells = byAtom.get(s.atom)
        if (!cells) {
          cells = new Map()
          byAtom.set(s.atom, cells)
        }
        for (const m of months) {
          const v = s.price[k].get(m) ?? 0
          const ck = `${s.seat}|${m}`
          cells.set(ck, (cells.get(ck) ?? 0) + v)
        }
      }
      for (const [atom, cells] of byAtom) {
        let exact = 0
        const idx: number[] = []
        for (const [ck, v] of cells) {
          exact += v
          const [seat, month] = ck.split('|')
          idx.push(cellOf(cellKey(seat, 'seat', 'filled', month, v), v))
        }
        const lo = roundCostTo(exact, step)
        out.push({
          close,
          atom,
          part: 'filled',
          field: `bridge:${cmp}:${k}:${months.join(',')}`,
          family: `bridge:${cmp}:${k}|${window}`,
          cells: [...new Set(idx)].sort((a, b) => a - b),
          exact,
          lo,
          hi: lo + step,
        })
      }
    })
  }
  return out
}

/* ───────────── crawling a context ───────────── */

/**
 * The long CSV (M4): the version shown and the forecast, its rows' amounts and its control totals
 * the guard's own figures (src/views/finance/engine/longCsv.ts), so the programs observe them too.
 */
const longCsvModel = (ctx: AnalyticsContext) => longCsvOf(ctx)
const longCsvForecast = (ctx: AnalyticsContext) => longCsvOf(ctx, { source: 'forecast' })

const MODELS: ((ctx: AnalyticsContext) => unknown)[] = [
  planModel,
  forecastModel,
  targetsModel,
  homeModel,
  requestsModel,
  financeModel,
  whatifModel,
  longCsvModel,
  longCsvForecast,
]

/** Opens every tab (models are getters) and every calculation card the model holds (cost cards are built on click). */
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

/** The long CSV amounts and control totals the crawls read (M4: the programs hold their guard calls). */
const longSeen = { rows: 0, totals: 0 }

/** Builds every model of a context with the guard recorded, and harvests what it read. */
function crawl(close: Close, ctx: AnalyticsContext, label: string): { shown: number; added: number } {
  rec.calls.length = 0
  rec.windows.length = 0
  rec.on = true
  try {
    for (const model of MODELS) {
      let m: unknown
      try {
        m = model(ctx)
      } catch (e) {
        if (!String(e).includes('is not built yet')) throw e
        continue
      }
      touch(m)
    }
  } finally {
    rec.on = false
  }
  contexts++
  for (const source of ['version', 'forecast'] as const) {
    const m = longCsvOf(ctx, { source })
    longSeen.rows += m.rows.filter((r) => isAmountRow(r) && r.amountUsd != null).length
    longSeen.totals += m.totals.filter((t) => t.loadedUsd != null).length
  }
  const out = harvest(close, label)
  checkWindows(close.key, label)
  rec.calls.length = 0
  rec.windows.length = 0
  return out
}

/* ───────────── the scope list ───────────── */

function subsets<T>(xs: readonly T[]): T[][] {
  const out: T[][] = []
  for (let mask = 1; mask < 1 << xs.length; mask++) out.push(xs.filter((_, i) => mask & (1 << i)))
  return out
}

interface Pick {
  mode: Mode
  option: ActingAsOption
  picks: ModePicks
}

/* ───────────── the programs ───────────── */

/** The most a program may hold (PLAN 7.3(d)): the template's dense solver stays well inside these. */
const MAX_UNKNOWNS = 200
const MAX_ROWS = 600

/** Union-find over atom ids. */
class Groups {
  private readonly up = new Map<string, string>()
  find(x: string): string {
    let r = x
    while (this.up.has(r) && this.up.get(r) !== r) r = this.up.get(r) as string
    this.up.set(x, r)
    return r
  }
  join(a: string, b: string): void {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.up.set(rb, ra)
  }
}

/** One window: a group of atoms and a field in which 1 to 4 positions changed between the closes. */
interface Window {
  group: string
  family: string
  changed: string[]
  /** Per changed position: its cells only at the first close, and only at the second. */
  removed: Map<string, number[]>
  added: Map<string, number[]>
}

/**
 * A program over readings (the template's `attack`, signed): readings of the same cells say the same
 * and are one row; cells held by the same rows, of the same sign and the same tag (a changed
 * position's cells keep its position as their tag) are one unknown x ≥ 0, its cells' absolute value
 * in steps. Each row is Σ sign × x in [lo, hi).
 */
interface Program {
  n: number
  A: number[][]
  b: number[]
  sign: number[]
  /** The truth of each unknown, in steps. */
  truth: number[]
  /** Each cell's unknown. */
  unknownOf: ReadonlyMap<number, number>
}

function programOf(
  obs: readonly Obs[],
  tagOf: (cell: number) => string,
  step: number,
  exact = false,
): Program {
  const byCells = new Map<string, { cells: readonly number[]; lo: number; hi: number; exact: number }>()
  for (const o of obs) {
    const k = o.cells.join(',')
    const h = byCells.get(k)
    if (h) {
      h.lo = Math.max(h.lo, o.lo)
      h.hi = Math.min(h.hi, o.hi)
    } else byCells.set(k, { cells: o.cells, lo: o.lo, hi: o.hi, exact: o.exact })
  }
  const rows = [...byCells.values()]
  const held = new Map<number, number[]>()
  rows.forEach((r, i) => {
    for (const c of r.cells) {
      if (cellValue[c] === 0) continue
      const list = held.get(c)
      if (list) list.push(i)
      else held.set(c, [i])
    }
  })
  const keyed = new Map<string, number>()
  const sign: number[] = []
  const truth: number[] = []
  const unknownOf = new Map<number, number>()
  for (const [c, by] of held) {
    const s = cellValue[c] < 0 ? -1 : 1
    const key = `${by.join(',')}|${s}|${tagOf(c)}`
    let u = keyed.get(key)
    if (u === undefined) {
      u = sign.length
      keyed.set(key, u)
      sign.push(s)
      truth.push(0)
    }
    truth[u] += Math.abs(cellValue[c]) / step
    unknownOf.set(c, u)
  }
  const n = sign.length
  const A: number[][] = []
  const b: number[] = []
  for (const r of rows) {
    const row = new Array<number>(n).fill(0)
    for (const c of r.cells) {
      const u = unknownOf.get(c)
      if (u !== undefined) row[u] = sign[u]
    }
    const lo = exact ? (r.exact - 0.005) / step : r.lo / step
    const hi = exact ? (r.exact + 0.005) / step : r.hi / step
    A.push(row)
    b.push(hi)
    A.push(row.map((v) => -v))
    b.push(-lo)
  }
  return { n, A, b, sign, truth, unknownOf }
}

/** A signed sum of cells as a vector over a program's unknowns (each unknown once). */
function targetOf(p: Program, parts: readonly { cells: readonly number[]; coef: number }[]): number[] {
  const c = new Array<number>(p.n).fill(0)
  for (const { cells, coef } of parts) {
    const units = new Set<number>()
    for (const x of cells) {
      const u = p.unknownOf.get(x)
      if (u !== undefined) units.add(u)
    }
    for (const u of units) c[u] += coef * p.sign[u]
  }
  return c
}

/** The bounds of c·x; a side the readings leave unbounded tells the attacker nothing there. */
function boundsOf(p: Program, c: readonly number[]): [number, number] {
  const hi = lpMax(p.A, p.b, c)
  const lo = lpMax(
    p.A,
    p.b,
    c.map((v) => -v),
  )
  if (hi.status === 'infeasible' || lo.status === 'infeasible') throw new Error('The readings are infeasible')
  return [
    lo.status === 'optimal' ? -lo.value : Number.NEGATIVE_INFINITY,
    hi.status === 'optimal' ? hi.value : Number.POSITIVE_INFINITY,
  ]
}

const truthOf = (p: Program, c: readonly number[]): number => c.reduce((a, v, u) => a + v * p.truth[u], 0)

/* ───────────── the tests ───────────── */

describe('HRBP and Leader cost against linear programs over everything the rounded modes show (7.3d)', () => {
  let sample: Sample
  const closes = {} as Record<CloseKey, Close>
  const company = {} as Record<CloseKey, AnalyticsContext>
  const picksAt = {} as Record<CloseKey, Pick[]>
  let step = 0
  let atomsAt = {} as Record<CloseKey, AtomIndex>
  const shownBy = { references: 0, defaults: 0 }
  const monthRead = { shown: 0, added: 0, control: 0 }
  let seDepartments: string[] = []
  let allObs: Obs[] = []

  beforeAll(() => {
    sample = cachedSample()
    for (const key of CLOSES) {
      const c = closeOf(sample, key)
      closes[key] = c
      const base = { ...NO_PICKS, ...samplePicks(sample.personas) }
      const ctx0 = ctxAt(c, 'leader', base)
      step = ctx0.guard.rules.floorUsd
      atomsAt = { ...atomsAt, [key]: ctx0.guard.atoms }
      const env = {
        positionIndex: ctx0.positionIndex,
        asOf: ctx0.asOf,
        all: ctx0.all,
        lists: listsInForce(undefined, c.data, c.sources),
        atoms: ctx0.guard.atoms,
      }
      const picks: Pick[] = []
      for (const mode of ['hrbp', 'leader'] as const)
        for (const option of actingAsOptions(mode, env))
          picks.push({ mode, option, picks: { ...base, [mode]: option.pick } })
      picksAt[key] = picks
      const ceo = picks.find((p) => p.mode === 'leader' && p.option.company) as Pick
      company[key] = ctxAt(c, 'leader', ceo.picks)
      tagSources(company[key])
      // The company with every version, comparison and period: the reference figures. Their bridge
      // and variance repeat across the shown versions of a year and the periods, so they are kept.
      memo.keep = true
      const combos: CtxOpts[] = [{}]
      for (const v of company[key].versions) {
        if (v.state === 'retired') continue
        const locked = company[key].versions.filter(
          (x) => x.state === 'locked' && x.fiscalYear === v.fiscalYear,
        )
        for (const cmp of [null, 'target', ...locked.map((x) => x.versionId)])
          combos.push({ version: v.versionId, compare: cmp })
      }
      const resolved = new Set<string>()
      for (const combo of combos)
        for (const period of ['fy', 'ytd', 'qtd'] as const) {
          const ctx = ctxAt(c, 'leader', ceo.picks, { ...combo, filters: { period } })
          // A default pick resolves to an explicit one: crawl each version, comparison and period once.
          const cmpKey = ctx.compare.kind === 'version' ? ctx.compare.versionId : ctx.compare.kind
          const k = `${ctx.version?.versionId ?? ''}|${cmpKey}|${period}`
          if (resolved.has(k)) continue
          resolved.add(k)
          // The company bridges the rounded views draw, priced seat by seat.
          const p = forecastPrep(ctx)
          if (p.comparison && p.run) bridgeRefOf(key, p.comparison.versionId, p)
          shownBy.references += crawl(
            c,
            ctx,
            `${key} company ${combo.version ?? ''} vs ${combo.compare ?? ''} ${period}`,
          ).shown
        }
      memo.keep = false
      memo.clear()
      // Every HRBP and leader pick's default scope.
      for (const p of picks)
        shownBy.defaults += crawl(
          c,
          ctxAt(c, p.mode, p.picks),
          `${key} ${p.mode} ${p.option.pick.name}`,
        ).shown
    }

    // Silicon Engineering's departments, for the control of part 3 (the scope list itself, every
    // department, leader seat and set a pick can select, is costLpScopes.slow.test.ts).
    const c = closes.B
    const se = picksAt.B.find(
      (p) => p.mode === 'hrbp' && p.option.pick.unit === 'Silicon Engineering',
    ) as Pick
    seDepartments = [
      ...new Set(
        ctxAt(c, se.mode, se.picks)
          .data.positions.map((r) => r.department ?? '')
          .filter(Boolean),
      ),
    ].sort()

    // Month and custom periods read no window of their own; with the period check removed (the control) they do.
    const ceoB = picksAt.B.find((p) => p.mode === 'leader' && p.option.company) as Pick
    const periods: Partial<Filters>[] = [
      { period: 'month' },
      { period: 'custom', customStart: '2026-09-01', customEnd: '2026-09-30' },
    ]
    for (const f of periods) {
      const r = crawl(c, ctxAt(c, 'leader', ceoB.picks, { filters: f }), 'B company month')
      monthRead.shown += r.shown
      monthRead.added += r.added
    }
    rec.noPeriodCheck = true
    try {
      const keys = new Set(observed.keys())
      for (const f of periods)
        crawl(c, ctxAt(c, 'leader', ceoB.picks, { filters: f }), 'B company month (control)')
      // The control's month amounts are not observations of the build: drop them again.
      for (const k of [...observed.keys()])
        if (!keys.has(k)) {
          monthRead.control++
          observed.delete(k)
        }
    } finally {
      rec.noPeriodCheck = false
    }
    allObs = [
      ...[...observed.values()].filter((o) => o.part === 'filled'),
      ...bridgeObservations(closes, step),
    ]
  }, 900_000)

  it('collects what every pick shows, and no amount of a month or custom window', () => {
    expect(contexts).toBeGreaterThan(180)
    expect(shownBy.references).toBeGreaterThan(0)
    expect(shownBy.defaults).toBeGreaterThan(0)
    expect(untagged).toBe(0)
    // The bridge and variance were handed between contexts with the same inputs, and checked.
    expect(memo.hits).toBeGreaterThan(0)
    expect(memo.checked).toBeGreaterThan(0)
    // What a month or custom period reads (the routing comparison's full-year asks cost, 7.2 rule 8)
    // is a reading of the full year already observed: nothing of a one-month window.
    expect(monthRead.added).toBe(0)
    expect(monthRead.control).toBeGreaterThan(0)
    // The long CSV's amounts and control totals were read with the views' (M4).
    expect(longSeen.rows).toBeGreaterThan(500)
    expect(longSeen.totals).toBeGreaterThan(500)
  })

  it('every figure is the sum of its whole atoms’ rounded parts, at every pick’s default scope (union identity)', () => {
    expect(identity).toEqual([])
    expect(mismatches).toEqual([])
    expect(bridgeIssues).toEqual([])
    expect(bridgeShown.size).toBeGreaterThan(0)
    // A displayed difference in a rounded mode is a difference of rounded totals, or a band figure.
    const off = rec.diffs.filter(
      (d) => d.mode === 'rounded' && d.value != null && !d.band && d.value % step !== 0,
    )
    expect(off).toEqual([])
  })

  it('holds the atom index it is built on (one atom per leader seat; one partition change)', () => {
    const a = atomsAt.A
    const b = atomsAt.B
    // About 45 to 63 atoms in the sample (7.3(d)), plus the one raised before the 30 Sep close.
    expect(a.atoms.length).toBeGreaterThanOrEqual(45)
    expect(a.atoms.length).toBeLessThanOrEqual(63)
    expect(b.atoms).toHaveLength(a.atoms.length + 1)
    for (const [index, c] of [
      [a, closes.A],
      [b, closes.B],
    ] as const) {
      const leaders = leaderSeats(c.data.positions, index.closeDate)
      for (const x of index.atoms) if (x.kind === 'leader') expect(leaders.has(x.atomId)).toBe(true)
      expect(index.atoms.filter((x) => x.kind === 'leader').length).toBeLessThanOrEqual(leaders.size)
    }
    const changed = b.atoms.filter((x) => !a.atoms.some((y) => y.atomId === x.atomId))
    expect(changed).toHaveLength(1)
    // The fixed amounts are observed under both indexes: the locked versions at both closes.
    const lockedAt = (k: CloseKey) =>
      new Set(allObs.filter((o) => o.close === k && /^own:[^+|]*\|fy/.test(o.family)).map((o) => o.family))
    expect(lockedAt('A').size).toBeGreaterThan(0)
    expect([...lockedAt('A')].every((f) => lockedAt('B').has(f))).toBe(true)
  })

  /* ───────────── part 2 ───────────── */

  /** Atom groups: atoms the partition change or a person moving between the closes connect. */
  function groupsOf(): Groups {
    const g = new Groups()
    const managerOf = (k: CloseKey) => managerOfIn(company[k])
    const seats = new Set<string>()
    for (const o of allObs) for (const c of o.cells) seats.add(cellSeat[c])
    for (const s of seats) {
      if (s.startsWith('cohort:')) continue
      const a = atomOf(s, atomsAt.A, managerOf('A'))
      const b = atomOf(s, atomsAt.B, managerOf('B'))
      if (a && b && a !== b) g.join(a, b)
    }
    // A person whose atoms differ between the closes moved: their old and new atoms are one group.
    for (const [holder, a] of holderAtoms.A) {
      const b = holderAtoms.B.get(holder)
      if (!b || (a.size === b.size && [...a].every((x) => b.has(x)))) continue
      const [first, ...rest] = [...a, ...b]
      for (const x of rest) g.join(first, x)
    }
    return g
  }

  function windowsOf(groups: Groups): { windows: Window[]; byGroup: Map<string, Obs[]> } {
    const byGroup = new Map<string, Obs[]>()
    for (const o of allObs) {
      const k = groups.find(o.atom)
      const list = byGroup.get(k)
      if (list) list.push(o)
      else byGroup.set(k, [o])
    }
    const windows: Window[] = []
    for (const [group, obs] of byGroup) {
      const families = new Set(obs.map((o) => o.family))
      for (const family of families) {
        const at = (k: CloseKey) => {
          const out = new Map<string, Set<number>>()
          for (const o of obs) {
            if (o.close !== k || o.family !== family) continue
            for (const c of o.cells) {
              if (Math.abs(cellValue[c]) < 0.005) continue
              const s = cellSeat[c]
              const set = out.get(s) ?? new Set<number>()
              set.add(c)
              out.set(s, set)
            }
          }
          return out
        }
        const a = at('A')
        const b = at('B')
        if (!a.size || !b.size) continue
        const removed = new Map<string, number[]>()
        const added = new Map<string, number[]>()
        for (const s of new Set([...a.keys(), ...b.keys()])) {
          const sa = a.get(s) ?? new Set<number>()
          const sb = b.get(s) ?? new Set<number>()
          const r = [...sa].filter((x) => !sb.has(x))
          const n = [...sb].filter((x) => !sa.has(x))
          if (r.length) removed.set(s, r)
          if (n.length) added.set(s, n)
        }
        const changed = [...new Set([...removed.keys(), ...added.keys()])].sort()
        if (changed.length >= 1 && changed.length <= 4)
          windows.push({ group, family, changed, removed, added })
      }
    }
    return { windows, byGroup }
  }

  /** A group's program: every reading of its atoms at both closes, the windows' changed positions tagged. */
  function groupProgram(windows: readonly Window[], obs: readonly Obs[], exact = false): Program {
    const changed = new Set(windows.flatMap((w) => w.changed))
    return programOf(obs, (c) => (changed.has(cellSeat[c]) ? cellSeat[c] : ''), step, exact)
  }

  /** The targets of a window: each changed position's new and old amount and its change, and the same over all. */
  function targetsOf(w: Window): { who: string; parts: { cells: readonly number[]; coef: number }[] }[] {
    const out: { who: string; parts: { cells: readonly number[]; coef: number }[] }[] = []
    const all = { old: [] as number[], new: [] as number[] }
    for (const s of w.changed) {
      const o = w.removed.get(s) ?? []
      const n = w.added.get(s) ?? []
      all.old.push(...o)
      all.new.push(...n)
      if (n.length) out.push({ who: `${s} new`, parts: [{ cells: n, coef: 1 }] })
      if (o.length) out.push({ who: `${s} old`, parts: [{ cells: o, coef: 1 }] })
      if (n.length && o.length)
        out.push({
          who: `${s} change`,
          parts: [
            { cells: n, coef: 1 },
            { cells: o, coef: -1 },
          ],
        })
    }
    if (w.changed.length > 1) {
      if (all.new.length) out.push({ who: 'all new', parts: [{ cells: all.new, coef: 1 }] })
      if (all.old.length) out.push({ who: 'all old', parts: [{ cells: all.old, coef: 1 }] })
      if (all.new.length && all.old.length)
        out.push({
          who: 'all change',
          parts: [
            { cells: all.new, coef: 1 },
            { cells: all.old, coef: -1 },
          ],
        })
    }
    return out
  }

  it('no window pins a changed position, or the window’s changes together, narrower than a step', () => {
    const groups = groupsOf()
    const { windows, byGroup } = windowsOf(groups)
    const byWindowGroup = new Map<string, Window[]>()
    for (const w of windows) byWindowGroup.set(w.group, [...(byWindowGroup.get(w.group) ?? []), w])
    let narrowest = { width: Number.POSITIVE_INFINITY, who: '' }
    let solved = 0
    let open = 0
    let biggest = { n: 0, rows: 0 }
    const unsound: string[] = []
    for (const [group, list] of byWindowGroup) {
      const p = groupProgram(list, byGroup.get(group) as Obs[])
      biggest = { n: Math.max(biggest.n, p.n), rows: Math.max(biggest.rows, p.A.length) }
      expect(p.n, `${group} unknowns`).toBeLessThanOrEqual(MAX_UNKNOWNS)
      expect(p.A.length, `${group} rows`).toBeLessThanOrEqual(MAX_ROWS)
      // The same sum asked by several windows is solved once.
      const asked = new Map<string, { c: number[]; who: string }>()
      for (const w of list)
        for (const { who, parts } of targetsOf(w)) {
          const c = targetOf(p, parts)
          const k = c.join(',')
          if (c.some((x) => x !== 0) && !asked.has(k))
            asked.set(k, { c, who: `${who} (${group}, ${w.family})` })
        }
      for (const { c, who } of asked.values()) {
        const [lo, hi] = boundsOf(p, c)
        solved++
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) open++
        const truth = truthOf(p, c)
        // The attack is sound: the truth is inside what it derives.
        if (truth < lo - 1e-6 || truth > hi + 1e-6) unsound.push(`${who}: ${truth} not in [${lo}, ${hi}]`)
        if (hi - lo < narrowest.width) narrowest = { width: hi - lo, who }
      }
    }
    expect(unsound).toEqual([])
    // More than 20 windows: hires, leavers and pay changes between the closes, one atom at a time.
    expect(windows.length).toBeGreaterThan(20)
    expect(solved - open).toBeGreaterThan(20)
    expect(biggest.n).toBeGreaterThan(0)
    // Never narrower than a step: the best guess can always be half a step from the truth.
    expect(narrowest.width * step, narrowest.who).toBeGreaterThanOrEqual(step - 1e-6)
  })

  /* ───────────── part 3 ───────────── */

  it('the control: each set of Silicon Engineering’s departments rounded in one step pins some change under half a step', () => {
    const groups = groupsOf()
    const { windows } = windowsOf(groups)
    // Each atom's department (HRBP department rows are unions of atoms in the sample, 7.3a).
    const deptOf = (k: CloseKey) => {
      const out = new Map<string, string>()
      for (const a of atomsAt[k].atoms)
        if (a.businessUnit === 'Silicon Engineering' && a.department) out.set(a.atomId, a.department)
      return out
    }
    const departments = seDepartments
    expect(departments).toHaveLength(6)
    const sets = subsets(departments.map((_, i) => i))
    // The families where a department changed by 1 to 4 positions and nobody else in it did.
    const found: { who: string; width: number; truth: number; lo: number; hi: number }[] = []
    const families = new Set(windows.map((w) => w.family))
    for (const family of families) {
      const exactAt = (k: CloseKey) => {
        const depts = deptOf(k)
        const sums = new Array<number>(departments.length).fill(0)
        const seats = departments.map(() => new Map<string, Set<number>>())
        for (const o of allObs) {
          if (o.close !== k || o.family !== family) continue
          const d = depts.get(o.atom)
          const i = d ? departments.indexOf(d) : -1
          if (i < 0) continue
          sums[i] += o.exact
          for (const c of o.cells) {
            const set = seats[i].get(cellSeat[c]) ?? new Set<number>()
            set.add(c)
            seats[i].set(cellSeat[c], set)
          }
        }
        return { sums, seats }
      }
      const a = exactAt('A')
      const z = exactAt('B')
      // One step for each set's total, then department unknowns solved together.
      const bounds = (sums: readonly number[]) =>
        departments.map((_, i) => {
          const rows = sets.map((set) => {
            const v = roundCostTo(
              set.reduce((x, j) => x + sums[j], 0),
              step,
            )
            return { set, lo: v / step, hi: (v + step) / step }
          })
          return boundsFromSums(departments.length, rows, [i])
        })
      if (a.sums.every((v) => v === 0) || z.sums.every((v) => v === 0)) continue
      if (a.sums.some((v) => v < 0) || z.sums.some((v) => v < 0)) continue
      const ba = bounds(a.sums)
      const bz = bounds(z.sums)
      departments.forEach((d, i) => {
        const keys = new Set([...a.seats[i].keys(), ...z.seats[i].keys()])
        let changed = 0
        for (const s of keys) {
          const x = a.seats[i].get(s) ?? new Set<number>()
          const y = z.seats[i].get(s) ?? new Set<number>()
          if (x.size !== y.size || [...x].some((c) => !y.has(c))) changed++
        }
        if (changed < 1 || changed > 4) return
        const lo = bz[i][0] - ba[i][1]
        const hi = bz[i][1] - ba[i][0]
        const truth = (z.sums[i] - a.sums[i]) / step
        found.push({ who: `${d} (${family}, ${changed} changed)`, width: hi - lo, truth, lo, hi })
      })
    }
    found.sort((x, y) => x.width - y.width)
    expect(found.length, 'department changes of 1 to 4 positions').toBeGreaterThan(0)
    for (const f of found) expect(f.truth >= f.lo - 1e-6 && f.truth <= f.hi + 1e-6, f.who).toBe(true)
    expect(found[0].width * step, found[0].who).toBeLessThan(step / 2)
  })

  it('the control: one window’s readings made exact (± half a cent) pin a hire to under $1', () => {
    const groups = groupsOf()
    const { windows, byGroup } = windowsOf(groups)
    const hire = windows.find((w) => w.changed.some((s) => w.added.has(s) && !w.removed.has(s)))
    expect(hire, 'a window with a hire').toBeDefined()
    const w = hire as Window
    const p = groupProgram([w], byGroup.get(w.group) as Obs[], true)
    const s = w.changed.find((x) => w.added.has(x) && !w.removed.has(x)) as string
    const c = targetOf(p, [{ cells: w.added.get(s) ?? [], coef: 1 }])
    const [lo, hi] = boundsOf(p, c)
    const truth = truthOf(p, c)
    expect(truth >= lo - 1e-6 && truth <= hi + 1e-6).toBe(true)
    expect((hi - lo) * step, `${s} in ${w.group} ${w.family}`).toBeLessThan(1)
  })
})
