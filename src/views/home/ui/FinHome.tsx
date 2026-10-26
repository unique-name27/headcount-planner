/**
 * Plan vs actual (docs/PLAN.md 9.3, Finance): the hero full-year cost forecast vs the Budget beside
 * the six key figures (heads vs Budget, reqs not in plan, openings under a freeze, FX effect YTD,
 * freeze savings, reconciliation exceptions), Needs attention (Finance steps waiting, envelope
 * exceptions, cycle stage due), My list (units by cost variance), then the bridge and cost by unit
 * against the comparison. Every amount is the producing view's guarded output, from the model.
 */
import { Figure, HBars, Waterfall } from '@/charts'
import { KpiStrip, Section } from '@/components'
import type { FinHomeModel } from '../engine'
import { AttentionSection } from './Attention'
import { Hero, ListFigure } from './Frames'
import { HomeTop } from './HomeTop'
import type { HomeItems } from './model'

interface UnitBar {
  [key: string]: unknown
  org: string
  series: string
  usd: number | null
}

export function FinHome({ model, items }: { model: FinHomeModel; items: HomeItems | null }) {
  const { list, bridge, costByUnit } = model
  const bars: UnitBar[] = costByUnit.rows.flatMap((r) => [
    { org: r.org, series: 'Forecast', usd: r.actual },
    { org: r.org, series: 'Comparison', usd: r.comparison },
  ])
  return (
    <>
      <HomeTop
        hero={
          <Hero
            id="home-fin-cost-vs-budget"
            metric={model.hero.metric}
            uses={model.hero.uses}
            hero={model.hero}
          />
        }
        overview={<KpiStrip id="home-fin-kpis" title="Key figures" kpis={model.kpis} span={8} />}
        attention={
          <AttentionSection
            items={items}
            dek="Finance steps waiting on you, envelope exceptions and planning cycle stages falling due."
          />
        }
      />
      <Section title="My list" dek="Business units by their full-year cost variance, largest first.">
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
        title="From plan to forecast"
        dek="The bridge from the comparison to the forecast, and cost by unit."
      >
        <Figure
          id="home-fin-bridge"
          metric={bridge.metric}
          uses={bridge.uses}
          title={bridge.title}
          subtitle={bridge.subtitle}
          data={bridge.rows}
          columns={bridge.columns}
          note={bridge.note ?? undefined}
          span={6}
          empty={bridge.empty}
        >
          <Waterfall
            data={bridge.rows}
            format="money"
            ariaLabel="Bridge from the comparison to the forecast"
          />
        </Figure>
        <Figure
          id="home-fin-cost-unit"
          metric={costByUnit.metric}
          uses={costByUnit.uses}
          title={costByUnit.title}
          subtitle={costByUnit.subtitle}
          data={costByUnit.rows}
          columns={costByUnit.columns}
          note={costByUnit.note ?? undefined}
          span={6}
          empty={costByUnit.empty}
        >
          <HBars<UnitBar>
            data={bars}
            y="org"
            x="usd"
            series="series"
            seriesOrder={['Forecast', 'Comparison']}
            format="money"
            ariaLabel="Full-year cost forecast and the comparison by business unit"
          />
        </Figure>
      </Section>
    </>
  )
}
