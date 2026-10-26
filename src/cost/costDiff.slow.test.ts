/**
 * HRBP and Leader cost against differencing (docs/PLAN.md 7.3(c), 7.8, 16.1; the template app's
 * Finance `costRounding` attacker, ported to the rounded modes). Each cost atom's filled part is
 * rounded down to the step on its own and parts are added with `sumRounded` (src/cost/guard.ts), so
 * a difference of two shown amounts says nothing finer than a step. This test plays the attacker:
 *
 *  - it reads what HRBP and Leader export, figure by figure, as the exports write it (CSV, checked
 *    cell by cell against the clipboard, the Excel cell and the slide text): every money cell is a
 *    whole step (a per-head cell a whole $1,000), and no export carries a monthly, cost-center or
 *    component amount. The long CSV (both sources: the version shown and the forecast) is read the
 *    same way, row by row and as the file writes it (`longCsvText`): every amount a whole step on a
 *    QTD, YTD or FY row of a whole union of atoms, loaded, USD, with no cost center, local amount or
 *    rate; and its control totals are whole steps, each the scope's rounded total the guard answered
 *    (never a sum of rounded rows). Its guard calls are read with the views' (`MODELS`), so its
 *    amounts are among the readings the attack uses;
 *  - it gathers, with the positions behind each (a cost drill lists them), every amount a rounded
 *    mode can read at the 31 Aug and 30 Sep 2026 closes: each atom's filled part in every field
 *    (each version's full year, year and quarter to date, the forecast, Working's asks, each bridge
 *    stage), read from the view models for the company pick with every version, comparison and
 *    period at both closes, and every pick's default scope at 30 Sep (whose exports are the ones
 *    checked above with the company's); then every scope a pick can select at either close
 *    (each pick's default, every single department and leader seat, every set of Silicon
 *    Engineering's 6 departments), each read as the shown rounded parts of its whole atoms added
 *    (`sumRounded`), exactly as the guard shows it (costLp.slow.test.ts checks that identity on every
 *    figure). A position whose amount in a field differs between the closes is a new element there;
 *  - for each field it takes every difference of two amounts whose positions differ by 1 to 4 (A
 *    minus B), every difference of three (A minus B minus C, with B and C inside A), and every swap
 *    (two amounts whose positions differ by one each way); reads what each rounded amount says; lays
 *    every interval for the same positions over each other; chains and halves the swaps; and uses
 *    "no amount is under 0";
 *  - it checks that no position's amount, nor any group of 2 to 4 positions', is ever pinned to an
 *    interval narrower than a step.
 *
 * To stay inside the slow project's time budget, the Forecast view's bridge and variance tables are
 * computed once per set of inputs for the company's reference contexts and handed to the others
 * that differ only in the shown version and the period (`memo`, checked by recomputing every so
 * often), and a stored line table is read once.
 *
 * The controls run the same attacks on exact amounts (they pin groups under 5, and positions to the
 * dollar), and on amounts rounded to the nearest step (they pin someone narrower than a step: why
 * the rounding is down). The step comes from the contexts (`ctx.guard.rules.floorUsd`).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { listsInForce } from '@/access/lists'
import { type ModePicks, NO_PICKS } from '@/access/modes'
import { type ActingAsOption, actingAsOptions } from '@/access/scopes'
import { samplePicks } from '@/access/store'
import type { Column } from '@/charts/types'
import { type AnalyticsContext, buildContext } from '@/data/context'
import { asKnownOn, cachedSample, SAMPLE_AS_OF, SAMPLE_VERSIONS, type Sample } from '@/data/sample'
import { DATASET_KEYS, type DatasetKey, type Datasets, type ISODate, type Mode } from '@/data/schema'
import { DEFAULT_FILTERS, type Filters } from '@/data/scope'
import type { SourceMeta } from '@/data/store'
import { resolveCalc } from '@/drill/calc'
import { addedStepsTo, PER_HEAD_STEP, roundCostTo, sumRoundedTo } from '@/lib/costRounding'
import { toTsv } from '@/lib/export/clipboard'
import { moneyOpts, plainText, rowFormat, visibleColumns } from '@/lib/export/columns'
import { toCsv } from '@/lib/export/csv'
import { isAmountRow, LONG_WINDOWS, longCsvText } from '@/lib/export/longCsv'
import { excelValue } from '@/lib/export/xlsx'
import { type Format, fmt } from '@/lib/format'
import { BRIDGE_STEPS, type BridgeSeat, type BridgeStepKey, priceSeat } from '@/plan/engine/bridge'
import type { AnyVersion, PlanLine, PlanState } from '@/plan/types'
import { financeModel } from '@/views/finance/engine'
import { longCsvOf, longMetaOf } from '@/views/finance/engine/longCsv'
import { forecastModel } from '@/views/forecast/engine'
import { type FPrep, prepare as forecastPrep } from '@/views/forecast/engine/base'
import { bridgeSeatsOf } from '@/views/forecast/engine/bridge'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { homeModel } from '@/views/home/engine'
import { planModel } from '@/views/plan/engine'
import { closeLinesOf, managerOfIn, versionLinesOf } from '@/views/plan/engine/core'
import { costIdsOf, fitOf, membersOf } from '@/views/plan/engine/guarded'
import { requestsModel } from '@/views/requests/engine'
import { targetsModel } from '@/views/targets/engine'
import { workingFrame, workingLines } from '@/views/targets/engine/working'
import { type AtomIndex, atomOf, isUnionOfAtoms, leaderSeats } from './atoms'
import {
  COST_COMPONENTS,
  type CostMember,
  type GuardedFigure,
  type GuardInput,
  memberIdOf,
  partOfBasis,
} from './guard'

/** The widest group an attack tries to single out. */
const SMALL = 4

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
  /** The forecast windows drawn (the memo's mocks record them; unused here). */
  windows: [] as { prep: FPrep; months: readonly string[] }[],
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

/* ───────────── the two closes (as costLp.slow.test.ts reads them) ───────────── */

type CloseKey = 'A' | 'B'
const CLOSES: readonly CloseKey[] = ['A', 'B']

interface Close {
  key: CloseKey
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

function closeOf(s: Sample, key: CloseKey): Close {
  if (key === 'B')
    return {
      key,
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
  const madeBy = (id: string) => (SAMPLE_VERSIONS.find((v) => v.versionId === id)?.setOn ?? date) <= date
  const plan: PlanState = {
    ...s.plan,
    closes: s.plan.closes.filter((c) => c.month <= '2026-08'),
    versions: s.plan.versions.filter((v) => madeBy(v.versionId)),
    cycles: s.plan.cycles.filter((cy) => cy.openedAt.slice(0, 10) <= date),
  }
  return { key, lastMonth: '2026-08', data, plan, asOfOverride: date, sources: sourcesOf(data) }
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

const QUARTER_STARTS = ['-04', '-07', '-10', '-01']

/** A window as the same field at either close: fy, ytd or qtd to the last close, else its months. */
function windowOf(months: readonly string[], lastMonth: string): string {
  const ms = [...new Set(months)].sort()
  const first = ms[0] ?? ''
  const end = ms[ms.length - 1] ?? ''
  if (ms.length === 12 && first.endsWith('-04')) return `fy:${first}`
  if (first.endsWith('-04') && end === lastMonth) return 'ytd'
  if (ms.length <= 3 && QUARTER_STARTS.some((q) => first.endsWith(q)) && end === lastMonth) return 'qtd'
  return `${first}..${end}`
}

/** A field: the line sources a reading reads, and its window. */
function fieldOf(lines: readonly PlanLine[], lastMonth: string): string {
  const srcs = new Set<string>()
  const months: string[] = []
  for (const l of lines) {
    srcs.add(sourceOf.get(l) ?? `other:${l.versionId}`)
    months.push(l.month)
  }
  return `${[...srcs].sort().join('+')}|${windowOf(months, lastMonth)}`
}

/* ───────────── what each atom shows ───────────── */

/** One atom's filled part in one field at one close: its positions' amounts and its reading. */
interface AtomReading {
  close: CloseKey
  atom: string
  field: string
  /** Each position's amount in the field (USD over the window). */
  amounts: ReadonlyMap<string, number>
  exact: number
  /** The rounded part. */
  lo: number
}

const readings = new Map<string, AtomReading>()
const identity: string[] = []

function harvest(close: Close, label: string): void {
  for (const { input, out } of rec.calls) {
    if (input.mode !== 'rounded' || out.total.totalUsd == null) continue
    const step = input.rules.floorUsd
    const byAtom = new Map<string, CostMember[]>()
    for (const m of input.members) {
      if (m.atomId == null) continue
      const list = byAtom.get(m.atomId)
      if (list) list.push(m)
      else byAtom.set(m.atomId, [m])
    }
    const parts: number[] = []
    for (const [atom, list] of byAtom) {
      const people = new Set<string>()
      for (const m of list) if (m.part === 'filled') for (const p of m.people) people.add(p)
      if (people.size < input.rules.minCosted) continue
      const filled = list.filter((m) => m.part === 'filled')
      if (!filled.length) continue
      const lines: PlanLine[] = []
      const amounts = new Map<string, number>()
      let exact = 0
      for (const m of filled) {
        exact += m.amounts.loaded
        amounts.set(m.positionId, (amounts.get(m.positionId) ?? 0) + m.amounts.loaded)
        lines.push(...linesOfMember(m))
      }
      const lo = roundCostTo(exact, step)
      parts.push(lo)
      const field = fieldOf(lines, close.lastMonth)
      const key = `${close.key}|${atom}|${field}`
      if (!readings.has(key)) readings.set(key, { close: close.key, atom, field, amounts, exact, lo })
    }
    if (out.total.amounts.loaded !== sumRoundedTo(parts, step))
      identity.push(`${label}: ${out.total.amounts.loaded} is not the sum of its atoms' filled parts`)
  }
}

/* ───────────── the bridge's stage parts ───────────── */

const ATOM_OF_COHORT = /^cohort:[^|]*\|[^|]*\|([^|]*)\|(.*)$/

function partAt(seat: BridgeSeat, stage: number): 'filled' | 'band' {
  const m = ATOM_OF_COHORT.exec(seat.positionId)
  if (m) return m[1] === 'band' ? 'band' : 'filled'
  const payRateAt = BRIDGE_STEPS.indexOf('payRate') + 1
  const side = stage >= payRateAt ? (seat.forecast ?? seat.comparison) : (seat.comparison ?? seat.forecast)
  return side?.basis === 'band' ? 'band' : 'filled'
}

/** The bridge's stages: nothing from the forecast, then each driver in order added to the last. */
const STAGES: ReadonlySet<BridgeStepKey>[] = [new Set()]
for (const step of BRIDGE_STEPS) STAGES.push(new Set([...(STAGES.at(-1) ?? []), step]))

/** The company bridge's per-atom filled stage parts against a comparison, over the full year and the year to date. */
function bridgeReadings(close: Close, p: FPrep, step: number): void {
  const ctx = p.ctx
  const v = p.comparison as AnyVersion
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
  const a = counted(membersOf(ctx, versionLinesOf(ctx, v), p.fyMonths, costIdsOf(ctx)))
  const b = counted(membersOf(ctx, p.costLines, p.fyMonths, costIdsOf(ctx)))
  const kept = new Set(
    [...a.keys()].filter((x) => (a.get(x)?.size ?? 0) >= min && (b.get(x)?.size ?? 0) >= min),
  )
  const managerOf = managerOfIn(ctx)
  const seats = bridgeSeatsOf(p)
  for (const months of [p.fyMonths, p.ytdMonths]) {
    if (!months.length) continue
    const window = windowOf(months, close.lastMonth)
    STAGES.forEach((from, k) => {
      const byAtom = new Map<string, Map<string, number>>()
      for (const s of seats) {
        const c = ATOM_OF_COHORT.exec(s.positionId)
        const atom = c ? (c[2] === 'none' ? null : c[2]) : atomOf(s.positionId, ctx.guard.atoms, managerOf)
        if (!atom || !kept.has(atom) || partAt(s, k) !== 'filled') continue
        const m = byAtom.get(atom) ?? new Map<string, number>()
        m.set(s.positionId, (m.get(s.positionId) ?? 0) + priceSeat(s, from, months))
        byAtom.set(atom, m)
      }
      for (const [atom, amounts] of byAtom) {
        let exact = 0
        for (const x of amounts.values()) exact += x
        const field = `bridge:${v.versionId}:${k}|${window}`
        const key = `${close.key}|${atom}|${field}`
        if (!readings.has(key))
          readings.set(key, { close: close.key, atom, field, amounts, exact, lo: roundCostTo(exact, step) })
      }
    })
  }
}

/* ───────────── what the exports say ───────────── */

/** One CSV line into cells (quotes doubled, fields quoted when needed). */
function csvCells(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') quoted = false
      else cur += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}

/** A slide's money text as a number ("$12.3M", "−$0.4M", "$1.2K", "$950"); "under $0.1M" is [0, step). */
function slideMoney(text: string): number | 'under' | null {
  if (text === '' || text === '—') return null
  if (text.startsWith('under ')) return 'under'
  const m = /^([−+]?)\$([\d,]+(?:\.\d+)?)([KMB]?)$/.exec(text)
  if (!m) return null
  const scale = m[3] === 'M' ? 1e6 : m[3] === 'K' ? 1e3 : m[3] === 'B' ? 1e9 : 1
  return (m[1] === '−' ? -1 : 1) * Math.round(Number(m[2].replace(/,/g, '')) * scale)
}

const COMPONENT_KEY = new RegExp(`^(${COST_COMPONENTS.join('|')})(Usd|Local)?$`, 'i')
const MONTH_KEY = /^\d{4}-\d{2}$/
const COST_CENTER = /^\d{4}-[A-Z]{3}$/

interface ExportCheck {
  figures: number
  cells: number
  problems: string[]
}

/** Every figure a model holds (tabs are getters; calculation cards are built on click). */
function figuresIn(
  v: unknown,
  out: { id: string; rows: readonly Record<string, unknown>[]; columns: readonly Column[] }[],
  seen = new Set<unknown>(),
  depth = 0,
): void {
  if (v == null || typeof v !== 'object' || seen.has(v) || depth > 9) return
  seen.add(v)
  if (Array.isArray(v)) {
    for (const x of v) figuresIn(x, out, seen, depth + 1)
    return
  }
  const o = v as Record<string, unknown>
  if (Array.isArray(o.columns) && Array.isArray(o.rows) && typeof o.id === 'string')
    out.push({ id: o.id, rows: o.rows as Record<string, unknown>[], columns: o.columns as Column[] })
  for (const [k, x] of Object.entries(o)) {
    if (k === 'ctx' || k === 'uses' || k === 'rows') continue
    if ((k === 'calc' || k === 'deltaCalc') && typeof x === 'function' && x.length === 0) {
      try {
        figuresIn(resolveCalc(x as () => null), out, seen, depth + 1)
      } catch {
        // A card that cannot be built shows nothing.
      }
    } else figuresIn(x, out, seen, depth + 1)
  }
}

/**
 * The money cells of a figure as HRBP and Leader export it: the CSV (the number), checked against
 * the clipboard, the Excel cell and the slide's text; every amount a whole step, no monthly,
 * cost-center or component amount.
 */
function checkExport(
  fig: { id: string; rows: readonly Record<string, unknown>[]; columns: readonly Column[] },
  ctx: AnalyticsContext,
  step: number,
  into: ExportCheck,
): void {
  const money = moneyOpts({
    showPay: ctx.showPay,
    showCost: ctx.showCost,
    showBand: ctx.access.can('cost:band'),
  })
  const cols = visibleColumns(fig.columns, { pay: money.showPay, cost: money.showCost, band: money.showBand })
  const table = { columns: fig.columns, rows: fig.rows }
  const csv = toCsv(table, { ...money, bom: false })
    .split('\r\n')
    .filter(Boolean)
  const tsv = toTsv(table, money).split(/\r?\n/).filter(Boolean)
  const head = csvCells(csv[0])
  into.figures++
  fig.rows.forEach((row, i) => {
    const cells = csvCells(csv[i + 1] ?? '')
    const tcells = (tsv[i + 1] ?? '').split('\t')
    for (const c of cols) {
      if (c.pay) {
        if (row[c.key] != null) into.problems.push(`${fig.id} ${c.key}: a pay column in a rounded mode`)
        continue
      }
      if (!c.cost || c.band) continue
      const v = row[c.key]
      const format = (rowFormat(c, row) ?? 'int') as Format
      if (typeof v !== 'number' || !['money', 'moneyM', 'moneyFull'].includes(format)) continue
      into.cells++
      const where = `${fig.id} ${c.key} row ${i}`
      const at = head.indexOf(c.label)
      const text = plainText(v, c.format, row)
      if (at < 0 || cells[at] !== text) into.problems.push(`${where}: CSV ${cells[at]} vs ${text}`)
      if (tcells[at] !== text) into.problems.push(`${where}: clipboard ${tcells[at]} vs ${text}`)
      const xl = excelValue(v, format)
      if (xl !== Number(text)) into.problems.push(`${where}: Excel ${String(xl)} vs ${text}`)
      const slide = slideMoney(fmt(v, format))
      if (slide !== 'under' && slide !== null && Math.abs(slide - v) > 0.5)
        into.problems.push(`${where}: slide ${fmt(v, format)} vs ${v}`)
      // Every amount a whole step (a per-head amount a whole $1,000), and nothing finer.
      const perHead = /perHead/i.test(c.key)
      const unit = perHead ? PER_HEAD_STEP : step
      if (Math.abs(v / unit - Math.round(v / unit)) > 1e-9)
        into.problems.push(`${where}: ${v} is not a whole ${unit}`)
      if (COMPONENT_KEY.test(c.key)) into.problems.push(`${where}: a component amount`)
      const month = typeof row.month === 'string' && MONTH_KEY.test(row.month)
      if (month) into.problems.push(`${where}: a monthly amount (${String(row.month)})`)
      const label = String(row.label ?? row.group ?? row.key ?? '')
      if (
        COST_CENTER.test(label) ||
        (typeof row.costCenter === 'string' && row.costCenter !== '' && !row.businessUnit)
      )
        into.problems.push(`${where}: a cost-center amount (${label})`)
    }
  })
}

/* ───────────── the attack (the template's, over positions) ───────────── */

type Interval = [number, number]

interface SetRec {
  idx: Int32Array
  bits: Uint32Array
  /** What the readings say about the set's sum, in USD: [lo, hi). */
  bound: Interval
}

const meet = (a: Interval | undefined, b: Interval): Interval =>
  a ? [Math.max(a[0], b[0]), Math.min(a[1], b[1])] : b

/** The one element each of two sets of the same size holds that the other does not, else null. */
function oneApart(a: Int32Array, b: Int32Array): [number, number] | null {
  let i = 0
  let j = 0
  let p = -1
  let q = -1
  while (i < a.length || j < b.length) {
    if (j >= b.length || (i < a.length && a[i] < b[j])) {
      if (p >= 0) return null
      p = a[i++]
    } else if (i >= a.length || b[j] < a[i]) {
      if (q >= 0) return null
      q = b[j++]
    } else {
      i++
      j++
    }
  }
  return p >= 0 && q >= 0 ? [p, q] : null
}

/**
 * Every 1 to 4 elements a difference of two or three amounts singles out, and what it says; then
 * swaps chained and halved against those, and "no amount is under 0", laid over each other three times.
 */
function attack(
  sets: readonly SetRec[],
  n: number,
): { bounds: Map<string, Interval>; pairs: number; triples: number; swaps: number } {
  const words = Math.ceil(n / 32)
  const has = (bits: Uint32Array, i: number) => (bits[i >>> 5] & (1 << (i & 31))) !== 0
  const inside = (b: SetRec, a: SetRec) => {
    for (let w = 0; w < words; w++) if ((b.bits[w] & ~a.bits[w]) !== 0) return false
    return true
  }
  const bounds = new Map<string, Interval>()
  let pairs = 0
  let triples = 0
  const note = (rest: number[], lo: number, hi: number) => {
    const key = rest.join(',')
    bounds.set(key, meet(bounds.get(key), [lo, hi]))
  }
  const left = (a: SetRec, out: readonly SetRec[]) => {
    const rest: number[] = []
    for (const i of a.idx) if (!out.some((o) => has(o.bits, i))) rest.push(i)
    return rest
  }
  const bySize = [...sets].sort((x, y) => x.idx.length - y.idx.length)
  for (let j = 0; j < bySize.length; j++) {
    const a = bySize[j]
    const within: SetRec[] = []
    for (let k = 0; k < j; k++) {
      const b = bySize[k]
      if (b.idx.length < a.idx.length && inside(b, a)) within.push(b)
    }
    const sized = new Map<number, SetRec[]>()
    for (const b of within) sized.set(b.idx.length, [...(sized.get(b.idx.length) ?? []), b])
    for (const b of within) {
      const gap = a.idx.length - b.idx.length
      if (gap >= 1 && gap <= SMALL) {
        pairs++
        note(left(a, [b]), a.bound[0] - b.bound[1], a.bound[1] - b.bound[0])
      }
      for (let k = 1; k <= SMALL; k++)
        for (const c of sized.get(a.idx.length - b.idx.length - k) ?? []) {
          if (c === b || c.idx[0] < b.idx[0]) continue
          let apart = true
          for (let w = 0; w < words && apart; w++) if (b.bits[w] & c.bits[w]) apart = false
          if (!apart) continue
          triples++
          note(left(a, [b, c]), a.bound[0] - b.bound[1] - c.bound[1], a.bound[1] - b.bound[0] - c.bound[0])
        }
    }
  }
  // Swaps: two amounts over the same elements but one each (A holds p, B holds q) give x_p − x_q.
  const swapped = new Map<string, Interval>()
  let swaps = 0
  const sameSize = new Map<number, SetRec[]>()
  for (const a of sets) sameSize.set(a.idx.length, [...(sameSize.get(a.idx.length) ?? []), a])
  for (const list of sameSize.values())
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const one = oneApart(list[i].idx, list[j].idx)
        if (!one) continue
        swaps++
        const key = `${one[0]},${one[1]}`
        swapped.set(
          key,
          meet(swapped.get(key), [list[i].bound[0] - list[j].bound[1], list[i].bound[1] - list[j].bound[0]]),
        )
      }
  for (let round = 0; round < 3; round++) {
    for (const [key, d] of swapped) {
      const [p, q] = key.split(',')
      const both = [Number(p), Number(q)].sort((x, y) => x - y).join(',')
      const P = bounds.get(p)
      const Q = bounds.get(q)
      const S = bounds.get(both)
      if (Q) bounds.set(p, meet(bounds.get(p), [Q[0] + d[0], Q[1] + d[1]]))
      if (P) bounds.set(q, meet(bounds.get(q), [P[0] - d[1], P[1] - d[0]]))
      if (S) {
        bounds.set(p, meet(bounds.get(p), [(S[0] + d[0]) / 2, (S[1] + d[1]) / 2]))
        bounds.set(q, meet(bounds.get(q), [(S[0] - d[1]) / 2, (S[1] - d[0]) / 2]))
      }
    }
    for (const [k, b] of bounds) bounds.set(k, meet(b, [0, Number.POSITIVE_INFINITY]))
  }
  return { bounds, pairs, triples, swaps }
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

/** Long CSV rows, amounts and control totals checked, and what broke 7.3 in them. */
const longChecks = { rows: 0, amounts: 0, cells: 0, totals: 0, problems: [] as string[] }

/**
 * A rounded mode's long CSV of each source, as its rows hold it and as the file writes it: every
 * amount a whole step of a QTD, YTD or FY row (`LONG_WINDOWS`), component 'loaded', no cost center
 * or account, USD, no local amount or rate; every row with no amount says why; each control total a
 * whole step equal to one of the scope totals the guard answered in the crawl (`totals`).
 */
function checkLong(ctx: AnalyticsContext, step: number, totals: ReadonlySet<number>, label: string): void {
  const say = (what: string) => {
    if (longChecks.problems.length < 40) longChecks.problems.push(`${label}: ${what}`)
  }
  const windows: ReadonlySet<string> = new Set(LONG_WINDOWS)
  for (const source of ['version', 'forecast'] as const) {
    const m = longCsvOf(ctx, { source })
    if (!m.rows.length) continue
    for (const r of m.rows) {
      longChecks.rows++
      if (!isAmountRow(r)) {
        say(`a ${source} row with no amount columns`)
        continue
      }
      const where = `${source} ${r.period} ${r.org} ${r.costCenter}`
      if (r.amountUsd == null) {
        if (r.suppressed !== 'Yes' || !r.suppressedReason) say(`${where}: an empty amount with no reason`)
        continue
      }
      longChecks.amounts++
      if (!windows.has(r.period)) say(`${where}: a monthly amount`)
      if (r.component !== 'loaded') say(`${where}: a ${r.component} component amount`)
      if (r.costCenter !== '' || r.account !== '') say(`${where}: a cost-center or account amount`)
      if (r.currency !== 'USD' || r.amountLocal !== null || r.rate !== null)
        say(`${where}: a ${r.currency} or local amount`)
      if (Math.abs(r.amountUsd / step - Math.round(r.amountUsd / step)) > 1e-9)
        say(`${where}: ${r.amountUsd} is not a whole step`)
    }
    for (const t of m.totals) {
      if (t.loadedUsd == null) continue
      longChecks.totals++
      if (Math.abs(t.loadedUsd / step - Math.round(t.loadedUsd / step)) > 1e-9)
        say(`${source} control total ${t.period}: ${t.loadedUsd} is not a whole step`)
      if (!totals.has(t.loadedUsd))
        say(`${source} control total ${t.period}: ${t.loadedUsd} is no scope total`)
      if (t.usdByComponent !== null) say(`${source} control total ${t.period}: components`)
    }
    // The file as written: the column row, then every row's cells.
    const v = ctx.version
    if (!v || !m.plan) continue
    const text = longCsvText(
      m.rows,
      { ...longMetaOf(ctx, v, source), plan: m.plan },
      { mode: m.mode, totals: m.totals },
    )
    const lines = text.replace(/^\uFEFF/, '').split('\r\n')
    const at = lines.findIndex((l) => l.startsWith('period,org,costCenter,'))
    if (at < 0) {
      say(`${source}: no column row in the file`)
      continue
    }
    const head = csvCells(lines[at])
    const col = (k: string) => head.indexOf(k)
    for (const line of lines.slice(at + 1)) {
      if (!line) continue
      const cells = csvCells(line)
      const amount = ['amountLocal', 'rate', 'amountUsd'].some((k) => cells[col(k)] !== '')
      if (!amount) continue
      longChecks.cells++
      const period = cells[col('period')]
      const where = `${source} file ${period} ${cells[col('org')]}`
      if (!windows.has(period)) say(`${where}: a monthly amount in the file`)
      if (cells[col('costCenter')] !== '') say(`${where}: a cost-center amount in the file`)
      if (cells[col('component')] !== 'loaded') say(`${where}: a component amount in the file`)
      if (cells[col('currency')] !== 'USD' || cells[col('amountLocal')] !== '' || cells[col('rate')] !== '')
        say(`${where}: a local amount in the file`)
      const usd = Number(cells[col('amountUsd')])
      if (!Number.isFinite(usd) || Math.abs(usd / step - Math.round(usd / step)) > 1e-9)
        say(`${where}: ${cells[col('amountUsd')]} is not a whole step`)
    }
  }
}

/* ───────────── the test ───────────── */

describe('HRBP and Leader cost amounts, rounded down per atom, against differencing (7.3c)', () => {
  let step = 0
  const closes = {} as Record<CloseKey, Close>
  const atomsAt = {} as Record<CloseKey, AtomIndex>
  /** Each scope's atoms, by close (only whole unions show cost). */
  const scopeAtoms: Record<CloseKey, Map<string, string[]>> = { A: new Map(), B: new Map() }
  const exports: ExportCheck = { figures: 0, cells: 0, problems: [] }
  let contexts = 0
  /** The observations per field: each scope's reading, as a set of elements. */
  const fields = new Map<
    string,
    {
      close: CloseKey
      scope: string
      elements: string[]
      lo: number
      hi: number
      exact: number
      parts: number
    }[]
  >()
  const elementValue = new Map<string, number>()

  beforeAll(() => {
    const sample = cachedSample()
    for (const key of CLOSES) {
      const c = closeOf(sample, key)
      closes[key] = c
      const base = { ...NO_PICKS, ...samplePicks(sample.personas) }
      const ctx0 = ctxAt(c, 'leader', base)
      step = ctx0.guard.rules.floorUsd
      atomsAt[key] = ctx0.guard.atoms
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
      const ceo = picks.find((p) => p.mode === 'leader' && p.option.company) as Pick
      const company = ctxAt(c, 'leader', ceo.picks)
      tagSources(company)
      const crawl = (ctx: AnalyticsContext, label: string, exportsToo: boolean) => {
        rec.calls.length = 0
        rec.on = true
        const figs: { id: string; rows: readonly Record<string, unknown>[]; columns: readonly Column[] }[] =
          []
        try {
          for (const model of MODELS) figuresIn(model(ctx), figs)
        } finally {
          rec.on = false
        }
        contexts++
        harvest(c, label)
        const totals = new Set<number>()
        for (const { out } of rec.calls) if (out.total.totalUsd != null) totals.add(out.total.totalUsd)
        rec.calls.length = 0
        if (exportsToo) {
          for (const f of figs) checkExport(f, ctx, step, exports)
          checkLong(ctx, step, totals, label)
        }
      }
      // The company with every version, comparison and period (each resolved combination once).
      const combos: CtxOpts[] = [{}]
      for (const v of company.versions) {
        if (v.state === 'retired') continue
        const locked = company.versions.filter((x) => x.state === 'locked' && x.fiscalYear === v.fiscalYear)
        for (const cmp of [null, 'target', ...locked.map((x) => x.versionId)])
          combos.push({ version: v.versionId, compare: cmp })
      }
      // Their bridge and variance repeat across the shown versions of a year and the periods: kept.
      memo.keep = true
      const resolved = new Set<string>()
      for (const combo of combos)
        for (const period of ['fy', 'ytd', 'qtd'] as const) {
          const ctx = ctxAt(c, 'leader', ceo.picks, { ...combo, filters: { period } })
          const k = `${ctx.version?.versionId ?? ''}|${ctx.compare.kind === 'version' ? ctx.compare.versionId : 'target'}|${period}`
          if (resolved.has(k)) continue
          resolved.add(k)
          const p = forecastPrep(ctx)
          if (p.comparison && p.run && period === 'fy') bridgeReadings(c, p, step)
          crawl(ctx, `${key} company ${k}`, true)
        }
      memo.keep = false
      memo.clear()
      // Every pick's default scope (its exports too), and every scope a pick can select.
      const departmentsIn = (ctx: AnalyticsContext): string[] =>
        [...new Set(ctx.data.positions.map((r) => r.department ?? '').filter(Boolean))].sort()
      const leadersIn = (ctx: AnalyticsContext): string[] => {
        const ids = new Set(ctx.data.positions.map((r) => r.positionId))
        return [...leaderSeats(ctx.all.positions, ctx.asOf)].filter((id) => ids.has(id)).sort()
      }
      const scope = (ctx: AnalyticsContext, label: string) => {
        const ids = costIdsOf(ctx)
        const managerOf = managerOfIn(ctx)
        if (!ids.size || !isUnionOfAtoms(ids, ctx.guard.atoms, managerOf)) return
        const atoms = [
          ...new Set([...ids].map((id) => atomOf(id, ctx.guard.atoms, managerOf) as string)),
        ].sort()
        scopeAtoms[key].set(label, atoms)
      }
      for (const p of picks) {
        const ctx = ctxAt(c, p.mode, p.picks)
        if (key === 'B') crawl(ctx, `${key} ${p.mode} ${p.option.pick.name}`, true)
        scope(ctx, `${p.mode} ${p.option.pick.name}`)
        for (const d of departmentsIn(ctx))
          scope(
            ctxAt(c, p.mode, p.picks, { filters: { department: [d] } }),
            `${p.mode} ${p.option.pick.name} ${d}`,
          )
        for (const l of leadersIn(ctx))
          scope(
            ctxAt(c, p.mode, p.picks, { filters: { leaderId: l } }),
            `${p.mode} ${p.option.pick.name} leader ${l}`,
          )
      }
      const se = picks.find((p) => p.mode === 'hrbp' && p.option.pick.unit === 'Silicon Engineering') as Pick
      const seDepartments = departmentsIn(ctxAt(c, se.mode, se.picks))
      for (const set of subsets(seDepartments))
        scope(ctxAt(c, se.mode, se.picks, { filters: { department: set } }), `SE ${set.join(' + ')}`)
    }

    // Each scope's reading in each field: its atoms' shown parts, added (`sumRounded`), at each close.
    const byField = new Map<string, Map<CloseKey, Map<string, AtomReading>>>()
    for (const r of readings.values()) {
      let f = byField.get(r.field)
      if (!f) {
        f = new Map()
        byField.set(r.field, f)
      }
      const at = f.get(r.close) ?? new Map<string, AtomReading>()
      at.set(r.atom, r)
      f.set(r.close, at)
    }
    for (const [field, at] of byField)
      for (const close of CLOSES) {
        const atoms = at.get(close)
        if (!atoms) continue
        const seen = new Set<string>()
        for (const [scope, list] of scopeAtoms[close]) {
          const parts = list.map((a) => atoms.get(a)).filter((r): r is AtomReading => r != null)
          if (!parts.length) continue
          const k = parts.map((r) => r.atom).join(',')
          if (seen.has(k)) continue
          seen.add(k)
          const elements: string[] = []
          let exact = 0
          for (const r of parts) {
            exact += r.exact
            for (const [pos, v] of r.amounts) {
              const e = `${pos}|${Math.round(v * 100)}`
              elementValue.set(`${field}|${e}`, v)
              elements.push(e)
            }
          }
          const v = sumRoundedTo(
            parts.map((r) => r.lo),
            step,
          )
          const added = addedStepsTo(parts.filter((r) => r.lo >= step).length, step)
          const into = fields.get(field) ?? []
          into.push({
            close,
            scope,
            elements,
            lo: v - added,
            hi: v - added + parts.length * step,
            exact,
            parts: parts.length,
          })
          fields.set(field, into)
        }
      }
  }, 900_000)

  /** The attack over every field, each reading read through `range`. */
  function run(range: (o: { lo: number; hi: number; exact: number; parts: number }) => Interval) {
    let pairs = 0
    let triples = 0
    let swaps = 0
    let narrowest = { width: Number.POSITIVE_INFINITY, who: '' }
    let singles = 0
    /** Groups of 1 to 4 elements the attack bounds. */
    let groups = 0
    const pinned: string[] = []
    const unsound: string[] = []
    for (const [field, obs] of fields) {
      const index = new Map<string, number>()
      for (const o of obs) for (const e of o.elements) if (!index.has(e)) index.set(e, index.size)
      const n = index.size
      const words = Math.ceil(n / 32)
      const byKey = new Map<string, SetRec>()
      for (const o of obs) {
        const idx = Int32Array.from(o.elements.map((e) => index.get(e) as number)).sort()
        const k = idx.join(',')
        const r = range(o)
        const had = byKey.get(k)
        if (had) had.bound = meet(had.bound, r)
        else {
          const bits = new Uint32Array(words)
          for (const i of idx) bits[i >>> 5] |= 1 << (i & 31)
          byKey.set(k, { idx, bits, bound: r })
        }
      }
      const res = attack([...byKey.values()], n)
      pairs += res.pairs
      triples += res.triples
      swaps += res.swaps
      const names = [...index.keys()]
      for (const [key, b] of res.bounds) {
        const who = key.split(',').map((i) => names[Number(i)])
        groups++
        if (who.length === 1) singles++
        const truth = who.reduce((a, e) => a + (elementValue.get(`${field}|${e}`) ?? 0), 0)
        // The attack is sound: the truth is inside what it derives.
        if (truth < b[0] - 1e-6 || truth > b[1] + 1e-6)
          unsound.push(`${who.join(' + ')} ${field}: ${truth} not in ${b}`)
        if (b[1] - b[0] < 1) pinned.push(`${who.join(' + ')} (${field})`)
        if (b[1] - b[0] < narrowest.width)
          narrowest = { width: b[1] - b[0], who: `${who.join(' + ')} (${field})` }
      }
    }
    return { pairs, triples, swaps, narrowest, singles, groups, pinned, unsound }
  }

  it('reads every export as whole steps, with no monthly, cost-center or component amount', () => {
    expect(contexts).toBeGreaterThan(100)
    expect(exports.figures).toBeGreaterThan(1000)
    expect(exports.cells).toBeGreaterThan(1000)
    expect(exports.problems).toEqual([])
    // The long CSV, as rows and as the file writes them, and its control totals (M4).
    expect(longChecks.problems).toEqual([])
    expect(longChecks.rows).toBeGreaterThan(10_000)
    expect(longChecks.amounts).toBeGreaterThan(100)
    expect(longChecks.cells).toBe(longChecks.amounts)
    expect(longChecks.totals).toBeGreaterThan(50)
    expect(identity).toEqual([])
    // The company's bridge and variance were handed between its contexts with the same inputs, and checked.
    expect(memo.hits).toBeGreaterThan(0)
    expect(memo.checked).toBeGreaterThan(0)
  })

  it('gathers every field at both closes, and every scope as its atoms’ shown parts', () => {
    expect(readings.size).toBeGreaterThan(1000)
    expect(scopeAtoms.A.size).toBeGreaterThan(100)
    expect(scopeAtoms.B.size).toBeGreaterThan(100)
    // Each reading is its parts, each rounded down, added: the attacker reads each one right.
    let multi = 0
    for (const list of fields.values())
      for (const o of list) {
        expect(o.exact >= o.lo - 1e-6 && o.exact < o.hi + 1e-6, `${o.scope} ${o.close}`).toBe(true)
        if (o.parts > 1) multi++
      }
    expect(multi).toBeGreaterThan(100)
  })

  it('no difference of two or three amounts, or swap, pins a position’s amount closer than half a step either side', () => {
    const r = run((o) => [o.lo, o.hi])
    expect(r.unsound).toEqual([])
    // The attack finds real differences across scopes and closes, and bounds groups of 1 to 4.
    // Change C33 (review RF-4): Working's asks read the closed months from the closes, as every other
    // figure does, so Working's own recomputed closed months (the asks field, where the attack used to
    // single out one position between the two closes) are no longer read anywhere; the groups it
    // bounds now are of 2 to 4 positions, each still no narrower than a step.
    expect(r.pairs).toBeGreaterThan(100)
    expect(r.triples).toBeGreaterThan(100)
    expect(r.groups, 'differences that single out 1 to 4 positions').toBeGreaterThan(0)
    expect(r.narrowest.width, r.narrowest.who).toBeGreaterThanOrEqual(step - 1e-6)
  })

  it('the control: the same attacks on exact amounts pin positions to the dollar', () => {
    const r = run((o) => [o.exact - 0.01, o.exact + 0.01])
    expect(r.unsound).toEqual([])
    // On exact amounts the same attacks pin groups of 1 to 4 positions to the dollar in each locked
    // version's full year (before C33 also in Working's asks field, which no figure reads now, RF-4).
    expect(r.pinned.length, 'groups of 1 to 4 positions pinned to under $1').toBeGreaterThan(0)
    for (const v of ['own:fy27-budget', 'own:fy27-q1-reforecast'])
      expect(
        r.pinned.some((x) => x.includes(`(${v}|`)),
        `a group pinned in ${v}`,
      ).toBe(true)
  })

  it('why down and not to the nearest: to the nearest step, the same attacks pin some amount narrower than a step', () => {
    // Each amount rounded in one step to the nearest (the template's `nearestRange`): what it says.
    const r = run((o) => {
      const v = o.exact < step ? 0 : Math.round(o.exact / step) * step
      return v === 0 ? [0, step] : v === step ? [step, step * 1.5] : [v - step / 2, v + step / 2]
    })
    expect(r.narrowest.width, r.narrowest.who).toBeLessThan(step)
  })
})
