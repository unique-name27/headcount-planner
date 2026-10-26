/**
 * The edit check behind Finance > Assumptions and `version.create` (docs/PLAN.md 7.4, 9.4, C14, R35,
 * R37; M3 freeze). The write path calls it through its action environment
 * (src/plan/actions/types.ts `ActionEnv.assumptionEditRefusal`, wired by src/app/write/context.ts),
 * and Finance > Assumptions calls it to say beside a value why it cannot be changed before anyone
 * tries. Pure over the analytics context.
 *
 * - HR admin: every edit passes (null), with or without the switch.
 * - Finance: a row of an HR-admin-only table (`isHrAdminOnly`: burden caps, merit, promotion pool,
 *   bonus target and funding) is refused with SET_BY_IMPORT ("Set by import."); every other row is
 *   priced before and after on Working's lines and the forecast (the closed months never move), the
 *   moved positions are placed in Finance's fold parts (src/cost/fold.ts `financeFold` per unit) and
 *   src/cost/edits.ts `editRefusal` decides, with `ctx.guard.rules.minCosted`.
 * - Any other mode: the policy refuses before this is asked; it answers as Finance would.
 *
 * Readings taken here (finance-ui builder, M3):
 *  - Both sides are priced in one kind of context: Finance mode over the same data, plan state,
 *    as-of date and metric dictionary, with no filter and no scope (`pricingContext`), so a viewer's
 *    filters never change the answer. The edited side lays the rows over Working's assumptions the
 *    way the write lays them (`withOverlay`'s row key), so it prices exactly what saving would.
 *  - A position's amount per month is its filled-part loaded cost and its equity (SBC), on the
 *    version's shown lines (closed months from the closes, which no edit moves) and on its forecast;
 *    a move is more than half a cent (7.2 rule 5's eps). Band seats and forecast cohort lines no seat
 *    took are structure and never count (only positions with costed people, rule 5).
 *  - Plan months and forecast months are separate series (src/cost/edits.ts): a forecast month is
 *    'forecast <month>'.
 *  - A position's part is its seat's: a shown cost center of its unit's fold
 *    ('<unit>|center|<costCenter>'), else its department × country share of the unit's Other
 *    ('<unit>|other|<department>|<country>'), from the fold of the version before the edit.
 *  - An edit of a locked version (the rows `version.create` would copy from a Budget or reforecast) is
 *    priced on a Working copy of it: its stored assumptions and plan rates as live rows over today's
 *    positions, the new Working's own reading of them.
 *  - `editNoteOf` reads the policy first (a locked or retired version is read only for everyone), then
 *    the table: HR admin edits all; Finance all but the tables set by import; an HRBP its own unit's
 *    operational rows only (R18); every other mode none, with the policy's reason.
 *
 * Readings taken in the M3 fixes (review PV-1 to PV-4):
 *  - Movers are decided at leave-neutral prices on both sides (R44, C26): both sides are priced in a
 *    world where nobody's leave is unpaid (`paidWorld`: every worker on unpaid leave read as on paid
 *    leave), so every line it prices is leave-neutral: a seat's own lines, its vacancy allowance (C31)
 *    and the forecast's cohort lines, which spread a unit's average cost (M3 recheck: a paid-twin swap
 *    of the holder's own lines left the allowance and the cohort averages reading leave). Closed and actual months are
 *    the closes' stored lines, which no edit moves. The check reads movers only, never a value.
 *  - One structural FX rule (PV-1 to PV-3): a changed FX row for currency c and month m is refused
 *    when the costed people paid in c in m (a costed line in c that month: Working's lines as shown,
 *    its own lines, and the forecast's) number 1 to 4 in all, or 1 to 4 in one part of Finance's
 *    fold, each row and each line source on its own, whichever set the row is in and whenever it
 *    takes effect (now, at a close, at a lock, on a new grid). A row is changed when its value
 *    differs from the value it replaces: an actual rate for a month not yet closed against the
 *    forecast rate that month reads now (the close books it in place of that rate); any other row
 *    against the version's own row, or, for a month the version has no row for, its latest earlier
 *    month's (else its first later month's) rate of that currency and set. A month no line reaches
 *    (a new Working's grid past the version priced) is read as every month the lines reach.
 *  - A version the context does not hold (a new Working with no `from`): FX rows are checked by the
 *    same rule against the as-of year's Working and the imported rows naming the version; any other
 *    row cannot be priced and is refused (CANNOT_PRICE_TEXT), never let through unchecked.
 */
import { contextLists, setContextLists } from '@/access/lists'
import { viewerOf } from '@/access/visibility'
import { type EditMove, editRefusal } from '@/cost/edits'
import type { FinanceFold } from '@/cost/fold'
import { isCostedLine, memberIdOf } from '@/cost/guard'
import { type AnalyticsContext, buildContext, NO_CLAMP } from '@/data/context'
import { fiscalYearOf } from '@/data/fiscal'
import {
  type AssumptionRow,
  assumptionKey,
  DATASETS,
  type Datasets,
  isHrAdminOnly,
  type Month,
  splitAssumptionKey,
} from '@/data/schema'
import { DEFAULT_FILTERS } from '@/data/scope'
import { closedThrough } from '@/plan/engine/close'
import { fxRatesFromAssumptions, rateOf } from '@/plan/engine/fx'
import { isLocked, workingOf } from '@/plan/engine/versions'
import { overlayRows } from '@/plan/store/overlay'
import type { AnyVersion, FxTable, PlanLine, PlanState, WorkingVersion } from '@/plan/types'
import { type ForecastRun, forecastRunOf } from '@/views/forecast/engine/run'
import { costSeatOf, gridMonths, ratesOf, shownLines, versionLinesOf } from '@/views/plan/engine/core'
import { foldsOf, membersOf } from '@/views/plan/engine/guarded'
import { SET_BY_IMPORT } from './assumptions'

/** "Locked versions are read only.": a locked or retired version's values beside each row. */
export const LOCKED_READ_ONLY = 'Locked versions are read only.'

/** An edit the engines cannot price is refused rather than let through unchecked. */
export const CANNOT_PRICE_TEXT = 'This change cannot be priced. Check the rates for the months it reaches.'

/** An HRBP's note on another unit's (or the company's) operational value. */
export const OWN_UNIT_ONLY = 'Your unit’s values only. Other units and the company’s are read only.'

/** The tables an HRBP edits for its own unit in Working (R18); Finance and HR admin edit them too. */
export const OPERATIONAL_TABLES: ReadonlySet<AssumptionRow['table']> = new Set([
  'timeToFill',
  'fillRate',
  'backfillRate',
  'backfillLag',
])

/** The assumptions dataset's row key (version, table, org, key), as the overlay lays rows. */
const ROW_KEY = DATASETS.find((d) => d.key === 'assumptions')?.rowKey ?? ['version', 'table', 'org', 'key']

/** Half a cent: a smaller change moves nobody (7.2 rule 5). */
const EPS = 0.005

/** A row naming a version, with known keys only. */
const named = (r: AssumptionRow, version: string): AssumptionRow => ({
  version,
  table: r.table,
  org: (r.org ?? '').trim() || null,
  key: r.key.trim(),
  value: r.value,
})

/* ───────────── the pricing contexts ───────────── */

/** The version an edit is priced on: a Working one as it is; a locked one as a Working copy (see the module comment). */
interface Priced {
  version: AnyVersion
  /** Rows to lay over the datasets before pricing (a locked version's copy), or none. */
  rows: readonly AssumptionRow[]
  /** The id the edit's rows name. */
  id: string
}

function pricedVersion(ctx: AnalyticsContext, versionId: string): Priced | null {
  const v = ctx.versions.find((x) => x.versionId === versionId)
  if (!v) return null
  if (!isLocked(v)) return v.state === 'working' ? { version: v, rows: [], id: v.versionId } : null
  const id = `${v.versionId}~edit-check`
  const copy: WorkingVersion = {
    versionId: id,
    name: `${v.name} (edit check)`,
    kind: 'working',
    fiscalYear: v.fiscalYear,
    grid: { from: v.grid.from, to: v.grid.to },
    proration: v.proration,
    state: 'working',
    createdAt: v.createdAt,
    lockedAt: null,
    lockedBy: null,
    engineVersion: v.engineVersion,
    parentId: v.versionId,
    hash: null,
  }
  const fx: AssumptionRow[] = v.rates.map((x) => ({
    version: id,
    table: 'fx',
    org: null,
    key: assumptionKey([x.currency, x.set, x.month]),
    value: x.usdPerLocal,
  }))
  const rows = [...v.assumptions.filter((r) => r.table !== 'fx').map((r) => named(r, id)), ...fx]
  return { version: copy, rows, id }
}

/** A worker on unpaid leave read as on paid leave: pay lines priced in full. */
const paidWorker = (w: Datasets['workers'][number]): Datasets['workers'][number] =>
  w.onLeave === true && w.leavePaid === false ? { ...w, leavePaid: true } : w

const paidMemo = new WeakMap<Datasets['workers'], Datasets['workers']>()

/**
 * The datasets with nobody's leave unpaid (see the module comment): what both sides are priced in, so
 * which positions an edit moves never depends on anyone's leave. The same workers list gives the same
 * list back; data with no unpaid leave comes back as it is.
 */
export function paidWorld(data: Datasets): Datasets {
  const workers = data.workers
  if (!workers.some((w) => w.onLeave === true && w.leavePaid === false)) return data
  let paid = paidMemo.get(workers)
  if (!paid) {
    paid = workers.map(paidWorker)
    paidMemo.set(workers, paid)
  }
  return { ...data, workers: paid }
}

/** The datasets and plan state with rows laid over the assumptions as the write lays them. */
function laid(
  all: Datasets,
  plan: PlanState | null,
  rows: readonly AssumptionRow[],
): { data: Datasets; plan: PlanState | null } {
  if (!rows.length) return { data: all, plan }
  const data: Datasets = { ...all, assumptions: overlayRows(all.assumptions, rows, ROW_KEY) }
  // The context lays plan state's overlay again; it must hold the rows too, or it would put the old values back.
  const next = plan
    ? {
        ...plan,
        overlay: { ...plan.overlay, assumptions: overlayRows(plan.overlay.assumptions, rows, ROW_KEY) },
      }
    : null
  return { data, plan: next }
}

/** Finance mode over the context's data with no filter and no scope: what both sides are priced in. */
function pricingContext(
  ctx: AnalyticsContext,
  data: Datasets,
  plan: PlanState | null,
  extra: AnyVersion | null,
): AnalyticsContext {
  const versions = extra ? [...ctx.versions, extra] : ctx.versions
  const out = buildContext({
    data: paidWorld(data),
    sources: ctx.sources,
    filters: DEFAULT_FILTERS,
    asOfOverride: ctx.asOf,
    today: ctx.asOf,
    mode: 'finance',
    plan: plan ? { ...plan, versions } : null,
    versions,
    clamp: NO_CLAMP,
    showPay: false,
    standard: ctx.standard,
    quality: ctx.quality,
    metrics: ctx.metrics,
  })
  const lists = contextLists(ctx)
  if (lists) setContextLists(out, lists)
  return out
}

/** Each costed position's loaded cost and equity per series and month (see the module comment). */
type Amounts = Map<string, [number, number]>

/** The forecast's month prefix (src/cost/edits.ts: plan and forecast months are separate series). */
const FORECAST = 'forecast '

/**
 * The forecast run: null when the version has none, undefined when its rates cannot price one (a
 * locked version's copy has plan rates only).
 */
function forecastOf(c: AnalyticsContext, v: AnyVersion): ForecastRun | null | undefined {
  try {
    return forecastRunOf(c, v)
  } catch {
    return undefined
  }
}

/** The forecast's lines ([] with no run), or null when it cannot be priced. */
function forecastLines(c: AnalyticsContext, v: AnyVersion): readonly PlanLine[] | null {
  const run = forecastOf(c, v)
  return run === undefined ? null : (run?.lines ?? [])
}

/**
 * The amounts of both series, and whether the forecast could be priced. Leave-neutral (see the module
 * comment): the context is a `paidWorld` one, so no line it prices reads anyone's leave.
 */
function amountsOf(c: AnalyticsContext, v: AnyVersion): { amounts: Amounts; forecast: boolean } {
  const out: Amounts = new Map()
  const add = (series: string, lines: readonly PlanLine[]) => {
    for (const l of lines) {
      if (l.basis === 'band') continue
      const id = memberIdOf(l)
      if (!id || id.startsWith('cohort:')) continue
      const k = `${id}\u0001${series}${l.month}`
      const a = out.get(k) ?? [0, 0]
      a[0] += l.usd.loaded
      a[1] += l.usd.equity
      out.set(k, a)
    }
  }
  add('', shownLines(c, v))
  const run = forecastOf(c, v)
  if (run) add(FORECAST, run.lines)
  return { amounts: out, forecast: run !== undefined }
}

/** Costed positions paid in a currency in a month, in one line source (see the module comment). */
interface PaidIn {
  /** `<currency>|<month>` to the costed positions with a costed line in that currency and month. */
  byKey: Map<string, Set<string>>
  /** The months the source has any line in. */
  months: Set<Month>
}

/** Each line source's costed positions by currency and month: Working as shown, its own lines, the forecast. */
function paidInOf(
  c: AnalyticsContext,
  v: AnyVersion,
  costed: ReadonlySet<string>,
): ReadonlyMap<string, PaidIn> {
  const out = new Map<string, PaidIn>()
  const add = (source: string, lines: readonly PlanLine[]) => {
    const x: PaidIn = { byKey: new Map(), months: new Set() }
    for (const l of lines) {
      x.months.add(l.month)
      if (!isCostedLine(l) || l.currency === 'USD') continue
      const id = memberIdOf(l)
      if (!id || id.startsWith('cohort:') || !costed.has(id)) continue
      const k = `${l.currency}|${l.month}`
      let set = x.byKey.get(k)
      if (!set) {
        set = new Set()
        x.byKey.set(k, set)
      }
      set.add(id)
    }
    out.set(source, x)
  }
  add('shown', shownLines(c, v))
  add('own', versionLinesOf(c, v))
  add('forecast', forecastLines(c, v) ?? [])
  return out
}

/** What the side before the edit gives: its amounts, the costed positions and each one's part. */
interface Before {
  amounts: Amounts
  forecast: boolean
  costed: ReadonlySet<string>
  partOf: (positionId: string) => string
  /** The version's rates before the edit. */
  rates: FxTable
  /** The last closed month, or null. */
  closed: Month | null
  /** Costed positions paid in each currency and month, by line source. */
  paidIn: ReadonlyMap<string, PaidIn>
}

const beforeMemo = new WeakMap<AnalyticsContext, Map<string, Before>>()

function beforeOf(ctx: AnalyticsContext, p: Priced): Before {
  let byVersion = beforeMemo.get(ctx)
  if (!byVersion) {
    byVersion = new Map()
    beforeMemo.set(ctx, byVersion)
  }
  const hit = byVersion.get(p.id)
  if (hit) return hit
  const { data, plan } = laid(ctx.all, ctx.plan, p.rows)
  const base = pricingContext(ctx, data, plan, p.rows.length ? p.version : null)
  const v = base.versions.find((x) => x.versionId === p.id) as AnyVersion
  const months = gridMonths(v)
  const costed = new Set<string>()
  for (const lines of [shownLines(base, v), forecastLines(base, v) ?? []])
    for (const m of membersOf(base, lines, months, null))
      if (m.part === 'filled' && m.people.length) costed.add(m.positionId)
  const folds: ReadonlyMap<string, FinanceFold> = foldsOf(base, v) ?? new Map()
  const seatOf = costSeatOf(base)
  const priced = amountsOf(base, v)
  const out: Before = {
    amounts: priced.amounts,
    forecast: priced.forecast,
    costed,
    partOf: (id) => {
      const s = seatOf(id)
      if (!s) return `none|${id}`
      return folds.get(s.businessUnit)?.shown.includes(s.costCenter)
        ? `${s.businessUnit}|center|${s.costCenter}`
        : `${s.businessUnit}|other|${s.department ?? ''}|${s.country}`
    },
    rates: ratesOf(base.all, v),
    closed: closedThrough(base.plan?.closes ?? []),
    // Read only for FX rows, once.
    get paidIn() {
      const x = paidInOf(base, v, costed)
      Object.defineProperty(this, 'paidIn', { value: x })
      return x
    },
  }
  byVersion.set(p.id, out)
  return out
}

/** The positions an edit moves, by part and series month (src/cost/edits.ts `EditMove`). */
export function editMovesOf(
  ctx: AnalyticsContext,
  edits: readonly AssumptionRow[],
  versionId: string,
): EditMove[] {
  const p = pricedVersion(ctx, versionId)
  if (!p || !edits.length) return []
  const before = beforeOf(ctx, p)
  const { data, plan } = laid(ctx.all, ctx.plan, [...p.rows, ...edits.map((r) => named(r, p.id))])
  const after = pricingContext(ctx, data, plan, p.rows.length ? p.version : null)
  const v = after.versions.find((x) => x.versionId === p.id) as AnyVersion
  const priced = amountsOf(after, v)
  const amounts = priced.amounts
  // The forecast counts only when both sides could price it.
  const forecast = before.forecast && priced.forecast
  const out: EditMove[] = []
  for (const k of new Set([...before.amounts.keys(), ...amounts.keys()])) {
    const at = k.indexOf('\u0001')
    const id = k.slice(0, at)
    if (!before.costed.has(id)) continue
    if (!forecast && k.startsWith(FORECAST, at + 1)) continue
    const a = before.amounts.get(k) ?? [0, 0]
    const b = amounts.get(k) ?? [0, 0]
    if (Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS) continue
    out.push({ positionId: id, month: k.slice(at + 1), part: before.partOf(id) })
  }
  return out
}

/* ───────────── the structural FX rule (PV-1 to PV-3) ───────────── */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

interface FxRowKey {
  currency: string
  set: 'plan' | 'actual' | 'forecast'
  month: Month
}

/** A company-level non-USD FX row's currency, set and month, or null for a row the rate table does not read. */
function fxKeyOf(r: AssumptionRow): FxRowKey | null {
  if (r.table !== 'fx' || (r.org ?? '').trim() !== '') return null
  const [currency, set, month] = splitAssumptionKey(r.key.trim())
  if (!currency || currency === 'USD' || !MONTH.test(month ?? '')) return null
  if (set !== 'plan' && set !== 'actual' && set !== 'forecast') return null
  return { currency, set, month: month as Month }
}

/** A currency and set's rate in the nearest month before `month` (else the nearest after), or null. */
function carried(rates: FxTable, x: FxRowKey): number | null {
  let before: { month: Month; v: number } | null = null
  let after: { month: Month; v: number } | null = null
  for (const r of rates) {
    if (r.currency !== x.currency || r.set !== x.set) continue
    if (r.month < x.month) {
      if (!before || r.month > before.month) before = { month: r.month, v: r.usdPerLocal }
    } else if (r.month > x.month && (!after || r.month < after.month))
      after = { month: r.month, v: r.usdPerLocal }
  }
  return before?.v ?? after?.v ?? null
}

/** The value an FX row replaces (see the module comment), or null when there is none to read. */
function fxReplaced(
  x: FxRowKey,
  rates: FxTable,
  edited: ReadonlyMap<string, number>,
  closed: Month | null,
): number | null {
  if (x.set === 'actual' && (!closed || x.month > closed)) {
    const now =
      edited.get(`${x.currency}|forecast|${x.month}`) ?? rateOf(rates, x.currency, 'forecast', x.month)
    if (now != null) return now
  }
  return rateOf(rates, x.currency, x.set, x.month) ?? carried(rates, x)
}

/** What the structural rule reads of the side before an edit. */
interface FxBefore {
  rates: FxTable
  closed: Month | null
  paidIn: ReadonlyMap<string, PaidIn>
  partOf: (positionId: string) => string
}

/**
 * Each changed FX row's movers, one list per row and line source: the costed positions paid in the
 * row's currency in its month (in every month the source reaches when it does not reach that one),
 * in Finance's fold parts. Each list is decided on its own.
 */
export function fxRowMoves(edits: readonly AssumptionRow[], b: FxBefore): EditMove[][] {
  const edited = new Map<string, number>()
  for (const r of edits) {
    const x = fxKeyOf(r)
    if (x) edited.set(`${x.currency}|${x.set}|${x.month}`, r.value)
  }
  const out: EditMove[][] = []
  for (const r of edits) {
    const x = fxKeyOf(r)
    if (!x) continue
    const was = fxReplaced(x, b.rates, edited, b.closed)
    if (was != null && was === r.value) continue
    for (const [source, paid] of b.paidIn) {
      const months = paid.months.has(x.month) ? [x.month] : [...paid.months].sort()
      const moves: EditMove[] = []
      for (const m of months)
        for (const id of paid.byKey.get(`${x.currency}|${m}`) ?? [])
          moves.push({ positionId: id, month: `${source} ${m}`, part: b.partOf(id) })
      out.push(moves)
    }
  }
  return out
}

/** The structural rule's refusal for an edit, or null. */
function fxRefusal(edits: readonly AssumptionRow[], b: FxBefore, min: number): string | null {
  if (!edits.some((r) => fxKeyOf(r))) return null
  for (const moves of fxRowMoves(edits, b)) {
    const why = editRefusal(moves, min)
    if (why) return why
  }
  return null
}

/**
 * An edit of a version the context does not hold (a new Working with no `from`): FX rows under the
 * structural rule against the as-of year's Working (else the latest Working) and the imported rows
 * naming the version; any other row cannot be priced.
 */
function unheldCheck(
  ctx: AnalyticsContext,
  edits: readonly AssumptionRow[],
  versionId: string,
): string | null {
  if (edits.some((r) => !fxKeyOf(r))) return CANNOT_PRICE_TEXT
  const working =
    workingOf(ctx.versions, fiscalYearOf(ctx.asOf)) ??
    [...ctx.versions]
      .filter((v) => v.state === 'working')
      .sort((a, b) => (a.fiscalYear < b.fiscalYear ? 1 : a.fiscalYear > b.fiscalYear ? -1 : 0))[0]
  const p = working ? pricedVersion(ctx, working.versionId) : null
  if (!p) return CANNOT_PRICE_TEXT
  const before = beforeOf(ctx, p)
  const id = versionId.trim()
  const rates = fxRatesFromAssumptions(ctx.all.assumptions.filter((r) => (r.version ?? '').trim() === id))
  return fxRefusal(
    edits,
    { rates, closed: before.closed, paidIn: before.paidIn, partOf: before.partOf },
    ctx.guard.rules.minCosted,
  )
}

/** What an edit would do: null when it may go through, else the refusal (SET_BY_IMPORT or 7.4's sentence). */
export function assumptionEditCheck(
  ctx: AnalyticsContext,
  edits: readonly AssumptionRow[],
  versionId: string,
): string | null {
  if (ctx.mode === 'hr-admin' || !edits.length) return null
  if (edits.some((r) => isHrAdminOnly(r.table))) return SET_BY_IMPORT
  try {
    const min = ctx.guard.rules.minCosted
    const p = pricedVersion(ctx, versionId)
    if (!p) {
      // A retired version is read only (the action refuses first); one the context does not hold is a new Working.
      if (ctx.versions.some((v) => v.versionId === versionId)) return LOCKED_READ_ONLY
      return unheldCheck(ctx, edits, versionId)
    }
    const before = beforeOf(ctx, p)
    const fx = fxRefusal(edits, before, min)
    if (fx) return fx
    return editRefusal(editMovesOf(ctx, edits, versionId), min)
  } catch (e) {
    // A value the engines cannot price (a rate missing for a month the edit reaches) never goes through unchecked.
    return e instanceof Error && e.message ? e.message : CANNOT_PRICE_TEXT
  }
}

/** An org is one of the HRBP's own units, or a department that sits only in them (as the action reads it). */
export function ownOrg(ctx: AnalyticsContext, org: string | null | undefined): boolean {
  const o = (org ?? '').trim()
  if (!o) return false
  const units = viewerOf(ctx).hrbpUnits
  if (units.has(o)) return true
  const of = new Set(ctx.all.positions.filter((r) => r.department === o).map((r) => r.businessUnit))
  return of.size > 0 && [...of].every((u) => units.has(u))
}

/**
 * Why one assumption value cannot be edited in this context before anyone tries (the row's note on
 * Finance > Assumptions): SET_BY_IMPORT, "Locked versions are read only.", or null when it may be
 * edited (the 7.4 check still runs on the value typed).
 */
export function editNoteOf(ctx: AnalyticsContext, row: AssumptionRow, versionId: string): string | null {
  const v = ctx.versions.find((x) => x.versionId === versionId)
  if (v?.state !== 'working') return LOCKED_READ_ONLY
  const mode = ctx.mode
  if (mode === 'hr-admin') return null
  if (OPERATIONAL_TABLES.has(row.table)) {
    const d = ctx.access.decide('action:assumptions.edit-operational')
    if (d.access === 'hidden') return d.how ?? null
    if (d.access === 'limited' && !ownOrg(ctx, row.org)) return OWN_UNIT_ONLY
    return null
  }
  const d = ctx.access.decide('action:assumptions.edit')
  if (d.access === 'hidden') return d.how ?? null
  if (isHrAdminOnly(row.table)) return SET_BY_IMPORT
  return null
}
