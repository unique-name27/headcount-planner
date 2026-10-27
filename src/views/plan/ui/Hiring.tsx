/**
 * Plan > Hiring (docs/PLAN.md 9.7, changes C36 and C37): the key figures, then the readout (span 4)
 * beside open to hire by quarter (the table, span 8), the small bar chart of open to hire at each
 * quarter end beside hiring velocity with its pace note, and the hires of the last 3 months by
 * location and department (a table, full width). Renders `usePlanHiring()` (./model.ts); computes
 * nothing. Heads only in every mode. Every figure names its metric, its lineage and its dictionary
 * definitions, and exports through the figure's own menu (the rows and columns the model hands over).
 */
import { BarList, Figure } from '@/charts'
import { Grid, KpiStrip, Readout } from '@/components'
import { useAnalytics } from '@/data/context'
import { QUARTER_KEYS, type QuarterKey } from '../engine/hiringTab'
import { definitionsOf } from '../engine/wording'
import { ID } from '../metrics'
import { HiringQuarterGrid } from './HiringQuarterGrid'
import { HiringVelocityChart } from './HiringVelocityChart'
import { usePlanHiring } from './model'
import { cellOpens, openCellOrCard } from './shared'

export function Hiring() {
  const ctx = useAnalytics()
  const m = usePlanHiring()
  const q = m.quarters
  const open = m.openByQuarter
  const v = m.velocity
  const recent = m.recent
  const kinds = Object.fromEntries(QUARTER_KEYS.map((k, i) => [k, open.rows[i]?.kind ?? 'ahead'])) as Record<
    QuarterKey,
    'history' | 'ahead'
  >
  const velocityNote = [v.note, m.paceNote].filter((x): x is string => !!x).join(' ')
  return (
    <Grid>
      <KpiStrip id="plan-hiring-kpis" kpis={m.kpis} />
      <div className="col-span-full min-w-0 max-md:order-1 lg:col-span-4">
        <Readout
          id="plan-hiring-readout"
          findings={m.findings}
          span={12}
          emptyText="Nothing unusual in hiring for this scope."
        />
      </div>
      <div className="col-span-full flex min-w-0 flex-col gap-4 max-md:contents lg:col-span-8">
        <Figure
          id="plan-hiring-quarters"
          metric={q.metric}
          uses={q.uses}
          title={q.title}
          subtitle={q.subtitle}
          data={q.rows}
          columns={q.columns}
          definitions={definitionsOf(
            ctx.metrics,
            ID.hiringApprovedByQuarter,
            ID.hiringCurrentHeads,
            ID.hiringAcceptedStarts,
            ID.hiringMovesIn,
            ID.hiringOpenByQuarter,
            ID.hiringNewByQuarter,
            ID.hiringExpectedExits,
            ID.hiringToReachPlan,
            ID.hiringNeededPace,
            ID.hiringHiresByMonth,
            ID.hiringExitsByMonth,
          )}
          note={q.note ?? undefined}
          empty={q.empty}
          image={false}
          tableToggle={false}
          className="max-md:order-2"
        >
          <HiringQuarterGrid rows={q.rows} columns={q.columns} kinds={kinds} />
        </Figure>
      </div>
      <Figure
        id="plan-hiring-open"
        metric={open.metric}
        uses={open.uses}
        title={open.title}
        subtitle={open.subtitle}
        data={open.rows}
        columns={open.columns}
        definitions={definitionsOf(ctx.metrics, ID.hiringOpenByQuarter, ID.hiringOpen)}
        note={open.note ?? undefined}
        empty={open.empty}
        span={4}
        className="max-md:order-3"
      >
        <BarList
          data={open.rows}
          label="label"
          value="open"
          format="int"
          sort="none"
          secondary={(d) => d.note}
          nullNote="This quarter is over"
          // Named for the keyboard (review HU-6). No unit: "1 heads" would break the plain-count rule.
          ariaLabel="Open to hire at each quarter end"
          selectable={(d) => cellOpens(open.columns, 'open', d)}
          onSelect={(d) => openCellOrCard(open.columns, 'open', d)}
        />
      </Figure>
      <Figure
        id="plan-hiring-velocity"
        metric={v.metric}
        uses={v.uses}
        title={v.title}
        subtitle={v.subtitle}
        data={v.rows}
        columns={v.columns}
        definitions={definitionsOf(
          ctx.metrics,
          ID.hiringHiresByMonth,
          ID.hiringExitsByMonth,
          ID.hiringPace,
          ID.hiringExitPace,
          ID.hiringNetPace,
          ID.hiringAttritionRate,
        )}
        note={velocityNote || undefined}
        empty={v.empty}
        span={8}
        className="max-md:order-4"
      >
        <HiringVelocityChart rows={v.rows} columns={v.columns} />
      </Figure>
      <Figure
        id="plan-hiring-recent"
        metric={recent.metric}
        uses={recent.uses}
        title={recent.title}
        subtitle={recent.subtitle}
        data={recent.rows}
        columns={recent.columns}
        definitions={definitionsOf(ctx.metrics, ID.hiringRecentHires, ID.hiringPace)}
        note={recent.note ?? undefined}
        empty={recent.empty}
        tableOnly
        tableToggle={false}
        image={false}
        table={{ maxRows: 30 }}
        className="max-md:order-5"
      />
    </Grid>
  )
}
