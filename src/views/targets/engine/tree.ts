/**
 * Targets > Tree × cost center (docs/PLAN.md 6.9, 7.3, 7.4, 9.4): the leader tree's nodes against
 * Finance's cost centers, in approved heads on the as-of date, and cost per unit × cost center (the
 * unit's one fold: its shown cost centers and its Other).
 *
 * - A node is a cost atom of the last close (a director's org, a VP's own direct staff, 7.3a), so the
 *   cells partition the scope: every position sits in one node and one cost center, and the cells add
 *   up to the tab's KPI.
 * - Cost on a cell (the fiscal year's Working loaded cost, both parts): in Finance, and in HR admin
 *   with the switch off, only under the org-row rule (7.4: a cell that is a whole cost center the
 *   unit's fold shows); in HR admin with the switch on, always; in HRBP and Leader mode never (cost
 *   centers are not unions of atoms, 7.3); in Manager mode never.
 * - Cost per unit × cost center is the guard's breakdown of each unit by cost center under its fold
 *   (exact modes), so a folded cost center only ever shows inside its unit's Other; rounded modes show
 *   heads only.
 *
 * Readings taken here (views-2 builder, M2): a cell's heads are approved heads on the as-of date
 * (`targets.tree.costCenter`'s window) of the positions the scope and filters select; its cost is the
 * whole cell's, like every org row (a target or cost figure is for a whole org).
 */

import type { Column } from '@/charts/types'
import type { Kpi } from '@/components/types'
import { atomOf } from '@/cost/atoms'
import { NO_AMOUNTS_NOTE, WHOLE_TEAMS_NOTE } from '@/cost/fit'
import { ORG_COST_NOTE, OTHER } from '@/cost/fold'
import { type CostMember, guardModel } from '@/cost/guard'
import { seatIndex } from '@/drill/seats'
import { drillSpec } from '@/drill/types'
import { fmt, plural } from '@/lib/format'
import { seatDetailOn } from '@/plan/engine/versions'
import type { Position } from '@/plan/types'
import type { FigureData } from '../../types'
import { ID } from '../metrics'
import { type Prep, seatLabel, treeCellsOf } from './base'
import { TARGETS_FIGURES } from './figures'
import type { TreeCellRow } from './index'
import { managerOfLatest, membersOver, workingLines } from './working'

/** One unit × cost center row: a shown cost center or the unit's Other. */
export interface CostCenterRow {
  unit: string
  costCenter: string
  isOther: boolean
  heads: number
  /** Costed people in the cell; null where the mode computes no count (rounded, Manager, a fit note): never a written 0 (14.1 item 2, review EX-6). */
  costed: number | null
  costUsd: number | null
  bandUsd: number | null
  reason: string | null
}

/** The cells, their positions and the approved heads behind each. */
export interface TreeFacts {
  rows: TreeCellRow[]
  heads: Map<TreeCellRow, Position[]>
  all: Position[]
  costCenters: CostCenterRow[]
}

/** Approved heads on the as-of date of the selected positions, by position ID. */
function approvedSeats(p: Prep): Map<string, Position> {
  const out = new Map<string, Position>()
  const index = seatIndex(p.ctx)
  for (const id of p.selected) {
    const h = index.get(id)
    const s = h ? seatDetailOn(h, p.ctx.asOf) : null
    if (s?.approvedHead) out.set(id, s.position)
  }
  return out
}

/** A cost atom's node label: its leader seat's, else the department or unit it falls back to. */
function nodeLabel(p: Prep, atomId: string): string {
  if (p.latest.has(atomId)) return seatLabel(p, atomId)
  const m = /^department:(.+)\|(.+)$/.exec(atomId)
  if (m) return `${m[2]} (${m[1]})`
  return atomId.replace(/^unit:/, '')
}

/** The fiscal year's Working members of a set of positions (both parts). */
function membersOf(p: Prep, ids: ReadonlySet<string>): CostMember[] {
  return membersOver(p.ctx, workingLines(p.ctx, p.frame), p.frame.months).filter((m) => ids.has(m.positionId))
}

/** A cell's cost as the mode shows it. */
function cellCost(
  p: Prep,
  key: string,
  ids: ReadonlySet<string>,
): { usd: number | null; reason: string | null } {
  if (p.mode === 'none') return { usd: null, reason: NO_AMOUNTS_NOTE }
  if (p.fit) return { usd: null, reason: p.fit }
  if (p.mode === 'rounded') return { usd: null, reason: WHOLE_TEAMS_NOTE }
  if (p.mode === 'exact') {
    const verdict = p.orgCost.has(key) ? (p.orgCost.get(key) ?? null) : ORG_COST_NOTE
    if (verdict !== null) return { usd: null, reason: verdict }
  }
  const fig = guardModel({
    members: membersOf(p, ids),
    mode: p.mode,
    rules: p.rules,
    atoms: p.ctx.guard.atoms,
    folds: p.mode === 'exact' ? p.folds : null,
    fit: null,
    bandShown: p.bandShown,
  })
  return { usd: fig.total.totalUsd, reason: fig.total.totalUsd == null ? fig.reason : null }
}

/** The tree's cells and the cost per unit × cost center. */
export function treeFacts(p: Prep): TreeFacts {
  const seats = approvedSeats(p)
  const managerOf = managerOfLatest(p.ctx.all.positions)
  const cells = treeCellsOf(p.ctx)
  const byCell = new Map<string, Position[]>()
  for (const [id, pos] of seats) {
    const atomId = atomOf(id, p.ctx.guard.atoms, managerOf)
    const cc = p.latest.get(id)?.costCenter ?? pos.costCenter
    if (!atomId) continue
    const key = `cell:${atomId}|${cc}`
    const list = byCell.get(key)
    if (list) list.push(pos)
    else byCell.set(key, [pos])
  }
  const rows: TreeCellRow[] = []
  const heads = new Map<TreeCellRow, Position[]>()
  for (const [key, list] of [...byCell].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const cell = cells.get(key)
    if (!cell) continue
    const cost = cellCost(p, key, cell.positionIds)
    const row: TreeCellRow = {
      nodePositionId: cell.atomId,
      node: nodeLabel(p, cell.atomId),
      costCenter: cell.costCenter,
      unit: cell.unit,
      heads: list.length,
      costUsd: cost.usd,
      reason: cost.reason,
    }
    rows.push(row)
    heads.set(row, list)
  }
  rows.sort(
    (a, b) =>
      a.unit.localeCompare(b.unit) ||
      a.node.localeCompare(b.node) ||
      a.costCenter.localeCompare(b.costCenter),
  )
  return { rows, heads, all: [...seats.values()], costCenters: costCenterRows(p, seats) }
}

/** Cost per unit × cost center: each unit's guarded breakdown by cost center (exact modes), heads only otherwise. */
function costCenterRows(p: Prep, seats: ReadonlyMap<string, Position>): CostCenterRow[] {
  const headsOf = new Map<string, number>()
  const units = new Set<string>()
  for (const id of seats.keys()) {
    const r = p.latest.get(id)
    if (!r) continue
    units.add(r.businessUnit)
    const k = `${r.businessUnit}|${r.costCenter}`
    headsOf.set(k, (headsOf.get(k) ?? 0) + 1)
  }
  const out: CostCenterRow[] = []
  for (const unit of [...units].sort()) {
    const unitHeads = [...headsOf].filter(([k]) => k.startsWith(`${unit}|`))
    const total = unitHeads.reduce((n, [, h]) => n + h, 0)
    if (p.mode === 'none' || p.mode === 'rounded' || p.fit) {
      const reason = p.mode === 'none' ? NO_AMOUNTS_NOTE : p.mode === 'rounded' ? WHOLE_TEAMS_NOTE : p.fit
      for (const [k, h] of unitHeads.sort(([a], [b]) => (a < b ? -1 : 1)))
        out.push({
          unit,
          costCenter: k.slice(unit.length + 1),
          isOther: false,
          heads: h,
          costed: null,
          costUsd: null,
          bandUsd: null,
          reason,
        })
      continue
    }
    const ids = new Set<string>()
    for (const [id, r] of p.latest) if (r.businessUnit === unit) ids.add(id)
    const fig = guardModel({
      members: membersOf(p, ids),
      mode: p.mode,
      rules: p.rules,
      atoms: p.ctx.guard.atoms,
      folds: p.mode === 'exact' ? p.folds : null,
      fit: null,
      bandShown: p.bandShown,
      by: { key: (m) => m.seat.costCenter, noneLabel: 'No cost center', totalShown: true },
    })
    let shownHeads = 0
    for (const r of fig.rows) {
      if (r.key === OTHER) continue
      const h = headsOf.get(`${unit}|${r.key}`) ?? 0
      shownHeads += h
      out.push({
        unit,
        costCenter: r.label,
        isOther: false,
        heads: h,
        costed: r.costed,
        costUsd: r.totalUsd,
        bandUsd: r.bandUsd,
        reason: r.reason,
      })
    }
    const other = fig.rows.find((r) => r.key === OTHER)
    if (other)
      out.push({
        unit,
        costCenter: other.label,
        isOther: true,
        heads: total - shownHeads,
        costed: other.costed,
        costUsd: other.totalUsd,
        bandUsd: other.bandUsd,
        reason: other.reason,
      })
  }
  return out
}

/** The cells table. */
export function treeFigure(p: Prep, facts: TreeFacts): FigureData<TreeCellRow> {
  const columns: Column<TreeCellRow>[] = [
    { key: 'unit', label: 'Business unit' },
    { key: 'node', label: 'Node' },
    { key: 'costCenter', label: 'Cost center' },
    {
      key: 'heads',
      label: 'Approved heads',
      format: 'int',
      drill: (r) => () =>
        drillSpec({
          kind: 'positions',
          title: `Approved heads, ${r.node} in ${r.costCenter}`,
          subtitle: `As of ${fmt(p.ctx.asOf, 'date')}`,
          rows: facts.heads.get(r) ?? [],
          uses: p.uses(ID.treeCostCenter),
        }),
    },
    { key: 'costUsd', label: `Loaded cost ${p.fiscalYear} (USD)`, format: p.money, cost: true },
    { key: 'reason', label: 'Note' },
  ]
  return {
    id: TARGETS_FIGURES.tree,
    metric: ID.treeCostCenter,
    title: 'Tree nodes by cost center',
    subtitle: `Approved heads at ${fmt(p.ctx.asOf, 'date')}; cost for ${p.fiscalYear} Working`,
    rows: facts.rows,
    columns,
    note: 'Each node is a cost team: a director’s org, or a vice president’s own direct staff.',
    empty: facts.rows.length ? null : 'No positions in this scope.',
    uses: p.uses(ID.treeCostCenter),
  }
}

/**
 * The figure's subtitle: the fold clause only where cost centers fold (every mode but HR admin with
 * Show pay amounts on, which folds nothing: 7.5, review SA-12), with the minimum in force.
 */
export function costCenterSubtitle(p: Pick<Prep, 'fiscalYear' | 'mode' | 'rules'>): string {
  const head = `${p.fiscalYear} Working loaded cost`
  return p.mode === 'open'
    ? `${head}; with pay amounts shown, every cost center shows on its own`
    : `${head}; cost centers under ${fmt(p.rules.minCosted, 'int')} fold into their unit's Other`
}

/** Cost per unit × cost center. */
export function costCenterFigure(p: Prep, facts: TreeFacts): FigureData<CostCenterRow> {
  // "Costed people" shows only where some row has a count (exact modes): never a column of blanks.
  const counted = facts.costCenters.some((r) => r.costed != null)
  return {
    id: TARGETS_FIGURES.costCenters,
    metric: ID.treeCostCenter,
    title: 'Cost by unit and cost center',
    subtitle: costCenterSubtitle(p),
    rows: facts.costCenters,
    columns: [
      { key: 'unit', label: 'Business unit' },
      { key: 'costCenter', label: 'Cost center' },
      { key: 'heads', label: 'Approved heads', format: 'int' },
      ...(counted ? [{ key: 'costed' as const, label: 'Costed people', format: 'int' as const }] : []),
      { key: 'costUsd', label: `Loaded cost ${p.fiscalYear} (USD)`, format: p.money, cost: true },
      { key: 'bandUsd', label: 'Open and Planned at band estimate (USD)', format: p.money, band: true },
      { key: 'reason', label: 'Note' },
    ],
    note: null,
    empty: facts.costCenters.length ? null : 'No positions in this scope.',
    uses: p.uses(ID.treeCostCenter),
  }
}

/** The Tree × cost center tab's KPI: approved heads over the cells. */
export function treeKpis(p: Prep, facts: TreeFacts): Kpi[] {
  const nodes = new Set(facts.rows.map((r) => r.nodePositionId)).size
  const centers = new Set(facts.rows.map((r) => r.costCenter)).size
  return [
    {
      id: 'targets-tree-heads',
      metricId: ID.treeCostCenter,
      label: 'Approved heads in the tree',
      value: facts.all.length,
      format: 'int',
      note: `${plural(nodes, 'node')} across ${plural(centers, 'cost center')}`,
      definition: p.definition(ID.treeCostCenter),
      formula: `Σ approved heads over ${plural(facts.rows.length, 'cell')}.`,
      drill: () =>
        drillSpec({
          kind: 'positions',
          title: `Approved heads, ${p.ctx.scopeLabel}`,
          subtitle: `As of ${fmt(p.ctx.asOf, 'date')}`,
          rows: facts.all,
          uses: p.uses(ID.treeCostCenter),
        }),
      uses: p.uses(ID.treeCostCenter),
    },
  ]
}
