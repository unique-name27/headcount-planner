/**
 * My team (docs/PLAN.md 9.3): Manager mode's home, one manager's tree in heads only. The hero (Left
 * to fill, split Open, requested and left to request) beside the seven key figures, with Plan >
 * Hiring's Open to hire tile under the hero (9.7, change C36: under Left to fill, not an eighth key
 * figure), then Needs attention, My list (the request tracker) and heads by month to fiscal year end
 * against the allocation. Every number is the model's (`teamModel`), drawn here with its metric and
 * fields; no amount of any kind (7.6).
 */

import { PICKER_COPY } from '@/access/copy'
import { openPicker } from '@/access/store'
import { Figure, Lines } from '@/charts'
import { EmptyState, Grid, KpiStrip, Section } from '@/components'
import { Button } from '@/components/ui'
import { useNarrow } from '@/components/useNarrow'
import { useAnalytics } from '@/data/context'
import type { AllocationMonthRow } from '../engine'
import { TeamAttention } from './Attention'
import { HeroFigure } from './HeroFigure'
import { useTeam, useTeamNeeds } from './model'

interface LineRow {
  [key: string]: unknown
  month: string
  series: string
  heads: number
}

const STAFFED = 'Staffed'
const WITH_PENDING = 'With pending requests'

/** The month figure's lines: staffed, and staffed with pending requests; the allocation is the rule. */
function lineRows(rows: readonly AllocationMonthRow[]): LineRow[] {
  return rows.flatMap((r) => [
    { month: r.month, series: STAFFED, heads: r.staffed },
    { month: r.month, series: WITH_PENDING, heads: r.withPending },
  ])
}

export function TeamPage() {
  const ctx = useAnalytics()
  const model = useTeam()
  const needs = useTeamNeeds()
  const narrow = useNarrow()
  if (ctx.access.mode === 'manager' && ctx.access.unset) {
    const copy = PICKER_COPY.manager
    return (
      <Grid>
        <EmptyState
          title={copy.title}
          body={copy.dek}
          action={
            <Button variant="primary" size="sm" onClick={() => openPicker('manager')}>
              {copy.title}
            </Button>
          }
        />
      </Grid>
    )
  }
  const months = model.headsVsAllocation
  const changes = model.hrbpChanges
  const hero = <HeroFigure hero={model.hero} />
  const kpis = (
    <KpiStrip
      id="team-kpis"
      title="Key figures"
      kpis={model.kpis}
      span={8}
      className={model.openToHire ? 'lg:row-span-2' : undefined}
    />
  )
  // Open to hire sits under Left to fill (9.7): under the hero, and after the key figures in the
  // page order on a wide screen. It names its own tour target, so the tours' "Key figures" step finds
  // the key figures on a phone too, where Open to hire comes first (review HU-7).
  const openToHire = model.openToHire ? (
    <KpiStrip
      id="team-open-to-hire"
      title="Open to hire"
      kpis={[model.openToHire]}
      span={4}
      tour="team-open-to-hire"
    />
  ) : null
  const attention = <TeamAttention items={needs} />
  return (
    <>
      {/* From 768px the hero beside the key figures with Open to hire under the hero, then Needs
          attention; on a phone the hero and Open to hire, then Needs attention, then the key figures,
          so the first item is within the first two screens. */}
      <section aria-labelledby="team-band">
        <h2 id="team-band" className="sr-only">
          Overview
        </h2>
        <Grid className={narrow ? undefined : 'grid-flow-row-dense'}>
          {hero}
          {!narrow && kpis}
          {openToHire}
        </Grid>
      </section>
      {attention}
      {narrow && (
        <section aria-label="Key figures" className="mt-10">
          <Grid>{kpis}</Grid>
        </section>
      )}
      <Section title="My list" dek="Your team’s requests, where each one is and who it waits on.">
        <Figure
          id="team-tracker"
          metric={model.tracker.metric}
          uses={model.tracker.uses}
          title={model.tracker.title}
          subtitle={model.tracker.subtitle}
          data={model.tracker.rows}
          columns={model.tracker.columns}
          note={model.tracker.note ?? undefined}
          tableOnly
          table={{ maxRows: 50 }}
          empty={model.tracker.empty}
        />
      </Section>
      <Section
        title="Changed by your HRBP"
        dek="Changes your HRBP made in Working to your Open and Planned seats."
      >
        <Figure
          id="team-hrbp-changes"
          metric={changes.metric}
          uses={changes.uses}
          title={changes.title}
          subtitle={changes.subtitle}
          data={changes.rows}
          columns={changes.columns}
          note={changes.note ?? undefined}
          tableOnly
          table={{ maxRows: 25 }}
          empty={changes.empty}
        />
      </Section>
      <Section
        title="Heads by month"
        dek="Who your team is staffed with at each month-end, against the allocation."
      >
        <Figure
          id="team-heads-vs-allocation"
          metric={months.metric}
          uses={months.uses}
          title={months.title}
          subtitle={months.subtitle}
          data={months.rows}
          columns={months.columns}
          note={months.note ?? undefined}
          empty={months.empty}
        >
          <Lines<LineRow>
            data={lineRows(months.rows)}
            x="month"
            y="heads"
            series="series"
            seriesOrder={[STAFFED, WITH_PENDING]}
            format="int"
            zero
            xTicks="month"
            ref={months.rows.length ? { value: months.rows[0].allocation, label: 'Allocation' } : undefined}
            ariaLabel="Staffed heads by month, with and without pending requests, against the allocation"
          />
        </Figure>
      </Section>
    </>
  )
}
