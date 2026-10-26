/**
 * What a table cell does when clicked: open a link, open the drill panel (the records behind a
 * counted cell, or the calculation card behind a modeled one), or nothing. Pure (no React), so the
 * rules are unit-tested; DataTable renders the result.
 */
import type { CalcSource } from '@/drill/calc'
import type { DrillSource } from '@/drill/types'
import { DASH } from '@/lib/format'
import type { Column } from './types'

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

/**
 * `url` when it is safe to put in an href: a web or mail link, or a path on this site. Anything
 * else (javascript:, data:, unparseable text) is null, since links can be built from uploaded data.
 */
export function safeHref(url: string | null | undefined): string | null {
  const s = typeof url === 'string' ? url.trim() : ''
  if (!s) return null
  try {
    return SAFE_PROTOCOLS.has(new URL(s, 'https://hcp.invalid/').protocol) ? s : null
  } catch {
    return null
  }
}

export type CellAction =
  | { kind: 'link'; href: string }
  | { kind: 'drill'; source: NonNullable<DrillSource> }
  | { kind: 'calc'; source: NonNullable<CalcSource> }
  | null

/**
 * The cell's action for `row`, given its rendered `text`: a link when the column's `href` gives a
 * safe URL (it wins), else a drill when `drill` names records, else a calculation card when `calc`
 * gives one (a counted cell keeps its records), else nothing. Blank cells ("—") never act.
 */
export function cellAction<T>(column: Column<T>, row: T, text: string): CellAction {
  if (text === DASH || text === '') return null
  const href = column.href ? safeHref(column.href(row)) : null
  if (href) return { kind: 'link', href }
  const source = column.drill ? column.drill(row) : null
  if (source) return { kind: 'drill', source }
  const card = column.calc ? column.calc(row) : null
  return card ? { kind: 'calc', source: card } : null
}
