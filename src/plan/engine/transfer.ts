/**
 * Transfers (docs/PLAN.md 10.5, 8.4 rule 2a). Built by engines C in M1. Pure.
 *
 * - Position move ('position'): the seat and its person move under a new manager position (and maybe
 *   a new org); plan lines follow the moved position.
 * - Internal move ('internal'): the person fills an Open receiving seat; the old seat is held (On hold)
 *   until it is backfilled or eliminated.
 * - Chain (chain.ts): the submitter's manager, the HRBP of the from-unit and of the to-unit (one step
 *   when they are the same person), and when units differ the leader of each unit. No band-estimate
 *   leader threshold. A move past a sub-org's cost envelope adds Finance.
 * - "Move budget too?" shifts both orgs' targets by one head and the seat's in-year band estimate for
 *   the months that move: the whole fiscal year for a position move, from the effective date to FY end
 *   for an internal move. It never uses the seat's HRIS cost. The target changes are audited.
 *
 * Readings taken here (engines C, M1):
 *  - A transfer takes effect on its `effectiveDate` (the person's first day in the new place); with
 *    none it takes effect on the approval date.
 *  - A position move writes the moved seat's row dated the effective date with the new manager and the
 *    org fields `plan.placeOf` gives for the new manager and the seat's location, and rewrites the
 *    seat's later dated rows (a planned level change, say) with the same org, so the seat never jumps
 *    back. Level, location, FTE and status are kept.
 *  - An internal move writes the from seat On hold from the effective date (and its later Filled, Open
 *    or Planned rows too; a later Eliminated row stays), and a row for the receiving seat dated the
 *    effective date that says Filled, with `sourceRequestId`. The person's assignments are HRIS data:
 *    until an import ends the assignment on the from seat and starts one on the receiving seat, the
 *    from seat stays Filled by its assignment (6.5) and the receiving seat reads Open with no planned
 *    start (a Filled row with nobody in it, 6.5), so it is an approved head with no cost and the
 *    person is costed once; reconcile.ts shows the receiving seat as `filled-no-assignment` until then.
 *  - "Move budget too?" moves nothing when the request did not ask for it (`moveBudget` false) or when
 *    both sides are one target row.
 */
import { monthsOf } from '@/data/fiscal'
import type { FiscalYear, ISODate, ISODateTime, PositionRow, Proration, TargetRow } from '@/data/schema'
import { addDays } from '@/lib/dates'
import type { Actor, AuditDraft, HcRequest, PlanEffect, PositionChange, WorkingPlan } from '../types'
import { inYearFraction } from './proration'
import { rowAudit } from './requests'
import { rowInEffect } from './trade'

/** The seats a transfer moves between, on its effective date. */
export interface TransferSides {
  fromPositionId: string
  /** The from seat's manager position before the move. */
  fromManagerPositionId: string | null
  /** The receiving manager position: toManagerPositionId (position move) or the manager of toPositionId (internal move). */
  toManagerPositionId: string | null
  fromUnit: string
  toUnit: string
  crossUnit: boolean
}

/** A seat's rows, oldest first. */
const rowsOf = (positions: readonly PositionRow[], positionId: string): PositionRow[] =>
  positions
    .filter((r) => r.positionId === positionId)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0))

/** The row in effect on `d`, else the seat's first row (a seat that starts later); null for an unknown seat. */
const rowFor = (rows: readonly PositionRow[], d: ISODate): PositionRow | null =>
  rowInEffect(rows, d) ?? rows[0] ?? null

/** The day a transfer takes effect: its effectiveDate, else `fallback`. */
const effectiveOf = (req: HcRequest, fallback: ISODate): ISODate => req.transfer?.effectiveDate || fallback

/** Far enough ahead that every dated row is in effect (a transfer with no effective date yet). */
const LATEST: ISODate = '9999-12-31'

/**
 * Where a transfer moves from and to. Null when the seats are unknown: no transfer fields, an unknown
 * from seat, or a receiving manager position (position move) or seat (internal move) the plan does
 * not hold.
 *
 * The from side is read the day before the effective date, so the answer is the same before and after
 * `applyTransfer` adds the moved row. A position move's to-unit is the one `plan.placeOf` gives for
 * the new manager and the seat's location, else the new manager seat's own unit.
 *
 * Fixtures (transfer.test.ts): CH3's same-unit position move, CH4's cross-unit internal move.
 */
export function transferSides(req: HcRequest, plan: WorkingPlan): TransferSides | null {
  const t = req.transfer
  if (req.type !== 'Transfer' || !t || !t.fromPositionId) return null
  const effective = t.effectiveDate || LATEST
  const from = rowFor(rowsOf(plan.positions, t.fromPositionId), addDays(effective, -1))
  if (!from) return null
  let toManagerPositionId: string | null
  let toUnit: string | null
  if (t.kind === 'position') {
    if (!t.toManagerPositionId) return null
    const manager = rowFor(rowsOf(plan.positions, t.toManagerPositionId), effective)
    const place = plan.placeOf(t.toManagerPositionId, from.location)
    toManagerPositionId = t.toManagerPositionId
    toUnit = place?.businessUnit ?? manager?.businessUnit ?? null
  } else {
    if (!t.toPositionId) return null
    const to = rowFor(rowsOf(plan.positions, t.toPositionId), effective)
    if (!to) return null
    toManagerPositionId = to.managerPositionId ?? null
    toUnit = to.businessUnit
  }
  if (toUnit == null) return null
  return {
    fromPositionId: t.fromPositionId,
    fromManagerPositionId: from.managerPositionId ?? null,
    toManagerPositionId,
    fromUnit: from.businessUnit,
    toUnit,
    crossUnit: from.businessUnit !== toUnit,
  }
}

/** Statuses a held seat's later rows are written On hold from (a later Eliminated row stays). */
const HOLDABLE: ReadonlySet<PositionRow['status']> = new Set(['Filled', 'Open', 'Planned'])

/**
 * Applies an approved transfer: a position move adds a row for the seat dated the effective date
 * under the new manager position (with the new org's fields from `plan.placeOf`); an internal move
 * ends the person's assignment on the from seat (handled by the import of HRIS data, not here), puts
 * the from seat On hold from the effective date and records the receiving seat as filled by the
 * transfer (sourceRequestId). One audit entry per field.
 *
 * `at` is the approval date: the effective date when the request has none, and the audit entries'
 * time (requests.ts gives them the transition's timestamp).
 *
 * Fixtures (transfer.test.ts): a position move to another unit's manager writes one 'changed' row
 * with the new unit, department, cost center and legal entity, and moves a later dated row too; an
 * internal move writes the from seat 'held' (On hold) and the receiving seat Filled, each dated the
 * effective date.
 */
export function applyTransfer(
  req: HcRequest,
  plan: WorkingPlan,
  at: ISODate,
): { positions: PositionChange[]; audit: AuditDraft[] } {
  const t = req.transfer
  const positions: PositionChange[] = []
  const audit: AuditDraft[] = []
  if (req.type !== 'Transfer' || !t) return { positions, audit }
  const effective = effectiveOf(req, at)
  const rows = rowsOf(plan.positions, t.fromPositionId)
  const base = rowFor(rows, effective)
  if (!base) return { positions, audit }
  const write = (kind: PositionChange['kind'], prev: PositionRow, row: PositionRow) => {
    positions.push({ kind, row })
    audit.push(...rowAudit(prev, row, plan.actor, at, row.effectiveDate))
  }

  if (t.kind === 'position') {
    const manager = t.toManagerPositionId
    if (!manager) return { positions, audit }
    /** A row under the new manager, with the org fields its own location takes there. */
    const moved = (r: PositionRow, effectiveDate: ISODate): PositionRow => {
      const place = plan.placeOf(manager, r.location)
      return {
        ...r,
        effectiveDate,
        managerPositionId: manager,
        businessUnit: place?.businessUnit ?? r.businessUnit,
        department: place ? place.department : (r.department ?? null),
        costCenter: place?.costCenter ?? r.costCenter,
        legalEntity: place?.legalEntity ?? r.legalEntity ?? null,
        sourceRequestId: req.requestId,
      }
    }
    write('changed', base, moved(base, effective))
    for (const r of rows) if (r.effectiveDate > effective) write('changed', r, moved(r, r.effectiveDate))
    return { positions, audit }
  }

  // Internal move: the from seat is held, the receiving seat is filled by the transfer.
  const held = (r: PositionRow, effectiveDate: ISODate): PositionRow => ({
    ...r,
    effectiveDate,
    status: 'On hold',
    sourceRequestId: req.requestId,
  })
  write('held', base, held(base, effective))
  for (const r of rows)
    if (r.effectiveDate > effective && HOLDABLE.has(r.status)) write('held', r, held(r, r.effectiveDate))
  if (t.toPositionId) {
    const to = rowFor(rowsOf(plan.positions, t.toPositionId), effective)
    if (to)
      write('changed', to, {
        ...to,
        effectiveDate: effective,
        status: 'Filled',
        sourceRequestId: req.requestId,
      })
  }
  return { positions, audit }
}

export interface BudgetMoveInput {
  req: HcRequest
  fromTarget: TargetRow
  toTarget: TargetRow
  /** The seat's annual band estimate, USD at plan rates, no equity. */
  seatBandUsd: number
  fiscalYear: FiscalYear
  proration: Proration
}

/** The org a target row is keyed by (fiscal year, unit, department, cost center, leader). */
export const targetKey = (t: TargetRow): string =>
  [t.fiscalYear, t.businessUnit, t.department ?? '', t.costCenter ?? '', t.leaderPositionId ?? ''].join('|')

/** A target row with known keys only (never a spread of an imported object). */
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

/**
 * The share of the fiscal year a transfer's budget moves for: the whole year (12/12) for a position
 * move, because its plan lines follow it (R26); `inYearFraction` from the effective date to FY end
 * for an internal move (0 when it takes effect after the year, 1 when before it).
 */
export function budgetShare(req: HcRequest, fiscalYear: FiscalYear, proration: Proration): number {
  const t = req.transfer
  if (!t) return 0
  const months = monthsOf(fiscalYear)
  if (t.kind === 'position') return inYearFraction(proration, months, null, null)
  return inYearFraction(proration, months, t.effectiveDate || null, null)
}

/**
 * "Move budget too?": the two target rows after moving one head and the seat's in-year band estimate
 * (whole fiscal year for a position move; effective date to FY end for an internal move, by
 * `inYearFraction`). A target with no cost keeps none.
 *
 * Unchanged copies when the request has no transfer fields, did not ask to move budget, or both
 * sides are the same target row.
 *
 * Fixtures (transfer.test.ts): a position move of a $198,200 seat moves 1 head and $198,200.00; an
 * internal move effective 1 Jan 2027 moves 1 head and $198,200 × 3/12 = $49,550.00.
 */
export function budgetMove(input: BudgetMoveInput): { from: TargetRow; to: TargetRow } {
  const from = targetCopy(input.fromTarget)
  const to = targetCopy(input.toTarget)
  const t = input.req.transfer
  if (!t?.moveBudget || targetKey(from) === targetKey(to)) return { from, to }
  const usd = input.seatBandUsd * budgetShare(input.req, input.fiscalYear, input.proration)
  return {
    from: {
      ...from,
      targetHeads: from.targetHeads - 1,
      targetCost: from.targetCost == null ? null : from.targetCost - usd,
    },
    to: {
      ...to,
      targetHeads: to.targetHeads + 1,
      targetCost: to.targetCost == null ? null : to.targetCost + usd,
    },
  }
}

/**
 * `budgetMove` as plan effects and audit drafts (object 'target', one entry per changed field, `id`
 * the target's key), so Finance sees the target changes in Targets. Nothing when nothing moves. An
 * addition to the contract.
 */
export function budgetMoveEffects(
  input: BudgetMoveInput,
  actor: Actor,
  at: ISODateTime,
): { effects: PlanEffect[]; audit: AuditDraft[] } {
  const moved = budgetMove(input)
  return targetChangeEffects(
    [
      [targetCopy(input.fromTarget), moved.from],
      [targetCopy(input.toTarget), moved.to],
    ],
    actor,
    at,
    input.req.transfer?.effectiveDate || null,
  )
}

/**
 * Target rows before and after a change as plan effects and audit drafts (object 'target', one entry
 * per changed field, `id` the target's key); a pair that changes nothing writes nothing. Shared by
 * "Move budget too?" and a cross-unit trade's "Move target too?" (trade.ts `tradeTargetMove`). An
 * addition to the contract.
 */
export function targetChangeEffects(
  pairs: readonly (readonly [TargetRow, TargetRow])[],
  actor: Actor,
  at: ISODateTime,
  effectiveDate: ISODate | null,
): { effects: PlanEffect[]; audit: AuditDraft[] } {
  const effects: PlanEffect[] = []
  const audit: AuditDraft[] = []
  for (const [prev, next] of pairs) {
    const previous = targetCopy(prev)
    const row = targetCopy(next)
    const fields = (['targetHeads', 'targetCost'] as const).filter(
      (f) => (previous[f] ?? null) !== (row[f] ?? null),
    )
    if (!fields.length) continue
    effects.push({ kind: 'target', row, previous })
    for (const field of fields)
      audit.push({
        at,
        by: actor.personId,
        byName: actor.name,
        mode: actor.mode,
        object: 'target',
        id: targetKey(row),
        field,
        old: previous[field] ?? null,
        new: row[field] ?? null,
        effectiveDate,
        comment: null,
        commentAudience: null,
      })
  }
  return { effects, audit }
}
