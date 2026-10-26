/**
 * Numeric amounts with a `Suppressed` flag (docs/PLAN.md 14.1 item 2): any table an output writes
 * with an amount column it shows gets two more columns, `Suppressed` ("Yes" or blank) and `Why`
 * (`withSuppressedFlag`). A suppressed amount cell is empty, never 0 and never words: "under $0.1M"
 * or "—" is a reason, written in `Why`, not a cell value (`amountCell`). Amounts are numbers, never
 * text, so negative variances are not formula-guarded. A table whose shown columns hold no amount
 * (Manager mode, a heads table) is returned as it is.
 *
 * An amount column is one flagged `pay`, `cost` or `band`, or one formatted as money (`money`,
 * `moneyFull`, `moneyM`); only the columns `visibleColumns` keeps for the output count. A column
 * formatted per row holds an amount in the rows whose format is money (Forecast > Variance's heads
 * and FTE rows hold counts in its cost-flagged columns; a Key figures table holds a cost tile's value
 * beside counts). A column flagged `flagEmpty: false` (a trend point) writes its cells as amounts but
 * an empty one sets no flag.
 *
 * Reading (exports builder, M4): Suppressed marks an amount the guard hid, and the guard gives every
 * hidden amount its reason (7.2 rule 1: "—" always has one, `expectGuarded`). So a row is flagged when
 * an amount cell is empty and the row says why: under `WHY_KEY`; else in the model's reason column
 * (`reasonColumn`: one flagged `why`, or keyed `reason` and labelled 'Why "—"' or 'Note', as the guarded
 * figures' `CostRow.reason` and `VarianceRow.reason` columns are); else the table's `suppressedWhy`
 * (the figure's guard reason or note). An empty amount cell with no reason is no value at all (a
 * Filled seat's band estimate, a transfer's), written empty and not flagged: never 0, never words.
 *
 * Pure. CSV, the clipboard, Excel (figure and whole-view workbooks) and slide tables all write the
 * flagged table, through `writtenTable` (free text guarded first, ./freeText.ts). M4 freeze
 * (docs/CONTRACTS-M4.md): the keys, labels and shapes are frozen; the exports builder filled the
 * bodies and added `writtenTable`.
 */
import type { Column } from '@/charts/types'
import type { Format } from '@/lib/format'
import { type MoneyArg, visibleColumns } from './columns'
import { guardFreeText, type TextViewer } from './freeText'
import type { ExportTable } from './types'

/** The row key a model may set with the reason its amounts are empty. */
export const WHY_KEY = '__why'
/** The added columns' keys. */
export const SUPPRESSED_KEY = '__suppressed'
export const SUPPRESSED_WHY_KEY = '__suppressedWhy'
/** The flag's value. */
export const SUPPRESSED_YES = 'Yes'

/** The two columns `withSuppressedFlag` adds after the table's own: "Suppressed" and "Why". */
export const SUPPRESSED_COLUMNS: readonly Column[] = [
  { key: SUPPRESSED_KEY, label: 'Suppressed', format: 'text' },
  { key: SUPPRESSED_WHY_KEY, label: 'Why', format: 'text' },
]

const MONEY_FORMATS: ReadonlySet<Format> = new Set<Format>(['money', 'moneyFull', 'moneyM'])

/** Whether a format writes money. */
export const isMoneyFormat = (f: Format | undefined): boolean => !!f && MONEY_FORMATS.has(f)

/** Whether a column holds amounts: a money flag, or a money format. */
export function isAmountColumn(c: Pick<Column, 'pay' | 'cost' | 'band' | 'format'>): boolean {
  if (c.pay || c.cost || c.band) return true
  return typeof c.format === 'string' && isMoneyFormat(c.format)
}

/** Whether any column the output shows holds amounts. */
export function hasAmountColumn(columns: readonly Column[], money: MoneyArg): boolean {
  return visibleColumns(columns, money).some(isAmountColumn)
}

/** An amount cell as written: the number when it is a finite number, else null (an empty cell). */
export function amountCell(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * Whether one cell of a column holds an amount: by the row's own format for a column formatted per
 * row (money there, or no format and a money flag), else by the column (`isAmountColumn`).
 */
export function isAmountCell(c: Column, row: object): boolean {
  if (typeof c.format !== 'function') return isAmountColumn(c)
  const f = c.format(row)
  return f ? isMoneyFormat(f) : !!(c.pay || c.cost || c.band)
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** The labels the guarded models give their reason column (key `reason`). */
const REASON_LABELS: ReadonlySet<string> = new Set(['Why "—"', 'Note'])

/**
 * The column a table's rows give their guard reason in: one flagged `why`, else one keyed `reason`
 * labelled 'Why "—"' or 'Note' (never a request's "Reason", which is its reason code or text); null
 * when there is none.
 */
export function reasonColumn(columns: readonly Column[]): Column | null {
  return (
    columns.find((c) => c.why) ??
    columns.find((c) => c.key === 'reason' && REASON_LABELS.has(c.label)) ??
    null
  )
}

/** Why a row's amounts are empty: its `WHY_KEY`, its reason column, else the table's `suppressedWhy`. */
function whyOf(
  row: Record<string, unknown>,
  reasonKey: string | null,
  table: Pick<ExportTable, 'suppressedWhy'>,
): string {
  return text(row[WHY_KEY]) || (reasonKey ? text(row[reasonKey]) : '') || text(table.suppressedWhy)
}

/**
 * The table with every shown amount cell as `amountCell` writes it and, when it shows an amount
 * column, the `Suppressed` and `Why` columns: "Yes" and the row's reason (`WHY_KEY`, else its reason
 * column, else `table.suppressedWhy`) on a row with an empty amount cell and a reason, blank otherwise
 * (see the module comment). The same table when no shown column holds an amount. Applying it twice
 * changes nothing.
 */
export function withSuppressedFlag(table: ExportTable, money: MoneyArg): ExportTable {
  const own = table.columns.filter((c) => c.key !== SUPPRESSED_KEY && c.key !== SUPPRESSED_WHY_KEY)
  const shown = visibleColumns(own, money)
  const amounts = shown.filter((c) =>
    typeof c.format === 'function' ? table.rows.some((r) => isAmountCell(c, r)) : isAmountColumn(c),
  )
  if (!amounts.length) return table
  const reasonKey = reasonColumn(own)?.key ?? null
  const rows = table.rows.map((r) => {
    const out: Record<string, unknown> = { ...r }
    let empty = false
    for (const c of amounts) {
      if (!isAmountCell(c, r)) continue
      const v = amountCell(r[c.key])
      out[c.key] = v
      // A column whose empty cells mean "no value here" (a trend point) writes them empty unflagged.
      if (v === null && c.flagEmpty !== false) empty = true
    }
    // Flagged when the guard hid an amount, which it always explains.
    const why = empty ? whyOf(r, reasonKey, table) : ''
    out[SUPPRESSED_KEY] = why ? SUPPRESSED_YES : ''
    out[SUPPRESSED_WHY_KEY] = why
    return out
  })
  return { ...table, columns: [...own, ...SUPPRESSED_COLUMNS], rows }
}

/** What a writer needs to put a table in a file: the money the output shows and who it is for. */
export interface WrittenTableOptions {
  money: MoneyArg
  /** The output's reader (`textViewerOf(meta)`); free text is guarded for Manager mode. */
  viewer?: TextViewer | null
}

/**
 * A table as every exporter writes it: free text through `guardFreeText` for the viewer, then the
 * amount cells and the `Suppressed` and `Why` columns (`withSuppressedFlag`). The writers still drop
 * the money columns the output hides (`visibleColumns`).
 */
export function writtenTable<T extends Pick<ExportTable, 'columns' | 'rows'> & Partial<ExportTable>>(
  table: T,
  opts: WrittenTableOptions,
): T {
  const full: ExportTable = { name: '', ...table }
  const guarded = opts.viewer ? guardFreeText(full, opts.viewer) : full
  const flagged = withSuppressedFlag(guarded, opts.money)
  return flagged === full ? table : ({ ...table, columns: flagged.columns, rows: flagged.rows } as T)
}
