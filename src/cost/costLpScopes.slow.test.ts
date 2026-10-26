/**
 * HRBP and Leader cost over the bounded scope list (docs/PLAN.md 7.3(d) part 1, union identity; the
 * sibling of costLp.slow.test.ts, which holds parts 2 and 3 and the reference figures). At the
 * 30 Sep 2026 close, every view model that can show cost in a rounded mode is built, calculation
 * cards included, for every HRBP and leader pick's default scope, then for every single department
 * and leader seat a pick can select, every set of Silicon Engineering's 6 departments and 200 seeded
 * multi-selects of departments and leaders mixing Include and Exclude (a scope whose mode and cost
 * selection a crawled one has is read once). For every figure:
 *  - its shown amounts are `sumRounded` of its atoms' rounded filled and band parts, each part the
 *    atom's own rounded value (union identity), and every atom part it reads is the same atom part
 *    (the same cells) every other figure of that field reads: no scope reaches part of an atom;
 *  - the bridge's stage totals are `sumRounded` of the company's per-atom stage parts;
 *  - a displayed difference is a difference of rounded totals, or a band figure.
 * And every atom part a selected scope reads is one a pick's default scope (or the company) reads,
 * so the programs of costLp.slow.test.ts, which hold every default scope's readings, hold every
 * scope's: "the per-atom parts are then the most any reachable scope reveals" (7.3(d)).
 *
 * The scope list sits apart from costLp.slow.test.ts so each file stays inside the slow project's
 * time budget: every scope builds every view model again. The guard's entry points are wrapped as
 * there (`costMembersOf`, `guardModel`, `guardedDifference`, the bridge's windows), and a stored
 * line table is read once per table.
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
import { BRIDGE_STEPS, type BridgeSeat, type BridgeStepKey, priceSeat } from '@/plan/engine/bridge'
import type { AnyVersion, PlanLine, PlanState } from '@/plan/types'
import { financeModel } from '@/views/finance/engine'
import { forecastModel } from '@/views/forecast/engine'
import { type FPrep, prepare as forecastPrep } from '@/views/forecast/engine/base'
import { bridgeSeatsOf, bridgeWindow } from '@/views/forecast/engine/bridge'
import { forecastRunOf } from '@/views/forecast/engine/run'
import { homeModel } from '@/views/home/engine'
import { planModel } from '@/views/plan/engine'
import { closeLinesOf, managerOfIn, versionLinesOf } from '@/views/plan/engine/core'
import { costIdsOf, membersOf } from '@/views/plan/engine/guarded'
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

vi.mock('@/views/forecast/engine/bridge', async (orig) => {
  const m = await orig<typeof import('@/views/forecast/engine/bridge')>()
  return {
    ...m,
    bridgeRows: (p: FPrep) => {
      if (rec.on) rec.windows.push({ prep: p, months: p.fyMonths })
      return m.bridgeRows(p)
    },
    fxEffectOf: (p: FPrep, months: readonly string[]) => {
      if (rec.on) rec.windows.push({ prep: p, months })
      return m.fxEffectOf(p, months as never)
    },
  }
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
/** Whether the selected scopes are being read, and the atom parts first read there (none expected). */
const phase = { scope: false, scopeOnly: [] as string[] }
const mismatches: string[] = []
const identity: string[] = []

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
        if (phase.scope && phase.scopeOnly.length < 20) phase.scopeOnly.push(`${label}: ${key.slice(0, 120)}`)
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

/* ───────────── crawling a context ───────────── */

const MODELS: ((ctx: AnalyticsContext) => unknown)[] = [
  planModel,
  forecastModel,
  targetsModel,
  homeModel,
  requestsModel,
  financeModel,
  whatifModel,
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
  const out = harvest(close, label)
  checkWindows(close.key, label)
  rec.calls.length = 0
  rec.windows.length = 0
  return out
}

/* ───────────── the scope list ───────────── */

/** A seeded generator (mulberry32), so the multi-selects are the same every run. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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

/* ───────────── the tests ───────────── */

describe('HRBP and Leader cost in every scope a pick can select, as its whole atoms’ rounded parts (7.3d)', () => {
  let sample: Sample
  let step = 0
  const shownBy = { defaults: 0, scopes: 0 }
  let atomsAt: AtomIndex | null = null

  /** A rounded mode and the positions a context's cost covers. */
  const scopeKey = (mode: Mode, ctx: AnalyticsContext): string =>
    `${mode}|${[...costIdsOf(ctx)].sort().join(',')}`

  beforeAll(() => {
    sample = cachedSample()
    const c = closeOf(sample, 'B')
    const base = { ...NO_PICKS, ...samplePicks(sample.personas) }
    const ctx0 = ctxAt(c, 'leader', base)
    step = ctx0.guard.rules.floorUsd
    atomsAt = ctx0.guard.atoms
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
    // The company's bridges against each comparison the scopes draw, priced seat by seat.
    for (const cmp of [
      null,
      ...company.versions.filter((v) => v.state === 'locked').map((v) => v.versionId),
    ]) {
      const p = forecastPrep(ctxAt(c, 'leader', ceo.picks, { compare: cmp }))
      if (p.comparison && p.run && !bridgeRefs.has(`B|${p.comparison.versionId}`))
        bridgeRefOf('B', p.comparison.versionId, p)
    }

    // The company and every pick's default scope: what the programs of costLp.slow.test.ts read.
    const seen = new Set<string>()
    crawl(c, company, 'B company')
    seen.add(scopeKey('leader', company))
    for (const p of picks) {
      const ctx = ctxAt(c, p.mode, p.picks)
      seen.add(scopeKey(p.mode, ctx))
      shownBy.defaults += crawl(c, ctx, `B ${p.mode} ${p.option.pick.name}`).shown
    }

    // Every scope a pick can select, each read once.
    phase.scope = true
    const run = (p: Pick, filters: Partial<Filters>, label: string) => {
      const ctx = ctxAt(c, p.mode, p.picks, { filters })
      const k = scopeKey(p.mode, ctx)
      if (seen.has(k)) return
      seen.add(k)
      shownBy.scopes += crawl(c, ctx, label).shown
    }
    const leadersIn = (ctx: AnalyticsContext): string[] => {
      const ids = new Set(ctx.data.positions.map((r) => r.positionId))
      return [...leaderSeats(ctx.all.positions, ctx.asOf)].filter((id) => ids.has(id)).sort()
    }
    const departmentsIn = (ctx: AnalyticsContext): string[] =>
      [...new Set(ctx.data.positions.map((r) => r.department ?? '').filter(Boolean))].sort()
    for (const p of picks) {
      const ctx = ctxAt(c, p.mode, p.picks)
      for (const d of departmentsIn(ctx))
        run(p, { department: [d] }, `B ${p.mode} ${p.option.pick.name} ${d}`)
      for (const l of leadersIn(ctx)) run(p, { leaderId: l }, `B ${p.mode} ${p.option.pick.name} leader ${l}`)
    }
    const se = picks.find((p) => p.mode === 'hrbp' && p.option.pick.unit === 'Silicon Engineering') as Pick
    const seDepartments = departmentsIn(ctxAt(c, se.mode, se.picks))
    expect(seDepartments).toHaveLength(6)
    for (const set of subsets(seDepartments)) run(se, { department: set }, `B SE HRBP ${set.join(' + ')}`)
    const rand = prng(20261021)
    const pickOf = (xs: readonly Pick[]) => xs[Math.floor(rand() * xs.length)]
    for (let i = 0; i < 200; i++) {
      const p = pickOf(picks)
      const ctx = ctxAt(c, p.mode, p.picks)
      const depts = departmentsIn(ctx).filter(() => rand() < 0.4)
      const leaders = leadersIn(ctx)
      const filters: Partial<Filters> = { modes: {} }
      if (depts.length) {
        filters.department = depts
        if (rand() < 0.5) filters.modes = { ...filters.modes, department: 'exclude' }
      }
      if (leaders.length && rand() < 0.6) {
        filters.leaderId = leaders[Math.floor(rand() * leaders.length)]
        if (rand() < 0.4) filters.modes = { ...filters.modes, leaderId: 'exclude' }
      }
      run(p, filters, `B random ${i} ${p.mode} ${p.option.pick.name}`)
    }
  }, 900_000)

  it('crawls every pick’s default scope and every scope a pick can select', () => {
    expect(atomsAt?.atoms.length ?? 0).toBeGreaterThanOrEqual(45)
    expect(contexts).toBeGreaterThan(250)
    expect(shownBy.defaults).toBeGreaterThan(0)
    expect(shownBy.scopes).toBeGreaterThan(0)
    expect(untagged).toBe(0)
  })

  it('every figure is the sum of its whole atoms’ rounded parts, in every scope (union identity)', () => {
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

  it('reads no atom part a pick’s default scope does not, so the programs hold every scope’s readings', () => {
    expect(phase.scopeOnly).toEqual([])
  })
})
