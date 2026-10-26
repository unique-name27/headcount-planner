/**
 * Small pieces the Forecast tabs use: opening a table cell's records from a chart mark, and
 * reshaping a wide month table into the long rows a line chart draws. The Plan view keeps its own
 * copy, since a view never imports another view's ui/. Presentation only: every number comes from
 * the view's model.
 */
import type { Column } from '@/charts/types'
import { drill } from '@/drill/Drill'
import type { DrillSource } from '@/drill/types'

/** Open the records behind a row's cell (the column's own drill), from a chart's click. */
export function openCell<R extends object>(columns: readonly Column<R>[], key: string, row: R): void {
  const col = columns.find((c) => c.key === key)
  const src = col?.drill?.(row) as DrillSource
  drill(src)
}

/** One point of a long series: what the line charts draw. */
export interface SeriesPoint<R> {
  x: string
  y: number
  series: string
  /** The wide row it came from, and the column it reads (for its drill). */
  row: R
  key: string
}

/** Wide rows (one column per series) as long points, leaving out empty values. */
export function longSeries<R extends object>(
  rows: readonly R[],
  x: (r: R) => string,
  series: readonly { key: string; label: string }[],
): SeriesPoint<R>[] {
  const out: SeriesPoint<R>[] = []
  for (const r of rows)
    for (const s of series) {
      const v = (r as Record<string, unknown>)[s.key]
      if (typeof v === 'number' && Number.isFinite(v))
        out.push({ x: x(r), y: v, series: s.label, row: r, key: s.key })
    }
  return out
}
