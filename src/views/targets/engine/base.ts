/**
 * What every Targets tab reads, prepared once per analytics context (`prepare`, cached in a
 * WeakMap): the fiscal year, its Working frame and asks context, the viewer (8.4) and the requests
 * the viewer may see (rule 6: every count on screen is over those), the target rows of the year, the
 * positions the scope and filters select, the guard's mode, rules and `costFit` reason, Finance's
 * folds and the org-row decisions (7.4), and the wording helpers.
 *
 * Readings taken here (views-2 builder, M2):
 *  - A target row is a whole org: its asks count every seat of its org and every pending request the
 *    viewer may see, whatever the location, level or cost-center filter. The scope and the filters
 *    decide which rows show (a row whose org holds a position they select), not what a row counts.
 *  - In a leader's tree scope a row shows only when its org lies inside the leader's org
 *    (`targetShows`): a director whose org has no target of its own sees no wider org's target as
 *    theirs, as the forecast's "vs target" reads it. A parent's target for its sub-orgs is likewise
 *    exactly its own org's (`ownTargetOf`).
 *  - Cost on a row still asks `costFit` with the filters in force, so a filter that keeps cost off in
 *    a mode keeps it off here too (heads and the target cost, an input, still show).
 *  - The target cost is an input: exact in Finance and HR admin, rounded down to the cost step in HRBP
 *    and Leader mode (`targets.target.cost`, section 12), never shown in Manager mode.
 *  - Overlay target rows of the plan state (Working edits, M3) replace imported rows with the same
 *    year and org; since M3 the context's `all` holds them, laid once in `buildContext`.
 */
import { holdingsOn } from '@/access/scopes/people'
import { requestView, type Viewer, viewerOf } from '@/access/visibility'
import { atomOf } from '@/cost/atoms'
import { type CostFitOptions, costFit } from '@/cost/fit'
import { type FinanceFold, financeOrgCost, type OrgCostRow } from '@/cost/fold'
import type { GuardMode } from '@/cost/guard'
import type { AnalyticsContext } from '@/data/context'
import type { FieldRef } from '@/data/quality/fieldRef'
import type { FiscalYear, PositionRow, TargetRow } from '@/data/schema'
import { effectiveRequestsOf, holderNamesOf, workerNames } from '@/drill/seats'
import { roundCostTo } from '@/lib/costRounding'
import type { Format } from '@/lib/format'
import type { CostGuardSettings } from '@/metrics/costGuard'
import { uses as usesOf } from '@/metrics/fields'
import type { AsksContext } from '@/plan/engine/targets'
import { targetKindOf } from '@/plan/engine/targets'
import type { HcRequest } from '@/plan/types'
import { scopeUses } from '@/views/plan/engine/lineage'
import {
  asksContextOf,
  fieldOrg,
  foldsOf,
  latestRows,
  leaderOrg,
  managerOfLatest,
  type OrgDef,
  orgOfTarget,
  pendingOf,
  presentUses,
  shownCostCenters,
  subtreeLatest,
  targetYearOf,
  type WorkingFrame,
  workingFrame,
  workingLines,
} from './working'

export interface Prep {
  ctx: AnalyticsContext
  fiscalYear: FiscalYear
  frame: WorkingFrame
  actx: AsksContext
  viewer: Viewer
  /** Every request the viewer may see (8.4 rules 1 to 3), imported and in the plan state. */
  visible: readonly HcRequest[]
  /** The pending ones (Submitted, In review or Sent back). */
  pending: readonly HcRequest[]
  /** The year's target rows (overlay rows in place of imported ones). */
  targets: readonly TargetRow[]
  /** Positions the scope and filters select (ctx.data). */
  selected: ReadonlySet<string>
  mode: GuardMode
  rules: CostGuardSettings
  /** Band estimates show (`cost:band`; never in Manager mode). */
  bandShown: boolean
  /** `costFit`'s reason under the filters and period, or null. */
  fit: string | null
  /** Finance's folds (exact and open modes; empty otherwise). */
  folds: ReadonlyMap<string, FinanceFold>
  /** The org-row rule (7.4) by org key: null when cost shows; decided once per version and as-of date. */
  orgCost: ReadonlyMap<string, string | null>
  /** The format amounts show in: rounded modes in $0.1M steps. */
  money: Format
  /** A position's holder name on the as-of date, for sub-org labels. */
  holderOf: (positionId: string) => string | null
  /** A position's holder's employee ID on the as-of date (an item's owner). */
  holderIdOf: (positionId: string) => string | null
  /** An employee's name. */
  nameOf: (personId: string) => string | null
  /** The latest row of each position. */
  latest: ReadonlyMap<string, PositionRow>
  /** A metric's definition, and its lineage from the dictionary with the fields the active filters read. */
  definition: (metricId: string) => string | undefined
  uses: (metricId: string) => readonly FieldRef[]
}

const cache = new WeakMap<AnalyticsContext, Prep>()

/** The prepared inputs for a context (cached per context). */
export function prepare(ctx: AnalyticsContext): Prep {
  const hit = cache.get(ctx)
  if (hit) return hit
  const fiscalYear = targetYearOf(ctx)
  const frame = workingFrame(ctx, fiscalYear)
  const actx = asksContextOf(ctx, frame)
  const viewer = viewerOf(ctx)
  // Every request in its effective state (D-EXPIRY): an expired Draft or Sent back request is no ask.
  const visible = effectiveRequestsOf(ctx).filter((r) => requestView(r, viewer) !== 'none')
  const mode = ctx.guard.mode
  const latest = latestRows(ctx.all.positions)
  const folds = mode === 'exact' || mode === 'open' ? foldsOf(ctx, frame) : new Map<string, FinanceFold>()
  const fitOpts: CostFitOptions = {
    shownCostCenters: shownCostCenters(folds),
    atoms: ctx.guard.atoms,
    selected: new Set(ctx.data.positions.map((p) => p.positionId)),
    managerOf: managerOfLatest(ctx.all.positions),
  }
  const names = holderNamesOf(ctx)
  const held = holdingsOn(ctx.all.workers, ctx.asOf)
  const people = workerNames(ctx)
  const filterRefs = scopeUses(ctx.filters)
  const p: Prep = {
    ctx,
    fiscalYear,
    frame,
    actx,
    viewer,
    visible,
    pending: pendingOf(visible),
    targets: yearTargets(ctx, fiscalYear),
    selected: fitOpts.selected as ReadonlySet<string>,
    mode,
    rules: ctx.guard.rules,
    bandShown: mode !== 'none' && ctx.access.can('cost:band'),
    fit:
      mode === 'none' ? null : costFit(ctx.filters, ctx.access.scope, ctx.mode, ctx.access.switchOn, fitOpts),
    folds,
    orgCost: mode === 'exact' ? orgCostDecisions(ctx, frame, folds) : new Map(),
    money: mode === 'rounded' ? 'moneyM' : 'money',
    holderOf: (id) => names.get(id) ?? null,
    holderIdOf: (id) => held.holderOf.get(id) ?? null,
    nameOf: (id) => people.get(id) ?? null,
    latest,
    definition: (id) => ctx.metrics.def(id)?.definition,
    uses: (id) => usesOf(presentUses(ctx, id), filterRefs),
  }
  cache.set(ctx, p)
  return p
}

/**
 * The year's target rows: imported, with the plan state's overlay rows in place of the same org's.
 * Since M3 the context's `all` holds the overlay (`withOverlay` in `buildContext`), so nothing here
 * lays it again.
 */
function yearTargets(ctx: AnalyticsContext, fy: FiscalYear): TargetRow[] {
  return ctx.all.targets.filter((t) => t.fiscalYear === fy)
}

/* ───────────── cost on a row ───────────── */

/** A target cost as a mode shows it: exact (Finance, HR admin), rounded down (HRBP, Leader), none (Manager). */
export function shownTargetCost(p: Prep, usd: number | null | undefined): number | null {
  if (usd == null || p.mode === 'none') return null
  return p.mode === 'rounded' ? roundCostTo(usd, p.rules.floorUsd) : usd
}

/** A target row as the drill shows it: its cost as the mode shows it (floored, or none in Manager mode). */
export function shownTargetRow(p: Prep, t: TargetRow): TargetRow {
  const cost = shownTargetCost(p, t.targetCost)
  return cost === (t.targetCost ?? null) ? t : { ...t, targetCost: cost }
}

/* ───────────── orgs ───────────── */

/** The org a target row names. */
export const targetOrg = (p: Prep, t: TargetRow): OrgDef => orgOfTarget(p.ctx.all.positions, t)

/** The org holds a position the scope and filters select. */
export function orgInScope(p: Prep, org: OrgDef): boolean {
  for (const id of org.positionIds) if (p.selected.has(id)) return true
  return false
}

const headsMemo = new WeakMap<Prep, Map<string, readonly string[]>>()

/** A unit's top seats: its live seats whose manager sits outside the unit (or who have none). */
export function unitHeads(p: Prep, unit: string): readonly string[] {
  let byUnit = headsMemo.get(p)
  if (!byUnit) {
    byUnit = new Map()
    headsMemo.set(p, byUnit)
  }
  const hit = byUnit.get(unit)
  if (hit) return hit
  const out: string[] = []
  for (const [id, r] of p.latest) {
    if (r.businessUnit !== unit || r.status === 'Eliminated') continue
    const up = r.managerPositionId ? p.latest.get(r.managerPositionId) : undefined
    if (!up || up.businessUnit !== unit) out.push(id)
  }
  out.sort()
  byUnit.set(unit, out)
  return out
}

/** The seat is its unit's one top seat, so its org is the whole unit. */
export function headsItsUnit(p: Prep, seat: string): boolean {
  const r = p.latest.get(seat)
  if (!r) return false
  const heads = unitHeads(p, r.businessUnit)
  return heads.length === 1 && heads[0] === seat
}

/**
 * The target of exactly a seat's org, never a wider org's: the row keyed to the seat, else its
 * unit's row when the seat is the unit's one top seat (the forecast reads a leader's target the same
 * way). A director with no target of their own has none here; routing still checks their requests
 * against the nearest target above (10.2), which is not their org's.
 */
export function ownTargetOf(p: Prep, seat: string): TargetRow | null {
  const own = p.targets.find((t) => targetKindOf(t) === 'leader' && t.leaderPositionId === seat)
  if (own) return own
  if (!headsItsUnit(p, seat)) return null
  const unit = p.latest.get(seat)?.businessUnit
  return p.targets.find((t) => targetKindOf(t) === 'unit' && t.businessUnit === unit) ?? null
}

/**
 * A target row shows on Targets: its org holds a position the scope and filters select, and, in a
 * tree scope (a leader's org), the org lies inside the leader's org: a row keyed to a root seat or a
 * seat of the tree, the unit's row when a root seat is the unit's one top seat, or a department or
 * cost center whose live seats all sit in the tree. A wider org's target is not the leader's, and its
 * asks would count only the requests the leader may see (8.4 rule 6), so it never shows as theirs.
 */
export function targetShows(p: Prep, t: TargetRow, org: OrgDef): boolean {
  if (!orgInScope(p, org)) return false
  const scope = p.ctx.access.scope
  if (scope?.kind !== 'tree') return true
  const inside = (id: string) => scope.rootPositionIds.has(id) || scope.positionIds.has(id)
  switch (targetKindOf(t)) {
    case 'leader':
      return inside(t.leaderPositionId as string)
    case 'unit':
      return [...scope.rootPositionIds].some(
        (root) => p.latest.get(root)?.businessUnit === t.businessUnit && headsItsUnit(p, root),
      )
    default: {
      let live = 0
      for (const id of org.positionIds) {
        if (p.latest.get(id)?.status === 'Eliminated') continue
        if (!inside(id)) return false
        live++
      }
      return live > 0
    }
  }
}

/** "Design Verification (Dana Ito)": a sub-org or leader org by its head seat and who holds it. */
export function seatLabel(p: Prep, positionId: string): string {
  const r = p.latest.get(positionId)
  const base = r?.department || r?.title || positionId
  return `${base} (${p.holderOf(positionId) ?? 'vacant'})`
}

/** What a target row is called. */
export function targetLabel(p: Prep, t: TargetRow): string {
  switch (targetKindOf(t)) {
    case 'unit':
      return t.businessUnit
    case 'department':
      return `${t.department} (${t.businessUnit})`
    case 'cost-center':
      return `${t.costCenter} (${t.businessUnit})`
    case 'leader':
      return seatLabel(p, t.leaderPositionId as string)
  }
}

/* ───────────── the org-row rule (7.4), once per version and as-of date ───────────── */

const decisions = new WeakMap<
  object,
  WeakMap<ReadonlyMap<string, FinanceFold>, ReadonlyMap<string, string | null>>
>()

/**
 * Finance's org-row decisions for every org below the unit any Finance surface shows (7.4): the
 * year's target rows keyed below the unit, every manager seat's org (the leader tree's nodes and the
 * sub-orgs, each under its manager's), and every tree cell (a cost atom's part of a cost center).
 * Decided once per Working version, as-of date and fold, so a mode, scope or filter never changes a
 * row's decision; every surface reads the one result by org key.
 */
export function orgCostDecisions(
  ctx: AnalyticsContext,
  frame: WorkingFrame,
  folds: ReadonlyMap<string, FinanceFold>,
): ReadonlyMap<string, string | null> {
  const lines = workingLines(ctx, frame)
  let byFolds = decisions.get(lines)
  if (!byFolds) {
    byFolds = new WeakMap()
    decisions.set(lines, byFolds)
  }
  const hit = byFolds.get(folds)
  if (hit) return hit
  const positions = ctx.all.positions
  const latest = latestRows(positions)
  const rows = new Map<string, OrgCostRow>()
  const add = (r: OrgCostRow) => {
    const had = rows.get(r.key)
    if (!had || (had.parent == null && r.parent != null)) rows.set(r.key, r)
  }
  for (const t of yearTargets(ctx, frame.fiscalYear)) {
    const org = orgOfTarget(positions, t)
    if (org.kind !== 'unit')
      add({ key: org.key, parent: null, unit: org.businessUnit, positionIds: org.positionIds })
  }
  const managers = new Set<string>()
  for (const r of latest.values()) if (r.managerPositionId) managers.add(r.managerPositionId)
  for (const id of managers) {
    const head = latest.get(id)
    if (!head || head.status === 'Eliminated') continue
    const up = head.managerPositionId
    add({
      key: `tree:${id}`,
      parent: up && managers.has(up) ? `tree:${up}` : null,
      unit: head.businessUnit,
      positionIds: subtreeLatest(positions, id),
    })
  }
  for (const cell of treeCellsOf(ctx).values())
    add({ key: cell.key, parent: null, unit: cell.unit, positionIds: cell.positionIds })
  const out = financeOrgCost([...rows.values()], folds)
  byFolds.set(folds, out)
  return out
}

/** One tree cell: a cost atom's positions in one cost center (latest rows). */
export interface TreeCellDef {
  key: string
  atomId: string
  costCenter: string
  unit: string
  positionIds: ReadonlySet<string>
}

const cellMemo = new WeakMap<object, WeakMap<object, ReadonlyMap<string, TreeCellDef>>>()

/** Every (atom, cost center) cell over every position, by latest rows and the guard's atoms (memoized). */
export function treeCellsOf(ctx: AnalyticsContext): ReadonlyMap<string, TreeCellDef> {
  const positions = ctx.all.positions
  let byAtoms = cellMemo.get(positions)
  if (!byAtoms) {
    byAtoms = new WeakMap()
    cellMemo.set(positions, byAtoms)
  }
  const hit = byAtoms.get(ctx.guard.atoms)
  if (hit) return hit
  const managerOf = managerOfLatest(positions)
  const out = new Map<string, TreeCellDef & { positionIds: Set<string> }>()
  for (const [id, r] of latestRows(positions)) {
    const atomId = atomOfLatest(ctx, id, managerOf)
    if (!atomId) continue
    const key = `cell:${atomId}|${r.costCenter}`
    let c = out.get(key)
    if (!c) {
      c = { key, atomId, costCenter: r.costCenter, unit: r.businessUnit, positionIds: new Set() }
      out.set(key, c)
    }
    c.positionIds.add(id)
  }
  byAtoms.set(ctx.guard.atoms, out)
  return out
}

/** A position's cost atom under the guard's index (a position created since the close takes its manager's). */
export const atomOfLatest = (
  ctx: Pick<AnalyticsContext, 'guard'>,
  id: string,
  managerOf: (id: string) => string | null,
): string | null => atomOf(id, ctx.guard.atoms, managerOf)

export { fieldOrg, leaderOrg }
