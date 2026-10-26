/**
 * The Targets view's model (docs/PLAN.md 6.9 and 9.4): each org's target against its asks, the gap in
 * heads and cost, sub-org targets with what is unallocated, and the leader tree by cost center.
 * Pending requests count by their head effect and in-year band estimate (C2, C18); pending trades
 * count net. Cost on org rows below the unit shows only under 7.4's org-row rule (Finance, HR admin
 * with the switch off) or for whole unions of atoms (HRBP, Leader: guarded asks cost, 7.2 rule 8);
 * otherwise a row shows heads, its target cost and the reason. One model per analytics context
 * (`targetsModel`, cached in a WeakMap).
 *
 * Other views read it: the Leader home re-links Gap's year-end gap and Unallocated tiles, and draws
 * `suborgs.rows` as its bullet per sub-org (`home-rollup-suborgs`) and its My list (sub-orgs with
 * heads, asks, gap). The `targets:suborg-over` item reads the same rows (./actions.ts).
 *
 * Frozen in the M2 freeze (docs/CONTRACTS-M2.md). The interfaces list what other builders read; the
 * views-2 builder may add fields, never rename or retype these. Built by the views-2 builder: the
 * pieces live in ./base.ts (what every tab reads), ./cost.ts (asks cost under the guard), ./gap.ts,
 * ./suborgs.ts and ./tree.ts; ./working.ts is the Working plan the Finance view shares.
 */
import type { AnalyticsContext } from '@/data/context'
import type { ISODate } from '@/data/schema'
import type { RequestRecord } from '@/drill/types'
import { fmt } from '@/lib/format'
import type { FigureData, Headline, TabModel } from '../../types'
import { ID } from '../metrics'
import { prepare } from './base'
import { gapFigure, gapKpis, gapRows, topRows } from './gap'
import {
  envelopeExceptions,
  exceptionsFigure,
  parentsOf,
  subOrgFigure,
  subOrgKpis,
  subOrgRows,
  type UnallocatedRow,
  unallocatedFigure,
  unallocatedKpi,
  unallocatedRows,
} from './suborgs'
import { type CostCenterRow, costCenterFigure, treeFacts, treeFigure, treeKpis } from './tree'
import {
  type SubOrgWrites,
  subOrgWrites,
  type TargetChangeRow,
  type TargetSetWrites,
  targetChanges,
  targetChangesFigure,
  targetSetWrites,
} from './writes'

export type { UnallocatedRow } from './suborgs'
export type { CostCenterRow } from './tree'
export type {
  SplitChild,
  SplitChoice,
  SubOrgChoice,
  SubOrgWrites,
  TargetChangeRow,
  TargetEditRow,
  TargetSetWrites,
} from './writes'
export { splitChildrenOf } from './writes'

/* ───────────── rows ───────────── */

/** What a target row is keyed by (targets rows: unit, department, cost center or leader position). */
export type TargetOrgLevel = 'unit' | 'department' | 'costCenter' | 'leader'

/** One org of Targets > Gap: target, asks and gap in heads and cost, and the heads trades moved. */
export interface TargetGapRow {
  orgKey: string
  org: string
  level: TargetOrgLevel
  /** The target date (blank in the data: the fiscal year's last day). */
  targetDate: ISODate
  targetHeads: number
  asksHeads: number
  /** Target − asks; negative means asks exceed the target. */
  gapHeads: number
  /** Heads from trades (`targets.trades.heads`): pending trades net, seats received − Open or Planned seats given. */
  tradesHeads: number
  /** The target's cost (an input); floored to $0.1M in rounded modes. */
  targetCostUsd: number | null
  /** Guarded asks cost; null where the row cannot show cost. */
  asksCostUsd: number | null
  gapCostUsd: number | null
  /** Why the cost cells read "—" (the org-row rule, not a union of atoms, the minimum), else null. */
  reason: string | null
  /** Added by the builder: the Working seats counted in the asks, and the pending requests' head effect. */
  workingHeads: number
  pendingHeads: number
  /** "18 over", "3 under" or "On target": the gap in words, for the bullet's status. */
  gapText: string
}

/**
 * One sub-org under a leader's org (Targets > Sub-org targets): its heads, asks and target, and
 * whether it is over. `over` is the same value the `targets:suborg-over` item and the Leader home
 * use: heads, and cost where the sub-org is a whole union of atoms (7.2 rule 8).
 */
export interface SubOrgRow {
  /** The sub-org's head seat. */
  positionId: string
  label: string
  /** Working approved heads at the target date. */
  heads: number
  asksHeads: number
  targetHeads: number | null
  gapHeads: number | null
  targetCostUsd: number | null
  asksCostUsd: number | null
  gapCostUsd: number | null
  over: boolean
  reason: string | null
  /** Added by the builder: the parent org (its key and label), the target date, the pending part, and the cost leg of `over`. */
  parentKey: string
  parent: string
  targetDate: ISODate
  pendingHeads: number
  /** Over its cost target (the rounded asks cost above it); false where only heads compare. */
  overCost: boolean
  /** "Yes" or "No", for the table and exports. */
  overText: string
}

/** One cell of Targets > Tree × cost center: a leader tree node by cost center, in heads (cost under 7.4 only). */
export interface TreeCellRow {
  nodePositionId: string
  node: string
  costCenter: string
  heads: number
  costUsd: number | null
  reason: string | null
  /** Added by the builder: the cost center's business unit. */
  unit: string
}

/* ───────────── tabs ───────────── */

export interface TargetsGap extends TabModel {
  rows: FigureData<TargetGapRow>
  /** Added in M3: set a target (Finance, HR admin). */
  writes: TargetSetWrites
  /** Added in M3: the target changes the audit log holds, as the mode may read them (10.5). */
  changes: FigureData<TargetChangeRow>
}

export interface TargetsSubOrgs extends TabModel {
  rows: FigureData<SubOrgRow>
  /** Added by the builder: each parent's unallocated target, and the envelope exceptions waiting on Finance. */
  unallocated: FigureData<UnallocatedRow>
  exceptions: FigureData<RequestRecord>
  /** Added in M3: split a parent's target, and move target between two sub-orgs. */
  writes: SubOrgWrites
}

export interface TargetsTree extends TabModel {
  cells: FigureData<TreeCellRow>
  /** Added by the builder: cost per unit × cost center (the unit's one fold). */
  costCenters: FigureData<CostCenterRow>
}

export interface TargetsModel {
  gap: TargetsGap
  suborgs: TargetsSubOrgs
  tree: TargetsTree
}

const cache = new WeakMap<AnalyticsContext, TargetsModel>()

/** The Targets view's model for a context (cached per context). Each tab is built when first read. */
export function targetsModel(ctx: AnalyticsContext): TargetsModel {
  const hit = cache.get(ctx)
  if (hit) return hit
  const p = prepare(ctx)
  let sub: { suborgs: TargetsSubOrgs; unallocated: UnallocatedRow[] } | null = null
  const subs = () => {
    if (!sub) {
      const parents = parentsOf(p)
      const rows = subOrgRows(p, parents)
      const unallocated = unallocatedRows(p, parents, rows)
      sub = {
        unallocated,
        suborgs: {
          kpis: subOrgKpis(p, parents, rows, unallocatedKpi(p, 'targets-suborgs-unallocated', unallocated)),
          rows: subOrgFigure(p, rows),
          unallocated: unallocatedFigure(p, unallocated),
          exceptions: exceptionsFigure(p, envelopeExceptions(p)),
          writes: subOrgWrites(p, parents),
        },
      }
    }
    return sub
  }
  let gap: TargetsGap | null = null
  let tree: TargetsTree | null = null
  const model: TargetsModel = {
    get gap() {
      if (!gap) {
        const facts = gapRows(p)
        gap = {
          kpis: gapKpis(p, facts, unallocatedKpi(p, 'targets-unallocated', subs().unallocated)),
          rows: gapFigure(p, facts),
          writes: targetSetWrites(p),
          changes: targetChangesFigure(p, targetChanges(p)),
        }
      }
      return gap
    },
    get suborgs() {
      return subs().suborgs
    },
    get tree() {
      if (!tree) {
        const facts = treeFacts(p)
        tree = {
          kpis: treeKpis(p, facts),
          cells: treeFigure(p, facts),
          costCenters: costCenterFigure(p, facts),
        }
      }
      return tree
    },
  }
  cache.set(ctx, model)
  return model
}

/** The folder tab's number: the gap in heads (9.1). */
export function targetsHeadline(ctx: AnalyticsContext): Headline {
  const p = prepare(ctx)
  const top = topRows(gapRows(p))
  if (!top.length)
    return {
      value: '—',
      label: `${p.fiscalYear} gap in heads`,
      metricId: ID.gapHeads,
      uses: p.uses(ID.gapHeads),
    }
  const gapHeads = top.reduce((n, f) => n + f.row.gapHeads, 0)
  return {
    value: fmt(gapHeads, 'int'),
    label: `${p.fiscalYear} gap in heads`,
    metricId: ID.gapHeads,
    uses: p.uses(ID.gapHeads),
  }
}
