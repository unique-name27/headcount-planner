/**
 * The frames every role home shares (the template app's Frames):
 *
 *  - `Hero`: the one number the role is judged on, in `text-hero`, in a span 4 Figure, opening its
 *    records or its calculation card, with what it compares with under it ("Compared with FY27
 *    target: 644"). Its table view and exports are the hero's one row. A hidden number reads "—"
 *    with the guard's reason.
 *  - `ListFigure`: My list, one table-only Figure (`home-list`, span 12): the first 50 rows on
 *    screen with "Show all", every row in the export.
 */
import { type Column, Figure } from '@/charts'
import type { FieldRef } from '@/data/quality/fieldRef'
import { Calc, Drill } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import type { HeroModel } from '../../types'

interface HeroRow {
  [key: string]: unknown
  measure: string
  value: number | null
  comparedWith: string
  comparison: number | null
}

/** "vs FY27 target" read as "Compared with FY27 target". */
const compared = (label: string): string => `Compared with ${label.replace(/^vs /, '')}`

export function Hero({
  id,
  metric,
  uses,
  hero,
}: {
  id: string
  metric: string
  uses: readonly FieldRef[]
  hero: HeroModel
}) {
  const value = fmt(hero.value, hero.format)
  const rows: HeroRow[] = [
    {
      measure: hero.title,
      value: hero.value,
      comparedWith: hero.comparison?.label ?? '',
      comparison: hero.comparison?.value ?? null,
    },
  ]
  const columns: Column<HeroRow>[] = [
    { key: 'measure', label: 'Measure' },
    {
      key: 'value',
      label: 'Value',
      format: hero.format,
      ...(hero.format.startsWith('money') ? { cost: true } : {}),
    },
    { key: 'comparedWith', label: 'Compared with' },
    {
      key: 'comparison',
      label: 'Comparison',
      format: hero.format,
      ...(hero.format.startsWith('money') ? { cost: true } : {}),
    },
  ]
  return (
    <Figure
      id={id}
      metric={metric}
      uses={uses}
      title={hero.title}
      subtitle={hero.subtitle}
      data={rows}
      columns={columns}
      note={hero.note ?? undefined}
      span={4}
      image={false}
      emptyHeight={150}
    >
      <div data-tour="home-hero">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="cut-head text-hero font-semibold text-ink">
            {hero.value == null ? (
              value
            ) : hero.drill ? (
              <Drill spec={hero.drill} label={`Show the records behind ${value} ${hero.label}`}>
                {value}
              </Drill>
            ) : hero.calc ? (
              <Calc spec={hero.calc} label={`Show how ${value} ${hero.label} is calculated`}>
                {value}
              </Calc>
            ) : (
              value
            )}
          </span>
          <span className="text-small text-ink-2">{hero.label}</span>
        </div>
        {hero.value == null && hero.reason && <p className="mt-2 text-meta text-muted">{hero.reason}</p>}
        {hero.comparison && (
          <p className="mt-3 text-small text-ink-2">
            {compared(hero.comparison.label)}:{' '}
            <span className="font-semibold text-ink">{fmt(hero.comparison.value, hero.format)}</span>
          </p>
        )}
      </div>
    </Figure>
  )
}

/** Rows My list shows before "Show all" (the export holds every row). */
export const LIST_ROWS = 50

export function ListFigure<T extends object>({
  metric,
  uses,
  title,
  subtitle,
  rows,
  columns,
  note,
  empty,
}: {
  metric: string
  uses: readonly FieldRef[]
  title: string
  subtitle?: string
  rows: readonly T[]
  columns: readonly Column<T>[]
  note?: string
  empty?: string | null
}) {
  return (
    <Figure
      id="home-list"
      metric={metric}
      uses={uses}
      title={title}
      subtitle={subtitle}
      data={rows}
      columns={columns}
      note={note}
      span={12}
      tableOnly
      table={{ maxRows: LIST_ROWS }}
      // The words for an empty list show only when the list is empty.
      empty={rows.length ? null : (empty ?? 'Nothing to list in this scope.')}
    />
  )
}
