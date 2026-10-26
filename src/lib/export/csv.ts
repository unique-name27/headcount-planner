/**
 * CSV per RFC 4180 (CRLF rows, quotes doubled, fields quoted when they contain a comma, quote or
 * line break), with a UTF-8 byte-order mark so Excel opens accented names correctly.
 *
 * Cells that a spreadsheet would execute as a formula (leading = + - @ tab or CR) are prefixed
 * with an apostrophe. Numbers are written as numbers and are never prefixed, so a negative
 * variance is a number, not a guarded formula (docs/PLAN.md 14.1 item 2).
 *
 * Every table is written as `writtenTable` makes it (docs/PLAN.md 14.1 items 2 and 8): free text
 * through `managerText` for a Manager reader, amount cells as numbers or empty, and the `Suppressed`
 * and `Why` columns when the table shows an amount column. The preamble carries the export header
 * (`headerLines`: the plan facts and the mode lines, item 1), and "Contains individual pay" first when
 * the file is made with Show pay amounts on (`madeWithPay`, lead decision D-PAYFILES), even a file
 * written with no preamble. The as-of date is stated once: as the header's "As of" fact where the
 * meta has plan facts, else on the context line (M4 review CP-10).
 */
import type { ExportMeta } from '@/charts/types'
import { type MoneyArg, type MoneyOpts, moneyShown, plainText, visibleColumns } from './columns'
import { definitionsLineFor } from './definitions'
import { downloadBlob, MIME } from './download'
import { headerFacts, headerLines, INDIVIDUAL_PAY_LINE, madeWithPay } from './exportHeader'
import { type TextViewer, textViewerOf } from './freeText'
import { dataLine, fileStem, metaLine, stampLine } from './names'
import { writtenTable } from './suppressedFlag'
import type { ExportOptions, ExportTable } from './types'

const FORMULA_START = /^[=+\-@\t\r]/

/** Neutralize spreadsheet formula injection in a text cell. */
export function guardFormula(s: string): string {
  return FORMULA_START.test(s) ? `'${s}` : s
}

/** One CSV field: guarded, then quoted if needed. */
export function csvField(s: string): string {
  const v = guardFormula(s)
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

export interface CsvOptions {
  /** Lines written above the header row (title, scope, as-of). Off by default to keep the file machine-readable. */
  preamble?: readonly string[]
  /** Prefix a UTF-8 byte-order mark (default true). */
  bom?: boolean
  /** Who the file is for (`textViewerOf(meta)`): free text reads through `managerText` in Manager mode. */
  viewer?: TextViewer | null
}

/** The table to write: its columns and rows, and the reason its empty amount cells are empty. */
export type CsvTable = Pick<ExportTable, 'columns' | 'rows'> & Partial<Pick<ExportTable, 'suppressedWhy'>>

export function toCsv(table: CsvTable, opts: MoneyOpts & CsvOptions): string {
  const money = moneyShown(opts)
  const written = writtenTable(table, { money, viewer: opts.viewer })
  const cols = visibleColumns(written.columns, money)
  const lines: string[] = []
  for (const p of opts.preamble ?? []) lines.push(csvField(p))
  if (opts.preamble?.length) lines.push('')
  lines.push(cols.map((c) => csvField(c.label)).join(','))
  for (const row of written.rows) {
    lines.push(
      cols
        .map((c) => {
          const v = row[c.key]
          const text = plainText(v, c.format, row)
          return typeof v === 'number' ? text : csvField(text)
        })
        .join(','),
    )
  }
  return `${opts.bom === false ? '' : '﻿'}${lines.join('\r\n')}\r\n`
}

/**
 * Title and context lines for a CSV: "Contains individual pay" when the file is made with Show pay
 * amounts on (`money` given, `madeWithPay`), title, subtitle, scope and window (and the as-of date
 * when the header does not state it), data standard and tier, the export header (the plan facts and
 * the mode lines), stamp.
 */
export function csvPreamble(table: ExportTable, meta: ExportMeta, money?: MoneyArg | MoneyOpts): string[] {
  const pay = madeWithPay(money, meta)
  const headerAsOf = headerFacts(meta).some((f) => f.label === 'As of')
  return [
    pay ? INDIVIDUAL_PAY_LINE : '',
    table.title ?? table.name,
    table.subtitle ?? '',
    metaLine(meta, { asOf: !headerAsOf }),
    dataLine(meta.standard, table.tier, table.withheld) ?? '',
    definitionsLineFor(meta) ?? '',
    ...headerLines(meta),
    stampLine(meta),
  ].filter(Boolean)
}

/**
 * Download one table as CSV. Title and context lines (scope, window, as-of, data standard and
 * tier, the export header, "Sample data") precede the header, as every export carries them;
 * `preamble: false` writes the bare table for machines, under "Contains individual pay" when the
 * file is made with Show pay amounts on.
 */
export function downloadCsv(
  table: ExportTable,
  meta: ExportMeta,
  opts: ExportOptions & { preamble?: boolean },
): void {
  // Every money flag the caller passed: an earlier version passed `showPay` alone, which dropped
  // the cost columns Finance and the rounded modes may see (docs/PLAN.md 14.1 item 5).
  const money = { showPay: opts.showPay, showCost: opts.showCost, showBand: opts.showBand }
  const preamble =
    opts.preamble !== false
      ? csvPreamble(table, meta, moneyShown(money))
      : madeWithPay(moneyShown(money), meta)
        ? [INDIVIDUAL_PAY_LINE]
        : undefined
  const csv = toCsv(table, { ...money, preamble, viewer: textViewerOf(meta) })
  downloadBlob(new Blob([csv], { type: MIME.csv }), `${opts.fileName ?? fileStem(meta, table.name)}.csv`)
}
