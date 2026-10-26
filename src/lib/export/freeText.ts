/**
 * Free text in outputs (docs/PLAN.md 14.1 item 8, 8.4 rule 5): comments in any export or file pass
 * `commentVisible` (the models list only the comments the viewer may read); in Manager mode, and in
 * an Export for a manager file, every change reason, send-back or reject reason, exception reason,
 * audit comment and version name also passes `managerText`, so an amount typed into text, or arriving
 * through Import requests, Merge or an opened file, never reaches a Manager output. Columns that hold
 * such text are flagged `freeText: true` (src/charts/types.ts); every exporter runs the table through
 * `guardFreeText` before it writes (CSV, the clipboard, Excel sheets and slide tables, by way of
 * `writtenTable` in ./suppressedFlag.ts), reading the viewer from the export's meta (`textViewerOf`).
 *
 * Pure. M4 freeze (docs/CONTRACTS-M4.md): the signatures are frozen; the exports builder filled them
 * and added `textViewerOf`.
 */
import { managerText, type Viewer } from '@/access/visibility'
import type { ExportMeta } from '@/charts/types'
import type { ExportTable } from './types'

/** Who an output is for: the viewer's mode (an Export for a manager file is Manager mode's). */
export type TextViewer = Pick<Viewer, 'mode'>

/** One text cell as an output writes it: through `managerText` in Manager mode, as it is elsewhere. */
export function guardedText(text: string, viewer: TextViewer): string {
  return viewer.mode === 'manager' ? managerText(text, viewer) : text
}

/** A free-text cell as written: strings through `guardedText`, lists of strings item by item. */
function guardedCell(v: unknown, viewer: TextViewer): unknown {
  if (typeof v === 'string') return guardedText(v, viewer)
  if (Array.isArray(v)) {
    let out: unknown[] | null = null
    v.forEach((x, i) => {
      if (typeof x !== 'string') return
      const g = guardedText(x, viewer)
      if (g === x) return
      out ??= v.slice()
      out[i] = g
    })
    return out ?? v
  }
  return v
}

/**
 * The table with every `freeText` column's cells through `guardedText` (the same table outside
 * Manager mode, or with no such column). Rows that change are copies; the others are kept.
 */
export function guardFreeText(table: ExportTable, viewer: TextViewer): ExportTable {
  if (viewer.mode !== 'manager') return table
  const keys = table.columns.filter((c) => c.freeText).map((c) => c.key)
  if (!keys.length) return table
  let changed = false
  const rows = table.rows.map((r) => {
    let out: Record<string, unknown> | null = null
    for (const k of keys) {
      const v = r[k]
      const g = guardedCell(v, viewer)
      if (g === v) continue
      out ??= { ...r }
      out[k] = g
    }
    if (out) changed = true
    return out ?? r
  })
  return changed ? { ...table, rows } : table
}

/** "Made in Manager mode." and "Made in Manager mode for Priya Raman's team. …" both start so. */
const MANAGER_LINE = /^Made in Manager mode\b/

/**
 * The viewer an output is for, from its meta: `meta.mode` when the caller set it, else Manager mode
 * when the mode line says so (an Export for a manager file carries the Manager line), else null (a
 * mode whose outputs need no text guard).
 */
export function textViewerOf(
  meta: Pick<ExportMeta, 'mode' | 'modeLine'> | null | undefined,
): TextViewer | null {
  if (!meta) return null
  if (meta.mode) return { mode: meta.mode }
  return meta.modeLine && MANAGER_LINE.test(meta.modeLine) ? { mode: 'manager' } : null
}
