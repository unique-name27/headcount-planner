/**
 * Rollup vs target (docs/PLAN.md 9.3, Leader): the hero year-end heads vs target beside the six key
 * figures (heads vs target, cost vs target, rounded, year-end gap, Plan > Hiring's open to hire this
 * fiscal year (9.7), approvals waiting on you, unallocated), Needs attention (approvals waiting on you, sub-orgs over target), My list (the
 * sub-orgs with heads, asks and gap), then a bullet per sub-org against its target. Every number is
 * the producing view's, from the model; a sub-org's over-or-under state is its producer's guarded
 * flag (7.2 rule 8), never recomputed here.
 */
import { Bullet, Figure } from '@/charts'
import { KpiStrip, Section } from '@/components'
import type { RollupHomeModel } from '../engine'
import { AttentionSection } from './Attention'
import { Hero, ListFigure } from './Frames'
import { HomeTop } from './HomeTop'
import type { HomeItems } from './model'

export function RollupHome({ model, items }: { model: RollupHomeModel; items: HomeItems | null }) {
  const { list, suborgs } = model
  return (
    <>
      <HomeTop
        hero={
          <Hero
            id="home-rollup-heads-vs-target"
            metric={model.hero.metric}
            uses={model.hero.uses}
            hero={model.hero}
          />
        }
        overview={<KpiStrip id="home-rollup-kpis" title="Key figures" kpis={model.kpis} span={8} />}
        attention={
          <AttentionSection items={items} dek="Approvals waiting on you and sub-orgs over their targets." />
        }
      />
      <Section title="My list" dek="Your sub-orgs’ heads, asks and gap at their target date.">
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
      <Section title="Sub-orgs against target" dek="Asks against each sub-org’s heads target, on one scale.">
        <Figure
          id="home-rollup-suborgs"
          metric={suborgs.metric}
          uses={suborgs.uses}
          title={suborgs.title}
          subtitle={suborgs.subtitle}
          data={suborgs.rows}
          columns={suborgs.columns}
          note={suborgs.note ?? undefined}
          image={false}
          empty={suborgs.empty}
        >
          <Bullet
            data={suborgs.rows}
            label="label"
            value="asksHeads"
            target="targetHeads"
            format="int"
            status={(r) =>
              r.targetHeads == null
                ? null
                : r.over
                  ? { tone: 'critical', label: 'Over' }
                  : { tone: 'good', label: 'Within target' }
            }
            ariaLabel="Each sub-org’s asks against its heads target"
          />
        </Figure>
      </Section>
    </>
  )
}
