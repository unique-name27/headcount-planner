/**
 * "Copy table": tab-separated text with a header row, ready to paste into Excel or Google
 * Sheets. Values use the same parse-friendly plain form as CSV (12.4%, ISO dates). The table is
 * written as every export writes it (`writtenTable`: free text guarded for a Manager reader, amount
 * cells as numbers or empty, and the `Suppressed` and `Why` columns, docs/PLAN.md 14.1 items 2 and 8);
 * the clipboard carries no preamble, so a paste lands as a table, but for one line: a copy made with
 * Show pay amounts on starts "Contains individual pay" (lead decision D-PAYFILES).
 */
import { type MoneyOpts, moneyShown, plainText, visibleColumns } from './columns'
import { type CsvTable, guardFormula } from './csv'
import { INDIVIDUAL_PAY_LINE, madeWithPay } from './exportHeader'
import type { TextViewer } from './freeText'
import { writtenTable } from './suppressedFlag'

/**
 * What the clipboard takes: the money flags, who the text is for (`textViewerOf(meta)`) and whether
 * the copy is made with Show pay amounts on (`madeWithPay(money, meta)`; the switch, `showPay`, when
 * not given).
 */
export type TsvOptions = MoneyOpts & { viewer?: TextViewer | null; individualPay?: boolean }

/** Tabs and line breaks inside a cell would split it; flatten them to spaces. */
const flatten = (s: string) => guardFormula(s.replace(/[\t\r\n]+/g, ' '))

export function toTsv(table: CsvTable, opts: TsvOptions): string {
  const money = moneyShown(opts)
  const written = writtenTable(table, { money, viewer: opts.viewer })
  const cols = visibleColumns(written.columns, money)
  const pay = opts.individualPay ?? madeWithPay(money)
  const lines = [...(pay ? [INDIVIDUAL_PAY_LINE] : []), cols.map((c) => flatten(c.label)).join('\t')]
  for (const row of written.rows) {
    lines.push(
      cols
        .map((c) => {
          const v = row[c.key]
          const text = plainText(v, c.format, row)
          return typeof v === 'number' ? text : flatten(text)
        })
        .join('\t'),
    )
  }
  return lines.join('\n')
}

/** Write text to the clipboard; falls back to a hidden textarea where the async API is blocked (file://, older webviews). */
export async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    /* fall through to the legacy path */
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  ta.style.pointerEvents = 'none'
  document.body.append(ta)
  ta.select()
  // execCommand is deprecated but remains the only synchronous clipboard path without permissions.
  const ok = document.execCommand('copy')
  ta.remove()
  if (!ok) throw new Error('Clipboard is not available')
}

/** Copy a table as TSV. Resolves to the number of data rows copied. */
export async function copyTable(table: CsvTable, opts: TsvOptions): Promise<number> {
  await writeClipboard(toTsv(table, opts))
  return table.rows.length
}
