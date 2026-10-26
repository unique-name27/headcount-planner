/**
 * Unit plan (docs/PLAN.md 9.3, HRBP): the hero heads vs plan at the last closed month-end beside the
 * six key figures (heads vs plan, hires YTD vs plan, openings past target start, Plan > Hiring's open
 * to hire this fiscal year (9.7), year-end forecast vs target, cost vs comparison, rounded), Needs attention (requests waiting 5 or more days, managers not
 * submitted, Planned seats near start with no req, reconciliation exceptions in the unit), My list
 * (the unit's open requests by step), then openings by stage and forecast heads by month, and (M3) the
 * HRBP's Working changes with the ways to make them (Plan > Positions and Transfers). Every number is
 * the producing view's, from the model.
 */
import { BarList, Figure, Lines } from '@/charts'
import { KpiStrip, RouteLink, Section } from '@/components'
import { drill } from '@/drill/Drill'
import type { UnitHomeModel } from '../engine'
import { AttentionSection } from './Attention'
import { Hero, ListFigure } from './Frames'
import { HomeTop } from './HomeTop'
import type { HomeItems } from './model'

interface MonthLine {
  [key: string]: unknown
  month: string
  series: string
  heads: number | null
}

export function UnitHome({ model, items }: { model: UnitHomeModel; items: HomeItems | null }) {
  const { openings, forecast, list, changes } = model
  const lines: MonthLine[] = forecast.rows.flatMap((r) => [
    { month: r.month, series: 'Actual', heads: r.actual },
    { month: r.month, series: 'Forecast', heads: r.forecast },
    { month: r.month, series: 'Comparison', heads: r.comparison },
  ])
  const stageDrill = openings.columns.find((c) => c.key === 'count')?.drill
  return (
    <>
      <HomeTop
        hero={
          <Hero
            id="home-unit-heads-vs-plan"
            metric={model.hero.metric}
            uses={model.hero.uses}
            hero={model.hero}
          />
        }
        overview={<KpiStrip id="home-unit-kpis" title="Key figures" kpis={model.kpis} span={8} />}
        attention={
          <AttentionSection
            items={items}
            dek="Requests waiting 5 or more days, managers who have not sent their asks, Planned seats starting soon with no req, and reconciliation exceptions in your unit."
          />
        }
      />
      <Section title="My list" dek="The unit’s open requests, by the step they wait on.">
        <ListFigure
          metric={list.metric}
          uses={list.uses}
          title={list.title}
          subtitle={list.subtitle}
          rows={list.rows}
          columns={list.columns}
          note={list.note ?? undefined}
          empty={list.empty}
        />
      </Section>
      <Section
        title="Openings and forecast"
        dek="Where the unit’s openings stand, and its heads by month to the horizon."
      >
        <Figure
          id="home-unit-openings"
          metric={openings.metric}
          uses={openings.uses}
          title={openings.title}
          subtitle={openings.subtitle}
          data={openings.rows}
          columns={openings.columns}
          note={openings.note ?? undefined}
          span={6}
          empty={openings.empty}
        >
          <BarList
            data={openings.rows}
            label="label"
            value="count"
            sort="none"
            format="int"
            onSelect={stageDrill ? (r) => drill(stageDrill(r)) : undefined}
            ariaLabel="Openings by stage"
          />
        </Figure>
        <Figure
          id="home-unit-forecast"
          metric={forecast.metric}
          uses={forecast.uses}
          title={forecast.title}
          subtitle={forecast.subtitle}
          data={forecast.rows}
          columns={forecast.columns}
          note={forecast.note ?? undefined}
          span={6}
          empty={forecast.empty}
        >
          <Lines<MonthLine>
            data={lines}
            x="month"
            y="heads"
            series="series"
            seriesOrder={['Actual', 'Forecast', 'Comparison']}
            format="num1"
            xTicks="quarter"
            ariaLabel="Heads by month: closed actuals, then the forecast, against the comparison"
          />
        </Figure>
      </Section>
      <Section
        title="Working changes"
        dek={
          <>
            Your seat changes in Working, which each seat’s manager reads with its reason.{' '}
            <RouteLink view="plan" tab="positions" className="text-link hover:underline">
              Change a seat
            </RouteLink>{' '}
            or{' '}
            <RouteLink view="plan" tab="transfers" className="text-link hover:underline">
              process a transfer
            </RouteLink>{' '}
            in Plan.
          </>
        }
      >
        <Figure
          id="home-unit-changes"
          metric={changes.metric}
          uses={changes.uses}
          title={changes.title}
          subtitle={changes.subtitle}
          data={changes.rows}
          columns={changes.columns}
          note={changes.note ?? undefined}
          empty={changes.empty}
          tableOnly
          table={{ maxRows: 10 }}
        />
      </Section>
    </>
  )
}
