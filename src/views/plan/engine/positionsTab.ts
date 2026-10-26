/**
 * Plan > Positions (docs/PLAN.md 9.4): positions × months of the shown version, one status cell per
 * month (heads 1 when Filled), with a Band estimate column (`cost:band`, `band: true`: never Manager
 * mode), a Standard heads column (`plan.trade.weight`, every mode, `ui:trade-weights`) and a
 * per-position cost only for HR admin with the switch (`pay: true`). Nothing here is tied to a
 * Filled seat's pay or an offer outside HR admin with the switch. Pure.
 *
 * Readings taken here (views-1 builder, M2):
 *  - A month's cell is the version's plan status at the month-end (its line's status, the segment
 *    with the head first); a month with no line reads the seat's derived status then (an On hold,
 *    Eliminated or not yet started Open seat costs nothing, so it has no line). A month before the
 *    seat's first row has no cell.
 *  - The grid lists the scope's positions that exist in some month of the grid and are not
 *    Eliminated for all of it.
 *  - Band estimates show for Open, Planned and On hold seats with no accepted offer (the policy's
 *    "band estimates for Open and Planned seats; nothing tied to a filled seat or an offer"); a
 *    Filled seat and an accepted offer read "—". Standard heads show for every Employee seat that is
 *    not Eliminated.
 *  - The per-position cost is the seat's loaded cost over the fiscal year in the version shown.
 *
 * Added by the plan-ui builder (M3): each row's latest "Changed by your HRBP" note (./notes.ts, read
 * through `auditView` for the viewer), and the tab's list of every such note on the scope's seats with
 * its reason (`positionChanges`). The notes come from the audit log, which is plan state, not a
 * dataset: they add no field to the grid's lineage.
 */
import type { Column } from '@/charts/types'
import { monthEnd } from '@/data/fiscal'
import type { Month, PositionStatus } from '@/data/schema'
import type { DrillSource } from '@/drill/types'
import type { PlanLine } from '@/plan/types'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import type { HrbpChangeRow, PositionGridRow } from '.'
import { monthLabel, type Prep } from './base'
import { seatOn, shownLines, versionLinesOf } from './core'
import { positionsSpec } from './drill'
import { PLAN_FIGURES } from './figures'
import { FIGURE } from './lineage'
import { CHANGE_COLUMNS, changeRows, hrbpNotesBySeat } from './notes'
import { pricingOf } from './pricing'

/** A grid row, with whether the seat is an approved head (the strip's standard heads add those; not a column). */
export interface GridRow extends PositionGridRow {
  readonly approvedHead: boolean
}

export interface Grid {
  rows: readonly GridRow[]
  months: readonly Month[]
}

const memo = new WeakMap<Prep, Grid>()

export function positionsGrid(p: Prep): Grid {
  const hit = memo.get(p)
  if (hit) return hit
  const v = p.version
  const months = p.grid
  if (!v) {
    const empty: Grid = { rows: [], months }
    memo.set(p, empty)
    return empty
  }
  const lines = versionLinesOf(p.ctx, v)
  const cell = new Map<string, { status: PositionStatus; heads: number }>()
  for (const l of lines) {
    if (!p.scope.ids.has(l.positionId)) continue
    const k = `${l.positionId}|${l.month}`
    const cur = cell.get(k)
    if (!cur || l.heads > cur.heads) cell.set(k, { status: l.status, heads: l.heads })
  }
  const pricing = pricingOf(p.ctx, v)
  const bandShown = p.env.bandShown
  const showPay = p.ctx.showPay
  const fy = new Set(p.fyMonths)
  const annual = new Map<string, number>()
  if (showPay)
    for (const l of shownLines(p.ctx, v) as readonly PlanLine[])
      if (fy.has(l.month) && p.scope.ids.has(l.positionId))
        annual.set(l.positionId, (annual.get(l.positionId) ?? 0) + l.usd.loaded)
  const notes = hrbpNotesBySeat(p.ctx)
  const rows: GridRow[] = []
  for (const id of [...p.scope.ids].sort()) {
    const statuses: Record<string, PositionStatus> = {}
    let alive = false
    for (const m of months) {
      const c = cell.get(`${id}|${m}`)
      const status = c?.status ?? seatOn(p.ctx, id, monthEnd(m))?.status
      if (!status) continue
      statuses[m] = status
      if (status !== 'Eliminated') alive = true
    }
    if (!alive) continue
    const now = seatOn(p.ctx, id, p.on)
    const pos = now?.position ?? seatOn(p.ctx, id, monthEnd(months[months.length - 1]))?.position
    if (!pos) continue
    const status: PositionStatus = now?.status ?? 'Planned'
    const banded =
      bandShown && (status === 'Open' || status === 'Planned' || status === 'On hold') && !now?.acceptedOffer
    rows.push({
      positionId: id,
      title: pos.title,
      level: pos.level,
      location: pos.location,
      businessUnit: pos.businessUnit,
      department: pos.department,
      fte: pos.fte,
      status,
      standardHeads: status === 'Eliminated' ? null : pricing.weight(pos),
      bandEstimateUsd: banded ? pricing.bandUsd(pos) : null,
      costAnnualUsd: showPay ? (annual.get(id) ?? 0) : null,
      hrbpNote: notes.get(id)?.[0]?.text ?? null,
      approvedHead: (p.headsOn === p.on ? now : seatOn(p.ctx, id, p.headsOn))?.approvedHead ?? false,
      ...statuses,
    } as GridRow)
  }
  const out: Grid = { rows, months }
  memo.set(p, out)
  return out
}

/** The grid as the figure the table and the exports read. */
export function positionsGridFigure(p: Prep): FigureData<PositionGridRow> {
  const g = positionsGrid(p)
  const open =
    (r: PositionGridRow): DrillSource =>
    () =>
      positionsSpec(p, `Position ${r.positionId}`, [r.positionId])
  const columns: Column<PositionGridRow>[] = [
    { key: 'positionId', label: 'Position ID', drill: open },
    { key: 'title', label: 'Title', freeText: true },
    { key: 'level', label: 'Level' },
    { key: 'location', label: 'Location' },
    { key: 'businessUnit', label: 'Business unit' },
    { key: 'department', label: 'Department' },
    { key: 'fte', label: 'FTE', format: 'num2' },
    { key: 'status', label: `Status, ${p.onLabel}` },
    { key: 'standardHeads', label: 'Standard heads', format: 'num2' },
    { key: 'bandEstimateUsd', label: 'Band estimate (USD)', format: 'moneyFull', band: true },
    { key: 'costAnnualUsd', label: `Annual cost, ${p.fiscalYear} (USD)`, format: 'moneyFull', pay: true },
    { key: 'hrbpNote', label: 'Latest change in Working', freeText: true },
    ...g.months.map((m): Column<PositionGridRow> => ({ key: m, label: monthLabel(m), only: 'sheets' })),
  ]
  return {
    id: PLAN_FIGURES.positionsGrid,
    metric: ID.positionsByStatus,
    title: 'Positions by month',
    subtitle: `Each position's status at every month-end of ${p.version?.name ?? 'the version'}. Filled counts 1 head.`,
    rows: g.rows,
    columns,
    note: p.env.bandShown
      ? 'Band estimates show for Open, Planned and On hold seats with no accepted offer.'
      : 'Standard heads are weights, never amounts.',
    empty: g.rows.length ? null : 'No positions in this scope.',
    uses: p.uses(FIGURE.grid),
  }
}

/** Plan > Positions: the Working changes the HRBP made on the scope's seats (M3). */
export function positionChanges(p: Prep): FigureData<HrbpChangeRow> {
  const rows = changeRows(p.ctx, p.scope.ids, (id) => seatOn(p.ctx, id, p.on)?.position.title ?? null)
  return {
    id: PLAN_FIGURES.positionsChanges,
    metric: ID.positionsByStatus,
    title: 'Changes in Working',
    subtitle:
      'Start, level, location, FTE and hold changes the HRBP made to Open and Planned seats, newest first',
    rows,
    columns: CHANGE_COLUMNS,
    note: null,
    empty: rows.length ? null : 'No HRBP changes to the seats in this scope yet.',
    uses: p.uses(FIGURE.changes),
  }
}
