/**
 * The long CSV's rows from the guarded model (docs/PLAN.md 14.1 item 3, 7.2, 7.3, 7.4): the same
 * members, folds, atoms, component gate and fit the screen's figures read (src/views/plan/engine/
 * guarded.ts `membersOf`, `foldsOf`, `gateFor`, `guardFigure`, `isWholeUnion`), so a file never holds
 * a number the screen would not show. One model for every mode (src/lib/export/longCsv.ts says what
 * each mode's rows hold): the whole-view Export menu writes it in every mode that shows
 * `action:export.long-csv`, and Finance > Export's load file (./loadFile.ts) is it at Finance's rules.
 *
 * Readings frozen here (M4 freeze, docs/CONTRACTS-M4.md):
 *  - Periods: every month of the version's grid, then QTD, YTD and FY of the as-of date's fiscal
 *    year, QTD and YTD ending at the last close (rounded modes: as 7.3 (b); exact modes the same, so
 *    one file's to-date windows match across modes).
 *  - Heads at the window's last month-end and FTE averaged over its months, by Forecast > Variance's
 *    measures; a cell's heads and FTE on its first row only.
 *  - Under a country, legal-entity or currency filter, Finance's file holds only the shown cost
 *    centers with that value, no Other row, and the note "n people in cost centers under 5 are left
 *    out" (`centersLeftOutNote`); in rounded modes the screen's "n people in groups under 5 are left
 *    out" (`leftOutNote`).
 *  - Manager rows are `LongHeadsRow`s: the model carries no amount key in Manager mode (7.6).
 *
 * Readings taken here (finance-export builder, M4):
 *  - C33 (a) overrides the filter reading above: under a cost-center, legal-entity, country or
 *    currency filter Finance's cost reads "—" (`costFit`'s `FINANCE_FILTER_NOTE`), so the rows keep
 *    their cells and heads, every amount empty with that reason. The rows follow the screen's own
 *    fit (`fitOf`) for every mode and period, so a file never shows cost the screen does not.
 *  - The rows of a period are cells that partition the scope's positions, each cell one or more rows:
 *     · Finance, and HR admin with the switch off: per business unit, each cost center its one fold
 *       shows, and the unit's Other ("Other (k)" in `costCenter`, k the cost centers folded into it).
 *       A cell's amount is the guard's row for it (`guardFigure` over the unit's members, broken down
 *       by cost center: shown centers and the unit's Other, filled part and band part together, the
 *       screen's total). The component split shows where the guard shows it (C33 (b): whole units
 *       whose classes pass), so a cost-center cell is one 'loaded' row whose `suppressedReason` is
 *       the guard's ("Components show for whole units and the company.", or "Components hidden
 *       (fewer than 5 in a component)"); its `suppressed` stays blank, since the amount shows.
 *       The split by component is in the control totals by component instead (`ComponentTotal`,
 *       review SB-1): each unit's and the whole scope's, in each period where the guard shows that
 *       figure's split, never a row (rows keep one grain, a cell of the partition).
 *     · HR admin with the switch on: per unit and cost center, no folds and no suppression; one row
 *       per currency and component (equity, "incl. SBC", in USD on its own row).
 *     · HRBP and Leader: the org is the scope's department (an HRBP, the company) or direct sub-org
 *       (a leader's tree), the cost rows the screen draws (Forecast > Variance's department and
 *       sub-org rows). Month rows are org × cost center, heads and FTE only; QTD, YTD and FY rows are
 *       one per org, with the guard's `sumRounded` total where the org is a whole union of the last
 *       close's atoms and cost shows under the screen's filters and period, else heads and FTE only.
 *       The scope's own total (every kept atom, the cost tiles' value) is the control total's
 *       rounded loaded total, never a row: rows partition the positions, and the scope is all of them.
 *     · Manager: the team, by cost center, heads and FTE only.
 *  - One currency per row: a cell whose lines in the period are all in one currency carries it, its
 *    local amount (Σ of the same lines' local amounts) and its rate (when every line of the period
 *    has the same rate; a window that crosses rate months leaves it blank). Which currency and rate
 *    a row has reads the lines that exist, never their amounts, so a leave never changes it (C26).
 *    A cell in more than one currency, an Other row and every rounded row are USD with
 *    `amountLocal` and `rate` blank, so no currency share inside a cell is ever split out.
 *  - Accounts: the version's `glAccount` assumption rows by component, read through the version's
 *    `AssumptionLookup` at the cell's org (5.2's fallback: the cost center's department, then its
 *    unit, then the company; review SA-7). A cost-center cell nests in one department, so a cell
 *    never splits; the unit's Other, and a cell whose seats name more than one department, take the
 *    unit's account. A 'loaded' row has none.
 *  - `source: 'forecast'` reads the version's fiscal year's Working forecast (actual for closed
 *    months, forecast for open), as Forecast > Variance and the bridge read it, at the Working
 *    version's fold; its rate set reads "Actual for closed months, forecast for open".
 *  - The model is cached per context and options (`longCsvOf`); `longRowsOf` builds rows for a
 *    caller's own positions and fit (the load file: every position, no filter).
 */
import { buildExportMeta, planHeaderOf } from '@/app/exportMeta'
import type { ExportMeta, PlanHeader } from '@/charts/types'
import { isUnionOfAtoms } from '@/cost/atoms'
import { isPartialCostFilter } from '@/cost/fit'
import { OTHER, otherLabel } from '@/cost/fold'
import {
  COST_COMPONENTS,
  type CostComponent,
  type CostMember,
  type CostRow,
  type GuardedFigure,
  type GuardMode,
  hiddenNote,
  peopleOf,
} from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import { daysInMonth, monthKey, monthsOf, quarterOf } from '@/data/fiscal'
import { SAMPLE_COMPANY } from '@/data/sample/base'
import type { Month } from '@/data/schema'
import { type ControlTotal, centsAddingTo, controlTotals } from '@/lib/export/controlTotals'
import { csvField } from '@/lib/export/csv'
import {
  type AnyLongRow,
  LOADED_COMPONENTS,
  type LongComponent,
  type LongCsvTextOptions,
  type LongFacts,
  type LongHeadsRow,
  type LongRow,
  longCsvText,
  longFactsOf,
  longPreamble,
  ROUNDED_HEADS_REASON,
} from '@/lib/export/longCsv'
import { modeMeta } from '@/lib/export/modeMeta'
import { assumptionLookup } from '@/plan/engine/assumptions'
import type { AnyVersion, PlanLine } from '@/plan/types'
import { lineFte } from '@/views/forecast/engine/heads'
import { membersIn } from '@/views/forecast/engine/members'
import { forecastRunOf } from '@/views/forecast/engine/run'
import {
  assumptionRowsOf,
  costSeatOf,
  gridMonths,
  lastCloseOnOrBefore,
  managerOfIn,
  placementOf,
  scopeOf,
  shownLines,
  workingFor,
} from '@/views/plan/engine/core'
import { costIdsOf, fitOf, foldsOf, guardFigure } from '@/views/plan/engine/guarded'

/** Where the rows' amounts come from. */
export type LongSource = 'version' | 'forecast'

export interface LongCsvOptions {
  /** The version the rows read; the context's shown version when not given. */
  versionId?: string
  /**
   * 'version' (the default): the version's lines as the Plan view shows them (a Working version's
   * closed months from the closes). 'forecast': the version's fiscal year's Working forecast, as
   * Forecast > Variance and the bridge read it. An addition to the M4 contract (finance-export).
   */
  source?: LongSource
}

/** The long CSV as the mode may write it. */
export interface LongCsvModel {
  mode: GuardMode
  rows: readonly AnyLongRow[]
  /** Per period, from the rows (rounded modes: with the screen's `sumRounded` loaded total). */
  totals: readonly ControlTotal[]
  /** The left-out note the screen gives for the same scope, else null. */
  note: string | null
  /** Why there are no rows (no version to read, nobody picked), else null. */
  empty: string | null
  /** Added by the builder: the version the rows read (null with none). */
  versionId: string | null
  /** Added by the builder: the plan facts the rows repeat, for the file's header (`ExportMeta.plan`). */
  plan: PlanHeader | null
  /** Added by the builder: the periods in file order ('YYYY-MM', then 'QTD', 'YTD', 'FY'). */
  periods: readonly LongPeriod[]
  /** Added by the builder: each row's costed people behind its amount (`costedOfRow`), in row order. */
  costed: readonly (number | null)[]
  /** Added by the builder: each period's costed people behind its loaded control total, by period key. */
  costedByPeriod: Readonly<Record<string, number | null>>
  /**
   * Fix step (review SB-1): exact modes' control totals by component, for the whole scope and each
   * unit, in each period where the guard shows the split (C33 (b)); empty in the other modes.
   */
  componentTotals: readonly ComponentTotal[]
}

/**
 * One control total by component (docs/PLAN.md 14.1 item 4, C33 (b); review SB-1): a unit's, or the
 * whole scope's, cost in one period split as the screen's calculation card splits it: the filled
 * part's six components, the band part apart (7.2 rule 3) and the loaded total. Written only where
 * the guard shows the split on that unit or scope figure (`componentsHidden` false: every component
 * of every unit it covers has 0 or 5 or more contributing positions and each capped burden's sides
 * have 0 or 5 or more people, per month and over the window), so it is a number the screen shows.
 * Exact modes only (Finance, HR admin with the switch off): the open file splits every row by
 * component, so its own control totals carry the split (`ControlTotal.usdByComponent`).
 */
export interface ComponentTotal {
  /** 'YYYY-MM', 'QTD', 'YTD' or 'FY'. */
  period: string
  /** The business unit, or '' for the file's whole scope. */
  org: string
  /** The unit, or the scope's label ("Whole company"). */
  label: string
  /** The filled part's USD by component, to the cent. */
  usdByComponent: Readonly<Record<SplitComponent, number>>
  /** "Open and Planned at band estimate", apart; null where band estimates do not show. */
  bandUsd: number | null
  /** The figure's loaded cost: the components plus the band part, and the sum of its rows' amounts. */
  loadedUsd: number
  /** Costed people behind it (5 or more). */
  costed: number
}

/** The components a control total splits (loaded cost's; equity is apart). */
export type SplitComponent = 'base' | 'bonus' | 'burden' | 'benefits' | 'oneTime' | 'vacancy'
export const SPLIT_COMPONENTS: readonly SplitComponent[] = [
  'base',
  'bonus',
  'burden',
  'benefits',
  'oneTime',
  'vacancy',
]

/** Each component as a control total line names it. */
const SPLIT_WORD: Readonly<Record<SplitComponent, string>> = {
  base: 'base',
  bonus: 'bonus',
  burden: 'burden',
  benefits: 'benefits',
  oneTime: 'one-time',
  vacancy: 'vacancy allowance',
}

const usdText = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** A component control total as written: every amount in whole cents (`componentCents`). */
export interface ComponentCents {
  usdByComponent: Readonly<Record<SplitComponent, number>>
  bandUsd: number | null
  loadedUsd: number
}

/**
 * A component control total in whole cents, as every writer shows it (M4 recheck SB-1-a): the loaded
 * total to the cent (the rows' own sum), and the components and the band part each to the nearest
 * cent, then moved a cent at a time, the part furthest from its exact amount first (largest
 * remainder, src/lib/export/controlTotals.ts `centsAddingTo`, which the open file's split lines use
 * too), until they add to it exactly. No part moves by more than a cent, and a part of exactly 0
 * stays 0. Pure.
 */
export function componentCents(
  t: Pick<ComponentTotal, 'usdByComponent' | 'bandUsd' | 'loadedUsd'>,
): ComponentCents {
  const exact = [
    ...SPLIT_COMPONENTS.map((c) => t.usdByComponent[c]),
    ...(t.bandUsd != null ? [t.bandUsd] : []),
  ]
  const cents = centsAddingTo(exact, t.loadedUsd)
  const usd = (c: number): number => c / 100 + 0
  const usdByComponent = Object.fromEntries(SPLIT_COMPONENTS.map((c, i) => [c, usd(cents[i])])) as Record<
    SplitComponent,
    number
  >
  return {
    usdByComponent,
    bandUsd: t.bandUsd != null ? usd(cents[SPLIT_COMPONENTS.length]) : null,
    loadedUsd: usd(Math.round(t.loadedUsd * 100)),
  }
}

/**
 * One preamble line per component control total, after the control total lines: "Control totals
 * 2026-04, Operations, by component: base 1,234.00 USD, bonus …, vacancy allowance … USD, Open and
 * Planned at band estimate … USD, loaded … USD". The amounts are `componentCents`', so the parts
 * add to the loaded total as written (M4 recheck SB-1-a).
 */
export function componentTotalLines(totals: readonly ComponentTotal[]): string[] {
  return totals.map((t) => {
    const w = componentCents(t)
    const parts = SPLIT_COMPONENTS.map((c) => `${SPLIT_WORD[c]} ${usdText(w.usdByComponent[c])} USD`)
    if (w.bandUsd != null) parts.push(`Open and Planned at band estimate ${usdText(w.bandUsd)} USD`)
    parts.push(`loaded ${usdText(w.loadedUsd)} USD`)
    return `Control totals ${t.period}, ${t.label}, by component: ${parts.join(', ')}`
  })
}

/**
 * A long CSV or load file as written (src/lib/export/longCsv.ts `longCsvText`), with the component
 * control totals (`componentTotalLines`) after the control total lines: every writer of these files
 * (the Export menu, Finance > Export, the crawl) writes through this one function.
 */
export function longFileText(
  rows: readonly AnyLongRow[],
  meta: ExportMeta,
  opts: LongCsvTextOptions & { components?: readonly ComponentTotal[] },
): string {
  const extra = componentTotalLines(opts.components ?? [])
  if (!extra.length || opts.preamble === false) return longCsvText(rows, meta, opts)
  const pre = [...longPreamble(meta, opts), ...extra]
  const body = longCsvText(rows, meta, { ...opts, preamble: false }).replace(/^\uFEFF/, '')
  return `\uFEFF${pre.map((l) => csvField(l)).join('\r\n')}\r\n\r\n${body}`
}

/** One period of the file: a month of the version's grid, or a window. */
export interface LongPeriod {
  /** 'YYYY-MM', or 'QTD', 'YTD', 'FY'. */
  key: string
  months: readonly Month[]
  window: boolean
}

/** The rate set of a forecast's rows and header (docs/PLAN.md 14.1 item 1). */
export const FORECAST_RATES_LINE = 'Actual for closed months, forecast for open'

/** Why a file has no rows. */
export const NO_VERSION_TEXT = 'No version to read.'
export const NO_FORECAST_TEXT = 'No forecast for this fiscal year.'
export const NO_PICK_TEXT = 'Pick who you act as to see these rows.'

/* ───────────── periods ───────────── */

/**
 * The file's periods for a version (see the module comment): its grid's months, then the as-of
 * date's quarter to date, the year to date and the version's full year, inside the grid; a window
 * with no month is left out (FY28 has no year to date at 30 Sep 2026).
 */
export function longPeriodsOf(ctx: Pick<AnalyticsContext, 'plan' | 'asOf'>, v: AnyVersion): LongPeriod[] {
  const grid = gridMonths(v)
  const inGrid = new Set(grid)
  const fy = monthsOf(v.fiscalYear).filter((m) => inGrid.has(m))
  const close = lastCloseOnOrBefore(ctx.plan, ctx.asOf)
  const ytd = close ? fy.filter((m) => m <= close.month) : []
  const q = quarterOf(ctx.asOf)
  const qFrom = monthKey(q.start)
  const qTo = monthKey(q.end)
  const qtd = ytd.filter((m) => m >= qFrom && m <= qTo)
  const out: LongPeriod[] = grid.map((m) => ({ key: m, months: [m], window: false }))
  for (const [key, months] of [
    ['QTD', qtd],
    ['YTD', ytd],
    ['FY', fy],
  ] as const)
    if (months.length) out.push({ key, months, window: true })
  return out
}

/* ───────────── what the rows read ───────────── */

/** The facts every row repeats, and the meta they came from. */
interface Facts {
  facts: LongFacts
  rateSet: string
  plan: PlanHeader
}

/** The export meta of a version's rows (the facts `longFactsOf` reads, the header's plan facts). */
export function longMetaOf(ctx: AnalyticsContext, v: AnyVersion, source: LongSource = 'version'): ExportMeta {
  const header = planHeaderOf({ ...ctx, version: v })
  const plan: PlanHeader =
    source === 'forecast' && header.rates !== '' ? { ...header, rates: FORECAST_RATES_LINE } : header
  return buildExportMeta({
    viewLabel: source === 'forecast' ? 'Forecast' : 'Plan',
    viewKey: source === 'forecast' ? 'forecast' : 'plan',
    scopeLabel: ctx.scopeLabel,
    window: ctx.window,
    asOf: ctx.asOf,
    isSample: ctx.isSample,
    sampleCompany: SAMPLE_COMPANY,
    standard: ctx.standard,
    plan,
    ...modeMeta(ctx.access),
  })
}

function factsOf(ctx: AnalyticsContext, v: AnyVersion, source: LongSource): Facts {
  const meta = longMetaOf(ctx, v, source)
  const plan = meta.plan as PlanHeader
  return { facts: longFactsOf({ ...meta, mode: ctx.mode }), rateSet: plan.rates, plan }
}

/** The lines a file reads and the version whose fold prices them. */
interface Source {
  lines: readonly PlanLine[]
  /** The version whose fold (exact modes) the guard reuses: the Working version for a forecast. */
  foldVersion: AnyVersion
}

function sourceOf(ctx: AnalyticsContext, v: AnyVersion, source: LongSource): Source | null {
  if (source === 'version') return { lines: shownLines(ctx, v), foldVersion: v }
  const run = forecastRunOf(ctx, v)
  return run ? { lines: run.lines, foldVersion: run.version } : null
}

/** A cell's GL account by component (a component no level sets is left out). */
export type AccountsOf = (cell: Pick<Cell, 'unit' | 'department' | 'other'>) => ReadonlyMap<string, string>

/**
 * The version's GL accounts by component for a cell, read through its `AssumptionLookup` at the
 * cell's org: the department, then the unit, then the company (5.2; review SA-7). The unit's Other
 * reads the unit's (see the module comment).
 */
export function accountsOf(ctx: Pick<AnalyticsContext, 'all'>, v: AnyVersion): AccountsOf {
  const lookup = assumptionLookup(assumptionRowsOf(ctx.all, v), v)
  const byOrg = new Map<string, ReadonlyMap<string, string>>()
  return (cell) => {
    const department = cell.other ? null : cell.department
    const k = `${cell.unit}\u0001${department ?? ''}`
    let hit = byOrg.get(k)
    if (!hit) {
      const out = new Map<string, string>()
      for (const c of COST_COMPONENTS) {
        const got = lookup.get('glAccount', [c], { businessUnit: cell.unit, department })
        if (got && Number.isFinite(got.value)) out.set(c, String(got.value))
      }
      hit = out
      byOrg.set(k, hit)
    }
    return hit
  }
}

/* ───────────── cells ───────────── */

/** One cell of the partition: an org and a cost center (or the unit's Other, or none). */
interface Cell {
  key: string
  org: string
  costCenter: string
  /** Exact modes: the unit's Other. */
  other: boolean
  /** Exact modes: the unit (the guard's breakdown is per unit); rounded modes: the org's key. */
  group: string
  /** Exact and open modes: the business unit ('' in the other modes). */
  unit: string
  /**
   * Exact and open modes: the department every seat of the cell sits in (a cost center nests in one),
   * null for the unit's Other and for a cell whose seats name more than one: the GL account's org.
   */
  department: string | null
}

/** Line sums of a cell in a month, by currency. */
interface Sums {
  local: Record<string, number>
  usd: Record<string, number>
  /** Every line's rate the same in this month (NaN: none yet; -1: mixed). */
  rate: number
  /** A line was summed (any line, whatever its amount). */
  any: boolean
}

const LOCAL_FIELDS = ['base', 'bonus', 'burden', 'benefits', 'oneTime', 'vacancy'] as const
const zeroRecord = (fields: readonly string[]): Record<string, number> =>
  Object.fromEntries(fields.map((f) => [f, 0]))

/** What one cell holds over the grid: heads and FTE by month, and line sums by month and currency. */
interface CellFacts {
  heads: Float64Array
  fte: Float64Array
  sums: Map<string, Sums>[]
}

/** The months' places in the grid. */
const placeOf = (months: readonly Month[]): Map<Month, number> => new Map(months.map((m, i) => [m, i]))

/** Average FTE over the window, each month weighted by its days (Forecast > Variance's measure). */
function averageFte(fte: Float64Array, idx: readonly number[], months: readonly Month[]): number {
  let num = 0
  let den = 0
  idx.forEach((i, k) => {
    const d = daysInMonth(months[k])
    num += fte[i] * d
    den += d
  })
  return den ? num / den : 0
}

/** The cells' facts from the lines of the positions that `cellOf` places. */
function cellFacts(
  lines: readonly PlanLine[],
  grid: readonly Month[],
  cellOf: (positionId: string) => Cell | null,
  cells: Map<string, Cell>,
): Map<string, CellFacts> {
  const at = placeOf(grid)
  const n = grid.length
  const out = new Map<string, CellFacts>()
  const placed = new Map<string, Cell | null>()
  for (const l of lines) {
    const i = at.get(l.month)
    if (i === undefined || !l.positionId) continue
    let cell = placed.get(l.positionId)
    if (cell === undefined) {
      cell = cellOf(l.positionId)
      placed.set(l.positionId, cell)
      if (cell) {
        const known = cells.get(cell.key)
        if (!known) cells.set(cell.key, cell)
        // A cell whose seats name two departments reads the unit's account (no split, SA-7).
        else if (known.department !== cell.department) known.department = null
      }
    }
    if (!cell) continue
    let f = out.get(cell.key)
    if (!f) {
      f = {
        heads: new Float64Array(n),
        fte: new Float64Array(n),
        sums: Array.from({ length: n }, () => new Map<string, Sums>()),
      }
      out.set(cell.key, f)
    }
    f.heads[i] += l.heads
    f.fte[i] += lineFte(l)
    let s = f.sums[i].get(l.currency)
    if (!s) {
      s = { local: zeroRecord(LOCAL_FIELDS), usd: zeroRecord(COST_COMPONENTS), rate: Number.NaN, any: false }
      f.sums[i].set(l.currency, s)
    }
    for (const k of LOCAL_FIELDS) s.local[k] += l.local[k]
    for (const k of COST_COMPONENTS) s.usd[k] += l.usd[k]
    // Every line counts, whatever its amount: a month of unpaid leave keeps its currency and rate,
    // so which currency a row is in never reads anyone's leave (C26).
    s.any = true
    if (Number.isNaN(s.rate)) s.rate = l.rate
    else if (s.rate !== -1 && Math.abs(s.rate - l.rate) > 1e-12) s.rate = -1
  }
  return out
}

/** A cell's sums over a period's months, by currency. */
interface PeriodSums {
  /** Currencies with a line in the period, in order (whatever the lines' amounts). */
  currencies: string[]
  byCurrency: Map<string, { local: Record<string, number>; usd: Record<string, number>; rate: number | null }>
}

function periodSums(f: CellFacts | undefined, idx: readonly number[]): PeriodSums {
  const byCurrency: PeriodSums['byCurrency'] = new Map()
  const live = new Set<string>()
  if (f)
    for (const i of idx)
      for (const [cur, s] of f.sums[i]) {
        let acc = byCurrency.get(cur)
        if (!acc) {
          acc = { local: zeroRecord(LOCAL_FIELDS), usd: zeroRecord(COST_COMPONENTS), rate: null }
          byCurrency.set(cur, acc)
        }
        for (const k of LOCAL_FIELDS) acc.local[k] += s.local[k]
        for (const k of COST_COMPONENTS) acc.usd[k] += s.usd[k]
        if (!s.any) continue
        live.add(cur)
        // The period's rate: one rate over every line of the period, else none.
        if (s.rate === -1) acc.rate = Number.NaN
        else if (acc.rate === null) acc.rate = s.rate
        else if (!Number.isNaN(acc.rate) && Math.abs(acc.rate - s.rate) > 1e-12) acc.rate = Number.NaN
      }
  return { currencies: [...live].sort(), byCurrency }
}

const localLoaded = (local: Record<string, number>): number => LOCAL_FIELDS.reduce((a, k) => a + local[k], 0)
const usdLoaded = (usd: Record<string, number>): number => LOCAL_FIELDS.reduce((a, k) => a + usd[k], 0)

/* ───────────── rows ───────────── */

/** The costed people behind each row's amount (the guard's row for its cell), kept by row. */
const COSTED = new WeakMap<object, number>()

/**
 * The costed people behind a row's amount over its period (7.2 rule 1): the guard's row for its cell
 * (exact modes) or its org's total (rounded modes); null for a row with no amount, a Manager row, and
 * every row of the open file. Leak tests tag amounts with it.
 */
export const costedOfRow = (r: AnyLongRow): number | null => COSTED.get(r) ?? null

/** Each row's `costedOfRow`, in row order. */
export const costedOfRows = (rows: readonly AnyLongRow[]): (number | null)[] => rows.map(costedOfRow)

/** What `longRowsOf` builds rows for. */
export interface LongRowsInput {
  /** The positions whose heads the rows count (the scope and filters). */
  ids: ReadonlySet<string>
  /** The positions whose cost the rows read (rounded modes add a tree's own seats). */
  costIds: ReadonlySet<string>
  /** Why cost cannot show (`costFit`), or null. */
  fit: string | null
  /** Exact modes: the members are a filter's share of their units (`isPartialCostFilter`). */
  partial: boolean
  source: LongSource
}

/** The rows, periods, totals and note of one version (see the module comment). */
interface Built {
  rows: AnyLongRow[]
  periods: LongPeriod[]
  totals: ControlTotal[]
  note: string | null
  plan: PlanHeader
  /** Each period's costed people behind its loaded control total (the scope's guard total), by period key. */
  costedByPeriod: Record<string, number | null>
  /** Exact modes: the component control totals (`ComponentTotal`). */
  componentTotals: ComponentTotal[]
}

const NOTE_ORDER = ['FY', 'YTD', 'QTD']

/** The long CSV's rows for a version, for the positions and fit given (see the module comment). */
export function longRowsOf(ctx: AnalyticsContext, v: AnyVersion, input: LongRowsInput): Built | null {
  const src = sourceOf(ctx, v, input.source)
  if (!src) return null
  const mode = ctx.guard.mode
  const facts = factsOf(ctx, v, input.source)
  const periods = longPeriodsOf(ctx, v)
  const grid = gridMonths(v)
  const at = placeOf(grid)
  const rows: AnyLongRow[] = []
  const notes = new Map<string, string | null>()
  const rounded = new Map<string, number | null>()
  const costedByPeriod: Record<string, number | null> = {}
  const componentTotals: ComponentTotal[] = []
  const cells = new Map<string, Cell>()
  const cellOf = cellRule(ctx, mode, src, input)
  const all = cellFacts(src.lines, grid, cellOf, cells)
  const order = [...cells.values()].sort(
    (a, b) =>
      a.org.localeCompare(b.org) ||
      Number(a.other) - Number(b.other) ||
      a.costCenter.localeCompare(b.costCenter),
  )
  const accounts = accountsOf(ctx, v)
  const amountMembers = (months: readonly Month[]): CostMember[] =>
    membersIn(ctx, src.lines, months, input.costIds)

  for (const p of periods) {
    const idx = p.months.map((m) => at.get(m) as number)
    const last = idx[idx.length - 1]
    const measure = (cell: Cell): { heads: number; fte: number } => {
      const f = all.get(cell.key)
      return f ? { heads: f.heads[last], fte: averageFte(f.fte, idx, p.months) } : { heads: 0, fte: 0 }
    }
    if (mode === 'none') {
      for (const cell of order) rows.push(headsRow(facts, p, cell, measure(cell)))
      continue
    }
    if (mode === 'rounded') {
      const r = roundedRows(
        ctx,
        src,
        p,
        idx,
        order,
        all,
        measure,
        facts,
        input,
        amountMembers,
        rows,
        notes,
        rounded,
      )
      costedByPeriod[p.key] = r
      continue
    }
    const members = amountMembers(p.months)
    const figures = exactFigures(ctx, src, members, input, mode)
    if (mode === 'exact') componentTotals.push(...componentTotalsOf(p.key, figures, ctx.scopeLabel))
    if (p.window) notes.set(p.key, figures.scope?.note ?? null)
    costedByPeriod[p.key] = figures.scope ? figures.scope.total.costed : peopleOf(members).size
    for (const cell of order) {
      const m = measure(cell)
      const sums = periodSums(all.get(cell.key), idx)
      if (!m.heads && !m.fte && !sums.byCurrency.size) continue
      if (mode === 'open') rows.push(...openRows(facts, p, cell, m, sums, accounts(cell)))
      else rows.push(...exactRows(ctx, facts, p, cell, m, sums, figures, accounts(cell)))
    }
  }
  const note = NOTE_ORDER.map((k) => notes.get(k)).find((x) => x != null) ?? null
  // The open file's split by component names its scope as the screen does ("Whole company"), not
  // "Every unit in this file" (fix step, review SB-1).
  const totals = controlTotals({
    rows,
    mode,
    scopeLabel: ctx.scopeLabel,
    ...(mode === 'rounded' ? { roundedLoaded: rounded } : {}),
  })
  return { rows, periods, totals, note, plan: facts.plan, costedByPeriod, componentTotals }
}

/** Which cell a position sits in, by mode (see the module comment). */
function cellRule(
  ctx: AnalyticsContext,
  mode: GuardMode,
  src: Source,
  input: LongRowsInput,
): (positionId: string) => Cell | null {
  const seatOf = costSeatOf(ctx)
  const ids = input.ids
  if (mode === 'none') {
    const org = ctx.scopeLabel
    return (id) => {
      const seat = ids.has(id) ? seatOf(id) : null
      return seat
        ? {
            key: `${seat.costCenter}`,
            org,
            costCenter: seat.costCenter,
            other: false,
            group: org,
            unit: '',
            department: null,
          }
        : null
    }
  }
  if (mode === 'rounded') {
    const orgOf = roundedOrgOf(ctx, ids)
    return (id) => {
      const seat = ids.has(id) ? seatOf(id) : null
      const org = seat ? orgOf(id, seat.businessUnit, seat.department) : null
      if (!seat || !org) return null
      return {
        key: `${org.key}\u0001${seat.costCenter}`,
        org: org.label,
        costCenter: seat.costCenter,
        other: false,
        group: org.key,
        unit: '',
        department: null,
      }
    }
  }
  const folds = mode === 'exact' ? (foldsOf(ctx, src.foldVersion) ?? new Map()) : null
  return (id) => {
    const seat = ids.has(id) ? seatOf(id) : null
    if (!seat) return null
    const unit = seat.businessUnit
    const center: Cell = {
      key: `${unit}\u0001${seat.costCenter}`,
      org: unit,
      costCenter: seat.costCenter,
      other: false,
      group: unit,
      unit,
      department: seat.department,
    }
    if (!folds) return center
    const f = folds.get(unit)
    if (f?.shown.includes(seat.costCenter)) return center
    return {
      key: `${unit}\u0001${OTHER}`,
      org: unit,
      costCenter: otherLabel(f ? f.other.length : 1),
      other: true,
      group: unit,
      unit,
      department: null,
    }
  }
}

/** Rounded modes: each position's org, the screen's cost rows (see the module comment). */
function roundedOrgOf(
  ctx: AnalyticsContext,
  ids: ReadonlySet<string>,
): (id: string, unit: string, department: string | null) => { key: string; label: string } | null {
  const scope = ctx.access.scope
  if (scope?.kind === 'tree') {
    const subOf = new Map<string, { key: string; label: string }>()
    for (const s of scope.subOrgs)
      for (const id of s.positionIds)
        if (ids.has(id)) subOf.set(id, { key: `sub:${s.positionId}`, label: s.label })
    const rest = { key: 'scope', label: ctx.scopeLabel }
    return (id) => subOf.get(id) ?? rest
  }
  return (_id, unit, department) =>
    department ? { key: `dept:${department}`, label: department } : { key: `unit:${unit}`, label: unit }
}

/* ───────────── Manager ───────────── */

function headsRow(f: Facts, p: LongPeriod, cell: Cell, m: { heads: number; fte: number }): LongHeadsRow {
  return {
    ...f.facts,
    period: p.key,
    org: cell.org,
    costCenter: cell.costCenter,
    heads: m.heads,
    fte: m.fte,
  }
}

/* ───────────── rows with amounts ───────────── */

interface AmountRowInput {
  account: string
  component: LongComponent
  currency: string
  amountLocal: number | null
  rate: number | null
  amountUsd: number | null
  suppressed: 'Yes' | ''
  suppressedReason: string
}

function amountRow(
  f: Facts,
  p: LongPeriod,
  cell: Cell,
  m: { heads: number; fte: number } | null,
  a: AmountRowInput,
): LongRow {
  return {
    ...f.facts,
    period: p.key,
    org: cell.org,
    costCenter: cell.costCenter,
    account: a.account,
    component: a.component,
    currency: a.currency,
    amountLocal: a.amountLocal,
    rate: a.rate,
    amountUsd: a.amountUsd,
    heads: m ? m.heads : null,
    fte: m ? m.fte : null,
    suppressed: a.suppressed,
    suppressedReason: a.suppressedReason,
    rateSet: f.rateSet,
  }
}

const suppressedRow = (reason: string): AmountRowInput => ({
  account: '',
  component: 'loaded',
  currency: 'USD',
  amountLocal: null,
  rate: null,
  amountUsd: null,
  suppressed: 'Yes',
  suppressedReason: reason,
})

/** The cell's one currency in the period, with its local loaded amount and rate; null when it holds more than one. */
function oneCurrency(sums: PeriodSums): {
  currency: string
  local: Record<string, number>
  usd: Record<string, number>
  rate: number | null
} | null {
  const curs = sums.currencies.length ? sums.currencies : [...sums.byCurrency.keys()].slice(0, 1)
  if (curs.length !== 1) return null
  const s = sums.byCurrency.get(curs[0])
  if (!s) return null
  const rate = curs[0] === 'USD' ? 1 : s.rate == null || Number.isNaN(s.rate) ? null : s.rate
  return { currency: curs[0], local: s.local, usd: s.usd, rate }
}

/** Every currency's sums added (USD only: local amounts are never added across currencies). */
function usdOnly(sums: PeriodSums): Record<string, number> {
  const out = zeroRecord(COST_COMPONENTS)
  for (const s of sums.byCurrency.values()) for (const k of COST_COMPONENTS) out[k] += s.usd[k]
  return out
}

/** Component rows of a cell in one currency (or USD across currencies): non-zero components only. */
function componentRows(
  f: Facts,
  p: LongPeriod,
  cell: Cell,
  m: { heads: number; fte: number },
  first: boolean,
  currency: string,
  local: Record<string, number> | null,
  usd: Record<string, number>,
  rate: number | null,
  accounts: ReadonlyMap<string, string>,
  equity: boolean,
): LongRow[] {
  const out: LongRow[] = []
  const comps: CostComponent[] = [...LOADED_COMPONENTS, ...(equity ? (['equity'] as const) : [])]
  for (const c of comps) {
    const v = usd[c]
    if (Math.abs(v) < 0.005) continue
    const eq = c === 'equity'
    out.push(
      amountRow(f, p, cell, first && !out.length ? m : null, {
        account: accounts.get(c) ?? '',
        component: c,
        // Equity is priced in USD (src/plan/types.ts: no local equity).
        currency: eq ? 'USD' : currency,
        amountLocal: eq ? v : local ? local[c] : null,
        rate: eq ? 1 : rate,
        amountUsd: v,
        suppressed: '',
        suppressedReason: '',
      }),
    )
  }
  return out
}

/** HR admin with the switch on: per currency and component, no fold, no suppression. */
function openRows(
  f: Facts,
  p: LongPeriod,
  cell: Cell,
  m: { heads: number; fte: number },
  sums: PeriodSums,
  accounts: ReadonlyMap<string, string>,
): LongRow[] {
  const out: LongRow[] = []
  const curs = [...sums.byCurrency.keys()].sort()
  for (const [i, cur] of curs.entries()) {
    const s = sums.byCurrency.get(cur)
    if (!s) continue
    const rate = cur === 'USD' ? 1 : s.rate == null || Number.isNaN(s.rate) ? null : s.rate
    out.push(...componentRows(f, p, cell, m, !out.length, cur, s.local, s.usd, rate, accounts, false))
    if (i === curs.length - 1) {
      const all = usdOnly(sums)
      if (Math.abs(all.equity) >= 0.005)
        out.push(
          amountRow(f, p, cell, out.length ? null : m, {
            account: accounts.get('equity') ?? '',
            component: 'equity',
            currency: 'USD',
            amountLocal: all.equity,
            rate: 1,
            amountUsd: all.equity,
            suppressed: '',
            suppressedReason: '',
          }),
        )
    }
  }
  if (!out.length) {
    const one = oneCurrency(sums)
    out.push(
      amountRow(f, p, cell, m, {
        account: '',
        component: 'loaded',
        currency: one?.currency ?? 'USD',
        amountLocal: one ? localLoaded(one.local) : 0,
        rate: one ? one.rate : 1,
        amountUsd: one ? usdLoaded(one.usd) : 0,
        suppressed: '',
        suppressedReason: '',
      }),
    )
  }
  return out
}

/** Exact modes: the guard's figures of a period, per unit, broken down by cost center. */
interface ExactFigures {
  byUnit: Map<string, GuardedFigure>
  /** The scope's total (its note, the control totals' check). */
  scope: GuardedFigure | null
}

function exactFigures(
  ctx: AnalyticsContext,
  src: Source,
  members: readonly CostMember[],
  input: LongRowsInput,
  mode: GuardMode,
): ExactFigures {
  const byUnit = new Map<string, GuardedFigure>()
  if (mode !== 'exact') return { byUnit, scope: null }
  const units = new Map<string, CostMember[]>()
  for (const m of members) {
    const list = units.get(m.seat.businessUnit)
    if (list) list.push(m)
    else units.set(m.seat.businessUnit, [m])
  }
  for (const [unit, list] of units)
    byUnit.set(
      unit,
      guardFigure(ctx, {
        members: list,
        version: src.foldVersion,
        fit: input.fit,
        partial: input.partial,
        by: { key: (m) => m.seat.costCenter, noneLabel: 'No cost center', totalShown: true },
      }),
    )
  const scope = guardFigure(ctx, {
    members,
    version: src.foldVersion,
    fit: input.fit,
    partial: input.partial,
  })
  return { byUnit, scope }
}

const cents = (v: number): number => {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? 0 : r
}

/** A unit's or the scope's guarded total split by component, where the guard shows the split. */
function splitOf(period: string, org: string, label: string, row: CostRow): ComponentTotal | null {
  if (row.hidden || row.componentsHidden || row.totalUsd == null) return null
  const usd = {} as Record<SplitComponent, number>
  for (const c of SPLIT_COMPONENTS) {
    const v = row.amounts[c]
    if (v == null) return null
    usd[c] = cents(v)
  }
  return {
    period,
    org,
    label,
    usdByComponent: usd,
    bandUsd: row.bandUsd == null ? null : cents(row.bandUsd),
    loadedUsd: cents(row.totalUsd),
    costed: row.costed,
  }
}

/**
 * A period's component control totals (review SB-1): the whole scope's (when it covers more than one
 * unit), then each unit's in name order, each only where the guard shows its split (C33 (b)).
 */
function componentTotalsOf(period: string, figures: ExactFigures, scopeLabel: string): ComponentTotal[] {
  const out: ComponentTotal[] = []
  if (figures.byUnit.size > 1 && figures.scope) {
    const t = splitOf(period, '', scopeLabel, figures.scope.total)
    if (t) out.push(t)
  }
  for (const unit of [...figures.byUnit.keys()].sort((a, b) => a.localeCompare(b))) {
    const fig = figures.byUnit.get(unit)
    const t = fig ? splitOf(period, unit, unit, fig.total) : null
    if (t) out.push(t)
  }
  return out
}

/** The guard's row for a cell: its cost center's row, or the unit's Other. */
function guardRowOf(fig: GuardedFigure | undefined, cell: Cell): CostRow | null {
  if (!fig) return null
  const key = cell.other ? OTHER : cell.costCenter
  const row = fig.rows.find((r) => r.key === key)
  if (row) return row
  // A unit whose only cost center is folded shows its whole Other as that center's row (one key).
  if (cell.other && fig.rows.length === 1 && !fig.rows[0].isOther) return fig.rows[0]
  return null
}

/** Finance, and HR admin with the switch off: the guard's row for the cell (see the module comment). */
function exactRows(
  ctx: AnalyticsContext,
  f: Facts,
  p: LongPeriod,
  cell: Cell,
  m: { heads: number; fte: number },
  sums: PeriodSums,
  figures: ExactFigures,
  accounts: ReadonlyMap<string, string>,
): LongRow[] {
  const fig = figures.byUnit.get(cell.group)
  const row = guardRowOf(fig, cell)
  if (!fig || !row || row.totalUsd == null) {
    const why = fig?.reason ?? row?.reason ?? fig?.total.reason ?? hiddenNote(ctx.guard.rules.minCosted)
    return [amountRow(f, p, cell, m, suppressedRow(why))]
  }
  const one = cell.other ? null : oneCurrency(sums)
  if (!row.componentsHidden) {
    const usd = one ? one.usd : usdOnly(sums)
    const split = componentRows(
      f,
      p,
      cell,
      m,
      true,
      one?.currency ?? 'USD',
      one ? one.local : null,
      usd,
      one ? one.rate : null,
      accounts,
      false,
    )
    if (split.length) {
      for (const r of split) COSTED.set(r, row.costed)
      return split
    }
  }
  const out = [
    amountRow(f, p, cell, m, {
      account: '',
      component: 'loaded',
      currency: one?.currency ?? 'USD',
      amountLocal: one ? localLoaded(one.local) : null,
      rate: one ? one.rate : null,
      amountUsd: row.totalUsd,
      suppressed: '',
      suppressedReason: row.componentsHidden ? (row.reason ?? '') : '',
    }),
  ]
  COSTED.set(out[0], row.costed)
  return out
}

/* ───────────── rounded modes ───────────── */

function roundedRows(
  ctx: AnalyticsContext,
  src: Source,
  p: LongPeriod,
  _idx: readonly number[],
  order: readonly Cell[],
  all: Map<string, CellFacts>,
  measure: (cell: Cell) => { heads: number; fte: number },
  facts: Facts,
  input: LongRowsInput,
  amountMembers: (months: readonly Month[]) => CostMember[],
  rows: AnyLongRow[],
  notes: Map<string, string | null>,
  rounded: Map<string, number | null>,
): number | null {
  if (!p.window) {
    rounded.set(p.key, null)
    for (const cell of order) {
      const m = measure(cell)
      if (!m.heads && !m.fte && !all.has(cell.key)) continue
      rows.push(amountRow(facts, p, cell, m, suppressedRow(ROUNDED_HEADS_REASON)))
    }
    return null
  }
  // One row per org: its cells' heads and FTE added, its cost the guard's total where it is a union.
  const orgs = new Map<string, { cell: Cell; heads: number; fte: number; ids: Set<string> }>()
  for (const cell of order) {
    const m = measure(cell)
    let o = orgs.get(cell.group)
    if (!o) {
      o = { cell: { ...cell, key: cell.group, costCenter: '' }, heads: 0, fte: 0, ids: new Set() }
      orgs.set(cell.group, o)
    }
    o.heads += m.heads
    o.fte += m.fte
  }
  const members = amountMembers(p.months)
  const managerOf = managerOfIn(ctx)
  const seatOf = costSeatOf(ctx)
  const orgOf = roundedOrgOf(ctx, input.costIds)
  const byOrg = new Map<string, CostMember[]>()
  for (const mem of members) {
    const seat = seatOf(mem.positionId)
    const org = seat ? orgOf(mem.positionId, seat.businessUnit, seat.department) : null
    if (!org) continue
    const list = byOrg.get(org.key)
    if (list) list.push(mem)
    else byOrg.set(org.key, [mem])
  }
  for (const id of input.costIds) {
    const seat = seatOf(id)
    const org = seat ? orgOf(id, seat.businessUnit, seat.department) : null
    if (org) orgs.get(org.key)?.ids.add(id)
  }
  const scope = guardFigure(ctx, { members, version: src.foldVersion, fit: input.fit })
  rounded.set(p.key, scope.total.totalUsd)
  notes.set(p.key, scope.note)
  for (const [key, o] of orgs) {
    const m = { heads: o.heads, fte: o.fte }
    const union = o.ids.size > 0 && isUnionOfAtoms(o.ids, ctx.guard.atoms, managerOf)
    if (!union) {
      rows.push(amountRow(facts, p, o.cell, m, suppressedRow(ROUNDED_HEADS_REASON)))
      continue
    }
    const fig = guardFigure(ctx, { members: byOrg.get(key) ?? [], version: src.foldVersion, fit: input.fit })
    const v = fig.total.totalUsd
    if (v == null) {
      rows.push(
        amountRow(
          facts,
          p,
          o.cell,
          m,
          suppressedRow(fig.reason ?? fig.total.reason ?? hiddenNote(ctx.guard.rules.minCosted)),
        ),
      )
      continue
    }
    const row = amountRow(facts, p, o.cell, m, {
      account: '',
      component: 'loaded',
      currency: 'USD',
      amountLocal: null,
      rate: null,
      amountUsd: v,
      suppressed: '',
      suppressedReason: '',
    })
    COSTED.set(row, fig.total.costed)
    rows.push(row)
  }
  return scope.total.totalUsd == null ? null : scope.total.costed
}

/* ───────────── the model ───────────── */

const cache = new WeakMap<AnalyticsContext, Map<string, LongCsvModel>>()

/** The version the options name, else the context's shown version. */
export function versionFor(ctx: AnalyticsContext, versionId?: string): AnyVersion | null {
  if (versionId) return ctx.versions.find((v) => v.versionId === versionId) ?? null
  return ctx.version ?? workingFor(ctx, null)
}

/** The long CSV's rows, totals and note for the context's mode, scope, filters and version. */
export function longCsvOf(ctx: AnalyticsContext, opts: LongCsvOptions = {}): LongCsvModel {
  const source = opts.source ?? 'version'
  const key = `${opts.versionId ?? ''}|${source}`
  let byKey = cache.get(ctx)
  if (!byKey) {
    byKey = new Map()
    cache.set(ctx, byKey)
  }
  const hit = byKey.get(key)
  if (hit) return hit
  const out = buildModel(ctx, opts.versionId, source)
  byKey.set(key, out)
  return out
}

function emptyModel(mode: GuardMode, empty: string, v: AnyVersion | null): LongCsvModel {
  return {
    mode,
    rows: [],
    totals: [],
    note: null,
    empty,
    versionId: v?.versionId ?? null,
    plan: null,
    periods: [],
    costed: [],
    costedByPeriod: {},
    componentTotals: [],
  }
}

function buildModel(ctx: AnalyticsContext, versionId: string | undefined, source: LongSource): LongCsvModel {
  const mode = ctx.guard.mode
  const v = versionFor(ctx, versionId)
  if (ctx.access.unset) return emptyModel(mode, NO_PICK_TEXT, v)
  if (!v || v.state === 'retired') return emptyModel(mode, NO_VERSION_TEXT, v)
  const built = longRowsOf(ctx, v, {
    ids: scopeOf(ctx).ids,
    costIds: costIdsOf(ctx),
    fit: fitOf(ctx, source === 'forecast' ? (workingFor(ctx, v) ?? v) : v),
    partial: isPartialCostFilter(ctx.filters),
    source,
  })
  if (!built) return emptyModel(mode, NO_FORECAST_TEXT, v)
  return {
    mode,
    rows: built.rows,
    totals: built.totals,
    note: built.note,
    empty: built.rows.length ? null : 'No position in this scope.',
    versionId: v.versionId,
    plan: built.plan,
    periods: built.periods,
    costed: costedOfRows(built.rows),
    costedByPeriod: built.costedByPeriod,
    componentTotals: built.componentTotals,
  }
}

/** Every position in the data (Finance and HR admin have no scope): the load file's positions. */
export const everyPosition = (ctx: AnalyticsContext): ReadonlySet<string> => allIds(ctx)

const allMemo = new WeakMap<object, ReadonlySet<string>>()
function allIds(ctx: AnalyticsContext): ReadonlySet<string> {
  const rows = placementOf(ctx)
  let hit = allMemo.get(rows)
  if (!hit) {
    hit = new Set(rows.keys())
    allMemo.set(rows, hit)
  }
  return hit
}
