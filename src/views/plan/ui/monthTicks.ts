/**
 * The month axis of Plan's band charts (Plan > Hiring's velocity and Plan > Recruiting summary's heads
 * and hiring by month, review RU-11): the Columns kit's month thinning (src/charts/kit/Columns.tsx),
 * so labels never touch on a phone. Every k-th month from the first is labelled, k the fewest that
 * keeps the widest label and 10px apart within a band step; at least three labels show (start,
 * middle, end, `minThreeTicks`); the year shows on the first shown label and wherever the year changes
 * among the shown ones, so two shown labels never read the same. Pure.
 */
import { maxTextWidth } from '@/charts/core/measure'
import { minThreeTicks } from '@/charts/kit/prepare'
import { formatMonthShort } from '@/lib/dates'

/** The label of each month on the axis, "" for a month the thinning leaves blank. */
export function monthTickLabels(
  months: readonly string[],
  /** The band's step in px: the plot's inner width over the months. */
  step: number,
  measure: (texts: readonly string[], size: number) => number = (t, size) => maxTextWidth(t, size),
): (month: string) => string {
  const widest = measure(
    months.map((m, i) => formatMonthShort(`${m}-01`, i === 0 || m.endsWith('-01'))),
    11,
  )
  const every = Math.max(1, Math.ceil((widest + 10) / Math.max(1, step)))
  const kept = minThreeTicks(
    months,
    months.filter((_, i) => i % every === 0),
  )
  const withYear = new Set(kept.filter((m, i) => i === 0 || m.slice(0, 4) !== kept[i - 1].slice(0, 4)))
  const shown = new Set(kept)
  return (m) => (shown.has(m) ? formatMonthShort(`${m}-01`, withYear.has(m)) : '')
}

/** A band chart's step in px: its inner width over its months. */
export const bandStep = (width: number, marginLeft: number, marginRight: number, n: number): number =>
  Math.max(1, (width - marginLeft - marginRight) / Math.max(1, n))
