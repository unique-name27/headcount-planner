/**
 * Records by month (`data.coverage.byMonth`; the template app's Data room): how many rows of each
 * dated dataset fall in each of the 24 months to the as-of date, by the dataset's own event date, so
 * a gap (an extract cut short, a stale load) shows before it moves a number. Targets and assumptions
 * carry no event date (they hold what is planned) and are listed apart. A row counts once in a month
 * when any of its event dates falls in it. Each cell's share is of the dataset's busiest month, so
 * datasets of very different sizes read on one scale. Counts only, never a value of a row. Pure.
 */
import type { Column } from '@/charts/types'
import { DATASET_KEYS, type DatasetKey, type Datasets, datasetDef, type ISODate } from '@/data/schema'
import type { DrillSpec } from '@/drill/types'
import { addMonths, formatMonth, formatMonthShort, monthStart, monthsBetween } from '@/lib/dates'

/** The event dates a dataset is placed in time by, and what happened on them. */
export const MONTH_RULES: Readonly<
  Partial<Record<DatasetKey, { fields: readonly string[]; event: string }>>
> = {
  positions: { fields: ['effectiveDate'], event: 'effective' },
  workers: { fields: ['hireDate', 'terminationDate'], event: 'hired or leaving' },
  comp: { fields: ['effectiveDate'], event: 'effective' },
  reqs: { fields: ['openedDate'], event: 'opened' },
  requests: { fields: ['submittedAt'], event: 'submitted' },
  freezes: { fields: ['startDate'], event: 'starting' },
}

/** Datasets with no event date: what they hold is as of the load. */
export const SNAPSHOT_DATASETS: readonly DatasetKey[] = DATASET_KEYS.filter((k) => !MONTH_RULES[k])

export interface MonthCell {
  [key: string]: unknown
  key: DatasetKey
  dataset: string
  /** YYYY-MM */
  month: string
  /** "Jul '26" */
  monthLabel: string
  /** Rows dated in the month. */
  rows: number
  /** Of the dataset's busiest month in the range (0 when no month has a row). */
  share: number
  /** Row positions in the loaded dataset, for the drill. */
  indexes: readonly number[]
}

export interface RecordsByMonth {
  months: string[]
  /** Dated datasets with rows loaded, in dataset order. */
  datasets: DatasetKey[]
  /** Dated datasets with nothing loaded. */
  empty: DatasetKey[]
  cells: MonthCell[]
}

const monthOf = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}/.test(v) ? v.slice(0, 7) : null

/** Rows of each dated dataset by month, over the `n` months ending with the as-of month. */
export function rowsByMonth(data: Datasets, asOf: ISODate, n = 24): RecordsByMonth {
  const months = monthsBetween(addMonths(monthStart(asOf), -(n - 1)), asOf)
  const at = new Map(months.map((m, i) => [m, i]))
  const datasets: DatasetKey[] = []
  const empty: DatasetKey[] = []
  const cells: MonthCell[] = []
  for (const key of DATASET_KEYS) {
    const rule = MONTH_RULES[key]
    if (!rule) continue
    const rows = data[key] as unknown as readonly Record<string, unknown>[]
    if (!rows.length) {
      empty.push(key)
      continue
    }
    datasets.push(key)
    const byMonth: number[][] = months.map(() => [])
    rows.forEach((r, i) => {
      const seen = new Set<number>()
      for (const f of rule.fields) {
        const m = monthOf(r[f])
        const j = m == null ? undefined : at.get(m)
        if (j !== undefined && !seen.has(j)) {
          seen.add(j)
          byMonth[j].push(i)
        }
      }
    })
    const busiest = Math.max(0, ...byMonth.map((x) => x.length))
    const label = datasetDef(key).label
    months.forEach((month, j) => {
      cells.push({
        key,
        dataset: label,
        month,
        monthLabel: formatMonthShort(`${month}-01`, true),
        rows: byMonth[j].length,
        share: busiest ? byMonth[j].length / busiest : 0,
        indexes: byMonth[j],
      })
    })
  }
  return { months, datasets, empty, cells }
}

/** The title of a cell's records: "Reqs opened in July 2026". */
export const cellTitle = (c: Pick<MonthCell, 'key' | 'dataset' | 'month'>): string =>
  `${c.dataset} ${MONTH_RULES[c.key]?.event ?? 'dated'} in ${formatMonth(`${c.month}-01`)}`

/** What a cell's records open as: a drill spec, or null for an empty cell or a dataset with no drill (comp). */
export type CellDrillOf = (c: MonthCell) => DrillSpec | null

export const BY_MONTH_COLUMNS: readonly Column<MonthCell>[] = [
  { key: 'dataset', label: 'Dataset' },
  { key: 'monthLabel', label: 'Month', sortValue: (r) => r.month },
  { key: 'rows', label: 'Rows', format: 'int' },
  { key: 'share', label: 'Of the busiest month', format: 'pct' },
]
