/**
 * Plan > Recruiting summary (docs/PLAN.md 9.8, change C38): one screen to show the head of
 * recruiting. The seven numbers first, then the one chart (heads and hiring by month, full width),
 * then the small table by quarter ahead beside where hiring happened. Renders `usePlanRecruiting()`
 * (./model.ts); computes nothing. Heads only in every mode. "Future starts" (signed offers) and
 * "Projected starts" (the model) are always apart and named so.
 *
 * The deck export of the tab is one slide (9.8 item 5): the chart's figure carries the seven numbers
 * (`deckSummary`) and stands in for the strip, the table and the lists, which stay in the workbook.
 * The slide's numbers are the strip's as the strip shows them (`summaryNumbersOf`): a tile the data
 * standard holds back, or one hidden for anonymity, prints "—" and why, never its value.
 */
import { useMemo } from 'react'
import { kpisInMode } from '@/access/numbers'
import { BarList, Figure } from '@/charts'
import type { Column, DeckNumber, DeckSummary } from '@/charts/types'
import { Grid, KpiStrip, kpiValueText, SUPPRESSED_NOTE } from '@/components'
import { RouteLink } from '@/components/RouteLink'
import type { TierGate } from '@/components/tier/tierModel'
import { useGateFn } from '@/components/tier/useTierGate'
import type { Kpi } from '@/components/types'
import { useAnalytics } from '@/data/context'
import { asOfLine } from '@/drill/subtitle'
import { DASH, fmt } from '@/lib/format'
import { PLAN_FIGURES } from '../engine/figures'
import { type RecruitingWhereRow, type WhereTie, whereMoreText } from '../engine/recruitingTab'
import { definitionsOf } from '../engine/wording'
import { ID } from '../metrics'
import { usePlanRecruiting } from './model'
import { RecruitingMonthsChart } from './RecruitingMonthsChart'
import { cellOpens, openCellOrCard } from './shared'

/** The figures of the tab the one slide stands in for: every figure but the chart's (9.8 item 5). */
export const SUMMARY_REPLACES = [
  PLAN_FIGURES.recruitingKpis,
  PLAN_FIGURES.recruitingQuarters,
  PLAN_FIGURES.recruitingWhere,
] as const

/**
 * The slide's numbers, the tiles as the strip shows them: the value as the tile prints it and its
 * note; "—" and the reason for a tile the data standard holds back (its gate) or hides for anonymity.
 */
export function summaryNumbersOf(kpis: readonly Kpi[], gates: readonly (TierGate | null)[]): DeckNumber[] {
  return kpis.map((k, i) => {
    const gate = gates[i] ?? null
    const hidden = !!gate && !gate.shown
    const note = hidden ? gate.reason : k.suppressed ? (k.suppressedNote ?? SUPPRESSED_NOTE) : k.note
    return { label: k.label, value: hidden ? DASH : kpiValueText(k), ...(note ? { note } : {}) }
  })
}

function WhereList({
  title,
  rows,
  more,
  tie,
  noun,
  columns,
}: {
  title: string
  rows: readonly RecruitingWhereRow[]
  more: number
  /** Places beyond the cut with as many hires as the fifth (review RN-7). */
  tie: WhereTie | null
  noun: readonly [string, string]
  columns: readonly Column<RecruitingWhereRow>[]
}) {
  return (
    <div className="min-w-0">
      <h4 className="text-small font-semibold text-ink-2">{title}</h4>
      {rows.length ? (
        <BarList
          data={rows}
          label="name"
          value="hires"
          format="int"
          sort="none"
          secondary={(d) => (d.perMonth == null ? null : `${fmt(d.perMonth, 'num1')} a month`)}
          // Named for the keyboard (review HU-6). No unit: "1 hires" would break the plain-count rule.
          ariaLabel={`${title}: hires in the last 3 months`}
          selectable={(d) => cellOpens(columns, 'hires', d)}
          onSelect={(d) => openCellOrCard(columns, 'hires', d)}
        />
      ) : (
        <p className="text-small text-muted">No hire.</p>
      )}
      {more > 0 && <p className="mt-1 text-small text-muted">{whereMoreText(more, tie, noun)}</p>}
    </div>
  )
}

export function Recruiting() {
  const ctx = useAnalytics()
  const m = usePlanRecruiting()
  const gateOf = useGateFn()
  const months = m.months
  const q = m.quarters
  const where = m.where
  const locations = where.rows.filter((r) => r.kind === 'location')
  const departments = where.rows.filter((r) => r.kind === 'department')
  // The strip's own tiles (those the mode shows) and their gates, so the slide prints what it shows.
  const tiles = kpisInMode(ctx.access, m.kpis)
  const gates = tiles.map((k) => gateOf(k.uses))
  const numbersKey = JSON.stringify(summaryNumbersOf(tiles, gates))
  const subtitle = asOfLine(ctx.asOf, ctx.scopeLabel, m.fiscalYear)
  // One object while the numbers hold (by their text), so the figure registers once per change.
  const deckSummary = useMemo<DeckSummary>(
    () => ({
      title: 'Recruiting summary',
      subtitle,
      numbers: JSON.parse(numbersKey) as DeckNumber[],
      replaces: SUMMARY_REPLACES,
    }),
    [subtitle, numbersKey],
  )
  return (
    <Grid>
      {/* The seven numbers are the point of the tab: a phone shows them all, with no "Show all 7". */}
      <KpiStrip id={PLAN_FIGURES.recruitingKpis} kpis={m.kpis} phoneTiles={m.kpis.length} />
      <Figure
        id={PLAN_FIGURES.recruitingMonths}
        metric={months.metric}
        uses={months.uses}
        title={months.title}
        subtitle={months.subtitle}
        data={months.rows}
        columns={months.columns}
        definitions={definitionsOf(
          ctx.metrics,
          ID.hiringHiresByMonth,
          ID.hiringExitsByMonth,
          ID.hiringAcceptedStarts,
          ID.recruitingProjectedStarts,
          ID.hiringExpectedExits,
          ID.recruitingProjectedHeads,
          ID.hiringApprovedByQuarter,
        )}
        note={months.note ?? undefined}
        empty={months.empty}
        deckSummary={deckSummary}
      >
        <RecruitingMonthsChart rows={months.rows} columns={months.columns} />
      </Figure>
      <Figure
        id={PLAN_FIGURES.recruitingQuarters}
        metric={q.metric}
        uses={q.uses}
        title={q.title}
        subtitle={q.subtitle}
        data={q.rows}
        columns={q.columns}
        definitions={definitionsOf(
          ctx.metrics,
          ID.hiringApprovedByQuarter,
          ID.hiringAcceptedStarts,
          ID.hiringMovesIn,
          ID.recruitingProjectedStarts,
          ID.hiringExpectedExits,
          ID.recruitingProjectedHeads,
          ID.recruitingGap,
        )}
        note={q.note ?? undefined}
        empty={q.empty}
        tableOnly
        tableToggle={false}
        image={false}
        span={7}
      />
      <Figure
        id={PLAN_FIGURES.recruitingWhere}
        metric={where.metric}
        uses={where.uses}
        title={where.title}
        subtitle={where.subtitle}
        data={where.rows}
        columns={where.columns}
        definitions={definitionsOf(ctx.metrics, ID.hiringRecentHires, ID.hiringPace)}
        note={where.note ?? undefined}
        empty={where.empty}
        image={false}
        tableToggle={false}
        span={5}
      >
        {/* Side by side where each list keeps room for its names (a phone held wide, a wide desk). */}
        <div className="grid gap-4 sm:max-md:grid-cols-2 xl:grid-cols-2">
          <WhereList
            title="Locations"
            rows={locations}
            more={m.whereMore.locations}
            tie={m.whereTies.locations}
            noun={['location', 'locations']}
            columns={where.columns}
          />
          <WhereList
            title="Departments"
            rows={departments}
            more={m.whereMore.departments}
            tie={m.whereTies.departments}
            noun={['department', 'departments']}
            columns={where.columns}
          />
        </div>
        <p className="mt-3 text-small">
          <RouteLink view="plan" tab="hiring" className="text-link hover:underline">
            See every location and department in Plan &gt; Hiring
          </RouteLink>
        </p>
      </Figure>
    </Grid>
  )
}
