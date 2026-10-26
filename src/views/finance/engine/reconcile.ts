/**
 * Finance > Reconcile (docs/PLAN.md 6.10, 9.4, 15.1 R27): the imported position status against who
 * is in each seat on the as-of date, the exceptions by kind (each marked reviewed when the plan
 * state says so), and the tab's KPIs: Reconciliation exceptions, Reqs not in plan, Not in plan and
 * Cost-center mismatches. HRBP sees its business unit only (the scope).
 *
 * Readings taken here (views-2 builder, M2):
 *  - Exceptions are computed once over the whole company (`reconcile` on every position and worker)
 *    and kept where their position is in scope, or, for a person with no position, where the person
 *    is in the scoped workers; so a filter never makes a seat look like an exception.
 *  - Not in plan (`plan.heads.notInPlan`) is the count of `not-in-plan` exceptions, drilling to those
 *    people's worker rows; Cost-center mismatches the count of `cost-center-mismatch` exceptions.
 *  - Reqs not in plan: reqs Open or On hold as known on the as-of date whose position is blank,
 *    unknown or not an approved head in the version shown (Working: the derived seat on the as-of
 *    date; a locked version: its line for the as-of month is Filled, Open or Planned).
 */
import type { Kpi } from '@/components/types'
import type { AnalyticsContext } from '@/data/context'
import { monthKey } from '@/data/fiscal'
import type { PositionRow, ReqRow, WorkerRow } from '@/data/schema'
import { seatIndex } from '@/drill/seats'
import { drillSpec } from '@/drill/types'
import { fmt, plural } from '@/lib/format'
import { reqAsOf } from '@/plan/engine/cost'
import { planLineRows } from '@/plan/engine/lineTable'
import { RECON_KINDS, type ReconException, type ReconKind, reconcile } from '@/plan/engine/reconcile'
import { isLocked, seatDetailOn } from '@/plan/engine/versions'
import { ID as PLAN_ID } from '@/views/plan/metrics'
import { ID } from '../metrics'
import type { FinancePrep } from './base'
import { FINANCE_FIGURES } from './figures'
import type { FinanceReconcile, ReconRow } from './index'
import { figure } from './versions'
import { mayReview, writeAccess } from './writes'

const memo = new WeakMap<
  readonly PositionRow[],
  WeakMap<readonly WorkerRow[], Map<string, ReconException[]>>
>()

/** Every exception over the whole company on the as-of date (memoized per positions, workers and date). */
export function companyExceptions(ctx: Pick<AnalyticsContext, 'all' | 'asOf'>): readonly ReconException[] {
  let byWorkers = memo.get(ctx.all.positions)
  if (!byWorkers) {
    byWorkers = new WeakMap()
    memo.set(ctx.all.positions, byWorkers)
  }
  let byDate = byWorkers.get(ctx.all.workers)
  if (!byDate) {
    byDate = new Map()
    byWorkers.set(ctx.all.workers, byDate)
  }
  let hit = byDate.get(ctx.asOf)
  if (!hit) {
    hit = reconcile(ctx.all, ctx.asOf)
    byDate.set(ctx.asOf, hit)
  }
  return hit
}

/** The exceptions in scope, each with whether it was marked reviewed. */
export function exceptionsInScope(p: FinancePrep): ReconRow[] {
  const people = new Set(p.ctx.data.workers.map((w) => w.employeeId))
  const reviewed = new Set((p.ctx.plan?.reviewed ?? []).map((r) => r.exceptionId))
  const access = writeAccess(p.ctx, 'markReviewed')
  return companyExceptions(p.ctx)
    .filter((e) => (e.positionId ? p.selected.has(e.positionId) : !!e.employeeId && people.has(e.employeeId)))
    .map((e) => ({
      ...e,
      reviewed: reviewed.has(e.id),
      reviewedText: reviewed.has(e.id) ? 'Reviewed' : 'Open',
      kindText: RECON_KIND_WORD[e.kind],
      reviewable: !reviewed.has(e.id) && mayReview(p, access, e),
    }))
}

/** The exception kinds' words. */
export const RECON_KIND_WORD: Readonly<Record<ReconKind, string>> = {
  'not-in-plan': 'Not in plan',
  'cost-center-mismatch': 'Cost-center mismatch',
  'filled-no-assignment': 'Filled with no assignment',
  'assignment-on-open': 'Assignment on a seat not Filled',
  overlap: 'Overlapping assignments',
}

/** Reqs Open or On hold on the as-of date with no approved position in the version shown. */
export function reqsNotInPlan(p: FinancePrep): ReqRow[] {
  const { ctx } = p
  const v = p.version
  const asOf = ctx.asOf
  let approved: (id: string) => boolean
  if (v && isLocked(v)) {
    const month = monthKey(asOf)
    const ids = new Set<string>()
    for (const l of planLineRows(v.lines))
      if (l.month === month && (l.status === 'Filled' || l.status === 'Open' || l.status === 'Planned'))
        ids.add(l.positionId)
    approved = (id) => ids.has(id)
  } else {
    const seats = seatIndex(ctx)
    approved = (id) => {
      const h = seats.get(id)
      return !!h && seatDetailOn(h, asOf)?.approvedHead === true
    }
  }
  return ctx.data.reqs.filter((r) => {
    const known = reqAsOf(r, asOf)
    if (!known || (known.status !== 'Open' && known.status !== 'On hold')) return false
    return !r.positionId || !approved(r.positionId)
  })
}

/** Finance > Reconcile. */
export function reconcileTab(p: FinancePrep): FinanceReconcile {
  const { ctx } = p
  const rows = exceptionsInScope(p)
  const open = rows.filter((r) => !r.reviewed)
  const byKind = (k: ReconKind) => rows.filter((r) => r.kind === k)
  const notInPlan = byKind('not-in-plan')
  const mismatches = byKind('cost-center-mismatch')
  const reqs = reqsNotInPlan(p)
  const workersOf = new Set(notInPlan.map((e) => e.employeeId))
  const notInPlanWorkers = ctx.data.workers.filter(
    (w) => workersOf.has(w.employeeId) && (!w.positionId || !p.selected.has(w.positionId)),
  )
  const seen = new Set<string>()
  const people = notInPlanWorkers.filter((w) => {
    if (seen.has(w.employeeId)) return false
    seen.add(w.employeeId)
    return true
  })
  const exceptionsDrill = (title: string, list: readonly ReconException[]) => () =>
    drillSpec({
      kind: 'exceptions',
      title,
      subtitle: `As of ${fmt(ctx.asOf, 'date')} · ${ctx.scopeLabel}`,
      rows: list,
      uses: p.uses(ID.reconExceptions),
    })
  const kinds = RECON_KINDS.filter((k) => byKind(k).length)
  const kpis: Kpi[] = [
    {
      id: 'finance-recon-exceptions',
      metricId: ID.reconExceptions,
      label: 'Reconciliation exceptions',
      value: rows.length,
      format: 'int',
      goodDirection: 'down',
      note: kinds.length
        ? kinds.map((k) => `${byKind(k).length} ${RECON_KIND_WORD[k].toLowerCase()}`).join(', ')
        : 'None',
      definition: p.definition(ID.reconExceptions),
      formula: `${plural(open.length, 'exception')} open, ${rows.length - open.length} marked reviewed.`,
      drill: exceptionsDrill('Reconciliation exceptions', rows),
      uses: p.uses(ID.reconExceptions),
    },
    {
      id: 'finance-reqs-not-in-plan',
      metricId: PLAN_ID.reqsNotInPlan,
      label: 'Reqs not in plan',
      value: reqs.length,
      format: 'int',
      goodDirection: 'down',
      note: 'Close them in the recruiting system',
      definition: p.definition(PLAN_ID.reqsNotInPlan),
      drill: () =>
        drillSpec({
          kind: 'reqs',
          title: 'Reqs not in plan',
          subtitle: `${p.version?.name ?? ''} · ${ctx.scopeLabel}`,
          rows: reqs,
          note: 'Open and On hold reqs whose position is blank, unknown or not an approved head.',
          uses: p.uses(PLAN_ID.reqsNotInPlan),
        }),
      uses: p.uses(PLAN_ID.reqsNotInPlan),
    },
    {
      id: 'finance-not-in-plan',
      metricId: PLAN_ID.headsNotInPlan,
      label: 'Not in plan',
      value: people.length,
      format: 'int',
      goodDirection: 'down',
      definition: p.definition(PLAN_ID.headsNotInPlan),
      drill: () =>
        drillSpec({
          kind: 'workers',
          title: 'Active employees not in the plan',
          subtitle: ctx.scopeLabel,
          rows: people,
          uses: p.uses(PLAN_ID.headsNotInPlan),
        }),
      uses: p.uses(PLAN_ID.headsNotInPlan),
    },
    {
      id: 'finance-cost-center-mismatches',
      metricId: ID.reconCostCenterMismatch,
      label: 'Cost-center mismatches',
      value: mismatches.length,
      format: 'int',
      goodDirection: 'down',
      definition: p.definition(ID.reconCostCenterMismatch),
      drill: exceptionsDrill('Cost-center mismatches', mismatches),
      uses: p.uses(ID.reconCostCenterMismatch),
    },
  ]
  const shownRows = rows
  return {
    kpis,
    writes: {
      access: writeAccess(ctx, 'markReviewed'),
      reviewable: rows.filter((r) => r.reviewable).map((r) => r.id),
    },
    exceptions: figure(
      p,
      FINANCE_FIGURES.reconcile,
      ID.reconExceptions,
      'Reconciliation exceptions',
      `The imported status against who is in each seat on the as-of date`,
      shownRows,
      [
        { key: 'kindText', label: 'Exception' },
        { key: 'positionId', label: 'Position ID' },
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'detail', label: 'Detail' },
        { key: 'reviewedText', label: 'Reviewed' },
      ],
      shownRows.length ? null : 'No exception: the imported status matches the HRIS.',
    ),
  }
}
