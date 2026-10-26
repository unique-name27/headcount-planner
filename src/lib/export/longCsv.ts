/**
 * The long CSV (docs/PLAN.md 14.1 item 3): one row per period × org × cost center × account ×
 * component × currency, with `amountLocal`, `rate`, `amountUsd`, `heads`, `fte`, `suppressed`,
 * `suppressedReason`, and the header facts repeated as columns (`version`, `lockHash`, `asOf`,
 * `proration`, `rateSet`) so the file stands alone. One currency per row; local amounts are never
 * summed across currencies. This module writes rows it is given and checks them; the rows come from
 * the same guarded model as the screen (src/views/finance/engine/longCsv.ts `longCsvOf`), per mode:
 *
 *  - Finance, and HR admin with the switch off: `org` is the business unit; every row's group is a
 *    whole shown cost center or the unit's one Other (k) (`financeFold`, the same fold for every
 *    period, account, component and currency). The Other row is not split by currency: `currency`
 *    USD with `amountLocal` and `rate` blank. A cell where any component has fewer than 5
 *    contributing positions is one row with `component` 'loaded', `account` blank and
 *    `suppressedReason` "Components hidden (fewer than 5 in a component)".
 *  - HR admin with the switch on: no folds and no suppression.
 *  - HRBP and Leader: rows that carry an amount have `period` QTD, YTD or FY only, `org` a union of
 *    atoms the screen shows as a cost row, `costCenter` and `account` blank, `component` 'loaded',
 *    `currency` USD, `amountLocal` and `rate` blank and `amountUsd` the screen's `sumRounded` value;
 *    every other row carries heads and FTE only, `suppressed` Yes and `ROUNDED_HEADS_REASON`.
 *  - Manager: heads and FTE rows only (`LongHeadsRow`: no amount key at all, no rate set, 7.6).
 *
 * Rows of one period partition its positions, and a cell's `heads` and `fte` (heads at the window's
 * last month-end, FTE averaged over the window, as Forecast > Variance measures them) sit on its
 * first row only, blank (null) on its other component rows, so Σ heads of a period is the scope's.
 *
 * Writing (exports builder, M4): `longCsvText` writes the preamble (`headerLines`, "Contains
 * individual pay" first for rows written under the open guard, then the control total lines), a
 * blank line, the column row and the rows, as RFC 4180 CSV with a BOM and CRLF rows. Text cells are
 * formula-guarded; numbers are written as numbers (amounts to the cent, rates to 6 places, heads and
 * FTE to 4, never with exactly three decimals: `longNumber`); an empty cell is empty, never 0. A
 * Manager file writes `LONG_HEADS_COLUMNS` only, whatever a row holds. The facts the rows repeat are
 * the header's: the version's name, `lockLine`, the as-of date (ISO) and the proration as the header
 * words it ("Daily").
 *
 * M4 freeze (docs/CONTRACTS-M4.md): the row shapes, columns, reasons and checks are frozen; the
 * exports builder filled the bodies.
 */
import type { Column, ExportMeta } from '@/charts/types'
import type { CostComponent, GuardMode } from '@/cost/guard'
import { exportNumber } from './columns'
import { type ControlTotal, controlTotalLines } from './controlTotals'
import { csvField } from './csv'
import { downloadBlob, MIME } from './download'
import { headerLines, lockLine, PRORATION_LABEL } from './exportHeader'
import { asOfIso, fileStem } from './names'

/** The to-date and full-year periods (rounded modes carry amounts on these only); months are 'YYYY-MM'. */
export const LONG_WINDOWS = ['QTD', 'YTD', 'FY'] as const
export type LongWindow = (typeof LONG_WINDOWS)[number]

/** A row's component: the loaded total of a cell that is not split, or one component. */
export type LongComponent = 'loaded' | CostComponent

/** The components loaded cost adds up (equity, "incl. SBC", is apart). */
export const LOADED_COMPONENTS: readonly CostComponent[] = [
  'base',
  'bonus',
  'burden',
  'benefits',
  'oneTime',
  'vacancy',
]

/** The header facts every row repeats (Manager rows: no rate set). */
export interface LongFacts {
  version: string
  /** 'sha256-…' for a locked version; "Working, not locked" (`lockLine`). */
  lockHash: string
  /** ISO date. */
  asOf: string
  proration: string
}

/** A heads and FTE row: every Manager row (no amount key). */
export interface LongHeadsRow extends LongFacts {
  /** 'YYYY-MM', or a `LongWindow`. */
  period: string
  org: string
  /** '' when the row is not one cost center's. */
  costCenter: string
  heads: number | null
  fte: number | null
}

/** A row with the amount columns: every row outside Manager mode. */
export interface LongRow extends LongHeadsRow {
  /** The GL account the component posts to (src/data/schema.ts), '' for a loaded row. */
  account: string
  component: LongComponent
  /** ISO code; 'USD' for an Other row and every rounded row. */
  currency: string
  /** Null where blank or suppressed: never 0 for a missing amount, never words. */
  amountLocal: number | null
  rate: number | null
  amountUsd: number | null
  suppressed: 'Yes' | ''
  /**
   * Why an amount is empty, or why a cell whose amount shows is not split by component: '' when the
   * amount shows in full; a loaded-only cell keeps the reason its components are hidden ("Components
   * show for whole units and the company.", "Components hidden (fewer than 5 in a component)") with
   * `suppressed` blank (14.1 item 3, C33 (b); M4 review EX-5).
   */
  suppressedReason: string
  /** "Plan rates (EUR 1.08, ILS 0.27)" or "Actual for closed months, forecast for open". */
  rateSet: string
}

export type AnyLongRow = LongRow | LongHeadsRow

/** Whether a row carries the amount columns. */
export const isAmountRow = (r: AnyLongRow): r is LongRow => 'amountUsd' in r

/** HRBP and Leader: the reason on every row that carries heads and FTE only. */
export const ROUNDED_HEADS_REASON =
  'Cost shows for whole departments and teams at QTD, YTD and full year in this mode.'

/** Every column, in file order (the amount columns `cost: true`). */
export const LONG_CSV_COLUMNS: readonly Column[] = [
  { key: 'period', label: 'period', format: 'text' },
  { key: 'org', label: 'org', format: 'text' },
  { key: 'costCenter', label: 'costCenter', format: 'text' },
  { key: 'account', label: 'account', format: 'text' },
  { key: 'component', label: 'component', format: 'text' },
  { key: 'currency', label: 'currency', format: 'text' },
  { key: 'amountLocal', label: 'amountLocal', format: 'moneyFull', cost: true },
  { key: 'rate', label: 'rate', format: 'num2', cost: true },
  { key: 'amountUsd', label: 'amountUsd', format: 'moneyFull', cost: true },
  { key: 'heads', label: 'heads', format: 'num1' },
  { key: 'fte', label: 'fte', format: 'num2' },
  { key: 'suppressed', label: 'suppressed', format: 'text' },
  { key: 'suppressedReason', label: 'suppressedReason', format: 'text' },
  { key: 'version', label: 'version', format: 'text' },
  { key: 'lockHash', label: 'lockHash', format: 'text' },
  { key: 'asOf', label: 'asOf', format: 'text' },
  { key: 'proration', label: 'proration', format: 'text' },
  { key: 'rateSet', label: 'rateSet', format: 'text' },
]

/** Manager mode's columns: heads and FTE, no amount, suppression or rate column. */
export const LONG_HEADS_COLUMNS: readonly Column[] = LONG_CSV_COLUMNS.filter((c) =>
  ['period', 'org', 'costCenter', 'heads', 'fte', 'version', 'lockHash', 'asOf', 'proration'].includes(c.key),
)

/** The columns a mode's file has: `LONG_HEADS_COLUMNS` in Manager mode, else every column. */
export function longColumns(mode: GuardMode): readonly Column[] {
  return mode === 'none' ? LONG_HEADS_COLUMNS : LONG_CSV_COLUMNS
}

/** The facts the rows repeat, from the export's plan header and as-of date (`lockLine` for the lock). */
export function longFactsOf(meta: ExportMeta): LongFacts {
  const p = meta.plan
  return {
    version: p?.version ?? '',
    lockHash: p ? lockLine(p) : '',
    asOf: asOfIso(meta.asOf) ?? meta.asOf,
    proration: p ? (PRORATION_LABEL[p.proration] ?? String(p.proration)) : '',
  }
}

export interface LongCsvTextOptions {
  mode: GuardMode
  /** Header lines above the column row (`headerLines`, then the control total lines); default true. */
  preamble?: boolean
  /** The unsuppressed load file: "Contains individual pay" first (also whenever `mode` is 'open'). */
  individualPay?: boolean
  /** Control totals to state in the preamble (`controlTotalLines`). */
  totals?: readonly ControlTotal[]
}

/** Decimal places a number keeps in the file, by column (amounts to the cent). */
const LONG_DIGITS: Readonly<Record<string, number>> = {
  amountLocal: 2,
  amountUsd: 2,
  rate: 6,
  heads: 4,
  fte: 4,
}

/**
 * A number as the file writes it: to its column's places at most, and never with exactly three
 * decimals, since "43.871" reads as forty-three thousand where dots group thousands (and the Manager
 * leak scan reads it so): such a number is written "43.8710".
 */
export function longNumber(v: number, key: string): string {
  const digits = LONG_DIGITS[key]
  const n = digits === undefined ? exportNumber(v, undefined) : Number(v.toFixed(digits))
  const s = String(Object.is(n, -0) ? 0 : n)
  return /\.\d{3}$/.test(s) ? `${s}0` : s
}

/** One cell as the file writes it: a number as a number, text guarded and quoted, empty for null. */
function longCell(row: AnyLongRow, key: string): string {
  const v = (row as unknown as Record<string, unknown>)[key]
  if (v == null) return ''
  if (typeof v === 'number') return Number.isFinite(v) ? longNumber(v, key) : ''
  return csvField(String(v))
}

/**
 * The preamble: the header lines, then a control total line per period. "Contains individual pay" is
 * first when asked and whenever the rows are written under the open guard (HR admin with Show pay
 * amounts on: no folds and no suppression), whoever writes them: the Export menu's long CSV and the
 * unsuppressed load file alike (M4 review EX-1, lead decision D-PAYFILES).
 */
export function longPreamble(meta: ExportMeta, opts: LongCsvTextOptions): string[] {
  return [
    ...headerLines(meta, { individualPay: !!opts.individualPay || opts.mode === 'open' }),
    ...controlTotalLines(opts.totals ?? [], opts.mode),
  ]
}

/** The file as text: CSV per RFC 4180 (src/lib/export/csv.ts), BOM and CRLF, numbers as numbers. */
export function longCsvText(rows: readonly AnyLongRow[], meta: ExportMeta, opts: LongCsvTextOptions): string {
  const cols = longColumns(opts.mode)
  const lines: string[] = []
  if (opts.preamble !== false) {
    const pre = longPreamble(meta, opts)
    for (const p of pre) lines.push(csvField(p))
    if (pre.length) lines.push('')
  }
  lines.push(cols.map((c) => csvField(c.label)).join(','))
  for (const r of rows) lines.push(cols.map((c) => longCell(r, c.key)).join(','))
  return `﻿${lines.join('\r\n')}\r\n`
}

/** Download the file: `headcount-planner-<view>-long-<as-of>.csv` unless a name is given. */
export function downloadLongCsv(
  rows: readonly AnyLongRow[],
  meta: ExportMeta,
  opts: LongCsvTextOptions & { fileName?: string },
): void {
  const text = longCsvText(rows, meta, opts)
  downloadBlob(new Blob([text], { type: MIME.csv }), `${opts.fileName ?? fileStem(meta, 'long')}.csv`)
}

/** What `longRowProblems` checks the rows against. */
export interface LongRules {
  mode: GuardMode
  /** Rounded modes: whether an org's positions are a whole union of the last close's atoms. */
  isUnion: (org: string) => boolean
}

/**
 * Every break of 14.1 item 3's rules, one sentence each; empty when the rows keep them. In HRBP and
 * Leader mode: no row with a non-empty amount has a month period, a component other than 'loaded',
 * a cost center, a currency other than USD, a non-empty `amountLocal`, or an org `isUnion` rejects.
 * In Manager mode: no row carries an amount key. In every mode: no suppressed row carries an amount,
 * and no amount is anything but a finite number or null.
 */
export function longRowProblems(rows: readonly AnyLongRow[], rules: LongRules): string[] {
  const out: string[] = []
  const windows: ReadonlySet<string> = new Set(LONG_WINDOWS)
  const isNumberOrNull = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v))
  rows.forEach((r, i) => {
    const where = `Row ${i + 1} (${r.period}, ${r.org || 'no org'})`
    const say = (what: string) => {
      out.push(`${where}: ${what}.`)
    }
    const cells = r as unknown as Record<string, unknown>
    for (const k of ['heads', 'fte'] as const) if (!isNumberOrNull(cells[k])) say(`${k} is not a number`)
    if (rules.mode === 'none') {
      for (const k of AMOUNT_KEYS) if (k in cells) say(`a Manager row carries the ${k} column`)
      if ('rateSet' in cells) say('a Manager row carries the rate set')
      return
    }
    if (!isAmountRow(r)) {
      say('the row has no amount columns')
      return
    }
    for (const k of AMOUNT_KEYS) if (!isNumberOrNull(cells[k])) say(`${k} is not a number or empty`)
    const hasAmount = r.amountUsd !== null || r.amountLocal !== null
    if (r.suppressed !== 'Yes' && r.suppressed !== '') say('suppressed is neither Yes nor blank')
    if (r.suppressed === 'Yes' && (hasAmount || r.rate !== null)) say('a suppressed row carries an amount')
    if (r.suppressed === 'Yes' && !r.suppressedReason) say('a suppressed row gives no reason')
    if (hasAmount && !r.currency) say('an amount has no currency')
    if (rules.mode !== 'rounded' || !hasAmount) return
    if (!windows.has(r.period)) say('a rounded amount on a month period')
    if (r.component !== 'loaded') say(`a rounded amount on the ${r.component} component`)
    if (r.costCenter) say('a rounded amount on a cost center')
    if (r.account) say('a rounded amount on an account')
    if (r.currency !== 'USD') say(`a rounded amount in ${r.currency || 'no currency'}`)
    if (r.amountLocal !== null) say('a rounded amount in local currency')
    if (r.rate !== null) say('a rounded amount with a rate')
    if (!rules.isUnion(r.org)) say('a rounded amount on an org that is not a whole union of atoms')
  })
  return out
}

/** The columns that hold amounts (a Manager row has none of them). */
const AMOUNT_KEYS = ['amountLocal', 'rate', 'amountUsd'] as const
