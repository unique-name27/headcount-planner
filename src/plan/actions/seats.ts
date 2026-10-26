/**
 * HRBP seat edits in Working (docs/PLAN.md 8.3 `position.edit`, 9.4 Plan > Positions, 10.1, C23):
 * an Open seat with no accepted offer, or a Planned seat, in the HRBP's unit (HR admin: any), in the
 * fiscal year's Working: start, level, location, FTE and On hold, with a required reason. Pure.
 *
 * - Checks `position.edit` first (./gate.ts); limited for HRBP: `rules.seatInScope` and the unit
 *   (OUTSIDE_UNIT_TEXT), the seat's derived status (SEAT_NOT_EDITABLE_TEXT), an accepted offer
 *   (ACCEPTED_OFFER_TEXT, block `accepted-offer`), a version other than a Working (WORKING_ONLY_TEXT).
 * - The reason is required and refused at entry when it holds an amount (8.4 rule 5: managers read
 *   "Changed by your HRBP: start moved from Jan to Mar" with it).
 * - Writes one dated position row (`effectiveDate`, never a rewrite of history) to
 *   `state.overlay.positions`; a move to Open sets `openedDate` = the effective date (10.1). One audit
 *   entry per changed field (requests.ts `rowAudit`, object 'position'), each with the reason as its
 *   `comment` (`commentAudience` null: a seat edit's reason reaches every viewer of the seat, so it
 *   holds no amount by the entry rule).
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the body.
 */
import { fiscalYearOf } from '@/data/fiscal'
import { type ISODate, type Level, type PositionRow, siteByLocation } from '@/data/schema'
import { rowAudit, siteMoveRefusal } from '../engine/requests'
import { rowInEffect } from '../engine/trade'
import { workingOf } from '../engine/versions'
import type { PlanState } from '../types'
import {
  ACCEPTED_OFFER_TEXT,
  FTE_RANGE_TEXT,
  NO_SEAT_CHANGE_TEXT,
  NOT_FOUND_TEXT,
  OUTSIDE_UNIT_TEXT,
  SEAT_NOT_EDITABLE_TEXT,
  seatChangedNotice,
  WORKING_ONLY_TEXT,
} from './copy'
import { freeTextRefusal, gate, isLimited } from './gate'
import { heldSeatRefusal, no, ok, putPositions, workingFor } from './shared'
import type { ActionContext, ActionResult } from './types'

/** What an HRBP may change on an Open or Planned seat; a field left out keeps its value. */
export interface SeatChanges {
  startDate?: ISODate | null
  level?: Level
  location?: string
  fte?: number
  /** true puts the seat On hold; false takes it off hold (back to Open, or Planned when it was Planned). */
  onHold?: boolean
}

export interface SeatEditInput {
  positionId: string
  /**
   * The day the change takes effect (its row's effectiveDate). When not given: the as-of date, or the
   * seat's first row's date when the seat starts later.
   */
  effectiveDate?: ISODate
  changes: SeatChanges
  /** Required; refused with an amount. */
  reason: string
}

/** The seat's rows, oldest first. */
const rowsOf = (positions: readonly PositionRow[], positionId: string): PositionRow[] =>
  positions
    .filter((r) => r.positionId === positionId)
    .sort((a, b) => (a.effectiveDate < b.effectiveDate ? -1 : a.effectiveDate > b.effectiveDate ? 1 : 0))

/**
 * `position.edit`: one HRBP Working edit of an Open or Planned seat (or taking an On hold seat off
 * hold). Readings taken here (core, M3):
 *  - The row written is the row in effect on the effective date with the changes laid over it, dated
 *    the effective date; a later dated row of the seat is left as it is (an edit is one dated change).
 *  - A location change takes the cost center and legal entity the seat's manager position gives at
 *    the new location (the place an approved Location change takes), else the site's legal entity.
 *  - Off hold, a seat goes back to the status it had before it was held (Planned, else Open); a move
 *    to Open sets `openedDate` to the effective date.
 *  - The seat must sit in a fiscal year with a Working version on the effective date.
 */
export function editSeat(state: PlanState, ctx: ActionContext, input: SeatEditInput): ActionResult {
  const g = gate(ctx, 'position.edit')
  if (g) return no(g)
  const seat = ctx.env.seat(input.positionId)
  if (!seat) return no(NOT_FOUND_TEXT)
  if (isLimited(ctx, 'position.edit')) {
    if (!ctx.rules.seatInScope(seat.positionId) || !ctx.rules.unitInScope(seat.businessUnit))
      return no(OUTSIDE_UNIT_TEXT)
  }
  if (seat.acceptedOffer) return no(ACCEPTED_OFFER_TEXT)
  // A receiving seat an approved internal move holds is not edited (review SC-6).
  const held = heldSeatRefusal(ctx, seat.positionId)
  if (held) return no(held)
  const c = input.changes
  const offHold = seat.status === 'On hold' && c.onHold === false
  if (seat.status !== 'Open' && seat.status !== 'Planned' && !offHold) return no(SEAT_NOT_EDITABLE_TEXT)
  // With no date given: the as-of date, or the seat's first day when it starts later (an edit never
  // writes a row dated before the seat exists, such as a next year's Planned seat).
  const first = rowsOf(ctx.datasets.positions, seat.positionId)[0]?.effectiveDate
  const effectiveDate = input.effectiveDate ?? (first && first > ctx.asOf ? first : ctx.asOf)
  if (!workingOf(state.versions, fiscalYearOf(effectiveDate))) return no(WORKING_ONLY_TEXT)
  const reason = freeTextRefusal(ctx, input.reason, true)
  if (reason) return no(reason)
  if (c.fte !== undefined && !(c.fte > 0 && c.fte <= 1)) return no(FTE_RANGE_TEXT)

  const working = workingFor(ctx, fiscalYearOf(effectiveDate))
  const rows = rowsOf(working.positions, seat.positionId)
  const base = rowInEffect(rows, effectiveDate) ?? rows[0]
  if (!base) return no(NOT_FOUND_TEXT)
  const next: PositionRow = { ...base, effectiveDate }
  if (c.startDate !== undefined) next.startDate = c.startDate
  if (c.level !== undefined) next.level = c.level
  if (c.fte !== undefined) next.fte = c.fte
  if (c.location !== undefined && c.location !== base.location) {
    // A cost center sits at one site (7.4): no move to a site where the department has none (SC-15).
    const site = siteMoveRefusal(working, base, c.location, base.managerPositionId ?? '')
    if (site) return no(site)
    const place = working.placeOf(base.managerPositionId ?? '', c.location)
    next.location = c.location
    next.costCenter = place?.costCenter ?? base.costCenter
    next.legalEntity =
      place?.legalEntity ?? siteByLocation.get(c.location)?.legalEntity ?? base.legalEntity ?? null
  }
  if (c.onHold === true && seat.status !== 'On hold') next.status = 'On hold'
  if (offHold) {
    const before = [...rows].reverse().find((r) => r.effectiveDate <= effectiveDate && r.status !== 'On hold')
    next.status = before?.status === 'Planned' ? 'Planned' : 'Open'
  }
  // A seat whose row says Filled but whom nobody holds reads Open (6.5): the edit writes it Open.
  if (seat.status === 'Open' && next.status === 'Filled') next.status = 'Open'
  if (next.status === 'Open' && seat.status !== 'Open') next.openedDate = effectiveDate

  const audit = rowAudit(base, next, ctx.actor, ctx.at, effectiveDate).map((a) => ({
    ...a,
    comment: input.reason.trim(),
    commentAudience: null,
  }))
  if (!audit.length) return no(NO_SEAT_CHANGE_TEXT)
  return ok(putPositions(state, [next]), audit, seatChangedNotice(seat.positionId))
}
