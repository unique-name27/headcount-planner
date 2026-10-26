/**
 * Targets > Sub-org targets (docs/PLAN.md 9.4): the parent targets, each sub-org's asks against its
 * target, what is left unallocated and the envelope exceptions waiting on Finance; from M3 "Split a
 * target" and "Move target" (a leader inside its envelope, Finance past it). Renders the model;
 * computes nothing.
 */
import { BulletList, Figure } from '@/charts'
import { Grid, KpiStrip } from '@/components'
import { drill } from '@/drill/Drill'
import { fmt } from '@/lib/format'
import { ID } from '../metrics'
import { defsOf, useTargets } from './model'
import { SubOrgBar } from './TargetChanges'

export function SubOrgs() {
  const { ctx, m } = useTargets()
  const s = m.suborgs
  const rows = s.rows
  const seatsOf = (r: (typeof rows.rows)[number]) =>
    rows.columns.find((c) => c.key === 'heads')?.drill?.(r) ?? null
  return (
    <Grid>
      <KpiStrip id="targets-suborgs-kpis" title="Key figures" kpis={s.kpis} />
      <SubOrgBar writes={s.writes} />
      <Figure
        id="targets-suborgs"
        metric={ID.gapHeads}
        definitions={defsOf(ctx, ID.asksHeads, ID.targetHeads, ID.gapHeads, ID.gapCost)}
        uses={rows.uses}
        title={rows.title}
        subtitle={rows.subtitle}
        data={rows.rows}
        columns={rows.columns}
        note={rows.note ?? undefined}
        empty={rows.empty}
      >
        <BulletList
          data={rows.rows}
          label="label"
          value="asksHeads"
          target="targetHeads"
          group="parent"
          scale="shared"
          format={(_r, v) => fmt(v, 'int')}
          status={(r) =>
            r.targetHeads == null
              ? null
              : r.over
                ? { tone: 'warning', label: 'Over' }
                : { tone: 'good', label: 'Within' }
          }
          onSelect={(r) => drill(seatsOf(r))}
          ariaLabel="Sub-orgs' asks against their targets"
        />
      </Figure>
      <Figure
        id="targets-suborgs-unallocated"
        metric={ID.subOrgUnallocated}
        definitions={defsOf(ctx, ID.subOrgUnallocated)}
        uses={s.unallocated.uses}
        title={s.unallocated.title}
        subtitle={s.unallocated.subtitle}
        data={s.unallocated.rows}
        columns={s.unallocated.columns}
        empty={s.unallocated.empty}
        span={6}
        tableOnly
        tableToggle={false}
        image={false}
      />
      <Figure
        id="targets-suborgs-exceptions"
        metric={ID.subOrgUnallocated}
        definitions={defsOf(ctx, ID.subOrgUnallocated)}
        uses={s.exceptions.uses}
        title={s.exceptions.title}
        subtitle={s.exceptions.subtitle}
        data={s.exceptions.rows}
        columns={s.exceptions.columns}
        empty={s.exceptions.empty}
        span={6}
        tableOnly
        tableToggle={false}
        image={false}
      />
    </Grid>
  )
}
