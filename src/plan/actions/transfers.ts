/**
 * Transfers (docs/PLAN.md 8.3 `transfer.process`, `transfer.move-budget`, 8.4 rule 2a, 10.5): an HRBP
 * (or HR admin) processes a move as a Transfer request, a position move (the seat and its person under
 * a new manager position) or an internal move (the person fills an Open receiving seat; the old seat
 * is held On hold). It is saved as a Draft for the HRBP to submit (./requests.ts `submitRequest`);
 * its chain is the submitter's manager, the from-unit's and to-unit's HRBPs and, across units, each
 * unit's leader (no band-estimate threshold), plus Finance for a move past a sub-org's envelope.
 * Pure.
 *
 * - Checks `transfer.process`, and `transfer.move-budget` too when `moveBudget` is set (hidden for
 *   Finance: "Finance sees the target change in Targets."). "Move budget too?" shifts both orgs'
 *   targets by one head and the seat's in-year band estimate when the transfer is approved
 *   (transfer.ts `budgetMoveEffects`, `env.seatBandUsd`), never the seat's HRIS cost; the target
 *   rows go to `state.overlay.targets` with their audit entries (object 'target').
 * - Decisions on a transfer go through ./requests.ts (each also checks `transfer.approve`). The
 *   moving person's name shows to rule 2a's viewers only; no amount ever shows.
 *
 * Readings taken here (core, M3):
 *  - The requester is the moving person's manager (the holder of the from seat's manager position on
 *    the as-of date), as the chain reads it (10.2: the first step is the requester's manager; CH3,
 *    CH4); the HRBP who processes it is recorded as the submitter, so they submit it with
 *    `submitRequest`. With no manager in place the HRBP is the requester.
 *  - The person must hold the from seat on the as-of date; an internal move fills an Open seat with
 *    no accepted offer.
 *  - The from seat must be in the processing HRBP's unit and scope (OUTSIDE_UNIT_TEXT; HR admin: any
 *    seat); the receiving side can be anywhere (the receiving HRBP approves it on the chain).
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the body.
 */
import { type ISODate, REASON_CODES_OF, type ReasonCode } from '@/data/schema'
import { isActiveOn, toAssignments } from '../engine/heads'
import type { PlanState } from '../types'
import {
  NOT_FOUND_TEXT,
  NOT_IN_SEAT_TEXT,
  OUTSIDE_UNIT_TEXT,
  REASON_CODE_TEXT,
  RECEIVING_SEAT_TEXT,
  transferDraftNotice,
} from './copy'
import { gate } from './gate'
import { draftAudit, heldSeatRefusal, newRequest, no, ok, putRequest } from './shared'
import type { ActionContext, ActionResult } from './types'

export interface TransferInput {
  kind: 'position' | 'internal'
  /** The moving person (employee ID). */
  personId: string
  /** The seat they move from. */
  fromPositionId: string
  /** Position move: the new manager position. */
  toManagerPositionId?: string | null
  /** Internal move: the Open seat the person fills. */
  toPositionId?: string | null
  /** The person's first day in the new place. */
  effectiveDate: ISODate
  /** "Move budget too?" (`transfer.move-budget`). */
  moveBudget: boolean
  reasonCode: ReasonCode
}

/** Who holds a seat on a day (an Employee assignment active then), or null. */
function holderOn(ctx: ActionContext, positionId: string | null, on: ISODate): string | null {
  if (!positionId) return null
  for (const a of toAssignments(ctx.datasets.workers))
    if (a.workerType === 'Employee' && a.positionId === positionId && isActiveOn(a, on)) return a.employeeId
  return null
}

/** `transfer.process` (+ `transfer.move-budget`): a Transfer request saved as a Draft. */
export function processTransfer(state: PlanState, ctx: ActionContext, input: TransferInput): ActionResult {
  const g = gate(ctx, 'transfer.process')
  if (g) return no(g)
  if (input.moveBudget) {
    const m = gate(ctx, 'transfer.move-budget')
    if (m) return no(m)
  }
  if (!REASON_CODES_OF.Transfer.includes(input.reasonCode)) return no(REASON_CODE_TEXT)
  const from = ctx.env.seat(input.fromPositionId)
  if (!from) return no(NOT_FOUND_TEXT)
  // The HRBP processes moves out of their own unit (HR admin: any); the receiving side can be anywhere.
  if (!ctx.rules.seatInScope(from.positionId) || !ctx.rules.unitInScope(from.businessUnit))
    return no(OUTSIDE_UNIT_TEXT)
  if (holderOn(ctx, input.fromPositionId, ctx.asOf) !== input.personId) return no(NOT_IN_SEAT_TEXT)
  if (input.kind === 'position') {
    if (!input.toManagerPositionId || !ctx.env.seat(input.toManagerPositionId)) return no(NOT_FOUND_TEXT)
  } else {
    const to = input.toPositionId ? ctx.env.seat(input.toPositionId) : null
    if (!to) return no(NOT_FOUND_TEXT)
    if (to.status !== 'Open' || to.acceptedOffer) return no(RECEIVING_SEAT_TEXT)
    // A seat another approved move fills (HRIS not updated yet) is not Open for a second one (SC-6).
    const held = heldSeatRefusal(ctx, to.positionId)
    if (held) return no(held)
  }
  const manager = holderOn(ctx, from.managerPositionId, ctx.asOf)
  const me = ctx.actor.personId
  const requesterId = manager && manager !== input.personId ? manager : me
  const req = newRequest(ctx, {
    type: 'Transfer',
    reasonCode: input.reasonCode,
    requesterId,
    submittedById: requesterId === me ? null : me,
    positionId: input.fromPositionId,
    managerPositionId: from.managerPositionId ?? '',
    businessUnit: from.businessUnit,
    department: from.department,
    costCenter: from.costCenter,
    level: from.level,
    location: from.location,
    fte: from.fte,
    startDate: input.effectiveDate,
    transfer: {
      kind: input.kind,
      personId: input.personId,
      fromPositionId: input.fromPositionId,
      toManagerPositionId: input.kind === 'position' ? (input.toManagerPositionId ?? null) : null,
      toPositionId: input.kind === 'internal' ? (input.toPositionId ?? null) : null,
      effectiveDate: input.effectiveDate,
      moveBudget: input.moveBudget,
    },
  })
  return ok(putRequest(state, req), [draftAudit(ctx, req)], transferDraftNotice(req.requestId))
}
