/**
 * What if's "Turn into requests" (docs/PLAN.md 8.3 `whatif.turn-into-requests`, 10.6, 11.5): one
 * Draft per seat a lever touches (defer a start or shift starts: Start date; cancel: Elimination;
 * change level: Level change; change location: Location change) and one Trade per trade lever, the
 * Acting as person the requester, through whatif.ts `turnIntoRequests` over `env.asks`. The freeze
 * lever is never turned into a request (freezes are Finance's): it is skipped and the notice says
 * FREEZE_LEVER_NOTE. HRBP and Leader shown; Finance hidden ("Finance does not raise requests. Copy
 * the scenario for the HRBP."). Each draft is checked as its own type's draft would be (the seat in
 * scope, no accepted offer: ACCEPTED_OFFER_TEXT), and a trade's is quoted (`env.quote`) as createTrade
 * does. The drafts go to `state.requests` with one audit entry each (object 'request', field 'state',
 * null to Draft). The levers themselves stay in session memory (src/views/whatif/engine/session.ts);
 * nothing else is written. Pure.
 *
 * Readings taken here (core, M3): the action is all or nothing: a draft whose seat is outside the
 * scope, or a trade whose quote does not balance, refuses the whole call with its reason, so no half
 * of a scenario is left in Requests > Mine. A call that makes no draft (only a freeze lever, or levers
 * that change nothing) is refused with the engine's reason.
 *
 * Frozen in the M3 freeze (docs/CONTRACTS-M3.md); the core builder fills the body.
 */
import { type Lever, NO_CHANGE_TEXT, turnIntoRequests } from '../engine/whatif'
import type { AuditDraft, HcRequest, PlanState } from '../types'
import { ACCEPTED_OFFER_TEXT, draftsMadeNotice, FREEZE_LEVER_NOTE, OUTSIDE_SCOPE_TEXT } from './copy'
import { gate } from './gate'
import { businessAt, draftAudit, heldSeatRefusal, inScope, no, ok, putRequests } from './shared'
import { tradeDraft } from './trades'
import type { ActionContext, ActionResult } from './types'

export interface TurnIntoRequestsInput {
  /** The session's levers, in order. */
  levers: readonly Lever[]
}

/** `whatif.turn-into-requests`: Draft requests for review, one per touched seat and trade lever. */
export function turnLeversIntoRequests(
  state: PlanState,
  ctx: ActionContext,
  input: TurnIntoRequestsInput,
): ActionResult {
  const g = gate(ctx, 'whatif.turn-into-requests')
  if (g) return no(g)
  // Business dates (15.1 R47): the drafts' dates are the as-of date, kept in the wall clock's order.
  const at = businessAt(ctx)
  const made = turnIntoRequests(input.levers, {
    requesterId: ctx.actor.personId,
    at,
    newRequestId: (n) => ctx.env.ids.request(n),
    ctx: ctx.env.asks,
  })
  const drafts: HcRequest[] = []
  const audit: AuditDraft[] = []
  const trades = input.levers.flatMap((l) => (l.kind === 'trade' ? [l.ask] : []))
  let k = 0
  for (const d of made.drafts) {
    let req: HcRequest = { ...d, requesterId: ctx.actor.personId, updatedAt: at }
    if (req.type === 'Trade') {
      // Each trade lever's draft is quoted and stored as Requests > New's trade form does.
      const ask = trades[k++]
      if (!ask) return no(NO_CHANGE_TEXT)
      const t = tradeDraft(ctx, ask, { reasonCode: req.reasonCode })
      if ('refused' in t) return no(t.refused)
      req = { ...t.req, requestId: d.requestId, requesterId: ctx.actor.personId }
    } else {
      const seat = req.positionId ? ctx.env.seat(req.positionId) : null
      if (seat?.acceptedOffer && req.type !== 'Elimination') return no(ACCEPTED_OFFER_TEXT)
      if (!inScope(ctx, req)) return no(OUTSIDE_SCOPE_TEXT)
      // A receiving seat an approved internal move holds is no lever target (review SC-6).
      const held = req.positionId ? heldSeatRefusal(ctx, req.positionId) : null
      if (held) return no(held)
    }
    drafts.push(req)
    audit.push(draftAudit(ctx, req))
  }
  const skippedFreeze = made.skipped.some((s) => s.text === FREEZE_LEVER_NOTE)
  if (!drafts.length) {
    const why = made.skipped.find((x) => x.text !== FREEZE_LEVER_NOTE)?.text
    return no(why ?? (skippedFreeze ? FREEZE_LEVER_NOTE : NO_CHANGE_TEXT))
  }
  const made1 = draftsMadeNotice(drafts.length)
  const notice = skippedFreeze ? `${made1} ${FREEZE_LEVER_NOTE}` : made1
  return ok(putRequests(state, drafts), audit, notice)
}
