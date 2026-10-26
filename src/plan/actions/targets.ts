/**
 * Targets (docs/PLAN.md 6.9, 8.3 `target.set`, `target.exception`, `target.split`, `target.move`,
 * 9.4 Targets > Gap and Sub-org targets): Finance sets heads and cost targets per org and fiscal
 * year; a leader splits its org's target into sub-org targets and moves target between them, inside
 * its envelope (the parent's target: Σ sub-org targets never above it, so Unallocated stays 0 or
 * more); a split or move past the envelope needs Finance (`target.exception`, PAST_ENVELOPE_TEXT for
 * a leader). Targets are inputs, not pay: nothing here reads a person's cost. Pure.
 *
 * Rows go to `state.overlay.targets` (each replaces the imported row with the same key, transfer.ts
 * `targetKey`); one audit entry per changed field (object 'target', `id` the key, fields
 * 'targetHeads', 'targetCost', 'targetDate'; `targetCost` reads "changed" outside HR admin wherever
 * auditView treats it as a cost field). TARGET_RANGE_TEXT for heads or cost below 0. The sub-orgs of
 * a leader seat are `env.subOrgsOf`.
 *
 * Readings taken here (core, M3):
 *  - A parent's envelope is its own leader-keyed target row; for a leader seat at the top of its unit
 *    (its manager sits in another unit, or none), the unit's target row.
 *  - "Past the envelope" for a split: the sub-orgs' heads (or cost, where both have one) add up to
 *    more than the parent's. For a move: the two orgs are not sub-orgs of one parent (a move between
 *    sub-orgs keeps the parent's total). Finance and HR admin (`target.exception` shown) may go past.
 *  - A Leader splits or moves only inside its org (a parent at or below a leader seat it holds).
 *  - A sub-org left out of a split loses a target the overlay gave it; an imported row stays.
 *
 * M3 review fixes (core-platform):
 *  - UI-2: a split child's `targetCost` left out keeps the sub-org's stored cost target; only an
 *    explicit null (an edited, emptied box) removes it. A heads-only edit never moves cost targets.
 *  - UI-8: the envelope and the children cover the same org. A unit's head seat (its manager sits in
 *    another unit, or none) takes its unit's target, so a split or move never writes a leader-keyed
 *    row for it (UNIT_HEAD_TARGET_TEXT): that row would replace the unit's target as its envelope.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the bodies.
 */
import type { FiscalYear, TargetRow } from '@/data/schema'
import { targetKey } from '../engine/transfer'
import type { AuditDraft, PlanState } from '../types'
import {
  MOVE_HEADS_TEXT,
  NO_PARENT_TARGET_TEXT,
  NO_SEAT_CHANGE_TEXT,
  NOT_A_SUB_ORG_TEXT,
  OUTSIDE_SCOPE_TEXT,
  PAST_ENVELOPE_TEXT,
  SPLIT_SAVED_NOTICE,
  TARGET_MOVED_NOTICE,
  TARGET_RANGE_TEXT,
  TARGET_SAVED_NOTICE,
  UNIT_HEAD_TARGET_TEXT,
} from './copy'
import { decisionOf, gate, isLimited } from './gate'
import { ancestorsOf, auditOf, latestRows, no, ok, putTargets } from './shared'
import type { ActionContext, ActionResult } from './types'

/** Which org a target row is for (transfer.ts `targetKey` reads these fields). */
export type TargetKey = Pick<
  TargetRow,
  'fiscalYear' | 'businessUnit' | 'department' | 'costCenter' | 'leaderPositionId'
>

export interface SetTargetInput {
  /** The whole row: a new org's target, or an existing one's new values. */
  row: TargetRow
}

/** One sub-org's share of a split. */
export interface SubOrgTarget {
  /** The sub-org's leader seat (a direct sub-org of the parent, `env.subOrgsOf`). */
  leaderPositionId: string
  targetHeads: number
  /**
   * The cost target, USD. Left out: the sub-org's stored cost target stays (UI-2: a heads-only edit
   * never moves it). Null: the cost target is removed (an edited, emptied box).
   */
  targetCost?: number | null
}

export interface SplitTargetInput {
  fiscalYear: FiscalYear
  /** The parent org's leader seat; its target row is the envelope. */
  parentLeaderPositionId: string
  /** Every sub-org's target after the split (a sub-org left out keeps none). */
  children: readonly SubOrgTarget[]
}

export interface MoveTargetInput {
  fiscalYear: FiscalYear
  /** Two sub-orgs of one parent (leader seats). */
  fromLeaderPositionId: string
  toLeaderPositionId: string
  /** Heads moved, a whole number above 0. */
  heads: number
  /** Cost moved with them, USD; null moves heads only. */
  cost: number | null
}

/** A target row with known keys only (never a spread of an input). */
const targetCopy = (t: TargetRow): TargetRow => ({
  fiscalYear: t.fiscalYear,
  targetDate: t.targetDate ?? null,
  businessUnit: t.businessUnit,
  department: t.department ?? null,
  costCenter: t.costCenter ?? null,
  leaderPositionId: t.leaderPositionId ?? null,
  targetHeads: t.targetHeads,
  targetCost: t.targetCost ?? null,
})

const inRange = (t: Pick<TargetRow, 'targetHeads' | 'targetCost'>): boolean =>
  Number.isFinite(t.targetHeads) && t.targetHeads >= 0 && (t.targetCost == null || t.targetCost >= 0)

const FIELDS = ['targetHeads', 'targetCost', 'targetDate'] as const

/** One audit entry per field that differs (a new row: every field it sets). */
function targetAudit(ctx: ActionContext, prev: TargetRow | null, next: TargetRow): AuditDraft[] {
  const out: AuditDraft[] = []
  for (const f of FIELDS) {
    const old = prev ? (prev[f] ?? null) : null
    const value = next[f] ?? null
    if (old === value || (prev == null && value == null)) continue
    out.push(
      auditOf(ctx, 'target', targetKey(next), f, old, value, { effectiveDate: next.targetDate ?? null }),
    )
  }
  return out
}

const rowOf = (ctx: ActionContext, fy: FiscalYear, key: string): TargetRow | null =>
  ctx.env.targets(fy).find((t) => targetKey(targetCopy(t)) === key) ?? null

/** The envelope of a parent leader seat (see the module comment), or null. */
function envelopeOf(ctx: ActionContext, fy: FiscalYear, parent: string): TargetRow | null {
  const rows = ctx.env.targets(fy)
  const own = rows.find((t) => t.leaderPositionId === parent)
  if (own) return targetCopy(own)
  const latest = latestRows(ctx.datasets.positions)
  const seat = latest.get(parent)
  if (!seat) return null
  const manager = seat.managerPositionId ? latest.get(seat.managerPositionId) : null
  if (manager && manager.businessUnit === seat.businessUnit) return null
  const unit = rows.find(
    (t) => t.businessUnit === seat.businessUnit && !t.department && !t.costCenter && !t.leaderPositionId,
  )
  return unit ? targetCopy(unit) : null
}

/** A unit's head seat: its manager sits in another unit, or it has none (its target is the unit's). */
function isUnitHead(ctx: ActionContext, seat: string): boolean {
  const latest = latestRows(ctx.datasets.positions)
  const row = latest.get(seat)
  if (!row) return false
  const manager = row.managerPositionId ? latest.get(row.managerPositionId) : null
  return !manager || manager.positionId === seat || manager.businessUnit !== row.businessUnit
}

/** A Leader acts inside its org: the parent is a leader seat it holds, or below one. */
function inLeaderOrg(ctx: ActionContext, seat: string): boolean {
  const own = ctx.rules.leaderSeats
  if (own.has(seat) || ctx.rules.ownSeats.has(seat)) return true
  const up = ancestorsOf(ctx.datasets.positions)(seat)
  return up.some((id) => own.has(id) || ctx.rules.ownSeats.has(id)) || ctx.rules.seatInScope(seat)
}

/** A sub-org's own target row (leader-keyed), new or in force. */
function subOrgRow(ctx: ActionContext, fy: FiscalYear, parent: TargetRow, leader: string): TargetRow {
  const unit = latestRows(ctx.datasets.positions).get(leader)?.businessUnit ?? parent.businessUnit
  const key: TargetRow = {
    fiscalYear: fy,
    targetDate: parent.targetDate ?? null,
    businessUnit: unit,
    department: null,
    costCenter: null,
    leaderPositionId: leader,
    targetHeads: 0,
    targetCost: null,
  }
  const current = rowOf(ctx, fy, targetKey(key))
  return current ? targetCopy(current) : key
}

/** `target.set`: Finance sets an org's heads and cost target for a fiscal year. */
export function setTarget(state: PlanState, ctx: ActionContext, input: SetTargetInput): ActionResult {
  const g = gate(ctx, 'target.set')
  if (g) return no(g)
  const row = targetCopy(input.row)
  if (!inRange(row)) return no(TARGET_RANGE_TEXT)
  const prev = rowOf(ctx, row.fiscalYear, targetKey(row))
  const audit = targetAudit(ctx, prev ? targetCopy(prev) : null, row)
  if (!audit.length) return no(NO_SEAT_CHANGE_TEXT)
  return ok(putTargets(state, [row]), audit, TARGET_SAVED_NOTICE)
}

/** `target.split` (+ `target.exception` past the envelope): a parent's target into sub-org targets. */
export function splitTarget(state: PlanState, ctx: ActionContext, input: SplitTargetInput): ActionResult {
  const g = gate(ctx, 'target.split')
  if (g) return no(g)
  const fy = input.fiscalYear
  const parent = input.parentLeaderPositionId
  if (isLimited(ctx, 'target.split') && !inLeaderOrg(ctx, parent)) return no(OUTSIDE_SCOPE_TEXT)
  const envelope = envelopeOf(ctx, fy, parent)
  if (!envelope) return no(NO_PARENT_TARGET_TEXT)
  const subs = new Set(ctx.env.subOrgsOf(parent))
  if (input.children.some((c) => !subs.has(c.leaderPositionId))) return no(NOT_A_SUB_ORG_TEXT)
  // UI-8: a unit's head takes its unit's target; a leader-keyed row would replace it.
  if (input.children.some((c) => isUnitHead(ctx, c.leaderPositionId))) return no(UNIT_HEAD_TARGET_TEXT)
  if (input.children.some((c) => !inRange({ targetHeads: c.targetHeads, targetCost: c.targetCost ?? null })))
    return no(TARGET_RANGE_TEXT)
  // Each child's cost as the split leaves it: its own when given (null removes it), else the stored one.
  const prevOf = new Map(
    input.children.map((c) => [c.leaderPositionId, subOrgRow(ctx, fy, envelope, c.leaderPositionId)]),
  )
  const costOf = (c: SubOrgTarget): number | null =>
    c.targetCost === undefined ? (prevOf.get(c.leaderPositionId)?.targetCost ?? null) : c.targetCost
  const heads = input.children.reduce((n, c) => n + c.targetHeads, 0)
  const costs = input.children.map(costOf).filter((c): c is number => c != null)
  const cost = costs.reduce((n, c) => n + c, 0)
  const past =
    heads > envelope.targetHeads ||
    (envelope.targetCost != null && costs.length > 0 && cost > envelope.targetCost)
  if (past && decisionOf(ctx, 'target.exception').access === 'hidden') return no(PAST_ENVELOPE_TEXT)
  const rows: TargetRow[] = []
  const audit: AuditDraft[] = []
  for (const c of input.children) {
    const prev = prevOf.get(c.leaderPositionId) as TargetRow
    const exists = !!rowOf(ctx, fy, targetKey(prev))
    const next: TargetRow = { ...prev, targetHeads: c.targetHeads, targetCost: costOf(c) }
    rows.push(next)
    audit.push(...targetAudit(ctx, exists ? prev : null, next))
  }
  // A sub-org left out of the split keeps no target the overlay gave it.
  const listed = new Set(input.children.map((c) => c.leaderPositionId))
  const dropped = state.overlay.targets.filter(
    (t) =>
      t.fiscalYear === fy &&
      t.leaderPositionId &&
      subs.has(t.leaderPositionId) &&
      !listed.has(t.leaderPositionId),
  )
  for (const t of dropped)
    audit.push(auditOf(ctx, 'target', targetKey(t), 'targetHeads', t.targetHeads, null))
  const kept = state.overlay.targets.filter((t) => !dropped.includes(t))
  const next = putTargets({ ...state, overlay: { ...state.overlay, targets: kept } }, rows)
  if (!audit.length) return no(NO_SEAT_CHANGE_TEXT)
  return ok(next, audit, SPLIT_SAVED_NOTICE)
}

/** `target.move` (+ `target.exception` past the envelope): heads and cost between two sub-orgs. */
export function moveTarget(state: PlanState, ctx: ActionContext, input: MoveTargetInput): ActionResult {
  const g = gate(ctx, 'target.move')
  if (g) return no(g)
  const fy = input.fiscalYear
  if (!Number.isInteger(input.heads) || input.heads < 1) return no(MOVE_HEADS_TEXT)
  if (input.cost != null && !(input.cost >= 0)) return no(TARGET_RANGE_TEXT)
  const { fromLeaderPositionId: a, toLeaderPositionId: b } = input
  if (isLimited(ctx, 'target.move') && !(inLeaderOrg(ctx, a) && inLeaderOrg(ctx, b)))
    return no(OUTSIDE_SCOPE_TEXT)
  // UI-8: a unit's head takes its unit's target; moving between units is a target set, not a move.
  if (isUnitHead(ctx, a) || isUnitHead(ctx, b)) return no(UNIT_HEAD_TARGET_TEXT)
  const up = ancestorsOf(ctx.datasets.positions)
  const sharedParent = up(a).find((p) => {
    const subs = ctx.env.subOrgsOf(p)
    return subs.includes(a) && subs.includes(b)
  })
  if (!sharedParent && decisionOf(ctx, 'target.exception').access === 'hidden') return no(PAST_ENVELOPE_TEXT)
  const fromRow = rowOf(
    ctx,
    fy,
    targetKey({
      fiscalYear: fy,
      businessUnit: latestRows(ctx.datasets.positions).get(a)?.businessUnit ?? '',
      department: null,
      costCenter: null,
      leaderPositionId: a,
      targetHeads: 0,
    }),
  )
  if (!fromRow) return no(NO_PARENT_TARGET_TEXT)
  const from = targetCopy(fromRow)
  const toPrev = subOrgRow(ctx, fy, from, b)
  const toExists = !!rowOf(ctx, fy, targetKey(toPrev))
  const fromNext: TargetRow = {
    ...from,
    targetHeads: from.targetHeads - input.heads,
    targetCost:
      from.targetCost == null || input.cost == null ? from.targetCost : from.targetCost - input.cost,
  }
  const toNext: TargetRow = {
    ...toPrev,
    targetHeads: toPrev.targetHeads + input.heads,
    targetCost: input.cost == null ? toPrev.targetCost : (toPrev.targetCost ?? 0) + input.cost,
  }
  if (!inRange(fromNext) || !inRange(toNext)) return no(TARGET_RANGE_TEXT)
  const audit = [...targetAudit(ctx, from, fromNext), ...targetAudit(ctx, toExists ? toPrev : null, toNext)]
  return ok(putTargets(state, [fromNext, toNext]), audit, TARGET_MOVED_NOTICE)
}
