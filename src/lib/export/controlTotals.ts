/**
 * Control totals (docs/PLAN.md 14.1 item 4): Σ heads, Σ FTE, Σ USD per component and the count of
 * suppressed cells, per period, computed from the exported rows (the long CSV and the load file).
 *
 *  - Finance and HR admin: Σ heads, Σ FTE, Σ `amountUsd` per component, the loaded total (Σ of the
 *    'loaded' rows and the `LOADED_COMPONENTS` rows) and the suppressed cells, and the split by
 *    component of the scope and of each unit where the rows split (`components`, below).
 *  - HRBP and Leader: Σ heads, Σ FTE and the screen's rounded loaded total (`sumRounded` over the
 *    scope's kept atoms, handed in as `roundedLoaded`), never a plain sum of rounded rows; no
 *    per-component totals.
 *  - Manager: Σ heads and Σ FTE only.
 *
 * The split by component (lead decision D-SPEC, M4 review SB-1): Σ USD per component of the file's
 * whole scope and of each business unit (`org`), per period, from the rows, where every amount row of
 * the scope (or the unit) in the period is a shown component row. HR admin's file with Show pay
 * amounts on splits every cell, so it states the split for the scope and every unit; it only adds up
 * amounts the file already holds. Finance's rows (and HR admin's with the switch off) are loaded cost
 * per cost center (C33 (b): a cost center is never a whole unit), so they give no split here: its unit
 * and company splits come from the screen's guarded figures (src/views/finance/engine/longCsv.ts
 * `componentTotalLines`, in the same words as `controlTotalLines`).
 *
 * Totals use the same folded groups as the screen, so no control total, or screen total minus the
 * shown rows, equals a hidden group of 1 to 4 or a hidden component amount (src/cost tests). Pure.
 *
 * Readings taken here (exports builder, M4):
 *  - A row's heads and FTE count once: the long CSV puts a cell's heads and FTE on its first row and
 *    leaves them blank (null) on its other component rows, so Σ is the scope's.
 *  - A suppressed cell is a row with `suppressed` Yes (its amount cells are empty); Manager files
 *    count none, having no amount columns.
 *  - Sums are kept to the cent (amounts) and to a millionth (FTE), so float noise from adding
 *    thousands of rows never reaches a file.
 *
 * M4 freeze (docs/CONTRACTS-M4.md): the shapes are frozen; the exports builder filled the bodies.
 * M4 review additions: `ComponentSplit`, `ControlTotal.components`, `ControlTotalsInput.scopeLabel`,
 * `ControlTotalLineOptions`, `SPLIT_WORDS`, `controlTotalColumns`, `componentKey` and the component
 * keys of `controlTotalRows`.
 */
import type { Column } from '@/charts/types'
import type { CostComponent, GuardMode } from '@/cost/guard'
import type { AnyLongRow, LongComponent, LongRow } from './longCsv'

/** The split by component of the file's whole scope, or of one business unit, in one period. */
export interface ComponentSplit {
  /** The business unit (the rows' `org`), or '' for the file's whole scope. */
  org: string
  /** The unit, or the scope's label (`ControlTotalsInput.scopeLabel`). */
  label: string
  /** Σ USD per component, to the cent; a loaded component the rows do not hold is 0. */
  usdByComponent: Readonly<Partial<Record<CostComponent, number>>>
  /** Σ of the loaded components (equity apart), to the cent. */
  loadedUsd: number
}

/** One period's control totals. */
export interface ControlTotal {
  /** 'YYYY-MM', 'QTD', 'YTD' or 'FY'. */
  period: string
  heads: number
  fte: number
  /** Σ USD per component (Finance and HR admin); null in rounded and Manager files. */
  usdByComponent: Readonly<Partial<Record<LongComponent, number>>> | null
  /** The period's loaded total (exact: from the rows; rounded: the screen's `sumRounded`); null in Manager files. */
  loadedUsd: number | null
  /** Rows whose amount cell is empty (`suppressed` Yes); 0 in Manager files. */
  suppressedCells: number
  /**
   * The split by component where the rows split (see the module comment): the scope first (`org`
   * ''), then each unit when the rows hold more than one; absent when none splits in the period.
   */
  components?: readonly ComponentSplit[]
}

export interface ControlTotalsInput {
  rows: readonly AnyLongRow[]
  mode: GuardMode
  /** Rounded modes: the screen's rounded loaded total per period, by period key (null where it reads "—"). */
  roundedLoaded?: ReadonlyMap<string, number | null>
  /**
   * The file's scope in words ("Whole company"), naming the scope's split; when not given, the one
   * unit the rows hold, else `ALL_UNITS_LABEL`.
   */
  scopeLabel?: string
}

/** The scope's split's name when the caller gives none and the rows hold more than one unit. */
export const ALL_UNITS_LABEL = 'Every unit in this file'

const cents = (v: number): number => {
  const r = Math.round(v * 100) / 100
  return Object.is(r, -0) ? 0 : r
}
const millionths = (v: number): number => {
  const r = Math.round(v * 1e6) / 1e6
  return Object.is(r, -0) ? 0 : r
}

/**
 * Whether a component's rows add to the loaded total: 'loaded' and every `LOADED_COMPONENTS` entry,
 * that is every component but equity ("incl. SBC" is apart). Written without importing ./longCsv's
 * values, which import this module's (tested equal).
 */
export const addsToLoaded = (c: LongComponent): boolean => c !== 'equity'

/** The loaded components in file order (./longCsv.ts `LOADED_COMPONENTS`, tested equal); equity is apart. */
const SPLIT_ORDER: readonly CostComponent[] = ['base', 'bonus', 'burden', 'benefits', 'oneTime', 'vacancy']

/**
 * Each component as a control total line names it, as Finance's component control totals do
 * (src/views/finance/engine/longCsv.ts `componentTotalLines`): "one-time", "vacancy allowance".
 */
export const SPLIT_WORDS: Readonly<Record<CostComponent, string>> = {
  base: 'base',
  bonus: 'bonus',
  burden: 'burden',
  benefits: 'benefits',
  oneTime: 'one-time',
  vacancy: 'vacancy allowance',
  equity: 'equity (SBC)',
}

/** Whether a row carries the amount columns (./longCsv.ts `isAmountRow`). */
const hasAmounts = (r: AnyLongRow): r is LongRow => 'amountUsd' in r

interface Acc {
  heads: number
  fte: number
  usd: Map<LongComponent, number>
  suppressed: number
}

/** One unit's (or the scope's) amount rows in a period, as the split reads them. */
interface OrgAcc {
  /** Σ USD per component of its rows. */
  usd: Map<CostComponent, number>
  /** Every amount row is a shown component row (no loaded-only, hidden or empty row). */
  split: boolean
}

const newOrgAcc = (): OrgAcc => ({ usd: new Map(), split: true })

function addToOrg(acc: OrgAcc, r: LongRow): void {
  const usd = r.amountUsd
  if (r.component === 'loaded' || typeof usd !== 'number' || !Number.isFinite(usd)) {
    acc.split = false
    return
  }
  acc.usd.set(r.component, (acc.usd.get(r.component) ?? 0) + usd)
}

/** An org's split as stated: every loaded component (0 where the rows hold none), equity when held. */
function splitOf(org: string, label: string, acc: OrgAcc): ComponentSplit | null {
  if (!acc.split || !acc.usd.size) return null
  const usdByComponent: Partial<Record<CostComponent, number>> = {}
  let loaded = 0
  for (const c of SPLIT_ORDER) {
    const v = acc.usd.get(c) ?? 0
    usdByComponent[c] = cents(v)
    loaded += v
  }
  const equity = acc.usd.get('equity')
  if (equity !== undefined) usdByComponent.equity = cents(equity)
  return { org, label, usdByComponent, loadedUsd: cents(loaded) }
}

/** The split by component of one period: the scope first, then each unit when there is more than one. */
function componentsOf(
  orgs: ReadonlyMap<string, OrgAcc>,
  scope: OrgAcc,
  scopeLabel: string | undefined,
): ComponentSplit[] {
  const units = [...orgs.keys()].filter(Boolean)
  const label = scopeLabel ?? (units.length === 1 ? units[0] : ALL_UNITS_LABEL)
  const out: ComponentSplit[] = []
  const own = splitOf('', label, scope)
  if (own) out.push(own)
  if (units.length > 1)
    for (const org of units) {
      const s = splitOf(org, org, orgs.get(org) as OrgAcc)
      if (s) out.push(s)
    }
  return out
}

/** The control totals of every period the rows hold, in the rows' period order. */
export function controlTotals(input: ControlTotalsInput): ControlTotal[] {
  const { mode } = input
  const exact = mode === 'exact' || mode === 'open'
  const order: string[] = []
  const by = new Map<string, Acc>()
  const orgsBy = new Map<string, Map<string, OrgAcc>>()
  const scopeBy = new Map<string, OrgAcc>()
  for (const r of input.rows) {
    let acc = by.get(r.period)
    if (!acc) {
      acc = { heads: 0, fte: 0, usd: new Map(), suppressed: 0 }
      by.set(r.period, acc)
      order.push(r.period)
      orgsBy.set(r.period, new Map())
      scopeBy.set(r.period, newOrgAcc())
    }
    if (typeof r.heads === 'number' && Number.isFinite(r.heads)) acc.heads += r.heads
    if (typeof r.fte === 'number' && Number.isFinite(r.fte)) acc.fte += r.fte
    if (mode === 'none' || !hasAmounts(r)) continue
    if (r.suppressed === 'Yes') acc.suppressed++
    if (!exact) continue
    const usd = r.amountUsd
    if (typeof usd === 'number' && Number.isFinite(usd))
      acc.usd.set(r.component, (acc.usd.get(r.component) ?? 0) + usd)
    const orgs = orgsBy.get(r.period) as Map<string, OrgAcc>
    let org = orgs.get(r.org)
    if (!org) {
      org = newOrgAcc()
      orgs.set(r.org, org)
    }
    addToOrg(org, r)
    addToOrg(scopeBy.get(r.period) as OrgAcc, r)
  }
  return order.map((period) => {
    const acc = by.get(period) as Acc
    const base = { period, heads: millionths(acc.heads), fte: millionths(acc.fte) }
    if (mode === 'none') return { ...base, usdByComponent: null, loadedUsd: null, suppressedCells: 0 }
    if (!exact) {
      // Rounded modes: the screen's sumRounded total, never a sum of the rows' rounded amounts.
      const v = input.roundedLoaded?.get(period)
      return {
        ...base,
        usdByComponent: null,
        loadedUsd: typeof v === 'number' && Number.isFinite(v) ? v : null,
        suppressedCells: acc.suppressed,
      }
    }
    const usdByComponent: Partial<Record<LongComponent, number>> = {}
    let loaded: number | null = null
    for (const [component, v] of acc.usd) {
      usdByComponent[component] = cents(v)
      if (addsToLoaded(component)) loaded = (loaded ?? 0) + v
    }
    const components = componentsOf(
      orgsBy.get(period) as Map<string, OrgAcc>,
      scopeBy.get(period) as OrgAcc,
      input.scopeLabel,
    )
    return {
      ...base,
      usdByComponent,
      loadedUsd: loaded === null ? null : cents(loaded),
      suppressedCells: acc.suppressed,
      ...(components.length ? { components } : {}),
    }
  })
}

const count = (n: number): string => n.toLocaleString('en-US', { maximumFractionDigits: 2 })
const usd = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** "1 head", "1,612 heads", "588.5 heads" (plain counts, R86; M4 review CP-5). */
const heads = (n: number): string => `${count(n)} ${n === 1 ? 'head' : 'heads'}`

/** What `controlTotalLines` states of the split by component. */
export interface ControlTotalLineOptions {
  /**
   * 'all' (the default): the scope's split and each unit's; 'scope': the scope's only (a slide, where
   * every unit's would not fit); 'none'.
   */
  components?: 'all' | 'scope' | 'none'
}

/**
 * A split as a line, in Finance's component control totals' words: "Control totals FY, Operations,
 * by component: base 1,234.00 USD, bonus …, one-time …, vacancy allowance … USD, equity (SBC) … USD,
 * loaded … USD".
 */
/**
 * Amounts in whole cents that add to a total's whole cents (M4 recheck SB-1-a): each part to the
 * nearest cent, then moved a cent at a time, the part its rounding left furthest off in the gap's
 * direction first (largest remainder; ties: the first), until they add up. No part moves by more
 * than a cent, and a part of exactly 0 stays 0. Pure.
 */
export function centsAddingTo(parts: readonly number[], total: number): number[] {
  const exact = parts.map((x) => x * 100)
  const cents = exact.map((x) => Math.round(x))
  let gap = Math.round(total * 100) - cents.reduce((a, x) => a + x, 0)
  for (let pass = 0; gap !== 0 && pass < exact.length; pass++) {
    const dir = Math.sign(gap)
    let best = -1
    for (let i = 0; i < exact.length; i++) {
      if (exact[i] === 0 || Math.abs(cents[i] + dir - exact[i]) > 1) continue
      if (best < 0 || (exact[i] - cents[i]) * dir > (exact[best] - cents[best]) * dir) best = i
    }
    if (best < 0) break
    cents[best] += dir
    gap -= dir
  }
  return cents
}

export function componentSplitLine(period: string, split: ComponentSplit): string {
  // Written in whole cents that add to the loaded total, as Finance's lines are (SB-1-a).
  const written = centsAddingTo(
    SPLIT_ORDER.map((c) => split.usdByComponent[c] ?? 0),
    split.loadedUsd,
  )
  const parts = SPLIT_ORDER.map((c, i) => `${SPLIT_WORDS[c]} ${usd(written[i] / 100)} USD`)
  const equity = split.usdByComponent.equity
  if (typeof equity === 'number') parts.push(`${SPLIT_WORDS.equity} ${usd(equity)} USD`)
  parts.push(`loaded ${usd(split.loadedUsd)} USD`)
  return `Control totals ${period}, ${split.label}, by component: ${parts.join(', ')}`
}

/**
 * One preamble line per period: "Control totals FY: 1,612 heads, 1,598.4 FTE, loaded 312,400,000.00
 * USD, 14 suppressed cells" (Manager: heads and FTE only). A period whose loaded total reads "—"
 * states heads, FTE and its suppressed cells. Each period's split by component follows its line
 * (`componentSplitLine`): the scope's, then each unit's.
 */
export function controlTotalLines(
  totals: readonly ControlTotal[],
  mode: GuardMode,
  opts: ControlTotalLineOptions = {},
): string[] {
  const which = opts.components ?? 'all'
  return totals.flatMap((t) => {
    const parts = [heads(t.heads), `${count(t.fte)} FTE`]
    if (mode !== 'none') {
      if (t.loadedUsd !== null) parts.push(`loaded ${usd(t.loadedUsd)} USD`)
      parts.push(`${count(t.suppressedCells)} suppressed ${t.suppressedCells === 1 ? 'cell' : 'cells'}`)
    }
    const lines = [`Control totals ${t.period}: ${parts.join(', ')}`]
    if ((mode === 'exact' || mode === 'open') && which !== 'none')
      for (const split of t.components ?? [])
        if (which === 'all' || !split.org) lines.push(componentSplitLine(t.period, split))
    return lines
  })
}

/** The columns of a control totals table (Finance > Export, the load file's workbook): money `cost: true`. */
export const CONTROL_TOTAL_COLUMNS: readonly Column[] = [
  { key: 'period', label: 'Period', format: 'text' },
  { key: 'heads', label: 'Heads', format: 'num1' },
  { key: 'fte', label: 'FTE', format: 'num2' },
  { key: 'loadedUsd', label: 'Loaded cost (USD)', format: 'moneyFull', cost: true },
  { key: 'suppressedCells', label: 'Suppressed cells', format: 'int' },
]

/** A component's column label in a control totals table. */
const COMPONENT_LABEL: Readonly<Record<CostComponent, string>> = {
  base: 'Base (USD)',
  bonus: 'Bonus (USD)',
  burden: 'Burden (USD)',
  benefits: 'Benefits (USD)',
  oneTime: 'One-time (USD)',
  vacancy: 'Vacancy allowance (USD)',
  equity: 'Equity, SBC (USD)',
}

/** A component's key in a control totals row: 'baseUsd', 'oneTimeUsd'. */
export const componentKey = (c: CostComponent): string => `${c}Usd`

/** The scope's split of a period, if it has one. */
const scopeSplit = (t: ControlTotal): ComponentSplit | null =>
  t.components?.[0]?.org === '' ? t.components[0] : null

/** The components of the scope's split in any of these totals, in file order. */
function scopeComponents(totals: readonly ControlTotal[]): CostComponent[] {
  const seen = new Set<CostComponent>()
  for (const t of totals)
    for (const c of Object.keys(scopeSplit(t)?.usdByComponent ?? {})) seen.add(c as CostComponent)
  return [...SPLIT_ORDER, 'equity' as const].filter((c) => seen.has(c))
}

/**
 * The columns of these totals' table: `CONTROL_TOTAL_COLUMNS`, then one `cost: true` column per
 * component of the scope's split where any period has one (none in Manager or rounded mode).
 */
export function controlTotalColumns(totals: readonly ControlTotal[], mode: GuardMode): readonly Column[] {
  if (mode !== 'exact' && mode !== 'open') return CONTROL_TOTAL_COLUMNS
  const extra = scopeComponents(totals).map(
    (c): Column => ({ key: componentKey(c), label: COMPONENT_LABEL[c], format: 'moneyFull', cost: true }),
  )
  return extra.length ? [...CONTROL_TOTAL_COLUMNS, ...extra] : CONTROL_TOTAL_COLUMNS
}

/**
 * Control totals as rows of `controlTotalColumns` (no amount key in Manager mode, 7.6): the scope's
 * split by component under `componentKey(c)`, empty (null) in a period whose split does not show.
 */
export function controlTotalRows(
  totals: readonly ControlTotal[],
  mode: GuardMode,
): Record<string, unknown>[] {
  const comps = mode === 'exact' || mode === 'open' ? scopeComponents(totals) : []
  return totals.map((t) => {
    if (mode === 'none')
      return { period: t.period, heads: t.heads, fte: t.fte, suppressedCells: t.suppressedCells }
    const row: Record<string, unknown> = {
      period: t.period,
      heads: t.heads,
      fte: t.fte,
      loadedUsd: t.loadedUsd,
      suppressedCells: t.suppressedCells,
    }
    const split = scopeSplit(t)?.usdByComponent
    for (const c of comps) row[componentKey(c)] = split?.[c] ?? null
    return row
  })
}
