/**
 * Styled Excel workbooks with ExcelJS (loaded on demand, so it never weighs on first paint).
 *
 * Every sheet carries a small title block ("Contains individual pay" first when made with Show pay
 * amounts on, then the title, subtitle, view and scope line, data standard, the export header, the
 * mode lines, confidentiality stamp), then a bold header row
 * with a bottom rule, frozen panes, an autofilter, real Excel dates, number formats from each
 * column's `format`, and widths fitted to the content.
 *
 * The export header (docs/PLAN.md 14.1 item 1): a sheet of a view workbook states it in one compact
 * line (`compactHeaderLine`: version, lock, comparison, rounding), its Summary every fact; a figure
 * workbook (`buildWorkbook`), which has no Summary, states every fact in each sheet's title block (the
 * as-of date then once, as its "As of" fact). A sheet made with Show pay amounts on starts with
 * "Contains individual pay" (`madeWithPay`, lead decision D-PAYFILES). Tables are written
 * as `writtenTable` makes them: free text guarded for a Manager reader, amount cells as numbers or
 * empty, and the `Suppressed` and `Why` columns (items 2 and 8).
 */
import type { CellValue, Workbook, Worksheet } from 'exceljs'
import { APP_NAME } from '@/app/brand'
import type { Column, ExportMeta } from '@/charts/types'
import { excelNumFmt, type Format, fmt } from '@/lib/format'
import {
  cellFormat,
  columnFormat,
  exportNumber,
  isNumericFormat,
  type MoneyOpts,
  moneyShown,
  sampleRow,
  sampleValue,
  visibleColumns,
} from './columns'
import { definitionsLineFor } from './definitions'
import { downloadBlob, MIME } from './download'
import { compactHeaderLine, factLine, headerFacts, INDIVIDUAL_PAY_LINE, madeWithPay } from './exportHeader'
import { textViewerOf } from './freeText'
import { dataLine, fileStem, metaLine, modeLines, stampLine, viewLine } from './names'
import { writtenTable } from './suppressedFlag'
import type { ExportOptions, ExportTable } from './types'
import { exportNote } from './withheld'

type ExcelModule = typeof import('exceljs')

let excel: Promise<ExcelModule> | null = null
/** ExcelJS ships as CommonJS; the namespace lands on `default` in browsers and in Node. */
export function loadExcel(): Promise<ExcelModule> {
  excel ??= import('exceljs').then((m) => (m as unknown as { default?: ExcelModule }).default ?? m)
  return excel
}

/** The app's ink and rule colors as ARGB. */
export const XL = {
  ink: 'FF12151A',
  ink2: 'FF475060',
  muted: 'FF616A78',
  rule: 'FFDDE1E7',
  ruleStrong: 'FFC3C9D2',
  link: 'FF1C5CAB',
} as const

const INVALID_SHEET_CHARS = /[[\]:*?/\\]/g

/**
 * Excel sheet rules: at most 31 characters, none of []:*?/\, no leading or trailing apostrophe.
 * A longer name is cut at a word boundary and ends in "…", so it never stops mid-word
 * ("Overview · Hires and exits by…", not "Overview · Hires and exits by m").
 */
export function sanitizeSheetName(name: string): string {
  const cleaned = name
    .replace(INVALID_SHEET_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^'+|'+$/g, '')
    .trim()
  const base = cleaned || 'Sheet'
  const safe = base.toLowerCase() === 'history' ? `${base} (1)` : base
  if (safe.length <= 31) return safe
  const cut = safe.slice(0, 30)
  const space = cut.lastIndexOf(' ')
  // Keep most of the name: a boundary too early would leave too little to tell sheets apart.
  const head = (space >= 16 ? cut.slice(0, space) : cut).replace(/[\s·,;–-]+$/, '').replace(/'+$/, '')
  return `${head}…`
}

/** Sanitize and de-duplicate (case-insensitively, as Excel does) a list of sheet names. */
export function uniqueSheetNames(names: readonly string[]): string[] {
  const used = new Set<string>()
  return names.map((n) => {
    const base = sanitizeSheetName(n)
    let candidate = base
    for (let k = 2; used.has(candidate.toLowerCase()); k++) {
      const suffix = ` (${k})`
      candidate = `${base.slice(0, 31 - suffix.length).trimEnd()}${suffix}`
    }
    used.add(candidate.toLowerCase())
    return candidate
  })
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/

/**
 * A JS value as an Excel cell value: real dates for date columns, empty for missing, never NaN.
 * Numbers are stored rounded to their format's export precision (`exportNumber`), not just
 * displayed rounded.
 */
export function excelValue(v: unknown, format: Format | undefined): CellValue {
  if (v == null) return null
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    // A rounded amount is a number too, never words (docs/PLAN.md 14.1 item 2).
    return exportNumber(v, format)
  }
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'string') {
    if (format === 'date') {
      const m = ISO_DATE.exec(v)
      if (m) {
        const t = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0)
        if (Number.isFinite(t)) return new Date(t)
      }
    }
    return v
  }
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

/**
 * Number format for a column (or, with a per-row format, for the cell of `row`); unformatted
 * numeric columns get a sensible default.
 */
export function numFmtFor(column: Pick<Column, 'format'>, sample: unknown, row?: object): string | undefined {
  return excelNumFmt(columnFormat(column, sample, row))
}

const WIDTH_MIN = 8
const WIDTH_MAX = 48

/**
 * Column width in characters from the header and the formatted values (first 500 rows). `format`
 * is the column's format, or one format per value for columns formatted per row.
 */
export function columnWidth(
  label: string,
  values: readonly unknown[],
  format: Format | readonly Format[],
): number {
  let max = label.length
  values.slice(0, 500).forEach((v, i) => {
    if (v == null) return
    const f = typeof format === 'string' ? format : (format[i] ?? 'text')
    const text = typeof v === 'string' && f !== 'date' ? v : fmt(v, f)
    if (text.length > max) max = text.length
  })
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, max + 2))
}

export interface SheetLayout {
  ws: Worksheet
  /** 1-based row of the column headers. */
  headerRow: number
  /** 1-based last data row (equals headerRow when there are no rows). */
  lastRow: number
  columnCount: number
}

/** How a sheet states the export header: every fact (a figure workbook) or one compact line (a view workbook). */
export type SheetHeader = 'full' | 'compact'

/**
 * The stamp line, with "Contains individual pay" when asked. A sheet states that as its first line
 * now (`addTableSheet`), so it writes the plain stamp; kept for callers of the M4 contract.
 */
export function sheetStamp(meta: ExportMeta, pay: boolean): string {
  return pay ? `${stampLine(meta)} · ${INDIVIDUAL_PAY_LINE}` : stampLine(meta)
}

/** The header lines a sheet's title block carries (none for a meta with no plan facts). */
export function sheetHeaderLines(meta: ExportMeta, header: SheetHeader): string[] {
  if (header === 'full') return headerFacts(meta).map(factLine)
  const line = compactHeaderLine(meta)
  return line ? [line] : []
}

/** Write one table into a new worksheet with the app's title block and table styling. */
export function addTableSheet(
  wb: Workbook,
  sheetName: string,
  given: ExportTable,
  meta: ExportMeta,
  opts: MoneyOpts & { header?: SheetHeader },
): SheetLayout {
  const money = moneyShown(opts)
  // Free text guarded for a Manager reader, amounts as numbers or empty, and the Suppressed flag.
  const table = writtenTable(given, { money, viewer: textViewerOf(meta) })
  const cols = visibleColumns(table.columns, money)
  const ws = wb.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 16 },
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })

  // Title block: "Contains individual pay" first when made with Show pay amounts on (D-PAYFILES).
  const header = opts.header ?? 'compact'
  const block: { text: string; size: number; bold?: boolean; color: string; italic?: boolean }[] = [
    ...(madeWithPay(money, meta) ? [{ text: INDIVIDUAL_PAY_LINE, size: 10, bold: true, color: XL.ink }] : []),
    { text: table.title ?? table.name, size: 14, bold: true, color: XL.ink },
  ]
  if (table.subtitle) block.push({ text: table.subtitle, size: 10, color: XL.ink2 })
  // Every fact states the as-of date as its own line, so the context line leaves it out then.
  const asOf = !(header === 'full' && headerFacts(meta).some((f) => f.label === 'As of'))
  block.push({
    text: [viewLine(meta), metaLine(meta, { asOf })].filter(Boolean).join(' · '),
    size: 9,
    color: XL.muted,
  })
  const data = dataLine(meta.standard, table.tier, table.withheld)
  if (data) block.push({ text: data, size: 9, color: XL.ink2 })
  const definitions = definitionsLineFor(meta)
  if (definitions) block.push({ text: definitions, size: 9, color: XL.ink2 })
  // The export header: every fact, or the compact line (docs/PLAN.md 14.1 item 1).
  for (const line of sheetHeaderLines(meta, header)) block.push({ text: line, size: 9, color: XL.ink2 })
  // "Made in HRBP mode for Silicon Engineering." and the mode's cost line.
  for (const line of modeLines(meta)) block.push({ text: line, size: 9, color: XL.ink2 })
  block.push({ text: stampLine(meta), size: 9, color: XL.muted, bold: true })
  // A withheld table prints no note: notes usually carry the numbers the standard hides.
  const note = exportNote(table)
  if (note) block.push({ text: note, size: 9, color: XL.muted, italic: true })
  block.forEach((line, i) => {
    const cell = ws.getCell(i + 1, 1)
    cell.value = line.text
    cell.font = { size: line.size, bold: line.bold, italic: line.italic, color: { argb: line.color } }
  })
  ws.getRow(block.findIndex((l) => l.size === 14) + 1).height = 22

  const headerRow = block.length + 2
  const samples = cols.map((c) => sampleValue(table.rows, c.key))
  const formats = cols.map((c, i) => columnFormat(c, samples[i], sampleRow(table.rows, c.key)))
  // Per-row formats resolve per cell (e.g. a value column mixing rates and day counts).
  const perRow = cols.map((c) => typeof c.format === 'function')
  const formatAt = (i: number, row: Record<string, unknown>) =>
    perRow[i] ? cellFormat(cols[i], row, formats[i]) : formats[i]

  // Header
  const hr = ws.getRow(headerRow)
  cols.forEach((c, i) => {
    const cell = hr.getCell(i + 1)
    cell.value = c.label
    cell.font = { bold: true, size: 10, color: { argb: XL.ink } }
    cell.border = { bottom: { style: 'thin', color: { argb: XL.ink } } }
    cell.alignment = {
      vertical: 'bottom',
      horizontal: isNumericFormat(formats[i]) || c.align === 'right' ? 'right' : 'left',
      wrapText: true,
    }
  })
  hr.height = 20

  // Body
  table.rows.forEach((row, r) => {
    const xr = ws.getRow(headerRow + 1 + r)
    cols.forEach((c, i) => {
      const cell = xr.getCell(i + 1)
      const f = formatAt(i, row)
      cell.value = excelValue(row[c.key], f)
      cell.font = { size: 10, color: { argb: XL.ink } }
      const nf = excelNumFmt(f)
      if (nf) cell.numFmt = nf
      if (c.align) cell.alignment = { horizontal: c.align }
    })
  })
  if (!table.rows.length) {
    const cell = ws.getCell(headerRow + 1, 1)
    cell.value = 'No rows in this table.'
    cell.font = { size: 10, italic: true, color: { argb: XL.muted } }
  }

  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = columnWidth(
      c.label,
      table.rows.map((r) => r[c.key]),
      perRow[i] ? table.rows.map((r) => formatAt(i, r)) : formats[i],
    )
  })

  const lastRow = headerRow + table.rows.length
  ws.views = [
    {
      state: 'frozen',
      xSplit: 0,
      ySplit: headerRow,
      topLeftCell: `A${headerRow + 1}`,
      activeCell: `A${headerRow + 1}`,
    },
  ]
  if (cols.length && table.rows.length) {
    ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastRow, column: cols.length } }
  }
  ws.pageSetup.printTitlesRow = `${headerRow}:${headerRow}`
  ws.headerFooter.oddFooter = `&L&8${stampLine(meta).replace(/&/g, '&&')}&R&8Page &P of &N`
  return { ws, headerRow, lastRow, columnCount: cols.length }
}

export async function newWorkbook(meta: ExportMeta, title: string): Promise<Workbook> {
  const ExcelJS = await loadExcel()
  const wb = new ExcelJS.Workbook()
  wb.creator = APP_NAME
  wb.created = new Date()
  wb.title = title
  wb.company = meta.company
  wb.subject = metaLine(meta)
  return wb
}

/**
 * Build (without downloading) a workbook with one sheet per table. It has no Summary, so each sheet's
 * title block states every fact of the export header.
 */
export async function buildWorkbook(
  tables: readonly ExportTable[],
  meta: ExportMeta,
  opts: MoneyOpts,
): Promise<Workbook> {
  const wb = await newWorkbook(meta, tables[0]?.title ?? tables[0]?.name ?? `${APP_NAME} export`)
  const names = uniqueSheetNames(tables.map((t) => t.name))
  tables.forEach((t, i) => {
    addTableSheet(wb, names[i], t, meta, { ...opts, header: 'full' })
  })
  return wb
}

export async function saveWorkbook(wb: Workbook, fileName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buffer], { type: MIME.xlsx }), `${fileName}.xlsx`)
}

/** Download tables as a styled workbook, one sheet each. */
export async function downloadXlsx(
  tables: readonly ExportTable[],
  meta: ExportMeta,
  opts: ExportOptions,
): Promise<void> {
  const wb = await buildWorkbook(tables, meta, opts)
  await saveWorkbook(wb, opts.fileName ?? fileStem(meta, tables[0]?.name ?? 'export'))
}
