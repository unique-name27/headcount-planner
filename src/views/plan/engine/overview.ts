/**
 * Plan > Overview's figures (docs/PLAN.md 9.4): heads by month (actual against the shown version's
 * and the comparison's plan heads), heads by unit, positions by status, cost by unit (guarded) and
 * openings by stage. Every counted cell opens exactly its rows; a unit's cells carry its filter. Pure.
 */
import type { Column } from '@/charts/types'
import { BAND_LINE_LABEL, type CostRow } from '@/cost/guard'
import { monthEnd } from '@/data/fiscal'
import { type Month, POSITION_STATUSES, type PositionStatus, type WorkerRow } from '@/data/schema'
import { groupFilter } from '@/drill/filter'
import { asOfLine, subtitleOf } from '@/drill/subtitle'
import type { DrillSource } from '@/drill/types'
import { formatMonth } from '@/lib/dates'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import type { HeadsByGroupRow, HeadsByMonthRow, OpeningsStageRow, StatusCountRow } from '.'
import { monthLabel, type Prep } from './base'
import { placementOf, versionLinesOf } from './core'
import { planCost } from './cost'
import { monthEndLine, positionsSpec, workersSpec } from './drill'
import { PLAN_FIGURES } from './figures'
import { actualOn, closeHeadsIn, planHeadsAt, planHeadsByMonth, seatsOnDay } from './heads'
import { FIGURE } from './lineage'
import { OPENING_STAGES, openingsOf } from './openings'

/** The worker rows of employees, by employee ID (the scope's rows, the one held on the day first). */
export function workerRowsOf(p: Prep, employeeIds: Iterable<string>, on: string): WorkerRow[] {
  const active = actualOn(p, on)
  const byId = new Map<string, WorkerRow>()
  p.scope.assignments.forEach((a, i) => {
    if (!byId.has(a.employeeId)) byId.set(a.employeeId, p.scope.workers[i])
  })
  const out: WorkerRow[] = []
  for (const id of employeeIds) {
    const w = active.get(id)?.worker ?? byId.get(id)
    if (w) out.push(w)
  }
  return out
}

/** The unit of a position (its placement row, R26). */
export const unitOf = (p: Prep, id: string): string => placementOf(p.ctx).get(id)?.businessUnit ?? ''

/** The key and label of the actual-heads row of people with no position (glossary "Actual heads", review SA-6). */
export const NOT_IN_PLAN = 'Not in plan'

/**
 * The Heads by unit bars' note for the "Not in plan" row, whose approved heads are blank because
 * people with no position hold no approved head, not because a count is hidden (the bar list's
 * default note for a blank value says it is hidden). Its actual heads open from the table.
 */
export const NOT_IN_PLAN_BAR_NOTE =
  'People with no position hold no approved head. They count in actual heads.'

/**
 * Actual heads by business unit: each person under their seat's unit, and the people with no
 * position on one "Not in plan" row (NOT_IN_PLAN), never in their HRIS unit, so a unit's actual
 * heads compare like for like with its plan and approved heads and the rows still add up to the
 * tile (docs/PLAN.md 2, the glossary's "plus a Not in plan row"; M4 review SA-6).
 */
export function actualByUnit(p: Prep): Map<string, WorkerRow[]> {
  const out = new Map<string, WorkerRow[]>()
  for (const e of actualOn(p).values()) {
    const unit = e.assignment.positionId ? unitOf(p, e.assignment.positionId) : NOT_IN_PLAN
    const list = out.get(unit)
    if (list) list.push(e.worker)
    else out.set(unit, [e.worker])
  }
  return out
}

const groupBy = (ids: readonly string[], key: (id: string) => string): Map<string, string[]> => {
  const out = new Map<string, string[]>()
  for (const id of ids) {
    const k = key(id)
    const list = out.get(k)
    if (list) list.push(id)
    else out.set(k, [id])
  }
  return out
}

/* ───────────── heads by month ───────────── */

export function headsByMonth(p: Prep): FigureData<HeadsByMonthRow> {
  const v = p.version
  const ids = p.scope.ids
  const closed = new Set((p.ctx.plan?.closes ?? []).map((c) => c.month))
  const own = v ? planHeadsByMonth(versionLinesOf(p.ctx, v), p.grid, ids) : new Map<Month, string[]>()
  const cmp = p.comparison ? planHeadsByMonth(versionLinesOf(p.ctx, p.comparison), p.grid, ids) : null
  const actual = new Map<Month, string[]>()
  for (const m of p.grid)
    if (closed.has(m))
      actual.set(
        m,
        closeHeadsIn(p, m).map((l) => l.employeeId),
      )
  const rows: HeadsByMonthRow[] = p.grid.map((month) => ({
    month,
    label: monthLabel(month),
    actual: actual.get(month)?.length ?? null,
    plan: v ? (own.get(month)?.length ?? 0) : null,
    comparison: cmp ? (cmp.get(month)?.length ?? 0) : null,
  }))
  const versionName = v?.name ?? ''
  const columns: Column<HeadsByMonthRow>[] = [
    { key: 'label', label: 'Month', sortValue: (r) => r.month },
    {
      key: 'actual',
      label: 'Actual heads',
      format: 'int',
      drill: (r) =>
        actual.has(r.month)
          ? () =>
              workersSpec(
                p,
                `Actual heads at ${formatMonth(`${r.month}-01`)} month-end`,
                workerRowsOf(p, actual.get(r.month) ?? [], monthEnd(r.month)),
                {
                  subtitle: subtitleOf(`${formatMonth(`${r.month}-01`)} close`, p.ctx.scopeLabel),
                },
              )
          : null,
    },
    {
      key: 'plan',
      label: `Plan heads (${versionName})`,
      format: 'int',
      drill: (r) =>
        v
          ? () =>
              positionsSpec(p, `Plan heads in ${versionName}`, own.get(r.month) ?? [], {
                on: monthEnd(r.month),
                subtitle: monthEndLine(p.ctx, r.month, versionName),
              })
          : null,
    },
    {
      key: 'comparison',
      label: p.comparison ? `Plan heads (${p.comparison.name})` : 'Comparison',
      format: 'int',
      drill: (r) =>
        cmp && p.comparison
          ? () =>
              positionsSpec(p, `Plan heads in ${p.comparison?.name}`, cmp.get(r.month) ?? [], {
                on: monthEnd(r.month),
                subtitle: monthEndLine(p.ctx, r.month, p.comparison?.name),
              })
          : null,
    },
  ]
  return {
    id: PLAN_FIGURES.headsByMonth,
    metric: ID.headsPlan,
    title: 'Heads by month',
    subtitle: `Actual heads at each closed month-end against plan heads in ${versionName || 'the version'}${p.comparison ? ` and ${p.comparison.name}` : ''}.`,
    rows,
    columns,
    note: p.comparison
      ? null
      : `${p.vs.replace(/^vs /, 'The comparison is the ')}, which has no monthly plan.`,
    empty: v ? null : 'No version to show.',
    uses: p.uses(FIGURE.headsVsPlan),
  }
}

/* ───────────── heads by unit ───────────── */

export function headsByUnit(p: Prep): FigureData<HeadsByGroupRow> {
  const v = p.version
  const day = seatsOnDay(p, p.headsOn)
  const approved = groupBy(day.approved, (id) => unitOf(p, id))
  const actual = actualByUnit(p)
  const planIds = v ? planHeadsAt(versionLinesOf(p.ctx, v), p.planMonth, p.scope.ids) : []
  const cmpIds = p.comparison
    ? planHeadsAt(versionLinesOf(p.ctx, p.comparison), p.planMonth, p.scope.ids)
    : null
  const plan = groupBy(planIds, (id) => unitOf(p, id))
  const cmp = cmpIds ? groupBy(cmpIds, (id) => unitOf(p, id)) : null
  const units = [
    ...new Set([...approved.keys(), ...actual.keys(), ...plan.keys(), ...(cmp?.keys() ?? [])]),
  ].filter((u) => u !== '' && u !== NOT_IN_PLAN)
  const rows: HeadsByGroupRow[] = units
    .map((u) => ({
      key: u,
      label: u,
      approved: approved.get(u)?.length ?? 0,
      actual: actual.get(u)?.length ?? 0,
      plan: v ? (plan.get(u)?.length ?? 0) : null,
      comparison: cmp ? (cmp.get(u)?.length ?? 0) : null,
    }))
    .sort((a, b) => (b.approved ?? 0) - (a.approved ?? 0) || a.label.localeCompare(b.label))
  // People with no position: actual heads only, on their own row last (SA-6).
  const seatless = actual.get(NOT_IN_PLAN) ?? []
  if (seatless.length)
    rows.push({
      key: NOT_IN_PLAN,
      label: NOT_IN_PLAN,
      approved: null,
      actual: seatless.length,
      plan: null,
      comparison: null,
    })
  const notInPlan = (r: HeadsByGroupRow) => r.key === NOT_IN_PLAN
  const filterOf = (r: HeadsByGroupRow) => groupFilter('businessUnit', r.key)
  const atMonth = monthLabel(p.planMonth)
  const columns: Column<HeadsByGroupRow>[] = [
    { key: 'label', label: 'Business unit' },
    {
      key: 'approved',
      label: 'Approved heads',
      format: 'int',
      drill: (r) =>
        notInPlan(r)
          ? null
          : () =>
              positionsSpec(p, `Approved heads in ${r.label}`, approved.get(r.key) ?? [], {
                on: p.headsOn,
                filter: filterOf(r),
              }),
    },
    {
      key: 'actual',
      label: 'Actual heads',
      format: 'int',
      drill: (r) => () =>
        notInPlan(r)
          ? workersSpec(p, 'Actual heads not in the plan', actual.get(r.key) ?? [], {
              note: 'Active employees with no position: they count in actual heads, never in plan or approved heads.',
            })
          : workersSpec(p, `Actual heads in ${r.label}`, actual.get(r.key) ?? [], { filter: filterOf(r) }),
    },
    {
      key: 'plan',
      label: `Plan heads, ${atMonth}`,
      format: 'int',
      drill: (r) =>
        v && !notInPlan(r)
          ? () =>
              positionsSpec(p, `Plan heads in ${r.label}, ${v.name}`, plan.get(r.key) ?? [], {
                on: monthEnd(p.planMonth),
                subtitle: monthEndLine(p.ctx, p.planMonth, v.name),
                filter: filterOf(r),
              })
          : null,
    },
    {
      key: 'comparison',
      label: p.comparison ? `Plan heads, ${atMonth} (${p.comparison.name})` : 'Comparison',
      format: 'int',
      drill: (r) =>
        cmp && p.comparison && !notInPlan(r)
          ? () =>
              positionsSpec(p, `Plan heads in ${r.label}, ${p.comparison?.name}`, cmp.get(r.key) ?? [], {
                on: monthEnd(p.planMonth),
                subtitle: monthEndLine(p.ctx, p.planMonth, p.comparison?.name),
                filter: filterOf(r),
              })
          : null,
    },
  ]
  return {
    id: PLAN_FIGURES.headsByUnit,
    metric: ID.headsApproved,
    title: 'Heads by unit',
    subtitle: `Approved heads on ${p.headsOnLabel}, actual heads on ${p.onLabel}, plan heads at the ${atMonth} month-end.`,
    rows,
    columns,
    note: null,
    empty: rows.length ? null : 'No positions in this scope.',
    uses: p.uses(FIGURE.byUnit),
  }
}

/* ───────────── positions by status ───────────── */

export function positionsByStatus(p: Prep): FigureData<StatusCountRow> {
  const day = seatsOnDay(p)
  const rows: StatusCountRow[] = POSITION_STATUSES.map((status) => ({
    status,
    count: day.byStatus.get(status)?.length ?? 0,
  }))
  const columns: Column<StatusCountRow>[] = [
    { key: 'status', label: 'Status' },
    {
      key: 'count',
      label: 'Positions',
      format: 'int',
      drill: (r) => () =>
        positionsSpec(p, `${r.status} positions`, day.byStatus.get(r.status as PositionStatus) ?? []),
    },
  ]
  return {
    id: PLAN_FIGURES.positionsByStatus,
    metric: ID.positionsByStatus,
    title: 'Positions by status',
    subtitle: `Every position in scope on ${p.onLabel}. Filled and Open come from who is in the seat.`,
    rows,
    columns,
    note: null,
    empty: day.states.size ? null : 'No positions in this scope.',
    uses: p.uses(FIGURE.status),
  }
}

/* ───────────── cost by unit ───────────── */

export function costByUnit(p: Prep): FigureData<CostRow> {
  const fig = planCost(p).byUnit
  // Each row with the count of positions behind its amount (none where it reads "—").
  const rows: (CostRow & { positions: number | null })[] = (fig?.rows ?? []).map((r) => ({
    ...r,
    positions: r.positionIds.length ? r.positionIds.length : null,
  }))
  const filterOf = (r: CostRow) => (r.isOther ? undefined : groupFilter('businessUnit', r.key))
  const drill = (r: CostRow): DrillSource =>
    r.positionIds.length
      ? () =>
          positionsSpec(p, `Costed positions in ${r.label}`, r.positionIds, {
            subtitle: subtitleOf(p.windowName, p.ctx.scopeLabel),
            note: 'Positions only: no amount is listed per position.',
            ...(filterOf(r) ? { filter: filterOf(r) } : {}),
          })
      : null
  const money = p.env.mode === 'rounded' ? 'moneyM' : 'money'
  const columns: Column<CostRow>[] = [
    { key: 'label', label: 'Business unit' },
    { key: 'costed', label: 'Costed people', format: 'int' },
    { key: 'positions', label: 'Positions behind it', format: 'int', drill },
    { key: 'totalUsd', label: 'Loaded cost (USD)', format: money, cost: true },
    { key: 'bandUsd', label: `${BAND_LINE_LABEL} (USD)`, format: money, band: true },
    { key: 'reason', label: 'Why "—"', format: 'text' },
  ]
  return {
    id: PLAN_FIGURES.costByUnit,
    metric: ID.costLoaded,
    title: 'Loaded cost by unit',
    subtitle: `${p.windowName}, ${p.version?.name ?? ''}. Closed months are actual (HRIS estimate).`,
    rows,
    columns,
    note: fig?.note ?? fig?.reason ?? null,
    // A to-date window with no closed month (rounded modes, 7.3b) covers no month: it says so.
    empty: fig ? (rows.length ? null : (p.windowEmpty ?? null)) : 'No version to show.',
    uses: p.uses(FIGURE.cost),
  }
}

/* ───────────── openings by stage ───────────── */

export function openingsByStage(
  p: Prep,
  id: string = PLAN_FIGURES.openingsByStage,
): FigureData<OpeningsStageRow> {
  const o = openingsOf(p)
  const rows: OpeningsStageRow[] = OPENING_STAGES.map((s) => ({
    stage: s.stage,
    label: s.label,
    count: o.list.filter((x) => x.stage === s.stage).length,
  }))
  const columns: Column<OpeningsStageRow>[] = [
    { key: 'label', label: 'Stage' },
    {
      key: 'count',
      label: 'Openings',
      format: 'int',
      drill: (r) => () =>
        positionsSpec(
          p,
          `Openings: ${r.label.toLowerCase()}`,
          o.list.filter((x) => x.stage === r.stage).map((x) => x.positionId),
        ),
    },
  ]
  return {
    id,
    metric: ID.openingsCount,
    title: 'Openings by stage',
    subtitle: `Open and Planned seats on ${p.onLabel}, by where their req stands. An accepted offer shows its date only.`,
    rows,
    columns,
    note: null,
    empty: o.list.length ? null : 'No openings in this scope.',
    uses: p.uses(FIGURE.stage),
  }
}

/** "As of 30 Sep 2026 · Whole company". */
export const onLine = (p: Prep): string => asOfLine(p.on, p.ctx.scopeLabel)
