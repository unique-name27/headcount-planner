/**
 * My team's hero (docs/PLAN.md 9.3): Left to fill in `text-hero`, opening its seats, with its split
 * under it: one bar of Open, requested and left to request, each part a button opening its own
 * seats, and each part's count and word under the bar so the split never relies on color. Its table
 * view and exports are the parts' rows. Heads only.
 */
import { type Column, Figure } from '@/charts'
import { cx } from '@/components/ui'
import { Drill, drill } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import type { HeroModel, HeroPart } from '../../types'
import { heroDrillLabel } from '../engine/figures'

/** Open, requested, left to request: the first series, a lighter one, then the gray of what is still to do. */
const PAINT = ['bg-s1', 'bg-s3', 'bg-deemph']

interface PartRow {
  [key: string]: unknown
  part: string
  seats: number
  share: number | null
  key: string
}

export function HeroFigure({ hero }: { hero: HeroModel }) {
  const total = hero.parts.reduce((n, p) => n + p.count, 0)
  const rows: PartRow[] = hero.parts.map((p) => ({
    key: p.key,
    part: p.label,
    seats: p.count,
    share: total ? p.count / total : null,
  }))
  const byKey = new Map(hero.parts.map((p) => [p.key, p]))
  const columns: Column<PartRow>[] = [
    { key: 'part', label: 'Part' },
    { key: 'seats', label: 'Seats', format: 'int', drill: (r) => byKey.get(r.key)?.drill ?? null },
    { key: 'share', label: 'Share', format: 'pct' },
  ]
  const value = fmt(hero.value, hero.format)
  const shown = hero.parts.filter((p) => p.count > 0)
  return (
    <Figure
      id="team-left-to-fill"
      metric={hero.metric}
      uses={hero.uses}
      title={hero.title}
      subtitle={hero.subtitle}
      data={rows}
      columns={columns}
      note={hero.note ?? undefined}
      span={4}
      image={false}
      empty={hero.value == null ? (hero.reason ?? 'Nothing to show yet.') : null}
      emptyHeight={150}
    >
      <div data-tour="home-hero">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="cut-head text-hero font-semibold text-ink">
            {hero.drill && hero.value != null ? (
              <Drill spec={hero.drill} label={heroDrillLabel(hero.value, hero.label)}>
                {value}
              </Drill>
            ) : (
              value
            )}
          </span>
          <span className="text-small text-ink-2">{hero.label}</span>
        </div>
        {shown.length > 0 && (
          <fieldset
            className="mt-4 m-0 flex h-3 w-full min-w-0 gap-0.5 overflow-hidden rounded-mark border-0 p-0"
            aria-label={`${hero.title}: ${shown.map((p) => `${fmt(p.count, 'int')} ${p.label.toLowerCase()}`).join(', ')}`}
          >
            {shown.map((p: HeroPart) => (
              <button
                key={p.key}
                type="button"
                title={`${p.label}: ${fmt(p.count, 'int')} of ${fmt(total, 'int')}`}
                aria-label={heroDrillLabel(p.count, p.label.toLowerCase())}
                onClick={() => drill(p.drill)}
                className={cx(
                  'h-full cursor-pointer hover:opacity-80',
                  PAINT[hero.parts.indexOf(p)] ?? 'bg-sheet-3',
                )}
                style={{ flexGrow: p.count, flexBasis: 0 }}
              />
            ))}
          </fieldset>
        )}
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {hero.parts.map((p, i) => (
            <li key={p.key} className="flex items-center gap-1.5 text-meta text-ink-2">
              <span
                aria-hidden="true"
                className={cx('inline-block size-2 shrink-0 rounded-mark', PAINT[i])}
              />
              <span className="font-semibold text-ink">{fmt(p.count, 'int')}</span>
              <span>{p.label.toLowerCase()}</span>
            </li>
          ))}
        </ul>
      </div>
    </Figure>
  )
}
