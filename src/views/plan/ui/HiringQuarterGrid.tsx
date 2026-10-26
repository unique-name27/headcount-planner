/**
 * Open to hire by quarter as the page shows it (docs/PLAN.md 9.7 screen 2): one row per measure, one
 * column per quarter of the fiscal year shown, the closed quarters greyed with their actual heads,
 * hires and exits, and each cell's note ("Over by 1", "On pace") under its number. Every counted
 * cell opens its records and every formula its calculation card, from the model's own columns, so
 * the page, the table view and the exports read the same rows. Presentation only.
 */
import type { Column } from '@/charts/types'
import { cx } from '@/components/ui'
import type { CalcSource } from '@/drill/calc'
import { Calc, Drill } from '@/drill/Drill'
import type { DrillSource } from '@/drill/types'
import { DASH, fmt } from '@/lib/format'
import { type HiringQuarterRow, QUARTER_KEYS, type QuarterKey } from '../engine/hiringTab'

const th = 'border-b border-rule-strong bg-sheet py-1.5 px-2 first:pl-0 last:pr-0 align-bottom'
const td = 'border-b border-rule px-2 first:pl-0 last:pr-0 align-middle h-9 py-1.5'

export function HiringQuarterGrid({
  rows,
  columns,
  kinds,
}: {
  rows: readonly HiringQuarterRow[]
  columns: readonly Column<HiringQuarterRow>[]
  /** Each quarter's kind: closed quarters are greyed. */
  kinds: Readonly<Record<QuarterKey, 'history' | 'ahead'>>
}) {
  const col = new Map(columns.map((c) => [c.key, c]))
  const labelCol = col.get('label')
  return (
    <div className="scroll-x relative">
      <table className="w-full border-separate border-spacing-0 text-small leading-snug">
        <caption className="sr-only">Open to hire by quarter</caption>
        <thead>
          <tr>
            <th
              scope="col"
              className={cx(th, 'text-left text-meta font-medium text-ink-2 max-md:sticky max-md:left-0')}
            >
              {labelCol?.label ?? 'Measure'}
            </th>
            {QUARTER_KEYS.map((k) => (
              <th
                key={k}
                scope="col"
                className={cx(
                  th,
                  'text-right text-meta font-medium whitespace-nowrap',
                  kinds[k] === 'history' ? 'text-muted' : 'text-ink-2',
                )}
              >
                {col.get(k)?.label ?? k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th
                scope="row"
                className={cx(
                  td,
                  'text-left font-normal text-ink max-md:sticky max-md:left-0 max-md:bg-sheet',
                )}
              >
                {r.label}
              </th>
              {QUARTER_KEYS.map((k) => (
                <QuarterCell
                  key={k}
                  row={r}
                  quarter={k}
                  column={col.get(k)}
                  history={kinds[k] === 'history'}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A cell's button name (review HU-5): the measure, the quarter and the value, then what it opens, as
 * DataTable names its cells, so a screen reader hears the number and every name in the grid is its
 * own. A closed quarter's Current heads cell holds the heads at that quarter's end.
 */
export function quarterCellName(
  row: Pick<HiringQuarterRow, 'key' | 'label'>,
  quarterLabel: string,
  history: boolean,
  text: string,
  opens: 'records' | 'card',
): string {
  const what =
    history && row.key === 'current'
      ? `Heads at the quarter end, ${quarterLabel}`
      : `${row.label}, ${quarterLabel}`
  return `${what}: ${text}. ${opens === 'records' ? 'Show the records' : 'Show how it is worked out'}`
}

function QuarterCell({
  row,
  quarter,
  column,
  history,
}: {
  row: HiringQuarterRow
  quarter: QuarterKey
  column: Column<HiringQuarterRow> | undefined
  history: boolean
}) {
  const v = row[quarter]
  const note = row.notes[quarter]
  const text = v == null ? DASH : fmt(v, row.format)
  const records = v == null ? null : (column?.drill?.(row) as DrillSource)
  const card = v == null || records ? null : (column?.calc?.(row) as CalcSource)
  const quarterLabel = column?.label ?? quarter
  const body = records ? (
    <Drill spec={records} label={quarterCellName(row, quarterLabel, history, text, 'records')}>
      {text}
    </Drill>
  ) : card ? (
    <Calc spec={card} label={quarterCellName(row, quarterLabel, history, text, 'card')}>
      {text}
    </Calc>
  ) : (
    text
  )
  return (
    <td
      className={cx(
        td,
        'tnum text-right whitespace-nowrap',
        history ? 'bg-sheet-2 text-muted' : v == null ? 'text-muted' : 'text-ink',
      )}
    >
      <span className="block">{body}</span>
      {note && <span className="block text-meta text-muted">{note}</span>}
    </td>
  )
}
